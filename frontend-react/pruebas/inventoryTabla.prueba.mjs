/**
 * Banco del motor de la tabla de Inventory (lib/inventoryTabla.js).
 *
 *     node frontend-react/pruebas/inventoryTabla.prueba.mjs
 *
 * Casos tomados de los datos reales de PQT8 (docs/visor/16 y 18): unidades
 * como texto («4.112 m^2»), fechas AAAAMMDD de FinReal, cotas que se promedian.
 */
const T = await import('../src/lib/inventoryTabla.js');

let fallos = 0, total = 0;
const ok = (nombre, cond, detalle = '') => {
    total++;
    if (cond) console.log(`  ok   ${nombre}`);
    else { fallos++; console.log(`  FALLA ${nombre}${detalle ? '  → ' + detalle : ''}`); }
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nLEER VALORES');
ok('número con unidad m^2', igual(T.leerValor('4.112 m^2'), { tipo: 'numero', num: 4.112, unidad: 'm²', texto: '4.112 m^2' }));
ok('número con unidad m^3', T.leerValor('1.028 m^3').unidad === 'm³');
ok('cota en metros', T.leerValor('0.900 m').num === 0.9 && T.leerValor('0.900 m').unidad === 'm');
ok('coma decimal', T.leerValor('27,7025').num === 27.7025);
ok('coma de miles', T.leerValor('1,234.5 kg').num === 1234.5);
ok('fecha AAAAMMDD', T.leerValor('20261024').tipo === 'fecha');
ok('fecha imposible = texto', T.leerValor('20261345').tipo !== 'fecha');
ok('texto', T.leerValor('PAÑO 10').tipo === 'texto');
ok('código con guiones = texto', T.leerValor('05.03.03.05').tipo === 'texto');
ok('vacío', T.leerValor('  ').tipo === 'vacio' && T.leerValor(null).tipo === 'vacio');

const filas = [
    { Name: 'Muro A', Frente: 'PAÑO 10', Vol: '1.028 m^3', Area: '4.112 m^2', Elev: '18.400 m', Fin: '20260924', Mat: 'CONCRETO' },
    { Name: 'Muro B', Frente: 'PAÑO 10', Vol: '0.411 m^3', Area: '3.841 m^2', Elev: '20.000 m', Fin: '20261024', Mat: 'concreto' },
    { Name: 'Losa C', Frente: 'PAÑO 19', Vol: '2.000 m^3', Area: '', Elev: '22.000 m', Fin: '20261024', Mat: 'GAVIÓN' },
    { Name: 'Barra D', Frente: '', Vol: '', Peso: '12 kg', Elev: 'NA', Fin: '', Mat: 'ACERO' },
];

console.log('\nTIPO DE COLUMNA');
ok('Vol es número en m³', igual(T.tipoDeColumna(filas, 'Vol'), { tipo: 'numero', unidad: 'm³', conDato: 3 }));
ok('Fin es fecha', T.tipoDeColumna(filas, 'Fin').tipo === 'fecha');
ok('Frente es texto', T.tipoDeColumna(filas, 'Frente').tipo === 'texto');
ok('Elev con un «NA» de 4 sigue sin ser número (75 % < 90 %)', T.tipoDeColumna(filas, 'Elev').tipo === 'texto');

console.log('\nFILTRAR');
const n = (f) => T.filtrar(filas, f).map(x => x.Name).join(',');
ok('contiene sin tildes ni mayúsculas', n({ reglas: [{ campo: 'Mat', op: 'contiene', valor: 'gavion' }] }) === 'Losa C');
ok('es (igual sin mayúsculas)', n({ reglas: [{ campo: 'Mat', op: 'es', valor: 'Concreto' }] }) === 'Muro A,Muro B');
ok('número >', n({ reglas: [{ campo: 'Vol', op: '>', valor: '1' }] }) === 'Muro A,Losa C');
ok('número entre', n({ reglas: [{ campo: 'Vol', op: 'entre', valor: '0.4', valor2: '1.1' }] }) === 'Muro A,Muro B');
ok('fecha entre (Val. 12: 25-sep a 24-oct)', n({ reglas: [{ campo: 'Fin', op: 'entre', valor: '20260925', valor2: '20261024' }] }) === 'Muro B,Losa C');
ok('fecha antes', n({ reglas: [{ campo: 'Fin', op: 'antes', valor: '20261001' }] }) === 'Muro A');
ok('vacío', n({ reglas: [{ campo: 'Frente', op: 'vacio' }] }) === 'Barra D');
ok('uno de (lista con ;)', n({ reglas: [{ campo: 'Frente', op: 'uno_de', valor: 'PAÑO 19; paño 99' }] }) === 'Losa C');
ok('Y por defecto', n({ reglas: [{ campo: 'Frente', op: 'es', valor: 'PAÑO 10' }, { campo: 'Vol', op: '>', valor: '1' }] }) === 'Muro A');
ok('O (lo que Tandem no tiene)', n({ modo: 'o', reglas: [{ campo: 'Mat', op: 'es', valor: 'ACERO' }, { campo: 'Mat', op: 'es', valor: 'GAVIÓN' }] }) === 'Losa C,Barra D');
ok('grupo O dentro de Y', n({ reglas: [{ campo: 'Fin', op: 'no_vacio' }, { modo: 'o', reglas: [{ campo: 'Frente', op: 'es', valor: 'PAÑO 19' }, { campo: 'Name', op: 'empieza', valor: 'muro a' }] }] }) === 'Muro A,Losa C');
ok('regla a medio escribir no filtra', n({ reglas: [{ campo: 'Mat', op: 'contiene', valor: '' }] }) === 'Muro A,Muro B,Losa C,Barra D');
ok('no_es deja pasar los vacíos', n({ reglas: [{ campo: 'Frente', op: 'no_es', valor: 'PAÑO 10' }] }) === 'Losa C,Barra D');
ok('contarReglas cuenta solo las completas', T.contarReglas({ reglas: [{ campo: 'a', op: 'vacio' }, { campo: 'b', op: 'es', valor: '' }, { modo: 'o', reglas: [{ campo: 'c', op: '=', valor: '1' }] }] }) === 2);

console.log('\nORDENAR');
const o = (orden) => T.ordenar(filas, orden).map(x => x.Name).join(',');
ok('número ascendente, vacío al final', o([{ campo: 'Vol', dir: 'asc' }]) === 'Muro B,Muro A,Losa C,Barra D');
ok('número descendente, vacío al final', o([{ campo: 'Vol', dir: 'desc' }]) === 'Losa C,Muro A,Muro B,Barra D');
ok('dos criterios', o([{ campo: 'Fin', dir: 'desc' }, { campo: 'Name', dir: 'asc' }]) === 'Losa C,Muro B,Muro A,Barra D');
ok('no muta la entrada', filas[0].Name === 'Muro A');

console.log('\nCALCULAR');
ok('cota → promedio', T.calculoPorDefecto('Elevation', 'numero', 'm') === 'promedio');
ok('volumen → suma', T.calculoPorDefecto('Cotas › Volumen', 'numero', 'm³') === 'suma');
ok('número sin unidad que no es cantidad → nada (puede ser un código)', T.calculoPorDefecto('Mark', 'numero', '') === null);
ok('texto → nada', T.calculoPorDefecto('Frente', 'texto', '') === null);
const s = T.calcular(filas, 'Vol', 'suma');
ok('suma 3,439 m³ y cuenta 1 sin dato', Math.abs(s.porUnidad['m³'] - 3.439) < 1e-9 && s.sinDato === 1 && s.conDato === 3);
const mezcla = T.calcular([{ x: '1 m³' }, { x: '2 kg' }, { x: '3 m³' }], 'x', 'suma');
ok('nunca mezcla unidades', igual(mezcla.porUnidad, { 'm³': 4, kg: 2 }));
ok('promedio', T.calcular([{ x: '1 m' }, { x: '3 m' }], 'x', 'promedio').porUnidad.m === 2);
ok('mínimo y máximo', T.calcular(filas, 'Vol', 'minimo').porUnidad['m³'] === 0.411 && T.calcular(filas, 'Vol', 'maximo').porUnidad['m³'] === 2);
ok('distintos (sin mayúsculas)', T.calcular(filas, 'Mat', 'distintos').porUnidad[''] === 3);
ok('texto del resultado', T.textoDeResultado(T.calcular([{ x: '1064.8 m^3' }], 'x', 'suma')) === 'Σ 1,064.8 m³');

console.log('\nAGRUPAR');
const g = T.agrupar(filas, ['Frente', 'Mat'], { Vol: 'suma' });
ok('primer nivel ordenado y (sin valor) al final', g.map(x => x.valor).join('|') === 'PAÑO 10|PAÑO 19|(sin valor)');
ok('recuento por grupo', g.map(x => x.n).join(',') === '2,1,1');
ok('segundo nivel', g[0].hijos.map(x => x.valor).join('|') === 'CONCRETO|concreto');
ok('subtotal por grupo', Math.abs(g[0].totales.Vol.porUnidad['m³'] - 1.439) < 1e-9);
ok('nivel del subgrupo', g[0].hijos[0].nivel === 1 && g[0].nivel === 0);
const plana = T.aplanar(g, new Set(), true);
ok('aplanar: cabeceras, filas y totales', plana.filter(x => x.tipo === 'grupo').length === 7 && plana.filter(x => x.tipo === 'fila').length === 4 && plana.filter(x => x.tipo === 'totales').length === 7);
const plegada = T.aplanar(g, new Set([g[0].clave]), false);
ok('grupo plegado esconde sus filas', plegada.filter(x => x.tipo === 'fila').length === 2);
ok('sin niveles no agrupa', T.agrupar(filas, []).length === 0);

console.log('\nCELDAS');
ok('m^2 → m², número tal cual y a la derecha', igual(T.textoDeCelda('4.112 m^2'), { texto: '4.112 m²', numero: true }));
ok('m^3 → m³', T.textoDeCelda('1.028 m^3').texto === '1.028 m³');
ok('cota en m', T.textoDeCelda('0.900 m').texto === '0.900 m');
ok('número sin unidad', igual(T.textoDeCelda('0.000'), { texto: '0.000', numero: true }));
ok('fecha AAAAMMDD legible', T.textoDeCelda('20261024').texto === '24/10/2026');
ok('texto tal cual', igual(T.textoDeCelda('PAÑO 10'), { texto: 'PAÑO 10', numero: false }));
ok('vacío', T.textoDeCelda(null).texto === '');

console.log('\nCOLUMNAS');
const claves = ['Name', 'Material', 'Revit Category', 'Materiales y acabados::Material', 'Cotas::Área', 'Área', 'Cotas::Volumen', 'Volumen', 'Mecánica::Volumen', 'Datos::01_14_DSI_SubZona', 'Sin categoría'];
ok('quita las sueltas que tienen versión con categoría', igual(T.columnasSinDuplicados(claves), ['Name', 'Material', 'Revit Category', 'Materiales y acabados::Material', 'Cotas::Área', 'Cotas::Volumen', 'Mecánica::Volumen', 'Datos::01_14_DSI_SubZona', 'Sin categoría']));
ok('el campo propio «Material» se queda aunque el modelo tenga «Materiales y acabados::Material»', T.columnasSinDuplicados(claves).includes('Material'));
ok('dos categorías con el mismo nombre son dos columnas', T.columnasSinDuplicados(claves).filter(k => k.endsWith('::Volumen')).length === 2);
ok('etiqueta con categoría', T.etiquetaDeColumna('Cotas::Área') === 'Cotas › Área');
ok('etiqueta sin categoría', T.etiquetaDeColumna('Name') === 'Name');
ok('calculoPorDefecto mira solo el nombre también con ::', T.calculoPorDefecto('Cotas::Volumen', 'numero', 'm³') === 'suma' && T.calculoPorDefecto('Restricciones::Elevación', 'numero', 'm') === 'promedio');

console.log('\nSOLO CON METRADO');
const conYSin = [{ N: 'losa', V: '1.2 m^3', A: '' }, { N: 'eje', V: '', A: null }, { N: 'cero', V: '0.000 m^3', A: '0 m^2' }, { N: 'muro', V: null, A: '4.112 m^2' }, { N: 'texto', V: 'N/A', A: '' }];
ok('deja las filas con alguna cantidad ≠ 0', igual(T.conMetrado(conYSin, ['V', 'A']).map(f => f.N), ['losa', 'muro']));
ok('un cero no es metrado', !T.conMetrado(conYSin, ['V', 'A']).some(f => f.N === 'cero'));
ok('solo mira las columnas dadas', igual(T.conMetrado(conYSin, ['V']).map(f => f.N), ['losa']));
ok('sin columnas que se sumen, no quita nada', T.conMetrado(conYSin, []).length === conYSin.length);

console.log('\nRENDIMIENTO (20.000 filas, el tamaño del Canal)');
const grandes = Array.from({ length: 20000 }, (_, i) => ({ Name: 'E' + i, Frente: 'PAÑO ' + (i % 80), Mat: ['CONCRETO', 'GAVIÓN', 'ACERO'][i % 3], Vol: (i % 97) / 10 + ' m^3', Fin: '2026' + String(1 + (i % 12)).padStart(2, '0') + '24' }));
let t0 = performance.now();
const fil = T.filtrar(grandes, { reglas: [{ campo: 'Fin', op: 'entre', valor: '20260925', valor2: '20261024' }, { campo: 'Mat', op: 'es', valor: 'concreto' }] });
const tFiltro = performance.now() - t0;
t0 = performance.now();
const gg = T.agrupar(T.ordenar(grandes, [{ campo: 'Vol', dir: 'desc' }]), ['Mat', 'Frente'], { Vol: 'suma' });
const tGrupo = performance.now() - t0;
console.log(`  filtro ${tFiltro.toFixed(0)} ms (${fil.length} filas) · ordenar + agrupar 2 niveles + subtotales ${tGrupo.toFixed(0)} ms (${gg.length} grupos)`);
ok('filtro < 500 ms', tFiltro < 500);
ok('ordenar + agrupar < 1500 ms', tGrupo < 1500);

console.log(`\n${total - fallos}/${total} ${fallos ? 'CON FALLOS' : 'en verde'}\n`);
process.exit(fallos ? 1 : 0);
