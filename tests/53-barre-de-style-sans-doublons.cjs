// LA BARRE DE STYLE NE DIT PAS DEUX FOIS LA MÊME CHOSE.
//
// « Je pense qu'il y a des doublons dans les barres de style, ça déconne un
// peu, ça ragrandit, ça diminue, ça bouge, bref ça ne va pas, regarde ce que
// cela donne avec les outils. »
//
// Un balayage de la barre pour chaque outil et chaque sélection a trouvé deux
// choses, de natures différentes :
//
//   — PENDANT LA SAISIE, deux pastilles rondes de couleur à quinze centimètres
//     l'une de l'autre : « Couleur et Opacité » (enfant direct de #bar-style,
//     hors de toute « .style-group ») et « Couleur » (la barre du texte, rangée
//     dans celle du haut). Elles ne font même pas la même chose — l'une colore
//     ce qu'on va taper, l'autre repeint le bloc entier — et rien ne disait
//     laquelle faisait foi. Le même défaut avait déjà été réglé pour la TAILLE ;
//     la couleur avait été oubliée parce que son bouton n'est dans aucun groupe.
//
//   — LA POIGNÉE « DÉPLACER » ÉTAIT BARRÉE d'un trait gris. La barre de style
//     et celle du document portent chacune un « .drag-handle.cbar-head », et
//     les règles écrites pour le chrome repliable des barres COMPOSÉES
//     n'étaient pas préfixées : leur barrette se peignait en travers de
//     l'icône. Un seul bouton, barré, que l'œil prend pour deux.
//
// CE QUE CETTE SUITE TIENT : aucune commande de la barre ne parle deux fois du
// même sujet, dans aucun état ; et le chrome des barres composées reste chez
// elles.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Ce qu'un professeur VOIT dans la barre : les commandes vraiment affichées,
// avec le nom que porte leur infobulle. Deux noms qui parlent du même sujet,
// ce sont deux boutons qu'on croit identiques.
const RELEVE = () => {
    const vraimentVu = (el) => {
        if (!el.getClientRects().length) return false;
        let n = el;
        while (n && n.nodeType === 1) {
            const s = getComputedStyle(n);
            if (s.display === 'none' || s.visibility === 'hidden') return false;
            if (parseFloat(s.opacity) < 0.05) return false;
            n = n.parentElement;
        }
        return true;
    };
    const bs = document.getElementById('bar-style');
    if (!bs || !bs.classList.contains('visible')) return { visible: false, noms: [], largeur: 0 };
    const noms = [];
    bs.querySelectorAll('button, input, select, .drag-handle').forEach(el => {
        if (!vraimentVu(el)) return;
        const t = (el.title || el.getAttribute('data-title') || el.dataset.tooltip || el.id || '').trim();
        if (t) noms.push({ nom: t, forme: el.tagName.toLowerCase() + (el.type ? ':' + el.type : '') });
    });
    return { visible: true, noms, largeur: Math.round(bs.getBoundingClientRect().width) };
};

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

module.exports = async function (browser) {
    const r = creerRapport('La barre de style sans doublons');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1440, height: 900 } });
    await page.waitForFunction(() => typeof updateStyleBarContext === 'function'
        && typeof basculerLAncrageDuTexte === 'function', { timeout: 20000 });

    // ------------------------------------------------------------------
    // 1. LE BALAYAGE : AUCUN SUJET DIT DEUX FOIS, DANS AUCUN ÉTAT
    // C'est la vérification qui compte, parce qu'elle ne vise pas un bouton
    // connu : elle relit la barre entière dans vingt-trois états.
    // ------------------------------------------------------------------
    const OUTILS = ['pointer', 'freehand', 'highlighter', 'text', 'postit', 'point',
                    'segment', 'droite', 'curve', 'circle', 'polygon', 'rectangle'];
    const etats = [];

    for (const outil of OUTILS) {
        await page.evaluate((o) => { selectedItems = []; setMode(o); updateStyleBarContext(); }, outil);
        await page.waitForTimeout(120);
        etats.push({ nom: 'outil ' + outil, ...(await page.evaluate(RELEVE)) });
    }

    await page.evaluate((px) => {
        texts.length = 0; rectangles.length = 0; circles.length = 0; segments.length = 0;
        points.length = 0; freehands.length = 0; images.length = 0;
        texts.push({ id: 'T1', x: 100, y: 100, content: 'Leçon', fontSize: 24, color: '#e74c3c', z: 1 });
        rectangles.push({ id: 'R1', x: 300, y: 100, w: 120, h: 80, color: '#2d3436', lineWidth: 3, z: 2 });
        circles.push({ id: 'C1', cx: 500, cy: 140, r: 50, color: '#2d3436', lineWidth: 3, z: 3 });
        segments.push({ id: 'S1', x1: 600, y1: 100, x2: 700, y2: 180, color: '#2d3436', lineWidth: 3, z: 4 });
        points.push({ id: 'P1', x: 760, y: 140, color: '#2d3436', z: 5 });
        freehands.push({ id: 'F1', points: [{ x: 800, y: 100, p: .5 }, { x: 860, y: 160, p: .5 }], color: '#2d3436', width: 3, z: 6 });
        images.push({ id: 'I1', src: px, x: 900, y: 100, w: 120, h: 90, z: 7 });
        draw();
    }, PIXEL);

    for (const [nom, type, id] of [['texte', 'text', 'T1'], ['rectangle', 'rectangle', 'R1'],
                                   ['cercle', 'circle', 'C1'], ['segment', 'segment', 'S1'],
                                   ['point', 'point', 'P1'], ['tracé', 'freehand', 'F1']]) {
        await page.evaluate(({ type, id }) => {
            setMode('pointer'); selectedItems = [{ type, id }]; updateStyleBarContext();
        }, { type, id });
        await page.waitForTimeout(120);
        etats.push({ nom: 'sélection ' + nom, ...(await page.evaluate(RELEVE)) });
    }

    // La saisie, barre du texte rangée en haut : l'état de la capture d'écran.
    await page.evaluate(() => {
        selectedItems = []; basculerLAncrageDuTexte(true); setMode('text'); updateStyleBarContext();
    });
    await page.waitForTimeout(200);
    await page.mouse.click(500, 500);
    await page.waitForTimeout(400);
    await page.keyboard.type('Tableau de numération');
    await page.waitForTimeout(300);
    const saisie = await page.evaluate(RELEVE);
    etats.push({ nom: 'saisie (barre rangée en haut)', ...saisie });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Debout, au bord droit : les mêmes commandes, la même exigence.
    await page.evaluate(() => {
        basculerLOrientationDeLaBarreStyle(true);
        selectedItems = []; setMode('freehand'); updateStyleBarContext();
    });
    await page.waitForTimeout(300);
    etats.push({ nom: 'barre debout', ...(await page.evaluate(RELEVE)) });
    await page.evaluate(() => basculerLOrientationDeLaBarreStyle(false));
    await page.waitForTimeout(300);

    // LES SUJETS QU'UNE BARRE NE DOIT ABORDER QU'UNE FOIS.
    const SUJETS = { couleur: /couleur/i, taille: /taille du texte|^font-size$/i,
                     epaisseur: /épaisseur|^line-width$/i };
    // UNE RÉGLETTE ET SON NOMBRE NE SONT PAS DEUX COMMANDES. « Le nombre et le
    // curseur disent la même chose » (script.js:6478) : le champ existe pour
    // qu'on puisse TAPER 2,5, que la réglette ne sait pas viser. Les compter
    // comme un doublon condamnerait une paire voulue — et masquerait les vrais.
    const unePaireReglette = (pris) => pris.length === 2
        && pris.some(p => p.forme === 'input:range') && pris.some(p => p.forme === 'input:number');
    const fautes = [];
    etats.forEach(e => {
        if (!e.visible) return;
        Object.entries(SUJETS).forEach(([sujet, re]) => {
            const pris = e.noms.filter(n => re.test(n.nom));
            if (pris.length > 1 && !unePaireReglette(pris)) {
                fautes.push(e.nom + ' — ' + sujet + ' : ' + pris.map(p => p.nom).join(' + '));
            }
        });
        // Et jamais deux commandes strictement de même nom.
        const compte = {};
        e.noms.forEach(n => compte[n.nom] = (compte[n.nom] || 0) + 1);
        Object.entries(compte).filter(([, n]) => n > 1)
            .forEach(([n, c]) => fautes.push(e.nom + ' — « ' + n +' » ×' + c));
    });
    r.verifie('on a bien relu la barre dans une vingtaine d\'états',
        etats.filter(e => e.visible).length >= 18, etats.filter(e => e.visible).length + ' états où elle paraît');
    r.egal('aucune commande ne parle deux fois du même sujet, dans aucun état', fautes, []);

    // ------------------------------------------------------------------
    // 2. LE DOUBLON NOMMÉ : LES DEUX PASTILLES DE LA SAISIE
    // La relecture ci-dessus le couvre, mais elle passerait aussi si la barre
    // devenait vide. On nomme donc ce qui doit rester, et ce qui doit partir.
    // ------------------------------------------------------------------
    const couleursEnSaisie = saisie.noms.filter(n => /couleur/i.test(n.nom)).map(n => n.nom);
    r.egal('pendant la saisie, la pastille qui reste est celle du TEXTE',
        couleursEnSaisie, ['Couleur']);
    r.verifie('« Couleur et Opacité » s\'est retirée',
        !saisie.noms.some(n => /Couleur et Opacité/.test(n.nom)),
        JSON.stringify(saisie.noms.map(n => n.nom)));

    // SON SÉPARATEUR PART AVEC ELLE. Un trait vertical qui ne sépare plus rien
    // est exactement le genre de résidu qui fait croire à un bouton manquant.
    const separateur = await page.evaluate(() => {
        const b = document.getElementById('btn-color-popover');
        const d = b && b.nextElementSibling;
        if (!d || !d.classList.contains('divider')) return { trouve: false };
        const enSaisie = () => {
            setMode('text'); wysiwygText.style.display = 'block'; updateStyleBarContext();
            return getComputedStyle(d).display;
        };
        const vu = enSaisie();
        wysiwygText.style.display = 'none';
        selectedItems = []; setMode('freehand'); updateStyleBarContext();
        return { trouve: true, enSaisie: vu, horsSaisie: getComputedStyle(d).display };
    });
    r.egal('le séparateur de la pastille se retire avec elle, et revient avec elle',
        separateur, { trouve: true, enSaisie: 'none', horsSaisie: 'block' });

    // Hors saisie, elle revient : on ne l'a pas supprimée, on l'a rangée.
    const horsSaisie = await page.evaluate(async () => {
        selectedItems = []; setMode('freehand'); updateStyleBarContext();
        await new Promise(ok => setTimeout(ok, 150));
        const b = document.getElementById('btn-color-popover');
        return { vue: getComputedStyle(b).display !== 'none',
                 ctxSaisie: document.getElementById('bar-style').classList.contains('ctx-saisie') };
    });
    r.egal('hors saisie, « Couleur et Opacité » est de retour',
        horsSaisie, { vue: true, ctxSaisie: false });

    // Et une fenêtre de couleur ouverte ne reste pas pendue à un bouton parti.
    const fenetre = await page.evaluate(async () => {
        document.getElementById('btn-color-popover').click();
        await new Promise(ok => setTimeout(ok, 150));
        const ouverte = document.getElementById('color-popover').classList.contains('visible');
        setMode('text');
        wysiwygText.style.display = 'block';
        updateStyleBarContext();
        await new Promise(ok => setTimeout(ok, 150));
        const apres = document.getElementById('color-popover').classList.contains('visible');
        wysiwygText.style.display = 'none';
        updateStyleBarContext();
        return { ouverte, apres };
    });
    r.egal('la fenêtre de couleur se ferme quand sa pastille se range',
        fenetre, { ouverte: true, apres: false });

    // ------------------------------------------------------------------
    // 3. LA POIGNÉE « DÉPLACER » N'EST PLUS BARRÉE
    // Le chrome repliable a été écrit pour les barres COMPOSÉES. Ses règles
    // n'étaient pas préfixées, et « .cbar-head » est aussi la classe de la
    // poignée de la barre de style et de celle du document.
    // ------------------------------------------------------------------
    await page.evaluate(() => { selectedItems = []; setMode('freehand'); updateStyleBarContext(); });
    await page.waitForTimeout(200);
    const poignees = await page.evaluate(() => {
        const lire = (sel) => {
            const p = document.querySelector(sel);
            if (!p) return null;
            const ap = getComputedStyle(p, '::after');
            const r = p.getBoundingClientRect();
            return { barrette: ap.content !== 'none' && ap.backgroundColor !== 'rgba(0, 0, 0, 0)',
                     hauteur: Math.round(r.height), position: getComputedStyle(p).position };
        };
        return { style: lire('#bar-style .drag-handle.cbar-head'),
                 composee: lire('#system-toolbar-main .cbar-head') };
    });
    r.verifie('la poignée de la barre de style n\'a plus de trait en travers',
        poignees.style && !poignees.style.barrette, JSON.stringify(poignees.style));
    // ET ELLE N'EST PLUS UN REPÈRE POUR LA BARRETTE. « position: relative »
    // est ce qui permettait au trait gris de se poser sur l'icône : sans lui,
    // même une règle oubliée n'aurait plus de quoi s'accrocher.
    r.egal('elle n\'offre plus d\'accroche à une barrette égarée',
        poignees.style && poignees.style.position, 'static');
    r.verifie('tandis que les barres composées gardent leur barrette et leurs 22 px',
        poignees.composee && poignees.composee.barrette && poignees.composee.hauteur === 22,
        JSON.stringify(poignees.composee));

    // ------------------------------------------------------------------
    // 4. LE BLOC EN COURS DE SAISIE NE CHANGE PAS DE COULEUR TOUT SEUL
    //
    // C'est l'autre moitié de « ça déconne ». « pushStyleToObject » repeignait
    // le bloc ENTIER pendant qu'on écrivait, et la validation rendait quand
    // même l'ancienne couleur — l'objet se pose avec « couleurBlocSaisie »,
    // figé à l'ouverture. Le professeur voyait son titre virer puis revenir.
    // La règle est pourtant écrite deux fois ailleurs dans le code.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        texts.length = 0;
        activeStyle.strokeColor = '#e74c3c';
        basculerLAncrageDuTexte(true);
        setMode('text');
    });
    await page.waitForTimeout(200);
    await page.mouse.click(500, 420);          // on ouvre la saisie pour de vrai
    await page.waitForTimeout(350);
    await page.keyboard.type('Titre de la leçon');
    await page.waitForTimeout(200);
    const repeint = await page.evaluate(async () => {
        const avant = getComputedStyle(wysiwygText).color;
        // N'IMPORTE QUEL RÉGLAGE de la barre passe par là : l'épaisseur,
        // l'opacité, une couleur venue d'ailleurs.
        activeStyle.strokeColor = '#1abc9c';
        pushStyleToObject();
        const apres = getComputedStyle(wysiwygText).color;
        finalizeText();
        await new Promise(ok => setTimeout(ok, 250));
        const pose = texts[texts.length - 1];
        return { avant, apres, couleurPosee: pose && pose.color };
    });
    r.egal('ce qui est déjà écrit ne change pas de couleur sous les yeux',
        repeint.apres, repeint.avant);
    r.egal('et le bloc posé garde bien la couleur de son ouverture',
        repeint.couleurPosee, '#e74c3c');

    // MAIS LA TAILLE, ELLE, VAUT POUR TOUT LE BLOC — et doit continuer de
    // suivre. C'est la ligne voisine de celle qu'on vient de retirer : on
    // borne la correction en le disant, sinon le prochain qui nettoiera ce
    // bloc emportera les deux.
    await page.evaluate(() => { texts.length = 0; setMode('text'); });
    await page.waitForTimeout(200);
    await page.mouse.click(500, 420);
    await page.waitForTimeout(350);
    await page.keyboard.type('Grand titre');
    await page.waitForTimeout(200);
    const taille = await page.evaluate(() => {
        const avant = getComputedStyle(wysiwygText).fontSize;
        activeStyle.fontSize = (activeStyle.fontSize || 20) * 2;
        pushStyleToObject();
        const apres = getComputedStyle(wysiwygText).fontSize;
        finalizeText();
        return { avant, apres, aGrandi: parseFloat(apres) > parseFloat(avant) + 1 };
    });
    r.verifie('la taille, elle, suit bien tout le bloc pendant la saisie',
        taille.aGrandi, JSON.stringify(taille));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
