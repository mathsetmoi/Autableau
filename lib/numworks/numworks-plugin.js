// ==============================================================================
// LA CALCULATRICE NUMWORKS SUR LE TABLEAU — COLLÈGE OU LYCÉE
// ==============================================================================
// « Je voudrais intégrer le simulateur calculatrice NumWorks collège et celui
// du lycée. »
//
// NumWorks propose son émulateur « prêt à intégrer », mais en anglais et pour
// la seule calculatrice graphique. La page lib/numworks/calculatrice.html
// pose le même composant, en français, et choisit le modèle : la scientifique
// (collège) ou la graphique (lycée). Ici, on la met dans une fenêtre web du
// tableau — la même que GeoGebra ou Python : elle se déplace, se redimensionne,
// se met en grand, et part avec la séance.
//
// Ce fichier ne touche pas à plugin.js : il s'enregistre comme les autres
// outils, dans la rubrique « Maths - Numérique ».
// ==============================================================================
(function () {
    'use strict';

    const CLE_MODELE = 'auTableau_numworks_modele';

    // Les deux calculatrices, et la place qu'elles prennent sur le tableau
    // (en unités du tableau, barre de titre comprise). La scientifique est
    // plus trapue que la graphique.
    const MODELES = {
        college: { nom: 'Collège — scientifique', titre: 'NumWorks collège', l: 340, h: 620 },
        lycee:   { nom: 'Lycée — graphique',      titre: 'NumWorks lycée',   l: 330, h: 700 }
    };

    function modeleRetenu() {
        try { const m = localStorage.getItem(CLE_MODELE); if (MODELES[m]) return m; } catch (e) { /* refusé */ }
        return 'lycee';
    }
    function retenirLeModele(m) {
        try { localStorage.setItem(CLE_MODELE, m); } catch (e) { /* refusé */ }
    }

    // L'adresse de la page, relative à celle du tableau : elle vaut en ligne
    // (https), sur un serveur local (http) et depuis un dossier (file). C'est
    // pour cela qu'on ne passe pas par « ouvrirUneFenetreWeb », qui n'accepte
    // que du https — une règle faite pour les sites d'ailleurs, pas pour une
    // page à nous.
    function adresseDeLaCalculatrice(modele) {
        return new URL('lib/numworks/calculatrice.html?modele=' + encodeURIComponent(modele), document.baseURI).href;
    }

    // Une fenêtre web comme les autres — voir « ouvrirUneFenetreWeb » dans
    // script.js, dont ceci reprend la forme.
    function poserLaCalculatrice(modele) {
        const m = MODELES[modele] || MODELES.lycee;
        retenirLeModele(modele);
        if (typeof htmlPostits === 'undefined' || typeof nextId === 'undefined') return null;
        const ech = (typeof zoom !== 'undefined' && zoom) || 1;
        const px = (typeof panX !== 'undefined') ? panX : 0;
        const py = (typeof panY !== 'undefined') ? panY : 0;
        const fenetre = {
            id: nextId++,
            x: (window.innerWidth / 2 - px) / ech - m.l / 2,
            y: (window.innerHeight / 2 - py) / ech - m.h / 2,
            w: m.l / ech, h: m.h / ech,
            mode: 'web', url: adresseDeLaCalculatrice(modele),
            titre: m.titre,
            content: '', bg: '#ffffff', minimized: false,
            ancre: 'tableau', z: globalZ++
        };
        htmlPostits.push(fenetre);
        if (typeof saveState === 'function') saveState();
        if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
        if (typeof showToast === 'function') showToast('🧮 ' + m.titre + ' est sur le tableau');
        return fenetre;
    }

    const ICONE = '<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor"'
        + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="5" y="2" width="14" height="20" rx="2"/>'
        + '<rect x="8" y="5" width="8" height="4" rx="1"/>'
        + '<line x1="8" y1="13" x2="8" y2="13.01"/><line x1="12" y1="13" x2="12" y2="13.01"/><line x1="16" y1="13" x2="16" y2="13.01"/>'
        + '<line x1="8" y1="17" x2="8" y2="17.01"/><line x1="12" y1="17" x2="12" y2="17.01"/><line x1="16" y1="17" x2="16" y2="17.01"/>'
        + '</svg>';

    if (typeof registerPlugin !== 'function') return;

    registerPlugin('numworksTool', 'Maths - Numérique', {
        MODELES,
        adresseDeLaCalculatrice,
        poser: poserLaCalculatrice,

        init: function () {
            const grid = document.getElementById('plugins-grid'); if (!grid) return;
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.id = 'btn-numworks';
            btn.title = 'Calculatrice NumWorks (collège ou lycée)';
            btn.setAttribute('data-tooltip', 'Calculatrice NumWorks');
            btn.innerHTML = ICONE;
            grid.appendChild(btn);
            btn.addEventListener('click', (e) => { e.stopPropagation(); this.ouvrir(); });
        },

        // Le choix du modèle, puis la fenêtre. Le dernier choix est retenu :
        // un professeur de collège n'a pas à le redire à chaque séance.
        ouvrir: function () {
            if (typeof openCustomPrompt !== 'function') { poserLaCalculatrice(modeleRetenu()); return; }
            openCustomPrompt('Calculatrice NumWorks', [
                { type: 'select', label: 'Modèle', value: modeleRetenu(), options: [
                    { value: 'college', label: MODELES.college.nom },
                    { value: 'lycee', label: MODELES.lycee.nom }
                ] }
            ], null, (res) => { poserLaCalculatrice(MODELES[res[0]] ? res[0] : 'lycee'); });
        },

        edit: function () { this.ouvrir(); }
    });
})();
