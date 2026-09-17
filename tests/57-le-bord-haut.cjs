// LE BORD HAUT DU TABLEAU : TROIS RETOUCHES.
//
// « Les petits bonhommes classes ne sont pas centrés. Le bouton "enregistré" à
// côté de l'horloge, ça fait trop gros, je mettrais plutôt le "enregistré"
// autre part. Une idée ? Pour l'horloge, on pourrait avoir le mode où on a
// l'horloge analogique et la date au-dessus, 02/06/26. Mais ça peut être une
// personnalisation. »
//
// 1. LA PASTILLE DE CLASSE était un emoji dans un bouton rond. L'encre d'un
//    emoji ne s'assied pas au centre de sa boîte de ligne, et le décalage
//    change avec la police système : aucune marge ne le rattrape partout. Il
//    ignorait aussi « color », si bien que la couleur de survol annoncée par
//    cette pastille n'arrivait jamais. C'est un dessin, maintenant.
//
//    ON MESURE L'ENCRE, ET NON LA BOÎTE. C'est tout le piège : la boîte d'un
//    emoji peut être parfaitement centrée pendant que son dessin penche. On
//    photographie donc la pastille et l'on cherche où sont les pixels sombres.
//
// 2. L'ÉTAT D'ENREGISTREMENT gardait son mot à l'écran. Le point dit déjà ce
//    qu'on lit en passant ; la phrase — « il y a trois minutes », « rangé dans
//    Mes tableaux » — vit dans l'infobulle, et plus complète.
//
// 3. LA DATE PEUT SE RANGER AU-DESSUS DU CADRAN, en personnalisation, avec un
//    format bref dont l'année tient sur deux chiffres.
const { creerRapport, ouvrirApp, rechargerApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le bord haut du tableau');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // 1. LA PASTILLE DE CLASSE
    // ------------------------------------------------------------------
    // On photographie L'INTÉRIEUR de la pastille — quatre pixels en retrait,
    // pour laisser dehors son contour, qui prend la couleur d'accent quand une
    // classe est choisie et compterait pour de l'encre.
    const MARGE = 4;
    const boite = await page.evaluate((m) => {
        const p = document.getElementById('classe-pastille');
        const b = p.getBoundingClientRect();
        return { x: b.x + m, y: b.y + m, width: b.width - 2 * m, height: b.height - 2 * m,
                 large: Math.round(b.width), haut: Math.round(b.height) };
    }, MARGE);
    r.verifie('la pastille est bien le bouton rond qu\'on connaît',
        boite.large >= 28 && boite.large <= 36 && Math.abs(boite.large - boite.haut) <= 2,
        JSON.stringify(boite));

    const png = await page.screenshot({ clip: { x: boite.x, y: boite.y, width: boite.width, height: boite.height } });
    const encre = await page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        // L'encre du dessin est franchement sombre ; le fond est blanc et la
        // couleur d'accent, plus claire, reste au-dessus du seuil.
        let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
        for (let py = 0; py < c.height; py++) {
            for (let px = 0; px < c.width; px++) {
                const i = (py * c.width + px) * 4;
                const clarte = (d[i] + d[i + 1] + d[i + 2]) / 3;
                if (d[i + 3] > 40 && clarte < 140) {
                    n++;
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }
            }
        }
        if (!n) return { n: 0, larg: c.width, haut: c.height };
        return { n, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
                 larg: c.width, haut: c.height,
                 dx: Math.round(((minX + maxX) / 2 - (c.width - 1) / 2) * 100) / 100,
                 dy: Math.round(((minY + maxY) / 2 - (c.height - 1) / 2) * 100) / 100 };
    }, png.toString('base64'));

    r.verifie('il y a bien un dessin dans la pastille, et pas un carré vide',
        encre.n > 30, JSON.stringify(encre));
    r.verifie('et son encre est centrée dans la pastille, à un pixel près',
        encre.n > 30 && Math.abs(encre.dx) <= 1.5 && Math.abs(encre.dy) <= 1.5,
        JSON.stringify(encre));

    // ET C'EST UN DESSIN, donc il prend la couleur du bouton — ce qu'un emoji
    // ne faisait pas : la pastille annonçait un survol coloré qui n'arrivait
    // jamais.
    const matiere = await page.evaluate(() => {
        const p = document.getElementById('classe-pastille');
        const svg = p.querySelector('.cp-ico svg');
        if (!svg) return { svg: false };
        const avant = getComputedStyle(svg).stroke;
        const couleurDuBouton = getComputedStyle(p).color;
        p.style.color = 'rgb(1, 2, 3)';
        const apres = getComputedStyle(svg).stroke;
        p.style.color = '';
        return { svg: true, suitLaCouleur: apres === 'rgb(1, 2, 3)', avant, couleurDuBouton };
    });
    r.verifie('l\'icône est un tracé qui suit la couleur du bouton',
        matiere.svg && matiere.suitLaCouleur && matiere.avant === matiere.couleurDuBouton,
        JSON.stringify(matiere));

    // ------------------------------------------------------------------
    // 2. L'ÉTAT D'ENREGISTREMENT : LE POINT RESTE, LE MOT S'EN VA
    // ------------------------------------------------------------------
    const etat = await page.evaluate(() => {
        if (typeof updateUnsavedIndicator === 'function') updateUnsavedIndicator();
        const b = document.getElementById('etat-enregistrement');
        const mot = document.getElementById('etat-mot');
        const point = b.querySelector('.etat-point');
        return {
            large: Math.round(b.getBoundingClientRect().width),
            motCache: getComputedStyle(mot).display === 'none',
            motEcrit: (mot.textContent || '').trim(),
            pointVu: getComputedStyle(point).display !== 'none'
                     && point.getBoundingClientRect().width >= 5,
            bulle: b.getAttribute('data-tooltip') || b.getAttribute('title') || '',
            drapeau: b.dataset.etat
        };
    });
    r.verifie('la pastille d\'enregistrement s\'est réduite à son point',
        etat.large <= 24 && etat.pointVu && etat.motCache, JSON.stringify(etat));
    r.verifie('le mot est toujours écrit par le code — il n\'est plus montré, il n\'est pas perdu',
        etat.motEcrit.length > 0, JSON.stringify(etat));
    r.verifie('et la phrase entière se lit dans l\'infobulle',
        /enregistr/i.test(etat.bulle) && etat.bulle.length > 20, etat.bulle);
    r.verifie('le point dit dans quel état on est', !!etat.drapeau, String(etat.drapeau));

    // Le clic ouvre toujours « Mes tableaux » : c'est un état ET une porte.
    const porte = await page.evaluate(async () => {
        document.getElementById('etat-enregistrement').click();
        await new Promise(ok => setTimeout(ok, 350));
        const t = document.getElementById('right-drawer');
        return t ? t.classList.contains('open') : null;
    });
    r.verifie('un clic dessus ouvre toujours la liste des tableaux', porte === true, String(porte));
    await page.evaluate(() => { if (typeof toggleRightDrawer === 'function') toggleRightDrawer(); });

    // ------------------------------------------------------------------
    // 3. LA DATE AU-DESSUS DU CADRAN
    // ------------------------------------------------------------------
    const format = await page.evaluate(() => {
        const d = new Date(2026, 8, 17);
        return { bref: FORMATS_DATE.bref(d), chiffres: FORMATS_DATE.chiffres(d) };
    });
    r.egal('le format bref écrit l\'année sur deux chiffres', format.bref, '17/09/26');
    r.verifie('et il diffère bien de celui qui l\'écrit sur quatre',
        format.chiffres === '17/09/2026', JSON.stringify(format));

    r.verifie('le bouton du format bref est dans le panneau',
        await page.evaluate(() => !!document.querySelector('#reglages-date [data-format="bref"]')), '');

    // L'option ne paraît qu'avec le cadran : sans cadran, « au-dessus du
    // cadran » promettrait un geste qui n'arrive pas.
    const offerte = await page.evaluate(() => {
        const b = document.getElementById('rd-date-dessus');
        const lu = () => getComputedStyle(b).display !== 'none';
        reglagesDate.horloge = 'chiffres'; majReglagesDate();
        const enChiffres = lu();
        reglagesDate.horloge = 'aiguilles'; majReglagesDate();
        return { enChiffres, enAiguilles: lu() };
    });
    r.egal('l\'option ne s\'offre qu\'avec un cadran', offerte, { enChiffres: false, enAiguilles: true });

    // LA MESURE : la date est-elle AU-DESSUS du cadran, ou à côté ?
    const disposition = () => page.evaluate(() => {
        const champ = document.getElementById('project-name-input');
        const cadran = document.getElementById('titre-horloge-boite');
        const a = champ.getBoundingClientRect(), b = cadran.getBoundingClientRect();
        return {
            dateSurLeCadran: Math.round(a.bottom) <= Math.round(b.top) + 2,
            dateACote: Math.round(a.right) <= Math.round(b.left) + 2
                       && Math.round(a.top) < Math.round(b.bottom),
            memeAxe: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 30,
            classe: document.getElementById('project-name-wrapper').classList.contains('date-dessus')
        };
    });

    await page.evaluate(() => {
        reglagesDate.affichee = true; reglagesDate.heure = true;
        reglagesDate.horloge = 'aiguilles'; reglagesDate.dateDessus = false;
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate(); majReglagesDate();
    });
    const enLigne = await disposition();
    r.verifie('par défaut, la date se tient À CÔTÉ du cadran',
        enLigne.dateACote && !enLigne.dateSurLeCadran && !enLigne.classe, JSON.stringify(enLigne));

    await page.evaluate(() => document.getElementById('rd-date-dessus').click());
    await page.waitForTimeout(150);
    const empilee = await disposition();
    r.verifie('l\'option la range au-dessus du cadran, sur le même axe',
        empilee.dateSurLeCadran && empilee.memeAxe && empilee.classe, JSON.stringify(empilee));

    // ET CE SEUL CLIC L'A DÉJÀ ENREGISTRÉE. On le regarde ICI, avant de toucher
    // à quoi que ce soit d'autre : chacun des boutons de ce panneau enregistre
    // l'objet ENTIER, si bien qu'un voisin cliqué ensuite sauverait le réglage
    // à la place de celui qu'on éprouve — et l'on croirait tenir une garde
    // qu'on n'a pas.
    const ecritAussitot = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('board_reglages_date') || '{}').dateDessus; }
        catch (e) { return 'illisible'; }
    });
    r.egal('le clic seul suffit à l\'enregistrer', ecritAussitot, true);

    // Et le format bref y tient : c'est pour cela qu'il existe.
    await page.evaluate(() => document.querySelector('#reglages-date [data-format="bref"]').click());
    await page.waitForTimeout(150);
    const texteBref = await page.evaluate(() => document.getElementById('project-name-input').value);
    r.verifie('la date y est écrite en bref', /^\d{2}\/\d{2}\/\d{2}$/.test(texteBref), texteBref);

    // LE RÉGLAGE TRAVERSE LE RECHARGEMENT : c'est une personnalisation, pas
    // une bascule de séance.
    await rechargerApp(page);
    const apresRetour = await page.evaluate(() => ({
        dessus: !!reglagesDate.dateDessus,
        format: reglagesDate.format,
        classe: document.getElementById('project-name-wrapper').classList.contains('date-dessus')
    }));
    r.egal('la personnalisation tient après un rechargement',
        apresRetour, { dessus: true, format: 'bref', classe: true });

    // Et l'on peut revenir en arrière : une personnalisation qui ne se défait
    // pas est un piège.
    const defaite = await page.evaluate(async () => {
        reglagesDate.dateDessus = false; reglagesDate.format = 'long';
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        await new Promise(ok => setTimeout(ok, 100));
        return document.getElementById('project-name-wrapper').classList.contains('date-dessus');
    });
    r.egal('et elle se défait', defaite, false);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
