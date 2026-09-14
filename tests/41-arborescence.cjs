// CRÉER DANS CE DOSSIER-CI, ET LA BARRE FANTÔME.
//
// « J'aimerais ajouter sur l'arborescence des tableaux un bouton pour ajouter
// un répertoire et créer un tableau. »
//
// Les deux boutons de l'en-tête créent DANS LE DOSSIER CHOISI — encore
// faut-il l'avoir choisi, et rien ne disait lequel l'était. On cliquait
// « Nouveau », et le tableau atterrissait à la racine ou dans un dossier
// sélectionné dix minutes plus tôt. Sur la ligne du dossier, il n'y a plus
// de doute.
//
// LA CAPTURE MONTRAIT AUSSI CECI : la barre « 0 sélectionnés » affichée en
// permanence. « hidden » ne pèse rien face à une classe qui pose
// « display: flex » — la barre ne se cachait jamais, et la croix qui la
// vidait avait l'air de ne rien faire, puisqu'il n'y avait rien à
// désélectionner et que rien ne disparaissait. Le contrôle précédent lisait
// la PROPRIÉTÉ « hidden », qui était bien posée : il passait au vert sur une
// barre qui restait sous les yeux.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Arborescence');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    // LE TIROIR DOIT ÊTRE OUVERT : fermé, ses lignes sont hors de l'écran, et
    // la souris ne peut rien survoler.
    await page.evaluate(() => {
        const t = document.getElementById('right-drawer');
        if (t && !t.classList.contains('open') && typeof toggleRightDrawer === 'function') toggleRightDrawer();
    });
    await page.waitForTimeout(400);

    const poserLArbre = () => page.evaluate(() => {
        savedTableaux = [
            { id: 'folder_1', name: '2ndeC', type: 'folder', isOpen: true, parentId: null, timestamp: 1 },
            { id: 'folder_2', name: '1reS', type: 'folder', isOpen: false, parentId: null, timestamp: 2 },
            { id: 'tab_1', name: 'Cours', type: 'file', parentId: 'folder_1', timestamp: 3 },
            { id: 'tab_2', name: 'Exos', type: 'file', parentId: 'folder_1', timestamp: 4 }
        ];
        selectedFolderId = null;
        inlineCreationState = null;
        lotExplorateur.clear();
        switchDrawerTab('tableaux');
    });

    // ON SURVOLE LA LIGNE AVANT DE LIRE SES BOUTONS. Ils ne paraissent qu'au
    // survol : les compter dans le document suffisait à passer au vert sur des
    // boutons qu'on n'aurait jamais pu atteindre. On vérifie donc qu'ils ont
    // une vraie place à l'écran, une fois la souris dessus.
    const ligneDu = async (nom) => {
        const place = await page.evaluate((n) => {
            const d = [...document.querySelectorAll('#file-tree-container .tree-item')]
                .find(t => t.querySelector('.label') && t.querySelector('.label').textContent === n);
            if (!d) return null;
            const b = d.getBoundingClientRect();
            return { x: b.x + 10, y: b.y + b.height / 2 };
        }, nom);
        if (!place) return null;
        await page.mouse.move(place.x, place.y);
        await page.waitForTimeout(250);
        return page.evaluate((n) => {
            const d = [...document.querySelectorAll('#file-tree-container .tree-item')]
                .find(t => t.querySelector('.label') && t.querySelector('.label').textContent === n);
            return {
                titres: [...d.querySelectorAll('.tree-action-btn')].map(b => b.title),
                atteignables: [...d.querySelectorAll('.tree-action-btn')]
                    .every(b => b.getBoundingClientRect().width > 6
                        && getComputedStyle(b).visibility === 'visible')
            };
        }, nom);
    };

    await poserLArbre();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------
    // 1. Les deux boutons sont sur la ligne du dossier
    // ---------------------------------------------------------------
    r.egal('la ligne d\'un dossier porte les deux boutons de création, et on peut les atteindre',
        await ligneDu('2ndeC'),
        { titres: ['Nouveau dossier ici', 'Nouveau tableau ici'], atteignables: true });

    r.egal('la ligne d\'un tableau garde les siens, inchangés',
        await ligneDu('Cours'),
        { titres: ['Ouvrir', 'Refaire avec une autre classe — demande une préparation gardée (menu Exporter)', 'Renommer', 'Supprimer'],
          atteignables: true });

    // Dans l'onglet des interfaces, le libellé dit « interface ».
    const cotéInterfaces = await page.evaluate(() => {
        savedInterfaces.push({ id: 'folder_i', name: 'Mes panoplies', type: 'folder', isOpen: true, parentId: null, timestamp: 9 });
        switchDrawerTab('interfaces');
        const d = [...document.querySelectorAll('#interfaces-container .tree-item')]
            .find(t => t.querySelector('.label') && t.querySelector('.label').textContent === 'Mes panoplies');
        const titres = d ? [...d.querySelectorAll('.tree-action-btn')].map(b => b.title) : null;
        savedInterfaces = savedInterfaces.filter(i => i.id !== 'folder_i');
        switchDrawerTab('tableaux');
        return titres;
    });
    r.egal('et côté interfaces, le libellé le dit',
        cotéInterfaces, ['Nouveau dossier ici', 'Nouvelle interface ici']);

    // ---------------------------------------------------------------
    // 2. Ce qu'on crée atterrit DANS ce dossier
    // ---------------------------------------------------------------
    await poserLArbre();
    const unDossier = await page.evaluate(() => {
        // Un autre dossier était choisi : c'est le piège que le bouton de la
        // ligne doit faire disparaître.
        selectedFolderId = 'folder_2';
        const pris = creerDansLeDossier('folder_1', 'folder');
        const etat = { ...inlineCreationState };
        finishInlineCreation('Chapitre 1');
        const neuf = savedTableaux.find(t => t.name === 'Chapitre 1');
        return { pris, etat, parent: neuf && neuf.parentId, type: neuf && neuf.type,
                 ouvert: savedTableaux.find(t => t.id === 'folder_1').isOpen };
    });
    r.egal('le bouton vise SON dossier, pas celui qui était choisi',
        { pris: unDossier.pris, parent: unDossier.parent, type: unDossier.type },
        { pris: true, parent: 'folder_1', type: 'folder' });
    r.verifie('et le dossier s\'ouvre pour qu\'on voie le nouveau venu',
        unDossier.ouvert === true, String(unDossier.ouvert));

    await poserLArbre();
    const unTableau = await page.evaluate(() => {
        selectedFolderId = 'folder_2';
        creerDansLeDossier('folder_1', 'file');
        finishInlineCreation('Séance 3');
        const neuf = savedTableaux.find(t => t.name === 'Séance 3');
        return { parent: neuf && neuf.parentId, type: neuf && neuf.type };
    });
    r.egal('un tableau créé depuis la ligne y atterrit aussi',
        unTableau, { parent: 'folder_1', type: 'file' });

    // Un dossier qui n'existe pas, ou une ligne de fichier : on ne crée rien.
    const refus = await page.evaluate(() => ({
        absent: creerDansLeDossier('folder_inconnu', 'folder'),
        surUnFichier: creerDansLeDossier('tab_1', 'folder'),
        etat: inlineCreationState
    }));
    r.egal('on ne crée pas dans ce qui n\'est pas un dossier',
        refus, { absent: false, surUnFichier: false, etat: null });

    // ---------------------------------------------------------------
    // 3. Le bouton clique vraiment, et ne sélectionne pas le dossier
    // ---------------------------------------------------------------
    await poserLArbre();
    const parLeClic = await page.evaluate(() => {
        selectedFolderId = null;
        const d = [...document.querySelectorAll('#file-tree-container .tree-item')]
            .find(t => t.querySelector('.label') && t.querySelector('.label').textContent === '2ndeC');
        d.querySelectorAll('.tree-action-btn')[1].click();
        const etat = inlineCreationState ? { ...inlineCreationState } : null;
        finishInlineCreation('Au clic');
        const neuf = savedTableaux.find(t => t.name === 'Au clic');
        return { etat, parent: neuf && neuf.parentId };
    });
    r.egal('le clic sur le bouton crée bien dans ce dossier',
        { type: parLeClic.etat && parLeClic.etat.type, parent: parLeClic.parent },
        { type: 'file', parent: 'folder_1' });

    // ---------------------------------------------------------------
    // 4. LA BARRE DU LOT SE CACHE POUR DE BON
    // ---------------------------------------------------------------
    await poserLArbre();
    const barre = () => page.evaluate(() => {
        const e = document.getElementById('exp-lot');
        // On mesure ce qu'on VOIT, pas la propriété : c'est elle qui était
        // bien posée pendant que la barre restait à l'écran.
        return { propriete: e.hidden, affichage: getComputedStyle(e).display,
                 texte: document.getElementById('exp-lot-compte').textContent };
    });
    const aVide = await barre();
    r.egal('sans sélection, la barre n\'est pas seulement « hidden » : elle ne s\'affiche pas',
        { propriete: aVide.propriete, affichage: aVide.affichage }, { propriete: true, affichage: 'none' });

    await page.evaluate(() => {
        lotExplorateur.clear(); lotExplorateur.add('tab_1'); lotExplorateur.add('tab_2');
        renderExplorerLists();
    });
    const aDeux = await barre();
    r.egal('à deux, elle se montre et dit le compte',
        { affichage: aDeux.affichage, texte: aDeux.texte },
        { affichage: 'flex', texte: '2 tableaux sélectionnés' });

    await page.evaluate(() => document.getElementById('exp-lot-rien').click());
    const apresLaCroix = await barre();
    r.egal('la croix la fait disparaître de l\'écran, pour de bon',
        { affichage: apresLaCroix.affichage, texte: apresLaCroix.texte },
        { affichage: 'none', texte: '0 tableaux sélectionnés' });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
