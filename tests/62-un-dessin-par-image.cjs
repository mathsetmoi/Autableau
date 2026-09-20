// UN SEUL DESSIN PAR IMAGE.
//
// « Lorsque je me déplace sur la page, l'écriture disparaît puis apparaît. »
//
// Chaque mouvement du pointeur demandait un dessin complet par
// « requestAnimationFrame(draw) ». Un doigt ou un stylet en envoie plusieurs
// par image : le tableau se repeignait autant de fois, dont toutes sauf la
// dernière pour rien. Sur une tablette, avec sept cents traits et deux
// photos, l'image n'arrivait plus à temps et le navigateur montrait un
// tableau vide entre deux.
//
// CE QU'ON TIENT :
//   — huit mouvements dans la même image ne font qu'UN dessin ;
//   — un appel direct à « draw() » n'est jamais sauté : ce qui lit le canevas
//     juste après (la photo du calque, une vignette) voit l'état à jour ;
//   — l'image suivante se dessine bien : on ne saute que les doublons d'une
//     même image, pas les images ;
//   — le résultat à l'écran est le même qu'avec un dessin par événement.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Un doigt sur le tableau
const DOIGT = `(t, x, y, o = {}) => document.getElementById('board').dispatchEvent(new PointerEvent(t, {
    pointerId: 21, pointerType: 'touch', isPrimary: true, buttons: 1,
    clientX: x, clientY: y, bubbles: true, ...o }))`;
const IMAGE_SUIVANTE = `() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`;

module.exports = async function (browser) {
    const r = creerRapport('Un seul dessin par image');
    const { context, page, erreurs } = await ouvrirApp(browser);

    r.verifie('le dessin passe par le filtre « un dessin par image »',
        await page.evaluate(() => typeof draw === 'function' && draw.__unDessinParImage === true
            && typeof draw.origine === 'function' && !!draw.compte));

    // « Glisser sans tout repeindre » se pose PAR-DESSUS le filtre et, pendant
    // un déplacement, ne lui transmet plus les demandes : c'est le filtre seul
    // qu'on éprouve ici, on le remet donc en première ligne le temps du test.
    await page.evaluate(() => { window.__glisser = draw; if (draw.dessous) window.draw = draw.dessous; });

    // Un tableau avec de quoi peindre, et l'outil Main pour se déplacer.
    await page.evaluate(() => {
        freehands.length = 0; selectedItems = []; panX = 100; panY = 100; zoom = 1;
        for (let i = 0; i < 40; i++) {
            const pts = []; for (let k = 0; k < 30; k++) pts.push({ x: 50 + i * 15 + k * 3, y: 200 + (k % 7) * 4, p: 0.3 + 0.4 * ((k % 5) / 4) });
            freehands.push({ id: nextId++, points: pts, color: '#e74c3c', width: 3, z: globalZ++ });
        }
        setMode('move'); draw();
    });

    // ------------------------------------------------------------------
    // 1. HUIT MOUVEMENTS DANS UNE IMAGE, UN SEUL DESSIN
    // ------------------------------------------------------------------
    const rafale = await page.evaluate(async ({ doigt, image }) => {
        const ev = eval(doigt), suivante = eval(image);
        ev('pointerdown', 600, 400);
        await suivante();                                   // ce que l'appui a demandé est passé
        const avant = { ...draw.compte };
        for (let i = 1; i <= 8; i++) ev('pointermove', 600 + i * 4, 400 + i * 2);
        await suivante();
        const apres = { ...draw.compte };
        ev('pointerup', 632, 416, { buttons: 0 });
        return { demandes: apres.demandes - avant.demandes, dessins: apres.dessins - avant.dessins,
                 sautes: apres.sautes - avant.sautes };
    }, { doigt: DOIGT, image: IMAGE_SUIVANTE });
    r.egal('huit mouvements font huit demandes, et UN dessin',
        { demandes: rafale.demandes, dessins: rafale.dessins }, { demandes: 8, dessins: 1 }, JSON.stringify(rafale));
    r.egal('les sept autres sont sautées', rafale.sautes, 7, JSON.stringify(rafale));

    // ------------------------------------------------------------------
    // 2. LE RÉSULTAT À L'ÉCRAN EST LE MÊME — et l'image suivante se dessine
    // ------------------------------------------------------------------
    const ecran = await page.evaluate(async ({ doigt, image }) => {
        const ev = eval(doigt), suivante = eval(image);
        const encre = () => { const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let n = 0;
            for (let i = 0; i < d.length; i += 8) if (d[i] > 150 && d[i + 1] < 110) n++; return n; };
        ev('pointerdown', 600, 400);
        await suivante();
        for (let i = 1; i <= 8; i++) ev('pointermove', 600 + i * 10, 400);
        await suivante();
        const pan1 = panX;
        const parLeFiltre = encre();
        draw.origine();                                     // le dessin complet, sans filtre
        const complet = encre();
        const avant = draw.compte.dessins;
        ev('pointermove', 700, 400);                        // l'image suivante
        await suivante();
        const pan2 = panX;
        const apres = encre();
        draw.origine();
        const apresComplet = encre();
        ev('pointerup', 700, 400, { buttons: 0 });
        return { pan1, parLeFiltre, complet, pan2, apres, apresComplet, repeint: draw.compte.dessins - avant };
    }, { doigt: DOIGT, image: IMAGE_SUIVANTE });
    r.egal('le tableau montré après la rafale est celui du dessin complet',
        ecran.parLeFiltre, ecran.complet, JSON.stringify(ecran));
    // « repeint » compte les images qui ont suivi, pas seulement celle du
    // mouvement : ce qu'un dessin déclenche (la barre du document, une
    // vignette) peut en demander une de plus. Ce qui compte : au moins une.
    r.verifie('le mouvement suivant, dans l\'image suivante, déplace la vue et repeint',
        ecran.pan2 !== ecran.pan1 && ecran.repeint >= 1 && ecran.apres === ecran.apresComplet, JSON.stringify(ecran));

    // ------------------------------------------------------------------
    // 3. UN APPEL DIRECT N'EST JAMAIS SAUTÉ
    // ------------------------------------------------------------------
    const direct = await page.evaluate(async () => {
        await new Promise(ok => requestAnimationFrame(ok));
        const avant = { ...draw.compte };
        // Deux demandes d'animation, puis deux appels directs dans le MÊME
        // rappel — comme un dessin suivi d'une vignette.
        const dansLImage = await new Promise(ok => {
            requestAnimationFrame(draw);
            requestAnimationFrame(draw);
            requestAnimationFrame(() => {
                const apresRaf = { ...draw.compte };
                draw(); draw();
                const apresDirects = { ...draw.compte };
                ok({ parRaf: apresRaf.dessins - avant.dessins, directs: apresDirects.dessins - apresRaf.dessins });
            });
        });
        return dansLImage;
    });
    r.egal('deux demandes d\'animation dans une image : un dessin', direct.parRaf, 1, JSON.stringify(direct));
    r.egal('deux appels directs juste après : deux dessins, jamais sautés', direct.directs, 2, JSON.stringify(direct));

    await page.evaluate(() => { freehands.length = 0; selectedItems = []; setMode('pointer'); draw(); if (window.__glisser) window.draw = window.__glisser; });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
