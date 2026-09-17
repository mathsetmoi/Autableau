// LE CHEMIN DU RETOUR, APRÈS UNE DÉCOUPE.
//
// « Quand je coupe dans un PDF et que je mets à côté, c'est relou de revenir au
// PDF — qui d'ailleurs ne devient qu'une image, on ne peut plus naviguer
// dedans. »
//
// C'était exact, et mesuré : poser un morceau referme le plein écran (on ne
// pose pas à côté d'une page qu'on projette), le morceau devient le document
// tenu, et un morceau n'a pas de pages — les flèches s'en vont avec lui. Le
// retour demandait quatre gestes : retrouver le PDF sous les morceaux, le
// cliquer, re-projeter, revenir à la bonne page.
//
// Le morceau savait pourtant déjà tout : le fichier, la page, le document dont
// il vient. Il ne manquait que le chemin — et, pour rendre le document COMME ON
// L'AVAIT LAISSÉ, une chose de plus : qu'il ait noté, à l'instant du découpage,
// qu'on le projetait.
//
// CE QUE CETTE SUITE TIENT :
//
//   — le bouton ne paraît que sur un morceau, et seulement si le document dont
//     il vient est encore sur le tableau ;
//   — il rend le document, à SA page, et re-projette s'il était projeté quand
//     on a découpé ;
//   — hors projection, il ramène le document sous les yeux : le sélectionner
//     sans le montrer ne servirait à rien ;
//   — un morceau redécoupé dans un morceau rentre jusqu'au PDF, et non chez son
//     voisin immédiat ;
//   — la source effacée, le bouton s'en va et le chemin le dit ;
//   — et les flèches de page reviennent avec le document : c'est toute la
//     plainte.
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Revenir au document découpé');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function'
        && typeof allerALaPage === 'function', { timeout: 20000 });

    const octets = Array.from(petitPdf());

    // Un PDF de trois pages, posé à plat, ouvert à la page demandée.
    const poserLePdf = (n) => page.evaluate(async ({ octets, n }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; freehands.length = 0; texts.length = 0;
        if (typeof quitterLaPresentation === 'function') quitterLaPresentation();
        morceauxEnAttente = [];
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1000));
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        if (n > 1) await allerALaPage(images[0], n);
        majBarreDocument();
        return images[0].id;
    }, { octets, n });

    // Découper un morceau dans l'image visée, et le poser où on le dit.
    const decouperEtPoser = (ou) => page.evaluate((ou) => {
        const src = images.find(i => i.pluginData && i.pluginData.id === 'pdfDoc') || images[0];
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: src.x + 20, y: src.y + 20 });
        poursuivreGesteDeDecoupe({ x: src.x + src.w * 0.6, y: src.y + src.h * 0.4 });
        finirGesteDeDecoupe();
        const m = morceauxEnAttente[morceauxEnAttente.length - 1];
        const objet = poserLeMorceau(m, ou || { x: src.x + src.w + 300, y: src.y + 100 });
        majBarreDocument();
        return objet.id;
    }, ou);

    const etat = () => page.evaluate(() => {
        const vu = (id) => {
            const e = document.getElementById(id);
            return !!e && getComputedStyle(e).display !== 'none';
        };
        const doc = documentDeLaBarre();
        return {
            tenu: doc ? (doc.pluginData ? doc.pluginData.id : 'image') : null,
            feuilletable: doc ? estUnPdfFeuilletable(doc) : null,
            retour: vu('doc-retour'),
            fleches: vu('doc-pages'),
            page: doc && doc.pluginData ? doc.pluginData.page : null,
            projette: !!presentationEnCours
        };
    });

    // ------------------------------------------------------------------
    // 1. LE BOUTON PARAÎT OÙ IL SERT, ET NULLE PART AILLEURS
    // ------------------------------------------------------------------
    await poserLePdf(1);
    const surLePdf = await etat();
    r.verifie('sur le PDF lui-même, pas de bouton de retour : on y est',
        surLePdf.retour === false && surLePdf.fleches === true, JSON.stringify(surLePdf));

    await decouperEtPoser();
    const surLeMorceau = await etat();
    r.verifie('sur le morceau posé, le bouton de retour paraît — et les flèches sont parties',
        surLeMorceau.tenu === 'morceau' && surLeMorceau.retour === true
        && surLeMorceau.fleches === false, JSON.stringify(surLeMorceau));

    // L'INFOBULLE NE NOMME PAS LE FICHIER, et c'est voulu : elle serait alors
    // réécrite au chargement, ce que le chapitre 54 refuse. Mais elle existe —
    // le chapitre 09 refuse une icône muette dans cette barre.
    // Et l'icône est un DESSIN, pas une vitre : un « <svg> » vide passe pour une
    // icône auprès de qui ne compte que les balises — deux boutons de cette
    // barre sont d'ailleurs des vitres que le code remplit, mais celui-ci
    // porte son trait dans la page.
    const bulle = await page.evaluate(() => {
        const b = document.getElementById('doc-retour');
        const svg = b.querySelector('svg');
        return { texte: b.getAttribute('data-tooltip'), mot: b.textContent.trim(),
                 traits: svg ? svg.children.length : 0 };
    });
    r.verifie('le bouton porte son infobulle, un vrai dessin, et pas un mot écrit',
        !!bulle.texte && bulle.texte.length > 10 && bulle.traits >= 2 && bulle.mot === '',
        JSON.stringify(bulle));

    // ------------------------------------------------------------------
    // 2. IL REND LE DOCUMENT, À SA PAGE
    // C'est le cœur de la plainte : « on ne peut plus naviguer dedans ».
    // ------------------------------------------------------------------
    await poserLePdf(2);
    await decouperEtPoser();
    r.egal('le morceau retient la page dont il a été tiré',
        await page.evaluate(() => images.find(i => i.pluginData.id === 'morceau').pluginData.page), 2);

    // On feuillette ailleurs entre-temps : le retour doit REVENIR à la page du
    // morceau, et non laisser le document où on l'avait abandonné.
    await page.evaluate(async () => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        await allerALaPage(pdf, 3);
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
    });
    await page.evaluate(() => document.getElementById('doc-retour').click());
    await page.waitForTimeout(500);
    const rentre = await etat();
    r.verifie('le bouton rend le PDF, à la page du morceau, avec ses flèches',
        rentre.tenu === 'pdfDoc' && rentre.feuilletable === true
        && rentre.page === 2 && rentre.fleches === true, JSON.stringify(rentre));

    // ------------------------------------------------------------------
    // 3. COMME ON L'AVAIT LAISSÉ
    // ------------------------------------------------------------------
    await poserLePdf(2);
    await page.evaluate(async () => { presenterLeDocument(); await new Promise(r => setTimeout(r, 400)); });
    r.verifie('le PDF est bien projeté avant la découpe',
        (await etat()).projette === true, JSON.stringify(await etat()));

    await decouperEtPoser();
    const apresPose = await etat();
    r.verifie('poser le morceau referme la projection — c\'est la règle d\'avant',
        apresPose.projette === false && apresPose.tenu === 'morceau', JSON.stringify(apresPose));

    await page.evaluate(() => document.getElementById('doc-retour').click());
    await page.waitForTimeout(600);
    const reprojete = await etat();
    r.verifie('et le retour re-projette le document, à sa page',
        reprojete.projette === true && reprojete.tenu === 'pdfDoc' && reprojete.page === 2,
        JSON.stringify(reprojete));

    // Découpé SANS projection, le retour ne projette pas : on ne décide pas à
    // la place du professeur de mettre une page en grand devant la classe.
    await poserLePdf(1);
    await decouperEtPoser();
    await page.evaluate(() => document.getElementById('doc-retour').click());
    await page.waitForTimeout(400);
    const sansProjection = await etat();
    r.verifie('découpé sans projeter, le retour ne projette pas',
        sansProjection.projette === false && sansProjection.tenu === 'pdfDoc',
        JSON.stringify(sansProjection));

    // MAIS IL RAMÈNE LE DOCUMENT SOUS LES YEUX. On range les morceaux, on
    // dérive à l'autre bout du tableau : le sélectionner sans le montrer ne
    // servirait à rien.
    await poserLePdf(1);
    await decouperEtPoser();
    const ramene = await page.evaluate(async () => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        panX = -8000; panY = -8000;                 // le document est loin derrière
        draw();
        const dehors = (o) => {
            const x = panX + o.x * zoom, y = panY + o.y * zoom;
            return x + o.w * zoom < 0 || y + o.h * zoom < 0
                || x > window.innerWidth || y > window.innerHeight;
        };
        const avant = dehors(pdf);
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
        document.getElementById('doc-retour').click();
        await new Promise(r => setTimeout(r, 400));
        return { avant, apres: dehors(pdf) };
    });
    r.verifie('le document parti de l\'écran y revient', ramene.avant && !ramene.apres,
        JSON.stringify(ramene));

    // ------------------------------------------------------------------
    // 4. LES CAS OÙ LE CHEMIN NE MÈNE PLUS NULLE PART
    // ------------------------------------------------------------------
    await poserLePdf(1);
    await decouperEtPoser();
    const sansSource = await page.evaluate(() => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        deleteObject('image', pdf.id);
        selectedItems = [{ type: 'image', id: images.find(i => i.pluginData.id === 'morceau').id }];
        majBarreDocument();
        return {
            bouton: getComputedStyle(document.getElementById('doc-retour')).display,
            chemin: documentSourceDuMorceau(images.find(i => i.pluginData.id === 'morceau'))
        };
    });
    r.egal('le document effacé, le bouton s\'en va', sansSource.bouton, 'none');
    r.egal('et le chemin ne mène plus nulle part', sansSource.chemin, null);

    // SEUL UN MORCEAU A UNE MAISON. Un document n'est le morceau de personne —
    // et le même PDF posé DEUX FOIS partage sa clé avec son jumeau : sans cette
    // règle, chaque exemplaire s'offrirait un bouton pour « revenir » chez
    // l'autre, ce qui ne veut rien dire.
    await poserLePdf(1);
    const pasUnMorceau = await page.evaluate(() => {
        const pdf = images.find(i => i.pluginData.id === 'pdfDoc');
        const jumeau = { ...pdf, id: nextId++, x: pdf.x + pdf.w + 60, z: globalZ++,
                         pluginData: { ...pdf.pluginData } };
        images.push(jumeau);
        const nue = { id: nextId++, x: 10, y: 10, w: 40, h: 40, src: pdf.src, z: globalZ++ };
        images.push(nue);
        selectedItems = [{ type: 'image', id: jumeau.id }];
        majBarreDocument();
        return {
            surLeJumeau: getComputedStyle(document.getElementById('doc-retour')).display,
            cheminDuJumeau: documentSourceDuMorceau(jumeau),
            cheminDuPdf: documentSourceDuMorceau(pdf),
            cheminDUneImage: documentSourceDuMorceau(nue)
        };
    });
    r.egal('un PDF posé deux fois ne s\'offre pas un bouton pour rentrer chez son jumeau',
        [pasUnMorceau.surLeJumeau, pasUnMorceau.cheminDuJumeau], ['none', null]);
    r.egal('ni un PDF, ni une image nue n\'ont de maison à retrouver',
        [pasUnMorceau.cheminDuPdf, pasUnMorceau.cheminDUneImage], [null, null]);

    // Appelé quand même — par un raccourci, par une barre composée — il le dit
    // au lieu de ne rien faire.
    r.egal('appelé sans source, le retour refuse proprement',
        await page.evaluate(() => revenirAuDocumentDuMorceau()), false);

    // ------------------------------------------------------------------
    // 5. UN MORCEAU DE MORCEAU RENTRE JUSQU'AU PDF
    // On redécoupe parfois en deux fois. Le voisin immédiat n'est pas la
    // maison : ce qu'on veut retrouver, c'est la page qu'on feuillette.
    // ------------------------------------------------------------------
    await poserLePdf(3);
    await decouperEtPoser();
    const enDeuxFois = await page.evaluate(() => {
        const premier = images.find(i => i.pluginData && i.pluginData.id === 'morceau');
        basculerLaDecoupe(true);
        commencerGesteDeDecoupe({ x: premier.x + 5, y: premier.y + 5 });
        poursuivreGesteDeDecoupe({ x: premier.x + premier.w * 0.5, y: premier.y + premier.h * 0.5 });
        finirGesteDeDecoupe();
        const second = poserLeMorceau(morceauxEnAttente[morceauxEnAttente.length - 1],
            { x: premier.x, y: premier.y + premier.h + 120 });
        const versOu = documentSourceDuMorceau(second);
        return {
            premier: premier.id, second: second.id,
            versOu: versOu ? (versOu.pluginData.id + '#' + versOu.id) : null,
            page: second.pluginData.page
        };
    });
    r.verifie('un morceau taillé dans un morceau rentre au PDF, pas chez son voisin',
        enDeuxFois.versOu === 'pdfDoc#' + (await page.evaluate(() => images.find(i => i.pluginData.id === 'pdfDoc').id))
        && enDeuxFois.page === 3,
        JSON.stringify(enDeuxFois));

    // ------------------------------------------------------------------
    // 6. ET RIEN DE TOUT CELA NE TIENT SANS LE VRAI GESTE
    // Appeler les fonctions à la main ne prouve pas qu'elles sont branchées :
    // on clique le bouton à la souris, là où il se dessine.
    // ------------------------------------------------------------------
    await poserLePdf(2);
    await decouperEtPoser();
    const place = await page.evaluate(() => {
        const b = document.getElementById('doc-retour').getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.width };
    });
    r.verifie('le bouton occupe une vraie place à l\'écran', place.l > 8, JSON.stringify(place));
    await page.mouse.click(place.x, place.y);
    await page.waitForTimeout(500);
    const parLaSouris = await etat();
    r.verifie('un clic de souris sur le bouton ramène au document et à ses pages',
        parLaSouris.tenu === 'pdfDoc' && parLaSouris.fleches === true && parLaSouris.page === 2,
        JSON.stringify(parLaSouris));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
