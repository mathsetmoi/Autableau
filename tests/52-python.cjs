// PYTHON SUR LE TABLEAU.
//
// « On pourrait envisager un compilateur Python inline ? »
// « Je ne veux pas les embarquer hors ligne, ça fait trop gros ; quand on le
// charge, on appelle les CDN. »
//
// Le programme s'exécute DANS la page — le cadre vers un autre site marchait,
// mais le code écrit devant la classe ne partait pas avec la séance, et une
// salle dont le pare-feu bloque ce site-là n'avait plus rien.
//
// CE QUE CETTE SUITE TIENT — et ce qu'elle ne tient pas. Brython n'est pas
// embarqué : aucune de ces vérifications ne le télécharge, et aucune ne juge
// la conformité de son Python. On éprouve ce qui est À NOUS :
//
//   — la fenêtre est un post-it d'un mode de plus, et rien du reste n'a bougé ;
//   — le programme ET sa sortie partent avec le tableau ;
//   — la tabulation indente, le collage ne rogne pas l'indentation, la copie
//     rend le programme et non la note vide qui dort derrière ;
//   — on ne télécharge la bibliothèque standard QUE si le programme importe ;
//   — le moteur n'est demandé qu'une fois, même à deux fenêtres ;
//   — sans réseau, on le DIT, au lieu de laisser une fenêtre qui ne répond pas.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Un moteur de comédie : il ne sait rien de Python, mais il pose les deux
// noms que notre chargeur attend. C'est notre chargement qu'on éprouve, pas
// celui de Brython.
const FAUX_MOTEUR = `
    window.brython = function () { window.__BRYTHON__.lance = true; };
    window.__BRYTHON__ = { builtins: { repr: (e) => String(e) },
                           runPythonSource: function () { throw new Error('moteur de comédie'); } };
`;

// Compte ce que la page va chercher au CDN, et sert ce qu'on veut bien.
async function guetterLeCdn(context, options) {
    const opts = options || {};
    const vues = [];
    await context.route('https://cdn.jsdelivr.net/**', (route) => {
        const url = route.request().url();
        vues.push(url.split('/').pop());
        if (opts.enPanne) return route.abort('failed');
        route.fulfill({ status: 200, contentType: 'application/javascript',
                        body: url.endsWith('brython_stdlib.js') ? '/* bibliothèque */' : FAUX_MOTEUR });
    });
    return vues;
}

module.exports = async function (browser) {
    const r = creerRapport('Python sur le tableau');

    // ==================================================================
    // 1. CE QUI NE DEMANDE NI MOTEUR NI RÉSEAU
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof ouvrirUneFenetrePython === 'function'
            && typeof leCodeImporte === 'function', { timeout: 20000 });
        // Rien ne doit partir au CDN dans ce bloc : on le vérifie à la fin.
        const vues = await guetterLeCdn(context);

        // --- la lecture des « import »
        const lus = await page.evaluate(() => ({
            simple: leCodeImporte('import math\nprint(1)\n'),
            depuis: leCodeImporte('from random import randint\n'),
            indente: leCodeImporte('def f():\n    import math\n    return math.pi\n'),
            aucun: leCodeImporte('for i in range(3):\n    print(i)\n'),
            vide: leCodeImporte(''),
            // Le mot dans une chaîne ou un commentaire ne compte pas comme un
            // import — mais un faux positif ne coûte qu'un téléchargement,
            // alors qu'un faux négatif coûterait une erreur incompréhensible.
            motDansUnTexte: leCodeImporte('print("il faut importer le fichier")\n')
        }));
        r.egal('« import math » demande la bibliothèque', lus.simple, true);
        r.egal('« from random import … » aussi', lus.depuis, true);
        r.egal('un import à l\'intérieur d\'une fonction aussi', lus.indente, true);
        r.egal('une boucle toute simple ne la demande pas', lus.aucun, false);
        r.egal('un programme vide non plus', lus.vide, false);
        r.egal('et le mot « importer » dans une phrase n\'est pas un import',
            lus.motDansUnTexte, false);

        // --- la fenêtre est un post-it d'un mode de plus
        const ouverte = await page.evaluate(() => {
            const f = ouvrirUneFenetrePython({ code: 'print("bonjour")\n' });
            const el = document.querySelector('.html-postit.en-python');
            return {
                mode: f.mode, code: f.code,
                dansLaListe: htmlPostits.some(p => p.id === f.id),
                dom: !!el,
                codeAffiche: el && el.querySelector('.py-code').value,
                noteCachee: el && getComputedStyle(el.querySelector('.html-postit-body')).display,
                cadreWebCache: el && getComputedStyle(el.querySelector('.html-postit-web')).display,
                pythonVu: el && getComputedStyle(el.querySelector('.html-postit-python')).display,
                bouton: el && !!el.querySelector('.py-lancer'),
                // Il se déplace, se réduit, se ferme comme les autres : ce
                // sont les boutons du post-it, non réécrits.
                gestesDuPostit: el && ['.btn-min-postit', '.btn-close-postit', '.btn-ancre-postit']
                    .every(s => !!el.querySelector(s))
            };
        });
        r.egal('la fenêtre s\'ouvre en mode « python », dans la liste des post-its',
            { mode: ouverte.mode, dansLaListe: ouverte.dansLaListe, dom: ouverte.dom },
            { mode: 'python', dansLaListe: true, dom: true });
        r.egal('le programme demandé est posé dans l\'éditeur',
            ouverte.codeAffiche, 'print("bonjour")\n');
        r.egal('la note libre et le cadre web s\'effacent, Python paraît',
            { note: ouverte.noteCachee, web: ouverte.cadreWebCache, py: ouverte.pythonVu },
            { note: 'none', web: 'none', py: 'flex' });
        r.verifie('elle garde les gestes du post-it : réduire, fermer, ancrer',
            ouverte.gestesDuPostit && ouverte.bouton, JSON.stringify(ouverte));

        // --- le programme et sa sortie partent avec le tableau
        const garde = await page.evaluate(() => {
            const f = htmlPostits.find(p => p.mode === 'python');
            f.code = 'x = 1\nif x:\n    print("oui")\n';
            f.sortie = 'oui\n';
            saveState();
            const etat = JSON.stringify(stateForStorage());
            return { code: etat.includes('if x:'), sortie: etat.includes('oui') };
        });
        r.egal('le programme et ce qu\'il a affiché partent avec le tableau',
            garde, { code: true, sortie: true });

        const apresRechargement = await page.evaluate(async () => {
            // Le tour que fait un changement de page, et que ferait une
            // réouverture : on passe par du texte, on vide, on remet.
            const copie = JSON.parse(JSON.stringify(htmlPostits));
            htmlPostits = [];
            renderHtmlPostits();
            const pendant = document.querySelectorAll('.html-postit.en-python').length;
            htmlPostits = copie;
            renderHtmlPostits();
            await new Promise(ok => setTimeout(ok, 150));
            const f = htmlPostits.find(p => p.mode === 'python');
            const el = document.querySelector('.html-postit.en-python');
            return { pendant, retrouve: !!f, code: f && f.code,
                     dansLEditeur: el && el.querySelector('.py-code').value,
                     sortieVue: el && el.querySelector('.py-sortie').textContent };
        });
        r.egal('elle s\'en va avec sa page', apresRechargement.pendant, 0);
        r.verifie('la séance rouverte retrouve le programme dans son éditeur',
            apresRechargement.retrouve
            && apresRechargement.dansLEditeur === 'x = 1\nif x:\n    print("oui")\n',
            JSON.stringify(apresRechargement));
        r.egal('et la sortie est encore là, sans avoir à relancer',
            apresRechargement.sortieVue, 'oui\n');

        // --- la tabulation indente
        const tab = await page.evaluate(async () => {
            const el = document.querySelector('.html-postit.en-python');
            const champ = el.querySelector('.py-code');
            champ.value = 'for i in range(3):\n';
            champ.dispatchEvent(new Event('input'));
            champ.focus();
            champ.selectionStart = champ.selectionEnd = champ.value.length;
            const touche = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            champ.dispatchEvent(touche);
            await new Promise(ok => setTimeout(ok, 50));
            const f = htmlPostits.find(p => p.mode === 'python');
            return { valeur: champ.value, garde: f.code, curseur: champ.selectionStart,
                     // LE GESTE DU NAVIGATEUR EST BIEN REPRIS. Poser quatre
                     // espaces ne suffit pas : sans « preventDefault », la
                     // touche fait AUSSI son office et le curseur part sur le
                     // bouton « Exécuter » — on écrit alors une boucle et l'on
                     // sort du champ au moment de lui donner un corps.
                     repris: touche.defaultPrevented,
                     toujoursDedans: document.activeElement === champ };
        });
        r.verifie('et la touche ne fait plus AUSSI sortir du champ',
            tab.repris, String(tab.repris));
        r.egal('la tabulation pose quatre espaces au lieu de sauter au bouton suivant',
            { v: tab.valeur, c: tab.curseur, dedans: tab.toujoursDedans },
            { v: 'for i in range(3):\n    ', c: 'for i in range(3):\n    '.length, dedans: true });
        r.egal('et l\'indentation est retenue avec le reste', tab.garde, 'for i in range(3):\n    ');

        // --- copier / coller
        const presse = await page.evaluate(async () => {
            const el = document.querySelector('.html-postit.en-python');
            const f = htmlPostits.find(p => p.mode === 'python');
            f.code = 'def f():\n    return 1\n';
            el.querySelector('.py-code').value = f.code;
            let copie = null;
            const vrai = navigator.clipboard && navigator.clipboard.writeText;
            navigator.clipboard.writeText = async (t) => { copie = t; };
            el.querySelector('.btn-copier-postit').click();
            await new Promise(ok => setTimeout(ok, 120));
            if (vrai) navigator.clipboard.writeText = vrai;
            return { copie };
        });
        r.egal('copier rend le PROGRAMME, pas la note vide restée derrière',
            presse.copie, 'def f():\n    return 1\n');

        const colle = await page.evaluate(async () => {
            const el = document.querySelector('.html-postit.en-python');
            const f = htmlPostits.find(p => p.mode === 'python');
            f.code = '';
            el.querySelector('.py-code').value = '';
            const vrai = navigator.clipboard.readText;
            navigator.clipboard.readText = async () => 'for i in range(3):\n    print(i)\n\nprint("fin")\n';
            el.querySelector('.btn-coller-postit').click();
            await new Promise(ok => setTimeout(ok, 150));
            navigator.clipboard.readText = vrai;
            return { code: htmlPostits.find(p => p.mode === 'python').code,
                     champ: el.querySelector('.py-code').value };
        });
        r.verifie('coller garde l\'indentation — sans quoi les boucles perdent leur corps',
            /\n    print\(i\)/.test(colle.code), JSON.stringify(colle.code));
        r.verifie('et garde la ligne vide entre deux blocs',
            /\n\nprint\("fin"\)/.test(colle.code), JSON.stringify(colle.code));
        r.egal('ce qui est collé se voit dans l\'éditeur', colle.champ, colle.code);

        // --- LE REDESSIN D'UNE FENÊTRE DÉJÀ POSÉE
        // Le tableau se redessine à chaque coup de molette, à chaque zoom, au
        // retour d'une annulation. La fenêtre existe alors déjà : c'est le
        // chemin le plus fréquent, et le seul que les vérifications d'ouverture
        // ne touchent pas — elles, elles voient un élément tout neuf.
        const redessin = await page.evaluate(async () => {
            const f = htmlPostits.find(p => p.mode === 'python');
            const el = document.querySelector('.html-postit.en-python');
            const memeElement = el;
            // On lâche le champ : une vérification précédente y a laissé le
            // curseur, et l'on ne réécrit pas sous les doigts de qui tape —
            // c'est justement ce qu'on éprouve deux mesures plus bas.
            el.querySelector('.py-code').blur();
            // Ce qu'une annulation fait : l'objet change, la page se redessine.
            f.code = 'print("après annulation")\n';
            f.sortie = 'après annulation\n';
            renderHtmlPostits();
            await new Promise(ok => setTimeout(ok, 100));
            const apres = document.querySelector('.html-postit.en-python');
            return {
                memeElement: apres === memeElement,
                code: apres && apres.querySelector('.py-code').value,
                sortie: apres && apres.querySelector('.py-sortie').textContent,
                classe: apres && apres.classList.contains('en-python'),
                // Et l'on n'écrase PAS ce qu'on est en train de taper : la
                // fenêtre se redessine pendant qu'on écrit son programme.
                pendantLaFrappe: (() => {
                    const champ = apres.querySelector('.py-code');
                    champ.focus();
                    champ.value = 'je tape encore';
                    f.code = 'venu d’ailleurs';
                    renderHtmlPostits();
                    const garde = champ.value;
                    champ.blur();
                    return garde;
                })()
            };
        });
        r.verifie('une fenêtre déjà posée est bien la même après un redessin',
            redessin.memeElement && redessin.classe, JSON.stringify(redessin));
        r.egal('et son programme et sa sortie suivent l\'objet',
            { c: redessin.code, s: redessin.sortie },
            { c: 'print("après annulation")\n', s: 'après annulation\n' });
        r.egal('mais on n\'écrase pas le champ sous les doigts de qui écrit',
            redessin.pendantLaFrappe, 'je tape encore');

        // OUVRIR UNE FENÊTRE PRÉCHAUFFE LE MOTEUR, et lui seul : le temps
        // d'écrire trois lignes il est là, et le premier « Exécuter » ne fait
        // pas patienter la classe. Mais les 4,8 Mo de bibliothèque attendent
        // qu'un programme écrive « import » — c'est tout l'objet du partage.
        r.egal('ouvrir la fenêtre préchauffe le moteur, et jamais la bibliothèque',
            vues.filter((v, i) => vues.indexOf(v) === i), ['brython.min.js']);
        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 2. LE CHARGEMENT À LA DEMANDE
    // « Je ne veux pas les embarquer hors ligne, ça fait trop gros. »
    // Le moteur seul fait 1,3 Mo ; la bibliothèque 4,8 de plus. Un cours
    // sans import n'a aucune raison de payer les 4,8.
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof preparerPython === 'function', { timeout: 20000 });
        const vues = await guetterLeCdn(context);

        await page.evaluate(() => preparerPython(false));
        await page.waitForFunction(() => typeof window.brython === 'function', { timeout: 20000 });
        r.egal('sans import, on ne télécharge que le moteur',
            vues.slice(), ['brython.min.js']);

        await page.evaluate(() => preparerPython(false));
        await page.waitForTimeout(200);
        r.egal('et on ne le retélécharge pas à la fenêtre suivante',
            vues.slice(), ['brython.min.js']);

        await page.evaluate(() => preparerPython(true));
        await page.waitForTimeout(400);
        r.egal('un programme qui importe fait venir la bibliothèque, et elle seule',
            vues.slice(), ['brython.min.js', 'brython_stdlib.js']);

        await page.evaluate(() => preparerPython(true));
        await page.evaluate(() => preparerPython(false));
        await page.waitForTimeout(300);
        r.egal('une fois là, plus rien n\'est redemandé',
            vues.slice(), ['brython.min.js', 'brython_stdlib.js']);

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 2 bis. C'EST « EXÉCUTER » QUI DÉCIDE, en lisant le programme.
    // Les vérifications précédentes appelaient le chargeur à la main et
    // disaient donc seulement qu'il obéit. Ici on part d'un PROGRAMME, ce
    // qui est le vrai chemin : c'est la lecture du code qui doit épargner
    // les 4,8 Mo, et non une consigne écrite dans le test.
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof executerDuPython === 'function', { timeout: 20000 });
        const vues = await guetterLeCdn(context);

        await page.evaluate(() => executerDuPython('for i in range(3):\n    print(i)\n'));
        await page.waitForTimeout(300);
        r.egal('un programme sans import ne fait venir que le moteur',
            vues.slice(), ['brython.min.js']);

        await page.evaluate(() => executerDuPython('x = 2\nprint(x * 21)\n'));
        await page.waitForTimeout(300);
        r.egal('un deuxième non plus', vues.slice(), ['brython.min.js']);

        await page.evaluate(() => executerDuPython('import math\nprint(math.pi)\n'));
        await page.waitForTimeout(400);
        r.egal('le premier « import » fait venir la bibliothèque, et seulement lui',
            vues.slice(), ['brython.min.js', 'brython_stdlib.js']);

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ==================================================================
    // 3. SANS RÉSEAU, ON LE DIT
    // C'est le seul morceau de l'application qui demande une connexion.
    // Une fenêtre qui ne répond pas passerait pour une panne ; une phrase
    // qui l'explique est une information.
    // ==================================================================
    {
        const { context, page, erreurs } = await ouvrirApp(browser);
        await page.waitForFunction(() => typeof executerDuPython === 'function', { timeout: 20000 });
        await guetterLeCdn(context, { enPanne: true });

        const rate = await page.evaluate(() => executerDuPython('print(1)\n'));
        r.egal('le moteur injoignable ne lève pas d\'exception : il se déclare',
            { reseau: rate.reseau, erreur: rate.erreur }, { reseau: true, erreur: null });

        const dit = await page.evaluate(async () => {
            ouvrirUneFenetrePython({ code: 'print(1)\n' });
            await new Promise(ok => setTimeout(ok, 300));
            const el = document.querySelector('.html-postit.en-python');
            el.querySelector('.py-lancer').click();
            await new Promise(ok => setTimeout(ok, 900));
            const sortie = el.querySelector('.py-sortie');
            return { texte: sortie.textContent, rouge: sortie.classList.contains('py-rate'),
                     boutonRendu: !el.querySelector('.py-lancer').disabled,
                     etat: el.querySelector('.py-etat').textContent,
                     garde: (htmlPostits.find(p => p.mode === 'python') || {}).sortie };
        });
        r.verifie('la fenêtre dit que Python n\'a pas pu être chargé',
            /pas pu être chargé/i.test(dit.texte), JSON.stringify(dit.texte));
        r.verifie('elle dit aussi que c\'est la seule fenêtre qui demande une connexion',
            /connexion/i.test(dit.texte), JSON.stringify(dit.texte));
        // UN ÉCHEC SE VOIT SANS LE LIRE. La classe seule ne prouve rien : ce
        // qu'on veut, c'est que la couleur change VRAIMENT — c'est ce qu'on
        // cherche des yeux quand un programme ne fait pas ce qu'on annonçait.
        const couleurs = await page.evaluate(() => {
            const s = document.querySelector('.html-postit.en-python .py-sortie');
            const rate = getComputedStyle(s).color;
            s.classList.remove('py-rate');
            const normale = getComputedStyle(s).color;
            s.classList.add('py-rate');
            return { rate, normale };
        });
        r.verifie('le message se voit comme un échec, et pas seulement par sa classe',
            dit.rouge && couleurs.rate !== couleurs.normale, JSON.stringify(couleurs));
        r.verifie('et le bouton est rendu : on peut réessayer quand le réseau revient',
            dit.boutonRendu && dit.etat === '', JSON.stringify(dit));

        // Le réseau revient : on ne reste pas condamné pour la séance.
        await context.unroute('https://cdn.jsdelivr.net/**');
        const vues = await guetterLeCdn(context);
        await page.evaluate(() => preparerPython(false));
        await page.waitForFunction(() => typeof window.brython === 'function', { timeout: 20000 });
        r.egal('le réseau revenu, le moteur se redemande', vues.slice(), ['brython.min.js']);

        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    return r.bilan();
};
