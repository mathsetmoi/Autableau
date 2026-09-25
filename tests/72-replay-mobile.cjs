const path = require('node:path');
const fs = require('node:fs');
const { creerRapport } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Stabilité du replay sur téléphone');
    const context = await browser.newContext({ viewport: { width: 390, height: 760 },
        isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const erreurs = [];
    page.on('pageerror', e => {
        if (!/jsPDF|pdfjsLib|localforage is not defined|getUserMedia|mediaDevices|ResizeObserver loop/.test(e.message)) erreurs.push(e.message);
    });
    try {
        await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?lecteur=1');
        await page.waitForFunction(() => window.Lecteur && window.PluginManager);
        // Comme sur un téléphone dont la barre d'adresse est déployée : le
        // tableau en 100vh est plus haut que la zone actuellement visible.
        await page.addStyleTag({ content: '#board { height: 844px !important; } @media(min-width: 620px) { #board { height: 474px !important; } }' });
        await page.evaluate(async () => {
            const vide = () => Object.fromEntries(FILM_FAMILLES.map(f => [f, []]));
            const trait = (id, y, color, x = 70) => ({ id, color, width: 6, points: [{ x, y }, { x: x + 180, y }] });
            const rouge = trait(1, 240, '#cc2222'), bleu = trait(2, 340, '#2244cc');
            const dernier = { ...vide(), freehands: [rouge, bleu] };
            const film = [{ ...vide(), freehands: [rouge] }, { freehands: [rouge, bleu] },
                { freehands: { '+': [trait(3, 300, '#222222', 1400)] } }];
            for (let i = 3; i < 20; i++) film.push({ freehands: [rouge, bleu, trait(10 + i, 360 + i * 4, '#228844')] });
            await Lecteur.charger({ name: 'Essai de lecture mobile', data: {
                pages: [{ ...dernier, film }], nextId: 50, globalZ: 50, currentBgIndex: 0
            } });
            resizeBoardCanvas();
        });
        await page.getByRole('button', { name: 'Rejouer la séance', exact: true }).click();
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await page.evaluate(() => { Lecteur.seance.suivre = false; zoom = 1; panX = panY = 0; Lecteur.poser(0); });

        const fondu = await page.evaluate(async () => {
            reglerLaTransition('fondu');
            Lecteur.pasAPas(1);
            const board = document.getElementById('board'), calque = document.getElementById('calque-passage');
            const mesure = () => {
                const b = board.getBoundingClientRect(), c = calque.getBoundingClientRect();
                return { ecart: Math.max(Math.abs(b.x - c.x), Math.abs(b.y - c.y), Math.abs(b.width - c.width), Math.abs(b.height - c.height)),
                    visible: getComputedStyle(calque).display !== 'none', opacite: +getComputedStyle(calque).opacity };
            };
            const debut = mesure();
            await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
            const pendant = mesure();
            return { debut, pendant, hauteurTableau: board.clientHeight, hauteurVisible: innerHeight,
                bitmapIdentique: board.width === calque.width && board.height === calque.height };
        });
        r.verifie('le test couvre une hauteur de tableau différente de la hauteur visible', fondu.hauteurTableau > fondu.hauteurVisible + 50, JSON.stringify(fondu));
        r.verifie('le fondu est bien actif sur le téléphone', fondu.debut.visible && fondu.pendant.visible, JSON.stringify(fondu));
        r.verifie('le dessin garde sa taille et sa position pendant le fondu', fondu.debut.ecart < 0.1 && fondu.pendant.ecart < 0.1 && fondu.bitmapIdentique, JSON.stringify(fondu));

        // La barre du navigateur change la hauteur visible, sans modifier le
        // tableau en 100vh : conserver le zoom choisi et la position du cours.
        const vue = await page.evaluate(() => { finirLePassage(); zoom = 1.25; panX = -14; panY = -27; draw(); return { zoom, panX, panY }; });
        await page.setViewportSize({ width: 390, height: 700 });
        await page.waitForTimeout(120);
        const apres = await page.evaluate(() => ({ zoom, panX, panY }));
        r.egal('la barre du téléphone ne recentre pas le cours', apres, vue);

        // Une commande de cadrage doit aussi interrompre l'ancien déplacement
        // automatique, qui sinon reprendrait la main à l'image suivante.
        const cadre = await page.evaluate(async () => {
            Lecteur.poser(1, { sansSuivi: true });
            zoom = 1; panX = panY = 0; draw();
            Lecteur.seance.suivre = true;
            Lecteur.poser(2);
            Lecteur.toutVoir();
            const avant = { zoom, panX, panY };
            await new Promise(ok => setTimeout(ok, 280));
            return { avant, apres: { zoom, panX, panY } };
        });
        r.egal('Tout voir reste en place après avoir interrompu le suivi', cadre.apres, cadre.avant);

        await page.setViewportSize({ width: 760, height: 390 });
        await page.waitForTimeout(120);
        const paysage = await page.evaluate(() => {
            Lecteur.seance.suivre = false; Lecteur.poser(0); Lecteur.pasAPas(1);
            const b = document.getElementById('board').getBoundingClientRect();
            const c = document.getElementById('calque-passage').getBoundingClientRect();
            return { tableau: { w: b.width, h: b.height }, fondu: { w: c.width, h: c.height } };
        });
        r.egal('le fondu reste aligné après le passage en paysage', paysage.fondu, paysage.tableau);

        await page.getByRole('button', { name: 'Lire', exact: true }).click();
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        const arret = await page.locator('#lecteur-compte').textContent();
        await page.waitForTimeout(800);
        r.egal('Pause garde la même étape sur téléphone', await page.locator('#lecteur-compte').textContent(), arret);
        r.verifie('aucune erreur JavaScript', erreurs.length === 0, erreurs.join('\n'));
        fs.mkdirSync('test-artifacts', { recursive: true });
        await page.screenshot({ path: 'test-artifacts/replay-mobile.png' });
        return r.bilan();
    } finally { await context.close(); }
};
