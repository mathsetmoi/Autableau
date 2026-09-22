// ============================================================
// PUBLIER UNE SÉANCE POUR LE CAHIER DE TEXTES
// ============================================================
// « Je voudrais pouvoir insérer un tableau dans le cahier de texte Pronote…
// que le fichier déposé soit relisable en appuyant sur play pour les élèves
// et les parents. Les élèves pourraient se refaire la séance. »
//
// Pronote n'ouvre pas ses portes aux programmes : ce qu'on y met, on l'y met
// à la main. Ce qu'on peut faire, c'est n'avoir qu'UNE chose à y mettre —
// un lien — et que ce lien rejoue la séance.
//
// Le chemin est celui du Drive, déjà en place : un dossier « Séances
// publiées » partagé une fois pour toutes « à tout utilisateur disposant du
// lien ». Le bouton y écrit la séance ; Drive Desktop l'envoie tout seul ;
// le lien désigne le fichier par son nom, et le lecteur va le chercher avec
// une clé d'API Google — sans compte, sans connexion, sur un téléphone.
//
// CE QUI PART EST PUBLIC. C'est le prix du lien qui s'ouvre sans compte : on
// le dit avant la première publication, et le nom de la classe ne figure que
// si l'on veut.
// ============================================================
(function () {
    'use strict';

    const DOSSIER = 'Séances publiées';
    const CLE_REGLAGES = 'AuTableau_publication';
    const CLE_DOSSIER = 'AuTableau_publication_dossier';   // localforage : la poignée du dossier
    const CLE_PREVENU = 'AuTableau_publication_prevenu';

    const el = (id) => document.getElementById(id);
    const dire = (m) => { if (typeof showToast === 'function') showToast(m); };
    const config = () => window.AUTABLEAU_PUBLICATION || {};

    // Les réglages : ceux du site d'abord (config.js), ceux de ce navigateur
    // ensuite. Un collègue qui installe sa copie n'a rien à saisir ; celui
    // qui se sert de la mienne met les siens, et ils restent chez lui.
    const reglages = { dossier: '', cle: '', adresse: '' };
    function chargerLesReglages() {
        const c = config();
        reglages.dossier = c.dossier || '';
        reglages.cle = c.cle || '';
        reglages.adresse = c.adresse || '';
        try {
            const m = JSON.parse(localStorage.getItem(CLE_REGLAGES) || 'null');
            if (m) {
                if (m.dossier) reglages.dossier = m.dossier;
                if (m.cle) reglages.cle = m.cle;
                if (m.adresse) reglages.adresse = m.adresse;
            }
        } catch (e) { /* stockage refusé */ }
    }
    function retenirLesReglages() {
        try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages)); } catch (e) { /* refusé */ }
    }
    chargerLesReglages();

    const regle = () => !!(reglages.dossier && reglages.cle);

    // L'adresse du lecteur. Sur GitHub Pages, c'est le dossier du site ;
    // ouverte depuis un fichier, la page n'a pas d'adresse publique et il
    // faut la donner une fois dans les réglages.
    function adresseDuSite() {
        if (reglages.adresse) return reglages.adresse.replace(/\/+$/, '');
        if (location.protocol === 'file:') return '';
        return location.origin + location.pathname.replace(/\/[^/]*$/, '');
    }

    // ---------------------------------------------------------------------
    // LE NOM DU FICHIER
    // ---------------------------------------------------------------------
    // Il voyage dans une adresse : pas d'accents, pas d'espaces, rien qui se
    // transforme en chemin. Il reste lisible — « 2026-09-22-1ere-3-suites » —
    // pour qu'on retrouve la séance dans le dossier du Drive d'un coup d'œil.
    function sansAccents(t) {
        return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    function morceau(t) {
        return sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function nomPublic(date, classe, titre) {
        const bouts = [String(date || '').slice(0, 10), morceau(classe), morceau(titre)].filter(Boolean);
        return (bouts.join('-').slice(0, 90).replace(/-+$/, '')) || ('seance-' + Date.now());
    }
    function lienDe(nom) {
        const base = adresseDuSite();
        const q = ['f=' + encodeURIComponent(nom)];
        // Le lien porte le dossier et la clé seulement si le site ne les
        // connaît pas : sinon il double de longueur pour rien.
        const c = config();
        if (!c.dossier && reglages.dossier) q.push('d=' + encodeURIComponent(reglages.dossier));
        if (!c.cle && reglages.cle) q.push('k=' + encodeURIComponent(reglages.cle));
        return (base || '…') + '/lecteur.html?' + q.join('&');
    }

    function dateDuJour() {
        const d = new Date();
        const deuxChiffres = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + deuxChiffres(d.getMonth() + 1) + '-' + deuxChiffres(d.getDate());
    }
    function dateLisible(iso) {
        const d = new Date(String(iso) + 'T12:00:00');
        if (isNaN(d.getTime())) return String(iso || '');
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    const poids = (n) => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo'
        : n > 1024 ? Math.round(n / 1024) + ' Ko' : n + ' o';

    // ---------------------------------------------------------------------
    // CE QU'ON PUBLIE
    // ---------------------------------------------------------------------
    // Le tableau tel qu'il s'enregistre, avec son film — c'est lui qui se
    // rejoue. « Sans les documents » enlève les photos et les PDF posés : le
    // fichier fond, mais la séance se rejoue sur un tableau troué. À ne
    // prendre que si le Drive peine.
    function contenuAPublier(meta, avecLesDocuments) {
        const tableau = MonDossier.contenuDuTableau();
        const data = JSON.parse(JSON.stringify(tableau.data));
        if (!avecLesDocuments) {
            data.assets = {};
            (data.pages || []).forEach(p => { p.images = []; });
        }
        return { id: 'seance_' + Date.now(), name: meta.titre, format: 'au-tableau', enregistreLe: Date.now(),
                 seance: { titre: meta.titre, classe: meta.classe, date: meta.date, publieLe: Date.now(), version: 1 },
                 data };
    }

    // ---------------------------------------------------------------------
    // OÙ L'ON PUBLIE : UN DOSSIER, TOUJOURS LE MÊME
    // ---------------------------------------------------------------------
    // Le lien désigne un fichier dans UN dossier partagé : ce dossier ne peut
    // donc pas changer d'une séance à l'autre. Or les emplacements du tiroir
    // changent tout le temps — un par classe, parfois un par élève. On
    // désigne donc le dossier de publication une fois pour toutes, et il ne
    // bouge plus ; à défaut, on retombe sur « Séances publiées » à la racine
    // de l'emplacement ouvert, ce qui suffit à qui n'en a qu'un.
    const dossierChoisi = { handle: null, nom: '' };

    async function chargerLeDossier() {
        try {
            const m = await localforage.getItem(CLE_DOSSIER);
            if (m && m.handle) { dossierChoisi.handle = m.handle; dossierChoisi.nom = m.nom || m.handle.name || ''; }
        } catch (e) { /* stockage refusé */ }
        return dossierChoisi;
    }

    async function retenirLeDossier() {
        try { await localforage.setItem(CLE_DOSSIER, { handle: dossierChoisi.handle, nom: dossierChoisi.nom }); }
        catch (e) { /* stockage refusé */ }
    }

    // Le droit d'écrire ne traverse pas les sessions : le navigateur le
    // redemande, et seulement sur un geste — c'est le clic qui publie.
    async function droitSurLeDossier(demander) {
        const h = dossierChoisi.handle;
        if (!h) return 'aucun';
        try {
            let d = await h.queryPermission({ mode: 'readwrite' });
            if (d !== 'granted' && demander) d = await h.requestPermission({ mode: 'readwrite' });
            return d;
        } catch (e) { return 'denied'; }
    }

    async function choisirLeDossier() {
        if (typeof window.showDirectoryPicker !== 'function') {
            dire('Ce navigateur ne sait pas ouvrir un dossier du disque : utilisez Chrome ou Edge');
            return null;
        }
        try {
            const h = await window.showDirectoryPicker({ id: 'autableau-publication', mode: 'readwrite' });
            dossierChoisi.handle = h;
            dossierChoisi.nom = h.name;
            await retenirLeDossier();
            rendre();
            dire('Les séances publiées iront dans « ' + h.name + ' »');
            return h;
        } catch (e) { return null; }   // fenêtre fermée : rien à dire
    }

    async function oublierLeDossier() {
        dossierChoisi.handle = null; dossierChoisi.nom = '';
        try { await localforage.removeItem(CLE_DOSSIER); } catch (e) { /* refusé */ }
        rendre();
    }

    // Avec « creer », on s'apprête à écrire : c'est le moment de demander le
    // droit. Sans lui, on ne fait que regarder ce qui est déjà publié.
    async function dossierDesSeances(creer) {
        if (dossierChoisi.handle) {
            const d = await droitSurLeDossier(!!creer);
            if (d !== 'granted') return null;
            return dossierChoisi.handle;
        }
        if (!window.MonDossier || !MonDossier.pret()) return null;
        const racine = MonDossier.racine();
        if (!racine) return null;
        try { return await racine.getDirectoryHandle(DOSSIER, { create: !!creer }); }
        catch (e) { return null; }
    }

    // Y a-t-il de quoi écrire quelque part ?
    const ouEcrire = () => !!dossierChoisi.handle || !!(window.MonDossier && MonDossier.pret());

    // ---------------------------------------------------------------------
    // LA FENÊTRE
    // ---------------------------------------------------------------------
    const ui = { fenetre: null, onglet: 'publier', classes: [], resultat: null, publiees: null, occupe: false };
    const q = (sel) => ui.fenetre ? ui.fenetre.querySelector(sel) : null;

    function h(tag, attrs, ...enfants) {
        const e = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === 'class') e.className = v;
            else if (k === 'style') e.style.cssText = v;
            else if (k.startsWith('on')) e[k] = v;
            else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
        });
        enfants.flat().forEach(c => { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return e;
    }
    const bouton = (texte, action, classe) => h('button', { class: 'pw-btn' + (classe ? ' ' + classe : ''), type: 'button', onclick: action }, texte);
    const champ = (libelle, entree, aide) => h('label', { class: 'pw-champ' }, h('label', {}, libelle), entree,
        aide ? h('small', { class: 'pub-aide' }, aide) : null);

    function construire() {
        if (ui.fenetre) return;
        const f = document.createElement('div');
        f.id = 'pub-fenetre';
        f.className = 'pw';
        f.style.cssText = 'top:6vh; left:max(12px, calc(50% - 380px)); width:min(760px, calc(100vw - 24px)); max-height:86vh; display:none;';
        f.innerHTML = '<div class="pw-entete" id="pub-poignee">'
            + '<span class="pw-titre">Publier pour le cahier de textes</span>'
            + '<span class="pw-espace"></span>'
            + '<button class="pw-icone fermer" id="pub-fermer" title="Fermer">✕</button></div>'
            + '<div class="pw-corps"><div class="pw-rail">'
            + '<div class="pw-rail-titre">Séance</div>'
            + '<button class="pw-rail-item" data-onglet="publier">Publier celle-ci</button>'
            + '<button class="pw-rail-item" data-onglet="liste">Déjà publiées</button>'
            + '<div class="pw-rail-titre" style="margin-top:14px">Installation</div>'
            + '<button class="pw-rail-item" data-onglet="reglages">Le dossier et la clé</button>'
            + '</div><div class="pw-panneau" id="pub-panneau"></div></div>';
        document.body.appendChild(f);
        ui.fenetre = f;

        const poignee = f.querySelector('#pub-poignee');
        let glisse = null;
        poignee.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            glisse = { x: e.clientX - f.offsetLeft, y: e.clientY - f.offsetTop };
            try { poignee.setPointerCapture(e.pointerId); } catch (err) { /* refusé */ }
        });
        poignee.addEventListener('pointermove', (e) => { if (glisse) { f.style.left = (e.clientX - glisse.x) + 'px'; f.style.top = (e.clientY - glisse.y) + 'px'; } });
        const lacher = () => { glisse = null; };
        poignee.addEventListener('pointerup', lacher); poignee.addEventListener('pointercancel', lacher);

        f.querySelector('#pub-fermer').onclick = fermer;
        f.querySelectorAll('.pw-rail-item[data-onglet]').forEach(b => b.onclick = () => { ui.onglet = b.dataset.onglet; rendre(); });
    }

    async function ouvrir(onglet) {
        construire();
        chargerLesReglages();
        await chargerLeDossier();
        try { ui.classes = (await ClassesStore.loadAll()).filter(c => !c.archivee); } catch (e) { ui.classes = []; }
        ui.onglet = onglet || (regle() ? 'publier' : 'reglages');
        ui.resultat = null;
        ui.fenetre.style.display = 'flex';
        if (typeof ramenerFenetreDansLecran === 'function') ramenerFenetreDansLecran(ui.fenetre);
        rendre();
    }
    function fermer() { if (ui.fenetre) ui.fenetre.style.display = 'none'; }

    function rendre() {
        if (!ui.fenetre || ui.fenetre.style.display === 'none') return;
        ui.fenetre.querySelectorAll('.pw-rail-item[data-onglet]').forEach(b => b.classList.toggle('actif', b.dataset.onglet === ui.onglet));
        const p = q('#pub-panneau');
        p.textContent = '';
        if (ui.onglet === 'reglages') rendreReglages(p);
        else if (ui.onglet === 'liste') rendreListe(p);
        else rendrePublier(p);
    }

    // ---------------------------------------------------------------------
    // ONGLET « PUBLIER CELLE-CI »
    // ---------------------------------------------------------------------
    function rendrePublier(p) {
        if (!ouEcrire()) {
            p.appendChild(h('div', { class: 'pw-bloc' },
                h("div", { class: "pw-bloc-titre" }, "Où publier ?"),
                h("p", { class: "pub-texte" }, "Désignez le dossier partagé de votre Drive, celui que les élèves liront. "
                    + "C’est à faire une seule fois."),
                h('div', { class: 'pw-rangee' }, bouton('Choisir le dossier…', choisirLeDossier, 'primaire'))));
            return;
        }
        if (!regle()) {
            p.appendChild(h('div', { class: 'pw-bloc' },
                h('div', { class: 'pw-bloc-titre' }, 'Encore une installation à faire, une seule fois'),
                h('p', { class: 'pub-texte' }, 'Pour qu\'un lien s\'ouvre chez un élève sans compte Google, il faut un dossier partagé et une clé d\'API.'),
                h('div', { class: 'pw-rangee' }, bouton('Me guider', () => { ui.onglet = 'reglages'; rendre(); }, 'primaire'))));
            return;
        }

        const cdm = (typeof classeDuMoment === 'function') ? classeDuMoment(ui.classes) : null;
        const classeDefaut = ui.classes.find(c => c.id === cdm);
        const titreDefaut = (window.MonDossier && MonDossier.nomCourant()) || 'Séance';

        const titre = h('input', { type: 'text', class: 'pw-champ-texte', id: 'pub-titre', value: titreDefaut, placeholder: 'Titre de la séance' });
        const classe = h('select', { class: 'pw-select', id: 'pub-classe' },
            h('option', { value: '' }, 'Aucune classe'),
            ui.classes.map(c => h('option', { value: c.nom, selected: classeDefaut && c.id === classeDefaut.id }, c.nom)));
        const date = h('input', { type: 'date', class: 'pw-champ-texte', id: 'pub-date', value: dateDuJour() });
        const docs = h('input', { type: 'checkbox', id: 'pub-docs', checked: true });

        const majNom = () => {
            const n = nomPublic(date.value, classe.value, titre.value);
            const apercu = q('#pub-apercu-lien');
            if (apercu) apercu.textContent = lienDe(n);
        };
        [titre, classe, date].forEach(e => e.addEventListener('input', majNom));

        p.appendChild(h('div', { class: 'pw-bloc' },
            h('div', { class: 'pw-bloc-titre' }, 'Ce que verront les élèves'),
            h('div', { class: 'pw-rangee' }, champ('Titre', titre), champ('Classe', classe), champ('Date', date)),
            h('label', { class: 'pw-bascule' }, docs,
                h('span', {}, h('b', {}, 'Avec les documents posés sur le tableau'),
                    h('small', {}, 'Photos, PDF, captures. Sans eux le fichier est beaucoup plus léger, mais la séance se rejoue avec des trous.'))),
            h('p', { class: 'pub-lien-apercu' }, h('span', { id: 'pub-apercu-lien' }, lienDe(nomPublic(dateDuJour(), classe.value, titreDefaut))))));

        const zone = h('div', { class: 'pw-bloc', id: 'pub-resultat' });
        p.appendChild(zone);

        const lancer = bouton('Publier la séance', async () => {
            if (ui.occupe) return;
            const meta = { titre: (titre.value || '').trim() || 'Séance', classe: classe.value, date: date.value || dateDuJour() };
            await publier(meta, docs.checked, zone);
        }, 'primaire');
        p.appendChild(h('div', { class: 'pw-pied' }, h('span', { class: 'pw-espace' }),
            bouton('Fermer', fermer), lancer));

        if (ui.resultat) montrerLeResultat(zone, ui.resultat);
    }

    // L'avertissement, une seule fois : ce qui part est lisible par qui a le
    // lien, et un lien se recopie.
    function prevenirSiBesoin() {
        return new Promise((ok) => {
            let vu = false;
            try { vu = localStorage.getItem(CLE_PREVENU) === 'oui'; } catch (e) { vu = false; }
            if (vu || typeof openConfirmModal !== 'function') { ok(true); return; }
            openConfirmModal('Ce qui est publié est public',
                'Le lien s\'ouvre sans compte : qui l\'a peut voir la séance, et le transmettre. '
                + 'Ne publiez pas un tableau où figurent des noms d\'élèves (plan de classe, tirage au sort, copies).',
                false,
                () => { try { localStorage.setItem(CLE_PREVENU, 'oui'); } catch (e) { /* refusé */ } ok(true); },
                () => ok(false));
        });
    }

    async function publier(meta, avecLesDocuments, zone) {
        if (!(await prevenirSiBesoin())) return null;
        ui.occupe = true;
        zone.textContent = '';
        zone.appendChild(h('p', { class: 'pub-texte' }, 'Écriture dans votre Drive…'));
        try {
            const dossier = await dossierDesSeances(true);
            if (!dossier) throw new Error('Le dossier « ' + DOSSIER + ' » n\'a pas pu être créé dans votre Drive');
            const nom = nomPublic(meta.date, meta.classe, meta.titre);
            const contenu = contenuAPublier(meta, avecLesDocuments);
            const texte = JSON.stringify(contenu);
            const fichier = await dossier.getFileHandle(nom + '.prof', { create: true });
            const flux = await fichier.createWritable();
            await flux.write(texte);
            await flux.close();
            ui.resultat = { nom, lien: lienDe(nom), meta, taille: texte.length, quand: Date.now(), enLigne: null };
            ui.publiees = null;
            montrerLeResultat(zone, ui.resultat);
            dire('Séance écrite dans « ' + DOSSIER + ' » — le Drive l\'envoie');
            return ui.resultat;
        } catch (e) {
            console.warn('Publication impossible :', e);
            zone.textContent = '';
            zone.appendChild(h('p', { class: 'pub-erreur' }, 'Publication impossible : ' + (e.message || e)));
            return null;
        } finally { ui.occupe = false; }
    }

    // Le résumé à coller dans le champ « Contenu » de la séance Pronote.
    function resume(meta, lien) {
        const lignes = [];
        lignes.push(meta.titre + (meta.classe ? ' — ' + meta.classe : ''));
        lignes.push('Séance du ' + dateLisible(meta.date) + '.');
        const autos = automatismesDuJour(meta);
        if (autos) lignes.push('Automatismes : ' + autos + '.');
        lignes.push('');
        lignes.push('Revoir la séance au tableau (appuyez sur ▶) : ' + lien);
        return lignes.join('\n');
    }

    // Ce que le journal des automatismes a noté ce jour-là pour cette classe :
    // c'est la partie du contenu qu'on retape le plus souvent.
    function automatismesDuJour(meta) {
        try {
            const d = window.Automatismes && Automatismes.donnees && Automatismes.donnees();
            if (!d || !Array.isArray(d.journal)) return '';
            const jour = String(meta.date);
            const titres = d.journal.filter(e => {
                const q = new Date(e.date);
                const iso = isNaN(q.getTime()) ? '' : q.toISOString().slice(0, 10);
                return iso === jour && (!meta.classe || e.classeNom === meta.classe);
            }).map(e => e.serieTitre).filter(Boolean);
            return [...new Set(titres)].join(', ');
        } catch (e) { return ''; }
    }

    async function copier(texte, quoi) {
        try {
            await navigator.clipboard.writeText(texte);
            dire(quoi + ' copié');
            return true;
        } catch (e) {
            // Le presse-papiers se refuse hors d'un site sécurisé : on montre
            // alors le texte tout sélectionné, prêt pour un Ctrl+C.
            const z = h('textarea', { class: 'pub-copie', readonly: true }, texte);
            const zone = q('#pub-resultat');
            if (zone) { zone.appendChild(z); z.focus(); z.select(); }
            dire('Copie automatique refusée : le texte est sélectionné, faites Ctrl+C');
            return false;
        }
    }

    function montrerLeResultat(zone, r) {
        zone.textContent = '';
        zone.appendChild(h('div', { class: 'pw-bloc-titre' }, 'C\'est publié'));
        zone.appendChild(h('p', { class: 'pub-texte' },
            'Le fichier est dans « ' + DOSSIER + ' » (' + poids(r.taille) + '). Drive Desktop l\'envoie dans la minute ; '
            + 'le lien ne fonctionnera pour les élèves qu\'une fois l\'envoi terminé.'));
        zone.appendChild(h('div', { class: 'pub-lien' }, h('code', {}, r.lien)));
        const etat = h('p', { class: 'pub-etat', id: 'pub-etat' }, '');
        zone.appendChild(h('div', { class: 'pw-rangee pub-actions' },
            bouton('Copier le lien', () => copier(r.lien, 'Lien'), 'primaire'),
            bouton('Copier le texte pour Pronote', () => copier(resume(r.meta, r.lien), 'Texte')),
            bouton('Vérifier que c\'est en ligne', async () => {
                etat.textContent = 'Demande à Google…';
                const v = await verifier(r.nom);
                etat.className = 'pub-etat ' + (v.ok ? 'bon' : 'attente');
                etat.textContent = v.message;
                r.enLigne = v.ok;
            }),
            bouton('Ouvrir le lecteur', () => window.open(r.lien, '_blank', 'noopener'))));
        zone.appendChild(etat);
        zone.appendChild(h('p', { class: 'pub-texte pub-mode-emploi' },
            'Dans Pronote : cahier de textes, la séance, champ « Contenu » — collez le texte ; le lien y devient cliquable.'));
    }

    async function verifier(nom) {
        if (!window.DrivePublic) return { ok: false, message: 'Le lecteur du Drive manque.' };
        try {
            const fiche = await DrivePublic.trouver(nom + '.prof', reglages.dossier, reglages.cle);
            if (!fiche) return { ok: false, message: 'Pas encore en ligne : Drive Desktop n\'a pas fini d\'envoyer. Réessayez dans une minute.' };
            return { ok: true, message: 'En ligne — ' + poids(Number(fiche.size) || 0) + ', envoyé à '
                + new Date(fiche.modifiedTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.' };
        } catch (e) {
            return { ok: false, message: DrivePublic.expliquer(e) };
        }
    }

    // ---------------------------------------------------------------------
    // ONGLET « DÉJÀ PUBLIÉES »
    // ---------------------------------------------------------------------
    async function listerLesPubliees() {
        const dossier = await dossierDesSeances(false);
        if (!dossier) return [];
        const out = [];
        try {
            for await (const [nom, handle] of dossier.entries()) {
                if (handle.kind !== 'file' || !/\.prof$/i.test(nom)) continue;
                let date = 0, taille = 0;
                try { const f = await handle.getFile(); date = f.lastModified || 0; taille = f.size || 0; } catch (e) { /* illisible */ }
                out.push({ nom: nom.replace(/\.prof$/i, ''), date, taille });
            }
        } catch (e) { console.warn(e); }
        out.sort((a, b) => b.date - a.date);
        return out;
    }

    function rendreListe(p) {
        if (!window.MonDossier || !MonDossier.pret()) {
            p.appendChild(h('p', { class: 'pub-texte' }, 'Ouvrez d\'abord votre Drive (tiroir de droite, « Mon Drive »).'));
            return;
        }
        const liste = h('div', { class: 'pub-liste' }, h('p', { class: 'pub-texte' }, 'Lecture du dossier…'));
        p.appendChild(h('div', { class: 'pw-bloc' }, h('div', { class: 'pw-bloc-titre' }, 'Les séances déjà publiées'), liste));
        listerLesPubliees().then(entrees => {
            ui.publiees = entrees;
            liste.textContent = '';
            if (!entrees.length) {
                liste.appendChild(h('p', { class: 'pub-texte' }, 'Rien encore. Le dossier « ' + DOSSIER + ' » se crée à la première publication.'));
                return;
            }
            entrees.forEach(e => {
                const lien = lienDe(e.nom);
                liste.appendChild(h('div', { class: 'pub-ligne' },
                    h('div', { class: 'pub-ligne-nom' }, h('b', {}, e.nom),
                        h('small', {}, new Date(e.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                            + ' · ' + poids(e.taille))),
                    h('div', { class: 'pub-ligne-actions' },
                        bouton('Copier le lien', () => copier(lien, 'Lien')),
                        bouton('Ouvrir', () => window.open(lien, '_blank', 'noopener')),
                        bouton('Retirer', () => retirer(e.nom), 'danger'))));
            });
        });
    }

    function retirer(nom) {
        const faire = async () => {
            try {
                const dossier = await dossierDesSeances(false);
                if (dossier) await dossier.removeEntry(nom + '.prof');
                dire('Séance retirée — le lien ne montrera plus rien');
            } catch (e) { dire('Impossible de retirer cette séance'); }
            rendre();
        };
        if (typeof openConfirmModal === 'function') {
            openConfirmModal('Retirer « ' + nom + ' » ?',
                'Le fichier part du Drive : le lien déjà collé dans Pronote n\'ouvrira plus rien. Votre tableau, lui, n\'est pas touché.',
                true, faire);
        } else faire();
    }

    // ---------------------------------------------------------------------
    // ONGLET « LE DOSSIER ET LA CLÉ »
    // ---------------------------------------------------------------------
    function rendreReglages(p) {
        // CE DOSSIER-LÀ EST SUR LE DISQUE, l'autre est son ombre en ligne :
        // le premier reçoit le fichier, le second sert le lien. C'est le même
        // dossier vu des deux côtés du Drive — on le dit, parce que devoir le
        // désigner deux fois surprend.
        const ou = h('div', { class: 'pw-bloc' },
            h('div', { class: 'pw-bloc-titre' }, 'Le dossier où les séances sont écrites'),
            h('p', { class: 'pub-texte' }, dossierChoisi.nom
                ? 'Les séances vont dans « ' + dossierChoisi.nom + ' », quel que soit le tableau ouvert.'
                : (window.MonDossier && MonDossier.pret())
                    ? 'Aucun dossier désigné : les séances iraient dans « ' + DOSSIER + ' » à la racine de l’emplacement ouvert, qui change quand vous changez de classe. Mieux vaut en désigner un.'
                    : 'Aucun dossier désigné.'),
            h('div', { class: 'pw-rangee pub-actions' },
                bouton(dossierChoisi.nom ? 'Changer de dossier…' : 'Choisir le dossier…', choisirLeDossier,
                    dossierChoisi.nom ? '' : 'primaire'),
                dossierChoisi.nom ? bouton('Oublier', oublierLeDossier) : null));
        p.appendChild(ou);

        const dossier = h('input', { type: 'text', class: 'pw-champ-texte', value: reglages.dossier,
            placeholder: 'Collez ici le lien de partage du dossier' });
        const cle = h('input', { type: 'text', class: 'pw-champ-texte', value: reglages.cle, placeholder: 'AIza…' });
        const adresse = h('input', { type: 'text', class: 'pw-champ-texte', value: reglages.adresse,
            placeholder: adresseDuSite() || 'https://mathsetmoi.github.io/Autableau' });

        p.appendChild(h('div', { class: 'pw-bloc' },
            h('div', { class: 'pw-bloc-titre' }, 'Une installation, une fois pour toutes'),
            h('ol', { class: 'pub-etapes' },
                h('li', {}, 'Dans votre Drive, créez à la racine un dossier ', h('b', {}, DOSSIER),
                    ' (ou laissez la première publication le créer).'),
                h('li', {}, 'Clic droit dessus → Partager → « Général » : ', h('b', {}, 'Tout utilisateur disposant du lien'),
                    ', en Lecteur. Copiez le lien et collez-le ci-dessous.'),
                h('li', {}, 'Dans la console Google Cloud (console.cloud.google.com), activez ',
                    h('b', {}, 'Google Drive API'), ', puis « Identifiants » → « Créer des identifiants » → ',
                    h('b', {}, 'Clé API'), '. Restreignez-la aux sites « ', adresseDuSite() || 'votre site', '/* » et à l\'API Drive.'),
                h('li', {}, 'Collez la clé ci-dessous. Elle reste dans ce navigateur.')),
            h('div', { class: 'pw-rangee' },
                champ('Dossier partagé', dossier, 'Le lien de partage, ou l\'identifiant seul.'),
                champ('Clé d\'API Google', cle, 'Elle ne donne accès qu\'à ce qui est public.')),
            champ('Adresse du lecteur', adresse, 'Le site d\'où les élèves ouvriront la séance. Vide = celui d\'ici.')));

        const etat = h('p', { class: 'pub-etat' }, '');
        p.appendChild(h('div', { class: 'pw-pied' }, etat, h('span', { class: 'pw-espace' }),
            bouton('Essayer', async () => {
                const id = window.DrivePublic ? DrivePublic.idDepuisLeLien(dossier.value) : '';
                if (!id || !cle.value.trim()) { etat.className = 'pub-etat attente'; etat.textContent = 'Il manque le dossier ou la clé.'; return; }
                etat.className = 'pub-etat'; etat.textContent = 'Demande à Google…';
                try {
                    const fichiers = await DrivePublic.lister(id, cle.value.trim());
                    etat.className = 'pub-etat bon';
                    etat.textContent = 'Le dossier répond : ' + fichiers.length + ' fichier' + (fichiers.length > 1 ? 's' : '') + '.';
                } catch (e) {
                    etat.className = 'pub-etat attente';
                    etat.textContent = DrivePublic.expliquer(e);
                }
            }),
            bouton('Enregistrer', () => {
                reglages.dossier = window.DrivePublic ? (DrivePublic.idDepuisLeLien(dossier.value) || '') : dossier.value.trim();
                reglages.cle = cle.value.trim();
                reglages.adresse = adresse.value.trim();
                retenirLesReglages();
                dire(regle() ? 'Réglages enregistrés' : 'Réglages enregistrés — il manque encore le dossier ou la clé');
                ui.onglet = regle() ? 'publier' : 'reglages';
                rendre();
            }, 'primaire')));
    }

    // ---------------------------------------------------------------------
    // LE BOUTON DANS LE TIROIR
    // ---------------------------------------------------------------------
    function poserDansLeTiroir(boite) {
        if (!boite) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'dossier-publier';
        b.className = 'btn-action secondary dossier-bouton dossier-publier';
        b.textContent = '▶ Publier pour le cahier de textes';
        b.title = 'Écrire cette séance dans le dossier public du Drive et obtenir le lien à coller dans Pronote';
        b.onclick = () => ouvrir();
        boite.appendChild(b);
    }

    // ET DANS « EXPORTER », car c'est là qu'on va chercher quand on veut
    // mettre son tableau ailleurs. Le bouton s'ajoute à la fenêtre existante
    // plutôt que d'être écrit dans la page : rien à reprendre en amont.
    function poserDansLExport() {
        const popover = el('export-popover');
        if (!popover || el('pub-depuis-export')) return;
        const grille = popover.querySelector('.export-actions-grid');
        if (!grille) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'pub-depuis-export';
        b.className = 'btn-action secondary pub-depuis-export';
        b.textContent = '▶ Publier pour le cahier de textes…';
        b.title = 'Un lien que les élèves et les parents ouvrent pour rejouer la séance';
        b.onclick = () => { popover.classList.remove('visible'); ouvrir(); };
        grille.insertBefore(b, grille.firstChild);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poserDansLExport);
    else poserDansLExport();

    window.Publication = {
        ouvrir, fermer, publier, rendre, poserDansLeTiroir, poserDansLExport, verifier, listerLesPubliees,
        reglages, chargerLesReglages, chargerLeDossier, choisirLeDossier, oublierLeDossier, dossierChoisi,
        poserLesReglages: (r) => { Object.assign(reglages, r || {}); retenirLesReglages(); },
        nomPublic, lienDe, resume, contenuAPublier, dossierDesSeances, ui, DOSSIER
    };
})();
