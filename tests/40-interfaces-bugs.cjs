// LES INTERFACES PERSONNALISÉES : QUATRE SILENCES.
//
// « J'ai rencontré quelques bugs sur la gestion des interfaces :
//   — la création se passe bien
//   — il est parfois impossible de charger la nouvelle interface créée
//   — la sauvegarde d'une interface ne se fait parfois pas correctement
//   — bug d'affichage : parfois l'appli affiche "2 interfaces sélectionnées",
//     ce qui pose problème étant donné qu'une seule est active
//   — la croix ne désélectionne rien du tout. »
//
// Les quatre se tiennent, et ils ont tous la même forme : QUELQUE CHOSE RATE,
// ET RIEN NE LE DIT.
//
//   — L'espace du navigateur se remplit : chaque interface emporte sa
//     vignette, et au bout d'un certain nombre l'écriture est refusée.
//     L'exception sortait de l'enregistrement — pas de rafraîchissement, pas
//     de message. L'interface vivait en mémoire, donc elle s'affichait, et
//     disparaissait au redémarrage suivant.
//   — Charger une entrée absente ou sans contenu sortait sans un mot : on
//     cliquait, et rien ne se passait.
//   — Renommer une interface pendant que l'onglet « Tableaux » est ouvert
//     écrivait la liste des TABLEAUX : le nom vivait jusqu'au rechargement.
//   — Le lot de sélection gardait les identifiants des fichiers jetés à la
//     corbeille : la barre annonçait deux fichiers là où il n'en restait
//     qu'un, et quand ils étaient tous partis elle parlait d'une sélection
//     dont plus rien n'était surligné — la croix la vidait bien, mais comme
//     il n'y avait rien à voir, elle avait l'air de ne rien faire.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Interfaces : les bugs');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    await page.evaluate(() => { switchDrawerTab('interfaces'); });
    await page.waitForTimeout(300);

    // =================================================================
    // 1. L'ESPACE PLEIN SE DIT
    // =================================================================
    const sature = await page.evaluate(() => {
        let dit = null;
        const vrai = window.showToast; window.showToast = (m) => { dit = m; };
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (cle, v) {
            if (cle === 'auTableau_interfaces_list') {
                const e = new Error('plein'); e.name = 'QuotaExceededError'; throw e;
            }
            return setItem.call(this, cle, v);
        };
        let plante = null, rendu = null;
        try { rendu = _doSaveInterface('Trop grande', 'iface_essai_plein'); }
        catch (e) { plante = e.name; }
        Storage.prototype.setItem = setItem; window.showToast = vrai;
        return { plante, rendu, dit, courante: selectedInterfaceId,
                 dansLaListe: !!savedInterfaces.find(i => i.id === 'iface_essai_plein') };
    });
    r.egal('l\'espace saturé ne fait plus exploser l\'enregistrement', sature.plante, null);
    r.egal('il se dit, et l\'enregistrement se déclare manqué', sature.rendu, false);
    r.verifie('le message parle d\'espace plein', /plein/i.test(sature.dit || ''), String(sature.dit));
    r.verifie('mais l\'interface reste là pour la séance en cours, et devient la courante',
        sature.dansLaListe && sature.courante === 'iface_essai_plein', JSON.stringify(sature));

    // Et quand l'espace est libre, l'enregistrement se dit réussi et tient
    // vraiment dans le stockage.
    const garde = await page.evaluate(() => {
        let dit = null;
        const vrai = window.showToast; window.showToast = (m) => { dit = m; };
        const rendu = _doSaveInterface('Ma classe', 'iface_essai_1');
        window.showToast = vrai;
        const stock = JSON.parse(localStorage.getItem('auTableau_interfaces_list') || '[]');
        return { rendu, dit, dansLeStockage: !!stock.find(i => i.id === 'iface_essai_1') };
    });
    r.egal('une interface qui tient est bien gardée, et on le dit',
        { rendu: garde.rendu, stock: garde.dansLeStockage }, { rendu: true, stock: true });
    r.verifie('le message le confirme', /sauvegard/i.test(garde.dit || ''), String(garde.dit));

    // =================================================================
    // 2. CHARGER NE DOIT JAMAIS ÊTRE UN SILENCE
    // =================================================================
    const absente = await page.evaluate(() => {
        let dit = null;
        const vrai = window.showToast; window.showToast = (m) => { dit = m; };
        const rendu = loadInterface('iface_qui_nexiste_pas');
        window.showToast = vrai;
        return { rendu, dit };
    });
    r.egal('charger une interface absente se déclare manqué', absente.rendu, false);
    r.verifie('et le dit', /introuvable/i.test(absente.dit || ''), String(absente.dit));

    const sansContenu = await page.evaluate(() => {
        savedInterfaces.push({ id: 'iface_vide', name: 'Vide', timestamp: Date.now() });
        let dit = null;
        const vrai = window.showToast; window.showToast = (m) => { dit = m; };
        const rendu = loadInterface('iface_vide');
        window.showToast = vrai;
        savedInterfaces = savedInterfaces.filter(i => i.id !== 'iface_vide');
        return { rendu, dit };
    });
    r.egal('une interface sans disposition se déclare manquée', sansContenu.rendu, false);
    r.verifie('et le dit aussi', /aucune disposition/i.test(sansContenu.dit || ''), String(sansContenu.dit));

    // =================================================================
    // 3. RENOMMER ÉCRIT LA BONNE LISTE
    // =================================================================
    const renomme = await page.evaluate(() => {
        _doSaveInterface('Avant', 'iface_essai_nom');
        // L'enseignant regarde l'onglet des tableaux pendant qu'il renomme :
        // c'est le cas qui perdait le nom.
        const onglet = currentExplorerTab;
        currentExplorerTab = 'tableaux';
        // Le renommage lit le champ posé dans la liste : on le pose comme le
        // ferait un double-clic.
        const champ = document.createElement('input');
        champ.id = 'rename-input-iface_essai_nom';
        champ.value = 'Après';
        document.body.appendChild(champ);
        renamingItemId = 'iface_essai_nom';
        finishRename('iface_essai_nom', 'interfaces');
        champ.remove();
        currentExplorerTab = onglet;
        const stock = JSON.parse(localStorage.getItem('auTableau_interfaces_list') || '[]');
        return {
            enMemoire: (savedInterfaces.find(i => i.id === 'iface_essai_nom') || {}).name,
            dansLeStockage: (stock.find(i => i.id === 'iface_essai_nom') || {}).name
        };
    });
    r.egal('le nouveau nom survit au rechargement, même depuis l\'autre onglet',
        renomme, { enMemoire: 'Après', dansLeStockage: 'Après' });

    // =================================================================
    // 4. LE COMPTE DE LA SÉLECTION NE MENT PLUS
    // =================================================================
    const compte = await page.evaluate(() => {
        switchDrawerTab('interfaces');
        const vivantes = savedInterfaces.filter(i => !i.deleted && i.type !== 'folder').slice(0, 2);
        lotExplorateur.clear();
        vivantes.forEach(i => lotExplorateur.add(i.id));
        renderExplorerLists();
        const aDeux = {
            texte: document.getElementById('exp-lot-compte').textContent,
            montree: getComputedStyle(document.getElementById('exp-lot')).display !== 'none'
        };
        // L'une part à la corbeille : il n'en reste qu'une.
        savedInterfaces.find(i => i.id === vivantes[0].id).deleted = true;
        renderExplorerLists();
        const aUne = {
            texte: document.getElementById('exp-lot-compte').textContent,
            montree: getComputedStyle(document.getElementById('exp-lot')).display !== 'none',
            lot: lotExplorateur.size
        };
        savedInterfaces.find(i => i.id === vivantes[0].id).deleted = false;
        return { aDeux, aUne };
    });
    r.egal('à deux, la barre le dit et se montre',
        compte.aDeux, { texte: '2 interfaces sélectionnées', montree: true });
    r.egal('l\'une jetée, le compte se corrige et la barre se retire',
        compte.aUne, { texte: '1 interfaces sélectionnées', montree: false, lot: 1 });

    // TOUTES PARTIES : plus rien n'est surligné, donc plus rien à
    // désélectionner — et la barre ne doit pas rester à parler d'un fantôme.
    const fantomes = await page.evaluate(() => {
        const vivantes = savedInterfaces.filter(i => !i.deleted && i.type !== 'folder').slice(0, 2);
        lotExplorateur.clear();
        vivantes.forEach(i => lotExplorateur.add(i.id));
        vivantes.forEach(i => { savedInterfaces.find(x => x.id === i.id).deleted = true; });
        renderExplorerLists();
        const etat = {
            texte: document.getElementById('exp-lot-compte').textContent,
            montree: getComputedStyle(document.getElementById('exp-lot')).display !== 'none',
            lot: lotExplorateur.size
        };
        vivantes.forEach(i => { savedInterfaces.find(x => x.id === i.id).deleted = false; });
        renderExplorerLists();
        return etat;
    });
    r.egal('un lot de fantômes se vide tout seul, et la barre se tait',
        fantomes, { texte: '0 interfaces sélectionnées', montree: false, lot: 0 });

    // =================================================================
    // 5. ET LA CROIX DÉSÉLECTIONNE POUR DE BON
    // =================================================================
    const croix = await page.evaluate(() => {
        switchDrawerTab('interfaces');
        const vivantes = savedInterfaces.filter(i => !i.deleted && i.type !== 'folder').slice(0, 2);
        lotExplorateur.clear();
        vivantes.forEach(i => lotExplorateur.add(i.id));
        renderExplorerLists();
        const marquees = () => document.querySelectorAll('#interfaces-container .tree-item.du-lot').length;
        const avant = { lot: lotExplorateur.size, marquees: marquees(),
                        barre: getComputedStyle(document.getElementById('exp-lot')).display !== 'none' };
        document.getElementById('exp-lot-rien').click();
        return { avant, apres: { lot: lotExplorateur.size, marquees: marquees(),
                                 barre: getComputedStyle(document.getElementById('exp-lot')).display !== 'none' } };
    });
    r.egal('avant la croix : deux marquées, la barre est là',
        croix.avant, { lot: 2, marquees: 2, barre: true });
    r.egal('après la croix : plus rien de marqué, plus de barre',
        croix.apres, { lot: 0, marquees: 0, barre: false });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
