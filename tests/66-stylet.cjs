// LE STYLET : TOUT CE QU'IL DIT, ET RIEN QUE LUI.
//
// « J'utilise une tablette graphique Wacom. J'ai l'impression qu'il y a des
// traces lorsque j'écris, ou bien ce n'est pas très fluide. »
//
// CE QU'ON TIENT :
//   — les échantillons que le navigateur groupe dans un mouvement sont tous
//     posés : un mouvement qui en porte cinq fait cinq points, pas un ;
//   — le survol que la tablette envoie sous un autre nom, pendant que le
//     tableau tient le stylo, ne coupe plus le trait — il est ignoré ;
//   — un survol sous un autre nom quand le tableau ne tient PAS de stylo
//     range toujours ce qui traînait (le filet d'avant, intact) ;
//   — la pression a un plancher et s'adoucit : un contact à trois pour cent
//     ne fait plus un cheveu, et deux échantillons qui sautent se lissent ;
//   — une souris ou un doigt gardent leur pression fixe de 0,5.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const STYLO = `(t, x, y, o = {}) => document.getElementById('board').dispatchEvent(new PointerEvent(t, {
    pointerId: 7, pointerType: 'pen', pressure: 0.6, buttons: 1,
    clientX: x, clientY: y, bubbles: true, isPrimary: true, ...o }))`;

module.exports = async function (browser) {
    const r = creerRapport('Le stylet');
    const { context, page, erreurs } = await ouvrirApp(browser);

    r.verifie('le module du stylet est là', await page.evaluate(() => typeof Stylet === 'object' && !!Stylet.compte));

    await page.evaluate(() => {
        freehands.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        setMode('freehand'); activeStyle.lineWidth = 3; activeStyle.strokeColor = '#e74c3c';
        draw();
    });

    // ------------------------------------------------------------------
    // 1. LES ÉCHANTILLONS GROUPÉS SONT TOUS POSÉS
    // ------------------------------------------------------------------
    const groupes = await page.evaluate(async (stylo) => {
        const ev = eval(stylo);
        freehands.length = 0;
        ev('pointerdown', 300, 300);
        // Un seul mouvement, qui porte cinq échantillons — comme le navigateur
        // en remet un par image à partir d'une tablette qui en mesure trois.
        const echantillons = [340, 380, 420, 460, 500].map(x => new PointerEvent('pointermove', {
            pointerId: 7, pointerType: 'pen', pressure: 0.6, buttons: 1, clientX: x, clientY: 300, isPrimary: true }));
        document.getElementById('board').dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 7, pointerType: 'pen', pressure: 0.6, buttons: 1, clientX: 500, clientY: 300,
            bubbles: true, isPrimary: true, coalescedEvents: echantillons }));
        const pendant = { points: currentFreehand ? currentFreehand.points.length : 0,
                          xs: currentFreehand ? currentFreehand.points.map(p => Math.round(p.x)) : [] };
        ev('pointerup', 500, 300, { buttons: 0, pressure: 0 });
        await new Promise(ok => setTimeout(ok, 50));
        return { pendant, traits: freehands.length, groupesPoses: Stylet.compte.groupes };
    }, STYLO);
    r.egal('un mouvement qui porte cinq échantillons fait six points (l\'appui, puis les cinq)',
        groupes.pendant.xs, [300, 340, 380, 420, 460, 500], JSON.stringify(groupes));
    r.egal('et le trait est posé, entier', groupes.traits, 1, JSON.stringify(groupes));

    // ------------------------------------------------------------------
    // 2. LE FAUX SURVOL NE COUPE PLUS LE TRAIT
    // ------------------------------------------------------------------
    // Il faut un VRAI pointeur tenu par le tableau : on écrit à la souris de
    // Playwright — de vrais événements, donc une vraie capture — et l'on
    // glisse au milieu le survol que la tablette envoie sous un autre nom.
    await page.evaluate(() => { freehands.length = 0; selectedItems = []; activePointers.clear(); setMode('freehand'); draw(); });
    const boite = await page.locator('#board').boundingBox();
    await page.mouse.move(boite.x + 200, boite.y + 500);
    await page.mouse.down();
    await page.mouse.move(boite.x + 260, boite.y + 500, { steps: 5 });
    const survol = await page.evaluate(() => {
        const c = document.getElementById('board');
        const tenu = c.hasPointerCapture(1);          // la souris porte l'identifiant 1
        const avant = Stylet.compte.survolsFiltres;
        for (let i = 0; i < 5; i++) {
            c.dispatchEvent(new PointerEvent('pointermove', {
                pointerId: 99, pointerType: 'pen', pressure: 0, buttons: 0,
                clientX: 260 + i, clientY: 500, bubbles: true, isPrimary: true }));
        }
        return { tenu, filtres: Stylet.compte.survolsFiltres - avant,
                 ecritEncore: isDrawingFreehand, traitsPoses: freehands.length };
    });
    r.verifie('le tableau tient bien le pointeur qui écrit', survol.tenu, JSON.stringify(survol));
    r.egal('cinq survols sous un autre nom sont filtrés, et le trait continue',
        { filtres: survol.filtres, ecritEncore: survol.ecritEncore, traitsPoses: survol.traitsPoses },
        { filtres: 5, ecritEncore: true, traitsPoses: 0 }, JSON.stringify(survol));
    await page.mouse.move(boite.x + 320, boite.y + 500, { steps: 5 });
    await page.mouse.up();
    const entier = await page.evaluate(() => ({
        traits: freehands.length,
        largeur: freehands[0] ? Math.round(Math.max(...freehands[0].points.map(p => p.x)) - Math.min(...freehands[0].points.map(p => p.x))) : 0
    }));
    r.egal('le geste entier ne fait qu\'UN trait, d\'un bout à l\'autre',
        { traits: entier.traits, entier: entier.largeur >= 100 }, { traits: 1, entier: true }, JSON.stringify(entier));

    // Sans stylo tenu, le filet d'avant fait toujours son travail : ce qui
    // traînait est rangé. (Le pointeur 7 est synthétique : pas de capture.)
    const filet = await page.evaluate(async (stylo) => {
        const ev = eval(stylo);
        freehands.length = 0; activePointers.clear();
        ev('pointerdown', 300, 600); ev('pointermove', 340, 600); ev('pointermove', 380, 600);
        document.getElementById('board').dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 99, pointerType: 'pen', pressure: 0, buttons: 0, clientX: 380, clientY: 600, bubbles: true, isPrimary: true }));
        await new Promise(ok => setTimeout(ok, 50));
        const bilan = { traits: freehands.length, ecrit: isDrawingFreehand };
        ev('pointerup', 380, 600, { buttons: 0, pressure: 0 });
        return bilan;
    }, STYLO);
    r.egal('sans stylo tenu, le survol range toujours le trait qui traînait (le filet d\'avant)',
        filet, { traits: 1, ecrit: false }, JSON.stringify(filet));

    // ------------------------------------------------------------------
    // 3. LA PRESSION : UN PLANCHER, ET DES SAUTS ADOUCIS
    // ------------------------------------------------------------------
    const pression = await page.evaluate(async (stylo) => {
        const ev = eval(stylo);
        freehands.length = 0; activePointers.clear();
        ev('pointerdown', 300, 700, { pressure: 0.03 });      // le premier contact, presque rien
        ev('pointermove', 340, 700, { pressure: 0.03 });
        ev('pointermove', 380, 700, { pressure: 0.9 });        // puis un saut
        ev('pointermove', 420, 700, { pressure: 0.9 });
        const ps = currentFreehand.points.map(p => +p.p.toFixed(3));
        ev('pointerup', 420, 700, { buttons: 0, pressure: 0 });
        await new Promise(ok => setTimeout(ok, 50));
        return { ps, min: Stylet.PRESSION_MIN };
    }, STYLO);
    r.verifie('un contact à trois pour cent est relevé au plancher',
        pression.ps[0] === pression.min && pression.ps[1] === pression.min, JSON.stringify(pression));
    r.verifie('et un saut de pression est adouci : on n\'arrive pas à 0,9 d\'un coup',
        pression.ps[2] > pression.min && pression.ps[2] < 0.8 && pression.ps[3] > pression.ps[2], JSON.stringify(pression));

    const souris = await page.evaluate(async () => {
        freehands.length = 0; activePointers.clear();
        const c = document.getElementById('board');
        const ev = (t, x, o = {}) => c.dispatchEvent(new PointerEvent(t, { pointerId: 3, pointerType: 'mouse', buttons: 1, clientX: x, clientY: 750, bubbles: true, isPrimary: true, ...o }));
        ev('pointerdown', 300); ev('pointermove', 340); ev('pointermove', 380);
        const ps = currentFreehand.points.map(p => p.p);
        ev('pointerup', 380, { buttons: 0 });
        await new Promise(ok => setTimeout(ok, 50));
        return ps;
    });
    r.egal('la souris garde sa pression fixe de 0,5', souris, [0.5, 0.5, 0.5]);

    await page.evaluate(() => { freehands.length = 0; selectedItems = []; setMode('pointer'); draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
