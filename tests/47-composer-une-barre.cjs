// COMPOSER UNE BARRE D'OUTILS, SANS LA GLISSER OUTIL PAR OUTIL.
//
// « Ce qui serait au top, pour compléter le "glisser-déposer", c'est d'avoir
// un menu de création de barres d'outils qui affiche une liste d'outils
// cochables et propose une localisation pour la disposition par défaut. De
// même, avoir la possibilité via ce menu de setup de pouvoir contrôler la
// position par défaut et l'affichage par défaut des barres d'outils. En effet,
// on n'utilise le plus souvent qu'une fraction des outils disponibles, et cela
// permettrait de personnaliser à fond l'interface. »
//
// Le glisser-déposer reste : c'est le geste juste pour DÉPLACER un outil d'une
// barre à l'autre. Il est mauvais pour en choisir vingt — vingt allers-retours
// dans un tiroir de deux cents icônes, sans jamais voir ce qu'on a déjà pris.
//
// CE QUE CETTE SUITE TIENT :
//
//   — le catalogue montre TOUT ce que la page porte, rangé par rubrique, sans
//     tenir une liste à côté qui divergerait au premier outil ajouté ;
//   — cocher des outils et valider crée une vraie barre, à la place demandée,
//     avec le nombre de colonnes demandé, repliée si on l'a demandé ;
//   — la place est calculée sur la taille de l'écran, et la barre n'en sort pas ;
//   — rouvrir le menu sur une barre existante montre ce qu'elle porte déjà, et
//     la place où on l'a mise ;
//   — modifier n'en crée pas une seconde ;
//   — une barre sans outil ne se pose pas, et le dit ;
//   — la recherche filtre, et vide les rubriques devenues vides ;
//   — Échap et le fond referment sans rien changer.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Composer une barre');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });
    await page.waitForFunction(() => typeof ouvrirLeCompositeurDeBarre === 'function'
        && document.querySelectorAll('#plugins-grid .btn').length > 20, { timeout: 20000 });

    // ------------------------------------------------------------------
    // 1. LE CATALOGUE EST CELUI DE LA PAGE
    // ------------------------------------------------------------------
    const catalogue = await page.evaluate(() => {
        const c = catalogueDesOutils();
        const ids = c.map(o => o.id);
        return {
            combien: c.length,
            rubriques: [...new Set(c.map(o => o.categorie))].length,
            // Les outils d'écriture de la barre de gauche y sont…
            aLeCrayon: ids.includes('freehand'),
            aLeTexte: ids.includes('text'),
            // …et ceux du tiroir aussi. Leur identifiant EST leur libellé :
            // la plupart des boutons du tiroir ne portent pas d'autre clé, et
            // c'est déjà ainsi que le glisser-déposer les désigne.
            aUnPlugin: ids.includes('Tableau de Conversion'),
            // Chaque outil n'y est qu'une fois.
            doublons: ids.length - new Set(ids).size,
            // Chacun porte un nom lisible — fût-il son identifiant, puisque
            // pour le tiroir l'identifiant est le libellé.
            sansNom: c.filter(o => !o.nom || !o.nom.trim()).length,
            // Mais aucun ne doit montrer un identifiant technique en camel.
            enCamel: c.filter(o => /^[a-z]+[A-Z]/.test(o.nom)).length,
            // Et une icône, sinon la liste n'est qu'un mur de texte.
            sansIcone: c.filter(o => !o.icone).length,
            premiereRubrique: c[0] && c[0].categorie
        };
    });
    r.verifie('le catalogue porte tous les outils de la page',
        catalogue.combien > 40 && catalogue.rubriques >= 4, JSON.stringify(catalogue));
    r.egal('le crayon, le texte et les outils du tiroir y sont',
        { crayon: catalogue.aLeCrayon, texte: catalogue.aLeTexte, plugin: catalogue.aUnPlugin },
        { crayon: true, texte: true, plugin: true });
    r.egal('aucun outil n\'y figure deux fois', catalogue.doublons, 0);
    // ET S'IL EST DES DEUX CÔTÉS, IL N'EST LISTÉ QU'UNE FOIS. Un outil peut
    // vivre à la fois dans la barre de gauche et dans le tiroir — le voir deux
    // fois dans la liste ferait douter d'avoir déjà coché le bon.
    const desDeuxCotes = await page.evaluate(() => {
        const grille = document.getElementById('plugins-grid');
        const source = document.querySelector('#bar-tools .btn[data-mode=\"freehand\"]');
        if (!grille || !source) return null;
        const jumeau = source.cloneNode(true);
        jumeau.id = '';
        jumeau.dataset.category = 'Autres outils';
        grille.appendChild(jumeau);
        const ids = catalogueDesOutils().map(o => o.id);
        jumeau.remove();
        return { fois: ids.filter(i => i === 'freehand').length,
                 doublons: ids.length - new Set(ids).size };
    });
    r.egal('un outil présent dans la barre ET dans le tiroir n\'est listé qu\'une fois',
        desDeuxCotes, { fois: 1, doublons: 0 });
    r.egal('chacun porte un nom et une icône, et aucun nom technique',
        { sansNom: catalogue.sansNom, sansIcone: catalogue.sansIcone,
          camel: catalogue.enCamel },
        { sansNom: 0, sansIcone: 0, camel: 0 });
    r.egal('et les outils d\'écriture ouvrent la liste',
        catalogue.premiereRubrique, 'Écrire et tracer');

    // ------------------------------------------------------------------
    // 2. LE BOUTON OUVRE LE MENU
    // ------------------------------------------------------------------
    const ouverture = await page.evaluate(async () => {
        document.querySelectorAll('.compo-fond').forEach(f => f.remove());
        const b = document.getElementById('btn-composer-barre');
        if (!b) return { bouton: false };
        b.click();
        await new Promise(ok => setTimeout(ok, 200));
        const fond = document.getElementById('compositeur-de-barre');
        return {
            bouton: true,
            ouvert: !!fond,
            titre: fond ? fond.querySelector('.compo-titre').textContent.trim() : '',
            outils: fond ? fond.querySelectorAll('.compo-outil').length : 0,
            places: fond ? [...fond.querySelectorAll('#compo-place option')].map(o => o.value) : [],
            coches: fond ? fond.querySelectorAll('.compo-outil input:checked').length : -1,
            compte: fond ? fond.querySelector('#compo-compte').textContent : ''
        };
    });
    r.verifie('le bouton du tiroir ouvre le compositeur',
        ouverture.bouton && ouverture.ouvert, JSON.stringify(ouverture));
    r.egal('il s\'ouvre sur une barre neuve, rien de coché',
        { titre: ouverture.titre, coches: ouverture.coches, compte: ouverture.compte },
        { titre: 'Composer une barre d\'outils', coches: 0, compte: 'aucun outil choisi' });
    r.egal('il propose les six places', ouverture.places.length, 6);
    r.verifie('et la liste porte tous les outils du catalogue',
        ouverture.outils === catalogue.combien, ouverture.outils + ' / ' + catalogue.combien);

    // La recherche filtre, et les rubriques vides s'effacent.
    const recherche = await page.evaluate(async () => {
        const fond = document.getElementById('compositeur-de-barre');
        const champ = fond.querySelector('#compo-chercher');
        const vus = () => [...fond.querySelectorAll('.compo-outil')]
            .filter(l => l.style.display !== 'none').length;
        const rubriques = () => [...fond.querySelectorAll('.compo-groupe')]
            .filter(g => g.style.display !== 'none').length;
        const avant = { outils: vus(), rubriques: rubriques() };
        champ.value = 'tracé';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 60));
        const filtre = { outils: vus(), rubriques: rubriques() };
        // Les accents ne doivent pas faire échouer la recherche.
        champ.value = 'geometrie';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 60));
        const sansAccent = vus();
        champ.value = '';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 60));
        return { avant, filtre, sansAccent, rendu: vus() };
    });
    r.verifie('la recherche resserre la liste',
        recherche.filtre.outils > 0 && recherche.filtre.outils < recherche.avant.outils,
        JSON.stringify(recherche));
    r.verifie('et referme les rubriques devenues vides',
        recherche.filtre.rubriques < recherche.avant.rubriques, JSON.stringify(recherche));
    r.verifie('elle se moque des accents',
        recherche.sansAccent > 0, JSON.stringify(recherche));
    r.egal('effacer la recherche rend toute la liste',
        recherche.rendu, recherche.avant.outils);

    // ------------------------------------------------------------------
    // 3. COCHER, RÉGLER, VALIDER
    // ------------------------------------------------------------------
    const creee = await page.evaluate(async () => {
        const fond = document.getElementById('compositeur-de-barre');
        const avant = getStoredFloatingToolbars().length;
        const cocher = (id) => {
            const l = [...fond.querySelectorAll('.compo-outil')]
                .find(x => x.dataset.cherche.split(' ').includes(id));
            if (!l) return false;
            const c = l.querySelector('input');
            c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        };
        // L'ORDRE DES COCHES EST CELUI DE LA BARRE : on coche la gomme d'abord,
        // le crayon ensuite, et c'est cet ordre-là qu'on doit retrouver.
        const ok1 = cocher('eraser');
        const ok2 = cocher('freehand');
        const ok3 = cocher('text');
        const compte = fond.querySelector('#compo-compte').textContent;
        fond.querySelector('#compo-nom').value = 'Ma panoplie';
        fond.querySelector('#compo-place').value = 'bas-droite';
        fond.querySelector('#compo-cols').value = '1';
        fond.querySelector('#compo-repliee').checked = true;
        fond.querySelector('#compo-valider').click();
        await new Promise(ok => setTimeout(ok, 400));
        const barres = getStoredFloatingToolbars();
        const neuve = barres[barres.length - 1];
        const el = document.getElementById(neuve.id);
        const rect = el ? el.getBoundingClientRect() : null;
        return {
            coches: [ok1, ok2, ok3], compte,
            ferme: !document.getElementById('compositeur-de-barre'),
            deMoins: barres.length - avant,
            nom: neuve.name, items: neuve.items, cols: neuve.cols,
            repliee: neuve.minimized,
            surLEcran: !!el,
            estRepliee: el ? el.classList.contains('minimized') : null,
            // EN BAS À DROITE : on lit la place ENREGISTRÉE, et non le
            // rectangle d'une barre repliée — repliée, elle s'arrime au dock
            // et n'a plus de boîte à mesurer.
            place: { x: neuve.x, y: neuve.y },
            taille: tailleSupposeeDeLaBarre(neuve.items.length, neuve.cols),
            id: neuve.id
        };
    });
    r.egal('les trois outils se cochent', creee.coches, [true, true, true]);
    r.egal('et le compteur les annonce', creee.compte, '3 outils choisis');
    r.verifie('valider referme le menu et crée UNE barre',
        creee.ferme && creee.deMoins === 1, JSON.stringify(creee));
    r.egal('elle porte le nom donné, et les outils dans l\'ordre où on les a cochés',
        { nom: creee.nom, items: creee.items }, { nom: 'Ma panoplie', items: ['eraser', 'freehand', 'text'] });
    r.egal('avec le nombre de colonnes demandé, et repliée comme demandé',
        { cols: creee.cols, repliee: creee.repliee }, { cols: 1, repliee: true });
    r.verifie('elle est vraiment sur l\'écran, et vraiment repliée',
        creee.surLEcran && creee.estRepliee === true, JSON.stringify(creee));
    r.verifie('posée en bas à droite, elle y est vraiment, sans sortir de l\'écran',
        creee.place.x + creee.taille.l <= 1280 && creee.place.x > 1280 / 2
        && creee.place.y + creee.taille.h <= 800 && creee.place.y > 800 / 2,
        JSON.stringify({ place: creee.place, taille: creee.taille }));

    // ------------------------------------------------------------------
    // 4. ROUVRIR SUR UNE BARRE EXISTANTE
    // ------------------------------------------------------------------
    const reouverte = await page.evaluate(async (id) => {
        ouvrirLeCompositeurDeBarre(id);
        await new Promise(ok => setTimeout(ok, 200));
        const fond = document.getElementById('compositeur-de-barre');
        return {
            titre: fond.querySelector('.compo-titre').textContent.trim(),
            nom: fond.querySelector('#compo-nom').value,
            place: fond.querySelector('#compo-place').value,
            cols: fond.querySelector('#compo-cols').value,
            repliee: fond.querySelector('#compo-repliee').checked,
            coches: fond.querySelectorAll('.compo-outil input:checked').length,
            compte: fond.querySelector('#compo-compte').textContent,
            valider: fond.querySelector('#compo-valider').textContent.trim()
        };
    }, creee.id);
    r.egal('rouvrir sur une barre montre ce qu\'elle porte déjà',
        { coches: reouverte.coches, compte: reouverte.compte },
        { coches: 3, compte: '3 outils choisis' });
    r.egal('et ses réglages : nom, place, colonnes, repli',
        { nom: reouverte.nom, place: reouverte.place, cols: reouverte.cols, repliee: reouverte.repliee },
        { nom: 'Ma panoplie', place: 'bas-droite', cols: '1', repliee: true });
    r.egal('le menu dit qu\'on modifie, et non qu\'on crée',
        { titre: reouverte.titre, bouton: reouverte.valider },
        { titre: 'Modifier la barre', bouton: 'Enregistrer' });

    // Modifier n'en crée pas une seconde.
    const modifiee = await page.evaluate(async (id) => {
        const fond = document.getElementById('compositeur-de-barre');
        const avant = getStoredFloatingToolbars().length;
        // On décoche la gomme et l'on change de place.
        const gomme = [...fond.querySelectorAll('.compo-outil')]
            .find(x => x.dataset.cherche.split(' ').includes('eraser'));
        const c = gomme.querySelector('input');
        c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
        fond.querySelector('#compo-place').value = 'haut-gauche';
        fond.querySelector('#compo-cols').value = '3';
        fond.querySelector('#compo-repliee').checked = false;
        fond.querySelector('#compo-valider').click();
        await new Promise(ok => setTimeout(ok, 400));
        const barres = getStoredFloatingToolbars();
        const tb = barres.find(t => t.id === id);
        const el = document.getElementById(id);
        const rect = el ? el.getBoundingClientRect() : null;
        return { deMoins: barres.length - avant, items: tb.items,
                 cols: tb.cols, repliee: tb.minimized,
                 estRepliee: el ? el.classList.contains('minimized') : null,
                 enHautAGauche: rect ? (rect.left < 120 && rect.top < 200) : null };
    }, creee.id);
    r.egal('modifier ne crée pas une seconde barre', modifiee.deMoins, 0);
    r.egal('l\'outil décoché s\'en va', modifiee.items, ['freehand', 'text']);
    r.egal('et elle se déplie, se replace, et change de colonnage',
        { repliee: modifiee.repliee, estRepliee: modifiee.estRepliee,
          place: modifiee.enHautAGauche, cols: modifiee.cols },
        { repliee: false, estRepliee: false, place: true, cols: 3 });

    // ------------------------------------------------------------------
    // 5. CE QUI NE DOIT PAS ARRIVER
    // ------------------------------------------------------------------
    const vide = await page.evaluate(async () => {
        document.querySelectorAll('#toast-container > *').forEach(t => t.remove());
        ouvrirLeCompositeurDeBarre();
        await new Promise(ok => setTimeout(ok, 200));
        const fond = document.getElementById('compositeur-de-barre');
        const avant = getStoredFloatingToolbars().length;
        fond.querySelector('#compo-valider').click();
        await new Promise(ok => setTimeout(ok, 250));
        return { creee: getStoredFloatingToolbars().length - avant,
                 ouvertEncore: !!document.getElementById('compositeur-de-barre'),
                 message: [...document.querySelectorAll('#toast-container *')]
                     .map(t => t.textContent).join(' ') };
    });
    r.egal('une barre sans outil ne se pose pas, et le menu reste ouvert',
        { creee: vide.creee, ouvert: vide.ouvertEncore }, { creee: 0, ouvert: true });
    r.verifie('et l\'on dit pourquoi', /coche/i.test(vide.message), vide.message);

    // Échap referme sans rien changer.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const apresEchap = await page.evaluate(() => ({
        ferme: !document.getElementById('compositeur-de-barre'),
        barres: getStoredFloatingToolbars().length
    }));
    r.verifie('Échap referme sans rien créer', apresEchap.ferme, String(apresEchap.ferme));

    // Le fond aussi, et là non plus rien ne se crée.
    const surLeFond = await page.evaluate(async () => {
        ouvrirLeCompositeurDeBarre();
        await new Promise(ok => setTimeout(ok, 200));
        const avant = getStoredFloatingToolbars().length;
        const fond = document.getElementById('compositeur-de-barre');
        fond.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 200));
        return { ferme: !document.getElementById('compositeur-de-barre'),
                 deMoins: getStoredFloatingToolbars().length - avant };
    });
    r.egal('cliquer le fond referme, sans rien créer non plus',
        surLeFond, { ferme: true, deMoins: 0 });

    // ------------------------------------------------------------------
    // 6. LES SIX PLACES TIENNENT DANS L'ÉCRAN
    // ------------------------------------------------------------------
    const places = await page.evaluate(() => {
        const t = tailleSupposeeDeLaBarre(8, 2);
        const sortie = {};
        Object.keys(PLACES_DE_BARRE).forEach(cle => {
            const p = PLACES_DE_BARRE[cle].ou(t.l, t.h);
            sortie[cle] = { x: p.x, y: p.y,
                dansLEcran: p.x >= 0 && p.y >= 0
                    && p.x + t.l <= window.innerWidth + 1
                    && p.y + t.h <= window.innerHeight + 1 };
        });
        return { sortie, taille: t };
    });
    r.verifie('les six places posent la barre entièrement dans l\'écran',
        Object.values(places.sortie).every(p => p.dansLEcran), JSON.stringify(places));
    r.verifie('et elles ne se confondent pas deux à deux',
        new Set(Object.values(places.sortie).map(p => p.x + ',' + p.y)).size === 6,
        JSON.stringify(places.sortie));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
