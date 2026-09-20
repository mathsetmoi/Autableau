// LA LISTE DES EMPLACEMENTS.
//
// « Pour le moment il n'y a qu'un drive à chaque fois et il faut à chaque fois
// lancer un nouveau drive. Il est plus simple d'avoir la liste, et on
// sélectionne directement le tableau ou le dossier. »
//
// On retient plusieurs dossiers — Mon Drive, un Drive partagé, une clé USB —
// et l'on passe de l'un à l'autre d'un clic sur son nom, sans repasser par le
// sélecteur du système.
//
// CE QU'ON TIENT :
//   — deux dossiers ajoutés font deux lignes ; celle qu'on regarde se voit ;
//   — un clic sur l'autre ouvre son arbre à lui ;
//   — le même dossier ajouté deux fois ne fait qu'une ligne ;
//   — un emplacement se renomme, sans que le dossier change de nom ;
//   — la croix retire de la liste, et le dossier n'est pas touché ;
//   — le tableau ouvert reste ouvert quand on regarde ailleurs, et son fichier
//     continue de recevoir ce qu'on écrit ;
//   — ce qu'on ouvre ailleurs se relie au bon emplacement ;
//   — au rechargement, le tableau repris retrouve SON dossier, même si ce
//     n'est pas celui qu'on regardait.
const { creerRapport, ouvrirApp, rechargerApp } = require('./harness.cjs');

// Deux faux dossiers, chacun dans son coin du stockage de session : les
// poignées sont neuves à chaque appel, comme celles du vrai navigateur.
const FAUX_DRIVE = `(() => {
    function drive(cle) {
        const lire = () => { try { return JSON.parse(sessionStorage.getItem(cle) || '{"dossiers":[],"fichiers":{}}'); } catch (e) { return { dossiers: [], fichiers: {} }; } };
        const garder = (fs) => sessionStorage.setItem(cle, JSON.stringify(fs));
        const joindre = (p, n) => p ? p + '/' + n : n;
        const absent = () => { const e = new Error('absent'); e.name = 'NotFoundError'; return e; };
        function fichier(chemin) {
            const nom = chemin.split('/').pop();
            return { kind: 'file', name: nom,
                isSameEntry: async (o) => !!o && o.kind === 'file' && o.__cle === cle && o.__chemin === chemin,
                __cle: cle, __chemin: chemin,
                getFile: async () => { const f = lire().fichiers[chemin]; if (!f) throw absent();
                    return { name: nom, lastModified: f.date, size: f.texte.length, text: async () => f.texte }; },
                createWritable: async () => { let tampon = ''; return {
                    write: async (c) => { tampon = typeof c === 'string' ? c : String(c); },
                    close: async () => { const fs = lire(); fs.fichiers[chemin] = { texte: tampon, date: Date.now() }; garder(fs); } }; } };
        }
        function dossier(chemin) {
            const nom = chemin ? chemin.split('/').pop() : (cle === '__faux_drive' ? 'Mon Drive' : 'Drive partagé');
            const direct = (p, prefixe) => p.startsWith(prefixe) && p.length > prefixe.length && !p.slice(prefixe.length).includes('/');
            return { kind: 'directory', name: nom,
                isSameEntry: async (o) => !!o && o.kind === 'directory' && o.__cle === cle && o.__chemin === chemin,
                __cle: cle, __chemin: chemin,
                queryPermission: async () => window.__fauxDroit || 'granted',
                requestPermission: async () => { window.__fauxDroit = 'granted'; return 'granted'; },
                entries: async function* () {
                    const fs = lire(); const prefixe = chemin ? chemin + '/' : '';
                    for (const d of fs.dossiers) if (direct(d, prefixe)) yield [d.split('/').pop(), dossier(d)];
                    for (const f of Object.keys(fs.fichiers)) if (direct(f, prefixe)) yield [f.split('/').pop(), fichier(f)];
                },
                getDirectoryHandle: async (n, o) => { const fs = lire(); const p = joindre(chemin, n);
                    if (fs.dossiers.includes(p)) return dossier(p);
                    if (!o || !o.create) throw absent();
                    fs.dossiers.push(p); garder(fs); return dossier(p); },
                getFileHandle: async (n, o) => { const fs = lire(); const p = joindre(chemin, n);
                    if (fs.fichiers[p]) return fichier(p);
                    if (!o || !o.create) throw absent();
                    fs.fichiers[p] = { texte: '', date: Date.now() }; garder(fs); return fichier(p); },
                removeEntry: async (n) => { const fs = lire(); const p = joindre(chemin, n);
                    if (fs.dossiers.includes(p)) {
                        fs.dossiers = fs.dossiers.filter(d => d !== p && !d.startsWith(p + '/'));
                        Object.keys(fs.fichiers).forEach(f => { if (f.startsWith(p + '/')) delete fs.fichiers[f]; });
                    } else if (fs.fichiers[p]) delete fs.fichiers[p];
                    else throw absent();
                    garder(fs); } };
        }
        return { racine: () => dossier(''), tout: lire,
                 tableau: (p) => { const f = lire().fichiers[p]; return f ? JSON.parse(f.texte) : null; } };
    }
    window.__driveA = drive('__faux_drive');
    window.__driveB = drive('__faux_drive2');
})()`;

const REPONDRE = `async (nom) => {
    await new Promise(ok => setTimeout(ok, 150));
    const modal = document.getElementById('sys-prompt-modal');
    if (!modal || modal.style.display !== 'flex') return false;
    document.getElementById('sys-prompt-input').value = nom;
    document.getElementById('btn-sys-prompt-confirm').click();
    await new Promise(ok => setTimeout(ok, 600));
    return true;
}`;
const LIGNES = `() => [...document.querySelectorAll('.dossier-emplacement:not(.ajout)')].map(b => ({
    nom: b.querySelector('.label').textContent, actif: b.classList.contains('actif') }))`;

module.exports = async function (browser) {
    const r = creerRapport('La liste des emplacements');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await context.addInitScript(FAUX_DRIVE);
    await page.evaluate(FAUX_DRIVE);

    // ------------------------------------------------------------------
    // 1. DEUX DOSSIERS, DEUX LIGNES
    // ------------------------------------------------------------------
    const deux = await page.evaluate(async ({ lignes }) => {
        const a = window.__driveA.racine(), b = window.__driveB.racine();
        await a.getDirectoryHandle('2nde 3', { create: true });
        await b.getDirectoryHandle('Terminale spé', { create: true });
        await MonDossier.adopterLeDossier(a, false);
        const idA = MonDossier.etat.actif;
        await MonDossier.adopterLeDossier(b, false);
        const idB = MonDossier.etat.actif;
        const tiroir = document.getElementById('right-drawer');
        if (!tiroir.classList.contains('open')) toggleRightDrawer();
        await new Promise(ok => setTimeout(ok, 200));
        return { idA, idB, lignes: eval(lignes)(),
                 arbre: [...document.querySelectorAll('.dossier-ligne .label')].map(l => l.textContent),
                 nomActif: MonDossier.nomActif(), plusUnSeul: !!document.getElementById('dossier-ajouter') };
    }, { lignes: LIGNES });
    r.egal('les deux dossiers font deux lignes, la seconde étant celle qu\'on regarde',
        deux.lignes, [{ nom: 'Mon Drive', actif: false }, { nom: 'Drive partagé', actif: true }], JSON.stringify(deux));
    r.egal('et c\'est bien son arbre à lui qu\'on voit', deux.arbre, ['Terminale spé'], JSON.stringify(deux));
    r.verifie('le bouton « + » reste là pour en ajouter d\'autres', deux.plusUnSeul);

    // ------------------------------------------------------------------
    // 2. UN CLIC SUR L'AUTRE LIGNE, ET L'ON EST DEDANS
    // ------------------------------------------------------------------
    const bascule = await page.evaluate(async ({ lignes }) => {
        document.querySelector('.dossier-emplacement:not(.actif):not(.ajout)').click();
        await new Promise(ok => setTimeout(ok, 700));   // le clic attend le double-clic
        return { lignes: eval(lignes)(), nomActif: MonDossier.nomActif(),
                 arbre: [...document.querySelectorAll('.dossier-ligne .label')].map(l => l.textContent) };
    }, { lignes: LIGNES });
    r.egal('un clic sur « Mon Drive » l\'ouvre, et la ligne active suit',
        { actif: bascule.nomActif, arbre: bascule.arbre }, { actif: 'Mon Drive', arbre: ['2nde 3'] }, JSON.stringify(bascule));

    // Le même dossier ajouté deux fois ne fait pas deux lignes.
    const doublon = await page.evaluate(async ({ lignes }) => {
        await MonDossier.adopterLeDossier(window.__driveA.racine(), false);
        await new Promise(ok => setTimeout(ok, 200));
        return { lignes: eval(lignes)(), n: MonDossier.emplacements().length };
    }, { lignes: LIGNES });
    r.egal('le même dossier ajouté deux fois ne fait qu\'une ligne', doublon.n, 2, JSON.stringify(doublon));

    // ------------------------------------------------------------------
    // 3. RENOMMER UNE LIGNE
    // ------------------------------------------------------------------
    const renomme = await page.evaluate(async ({ repondre, lignes }) => {
        MonDossier.renommerUnEmplacement(MonDossier.etat.actif);
        const repondu = await eval(repondre)('Maths 2026');
        await new Promise(ok => setTimeout(ok, 200));
        return { repondu, lignes: eval(lignes)(),
                 dossier: MonDossier.etat.racine.name };
    }, { repondre: REPONDRE, lignes: LIGNES });
    r.egal('renommer change le nom dans la liste, pas celui du dossier',
        { lignes: renomme.lignes.map(l => l.nom), dossier: renomme.dossier },
        { lignes: ['Maths 2026', 'Drive partagé'], dossier: 'Mon Drive' }, JSON.stringify(renomme));

    // ------------------------------------------------------------------
    // 4. LE TABLEAU OUVERT RESTE OUVERT QUAND ON REGARDE AILLEURS
    // ------------------------------------------------------------------
    const ailleurs = await page.evaluate(async ({ repondre, lignes }) => {
        // Une séance dans « Maths 2026 » (l'emplacement qu'on regarde).
        MonDossier.creerTableau(['2nde 3']);
        await eval(repondre)('Séance 1');
        const chemin = MonDossier.chemin();
        const sonEmplacement = MonDossier.etat.lienEmplacement;
        // On va voir l'autre dossier : le tableau ne se referme pas.
        const autre = MonDossier.emplacements().find(e => e.nom === 'Drive partagé');
        await MonDossier.activer(autre.id);
        await new Promise(ok => setTimeout(ok, 200));
        const pendant = { lie: MonDossier.lie(), chemin: MonDossier.chemin(),
                          regarde: MonDossier.nomActif(),
                          arbre: [...document.querySelectorAll('.dossier-ligne .label')].map(l => l.textContent) };
        // Et ce qu'on écrit va toujours dans SON fichier, à lui.
        freehands.push({ id: nextId++, points: [{ x: 10, y: 10 }, { x: 60, y: 60 }], color: '#e74c3c', width: 4, z: globalZ++ });
        saveState();
        await MonDossier.ecrire();
        const t = window.__driveA.tableau('2nde 3/Séance 1.prof');
        return { chemin, sonEmplacement, pendant, lignes: eval(lignes)(),
                 traitsDansLeFichier: t ? t.data.pages[0].freehands.length : -1 };
    }, { repondre: REPONDRE, lignes: LIGNES });
    r.egal('la séance est créée dans le dossier qu\'on regardait',
        ailleurs.chemin, ['2nde 3', 'Séance 1.prof'], JSON.stringify(ailleurs));
    r.egal('on regarde ailleurs, et le tableau reste ouvert, lié à son fichier',
        { lie: ailleurs.pendant.lie, chemin: ailleurs.pendant.chemin, regarde: ailleurs.pendant.regarde, arbre: ailleurs.pendant.arbre },
        { lie: true, chemin: ['2nde 3', 'Séance 1.prof'], regarde: 'Drive partagé', arbre: ['Terminale spé'] },
        JSON.stringify(ailleurs));
    r.egal('et ce qu\'on écrit continue d\'aller dans son fichier à lui',
        ailleurs.traitsDansLeFichier, 1, JSON.stringify(ailleurs));

    // Une séance ouverte dans l'autre dossier se relie, elle, à cet autre.
    const seconde = await page.evaluate(async ({ repondre }) => {
        MonDossier.creerTableau(['Terminale spé']);
        await eval(repondre)('Limites');
        const t = window.__driveA.tableau('2nde 3/Séance 1.prof');
        return { chemin: MonDossier.chemin(), emplacement: MonDossier.etat.lienEmplacement === MonDossier.etat.actif,
                 premierGarde: t ? t.data.pages[0].freehands.length : -1,
                 dansB: !!window.__driveB.tableau('Terminale spé/Limites.prof') };
    }, { repondre: REPONDRE });
    r.egal('une séance créée dans l\'autre dossier s\'y range, et se relie à lui',
        { chemin: seconde.chemin, emplacement: seconde.emplacement, dansB: seconde.dansB },
        { chemin: ['Terminale spé', 'Limites.prof'], emplacement: true, dansB: true }, JSON.stringify(seconde));
    r.egal('le premier tableau, quitté, garde ce qu\'on y avait écrit', seconde.premierGarde, 1, JSON.stringify(seconde));

    // ------------------------------------------------------------------
    // 5. LA CROIX RETIRE DE LA LISTE, SANS TOUCHER AU DOSSIER
    // ------------------------------------------------------------------
    const retire = await page.evaluate(async ({ lignes }) => {
        const maths = MonDossier.emplacements().find(e => e.nom === 'Maths 2026');
        MonDossier.retirerUnEmplacement(maths.id);
        await new Promise(ok => setTimeout(ok, 200));
        const texte = document.getElementById('confirm-text').innerText;
        document.getElementById('confirm-yes-btn').click();
        await new Promise(ok => setTimeout(ok, 500));
        return { texte, lignes: eval(lignes)(),
                 fichierTouJoursLa: !!window.__driveA.tableau('2nde 3/Séance 1.prof'),
                 encoreLie: MonDossier.lie() };
    }, { lignes: LIGNES });
    r.egal('la croix retire la ligne', retire.lignes, [{ nom: 'Drive partagé', actif: true }], JSON.stringify(retire));
    r.verifie('le dossier et ses tableaux ne sont pas touchés',
        retire.fichierTouJoursLa && /ne sont pas touchés/.test(retire.texte), JSON.stringify(retire));
    r.verifie('et le tableau ouvert dans l\'autre dossier reste ouvert', retire.encoreLie, JSON.stringify(retire));

    // ------------------------------------------------------------------
    // 6. AU RECHARGEMENT, LE TABLEAU REPRIS RETROUVE SON DOSSIER
    // ------------------------------------------------------------------
    // On remet « Mon Drive » dans la liste, on y ouvre la séance, puis on
    // regarde l'autre dossier avant de recharger : la session reprise doit
    // revenir dans « Mon Drive », et non dans celui qu'on regardait.
    await page.evaluate(async () => {
        await MonDossier.adopterLeDossier(window.__driveA.racine(), false);
        MonDossier.ouvrir(['2nde 3', 'Séance 1.prof']);
        await new Promise(ok => setTimeout(ok, 800));
        sessionStorage.setItem('__emplacements', JSON.stringify(
            MonDossier.emplacements().map(e => ({ id: e.id, nom: e.nom, cle: e.nom === 'Drive partagé' ? 'B' : 'A' }))));
        sessionStorage.setItem('__lien', MonDossier.etat.lienEmplacement);
        const autre = MonDossier.emplacements().find(e => e.nom === 'Drive partagé');
        await MonDossier.activer(autre.id);
        await saveAppLocal(true);
    });
    await rechargerApp(page);
    const repris = await page.evaluate(async () => {
        const modal = document.getElementById('restore-modal');
        const propose = modal && modal.style.display === 'flex';
        if (propose) { confirmRestore(); await new Promise(ok => setTimeout(ok, 800)); }
        const attendu = MonDossier.etat.lienAttendu ? MonDossier.etat.lienAttendu.emplacement : null;
        // Le vrai navigateur rend la liste ; le faux dossier ne s'y range pas.
        MonDossier.etat.emplacements = JSON.parse(sessionStorage.getItem('__emplacements')).map(e => ({
            id: e.id, nom: e.nom, handle: (e.cle === 'B' ? window.__driveB : window.__driveA).racine() }));
        const autre = MonDossier.emplacements().find(e => e.nom === 'Drive partagé');
        await MonDossier.activer(autre.id);              // on regardait l'autre
        await new Promise(ok => setTimeout(ok, 300));
        const avantDeRelier = MonDossier.nomActif();
        // La session reprise porte son emplacement : reliée, elle va le chercher.
        MonDossier.etat.lienAttendu = { chemin: ['2nde 3', 'Séance 1.prof'], nom: 'Séance 1',
            emplacement: sessionStorage.getItem('__lien'), enregistreLe: Date.now() };
        await MonDossier.rouvrir();
        await new Promise(ok => setTimeout(ok, 500));
        return { propose, attendu, avantDeRelier, regarde: MonDossier.nomActif(),
                 chemin: MonDossier.chemin(), lie: MonDossier.lie() };
    });
    r.verifie('au rechargement, la session est proposée et reprise', repris.propose, JSON.stringify(repris));
    r.verifie('elle sait de quel emplacement elle vient', !!repris.attendu, JSON.stringify(repris));
    r.egal('et le tableau repris ramène son dossier, non celui qu\'on regardait',
        { regarde: repris.regarde, chemin: repris.chemin, lie: repris.lie },
        { regarde: 'Mon Drive', chemin: ['2nde 3', 'Séance 1.prof'], lie: true }, JSON.stringify(repris));

    await page.evaluate(() => { MonDossier.changerDeSource('ordi'); freehands.length = 0; selectedItems = []; setMode('pointer'); draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
