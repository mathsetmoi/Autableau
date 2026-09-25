const { test } = require('node:test');
const assert = require('node:assert/strict');
const presse = require('../lib/tableau/presse-papiers.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const copie = {
    points: [{ id: 1, x: 10, y: 20 }, { id: 2, x: 60, y: 20 }],
    items: [{ type: 'segment', data: { id: 3, p1_id: 1, p2_id: 2, color: '#c00' } },
        { type: 'text', data: { id: 4, content: 'À recopier : x² + 2x', x: 10, y: 40 } }]
};

test('les objets et les liens de géométrie traversent le presse-papiers système', () => {
    const restaure = presse.decoder(presse.encoder(copie));
    assert.deepEqual(restaure, copie);
    restaure.points[0].x = 999;
    assert.equal(copie.points[0].x, 10);
});

test('un texte extérieur, même JSON, ne devient pas une copie du tableau', () => {
    for (const t of ['', 'Bonjour la classe', JSON.stringify(copie)]) assert.equal(presse.decoder(t), null);
});

test('une copie du tableau tronquée ou mal formée est refusée', () => {
    for (const t of ['{', 'null', '{"items":{},"points":[]}',
        '{"items":[{"type":"inconnu","data":{}}],"points":[]}',
        '{"items":[],"points":[{"id":1,"x":"erreur","y":3}]}']) {
        assert.throws(() => presse.decoder('MEM_TABLEAU_V1:' + t), /copie du tableau/);
    }
});

test('le collage natif conserve images et texte sans inventer de fichier', () => {
    const png = new Blob(['image'], { type: 'image/png' });
    const contenu = presse.depuisEvenement({
        getData: t => t === 'text/plain' ? 'légende' : '<img src="exemple">',
        types: ['Files', 'text/plain', 'text/html'],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => png },
            { kind: 'file', type: 'image/png', getAsFile: () => null },
            { kind: 'string', type: 'text/plain' }]
    });
    assert.deepEqual(contenu.images, [png]);
    assert.equal(contenu.texte, 'légende');
});

test('le bouton lit les images et le texte riche ; une image multiformat reste unique', async () => {
    const png = new Blob(['image'], { type: 'image/png' });
    const demandes = [];
    const contenu = await presse.lire({ read: async () => [{
        types: ['image/webp', 'image/png', 'text/plain', 'text/html'],
        getType: async t => {
            demandes.push(t);
            return t === 'image/png' ? png : new Blob([t === 'text/html' ? '<b>Consigne</b>' : 'Consigne']);
        }
    }] });
    assert.deepEqual(contenu.images, [png]);
    assert.equal(contenu.html, '<b>Consigne</b>');
    assert.equal(contenu.texte, 'Consigne');
    assert.ok(!demandes.includes('image/webp'));
});

test('le refus du système ne provoque pas un autre collage', async () => {
    let lecturesTexte = 0;
    await assert.rejects(presse.lire({
        read: async () => { throw new Error('Permission refusée'); },
        readText: async () => { lecturesTexte++; return 'ancien'; }
    }), /Permission/);
    assert.equal(lecturesTexte, 0);
});

test('le repli texte fonctionne quand seule readText est disponible', async () => {
    const contenu = await presse.lire({ readText: async () => presse.encoder(copie) });
    assert.deepEqual(presse.decoder(contenu.texte), copie);
    assert.deepEqual(contenu.images, []);
    await assert.rejects(presse.lire(undefined), /indisponible/);
});

// Exécute les vrais gestionnaires de script.js. Seules les entrées/sorties
// du navigateur (presse-papiers, chargement d'image et dessin) sont simulées.
function application() {
    const source = fs.readFileSync(process.env.PRESSE_PAPIERS_SOURCE || path.join(__dirname, '../script.js'), 'utf8');
    const ecouteurs = new Map(), messages = [];
    const tableaux = { point: [], segment: [], circle: [], rectangle: [], text: [], freehand: [],
        curve: [], polygon: [], image: [], arc: [] };
    const ctx = { console, PressePapiersTableau: presse, selectedItems: [], nextId: 100, globalZ: 1,
        zoom: 1, panX: 0, panY: 0, innerWidth: 1280, innerHeight: 800,
        pages: [{}], currentPageIndex: 0, collageSansMiseEnForme: false,
        imageCache: {}, navigator: {},
        document: { addEventListener() {}, getElementById() { return null; } },
        addEventListener: (type, fn) => { if (!ecouteurs.has(type)) ecouteurs.set(type, []); ecouteurs.get(type).push(fn); },
        getSelection: () => ({ isCollapsed: true }),
        getObjectById: (type, id) => tableaux[type].find(o => o.id === id),
        deleteObject: (type, id) => { const a = tableaux[type], i = a.findIndex(o => o.id === id); if (i >= 0) a.splice(i, 1); },
        clearSelection: () => { ctx.selectedItems = []; },
        draw() {}, saveState() {}, updateStyleBarContext() {},
        showToast: message => messages.push(message),
        estUneEllipseLibre: () => false, poserEnRognage: o => o,
        collerTexteSurLeTableau: (html, texte) => {
            if (!(html || texte).trim()) return false;
            tableaux.text.push({ html, texte }); return true;
        },
        mettreDansLePressePapiers: async texte => { ctx.systeme = texte; return true; },
        FileReader: class { readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,aW1hZ2U=' } }); } },
        Image: class { constructor() { this.width = 160; this.height = 100; } set src(v) { this.onload(); } }
    };
    for (const [type, a] of Object.entries(tableaux)) ctx[type === 'freehand' ? 'freehands' : type + 's'] = a;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(source.slice(source.indexOf('let boardClipboard ='), source.indexOf('// 🚀 Lancement blindé')), ctx);
    const debutCollage = source.indexOf("window.addEventListener('paste', (e) => {");
    vm.runInContext(source.slice(debutCollage,
        source.indexOf('// GESTION DE L\'INTERLIGNE ET DE L\'AIMANT', debutCollage)), ctx);
    tableaux.point.push({ id: 1, x: 10, y: 20 }, { id: 2, x: 60, y: 20 });
    tableaux.segment.push({ id: 3, p1_id: 1, p2_id: 2 });
    ctx.selectedItems = [{ type: 'segment', id: 3 }];
    ctx.copierSelection(); // La copie périmée qui déclenchait le défaut.
    const donnees = (texte = '', images = [], html = '') => {
        const d = new Map([['text/plain', texte], ['text/html', html]]);
        return { types: ['text/plain', 'text/html', ...(images.length ? ['Files'] : [])],
            items: images.map(f => ({ kind: 'file', type: f.type, getAsFile: () => f })),
            getData: t => d.get(t) || '', setData: (t, v) => d.set(t, v) };
    };
    const envoyer = (type, clipboardData, cible = { tagName: 'BODY' }) => {
        const e = { type, clipboardData, target: cible, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; } };
        for (const fn of ecouteurs.get(type) || []) fn(e);
        return e;
    };
    return { ctx, tableaux, messages, donnees, envoyer };
}

test('régression : une image extérieure gagne sur une ancienne copie du tableau', () => {
    const a = application();
    const ev = a.envoyer('paste', a.donnees('légende', [new Blob(['image'], { type: 'image/png' })], '<img>'));
    assert.equal(a.tableaux.image.length, 1);
    assert.equal(a.tableaux.segment.length, 1);
    assert.equal(a.tableaux.text.length, 0);
    assert.ok(ev.defaultPrevented);
});

test('régression : du texte extérieur gagne sur une ancienne copie du tableau', () => {
    const a = application();
    a.envoyer('paste', a.donnees('Consigne extérieure', [], '<b>Consigne extérieure</b>'));
    assert.equal(a.tableaux.segment.length, 1);
    assert.deepEqual(a.tableaux.text, [{ texte: 'Consigne extérieure', html: '<b>Consigne extérieure</b>' }]);
});

test('copier dans le tableau remplace le contenu extérieur et préserve la géométrie', () => {
    const a = application(), dt = a.donnees('Ancien texte extérieur');
    assert.ok(a.envoyer('copy', dt).defaultPrevented);
    assert.ok(presse.decoder(dt.getData('text/plain')));
    a.envoyer('paste', dt);
    assert.equal(a.tableaux.segment.length, 2);
    assert.equal(a.tableaux.point.length, 4);
    assert.equal(a.tableaux.text.length, 0);
    assert.notEqual(a.tableaux.segment[1].p1_id, 1);
    assert.ok(a.tableaux.point.some(p => p.id === a.tableaux.segment[1].p1_id));
});

test('le menu natif Couper puis Coller retrouve un seul objet', () => {
    const a = application(), dt = a.donnees();
    a.envoyer('cut', dt);
    assert.equal(a.tableaux.segment.length, 0);
    a.envoyer('paste', dt);
    assert.equal(a.tableaux.segment.length, 1);
});

test('les collages successifs réutilisent la copie extérieure actuelle', () => {
    const a = application(), dt = a.donnees('Consigne');
    a.envoyer('paste', dt); a.envoyer('paste', dt);
    assert.equal(a.tableaux.text.length, 2);
    assert.equal(a.tableaux.segment.length, 1);
});

test('un presse-papiers vide ou inaccessible ne ressort pas les anciens objets', async () => {
    const a = application();
    a.envoyer('paste', a.donnees());
    a.ctx.navigator.clipboard = { read: async () => { throw new Error('Refus'); } };
    assert.equal(await a.ctx.collerDepuisLeSysteme(), false);
    assert.equal(a.tableaux.segment.length, 1);
    assert.match(a.messages.at(-1), /Ctrl\+V/);
});

test('les boutons copient et lisent le système, y compris les images', async () => {
    const a = application();
    assert.ok(await a.ctx.copierVersLeSysteme());
    assert.ok(presse.decoder(a.ctx.systeme));
    a.ctx.navigator.clipboard = { read: async () => [{ types: ['image/png'],
        getType: async () => new Blob(['image'], { type: 'image/png' }) }] };
    assert.ok(await a.ctx.collerDepuisLeSysteme());
    assert.equal(a.tableaux.image.length, 1);
    assert.equal(a.tableaux.segment.length, 1);
});

test('un refus de copie ne supprime pas les objets à couper', async () => {
    const a = application();
    a.ctx.mettreDansLePressePapiers = async () => false;
    assert.equal(await a.ctx.copierVersLeSysteme(true), false);
    assert.equal(a.tableaux.segment.length, 1);
});

test('dupliquer laisse intact le presse-papiers du système', async () => {
    const a = application();
    a.ctx.systeme = 'Copie extérieure';
    assert.ok(a.ctx.dupliquerSelection());
    assert.equal(a.tableaux.segment.length, 2);
    assert.equal(a.ctx.systeme, 'Copie extérieure');
});

test('copier ou coller dans un champ reste natif', () => {
    const a = application(), dt = a.donnees('Texte');
    for (const cible of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
        assert.equal(a.envoyer('copy', dt, cible).defaultPrevented, false);
        assert.equal(a.envoyer('paste', dt, cible).defaultPrevented, false);
    }
    assert.equal(a.tableaux.segment.length, 1);
    assert.equal(a.tableaux.text.length, 0);
});
