// Banco de las reglas de foto, sello y referencias: node frontend-docs/pruebas/marcasConEnlace.prueba.mjs
import {
  ESTADOS_DE_SELLO, estadoDeSello, ESTADOS_DE_OBSERVACION, estadoDeObservacion, observacionViva,
  accionesDeObservacion, aQuienLeToca, fechaLimitePorDefecto, fechaDeDia, textoDelEvento,
  esFoto, nombreParaSubir, textoDeCitas, citasPorPlano,
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

test('la observación usa los actos de la incidencia, en femenino y con colores D-24', () => {
  igual(ESTADOS_DE_OBSERVACION.map(e => e.codigo), ['Abierto', 'Reabierto', 'Corregido', 'Verificado', 'Anulado']);
  igual(estadoDeObservacion('Corregido').etiqueta, 'Corregida');
  igual(estadoDeObservacion('inventado').codigo, 'Abierto');
  const D24 = ['#d97757', '#b93535', '#6a9bcc', '#64744e', '#b0aea5'];
  if (ESTADOS_DE_OBSERVACION.some(e => !D24.includes(e.color))) throw new Error('color fuera de D-24');
  if (!observacionViva({ estado: 'Corregido' }) || observacionViva({ estado: 'Verificado' }) || observacionViva(null)) {
    throw new Error('viva = Abierta, Reabierta o Corregida');
  }
});

test('cada acto es de quien le toca: corrige el responsable, verifica quien la levantó', () => {
  const obs = { estado: 'Abierto', responsable_id: 9, verificador_id: 7, autor_id: 7 };
  igual(accionesDeObservacion(obs, 9), { corregir: true, verificar: false, anular: false });
  igual(accionesDeObservacion(obs, '7'), { corregir: false, verificar: false, anular: true });
  igual(accionesDeObservacion({ ...obs, estado: 'Corregido' }, 7), { corregir: false, verificar: true, anular: false });
  igual(accionesDeObservacion({ ...obs, estado: 'Corregido' }, 9), { corregir: false, verificar: false, anular: false });
  igual(accionesDeObservacion({ ...obs, estado: 'Verificado' }, 7), { corregir: false, verificar: false, anular: false });
  igual(accionesDeObservacion(obs, null), { corregir: false, verificar: false, anular: false });
  igual(aQuienLeToca({ estado: 'Reabierto', responsable: 'Luis' }), 'Corregir: Luis');
  igual(aQuienLeToca({ estado: 'Corregido', verificador: 'Ana' }), 'Verificar: Ana');
});

test('fecha límite por defecto a 7 días y fechas de día sin corrimiento', () => {
  igual(fechaLimitePorDefecto(new Date(2026, 9, 28)), '2026-11-04');
  igual(fechaLimitePorDefecto(new Date(2026, 11, 30), 3), '2027-01-02');
  if (!/15/.test(fechaDeDia('2099-01-15'))) throw new Error(fechaDeDia('2099-01-15'));
  igual(fechaDeDia('mal'), '');
  igual(textoDelEvento({ event: 'reopened' }), 'Rechazó la corrección y la reabrió');
  igual(textoDelEvento({ event: 'raro' }), 'Cambio');
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
