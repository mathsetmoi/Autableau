// ==============================================================================
// LES AUTOMATISMES
// ==============================================================================
// « Je voudrais intégrer les automatismes dans l'outil. Il faudrait qu'ils
// puissent être sauvegardés : que je retrouve rapidement et facilement les
// questions qui ont été posées ou les exercices qui ont été donnés. »
//
// Les automatismes sont les questions de début d'heure : cinq à dix questions
// courtes, projetées une à une, que la classe traite sur l'ardoise avant la
// correction. Ce qui manquait n'était pas de les poser — le tableau sait
// projeter — mais de S'EN SOUVENIR : quelle question a été donnée à quelle
// classe, quand, et laquelle ne l'a jamais été.
//
// TROIS CHOSES, DONC :
//   — LA BANQUE : vos questions, à vous, avec leurs réponses, un thème, un
//     niveau. Les formules s'écrivent entre dollars, comme dans l'outil
//     Texte : « Développer $(x+1)^2$ ».
//   — LES SÉRIES : une série, c'est l'automatisme d'une heure — des questions
//     de la banque, dans l'ordre. On la projette, on la pose sur le tableau
//     pour la corriger, on la refait à une autre classe.
//   — LE JOURNAL : chaque projection s'y écrit toute seule, avec la classe
//     du moment. Chaque question sait alors combien de fois elle a été
//     posée, à qui, et quand ; on filtre la banque par classe pour voir ce
//     qui ne lui a jamais été donné.
//
// TOUT VIT SUR CET ORDINATEUR, comme les classes, et une copie part dans le
// dossier du Drive quand il est ouvert (« automatismes.json », à la racine) :
// un autre poste la reprend s'elle est plus récente que la sienne. On peut
// aussi exporter et importer la banque en JSON, pour la partager.
//
// Ce fichier ne touche pas à plugin.js : il s'enregistre comme les autres
// outils, dans la rubrique « Exercices ».
// ==============================================================================
(function () {
    'use strict';
    if (typeof registerPlugin !== 'function') return;

    const CLE = 'auTableau_automatismes_v1';
    const FICHIER_DRIVE = 'automatismes.json';
    const NIVEAUX = ['2nde', '1re', 'Tle', 'Collège', 'Autre'];

    // ---------------------------------------------------------------------
    // LES DONNÉES
    // ---------------------------------------------------------------------
    let donnees = null;
    let chargement = null;
    const vide = () => ({ version: 1, questions: [], series: [], journal: [], modifie: 0 });
    const id = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const maintenant = () => Date.now();
    const dire = (m) => { if (typeof showToast === 'function') showToast(m); };
    const echapper = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function assainir(d) {
        const s = vide();
        if (!d || typeof d !== 'object') return s;
        s.questions = Array.isArray(d.questions) ? d.questions.filter(q => q && q.id).map(q => ({
            id: String(q.id), enonce: String(q.enonce || ''), reponse: String(q.reponse || ''),
            theme: String(q.theme || ''), niveau: String(q.niveau || ''),
            cree: +q.cree || 0, modifie: +q.modifie || 0
        })) : [];
        s.series = Array.isArray(d.series) ? d.series.filter(x => x && x.id).map(x => ({
            id: String(x.id), titre: String(x.titre || 'Sans titre'), niveau: String(x.niveau || ''),
            questions: Array.isArray(x.questions) ? x.questions.map(String) : [],
            duree: Math.max(0, +x.duree || 0),
            cree: +x.cree || 0, modifie: +x.modifie || 0
        })) : [];
        s.journal = Array.isArray(d.journal) ? d.journal.filter(j => j && j.id).map(j => ({
            id: String(j.id), date: +j.date || 0, classeId: j.classeId ? String(j.classeId) : null,
            classeNom: String(j.classeNom || ''), serieId: j.serieId ? String(j.serieId) : null,
            serieTitre: String(j.serieTitre || ''), questions: Array.isArray(j.questions) ? j.questions.map(String) : [],
            mode: String(j.mode || 'projection'), note: String(j.note || '')
        })) : [];
        s.modifie = +d.modifie || 0;
        return s;
    }

    function charger() {
        if (donnees) return Promise.resolve(donnees);
        if (chargement) return chargement;
        chargement = (async () => {
            let brut = null;
            try { brut = await localforage.getItem(CLE); } catch (e) { brut = null; }
            donnees = assainir(brut);
            return donnees;
        })();
        return chargement;
    }

    async function enregistrer() {
        if (!donnees) return;
        donnees.modifie = maintenant();
        try { await localforage.setItem(CLE, donnees); }
        catch (e) { console.warn('Automatismes : écriture locale impossible', e); dire('Les automatismes n\'ont pas pu être enregistrés sur cet ordinateur'); }
        await miroirDrive();       // le Drive n'est pas là : la copie attendra, sans erreur
    }

    // --- LE MIROIR DANS LE DRIVE ---------------------------------------
    const driveOuvert = () => typeof MonDossier === 'object' && MonDossier && MonDossier.pret() && MonDossier.etat && MonDossier.etat.racine;
    const etatDrive = { derniereCopie: 0, erreur: null };

    async function miroirDrive() {
        if (!driveOuvert() || !donnees) return false;
        try {
            const fichier = await MonDossier.etat.racine.getFileHandle(FICHIER_DRIVE, { create: true });
            const flux = await fichier.createWritable();
            await flux.write(JSON.stringify(donnees));
            await flux.close();
            etatDrive.derniereCopie = maintenant(); etatDrive.erreur = null;
            majPied();
            return true;
        } catch (e) { etatDrive.erreur = e; majPied(); return false; }
    }

    // La copie du Drive est-elle plus récente que la nôtre ? Alors c'est elle
    // qui fait foi : on l'a écrite depuis un autre poste.
    async function reprendreDuDrive(forcer) {
        if (!driveOuvert()) return 'pas de drive';
        let texte;
        try {
            const fichier = await MonDossier.etat.racine.getFileHandle(FICHIER_DRIVE);
            texte = await (await fichier.getFile()).text();
        } catch (e) { return 'absent'; }
        let lu;
        try { lu = assainir(JSON.parse(texte)); } catch (e) { return 'illisible'; }
        await charger();
        if (!forcer && lu.modifie <= donnees.modifie) return 'pas plus récent';
        donnees = lu;
        try { await localforage.setItem(CLE, donnees); } catch (e) { /* on garde en mémoire */ }
        etatDrive.derniereCopie = maintenant();
        rendre();
        return 'repris';
    }

    // --- IMPORTER, EXPORTER ----------------------------------------------
    function exporter() {
        const blob = new Blob([JSON.stringify(donnees, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'automatismes-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // L'import AJOUTE : ce qu'on reçoit d'un collègue rejoint la banque, sans
    // écraser la sienne. Une question déjà là (même identifiant) est ignorée.
    async function importerDepuis(texte) {
        let lu;
        try { lu = assainir(JSON.parse(texte)); } catch (e) { dire('Ce fichier n\'est pas une banque d\'automatismes'); return 0; }
        await charger();
        const deja = new Set(donnees.questions.map(q => q.id));
        let n = 0;
        lu.questions.forEach(q => { if (!deja.has(q.id)) { donnees.questions.push(q); n++; } });
        const seriesDeja = new Set(donnees.series.map(s => s.id));
        lu.series.forEach(s => { if (!seriesDeja.has(s.id)) donnees.series.push(s); });
        await enregistrer();
        rendre();
        dire(n + ' question' + (n > 1 ? 's' : '') + ' importée' + (n > 1 ? 's' : ''));
        return n;
    }

    // --- CE QU'ON SAIT D'UNE QUESTION -----------------------------------
    function poses(questionId, classeId) {
        return donnees.journal.filter(j => j.questions.includes(questionId) && (!classeId || j.classeId === classeId));
    }
    const dateCourte = (t) => t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
    const dateLongue = (t) => t ? new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

    // ---------------------------------------------------------------------
    // LES FORMULES : « $...$ » dans un énoncé
    // ---------------------------------------------------------------------
    function mathjaxPret() { return !!(window.MathJax && window.MathJax.tex2svgPromise); }
    function chargerLesFormules() {
        if (mathjaxPret()) return Promise.resolve(true);
        return (typeof chargerMathJax === 'function') ? chargerMathJax() : Promise.resolve(false);
    }
    const morceauxDe = (texte) => String(texte || '').split(/\$([^$]+)\$/);

    // Dans la page : le texte tel quel, les formules composées.
    async function composer(el, texte) {
        el.textContent = '';
        const morceaux = morceauxDe(texte);
        if (morceaux.length < 3) { el.textContent = texte || ''; return; }
        const pret = await chargerLesFormules();
        el.textContent = '';
        for (let i = 0; i < morceaux.length; i++) {
            if (i % 2 === 0) { if (morceaux[i]) el.appendChild(document.createTextNode(morceaux[i])); continue; }
            let pose = false;
            if (pret) {
                try {
                    const n = await MathJax.tex2svgPromise(morceaux[i], { display: false });
                    const svg = n.querySelector('svg');
                    if (svg) { svg.style.verticalAlign = '-0.3em'; svg.style.margin = '0 1px'; el.appendChild(svg); pose = true; }
                } catch (e) { pose = false; }
            }
            if (!pose) el.appendChild(document.createTextNode('$' + morceaux[i] + '$'));
        }
    }

    // Pour le tampon : tout l'énoncé en un seul dessin, le texte en \text{}.
    function enLatex(texte) {
        const morceaux = morceauxDe(texte);
        let latex = '';
        morceaux.forEach((m, i) => {
            if (i % 2 === 1) latex += '{' + m + '}';
            else if (m) latex += '\\text{' + m.replace(/([\\{}$%&#_^~])/g, '\\$1') + '}';
        });
        return latex || '\\text{ }';
    }

    // Le dessin SVG d'un énoncé, à une taille de corps donnée : { svg, l, h }
    async function svgDe(texte, corps, couleur) {
        if (!(await chargerLesFormules())) return null;
        try {
            const n = await MathJax.tex2svgPromise(enLatex(texte), { display: false });
            const svg = n.querySelector('svg');
            if (!svg) return null;
            const enPx = (v) => { const x = parseFloat(v); if (!isFinite(x)) return 0; return /ex$/.test(v) ? x * corps * 0.5 : /em$/.test(v) ? x * corps : x; };
            const l = Math.max(1, Math.round(enPx(svg.getAttribute('width'))));
            const h = Math.max(1, Math.round(enPx(svg.getAttribute('height'))));
            svg.setAttribute('width', l); svg.setAttribute('height', h);
            svg.setAttribute('color', couleur || '#2d3436');
            if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.removeAttribute('style');
            return { svg: new XMLSerializer().serializeToString(svg), l, h };
        } catch (e) { return null; }
    }

    // ---------------------------------------------------------------------
    // LA FENÊTRE
    // ---------------------------------------------------------------------
    const ui = { fenetre: null, onglet: 'banque', serieOuverte: null, question: null, selection: new Set(),
                 filtre: { texte: '', theme: '', niveau: '', classe: '' }, filtreJournal: { classe: '', texte: '' } };
    const el = (sel) => ui.fenetre ? ui.fenetre.querySelector(sel) : null;

    function construire() {
        if (ui.fenetre) return;
        const f = document.createElement('div');
        f.id = 'auto-fenetre';
        f.className = 'pw';
        f.style.cssText = 'top:5vh; left:max(12px, calc(50% - 560px)); width:min(1120px, calc(100vw - 24px)); height:88vh; display:none;';
        f.innerHTML = `
            <div class="pw-entete" id="auto-poignee">
                <span class="pw-titre">Automatismes</span>
                <span class="pw-espace"></span>
                <span id="auto-drive" class="auto-drive" title=""></span>
                <button class="pw-icone fermer" id="auto-fermer" title="Fermer">✕</button>
            </div>
            <div class="pw-corps">
                <div class="pw-rail">
                    <div class="pw-rail-titre">Automatismes</div>
                    <button class="pw-rail-item" data-onglet="banque">Banque de questions</button>
                    <button class="pw-rail-item" data-onglet="series">Séries</button>
                    <button class="pw-rail-item" data-onglet="journal">Journal</button>
                    <div class="pw-rail-titre" style="margin-top:14px">Partager</div>
                    <button class="pw-rail-item" id="auto-exporter">Exporter la banque…</button>
                    <button class="pw-rail-item" id="auto-importer">Importer une banque…</button>
                    <button class="pw-rail-item" id="auto-reprendre">Reprendre depuis le Drive</button>
                    <input type="file" id="auto-fichier" accept=".json,application/json" style="display:none">
                </div>
                <div class="pw-panneau" id="auto-panneau"></div>
            </div>
        `;
        document.body.appendChild(f);
        ui.fenetre = f;

        // Déplaçable par l'en-tête, comme les autres fenêtres d'outils.
        const poignee = f.querySelector('#auto-poignee');
        let glisse = null;
        poignee.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            glisse = { x: e.clientX - f.offsetLeft, y: e.clientY - f.offsetTop };
            try { poignee.setPointerCapture(e.pointerId); } catch (err) { /* refusé */ }
        });
        poignee.addEventListener('pointermove', (e) => { if (glisse) { f.style.left = (e.clientX - glisse.x) + 'px'; f.style.top = (e.clientY - glisse.y) + 'px'; } });
        const lacher = () => { glisse = null; };
        poignee.addEventListener('pointerup', lacher); poignee.addEventListener('pointercancel', lacher);

        f.querySelector('#auto-fermer').onclick = fermer;
        f.querySelectorAll('.pw-rail-item[data-onglet]').forEach(b => b.onclick = () => { ui.onglet = b.dataset.onglet; ui.question = null; rendre(); });
        f.querySelector('#auto-exporter').onclick = exporter;
        f.querySelector('#auto-importer').onclick = () => f.querySelector('#auto-fichier').click();
        f.querySelector('#auto-fichier').addEventListener('change', async (e) => {
            const fichier = e.target.files[0]; e.target.value = '';
            if (fichier) importerDepuis(await fichier.text());
        });
        f.querySelector('#auto-reprendre').onclick = async () => {
            const r = await reprendreDuDrive(true);
            dire({ 'pas de drive': 'Ouvrez d\'abord votre Drive (tiroir de droite, Mon Drive)', absent: 'Aucune copie dans ce dossier du Drive',
                   illisible: 'La copie du Drive est illisible', repris: 'Banque reprise depuis le Drive' }[r] || 'Rien à reprendre');
        };
    }

    async function ouvrir(onglet) {
        await charger();
        // Les classes se lisent UNE fois, ici : les panneaux ne font que les
        // montrer. (Les relire depuis un panneau, qui redessine quand elles
        // arrivent, tournait sans fin.)
        await classes();
        construire();
        if (onglet) ui.onglet = onglet;
        ui.fenetre.style.display = 'flex';
        if (typeof ramenerFenetreDansLecran === 'function') ramenerFenetreDansLecran(ui.fenetre);
        rendre();
        // Le Drive a peut-être une copie plus fraîche, venue d'un autre poste.
        reprendreDuDrive(false).then(r => { if (r === 'repris') dire('Banque mise à jour depuis le Drive'); });
    }
    function fermer() { if (ui.fenetre) ui.fenetre.style.display = 'none'; }

    function majPied() {
        const d = el('#auto-drive');
        if (!d) return;
        if (!driveOuvert()) { d.textContent = 'Sur cet ordinateur'; d.title = 'Ouvrez votre Drive (tiroir de droite) pour qu\'une copie y parte'; return; }
        if (etatDrive.erreur) { d.textContent = 'Drive : copie impossible'; d.title = String(etatDrive.erreur); return; }
        d.textContent = 'Copie dans le Drive' + (etatDrive.derniereCopie ? ' · ' + new Date(etatDrive.derniereCopie).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
        d.title = 'Une copie de la banque part dans « ' + MonDossier.nomActif() + ' » à chaque changement';
    }

    function rendre() {
        if (!ui.fenetre || ui.fenetre.style.display === 'none' || !donnees) return;
        ui.fenetre.querySelectorAll('.pw-rail-item[data-onglet]').forEach(b => b.classList.toggle('actif', b.dataset.onglet === ui.onglet));
        const p = el('#auto-panneau');
        p.textContent = '';
        majPied();
        if (ui.onglet === 'banque') rendreBanque(p);
        else if (ui.onglet === 'series') rendreSeries(p);
        else rendreJournal(p);
    }

    // Petits fabricants d'éléments
    function h(tag, attrs, ...enfants) {
        const e = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === 'class') e.className = v;
            else if (k === 'style') e.style.cssText = v;
            else if (k.startsWith('on')) e[k] = v;
            else if (v !== null && v !== undefined) e.setAttribute(k, v);
        });
        enfants.flat().forEach(c => { if (c === null || c === undefined) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return e;
    }
    const bouton = (texte, action, classe) => h('button', { class: 'pw-btn' + (classe ? ' ' + classe : ''), type: 'button', onclick: action }, texte);

    let classesConnues = [];
    async function classes() {
        try { classesConnues = (await ClassesStore.loadAll()).filter(c => !c.archivee); } catch (e) { classesConnues = []; }
        return classesConnues;
    }
    function classeDuMomentNom() {
        try { const id = classeDuMoment(classesConnues); const c = classesConnues.find(x => x.id === id); return c ? { id: c.id, nom: c.name } : null; } catch (e) { return null; }
    }
    function selectClasses(valeur, onchange, libelleVide) {
        const s = h('select', { class: 'pw-select', onchange: (e) => onchange(e.target.value) });
        s.appendChild(h('option', { value: '' }, libelleVide || 'Toutes les classes'));
        classesConnues.forEach(c => { const o = h('option', { value: c.id }, c.name); if (c.id === valeur) o.selected = true; s.appendChild(o); });
        return s;
    }

    // ---------------------------------------------------------------------
    // LA BANQUE
    // ---------------------------------------------------------------------
    function themes() { return [...new Set(donnees.questions.map(q => q.theme).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')); }
    function niveaux() { return [...new Set(NIVEAUX.concat(donnees.questions.map(q => q.niveau).filter(Boolean)))]; }

    function questionsFiltrees() {
        const f = ui.filtre, t = f.texte.trim().toLowerCase();
        return donnees.questions.filter(q =>
            (!f.theme || q.theme === f.theme) && (!f.niveau || q.niveau === f.niveau)
            && (!t || (q.enonce + ' ' + q.reponse + ' ' + q.theme).toLowerCase().includes(t)));
    }

    function rendreBanque(p) {
        if (ui.question) { rendreFiche(p); return; }

        // La barre : recherche, thème, niveau, classe (pour voir ce qui lui a été posé)
        const barre = h('div', { class: 'auto-barre' },
            h('input', { class: 'auto-recherche', type: 'search', placeholder: 'Rechercher une question…', value: ui.filtre.texte,
                oninput: (e) => { ui.filtre.texte = e.target.value; rendreListeQuestions(); } }),
            (() => { const s = h('select', { class: 'pw-select', style: 'width:auto', onchange: (e) => { ui.filtre.theme = e.target.value; rendreListeQuestions(); } });
                s.appendChild(h('option', { value: '' }, 'Tous les thèmes'));
                themes().forEach(t => { const o = h('option', { value: t }, t); if (t === ui.filtre.theme) o.selected = true; s.appendChild(o); }); return s; })(),
            (() => { const s = h('select', { class: 'pw-select', style: 'width:auto', onchange: (e) => { ui.filtre.niveau = e.target.value; rendreListeQuestions(); } });
                s.appendChild(h('option', { value: '' }, 'Tous les niveaux'));
                niveaux().forEach(t => { const o = h('option', { value: t }, t); if (t === ui.filtre.niveau) o.selected = true; s.appendChild(o); }); return s; })(),
            (() => { const s = selectClasses(ui.filtre.classe, (v) => { ui.filtre.classe = v; rendreListeQuestions(); }, 'Posée à… (toutes)'); s.style.width = 'auto'; return s; })(),
            h('span', { class: 'pw-espace' }),
            bouton('+ Nouvelle question', () => { ui.question = { id: null, enonce: '', reponse: '', theme: ui.filtre.theme, niveau: ui.filtre.niveau }; rendre(); }, 'primaire')
        );
        p.appendChild(barre);
        p.appendChild(h('div', { id: 'auto-liste' }));
        p.appendChild(h('div', { class: 'auto-lot', id: 'auto-lot' }));
        rendreListeQuestions();
    }

    function rendreListeQuestions() {
        const liste = el('#auto-liste'); if (!liste) return;
        liste.textContent = '';
        const qs = questionsFiltrees();
        if (!donnees.questions.length) {
            liste.appendChild(h('p', { class: 'auto-vide' }, 'La banque est vide. Écrivez votre première question avec « + Nouvelle question » : l\'énoncé, sa réponse, un thème et un niveau. Les formules vont entre dollars : $\\frac{3}{4}$.'));
            return;
        }
        if (!qs.length) { liste.appendChild(h('p', { class: 'auto-vide' }, 'Aucune question ne répond à ces filtres.')); return; }
        const classeFiltre = ui.filtre.classe;
        qs.sort((a, b) => (b.modifie || b.cree) - (a.modifie || a.cree)).forEach(q => {
            const toutes = poses(q.id), pourLaClasse = classeFiltre ? poses(q.id, classeFiltre) : null;
            const derniere = toutes.slice().sort((a, b) => b.date - a.date)[0];
            const coche = h('input', { type: 'checkbox', class: 'auto-coche', title: 'Choisir pour une série' });
            coche.checked = ui.selection.has(q.id);
            coche.onchange = () => { if (coche.checked) ui.selection.add(q.id); else ui.selection.delete(q.id); rendreLot(); };
            const enonce = h('div', { class: 'auto-enonce' });
            composer(enonce, q.enonce);
            const reponse = h('div', { class: 'auto-reponse' });
            if (q.reponse) composer(reponse, q.reponse);
            const trace = h('div', { class: 'auto-trace' },
                q.theme ? h('span', { class: 'auto-etiquette' }, q.theme) : null,
                q.niveau ? h('span', { class: 'auto-etiquette niveau' }, q.niveau) : null,
                h('span', { class: 'auto-posee' + (toutes.length ? '' : ' jamais') },
                    toutes.length ? 'posée ' + toutes.length + ' fois' + (derniere ? ' · ' + dateCourte(derniere.date) + (derniere.classeNom ? ' · ' + derniere.classeNom : '') : '') : 'jamais posée'),
                pourLaClasse ? h('span', { class: 'auto-posee ' + (pourLaClasse.length ? 'deja' : 'jamais') },
                    pourLaClasse.length ? 'déjà donnée à cette classe (' + dateCourte(pourLaClasse.sort((a, b) => b.date - a.date)[0].date) + ')' : 'jamais donnée à cette classe') : null
            );
            const ligne = h('div', { class: 'auto-question' + (pourLaClasse && pourLaClasse.length ? ' deja' : '') },
                coche,
                h('div', { class: 'auto-corps', onclick: (e) => { if (e.target.closest('button,input')) return; ui.question = { ...q }; rendre(); } }, enonce, reponse, trace),
                h('div', { class: 'auto-actions' },
                    h('button', { class: 'auto-petit', title: 'Modifier', onclick: () => { ui.question = { ...q }; rendre(); } }, '✎'),
                    h('button', { class: 'auto-petit danger', title: 'Supprimer', onclick: () => supprimerQuestion(q.id) }, '🗑'))
            );
            liste.appendChild(ligne);
        });
        rendreLot();
    }

    // Le lot coché : de quoi en faire une série, ou l'ajouter à celle ouverte.
    function rendreLot() {
        const lot = el('#auto-lot'); if (!lot) return;
        lot.textContent = '';
        const n = ui.selection.size;
        lot.hidden = !n;
        if (!n) return;
        lot.appendChild(h('span', {}, n + ' question' + (n > 1 ? 's' : '') + ' choisie' + (n > 1 ? 's' : '')));
        lot.appendChild(h('span', { class: 'pw-espace' }));
        const ouverte = ui.serieOuverte ? donnees.series.find(s => s.id === ui.serieOuverte) : null;
        if (ouverte) lot.appendChild(bouton('Ajouter à « ' + ouverte.titre + ' »', async () => {
            [...ui.selection].forEach(qid => { if (!ouverte.questions.includes(qid)) ouverte.questions.push(qid); });
            ouverte.modifie = maintenant(); ui.selection.clear(); await enregistrer();
            ui.onglet = 'series'; rendre();
        }));
        lot.appendChild(bouton('Nouvelle série avec ces questions', () => nouvelleSerie([...ui.selection]), 'primaire'));
        lot.appendChild(bouton('✕', () => { ui.selection.clear(); rendreListeQuestions(); }));
    }

    function supprimerQuestion(qid) {
        const q = donnees.questions.find(x => x.id === qid); if (!q) return;
        openConfirmModal('Supprimer cette question ?', 'Elle sortira de la banque et des séries qui la contiennent. Le journal, lui, garde la trace de ce qui a été posé.', true, async () => {
            donnees.questions = donnees.questions.filter(x => x.id !== qid);
            donnees.series.forEach(s => { s.questions = s.questions.filter(x => x !== qid); });
            ui.selection.delete(qid);
            await enregistrer(); rendre();
        });
    }

    // LA FICHE d'une question : l'énoncé et la réponse s'écrivent, et se
    // voient composés au fil de la frappe.
    function rendreFiche(p) {
        const q = ui.question;
        const neuve = !q.id;
        const champ = (label, cle, lignes) => {
            const zone = h('textarea', { class: 'auto-saisie', rows: lignes, placeholder: cle === 'enonce' ? 'Développer $(2x+1)^2$' : 'Réponse attendue (facultative)' });
            zone.value = q[cle] || '';
            const apercu = h('div', { class: 'auto-apercu' });
            composer(apercu, zone.value);
            let minuteur = null;
            zone.oninput = () => { q[cle] = zone.value; clearTimeout(minuteur); minuteur = setTimeout(() => composer(apercu, zone.value), 250); };
            return h('div', { class: 'pw-champ' }, h('label', {}, label), zone, apercu);
        };
        const listeThemes = h('datalist', { id: 'auto-themes' }, themes().map(t => h('option', { value: t })));
        const listeNiveaux = h('datalist', { id: 'auto-niveaux' }, niveaux().map(t => h('option', { value: t })));
        const theme = h('input', { class: 'pw-select', list: 'auto-themes', placeholder: 'Calcul littéral, Fonctions, Probabilités…', value: q.theme || '', oninput: (e) => { q.theme = e.target.value; } });
        const niveau = h('input', { class: 'pw-select', list: 'auto-niveaux', placeholder: '2nde, 1re, Tle…', value: q.niveau || '', oninput: (e) => { q.niveau = e.target.value; } });

        const historique = neuve ? null : (() => {
            const ps = poses(q.id).sort((a, b) => b.date - a.date);
            if (!ps.length) return h('p', { class: 'auto-vide', style: 'padding:6px 0' }, 'Cette question n\'a encore jamais été posée.');
            return h('div', { class: 'pw-bloc' }, h('div', { class: 'pw-bloc-titre' }, 'Posée ' + ps.length + ' fois'),
                h('ul', { class: 'auto-historique' }, ps.map(j => h('li', {}, dateLongue(j.date) + (j.classeNom ? ' — ' + j.classeNom : '') + (j.serieTitre ? ' — série « ' + j.serieTitre + ' »' : '')))));
        })();

        p.appendChild(h('div', { class: 'auto-barre' },
            bouton('← Banque', () => { ui.question = null; rendre(); }),
            h('span', { class: 'auto-titre-fiche' }, neuve ? 'Nouvelle question' : 'Question'),
            h('span', { class: 'pw-espace' }),
            neuve ? null : bouton('Supprimer', () => supprimerQuestion(q.id), 'danger'),
            bouton(neuve ? 'Ajouter à la banque' : 'Enregistrer', async () => {
                if (!String(q.enonce || '').trim()) { dire('L\'énoncé est vide'); return; }
                const t = maintenant();
                if (neuve) donnees.questions.push({ id: id('q'), enonce: q.enonce.trim(), reponse: (q.reponse || '').trim(), theme: (q.theme || '').trim(), niveau: (q.niveau || '').trim(), cree: t, modifie: t });
                else { const x = donnees.questions.find(y => y.id === q.id); if (x) Object.assign(x, { enonce: q.enonce.trim(), reponse: (q.reponse || '').trim(), theme: (q.theme || '').trim(), niveau: (q.niveau || '').trim(), modifie: t }); }
                await enregistrer();
                ui.question = null; rendre();
                dire(neuve ? 'Question ajoutée à la banque' : 'Question enregistrée');
            }, 'primaire')
        ));
        p.appendChild(listeThemes); p.appendChild(listeNiveaux);
        p.appendChild(champ('Énoncé — les formules entre dollars : $x^2$', 'enonce', 3));
        p.appendChild(champ('Réponse', 'reponse', 2));
        p.appendChild(h('div', { class: 'auto-deux' }, h('div', { class: 'pw-champ' }, h('label', {}, 'Thème'), theme), h('div', { class: 'pw-champ' }, h('label', {}, 'Niveau'), niveau)));
        if (historique) p.appendChild(historique);
        setTimeout(() => { const z = p.querySelector('textarea'); if (z) z.focus(); }, 50);
    }

    // ---------------------------------------------------------------------
    // LES SÉRIES
    // ---------------------------------------------------------------------
    function nouvelleSerie(questionIds) {
        openSysPromptModal('Nouvelle série', 'Son titre — le chapitre, la semaine, ce que vous voulez :', 'Automatismes du ' + new Date().toLocaleDateString('fr-FR'), async (titre) => {
            if (!titre) return;
            const t = maintenant();
            const s = { id: id('s'), titre: titre.trim(), niveau: ui.filtre.niveau || '', questions: (questionIds || []).slice(), duree: 60, cree: t, modifie: t };
            donnees.series.unshift(s);
            ui.selection.clear(); ui.serieOuverte = s.id; ui.onglet = 'series';
            await enregistrer(); rendre();
        });
    }

    function rendreSeries(p) {
        const ouverte = ui.serieOuverte ? donnees.series.find(s => s.id === ui.serieOuverte) : null;
        if (ouverte) { rendreSerie(p, ouverte); return; }

        p.appendChild(h('div', { class: 'auto-barre' },
            h('span', { class: 'auto-titre-fiche' }, donnees.series.length + ' série' + (donnees.series.length > 1 ? 's' : '')),
            h('span', { class: 'pw-espace' }),
            bouton('+ Nouvelle série', () => nouvelleSerie([]), 'primaire')));
        if (!donnees.series.length) {
            p.appendChild(h('p', { class: 'auto-vide' }, 'Aucune série. Une série, c\'est l\'automatisme d\'une heure : cochez des questions dans la banque, ou créez-la vide et remplissez-la.'));
            return;
        }
        const liste = h('div', { id: 'auto-liste' });
        donnees.series.slice().sort((a, b) => (b.modifie || b.cree) - (a.modifie || a.cree)).forEach(s => {
            const donnees_ = donnees.journal.filter(j => j.serieId === s.id).sort((a, b) => b.date - a.date);
            liste.appendChild(h('div', { class: 'auto-serie', onclick: (e) => { if (e.target.closest('button')) return; ui.serieOuverte = s.id; rendre(); } },
                h('div', { class: 'auto-corps' },
                    h('div', { class: 'auto-serie-titre' }, s.titre),
                    h('div', { class: 'auto-trace' },
                        h('span', { class: 'auto-etiquette' }, s.questions.length + ' question' + (s.questions.length > 1 ? 's' : '')),
                        s.niveau ? h('span', { class: 'auto-etiquette niveau' }, s.niveau) : null,
                        h('span', { class: 'auto-posee' + (donnees_.length ? '' : ' jamais') },
                            donnees_.length ? 'donnée ' + donnees_.length + ' fois · ' + donnees_.map(j => (j.classeNom || '?') + ' (' + dateCourte(j.date) + ')').slice(0, 3).join(', ') : 'jamais donnée'))),
                h('div', { class: 'auto-actions' },
                    h('button', { class: 'auto-petit', title: 'Projeter', onclick: () => projeter(s) }, '▶'),
                    h('button', { class: 'auto-petit danger', title: 'Supprimer la série', onclick: () => supprimerSerie(s.id) }, '🗑'))));
        });
        p.appendChild(liste);
    }

    function supprimerSerie(sid) {
        openConfirmModal('Supprimer cette série ?', 'Les questions restent dans la banque, et le journal garde ce qui a été donné.', true, async () => {
            donnees.series = donnees.series.filter(s => s.id !== sid);
            if (ui.serieOuverte === sid) ui.serieOuverte = null;
            await enregistrer(); rendre();
        });
    }

    function rendreSerie(p, s) {
        const cdm = classeDuMomentNom();
        p.appendChild(h('div', { class: 'auto-barre' },
            bouton('← Séries', () => { ui.serieOuverte = null; rendre(); }),
            h('span', { class: 'auto-titre-fiche', title: 'Double-clic pour renommer', ondblclick: () => openSysPromptModal('Renommer la série', 'Titre :', s.titre, async (t) => { if (t) { s.titre = t.trim(); s.modifie = maintenant(); await enregistrer(); rendre(); } }) }, s.titre),
            h('span', { class: 'pw-espace' }),
            h('label', { class: 'auto-duree' }, 'Durée par question ',
                (() => { const i = h('input', { type: 'number', min: 0, max: 600, step: 5, class: 'pw-nombre', style: 'width:64px', value: s.duree || 0,
                    onchange: async (e) => { s.duree = Math.max(0, parseInt(e.target.value, 10) || 0); s.modifie = maintenant(); await enregistrer(); } }); return i; })(), ' s'),
            bouton('Poser au tableau', () => tamponner(s)),
            bouton('Marquer comme donnée', () => marquerDonnee(s)),
            bouton('▶ Projeter' + (cdm ? ' à ' + cdm.nom : ''), () => projeter(s), 'primaire')
        ));
        if (!cdm) p.appendChild(h('p', { class: 'auto-avis' }, 'Aucune classe du moment : la projection sera notée au journal sans classe. Choisissez la classe dans la pastille en haut à droite du tableau pour que le journal sache à qui vous l\'avez donnée.'));

        const liste = h('div', { id: 'auto-liste' });
        if (!s.questions.length) liste.appendChild(h('p', { class: 'auto-vide' }, 'Cette série est vide. Ajoutez des questions depuis la banque (cochez, puis « Ajouter à cette série »).'));
        s.questions.forEach((qid, i) => {
            const q = donnees.questions.find(x => x.id === qid);
            const enonce = h('div', { class: 'auto-enonce' });
            if (q) composer(enonce, q.enonce); else enonce.textContent = '(question supprimée de la banque)';
            const reponse = h('div', { class: 'auto-reponse' });
            if (q && q.reponse) composer(reponse, q.reponse);
            const bouger = async (d) => { const j = i + d; if (j < 0 || j >= s.questions.length) return; [s.questions[i], s.questions[j]] = [s.questions[j], s.questions[i]]; s.modifie = maintenant(); await enregistrer(); rendre(); };
            liste.appendChild(h('div', { class: 'auto-question' },
                h('span', { class: 'auto-numero' }, String(i + 1)),
                h('div', { class: 'auto-corps' }, enonce, reponse,
                    q ? h('div', { class: 'auto-trace' }, q.theme ? h('span', { class: 'auto-etiquette' }, q.theme) : null,
                        (() => { const ps = poses(qid, cdm ? cdm.id : null); return cdm ? h('span', { class: 'auto-posee ' + (ps.length ? 'deja' : 'jamais') }, ps.length ? 'déjà donnée à ' + cdm.nom + ' le ' + dateCourte(ps.sort((a, b) => b.date - a.date)[0].date) : 'jamais donnée à ' + cdm.nom) : null; })()) : null),
                h('div', { class: 'auto-actions' },
                    h('button', { class: 'auto-petit', title: 'Monter', onclick: () => bouger(-1) }, '↑'),
                    h('button', { class: 'auto-petit', title: 'Descendre', onclick: () => bouger(1) }, '↓'),
                    h('button', { class: 'auto-petit danger', title: 'Retirer de la série', onclick: async () => { s.questions.splice(i, 1); s.modifie = maintenant(); await enregistrer(); rendre(); } }, '✕'))));
        });
        p.appendChild(liste);
        p.appendChild(h('div', { class: 'auto-barre' }, bouton('+ Ajouter des questions de la banque', () => { ui.onglet = 'banque'; ui.question = null; rendre(); })));
    }

    // ---------------------------------------------------------------------
    // LE JOURNAL
    // ---------------------------------------------------------------------
    async function noterAuJournal(s, mode) {
        await classes();
        const cdm = classeDuMomentNom();
        const entree = { id: id('j'), date: maintenant(), classeId: cdm ? cdm.id : null, classeNom: cdm ? cdm.nom : '',
                         serieId: s.id, serieTitre: s.titre, questions: s.questions.slice(), mode: mode || 'projection', note: '' };
        donnees.journal.unshift(entree);
        await enregistrer();
        return entree;
    }

    function marquerDonnee(s) {
        classes().then(() => {
            const cdm = classeDuMomentNom();
            openConfirmModal('Marquer cette série comme donnée ?',
                (cdm ? 'À ' + cdm.nom + ', aujourd\'hui' : 'Aujourd\'hui, sans classe (aucune classe du moment)') + ' — sans la projeter, par exemple parce qu\'elle a été donnée sur papier.',
                false, async () => { await noterAuJournal(s, 'papier'); dire('Noté au journal'); rendre(); });
        });
    }

    function rendreJournal(p) {
        const f = ui.filtreJournal;
        p.appendChild(h('div', { class: 'auto-barre' },
            h('input', { class: 'auto-recherche', type: 'search', placeholder: 'Rechercher dans le journal…', value: f.texte, oninput: (e) => { f.texte = e.target.value; rendreListeJournal(); } }),
            (() => { const s = selectClasses(f.classe, (v) => { f.classe = v; rendreListeJournal(); }); s.style.width = 'auto'; return s; })(),
            h('span', { class: 'pw-espace' }),
            h('span', { class: 'auto-avis', style: 'margin:0' }, 'Chaque projection s\'écrit ici toute seule.')));
        p.appendChild(h('div', { id: 'auto-liste' }));
        rendreListeJournal();
    }

    function rendreListeJournal() {
        const liste = el('#auto-liste'); if (!liste) return;
        liste.textContent = '';
        const f = ui.filtreJournal, t = f.texte.trim().toLowerCase();
        // On cherche dans le titre, la classe, et chaque question — son énoncé
        // ET son thème : « fraction » retrouve la séance des fractions même si
        // aucun énoncé n'écrit le mot.
        const texteDe = (j) => (j.serieTitre + ' ' + j.classeNom + ' ' + j.questions.map(qid => { const q = donnees.questions.find(x => x.id === qid); return q ? q.enonce + ' ' + q.theme : ''; }).join(' ')).toLowerCase();
        const entrees = donnees.journal.filter(j => (!f.classe || j.classeId === f.classe) && (!t || texteDe(j).includes(t)))
            .sort((a, b) => b.date - a.date);
        if (!donnees.journal.length) { liste.appendChild(h('p', { class: 'auto-vide' }, 'Le journal est vide : projetez une série, et elle s\'y inscrira avec la classe du moment.')); return; }
        if (!entrees.length) { liste.appendChild(h('p', { class: 'auto-vide' }, 'Rien ne répond à ces filtres.')); return; }
        let jour = '';
        entrees.forEach(j => {
            const d = dateLongue(j.date);
            if (d !== jour) { jour = d; liste.appendChild(h('div', { class: 'auto-jour' }, d.charAt(0).toUpperCase() + d.slice(1))); }
            const detail = h('div', { class: 'auto-detail', hidden: '' });
            j.questions.forEach((qid, i) => {
                const q = donnees.questions.find(x => x.id === qid);
                const e = h('div', { class: 'auto-enonce petit' });
                if (q) composer(e, q.enonce); else e.textContent = '(question supprimée)';
                detail.appendChild(h('div', { class: 'auto-detail-ligne' }, h('span', { class: 'auto-numero' }, String(i + 1)), e));
            });
            const serie = donnees.series.find(s => s.id === j.serieId);
            const ligne = h('div', { class: 'auto-entree' },
                h('div', { class: 'auto-corps', onclick: (e) => { if (e.target.closest('button')) return; detail.hidden = !detail.hidden; } },
                    h('div', { class: 'auto-entree-titre' },
                        h('span', { class: 'auto-heure' }, new Date(j.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
                        h('strong', {}, j.classeNom || 'Sans classe'), ' — ', j.serieTitre || 'Série',
                        h('span', { class: 'auto-etiquette' }, j.questions.length + ' question' + (j.questions.length > 1 ? 's' : '')),
                        j.mode === 'papier' ? h('span', { class: 'auto-etiquette niveau' }, 'sur papier') : null),
                    detail),
                h('div', { class: 'auto-actions' },
                    serie ? h('button', { class: 'auto-petit', title: 'Ouvrir la série', onclick: () => { ui.serieOuverte = serie.id; ui.onglet = 'series'; rendre(); } }, '↗') : null,
                    serie ? h('button', { class: 'auto-petit', title: 'Projeter à nouveau', onclick: () => projeter(serie) }, '▶') : null,
                    h('button', { class: 'auto-petit danger', title: 'Retirer cette ligne du journal', onclick: () => openConfirmModal('Retirer du journal ?', 'La série et ses questions restent.', true, async () => { donnees.journal = donnees.journal.filter(x => x.id !== j.id); await enregistrer(); rendre(); }) }, '🗑')));
            liste.appendChild(ligne);
        });
    }

    // ---------------------------------------------------------------------
    // LA PROJECTION : une question à la fois, en grand
    // ---------------------------------------------------------------------
    const proj = { el: null, serie: null, i: 0, minuteur: null, toutes: false, touches: null, plein: null };

    async function projeter(s) {
        if (!s.questions.length) { dire('Cette série est vide : rien à projeter'); return; }
        await noterAuJournal(s, 'projection');
        fermer();
        proj.serie = s; proj.i = 0; proj.toutes = false;
        proj.el = document.createElement('div');
        proj.el.id = 'auto-projection';
        proj.el.className = 'auto-projection';
        document.body.appendChild(proj.el);
        try { await proj.el.requestFullscreen(); } catch (e) { /* pas de plein écran : la fenêtre suffit */ }
        proj.touches = (e) => {
            if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); suivante(); }
            else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); precedente(); }
            else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); reveler(); }
            else if (e.key === 'Escape') { e.preventDefault(); arreter(); }
            else if (e.key.toLowerCase() === 't') { proj.toutes = !proj.toutes; rendreDiapo(); }
        };
        window.addEventListener('keydown', proj.touches, true);
        proj.plein = () => { if (!document.fullscreenElement && proj.el) arreter(); };
        document.addEventListener('fullscreenchange', proj.plein);
        rendreDiapo();
    }

    function rendreDiapo() {
        if (!proj.el) return;
        const s = proj.serie, n = s.questions.length;
        const q = donnees.questions.find(x => x.id === s.questions[proj.i]);
        arreterLeMinuteur();
        proj.el.textContent = '';
        proj.el.appendChild(h('div', { class: 'auto-proj-jauge', id: 'auto-jauge' }));
        proj.el.appendChild(h('button', { class: 'auto-proj-fermer', title: 'Quitter (Échap)', onclick: arreter }, '✕'));
        proj.el.appendChild(h('div', { class: 'auto-proj-titre' }, s.titre, ' — ', proj.toutes ? 'correction' : 'question ' + (proj.i + 1) + ' / ' + n));

        if (proj.toutes) {
            const grille = h('div', { class: 'auto-proj-grille' });
            s.questions.forEach((qid, i) => {
                const x = donnees.questions.find(y => y.id === qid);
                const e = h('div', { class: 'auto-proj-enonce' }); if (x) composer(e, x.enonce);
                const r = h('div', { class: 'auto-proj-reponse' }); if (x && x.reponse) composer(r, x.reponse);
                grille.appendChild(h('div', { class: 'auto-proj-case' }, h('span', { class: 'auto-numero grand' }, String(i + 1)), h('div', {}, e, r)));
            });
            proj.el.appendChild(grille);
        } else {
            const enonce = h('div', { class: 'auto-proj-question' });
            if (q) composer(enonce, q.enonce); else enonce.textContent = '(question supprimée de la banque)';
            proj.el.appendChild(enonce);
            const reponse = h('div', { class: 'auto-proj-reponse cachee', id: 'auto-proj-reponse' });
            if (q && q.reponse) composer(reponse, q.reponse); else reponse.textContent = q ? '(pas de réponse notée)' : '';
            proj.el.appendChild(reponse);
        }
        proj.el.appendChild(h('div', { class: 'auto-proj-barre' },
            h('button', { class: 'auto-proj-btn', onclick: precedente, disabled: proj.i === 0 && !proj.toutes ? '' : null }, '← Précédente'),
            proj.toutes ? null : h('button', { class: 'auto-proj-btn primaire', onclick: reveler }, 'Réponse (Espace)'),
            h('button', { class: 'auto-proj-btn', onclick: () => { proj.toutes = !proj.toutes; rendreDiapo(); } }, proj.toutes ? 'Une par une (T)' : 'Toutes — correction (T)'),
            h('button', { class: 'auto-proj-btn', onclick: () => { arreter(); tamponner(s); } }, 'Poser au tableau'),
            h('button', { class: 'auto-proj-btn', onclick: suivante }, proj.i >= n - 1 || proj.toutes ? 'Terminer' : 'Suivante →')));
        if (!proj.toutes && s.duree > 0) demarrerLeMinuteur(s.duree);
    }

    function demarrerLeMinuteur(secondes) {
        const j = document.getElementById('auto-jauge'); if (!j) return;
        j.style.transition = 'none'; j.style.width = '100%';
        setTimeout(() => { j.style.transition = 'width ' + secondes + 's linear'; j.style.width = '0%'; }, 30);
        proj.minuteur = setTimeout(reveler, secondes * 1000);
    }
    function arreterLeMinuteur() { if (proj.minuteur) { clearTimeout(proj.minuteur); proj.minuteur = null; } const j = document.getElementById('auto-jauge'); if (j) { j.style.transition = 'none'; j.style.width = '0%'; } }
    function reveler() { arreterLeMinuteur(); const r = document.getElementById('auto-proj-reponse'); if (r) r.classList.remove('cachee'); }
    function suivante() { if (proj.toutes || proj.i >= proj.serie.questions.length - 1) { arreter(); return; } proj.i++; rendreDiapo(); }
    function precedente() { if (proj.toutes) { proj.toutes = false; rendreDiapo(); return; } if (proj.i > 0) { proj.i--; rendreDiapo(); } }
    function arreter() {
        arreterLeMinuteur();
        if (proj.touches) window.removeEventListener('keydown', proj.touches, true);
        if (proj.plein) document.removeEventListener('fullscreenchange', proj.plein);
        proj.touches = null; proj.plein = null;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        if (proj.el) { proj.el.remove(); proj.el = null; }
        proj.serie = null;
    }

    // ---------------------------------------------------------------------
    // LE TAMPON : la série posée sur le tableau, pour la corriger dessus
    // ---------------------------------------------------------------------
    let tampon = null;

    async function tamponner(s) {
        if (!s.questions.length) { dire('Cette série est vide : rien à poser'); return; }
        fermer();
        dire('Composition de la série…');
        const corps = 22, largeur = 900, marge = 34, interligne = 14;
        const qs = s.questions.map(qid => donnees.questions.find(x => x.id === qid)).filter(Boolean);
        const dessins = [];
        for (const q of qs) dessins.push(await svgDe(q.enonce, corps, '#2d3436'));
        const cdm = classeDuMomentNom();
        const entete = 58;
        let y = marge + entete;
        const lignes = [];
        qs.forEach((q, i) => {
            const d = dessins[i];
            const hh = d ? Math.max(d.h, corps + 6) : corps + 6;
            lignes.push({ y, h: hh, d, q, i });
            y += hh + interligne;
        });
        const hauteur = y - interligne + marge;
        let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + largeur + '" height="' + hauteur + '" viewBox="0 0 ' + largeur + ' ' + hauteur + '">';
        svg += '<rect width="' + largeur + '" height="' + hauteur + '" fill="#ffffff" rx="8" stroke="#dfe6e9" stroke-width="1.5"/>';
        svg += '<text x="' + marge + '" y="' + (marge + 10) + '" font-family="sans-serif" font-size="22" font-weight="bold" fill="#2d3436">' + echapper(s.titre) + '</text>';
        svg += '<text x="' + (largeur - marge) + '" y="' + (marge + 10) + '" text-anchor="end" font-family="sans-serif" font-size="13" fill="#b2bec3">' + echapper((cdm ? cdm.nom + ' · ' : '') + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })) + '</text>';
        svg += '<line x1="' + marge + '" y1="' + (marge + 24) + '" x2="' + (largeur - marge) + '" y2="' + (marge + 24) + '" stroke="#eceff1" stroke-width="1.5"/>';
        lignes.forEach(l => {
            svg += '<text x="' + marge + '" y="' + (l.y + l.h / 2 + 7) + '" font-family="sans-serif" font-size="19" font-weight="bold" fill="#0984e3">' + (l.i + 1) + '.</text>';
            if (l.d) svg += '<g transform="translate(' + (marge + 40) + ',' + (l.y + (l.h - l.d.h) / 2) + ')">' + l.d.svg + '</g>';
            else svg += '<text x="' + (marge + 40) + '" y="' + (l.y + l.h / 2 + 7) + '" font-family="sans-serif" font-size="' + corps + '" fill="#2d3436">' + echapper(l.q.enonce) + '</text>';
            svg += '<line x1="' + marge + '" y1="' + (l.y + l.h + interligne / 2) + '" x2="' + (largeur - marge) + '" y2="' + (l.y + l.h + interligne / 2) + '" stroke="#f4f6f8" stroke-width="1"/>';
        });
        svg += '</svg>';
        createStampFromSVG(svg, (st) => {
            tampon = (typeof ajusterTampon === 'function') ? ajusterTampon(st) : st;
            tampon.serieId = s.id;
            if (typeof setMode === 'function') setMode('automatismesTool');
            dire('📌 Cliquez sur le tableau pour poser la série');
        });
    }

    // ---------------------------------------------------------------------
    // L'OUTIL
    // ---------------------------------------------------------------------
    const ICONE = '<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M12 3l1.8 3.6L18 7.2l-3 2.9.7 4.1L12 12.3l-3.7 1.9.7-4.1-3-2.9 4.2-.6z"/><path d="M4 20h16"/><path d="M7 17h10"/></svg>';

    registerPlugin('automatismesTool', 'Exercices', {
        init: function () {
            const grid = document.getElementById('plugins-grid'); if (!grid) return;
            const btn = document.createElement('button');
            btn.className = 'btn'; btn.id = 'btn-automatismes';
            btn.title = 'Automatismes : vos questions, vos séries, et le journal de ce qui a été donné';
            btn.setAttribute('data-tooltip', 'Automatismes');
            btn.innerHTML = ICONE;
            grid.appendChild(btn);
            btn.addEventListener('click', (e) => { e.stopPropagation(); if (typeof setMode === 'function') setMode('pointer'); ouvrir(); });
        },
        edit: function () { ouvrir(); },

        onPointerDown: function (pos) {
            if (typeof mode === 'undefined' || mode !== 'automatismesTool' || !tampon) return false;
            if (typeof imageCache !== 'undefined') imageCache[tampon.src] = tampon.img;
            images.push({ id: nextId++, x: pos.x - tampon.w / 2, y: pos.y - tampon.h / 2, w: tampon.w, h: tampon.h,
                cx: 0, cy: 0, cw: tampon.cw || tampon.w, ch: tampon.ch || tampon.h, src: tampon.src, z: globalZ++,
                pluginData: { id: 'automatismesTool', serieId: tampon.serieId } });
            tampon = null;
            if (typeof saveState === 'function') saveState();
            if (typeof setMode === 'function') setMode('pointer');
            if (typeof draw === 'function') draw();
            return true;
        },
        onDraw: function (ctx) {
            if (typeof mode === 'undefined' || mode !== 'automatismesTool' || !tampon || typeof mouseLogicalPos === 'undefined' || !mouseLogicalPos) return;
            ctx.globalAlpha = 0.8;
            ctx.drawImage(tampon.img, mouseLogicalPos.x - tampon.w / 2, mouseLogicalPos.y - tampon.h / 2, tampon.w, tampon.h);
            ctx.globalAlpha = 1;
        },
        onPointerMove: function (rawPos) {
            if (typeof mode !== 'undefined' && mode === 'automatismesTool' && tampon) {
                if (typeof mouseLogicalPos !== 'undefined') mouseLogicalPos = { x: rawPos.x, y: rawPos.y };
                if (typeof draw === 'function') draw();
            }
            return false;
        }
    });

    window.Automatismes = {
        ouvrir, fermer, charger, enregistrer, rendre, projeter, arreter, tamponner, marquerDonnee,
        importerDepuis, exporter, reprendreDuDrive, miroirDrive, noterAuJournal, poses, enLatex,
        donnees: () => donnees, ui, proj, etatDrive,
        nouvelleQuestion: async (q) => { await charger(); const t = maintenant(); const x = { id: id('q'), enonce: q.enonce || '', reponse: q.reponse || '', theme: q.theme || '', niveau: q.niveau || '', cree: t, modifie: t }; donnees.questions.push(x); await enregistrer(); return x; },
        nouvelleSerie: async (titre, questions, duree) => { await charger(); const t = maintenant(); const s = { id: id('s'), titre: titre || 'Série', niveau: '', questions: (questions || []).slice(), duree: duree === undefined ? 60 : duree, cree: t, modifie: t }; donnees.series.unshift(s); await enregistrer(); return s; }
    };
})();
