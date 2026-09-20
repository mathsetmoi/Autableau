// ==============================================================================
// LA GOMME DU STYLET
// ==============================================================================
// Un stylet Wacom a deux bouts : la pointe, et une gomme. Retourné, il touche
// la tablette par la gomme, et le navigateur le dit — bouton 5 à l'appui,
// puis le bit 32 de « buttons » tant qu'elle appuie. Le tableau, lui, n'en
// savait rien : la gomme dessinait comme la pointe.
//
// Ici, la gomme EFFACE, le temps du contact, sans changer d'outil à la main :
// on retourne le stylet, on frotte, on le retourne, on continue d'écrire. Elle
// se frotte — chaque passage emporte ce qu'il touche — quand la gomme de la
// barre, elle, s'emploie au clic. Et elle n'emporte QUE L'ENCRE : traits,
// segments, cercles, figures. Une photo d'énoncé ou un texte sous le frottement
// restent en place ; les emporter d'un geste qu'on fait sans regarder serait
// pire que tout. Ce qui est verrouillé reste aussi.
//
// Un frottement, un seul pas d'annulation : Ctrl+Z rend tout ce qu'il a
// emporté, pas le dernier trait seulement.
//
// Ce fichier ne touche pas à script.js : il écoute le tableau avant lui, prend
// l'appui de la gomme à son compte, et rend l'outil d'avant au relâcher.
// ==============================================================================
(function () {
    'use strict';
    const canvas = document.getElementById('board');
    if (!canvas) return;

    // Ce que la gomme emporte. Rien d'autre.
    const ENCRE = new Set(['freehand', 'segment', 'circle', 'rectangle', 'polygon', 'curve', 'arc', 'point']);

    let gomme = null;           // l'identifiant du pointeur qui gomme
    let modeAvant = null;       // l'outil qu'on rendra au relâcher
    let effaces = 0;            // ce que ce frottement a emporté
    const compte = { frottements: 0, effaces: 0, epargnes: 0 };

    // La gomme se reconnaît à l'appui (bouton 5) puis au maintien (bit 32).
    function estLaGomme(e) {
        return e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
    }

    function effacerSous(clientX, clientY) {
        let lx, ly;
        try { lx = (clientX - panX) / zoom; ly = (clientY - panY) / zoom; } catch (e) { return false; }
        if (typeof findObjectAt !== 'function' || typeof deleteObject !== 'function') return false;
        const touche = findObjectAt(lx, ly);
        if (!touche || !ENCRE.has(touche.type)) { if (touche) compte.epargnes++; return false; }
        const obj = (typeof getObjectById === 'function') ? getObjectById(touche.type, touche.id) : null;
        if (!obj || obj.locked) { if (obj) compte.epargnes++; return false; }
        deleteObject(touche.type, touche.id);
        effaces++; compte.effaces++;
        return true;
    }

    // Tous les passages de la gomme, y compris ceux que le navigateur a
    // groupés dans l'événement : un frottement rapide ne saute rien.
    function frotter(e) {
        const groupes = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [];
        let touche = false;
        if (groupes.length) groupes.forEach(g => { if (effacerSous(g.clientX, g.clientY)) touche = true; });
        else touche = effacerSous(e.clientX, e.clientY);
        if (touche && typeof draw === 'function') draw();
        return touche;
    }

    canvas.addEventListener('pointerdown', (e) => {
        if (gomme !== null || !estLaGomme(e) || e.target !== canvas) return;
        gomme = e.pointerId; effaces = 0;
        compte.frottements++;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* déjà relâché */ }
        try {
            if (mode !== 'eraser') { modeAvant = mode; setMode('eraser'); }   // le curseur le dit
        } catch (err) { modeAvant = null; }
        try { if (typeof clearSelection === 'function') clearSelection(); } catch (err) { /* rien à vider */ }
        frotter(e);
        // Le tableau ne voit pas cet appui : il y verrait un clic de l'outil.
        e.stopImmediatePropagation();
    }, true);

    canvas.addEventListener('pointermove', (e) => {
        if (e.pointerId !== gomme) return;
        frotter(e);
        e.stopImmediatePropagation();
    }, true);

    // Au relâcher : un seul pas d'annulation, et l'outil d'avant. Le tableau
    // voit ce relâcher — il n'a rien en cours pour ce pointeur, et l'événement
    // range ce que d'autres écoutent (le stylet, la capture).
    function finir(e) {
        if (e.pointerId !== gomme) return;
        gomme = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* déjà relâché */ }
        if (effaces && typeof saveState === 'function') saveState();
        effaces = 0;
        if (modeAvant !== null) {
            try { setMode(modeAvant); } catch (err) { /* l'outil n'existe plus */ }
            modeAvant = null;
        } else if (typeof draw === 'function') draw();
    }
    canvas.addEventListener('pointerup', finir, true);
    canvas.addEventListener('pointercancel', finir, true);
    canvas.addEventListener('lostpointercapture', (e) => { if (e.pointerId === gomme) finir(e); }, true);

    window.GommeDuStylet = { compte, ENCRE, estLaGomme, enCours: () => gomme !== null };
})();
