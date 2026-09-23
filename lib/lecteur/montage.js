// Une coupe enlève des états visibles du replay, jamais des gestes du
// tableau de travail. On reconstruit le raccord : supprimer un delta brut
// ferait disparaître aussi des objets nécessaires aux étapes suivantes.
(function () {
    'use strict';
    const familles = ['points', 'segments', 'circles', 'rectangles', 'texts',
        'freehands', 'curves', 'polygons', 'images', 'arcs', 'htmlPostits'];
    const copier = o => JSON.parse(JSON.stringify(o));
    const filmDe = p => (p.filmArchive || []).concat(p.film || []).filter(x => x && typeof x === 'object');
    const nombre = p => Math.max(1, filmDe(p).length);

    function normaliser(data, coupes) {
        const out = [];
        (coupes || []).forEach(c => {
            if (!c || !Number.isInteger(c.page) || !data.pages[c.page]
                || !Number.isInteger(c.debut) || !Number.isInteger(c.fin)) {
                throw new Error('Choisissez une page et des étapes valides.');
            }
            const n = nombre(data.pages[c.page]);
            if (c.debut < 0 || c.fin >= n || c.fin < c.debut) {
                throw new Error('La fin du passage doit suivre son début, sur la même page.');
            }
            out.push({ page: c.page, debut: c.debut, fin: c.fin });
        });
        out.sort((a, b) => a.page - b.page || a.debut - b.debut);
        return out.reduce((acc, c) => {
            const dernier = acc[acc.length - 1];
            if (dernier && dernier.page === c.page && c.debut <= dernier.fin + 1) dernier.fin = Math.max(dernier.fin, c.fin);
            else acc.push(c);
            return acc;
        }, []);
    }

    function bilan(data, coupes) {
        const passages = normaliser(data, coupes);
        const total = data.pages.reduce((n, p) => n + nombre(p), 0);
        const retirees = passages.reduce((n, c) => n + c.fin - c.debut + 1, 0);
        return { total, retirees, gardees: total - retirees, passages };
    }

    function appliquer(avant, pas) {
        const apres = {};
        familles.forEach(f => {
            const d = pas[f];
            apres[f] = d === undefined ? (avant ? avant[f] : [])
                : Array.isArray(d) ? d : (avant ? avant[f] : []).concat(d['+'] || []);
        });
        return apres;
    }

    function raccord(avant, apres) {
        const pas = {};
        familles.forEach(f => {
            const a = avant && avant[f], b = apres[f];
            if (a === b) return;
            // Les objets non modifiés gardent la même référence pendant le
            // décodage ; aucun instantané complet n'est nécessaire par pas.
            if (a && a.length <= b.length && a.every((o, i) => o === b[i])) {
                if (a.length !== b.length) pas[f] = { '+': b.slice(a.length) };
            } else pas[f] = b;
        });
        return pas;
    }

    function monter(source, coupes, avecDocuments = true) {
        const stats = bilan(source, coupes);
        if (!stats.gardees) throw new Error('Gardez au moins une étape dans la séance.');
        const data = copier(source);
        data.pages = data.pages.flatMap((p, page) => {
            const passages = stats.passages.filter(c => c.page === page);
            const retire = i => passages.some(c => i >= c.debut && i <= c.fin);
            const film = filmDe(p);
            delete p.history;
            delete p.historyIndex;
            delete p.preview;
            delete p.filmArchive;
            if (!film.length) {
                if (retire(0)) return [];
                p.film = [];
                if (!avecDocuments) p.images = [];
                return [p];
            }
            let etat = null, dernier = null, indexDernier = -2;
            const retenu = [];
            film.forEach((pas, i) => {
                etat = appliquer(etat, pas);
                if (retire(i)) return;
                // Réutiliser les différences entre deux pas contigus. Seul
                // le premier pas après une coupe demande un nouveau raccord.
                const suivant = indexDernier === i - 1 ? { ...pas } : raccord(dernier, etat);
                if (pas.t !== undefined) suivant.t = pas.t;
                if (!avecDocuments) {
                    delete suivant.images;
                    if (!retenu.length) suivant.images = [];
                }
                retenu.push(suivant);
                dernier = etat;
                indexDernier = i;
            });
            if (!retenu.length) return [];
            p.film = retenu;
            familles.forEach(f => { p[f] = f === 'images' && !avecDocuments ? [] : dernier[f]; });
            return [p];
        });
        // Une image qui n'existe que dans un passage coupé ne voyage pas
        // dans la copie publiée, pas même dans la réserve de documents.
        const utilises = new Set();
        const noter = img => {
            if (img && img.srcRef) utilises.add(img.srcRef);
            if (img && img.pluginData && img.pluginData.pdfRef) utilises.add(img.pluginData.pdfRef);
        };
        data.pages.forEach(p => {
            (p.images || []).forEach(noter);
            (p.film || []).forEach(pas => {
                const d = pas.images;
                (Array.isArray(d) ? d : (d && d['+']) || []).forEach(noter);
            });
        });
        data.assets = Object.fromEntries(Object.entries(data.assets || {}).filter(([id]) => utilises.has(id)));
        delete data.preview;
        return data;
    }

    // Les déplacements de la vue et les dates de sauvegarde ne sont pas
    // des modifications de la séance. Un autre tableau, en revanche, doit
    // toujours commencer avec ses propres coupes.
    function empreinte(data) {
        return JSON.stringify([data.nomDuTableau, data.currentBgIndex, data.showAxes,
            data.pasAxes, data.gridWeight, data.teintePapier, data.instruments, data.pages.map(p => [
            ...familles.map(f => p[f]), p.filmArchive, p.film
        ])]);
    }

    window.MontageReplay = { monter, bilan, normaliser, nombre, empreinte };
})();
