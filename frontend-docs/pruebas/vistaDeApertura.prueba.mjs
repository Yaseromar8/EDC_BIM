// Banco de LA VISTA DE APERTURA (5-nov-2026, docs/archivos/28): node frontend-docs/pruebas/vistaDeApertura.prueba.mjs
//
//   · qué documentos la tienen (CAD y PDF, como el servidor);
//   · la presentación de un CAD: la misma, o la que se llame igual en otra versión, o ninguna (y se avisa);
//   · la vista de un PDF vuelve al MISMO punto en la misma pantalla y al mismo encuadre relativo en otra;
//   · cómo se dice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tipoDeVista, presentacionDeApertura, vistaDeCad, vistaDePdf, encuadreDePdf, escalaDeHojaEntera,
         describirVista } from '../src/utils/vistaDeApertura.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}
const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

await test('la tienen los CAD y los PDF, nada más (lo mismo que el servidor)', () => {
  assert.equal(tipoDeVista('PLANO.DWG'), 'cad');
  assert.equal(tipoDeVista('a.dxf'), 'cad');
  assert.equal(tipoDeVista('LAMINAS.PDF'), 'pdf');
  assert.equal(tipoDeVista('modelo.rvt'), null);
  assert.equal(tipoDeVista('cuadro.xlsx'), null);
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const servidor = readFileSync(join(raiz, 'backend', 'vistas_de_apertura.py'), 'utf8');
  assert.match(servidor, /ES_CAD = re\.compile\(r'\\\.\(dwg\|dxf\)\$'/);
  assert.match(servidor, /ES_PDF = re\.compile\(r'\\\.pdf\$'/);
});

await test('la presentación de un CAD: la misma, o la que se llame igual en otra versión, o ninguna', () => {
  const v = { tipo: 'cad', presentacion: { guid: 'g3', nombre: 'PLANTA-SA' }, camara: {} };
  assert.deepEqual(presentacionDeApertura([{ guid: 'g1', nombre: 'Model' }, { guid: 'g3', nombre: 'PLANTA-SA' }], v),
    { guid: 'g3', motivo: 'misma' });
  // La versión nueva trae otros guid: se busca por el nombre, sin distinguir mayúsculas ni espacios.
  assert.deepEqual(presentacionDeApertura([{ guid: 'n1', nombre: 'Model' }, { guid: 'n7', nombre: ' planta-sa ' }], v),
    { guid: 'n7', motivo: 'por_nombre' });
  assert.deepEqual(presentacionDeApertura([{ guid: 'n1', nombre: 'Model' }], v), { guid: null, motivo: 'no_esta' });
  assert.deepEqual(presentacionDeApertura([], null), { guid: null, motivo: 'no_esta' });
});

await test('la vista de un CAD se arma de lo que dice el visor', () => {
  const vp = { eye: [1, 2, 3], target: [1, 2, 0] };
  assert.deepEqual(vistaDeCad({ guid: 'g3', nombre: 'PLANTA-SA', viewableID: 'L3' }, vp),
    { tipo: 'cad', presentacion: { guid: 'g3', nombre: 'PLANTA-SA', viewable_id: 'L3' }, camara: vp });
  assert.equal(vistaDeCad(null, vp), null);
  assert.equal(vistaDeCad({ guid: 'g3' }, null), null);
});

// Una lámina A1 apaisada a escala 1 (puntos PDF) y dos pantallas.
const BASE = { width: 2384, height: 1684 };
const PORTATIL = { left: 0, top: 80, width: 1280, height: 640 };
const MONITOR = { left: 0, top: 80, width: 2400, height: 1200 };

await test('un PDF vuelve al MISMO punto y la misma escala en la misma pantalla', () => {
  const entera = escalaDeHojaEntera(BASE, PORTATIL.width, PORTATIL.height);
  const escala = entera * 3.1;
  // La hoja desplazada: el centro de la pantalla cae en un punto cualquiera de ella.
  const rectHoja = { left: -1800, top: -900, width: BASE.width * escala, height: BASE.height * escala };
  const v = vistaDePdf({ pagina: 4, rectHoja, rectVista: PORTATIL, base: BASE });
  assert.equal(v.tipo, 'pdf');
  assert.equal(v.pagina, 4);
  cerca(v.zoom, 3.1, 1e-4);
  const e = encuadreDePdf(v, BASE, PORTATIL);
  cerca(e.escala, escala, escala * 1e-4);
  // El punto anotado queda en el centro: la hoja se colocaría con su esquina donde estaba.
  const izquierda = e.punto.clientX - e.punto.ux * e.escala, arriba = e.punto.clientY - e.punto.uy * e.escala;
  cerca(izquierda, rectHoja.left, 0.5);
  cerca(arriba, rectHoja.top, 0.5);
});

await test('en otra pantalla, el mismo encuadre RELATIVO: el mismo punto al centro y el mismo zoom sobre la hoja entera', () => {
  const v = { tipo: 'pdf', pagina: 2, zoom: 2, centro: [0.25, 0.6] };
  const a = encuadreDePdf(v, BASE, PORTATIL), b = encuadreDePdf(v, BASE, MONITOR);
  cerca(a.escala / escalaDeHojaEntera(BASE, PORTATIL.width, PORTATIL.height), 2);
  cerca(b.escala / escalaDeHojaEntera(BASE, MONITOR.width, MONITOR.height), 2);
  assert.deepEqual([b.punto.ux, b.punto.uy], [0.25 * BASE.width, 0.6 * BASE.height]);
  assert.deepEqual([b.punto.clientX, b.punto.clientY], [1200, 680]);
});

await test('lo que no se puede medir no se inventa', () => {
  assert.equal(vistaDePdf({ pagina: 1, rectHoja: null, rectVista: PORTATIL, base: BASE }), null);
  assert.equal(vistaDePdf({ pagina: 1, rectHoja: { left: 0, top: 0, width: 0, height: 0 }, rectVista: PORTATIL, base: BASE }), null);
  assert.equal(encuadreDePdf({ tipo: 'cad' }, BASE, PORTATIL), null);
  assert.equal(encuadreDePdf({ tipo: 'pdf', pagina: 1, zoom: 1, centro: [0.5, 0.5] }, { width: 0 }, PORTATIL), null);
});

await test('cómo se dice', () => {
  assert.equal(describirVista(null), 'la vista por defecto');
  assert.equal(describirVista({ tipo: 'cad', presentacion: { nombre: 'PLANTA-SA' } }), '«PLANTA-SA»');
  assert.equal(describirVista({ tipo: 'pdf', pagina: 4, zoom: 2.5 }), 'hoja 4 · ×2,5');
  assert.equal(describirVista({ tipo: 'pdf', pagina: 1, zoom: 1 }), 'hoja 1');
});

console.log(`\nvistaDeApertura: ${pass} pasan, ${fail} fallan`);
if (fail) process.exit(1);
