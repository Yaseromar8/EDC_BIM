// Banco de lib/inventoryExport.js — node frontend-react/pruebas/inventoryExport.prueba.mjs
import * as X from '../src/lib/inventoryExport.js';
import * as T from '../src/lib/inventoryTabla.js';
import * as XLSX from 'xlsx';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Una tabla como la de Drenaje, tras los filtros de la tabla y el orden.
const filas = [
    { Name: 'Losa [1]', 'Cotas::Área': '4.112 m^2', 'Cotas::Volumen': '1.028 m^3', Vaciado_Nro: '001', Fin: '20261024', Zona: 'PAÑO 1', dbId: 'a1' },
    { Name: 'Muro [2]', 'Cotas::Área': '8.887 m^2', 'Cotas::Volumen': '1.927 m^3', Vaciado_Nro: '002', Fin: '20261025', Zona: 'PAÑO 1', dbId: 'a2' },
    { Name: 'Tubo [3]', 'Cotas::Área': '2 kg', 'Cotas::Volumen': '', Vaciado_Nro: '010', Fin: '', Zona: '', dbId: 'a3' },
    { Name: 'Barra [4]', 'Cotas::Área': '1.5 m^2', 'Cotas::Volumen': '0.5 m^3', Vaciado_Nro: '', Fin: '20261101', Zona: 'PAÑO 2', dbId: 'a4' },
];
const columnas = ['Name', 'Cotas::Área', 'Cotas::Volumen', 'Vaciado_Nro', 'Fin', 'Zona', 'dbId'].map(k => ({ key: k, header: T.etiquetaDeColumna(k) }));
const tipos = Object.fromEntries(columnas.map(c => [c.key, T.tipoDeColumna(filas, c.key)]));
const calculos = { 'Cotas::Área': 'suma', 'Cotas::Volumen': 'suma' };

console.log('\nCELDAS');
ok('número con la unidad de su columna → número', X.celdaParaExcel('4.112 m^2', { tipo: 'numero', unidad: 'm²' }) === 4.112);
ok('número con otra unidad → texto (no entra en la suma de Excel)', X.celdaParaExcel('2 kg', { tipo: 'numero', unidad: 'm²' }) === '2 kg');
ok('código con ceros a la izquierda → texto', X.celdaParaExcel('001', { tipo: 'numero', unidad: '' }) === '001');
const f = X.celdaParaExcel('20261024', { tipo: 'fecha' });
ok('fecha → Date a medianoche local del mismo día', f instanceof Date && f.getFullYear() === 2026 && f.getMonth() === 9 && f.getDate() === 24 && f.getHours() === 0);
ok('vacío → celda vacía', X.celdaParaExcel(null) === '' && X.celdaParaExcel('  ') === '');
ok('texto tal cual', X.celdaParaExcel('PAÑO 10', { tipo: 'texto' }) === 'PAÑO 10');
ok('pulgadas siguen siendo texto', X.celdaParaExcel('3/8"', { tipo: 'texto' }) === '3/8"');
ok('cabecera con la unidad', X.cabeceraDeColumna(columnas[1], tipos['Cotas::Área']) === 'Cotas › Área (m²)');

console.log('\nHOJA INVENTARIO');
let libro = X.libroDeLaTabla({ filas, columnas, tipos, calculos, criterios: { totalTrasFilters: 8378 } });
let inv = libro[0].filas;
ok('sin grupos, dos hojas: Inventario y Criterios', igual(libro.map(h => h.nombre), ['Inventario', 'Criterios']));
ok('cabecera = columnas visibles, con unidad', igual(inv[0], ['Name', 'Cotas › Área (m²)', 'Cotas › Volumen (m³)', 'Vaciado_Nro', 'Fin', 'Zona', 'dbId']));
ok('las filas, en el orden recibido', igual(inv.slice(1, 5).map(r => r[0]), ['Losa [1]', 'Muro [2]', 'Tubo [3]', 'Barra [4]']));
ok('el autofiltro acaba en la última fila de datos', libro[0].filtroHasta === 5);
const calc = inv[inv.length - 2], res = inv[inv.length - 1];
ok('fila de cálculo con su nombre', calc[0] === 'Cálculo' && calc[1] === 'Suma' && calc[2] === 'Suma');
ok('la suma no mezcla unidades: el «2 kg» se queda fuera de m²', res[1] !== 4.112 + 8.887 + 1.5 + 2 && typeof res[1] === 'string' && res[1].includes('m²') && res[1].includes('kg'));
ok('volumen: un solo tipo de unidad → número', Math.abs(res[2] - (1.028 + 1.927 + 0.5)) < 1e-9);
ok('la etiqueta dice cuántas filas', res[0] === 'Resultado (4 filas)');
ok('mismo número que el pie de la pantalla (Σ 3.46 m³)', res[2] === T.calcular(filas, 'Cotas::Volumen', 'suma').porUnidad['m³'] && T.textoDeResultado(T.calcular(filas, 'Cotas::Volumen', 'suma')) === 'Σ 3.46 m³');

console.log('\nAGRUPADO');
libro = X.libroDeLaTabla({ filas, columnas, tipos, calculos, niveles: ['Zona'], criterios: {} });
inv = libro[0].filas;
ok('hoja de totales por grupo cuando hay grupos', igual(libro.map(h => h.nombre), ['Inventario', 'Totales por grupo', 'Criterios']));
ok('una columna por nivel delante', inv[0][0] === 'Grupo · Zona' && inv[1][0] === 'PAÑO 1');
ok('filas en el orden de los grupos, «(sin valor)» al final', igual(inv.slice(1, 5).map(r => r[1]), ['Losa [1]', 'Muro [2]', 'Barra [4]', 'Tubo [3]']) && inv[4][0] === '(sin valor)');
const tg = libro[1].filas;
ok('totales por grupo: cabecera', igual(tg[0], ['Zona', 'Elementos', 'Suma · Cotas › Área (m²)', 'Suma · Cotas › Volumen (m³)']));
ok('totales por grupo: PAÑO 1 con 2 elementos y su volumen', tg[1][0] === 'PAÑO 1' && tg[1][1] === 2 && Math.abs(tg[1][3] - 2.955) < 1e-9);
libro = X.libroDeLaTabla({ filas, columnas, tipos, calculos, niveles: ['Zona', 'Vaciado_Nro'], criterios: {} });
const tg2 = libro[1].filas;
ok('dos niveles: subtotal del grupo y luego sus hijos', tg2[1][0] === 'PAÑO 1' && tg2[1][1] === '' && tg2[1][2] === 2 && tg2[2][0] === 'PAÑO 1' && tg2[2][1] === '001');

console.log('\nCRITERIOS');
libro = X.libroDeLaTabla({
    filas, columnas, tipos, calculos, niveles: ['Zona'],
    criterios: {
        totalTrasFilters: 8378, soloConMetrado: true, camposSuma: ['Cotas::Área'], ambito: 'Frente Drenaje Urbano',
        orden: [{ campo: 'Cotas::Volumen', dir: 'desc' }],
        filtroTabla: { modo: 'y', reglas: [{ campo: 'Cotas::Área', op: '>', valor: '1' }, { campo: 'Name', op: 'contiene', valor: 'muro' }, { campo: 'Name', op: 'es', valor: '' }] },
    },
});
const cr = Object.fromEntries(libro[2].filas.slice(1).map(r => [r[0], r[1]]));
ok('filas exportadas de cuántas', cr['Filas exportadas'] === '4 de 8378 (tras Filters)');
ok('filtro legible (la regla a medio escribir no cuenta)', cr['Filtros de la tabla'] === 'Cotas › Área > 1 y Name contiene muro');
ok('solo con metrado y sus columnas', cr['Solo con metrado'] === 'sí · cantidad ≠ 0 en Cotas › Área');
ok('orden', cr['Orden'] === 'Cotas › Volumen ↓');
ok('agrupado', cr['Agrupado por'] === 'Zona');
ok('ámbito', cr['Ámbito'] === 'Frente Drenaje Urbano');
const conBusqueda = X.libroDeLaTabla({ filas, columnas, tipos, calculos, criterios: { busqueda: 'DN 1000\nDN 1500', campoBusqueda: 'Datos::03_05_DSI_CodigoDePartida' } });
const crb = Object.fromEntries(conBusqueda[conBusqueda.length - 1].filas.slice(1).map(r => [r[0], r[1]]));
ok('la búsqueda consta en criterios', crb['Búsqueda'] === 'DN 1000 | DN 1500 (solo en Datos › 03_05_DSI_CodigoDePartida)');
ok('los cálculos, una línea por tipo', cr['Cálculo · Suma'] === '2 columnas: Cotas › Área (m²); Cotas › Volumen (m³)');
const ruido = X.libroDeLaTabla({ filas: Array.from({ length: 10 }, () => ({ v: '4.5245 m^3' })), columnas: [{ key: 'v', header: 'v' }], tipos: { v: { tipo: 'numero', unidad: 'm³' } }, calculos: { v: 'suma' } })[0].filas;
ok('sin ruido de coma flotante en las sumas (10 × 4.5245 = 45.245)', ruido[ruido.length - 1][0] === 45.245);
ok('filtro en O y anidado', T.describirFiltro({ modo: 'o', reglas: [{ campo: 'A', op: 'vacio' }, { modo: 'y', reglas: [{ campo: 'B', op: 'entre', valor: '1', valor2: '2' }] }] }) === 'A está vacío o (B entre 1 y 2)');

console.log('\nVUELTA COMPLETA POR EXCEL (misma librería que la pantalla)');
libro = X.libroDeLaTabla({ filas, columnas, tipos, calculos, criterios: {} });
const wb = XLSX.utils.book_new();
for (const h of libro) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(h.filas, { cellDates: true, dateNF: 'dd/mm/yyyy' }), h.nombre);
const leido = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellDates: true }), { cellDates: true });
const hoja = leido.Sheets['Inventario'];
ok('el área queda como número en Excel', hoja.B2.t === 'n' && hoja.B2.v === 4.112);
ok('el código 001 queda como texto', hoja.D2.t === 's' && hoja.D2.v === '001');
ok('la fecha queda como fecha y del mismo día', hoja.E2.t === 'd' && hoja.E2.v.getDate() === 24 && hoja.E2.v.getMonth() === 9);
ok('el «2 kg» queda como texto', hoja.B4.t === 's');

console.log('\nRENDIMIENTO (20.000 filas × 40 columnas)');
const grandes = Array.from({ length: 20000 }, (_, i) => Object.fromEntries(Array.from({ length: 40 }, (_, j) => [`C${j}`, j % 3 ? `${(i % 97) / 10} m^3` : `PAÑO ${i % 80}`])));
const cols = Array.from({ length: 40 }, (_, j) => ({ key: `C${j}`, header: `C${j}` }));
const tps = Object.fromEntries(cols.map(c => [c.key, T.tipoDeColumna(grandes.slice(0, 1500), c.key)]));
let t0 = performance.now();
const grande = X.libroDeLaTabla({ filas: grandes, columnas: cols, tipos: tps, calculos: { C1: 'suma', C2: 'suma' }, niveles: ['C0'], criterios: {} });
const tLibro = performance.now() - t0;
console.log(`  hojas preparadas en ${tLibro.toFixed(0)} ms (${grande[0].filas.length} filas)`);
ok('preparar 20.000 × 40 < 3 s', tLibro < 3000);

console.log(`\n${total - fallos}/${total} ${fallos ? 'CON FALLOS' : 'en verde'}\n`);
process.exit(fallos ? 1 : 0);
