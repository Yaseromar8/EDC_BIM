// Banco de lib/inventarioPorFilas.js y del normalizador fila a fila — node frontend-react/pruebas/inventarioPorFilas.prueba.mjs
//
// Lo que sostiene: leer el inventario línea a línea y normalizarlo según llega da EXACTAMENTE lo que daba
// `JSON.parse` del texto entero + el normalizador anterior (docs/rendimiento/04). El normalizador anterior va
// copiado aquí abajo, tal cual estaba, como referencia.
import { filasDeLinea, leerInventarioPorFilas, inventarioDeRespuesta } from '../src/lib/inventarioPorFilas.js';
import { crearNormalizador, normalizeInventoryPreload, normalizeInventoryRefresh, nombreDePropiedad, valorDePropiedad } from '../src/lib/inventoryNormalizers.js';
import { withInventoryIdentity } from '../src/lib/inventoryIdentity.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };
const lanza = async f => { try { await f(); return null; } catch (e) { return e.message; } };

// ── el normalizador ANTERIOR (hasta 595d2075), copiado sin cambios ──
function normalizadorAnterior(dbData, normalizeRevitCategory) {
    const schemaMap = {};
    const mappedData = (dbData || []).map(node => {
        const row = {
            dbId: node.external_id,
            model_urn: node.model_urn,
            source_urn: node.source_urn || node.model_urn,
            Name: node.name,
            Material: node.material || '',
            Status: node.installation_status || '',
            Vaciado_Nro: node.vaciado_nro || '',
        };
        if (node.properties && typeof node.properties === 'object') {
            for (const [grupo, contenido] of Object.entries(node.properties)) {
                if (typeof contenido !== 'object' || contenido === null) continue;
                for (const [nombreCrudo, bruto] of Object.entries(contenido)) {
                    const nombre = nombreDePropiedad(grupo, nombreCrudo);
                    const valor = valorDePropiedad(bruto);
                    const clave = grupo + '::' + nombre;
                    row[clave] = valor;
                    if (valor !== '' || !Object.hasOwn(row, nombre) || row[nombre] === '') {
                        row[nombre] = valor;
                    }
                    if (!schemaMap[clave]) {
                        schemaMap[clave] = { id: clave, name: nombre, category: grupo, group: 'text', path: grupo + ' ▸ ' + nombre };
                    }
                }
            }
        }
        const categoria = node.properties?.['__category__']?.['__category__'] || row['__category__'] || '(Unassigned)';
        row['Revit Category'] = normalizeRevitCategory(categoria);
        return withInventoryIdentity(node, row);
    });
    return { mappedData, schemaMap };
}

// ── datos: lo que manda /api/inventory, con los casos que han dado guerra ──
const LINAJE = 'urn:adsk.wipprod:dm.lineage:Abc_123';
const nodo = (i, properties, mas = {}) => ({
    scope_id: '1_CANAL', source_lineage: LINAJE, source_urn: 'dXJuOmFkc2s' + (i % 2), external_id: `ext-${i}`,
    name: `Tubo Ø${50 + i} [${3000 + i}]`, properties, project_id: '7', last_updated: null, native_metadata: {},
    material: i % 3 ? null : 'HDPE', installation_status: i % 4 ? null : 'Ejecutado', vaciado_nro: null, classification: null,
    element_key: JSON.stringify(['1_CANAL', LINAJE, `ext-${i}`]), model_urn: 'dXJuOmFkc2s' + (i % 2), ...mas,
});
const mayus = c => String(c).toUpperCase();
const datos = [];
for (let i = 0; i < 400; i++) {
    datos.push(nodo(i, {
        'Restricciones': { 'Nivel': `NIVEL ${i % 12}`, 'Desfase': `${(i * 0.137).toFixed(3)} m`, 'Restricciones - Anfitrión': 'Nivel : base' },
        'Cotas': { 'Longitud': i ? `${i}.50 m` : 0, 'Diámetro': ['', ''], 'Área': ['12.5 m^2', ''], 'Visible': false },
        'Datos de identidad': { 'Marca': `MK-${i}`, 'Comentarios': '', 'Nombre de tipo': `DN${50 + (i % 5) * 25}` },
        'G1': { 'Estado': i % 2 ? 'Ejecutado' : '' }, 'G2': { 'Estado': i % 3 ? '' : 'Pendiente' },      // grupos homónimos
        'PROPERTY SETS': { 'SCL_Datos — Zona': 'DRENAJE URBANO', 'Pset - Partida': '04.02.01' },
        'Texto': { [`01_${String(i % 3).padStart(2, '0')}_DSI_Zona`]: 'Ñandú — 日本 "comillas" \\ barra\nlínea', 'scope_id': 'intruso', 'external_id': 'intruso' },
        'suelto': 'no es un grupo', 'nulo': null,
        '__category__': { '__category__': i % 7 ? 'Pipes' : 'Tuberías' }, '__node__': { '__node_type__': 'instance' },
    }));
}
datos.push(nodo(900, null));                                              // sin propiedades
datos.push(nodo(901, {}, { source_urn: null, name: null }));              // sin source_urn ni nombre
datos.push(nodo(902, { 'Solo': { 'A': 'x' } }, { source_lineage: 'no-es-linaje', element_key: null }));   // identidad no verificable
const igualQue = (a, b) => JSON.stringify(a) === JSON.stringify(b);       // mismas claves, mismos valores, MISMO ORDEN

titulo('EL NORMALIZADOR DA LO MISMO QUE EL ANTERIOR');
const antes = normalizadorAnterior(datos, mayus);
const ahora = normalizeInventoryPreload(datos, mayus);
ok('mismas filas, mismas claves en el mismo orden, mismos valores', igualQue(ahora.mappedData, antes.mappedData));
ok('mismo esquema de propiedades, en el mismo orden', igualQue(ahora.schemaMap, antes.schemaMap));
ok('el refresco usa el mismo algoritmo', igualQue(normalizeInventoryRefresh(datos, mayus), antes));
ok('lista vacía y nula', igualQue(normalizeInventoryPreload([], mayus), antes.mappedData.length ? { mappedData: [], schemaMap: {} } : null)
    && igualQue(normalizeInventoryPreload(null, mayus), { mappedData: [], schemaMap: {} }));
const porFilas = crearNormalizador(mayus);
for (const n of datos) porFilas.fila(n);
ok('alimentado fila a fila da lo mismo que con la lista entera', igualQue(porFilas.fin(), antes));
const fila0 = ahora.mappedData[0];
ok('una propiedad BIM llamada scope_id/external_id no pisa la identidad', fila0.scope_id === '1_CANAL' && fila0.external_id === 'ext-0' && fila0['Texto::scope_id'] === 'intruso');
ok('grupos homónimos no se pisan en la clave cualificada', ahora.mappedData[1]['G1::Estado'] === 'Ejecutado' && ahora.mappedData[3]['G2::Estado'] === 'Pendiente');
ok('0 y false no se pierden', fila0['Cotas::Longitud'] === '0' && fila0['Cotas::Visible'] === 'false');

titulo('LEER LÍNEA A LÍNEA');
ok('«[», «]» y línea vacía no traen filas', filasDeLinea('[').length === 0 && filasDeLinea(' ] ').length === 0 && filasDeLinea('').length === 0);
ok('una fila sola', igualQue(filasDeLinea('{"a":1}'), [{ a: 1 }]));
ok('con la coma delante (la forma del servidor)', igualQue(filasDeLinea(',{"a":[1,2]}'), [{ a: [1, 2] }]));
ok('con la coma detrás, y con el «]» pegado', igualQue(filasDeLinea('{"a":1},'), [{ a: 1 }]) && igualQue(filasDeLinea(',{"a":1}]'), [{ a: 1 }]));
ok('la lista entera en una línea (servidor anterior)', igualQue(filasDeLinea('[{"a":1},{"b":2}]'), [{ a: 1 }, { b: 2 }]) && filasDeLinea('[]').length === 0);
ok('una línea que no es JSON lanza', (() => { try { filasDeLinea('{"a":'); return false; } catch { return true; } })());

// El cuerpo tal como lo escribe backend/inventory_http.py: «[\n» fila «\n» («,» fila «\n»)* «]»
const cuerpoNuevo = lista => '[\n' + lista.map((n, i) => (i ? ',' : '') + JSON.stringify(n) + '\n').join('') + ']';
const cuerpoViejo = lista => JSON.stringify(lista);
const bytes = t => new TextEncoder().encode(t);
// Una respuesta cuyo cuerpo llega en trozos de `tam` bytes: los cortes caen dentro de filas y de caracteres.
const respuesta = (texto, tam) => {
    const b = bytes(texto);
    return new Response(new ReadableStream({
        start(c) { for (let i = 0; i < b.length; i += tam) c.enqueue(b.slice(i, i + tam)); c.close(); },
    }));
};
const leer = async (texto, tam = 1000) => { const lista = []; const r = await leerInventarioPorFilas(respuesta(texto, tam), f => lista.push(f)); return { lista, n: r.filas, vacio: r.vacio }; };

ok('es la misma lista que JSON.parse del texto entero', igualQue(JSON.parse(cuerpoNuevo(datos)), datos));
// Byte a byte y de 7 en 7 (los cortes caen dentro de «Ñ», «—» y «日本») sobre una muestra; el resto, entero.
const muestra = datos.slice(0, 6);
for (const tam of [1, 7]) {
    const r = await leer(cuerpoNuevo(muestra), tam);
    ok(`trozos de ${tam} byte(s): las ${muestra.length} filas, iguales y en orden`, r.n === muestra.length && igualQue(r.lista, muestra));
}
for (const tam of [64, 1000, 65536, 10 ** 7]) {
    const r = await leer(cuerpoNuevo(datos), tam);
    ok(`trozos de ${tam} bytes: las ${datos.length} filas, iguales y en orden`, r.n === datos.length && !r.vacio && igualQue(r.lista, datos));
}
for (const tam of [64, 4096]) {
    const r = await leer(cuerpoViejo(datos), tam);
    ok(`servidor anterior (una sola línea), trozos de ${tam}: lo mismo`, r.n === datos.length && igualQue(r.lista, datos));
}
ok('lista vacía nueva «[\\n]» y vieja «[]»: cero filas, y no es «vacío»',
    igualQue([(await leer('[\n]')).n, (await leer('[\n]')).vacio, (await leer('[]')).n, (await leer('[]')).vacio], [0, false, 0, false]));
ok('cuerpo sin nada (servidor despertando): vacío, para que se reintente', (await leer('')).vacio === true && (await leer('  \n ')).vacio === true);
const cortadoEntreFilas = cuerpoNuevo(datos).slice(0, cuerpoNuevo(datos).indexOf('\n', 5000) + 1);
ok('cortado justo entre dos filas: error, no un inventario a medias', /se cortó tras \d+ filas/.test(await lanza(() => leer(cortadoEntreFilas)) || ''));
ok('cortado a mitad de una fila: error', /truncada|se cortó/.test(await lanza(() => leer(cuerpoNuevo(datos).slice(0, 5000))) || ''));
ok('lista vieja cortada: error', /truncada|se cortó/.test(await lanza(() => leer(cuerpoViejo(datos).slice(0, 9000))) || ''));
ok('datos después del final: error', /después del final/.test(await lanza(() => leer(cuerpoNuevo(datos) + '\n{"a":1}')) || ''));
ok('sin lectura por trozos (solo texto): lo mismo', await (async () => {
    const filas = []; const r = await leerInventarioPorFilas({ text: async () => cuerpoNuevo(datos) }, f => filas.push(f));
    return r.filas === datos.length && igualQue(filas, datos);
})());

titulo('DE LA RESPUESTA AL INVENTARIO NORMALIZADO');
const completo = await inventarioDeRespuesta(respuesta(cuerpoNuevo(datos), 777), mayus);
ok('igual que normalizar la lista entera con el normalizador anterior', igualQue({ mappedData: completo.mappedData, schemaMap: completo.schemaMap }, antes) && completo.vacio === false);
ok('respuesta sin cuerpo: vacío y sin filas', await (async () => { const r = await inventarioDeRespuesta(respuesta('', 10), mayus); return r.vacio && r.mappedData.length === 0; })());

titulo('ESCALA');
const muchos = Array.from({ length: 20000 }, (_, i) => datos[i % 400]);
let t = Date.now();
const grande = await inventarioDeRespuesta(respuesta(cuerpoNuevo(muchos), 65536), mayus);
const ms = Date.now() - t;
ok(`20.000 elementos leídos y normalizados en ${ms} ms (< 8.000)`, grande.mappedData.length === 20000 && ms < 8000);

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
