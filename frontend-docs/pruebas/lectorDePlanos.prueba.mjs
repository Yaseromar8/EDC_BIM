// Banco de utils/lectorDePlanos.js — chip de versión y ‹ › que siguen a la vista.
// node frontend-docs/pruebas/lectorDePlanos.prueba.mjs
import assert from 'node:assert/strict';
import { hermanosDelLector, chipDeVersion, verdadDelPlano, fechaCorta, modoDelDocumento, cajetinDelDocumento, aplanarIndice } from '../src/utils/lectorDePlanos.js';

let ok = 0;
const casos = [];
const caso = (nombre, fn) => casos.push([nombre, fn]);
const ETIQUETA = c => ({ WIP: 'Borrador', SHARED: 'Compartido', PUBLISHED: 'Publicado' }[c] || '');

const carpeta = [{ name: 'A.pdf' }, { name: 'B.dwg' }, { name: 'C.PDF' }];
const vista = [{ name: 'X.pdf' }, { name: 'Y.pdf' }, { name: 'Z.xlsx' }];

caso('desde una carpeta, ‹ › recorre los PDF de la carpeta', () => {
  assert.deepEqual(hermanosDelLector({ enVista: false, filasDeVista: vista, archivos: carpeta }).map(f => f.name),
    ['A.pdf', 'C.PDF']);
});

caso('desde una vista, ‹ › recorre los PDF de LA VISTA, no los de la carpeta', () => {
  assert.deepEqual(hermanosDelLector({ enVista: true, filasDeVista: vista, archivos: carpeta }).map(f => f.name),
    ['X.pdf', 'Y.pdf']);
  assert.deepEqual(hermanosDelLector({ enVista: true, filasDeVista: null, archivos: carpeta }), []);
});

caso('versión vigente: «V2 · P02 · Compartido»', () => {
  const c = chipDeVersion({ vv: { version_number: 2 }, file: { version: 2, codigo_revision: 'P02', status: 'SHARED' },
                            actual: 2, etiquetaDeEstado: ETIQUETA });
  assert.equal(c.texto, 'V2 · P02 · Compartido');
  assert.equal(c.esVigente, true);
});

caso('versión anterior: su revisión y «versión anterior», nunca el estado del documento', () => {
  const c = chipDeVersion({ vv: { version_number: 1, codigo_revision: 'P01' },
                            file: { version: 2, codigo_revision: 'C01', status: 'PUBLISHED' },
                            actual: 2, etiquetaDeEstado: ETIQUETA });
  assert.equal(c.texto, 'V1 · P01 · versión anterior');
  assert.equal(c.esVigente, false);
  assert.match(c.titulo, /no la vigente \(V2\)/);
});

caso('una anterior sin revisión no hereda la del documento', () => {
  const c = chipDeVersion({ vv: { version_number: 1 }, file: { version: 3, codigo_revision: 'C02', status: 'PUBLISHED' },
                            actual: 3, etiquetaDeEstado: ETIQUETA });
  assert.equal(c.texto, 'V1 · versión anterior');
});

caso('sin historial cargado todavía: el documento tal cual', () => {
  assert.equal(chipDeVersion({ file: { version: 1, status: 'WIP' }, etiquetaDeEstado: ETIQUETA }).texto, 'V1 · Borrador');
  assert.equal(chipDeVersion({}).texto, 'V1');
});

const HIST = [
  { version_number: 3, updated: '2026-10-10T15:00:00Z', sha256: 'a3f29c1e00000000000000000000000000000000000000000000000000007d40' },
  { version_number: 2, updated: '2026-10-02T15:00:00Z', sha256: null },
  { version_number: 1, updated: '2026-09-20T15:00:00Z' },
];
const FRASE = c => ({ A1: 'Apto para construir' }[c] || '');

caso('banda: vigente con código → «Versión vigente · V3 de 3», «A1 Apto para construir», huella corta', () => {
  const v = verdadDelPlano({ vv: HIST[0], file: { version: 3, status: 'PUBLISHED', codigo_idoneidad: 'A1' },
                             historial: HIST, etiquetaDeEstado: ETIQUETA, fraseDeIdoneidad: FRASE });
  assert.equal(v.tipo, 'vigente');
  assert.deepEqual(v.vigencia, { titulo: 'Versión vigente', detalle: 'V3 de 3', tono: 'bien' });
  assert.deepEqual([v.uso.codigo, v.uso.titulo, v.uso.detalle], ['A1', 'Apto para construir', 'Publicado']);
  assert.equal(v.huella.titulo, 'Huella registrada');
  assert.equal(v.huella.detalle, 'a3f2…7d40');
});

caso('banda: sin código, el estado dice para qué sirve (Compartido no es para construir)', () => {
  const v = verdadDelPlano({ vv: HIST[0], file: { version: 3, status: 'SHARED' }, historial: HIST, etiquetaDeEstado: ETIQUETA });
  assert.deepEqual([v.uso.codigo, v.uso.titulo, v.uso.detalle],
    [null, 'Compartido', 'para revisión y coordinación · no es para construir']);
});

caso('banda: una versión anterior la sustituyó la SIGUIENTE, con su fecha; nunca se llama vigente', () => {
  const v = verdadDelPlano({ vv: HIST[2], file: { version: 3, status: 'PUBLISHED' }, historial: HIST });
  assert.equal(v.tipo, 'anterior');
  assert.equal(v.aviso, 'V1 · sustituida el 02-oct-2026 por V2.');
  assert.equal(v.boton, 'Ir a la vigente (V3)');
  assert.deepEqual(v.sello, { titulo: 'SUSTITUIDA', detalle: 'por V2 el 02-oct-2026' });
});

caso('banda: versión sin huella no dice «registrada»; archivado no dice «vigente»', () => {
  const sin = verdadDelPlano({ vv: HIST[1], file: { version: 2 }, historial: [HIST[1], HIST[2]] });
  assert.equal(sin.huella.titulo, 'Sin huella');
  assert.equal(sin.huella.completa, null);
  const arch = verdadDelPlano({ vv: HIST[0], file: { version: 3, status: 'ARCHIVED' }, historial: HIST });
  assert.equal(arch.vigencia.titulo, 'Archivado');
});

caso('banda: sin nada cargado no inventa; fecha corta estable', () => {
  assert.equal(verdadDelPlano({}), null);
  assert.equal(verdadDelPlano({ file: { version: 2, status: 'SHARED' } }).huella, null);
  assert.equal(fechaCorta('2026-10-02T15:00:00Z'), '02-oct-2026');
  assert.equal(fechaCorta(null), '');
  assert.equal(fechaCorta('no es fecha'), '');
});

const PLANO = '500125-CSSP001-000-XX-DR-ES-004120.pdf';
const INFORME = '500125-CSSP001-000-XX-RP-GN-000312.pdf';

caso('modo: el tipo del código manda (DR = plano, RP = documento); sin código, la forma de la hoja', () => {
  assert.equal(modoDelDocumento({ nombre: PLANO }), 'plano');
  assert.equal(modoDelDocumento({ nombre: INFORME, apaisada: true }), 'documento');
  assert.equal(modoDelDocumento({ nombre: 'acta firmada.pdf', apaisada: true }), 'plano');
  assert.equal(modoDelDocumento({ nombre: 'acta firmada.pdf', apaisada: false }), 'documento');
  assert.equal(modoDelDocumento({ nombre: 'acta firmada.pdf' }), 'documento');
});

caso('modo en todos los formatos: el formato limita y el código elige (ESTANDAR_LDA §5.2)', () => {
  const m = n => modoDelDocumento({ nombre: n });
  assert.equal(m('500125-CSSP001-000-XX-M3-ES-000101.rvt'), 'modelo');
  assert.equal(m('torre.ifc'), 'modelo');
  assert.equal(m('500125-CSSP001-000-XX-DR-ES-000200.dwg'), 'plano');
  assert.equal(m('500125-CSSP001-000-XX-M3-CV-000300.dwg'), 'modelo');
  assert.equal(m('perfil.dwg'), 'plano');
  assert.equal(m('Planilla_metrados_ES.xlsx'), 'tabla');
  assert.equal(m('500125-CSSP001-000-XX-DR-ES-000410.xlsx'), 'tabla');
  assert.equal(m('carta.docx'), 'documento');
  assert.equal(m('foto_campo.JPG'), 'imagen');
  assert.equal(m('recorrido.mp4'), 'imagen');
  assert.equal(m('entrega.zip'), 'archivo');
});

caso('el rótulo del cajetín sigue al modo', () => {
  const r = (modo) => cajetinDelDocumento({ file: { name: 'x.bin' }, modo }).documento.rotulo;
  assert.deepEqual(['plano', 'documento', 'tabla', 'modelo', 'imagen', 'archivo'].map(r),
    ['Plano', 'Documento', 'Planilla', 'Modelo', 'Imagen', 'Archivo']);
});

caso('cajetín vigente: las cinco casillas con su rótulo; el código sin extensión y sus piezas sin inventar nombres', () => {
  const c = cajetinDelDocumento({ vv: { ...HIST[0], codigo_revision: 'C01', updated_by: 'Ana Pérez' },
    file: { name: PLANO, version: 3, status: 'PUBLISHED', codigo_idoneidad: 'A1' },
    historial: HIST, modo: 'plano', etiquetaDeEstado: ETIQUETA, fraseDeIdoneidad: FRASE });
  assert.deepEqual([c.documento.rotulo, c.documento.valor, c.documento.detalle],
    ['Plano', '500125-CSSP001-000-XX-DR-ES-004120', 'Tipo DR · Disciplina ES']);
  assert.deepEqual([c.version.valor, c.version.detalle, c.version.aviso], ['V3 · C01', '10-oct-2026 · Ana Pérez', false]);
  assert.equal(c.estado.valor, 'Publicado');
  assert.deepEqual([c.idoneidad.codigo, c.idoneidad.valor], ['A1', 'Apto para construir']);
  assert.deepEqual([c.vigencia.valor, c.vigencia.detalle, c.vigencia.tono], ['Vigente · V3 de 3', 'huella a3f2…7d40 registrada', 'bien']);
});

caso('cajetín de una versión anterior: estado e idoneidad NO se heredan (R-C1); vigencia en aviso con su botón', () => {
  const c = cajetinDelDocumento({ vv: HIST[2], file: { name: INFORME, version: 3, status: 'PUBLISHED', codigo_idoneidad: 'A1' },
    historial: HIST, etiquetaDeEstado: ETIQUETA, fraseDeIdoneidad: FRASE });
  assert.equal(c.documento.rotulo, 'Documento');
  assert.equal(c.version.aviso, true);
  assert.deepEqual([c.estado.valor, c.idoneidad.valor], ['—', '—']);
  assert.deepEqual([c.vigencia.valor, c.vigencia.detalle, c.vigencia.boton],
    ['Sustituida por V2', 'el 02-oct-2026 · no la uses', 'Ir a la vigente (V3)']);
  assert.ok(c.vigencia.sello);
});

caso('cajetín sin datos: «—» en vez de huecos (R-C3); título solo si la obra lo guarda', () => {
  const c = cajetinDelDocumento({ file: { name: 'carta.pdf' } });
  assert.equal(c.documento.valor, 'carta');
  assert.equal(c.documento.detalle, '—');
  assert.equal(c.idoneidad.valor, '—');
  const t = cajetinDelDocumento({ file: { name: INFORME, metadata: { titulo: 'Ampliación del canal' } } });
  assert.equal(t.documento.detalle, 'Ampliación del canal · Tipo RP · Disciplina GN');
  const s = cajetinDelDocumento({ file: { name: INFORME, version: 1, codigo_idoneidad: 'Z9' }, historial: [{ version_number: 1 }] });
  assert.equal(s.idoneidad.valor, '(sin descripción)');
});

caso('conmutador Vigente | Anterior: la anterior es la que sustituyó la vigente; sin historial, no hay', () => {
  const v = cajetinDelDocumento({ vv: HIST[0], file: { name: PLANO, version: 3 }, historial: HIST });
  assert.deepEqual(v.alternar, { vigente: 3, anterior: 2, enVigente: true, enAnterior: false });
  const a = cajetinDelDocumento({ vv: HIST[1], file: { name: PLANO, version: 3 }, historial: HIST });
  assert.deepEqual(a.alternar, { vigente: 3, anterior: 2, enVigente: false, enAnterior: true });
  const vieja = cajetinDelDocumento({ vv: HIST[2], file: { name: PLANO, version: 3 }, historial: HIST });
  assert.deepEqual([vieja.alternar.enVigente, vieja.alternar.enAnterior], [false, false]);   // V1: ni una ni otra
  assert.equal(cajetinDelDocumento({ file: { name: PLANO, version: 1 }, historial: [HIST[2]] }).alternar, null);
});

caso('índice: los marcadores se aplanan con su nivel y su página; un destino roto no rompe el resto', async () => {
  const items = [
    { title: '1. Antecedentes', dest: 'a', items: [] },
    { title: '2. Análisis', dest: 'b', items: [{ title: '2.1 Caudal', dest: 'c', items: [] }, { title: 'roto', dest: 'x' }] },
  ];
  const paginas = { a: 1, b: 3, c: 3 };
  const r = await aplanarIndice(items, async d => { if (!(d in paginas)) throw new Error('no'); return paginas[d]; });
  assert.deepEqual(r, [
    { titulo: '1. Antecedentes', nivel: 0, pagina: 1 },
    { titulo: '2. Análisis', nivel: 0, pagina: 3 },
    { titulo: '2.1 Caudal', nivel: 1, pagina: 3 },
    { titulo: 'roto', nivel: 1, pagina: null },
  ]);
  assert.deepEqual(await aplanarIndice(null, async () => 1), []);
});

for (const [nombre, fn] of casos) {
  try { await fn(); ok++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: e.message })); }
}
console.log(JSON.stringify({ suite: 'lectorDePlanos', pass: ok, fail: casos.length - ok }));
if (ok !== casos.length) process.exit(1);
