// Banco de las VISTAS de Archivos (A2-2, 14-oct-2026).
//
// Lo que fija:
//   · los filtros de una vista son los mismos que los de la carpeta (texto,
//     estado y fichas de tipo, disciplina y entrega);
//   · el catálogo de serie tiene las claves que entiende el servidor
//     (backend/vistas_de_obra.py: CLAVES).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VISTAS_DE_SERIE, aplicarFiltros, COLECCIONES } from '../src/utils/vistasDeArchivos.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}


const COD = '500125-CSSP001-000-XX-DR-ES-004120';
const FILAS = [
    { id: '1', name: `${COD}.pdf`, status: 'PUBLISHED', entrega: { estado: 'entregado' } },
    { id: '2', name: '500125-CSSP001-000-XX-M3-AR-000001.rvt', status: 'SHARED' },
    { id: '3', name: 'acta suelta.pdf' },
];
const ids = (l) => l.map(f => f.id);

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

// ── COLECCIONES Y CRITERIOS (tras ver los vídeos de Procore) ─────────────────

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

console.log(`\nvistasDeArchivos: ${pass} pasan, ${fail} fallan`);
if (fail) process.exit(1);
