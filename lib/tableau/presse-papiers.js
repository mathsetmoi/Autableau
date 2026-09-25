// Une seule source pour le collage : le presse-papiers du système. Une copie
// du tableau y transporte ses objets, identifiables sans consulter une ancienne
// copie en mémoire. Copier ailleurs remplace donc naturellement cette copie.
(function (racine) {
    'use strict';
    const PREFIXE = 'MEM_TABLEAU_V1:';
    const TYPES = new Set(['segment', 'circle', 'rectangle', 'curve', 'polygon',
        'freehand', 'text', 'image', 'arc']);

    function encoder(copie) {
        return PREFIXE + JSON.stringify({ items: copie.items, points: copie.points });
    }

    function decoder(texte) {
        if (!texte.startsWith(PREFIXE)) return null;
        let copie;
        try { copie = JSON.parse(texte.slice(PREFIXE.length)); }
        catch (_) { throw new Error('La copie du tableau est incomplète. Recopiez les éléments.'); }
        if (!copie || !Array.isArray(copie.items) || !Array.isArray(copie.points)
            || !copie.items.every(i => i && TYPES.has(i.type) && i.data
                && typeof i.data === 'object' && !Array.isArray(i.data))
            || !copie.points.every(p => p && Number.isFinite(p.id)
                && Number.isFinite(p.x) && Number.isFinite(p.y))) {
            throw new Error('La copie du tableau est invalide. Recopiez les éléments.');
        }
        return { items: copie.items, points: copie.points };
    }

    function depuisEvenement(dt) {
        return {
            texte: dt.getData('text/plain') || '',
            html: dt.getData('text/html') || '',
            images: Array.from(dt.items || []).filter(i => i.kind === 'file'
                && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean),
            types: Array.from(dt.types || [])
        };
    }

    async function lire(systeme) {
        // readText seul ne peut pas lire l'image copiée depuis WhatsApp.
        if (systeme && typeof systeme.read === 'function') {
            const elements = await systeme.read();
            const contenu = { texte: '', html: '', images: [], types: [] };
            for (const element of elements) {
                contenu.types.push(...element.types);
                // Plusieurs formats peuvent représenter UNE même image.
                const image = element.types.includes('image/png') ? 'image/png'
                    : element.types.find(t => t.startsWith('image/'));
                if (image) contenu.images.push(await element.getType(image));
                if (element.types.includes('text/plain')) {
                    contenu.texte += await (await element.getType('text/plain')).text();
                }
                if (element.types.includes('text/html')) {
                    contenu.html += await (await element.getType('text/html')).text();
                }
            }
            return contenu;
        }
        if (systeme && typeof systeme.readText === 'function') {
            return { texte: await systeme.readText(), html: '', images: [], types: ['text/plain'] };
        }
        throw new Error('Lecture du presse-papiers indisponible');
    }

    const api = { encoder, decoder, depuisEvenement, lire };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else racine.PressePapiersTableau = api;
})(typeof window !== 'undefined' ? window : globalThis);
