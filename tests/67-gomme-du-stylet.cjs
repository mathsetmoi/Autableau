// LA GOMME DU STYLET.
//
// Un stylet Wacom a deux bouts : la pointe, et une gomme. Retournée, elle
// touche la tablette par la gomme, et le navigateur le dit — bouton 5 à
// l'appui, bit 32 de « buttons » tant qu'elle appuie. Le tableau la prenait
// pour la pointe et dessinait.
//
// CE QU'ON TIENT :
//   — la gomme posée sur un trait l'efface, et ne dessine rien ;
//   — elle se frotte : un passage sur trois traits les emporte tous trois ;
//   — un seul pas d'annulation par frottement : Ctrl+Z rend les trois ;
//   — elle n'emporte que l'encre : une photo et un texte sous elle restent,
//     un trait verrouillé aussi ;
//   — l'outil d'avant revient au relâcher — et si c'était déjà la gomme, on
//     y reste ;
//   — la pointe, elle, écrit toujours.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Le stylet retourné : la gomme appuie (bouton 5, bit 32).
const GOMME = `(t, x, y, o = {}) => document.getElementById('board').dispatchEvent(new PointerEvent(t, {
    pointerId: 7, pointerType: 'pen', pressure: 0.5, button: t === 'pointerdown' ? 5 : -1,
    buttons: t === 'pointerup' ? 0 : 32, clientX: x, clientY: y, bubbles: true, isPrimary: true, ...o }))`;
// Trois traits horizontaux, l'un sous l'autre, à x de 300 à 500 — échantillonnés
// tous les quatre pixels, comme un vrai trait au stylet.
const TROIS_TRAITS = `() => {
    freehands.length = 0; selectedItems = [];
    [200, 260, 320].forEach(y => {
        const points = []; for (let x = 300; x <= 500; x += 4) points.push({ x, y, p: 0.5 });
        freehands.push({ id: nextId++, color: '#e74c3c', width: 4, z: globalZ++, points });
    });
    saveState();      // l'état d'avant, pour que Ctrl+Z ait où revenir
    draw();
}`;

module.exports = async function (browser) {
    const r = creerRapport('La gomme du stylet');
    const { context, page, erreurs } = await ouvrirApp(browser);

    r.verifie('le module de la gomme est là', await page.evaluate(() => typeof GommeDuStylet === 'object' && !!GommeDuStylet.compte));

    await page.evaluate(() => { panX = 0; panY = 0; zoom = 1; images.length = 0; texts.length = 0; setMode('freehand'); });

    // ------------------------------------------------------------------
    // 1. LA GOMME POSÉE SUR UN TRAIT L'EFFACE, ET NE DESSINE RIEN
    // ------------------------------------------------------------------
    const pose = await page.evaluate(async ({ gomme, traits }) => {
        eval(traits)();
        const ev = eval(gomme);
        const avant = { traits: freehands.length, mode, histo: history.length };
        ev('pointerdown', 400, 200);
        const pendant = { mode, ecrit: isDrawingFreehand, traits: freehands.length };
        ev('pointerup', 400, 200);
        await new Promise(ok => setTimeout(ok, 50));
        return { avant, pendant, apres: { traits: freehands.length, mode, histo: history.length } };
    }, { gomme: GOMME, traits: TROIS_TRAITS });
    r.egal('pendant le contact, l\'outil est la gomme, et rien ne s\'écrit',
        { mode: pose.pendant.mode, ecrit: pose.pendant.ecrit, traits: pose.pendant.traits },
        { mode: 'eraser', ecrit: false, traits: 2 }, JSON.stringify(pose));
    r.egal('au relâcher : un trait de moins, le crayon revenu, un pas d\'annulation',
        { traits: pose.apres.traits, mode: pose.apres.mode, histo: pose.apres.histo - pose.avant.histo },
        { traits: 2, mode: 'freehand', histo: 1 }, JSON.stringify(pose));

    // ------------------------------------------------------------------
    // 2. ELLE SE FROTTE : trois traits en un passage, un seul pas d'annulation
    // ------------------------------------------------------------------
    const frotte = await page.evaluate(async ({ gomme, traits }) => {
        eval(traits)();
        const ev = eval(gomme);
        const histoAvant = history.length;
        // De haut en bas, en travers des trois traits, par petits pas
        ev('pointerdown', 350, 180);
        for (let y = 190; y <= 340; y += 10) ev('pointermove', 350, y);
        const pendant = { traits: freehands.length, histo: history.length - histoAvant };
        ev('pointerup', 350, 340);
        await new Promise(ok => setTimeout(ok, 50));
        const apres = { traits: freehands.length, histo: history.length - histoAvant, mode };
        // Ctrl+Z rend les trois d'un coup
        if (typeof undo === 'function') undo();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
        await new Promise(ok => setTimeout(ok, 100));
        return { pendant, apres, rendus: freehands.length };
    }, { gomme: GOMME, traits: TROIS_TRAITS });
    r.egal('un passage emporte les trois traits, sans écrire d\'historique en route',
        frotte.pendant, { traits: 0, histo: 0 }, JSON.stringify(frotte));
    r.egal('au relâcher, un seul pas d\'annulation, et le crayon revenu',
        frotte.apres, { traits: 0, histo: 1, mode: 'freehand' }, JSON.stringify(frotte));
    r.egal('et Ctrl+Z rend les trois d\'un coup', frotte.rendus, 3, JSON.stringify(frotte));

    // ------------------------------------------------------------------
    // 3. ELLE N'EMPORTE QUE L'ENCRE
    // ------------------------------------------------------------------
    const epargne = await page.evaluate(async ({ gomme }) => {
        freehands.length = 0; selectedItems = [];
        // Une photo, un texte, un trait verrouillé — et un trait libre sur la photo
        const c = document.createElement('canvas'); c.width = 200; c.height = 200;
        const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 200, 200);
        const src = c.toDataURL();
        await new Promise(ok => { const i = new Image(); i.onload = () => { imageCache[src] = i; ok(); }; i.src = src; });
        images.push({ id: nextId++, x: 300, y: 400, w: 200, h: 200, src, cx: 0, cy: 0, cw: 200, ch: 200, z: globalZ++ });
        texts.push({ id: nextId++, x: 600, y: 450, content: 'Énoncé', fontSize: 24, color: '#000', z: globalZ++, _cachedW: 90, _cachedH: 30, _cachedStartX: 600 });
        freehands.push({ id: nextId++, color: '#e74c3c', width: 4, z: globalZ++, locked: true,
            points: [{ x: 300, y: 700 }, { x: 400, y: 700 }, { x: 500, y: 700 }] });
        freehands.push({ id: nextId++, color: '#0984e3', width: 4, z: globalZ++,
            points: [{ x: 320, y: 500 }, { x: 400, y: 500 }, { x: 480, y: 500 }] });
        draw();
        const ev = eval(gomme);
        const epargnesAvant = GommeDuStylet.compte.epargnes;
        // Sur la photo, à côté du trait libre : rien ne doit partir
        ev('pointerdown', 350, 430); ev('pointermove', 450, 430);
        // Sur le texte
        ev('pointermove', 640, 460);
        // Sur le trait verrouillé
        ev('pointermove', 400, 700);
        // Puis sur le trait libre posé sur la photo : lui part
        ev('pointermove', 400, 500);
        ev('pointerup', 400, 500);
        await new Promise(ok => setTimeout(ok, 50));
        return { images: images.length, textes: texts.length,
                 traits: freehands.map(f => !!f.locked),
                 epargnes: GommeDuStylet.compte.epargnes - epargnesAvant };
    }, { gomme: GOMME });
    r.egal('la photo, le texte et le trait verrouillé restent ; le trait libre sur la photo part',
        { images: epargne.images, textes: epargne.textes, traits: epargne.traits },
        { images: 1, textes: 1, traits: [true] }, JSON.stringify(epargne));
    r.verifie('et ce qu\'elle a épargné a bien été touché', epargne.epargnes >= 2, JSON.stringify(epargne));

    // ------------------------------------------------------------------
    // 4. L'OUTIL D'AVANT REVIENT — OU LA GOMME RESTE SI C'ÉTAIT ELLE
    // ------------------------------------------------------------------
    const outils = await page.evaluate(async ({ gomme, traits }) => {
        const ev = eval(gomme);
        const bilan = {};
        for (const outil of ['highlighter', 'segment', 'eraser', 'pointer']) {
            eval(traits)();
            setMode(outil);
            ev('pointerdown', 400, 260);
            const pendant = mode;
            ev('pointerup', 400, 260);
            await new Promise(ok => setTimeout(ok, 30));
            bilan[outil] = { pendant, apres: mode, traits: freehands.length };
        }
        return bilan;
    }, { gomme: GOMME, traits: TROIS_TRAITS });
    r.egal('quel que soit l\'outil en main, la gomme efface puis le rend',
        outils, {
            highlighter: { pendant: 'eraser', apres: 'highlighter', traits: 2 },
            segment: { pendant: 'eraser', apres: 'segment', traits: 2 },
            eraser: { pendant: 'eraser', apres: 'eraser', traits: 2 },
            pointer: { pendant: 'eraser', apres: 'pointer', traits: 2 }
        }, JSON.stringify(outils));

    // ------------------------------------------------------------------
    // 5. LA POINTE ÉCRIT TOUJOURS
    // ------------------------------------------------------------------
    const pointe = await page.evaluate(async () => {
        freehands.length = 0; selectedItems = []; activePointers.clear(); setMode('freehand'); draw();
        const c = document.getElementById('board');
        const ev = (t, x, o = {}) => c.dispatchEvent(new PointerEvent(t, { pointerId: 8, pointerType: 'pen', pressure: 0.6,
            button: t === 'pointerdown' ? 0 : -1, buttons: t === 'pointerup' ? 0 : 1, clientX: x, clientY: 600, bubbles: true, isPrimary: true, ...o }));
        ev('pointerdown', 300); ev('pointermove', 340); ev('pointermove', 380);
        const pendant = { ecrit: isDrawingFreehand, gomme: GommeDuStylet.enCours() };
        ev('pointerup', 380);
        await new Promise(ok => setTimeout(ok, 50));
        return { pendant, traits: freehands.length, mode };
    });
    r.egal('la pointe du même stylet écrit comme avant',
        { ecrit: pointe.pendant.ecrit, gomme: pointe.pendant.gomme, traits: pointe.traits, mode: pointe.mode },
        { ecrit: true, gomme: false, traits: 1, mode: 'freehand' }, JSON.stringify(pointe));

    await page.evaluate(() => { freehands.length = 0; images.length = 0; texts.length = 0; selectedItems = []; setMode('pointer'); draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
