// Banco de las VISTAS de Archivos (A2-2, 14-oct-2026).
//
// Lo que fija:
//   · los filtros de una vista son los mismos que los de la carpeta (texto,
//     estado y fichas de tipo, disciplina y entrega);
//   · las vistas propias vuelven tal cual del almacén, y nada de lo que venga
//     roto de él puede romper Archivos;
//   · el catálogo de serie tiene las claves que entiende el servidor
//     (backend/vistas_de_obra.py: CLAVES).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VISTAS_DE_SERIE, aplicarFiltros, hayFiltros, describirFiltros, parametrosDeVista,
  leerVistasPropias, guardarVistaPropia, borrarVistaPropia, llaveDeVistas, MAXIMO_PROPIAS,
  COLECCIONES, criteriosDeFiltros, limpiarOrden,
} from '../src/utils/vistasDeArchivos.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const almacen = (inicial = {}) => {
    const datos = { ...inicial };
    return { getItem: (k) => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = v; }, datos };
};
const almacenQueFalla = () => ({
    getItem() { throw new DOMException('almacenamiento no disponible'); },
    setItem() { throw new DOMException('cuota superada'); },
});

const COD = '500125-CSSP001-000-XX-DR-ES-004120';
const FILAS = [
    { id: '1', name: `${COD}.pdf`, status: 'PUBLISHED', entrega: { estado: 'entregado' } },
    { id: '2', name: '500125-CSSP001-000-XX-M3-AR-000001.rvt', status: 'SHARED' },
    { id: '3', name: 'acta suelta.pdf' },
];
const ids = (l) => l.map(f => f.id);
let n = 0;
const idFijo = () => `id${++n}`;

// ── EL CATÁLOGO ──────────────────────────────────────────────────────────────

await test('las claves de serie son las del servidor, en el mismo orden', () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const py = readFileSync(join(aqui, '..', '..', 'backend', 'vistas_de_obra.py'), 'utf8');
    const constantes = Object.fromEntries([...py.matchAll(/^([A-Z_]+) = '([a-z_]+)'$/gm)].map(m => [m[1], m[2]]));
    const claves = py.match(/^CLAVES = \(([^)]*)\)/m)[1].split(',').map(s => constantes[s.trim()]);
    assert.deepEqual(VISTAS_DE_SERIE.map(v => v.clave), claves);
});

// ── LOS FILTROS ──────────────────────────────────────────────────────────────

await test('sin filtros, todas las filas', () => {
    assert.deepEqual(ids(aplicarFiltros(FILAS)), ['1', '2', '3']);
});

await test('texto, estado y fichas, como en la carpeta', () => {
    assert.deepEqual(ids(aplicarFiltros(FILAS, { texto: '004120' })), ['1']);
    assert.deepEqual(ids(aplicarFiltros(FILAS, { estado: 'SHARED' })), ['2']);
    assert.deepEqual(ids(aplicarFiltros(FILAS, { estado: 'WIP' })), ['3']);      // sin estado = WIP
    assert.deepEqual(ids(aplicarFiltros(FILAS, { meta: { disciplina: 'ES' } })), ['1']);
    assert.deepEqual(ids(aplicarFiltros(FILAS, { meta: { tipo: 'M3' } })), ['2']);
    assert.deepEqual(ids(aplicarFiltros(FILAS, { meta: { entrega: 'fuera' } })), ['2', '3']);
});

await test('hayFiltros y su descripción', () => {
    assert.equal(hayFiltros({}), false);
    assert.equal(hayFiltros({ estado: 'ALL', texto: '  ' }), false);
    assert.equal(hayFiltros({ meta: { tipo: 'DR' } }), true);
    assert.equal(describirFiltros({ estado: 'PUBLISHED', disciplina: 'ES', entrega: 'fuera' }),
        'Publicado · Disciplina ES · Entrega: Fuera del plan');
});

await test('los parámetros de una vista propia para el servidor', () => {
    const p = new URLSearchParams(parametrosDeVista({ texto: 'losa', estado: 'PUBLISHED', tipo: 'DR' }));
    assert.equal(p.get('vista'), 'todos');
    assert.equal(p.get('q'), 'losa');
    assert.equal(p.get('estado'), 'PUBLISHED');
    assert.equal(p.get('tipo'), 'DR');
    assert.equal(p.get('disciplina'), null);
});

// ── EL ALMACÉN ───────────────────────────────────────────────────────────────

await test('guardar y leer: vuelve tal cual', () => {
    const a = almacen();
    const r = guardarVistaPropia(a, 'obra1', 7, { nombre: 'Estructuras', alcance: 'obra',
        filtros: { disciplina: 'ES', estado: 'PUBLISHED' } }, idFijo);
    assert.equal(r.ok, true);
    const l = leerVistasPropias(a, 'obra1', 7);
    assert.equal(l.length, 1);
    assert.equal(l[0].nombre, 'Estructuras');
    assert.equal(l[0].filtros.disciplina, 'ES');
    assert.equal(l[0].filtros.estado, 'PUBLISHED');
});

await test('cada obra y cada persona tienen las suyas', () => {
    const a = almacen();
    guardarVistaPropia(a, 'obra1', 7, { nombre: 'X', filtros: { tipo: 'DR' } }, idFijo);
    assert.equal(leerVistasPropias(a, 'obra2', 7).length, 0);
    assert.equal(leerVistasPropias(a, 'obra1', 8).length, 0);
});

await test('sin nombre o sin filtros no se guarda', () => {
    const a = almacen();
    assert.equal(guardarVistaPropia(a, 'o', 1, { nombre: '  ', filtros: { tipo: 'DR' } }, idFijo).ok, false);
    assert.equal(guardarVistaPropia(a, 'o', 1, { nombre: 'Nada', filtros: {} }, idFijo).ok, false);
});

await test('el mismo nombre sustituye a la anterior', () => {
    const a = almacen();
    guardarVistaPropia(a, 'o', 1, { nombre: 'Planos', filtros: { tipo: 'DR' } }, idFijo);
    guardarVistaPropia(a, 'o', 1, { nombre: 'planos', filtros: { tipo: 'M3' } }, idFijo);
    const l = leerVistasPropias(a, 'o', 1);
    assert.equal(l.length, 1);
    assert.equal(l[0].filtros.tipo, 'M3');
});

await test('alcance carpeta exige la carpeta', () => {
    const a = almacen();
    assert.equal(guardarVistaPropia(a, 'o', 1, { nombre: 'Aquí', alcance: 'carpeta', filtros: { tipo: 'DR' } }, idFijo).ok, false);
    const r = guardarVistaPropia(a, 'o', 1, { nombre: 'Aquí', alcance: 'carpeta',
        carpeta: { ruta: 'o/01 Planos/', id: 'abc', nombre: '01 Planos' }, filtros: { tipo: 'DR' } }, idFijo);
    assert.equal(r.ok, true);
    assert.equal(leerVistasPropias(a, 'o', 1)[0].carpeta.id, 'abc');
});

await test('tope de vistas propias', () => {
    const a = almacen();
    for (let i = 0; i < MAXIMO_PROPIAS; i++) guardarVistaPropia(a, 'o', 1, { nombre: `V${i}`, filtros: { tipo: 'DR' } }, idFijo);
    const r = guardarVistaPropia(a, 'o', 1, { nombre: 'Otra', filtros: { tipo: 'DR' } }, idFijo);
    assert.equal(r.ok, false);
    assert.equal(leerVistasPropias(a, 'o', 1).length, MAXIMO_PROPIAS);
});

await test('borrar quita solo esa', () => {
    const a = almacen();
    const v1 = guardarVistaPropia(a, 'o', 1, { nombre: 'A', filtros: { tipo: 'DR' } }, idFijo).vista;
    guardarVistaPropia(a, 'o', 1, { nombre: 'B', filtros: { tipo: 'M3' } }, idFijo);
    assert.deepEqual(borrarVistaPropia(a, 'o', 1, v1.id).map(v => v.nombre), ['B']);
});

// ── LO QUE LLEGA ROTO ────────────────────────────────────────────────────────

await test('un almacén que revienta no rompe nada', () => {
    assert.deepEqual(leerVistasPropias(almacenQueFalla(), 'o', 1), []);
    const r = guardarVistaPropia(almacenQueFalla(), 'o', 1, { nombre: 'A', filtros: { tipo: 'DR' } }, idFijo);
    assert.equal(r.ok, false);
    assert.match(r.motivo, /no deja guardar/);
});

await test('basura en el almacén: se descarta lo que no sirve', () => {
    const k = llaveDeVistas('o', 1);
    for (const crudo of ['{', '"texto"', '{"a":1}', 'null', '42']) {
        assert.deepEqual(leerVistasPropias(almacen({ [k]: crudo }), 'o', 1), [], crudo);
    }
    const mezcla = JSON.stringify([
        null, 7, { id: 'x', nombre: 'Sin filtros', filtros: {} },
        { id: 'y', nombre: 'Buena', filtros: { tipo: 'DR', estado: 'INVENTADO', entrega: 'raro' } },
        { id: 'y', nombre: 'Repetida', filtros: { tipo: 'DR' } },
    ]);
    const l = leerVistasPropias(almacen({ [k]: mezcla }), 'o', 1);
    assert.deepEqual(l.map(v => v.nombre), ['Buena']);
    assert.equal(l[0].filtros.estado, null);
    assert.equal(l[0].filtros.entrega, null);
});

await test('sin obra o sin persona no hay vistas', () => {
    assert.deepEqual(leerVistasPropias(almacen(), '', 1), []);
    assert.deepEqual(leerVistasPropias(almacen(), 'o', null), []);
});

// ── COLECCIONES, CRITERIOS Y ORDEN (tras ver los vídeos de Procore) ───────────

await test('cada vista de serie está en una colección y dice sus criterios', () => {
    const cols = COLECCIONES.map(c => c.clave);
    for (const v of VISTAS_DE_SERIE) {
        assert.ok(cols.includes(v.coleccion), v.clave);
        assert.ok(Array.isArray(v.criterios) && v.criterios.length > 0, v.clave);
    }
    // Las colecciones salen en el orden del panel, sin huecos entre sus vistas.
    const orden = VISTAS_DE_SERIE.map(v => cols.indexOf(v.coleccion));
    assert.deepEqual(orden, [...orden].sort((x, y) => x - y));
});

await test('criterios de una vista propia, como fichas', () => {
    assert.deepEqual(criteriosDeFiltros({ estado: 'PUBLISHED', disciplina: 'ES', texto: 'losa', entrega: 'fuera' }),
        [['Nombre', 'contiene «losa»'], ['Estado ISO', 'Publicado'], ['Disciplina', 'ES'], ['Entrega', 'fuera del plan']]);
    assert.deepEqual(criteriosDeFiltros({}), []);
});

await test('el orden de la tabla viaja con la vista, y lo raro se descarta', () => {
    const a = almacen();
    guardarVistaPropia(a, 'o', 1, { nombre: 'Por fecha', filtros: { tipo: 'DR' }, orden: { col: 'updated', dir: -1 } }, idFijo);
    assert.deepEqual(leerVistasPropias(a, 'o', 1)[0].orden, { col: 'updated', dir: -1 });
    assert.equal(limpiarOrden({ col: 'inventada', dir: 1 }), null);
    assert.deepEqual(limpiarOrden({ col: 'name', dir: 7 }), { col: 'name', dir: 1 });
    guardarVistaPropia(a, 'o', 1, { nombre: 'Sin orden', filtros: { tipo: 'DR' } }, idFijo);
    assert.equal(leerVistasPropias(a, 'o', 1).find(v => v.nombre === 'Sin orden').orden, null);
});

console.log(`\nvistasDeArchivos: ${pass} pasan, ${fail} fallan`);
if (fail) process.exit(1);
