// LA CALCULATRICE NUMWORKS, COLLÈGE OU LYCÉE.
//
// « Je voudrais intégrer le simulateur calculatrice NumWorks collège et celui
// du lycée. »
//
// La calculatrice elle-même vient de numworks.com : ce n'est pas elle qu'on
// éprouve — on n'a pas le réseau sur un serveur d'intégration, et ce n'est pas
// notre code. Ce qu'on tient :
//
//   — l'outil est dans la rubrique « Maths - Numérique », et son bouton ouvre
//     le choix du modèle ;
//   — le choix pose une fenêtre web sur le tableau, à l'adresse de NOTRE page,
//     avec le modèle demandé, et cette fenêtre part avec la séance ;
//   — le dernier modèle choisi est retenu ;
//   — la page de la calculatrice règle le composant de NumWorks selon le
//     modèle — type, langue, programme — avant même que leurs scripts
//     arrivent, et dit quand ils ne viennent pas.
const path = require('path');
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'lib', 'numworks', 'calculatrice.html');

module.exports = async function (browser) {
    const r = creerRapport('Calculatrice NumWorks');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // Le réseau vers NumWorks est coupé : on regarde ce que NOTRE code fait
    // sans lui — et le cadre de la fenêtre ne doit pas partir le chercher
    // pendant qu'on lit le tableau.
    await context.route(/numworks\.com/, route => route.abort());

    // ------------------------------------------------------------------
    // 1. L'OUTIL, SON BOUTON, LE CHOIX DU MODÈLE
    // ------------------------------------------------------------------
    const outil = await page.evaluate(() => {
        const p = PluginManager.plugins.numworksTool;
        const btn = document.getElementById('btn-numworks');
        return { plugin: !!p, bouton: !!btn, categorie: btn && btn.dataset.category,
                 pluginId: btn && btn.dataset.pluginId };
    });
    r.egal('l\'outil est enregistré, avec son bouton dans « Maths - Numérique »',
        outil, { plugin: true, bouton: true, categorie: 'Maths - Numérique', pluginId: 'numworksTool' });

    const choix = await page.evaluate(async () => {
        htmlPostits.length = 0;
        localStorage.removeItem('auTableau_numworks_modele');
        document.getElementById('btn-numworks').click();
        await new Promise(ok => setTimeout(ok, 200));
        const sel = document.querySelector('#custom-prompt-inputs select');
        return {
            visible: getComputedStyle(document.getElementById('custom-prompt-modal')).display !== 'none',
            titre: document.getElementById('custom-prompt-title').innerText,
            options: sel ? [...sel.options].map(o => o.value) : null,
            defaut: sel && sel.value
        };
    });
    r.egal('le bouton ouvre le choix du modèle, lycée par défaut',
        choix, { visible: true, titre: 'Calculatrice NumWorks', options: ['college', 'lycee'], defaut: 'lycee' });

    // ------------------------------------------------------------------
    // 2. LE COLLÈGE : une fenêtre web, à notre page, avec le bon modèle
    // ------------------------------------------------------------------
    const college = await page.evaluate(async () => {
        const sel = document.querySelector('#custom-prompt-inputs select');
        sel.value = 'college';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('custom-prompt-ok').click();
        await new Promise(ok => setTimeout(ok, 400));
        const p = htmlPostits[htmlPostits.length - 1];
        const cadre = document.querySelector('.html-postit-web iframe');
        const url = p && new URL(p.url);
        return {
            n: htmlPostits.length,
            mode: p && p.mode, titre: p && p.titre,
            memeOrigine: !!url && url.href.startsWith(new URL('.', document.baseURI).href),
            chemin: url && url.pathname.replace(/^.*\/lib\//, 'lib/'),
            modele: url && url.searchParams.get('modele'),
            cadreSuit: !!cadre && cadre.src === p.url,
            retenu: localStorage.getItem('auTableau_numworks_modele'),
            modalFermee: getComputedStyle(document.getElementById('custom-prompt-modal')).display === 'none'
        };
    });
    r.egal('« collège » pose UNE fenêtre web, à notre page, avec le modèle scientifique',
        college, { n: 1, mode: 'web', titre: 'NumWorks collège', memeOrigine: true,
                   chemin: 'lib/numworks/calculatrice.html', modele: 'college',
                   cadreSuit: true, retenu: 'college', modalFermee: true });

    // ------------------------------------------------------------------
    // 3. LE LYCÉE, ET LE MODÈLE RETENU
    // ------------------------------------------------------------------
    const lycee = await page.evaluate(async () => {
        document.getElementById('btn-numworks').click();
        await new Promise(ok => setTimeout(ok, 200));
        const sel = document.querySelector('#custom-prompt-inputs select');
        const propose = sel.value;                       // le dernier choix, retenu
        sel.value = 'lycee';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('custom-prompt-ok').click();
        await new Promise(ok => setTimeout(ok, 400));
        const p = htmlPostits[htmlPostits.length - 1];
        return { propose, n: htmlPostits.length, titre: p.titre,
                 modele: new URL(p.url).searchParams.get('modele'),
                 plusHaute: p.h > htmlPostits[0].h,
                 retenu: localStorage.getItem('auTableau_numworks_modele') };
    });
    r.egal('le dernier modèle est proposé d\'abord, et « lycée » pose la graphique',
        lycee, { propose: 'college', n: 2, titre: 'NumWorks lycée', modele: 'lycee', plusHaute: true, retenu: 'lycee' });

    // ------------------------------------------------------------------
    // 4. ELLE PART AVEC LA SÉANCE
    // ------------------------------------------------------------------
    const enregistre = await page.evaluate(() => {
        syncPage();
        const s = stateForStorage();
        const fenetres = (s.pages[0].htmlPostits || []).filter(p => p.mode === 'web' && /calculatrice\.html/.test(p.url));
        return { n: fenetres.length, modeles: fenetres.map(p => new URL(p.url).searchParams.get('modele')) };
    });
    r.egal('les deux calculatrices sont dans ce qui s\'enregistre',
        enregistre, { n: 2, modeles: ['college', 'lycee'] });

    // ------------------------------------------------------------------
    // 5. LA PAGE DE LA CALCULATRICE règle le composant de NumWorks
    // ------------------------------------------------------------------
    const pageCalc = await context.newPage();
    await pageCalc.route(/numworks\.com/, route => route.abort());
    const reglages = {};
    for (const [modele, attendu] of [['college', 'calculator-scientific'], ['lycee', 'calculator-graphing'], ['', 'calculator-graphing']]) {
        await pageCalc.goto(PAGE + (modele ? '?modele=' + modele : ''));
        await pageCalc.waitForTimeout(400);
        reglages[modele || 'sans'] = await pageCalc.evaluate(() => {
            const sim = document.querySelector('simulator');
            return { type: sim.getAttribute('type-identifier'), lang: sim.getAttribute('lang'),
                     docLang: document.documentElement.lang,
                     programme: (window.NW_PROGRAMME || '').replace(/^.*\/(epsilon|scandium)-.*$/, '$1'),
                     titre: document.title };
        });
        reglages[modele || 'sans'].attendu = attendu;
    }
    r.egal('« collège » : le composant scientifique, en français, avec le programme Scandium',
        reglages.college, { type: 'calculator-scientific', lang: 'fr', docLang: 'fr', programme: 'scandium',
                            titre: 'Calculatrice NumWorks (collège)', attendu: 'calculator-scientific' });
    r.egal('« lycée » : le composant graphique, en français, avec le programme Epsilon',
        reglages.lycee, { type: 'calculator-graphing', lang: 'fr', docLang: 'fr', programme: 'epsilon',
                          titre: 'Calculatrice NumWorks (lycée)', attendu: 'calculator-graphing' });
    r.egal('sans rien dire, c\'est le lycée', reglages.sans.type, 'calculator-graphing');

    // Sans réseau, la page le dit — plutôt qu'un cadre blanc devant la classe.
    await pageCalc.goto(PAGE + '?modele=college');
    await pageCalc.waitForTimeout(1200);
    const sansReseau = await pageCalc.evaluate(() => {
        const a = document.getElementById('nw-attente');
        return { visible: !a.hidden && getComputedStyle(a).display !== 'none', texte: a.innerText };
    });
    r.verifie('sans réseau, la page dit que la calculatrice n\'est pas arrivée',
        sansReseau.visible && /pas arrivée/.test(sansReseau.texte), JSON.stringify(sansReseau));
    await pageCalc.close();

    await page.evaluate(() => { htmlPostits.length = 0; if (typeof renderHtmlPostits === 'function') renderHtmlPostits(); draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
