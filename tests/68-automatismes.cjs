// LES AUTOMATISMES.
//
// « Je voudrais intégrer les automatismes dans l'outil. Il faudrait qu'ils
// puissent être sauvegardés : que je retrouve rapidement et facilement les
// questions qui ont été posées ou les exercices qui ont été donnés. »
//
// CE QU'ON TIENT :
//   — la banque garde les questions, et les retrouve après rechargement ;
//   — une série se compose de questions de la banque, se projette une par
//     une (réponse, suivante, toutes), et s'arrête proprement ;
//   — la projection s'écrit au journal, avec la classe du moment ;
//   — chaque question sait combien de fois elle a été posée, et à qui ;
//   — la banque filtrée par classe distingue ce qui lui a déjà été donné ;
//   — le journal se filtre par classe et par texte ;
//   — l'export puis l'import n'ajoutent pas de doublon ;
//   — une copie part dans le Drive, et un poste où elle est plus récente la
//     reprend ;
//   — les formules entre dollars sont composées, à l'écran et sur le tampon.
const { creerRapport, ouvrirApp, rechargerApp } = require('./harness.cjs');

// Un faux dossier de Drive, réduit à ce que la copie demande.
const FAUX_DRIVE = `(() => {
    const fichiers = {};
    window.__drive = { fichiers, racine: { kind: 'directory', name: 'Au Tableau',
        queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        getFileHandle: async (n, o) => {
            if (!fichiers[n] && !(o && o.create)) { const e = new Error('absent'); e.name = 'NotFoundError'; throw e; }
            if (!fichiers[n]) fichiers[n] = { texte: '', date: Date.now() };
            return { kind: 'file', name: n,
                getFile: async () => ({ name: n, lastModified: fichiers[n].date, text: async () => fichiers[n].texte }),
                createWritable: async () => { let t = ''; return { write: async (c) => { t = String(c); }, close: async () => { fichiers[n] = { texte: t, date: Date.now() }; } }; } };
        } } };
})()`;

module.exports = async function (browser) {
    const r = creerRapport('Les automatismes');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await context.addInitScript(FAUX_DRIVE);
    await page.evaluate(FAUX_DRIVE);

    r.verifie('l\'outil est dans la rubrique « Exercices »', await page.evaluate(() => {
        const b = document.getElementById('btn-automatismes');
        return !!PluginManager.plugins.automatismesTool && !!b && b.dataset.category === 'Exercices' && typeof Automatismes === 'object';
    }));

    // Une classe du moment, pour que le journal sache à qui.
    await page.evaluate(async () => {
        await localforage.removeItem('auTableau_automatismes_v1');
        const classes = await ClassesStore.loadAll();
        classes.length = 0;
        classes.push({ id: 'c_2nde3', name: '2nde 3', students: [] }, { id: 'c_tle', name: 'Tle spé', students: [] });
        await localforage.setItem('auTableau_classes_v2', classes);
        poserLaClasseDuMoment('c_2nde3');
    });

    // ------------------------------------------------------------------
    // 1. LA BANQUE, ET LA FENÊTRE
    // ------------------------------------------------------------------
    const banque = await page.evaluate(async () => {
        await Automatismes.charger();
        const d = Automatismes.donnees(); d.questions.length = 0; d.series.length = 0; d.journal.length = 0;
        const q1 = await Automatismes.nouvelleQuestion({ enonce: 'Développer $(2x+1)^2$', reponse: '$4x^2+4x+1$', theme: 'Calcul littéral', niveau: '2nde' });
        const q2 = await Automatismes.nouvelleQuestion({ enonce: 'Résoudre $3x - 7 = 5$', reponse: '$x = 4$', theme: 'Équations', niveau: '2nde' });
        const q3 = await Automatismes.nouvelleQuestion({ enonce: 'Calculer $\\frac{2}{3} + \\frac{1}{6}$', reponse: '$\\frac{5}{6}$', theme: 'Fractions', niveau: '2nde' });
        const q4 = await Automatismes.nouvelleQuestion({ enonce: 'Image de 3 par $f(x) = -2x + 5$', reponse: '$-1$', theme: 'Fonctions', niveau: '2nde' });
        window.__q = [q1.id, q2.id, q3.id, q4.id];
        await Automatismes.ouvrir('banque');
        await new Promise(ok => setTimeout(ok, 1500));
        const f = document.getElementById('auto-fenetre');
        return { n: Automatismes.donnees().questions.length, visible: getComputedStyle(f).display !== 'none',
                 lignes: f.querySelectorAll('.auto-question').length, formules: f.querySelectorAll('.auto-enonce svg').length,
                 jamais: f.querySelectorAll('.auto-posee.jamais').length,
                 stocke: !!(await localforage.getItem('auTableau_automatismes_v1')) };
    });
    r.egal('quatre questions dans la banque, montrées, toutes « jamais posées »',
        { n: banque.n, visible: banque.visible, lignes: banque.lignes, jamais: banque.jamais, stocke: banque.stocke },
        { n: 4, visible: true, lignes: 4, jamais: 4, stocke: true }, JSON.stringify(banque));
    r.verifie('les formules entre dollars sont composées', banque.formules >= 4, JSON.stringify(banque));

    // La fiche : écrire une question à la main
    const fiche = await page.evaluate(async () => {
        const f = document.getElementById('auto-fenetre');
        f.querySelector('.auto-barre .pw-btn.primaire').click();     // + Nouvelle question
        await new Promise(ok => setTimeout(ok, 100));
        const zones = f.querySelectorAll('textarea.auto-saisie');
        zones[0].value = 'Factoriser $x^2 - 9$'; zones[0].dispatchEvent(new Event('input'));
        zones[1].value = '$(x-3)(x+3)$'; zones[1].dispatchEvent(new Event('input'));
        const champs = f.querySelectorAll('input.pw-select');
        champs[0].value = 'Calcul littéral'; champs[0].dispatchEvent(new Event('input'));
        champs[1].value = '2nde'; champs[1].dispatchEvent(new Event('input'));
        await new Promise(ok => setTimeout(ok, 400));
        const apercu = f.querySelectorAll('.auto-apercu svg').length;
        [...f.querySelectorAll('.auto-barre .pw-btn')].find(b => /Ajouter à la banque/.test(b.textContent)).click();
        await new Promise(ok => setTimeout(ok, 300));
        const d = Automatismes.donnees();
        return { apercu, n: d.questions.length, derniere: d.questions[d.questions.length - 1].enonce, lignes: f.querySelectorAll('.auto-question').length };
    });
    r.egal('une question écrite à la main entre dans la banque, avec son aperçu composé',
        { n: fiche.n, derniere: fiche.derniere, lignes: fiche.lignes, apercu: fiche.apercu >= 1 },
        { n: 5, derniere: 'Factoriser $x^2 - 9$', lignes: 5, apercu: true }, JSON.stringify(fiche));

    // ------------------------------------------------------------------
    // 2. UNE SÉRIE, PROJETÉE — ET LE JOURNAL QUI S'ÉCRIT
    // ------------------------------------------------------------------
    const serie = await page.evaluate(async () => {
        const s = await Automatismes.nouvelleSerie('Semaine 3', window.__q, 0);
        window.__s = s.id;
        await Automatismes.projeter(s);
        await new Promise(ok => setTimeout(ok, 800));
        const p = document.getElementById('auto-projection');
        const etape = () => ({ titre: p.querySelector('.auto-proj-titre').textContent, cachee: !!p.querySelector('#auto-proj-reponse.cachee'),
                               formules: p.querySelectorAll('.auto-proj-question svg').length });
        const e1 = etape();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));       // la réponse
        const e2 = { cachee: !!p.querySelector('#auto-proj-reponse.cachee') };
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));   // la suivante
        await new Promise(ok => setTimeout(ok, 300));
        const e3 = etape();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));           // toutes
        await new Promise(ok => setTimeout(ok, 500));
        const e4 = { cases: p.querySelectorAll('.auto-proj-case').length, titre: p.querySelector('.auto-proj-titre').textContent };
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(ok => setTimeout(ok, 200));
        const j = Automatismes.donnees().journal;
        return { e1, e2, e3, e4, fermee: !document.getElementById('auto-projection'), fenetreOutil: getComputedStyle(document.getElementById('auto-fenetre')).display,
                 journal: j.length, entree: j[0] && { classe: j[0].classeNom, serie: j[0].serieTitre, n: j[0].questions.length, mode: j[0].mode } };
    });
    r.egal('la projection ouvre sur la première question, réponse cachée, formules composées',
        { titre: serie.e1.titre, cachee: serie.e1.cachee, formules: serie.e1.formules >= 1 }, { titre: 'Semaine 3 — question 1 / 4', cachee: true, formules: true }, JSON.stringify(serie.e1));
    r.egal('Espace révèle, Flèche droite passe à la deuxième',
        { revelee: !serie.e2.cachee, titre: serie.e3.titre }, { revelee: true, titre: 'Semaine 3 — question 2 / 4' }, JSON.stringify(serie));
    r.egal('T montre toutes les questions pour la correction', { cases: serie.e4.cases, titre: serie.e4.titre }, { cases: 4, titre: 'Semaine 3 — correction' }, JSON.stringify(serie.e4));
    r.verifie('Échap ferme la projection, et la fenêtre de l\'outil s\'était rangée', serie.fermee && serie.fenetreOutil === 'none', JSON.stringify(serie));
    r.egal('la projection s\'est écrite au journal, avec la classe du moment',
        { journal: serie.journal, entree: serie.entree }, { journal: 1, entree: { classe: '2nde 3', serie: 'Semaine 3', n: 4, mode: 'projection' } }, JSON.stringify(serie));

    // ------------------------------------------------------------------
    // 3. CE QU'ON RETROUVE : par question, par classe, au journal
    // ------------------------------------------------------------------
    const retrouve = await page.evaluate(async () => {
        // Une seconde projection, à l'autre classe, d'une série qui ne reprend que la première question
        poserLaClasseDuMoment('c_tle');
        const s2 = await Automatismes.nouvelleSerie('Rappels', [window.__q[0]], 0);
        await Automatismes.projeter(s2); await new Promise(ok => setTimeout(ok, 300)); Automatismes.arreter();
        poserLaClasseDuMoment('c_2nde3');
        const posesQ1 = Automatismes.poses(window.__q[0]).map(j => j.classeNom).sort();
        const posesQ2 = Automatismes.poses(window.__q[1]).map(j => j.classeNom);
        // La banque, filtrée par la Tle : une seule question lui a été donnée
        await Automatismes.ouvrir('banque');
        Automatismes.ui.filtre.classe = 'c_tle'; Automatismes.rendre();
        await new Promise(ok => setTimeout(ok, 400));
        const f = document.getElementById('auto-fenetre');
        const deja = f.querySelectorAll('.auto-question.deja').length;
        const jamaisTle = [...f.querySelectorAll('.auto-posee')].filter(e => /jamais donnée à cette classe/.test(e.textContent)).length;
        const compteurs = [...f.querySelectorAll('.auto-posee')].filter(e => /posée \\d+ fois/.test(e.textContent)).map(e => e.textContent.slice(0, 12));
        Automatismes.ui.filtre.classe = '';
        // Le journal, filtré par la 2nde 3 puis par un mot
        Automatismes.ui.onglet = 'journal'; Automatismes.rendre();
        await new Promise(ok => setTimeout(ok, 300));
        const toutes = f.querySelectorAll('.auto-entree').length;
        Automatismes.ui.filtreJournal.classe = 'c_2nde3'; Automatismes.rendre(); await new Promise(ok => setTimeout(ok, 300));
        const seconde = f.querySelectorAll('.auto-entree').length;
        Automatismes.ui.filtreJournal.classe = ''; Automatismes.ui.filtreJournal.texte = 'fraction'; Automatismes.rendre(); await new Promise(ok => setTimeout(ok, 300));
        const parMot = [...f.querySelectorAll('.auto-entree strong')].map(e => e.textContent);
        Automatismes.ui.filtreJournal.texte = '';
        return { posesQ1, posesQ2, deja, jamaisTle, compteurs, toutes, seconde, parMot };
    });
    r.egal('la première question sait avoir été posée aux deux classes, la deuxième à une seule',
        { q1: retrouve.posesQ1, q2: retrouve.posesQ2 }, { q1: ['2nde 3', 'Tle spé'], q2: ['2nde 3'] }, JSON.stringify(retrouve));
    r.egal('la banque filtrée par la Tle montre la seule question qu\'elle a eue, et les quatre autres jamais',
        { deja: retrouve.deja, jamais: retrouve.jamaisTle }, { deja: 1, jamais: 4 }, JSON.stringify(retrouve));
    r.egal('le journal a deux lignes, une seule pour la 2nde 3, et le mot « fraction » ne retrouve que celle-là',
        { toutes: retrouve.toutes, seconde: retrouve.seconde, parMot: retrouve.parMot }, { toutes: 2, seconde: 1, parMot: ['2nde 3'] }, JSON.stringify(retrouve));

    // ------------------------------------------------------------------
    // 4. LE TAMPON : la série posée sur le tableau, formules comprises
    // ------------------------------------------------------------------
    const tampon = await page.evaluate(async () => {
        images.length = 0;
        const s = Automatismes.donnees().series.find(x => x.id === window.__s);
        await Automatismes.tamponner(s);
        for (let k = 0; k < 40 && mode !== 'automatismesTool'; k++) await new Promise(ok => setTimeout(ok, 100));
        const arme = mode === 'automatismesTool';
        PluginManager.trigger('onPointerDown', { x: 400, y: 300 });
        const img = images[0];
        return { arme, posee: images.length, plugin: img && img.pluginData && img.pluginData.id, serie: img && img.pluginData && img.pluginData.serieId,
                 svgAvecFormules: img ? decodeURIComponent(img.src).includes('<svg') && decodeURIComponent(img.src).split('<svg').length > 3 : false, mode };
    });
    r.egal('la série se pose sur le tableau en un tampon qui porte ses formules',
        { arme: tampon.arme, posee: tampon.posee, plugin: tampon.plugin, serie: tampon.serie, formules: tampon.svgAvecFormules, mode: tampon.mode },
        { arme: true, posee: 1, plugin: 'automatismesTool', serie: await page.evaluate(() => window.__s), formules: true, mode: 'pointer' }, JSON.stringify(tampon));

    // ------------------------------------------------------------------
    // 5. EXPORT, IMPORT, ET LE DRIVE
    // ------------------------------------------------------------------
    const partage = await page.evaluate(async () => {
        const d = Automatismes.donnees();
        const json = JSON.stringify(d);
        const avant = d.questions.length;
        const n1 = await Automatismes.importerDepuis(json);              // les mêmes : rien n'entre deux fois
        const autre = JSON.parse(json); autre.questions = [{ id: 'q_collegue', enonce: 'Simplifier $\\sqrt{50}$', reponse: '$5\\sqrt{2}$', theme: 'Racines', niveau: '2nde' }]; autre.series = [];
        const n2 = await Automatismes.importerDepuis(JSON.stringify(autre));
        return { avant, n1, n2, apres: d.questions.length, illisible: await Automatismes.importerDepuis('pas du json') };
    });
    r.egal('réimporter sa propre banque n\'ajoute rien ; celle d\'un collègue ajoute ses questions ; un fichier illisible est refusé',
        partage, { avant: 5, n1: 0, n2: 1, apres: 6, illisible: 0 }, JSON.stringify(partage));

    const drive = await page.evaluate(async () => {
        // Le Drive s'ouvre : la prochaine écriture y part.
        MonDossier.etat.emplacements = [{ id: 'e1', nom: 'Au Tableau', handle: window.__drive.racine }];
        MonDossier.etat.actif = 'e1'; MonDossier.etat.racine = window.__drive.racine; MonDossier.etat.droit = 'granted';
        await Automatismes.enregistrer();
        const copie = window.__drive.fichiers['automatismes.json'];
        const lu = copie ? JSON.parse(copie.texte) : null;
        // Un autre poste a écrit une copie plus récente : on la reprend à l'ouverture.
        const plusRecente = JSON.parse(copie.texte); plusRecente.modifie = Date.now() + 5000;
        plusRecente.questions.push({ id: 'q_autre_poste', enonce: 'Venue d\'ailleurs', reponse: '', theme: '', niveau: '' });
        window.__drive.fichiers['automatismes.json'] = { texte: JSON.stringify(plusRecente), date: Date.now() };
        const r1 = await Automatismes.reprendreDuDrive(false);
        const reprise = Automatismes.donnees().questions.some(q => q.id === 'q_autre_poste');
        // Une copie plus ancienne, elle, ne remplace rien.
        const ancienne = JSON.parse(copie.texte); ancienne.modifie = 1; ancienne.questions = [];
        window.__drive.fichiers['automatismes.json'] = { texte: JSON.stringify(ancienne), date: Date.now() };
        const r2 = await Automatismes.reprendreDuDrive(false);
        return { copiee: !!lu && lu.questions.length === 6, r1, reprise, r2, gardees: Automatismes.donnees().questions.length };
    });
    r.egal('une copie part dans le Drive ; une copie plus récente venue d\'ailleurs est reprise, une plus ancienne ignorée',
        drive, { copiee: true, r1: 'repris', reprise: true, r2: 'pas plus récent', gardees: 7 }, JSON.stringify(drive));

    // ------------------------------------------------------------------
    // 6. APRÈS RECHARGEMENT, TOUT EST LÀ
    // ------------------------------------------------------------------
    await rechargerApp(page);
    const apres = await page.evaluate(async () => {
        const modal = document.getElementById('restore-modal');
        if (modal && modal.style.display === 'flex') { confirmRestore(); await new Promise(ok => setTimeout(ok, 500)); }
        const d = await Automatismes.charger();
        return { questions: d.questions.length, series: d.series.length, journal: d.journal.length };
    });
    r.egal('après rechargement, la banque, les séries et le journal sont là',
        apres, { questions: 7, series: 2, journal: 2 }, JSON.stringify(apres));

    await page.evaluate(() => { Automatismes.fermer(); images.length = 0; draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
