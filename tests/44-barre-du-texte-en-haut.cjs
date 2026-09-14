// LA BARRE DU TEXTE REJOINT CELLE DU HAUT, ET SAIT JUSTIFIER.
//
// « Je me rends compte que c'est super pénible d'avoir la barre de style qui
// suit le texte et en fait ça manque de cohérence avec le reste. Je pense
// qu'il faut utiliser celle du haut (en rajoutant la justification). Il faut
// aussi pouvoir la verticaliser. J'ai toujours un résidu de vignette de
// tableau à droite vers le milieu. »
//
// Quatre demandes, et la même cause pour les trois premières : le texte avait
// SON meuble, à part de tout le reste. Il flottait au-dessus du bloc, bougeait
// à chaque ligne tapée, sautait du dessus au dessous quand le bloc approchait
// d'un bord — pendant que toutes les autres commandes de l'application vivent
// à un endroit fixe. Et il ne savait pas justifier, quand la barre du haut ne
// savait pas se mettre debout.
//
// CE QUE CETTE SUITE TIENT :
//
//   — en saisie, la barre du texte est DANS la barre de style, et celle-ci
//     reste visible : une seule barre pour un seul mot ;
//   — la taille ne s'y règle pas deux fois : la réglette se retire pendant la
//     saisie, et revient quand le bloc est posé ;
//   — le bouton rend la barre au texte, et le choix est retenu au rechargement ;
//   — les tiroirs s'ouvrent VERS LE BAS quand la barre est en haut, et restent
//     à l'écran ;
//   — la justification écarte les mots des lignes qui se replient, et laisse
//     la dernière ligne d'un paragraphe tranquille ;
//   — l'export SVG porte le même écart que l'écran ;
//   — la barre de style se met debout au bord droit, sans recouvrir celle du
//     document quand les deux y sont ;
//   — la languette du tiroir des tableaux ne traîne plus au bord droit.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Le texte de démonstration : assez long pour se replier en trois lignes dans
// une colonne de 400, ce qui donne deux lignes à justifier et une dernière à
// laisser en paix.
const PHRASE = "Les nombres décimaux permettent d'écrire des parts plus petites "
    + "que l'unité et de comparer des grandeurs.";

module.exports = async function (browser) {
    const r = creerRapport('La barre du texte en haut');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });

    const ouvrirUneSaisie = async () => {
        await page.evaluate(() => { setMode('text'); });
        await page.mouse.click(400, 380);
        await page.waitForTimeout(350);
    };

    // ------------------------------------------------------------------
    // 1. ELLE EST DANS LA BARRE DU HAUT
    // ------------------------------------------------------------------
    await ouvrirUneSaisie();
    const enSaisie = await page.evaluate(() => {
        const tb = document.getElementById('text-toolbar');
        const bs = document.getElementById('bar-style');
        const rTb = tb.getBoundingClientRect(), rBs = bs.getBoundingClientRect();
        return {
            parent: tb.parentNode.id,
            ancree: tb.classList.contains('tt-ancree'),
            affichee: getComputedStyle(tb).display,
            position: getComputedStyle(tb).position,
            barreVisible: bs.classList.contains('visible'),
            barreAffichee: getComputedStyle(bs).display,
            // Elle tient VRAIMENT dedans : un enfant qui déborderait de son
            // meuble ne serait rangé que sur le papier.
            dedans: rTb.left >= rBs.left - 1 && rTb.right <= rBs.right + 1
                && rTb.top >= rBs.top - 1 && rTb.bottom <= rBs.bottom + 1,
            // Et la réglette de taille s'efface : elle disait la même chose que
            // l'onglet « A 24 », à dix centimètres de lui.
            reglette: getComputedStyle(bs.querySelector('.group-text')).display
        };
    });
    r.egal('en saisie, la barre du texte est rangée dans la barre de style',
        { parent: enSaisie.parent, ancree: enSaisie.ancree, affichee: enSaisie.affichee },
        { parent: 'bar-style', ancree: true, affichee: 'flex' });
    r.verifie('elle y tient pour de bon, et n\'est plus un meuble flottant',
        enSaisie.dedans && enSaisie.position === 'static', JSON.stringify(enSaisie));
    r.egal('la barre de style ne se tait plus pendant qu\'on écrit',
        { visible: enSaisie.barreVisible, affichee: enSaisie.barreAffichee },
        { visible: true, affichee: 'flex' });
    r.egal('et la taille ne s\'y règle pas deux fois', enSaisie.reglette, 'none');

    // Le bloc posé, la réglette revient : c'est le même réglage, par l'autre
    // porte, et il ne doit pas disparaître avec la saisie.
    const bloc = await page.evaluate(async () => {
        wysiwygText.innerText = 'Décimaux';
        finalizeText();
        await new Promise(r => setTimeout(r, 250));
        const t = texts[texts.length - 1];
        selectedItems = [{ type: 'text', id: t.id }];
        updateStyleBarContext();
        const bs = document.getElementById('bar-style');
        return { reglette: getComputedStyle(bs.querySelector('.group-text')).display,
                 texte: getComputedStyle(document.getElementById('text-toolbar')).display,
                 id: t.id };
    });
    r.egal('le bloc posé, la réglette revient et la barre du texte s\'efface',
        { reglette: bloc.reglette, texte: bloc.texte }, { reglette: 'flex', texte: 'none' });

    // ------------------------------------------------------------------
    // 2. LES TIROIRS S'OUVRENT VERS LE BAS, ET RESTENT À L'ÉCRAN
    // La barre flottait au-dessus du bloc : ses tiroirs s'ouvraient donc vers
    // le haut, pour ne pas couvrir ce qu'on écrivait. Rangée tout en haut de
    // l'écran, cette règle les envoyait par-dessus le tiroir des plugins.
    // ------------------------------------------------------------------
    await page.evaluate(() => { selectedItems = []; updateStyleBarContext(); });
    await ouvrirUneSaisie();
    await page.click('#text-toolbar .tt-tab[data-panel="align"]');
    await page.waitForTimeout(250);
    const tiroir = await page.evaluate(() => {
        const p = document.querySelector('#text-toolbar .tt-panel[data-panel="align"]');
        const t = document.querySelector('#text-toolbar .tt-tab[data-panel="align"]');
        const bs = document.getElementById('bar-style');
        const rp = p.getBoundingClientRect(), rt = t.getBoundingClientRect();
        const rb = bs.getBoundingClientRect();
        return {
            ouvert: p.classList.contains('tt-open'),
            versLeHaut: p.classList.contains('tt-up'),
            sousLaBarre: rp.top >= rb.bottom - 1,
            dansLEcran: rp.top >= 0 && rp.bottom <= window.innerHeight && rp.left >= 0
                && rp.right <= window.innerWidth,
            // Il pend de SON bouton : les centres se répondent à quelques
            // pixels près, même quand le bord de l'écran le décale.
            ecartDesCentres: Math.round(Math.abs((rp.left + rp.width / 2) - (rt.left + rt.width / 2)))
        };
    });
    r.verifie('le tiroir d\'alignement s\'ouvre sous la barre, et non par-dessus',
        tiroir.ouvert && !tiroir.versLeHaut && tiroir.sousLaBarre, JSON.stringify(tiroir));
    r.verifie('il reste entièrement à l\'écran', tiroir.dansLEcran, JSON.stringify(tiroir));
    r.verifie('et il pend toujours de son propre bouton',
        tiroir.ecartDesCentres <= 30, JSON.stringify(tiroir));

    // Le quatrième alignement existe, et il agit.
    const justifBouton = await page.evaluate(() => {
        const b = document.querySelector('#text-toolbar .btn-align[data-align="justify"]');
        if (!b) return null;
        b.click();
        return { align: activeStyle.textAlign, saisie: wysiwygText.style.textAlign,
                 titre: b.getAttribute('title') };
    });
    r.egal('le bouton « Justifier » est là, et il justifie',
        justifBouton && { align: justifBouton.align, titre: justifBouton.titre },
        { align: 'justify', titre: 'Justifier' });

    // ------------------------------------------------------------------
    // 3. LA JUSTIFICATION ÉCARTE LES MOTS
    // ------------------------------------------------------------------
    const justif = await page.evaluate((phrase) => {
        const t = {
            id: 4242, x: 100, y: 100, fontSize: 24, colWidth: 400, align: 'left', z: 1,
            content: '<div style="text-align: justify">' + phrase + '</div>'
        };
        const L = layoutTextObject(t, ctx);
        return L.lines.map(l => ({
            align: l.align,
            derniere: !!l.derniereDuPara,
            contentW: Math.round(l.contentW),
            // Où finit la ligne une fois les mots écartés ?
            bout: Math.round(l.contentW
                + resteAJustifier(l, l.align || 'left', 400)
                * l.segs.filter(s => /^\s+$/.test(s.text)).length)
        }));
    }, PHRASE);
    r.verifie('le texte se replie en plusieurs lignes',
        justif.length >= 3, JSON.stringify(justif));
    r.egal('l\'alignement « justify » survit à la mise en page',
        justif.every(l => l.align === 'justify'), true);
    r.verifie('les lignes repliées vont bien jusqu\'au bord droit de la colonne',
        justif.slice(0, -1).every(l => l.bout === 400), JSON.stringify(justif));
    r.verifie('mais elles étaient plus courtes avant qu\'on les écarte',
        justif.slice(0, -1).every(l => l.contentW < 400), JSON.stringify(justif));
    r.verifie('et la dernière ligne du paragraphe reste ferrée à gauche',
        justif[justif.length - 1].derniere
        && justif[justif.length - 1].bout === justif[justif.length - 1].contentW,
        JSON.stringify(justif[justif.length - 1]));

    // Une ligne seule n'est pas étirée : c'est aussi la dernière de son
    // paragraphe, et un titre justifié se retrouverait autrement en accordéon.
    const seule = await page.evaluate(() => {
        const t = { id: 4243, x: 0, y: 0, fontSize: 24, colWidth: 400, align: 'justify', z: 1,
                    content: '<div style="text-align: justify">Trois mots ici</div>' };
        const L = layoutTextObject(t, ctx);
        return { lignes: L.lines.length,
                 ecart: resteAJustifier(L.lines[0], 'justify', 400) };
    });
    r.egal('une ligne seule n\'est pas étirée sur toute la colonne',
        seule, { lignes: 1, ecart: 0 });

    // ET C'EST VRAI SUR LE TABLEAU, PAS SEULEMENT DANS LES MESURES. On lit
    // l'encre : jusqu'où va le noir de la PREMIÈRE ligne, celle qui se replie ?
    // Justifiée, elle touche le bord droit de la colonne ; ferrée à gauche,
    // elle s'arrête où le dernier mot tombait.
    const encre = await page.evaluate((phrase) => {
        const bout = (align) => {
            texts.length = 0; images.length = 0; freehands.length = 0; selectedItems = [];
            zoom = 1; panX = 0; panY = 0;
            texts.push({ id: nextId++, x: 100, y: 100, fontSize: 24, colWidth: 400,
                         align: 'left', z: globalZ++, color: '#000000',
                         content: '<div style="text-align: ' + align + '">' + phrase + '</div>' });
            draw();
            // La bande de la première ligne, un peu rognée pour ne pas mordre
            // sur la seconde.
            const d = ctx.getImageData(100, 102, 420, 22).data;
            let maxX = -1;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] > 40 && d[i] < 128) {
                    const x = (i / 4) % 420;
                    if (x > maxX) maxX = x;
                }
            }
            return maxX;
        };
        const justifie = bout('justify');
        const gauche = bout('left');
        texts.length = 0; draw();
        return { justifie, gauche };
    }, PHRASE);
    r.verifie('sur le tableau, la ligne justifiée touche le bord droit de la colonne',
        encre.justifie >= 392 && encre.justifie <= 400, JSON.stringify(encre));
    r.verifie('alors que la même ligne ferrée à gauche s\'arrête bien avant',
        encre.gauche > 0 && encre.justifie - encre.gauche >= 15, JSON.stringify(encre));

    // L'EXPORT PORTE LE MÊME ÉCART. Une page exportée doit ressembler à celle
    // qu'on avait sous les yeux ; la justification vivait au seul moment de la
    // peinture, et le SVG rendait des lignes ferrées à gauche.
    const svg = await page.evaluate((phrase) => {
        texts.length = 0; images.length = 0; freehands.length = 0; selectedItems = [];
        texts.push({ id: nextId++, x: 100, y: 100, fontSize: 24, colWidth: 400,
                     align: 'left', z: globalZ++, color: '#000000',
                     content: '<div style="text-align: justify">' + phrase + '</div>' });
        draw();
        const s = generateSVGString({ x: 0, y: 0, w: 900, h: 600 }, false);
        const dx = (s.match(/dx="[\d.]+"/g) || []);
        texts.length = 0; draw();
        return { combien: dx.length, extrait: dx.slice(0, 3) };
    }, PHRASE);
    r.verifie('l\'export SVG écarte les mots lui aussi',
        svg.combien >= 6, JSON.stringify(svg));

    // ------------------------------------------------------------------
    // 4. LE BOUTON REND LA BARRE AU TEXTE, ET LE CHOIX SE RETIENT
    // ------------------------------------------------------------------
    const rendue = await page.evaluate(() => {
        const avant = document.getElementById('tt-ancrer').classList.contains('actif');
        basculerLAncrageDuTexte();
        const tb = document.getElementById('text-toolbar');
        const bs = document.getElementById('bar-style');
        return {
            avant,
            parent: tb.parentNode === document.body ? 'body' : tb.parentNode.id,
            ancree: tb.classList.contains('tt-ancree'),
            position: getComputedStyle(tb).position,
            // L'ancienne règle revient avec elle : deux barres pour le même
            // mot ne valent rien, celle du haut se tait.
            barreVisible: bs.classList.contains('visible'),
            temoin: document.getElementById('tt-ancrer').classList.contains('actif'),
            garde: localStorage.getItem('auTableau_barre_texte_en_haut')
        };
    });
    r.egal('le témoin du bouton disait qu\'elle était rangée en haut', rendue.avant, true);
    r.egal('un appui la rend au texte, et la barre du haut se tait de nouveau',
        { parent: rendue.parent, ancree: rendue.ancree, position: rendue.position,
          barreVisible: rendue.barreVisible, temoin: rendue.temoin },
        { parent: 'body', ancree: false, position: 'absolute',
          barreVisible: false, temoin: false });
    r.egal('et le choix est écrit pour la prochaine séance', rendue.garde, 'false');

    // Rendue au texte, elle le suit VRAIMENT : elle se replace au-dessus (ou
    // en dessous) du bloc, comme avant.
    const suit = await page.evaluate(() => {
        const tb = document.getElementById('text-toolbar');
        updateTextToolbarPosition();
        const r1 = tb.getBoundingClientRect();
        const s = wysiwygText.getBoundingClientRect();
        return { auDessus: r1.bottom <= s.top + 2, auDessous: r1.top >= s.bottom - 2,
                 place: !!tb.style.top };
    });
    r.verifie('rendue au texte, elle se replace contre le bloc',
        suit.place && (suit.auDessus || suit.auDessous), JSON.stringify(suit));

    // Le choix traverse le rechargement : c'est ce qu'on attend d'un réglage.
    await page.reload();
    await page.waitForTimeout(1200);
    const apresRechargement = await page.evaluate(() => {
        const tb = document.getElementById('text-toolbar');
        return { parent: tb.parentNode === document.body ? 'body' : tb.parentNode.id,
                 ancree: tb.classList.contains('tt-ancree') };
    });
    r.egal('et il traverse le rechargement',
        apresRechargement, { parent: 'body', ancree: false });

    // On la remet en haut pour la suite, et l'on vérifie que le retour est
    // aussi propre que l'aller.
    const retour = await page.evaluate(() => {
        basculerLAncrageDuTexte(true);
        const tb = document.getElementById('text-toolbar');
        return { parent: tb.parentNode.id, ancree: tb.classList.contains('tt-ancree'),
                 garde: localStorage.getItem('auTableau_barre_texte_en_haut') };
    });
    r.egal('et elle revient en haut aussi proprement',
        retour, { parent: 'bar-style', ancree: true, garde: 'true' });

    // ------------------------------------------------------------------
    // 5. LA BARRE DE STYLE SE MET DEBOUT
    // ------------------------------------------------------------------
    const debout = await page.evaluate(() => {
        selectedItems = [];
        setMode('freehand');
        updateStyleBarContext();
        const bs = document.getElementById('bar-style');
        const aPlat = bs.getBoundingClientRect();
        basculerLOrientationDeLaBarreStyle(true);
        const r1 = bs.getBoundingClientRect();
        return {
            aPlat: { w: Math.round(aPlat.width), h: Math.round(aPlat.height) },
            vertical: bs.classList.contains('vertical'),
            colonne: getComputedStyle(bs).flexDirection,
            r: { x: Math.round(r1.left), y: Math.round(r1.top),
                 w: Math.round(r1.width), h: Math.round(r1.height) },
            auBordDroit: Math.round(window.innerWidth - r1.right),
            centree: Math.abs((r1.top + r1.height / 2) - window.innerHeight / 2) <= 2,
            dansLEcran: r1.top >= 0 && r1.bottom <= window.innerHeight,
            temoin: document.getElementById('bar-style-debout').classList.contains('actif'),
            garde: localStorage.getItem('auTableau_barre_style_debout')
        };
    });
    r.egal('la barre de style se met debout, en colonne',
        { vertical: debout.vertical, colonne: debout.colonne, temoin: debout.temoin },
        { vertical: true, colonne: 'column', temoin: true });
    r.verifie('elle est vraiment plus haute que large, à l\'inverse d\'avant',
        debout.r.h > debout.r.w && debout.aPlat.w > debout.aPlat.h,
        JSON.stringify({ debout: debout.r, aPlat: debout.aPlat }));
    r.egal('au bord droit, à vingt pixels — le gauche est aux outils',
        debout.auBordDroit, 20);
    r.verifie('centrée en hauteur et tout entière à l\'écran',
        debout.centree && debout.dansLEcran, JSON.stringify(debout));
    r.egal('et le choix est retenu', debout.garde, 'true');

    // DEUX COLONNES NE SE RECOUVRENT PAS. La barre du document se met debout
    // au même bord : celle du style doit alors se ranger à sa gauche.
    const deuxDebout = await page.evaluate(async () => {
        images.length = 0;
        images.push({ id: nextId++, x: 40, y: 40, w: 400, h: 500, z: globalZ++, nomFichier: 'doc.pdf' });
        selectedItems = [{ type: 'image', id: images[0].id }];
        basculerLOrientationDeLaBarre(true);
        updateStyleBarContext();
        await new Promise(r => setTimeout(r, 300));
        const bs = document.getElementById('bar-style').getBoundingClientRect();
        const bd = document.getElementById('bar-document').getBoundingClientRect();
        return {
            styleDroite: Math.round(bs.right), docGauche: Math.round(bd.left),
            seChevauchent: bs.right > bd.left + 1,
            styleDebout: document.getElementById('bar-style').classList.contains('vertical'),
            docDebout: document.getElementById('bar-document').classList.contains('vertical')
        };
    });
    r.egal('les deux barres peuvent être debout en même temps',
        { style: deuxDebout.styleDebout, doc: deuxDebout.docDebout },
        { style: true, doc: true });
    r.verifie('et celle du style se range à gauche de celle du document',
        !deuxDebout.seChevauchent && deuxDebout.styleDroite < deuxDebout.docGauche,
        JSON.stringify(deuxDebout));

    // On recouche les deux, et l'on vérifie que la barre de style retrouve sa
    // place du haut : une orientation qui ne sait pas revenir est un piège.
    const recouchee = await page.evaluate(() => {
        basculerLOrientationDeLaBarre(false);
        basculerLOrientationDeLaBarreStyle(false);
        const bs = document.getElementById('bar-style');
        const r1 = bs.getBoundingClientRect();
        return { vertical: bs.classList.contains('vertical'),
                 centree: Math.abs((r1.left + r1.width / 2) - window.innerWidth / 2) <= 2,
                 enHaut: r1.top < window.innerHeight / 2,
                 temoin: document.getElementById('bar-style-debout').classList.contains('actif') };
    });
    r.egal('elle se recouche, et retrouve le haut de l\'écran',
        recouchee, { vertical: false, centree: true, enHaut: true, temoin: false });

    // ------------------------------------------------------------------
    // 6. LE TIROIR DES TABLEAUX NE LAISSE PLUS DE RÉSIDU
    // « J'ai toujours un résidu de vignette de tableau à droite vers le
    // milieu. » C'était sa languette : dix-sept pixels de gris au bord droit,
    // à mi-hauteur, qui ne disaient pas ce qu'ils étaient.
    // ------------------------------------------------------------------
    const languette = await page.evaluate(async () => {
        const t = document.querySelector('.drawer-toggle-v');
        const d = document.getElementById('right-drawer');
        if (d.classList.contains('open')) toggleRightDrawer();
        await new Promise(r => setTimeout(r, 450));
        const ferme = { display: getComputedStyle(t).display,
                        r: t.getBoundingClientRect().width };
        toggleRightDrawer();
        await new Promise(r => setTimeout(r, 450));
        const ouvert = { display: getComputedStyle(t).display,
                         r: Math.round(t.getBoundingClientRect().width) };
        toggleRightDrawer();
        await new Promise(r => setTimeout(r, 450));
        return { ferme, ouvert,
                 // Et l'on peut toujours l'ouvrir : « Mes tableaux » porte son nom.
                 autrePorte: !!document.getElementById('btn-tableaux') };
    });
    r.egal('tiroir fermé, la languette ne traîne plus au bord droit',
        { display: languette.ferme.display, largeur: languette.ferme.r },
        { display: 'none', largeur: 0 });
    r.verifie('tiroir ouvert, elle est là : c\'est la poignée qui le referme',
        languette.ouvert.display === 'flex' && languette.ouvert.r > 0,
        JSON.stringify(languette.ouvert));
    r.verifie('et le tiroir garde une porte qui porte son nom',
        languette.autrePorte, String(languette.autrePorte));

    // Plus rien ne dépasse au bord droit, à mi-hauteur : on le MESURE, au lieu
    // de le croire sur parole.
    const bordDroit = await page.evaluate(() => {
        const L = window.innerWidth, H = window.innerHeight;
        const restes = [];
        document.querySelectorAll('body > *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return;
            if (r.right < L - 40) return;                       // pas au bord droit
            if (r.bottom < H * 0.35 || r.top > H * 0.65) return; // pas à mi-hauteur
            if (r.width > L * 0.5) return;                      // ce n'est pas un résidu
            // Un tiroir rangé hors de l'écran ne traîne nulle part : on compte
            // ce qui se voit VRAIMENT, et non ce que le rectangle annonce.
            const vu = Math.min(r.right, L) - Math.max(r.left, 0);
            if (vu <= 2) return;
            restes.push(el.id || el.className || el.tagName);
        });
        return restes;
    });
    r.egal('rien ne traîne plus au bord droit, à mi-hauteur', bordDroit, []);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
