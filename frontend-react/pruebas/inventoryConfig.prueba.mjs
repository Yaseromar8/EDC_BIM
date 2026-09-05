/**
 * Compuerta de E-1 — el triestado del inventario y la muerte de R-07b.
 *
 * Se ejecuta con Node a secas, sin instalar nada:
 *
 *     node frontend-react/pruebas/inventoryConfig.prueba.mjs
 *
 * El proyecto no tiene runner de pruebas en el frontend y no es este el cambio
 * que debe introducir uno: `lib/inventoryConfig.js` es lógica pura y una
 * comprobación que se ejecuta sola vale más que una dependencia nueva.
 */

// El módulo usa `window` para el espejo v1 y para avisar. Se le da uno mínimo
// para poder comprobar EL ESPEJO, que es justo donde vivía el defecto.
globalThis.window = { dispatchEvent() { } };

const {
    leerInventoryConfig, fijarInventoryConfig, olvidarInventoryConfig,
    columnasParaElGrid, columnasDesdeElGrid,
} = await import('../src/lib/inventoryConfig.js');

let fallos = 0, total = 0;
const ok = (nombre, condicion, detalle = '') => {
    total++;
    if (condicion) { console.log(`  ok   ${nombre}`); }
    else { fallos++; console.log(`  FALLA ${nombre}${detalle ? '  → ' + detalle : ''}`); }
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nTRIESTADO');
olvidarInventoryConfig();
ok('arranca SIN DATO', leerInventoryConfig().columns === undefined);
ok('el espejo v1 arranca en null', window.__inventoryCacheSelectedColumns === null);

fijarInventoryConfig({ columns: { mode: 'custom', keys: ['Area', 'Volumen'] } });
ok('custom se guarda con su orden', igual(leerInventoryConfig().columns, { mode: 'custom', keys: ['Area', 'Volumen'] }));
ok('el espejo v1 lleva el array', igual(window.__inventoryCacheSelectedColumns, ['Area', 'Volumen']));

fijarInventoryConfig({ columns: { mode: 'all' } });
ok('«todas» es un VALOR, no una ausencia', igual(leerInventoryConfig().columns, { mode: 'all' }));
ok('y se distingue de «sin dato»', leerInventoryConfig().columns !== undefined);

console.log('\nR-07b — LA SECUENCIA EXACTA QUE SE MIDIÓ EL 5-SEP');
olvidarInventoryConfig();
const todas = Array.from({ length: 476 }, (_, i) => 'c' + i);
const custom473 = todas.slice(0, 473);
fijarInventoryConfig({ columns: { mode: 'custom', keys: custom473 } });
ok('paso 1: 473 de 476 seleccionadas', leerInventoryConfig().columns.keys.length === 473);
fijarInventoryConfig({ columns: columnasDesdeElGrid(null, todas) });   // el usuario vuelve a TODAS
ok('paso 2: vuelve a «todas»', igual(leerInventoryConfig().columns, { mode: 'all' }));
ok('EL ESPEJO v1 YA NO SE QUEDA EN 473',
    window.__inventoryCacheSelectedColumns === null,
    'era ' + JSON.stringify(window.__inventoryCacheSelectedColumns).slice(0, 40));

console.log('\nCOPIA DEFENSIVA');
fijarInventoryConfig({ columns: { mode: 'custom', keys: ['A', 'B'] }, totals: ['A'] });
const leido = leerInventoryConfig();
leido.columns.keys.push('INTRUSA');
leido.totals.push('INTRUSA');
ok('mutar lo leído no cambia la configuración',
    leerInventoryConfig().columns.keys.length === 2 && leerInventoryConfig().totals.length === 1);

console.log('\nTRADUCCIÓN GRID ↔ TRIESTADO');
fijarInventoryConfig({ columns: { mode: 'all' } });
ok('all → el grid recibe null', columnasParaElGrid(todas) === null);
fijarInventoryConfig({ columns: { mode: 'custom', keys: ['A', 'B'] } });
ok('custom → el grid recibe el array', igual(columnasParaElGrid(['A', 'B', 'C']), ['A', 'B']));
ok('se filtran las columnas que ya no existen', igual(columnasParaElGrid(['A', 'Z']), ['A']));
ok('si no sobrevive ninguna, el grid recibe null (no un array vacío)',
    columnasParaElGrid(['X', 'Y']) === null);
ok('ida y vuelta con selección parcial',
    igual(columnasDesdeElGrid(['A', 'B'], ['A', 'B', 'C']), { mode: 'custom', keys: ['A', 'B'] }));
ok('seleccionarlas todas se reconoce como «all»',
    igual(columnasDesdeElGrid(['A', 'B', 'C'], ['A', 'B', 'C']), { mode: 'all' }));

console.log('\nEL RESTO DEL ESTADO DE VISTA');
olvidarInventoryConfig();
fijarInventoryConfig({ groupBy: '01_14_DSI_SubZona', totals: ['Volumen'], assetsOnly: true });
const c = leerInventoryConfig();
ok('agrupación, totales y «solo activos» se guardan',
    c.groupBy === '01_14_DSI_SubZona' && igual(c.totals, ['Volumen']) && c.assetsOnly === true);
ok('fijar una clave no borra las demás',
    (fijarInventoryConfig({ assetsOnly: false }), leerInventoryConfig().groupBy === '01_14_DSI_SubZona'));

console.log('\nOLVIDO AL CAMBIAR DE FRENTE');
olvidarInventoryConfig();
const v = leerInventoryConfig();
ok('todo vuelve al punto de partida',
    v.columns === undefined && v.groupBy === null && v.totals.length === 0 && v.assetsOnly === false);
ok('y el espejo v1 también', window.__inventoryCacheSelectedColumns === null);

console.log(`\n${total - fallos} de ${total} pasan.`);
process.exit(fallos ? 1 : 0);
