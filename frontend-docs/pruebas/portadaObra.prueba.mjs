// Banco de la PORTADA de la obra por plazos (14-oct-2026).
//
// Lo que fija: el reparto por DÍA de calendario de Lima (algo que vence hoy no
// está atrasado), qué cuenta como pendiente en cada herramienta, y que el plan
// separa los compromisos atrasados sin documento.
import assert from 'node:assert/strict';
import {
  diasHasta, tramoDe, resumenPorHerramienta, misPendientes, textoDePlazo, deRfis, dePlan,
} from '../src/utils/portadaObra.js';

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

// 14-oct-2026, 10:00 en Lima (15:00 UTC).
const HOY = new Date('2026-10-14T15:00:00Z');

await test('por día de Lima: hoy a las 18:00 vence hoy, no está atrasado', () => {
    assert.equal(diasHasta('2026-10-14T23:00:00Z', HOY), 0);           // 18:00 en Lima
    assert.equal(tramoDe('2026-10-14T23:00:00Z', HOY), 'semana');
    assert.equal(diasHasta('2026-10-15T03:00:00Z', HOY), 0);           // 22:00 del 14 en Lima
    assert.equal(diasHasta('2026-10-15T06:00:00Z', HOY), 1);           // 01:00 del 15 en Lima
});

await test('una fecha sola es ese día', () => {
    assert.equal(diasHasta('2026-10-13', HOY), -1);
    assert.equal(tramoDe('2026-10-13', HOY), 'atrasado');
    assert.equal(tramoDe('2026-10-21', HOY), 'semana');
    assert.equal(tramoDe('2026-10-22', HOY), 'despues');
    assert.equal(tramoDe(null, HOY), 'sin_plazo');
    assert.equal(tramoDe('no es fecha', HOY), 'sin_plazo');
});

await test('RFI: los respondidos y cerrados ya no deben nada', () => {
    const r = deRfis([{ estado: 'Emitido', vence_en: '2026-10-10' }, { estado: 'Respondido' }, { estado: 'Cerrado' }]);
    assert.equal(r.length, 1);
});

await test('plan: lo entregado no cuenta; se sabe si hay documento', () => {
    const p = dePlan([{ estado: 'entregado' }, { estado: 'vencido', documento: null }, { estado: 'vinculado', documento: { node_id: 'x' } }]);
    assert.deepEqual(p.map(x => x.sinDocumento), [true, false]);
});

await test('resumen por herramienta', () => {
    const f = resumenPorHerramienta({
        reviews: [{ status: 'pending', paso_vence_en: '2026-10-12T15:00:00Z' }, { status: 'pending', paso_vence_en: null },
                  { status: 'approved', paso_vence_en: '2026-10-01' }],
        rfis: [{ estado: 'Emitido', vence_en: '2026-10-16' }],
        plan: [{ estado: 'vencido', fecha_comprometida: '2026-10-01', documento: null },
               { estado: 'vinculado', fecha_comprometida: '2026-10-05', documento: { node_id: 'x' } },
               { estado: 'comprometido', fecha_comprometida: '2026-12-01', documento: null }],
    }, HOY);
    const de = Object.fromEntries(f.map(x => [x.clave, x]));
    assert.deepEqual([de.reviews.atrasado, de.reviews.sin_plazo, de.reviews.total], [1, 1, 2]);
    assert.equal(de.rfis.semana, 1);
    assert.deepEqual([de.plan.atrasado, de.plan.despues, de.plan.atrasadosSinDocumento], [2, 1, 1]);
});

await test('una herramienta que no respondió no sale', () => {
    assert.deepEqual(resumenPorHerramienta({ reviews: null, rfis: [], plan: null }, HOY).map(x => x.clave), ['rfis']);
});

await test('mis pendientes: por tramo, lo más urgente primero', () => {
    const m = misPendientes([
        { id: 1, objeto_tipo: 'REVIEW', asunto: 'a', vence_en: '2026-10-10T15:00:00Z' },
        { id: 2, objeto_tipo: 'RFI', asunto: 'b', vence_en: '2026-10-12T15:00:00Z' },
        { id: 3, objeto_tipo: 'ASIENTO', asunto: 'c', vence_en: null },
    ], HOY);
    assert.deepEqual(m.atrasado.map(x => x.id), [1, 2]);
    assert.equal(m.atrasado[0].etiqueta, 'Revisión');
    assert.equal(m.sin_plazo[0].etiqueta, 'Asiento');
});

await test('el plazo dicho en castellano', () => {
    assert.equal(textoDePlazo(0), 'vence hoy');
    assert.equal(textoDePlazo(-1), 'venció hace 1 día');
    assert.equal(textoDePlazo(-4), 'venció hace 4 días');
    assert.equal(textoDePlazo(1), 'vence en 1 día');
    assert.equal(textoDePlazo(null), 'sin plazo');
});

console.log(`\nportadaObra: ${pass} pasan, ${fail} fallan`);
if (fail) process.exit(1);
