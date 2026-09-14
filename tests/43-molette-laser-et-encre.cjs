// TROIS GESTES QUI BUTAIENT.
//
// « Quand on est tout en bas et que l'on force avec la molette, on passe à la
// page suivante (idem pour la précédente). » La molette défilait jusqu'au bas
// de la page, et là plus rien : il fallait lâcher la souris pour aller
// chercher la flèche de la barre, ou connaître Page↓.
//
// « Pointeur laser qui rame sur PDF. » Chaque frisson du faisceau repeignait
// TOUT — la page du document comprise, des millions de pixels, soixante fois
// par seconde. Le chemin court existait déjà pour le crayon ; le laser en a
// plus besoin encore, puisqu'il se redessine même quand la main ne bouge
// plus, le temps qu'il s'efface.
//
// « Pour la démonstration, le crayon ne trace plus rien si c'est blanc, il
// faut veiller à la couleur. » La visite écrit avec la couleur du moment ;
// sur sa page blanche, un enseignant qui venait d'écrire en blanc sur fond
// sombre la regardait tracer dans le vide.
const { creerRapport, ouvrirApp, petitPdf, pdfA4 } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Molette, laser et encre');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    // =================================================================
    // 1. LA MOLETTE TOURNE LA PAGE — QUAND ON INSISTE
    // =================================================================
    const octets = Array.from(petitPdf(['Une', 'Deux', 'Trois']));
    await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1600));
        setMode('pointer'); selectObject({ type: 'image', id: images[0].id });
        presenterLeDocument();
    }, { octets });
    await page.waitForTimeout(600);

    const numero = () => page.evaluate(() => images[0].pluginData.page);
    const auBord = (versLeBas) => page.evaluate((bas) => {
        pousseeDansLeVide = 0; derniereTournee = 0;
        cadrerLeBordDeLaPage(documentPresente(), !bas);
    }, versLeBas);
    // Un cran de molette, comme le navigateur l'envoie.
    const molette = (dy) => page.evaluate((d) => {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, bubbles: true, cancelable: true }));
    }, dy);

    r.egal('on présente bien la première page', await numero(), 1);

    // Au bord du bas, un seul petit cran ne doit RIEN tourner : sinon on
    // saute les trois dernières lignes de l'exercice qu'on était en train
    // de lire.
    await auBord(true);
    await molette(40);
    await page.waitForTimeout(150);
    r.egal('un petit cran au bord ne tourne pas la page', await numero(), 1);

    // On insiste : la page tourne.
    await molette(120);
    await page.waitForTimeout(500);
    r.egal('en forçant, on passe à la suivante', await numero(), 2);

    // ET PAS DEUX D'UN COUP. Le pavé tactile continue sur son erre : quatre
    // crans coup sur coup, c'est UN geste, pas quatre pages. On compte les
    // tours et non le numéro, car la page suivante se rend en différé.
    await auBord(true);
    const enfilade = await page.evaluate(() => {
        let tours = 0;
        const vrai = window.tournerLaPageDuDocument;
        window.tournerLaPageDuDocument = function () {
            const r = vrai.apply(this, arguments);
            if (r) tours++;
            return r;
        };
        pousseeDansLeVide = 0; derniereTournee = 0;
        const cran = () => canvas.dispatchEvent(new WheelEvent('wheel',
            { deltaY: 400, deltaMode: 0, bubbles: true, cancelable: true }));
        cran(); cran(); cran(); cran();
        window.tournerLaPageDuDocument = vrai;
        return tours;
    });
    r.egal('quatre crans coup sur coup ne tournent qu\'une page', enfilade, 1);

    // Dans l'autre sens, depuis le haut de la page 2.
    await page.evaluate(async () => { await allerALaPage(documentPresente(), 2); });
    await page.waitForTimeout(300);
    await auBord(false);
    await molette(-60);
    await molette(-120);
    await page.waitForTimeout(500);
    r.egal('vers le haut, on revient à la précédente', await numero(), 1);

    // CHANGER DE SENS REMET LE COMPTEUR À ZÉRO : ce qu'on a poussé vers le
    // bas ne doit pas servir à remonter.
    const change = await page.evaluate(() => {
        pousseeDansLeVide = 0; derniereTournee = 0;
        tournerSiOnForce(100);       // presque assez, vers le bas
        const apresLeBas = pousseeDansLeVide;
        tournerSiOnForce(-40);       // on repart dans l'autre sens
        return { apresLeBas, apresLeChangement: pousseeDansLeVide };
    });
    r.egal('changer de sens repart de zéro', change, { apresLeBas: 100, apresLeChangement: -40 });

    // TANT QUE LA PAGE A DU MOU, LE COMPTEUR REPART DE ZÉRO. On pousse
    // presque assez au bord, puis on remonte DANS la page — elle défile, donc
    // on n'est plus au bord —, puis on repousse un peu. Sans cette remise à
    // zéro, les deux poussées s'ajouteraient et la page tournerait pour un
    // demi-geste, alors qu'on vient de relire un paragraphe entre les deux.
    const duMou = await page.evaluate(() => {
        let tours = 0;
        const vrai = window.tournerLaPageDuDocument;
        window.tournerLaPageDuDocument = function () { tours++; return true; };
        pousseeDansLeVide = 0; derniereTournee = 0;
        tournerSiOnForce(100);       // au bord, presque assez
        tournerSiOnForce(0);         // la page a repris du mou
        const apresLeMou = pousseeDansLeVide;
        tournerSiOnForce(60);        // on repousse un peu : pas de quoi tourner
        window.tournerLaPageDuDocument = vrai;
        return { apresLeMou, tours, compteur: pousseeDansLeVide };
    });
    r.egal('la page reprise en main remet le compteur à zéro',
        duMou, { apresLeMou: 0, tours: 0, compteur: 60 });

    // À la dernière page, on le dit au lieu de tourner dans le vide.
    const auBout = await page.evaluate(async () => {
        const doc = documentPresente();
        await allerALaPage(doc, doc.pluginData.pages);
        let dit = null; const vrai = window.showToast; window.showToast = (m) => { dit = m; };
        pousseeDansLeVide = 0; derniereTournee = 0;
        tournerSiOnForce(300);
        window.showToast = vrai;
        return { page: doc.pluginData.page, dit };
    });
    r.egal('à la dernière page, on le dit',
        { page: auBout.page, fin: /fin du document/i.test(auBout.dit || '') },
        { page: 3, fin: true });

    await page.evaluate(() => quitterLaPresentation());
    await page.waitForTimeout(300);

    // =================================================================
    // 2. LE LASER NE REPEINT PLUS TOUT LE TABLEAU
    // =================================================================
    const gros = Array.from(pdfA4(1));
    await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0; laserStrokes.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'gros.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1800));
        setMode('pointer');
    }, { octets: gros });

    const balayage = await page.evaluate(async () => {
        setMode('laser');
        let courts = 0, longs = 0;
        const vrai = window.calqueUtilisable;
        window.calqueUtilisable = function () {
            const r = vrai.apply(this, arguments);
            if (r) courts++; else longs++;
            return r;
        };
        const ev = (t, x, y, appuie) => canvas.dispatchEvent(new PointerEvent(t, {
            clientX: x, clientY: y, buttons: appuie ? 1 : 0,
            bubbles: true, pointerId: 1, isPrimary: true
        }));
        ev('pointerdown', 300, 300, true);
        for (let i = 0; i < 30; i++) {
            ev('pointermove', 300 + i * 9, 300 + Math.sin(i / 3) * 40, true);
            await new Promise(ok => requestAnimationFrame(ok));
        }
        ev('pointerup', 570, 300, false);
        await new Promise(ok => setTimeout(ok, 200));
        window.calqueUtilisable = vrai;
        return { courts, longs };
    });
    r.verifie('le faisceau se pose sur une image figée, au lieu de tout repeindre',
        balayage.courts > 50 && balayage.longs <= 3, JSON.stringify(balayage));

    // LA PHOTO NE CONTIENT AUCUN FAISCEAU. Prise avec un trait dessus, il y
    // resterait gravé et ne s'effacerait jamais.
    const sansFaisceau = await page.evaluate(async () => {
        laserStrokes.length = 0;
        setMode('laser');
        // Un premier faisceau, bien visible.
        laserStrokes.push([{ x: 100, y: 100, time: Date.now() }, { x: 400, y: 160, time: Date.now() }]);
        draw();
        figerLeCalqueSansLaser();
        // On lit la photo : elle ne doit porter aucune trace de rouge laser.
        const g = calqueFige.getContext('2d');
        const d = g.getImageData(0, 0, calqueFige.width, calqueFige.height).data;
        let rouges = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] < 90 && d[i + 3] > 40) rouges++;
        }
        laserStrokes.length = 0;
        return rouges;
    });
    r.egal('et la photo figée ne garde aucun faisceau', sansFaisceau, 0);

    // Hors du mode laser, le chemin court reste réservé au crayon : un
    // faisceau qui s'efface change l'image sous le trait qu'on écrit.
    const horsLaser = await page.evaluate(() => {
        setMode('freehand');
        laserStrokes.push([{ x: 10, y: 10, time: Date.now() }]);
        figerLeCalque();
        isDrawingFreehand = true; currentFreehand = { points: [{ x: 0, y: 0 }], color: '#000', width: 3 };
        const r = calqueUtilisable();
        isDrawingFreehand = false; currentFreehand = null; laserStrokes.length = 0;
        setMode('pointer');
        return r;
    });
    r.egal('un faisceau qui s\'efface interdit le chemin court au crayon', horsLaser, false);

    // =================================================================
    // 3. UNE ENCRE QU'ON VOIT SUR LE FOND QU'ON A
    // =================================================================
    const encres = await page.evaluate(() => {
        const essai = (couleur, sombre) => {
            isDarkMode = !!sombre;
            activeStyle.strokeColor = couleur;
            const change = encreLisibleSurLeFond();
            return { change, apres: activeStyle.strokeColor };
        };
        const out = {
            blancSurClair: essai('#ffffff', false),
            bleuSurClair: essai('#3498db', false),
            ardoiseSurSombre: essai('#2d3436', true),
            blancSurSombre: essai('#ffffff', true)
        };
        isDarkMode = false;
        return out;
    });
    r.egal('le blanc sur une page blanche est remplacé',
        encres.blancSurClair, { change: true, apres: '#2d3436' });
    r.egal('mais le bleu de l\'enseignant est laissé tel quel',
        encres.bleuSurClair, { change: false, apres: '#3498db' });
    r.egal('sur fond sombre, c\'est l\'ardoise qui se perd',
        encres.ardoiseSurSombre, { change: true, apres: '#ffffff' });
    r.egal('et le blanc y est parfait', encres.blancSurSombre, { change: false, apres: '#ffffff' });

    // UNE COULEUR QU'ON NE SAIT PAS LIRE NE FAIT RIEN CHANGER — sur les deux
    // fonds. Sans garde-fou, une clarté « inconnue » vaut zéro au moment de
    // comparer : sur fond sombre, elle passait pour une encre noire et la
    // couleur de l'enseignant était remplacée sans raison.
    r.egal('une couleur illisible ne déclenche rien, sur l\'un comme sur l\'autre fond',
        await page.evaluate(() => {
            const essai = (sombre) => {
                isDarkMode = sombre;
                activeStyle.strokeColor = 'rouge-brique';
                const c = encreLisibleSurLeFond();
                return { change: c, apres: activeStyle.strokeColor };
            };
            const out = { clair: essai(false), sombre: essai(true) };
            isDarkMode = false; activeStyle.strokeColor = '#2d3436';
            return out;
        }),
        { clair: { change: false, apres: 'rouge-brique' },
          sombre: { change: false, apres: 'rouge-brique' } });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
