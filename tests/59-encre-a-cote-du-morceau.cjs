// L'ENCRE ÉCRITE À CÔTÉ D'UN MORCEAU DISPARAISSAIT.
//
// « Il faudrait régler le problème de la disparition de ce qui est affiché
// dans le tableau. » Sur la vidéo : un exercice découpé à gauche, la
// correction écrite à la main juste à côté — et, dès le relâcher, une partie
// des lettres n'est plus là. Ne restent que les bouts les plus éloignés.
//
// Deux règles, justes chacune, se contredisaient :
//   - un trait posé près d'un document lui est ACCROCHÉ (marge large : un mot
//     entouré en débordant doit suivre sa page) ;
//   - l'encre accrochée à un document ROGNÉ s'arrête à son cadre (ce qui a été
//     écrit sur la partie retirée ne bave pas autour).
// Un trait écrit à côté d'un morceau tombait dans les deux : accroché par la
// marge, puis coupé par le cadre — entièrement dehors, donc invisible. Les
// fragments assez loin pour échapper à la marge, eux, restaient.
//
// Désormais, l'accrochage note si l'objet a été posé SUR la page ou À CÔTÉ.
// Ce qui est à côté suit toujours le document, mais rien ne le coupe.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Un morceau : une image dont on ne montre que la moitié gauche.
const POSER_UN_MORCEAU = `async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 500;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 500);
    g.fillStyle = '#000'; g.fillRect(10, 10, 280, 480);
    const src = c.toDataURL();
    await new Promise(ok => { const i = new Image(); i.onload = () => { imageCache[src] = i; ok(); }; i.src = src; });
    const morceau = { id: nextId++, x: 50, y: 150, w: 150, h: 250, src, cx: 0, cy: 0, cw: 150, ch: 250, z: globalZ++ };
    images.push(morceau);
    return morceau.id;
}`;

// Combien de points d'un trait portent bien sa couleur à l'écran ?
const PIXELS_DU_TRAIT = `(trait) => {
    let n = 0;
    trait.points.forEach(p => {
        const d = ctx.getImageData(Math.round(panX + p.x * zoom), Math.round(panY + p.y * zoom), 1, 1).data;
        if (d[3] > 0 && d[0] > 150 && d[1] < 100) n++;
    });
    return n;
}`;

module.exports = async function (browser) {
    const r = creerRapport('L\'encre écrite à côté d\'un morceau reste visible');
    const { context, page, erreurs } = await ouvrirApp(browser);

    await page.evaluate(async (poser) => {
        images.length = 0; freehands.length = 0; points.length = 0; segments.length = 0;
        selectedItems = []; panX = 0; panY = 0; zoom = 1;
        encreAccrochee = true;
        setMode('freehand');
        activeStyle.lineWidth = 6; activeStyle.strokeColor = '#e74c3c';
        window.__morceau = await eval(poser)();
        draw();
    }, POSER_UN_MORCEAU);

    r.verifie('le morceau posé est bien tenu pour rogné',
        await page.evaluate(() => documentEstRogne(getObjectById('image', window.__morceau))));

    // ------------------------------------------------------------------
    // 1. ÉCRIRE À CÔTÉ DU MORCEAU : le trait s'accroche, et il reste visible
    // ------------------------------------------------------------------
    // Le bord droit du morceau est à x = 200 ; la marge d'accrochage vaut 35 %
    // de 150, soit 52 px. On écrit entre 210 et 250 : dans la marge, hors du cadre.
    const aCote = await page.evaluate(async (pixels) => {
        const c = document.getElementById('board');
        const stylet = (t, x, y, options = {}) => c.dispatchEvent(new PointerEvent(t, {
            pointerId: 7, pointerType: 'pen', pressure: 0.5, buttons: 1,
            clientX: x, clientY: y, bubbles: true, isPrimary: true, ...options
        }));
        stylet('pointerdown', 210, 200);
        for (let i = 1; i <= 20; i++) stylet('pointermove', 210 + i * 2, 200 + i);
        stylet('pointerup', 250, 220, { buttons: 0, pressure: 0 });
        await new Promise(ok => setTimeout(ok, 50));
        draw();
        const t = freehands[0];
        return {
            traits: freehands.length,
            accroche: !!(t && t.surObjet && t.surObjet.type === 'image'),
            aCote: t && t.surObjet ? t.surObjet.aCote : null,
            visibles: t ? eval(pixels)(t) : 0,
            total: t ? t.points.length : 0
        };
    }, PIXELS_DU_TRAIT);
    r.egal('un seul trait est posé', aCote.traits, 1, JSON.stringify(aCote));
    r.verifie('il est accroché au morceau — il le suivra quand on le déplacera',
        aCote.accroche, JSON.stringify(aCote));
    r.egal('et noté comme posé À CÔTÉ', aCote.aCote, true, JSON.stringify(aCote));
    r.verifie('donc visible : le cadre du morceau ne le coupe pas',
        aCote.visibles >= aCote.total * 0.8, JSON.stringify(aCote));

    // ------------------------------------------------------------------
    // 2. ÉCRIRE SUR LE MORCEAU : rien ne change, le cadre coupe toujours
    // ------------------------------------------------------------------
    // Un trait posé SUR la page, puis la page rognée sous lui : l'encre écrite
    // sur la partie retirée ne doit pas réapparaître autour du morceau.
    const dessus = await page.evaluate(async (pixels) => {
        freehands.length = 0;
        const c = document.getElementById('board');
        const stylet = (t, x, y, options = {}) => c.dispatchEvent(new PointerEvent(t, {
            pointerId: 7, pointerType: 'pen', pressure: 0.5, buttons: 1,
            clientX: x, clientY: y, bubbles: true, isPrimary: true, ...options
        }));
        stylet('pointerdown', 80, 380);
        for (let i = 1; i <= 20; i++) stylet('pointermove', 80 + i * 4, 380);
        stylet('pointerup', 160, 380, { buttons: 0, pressure: 0 });
        await new Promise(ok => setTimeout(ok, 50));
        const t = freehands[0];
        const avant = { aCote: t.surObjet ? t.surObjet.aCote : null };
        // On rogne le bas du morceau : le trait, à y = 380, n'est plus dans le cadre
        const m = getObjectById('image', window.__morceau);
        m.ch = 150; m.h = 150;
        draw();
        return { ...avant, visiblesApresRognage: eval(pixels)(t) };
    }, PIXELS_DU_TRAIT);
    r.egal('un trait écrit sur la page est noté comme posé dessus', dessus.aCote, false, JSON.stringify(dessus));
    r.egal('et quand on rogne la page sous lui, il s\'arrête au cadre comme avant',
        dessus.visiblesApresRognage, 0, JSON.stringify(dessus));

    // ------------------------------------------------------------------
    // 3. LES TABLEAUX D'AVANT : un trait accroché sans cette note
    // ------------------------------------------------------------------
    // On ne sait pas où il a été écrit ; on regarde où il est. Le morceau
    // montre la moitié gauche d'une page de 300 px : la page entière irait de
    // x = 50 à x = 350. Un trait au-delà n'a jamais pu être écrit dessus.
    const ancien = await page.evaluate((pixels) => {
        freehands.length = 0;
        const m = getObjectById('image', window.__morceau);
        m.ch = 250; m.h = 250;
        const trait = (x0) => {
            const t = { id: nextId++, points: [], color: '#e74c3c', width: 6, z: globalZ++,
                surObjet: { type: 'image', id: m.id } };     // accroché, sans « aCote »
            for (let i = 0; i < 20; i++) t.points.push({ x: x0 + i * 2, y: 300 + i });
            freehands.push(t);
            return t;
        };
        const horsPage = trait(370);        // au-delà de la page entière
        const partieRetiree = trait(215);   // sur la moitié retirée de la page
        draw();
        return { horsPage: eval(pixels)(horsPage), partieRetiree: eval(pixels)(partieRetiree), total: 20 };
    }, PIXELS_DU_TRAIT);
    r.verifie('un trait d\'un ancien tableau, hors de la page entière, est montré',
        ancien.horsPage >= ancien.total * 0.8, JSON.stringify(ancien));
    r.egal('et celui qui était sur la partie retirée reste caché, comme avant',
        ancien.partieRetiree, 0, JSON.stringify(ancien));

    // ------------------------------------------------------------------
    // 4. UNE FORME POSÉE À CÔTÉ suit la même règle
    // ------------------------------------------------------------------
    // Une forme s'accroche par son MILIEU, à 12 px près : un segment qui
    // commence au bord du morceau et s'en écarte un peu est accroché, mais
    // son milieu est dehors — il ne doit pas être coupé.
    const forme = await page.evaluate(() => {
        freehands.length = 0; points.length = 0; segments.length = 0;
        const depuis = nextId;
        const p1 = { id: nextId++, x: 203, y: 160 }, p2 = { id: nextId++, x: 219, y: 160 };
        points.push(p1, p2);
        const s = { id: nextId++, p1_id: p1.id, p2_id: p2.id, color: '#e74c3c', width: 3, z: globalZ++ };
        segments.push(s);
        accrocherLesNouvellesFormes(depuis);
        return { accroche: !!s.surObjet, aCote: s.surObjet ? s.surObjet.aCote : null,
            coupe: !!cadreQuiRogneCetObjet(s, 'segment') };
    });
    r.verifie('un segment posé à côté du morceau est accroché', forme.accroche, JSON.stringify(forme));
    r.egal('noté à côté', forme.aCote, true, JSON.stringify(forme));
    r.egal('et jamais coupé par le cadre', forme.coupe, false, JSON.stringify(forme));

    await page.evaluate(() => {
        images.length = 0; freehands.length = 0; points.length = 0; segments.length = 0;
        selectedItems = []; setMode('pointer'); draw();
    });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
