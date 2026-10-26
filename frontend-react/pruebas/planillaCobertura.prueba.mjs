// Banco de lib/planillaCobertura.js — node frontend-react/pruebas/planillaCobertura.prueba.mjs
import { coberturaDelItemizado, estadoDeElemento, ESTADOS, capituloDe } from '../src/lib/planillaCobertura.js';
import { indiceDeItemizado } from '../src/lib/planillaItemizado.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };

// Itemizado mínimo, como el de PQ-08: capítulo 06 y 05 con sus partidas.
const indice = indiceDeItemizado([
    { item: '05', descripcion: 'ESTRUCTURAS', unidad: '' },
    { item: '05.15.03.05', descripcion: 'ACERO DE REFUERZO FY=4200', unidad: 'kg' },
    { item: '06', descripcion: 'DRENAJE URBANO', unidad: '' },
    { item: '06.05.02.04.03', descripcion: 'BUZON TIPO T2', unidad: 'und' },
    { item: '06.02.01.03.05', descripcion: 'INSTALACION DE TUBERIA HDPE', unidad: 'm' },
]);
// Diccionario como el que deduce la Planilla: dos líneas (sin número y 1).
const dic = {
    lineas: { '': { codigo: 'D::Cod', nombre: 'D::Nom', unidad: 'D::Und' }, '1': { codigo: 'D::Cod1', nombre: 'D::Nom1', unidad: 'D::Und1' } },
    nativas: {}, itemizado: indice,
};
const fila = (id, cat, lineas = {}) => ({ id, 'Revit Category': cat, ...lineas });
const filas = [
    fila('a', 'Barras', { 'D::Cod': '05.15.03.05', 'D::Und': 'kg' }),                         // exacta
    fila('b', 'Tuberías', { 'D::Cod1': '06.02.01.03.05', 'D::Und1': 'm' }),                   // exacta (línea 1)
    fila('c', 'Genérico', { 'D::Cod': '06.05.02.04.03.08', 'D::Nom': 'FUSTE' }),              // subpartida
    fila('d', 'Genérico', { 'D::Cod': '09.01.01', 'D::Nom': 'OTRA COSA' }),                   // fuera
    fila('e', 'Genérico', { 'D::Nom': 'SOLO NOMBRE' }),                                       // fuera (sin código)
    fila('f', 'Suelos'),                                                                       // sin
    fila('g', 'Suelos'),                                                                       // sin
    fila('h', 'Muros'),                                                                        // sin
    fila('i', 'Mixto', { 'D::Cod': '09.01.01', 'D::Cod1': '05.15.03.05' }),                   // exacta gana a fuera
    fila('j', 'Mixto', { 'D::Cod': '05.15.03.05', 'D::Cod1': '06.02.01.03.05' }),             // dos capítulos
];
const clave = f => f.id;

titulo('ESTADO DE CADA ELEMENTO (el mejor de sus líneas)');
const est = id => estadoDeElemento(filas.find(f => f.id === id), dic, indice).estado;
ok('código del itemizado → exacta', est('a') === 'exacta' && est('b') === 'exacta');
ok('código hijo de un ítem → subpartida', est('c') === 'subpartida');
ok('código ajeno → fuera', est('d') === 'fuera');
ok('línea sin código → fuera (tiene partida, pero no se puede ubicar)', est('e') === 'fuera');
ok('sin líneas → sin', est('f') === 'sin');
ok('una línea buena basta: exacta gana a fuera', est('i') === 'exacta');
ok('capítulo = primer tramo del código', capituloDe('05.15.03.05') === '05');

titulo('COBERTURA');
const cob = coberturaDelItemizado(filas, dic, indice, clave);
ok('cuenta todos los elementos, cada uno en un solo estado',
    cob.total === 10 && Object.values(cob.porEstado).reduce((s, l) => s + l.length, 0) === 10);
ok('exacta 4 · subpartida 1 · fuera 2 · sin 3',
    cob.porEstado.exacta.length === 4 && cob.porEstado.subpartida.length === 1 && cob.porEstado.fuera.length === 2 && cob.porEstado.sin.length === 3);
ok('con partida = exacta + subpartida, y el porcentaje', cob.conPartida === 5 && cob.porcentaje === 50);
ok('los «sin partida» por categoría, de más a menos', cob.sinPorCategoria.map(c => `${c.categoria}:${c.claves.length}`).join() === 'Suelos:2,Muros:1');
ok('capítulos con su nombre del itemizado', cob.capitulos.map(c => `${c.codigo} ${c.nombre} ${c.claves.length}`).join('|') === '05 ESTRUCTURAS 2|06 DRENAJE URBANO 2');
ok('un elemento con líneas en dos capítulos no se reparte: «varios»', cob.variosCapitulos.join() === 'j');
ok('sin filas: 0 % y sin dividir por cero', coberturaDelItemizado([], dic, indice, clave).porcentaje === 0);

titulo('LOS ESTADOS');
ok('cuatro estados, en orden, cada uno con su color', ESTADOS.map(e => e.id).join() === 'exacta,subpartida,fuera,sin' && ESTADOS.every(e => /^#[0-9a-f]{6}$/.test(e.color)));

titulo('ESCALA');
const muchas = Array.from({ length: 20000 }, (_, i) => fila(`x${i}`, 'Barras', i % 3 ? { 'D::Cod': '05.15.03.05' } : {}));
const t0 = performance.now();
const grande = coberturaDelItemizado(muchas, dic, indice, clave);
const ms = performance.now() - t0;
ok(`20.000 elementos en ${ms.toFixed(0)} ms (< 1.500)`, ms < 1500 && grande.total === 20000);

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
