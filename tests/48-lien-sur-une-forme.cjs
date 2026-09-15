// UN LIEN SUR UNE FORME, ET PAS SEULEMENT SUR UNE ADRESSE ÉCRITE.
//
// « L'outil Texte ne permet pas de créer des liens cliquables. Pouvoir insérer
// un lien sur un texte ou sur une forme, ça pourrait être sympa. »
//
// Une adresse TAPÉE dans un bloc se cliquait déjà — c'est la suite 28. Mais au
// tableau, ce qu'on désigne pour dire « allez voir là », c'est une vignette :
// la capture d'écran du site, le tampon de l'exercice, le rectangle tracé
// autour d'un mot. Ceux-là ne menaient nulle part, et rien ne disait qu'ils
// auraient pu.
//
// CE QUE CETTE SUITE TIENT :
//
//   — n'importe quel objet porte une adresse, et le clic l'ouvre ;
//   — la règle du web est la même que pour le texte : rien d'autre que
//     http(s) — un tableau se partage par un fichier, et « javascript: »
//     s'exécuterait chez le collègue qui clique ;
//   — un champ vide retire le lien, et annuler ne touche à rien ;
//   — glisser un objet qui porte un lien ne l'ouvre pas ;
//   — une forme qui porte un lien le DIT : une chaîne à son coin ;
//   — une adresse écrite passe avant la forme qui la recouvre ;
//   — le bouton ne paraît que sur un objet seul, et dit l'adresse posée ;
//   — le lien part avec le tableau.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Un lien sur une forme');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });
    await page.waitForFunction(() => typeof poserUnLienSurLObjet === 'function', { timeout: 20000 });

    // LA QUESTION SE POSE DANS LA FENÊTRE DE L'APPLICATION, pas dans celle du
    // navigateur : « les boîtes du navigateur n'ont ni notre habillage, ni le
    // mode nuit, et sur vidéoprojecteur elles s'affichent avec l'adresse du
    // site en gros ». On y répond donc comme un enseignant : on tape dans le
    // champ, et l'on clique « Valider » — ou « Annuler ».
    const repondre = (valeur) => page.evaluate(async (v) => {
        const boite = document.getElementById('custom-prompt-modal');
        const champ = document.querySelector('#custom-prompt-inputs input[type="text"]');
        if (!boite || !champ) throw new Error('la fenêtre de l\'application ne s\'est pas ouverte');
        window.__pose = { titre: document.getElementById('custom-prompt-title').textContent,
                          libelle: document.querySelector('#custom-prompt-inputs label').innerText,
                          propose: champ.value };
        if (v === null) {
            document.getElementById('custom-prompt-cancel').click();
        } else {
            champ.value = v;
            champ.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('custom-prompt-ok').click();
        }
        await new Promise(ok => setTimeout(ok, 150));
        return window.__pose;
    }, valeur);

    const poserUnRectangle = () => page.evaluate(() => {
        points.length = 0; rectangles.length = 0; images.length = 0; texts.length = 0;
        freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        const p1 = { id: nextId++, x: 200, y: 200 };
        const p2 = { id: nextId++, x: 500, y: 400 };
        points.push(p1, p2);
        const rect = { id: nextId++, p1_id: p1.id, p2_id: p2.id, z: globalZ++,
                       strokeColor: '#2d3436', lineWidth: 3 };
        rectangles.push(rect);
        selectedItems = [{ type: 'rectangle', id: rect.id }];
        setMode('pointer');
        updateQuickMenu(); draw();
        return rect.id;
    });

    // ------------------------------------------------------------------
    // 1. POSER UNE ADRESSE SUR UNE FORME
    // ------------------------------------------------------------------
    const id = await poserUnRectangle();
    const ouverte = await page.evaluate((id) => ({
        fait: poserUnLienSurLObjet({ type: 'rectangle', id }),
        boite: getComputedStyle(document.getElementById('custom-prompt-modal')).display
    }), id);
    const questionnee = await repondre('https://www.geogebra.org/calculator');
    const pose = await page.evaluate((id) => getObjectById('rectangle', id).lien, id);
    r.egal('poser un lien ouvre la fenêtre de l\'application, pas celle du navigateur',
        { fait: ouverte.fait, boite: ouverte.boite }, { fait: true, boite: 'flex' });
    r.egal('elle dit ce qu\'elle demande, et part d\'une adresse vide la première fois',
        { titre: questionnee.titre, propose: questionnee.propose },
        { titre: 'Poser un lien sur cet objet', propose: 'https://' });
    r.verifie('et le libellé dit qu\'un champ vide retire le lien',
        /vide *: *retirer/i.test(questionnee.libelle), questionnee.libelle);
    r.egal('une forme accepte une adresse', pose, 'https://www.geogebra.org/calculator');

    // Le clic dessus l'ouvre — on remplace « window.open » pour le voir sans
    // ouvrir d'onglet.
    const clic = await page.evaluate(async () => {
        window.__ouverts = [];
        window.open = (u) => { window.__ouverts.push(u); return null; };
        const cv = document.getElementById('board');
        const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
            clientX: x, clientY: y, bubbles: true, cancelable: true,
            pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 }));
        // Au milieu du rectangle.
        ev('pointerdown', 350, 300);
        ev('pointerup', 350, 300);
        await new Promise(ok => setTimeout(ok, 120));
        return window.__ouverts;
    });
    r.egal('un clic dessus ouvre l\'adresse',
        clic, ['https://www.geogebra.org/calculator']);

    // Le curseur le dit AVANT le clic : sans cela, rien ne signale qu'il y a
    // quelque chose à cliquer.
    const curseur = await page.evaluate(() => {
        const dedans = nImporteQuelLienSousLePoint({ x: 350, y: 300 });
        const dehors = nImporteQuelLienSousLePoint({ x: 900, y: 700 });
        return { dedans: !!dedans, url: dedans && dedans.url, dehors: !!dehors };
    });
    r.egal('le lien se trouve sous le point, et nulle part ailleurs',
        { dedans: curseur.dedans, url: curseur.url, dehors: curseur.dehors },
        { dedans: true, url: 'https://www.geogebra.org/calculator', dehors: false });

    // ------------------------------------------------------------------
    // 2. GLISSER N'OUVRE PAS
    // « Ouvrir ne doit pas voler le glisser » : on doit pouvoir déplacer un
    // objet qui porte une adresse.
    // ------------------------------------------------------------------
    const glisse = await page.evaluate(async () => {
        window.__ouverts = [];
        const cv = document.getElementById('board');
        const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
            clientX: x, clientY: y, bubbles: true, cancelable: true,
            pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 }));
        ev('pointerdown', 350, 300);
        ev('pointermove', 380, 330);
        ev('pointerup', 380, 330);
        await new Promise(ok => setTimeout(ok, 120));
        return window.__ouverts.length;
    });
    r.egal('glisser l\'objet ne l\'ouvre pas', glisse, 0);

    // ------------------------------------------------------------------
    // 3. CE QUI N'EST PAS UNE ADRESSE DU WEB EST REFUSÉ
    // Un tableau se partage entre collègues par un fichier : une adresse
    // « javascript: » s'exécuterait chez celui qui clique.
    // ------------------------------------------------------------------
    await page.evaluate((id) => {
        document.querySelectorAll('#toast-container > *').forEach(t => t.remove());
        poserUnLienSurLObjet({ type: 'rectangle', id });
    }, id);
    const questionRechange = await repondre('javascript:alert(1)');
    const refuse = await page.evaluate((id) => ({
        apres: getObjectById('rectangle', id).lien,
        message: [...document.querySelectorAll('#toast-container *')]
            .map(t => t.textContent).join(' ')
    }), id);
    r.egal('une adresse « javascript: » est refusée, et le lien d\'avant reste',
        refuse.apres, 'https://www.geogebra.org/calculator');
    r.verifie('et l\'on dit ce qu\'on attend', /https/.test(refuse.message), refuse.message);
    r.egal('rouvrir sur un objet qui porte déjà un lien le rappelle, et le dit',
        { titre: questionRechange.titre, propose: questionRechange.propose },
        { titre: 'Changer le lien de cet objet', propose: 'https://www.geogebra.org/calculator' });

    // Annuler la demande ne touche à rien.
    await page.evaluate((id) => poserUnLienSurLObjet({ type: 'rectangle', id }), id);
    await repondre(null);
    const annule = await page.evaluate((id) => ({
        lien: getObjectById('rectangle', id).lien,
        boite: getComputedStyle(document.getElementById('custom-prompt-modal')).display
    }), id);
    r.egal('annuler la demande referme la fenêtre sans rien changer',
        annule, { lien: 'https://www.geogebra.org/calculator', boite: 'none' });

    // Un champ vide retire le lien.
    await page.evaluate((id) => poserUnLienSurLObjet({ type: 'rectangle', id }), id);
    await repondre('   ');
    const retire = await page.evaluate((id) => {
        const o = getObjectById('rectangle', id);
        return { aUnLien: 'lien' in o,
                 sousLePoint: !!nImporteQuelLienSousLePoint({ x: 350, y: 300 }) };
    }, id);
    r.egal('un champ vide retire le lien, pour de bon',
        retire, { aUnLien: false, sousLePoint: false });

    // ET CE QU'ON RÉPOND SE JUGE À PART. La fenêtre est une fenêtre ; ce
    // qu'on fait de la réponse s'éprouve sans attendre personne.
    const reponses = await page.evaluate((id) => {
        const p = (v) => appliquerLeLienSurLObjet({ type: 'rectangle', id }, v);
        const lire = () => getObjectById('rectangle', id).lien;
        return {
            // RENONCER S'ÉPROUVE SUR UN OBJET QUI PORTE DÉJÀ UNE ADRESSE :
            // sur un objet nu, ne rien faire et tout effacer se ressemblent,
            // et le test ne verrait pas la différence.
            videSansLien: [p(''), lire()],
            pose: [p('https://eduscol.education.fr'), lire()],
            renonce: [p(null), lire()],
            renonceAussi: [p(undefined), lire()],
            espaces: [p('  https://Exemple.fr/Truc  '), lire()],
            refusee: [p('ftp://exemple.fr/x'), lire()],
            retiree: [p('   '), lire()]
        };
    }, id);
    r.egal('un champ vide sur un objet sans lien ne fait rien',
        reponses.videSansLien, [false, undefined]);
    r.egal('une adresse valable se pose',
        reponses.pose, [true, 'https://eduscol.education.fr']);
    r.egal('renoncer laisse l\'adresse en place — et ne l\'efface surtout pas',
        [reponses.renonce, reponses.renonceAussi],
        [[false, 'https://eduscol.education.fr'], [false, 'https://eduscol.education.fr']]);
    // LES ESPACES PARTENT, LA CASSE RESTE. Un chemin d'adresse distingue les
    // majuscules — « /Truc » et « /truc » ne sont pas la même page —, et l'on
    // ne récrit donc pas ce que l'enseignant a collé.
    r.egal('les espaces autour ne gênent pas, et la casse est gardée telle quelle',
        reponses.espaces, [true, 'https://Exemple.fr/Truc']);
    r.egal('« ftp:// » n\'est pas le web : refusé, et le lien d\'avant reste',
        reponses.refusee, [false, 'https://Exemple.fr/Truc']);
    r.egal('et un champ vide le retire', reponses.retiree, [true, undefined]);

    // ------------------------------------------------------------------
    // 4. LA MARQUE : UNE FORME QUI PORTE UN LIEN LE DIT
    // ------------------------------------------------------------------
    // ON COMPTE LES PIXELS BLEUS AUTOUR DU COIN, plutôt que d'en lire un
    // seul : la pastille est petite, le canevas peut être à l'échelle du
    // matériel, et viser un pixel précis c'est mesurer sa propre arithmétique.
    const marque = await page.evaluate((id) => {
        const o = getObjectById('rectangle', id);
        // Le coin haut droit du rectangle est en (500, 200) sur le tableau.
        const ech = (canvas.width / canvas.clientWidth) || 1;
        const px = Math.round((panX + 500 * zoom) * ech);
        const py = Math.round((panY + 200 * zoom) * ech);
        const cote = Math.round(44 * ech);
        const bleus = () => {
            const d = ctx.getImageData(Math.max(0, px - cote), Math.max(0, py - cote / 4),
                cote, cote).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - 9) < 24 && Math.abs(d[i + 1] - 132) < 24
                    && Math.abs(d[i + 2] - 227) < 24) n++;
            }
            return n;
        };
        delete o.lien; draw();
        const sansLien = bleus();
        o.lien = 'https://exemple.fr/';
        draw();
        const avecLien = bleus();
        const combien = dessinerLesMarquesDeLien(ctx, 1);
        return { sansLien, avecLien, combien, ech };
    }, id);
    r.egal('sans lien, le coin de la forme est nu', marque.sansLien, 0);
    r.verifie('avec un lien, une pastille bleue s\'y pose',
        marque.avecLien > 40, JSON.stringify(marque));
    r.egal('et l\'on n\'en pose qu\'une, pour le seul objet qui porte une adresse',
        marque.combien, 1);

    // L'export est une image : rien ne s'y clique, la marque n'a rien à y faire.
    const exportSansMarque = await page.evaluate(() => {
        const ech = (canvas.width / canvas.clientWidth) || 1;
        const px = Math.round((panX + 500 * zoom) * ech);
        const py = Math.round((panY + 200 * zoom) * ech);
        const cote = Math.round(44 * ech);
        isExportingTransparent = true;
        draw();
        const d = ctx.getImageData(Math.max(0, px - cote), Math.max(0, py - cote / 4),
            cote, cote).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i] - 9) < 24 && Math.abs(d[i + 1] - 132) < 24
                && Math.abs(d[i + 2] - 227) < 24) n++;
        }
        isExportingTransparent = false;
        draw();
        return n;
    });
    r.egal('à l\'export, la marque ne part pas : ce qui s\'exporte ne se clique pas',
        exportSansMarque, 0);

    // ------------------------------------------------------------------
    // 5. CE QUI EST ÉCRIT PASSE AVANT CE QUI EST POSÉ
    // Une adresse tapée dans un bloc est plus précise qu'une forme entière :
    // si les deux se recouvrent, c'est le mot qu'on visait.
    // ------------------------------------------------------------------
    const priorite = await page.evaluate(() => {
        texts.length = 0;
        const t = { id: nextId++, x: 240, y: 240, content: 'https://eduscol.education.fr',
                    fontSize: 24, color: '#2d3436', z: globalZ++ };
        texts.push(t);
        draw();
        const dessus = nImporteQuelLienSousLePoint({ x: t.x + 20, y: t.y + 12 });
        // Ailleurs dans le rectangle, mais hors du texte : c'est la forme.
        const ailleurs = nImporteQuelLienSousLePoint({ x: 460, y: 380 });
        return { surLeTexte: dessus && dessus.url,
                 surLaForme: ailleurs && ailleurs.url };
    });
    r.verifie('sur le mot, c\'est l\'adresse écrite qui répond',
        /eduscol/.test(priorite.surLeTexte || ''), JSON.stringify(priorite));
    r.egal('ailleurs dans la forme, c\'est le lien de la forme',
        priorite.surLaForme, 'https://exemple.fr/');

    // ------------------------------------------------------------------
    // 6. LE BOUTON DE LA BARRE DE L'OBJET
    // ------------------------------------------------------------------
    const bouton = await page.evaluate((id) => {
        texts.length = 0;
        const b = document.getElementById('btn-quick-lien');
        const lire = () => ({ vu: getComputedStyle(b).display,
                              allume: b.classList.contains('active'),
                              titre: b.getAttribute('title') });
        selectedItems = [{ type: 'rectangle', id }];
        updateQuickMenu();
        const avecLien = lire();
        const o = getObjectById('rectangle', id);
        delete o.lien;
        updateQuickMenu();
        const sansLien = lire();
        // Deux objets choisis : poser la même adresse sur les deux n'est pas
        // un geste qu'on fait, et le bouton ne saurait que dire.
        const p = { id: nextId++, x: 600, y: 600 };
        const p2 = { id: nextId++, x: 700, y: 700 };
        points.push(p, p2);
        const autre = { id: nextId++, p1_id: p.id, p2_id: p2.id, z: globalZ++ };
        rectangles.push(autre);
        selectedItems = [{ type: 'rectangle', id }, { type: 'rectangle', id: autre.id }];
        updateQuickMenu();
        const aDeux = lire();
        selectedItems = [{ type: 'rectangle', id }];
        updateQuickMenu();
        return { avecLien, sansLien, aDeux };
    }, id);
    r.verifie('le bouton s\'allume et dit l\'adresse quand il y en a une',
        bouton.avecLien.allume && /exemple\.fr/.test(bouton.avecLien.titre),
        JSON.stringify(bouton.avecLien));
    r.verifie('il s\'éteint et propose d\'en poser une quand il n\'y en a pas',
        !bouton.sansLien.allume && /[Pp]oser un lien/.test(bouton.sansLien.titre),
        JSON.stringify(bouton.sansLien));
    r.egal('et il disparaît dès qu\'on choisit deux objets',
        bouton.aDeux.vu, 'none');

    // ------------------------------------------------------------------
    // 7. LE LIEN PART AVEC LE TABLEAU
    // ------------------------------------------------------------------
    const garde = await page.evaluate((id) => {
        getObjectById('rectangle', id).lien = 'https://www.education.gouv.fr/';
        saveState();
        const etat = stateForStorage();
        const trouve = JSON.stringify(etat).includes('https://www.education.gouv.fr/');
        // Et il revient à l'annulation comme tout le reste.
        const avant = getObjectById('rectangle', id).lien;
        undo(); redo();
        return { trouve, avant, apres: (getObjectById('rectangle', id) || {}).lien };
    }, id);
    r.verifie('le lien d\'une forme est enregistré avec le tableau',
        garde.trouve, String(garde.trouve));
    r.egal('et il traverse annuler-refaire', garde.apres, garde.avant);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
