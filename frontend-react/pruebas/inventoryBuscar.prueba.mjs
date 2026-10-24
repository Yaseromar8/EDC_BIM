// Banco de lib/inventoryBuscar.js — node frontend-react/pruebas/inventoryBuscar.prueba.mjs
import * as B from '../src/lib/inventoryBuscar.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Textos reales: el parámetro de Revit de Drenaje y las líneas del Excel del presupuesto.
const P = 'Datos::03_05_DSI_CodigoDePartida';
const filas = [
    { Name: 'Tubo 1', [P]: 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1000 MM, INC. PRUEBA HIDRAULICA', 'Cotas::Longitud': '70.1 m' },
    { Name: 'Tubo 2', [P]: 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1000 MM, INC. PRUEBA HIDRAULICA', 'Cotas::Longitud': '68.0 m' },
    { Name: 'Tubo 3', [P]: 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1600 MM, INC. PRUEBA HIDRAULICA', 'Cotas::Longitud': '28.99 m' },
    { Name: 'Tubo 4', [P]: 'INSTALACION DE TUBERIA CORRUGADA PEAD NTP 222.300 DN 250 MM, INC. PRUEBA HIDRAULICA', 'Cotas::Longitud': '9 m' },
    { Name: 'Muro', [P]: '06.05.01.04.01', 'Datos::Zona': 'DN 1000 MM' },
    { Name: 'Losa', [P]: '06.05.01.04.010' },
];
const campos = ['Name', P, 'Cotas::Longitud', 'Datos::Zona'];
const indice = B.crearIndice(filas, campos);
const nombres = r => [...r.filas].sort((a, b) => a - b).map(i => filas[i].Name);

console.log('\nFORMA COMPACTA');
ok('sin tildes, mayúsculas, comas, puntos ni espacios', B.compacto('  Instalación de  TUBERÍA, DN 1000 mm. ') === 'instalaciondetuberiadn1000mm');
ok('los números se conservan', B.compacto('06.05.01.04.01') === '0605010401');

console.log('\nVALOR COMPLETO');
let r = B.buscar(indice, 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1000 MM, INC. PRUEBA HIDRAULICA');
ok('la descripción del Excel encuentra sus 2 tubos', igual(nombres(r), ['Tubo 1', 'Tubo 2']) && r.lineas[0].modo === 'completo');
r = B.buscar(indice, 'instalación de tubería estructurada hdpe ntp 21138 2 dn 1000 mm inc prueba hidráulica');
ok('con tildes, minúsculas y sin la coma ni el guion: mismo resultado', igual(nombres(r), ['Tubo 1', 'Tubo 2']));
r = B.buscar(indice, 'INSTALACION  DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1000 MM,, INC. PRUEBA HIDRAULICA ');
ok('con espacios y comas de más: mismo resultado', igual(nombres(r), ['Tubo 1', 'Tubo 2']));
r = B.buscar(indice, '06.05.01.04.01');
ok('un código: solo el valor completo (no 06.05.01.04.010)', igual(nombres(r), ['Muro']) && r.lineas[0].modo === 'completo');
ok('dice en qué parámetro', igual(r.porCampo, [[P, 1]]));

console.log('\nCONTIENE (si nada coincide entero)');
r = B.buscar(indice, 'DN 1000');
ok('«DN 1000» encuentra lo que lo contiene, en cualquier parámetro', igual(nombres(r), ['Tubo 1', 'Tubo 2', 'Muro']) && r.lineas[0].modo === 'contiene');
ok('y separa por parámetro', igual(r.porCampo, [[P, 2], ['Datos::Zona', 1]]));
r = B.buscar(indice, 'DN 1000', { soloCampo: P });
ok('limitado a un parámetro', igual(nombres(r), ['Tubo 1', 'Tubo 2']));
r = B.buscar(indice, 'xy');
ok('menos de 3 caracteres: no se busca por contenido', r.filas.size === 0 && r.lineas[0].modo === 'nada');

console.log('\nVARIAS LÍNEAS Y FILAS DE EXCEL');
r = B.buscar(indice, 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1600 MM, INC. PRUEBA HIDRAULICA\nINSTALACION DE TUBERIA CORRUGADA PEAD NTP 222.300 DN 250 MM, INC. PRUEBA HIDRAULICA');
ok('dos líneas = cualquiera de ellas, con su recuento', igual(nombres(r), ['Tubo 3', 'Tubo 4']) && igual(r.lineas.map(l => l.n), [1, 1]));
const filaExcel = '1.06.02.01.03\tINSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1600 MM, INC. PRUEBA HIDRAULICA\tm\t30.70';
ok('de una fila de Excel se toma la descripción', B.lineasDeBusqueda(filaExcel)[0].startsWith('INSTALACION'));
r = B.buscar(indice, filaExcel);
ok('y encuentra su tubo', igual(nombres(r), ['Tubo 3']));
ok('las líneas vacías no cuentan', B.lineasDeBusqueda('\n  \nDN 1000\n').length === 1);

console.log('\nPARECIDOS (lo pegado no está escrito igual)');
const excel1000 = 'PRUEBA HIDRAULICA DE TUBERIA HDPE DN 1000 MM A ZANJA TAPADA';
r = B.buscar(indice, excel1000);
ok('la línea de prueba hidráulica no coincide ni está contenida', r.filas.size === 0);
let par = B.parecidos(indice, excel1000);
ok('propone la instalación DN 1000 (2 tubos) como parecido', par.length >= 1 && par[0].valor.includes('DN 1000') && par[0].n === 2 && par[0].campo === P);
ok('nunca propone DN 1600 ni DN 250 (los números mandan)', !par.some(p => /DN (1600|250)/.test(p.valor)));
ok('el parecido va de 0 a 100', par[0].puntos > 40 && par[0].puntos <= 100);
ok('DN 1000 frente a DN 1500: 0 aunque las palabras sean iguales', B.parecido('TUBERIA HDPE DN 1000', 'TUBERIA HDPE DN 1500') === 0);
r = B.buscar(indice, excel1000, { confirmados: [par[0].clave] });
ok('al confirmarlo entran sus 2 tubos', igual(nombres(r), ['Tubo 1', 'Tubo 2']) && r.confirmados === 2);
ok('una sola palabra no busca parecidos', B.parecidos(indice, 'hdpe').length === 0);
ok('un número suelto («1000ø») no se parece a una descripción entera', B.parecido(excel1000, '1000ø') < 0.4);
ok('pero «DN 1000» sí se parece a «1000» (mitad de lo escrito)', B.parecido('DN 1000', '1000') > 0.6);

console.log('\nSOLO EN LO SELECCIONADO');
const elegidos = new Set([0, 2]); // Tubo 1 y Tubo 3
r = B.buscar(indice, 'DN 1000', { permitidas: elegidos });
ok('busca solo dentro de lo seleccionado', igual(nombres(r), ['Tubo 1']));
par = B.parecidos(indice, excel1000, { permitidas: elegidos });
ok('y los parecidos cuentan solo lo seleccionado', par.length === 1 && par[0].n === 1);
r = B.buscar(indice, excel1000, { permitidas: elegidos, confirmados: [par[0].clave] });
ok('confirmado dentro de la selección: solo esos', igual(nombres(r), ['Tubo 1']));

console.log('\nRENDIMIENTO (8.378 filas × 70 valores, como Drenaje)');
const grandes = Array.from({ length: 8378 }, (_, i) => Object.fromEntries(Array.from({ length: 70 }, (_, j) => [`G::P${j}`, j === 3 ? `INSTALACION DE TUBERIA DN ${(i % 20) * 50} MM, INC. PRUEBA` : `valor ${i % 97} ${j}`])));
const cg = Object.keys(grandes[0]);
let t0 = performance.now();
const ig = B.crearIndice(grandes, cg);
const tIndice = performance.now() - t0;
t0 = performance.now();
const rg = B.buscar(ig, 'Instalación de tubería DN 500 MM, inc. prueba');
const tBusca = performance.now() - t0;
console.log(`  índice ${tIndice.toFixed(0)} ms · búsqueda ${tBusca.toFixed(0)} ms (${rg.filas.size} filas)`);
ok('índice < 2,5 s', tIndice < 2500);
ok('encuentra las 419 filas de DN 500 (1 de cada 20)', rg.filas.size === 419 && rg.lineas[0].modo === 'completo');
ok('búsqueda < 300 ms', tBusca < 300);

console.log(`\n${total - fallos}/${total} ${fallos ? 'CON FALLOS' : 'en verde'}\n`);
process.exit(fallos ? 1 : 0);
