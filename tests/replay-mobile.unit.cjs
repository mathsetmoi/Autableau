const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const transitions = source.slice(source.indexOf("const CLE_TRANSITION ="), source.indexOf('function poserEtapeDeLecture('));
const redimensionnement = source.slice(source.indexOf('function resizeBoardCanvas()'), source.indexOf("window.addEventListener('resize', resizeBoardCanvas)"));

function navigateur() {
    const visible = { width: 390, height: 760 };
    const cadre = { x: 0, y: 0, width: 390, height: 844 };
    const compte = { dimensions: 0, dessins: 0, copies: 0 };
    const elements = new Map();
    const animations = new Map();
    let prochain = 0, temps = 0;
    const contexte = { setTransform() {}, clearRect() {}, drawImage() { compte.copies++; } };
    function canevas() {
        let largeur = cadre.width, hauteur = cadre.height;
        return {
            style: {}, setAttribute() {}, getContext: () => contexte,
            get width() { return largeur; }, set width(v) { largeur = v; compte.dimensions++; },
            get height() { return hauteur; }, set height(v) { hauteur = v; compte.dimensions++; },
            get clientWidth() { return cadre.width; }, get clientHeight() { return cadre.height; },
            getBoundingClientRect() {
                const s = this.style;
                const valeur = (v, taille) => v && v.endsWith('%') ? parseFloat(v) * taille / 100 : parseFloat(v || 0);
                return { x: valeur(s.left, visible.width), y: valeur(s.top, visible.height),
                    width: valeur(s.width, visible.width), height: valeur(s.height, visible.height) };
            }
        };
    }
    const canvas = canevas();
    canvas.getBoundingClientRect = () => ({ ...cadre });
    elements.set('board', canvas);
    const scope = {
        canvas, document: { getElementById: id => elements.get(id) || null,
            createElement: canevas, body: { appendChild: e => elements.set(e.id, e) } },
        localStorage: { getItem: () => null, setItem() {} },
        performance: { now: () => temps },
        requestAnimationFrame: f => { animations.set(++prochain, f); return prochain; },
        cancelAnimationFrame: id => animations.delete(id),
        delaiDeLecture: () => 700, draw: () => { compte.dessins++; },
        innerWidth: visible.width, innerHeight: visible.height
    };
    scope.window = scope;
    vm.runInNewContext(transitions + '\n' + redimensionnement, scope);
    return { scope, cadre, visible, compte, elements, animations,
        avancer(ms) { temps += ms; const tour = [...animations.values()]; animations.clear(); tour.forEach(f => f(temps)); } };
}

test('le fondu garde les dimensions du tableau lorsque la barre du téléphone réduit la vue', () => {
    const n = navigateur();
    assert.equal(n.scope.prendreLImageDAvant(), true);
    assert.deepEqual(n.elements.get('calque-passage').getBoundingClientRect(), n.cadre);
    n.scope.jouerLePassage();
    n.avancer(120);
    assert.deepEqual(n.elements.get('calque-passage').getBoundingClientRect(), n.cadre);
});

test('le calque reprend aussi la position et la nouvelle taille du tableau', () => {
    const n = navigateur();
    n.scope.prendreLImageDAvant();
    Object.assign(n.cadre, { x: 8, y: 12, width: 760, height: 390 });
    n.scope.resizeBoardCanvas();
    n.scope.prendreLImageDAvant();
    assert.deepEqual(n.elements.get('calque-passage').getBoundingClientRect(), n.cadre);
});

test('un événement mobile sans changement de dimensions ne vide pas le bitmap', () => {
    const n = navigateur();
    n.scope.prendreLImageDAvant();
    n.scope.jouerLePassage();
    n.compte.dimensions = n.compte.dessins = 0;
    n.scope.resizeBoardCanvas();
    assert.equal(n.compte.dimensions, 0);
    assert.equal(n.compte.dessins, 0);
    assert.equal(n.elements.get('calque-passage').style.display, 'block');
});

test('une vraie rotation retire le fondu ancien et redessine à la nouvelle taille', () => {
    const n = navigateur();
    n.scope.prendreLImageDAvant();
    n.scope.jouerLePassage();
    Object.assign(n.cadre, { width: 844, height: 390 });
    n.compte.dessins = 0;
    n.scope.resizeBoardCanvas();
    assert.equal(n.scope.canvas.width, 844);
    assert.equal(n.scope.canvas.height, 390);
    assert.equal(n.elements.get('calque-passage').style.display, 'none');
    assert.equal(n.animations.size, 0);
    assert.equal(n.compte.dessins, 1);
});
