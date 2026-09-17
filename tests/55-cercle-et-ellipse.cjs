// LE CERCLE SE TRACE DE DEUX FAÇONS.
//
// « Rajoute un cycle sur le cercle pour des ellipses — de toute façon on aura
// un cadre autour du cercle. Mais s'il est créé par point, les points doivent
// être disponibles. »
//
// Le cercle du tableau est une FIGURE DE GÉOMÉTRIE : un centre, un point du
// bord, deux vrais points qu'on reprend et qu'on croise. C'est ce qu'il faut
// pour construire. Ce n'est pas ce qu'il faut pour entourer un mot : là, on
// veut poser une boucle d'un seul geste, et qu'elle épouse ce qu'elle entoure.
//
// Les deux façons vivent donc sous le même bouton, et le reprendre quand on
// l'a déjà en main passe de l'une à l'autre. Les deux figures vivent dans la
// même liste : l'ellipse libre est un cercle SANS POINTS, qui porte son centre
// et ses deux rayons.
//
// CE QUE CETTE SUITE TIENT :
//
//   — le cycle bascule, et la façon choisie traverse le rechargement ;
//   — en façon « ellipse », glisser une boîte pose une ellipse qui la remplit,
//     sans semer le moindre point ; un simple clic ne pose rien ;
//   — en façon « points », rien n'a changé : deux clics, deux points, et ces
//     points RÉPONDENT quand on les désigne ;
//   — l'ellipse libre offre les huit poignées d'un cadre, et c'est par là
//     qu'on la retaille — le cercle par points, lui, n'en offre aucune ;
//   — elle se déplace, se copie, se duplique et se retrouve au lasso ;
//   — l'aimant géométrique ne s'accroche pas à elle : deux rayons ne se
//     rangent pas dans la mécanique du cercle, et elle serait aimantée de
//     travers ;
//   — sa boîte englobante et son export SVG disent ses deux rayons.
const { creerRapport, ouvrirApp, rechargerApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Cercle et ellipse');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });

    // Le tableau à plat : pas de décalage, pas de zoom. Les coordonnées de
    // l'écran sont alors celles du tableau, à « panX / panY » près.
    const aPlat = () => page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0; rectangles.length = 0;
        texts.length = 0; freehands.length = 0; curves.length = 0; polygons.length = 0;
        images.length = 0; arcs.length = 0;
        selectedItems = []; creationStartPointId = null;
        panX = 0; panY = 0; zoom = 1;
        setMode('pointer');
        draw();
    });

    const facon = () => page.evaluate(() => ({
        facon: faconDuCercle,
        classe: document.body.classList.contains('cercle-libre')
    }));

    const cliquerLeBouton = () => page.evaluate(() => {
        document.querySelector('#bar-tools .btn[data-mode="circle"]').click();
    });

    // ------------------------------------------------------------------
    // 1. LE CYCLE
    // ------------------------------------------------------------------
    await aPlat();
    await page.evaluate(() => { faconDuCercle = 'points'; majLaFaconDuCercle(); setMode('pointer'); });

    await cliquerLeBouton();
    const prise = await page.evaluate(() => mode);
    r.egal('le premier clic prend l\'outil sans changer de façon', prise, 'circle');
    r.egal('et la façon d\'origine est le cercle par points', await facon(), { facon: 'points', classe: false });

    await cliquerLeBouton();
    r.egal('le reprendre en main passe à l\'ellipse libre', await facon(), { facon: 'ellipse', classe: true });
    r.egal('et l\'outil reste le cercle', await page.evaluate(() => mode), 'circle');

    await cliquerLeBouton();
    r.egal('et une fois de plus revient au cercle par points', await facon(), { facon: 'points', classe: false });

    // L'ICÔNE SUIT, ET ELLE EST ÉCRITE DANS LA PAGE. Les deux dessins sont là
    // tous les deux ; c'est la classe du corps de page qui choisit lequel se
    // montre. Rien ne repeint l'icône — c'est la règle du chapitre 54.
    const dessins = await page.evaluate(() => {
        const svg = document.querySelector('#bar-tools .btn[data-mode="circle"] svg');
        const vu = (sel) => {
            const e = svg.querySelector(sel);
            return !!e && getComputedStyle(e).display !== 'none';
        };
        return { points: vu('.ico-cercle-points'), libre: vu('.ico-cercle-libre') };
    });
    r.egal('en façon « points », l\'icône montre le cercle et son centre',
        dessins, { points: true, libre: false });

    await cliquerLeBouton();
    const dessinsLibre = await page.evaluate(() => {
        const svg = document.querySelector('#bar-tools .btn[data-mode="circle"] svg');
        const vu = (sel) => {
            const e = svg.querySelector(sel);
            return !!e && getComputedStyle(e).display !== 'none';
        };
        return { points: vu('.ico-cercle-points'), libre: vu('.ico-cercle-libre') };
    });
    r.egal('en façon « ellipse », elle montre l\'ellipse', dessinsLibre, { points: false, libre: true });

    // ET LA FAÇON CHOISIE TRAVERSE LE RECHARGEMENT. On ne rechoisit pas son
    // outil à chaque matin : c'est un réglage de l'enseignant, pas de la
    // séance.
    await rechargerApp(page);
    // EN CAS D'ÉCHEC, on veut savoir LEQUEL des deux a lâché : le réglage
    // écrit qui n'a pas survécu, ou le réglage relu qui n'a pas été appliqué.
    // Sans cela, une chute rare ne s'explique jamais.
    const apresLeRetour = await facon();
    r.egal('la façon choisie tient après un rechargement',
        apresLeRetour, { facon: 'ellipse', classe: true },
        await page.evaluate(() => {
            try {
                return 'stockage=' + JSON.stringify(localStorage.getItem('autableau_facon_cercle'))
                     + ', ' + Object.keys(localStorage).length + ' clés';
            } catch (e) { return 'stockage refusé : ' + e.name; }
        }));

    // ------------------------------------------------------------------
    // 2. L'ELLIPSE SE TRACE À LA BOÎTE
    // ------------------------------------------------------------------
    await aPlat();
    await page.evaluate(() => { faconDuCercle = 'ellipse'; majLaFaconDuCercle(); setMode('circle'); });

    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.move(500, 260, { steps: 8 });
    await page.mouse.up();

    const tracee = await page.evaluate(() => {
        if (circles.length !== 1) return { nb: circles.length };
        const c = circles[0];
        return { nb: 1, libre: !!c.libre, cx: c.cx, cy: c.cy, rx: c.rx, ry: c.ry,
                 pointsSemes: points.length, centre: c.center_id === undefined };
    });
    r.egal('glisser une boîte pose une ellipse qui la remplit, et rien d\'autre',
        tracee, { nb: 1, libre: true, cx: 400, cy: 230, rx: 100, ry: 30,
                  pointsSemes: 0, centre: true });

    // UN SIMPLE CLIC NE POSE RIEN. Reprendre l'outil, hésiter, poser le doigt :
    // autant de gestes qui laisseraient sinon un pois sur la page.
    await aPlat();
    await page.evaluate(() => { faconDuCercle = 'ellipse'; majLaFaconDuCercle(); setMode('circle'); });
    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.up();
    r.egal('un simple clic ne pose pas d\'ellipse',
        await page.evaluate(() => [circles.length, points.length]), [0, 0]);

    // UNE BOÎTE COMMENCÉE NE SURVIT PAS AU CHANGEMENT D'OUTIL. On tire, on
    // change d'avis, on prend le crayon : la boîte fantôme resterait à l'écran
    // et le prochain relâchement de souris poserait une ellipse qu'on ne
    // dessinait plus.
    await aPlat();
    await page.evaluate(() => { faconDuCercle = 'ellipse'; majLaFaconDuCercle(); setMode('circle'); });
    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.move(400, 280, { steps: 4 });
    const abandon = await page.evaluate(() => {
        const enCours = isDrawingEllipse;
        setMode('freehand');
        return { enCours, apres: isDrawingEllipse, boite: boiteEllipse };
    });
    await page.mouse.up();
    r.egal('changer d\'outil en plein tracé range la boîte',
        abandon, { enCours: true, apres: false, boite: null });
    r.egal('et rien n\'est posé', await page.evaluate(() => circles.length), 0);

    // Et le trait est bien peint à l'écran, aux deux rayons qu'on a tirés :
    // à droite de l'ellipse il y a de l'encre, au-dessus il n'y en a pas.
    await aPlat();
    await page.evaluate(() => {
        faconDuCercle = 'ellipse'; majLaFaconDuCercle(); setMode('circle');
        activeStyle.strokeColor = '#000000'; activeStyle.isFilled = false;
    });
    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.move(500, 260, { steps: 8 });
    await page.mouse.up();
    const encre = await page.evaluate(() => {
        draw();
        const lire = (x, y) => {
            const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            return Math.min(d[0], d[1], d[2]);
        };
        // Le bord droit de l'ellipse, et le point qui serait sur le cercle
        // circonscrit — là où un CERCLE passerait, mais pas une ellipse plate.
        return { bordDroit: lire(500, 230), auDessus: lire(400, 130) };
    });
    r.verifie('le trait est peint au bord de l\'ellipse, et pas là où passerait un cercle',
        encre.bordDroit < 120 && encre.auDessus > 200, JSON.stringify(encre));

    // ------------------------------------------------------------------
    // 3. LE CERCLE PAR POINTS N'A RIEN PERDU
    // « Mais s'il est créé par point, les points doivent être disponibles. »
    // ------------------------------------------------------------------
    await aPlat();
    await page.evaluate(() => { faconDuCercle = 'points'; majLaFaconDuCercle(); setMode('circle'); });
    await page.mouse.click(400, 400);
    await page.mouse.click(520, 400);

    const parPoints = await page.evaluate(() => {
        if (circles.length !== 1) return { nb: circles.length };
        const c = circles[0];
        const centre = getObjectById('point', c.center_id), bord = getObjectById('point', c.edge_id);
        return {
            nb: 1, libre: !!c.libre,
            centre: centre ? [centre.x, centre.y] : null,
            bord: bord ? [bord.x, bord.y] : null,
            points: points.length
        };
    });
    r.egal('deux clics posent toujours un cercle avec ses deux points',
        parPoints, { nb: 1, libre: false, centre: [400, 400], bord: [520, 400], points: 2 });

    // ET CES POINTS RÉPONDENT. C'est tout l'objet de la demande : un cercle
    // construit se reprend par son centre et par son bord.
    const repondent = await page.evaluate(() => {
        setMode('pointer');
        const c = circles[0];
        const centre = getObjectById('point', c.center_id), bord = getObjectById('point', c.edge_id);
        const a = findObjectAt(centre.x, centre.y), b = findObjectAt(bord.x, bord.y);
        return {
            centre: a && a.type === 'point' && a.id === centre.id,
            bord: b && b.type === 'point' && b.id === bord.id
        };
    });
    r.egal('le centre et le bord se désignent toujours', repondent, { centre: true, bord: true });

    // ------------------------------------------------------------------
    // 4. LE CADRE DE L'ELLIPSE
    // « De toute façon on aura un cadre autour du cercle. »
    // ------------------------------------------------------------------
    const poserEllipse = (cx, cy, rx, ry) => page.evaluate(([cx, cy, rx, ry]) => {
        points.length = 0; circles.length = 0; segments.length = 0; rectangles.length = 0;
        panX = 0; panY = 0; zoom = 1;
        const e = { id: nextId++, libre: true, cx, cy, rx, ry, color: '#000', width: 3, z: globalZ++ };
        circles.push(e);
        setMode('pointer');
        selectedItems = [{ type: 'circle', id: e.id }];
        draw();
        return e.id;
    }, [cx, cy, rx, ry]);

    await poserEllipse(400, 300, 100, 60);
    const poignees = await page.evaluate(() => {
        const e = circles[0], b = boiteDeLEllipse(e);
        const hx = [b.x, b.x + b.w / 2, b.x + b.w, b.x + b.w, b.x + b.w, b.x + b.w / 2, b.x, b.x];
        const hy = [b.y, b.y, b.y, b.y + b.h / 2, b.y + b.h, b.y + b.h, b.y + b.h, b.y + b.h / 2];
        return hx.map((x, i) => getHandleAt(x, hy[i], e, 'circle'));
    });
    r.egal('l\'ellipse libre offre les huit poignées de son cadre',
        poignees, ['TL', 'T', 'TR', 'R', 'BR', 'B', 'BL', 'L']);

    const rotation = await page.evaluate(() => {
        const e = circles[0], b = boiteDeLEllipse(e);
        return getHandleAt(b.x + b.w / 2, b.y - 30, e, 'circle');
    });
    r.verifie('elle n\'a pas de poignée de rotation : elle reste droite',
        rotation === null, String(rotation));

    const parLeReperage = await page.evaluate(() => {
        const b = boiteDeLEllipse(circles[0]);
        return findObjectAt(b.x, b.y);
    });
    r.verifie('le coin du cadre répond « poignée »',
        parLeReperage && parLeReperage.type === 'handle' && parLeReperage.name === 'TL',
        JSON.stringify(parLeReperage));

    // UN CERCLE PAR POINTS N'A PAS DE CADRE : il se reprend par ses points, et
    // un cadre par-dessus lui volerait le geste.
    const cercleSansCadre = await page.evaluate(() => {
        points.length = 0; circles.length = 0;
        const c = { id: nextId++, x: 400, y: 300, z: globalZ++ };
        const e = { id: nextId++, x: 500, y: 300, z: globalZ++ };
        points.push(c, e);
        const cercle = { id: nextId++, center_id: c.id, edge_id: e.id, color: '#000', width: 3, z: globalZ++ };
        circles.push(cercle);
        selectedItems = [{ type: 'circle', id: cercle.id }];
        return [getHandleAt(300, 200, cercle, 'circle'), boiteDeLEllipse(cercle)];
    });
    r.egal('un cercle par points n\'offre ni poignée ni cadre', cercleSansCadre, [null, null]);

    // ET TIRER UNE POIGNÉE RETAILLE L'ELLIPSE, du bon côté.
    const boite = () => page.evaluate(() => {
        const b = boiteDeLEllipse(circles[0]);
        return { x: b.x, y: b.y, w: b.w, h: b.h };
    });

    await poserEllipse(400, 300, 100, 60);
    await page.evaluate(() => etirerLEllipse(circles[0], 'BR', { x: 600, y: 400 }));
    r.egal('la poignée bas-droite étire vers le bas et la droite',
        await boite(), { x: 300, y: 240, w: 300, h: 160 });

    await poserEllipse(400, 300, 100, 60);
    await page.evaluate(() => etirerLEllipse(circles[0], 'R', { x: 600, y: 999 }));
    r.egal('la poignée droite ne touche pas la hauteur',
        await boite(), { x: 300, y: 240, w: 300, h: 120 });

    await poserEllipse(400, 300, 100, 60);
    const ecrase = await page.evaluate(() => etirerLEllipse(circles[0], 'R', { x: 0, y: 0 }));
    const apres = await boite();
    r.verifie('l\'ellipse garde de quoi être rattrapée',
        ecrase === true && apres.w >= 8 && apres.x === 300, JSON.stringify(apres));

    await poserEllipse(400, 300, 100, 60);
    const verrouillee = await page.evaluate(() => {
        circles[0].locked = true;
        return [etirerLEllipse(circles[0], 'BR', { x: 900, y: 900 }),
                getHandleAt(500, 360, circles[0], 'circle')];
    });
    r.egal('une ellipse verrouillée ne se déforme pas et n\'offre pas de poignée',
        verrouillee, [false, null]);
    r.egal('et elle garde sa taille', await boite(), { x: 300, y: 240, w: 200, h: 120 });

    // Le geste complet, à la souris, et il entre dans l'historique.
    await poserEllipse(400, 300, 100, 60);
    await page.mouse.move(500, 360);
    await page.mouse.down();
    await page.mouse.move(560, 400, { steps: 6 });
    await page.mouse.up();
    const tiree = await boite();
    r.verifie('tirer la poignée à la souris retaille la figure',
        Math.abs(tiree.w - 260) < 3 && Math.abs(tiree.h - 160) < 3 && tiree.x === 300 && tiree.y === 240,
        JSON.stringify(tiree));
    const memorisee = await page.evaluate(() => {
        const dernier = JSON.parse(history[historyIndex]);
        const e = dernier.circles[0];
        return Math.abs(e.rx * 2 - 260) < 3;
    });
    r.verifie('la nouvelle taille entre dans l\'historique', memorisee, String(memorisee));

    // ------------------------------------------------------------------
    // 5. ELLE SE DÉPLACE, SE COPIE, SE RETROUVE
    // ------------------------------------------------------------------
    // On la prend PAR SON TRAIT, entre deux poignées — sur le quart de tour à
    // quarante-cinq degrés, là où il n'y a rien d'autre à attraper.
    await poserEllipse(400, 300, 100, 60);
    const surLeTrait = { x: 400 + 100 * Math.SQRT1_2, y: 300 + 60 * Math.SQRT1_2 };
    await page.mouse.move(surLeTrait.x, surLeTrait.y);
    await page.mouse.down();
    await page.mouse.move(surLeTrait.x + 60, surLeTrait.y + 50, { steps: 8 });
    await page.mouse.up();
    const deplacee = await page.evaluate(() => {
        const e = circles[0];
        return { cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry };
    });
    r.verifie('la glisser par son trait la déplace sans la déformer',
        Math.abs(deplacee.cx - 460) < 3 && Math.abs(deplacee.cy - 350) < 3
        && deplacee.rx === 100 && deplacee.ry === 60,
        JSON.stringify(deplacee));

    // LA COPIE SE POSE À CÔTÉ, et non pile sur l'originale : « cx / cy » sont
    // sa position, pas des coordonnées de rognage.
    await poserEllipse(400, 300, 100, 60);
    const copiee = await page.evaluate(() => {
        copierSelection();
        collerDuTableau();
        return circles.map(c => [c.cx, c.cy, c.rx, c.ry]);
    });
    r.verifie('copier-coller pose une seconde ellipse à côté de la première',
        copiee.length === 2 && copiee[0][0] === 400
        && copiee[1][0] !== copiee[0][0] && copiee[1][1] !== copiee[0][1]
        && copiee[1][2] === 100 && copiee[1][3] === 60,
        JSON.stringify(copiee));

    // LES DEUX CHEMINS DE LA DUPLICATION. « Dupliquer » passe par le
    // presse-papier ; le Ctrl+D de la barre, lui, recopie directement et
    // redirige les renvois aux points. Ils ne traversent pas le même code, et
    // une figure sans points doit se décaler dans les deux.
    await poserEllipse(400, 300, 100, 60);
    const dupliquee = await page.evaluate(() => {
        dupliquerSelection();
        return { nb: circles.length, points: points.length,
                 ecart: circles.length === 2 ? circles[1].cx - circles[0].cx : null };
    });
    r.verifie('la dupliquer la pose à côté, sans semer de points',
        dupliquee.nb === 2 && dupliquee.points === 0 && dupliquee.ecart > 0,
        JSON.stringify(dupliquee));

    await poserEllipse(400, 300, 100, 60);
    const recopiee = await page.evaluate(() => {
        duplicateSelection();
        return { nb: circles.length, points: points.length,
                 ecart: circles.length === 2 ? [circles[1].cx - circles[0].cx, circles[1].cy - circles[0].cy] : null,
                 rayons: circles.length === 2 ? [circles[1].rx, circles[1].ry] : null };
    });
    r.verifie('la recopie directe la décale elle aussi, sans la déformer',
        recopiee.nb === 2 && recopiee.points === 0
        && recopiee.ecart[0] > 0 && recopiee.ecart[1] > 0
        && recopiee.rayons[0] === 100 && recopiee.rayons[1] === 60,
        JSON.stringify(recopiee));

    // ET ELLE N'A PAS DE POINTS À RENDRE. « Les points de la forme » doit
    // répondre « aucun » pour elle, et non deux renvois vers le vide : le
    // prochain qui s'y fiera n'aura pas forcément de garde-fou.
    r.egal('une ellipse libre ne rend aucun point de construction',
        await page.evaluate(() => pointsDeLaForme('circle', circles[0])), []);

    // AU LASSO, elle s'attrape comme un rectangle : toute sa boîte doit tenir
    // dedans. Sinon, un lasso passant à côté d'elle l'emporterait.
    await poserEllipse(400, 300, 100, 60);
    await page.evaluate(() => { selectedItems = []; setMode('pointer'); draw(); });
    await page.mouse.move(250, 200);
    await page.mouse.down();
    await page.mouse.move(560, 400, { steps: 8 });
    await page.mouse.up();
    r.egal('le lasso qui l\'entoure entièrement la prend',
        await page.evaluate(() => selectedItems.map(i => i.type)), ['circle']);

    await poserEllipse(400, 300, 100, 60);
    await page.evaluate(() => { selectedItems = []; setMode('pointer'); draw(); });
    await page.mouse.move(250, 200);
    await page.mouse.down();
    await page.mouse.move(420, 400, { steps: 8 });   // le bord droit reste dehors
    await page.mouse.up();
    r.egal('un lasso qui n\'en prend qu\'une moitié la laisse',
        await page.evaluate(() => selectedItems.length), 0);

    // ------------------------------------------------------------------
    // 6. CE QUI NE LA CONCERNE PAS
    // ------------------------------------------------------------------
    // L'aimant géométrique travaille avec un centre et UN rayon. Une figure
    // qui en a deux n'y entre pas : elle serait aimantée de travers.
    const aimant = await page.evaluate(() => {
        points.length = 0; circles.length = 0; arcs.length = 0;
        const e = { id: nextId++, libre: true, cx: 400, cy: 300, rx: 100, ry: 60, z: globalZ++ };
        circles.push(e);
        const surLeTrait = cerclesGeometriques({ x: 500, y: 300 }, 20);
        const parRef = resoudreRef({ k: 'cercle', id: e.id });
        return { nb: surLeTrait.length, ref: parRef };
    });
    r.egal('l\'aimant géométrique ne s\'accroche pas à une ellipse libre',
        aimant, { nb: 0, ref: null });

    // Mais un vrai cercle, lui, y est toujours.
    const aimantCercle = await page.evaluate(() => {
        points.length = 0; circles.length = 0;
        const c = { id: nextId++, x: 400, y: 300, z: globalZ++ };
        const b = { id: nextId++, x: 500, y: 300, z: globalZ++ };
        points.push(c, b);
        circles.push({ id: nextId++, center_id: c.id, edge_id: b.id, z: globalZ++ });
        return cerclesGeometriques({ x: 400, y: 400 }, 20).length;
    });
    r.egal('et le cercle par points y est toujours', aimantCercle, 1);

    // ------------------------------------------------------------------
    // 7. SA BOÎTE, SON EXPORT, SON QUART DE TOUR
    // ------------------------------------------------------------------
    await poserEllipse(400, 300, 100, 60);
    r.egal('sa boîte englobante dit ses deux rayons',
        await page.evaluate(() => getItemLogicalBounds('circle', circles[0])),
        { bx: 300, by: 240, bw: 200, bh: 120 });

    const svg = await page.evaluate(() => generateSVGString({ x: 0, y: 0, w: 1280, h: 800 }, false));
    r.verifie('l\'export SVG écrit une ellipse, avec ses deux rayons',
        /<ellipse[^>]*rx="100"[^>]*ry="60"/.test(svg), svg.slice(0, 200));

    const svgCercle = await page.evaluate(() => {
        points.length = 0; circles.length = 0;
        const c = { id: nextId++, x: 400, y: 300, z: globalZ++ };
        const b = { id: nextId++, x: 500, y: 300, z: globalZ++ };
        points.push(c, b);
        circles.push({ id: nextId++, center_id: c.id, edge_id: b.id, color: '#000', width: 3, z: globalZ++ });
        return generateSVGString({ x: 0, y: 0, w: 1280, h: 800 }, false);
    });
    r.verifie('et un cercle par points reste un cercle dans l\'export',
        /<circle[^>]*r="100"/.test(svgCercle), svgCercle.slice(0, 200));

    // UN QUART DE TOUR L'ÉCHANGE, il ne la penche pas : une ellipse droite ne
    // se range pas autrement dans deux rayons.
    await poserEllipse(400, 300, 100, 60);
    const tournee = await page.evaluate(() => {
        tournerLaSelection(1);
        const e = circles[0];
        return { rx: e.rx, ry: e.ry, cx: Math.round(e.cx), cy: Math.round(e.cy) };
    });
    r.egal('un quart de tour échange ses deux rayons',
        tournee, { rx: 60, ry: 100, cx: 400, cy: 300 });

    await poserEllipse(400, 300, 100, 60);
    const retournee = await page.evaluate(() => {
        retournerLaSelection('h');
        const e = circles[0];
        return { rx: e.rx, ry: e.ry, cx: Math.round(e.cx), cy: Math.round(e.cy) };
    });
    r.egal('et un miroir la laisse telle quelle : elle est sa propre image',
        retournee, { rx: 100, ry: 60, cx: 400, cy: 300 });

    // ET ELLE TRAVERSE UN ENREGISTREMENT. Une figure qu'on ne retrouve pas au
    // rechargement n'est pas une figure : c'est un dessin.
    await aPlat();
    await page.evaluate(() => {
        circles.push({ id: nextId++, libre: true, cx: 400, cy: 300, rx: 100, ry: 60,
                       color: '#123456', width: 3, z: globalZ++ });
        saveState();
    });
    const apresRetour = await page.evaluate(() => {
        const etat = JSON.parse(history[historyIndex]);
        const e = etat.circles[0];
        return { libre: !!e.libre, rx: e.rx, ry: e.ry, couleur: e.color };
    });
    r.egal('l\'ellipse entre entière dans l\'historique',
        apresRetour, { libre: true, rx: 100, ry: 60, couleur: '#123456' });

    // ------------------------------------------------------------------
    // 8. POSÉE SUR UN POLYCOPIÉ, ELLE LE SUIT
    // C'est le geste pour lequel cette figure existe : entourer un mot d'une
    // page. Si la page bouge et que l'ovale reste, l'annotation ne veut plus
    // rien dire — et si la page s'étire, l'ovale doit s'étirer avec elle, dans
    // les deux sens à la fois.
    // ------------------------------------------------------------------
    const surLaPage = await page.evaluate(() => {
        points.length = 0; circles.length = 0; images.length = 0; arcs.length = 0;
        panX = 0; panY = 0; zoom = 1; encreAccrochee = true;
        const img = { id: nextId++, x: 200, y: 150, w: 600, h: 400, z: globalZ++ };
        images.push(img);
        const depuis = nextId;
        const e = { id: nextId++, libre: true, cx: 400, cy: 300, rx: 100, ry: 60,
                    color: '#000', width: 3, z: globalZ++ };
        circles.push(e);
        accrocherLesNouvellesFormes(depuis);
        const accrochee = !!(e.surObjet && e.surObjet.type === 'image' && e.surObjet.id === img.id);

        deplacerLesFormes('image', img.id, 55, -30);
        const bougee = [e.cx, e.cy];

        // La page s'étire deux fois plus large, et pas plus haute.
        etirerLesFormes('image', img.id,
            { x: 200, y: 150, w: 600, h: 400 }, { x: 200, y: 150, w: 1200, h: 400 });
        return { accrochee, bougee, rayons: [e.rx, e.ry], cx: e.cx };
    });
    r.verifie('une ellipse tracée sur un polycopié lui appartient',
        surLaPage.accrochee, JSON.stringify(surLaPage));
    r.egal('elle suit le polycopié qu\'on déplace', surLaPage.bougee, [455, 270]);
    r.egal('et le polycopié étiré en largeur l\'étire en largeur seule',
        { rayons: surLaPage.rayons, cx: surLaPage.cx }, { rayons: [200, 60], cx: 710 });

    // Le quart de tour d'une page retourne les figures qu'elle porte : l'ellipse
    // reste droite, mais ses deux rayons s'échangent.
    const tourneeAvecLaPage = await page.evaluate(() => {
        circles[0].rx = 100; circles[0].ry = 60; circles[0].cx = 400; circles[0].cy = 300;
        tournerLesFormes('image', images[0].id, { x: 400, y: 300 }, Math.PI / 2);
        return [circles[0].rx, circles[0].ry, Math.round(circles[0].cx), Math.round(circles[0].cy)];
    });
    r.egal('le quart de tour de la page échange ses deux rayons',
        tourneeAvecLaPage, [60, 100, 400, 300]);

    await tableauVierge(page);
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
