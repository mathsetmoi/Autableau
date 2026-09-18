// LE STYLET QUI PERD CE QU'IL ÉCRIT, ET LAISSE DES TRACES.
//
// « Voici un bug que je rencontre. Les écritures disparaissent. Ensuite il y a
// comme des "traces" lorsque j'écris. J'ai testé avec OneNote et il n'y a
// aucune trace. J'utilise une tablette graphique Wacom avec un stylet Wacom. »
//
// Les deux symptômes n'en font qu'un : le trait en cours était interrompu par
// un événement que seul un stylet produit, et le tableau le jetait au lieu de
// le poser.
//
// 1. LE FILET DU SURVOL. Un « pointermove » sans bouton, d'un identifiant
//    qu'on ne suit pas, range ce qui traînait — c'est le filet qui rattrape un
//    bouton relâché hors de la fenêtre. Il baissait le drapeau du tracé SANS
//    RIEN ENREGISTRER : ce qui venait d'être écrit n'existait plus nulle part.
//    Et comme il ne repeignait pas, le trait perdu restait affiché — puis se
//    recopiait dans le calque figé du trait suivant. Une trace que plus rien
//    n'efface. Un stylet Wacom y tombe pour de bon : il annonce « buttons: 0 »
//    en plein tracé à faible pression, et survole entre deux lettres.
//
// 2. LE POINTEROUT EN PLEIN TRACÉ. « pointerout » sert de filet de sécurité,
//    en supposant que la capture du pointeur empêche d'en recevoir pendant un
//    vrai geste — mais cette capture n'était jamais vérifiée, et le garde-fou
//    se fiait à « buttons », qui ne dit pas la vérité d'un stylet. Le trait
//    était coupé net : son début restait comme une trace, et la suite de la
//    lettre ne s'écrivait plus jusqu'au prochain contact.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le stylet ne perd plus ce qu\'il écrit');
    const { context, page, erreurs } = await ouvrirApp(browser);

    await page.evaluate(() => {
        freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        setMode('freehand');
        activeStyle.lineWidth = 4; activeStyle.strokeColor = '#e74c3c';
        draw();
    });

    // ------------------------------------------------------------------
    // 1. LE FILET DU SURVOL NE JETTE PLUS CE QU'ON ÉCRIT
    // ------------------------------------------------------------------
    // On écrit au stylet, et au milieu du trait arrive ce que la tablette
    // envoie sans prévenir : un survol, sans bouton, sous un autre identifiant.
    const survol = await page.evaluate(async () => {
        freehands.length = 0; selectedItems = []; draw();
        const c = document.getElementById('board');
        const stylet = (t, x, y, options = {}) => c.dispatchEvent(new PointerEvent(t, {
            pointerId: 7, pointerType: 'pen', pressure: 0.5, buttons: 1,
            clientX: x, clientY: y, bubbles: true, isPrimary: true, ...options
        }));
        stylet('pointerdown', 300, 300);
        stylet('pointermove', 340, 300);
        stylet('pointermove', 380, 300);
        // Le survol de la tablette : pas de bouton, et un identifiant que le
        // tableau ne suit pas.
        c.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 99, pointerType: 'pen', pressure: 0, buttons: 0,
            clientX: 380, clientY: 300, bubbles: true, isPrimary: true
        }));
        await new Promise(ok => setTimeout(ok, 50));
        const bilan = { traits: freehands.length, points: freehands[0] ? freehands[0].points.length : 0 };
        stylet('pointerup', 380, 300, { buttons: 0, pressure: 0 });   // la tablette finit toujours par relâcher
        return bilan;
    });
    r.egal('le trait interrompu par un survol est POSÉ, et non jeté',
        survol.traits, 1);
    r.verifie('et il garde ce qu\'on avait déjà écrit',
        survol.points >= 2, JSON.stringify(survol));

    // ------------------------------------------------------------------
    // 2. UN POINTEROUT NE COUPE PLUS UN TRAIT EN COURS
    // ------------------------------------------------------------------
    // Il faut une VRAIE capture de pointeur pour éprouver ce garde-fou : on
    // écrit donc à la souris de Playwright — de vrais événements, donc une
    // vraie capture — et l'on glisse au milieu le « pointerout » que la
    // tablette envoie, bouton annoncé enfoncé.
    // Aucun doigt ne traîne : deux pointeurs actifs, et le tableau se croit
    // pincé à deux doigts au lieu d'écrire.
    await page.evaluate(() => {
        freehands.length = 0; selectedItems = []; activePointers.clear();
        setMode('freehand'); draw();
    });
    const boite = await page.locator('#board').boundingBox();
    await page.mouse.move(boite.x + 200, boite.y + 650);
    await page.mouse.down();
    await page.mouse.move(boite.x + 260, boite.y + 650, { steps: 5 });

    const captureTenue = await page.evaluate(() => {
        const c = document.getElementById('board');
        // Le pointeur de la souris porte l'identifiant 1 sous Chromium.
        const tenu = c.hasPointerCapture(1);
        c.dispatchEvent(new PointerEvent('pointerout', {
            pointerId: 1, pointerType: 'pen', buttons: 1,
            clientX: 0, clientY: 0, bubbles: true, isPrimary: true
        }));
        return { tenu, traitsApres: freehands.length, ecritEncore: isDrawingFreehand };
    });
    r.verifie('le tableau tient bien le pointeur pendant le geste',
        captureTenue.tenu, JSON.stringify(captureTenue));
    r.egal('un pointerout pendant ce geste ne pose aucun trait',
        captureTenue.traitsApres, 0, JSON.stringify(captureTenue));
    r.verifie('et le tracé continue : la lettre ne s\'arrête pas au milieu',
        captureTenue.ecritEncore, JSON.stringify(captureTenue));

    await page.mouse.move(boite.x + 320, boite.y + 650, { steps: 5 });
    await page.mouse.up();
    const apres = await page.evaluate(() => ({
        traits: freehands.length,
        largeur: freehands[0]
            ? Math.round(Math.max(...freehands[0].points.map(p => p.x)) - Math.min(...freehands[0].points.map(p => p.x)))
            : 0
    }));
    r.egal('le geste entier ne fait qu\'UN trait, et non deux morceaux',
        apres.traits, 1, JSON.stringify(apres));
    r.verifie('qui va d\'un bout à l\'autre du geste',
        apres.largeur >= 100, JSON.stringify(apres));

    // ET LE SURVOL ORDINAIRE NE COÛTE RIEN. Le stylet survole le tableau en
    // permanence : le filet ne doit pas repeindre le tableau à chaque frisson.
    const repeints = await page.evaluate(async () => {
        freehands.length = 0; selectedItems = []; setMode('freehand'); draw();
        await new Promise(ok => setTimeout(ok, 50));
        const c = document.getElementById('board');
        const vrai = window.draw;
        let appels = 0;
        window.draw = function (...a) { appels++; return vrai.apply(this, a); };
        try {
            for (let i = 0; i < 30; i++) {
                c.dispatchEvent(new PointerEvent('pointermove', {
                    pointerId: 99, pointerType: 'pen', pressure: 0, buttons: 0,
                    clientX: 400 + i, clientY: 700, bubbles: true, isPrimary: true
                }));
            }
        } finally { window.draw = vrai; }
        return appels;
    });
    r.egal('trente frissons de survol ne repeignent pas le tableau', repeints, 0);

    await page.evaluate(() => { freehands.length = 0; selectedItems = []; setMode('pointer'); draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
