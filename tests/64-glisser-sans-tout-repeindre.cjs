// GLISSER LA VUE SANS TOUT REPEINDRE.
//
// « Lorsque je fais bouger la page, elle rame, comme si j'étais à une faible
// fréquence d'image. »
//
// Pendant qu'on glisse, rien ne change sur le tableau : on peint une fois, on
// garde la photo, et les images suivantes ne font que la faire glisser. On
// repeint pour de bon quand le bord découvert devient grand, et dès que la
// main s'arrête.
//
// CE QU'ON TIENT :
//   — trente images de glissement au doigt : quelques dessins complets
//     seulement, le reste n'est que la photo qui glisse ;
//   — pendant le geste, ce qu'on voit suit bien le doigt (un trait connu est
//     là où la vue le met) ;
//   — la main arrêtée, le tableau est repeint net : plus aucune photo, ce
//     qu'on voit est un dessin complet (à quelques pixels de bord près :
//     Chrome change de rastériseur quand on lit souvent les pixels) ;
//   — vingt crans de molette dans une image : pas vingt dessins ;
//   — le zoom animé glisse sur la photo, puis se pose net ;
//   — un appel direct à « draw() » hors d'un geste peint vraiment ;
//   — en écrivant, la photo ne sert pas : le trait en cours se voit.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const DOIGT = `(t, x, y, o = {}) => document.getElementById('board').dispatchEvent(new PointerEvent(t, {
    pointerId: 31, pointerType: 'touch', isPrimary: true, buttons: 1,
    clientX: x, clientY: y, bubbles: true, ...o }))`;
const IMAGE = `() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`;
const ENCRE = `() => { const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) n++; return n; }`;

module.exports = async function (browser) {
    const r = creerRapport('Glisser la vue sans tout repeindre');
    const { context, page, erreurs } = await ouvrirApp(browser);

    r.verifie('le dessin passe par « glisser sans tout repeindre », au-dessus du filtre',
        await page.evaluate(() => typeof draw === 'function' && draw.__glisser === true
            && draw.dessous && draw.dessous.__unDessinParImage === true));

    // Un tableau dense, et un trait repère rouge bien reconnaissable.
    await page.evaluate(() => {
        freehands.length = 0; images.length = 0; points.length = 0; selectedItems = [];
        panX = 100; panY = 100; zoom = 1;
        let g = 4242; const alea = () => (g = (g * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 300; i++) {
            const x = alea() * 1800 - 300, y = alea() * 1200 - 200, a = alea() * 6.28;
            freehands.push({ id: nextId++, color: '#2d3436', width: 3, z: globalZ++,
                points: [{ x, y }, { x: x + 40 * Math.cos(a), y: y + 40 * Math.sin(a) }, { x: x + 80 * Math.cos(a), y: y + 80 * Math.sin(a) }] });
        }
        // Le repère : un gros point rouge à (500, 300) sur le tableau.
        freehands.push({ id: nextId++, color: '#e74c3c', width: 14, z: globalZ++,
            points: [{ x: 500, y: 300 }, { x: 501, y: 300 }, { x: 502, y: 300 }] });
        setMode('move'); draw();
    });

    // ------------------------------------------------------------------
    // 1. TRENTE IMAGES DE GLISSEMENT : QUELQUES DESSINS, LE RESTE GLISSE
    // ------------------------------------------------------------------
    const glisse = await page.evaluate(async ({ doigt, image }) => {
        const ev = eval(doigt), suivante = eval(image);
        const rougeA = (sx, sy) => { const d = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data; return d[0] > 150 && d[1] < 110 && d[2] < 110; };
        ev('pointerdown', 700, 400);
        await suivante();
        const avant = { complets: draw.compte.dessins, glisses: draw.glissements.glisses };
        let repereSuivi = 0;
        for (let i = 1; i <= 30; i++) {
            ev('pointermove', 700 - i * 4, 400 - i * 3);
            await suivante();
            // Le repère (500,300) doit être à l'écran là où la vue le met.
            if (rougeA(panX + 500 * zoom + 1, panY + 300 * zoom)) repereSuivi++;
        }
        const pendant = { complets: draw.compte.dessins - avant.complets, glisses: draw.glissements.glisses - avant.glisses };
        ev('pointerup', 580, 310, { buttons: 0 });
        await suivante();
        await new Promise(ok => setTimeout(ok, 250));      // la main s'arrête : repeint net
        const apres = { complets: draw.compte.dessins - avant.complets - pendant.complets };
        return { pendant, repereSuivi, apres, pan: [panX, panY] };
    }, { doigt: DOIGT, image: IMAGE });
    r.verifie('trente images de glissement : au plus cinq dessins complets, le reste glisse',
        glisse.pendant.complets <= 5 && glisse.pendant.glisses >= 20, JSON.stringify(glisse));
    r.egal('pendant le geste, le repère est à l\'écran là où la vue le met, à chaque image',
        glisse.repereSuivi, 30, JSON.stringify(glisse));
    r.verifie('la main arrêtée, le tableau est repeint pour de bon', glisse.apres.complets >= 1, JSON.stringify(glisse));

    const net = await page.evaluate((encre) => {
        const compter = eval(encre);
        const montre = compter();
        draw.origine();                                    // le dessin complet, sans rien
        const complet = compter();
        return { montre, complet };
    }, ENCRE);
    // Une photo agrandie ou réduite s'écarterait de bien plus que cela.
    const proche = (a, b) => Math.abs(a - b) <= Math.max(3, 0.12 * b);
    r.verifie('et ce qu\'il montre est le dessin complet, à quelques pixels de bord près',
        proche(net.montre, net.complet), JSON.stringify(net));

    // ------------------------------------------------------------------
    // 2. LA MOLETTE : VINGT CRANS DANS UNE IMAGE, PAS VINGT DESSINS
    // ------------------------------------------------------------------
    const molette = await page.evaluate(async ({ image, encre }) => {
        const suivante = eval(image), compter = eval(encre);
        setMode('pointer'); draw();
        await suivante();
        const avant = { complets: draw.compte.dessins, glisses: draw.glissements.glisses };
        for (let i = 0; i < 20; i++) {
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 5, deltaX: 0, deltaMode: 0, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
        }
        const pendant = { complets: draw.compte.dessins - avant.complets, glisses: draw.glissements.glisses - avant.glisses };
        await new Promise(ok => setTimeout(ok, 250));
        const apres = draw.compte.dessins - avant.complets - pendant.complets;
        const glissesApres = draw.glissements.glisses - avant.glisses - pendant.glisses;
        const montre = compter(); draw.origine(); const complet = compter();
        return { pendant, apres, glissesApres, montre, complet };
    }, { image: IMAGE, encre: ENCRE });
    r.verifie('vingt crans de molette : au plus deux dessins complets, le reste glisse',
        molette.pendant.complets <= 2 && molette.pendant.glisses >= 15, JSON.stringify(molette));
    r.verifie('puis, au repos, un vrai dessin, et plus aucune photo',
        molette.apres >= 1 && molette.glissesApres === 0 && proche(molette.montre, molette.complet), JSON.stringify(molette));

    // ------------------------------------------------------------------
    // 3. LE ZOOM ANIMÉ GLISSE SUR LA PHOTO, PUIS SE POSE NET
    // ------------------------------------------------------------------
    const zoome = await page.evaluate(async ({ encre }) => {
        const compter = eval(encre);
        draw(); await new Promise(ok => setTimeout(ok, 150));
        const avant = { complets: draw.compte.dessins, glisses: draw.glissements.glisses, zoom };
        viserLeZoom(zoom * 1.3, 640, 400);
        for (let k = 0; k < 60 && zoomVise !== null; k++) await new Promise(ok => requestAnimationFrame(ok));
        const pendant = { complets: draw.compte.dessins - avant.complets, glisses: draw.glissements.glisses - avant.glisses };
        await new Promise(ok => setTimeout(ok, 250));
        const apres = { complets: draw.compte.dessins - avant.complets - pendant.complets, glisses: draw.glissements.glisses - avant.glisses - pendant.glisses };
        const montre = compter(); draw.origine(); const complet = compter();
        return { avantZoom: avant.zoom, zoom, pendant, apres, montre, complet };
    }, { encre: ENCRE });
    r.verifie('le zoom animé fait glisser la photo au lieu de tout repeindre à chaque image',
        Math.abs(zoome.zoom / zoome.avantZoom - 1.3) < 0.01 && zoome.pendant.glisses >= 3 && zoome.pendant.complets <= 3, JSON.stringify(zoome));
    // Une photo étirée de 30 % montrerait le repère 70 % plus gros.
    r.verifie('et une fois posé, un vrai dessin a remplacé la photo : le tableau est net',
        zoome.apres.complets >= 1 && zoome.apres.glisses === 0 && proche(zoome.montre, zoome.complet), JSON.stringify(zoome));

    // ------------------------------------------------------------------
    // 4. HORS D'UN GESTE, UN APPEL DIRECT PEINT VRAIMENT
    // ------------------------------------------------------------------
    const direct = await page.evaluate(async () => {
        await new Promise(ok => setTimeout(ok, 200));
        const avant = { complets: draw.compte.dessins, glisses: draw.glissements.glisses };
        panX += 3; draw();
        return { complets: draw.compte.dessins - avant.complets, glisses: draw.glissements.glisses - avant.glisses };
    });
    r.egal('un appel direct hors geste : un vrai dessin, aucune photo', direct, { complets: 1, glisses: 0 });

    // ------------------------------------------------------------------
    // 5. EN ÉCRIVANT, LE TRAIT EN COURS SE VOIT (la photo ne sert pas)
    // ------------------------------------------------------------------
    const ecrit = await page.evaluate(async ({ image }) => {
        const suivante = eval(image);
        setMode('freehand'); activeStyle.strokeColor = '#0984e3'; activeStyle.lineWidth = 6; draw();
        await suivante();
        const c = document.getElementById('board');
        const ev = (t, x, y, o = {}) => c.dispatchEvent(new PointerEvent(t, { pointerId: 9, pointerType: 'pen', pressure: 0.6, buttons: 1, clientX: x, clientY: y, bubbles: true, isPrimary: true, ...o }));
        const avant = draw.glissements.glisses;
        ev('pointerdown', 300, 600);
        for (let i = 1; i <= 10; i++) { ev('pointermove', 300 + i * 10, 600); await suivante(); }
        const d = ctx.getImageData(350, 600, 1, 1).data;
        const bleuVisible = d[2] > 150 && d[0] < 100;
        ev('pointerup', 400, 600, { buttons: 0, pressure: 0 });
        await suivante();
        setMode('pointer');
        return { bleuVisible, glisses: draw.glissements.glisses - avant };
    }, { image: IMAGE });
    r.egal('le trait qu\'on écrit se voit, et aucune photo n\'a glissé pendant',
        ecrit, { bleuVisible: true, glisses: 0 });

    await page.evaluate(() => { freehands.length = 0; selectedItems = []; setMode('pointer'); draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
