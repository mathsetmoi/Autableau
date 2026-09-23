const { creerRapport, ouvrirApp } = require('./harness.cjs');
const fs = require('node:fs');

module.exports = async function (browser) {
    const r = creerRapport('Monter le replay avant publication');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 1000 } });
    fs.mkdirSync('test-artifacts', { recursive: true });
    try {
        await page.evaluate(async () => {
            window.__messagesMontage = [];
            window.addEventListener('message', e => {
                if (e.data && e.data.type === 'autableau:montage') window.__messagesMontage.push({
                    action: e.data.action, origine: e.origin, version: e.data.version,
                    memeCadre: e.source === document.querySelector('#montage-lecteur')?.contentWindow
                });
            });
            initPages();
            freehands.length = 0; history.length = 0; historyIndex = -1; filmPas.length = 0;
            saveState();
            const trait = (id, couleur, y) => ({ id, type: 'freehand', color: couleur, size: 3,
                points: [{ x: 20, y }, { x: 180, y: y + 40 }] });
            freehands.push(trait(nextId++, '#224488', 30)); saveState();
            freehands.push(trait(nextId++, '#ff0000', 100)); saveState();
            freehands.pop(); saveState();
            freehands.push(trait(nextId++, '#224488', 140)); saveState();
            syncPage();
            window.__avantMontage = JSON.stringify(stateForStorage().pages.map(p => FilmComplet.filmEntier(p)));
            // Le montage est accessible avant toute connexion Google.
            await Publication.ouvrir('montage');
        });
        await page.waitForFunction(() => document.querySelector('#montage-position').textContent.includes('Original · page 1 · étape 1 sur 5'));
        let frame = page.frames().find(f => f.url().includes('montage='));
        r.verifie('le lecteur intégré s’ouvre sans connexion Google', !!frame);
        await frame.locator('#lecteur-suiv').click();
        await frame.locator('#lecteur-suiv').click();
        await page.waitForFunction(() => /étape 3 sur 5/.test(document.querySelector('#montage-position').textContent));
        await page.getByRole('button', { name: 'Début ici', exact: true }).click();
        await frame.locator('#lecteur-suiv').click();
        await page.waitForFunction(() => /étape 4 sur 5/.test(document.querySelector('#montage-position').textContent));
        await page.getByRole('button', { name: 'Fin ici', exact: true }).click();
        await page.locator('#montage-retirer').click();
        r.verifie('les deux bornes retirent l’erreur et sa correction', /2 étape\(s\) retirée/.test(await page.locator('#montage-resume').textContent()));
        await page.screenshot({ path: 'test-artifacts/montage-replay.png' });
        await page.locator('#montage-apercu').click();
        await page.waitForFunction(() => /Montage · page 1 · étape 1 sur 3/.test(document.querySelector('#montage-position').textContent));
        const lecture = await frame.evaluate(() => {
            const p = Lecteur.seance.pages[0];
            return Array.from({ length: p.film.length }, (_, i) => Lecteur.etatAu(p, i).freehands.map(t => t.color));
        });
        r.egal('l’aperçu ne contient plus aucun trait rouge', lecture, [[], ['#224488'], ['#224488', '#224488']]);
        await frame.locator('#lecteur-jouer').click();
        await frame.waitForFunction(() => Lecteur.etat().index > 0);
        await page.getByRole('button', { name: /Rétablir : Page 1/ }).click();
        await page.waitForFunction(() => /Montage · page 1 · étape 1 sur 5/.test(document.querySelector('#montage-position').textContent));
        r.verifie('rétablir une coupe recharge l’aperçu en pause', await frame.evaluate(() => !Lecteur.etat().lecture));
        await page.locator('#montage-original').click();
        await page.waitForFunction(() => document.querySelector('#montage-retirer').disabled === false);
        await page.locator('#montage-debut').fill('1');
        await page.locator('#montage-fin').fill('5');
        await page.locator('#montage-retirer').click();
        r.verifie('retirer toute la séance est refusé', /Gardez au moins/.test(await page.locator('#montage-erreur').textContent()));
        await page.locator('#montage-debut').fill('3');
        await page.locator('#montage-fin').fill('4');
        await page.locator('#montage-retirer').click();
        await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
        r.egal('quitter le montage détruit le lecteur', await page.locator('#montage-lecteur').count(), 0);

        await page.evaluate(() => {
            Publication.poserLesReglages({ cle: 'CLE_TEST', clientId: 'CLIENT_TEST', adresse: 'https://exemple.fr/Autableau' });
            DrivePublication.connecte = () => true;
            DrivePublication.publier = async (nom, contenu) => { window.__publieMontage = contenu; return { id: 'MONTAGE_TEST' }; };
            localStorage.setItem('AuTableau_publication_prevenu', 'oui');
            Publication.rendre();
        });
        await page.locator('#pub-titre').fill('Cours monté');
        await page.locator('#pub-date').fill('2026-09-23');
        await page.locator('#pub-docs').uncheck();
        await page.locator('[data-onglet="montage"]').click();
        await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
        r.egal('le titre et la date sont conservés après un aller-retour', await page.locator('#pub-titre').inputValue(), 'Cours monté');
        r.egal('le choix des documents est conservé', await page.locator('#pub-docs').isChecked(), false);
        await page.getByRole('button', { name: 'Publier la séance', exact: true }).click();
        await page.waitForFunction(() => !!window.__publieMontage);
        const publication = await page.evaluate(() => ({
            titre: window.__publieMontage.seance.titre,
            pas: FilmComplet.filmEntier(window.__publieMontage.data.pages[0]).length,
            rouge: JSON.stringify(window.__publieMontage).includes('#ff0000'),
            originalIntact: window.__avantMontage === JSON.stringify(stateForStorage().pages.map(p => FilmComplet.filmEntier(p)))
        }));
        r.egal('le fichier envoyé correspond au montage et l’original reste intact', publication,
            { titre: 'Cours monté', pas: 3, rouge: false, originalIntact: true });
        await page.evaluate(async () => { Publication.fermer(); await Publication.ouvrir('montage'); });
        r.verifie('fermer et rouvrir sur le même tableau conserve les coupes', /2 étape\(s\) retirée/.test(await page.locator('#montage-resume').textContent()));
        await page.evaluate(async () => { Publication.fermer(); initPages(); await Publication.ouvrir('montage'); });
        r.verifie('un autre tableau commence sans les anciennes coupes', /Aucune coupe/.test(await page.locator('#montage-resume').textContent()));
        r.verifie('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
    } catch (e) {
        console.log(e.stack);
        console.log('Diagnostic montage :', await page.evaluate(() => ({
            position: document.querySelector('#montage-position')?.textContent,
            erreur: document.querySelector('#montage-erreur')?.textContent,
            origine: location.origin, messages: window.__messagesMontage
        })));
        console.log('Erreurs :', erreurs);
        for (const cadre of page.frames().filter(f => f !== page.mainFrame())) {
            console.log('Lecteur :', await cadre.evaluate(() => ({
                origine: location.origin, etat: window.Lecteur?.etat(),
                message: document.querySelector('#lecteur-message')?.textContent
            })).catch(err => err.message));
        }
        throw e;
    } finally {
        await page.screenshot({ path: 'test-artifacts/montage-fin-du-test.png' }).catch(() => {});
        await context.close();
    }
    return r.bilan();
};
