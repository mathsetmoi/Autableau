// ==============================================================================
// GLISSER LA VUE SANS TOUT REPEINDRE
// ==============================================================================
// « Lorsque je fais bouger la page, elle rame, comme si j'étais à une faible
// fréquence d'image. »
//
// Déplacer la vue, c'est repeindre tout le tableau à chaque image : sept cents
// traits au stylet et deux photos d'énoncé, cela coûte trente à cinquante
// millisecondes sur un portable de classe — vingt images par seconde, et la
// main sent que le tableau traîne derrière elle.
//
// Or PENDANT QU'ON GLISSE, rien ne change sur le tableau : seule la vue bouge.
// On fait donc ce que font les cartes en ligne : au premier mouvement, le
// tableau est peint une fois et l'on en garde la photo ; les images suivantes
// ne font que la faire glisser — une seule copie d'image, quelques dixièmes
// de milliseconde, quelle que soit la quantité d'encre. On repeint pour de
// bon quand le décalage découvre trop de bord, quand on zoome trop loin de
// la photo, et dès que la main s'arrête un instant : ce qu'on regarde
// immobile est toujours net.
//
// Le même principe sert au défilement à la molette ou au pavé tactile, et au
// zoom : la photo est alors agrandie ou réduite, un peu floue le temps du
// geste, nette dès qu'il finit — comme dans un lecteur de PDF.
//
// LA PHOTO NE SERT QUE LÀ. Un trait en cours, un faisceau de laser, la loupe,
// un export : on repeint comme avant. Et un appel direct à « draw() » hors
// d'un geste n'est jamais remplacé par la photo — ce qui lit le canevas
// ensuite doit y trouver l'état exact.
//
// Ce fichier ne touche pas à script.js : « draw » y est déclarée au niveau
// global, on pose la nôtre par-dessus (après le filtre « un dessin par
// image », qui reste en dessous).
// ==============================================================================
(function () {
    'use strict';
    const dessous = window.draw;
    if (typeof dessous !== 'function' || dessous.__glisser) return;

    const SEUIL_DE_BORD = 0.15;      // au-delà de 15 % de bord découvert, on repeint
    const ECHELLE_MIN = 0.7, ECHELLE_MAX = 1.5;   // au-delà, la photo serait trop floue
    const REPOS = 90;                // ms sans mouvement : on repeint net
    const MOLETTE_RECENTE = 150;     // ms : la molette qui vient de tourner fait partie du geste

    const photo = document.createElement('canvas');
    let etat = null;                 // { panX, panY, zoom, w, h } de la photo
    let dansLaMolette = false, derniereMolette = -1e9, minuteur = null;
    let dansLeZoom = false;          // le pas d'animation du zoom est en train de dessiner
    let vueVue = null;               // la vue (pan, zoom) au dernier dessin qu'on a vu passer
    const compte = { glisses: 0, complets: 0 };

    // Les drapeaux du tableau sont des « let » globaux de script.js : on les
    // lit tels quels, et un nom qui n'existerait pas vaut simplement « non ».
    const drapeau = (lire) => { try { return !!lire(); } catch (e) { return false; } };

    // LE ZOOM QUI GLISSE se reconnaît à son pas d'animation, pas à son
    // intention : « zoomVise » reste posé si l'animation est interrompue, et
    // l'on aurait servi la photo à un dessin demandé pour tout autre chose —
    // un fond qu'on vient de choisir, par exemple. On enveloppe le pas
    // lui-même : seuls SES dessins font partie du geste.
    if (typeof window.glisserLeZoom === 'function' && !window.glisserLeZoom.__glisser) {
        const pas = window.glisserLeZoom;
        const pasSurveille = function () {
            dansLeZoom = true;
            try { return pas.apply(this, arguments); } finally { dansLeZoom = false; }
        };
        pasSurveille.__glisser = true;
        window.glisserLeZoom = pasSurveille;
    }

    // Un geste de vue est en cours : on glisse, on défile, ou l'on zoome.
    function enGeste() {
        if (drapeau(() => isPanningView)) return true;
        if (dansLaMolette || performance.now() - derniereMolette < MOLETTE_RECENTE) return true;
        return dansLeZoom;
    }
    // Ce que la photo ne saurait rendre : le dessin en cours, le laser qui
    // s'efface, la loupe, un export.
    function photoInterdite() {
        return drapeau(() => isDrawingFreehand) || drapeau(() => isExportingTransparent)
            || drapeau(() => isLoupeActive) || drapeau(() => laserStrokes && laserStrokes.length > 0);
    }

    // La couleur de fond, celle que « draw » pose sous le tableau.
    function couleurDuFond() {
        try {
            const bg = backgrounds[currentBgIndex];
            if (bg === 'millimetre') return isDarkMode ? '#2d3436' : bgColors.millimetre;
            if (bg === 'copie' || bg === 'seyes-marge') return isDarkMode ? '#15191b' : bgColors.copie;
            return isDarkMode ? '#1e272e' : bgColors.default;
        } catch (e) { return '#ffffff'; }
    }

    function prendreLaPhoto() {
        try {
            if (photo.width !== canvas.width || photo.height !== canvas.height) {
                photo.width = canvas.width; photo.height = canvas.height;
            }
            const g = photo.getContext('2d');
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, photo.width, photo.height);
            g.drawImage(canvas, 0, 0);
            etat = { panX, panY, zoom, w: canvas.width, h: canvas.height };
        } catch (e) { etat = null; }
    }

    // Où la photo se pose pour la vue d'aujourd'hui, et ce qu'elle laisse à nu.
    function placement() {
        const s = zoom / etat.zoom;
        const tx = panX - s * etat.panX, ty = panY - s * etat.panY;
        const l = photo.width * s, h = photo.height * s;
        const nu = Math.max(tx, canvas.width - (tx + l), 0) / canvas.width;
        const nuH = Math.max(ty, canvas.height - (ty + h), 0) / canvas.height;
        return { s, tx, ty, l, h, decouvert: Math.max(nu, nuH) };
    }

    function photoUtilisable() {
        if (!etat || etat.w !== canvas.width || etat.h !== canvas.height) return false;
        const p = placement();
        if (p.s < ECHELLE_MIN || p.s > ECHELLE_MAX) return false;
        return p.decouvert <= SEUIL_DE_BORD;
    }

    function glisser() {
        const p = placement();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;
        ctx.fillStyle = couleurDuFond();
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (p.s === 1) ctx.drawImage(photo, Math.round(p.tx), Math.round(p.ty));
        else ctx.drawImage(photo, p.tx, p.ty, p.l, p.h);
        ctx.restore();
        compte.glisses++;
        // Ce que « draw » replace dans la page à chaque image suit la vue aussi.
        try { if (typeof replacerLeRideau === 'function') replacerLeRideau(); } catch (e) { /* rien */ }
        try { if (typeof majBarreDocument === 'function') majBarreDocument(); } catch (e) { /* rien */ }
        repeindreAuRepos();
    }

    // Dès que la main s'arrête, le vrai dessin — net — reprend sa place.
    function repeindreAuRepos() {
        clearTimeout(minuteur);
        minuteur = setTimeout(() => {
            minuteur = null;
            etat = null;
            dessinComplet();
        }, REPOS);
    }

    function dessinComplet() {
        const avant = dessous.compte ? dessous.compte.dessins : null;
        const r = dessous.apply(null, arguments);
        // Le filtre du dessous a pu sauter ce dessin (déjà fait pour cette
        // image) : la photo qu'on prendrait serait alors celle d'une autre vue.
        const fait = (avant === null) || (dessous.compte.dessins !== avant);
        if (fait) compte.complets++;
        if (fait && enGeste() && !photoInterdite()) prendreLaPhoto();
        return r;
    }

    function glisserSansToutRepeindre(horodatage) {
        const parAnimation = typeof horodatage === 'number';
        // LA VUE A-T-ELLE BOUGÉ depuis le dernier dessin ? Un relâcher perdu
        // laisse « isPanningView » levé ; sans mouvement de la vue, un dessin
        // est un vrai dessin.
        const aBouge = !vueVue || vueVue.panX !== panX || vueVue.panY !== panY || vueVue.zoom !== zoom;
        vueVue = { panX, panY, zoom };
        // Un dessin qui fait partie d'un geste : celui que le mouvement demande
        // (par animation), celui de la molette, celui du pas du zoom.
        const duGeste = aBouge && (parAnimation || dansLaMolette || dansLeZoom);
        if (duGeste && enGeste() && !photoInterdite()) {
            if (etat && photoUtilisable()) { glisser(); return; }
            return dessinComplet.apply(this, arguments);
        }
        // Hors d'un geste, la photo n'a plus cours.
        if (minuteur) { clearTimeout(minuteur); minuteur = null; }
        etat = null;
        return dessous.apply(this, arguments);
    }
    glisserSansToutRepeindre.__glisser = true;
    glisserSansToutRepeindre.glissements = compte;
    glisserSansToutRepeindre.dessous = dessous;
    // Les propriétés du filtre restent lisibles à travers nous : « draw.compte »
    // reste le compte des dessins réels, « draw.origine » le dessin nu.
    if (dessous.__unDessinParImage) {
        glisserSansToutRepeindre.__unDessinParImage = true;
        glisserSansToutRepeindre.compte = dessous.compte;
        Object.defineProperty(glisserSansToutRepeindre, 'origine', {
            get: () => dessous.origine, set: (f) => { dessous.origine = f; }
        });
    }
    window.draw = glisserSansToutRepeindre;

    // La molette : on sait qu'on est dedans le temps que le tableau la traite.
    document.addEventListener('DOMContentLoaded', () => {
        const c = document.getElementById('board');
        if (!c) return;
        c.addEventListener('wheel', () => {
            dansLaMolette = true; derniereMolette = performance.now();
            setTimeout(() => { dansLaMolette = false; }, 0);
        }, { capture: true, passive: true });
        window.addEventListener('wheel', () => { dansLaMolette = false; }, { passive: true });
    });
})();
