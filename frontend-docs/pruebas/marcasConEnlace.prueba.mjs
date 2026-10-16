// Banco de las reglas de foto, sello y referencias: node frontend-docs/pruebas/marcasConEnlace.prueba.mjs
import {
  ESTADOS_DE_SELLO, estadoDeSello, esFoto, nombreParaSubir, textoDeCitas, citasPorPlano,
  etiquetaDeCita, conMarca, marcaDeLaDireccion, siguienteAngulo,
} from '../src/utils/marcasConEnlace.js';

let pass = 0, fail = 0;
function test(nombre, fn) {
  try { fn(); pass++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: String(e) })); }
}
function igual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); }

test('los estados del sello son los del servidor y ninguno es «Aprobado»', () => {
  igual(ESTADOS_DE_SELLO.map(e => e.codigo), ['revisado', 'conforme', 'con_observaciones', 'observado']);
  if (ESTADOS_DE_SELLO.some(e => /aprob/i.test(e.etiqueta))) throw new Error('un sello no aprueba');
  igual(estadoDeSello('observado').etiqueta, 'Observado');
  igual(estadoDeSello('inventado').codigo, 'revisado');
});

test('qué es una foto', () => {
  for (const n of ['IMG_2031.JPG', 'a.jpeg', 'b.png', 'c.webp', 'd.HEIC']) if (!esFoto(n)) throw new Error(n);
  for (const n of ['acta.pdf', 'plano.dwg', '', null, 'foto.jpg.pdf']) if (esFoto(n)) throw new Error(String(n));
});

test('el nombre al subir no pisa otra foto y limpia caracteres prohibidos', () => {
  const ahora = new Date(2026, 9, 16, 9, 5, 7);
  igual(nombreParaSubir('IMG_0001.jpg', ahora), '20261016-090507_IMG_0001.jpg');
  igual(nombreParaSubir('a/b:c?.png', ahora), '20261016-090507_a_b_c_.png');
  igual(nombreParaSubir('', ahora), '20261016-090507_foto.jpg');
});

test('texto de las referencias', () => {
  igual([textoDeCitas(0), textoDeCitas(1), textoDeCitas(3)], ['Sin referencias', '1 referencia', '3 referencias']);
});

test('«Citado en» agrupa por plano sin repetirlo', () => {
  const g = citasPorPlano([
    { marca: 1, plano: { id: 'A', nombre: 'DR-803.pdf' } },
    { marca: 2, plano: { id: 'B', nombre: 'DR-804.pdf' } },
    { marca: 3, plano: { id: 'A', nombre: 'DR-803.pdf' } },
    { marca: 4 },
  ]);
  igual(g.map(x => [x.plano.id, x.marcas.map(m => m.marca)]), [['A', [1, 3]], ['B', [2]]]);
});

test('una cita restringida no enseña su nombre', () => {
  igual(etiquetaDeCita({ id: 'x', restringido: true }), 'Documento sin acceso para ti');
  igual(etiquetaDeCita({ id: 'x', eliminado: true }), 'Documento eliminado');
  igual(etiquetaDeCita({ id: 'x', nombre: 'Informe.pdf' }), 'Informe.pdf');
});

test('la dirección lleva página y marca, y se lee igual', () => {
  const s = conMarca('?obra=1&documento=abc&pagina=9', { pagina: 2, marca: 41 });
  igual(s, '?obra=1&documento=abc&pagina=2&marca=41');
  igual(marcaDeLaDireccion(s), { pagina: 2, marca: '41' });
  igual(marcaDeLaDireccion('?obra=1&pagina=0'), { pagina: null, marca: null });
  igual(conMarca('?obra=1&marca=3', {}), '?obra=1');
});

test('la orientación gira en 8 rumbos y vuelve a 0', () => {
  igual([siguienteAngulo(0), siguienteAngulo(315), siguienteAngulo(0, -45)], [45, 0, 315]);
});

console.log(JSON.stringify({ suite: 'marcasConEnlace', pass, fail }));
if (fail) process.exit(1);
