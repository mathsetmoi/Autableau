// UNE FENÊTRE WEB SUR LE TABLEAU : GEOGEBRA, PYTHON, ET LE RESTE.
//
// « Avoir la possibilité d'importer des applets GeoGebra serait top ! Sur leur
// site ils proposent des morceaux de code à intégrer pour pouvoir importer
// directement des fenêtres geogebra à l'intérieur d'un site et c'est pas très
// compliqué. De même, l'intégration de codes python serait incroyable ! (je
// sais que tu y avais pensé et que c'est un peu plus complexe) Je me dis qu'un
// iframe d'un site comme "basthon" pourrait faire l'affaire ! »
//
// Ce qu'on colle, c'est ce que le site donne : un bloc « <iframe … > », le
// script « deployggb.js » de GeoGebra, ou une simple adresse. Les trois mènent
// à la même chose — une adresse à mettre dans un cadre.
//
// CE QUE CETTE SUITE TIENT :
//
//   — les trois formes de code se lisent, et donnent la même adresse ;
//   — l'adresse qu'on lit dans la barre du navigateur (« geogebra.org/m/… »),
//     qui refuse d'être encadrée, est convertie en celle qui l'accepte ;
//   — ce qui n'est pas une adresse en https est refusé, et le dit ;
//   — la fenêtre posée est un post-it comme les autres : elle se déplace avec
//     le tableau, se redimensionne, se ferme, et traverse une sauvegarde ;
//   — le cadre n'est PAS rechargé quand le tableau bouge — une construction
//     GeoGebra repartirait de zéro à chaque déplacement ;
//   — il est cloisonné, et ce qui n'a pas de sens pour lui ne s'affiche pas ;
//   — le bouton des outils ouvre la fenêtre de réglage, et les deux raccourcis
//     mènent à GeoGebra et à Python.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const CODE_GGB = '<iframe scrolling="no" title="Fonctions affines" '
    + 'src="https://www.geogebra.org/material/iframe/id/abc123/width/800/height/600" '
    + 'width="800px" height="600px" style="border:0px;"> </iframe>';

module.exports = async function (browser) {
    const r = creerRapport('Les fenêtres web');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });

    // ------------------------------------------------------------------
    // 1. LIRE CE QUE LE SITE DONNE
    // ------------------------------------------------------------------
    const lu = await page.evaluate((code) => ({
        iframe: lireUneIntegration(code),
        // L'adresse qu'on lit dans la barre du navigateur : GeoGebra refuse
        // de la laisser encadrer, et c'est l'autre forme qu'il faut.
        page: lireUneIntegration('https://www.geogebra.org/m/xyz789'),
        montre: lireUneIntegration('https://www.geogebra.org/material/show/id/xyz789'),
        // Le script « deployggb.js » ne porte pas d'adresse, mais un
        // identifiant de matériel : on construit le cadre à sa place.
        deploy: lireUneIntegration('var params = {"appName":"graphing", "material_id":"mnop45", "width":900};'),
        basthon: lireUneIntegration('https://console.basthon.fr/'),
        // Une esperluette échappée par le site : « &amp; » n'est pas « & ».
        echappee: lireUneIntegration('<iframe src="https://console.basthon.fr/?a=1&amp;b=2"></iframe>'),
        // Ce qui n'est pas une adresse en https.
        http: lireUneIntegration('http://exemple.fr/truc'),
        texte: lireUneIntegration('bonjour tout le monde'),
        vide: lireUneIntegration('')
    }), CODE_GGB);

    r.egal('un bloc « iframe » donne son adresse, et la taille que le site demande',
        lu.iframe,
        { url: 'https://www.geogebra.org/material/iframe/id/abc123/width/800/height/600',
          hote: 'geogebra.org', w: 800, h: 600 });
    r.egal('l\'adresse de la barre du navigateur devient celle qui s\'encadre',
        [lu.page.url, lu.montre.url],
        ['https://www.geogebra.org/material/iframe/id/xyz789',
         'https://www.geogebra.org/material/iframe/id/xyz789']);
    r.egal('le script « deployggb » donne son identifiant de matériel',
        lu.deploy.url, 'https://www.geogebra.org/material/iframe/id/mnop45');
    r.egal('une adresse toute simple passe telle quelle',
        { url: lu.basthon.url, hote: lu.basthon.hote },
        { url: 'https://console.basthon.fr/', hote: 'console.basthon.fr' });
    r.egal('une esperluette échappée par le site est rendue à sa forme',
        lu.echappee.url, 'https://console.basthon.fr/?a=1&b=2');
    r.egal('et ce qui n\'est pas une adresse en https est refusé',
        [lu.http, lu.texte, lu.vide], [null, null, null]);

    // ------------------------------------------------------------------
    // 2. LA FENÊTRE POSÉE
    // ------------------------------------------------------------------
    const posee = await page.evaluate((code) => {
        htmlPostits.length = 0; panX = 0; panY = 0; zoom = 1;
        const f = ouvrirUneFenetreWeb(code);
        renderHtmlPostits();
        const el = document.querySelector('.html-postit[data-id="' + f.id + '"]');
        const cadre = el.querySelector('.html-postit-web iframe');
        const vu = (sel) => getComputedStyle(el.querySelector(sel)).display;
        const rect = el.getBoundingClientRect();
        return {
            mode: f.mode, titre: f.titre, ancre: f.ancre,
            adresse: cadre.getAttribute('src'),
            sandbox: cadre.getAttribute('sandbox'),
            referrer: cadre.getAttribute('referrerpolicy'),
            cadreVu: vu('.html-postit-web'),
            corps: vu('.html-postit-body'),
            liste: vu('.html-postit-liste'),
            couleur: vu('.cycle-color'),
            enListe: vu('.btn-liste-postit'),
            copier: vu('.btn-copier-postit'),
            onglet: vu('.btn-onglet-postit'),
            // La taille demandée par le site est celle qu'on obtient.
            l: Math.round(rect.width), h: Math.round(rect.height),
            // Et le cadre remplit vraiment la fenêtre, sous son en-tête : tout
            // ce qui n'est pas la barre de titre lui revient, au bord près.
            cadre: (() => {
                const c = cadre.getBoundingClientRect();
                const e = el.querySelector('.html-postit-header').getBoundingClientRect();
                return { sousLEntete: Math.round(c.top - e.bottom),
                         jusquEnBas: Math.round(rect.bottom - c.bottom),
                         reste: Math.round(rect.width - c.width) };
            })()
        };
    }, CODE_GGB);
    r.egal('la fenêtre est un post-it en mode « web », attaché au tableau',
        { mode: posee.mode, titre: posee.titre, ancre: posee.ancre },
        { mode: 'web', titre: 'geogebra.org', ancre: 'tableau' });
    r.egal('son cadre porte l\'adresse lue',
        posee.adresse, 'https://www.geogebra.org/material/iframe/id/abc123/width/800/height/600');
    r.verifie('il est cloisonné : il exécute son code sans piloter la page qui l\'accueille',
        /allow-scripts/.test(posee.sandbox) && /allow-same-origin/.test(posee.sandbox)
        && !/allow-top-navigation/.test(posee.sandbox) && posee.referrer === 'no-referrer',
        posee.sandbox + ' / ' + posee.referrer);
    r.egal('le cadre se voit, le papier du post-it non',
        { cadre: posee.cadreVu, corps: posee.corps, liste: posee.liste },
        { cadre: 'flex', corps: 'none', liste: 'none' });
    r.egal('et ce qui n\'a pas de sens ici ne s\'affiche pas',
        { couleur: posee.couleur, liste: posee.enListe, copier: posee.copier },
        { couleur: 'none', liste: 'none', copier: 'none' });
    r.egal('mais « ouvrir dans un onglet » est là : c\'est la porte de secours',
        posee.onglet, 'flex');
    r.egal('la taille demandée par le site est celle qu\'on obtient',
        { l: posee.l, h: posee.h }, { l: 800, h: 600 });
    // Le bord du post-it fait deux pixels de chaque côté : c'est tout ce qui
    // sépare le cadre des bords de la fenêtre.
    r.egal('et le cadre remplit vraiment la fenêtre, sous la barre de titre',
        posee.cadre, { sousLEntete: 0, jusquEnBas: 2, reste: 4 });

    // ------------------------------------------------------------------
    // 3. LE TABLEAU BOUGE, LE CADRE NE RECHARGE PAS
    // Une construction GeoGebra ou une console Python repartiraient de zéro à
    // chaque déplacement du tableau — c'est-à-dire tout le temps.
    // ------------------------------------------------------------------
    const bouge = await page.evaluate(async () => {
        const el = document.querySelector('.html-postit.en-web');
        const avant = el.getBoundingClientRect();
        // ON COMPTE LES ÉCRITURES DE « src ». Un témoin posé sur l'élément ne
        // dirait rien : réécrire « src » ne remplace pas le cadre, elle
        // recharge la page qui est dedans. L'observateur, lui, voit chaque
        // écriture de l'attribut, même à valeur égale — c'est exactement le
        // rechargement qu'on veut éviter.
        let ecritures = 0;
        const guetteur = new MutationObserver(m => { ecritures += m.length; });
        guetteur.observe(el.querySelector('iframe'), { attributes: true, attributeFilter: ['src'] });
        for (let i = 0; i < 4; i++) {
            panX += 30; panY += 15; zoom += 0.125;
            renderHtmlPostits();
            await new Promise(ok => setTimeout(ok, 40));
        }
        await new Promise(ok => setTimeout(ok, 120));
        guetteur.disconnect();
        const apres = el.getBoundingClientRect();
        return {
            ecritures,
            aSuivi: Math.round(apres.left - avant.left) !== 0,
            aGrandi: Math.round(apres.width) === Math.round(avant.width * 1.5)
        };
    });
    r.verifie('la fenêtre suit le tableau et grandit avec le zoom',
        bouge.aSuivi && bouge.aGrandi, JSON.stringify(bouge));
    r.egal('mais le cadre n\'est PAS rechargé : la construction reste en place',
        bouge.ecritures, 0);

    // Changer l'adresse, en revanche, doit bien recharger.
    const changee = await page.evaluate(async () => {
        const o = htmlPostits[0];
        const el = document.querySelector('.html-postit.en-web');
        el.querySelector('iframe').dataset.temoin = 'vivant';
        o.url = 'https://console.basthon.fr/';
        renderHtmlPostits();
        await new Promise(ok => setTimeout(ok, 120));
        const c = el.querySelector('iframe');
        return { adresse: c.getAttribute('src'), temoin: c.dataset.temoin };
    });
    r.egal('changer l\'adresse recharge bien le cadre',
        changee.adresse, 'https://console.basthon.fr/');

    // ------------------------------------------------------------------
    // 4. ELLE TRAVERSE LA SAUVEGARDE, ET SE FERME
    // ------------------------------------------------------------------
    const sauvee = await page.evaluate(async () => {
        saveState();
        const copie = JSON.parse(JSON.stringify(htmlPostits));
        // On vide et l'on remet, comme le fait un changement de page.
        htmlPostits = [];
        renderHtmlPostits();
        const pendant = document.querySelectorAll('.html-postit.en-web').length;
        htmlPostits = copie;
        renderHtmlPostits();
        await new Promise(ok => setTimeout(ok, 120));
        const el = document.querySelector('.html-postit.en-web');
        return { pendant, garde: htmlPostits[0].mode + '|' + htmlPostits[0].url,
                 refaite: !!(el && el.querySelector('iframe')),
                 adresse: el ? el.querySelector('iframe').getAttribute('src') : null };
    });
    r.egal('elle s\'en va avec sa page', sauvee.pendant, 0);
    r.egal('et revient entière, cadre compris',
        { garde: sauvee.garde, refaite: sauvee.refaite, adresse: sauvee.adresse },
        { garde: 'web|https://console.basthon.fr/', refaite: true,
          adresse: 'https://console.basthon.fr/' });

    // ET IL N'EST QUE LÀ : un post-it de papier n'a pas d'onglet à ouvrir.
    const surDuPapier = await page.evaluate(async () => {
        htmlPostits.push({ id: nextId++, x: 40, y: 40, w: 200, h: 160, content: 'note',
                           bg: '#fdfd96', minimized: false, z: globalZ++ });
        renderHtmlPostits();
        await new Promise(ok => setTimeout(ok, 120));
        const el = [...document.querySelectorAll('.html-postit')]
            .find(e => !e.classList.contains('en-web'));
        const d = getComputedStyle(el.querySelector('.btn-onglet-postit')).display;
        htmlPostits = htmlPostits.filter(p => p.mode === 'web');
        renderHtmlPostits();
        return d;
    });
    r.egal('sur un post-it de papier, il n\'y a pas d\'onglet à ouvrir',
        surDuPapier, 'none');

    const fermee = await page.evaluate(async () => {
        document.querySelector('.html-postit.en-web .btn-close-postit').click();
        await new Promise(ok => setTimeout(ok, 150));
        return { restent: htmlPostits.length,
                 àLécran: document.querySelectorAll('.html-postit.en-web').length };
    });
    r.egal('et la croix la referme pour de bon', fermee, { restent: 0, 'àLécran': 0 });

    // ------------------------------------------------------------------
    // 5. LE BOUTON DES OUTILS, ET LES DEUX RACCOURCIS
    // ------------------------------------------------------------------
    const bouton = await page.evaluate(async () => {
        const b = document.getElementById('btn-fenetre-web');
        if (!b) return { existe: false };
        b.click();
        await new Promise(ok => setTimeout(ok, 250));
        const modale = document.getElementById('custom-prompt-modal')
            || document.querySelector('#custom-prompt-title').closest('div[id]');
        const choix = [...document.querySelectorAll('#custom-prompt-inputs option')]
            .map(o => o.value);
        const titre = document.getElementById('custom-prompt-title').textContent;
        return { existe: true, titre, choix, modale: !!modale };
    });
    r.verifie('le bouton « Fenêtre web » est dans la grille des outils',
        bouton.existe, JSON.stringify(bouton));
    r.egal('il ouvre un réglage qui propose GeoGebra, Python, et le collage',
        { titre: bouton.titre, choix: bouton.choix },
        { titre: 'Fenêtre web', choix: ['geogebra', 'python', 'colle'] });

    // On referme la boîte, puis on éprouve les deux raccourcis directement :
    // ce sont eux qui portent les deux adresses.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const raccourcis = await page.evaluate(() => {
        htmlPostits.length = 0;
        const g = ouvrirUneFenetreWeb(FENETRES_TOUTES_PRETES.geogebra.url,
            { titre: FENETRES_TOUTES_PRETES.geogebra.titre });
        const p = ouvrirUneFenetreWeb(FENETRES_TOUTES_PRETES.python.url,
            { titre: FENETRES_TOUTES_PRETES.python.titre });
        renderHtmlPostits();
        const sortie = { geo: { titre: g.titre, url: g.url }, py: { titre: p.titre, url: p.url },
                         combien: document.querySelectorAll('.html-postit.en-web').length };
        htmlPostits.length = 0; renderHtmlPostits();
        return sortie;
    });
    r.egal('« GeoGebra » ouvre GeoGebra',
        raccourcis.geo, { titre: 'GeoGebra', url: 'https://www.geogebra.org/calculator' });
    r.egal('« Python » ouvre la console Basthon',
        raccourcis.py, { titre: 'Python', url: 'https://console.basthon.fr/' });
    r.egal('et deux fenêtres tiennent ensemble sur le tableau', raccourcis.combien, 2);

    // Un code illisible ne pose rien, et le dit.
    const refus = await page.evaluate(async () => {
        document.querySelectorAll('#toast-container > *').forEach(t => t.remove());
        const rien = ouvrirUneFenetreWeb('ceci n\'est pas une adresse');
        await new Promise(ok => setTimeout(ok, 150));
        return { rendu: rien, posees: htmlPostits.length,
                 message: [...document.querySelectorAll('#toast-container *')]
                     .map(t => t.textContent).join(' ') };
    });
    r.egal('un code illisible ne pose aucune fenêtre',
        { rendu: refus.rendu, posees: refus.posees }, { rendu: null, posees: 0 });
    r.verifie('et le message dit quoi coller',
        /https/.test(refus.message) && /iframe/.test(refus.message), refus.message);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
