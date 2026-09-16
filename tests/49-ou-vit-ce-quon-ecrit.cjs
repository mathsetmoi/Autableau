// OÙ VIT CE QU'ON ÉCRIT.
//
// « Clarifier la gestion des tableaux et du stockage : pas grand-chose et ça
// se réglera dans le temps, mais je trouve que la gestion n'est pas hyper
// intuitive pour un novice. »
//
// Il y a TROIS endroits, et aucun ne portait de nom sur l'écran :
//
//   1. CET ORDINATEUR — la séance en cours, écrite toute seule à chaque salve
//      de gestes. C'est elle qu'on retrouve en rouvrant l'onglet, et c'est ce
//      qui fait qu'on ne perd jamais une heure de cours. Personne ne le
//      savait : on cliquait le disque du tiroir par précaution.
//   2. MES TABLEAUX — la liste du tiroir de droite. Un tableau n'y entre que
//      si on l'y range.
//   3. LA SAUVEGARDE DE SÉCURITÉ — un dossier du disque, pour le jour où le
//      navigateur perd sa mémoire.
//
// CE QUE CETTE SUITE TIENT :
//
//   — un état lisible à côté du titre : attente, enregistrement, enregistré,
//     et l'heure qui vieillit toute seule ;
//   — un bandeau en tête du tiroir qui nomme les trois endroits et dit ce qui
//     est fait et ce qui reste à faire ;
//   — le bouton qui range dans « Mes tableaux », et qui change de mot une fois
//     que le tableau y est ;
//   — un premier écran au tout premier démarrage, et une seule fois ;
//   — mais JAMAIS s'il y a une séance à reprendre : celui qui retrouve son
//     cours d'hier a déjà sa réponse ;
//   — la fenêtre de reprise dit d'où vient ce qu'elle propose, et de quand ;
//   — rien de tout cela ne paraît quand on projette.
const { creerRapport, ouvrirApp, rechargerApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Où vit ce qu\'on écrit');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });
    await page.waitForFunction(() => typeof etatDuRangement === 'function', { timeout: 20000 });

    // ------------------------------------------------------------------
    // 1. « IL Y A COMBIEN » SE DIT EN MINUTES
    // Les secondes ne servent à rien : ce qu'on veut savoir, c'est si l'on a
    // perdu quelque chose, et la réponse se joue en minutes.
    // ------------------------------------------------------------------
    const durees = await page.evaluate(() => ({
        maintenant: ilYACombien(Date.now()),
        troisMin: ilYACombien(Date.now() - 3 * 60000),
        uneHeure: ilYACombien(Date.now() - 90 * 60000),
        jamais: ilYACombien(null),
        zero: ilYACombien(0)
    }));
    r.egal('« à l\'instant », « il y a 3 min », « il y a 1 h 30 »',
        [durees.maintenant, durees.troisMin, durees.uneHeure],
        ["à l'instant", 'il y a 3 min', 'il y a 1 h 30']);
    r.egal('et « jamais » ne se raconte pas', [durees.jamais, durees.zero], [null, null]);

    // ------------------------------------------------------------------
    // 2. L'ÉTAT À CÔTÉ DU TITRE
    // ------------------------------------------------------------------
    const depart = await page.evaluate(() => {
        const b = document.getElementById('etat-enregistrement');
        return { existe: !!b, etat: b && b.dataset.etat,
                 mot: (document.getElementById('etat-mot') || {}).textContent,
                 vu: b && getComputedStyle(b).display,
                 aide: b && b.getAttribute('title') };
    });
    r.verifie('l\'état est là, à côté du titre', depart.existe && depart.vu !== 'none',
        JSON.stringify(depart));
    r.egal('tant que rien n\'est écrit, il le dit sans alarmer',
        { etat: depart.etat, mot: depart.mot },
        { etat: 'attente', mot: 'Rien à enregistrer' });
    r.verifie('et il explique que l\'enregistrement se fera tout seul',
        /tout seul/.test(depart.aide || ''), depart.aide);

    const apresEcriture = await page.evaluate(async () => {
        // On écrit quelque chose, puis on force l'enregistrement.
        freehands.push({ id: nextId++, points: [{ x: 10, y: 10 }, { x: 90, y: 90 }],
                         color: '#2d3436', width: 3, z: globalZ++ });
        draw();
        await saveAppLocal(true);
        await new Promise(ok => setTimeout(ok, 400));
        const b = document.getElementById('etat-enregistrement');
        return { etat: b.dataset.etat,
                 mot: document.getElementById('etat-mot').textContent,
                 aide: b.getAttribute('title'),
                 quand: etatDuRangement().local.quand };
    });
    r.egal('une fois enregistré, il le dit',
        { etat: apresEcriture.etat, mot: apresEcriture.mot },
        { etat: 'bon', mot: 'Enregistré' });
    r.verifie('il porte une heure, et dit que le tableau n\'est pas encore rangé',
        apresEcriture.quand > 0 && /pas encore dans Mes tableaux/.test(apresEcriture.aide),
        apresEcriture.aide);

    // ET L'ON VOIT L'ÉTAT PENDANT L'ÉCRITURE, pas seulement après. Une
    // sauvegarde de trois mégaoctets prend un instant : sans ce passage, la
    // pastille sautait d'un « il y a 2 min » à un « à l'instant » sans que
    // rien n'ait paru bouger, et l'on doutait qu'elle serve à quelque chose.
    // On ralentit l'écriture pour l'attraper au vol.
    const pendant = await page.evaluate(async () => {
        const vrai = localforage.setItem.bind(localforage);
        localforage.setItem = (k, v) => new Promise((ok) => {
            setTimeout(() => vrai(k, v).then(ok), 400);
        });
        const promesse = saveAppLocal(true);
        await new Promise(ok => setTimeout(ok, 150));
        const b = document.getElementById('etat-enregistrement');
        const auVol = { etat: b.dataset.etat,
                        mot: document.getElementById('etat-mot').textContent,
                        drapeau: etatDuRangement().local.enCours };
        await promesse;
        await new Promise(ok => setTimeout(ok, 200));
        localforage.setItem = vrai;
        return { auVol, apres: { etat: b.dataset.etat,
                                 drapeau: etatDuRangement().local.enCours } };
    });
    r.egal('pendant l\'écriture, l\'état le dit',
        pendant.auVol, { etat: 'encours', mot: 'Enregistrement…', drapeau: true });
    r.egal('et il repasse au vert une fois l\'écriture finie',
        pendant.apres, { etat: 'bon', drapeau: false });

    // L'heure VIEILLIT toute seule : « à l'instant » devient « il y a 4 min »
    // sans qu'on touche à rien. On triche sur l'horodatage plutôt que
    // d'attendre quatre minutes.
    const vieilli = await page.evaluate(() => {
        dernierEnregistrementLocal = Date.now() - 4 * 60000;
        updateUnsavedIndicator();
        return { mot: document.getElementById('etat-mot').textContent,
                 ligne: document.querySelector('#ouje-lignes .ouje-ligne').textContent };
    });
    r.egal('et il vieillit tout seul', vieilli.mot, 'Enregistré il y a 4 min');
    r.egal('le bandeau dit la même heure', vieilli.ligne, 'Sur cet ordinateur, il y a 4 min');

    // ------------------------------------------------------------------
    // 3. LE BANDEAU NOMME LES TROIS ENDROITS
    // ------------------------------------------------------------------
    const bandeau = await page.evaluate(() => {
        const lignes = majBandeauDuRangement();
        return {
            lignes,
            nom: document.getElementById('ouje-nom').textContent,
            titre: document.querySelector('#rd-ou-je-suis .ouje-titre').textContent,
            ranger: document.getElementById('ouje-ranger').textContent,
            // Le bandeau vit dans le tiroir des tableaux : c'est là qu'on
            // vient chercher ses séances.
            dansLeTiroir: !!document.querySelector('#right-drawer #rd-ou-je-suis')
        };
    });
    r.verifie('le bandeau est dans le tiroir des tableaux', bandeau.dansLeTiroir);
    r.egal('il dit sur quoi l\'on travaille', bandeau.titre, 'Vous travaillez sur');
    r.verifie('et le nomme', (bandeau.nom || '').length > 0, bandeau.nom);
    r.egal('sans dossier de sécurité, il nomme les deux endroits qui existent',
        bandeau.lignes.map(l => l.etat), ['bon', 'attente']);
    r.verifie('« cet ordinateur » d\'abord, « Mes tableaux » ensuite',
        /cet ordinateur/i.test(bandeau.lignes[0].texte)
        && /Mes tableaux/.test(bandeau.lignes[1].texte),
        JSON.stringify(bandeau.lignes));
    r.egal('et le bouton propose de l\'y ranger',
        bandeau.ranger, 'Enregistrer dans Mes tableaux');

    // LE TROISIÈME ENDROIT NE PARAÎT QUE S'IL EXISTE. Un dossier de sécurité
    // qu'on n'a pas choisi n'est pas une ligne à lire, c'est une ligne de
    // plus à comprendre.
    const avecSecurite = await page.evaluate(() => {
        dossierSecurite = { name: 'Clé USB du prof' };
        securiteDerniereEcriture = Date.now() - 60000;
        const lignes = majBandeauDuRangement();
        dossierSecurite = null; securiteDerniereEcriture = 0;
        majBandeauDuRangement();
        return lignes;
    });
    r.egal('un dossier de sécurité choisi ajoute sa ligne, et la nomme',
        avecSecurite.length, 3);
    r.verifie('avec le nom du dossier et l\'heure de la copie',
        /Clé USB du prof/.test(avecSecurite[2].texte) && /il y a 1 min/.test(avecSecurite[2].texte),
        avecSecurite[2].texte);

    // ------------------------------------------------------------------
    // 4. RANGER DANS « MES TABLEAUX »
    // ------------------------------------------------------------------
    const range = await page.evaluate(async () => {
        const input = document.getElementById('project-name-input');
        input.value = 'Fractions 6e B';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('ouje-ranger').click();
        await new Promise(ok => setTimeout(ok, 900));
        const e = etatDuRangement();
        return { nom: e.nom, dedans: e.liste.dedans, nomDansLaListe: e.liste.nom,
                 quand: !!e.liste.quand,
                 ligne: [...document.querySelectorAll('#ouje-lignes .ouje-ligne')]
                     .map(l => ({ etat: l.className.replace('ouje-ligne ouje-', ''), t: l.textContent })),
                 ranger: document.getElementById('ouje-ranger').textContent,
                 aide: document.getElementById('etat-enregistrement').getAttribute('title') };
    });
    r.egal('le bouton range le tableau dans la liste, sous son nom',
        { nom: range.nom, dedans: range.dedans, dansLaListe: range.nomDansLaListe },
        { nom: 'Fractions 6e B', dedans: true, dansLaListe: 'Fractions 6e B' });
    r.egal('la ligne « Mes tableaux » passe au vert, avec son heure',
        { etat: range.ligne[1].etat, heure: /il y a|à l'instant/.test(range.ligne[1].t) },
        { etat: 'bon', heure: true });
    r.egal('et le bouton change de mot : il n\'y a plus à ranger, mais à mettre à jour',
        range.ranger, 'Enregistrer les changements');
    r.verifie('l\'aide de l\'état le dit aussi',
        /rangé dans Mes tableaux/.test(range.aide), range.aide);

    // Un clic sur l'état ouvre la liste : c'est la porte, et elle mène quelque part.
    const ouvre = await page.evaluate(async () => {
        const d = document.getElementById('right-drawer');
        if (d.classList.contains('open')) toggleRightDrawer();
        await new Promise(ok => setTimeout(ok, 450));
        // ON PART DE L'AUTRE ONGLET : si l'on partait de celui des tableaux,
        // le clic pourrait ne rien faire du tout sans que cela se voie.
        switchDrawerTab('interfaces');
        await new Promise(ok => setTimeout(ok, 150));
        const avant = { ouvert: d.classList.contains('open'),
                        onglet: document.getElementById('tab-tableaux').classList.contains('active') };
        document.getElementById('etat-enregistrement').click();
        await new Promise(ok => setTimeout(ok, 450));
        return { avantOuvert: avant.ouvert, avantOnglet: avant.onglet,
                 apres: d.classList.contains('open'),
                 onglet: document.getElementById('tab-tableaux').classList.contains('active') };
    });
    r.egal('un clic sur l\'état ouvre le tiroir, et le ramène sur les tableaux',
        ouvre, { avantOuvert: false, avantOnglet: false, apres: true, onglet: true });

    // ------------------------------------------------------------------
    // 5. RIEN DE TOUT CELA NE PARAÎT QUAND ON PROJETTE
    // On ne montre pas l'intendance à une classe.
    // ------------------------------------------------------------------
    const enFocus = await page.evaluate(async () => {
        poserLAffichage(2);
        await new Promise(ok => setTimeout(ok, 450));
        const vu = getComputedStyle(document.getElementById('etat-enregistrement')).display;
        poserLAffichage(0);
        await new Promise(ok => setTimeout(ok, 450));
        return { enFocus: vu,
                 rendu: getComputedStyle(document.getElementById('etat-enregistrement')).display };
    });
    r.egal('l\'état s\'efface avec le reste en projection, et revient après',
        enFocus, { enFocus: 'none', rendu: 'flex' });

    await context.close();

    // ------------------------------------------------------------------
    // 6. LE PREMIER ÉCRAN
    // Il ne paraît qu'au tout premier démarrage, et une seule fois.
    // ------------------------------------------------------------------
    const neuf = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });
    await neuf.page.waitForFunction(() => typeof montrerLePremierEcran === 'function', { timeout: 20000 });
    const premier = await neuf.page.evaluate(async () => {
        // On repart d'un tableau qui n'a jamais été ouvert.
        try { localStorage.removeItem('auTableau_premier_ecran_vu'); } catch (e) { /* refusé */ }
        const vuAvant = premierEcranDejaVu();
        montrerLePremierEcran();
        await new Promise(ok => setTimeout(ok, 200));
        const el = document.getElementById('premier-ecran');
        const portes = [...el.querySelectorAll('.premier-porte b')].map(b => b.textContent.trim());
        const texte = el.querySelector('.premier-texte').textContent.replace(/\s+/g, ' ');
        return { vuAvant, ouvert: getComputedStyle(el).display, portes, texte };
    });
    r.egal('au tout premier démarrage, il n\'a jamais été vu', premier.vuAvant, false);
    r.egal('il s\'ouvre, et propose trois portes',
        { ouvert: premier.ouvert, portes: premier.portes.length },
        { ouvert: 'flex', portes: 3 });
    r.egal('écrire, ouvrir, découvrir',
        premier.portes,
        ['Commencer à écrire', 'Ouvrir un tableau', 'Faire le tour du propriétaire']);
    r.verifie('et il pose la phrase qui manquait : où va ce qu\'on écrit',
        /enregistré tout seul, sur cet ordinateur/i.test(premier.texte)
        && /Mes tableaux/.test(premier.texte)
        && /Rien ne part sur Internet/i.test(premier.texte),
        premier.texte);

    const referme = await neuf.page.evaluate(async () => {
        document.getElementById('premier-ecrire').click();
        await new Promise(ok => setTimeout(ok, 300));
        return { ferme: getComputedStyle(document.getElementById('premier-ecran')).display,
                 retenu: premierEcranDejaVu(),
                 // Et le tableau est prêt : on peut écrire tout de suite.
                 pages: typeof pages !== 'undefined' && pages.length > 0 };
    });
    r.egal('« Commencer à écrire » le referme, et le tableau est prêt',
        { ferme: referme.ferme, pages: referme.pages }, { ferme: 'none', pages: true });
    r.egal('et il ne reviendra plus', referme.retenu, true);

    // « Ouvrir un tableau » mène au tiroir.
    const parLeTiroir = await neuf.page.evaluate(async () => {
        const d = document.getElementById('right-drawer');
        if (d.classList.contains('open')) toggleRightDrawer();
        switchDrawerTab('interfaces');
        await new Promise(ok => setTimeout(ok, 450));
        const avantOnglet = document.getElementById('tab-tableaux').classList.contains('active');
        fermerLePremierEcran('ouvrir');
        await new Promise(ok => setTimeout(ok, 450));
        return { avantOnglet, ouvert: d.classList.contains('open'),
                 onglet: document.getElementById('tab-tableaux').classList.contains('active') };
    });
    r.egal('« Ouvrir un tableau » ouvre la liste, sur le bon onglet',
        parLeTiroir, { avantOnglet: false, ouvert: true, onglet: true });

    // MAIS IL NE PARAÎT JAMAIS S'IL Y A UNE SÉANCE À REPRENDRE. Celui qui
    // retrouve son cours d'hier a déjà sa réponse ; lui poser une question de
    // plus serait une porte entre lui et son heure. On éprouve le VRAI chemin
    // de démarrage : on écrit, on enregistre, on oublie être déjà venu, et
    // l'on recharge la page.
    const auRedemarrage = await neuf.page.evaluate(async () => {
        freehands.push({ id: nextId++, points: [{ x: 20, y: 20 }, { x: 120, y: 120 }],
                         color: '#2d3436', width: 3, z: globalZ++ });
        draw();
        await saveAppLocal(true);
        await new Promise(ok => setTimeout(ok, 400));
        try { localStorage.removeItem('auTableau_premier_ecran_vu'); } catch (e) { /* refusé */ }
        return true;
    });
    await rechargerApp(neuf.page);
    const apresRedemarrage = await neuf.page.evaluate(() => ({
        premier: getComputedStyle(document.getElementById('premier-ecran')).display,
        reprise: getComputedStyle(document.getElementById('restore-modal')).display,
        quand: (document.getElementById('restore-quand') || {}).textContent,
        note: (document.querySelector('#restore-modal .modal-note') || {}).textContent
    }));
    r.verifie('une séance à reprendre était bien enregistrée', auRedemarrage);
    r.egal('au redémarrage, c\'est la reprise qui parle — pas le premier écran',
        { premier: apresRedemarrage.premier, reprise: apresRedemarrage.reprise },
        { premier: 'none', reprise: 'flex' });
    r.verifie('et elle dit de quand date ce qu\'elle propose',
        /il y a|à l'instant/.test(apresRedemarrage.quand || ''),
        JSON.stringify(apresRedemarrage.quand));
    r.verifie('elle rassure aussi : repartir d\'une page blanche n\'efface rien',
        /efface pas/.test((apresRedemarrage.note || '').replace(/\s+/g, ' '))
        && /Mes tableaux/.test(apresRedemarrage.note || ''),
        apresRedemarrage.note);

    r.verifie('aucune erreur de page', erreurs.length === 0 && neuf.erreurs.length === 0,
        erreurs.concat(neuf.erreurs).join(' | '));
    await neuf.context.close();
    return r.bilan();
};
