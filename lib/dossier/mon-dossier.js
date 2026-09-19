// ==============================================================================
// MES TABLEAUX DANS MON DRIVE
// ==============================================================================
// « Je voudrais pouvoir créer des dossiers qui correspondraient aux classes et,
// dans chaque dossier, un tableau correspondrait à une séance. Les dossiers
// seraient stockés dans mon Google Drive. J'ouvrirai donc mes tableaux depuis
// un dossier dans mon Drive. »
//
// Google Drive pour ordinateur — comme OneDrive, ou une clé USB — présente le
// Drive comme un dossier du disque : « G:\Mon Drive ». Il n'y a donc besoin ni
// d'un compte Google dans la page, ni d'une adresse en http(s) : le navigateur
// sait lire et écrire dans un dossier qu'on lui a désigné une fois — c'est
// déjà ainsi que la copie de sécurité travaille — et Drive fait le reste,
// vers le nuage et vers les autres postes.
//
// LE DOSSIER, C'EST LA BIBLIOTHÈQUE : un sous-dossier par classe, un fichier
// « .prof » par séance — le format d'export d'un seul tableau, que l'import
// ordinaire sait déjà lire. Le tiroir de droite montre cet arbre à côté de
// « Mes tableaux » (sur cet ordinateur) ; on y crée, ouvre, renomme, déplace,
// supprime, et le tableau ouvert depuis le Drive s'y réenregistre tout seul,
// au fil du cours, au plus toutes les dix secondes.
//
// CE FICHIER NE TOUCHE PAS À script.js. Il s'accroche aux fonctions qu'il lui
// faut — enregistrer, ouvrir, nouveau, l'état du bandeau — en les enveloppant :
// les mises à jour d'Au Tableau se prennent ainsi sans conflit.
// ==============================================================================
(function () {
    'use strict';

    const CLE_DOSSIER = 'AuTableau_dossier_tableaux';   // localforage : le dossier désigné
    const CLE_SOURCE = 'AuTableau_source_tableaux';     // localStorage : 'ordi' ou 'dossier'
    const CLE_OUVERTS = 'AuTableau_dossiers_ouverts';   // localStorage : les dossiers dépliés
    const EXTENSION = '.prof';
    const PERIODE = 10 * 1000;          // au plus une écriture toutes les dix secondes
    const PREMIERE_ATTENTE = 2500;      // après un premier changement, on laisse finir le geste

    const etat = {
        racine: null,           // FileSystemDirectoryHandle du dossier désigné
        droit: 'prompt',        // 'granted' | 'prompt' | 'denied'
        source: 'ordi',
        // Le tableau ouvert depuis le dossier
        fichier: null,          // FileSystemFileHandle
        dossier: null,          // son dossier parent (handle)
        chemin: [],             // ['2nde 3', 'Séance 1.prof']
        derniereEcriture: 0,
        aEcrire: false,
        enCours: false,
        minuteur: null,
        // L'arbre
        arbre: null,            // [{ nom, kind, chemin, handle, date, enfants }]
        dossierChoisi: [],      // chemin du dossier sélectionné : c'est là que « Nouveau » crée
        ouverts: new Set(),
        glisse: null,           // chemin (JSON) de la ligne qu'on glisse
        // Le démarrage
        ouvertureParMoi: false, // restoreState appelé par ce fichier : ne pas délier
        aDejaRestaure: false,   // le premier restoreState est celui de la session reprise
        lienAttendu: null       // un lien lu au démarrage, en attente de l'autorisation
    };

    try { etat.source = localStorage.getItem(CLE_SOURCE) === 'dossier' ? 'dossier' : 'ordi'; } catch (e) { /* refusé */ }
    try { JSON.parse(localStorage.getItem(CLE_OUVERTS) || '[]').forEach(c => etat.ouverts.add(c)); } catch (e) { /* refusé */ }

    const el = (id) => document.getElementById(id);
    const dire = (m) => { if (typeof showToast === 'function') showToast(m); };
    const echapper = (t) => (typeof echapperTexte === 'function') ? echapperTexte(t)
        : String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cle = (chemin) => JSON.stringify(chemin);
    const sansExtension = (nom) => nom.replace(new RegExp(EXTENSION.replace('.', '\\.') + '$', 'i'), '');
    const estUnTableau = (nom) => new RegExp(EXTENSION.replace('.', '\\.') + '$', 'i').test(nom);

    function disponible() {
        return typeof window.showDirectoryPicker === 'function';
    }
    function pret() { return !!etat.racine && etat.droit === 'granted'; }
    function actif() { return etat.source === 'dossier' && pret(); }
    function lie() { return !!etat.fichier; }
    // Deux poignées sur le même fichier ne sont pas le même objet : c'est le
    // chemin qui dit si c'est lui.
    const estLeFichierLie = (chemin) => lie() && cle(etat.chemin) === cle(chemin);
    const estSousLeChemin = (chemin) => lie() && cle(etat.chemin.slice(0, chemin.length)) === cle(chemin);

    // Un nom de fichier, à partir de ce qu'on a tapé : Windows refuse une
    // poignée de caractères, et un nom vide ne désigne rien.
    function nomDeFichierSur(nom) {
        const propre = String(nom || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
        return propre || 'Sans titre';
    }

    // ---------------------------------------------------------------------
    // LE DOSSIER : le désigner, le retrouver, y avoir droit
    // ---------------------------------------------------------------------
    async function droit(handle, demander) {
        if (!handle || !handle.queryPermission) return 'granted';
        try {
            const e = await handle.queryPermission({ mode: 'readwrite' });
            if (e === 'granted' || !demander) return e;
            return await handle.requestPermission({ mode: 'readwrite' });
        } catch (e) { return 'denied'; }
    }

    async function choisirLeDossier() {
        if (!disponible()) {
            dire('Ce navigateur ne sait pas ouvrir un dossier : utilisez Chrome ou Edge');
            return null;
        }
        let handle;
        try {
            handle = await window.showDirectoryPicker({ id: 'autableau-tableaux', mode: 'readwrite' });
        } catch (e) { return null; }    // choix annulé : rien à dire
        return adopterLeDossier(handle, true);
    }

    async function adopterLeDossier(handle, retenir) {
        if (!handle) return null;
        etat.droit = await droit(handle, true);
        if (etat.droit !== 'granted') { rendre(); return null; }
        etat.racine = handle;
        etat.dossierChoisi = [];
        if (retenir) {
            try { await localforage.setItem(CLE_DOSSIER, handle); } catch (e) { /* non clonable */ }
        }
        changerDeSource('dossier');
        await rafraichir();
        dire('Vos tableaux vivent maintenant dans « ' + (handle.name || 'ce dossier') + ' »');
        return handle;
    }

    async function oublierLeDossier() {
        if (lie()) await ecrire();
        delier();
        etat.racine = null; etat.droit = 'prompt'; etat.arbre = null;
        try { await localforage.removeItem(CLE_DOSSIER); } catch (e) { /* rien */ }
        changerDeSource('ordi');
        rendre();
    }

    // Au démarrage : on retrouve le dossier ; le droit d'y écrire, lui, se
    // redemande sur un geste. On ne le mendie que si l'on en a besoin.
    async function reprendre() {
        if (!disponible()) { rendre(); return false; }
        let handle = null;
        try { handle = await localforage.getItem(CLE_DOSSIER); } catch (e) { handle = null; }
        if (!handle) { rendre(); return false; }
        etat.racine = handle;
        etat.droit = await droit(handle, false);
        if (etat.droit === 'granted') {
            await rafraichir();
            if (etat.lienAttendu) relier(etat.lienAttendu);
        } else {
            rendre();
            if (etat.lienAttendu) proposerDeReprendre();
        }
        return etat.droit === 'granted';
    }

    async function rouvrir() {
        if (!etat.racine) return choisirLeDossier();
        etat.droit = await droit(etat.racine, true);
        if (etat.droit !== 'granted') { rendre(); return false; }
        await rafraichir();
        if (etat.lienAttendu) await relier(etat.lienAttendu);
        return true;
    }

    // Un bandeau, pas une modale : on ne bloque pas quelqu'un qui entre en classe.
    function proposerDeReprendre() {
        if (el('bandeau-dossier')) return;
        const lien = etat.lienAttendu;
        const barre = document.createElement('div');
        barre.id = 'bandeau-dossier';
        barre.className = 'bandeau-securite';
        const texte = document.createElement('span');
        texte.textContent = 'Reprendre l\'enregistrement dans votre Drive — « '
            + (lien && lien.chemin ? sansExtension(lien.chemin[lien.chemin.length - 1]) : 'ce tableau') + ' » ?';
        const oui = document.createElement('button');
        oui.className = 'btn-action primary';
        oui.textContent = 'Reprendre';
        oui.onclick = async () => { barre.remove(); await rouvrir(); };
        const non = document.createElement('button');
        non.className = 'btn-action secondary';
        non.textContent = 'Plus tard';
        non.onclick = () => { barre.remove(); etat.lienAttendu = null; };
        barre.appendChild(texte); barre.appendChild(oui); barre.appendChild(non);
        document.body.appendChild(barre);
    }

    // ---------------------------------------------------------------------
    // L'ARBRE : lire le dossier
    // ---------------------------------------------------------------------
    async function lire(dossier, chemin) {
        const entrees = [];
        try {
            for await (const [nom, handle] of dossier.entries()) {
                if (handle.kind === 'directory') {
                    if (nom.startsWith('.')) continue;
                    entrees.push({ nom, kind: 'dossier', chemin: chemin.concat(nom), handle, enfants: null });
                } else if (handle.kind === 'file' && estUnTableau(nom)) {
                    let date = 0;
                    try { date = (await handle.getFile()).lastModified || 0; } catch (e) { date = 0; }
                    entrees.push({ nom, kind: 'fichier', chemin: chemin.concat(nom), handle, date });
                }
            }
        } catch (e) {
            console.warn('Lecture du dossier impossible :', e);
        }
        entrees.sort((a, b) => (a.kind === b.kind ? 0 : (a.kind === 'dossier' ? -1 : 1))
            || a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' }));
        for (const e of entrees) {
            if (e.kind === 'dossier') e.enfants = await lire(e.handle, e.chemin);
        }
        return entrees;
    }

    async function rafraichir() {
        if (!pret()) { rendre(); return; }
        etat.arbre = await lire(etat.racine, []);
        rendre();
    }

    function trouver(chemin) {
        let liste = etat.arbre || [];
        let trouve = null;
        for (const seg of chemin) {
            trouve = liste.find(e => e.nom === seg) || null;
            if (!trouve) return null;
            liste = trouve.enfants || [];
        }
        return trouve;
    }

    async function dossierAu(chemin) {
        let d = etat.racine;
        for (const seg of chemin) d = await d.getDirectoryHandle(seg);
        return d;
    }

    // ---------------------------------------------------------------------
    // LE FICHIER D'UN TABLEAU
    // ---------------------------------------------------------------------
    function contenuDuTableau() {
        if (typeof syncPage === 'function') syncPage();
        const data = stateForStorage();
        let preview = null;
        try { preview = (typeof getMiniPreview === 'function') ? getMiniPreview() : null; } catch (e) { preview = null; }
        return {
            id: 'drive_' + Date.now(),
            name: nomCourant(),
            format: 'au-tableau',
            enregistreLe: Date.now(),
            preview,
            data
        };
    }

    function nomCourant() {
        if (typeof currentBoardName !== 'undefined' && currentBoardName && currentBoardName.trim()) return currentBoardName.trim();
        const input = el('project-name-input');
        return (input && input.value.trim()) || 'Sans titre';
    }

    function poserLeNom(nom) {
        if (typeof currentBoardName !== 'undefined') currentBoardName = nom;
        const input = el('project-name-input');
        if (input) input.value = nom;
        if (typeof ajusterLargeurDuTitre === 'function') ajusterLargeurDuTitre();
    }

    async function ecrireDans(fichier, contenu) {
        const flux = await fichier.createWritable();
        await flux.write(JSON.stringify(contenu));
        await flux.close();
    }

    // L'ÉCRITURE DU TABLEAU LIÉ. `contenu` peut avoir été pris avant — quand
    // on quitte le tableau, il faut photographier AVANT d'effacer l'écran.
    async function ecrire(contenu) {
        if (!lie()) return false;
        if (etat.enCours) { etat.aEcrire = true; return false; }
        etat.enCours = true;
        const fichier = etat.fichier;
        try {
            if (etat.droit !== 'granted') etat.droit = await droit(etat.racine, false);
            if (etat.droit !== 'granted') return false;
            await ecrireDans(fichier, contenu || contenuDuTableau());
            etat.derniereEcriture = Date.now();
            etat.aEcrire = false;
            // Le Drive est l'endroit de ce tableau : une fois écrit, plus rien
            // n'est « non enregistré ».
            if (!contenu && typeof hasUnsavedChanges !== 'undefined') hasUnsavedChanges = false;
            majEntree(fichier, etat.derniereEcriture);
            return true;
        } catch (e) {
            console.warn('Écriture dans le Drive impossible :', e);
            dire('Enregistrement dans le Drive impossible : le dossier est-il toujours là ?');
            return false;
        } finally {
            etat.enCours = false;
            if (typeof updateUnsavedIndicator === 'function') updateUnsavedIndicator();
            if (etat.aEcrire && etat.fichier === fichier) signalerUnChangement();
        }
    }

    function majEntree(fichier, date) {
        const e = trouver(etat.chemin);
        if (e && e.kind === 'fichier') { e.date = date; rendreLigne(e); }
    }

    // Le disque local est écrit à chaque geste ; le Drive suit, au plus toutes
    // les dix secondes — Drive pour ordinateur envoie chaque écriture au nuage,
    // inutile de l'inonder.
    function signalerUnChangement() {
        if (!lie()) return;
        if (!etat.aEcrire) {
            etat.aEcrire = true;
            if (typeof majBandeauDuRangement === 'function') majBandeauDuRangement();
        }
        if (etat.minuteur) return;
        const depuis = Date.now() - etat.derniereEcriture;
        const attente = Math.max(PREMIERE_ATTENTE, PERIODE - depuis);
        etat.minuteur = setTimeout(() => {
            etat.minuteur = null;
            if (etat.aEcrire) ecrire();
        }, attente);
    }

    function delier() {
        if (etat.minuteur) { clearTimeout(etat.minuteur); etat.minuteur = null; }
        const avait = lie();
        etat.fichier = null; etat.dossier = null; etat.chemin = [];
        etat.aEcrire = false; etat.derniereEcriture = 0;
        if (avait) { rendre(); if (typeof updateUnsavedIndicator === 'function') updateUnsavedIndicator(); }
    }

    function lierA(fichier, dossier, chemin) {
        if (etat.minuteur) { clearTimeout(etat.minuteur); etat.minuteur = null; }
        etat.fichier = fichier; etat.dossier = dossier; etat.chemin = chemin.slice();
        etat.aEcrire = false;
        etat.lienAttendu = null;
        // Le tableau n'est plus une entrée de « Mes tableaux » : c'est un
        // fichier du Drive.
        if (typeof selectedBoardId !== 'undefined') selectedBoardId = null;
        if (typeof hasUnsavedChanges !== 'undefined') hasUnsavedChanges = false;
        if (typeof renderExplorerLists === 'function') renderExplorerLists();
        if (typeof updateUnsavedIndicator === 'function') updateUnsavedIndicator();
        rendre();
    }

    // Relier, au démarrage, le tableau repris à son fichier — et vérifier que
    // le fichier n'a pas changé entre-temps sur un autre poste.
    async function relier(lien) {
        etat.lienAttendu = null;
        if (!pret() || !lien || !Array.isArray(lien.chemin) || !lien.chemin.length) return false;
        try {
            const dossier = await dossierAu(lien.chemin.slice(0, -1));
            const fichier = await dossier.getFileHandle(lien.chemin[lien.chemin.length - 1]);
            // La session reprise ne rend pas son titre : on le reprend du lien.
            if (lien.nom) poserLeNom(lien.nom);
            lierA(fichier, dossier, lien.chemin);
            etat.derniereEcriture = lien.enregistreLe || 0;
            const f = await fichier.getFile();
            if (f.lastModified > (lien.enregistreLe || 0) + 3000) {
                openConfirmModal('Ce tableau a changé dans votre Drive',
                    'Le fichier « ' + sansExtension(fichier.name) + ' » a été modifié depuis — sur un autre ordinateur, sans doute. '
                    + 'Ouvrir la version du Drive ? (Sinon, c\'est celle-ci qui l\'écrasera au prochain enregistrement.)',
                    false,
                    () => { ouvrirLeFichier(fichier, dossier, lien.chemin); },
                    () => { etat.aEcrire = true; signalerUnChangement(); });
            }
            return true;
        } catch (e) {
            dire('Le tableau « ' + sansExtension(lien.chemin[lien.chemin.length - 1]) + ' » n\'est plus dans votre Drive à sa place : il reste sur cet ordinateur');
            delier();
            return false;
        }
    }

    // ---------------------------------------------------------------------
    // OUVRIR, ENREGISTRER, CRÉER
    // ---------------------------------------------------------------------
    function tableauAvecDuContenu() {
        try {
            return points.length > 0 || segments.length > 0 || circles.length > 0 || rectangles.length > 0
                || texts.length > 0 || freehands.length > 0 || curves.length > 0 || polygons.length > 0
                || images.length > 0 || arcs.length > 0 || (typeof htmlPostits !== 'undefined' && htmlPostits.length > 0)
                || (typeof pages !== 'undefined' && pages.length > 1);
        } catch (e) { return false; }
    }

    // QUITTER UN TABLEAU LIÉ, C'EST L'ÉCRIRE. On photographie AVANT que
    // l'écran change, et l'on écrit ensuite — sans se demander s'il y avait
    // quelque chose à écrire : le disque local attend une seconde et demie
    // après le dernier geste, et un trait posé juste avant de changer de
    // tableau n'avait encore rien signalé.
    function quitterLeTableauLie() {
        if (!lie()) return;
        const contenu = contenuDuTableau();
        const fichier = etat.fichier;
        delier();
        ecrireDans(fichier, contenu).catch(e => console.warn('Dernière écriture impossible :', e));
    }

    // Avant de quitter le tableau à l'écran : ce qui est lié au Drive s'écrit
    // sans qu'on demande ; ce qui ne l'est pas, on le propose.
    function avantDeQuitter(suite) {
        if (lie()) {
            quitterLeTableauLie();
            suite();
            return;
        }
        const nonRange = typeof hasUnsavedChanges !== 'undefined' && hasUnsavedChanges
            && typeof selectedBoardId !== 'undefined' && !selectedBoardId;
        if (tableauAvecDuContenu() && nonRange) {
            openConfirmModal('Ranger le tableau courant ?',
                'Il n\'est ni dans Mes tableaux ni dans votre Drive. Il reste enregistré sur cet ordinateur, mais sera remplacé à l\'écran.',
                false,
                () => { if (typeof saveCurrentBoard === 'function') Promise.resolve(saveCurrentBoardDOrigine(true)).then(suite, suite); },
                () => suite());
            return;
        }
        suite();
    }

    async function ouvrirLeFichier(fichier, dossier, chemin) {
        let texte;
        try { texte = await (await fichier.getFile()).text(); }
        catch (e) { dire('Lecture impossible : « ' + fichier.name + ' »'); return false; }
        let donnees;
        try { donnees = JSON.parse(texte); } catch (e) { dire('Ce fichier n\'est pas un tableau'); return false; }
        const contenu = (donnees && donnees.data && (donnees.data.pages || donnees.data.points)) ? donnees.data
            : (donnees && donnees.pages ? donnees : null);
        if (!contenu) { dire('Ce fichier n\'est pas un tableau'); return false; }

        etat.ouvertureParMoi = true;
        try { restoreState(contenu); }
        finally { etat.ouvertureParMoi = false; }
        poserLeNom((donnees.name && String(donnees.name).trim()) || sansExtension(fichier.name));
        lierA(fichier, dossier, chemin);
        etat.derniereEcriture = Date.now();
        if (typeof checkMissingPdfs === 'function') { try { checkMissingPdfs(); } catch (e) { /* rien */ } }
        dire('« ' + sansExtension(fichier.name) + ' » est ouvert depuis votre Drive');
        return true;
    }

    function ouvrir(chemin) {
        const e = trouver(chemin);
        if (!e || e.kind !== 'fichier') return;
        if (estLeFichierLie(chemin)) { dire('Ce tableau est déjà ouvert'); return; }
        avantDeQuitter(async () => {
            const dossier = await dossierAu(chemin.slice(0, -1));
            await ouvrirLeFichier(e.handle, dossier, chemin);
        });
    }

    // Enregistrer : dans le fichier lié, sinon dans le dossier choisi, sous un nom.
    async function enregistrer(discret) {
        if (lie()) {
            const fait = await ecrire();
            if (fait && !discret) dire('Enregistré dans votre Drive');
            return fait;
        }
        if (!pret()) { dire('Choisissez d\'abord le dossier de votre Drive (tiroir de droite)'); return false; }
        return new Promise((resolve) => {
            const ou = etat.dossierChoisi.length ? etat.dossierChoisi.join(' › ') : (etat.racine.name || 'la racine');
            openSysPromptModal('Enregistrer dans votre Drive', 'Nom du tableau, dans « ' + ou + ' » :', nomCourant(), async (nom) => {
                if (!nom) return resolve(false);
                const propre = nomDeFichierSur(nom);
                try {
                    const dossier = await dossierAu(etat.dossierChoisi);
                    const nomFichier = propre + EXTENSION;
                    let existe = false;
                    try { await dossier.getFileHandle(nomFichier); existe = true; } catch (e) { existe = false; }
                    const faire = async () => {
                        const fichier = await dossier.getFileHandle(nomFichier, { create: true });
                        poserLeNom(propre);
                        lierA(fichier, dossier, etat.dossierChoisi.concat(nomFichier));
                        const fait = await ecrire();
                        await rafraichir();
                        if (fait) dire('« ' + propre + ' » enregistré dans votre Drive');
                        resolve(fait);
                    };
                    if (existe) {
                        openConfirmModal('Écraser ?', 'Un tableau « ' + propre + ' » existe déjà dans ce dossier. L\'écraser ?', true, faire, () => resolve(false));
                    } else await faire();
                } catch (e) {
                    console.warn(e);
                    dire('Enregistrement impossible dans ce dossier');
                    resolve(false);
                }
            });
        });
    }

    function creerDossier(cheminParent) {
        if (!pret()) return;
        const parent = cheminParent || etat.dossierChoisi;
        openSysPromptModal('Nouveau dossier', 'Nom de la classe (ou du dossier) :', '', async (nom) => {
            if (!nom) return;
            const propre = nomDeFichierSur(nom);
            try {
                const d = await dossierAu(parent);
                await d.getDirectoryHandle(propre, { create: true });
                parent.forEach((_, i) => etat.ouverts.add(cle(parent.slice(0, i + 1))));
                retenirLesOuverts();
                etat.dossierChoisi = parent.concat(propre);
                await rafraichir();
            } catch (e) { dire('Impossible de créer ce dossier'); }
        });
    }

    // Un tableau neuf, à sa place dans la classe : le fichier est créé tout de
    // suite, et tout ce qu'on y écrira s'y enregistrera.
    function creerTableau(cheminParent) {
        if (!pret()) return;
        const parent = cheminParent || etat.dossierChoisi;
        const ou = parent.length ? parent.join(' › ') : (etat.racine.name || 'la racine');
        const defaut = (typeof texteDateDuJour === 'function') ? texteDateDuJour() : new Date().toLocaleDateString('fr-FR');
        openSysPromptModal('Nouveau tableau dans votre Drive', 'Nom de la séance, dans « ' + ou + ' » :',
            defaut.charAt(0).toUpperCase() + defaut.slice(1), (nom) => {
            if (!nom) return;
            const propre = nomDeFichierSur(nom);
            avantDeQuitter(async () => {
                try {
                    const dossier = await dossierAu(parent);
                    const nomFichier = propre + EXTENSION;
                    let existe = false;
                    try { await dossier.getFileHandle(nomFichier); existe = true; } catch (e) { existe = false; }
                    if (existe) { dire('Un tableau « ' + propre + ' » existe déjà dans ce dossier : ouvrez-le, ou choisissez un autre nom'); return; }
                    const fichier = await dossier.getFileHandle(nomFichier, { create: true });
                    if (typeof clearBoardAndPagesDOrigine === 'function') clearBoardAndPagesDOrigine();
                    // Un tableau sans page n'enregistre rien : on s'en assure.
                    if (typeof pages !== 'undefined' && !pages.length && typeof initPages === 'function') initPages();
                    poserLeNom(propre);
                    lierA(fichier, dossier, parent.concat(nomFichier));
                    parent.forEach((_, i) => etat.ouverts.add(cle(parent.slice(0, i + 1))));
                    retenirLesOuverts();
                    await ecrire();
                    await rafraichir();
                } catch (e) { console.warn(e); dire('Impossible de créer ce tableau'); }
            });
        });
    }

    // ---------------------------------------------------------------------
    // RENOMMER, DÉPLACER, SUPPRIMER
    // ---------------------------------------------------------------------
    // Le navigateur ne sait pas renommer un fichier du disque : on copie, puis
    // l'on retire l'ancien. Un dossier, on le renomme dans l'explorateur.
    async function deplacerLeFichier(entree, dossierCible, cheminCible, nouveauNom) {
        const nomFichier = nouveauNom || entree.nom;
        let existe = false;
        try { await dossierCible.getFileHandle(nomFichier); existe = true; } catch (e) { existe = false; }
        if (existe) { dire('Un tableau « ' + sansExtension(nomFichier) + ' » est déjà là'); return false; }
        const source = await dossierAu(entree.chemin.slice(0, -1));
        const texte = await (await entree.handle.getFile()).text();
        const cible = await dossierCible.getFileHandle(nomFichier, { create: true });
        const flux = await cible.createWritable();
        await flux.write(texte);
        await flux.close();
        await source.removeEntry(entree.nom);
        if (estLeFichierLie(entree.chemin)) {
            etat.fichier = cible; etat.dossier = dossierCible;
            etat.chemin = cheminCible.concat(nomFichier);
            poserLeNom(sansExtension(nomFichier));
            if (typeof updateUnsavedIndicator === 'function') updateUnsavedIndicator();
        }
        return true;
    }

    function renommer(chemin) {
        const e = trouver(chemin);
        if (!e) return;
        if (e.kind === 'dossier') { dire('Renommez un dossier depuis l\'explorateur de fichiers : Drive le suit'); return; }
        openSysPromptModal('Renommer', 'Nouveau nom :', sansExtension(e.nom), async (nom) => {
            if (!nom) return;
            const propre = nomDeFichierSur(nom) + EXTENSION;
            if (propre === e.nom) return;
            try {
                const dossier = await dossierAu(chemin.slice(0, -1));
                if (await deplacerLeFichier(e, dossier, chemin.slice(0, -1), propre)) await rafraichir();
            } catch (err) { console.warn(err); dire('Impossible de renommer'); }
        });
    }

    async function deplacer(cheminSource, cheminDossierCible) {
        const e = trouver(cheminSource);
        if (!e) return;
        if (e.kind === 'dossier') { dire('Déplacez un dossier depuis l\'explorateur de fichiers'); return; }
        if (cle(cheminSource.slice(0, -1)) === cle(cheminDossierCible)) return;
        try {
            const cible = await dossierAu(cheminDossierCible);
            if (await deplacerLeFichier(e, cible, cheminDossierCible)) {
                etat.ouverts.add(cle(cheminDossierCible));
                retenirLesOuverts();
                await rafraichir();
                dire('« ' + sansExtension(e.nom) + ' » rangé dans « ' + (cheminDossierCible[cheminDossierCible.length - 1] || etat.racine.name) + ' »');
            }
        } catch (err) { console.warn(err); dire('Déplacement impossible'); }
    }

    function supprimer(chemin) {
        const e = trouver(chemin);
        if (!e) return;
        const dossier = e.kind === 'dossier';
        openConfirmModal(dossier ? 'Supprimer ce dossier ?' : 'Supprimer ce tableau ?',
            dossier ? 'Le dossier « ' + e.nom + ' » et tout ce qu\'il contient seront supprimés de votre Drive (Drive garde une corbeille 30 jours).'
                    : 'Le tableau « ' + sansExtension(e.nom) + ' » sera supprimé de votre Drive (Drive garde une corbeille 30 jours).',
            true, async () => {
                try {
                    const parent = await dossierAu(chemin.slice(0, -1));
                    if (estSousLeChemin(chemin)) delier();
                    await parent.removeEntry(e.nom, { recursive: dossier });
                    if (cle(etat.dossierChoisi.slice(0, chemin.length)) === cle(chemin)) etat.dossierChoisi = chemin.slice(0, -1);
                    await rafraichir();
                } catch (err) { console.warn(err); dire('Suppression impossible'); }
            });
    }

    // ---------------------------------------------------------------------
    // LE TIROIR : la source, le panneau, l'arbre
    // ---------------------------------------------------------------------
    function changerDeSource(source) {
        etat.source = (source === 'dossier') ? 'dossier' : 'ordi';
        try { localStorage.setItem(CLE_SOURCE, etat.source); } catch (e) { /* refusé */ }
        appliquerLaSource();
    }

    function appliquerLaSource() {
        const tiroir = el('right-drawer');
        if (!tiroir) return;
        const surLesTableaux = (typeof currentExplorerTab === 'undefined') || currentExplorerTab === 'tableaux';
        tiroir.classList.toggle('mode-dossier', etat.source === 'dossier' && surLesTableaux);
        const choix = el('source-tableaux');
        if (choix) {
            choix.hidden = !surLesTableaux;
            choix.querySelectorAll('.source-btn').forEach(b => b.classList.toggle('active', b.dataset.source === etat.source));
        }
        if (etat.source === 'dossier') rendre();
        if (typeof majBandeauDuRangement === 'function') majBandeauDuRangement();
    }

    function retenirLesOuverts() {
        try { localStorage.setItem(CLE_OUVERTS, JSON.stringify([...etat.ouverts])); } catch (e) { /* refusé */ }
    }

    function construire() {
        if (el('dossier-container')) return;
        const tiroir = el('right-drawer');
        const arbreLocal = el('file-tree-container');
        if (!tiroir || !arbreLocal) return;

        const choix = document.createElement('div');
        choix.id = 'source-tableaux';
        choix.className = 'source-tableaux';
        choix.innerHTML = '<button class="source-btn" data-source="ordi" title="Les tableaux rangés dans ce navigateur">Cet ordinateur</button>'
            + '<button class="source-btn" data-source="dossier" title="Un dossier de votre Drive : un dossier par classe, un tableau par séance">Mon Drive</button>';
        choix.addEventListener('click', (e) => {
            const b = e.target.closest('.source-btn');
            if (b) changerDeSource(b.dataset.source);
        });
        const lot = el('exp-lot');
        tiroir.insertBefore(choix, lot || arbreLocal);

        const boite = document.createElement('div');
        boite.id = 'dossier-container';
        boite.className = 'dossier-container';
        tiroir.insertBefore(boite, arbreLocal);
        boite.addEventListener('dragover', (e) => { if (etat.glisse) { e.preventDefault(); } });
        boite.addEventListener('drop', (e) => {
            if (!etat.glisse) return;
            e.preventDefault();
            const source = JSON.parse(etat.glisse); etat.glisse = null;
            if (e.target.closest('.dossier-ligne')) return;   // une ligne a déjà pris le dépôt
            deplacer(source, []);
        });
    }

    function rendre() {
        construire();
        const boite = el('dossier-container');
        if (!boite) return;
        boite.textContent = '';
        if (!disponible()) {
            boite.appendChild(message('Ce navigateur ne sait pas ouvrir un dossier du disque. Utilisez Chrome ou Edge pour vos tableaux dans le Drive.'));
            return;
        }
        if (!etat.racine) {
            boite.appendChild(message('Désignez le dossier de votre Drive où vivront vos tableaux — par exemple « G:\\Mon Drive\\Au Tableau ». Un dossier par classe, un tableau par séance.'));
            boite.appendChild(bouton('Choisir le dossier de mon Drive', choisirLeDossier, 'primary'));
            return;
        }
        if (etat.droit !== 'granted') {
            boite.appendChild(message('Le navigateur demande l\'autorisation de rouvrir « ' + (etat.racine.name || 'votre dossier') + ' ».'));
            boite.appendChild(bouton('Rouvrir « ' + (etat.racine.name || 'le dossier') + ' »', rouvrir, 'primary'));
            boite.appendChild(bouton('Choisir un autre dossier', choisirLeDossier, 'secondary'));
            return;
        }

        const entete = document.createElement('div');
        entete.className = 'dossier-entete';
        const nom = document.createElement('span');
        nom.className = 'dossier-nom' + (etat.dossierChoisi.length ? '' : ' selected');
        nom.title = 'La racine de vos tableaux — cliquez pour y créer';
        nom.innerHTML = (typeof TREE_ICON_FOLDER !== 'undefined' ? '<span class="icon">' + TREE_ICON_FOLDER + '</span>' : '')
            + '<span class="label">' + echapper(etat.racine.name || 'Mon Drive') + '</span>';
        nom.onclick = () => { etat.dossierChoisi = []; rendre(); };
        entete.appendChild(nom);
        const actions = document.createElement('div');
        actions.className = 'rd-btn-group';
        actions.appendChild(petitBouton('↻', 'Relire le dossier', rafraichir));
        actions.appendChild(petitBouton('…', 'Changer de dossier, ou revenir aux tableaux de cet ordinateur', () => {
            openConfirmModal('Le dossier de vos tableaux', 'Choisir un autre dossier de votre Drive ? (« Annuler » garde celui-ci.)', false, choisirLeDossier);
        }));
        entete.appendChild(actions);
        boite.appendChild(entete);

        const arbre = document.createElement('div');
        arbre.className = 'dossier-arbre';
        boite.appendChild(arbre);
        if (!etat.arbre) { arbre.appendChild(message('Lecture du dossier…')); return; }
        if (!etat.arbre.length) {
            arbre.appendChild(message('Ce dossier est vide. Créez un dossier par classe (bouton « Nouveau dossier » en haut), puis un tableau par séance.'));
            return;
        }
        etat.arbre.forEach(e => rendreEntree(arbre, e, 0));
    }

    function message(texte) {
        const p = document.createElement('p');
        p.className = 'dossier-message';
        p.textContent = texte;
        return p;
    }
    function bouton(texte, action, style) {
        const b = document.createElement('button');
        b.className = 'btn-action ' + (style || 'secondary') + ' dossier-bouton';
        b.textContent = texte;
        b.onclick = action;
        return b;
    }
    function petitBouton(texte, titre, action) {
        const b = document.createElement('button');
        b.className = 'rd-btn';
        b.title = titre;
        b.setAttribute('data-tooltip', titre);
        b.textContent = texte;
        b.onclick = (e) => { e.stopPropagation(); action(); };
        return b;
    }

    function rendreEntree(conteneur, e, niveau) {
        const ligne = document.createElement('div');
        ligne.className = 'tree-item dossier-ligne dossier-' + e.kind;
        ligne.dataset.chemin = cle(e.chemin);
        ligne.style.paddingLeft = (8 + niveau * 16) + 'px';
        ligne.tabIndex = 0;
        const estLie = e.kind === 'fichier' && estLeFichierLie(e.chemin);
        const estChoisi = e.kind === 'dossier' && cle(etat.dossierChoisi) === cle(e.chemin);
        if (estLie || estChoisi) ligne.classList.add('selected');
        const ouvert = e.kind === 'dossier' && etat.ouverts.has(cle(e.chemin));

        if (e.kind === 'dossier') {
            const combien = (e.enfants || []).filter(x => x.kind === 'fichier').length;
            ligne.innerHTML = '<div class="folder-toggle' + (ouvert ? ' open' : '') + '">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></div>'
                + '<span class="icon">' + (typeof TREE_ICON_FOLDER !== 'undefined' ? TREE_ICON_FOLDER : '📁') + '</span>'
                + '<span class="label" style="font-weight:600;">' + echapper(e.nom) + '</span>'
                + (combien ? '<span class="dossier-compte" title="' + combien + ' tableau' + (combien > 1 ? 'x' : '') + '">' + combien + '</span>' : '')
                + '<div class="tree-item-actions">'
                + '<button class="tree-action-btn" data-action="dossier" title="Nouveau dossier ici">' + (typeof ICONE_DOSSIER_PLUS !== 'undefined' ? ICONE_DOSSIER_PLUS : '+') + '</button>'
                + '<button class="tree-action-btn" data-action="tableau" title="Nouveau tableau ici">' + (typeof ICONE_FICHIER_PLUS !== 'undefined' ? ICONE_FICHIER_PLUS : '+') + '</button>'
                + '<button class="tree-action-btn danger" data-action="supprimer" title="Supprimer" style="padding:4px 6px; font-size:12px;">🗑</button>'
                + '</div>';
            ligne.onclick = (ev) => {
                const b = ev.target.closest('.tree-action-btn');
                if (b) {
                    ev.stopPropagation();
                    if (b.dataset.action === 'dossier') creerDossier(e.chemin);
                    else if (b.dataset.action === 'tableau') creerTableau(e.chemin);
                    else if (b.dataset.action === 'supprimer') supprimer(e.chemin);
                    return;
                }
                if (ev.target.closest('.folder-toggle')) {
                    if (etat.ouverts.has(cle(e.chemin))) etat.ouverts.delete(cle(e.chemin)); else etat.ouverts.add(cle(e.chemin));
                    retenirLesOuverts();
                } else {
                    etat.dossierChoisi = e.chemin.slice();
                    etat.ouverts.add(cle(e.chemin));
                    retenirLesOuverts();
                }
                rendre();
            };
            // On dépose un tableau sur un dossier : il y va.
            ligne.addEventListener('dragover', (ev) => { if (etat.glisse) { ev.preventDefault(); ev.stopPropagation(); ligne.classList.add('drag-over'); } });
            ligne.addEventListener('dragleave', () => ligne.classList.remove('drag-over'));
            ligne.addEventListener('drop', (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                ligne.classList.remove('drag-over');
                if (!etat.glisse) return;
                const source = JSON.parse(etat.glisse); etat.glisse = null;
                deplacer(source, e.chemin);
            });
            conteneur.appendChild(ligne);
            if (ouvert && e.enfants) e.enfants.forEach(x => rendreEntree(conteneur, x, niveau + 1));
            return;
        }

        const quand = e.date ? new Date(e.date) : null;
        ligne.title = sansExtension(e.nom) + (quand ? ' — modifié le ' + quand.toLocaleDateString('fr-FR') + ' à '
            + quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '') + (estLie ? ' — ouvert' : '');
        ligne.innerHTML = '<span class="icon" style="margin-left: 20px;">' + (typeof TREE_ICON_TABLEAU !== 'undefined' ? TREE_ICON_TABLEAU : '📄') + '</span>'
            + '<span class="label">' + echapper(sansExtension(e.nom)) + '</span>'
            + (estLie ? '<span class="dossier-ouvert" title="C\'est le tableau ouvert : il s\'enregistre ici tout seul">●</span>' : '')
            + '<div class="tree-item-actions">'
            + '<button class="tree-action-btn" data-action="ouvrir" title="Ouvrir" style="padding:4px 6px; font-size:12px;">⏎</button>'
            + '<button class="tree-action-btn" data-action="renommer" title="Renommer" style="padding:4px 6px; font-size:12px;">✎</button>'
            + '<button class="tree-action-btn danger" data-action="supprimer" title="Supprimer" style="padding:4px 6px; font-size:12px;">🗑</button>'
            + '</div>';
        ligne.draggable = true;
        ligne.addEventListener('dragstart', (ev) => {
            etat.glisse = cle(e.chemin);
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', sansExtension(e.nom)); } catch (err) { /* rien */ }
        });
        ligne.addEventListener('dragend', () => { etat.glisse = null; });
        ligne.onclick = (ev) => {
            const b = ev.target.closest('.tree-action-btn');
            if (!b) return;
            ev.stopPropagation();
            if (b.dataset.action === 'ouvrir') ouvrir(e.chemin);
            else if (b.dataset.action === 'renommer') renommer(e.chemin);
            else if (b.dataset.action === 'supprimer') supprimer(e.chemin);
        };
        ligne.ondblclick = (ev) => { ev.preventDefault(); ouvrir(e.chemin); };
        ligne.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ouvrir(e.chemin); } });
        conteneur.appendChild(ligne);
    }

    function rendreLigne(e) {
        const boite = el('dossier-container');
        const ligne = boite && boite.querySelector('.dossier-ligne[data-chemin="' + CSS.escape(cle(e.chemin)) + '"]');
        if (!ligne) return;
        const quand = e.date ? new Date(e.date) : null;
        ligne.title = sansExtension(e.nom) + (quand ? ' — modifié le ' + quand.toLocaleDateString('fr-FR') + ' à '
            + quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
    }

    // ---------------------------------------------------------------------
    // LE BANDEAU « VOUS TRAVAILLEZ SUR » : une ligne de plus, et le bouton
    // ---------------------------------------------------------------------
    function ligneDuBandeau() {
        if (!etat.racine) return null;
        if (lie()) {
            const ou = etat.chemin.slice(0, -1).join(' › ');
            const quand = etat.derniereEcriture ? ilYACombien(etat.derniereEcriture) : null;
            return {
                etat: etat.enCours ? 'encours' : (etat.aEcrire ? 'attente' : 'bon'),
                texte: etat.enCours ? 'Enregistrement dans votre Drive…'
                    : 'Dans votre Drive' + (ou ? ' (' + ou + ')' : '') + (quand ? ', ' + quand : '')
                      + (etat.aEcrire ? ' — des changements suivront' : '')
            };
        }
        return { etat: 'attente', texte: 'Pas dans votre Drive' };
    }

    function completerLeBandeau() {
        const liste = el('ouje-lignes');
        const l = ligneDuBandeau();
        if (liste && l) {
            const li = document.createElement('li');
            li.className = 'ouje-ligne ouje-' + l.etat;
            li.textContent = l.texte;
            liste.appendChild(li);
        }
        const ranger = el('ouje-ranger');
        if (ranger) {
            if (lie()) ranger.textContent = 'Enregistrer dans votre Drive';
            else if (actif()) ranger.textContent = 'Enregistrer dans votre Drive…';
        }
    }

    // ---------------------------------------------------------------------
    // LES ACCROCHES DANS L'APPLICATION
    // ---------------------------------------------------------------------
    // Les fonctions de script.js sont déclarées au niveau global : on garde
    // l'originale, et l'on pose la nôtre à sa place. Les appels internes de
    // script.js passent par le nom global, donc par la nôtre.
    let saveCurrentBoardDOrigine = null;
    let clearBoardAndPagesDOrigine = null;

    function envelopper(nom, fabrique) {
        const origine = window[nom];
        if (typeof origine !== 'function') return null;
        window[nom] = fabrique(origine);
        return origine;
    }

    // Le tableau qui s'enregistre porte le chemin de son fichier : la session
    // reprise au démarrage sait ainsi d'où elle vient.
    envelopper('stateForStorage', (origine) => function () {
        const s = origine.apply(this, arguments);
        if (s && typeof s === 'object') {
            if (lie()) s.dossierLien = { chemin: etat.chemin.slice(), nom: nomCourant(), enregistreLe: Date.now() };
            else delete s.dossierLien;
        }
        return s;
    });

    // Le disque local est écrit : le Drive suivra.
    envelopper('writeAppLocal', (origine) => function () {
        const p = origine.apply(this, arguments);
        if (p && typeof p.then === 'function') p.then(() => signalerUnChangement(), () => signalerUnChangement());
        else signalerUnChangement();
        return p;
    });

    // Un autre tableau prend l'écran : le lien ne le suit pas — sauf la
    // session reprise au démarrage, qui revient AVEC son lien.
    envelopper('restoreState', (origine) => function (stateData) {
        const r = origine.apply(this, arguments);
        if (!etat.ouvertureParMoi) {
            let s = stateData;
            if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = null; } }
            const premier = !etat.aDejaRestaure;
            etat.aDejaRestaure = true;
            const lien = s && s.dossierLien;
            if (premier && lien && lien.chemin) {
                delierSansRendre();
                etat.lienAttendu = lien;
                if (pret()) relier(lien); else if (etat.racine) proposerDeReprendre();
            } else {
                delier();
            }
        }
        return r;
    });
    function delierSansRendre() {
        if (etat.minuteur) { clearTimeout(etat.minuteur); etat.minuteur = null; }
        etat.fichier = null; etat.dossier = null; etat.chemin = []; etat.aEcrire = false;
    }

    // Ouvrir un tableau de « Mes tableaux » : on écrit d'abord ce qui est lié.
    envelopper('loadBoard', (origine) => function () {
        etat.aDejaRestaure = true;
        quitterLeTableauLie();
        return origine.apply(this, arguments);
    });

    // « Nouveau document » : même chose.
    clearBoardAndPagesDOrigine = envelopper('clearBoardAndPages', (origine) => function () {
        etat.aDejaRestaure = true;
        quitterLeTableauLie();
        return origine.apply(this, arguments);
    });

    // Enregistrer : un tableau lié s'écrit dans son fichier ; en mode Drive,
    // un tableau qui ne l'est pas encore y entre sous un nom. Les
    // enregistrements discrets — ceux que l'application fait pour elle-même,
    // avant de refaire une séance par exemple — gardent leur chemin d'origine.
    saveCurrentBoardDOrigine = envelopper('saveCurrentBoard', (origine) => function (discret) {
        if (!discret && (lie() || actif())) return enregistrer(false);
        const r = origine.apply(this, arguments);
        if (discret && lie()) ecrire();
        return r;
    });

    // Les deux « Nouveau » du tiroir, en mode Drive, créent dans le Drive.
    envelopper('createNewFolder', (origine) => function () {
        if (actif()) return creerDossier();
        return origine.apply(this, arguments);
    });
    envelopper('createNewFile', (origine) => function () {
        if (actif()) return creerTableau();
        return origine.apply(this, arguments);
    });

    // Le bandeau du tiroir dit aussi où en est le Drive.
    envelopper('majBandeauDuRangement', (origine) => function () {
        const r = origine.apply(this, arguments);
        completerLeBandeau();
        return r;
    });

    // L'onglet change : notre panneau ne se montre que sur « Tableaux ».
    envelopper('switchDrawerTab', (origine) => function () {
        const r = origine.apply(this, arguments);
        appliquerLaSource();
        return r;
    });

    // Un fichier importé « à la main » n'est pas un tableau du Drive.
    document.addEventListener('DOMContentLoaded', () => {
        const entree = el('file-loader');
        if (entree) entree.addEventListener('change', () => { etat.aDejaRestaure = true; if (lie()) delier(); });

        // Le titre du tableau, c'est le nom de son fichier : changer l'un
        // renomme l'autre. Sinon le tiroir aurait montré un nom, et le tableau
        // un autre.
        const titre = el('project-name-input');
        if (titre) titre.addEventListener('change', async () => {
            if (!lie()) return;
            const voulu = nomDeFichierSur(titre.value) + EXTENSION;
            const chemin = etat.chemin.slice();
            if (voulu === chemin[chemin.length - 1]) return;
            const e = trouver(chemin);
            if (!e) return;
            try {
                const dossier = await dossierAu(chemin.slice(0, -1));
                if (await deplacerLeFichier(e, dossier, chemin.slice(0, -1), voulu)) await rafraichir();
            } catch (err) { console.warn(err); dire('Le fichier du Drive n\'a pas pu être renommé'); }
        });
    });

    // On quitte l'onglet : ce qui attend s'écrit, sans attendre la période —
    // y compris le geste d'il y a une seconde, que le disque local n'a pas
    // encore pris.
    function resteAEcrire() {
        return lie() && (etat.aEcrire
            || (typeof autoSaveTimer !== 'undefined' && !!autoSaveTimer)
            || (typeof hasUnsavedChanges !== 'undefined' && hasUnsavedChanges));
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && resteAEcrire()) ecrire();
    });
    window.addEventListener('pagehide', () => { if (resteAEcrire()) ecrire(); });

    document.addEventListener('DOMContentLoaded', () => {
        construire();
        appliquerLaSource();
        reprendre();
    });

    window.MonDossier = {
        etat,
        disponible, pret, actif, lie,
        choisirLeDossier, adopterLeDossier, oublierLeDossier, rouvrir, rafraichir,
        ouvrir, enregistrer, ecrire, creerDossier, creerTableau, renommer, deplacer, supprimer,
        changerDeSource, delier, signalerUnChangement, ligneDuBandeau,
        chemin: () => etat.chemin.slice()
    };
})();
