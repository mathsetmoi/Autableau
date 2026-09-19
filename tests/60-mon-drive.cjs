// MES TABLEAUX DANS MON DRIVE.
//
// « Je voudrais pouvoir créer des dossiers qui correspondraient aux classes
// et, dans chaque dossier, un tableau correspondrait à une séance. Les
// dossiers seraient stockés dans mon Google Drive. »
//
// Le dossier du Drive est un dossier du disque (Drive pour ordinateur). Le
// sélecteur de dossier est une fenêtre du système et ne s'automatise pas : on
// lui substitue un faux dossier, qui note ce qu'on lui écrit — dans le
// stockage de session, pour traverser un rechargement comme le vrai disque.
// C'est le CODE de la bibliothèque qu'on éprouve, pas le navigateur.
const { creerRapport, ouvrirApp, rechargerApp } = require('./harness.cjs');

// Le faux Drive : des dossiers et des fichiers, gardés en sessionStorage.
// Chaque appel rend une poignée NEUVE, comme la vraie API — deux poignées sur
// le même fichier ne sont jamais le même objet.
const FAUX_DRIVE = `(() => {
    const CLE = '__faux_drive';
    const lire = () => { try { return JSON.parse(sessionStorage.getItem(CLE) || '{"dossiers":[],"fichiers":{}}'); } catch (e) { return { dossiers: [], fichiers: {} }; } };
    const garder = (fs) => sessionStorage.setItem(CLE, JSON.stringify(fs));
    const joindre = (p, n) => p ? p + '/' + n : n;
    const absent = () => { const e = new Error('absent'); e.name = 'NotFoundError'; return e; };
    function fichier(chemin) {
        const nom = chemin.split('/').pop();
        return { kind: 'file', name: nom,
            getFile: async () => { const f = lire().fichiers[chemin]; if (!f) throw absent();
                return { name: nom, lastModified: f.date, size: f.texte.length, text: async () => f.texte }; },
            createWritable: async () => { let tampon = ''; return {
                write: async (c) => { tampon = typeof c === 'string' ? c : String(c); },
                close: async () => { const fs = lire(); fs.fichiers[chemin] = { texte: tampon, date: Date.now() }; garder(fs); } }; } };
    }
    function dossier(chemin) {
        const nom = chemin ? chemin.split('/').pop() : 'Au Tableau';
        const direct = (p, prefixe) => p.startsWith(prefixe) && p.length > prefixe.length && !p.slice(prefixe.length).includes('/');
        return { kind: 'directory', name: nom,
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
    window.__fauxRacine = dossier('');
    window.__fauxTout = lire;
    window.__fauxTableau = (chemin) => { const f = lire().fichiers[chemin]; return f ? JSON.parse(f.texte) : null; };
    window.__fauxEcrire = (chemin, texte) => { const fs = lire(); fs.fichiers[chemin] = { texte, date: Date.now() }; garder(fs); };
})()`;

// Répondre à la fenêtre « Nom : » de l'application
const REPONDRE = `async (nom) => {
    await new Promise(ok => setTimeout(ok, 150));
    const input = document.getElementById('sys-prompt-input');
    const modal = document.getElementById('sys-prompt-modal');
    if (!modal || modal.style.display !== 'flex') return false;
    input.value = nom;
    document.getElementById('btn-sys-prompt-confirm').click();
    await new Promise(ok => setTimeout(ok, 600));
    return true;
}`;

const TRAIT = `(x0, y0) => {
    const c = document.getElementById('board');
    const r = c.getBoundingClientRect();
    const ev = (t, x, y, o = {}) => c.dispatchEvent(new PointerEvent(t, {
        pointerId: 5, pointerType: 'pen', pressure: 0.5, buttons: 1,
        clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: true, ...o
    }));
    setMode('freehand');
    ev('pointerdown', x0, y0);
    for (let i = 1; i <= 12; i++) ev('pointermove', x0 + i * 6, y0 + i * 2);
    ev('pointerup', x0 + 72, y0 + 24, { buttons: 0, pressure: 0 });
}`;

module.exports = async function (browser) {
    const r = creerRapport('Mes tableaux dans mon Drive');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await context.addInitScript(FAUX_DRIVE);   // pour les rechargements
    await page.evaluate(FAUX_DRIVE);

    r.verifie('le module est là, et sait qu\'un dossier peut être ouvert ici',
        await page.evaluate(() => typeof MonDossier === 'object' && MonDossier.disponible()));

    // ------------------------------------------------------------------
    // 0. UN TABLEAU NEUF GARDE CE QU'ON Y ÉCRIT (correctif de clearBoardAndPages)
    // ------------------------------------------------------------------
    const neuf = await page.evaluate((trait) => {
        clearBoardAndPages();
        eval(trait)(400, 400);
        syncPage();
        const s = stateForStorage();
        return { pages: s.pages.length, traits: s.pages[0] ? (s.pages[0].freehands || []).length : -1,
                 contenu: sauvegardeAvecDuContenu(s) };
    }, TRAIT);
    r.egal('après « Nouveau document », le tableau a une page', neuf.pages, 1, JSON.stringify(neuf));
    r.egal('et ce qu\'on y écrit s\'enregistre', neuf.traits, 1, JSON.stringify(neuf));
    r.verifie('la session est tenue pour non vide', neuf.contenu, JSON.stringify(neuf));

    // ------------------------------------------------------------------
    // 1. DÉSIGNER LE DOSSIER : deux classes, l'arbre les montre
    // ------------------------------------------------------------------
    const adopte = await page.evaluate(async () => {
        await window.__fauxRacine.getDirectoryHandle('2nde 3', { create: true });
        await window.__fauxRacine.getDirectoryHandle('Terminale spé', { create: true });
        await MonDossier.adopterLeDossier(window.__fauxRacine, false);
        const tiroir = document.getElementById('right-drawer');
        if (!tiroir.classList.contains('open')) toggleRightDrawer();
        await new Promise(ok => setTimeout(ok, 200));
        return {
            source: MonDossier.etat.source, pret: MonDossier.pret(),
            lignes: [...document.querySelectorAll('.dossier-ligne .label')].map(l => l.textContent),
            panneau: getComputedStyle(document.getElementById('dossier-container')).display,
            local: getComputedStyle(document.getElementById('file-tree-container')).display,
            bandeau: [...document.querySelectorAll('#ouje-lignes li')].map(l => l.textContent).pop()
        };
    });
    r.egal('la source passe sur « Mon Drive »', adopte.source, 'dossier', JSON.stringify(adopte));
    r.egal('les deux classes sont dans l\'arbre', adopte.lignes, ['2nde 3', 'Terminale spé'], JSON.stringify(adopte));
    r.verifie('le panneau du Drive remplace l\'arbre local', adopte.panneau === 'flex' && adopte.local === 'none', JSON.stringify(adopte));
    r.egal('le bandeau dit que le tableau n\'est pas dans le Drive', adopte.bandeau, 'Pas dans votre Drive');

    // ------------------------------------------------------------------
    // 2. ENREGISTRER DANS LE DRIVE : le bouton du bandeau, un nom, un fichier
    // ------------------------------------------------------------------
    const enregistre = await page.evaluate(async (repondre) => {
        document.getElementById('ouje-ranger').click();
        const repondu = await eval(repondre)('Suites : découverte');
        const t = window.__fauxTableau('Suites - découverte.prof');
        return {
            repondu, chemin: MonDossier.chemin(), nom: currentBoardName,
            traits: t ? t.data.pages[0].freehands.length : -1,
            format: t ? t.format : null,
            bandeau: [...document.querySelectorAll('#ouje-lignes li')].map(l => l.textContent).pop(),
            bouton: document.getElementById('ouje-ranger').textContent,
            marque: !!document.querySelector('.dossier-ligne .dossier-ouvert')
        };
    }, REPONDRE);
    r.verifie('la fenêtre a demandé un nom', enregistre.repondu);
    r.egal('le fichier est à la racine, sous un nom que Windows accepte',
        enregistre.chemin, ['Suites - découverte.prof'], JSON.stringify(enregistre));
    r.egal('avec le trait qu\'on avait écrit', enregistre.traits, 1, JSON.stringify(enregistre));
    r.verifie('le bandeau et son bouton parlent du Drive',
        /Dans votre Drive/.test(enregistre.bandeau) && enregistre.bouton === 'Enregistrer dans votre Drive', JSON.stringify(enregistre));
    r.verifie('et la ligne du tableau ouvert porte sa marque', enregistre.marque);

    // ------------------------------------------------------------------
    // 3. UN TABLEAU NEUF DANS UNE CLASSE, et l'écriture qui suit toute seule
    // ------------------------------------------------------------------
    const seance = await page.evaluate(async ({ repondre, trait }) => {
        MonDossier.creerTableau(['2nde 3']);
        await eval(repondre)('Séance 1');
        const apresCreation = { chemin: MonDossier.chemin(), traits: freehands.length, pages: pages.length,
            fichier: !!window.__fauxTableau('2nde 3/Séance 1.prof') };
        // On fait comme si la dernière écriture était vieille, et l'on annule
        // l'attente déjà en cours : le prochain changement s'écrit dès la fin
        // du geste, sans attendre dix secondes.
        MonDossier.etat.derniereEcriture = Date.now() - 60000;
        clearTimeout(MonDossier.etat.minuteur); MonDossier.etat.minuteur = null;
        eval(trait)(420, 420);
        await new Promise(ok => setTimeout(ok, 5500));
        const t = window.__fauxTableau('2nde 3/Séance 1.prof');
        return { apresCreation, traitsFichier: t ? t.data.pages[0].freehands.length : -1, aEcrire: MonDossier.etat.aEcrire };
    }, { repondre: REPONDRE, trait: TRAIT });
    r.egal('le fichier est créé dans la classe, et le tableau est neuf',
        { chemin: seance.apresCreation.chemin, traits: seance.apresCreation.traits, pages: seance.apresCreation.pages, fichier: seance.apresCreation.fichier },
        { chemin: ['2nde 3', 'Séance 1.prof'], traits: 0, pages: 1, fichier: true }, JSON.stringify(seance));
    r.egal('ce qu\'on écrit ensuite est dans le fichier, sans rien demander',
        seance.traitsFichier, 1, JSON.stringify(seance));

    // ------------------------------------------------------------------
    // 4. OUVRIR UN AUTRE TABLEAU : celui qu'on quitte est écrit d'abord
    // ------------------------------------------------------------------
    const ouvert = await page.evaluate(async () => {
        freehands.push({ id: nextId++, points: [{ x: 10, y: 10 }, { x: 40, y: 40 }], color: '#0984e3', width: 4, z: globalZ++ });
        saveState(); draw();
        const ligne = document.querySelector('.dossier-ligne[data-chemin=\'["Suites - découverte.prof"]\']');
        ligne.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 700));
        const s1 = window.__fauxTableau('2nde 3/Séance 1.prof');
        return { chemin: MonDossier.chemin(), nom: currentBoardName, traits: freehands.length,
            seance1Traits: s1.data.pages[0].freehands.length, local: selectedBoardId };
    });
    r.egal('le tableau quitté a reçu son dernier trait', ouvert.seance1Traits, 2, JSON.stringify(ouvert));
    r.egal('celui qu\'on ouvre revient avec son nom et son contenu',
        { chemin: ouvert.chemin, nom: ouvert.nom, traits: ouvert.traits, local: ouvert.local },
        { chemin: ['Suites - découverte.prof'], nom: 'Suites - découverte', traits: 1, local: null }, JSON.stringify(ouvert));

    // ------------------------------------------------------------------
    // 5. RENOMMER, RANGER DANS UNE CLASSE, SUPPRIMER
    // ------------------------------------------------------------------
    const range = await page.evaluate(async (repondre) => {
        MonDossier.renommer(['Suites - découverte.prof']);
        await eval(repondre)('Suites 1');
        const apresRenommage = { chemin: MonDossier.chemin(), nom: currentBoardName, fichiers: Object.keys(window.__fauxTout().fichiers) };
        await MonDossier.deplacer(['Suites 1.prof'], ['Terminale spé']);
        await new Promise(ok => setTimeout(ok, 300));
        const apresDeplacement = { chemin: MonDossier.chemin(), fichiers: Object.keys(window.__fauxTout().fichiers) };
        MonDossier.supprimer(['2nde 3', 'Séance 1.prof']);
        await new Promise(ok => setTimeout(ok, 200));
        document.getElementById('confirm-yes-btn').click();
        await new Promise(ok => setTimeout(ok, 500));
        const apresSuppression = { fichiers: Object.keys(window.__fauxTout().fichiers), lie: MonDossier.lie() };
        return { apresRenommage, apresDeplacement, apresSuppression };
    }, REPONDRE);
    r.egal('renommer suit le tableau ouvert', { chemin: range.apresRenommage.chemin, nom: range.apresRenommage.nom, fichiers: range.apresRenommage.fichiers },
        { chemin: ['Suites 1.prof'], nom: 'Suites 1', fichiers: ['2nde 3/Séance 1.prof', 'Suites 1.prof'] }, JSON.stringify(range.apresRenommage));
    r.egal('ranger dans une classe déplace le fichier, et le lien avec lui',
        range.apresDeplacement, { chemin: ['Terminale spé', 'Suites 1.prof'], fichiers: ['2nde 3/Séance 1.prof', 'Terminale spé/Suites 1.prof'] }, JSON.stringify(range.apresDeplacement));
    r.egal('supprimer retire le fichier, et ne touche pas au tableau ouvert',
        range.apresSuppression, { fichiers: ['Terminale spé/Suites 1.prof'], lie: true }, JSON.stringify(range.apresSuppression));

    // ------------------------------------------------------------------
    // 6. RECHARGER : la session reprise retrouve son fichier
    // ------------------------------------------------------------------
    await page.evaluate(async () => { await saveAppLocal(true); });
    await rechargerApp(page);
    const repris = await page.evaluate(async () => {
        const modal = document.getElementById('restore-modal');
        const propose = modal && modal.style.display === 'flex';
        if (propose) { confirmRestore(); await new Promise(ok => setTimeout(ok, 800)); }
        const avant = { propose, lie: MonDossier.lie(), attendu: MonDossier.etat.lienAttendu ? MonDossier.etat.lienAttendu.chemin : null };
        // Le vrai navigateur retrouve le dossier dans son stockage ; le faux
        // ne s'y range pas. On le lui rend, et l'on rouvre — comme le bouton.
        MonDossier.etat.racine = window.__fauxRacine;
        await MonDossier.rouvrir();
        await new Promise(ok => setTimeout(ok, 300));
        return { avant, chemin: MonDossier.chemin(), nom: currentBoardName, traits: freehands.length };
    });
    r.verifie('au rechargement, la session est proposée et reprise', repris.avant.propose, JSON.stringify(repris));
    r.egal('elle sait d\'où elle vient, avant même que le dossier soit rouvert',
        repris.avant.attendu, ['Terminale spé', 'Suites 1.prof'], JSON.stringify(repris));
    r.egal('une fois le dossier rouvert, le tableau est relié à son fichier',
        { chemin: repris.chemin, nom: repris.nom, traits: repris.traits },
        { chemin: ['Terminale spé', 'Suites 1.prof'], nom: 'Suites 1', traits: 1 }, JSON.stringify(repris));

    // Le fichier a changé ailleurs (un autre poste) : on le dit, on propose.
    const conflit = await page.evaluate(async () => {
        const t = window.__fauxTableau('Terminale spé/Suites 1.prof');
        t.data.pages[0].freehands.push({ id: 999, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: '#000', width: 1 });
        window.__fauxEcrire('Terminale spé/Suites 1.prof', JSON.stringify(t));
        const lien = { chemin: ['Terminale spé', 'Suites 1.prof'], enregistreLe: Date.now() - 60000 };
        MonDossier.etat.lienAttendu = lien;
        await MonDossier.rouvrir();
        await new Promise(ok => setTimeout(ok, 300));
        const modal = document.getElementById('confirm-modal');
        const titre = document.getElementById('confirm-title').innerText;
        const visible = modal.style.display === 'flex';
        if (visible) document.getElementById('confirm-yes-btn').click();
        await new Promise(ok => setTimeout(ok, 700));
        return { visible, titre, traits: freehands.length };
    });
    r.verifie('un fichier modifié sur un autre poste est signalé',
        conflit.visible && /a changé dans votre Drive/.test(conflit.titre), JSON.stringify(conflit));
    r.egal('et « ouvrir la version du Drive » la charge', conflit.traits, 2, JSON.stringify(conflit));

    // ------------------------------------------------------------------
    // 7. UN TABLEAU DE « MES TABLEAUX » N'EST PAS UN TABLEAU DU DRIVE
    // ------------------------------------------------------------------
    const local = await page.evaluate(async () => {
        MonDossier.changerDeSource('ordi');
        await localforage.setItem('data_tb_test', { pages: [{ points: [], segments: [], circles: [], rectangles: [], texts: [], freehands: [], curves: [], polygons: [], images: [], arcs: [], htmlPostits: [], panX: 0, panY: 0, zoom: 1 }], nextId: 1, globalZ: 1, currentBgIndex: 0 });
        savedTableaux.push({ id: 'tb_test', name: 'Local', timestamp: Date.now() });
        loadBoard('tb_test');
        await new Promise(ok => setTimeout(ok, 500));
        return { lie: MonDossier.lie(), nom: currentBoardName, source: MonDossier.etat.source,
            local: getComputedStyle(document.getElementById('file-tree-container')).display };
    });
    r.egal('ouvrir un tableau local délie du Drive', local.lie, false, JSON.stringify(local));
    r.verifie('et « Cet ordinateur » rend l\'arbre local', local.local !== 'none' && local.source === 'ordi', JSON.stringify(local));

    await page.evaluate(() => { images.length = 0; freehands.length = 0; selectedItems = []; setMode('pointer'); draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
