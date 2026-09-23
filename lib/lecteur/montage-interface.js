(function () {
    'use strict';
    function h(tag, attrs, ...enfants) {
        const e = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k.startsWith('on')) e[k] = v;
            else if (v !== false && v != null) e.setAttribute(k, v);
        });
        enfants.flat().forEach(c => { if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c); });
        return e;
    }
    const bouton = (texte, action, attrs = {}) => h('button', { type: 'button', class: 'pw-btn', onclick: action, ...attrs }, texte);

    function ouvrir(p, brouillon, terminer) {
        const data = brouillon.tableau.data;
        const canal = 'montage-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        const adresse = new URL('index.html', location.href);
        adresse.search = new URLSearchParams({ lecteur: '1', montage: canal }).toString();
        adresse.hash = '';
        const origine = location.origin;
        const cible = origine === 'null' ? '*' : origine;
        const cadre = h('iframe', { id: 'montage-lecteur', title: 'Lecteur du montage', src: adresse.href });
        let apercu = false, pret = false, charge = false, version = 0;
        let position = brouillon.position || { page: 0, index: 0 };
        let pageSelection = position.page;

        const etat = h('p', { class: 'montage-position', id: 'montage-position', 'aria-live': 'polite' }, 'Chargement du lecteur…');
        const erreur = h('p', { class: 'pub-erreur', role: 'alert', id: 'montage-erreur' });
        const debut = h('input', { id: 'montage-debut', type: 'number', min: '1', step: '1', value: String(position.index + 1), class: 'pw-champ-texte' });
        const fin = h('input', { id: 'montage-fin', type: 'number', min: '1', step: '1', value: String(position.index + 1), class: 'pw-champ-texte' });
        const marquer = (champ) => { champ.value = String(position.index + 1); envoyer({ action: 'pause' }); };
        const iciDebut = bouton('Début ici', () => marquer(debut));
        const iciFin = bouton('Fin ici', () => marquer(fin));
        const liste = h('div', { class: 'montage-coupes', id: 'montage-coupes' });
        const resume = h('p', { class: 'pub-texte', id: 'montage-resume', 'aria-live': 'polite' });
        const piste = h('div', { class: 'montage-piste', 'aria-hidden': 'true' });

        function envoyer(message) {
            if (pret) cadre.contentWindow.postMessage({ type: 'autableau:montage', canal, version, ...message }, cible);
        }
        function charger() {
            if (!pret) return;
            charge = false;
            version++;
            etat.textContent = 'Chargement du ' + (apercu ? 'montage' : 'tableau d’origine') + '…';
            actualiserCommandes();
            try {
                envoyer({ action: 'charger', objet: {
                    name: brouillon.meta.titre,
                    data: MontageReplay.monter(data, apercu ? brouillon.coupes : [], brouillon.documents),
                    seance: brouillon.meta
                }, position: apercu ? { page: 0, index: 0 } : position });
            } catch (e) { erreur.textContent = e.message; }
        }
        function changerVue(valeur) {
            apercu = valeur;
            erreur.textContent = '';
            original.setAttribute('aria-pressed', String(!apercu));
            resultat.setAttribute('aria-pressed', String(apercu));
            charger();
        }
        const original = bouton('1. Choisir les passages', () => changerVue(false), { 'aria-pressed': 'true', id: 'montage-original' });
        const resultat = bouton('2. Voir le montage', () => changerVue(true), { 'aria-pressed': 'false', id: 'montage-apercu' });
        const retirer = bouton('Retirer ce passage', () => {
            try {
                envoyer({ action: 'pause' });
                const c = { page: position.page, debut: Number(debut.value) - 1, fin: Number(fin.value) - 1 };
                const stats = MontageReplay.bilan(data, brouillon.coupes.concat(c));
                if (!stats.gardees) throw new Error('Gardez au moins une étape dans la séance.');
                brouillon.coupes = stats.passages;
                erreur.textContent = '';
                actualiserListe();
            } catch (e) { erreur.textContent = e.message; }
        }, { id: 'montage-retirer', class: 'pw-btn montage-retirer' });

        function actualiserCommandes() {
            [debut, fin, iciDebut, iciFin, retirer].forEach(e => { e.disabled = apercu || !charge; });
            const n = MontageReplay.nombre(data.pages[position.page]);
            debut.max = fin.max = String(n);
            piste.textContent = '';
            let avant = 0;
            const morceau = (longueur, coupe) => {
                if (longueur) piste.append(h('span', { style: 'flex:' + longueur, class: coupe ? 'retire' : '' }));
            };
            MontageReplay.normaliser(data, brouillon.coupes).filter(c => c.page === position.page).forEach(c => {
                morceau(c.debut - avant, false); morceau(c.fin - c.debut + 1, true); avant = c.fin + 1;
            });
            morceau(n - avant, false);
            piste.hidden = apercu;
        }
        function actualiserListe() {
            const stats = MontageReplay.bilan(data, brouillon.coupes);
            resume.textContent = stats.retirees
                ? stats.retirees + ' étape(s) retirée(s) · ' + stats.gardees + ' conservée(s) sur ' + stats.total + '.'
                : 'Aucune coupe · ' + stats.total + ' étape(s) conservée(s).';
            liste.textContent = '';
            stats.passages.forEach((c, i) => {
                const texte = 'Page ' + (c.page + 1) + ' · étapes ' + (c.debut + 1) + ' à ' + (c.fin + 1);
                liste.append(h('div', { class: 'montage-coupe' }, h('span', {}, texte),
                    bouton('Rétablir', () => {
                        brouillon.coupes = stats.passages.filter((_, k) => i !== k);
                        erreur.textContent = '';
                        actualiserListe();
                        if (apercu) charger();
                    }, { 'aria-label': 'Rétablir : ' + texte })));
            });
            actualiserCommandes();
        }
        function recevoir(e) {
            const m = e.data;
            if (e.source !== cadre.contentWindow || e.origin !== origine
                || !m || m.type !== 'autableau:montage' || m.canal !== canal) return;
            if (m.action === 'pret') { pret = true; charger(); return; }
            if (m.version !== version) return;
            if (m.action === 'erreur') { erreur.textContent = m.message; return; }
            if (m.action !== 'position') return;
            charge = true;
            if (!apercu) {
                position = brouillon.position = { page: m.page, index: m.index };
                if (pageSelection !== position.page) {
                    pageSelection = position.page;
                    debut.value = fin.value = String(position.index + 1);
                }
            }
            etat.textContent = (apercu ? 'Montage' : 'Original') + ' · page ' + (m.page + 1)
                + ' · étape ' + (m.index + 1) + ' sur ' + m.pas;
            actualiserCommandes();
        }
        window.addEventListener('message', recevoir);
        p.append(h('div', { class: 'montage-intro' },
            h('div', { class: 'pw-bloc-titre' }, 'Monter le replay'),
            h('p', { class: 'pub-texte' }, 'Parcourez la séance, marquez le début et la fin du passage inutile, puis retirez-le. Une coupe saute des étapes : le tableau reprend dans son état après ce passage.')),
            h('div', { class: 'montage-onglets', role: 'group', 'aria-label': 'Version affichée' }, original, resultat),
            cadre, etat, piste,
            h('div', { class: 'montage-selection' },
                h('div', { class: 'montage-borne' }, h('label', { for: 'montage-debut' }, 'Première étape à retirer'), debut, iciDebut),
                h('div', { class: 'montage-borne' }, h('label', { for: 'montage-fin' }, 'Dernière étape à retirer'), fin, iciFin), retirer),
            erreur, resume, liste,
            h('p', { class: 'pub-aide' }, 'Votre tableau d’origine reste intact. Les coupes sont conservées jusqu’au rechargement du site ; publiez pour garder le replay monté.'),
            h('div', { class: 'pw-pied' }, bouton('Continuer vers la publication', terminer, { class: 'pw-btn primaire' })));
        actualiserListe();
        // Changer d'onglet ou fermer détruit aussi le lecteur : aucun replay
        // caché ne continue à tourner derrière le tableau de travail.
        return () => { window.removeEventListener('message', recevoir); cadre.remove(); };
    }
    window.MontageInterface = { ouvrir };
})();
