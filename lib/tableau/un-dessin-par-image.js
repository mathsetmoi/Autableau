// ==============================================================================
// UN SEUL DESSIN PAR IMAGE
// ==============================================================================
// « Lorsque je me déplace sur la page, l'écriture disparaît puis apparaît. »
//
// Chaque mouvement du pointeur demande un dessin : « requestAnimationFrame
// (draw) ». Un doigt ou un stylet en envoie bien plus d'un par image — huit,
// à 120 Hz — et le navigateur exécute alors HUIT dessins complets dans la
// même image, dont sept pour rien : seul le dernier reste à l'écran. Sur un
// tableau chargé (sept cents traits au stylet, deux photos d'énoncé), le
// dessin coûte quelques dizaines de millisecondes sur une tablette de
// classe ; huit fois de suite, c'est une image qui n'arrive plus à temps, et
// le navigateur montre un tableau vide le temps que la carte graphique
// rattrape son retard. L'écriture « disparaît », puis « réapparaît » quand
// le doigt s'arrête.
//
// Ici, le dessin demandé par « requestAnimationFrame » ne s'exécute qu'une
// fois par image : le navigateur remet à tous les appels d'une même image le
// même horodatage, on le reconnaît, et l'on ne peint pas deux fois pour le
// même instant. Les appels DIRECTS — « draw() », sans horodatage — ne sont
// jamais sautés : ils précèdent souvent une lecture du canevas (la photo du
// calque, une vignette, un export) qui doit voir l'état à jour.
//
// Ce fichier ne touche pas à script.js : la fonction « draw » y est déclarée
// au niveau global, on pose la nôtre à sa place, et tout ce qui l'appelle par
// son nom passe par ici.
// ==============================================================================
(function () {
    'use strict';
    const dessin = window.draw;
    if (typeof dessin !== 'function' || dessin.__unDessinParImage) return;

    let derniereImage = -1;
    const compte = { demandes: 0, dessins: 0, sautes: 0 };

    function unDessinParImage(horodatage) {
        if (typeof horodatage === 'number') {          // venu de requestAnimationFrame
            compte.demandes++;
            if (horodatage === derniereImage) { compte.sautes++; return; }
            derniereImage = horodatage;
        }
        compte.dessins++;
        return dessin.apply(this, arguments);
    }
    unDessinParImage.__unDessinParImage = true;
    unDessinParImage.compte = compte;
    unDessinParImage.origine = dessin;
    window.draw = unDessinParImage;
})();
