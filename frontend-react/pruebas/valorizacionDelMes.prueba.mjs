// Banco de lib/valorizacionDelMes.js — node frontend-react/pruebas/valorizacionDelMes.prueba.mjs [excel-calculado] [excel-sin-calcular]
//
// Sin argumentos usa libros pequeños escritos aquí. Con el Excel real de la Val. 13 (no se versiona: es de la obra),
// comprueba además lo medido el 25-nov-2026 (docs/valorizaciones/VAL13_DRENAJE_LAMINAS_VS_EXCEL_25-nov-2026.md):
// 252 filas verdes en Drenaje, los cuatro buzones con margen 0,005 incluidos, y el libro sin calcular avisado.
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { diccionarioDSI } from '../src/lib/planillaPartidas.js';
import * as V from '../src/lib/valorizacionDelMes.js';

let total = 0, fallos = 0;
const ok = (nombre, cond, detalle = '') => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}${detalle ? '   -- ' + detalle : ''}`); };
const titulo = t => { console.log(''); console.log(t); };

// Una hoja como la de la Val. 13: títulos (T), partidas (P), «t» al final.
const CAB = ['PARTIDA', 'DESCRIPCIÓN', 'UND', 'CONTRACTUAL', 'AS-BUILT', 'YA COBRADO (VAL. 1 A 12)', 'SE PUEDE COBRAR HASTA', 'SE VALORIZA EN LA VAL. 13', 'P.U. S/', 'MONTO VAL. 13 S/', 'NOTA', 't'];
const hoja = [
    ['VALORIZACIÓN Nº 13 (NOVIEMBRE 2026) - COMPONENTE 11.2 DRENAJE URBANO'],
    [], CAB,
    ['1.06.04', 'CALLE SAN PABLO', undefined, undefined, undefined, undefined, undefined, undefined, undefined, 100, undefined, 'T'],
    ['1.06.04.02.03.03', 'INSTALACION DE TUBERIA CORRUGADA', 'm', 14.04, 12.77, 12.60, 12.77, 0.17, 10, 1.7, 'Falta cobrar.', 'P'],
    ['1.06.04.02.03.05', 'PRUEBA HIDRAULICA', 'm', 14.04, 12.77, 0, 12.77, 12.77, 2, 25.54, 'Falta cobrar.', 'P'],
    ['1.06.04.02.04.01', 'BUZON DE REGISTRO TIPO T1', 'und', 1, 1, 0.968, 1, 0.032, 27577.59, 882.48, '', 'P'],
    ['1.06.04.01.01.01', 'TRAZO Y REPLANTEO', 'm2', 10, 10, 10, 10, 0, 4, 0, 'Ya está cobrado.', 'P'],
    ['1.06.04.02.02.01', 'EXCAVACION DE ZANJA', 'm3', 50, 40, 20, 40, 20, 30, 600, 'Falta cobrar.', 'P'],
    ['1.06.04.09.09.09', 'TRANSPORTE', 'm3', 5, undefined, 0, '', '', 3, '', 'TRANSPORTE: falta su as-built', 'P'],
];

titulo('LEER LA HOJA');
const h = V.leerHoja('06 DRENAJE URBANO', hoja);
ok('se reconoce como hoja de valorización, número 13', h && h.numero === 13);
ok('sólo las filas P son partidas (el título T no)', h.partidas.length === 6);
ok('verde = «se valoriza» mayor que cero: 4', h.verdes.map(p => p.codigo).join(' ') === '1.06.04.02.03.03 1.06.04.02.03.05 1.06.04.02.04.01 1.06.04.02.02.01');
ok('lo ya cobrado del todo no es verde', !h.verdes.some(p => p.codigo === '1.06.04.01.01.01'));
ok('el transporte sin as-built («») no es verde y no cuenta como sin calcular', !h.verdes.some(p => p.codigo.endsWith('09.09.09')) && h.sinCalcular === 0);
ok('tono: entra entera la prueba hidráulica, saldo la tubería y el buzón',
    h.verdes.find(p => p.codigo.endsWith('03.05')).tono === 'entero'
    && h.verdes.find(p => p.codigo.endsWith('03.03')).tono === 'saldo'
    && h.verdes.find(p => p.codigo.endsWith('04.01')).tono === 'saldo');

titulo('UN EXCEL SIN CALCULAR');
const sinCalc = hoja.map((f, i) => (i > 2 ? f.map((v, c) => (c === 7 ? undefined : v)) : f));
const hs = V.leerHoja('06', sinCalc);
ok('ninguna partida verde y todas sin calcular', hs.verdes.length === 0 && hs.sinCalcular === 6);
ok('se dice qué hacer', /Ábrelo en Microsoft Excel, pulsa Ctrl\+S/.test(V.avisoDeCalculo(hs)));
ok('un Excel bien calculado no da aviso', V.avisoDeCalculo(h) === '');

titulo('UN LIBRO SIN HOJA DE VALORIZACIÓN');
const libroMalo = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(libroMalo, XLSX.utils.aoa_to_sheet([['ITEM', 'DESCRIPCION'], ['1', 'x']]), 'Hoja1');
ok('se dice qué falta', /PARTIDA/.test(V.leerValorizacion(XLSX, libroMalo).error));

titulo('CASAR CON EL MODELO');
const elemento = (nombre, ...codigos) => {
    const f = { Name: nombre, dbId: nombre, model_urn: 'urn:drenaje', 'Datos::01_11_DSI_Ubicacion': 'CALLE SAN PABLO' };
    codigos.forEach((c, i) => { f[`Datos::03_05_DSI_CodigoDePartida${i + 1}`] = c; f[`Datos::02_01_DSI_Unidad${i + 1}`] = 'm'; });
    return f;
};
const filas = [
    elemento('CT-SP-1', '06.04.02.03.03', '06.04.02.03.05'),
    elemento('CT-SP-2', '06.04.02.03.03', '06.04.02.03.05'),
    elemento('BP-09.01', '06.04.02.04.01'),
    elemento('OTRO', '06.04.01.01.01'),
];
const dic = diccionarioDSI([...new Set(filas.flatMap(Object.keys))]);
const r = V.elementosDeLaValorizacion(filas, dic, f => f.dbId, h.verdes);
ok('los códigos del Excel llevan un nivel más («1.»): se quita uno', r.desfase === 1, `casan ${r.casan}`);
ok('se seleccionan los dos tramos y el buzón; no el elemento ya cobrado', r.claves.sort().join(' ') === 'BP-09.01 CT-SP-1 CT-SP-2');
ok('el tramo con una partida entera se pinta entero', r.tonoDe.get('CT-SP-1') === 'entero');
ok('el buzón con 0,032 und se pinta como saldo (entero, en claro)', r.tonoDe.get('BP-09.01') === 'saldo');
ok('la excavación de zanja no está modelada: sale «sin elementos»', r.sinElementos.map(p => p.codigo).join(' ') === '1.06.04.02.02.01');
const ubic = V.claveDeUbicacion(Object.keys(filas[0]));
ok('la calle sale de 01_11_DSI_Ubicacion', ubic === 'Datos::01_11_DSI_Ubicacion');
ok('y agrupa por calle', V.porUbicacion(r.claves, r.filaDe, ubic).map(g => `${g.ubicacion}:${g.claves.length}`).join() === 'CALLE SAN PABLO:3');
ok('Sub ubicación no se confunde con Ubicación', V.claveDeUbicacion(['Datos::Sub Ubicacion', 'Datos::01_12_DSI_SubUbicacion']) === null);

// ── Con el Excel real, si se pasa ──
const [calculado, sinCalcular] = process.argv.slice(2);
if (calculado) {
    titulo('EL EXCEL REAL DE LA VAL. 13 (guardado con Excel)');
    const libro = XLSX.read(readFileSync(calculado), V.opcionesDeLectura());
    const { hojas, error } = V.leerValorizacion(XLSX, libro);
    const dren = hojas.find(x => x.nombre.startsWith('06'));
    const canal = hojas.find(x => x.nombre.startsWith('05'));
    ok('dos hojas de valorización: canal y drenaje', !error && hojas.length === 2, hojas.map(x => x.nombre).join(' | '));
    ok('Drenaje: 739 partidas, 252 en verde (lo que pinta el Excel)', dren.partidas.length === 739 && dren.verdes.length === 252, `${dren.partidas.length} / ${dren.verdes.length}`);
    ok('los cuatro buzones de margen 0,005 están en verde', ['1.06.02.01.04.01', '1.06.02.01.04.04', '1.06.02.01.04.07', '1.06.02.01.04.08'].every(c => dren.verdes.some(p => p.codigo === c)));
    ok('Canal: 25 en verde', canal.verdes.length === 25, String(canal.verdes.length));
    ok('sin avisos de cálculo', dren.sinCalcular === 0 && canal.sinCalcular === 0);

    titulo('LA HOJA COMO EN EXCEL');
    const t = V.tablaDeLaHoja(XLSX, dren);
    ok('las 11 columnas del Excel, sin la «t» de servicio', t.columnas.length === 11 && t.columnas[0].titulo === 'PARTIDA' && !t.columnas.some(c => c.titulo === 't'), t.columnas.map(c => c.titulo).join(' | '));
    ok('las 846 filas: 107 títulos y 739 partidas', t.filas.length === 846 && t.filas.filter(f => f.tipo === 'T').length === 107 && t.filas.filter(f => f.partida).length === 739, String(t.filas.length));
    const f13 = t.filas.find(f => f.codigo === '1.06.01.01.01');
    ok('los números salen con el formato de su celda («198.540» en YA COBRADO)', f13 && f13.celdas[5] === '198.540', f13 && f13.celdas.join(' | '));
    // Un título lleva a los elementos de sus partidas VERDES.
    const mini = [
        { r: 1, tipo: 'T', codigo: '1.06.04', partida: null },
        { r: 2, tipo: 'P', codigo: '1.06.04.01', partida: { codigo: '1.06.04.01', verde: true, tono: 'entero' } },
        { r: 3, tipo: 'P', codigo: '1.06.04.02', partida: { codigo: '1.06.04.02', verde: false, tono: 'saldo' } },
    ];
    const ps = mini.filter(x => x.partida).map(x => x.partida);
    const cl = new Map([['1.06.04.01', ['a', 'b']], ['1.06.04.02', ['c']]]);
    ok('título → sólo los elementos de sus partidas en verde', V.clavesDeLaFila(mini[0], ps, cl).join() === 'a,b');
    ok('partida no verde → sus elementos igual (se puede ir a cualquiera)', V.clavesDeLaFila(mini[2], ps, cl).join() === 'c');
    ok('sólo se pintan los de partidas en verde', [...V.tonosDe(['a', 'c'], ps, cl)].join() === 'a,entero');
}
if (sinCalcular) {
    titulo('EL MISMO EXCEL TAL COMO LLEGÓ (sin resultados): lo calcula el visor con sus propias fórmulas');
    const crudo = XLSX.read(readFileSync(sinCalcular), V.opcionesDeLectura());
    const { hojas } = V.leerValorizacion(XLSX, crudo);
    const dren = hojas.find(x => x.nombre.startsWith('06'));
    const canal = hojas.find(x => x.nombre.startsWith('05'));
    ok('Drenaje: las mismas 252 verdes que con Excel', dren.verdes.length === 252, String(dren.verdes.length));
    ok('Canal: las mismas 25', canal.verdes.length === 25, String(canal.verdes.length));
    ok('ninguna partida queda sin resultado', dren.sinCalcular === 0 && canal.sinCalcular === 0, dren.razonSinCalcular || '');
    ok('se dice que el visor calculó las fórmulas', /el visor calculó/.test(V.notaDeCalculo(dren)), V.notaDeCalculo(dren));
    if (calculado) {
        // CELDA A CELDA contra Microsoft Excel: toda celda con fórmula, en todas las hojas.
        const excel = XLSX.read(readFileSync(calculado));
        let comparadas = 0;
        const distintas = [];
        // Las hojas que el visor usa (las de valorización). RESUMEN toma datos de otras hojas ('05 CANAL'!E3), que
        // este calculador no sigue: no hace falta para pintar, y ahí sus celdas quedan sin valor, no con uno falso.
        for (const nombre of hojas.map(x => x.nombre)) {
            const a = crudo.Sheets[nombre], b = excel.Sheets[nombre];
            for (const dir of Object.keys(a)) {
                if (dir[0] === '!' || !a[dir]?.f) continue;
                comparadas++;
                const va = a[dir].v, vb = b[dir]?.v;
                const iguales = typeof va === 'number' && typeof vb === 'number' ? Math.abs(va - vb) <= 1e-9 * Math.max(1, Math.abs(vb)) : (va ?? '') === (vb ?? '');
                if (!iguales) distintas.push(`${nombre}!${dir}: visor ${va} · Excel ${vb}`);
            }
        }
        ok(`las ${comparadas} celdas con fórmula de las hojas de valorización dan lo mismo que Microsoft Excel`, comparadas > 2700 && distintas.length === 0, distintas.slice(0, 5).join(' | '));
        const resumen = crudo.Sheets.RESUMEN;
        ok('RESUMEN (referencias a otras hojas) queda sin valor, no con uno inventado', !resumen || Object.keys(resumen).filter(k => k[0] !== '!' && resumen[k]?.f).every(k => resumen[k].v === undefined));
    }
}

console.log('');
console.log(`${total - fallos}/${total}`);
if (fallos) process.exit(1);
