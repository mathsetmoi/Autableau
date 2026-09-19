// L'ENCRE QUI DISPARAÎT QUAND ON DÉPLACE LA VUE.
//
// « Lorsque je me déplace sur la page, l'écriture disparaît puis apparaît. »
// Sur la séance en cause — sept cents traits au stylet — le dessin complet, à
// certaines positions précises de la vue, ne peignait presque rien : 69
// pixels d'encre au lieu de 2 400, sans la moindre erreur. Un pas plus loin,
// tout revenait.
//
// Le tableau ne dessine que ce qui est dans la vue, et s'en remet pour cela à
// un découpage de l'espace en quadrants (Quadtree). Un nœud qui reçoit plus
// de seize objets se divise en quatre. Mais ce qui CHEVAUCHE une ligne médiane
// reste au nœud lui-même — et quand cela dépassait seize objets à son tour, le
// nœud se redivisait : « split » recréait quatre enfants NEUFS, en jetant ceux
// qui existaient avec tout ce qu'ils contenaient. Ces objets n'étaient plus
// retrouvés, donc plus dessinés. Les médianes suivant la vue, la perte allait
// et venait avec le déplacement.
//
// CE QU'ON TIENT :
//   — dix-sept traits dans un quadrant, puis quarante qui traversent la
//     médiane : les cinquante-sept sont retrouvés, et dessinés ;
//   — sur la vue qui les met en travers, l'encre du quadrant est bien là ;
//   — en glissant la vue pas à pas sur quatre cents traits, aucun trait
//     visible n'est oublié par le découpage (sans le correctif : 123 sur 137
//     manquaient à l'un des pas).
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('L\'encre ne disparaît plus quand on déplace la vue');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // 1. LE DÉCOUPAGE NE PERD PLUS CE QU'IL A DÉJÀ RANGÉ
    // ------------------------------------------------------------------
    const decoupage = await page.evaluate(() => {
        freehands.length = 0; images.length = 0; points.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        const L = canvas.width, H = canvas.height;
        const trait = (x0, y0, x1, y1, color) => ({ id: nextId++, color: color || '#e74c3c', width: 4, z: globalZ++,
            points: [{ x: x0, y: y0 }, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { x: x1, y: y1 }] });
        // Dix-sept traits bien dans le quart haut-gauche : le nœud racine se
        // divise et les range dans son premier enfant.
        for (let i = 0; i < 17; i++) freehands.push(trait(40 + i * 8, 40 + i * 6, 90 + i * 8, 60 + i * 6));
        // Quarante traits qui TRAVERSENT la médiane verticale : ils restent à
        // la racine, et la font déborder une seconde fois.
        for (let i = 0; i < 40; i++) freehands.push(trait(L / 2 - 60, 80 + i * 12, L / 2 + 60, 84 + i * 12, '#0984e3'));
        const minX = -panX / zoom, maxX = (L - panX) / zoom, minY = -panY / zoom, maxY = (H - panY) / zoom;
        buildRenderQuadtree(minX, maxX, minY, maxY);
        const retrouves = renderQuadtree.retrieve({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
            .filter(o => o.type === 'freehand').length;
        draw();
        // L'encre rouge du quart haut-gauche est-elle à l'écran ?
        const d = ctx.getImageData(0, 0, Math.floor(L / 2), Math.floor(H / 2)).data;
        let rouge = 0;
        for (let i = 0; i < d.length; i += 8) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) rouge++;
        return { total: freehands.length, retrouves, rouge };
    });
    r.egal('les cinquante-sept traits sont retrouvés par le découpage',
        { total: decoupage.total, retrouves: decoupage.retrouves }, { total: 57, retrouves: 57 }, JSON.stringify(decoupage));
    r.verifie('et l\'encre du quart haut-gauche est à l\'écran', decoupage.rouge > 100, JSON.stringify(decoupage));

    // ------------------------------------------------------------------
    // 2. EN GLISSANT LA VUE, AUCUN TRAIT VISIBLE N'EST OUBLIÉ
    // ------------------------------------------------------------------
    // Un tableau dense, comme une vraie séance : quatre cents traits courts
    // semés partout. À chaque pas de la vue, tout trait dont la boîte touche
    // l'écran doit être rendu par le découpage — c'est exactement ce que le
    // défaut ne garantissait plus, à certaines positions seulement.
    const glisse = await page.evaluate(() => {
        freehands.length = 0;
        let g = 12345; const alea = () => (g = (g * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 400; i++) {
            const x = alea() * 2200 - 400, y = alea() * 1600 - 300, a = alea() * 6.28;
            freehands.push({ id: nextId++, color: '#e74c3c', width: 3, z: globalZ++,
                points: [{ x, y }, { x: x + 40 * Math.cos(a), y: y + 40 * Math.sin(a) }, { x: x + 80 * Math.cos(a), y: y + 80 * Math.sin(a) }] });
        }
        const boite = (f) => { const xs = f.points.map(p => p.x), ys = f.points.map(p => p.y);
            return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
        let pire = null, pasTenus = 0;
        for (let k = 0; k < 40; k++) {
            panX = -300 + k * 23; panY = -100 + k * 17;
            const minX = -panX / zoom, maxX = (canvas.width - panX) / zoom, minY = -panY / zoom, maxY = (canvas.height - panY) / zoom;
            buildRenderQuadtree(minX, maxX, minY, maxY);
            const rendus = new Set(renderQuadtree.retrieve({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
                .filter(o => o.type === 'freehand').map(o => o.id));
            const visibles = freehands.filter(f => { const b = boite(f); return b.x1 >= minX && b.x0 <= maxX && b.y1 >= minY && b.y0 <= maxY; });
            const oublies = visibles.filter(f => !rendus.has(f.id)).length;
            if (oublies) pasTenus++;
            if (!pire || oublies > pire.oublies) pire = { k, pan: [panX, panY], visibles: visibles.length, oublies };
        }
        freehands.length = 0; draw();
        return { pire, pasTenus };
    });
    r.egal('à chacun des quarante pas, tout trait visible est rendu par le découpage',
        glisse.pasTenus, 0, JSON.stringify(glisse));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
