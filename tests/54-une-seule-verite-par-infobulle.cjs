// UNE SEULE VÉRITÉ PAR BOUTON.
//
// Le même texte écrit à deux endroits — dans la page ET dans le code — est un
// piège qui ne se voit jamais : la page se charge, le code écrase, et celui
// qui relit « index.html » lit une phrase que PERSONNE N'A JAMAIS VUE. Il la
// corrige, la traduit, la trouve maladroite et la réécrit : rien ne change à
// l'écran, et il cherche pourquoi.
//
// Ce projet s'y est laissé prendre quatre fois :
//
//   — le dessin du bouton « Présenter », écrit en SVG dans la page, que
//     « ICONES_PLEIN_ECRAN » remplaçait au chargement ;
//   — les infobulles des deux boutons du coin, écrites dans la page et
//     réécrites par « majBoutonPresenterDeLEcran » et « majLePointDAffichage » ;
//   — la pastille « Focus », qui récitait le cycle — « tout, puis les barres
//     seules, puis le tableau nu » — quand le code y met depuis où l'on EST.
//
// Chaque fois, la faute n'a été trouvée que par hasard, et jamais par un test :
// les deux valeurs disaient à peu près la même chose, donc tout passait. Ce
// test-ci ne compare plus les textes à ce qu'on attend d'eux, il compare LA
// PAGE ÉCRITE À LA PAGE CHARGÉE. Il en a trouvé trois autres du premier coup :
// le bouton « Poser » de la bande des morceaux, l'état de l'enregistrement, et
// la pastille de la classe du moment.
//
// CE QU'IL NE REPROCHE PAS : qu'une valeur soit DÉPLACÉE. L'infobulle maison
// ramasse les « title » de la page — pour qu'un seul moteur les affiche, au
// doigt comme à la souris — et détache le raccourci du texte : « Annuler
// (Ctrl+Z) » devient « Annuler » plus la touche à côté. La phrase écrite est
// alors LUE, et c'est tout ce qu'on demande. Ce qu'on refuse, c'est la phrase
// écrite que personne ne lit.
//
// LA RÈGLE, EN UNE LIGNE : ce que le code pose, la page ne l'écrit pas.
const fs = require('fs');
const path = require('path');
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

// CE QUI A LE DROIT DE CHANGER — et pourquoi. Chaque dispense porte sa raison :
// la liste est la trace d'une relecture, pas une exemption commode.
const DISPENSES = [
    { motif: /^titre-horloge$/, pourquoi: 'les aiguilles tournent : le dessin écrit est celui de midi' }
];
const dispense = (id) => DISPENSES.some(d => d.motif.test(id));

// LA COMPARAISON, ÉCRITE UNE FOIS. On la joue sur la vraie page, puis sur une
// page où l'on a semé une phrase morte : si la seconde ne rapporte rien, c'est
// que la première ne regardait rien.
const PHRASES_MORTES = (src) => {
    const ecrite = new DOMParser().parseFromString(src, 'text/html');
    const PORTEUSES = ['data-tooltip', 'title', 'aria-label', 'placeholder'];
    const out = [];
    ecrite.querySelectorAll('[id]').forEach(e => {
        const vivant = document.getElementById(e.id);
        if (!vivant) return;
        // Tout ce que le bouton dit encore, une fois la page chargée — sous
        // quelque attribut que ce soit, et le raccourci recollé au texte.
        const bulle = vivant.getAttribute('data-tooltip');
        const touche = vivant.getAttribute('data-raccourci');
        const survivances = PORTEUSES.map(a => vivant.getAttribute(a));
        if (bulle && touche) survivances.push(bulle + ' (' + touche + ')');
        PORTEUSES.forEach(a => {
            if (!e.hasAttribute(a)) return;
            const avant = e.getAttribute(a);
            if (survivances.includes(avant)) return;
            out.push({ id: e.id, quoi: a, ecrit: avant, lu: vivant.getAttribute(a) });
        });
    });
    return out;
};

module.exports = async function (browser) {
    const r = creerRapport('Une seule vérité par infobulle');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // 1. LES INFOBULLES ET LES TITRES
    // On relit la page telle qu'elle est ÉCRITE — « DOMParser » la lit sans
    // exécuter une ligne de code — et on la compare à la page chargée.
    // ------------------------------------------------------------------
    const mortes = await page.evaluate(`(${PHRASES_MORTES})(${JSON.stringify(SOURCE)})`);
    r.egal('aucune infobulle écrite dans la page n\'est réécrite par le code',
        mortes.filter(m => !dispense(m.id)), []);

    // ------------------------------------------------------------------
    // 2. LES DESSINS
    // Même règle pour les icônes : un SVG écrit dans la page et repeint au
    // chargement est un dessin qu'on croit modifier sans rien changer. On ne
    // regarde que les SVG NOMMÉS — ceux que le code sait retrouver, donc ceux
    // qu'il peut repeindre ; les autres sont des dessins fixes.
    // ------------------------------------------------------------------
    const repeints = await page.evaluate((src) => {
        const ecrite = new DOMParser().parseFromString(src, 'text/html');
        const net = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const out = [];
        ecrite.querySelectorAll('svg[id]').forEach(e => {
            const vivant = document.getElementById(e.id);
            if (!vivant) return;
            const avant = net(e.innerHTML), apres = net(vivant.innerHTML);
            if (avant && avant !== apres) out.push({ id: e.id, ecrit: avant.slice(0, 70), lu: apres.slice(0, 70) });
        });
        return out;
    }, SOURCE);
    r.egal('aucun dessin écrit dans la page n\'est repeint au chargement',
        repeints.filter(m => !dispense(m.id)), []);

    // ------------------------------------------------------------------
    // 3. ET LA GARDE MESURE VRAIMENT QUELQUE CHOSE
    // Un test qui ne trouve rien parce qu'il ne regarde rien passerait aussi.
    // On lui donne donc une page où l'on a semé une phrase morte, et il doit
    // la rapporter — SEULE. C'est le seul moyen de distinguer « rien à
    // signaler » de « personne n'a regardé ».
    // ------------------------------------------------------------------
    const truque = SOURCE.replace('id="btn-ecran-plein"',
        'id="btn-ecran-plein" data-tooltip="UNE PHRASE QUE PERSONNE NE VERRA"');
    r.verifie('la phrase semée est bien semée', truque !== SOURCE, '');
    const temoin = await page.evaluate(`(${PHRASES_MORTES})(${JSON.stringify(truque)})`);
    r.egal('et la garde reconnaît une phrase morte quand on lui en sème une',
        temoin.filter(m => !dispense(m.id)).map(m => m.id + '/' + m.quoi),
        ['btn-ecran-plein/data-tooltip']);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
