// Rejoue le cas signalé : copier un objet du tableau, puis une image dans une
// autre application. Les gestes passent par le vrai presse-papiers Chromium.
const fs = require('node:fs');
const path = require('node:path');
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async browser => {
    const r = creerRapport('La dernière copie, quelle que soit son origine');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const preparer = () => page.evaluate(() => {
        [points, segments, circles, rectangles, texts, freehands, curves, polygons, images, arcs]
            .forEach(a => a.length = 0);
        setMode('pointer'); panX = 0; panY = 0; zoom = 1;
        const a = { id: nextId++, x: 500, y: 300, z: globalZ++ };
        const b = { id: nextId++, x: 580, y: 300, z: globalZ++ };
        points.push(a, b);
        const cercle = { id: nextId++, center_id: a.id, edge_id: b.id, color: '#c00', width: 3, z: globalZ++ };
        circles.push(cercle);
        selectedItems = [{ type: 'circle', id: cercle.id }];
        document.activeElement?.blur(); window.getSelection().removeAllRanges();
        updateStyleBarContext(); draw();
    });
    const imageExterieure = () => page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 100;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#008fa8'; ctx.fillRect(0, 0, 160, 100);
        ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.fillText('Image copiée', 16, 58);
        const png = await new Promise(ok => c.toBlob(ok, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    });
    const etat = () => page.evaluate(() => ({ cercles: circles.length, images: images.length, textes: texts.length }));

    await preparer();
    await page.keyboard.press('Control+c');
    r.verifie('Ctrl+C transmet au système les objets modifiables du tableau',
        await page.evaluate(async () => !!PressePapiersTableau.decoder(await navigator.clipboard.readText())));
    await imageExterieure();
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => images.length === 1);
    r.egal('une image extérieure remplace la copie précédente du tableau', await etat(),
        { cercles: 1, images: 1, textes: 0 });
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => images.length === 2);
    r.egal('un second collage reprend l’image actuelle, jamais l’ancien cercle', await etat(),
        { cercles: 1, images: 2, textes: 0 });

    await page.evaluate(() => navigator.clipboard.writeText('Consigne copiée ailleurs'));
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => texts.length === 1);
    r.egal('le texte extérieur prend lui aussi la place de l’ancienne copie', await etat(),
        { cercles: 1, images: 2, textes: 1 });

    await page.evaluate(async () => {
        document.activeElement?.blur();
        await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob(['<b>Texte en gras</b>'], { type: 'text/html' }),
            'text/plain': new Blob(['Texte en gras'], { type: 'text/plain' })
        })]);
    });
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => texts.length === 2);
    r.verifie('la mise en forme extérieure est conservée sans double collage',
        await page.evaluate(() => /<b>Texte en gras<\/b>/.test(texts[1].content)));

    await preparer(); // Le système contient encore le texte extérieur.
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => circles.length === 2);
    r.egal('une nouvelle copie dans le tableau remplace à son tour le contenu extérieur', await etat(),
        { cercles: 2, images: 0, textes: 0 });
    r.verifie('les points du cercle collé restent indépendants et modifiables',
        await page.evaluate(() => points.length === 4 && circles[0].center_id !== circles[1].center_id
            && points.some(p => p.id === circles[1].edge_id)));

    await page.evaluate(() => navigator.clipboard.writeText('Copie à conserver'));
    await page.evaluate(() => dupliquerSelection());
    r.egal('dupliquer ne remplace pas le presse-papiers système',
        await page.evaluate(() => navigator.clipboard.readText()), 'Copie à conserver');

    await preparer();
    await page.locator('#btn-copier').click();
    await page.waitForFunction(async () => !!PressePapiersTableau.decoder(await navigator.clipboard.readText()));
    await imageExterieure();
    await page.locator('#btn-coller').click();
    await page.waitForFunction(() => images.length === 1);
    r.egal('le bouton Coller de la sélection lit aussi les images extérieures', await etat(),
        { cercles: 1, images: 1, textes: 0 });
    await page.locator('#btn-coller-tableau').click();
    await page.waitForFunction(() => images.length === 2);
    r.egal('le bouton Coller du bas suit la même règle', await etat(),
        { cercles: 1, images: 2, textes: 0 });

    fs.mkdirSync(path.join(__dirname, '..', 'test-artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', 'test-artifacts', 'presse-papiers.png') });

    await preparer();
    await page.keyboard.press('Control+x');
    r.egal('Ctrl+X coupe l’objet une seule fois', (await etat()).cercles, 0);
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => circles.length === 1);
    r.egal('Ctrl+V retrouve l’objet coupé dans le système', (await etat()).cercles, 1);

    const refus = await page.evaluate(async () => {
        const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            read: async () => { throw new Error('NotAllowedError'); }
        } });
        const avant = circles.length;
        const colle = await collerDepuisLeSysteme();
        if (original) Object.defineProperty(navigator, 'clipboard', original); else delete navigator.clipboard;
        const ecrire = mettreDansLePressePapiers;
        mettreDansLePressePapiers = async () => false;
        const coupe = await copierVersLeSysteme(true);
        mettreDansLePressePapiers = ecrire;
        return { colle, coupe, avant, apres: circles.length };
    });
    r.verifie('un refus de lecture ne ressort pas l’ancien contenu', !refus.colle && refus.avant === refus.apres);
    r.verifie('un refus d’écriture laisse en place les objets à couper', !refus.coupe && refus.avant === refus.apres);

    await page.evaluate(() => {
        const champ = document.createElement('textarea'); champ.id = 'champ-test-collage';
        champ.style.cssText = 'position:fixed;left:400px;top:400px;z-index:999999';
        champ.value = 'Texte dans un champ'; document.body.appendChild(champ); champ.focus(); champ.select();
    });
    await page.keyboard.press('Control+c');
    r.egal('copier dans un champ conserve le comportement natif',
        await page.evaluate(() => navigator.clipboard.readText()), 'Texte dans un champ');
    await page.evaluate(() => navigator.clipboard.writeText('Texte extérieur pour le champ'));
    await page.keyboard.press('Control+v');
    r.egal('coller dans un champ ne pose pas d’objet sur le tableau',
        await page.locator('#champ-test-collage').inputValue(), 'Texte extérieur pour le champ');
    r.egal('le tableau reste intact pendant la saisie', (await etat()).cercles, 1);
    r.verifie('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
