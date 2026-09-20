// ==============================================================================
// LE STYLET : TOUT CE QU'IL DIT, ET RIEN QUE LUI
// ==============================================================================
// « J'utilise une tablette graphique Wacom. J'ai l'impression qu'il y a des
// traces lorsque j'écris, ou bien ce n'est pas très fluide. »
//
// Trois choses, chacune vraie d'une tablette et fausse d'une souris.
//
// 1. LA TABLETTE PARLE PLUS VITE QUE L'ÉCRAN. Une Wacom mesure la pointe cent
//    trente à deux cents fois par seconde ; le navigateur, lui, ne remet au
//    tableau qu'UN mouvement par image — soixante par seconde — et garde les
//    autres dans l'événement, à qui les demande (« getCoalescedEvents »). Sans
//    eux, une boucle rapide n'est plus qu'un polygone à cinq côtés : le trait
//    n'est « pas fluide ». On les demande, et on les pose tous.
//
// 2. LA TABLETTE SURVOLE SOUS UN AUTRE NOM. Pendant qu'on écrit, elle envoie
//    aussi des mouvements de survol — sans bouton, sous un autre identifiant.
//    Le tableau y voit un pointeur perdu et POSE le trait en cours : la lettre
//    est coupée en deux, et la suite ne s'écrit plus jusqu'au contact suivant.
//    Ce sont les « traces ». Or tant que le tableau tient le pointeur qui
//    écrit (la capture), le stylo est posé ; le survol d'un autre nom n'est
//    que la tablette qui parle deux fois. On ne le montre pas au tableau.
//
// 3. LA PRESSION COMMENCE À RIEN. Au premier contact, la Wacom annonce deux à
//    dix pour cent : un trait de trois pixels débute par un cheveu d'un
//    tiers de pixel, gris et tremblant — une trace, encore. Et la pression
//    frémit d'un échantillon à l'autre. On lui donne un plancher, et l'on
//    adoucit ses sauts : le trait s'affine toujours aux extrémités, mais il
//    reste un trait.
//
// Ce fichier ne touche pas à script.js : il écoute le tableau AVANT lui (phase
// de capture) pour poser les échantillons groupés et filtrer le faux survol, et
// APRÈS lui pour ajuster la pression du point qu'il vient de poser.
// ==============================================================================
(function () {
    'use strict';
    const canvas = document.getElementById('board');
    if (!canvas) return;

    const PRESSION_MIN = 0.2;      // en dessous, un trait n'est plus qu'un cheveu
    const LISSAGE = 0.5;           // la part de la pression d'avant qu'on garde
    const compte = { groupes: 0, survolsFiltres: 0, pressionsRelevees: 0 };

    let stylo = null;              // l'identifiant du pointeur qui écrit
    let nombreAvant = 0;           // les points du trait avant que le tableau ne voie l'événement
    let derniereP = null;          // la pression du dernier point posé

    const enTrainDEcrire = () => {
        try { return !!(isDrawingFreehand && currentFreehand && Array.isArray(currentFreehand.points)); }
        catch (e) { return false; }
    };
    const captureTenue = (id) => {
        try { return typeof canvas.hasPointerCapture === 'function' && canvas.hasPointerCapture(id); }
        catch (e) { return false; }
    };
    const seuil = () => { try { return 2 / zoom; } catch (e) { return 2; } };

    // La pression d'un stylet, avec son plancher et son lissage. Une souris ou
    // un doigt n'en ont pas : le tableau leur donne 0,5, on n'y touche pas.
    function pressionDe(e, precedente) {
        if (e.pointerType !== 'pen') return null;
        let p = e.pressure > 0 ? e.pressure : PRESSION_MIN;
        p = Math.max(PRESSION_MIN, Math.min(1, p));
        if (precedente !== null && precedente !== undefined) p = precedente * LISSAGE + p * (1 - LISSAGE);
        return p;
    }

    // Le pointeur qui écrit : celui qui appuie quand l'outil est le crayon ou
    // le surligneur. On le note avant le tableau, qui décidera s'il écrit.
    canvas.addEventListener('pointerdown', (e) => {
        try {
            if ((mode === 'freehand' || mode === 'highlighter') && stylo === null) {
                stylo = e.pointerId; derniereP = null;
            }
        } catch (err) { /* pas de mode : rien à noter */ }
    }, true);

    // Le premier point du trait, posé par le tableau à l'appui : sa pression
    // passe par le même plancher que les suivants.
    canvas.addEventListener('pointerdown', (e) => {
        if (!enTrainDEcrire() || e.pointerId !== stylo) return;
        const pts = currentFreehand.points;
        if (pts.length !== 1) return;
        const p = pressionDe(e, null);
        if (p !== null) { pts[0].p = p; derniereP = p; compte.pressionsRelevees++; }
    }, false);

    // AVANT LE TABLEAU : le faux survol, puis les échantillons groupés.
    canvas.addEventListener('pointermove', (e) => {
        if (!enTrainDEcrire()) { nombreAvant = 0; return; }
        if (stylo !== null && e.pointerId !== stylo) {
            // Un autre nom, sans bouton, pendant que le stylo écrit et que le
            // tableau le tient encore : la tablette parle deux fois. Le
            // tableau y verrait la fin du trait ; il ne le verra pas.
            if (e.buttons === 0 && captureTenue(stylo)) {
                compte.survolsFiltres++;
                e.stopImmediatePropagation();
            }
            return;
        }
        const pts = currentFreehand.points;
        const groupes = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [];
        // Le dernier des groupés EST l'événement lui-même : c'est le tableau
        // qui le pose, avec sa règle habituelle. On pose ceux d'avant.
        const s = seuil();
        for (let i = 0; i < groupes.length - 1; i++) {
            const g = groupes[i];
            let x, y;
            try { x = (g.clientX - panX) / zoom; y = (g.clientY - panY) / zoom; } catch (err) { break; }
            const dernier = pts[pts.length - 1];
            if (dernier && Math.hypot(x - dernier.x, y - dernier.y) <= s) continue;
            const p = pressionDe(g, derniereP);
            pts.push({ x, y, p: (p === null) ? 0.5 : p });
            if (p !== null) derniereP = p;
            compte.groupes++;
        }
        nombreAvant = pts.length;
    }, true);

    // APRÈS LE TABLEAU : le point qu'il vient de poser reçoit sa pression
    // adoucie, comme les autres.
    canvas.addEventListener('pointermove', (e) => {
        if (!enTrainDEcrire() || (stylo !== null && e.pointerId !== stylo)) return;
        const pts = currentFreehand.points;
        if (pts.length <= nombreAvant) return;
        const p = pressionDe(e, derniereP);
        if (p === null) return;
        pts[pts.length - 1].p = p;
        derniereP = p;
        compte.pressionsRelevees++;
    }, false);

    const finir = (e) => { if (e.pointerId === stylo) { stylo = null; derniereP = null; nombreAvant = 0; } };
    canvas.addEventListener('pointerup', finir, false);
    canvas.addEventListener('pointercancel', finir, false);
    canvas.addEventListener('lostpointercapture', finir, false);

    window.Stylet = { compte, PRESSION_MIN, LISSAGE, pressionDe, quiEcrit: () => stylo };
})();
