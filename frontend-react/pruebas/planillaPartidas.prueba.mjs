// Banco de lib/planillaPartidas.js — node frontend-react/pruebas/planillaPartidas.prueba.mjs
import * as PP from '../src/lib/planillaPartidas.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const titulo = t => { console.log(''); console.log(t); };

// Elementos reales de Drenaje (docs/visor/23), con sus claves cualificadas.
const losa = {
    Name: 'Suelo [6762790]', 'Cotas::Área': '7.080 m^2', 'Cotas::Volumen': '1.416 m^3',
    'Datos::03_05_DSI_CodigoDePartida1': '06.03.02.05.01', 'Datos::03_04_DSI_NombreDePartida1': 'CORTE Y ROTURA DE PAVIMENTO RIGIDO - CONCRETO', 'Datos::02_01_DSI_Unidad1': 'm³', 'Datos::02_05_DSI_Volumen1': '1.522',
    'Datos::03_05_DSI_CodigoDePartida2': '06.03.02.05.02', 'Datos::03_04_DSI_NombreDePartida2': 'ELIMINACIÓN DE MATERIAL PROVENIENTE DE DEMOLICIÓN', 'Datos::02_01_DSI_Unidad2': 'm3', 'Datos::02_05_DSI_Volumen2': '0.000',
    'Datos::04_18_DSI_InicioReal1': '20261024', 'Datos::04_20_DSI_FinReal1': '20261024',
};
const barra = {
    Name: 'Barra de armadura [3107152]', 'Cotas::Longitud total de barra': '20.250 m', 'Cotas::Diámetro de barra': '0.500 fractional-in', 'Datos::02_06_DSI_Peso': '0.994',
    'Datos::03_04_DSI_NombreDePartida1': 'INSTALACION DE ACERO CORRUGADO FY= 4200', 'Datos::03_05_DSI_CodigoDePartida1': '06.07.01.03.04', 'Datos::02_01_DSI_Unidad1': 'Kg', 'Datos::02_06_DSI_Peso1': '11.232',
};
const tubo = {
    Name: 'Tipos de tubería [2527815]', 'Cotas::Longitud': '107.152 m',
    'Datos::03_05_DSI_CodigoDePartida': 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1000 MM, INC. PRUEBA HIDRAULICA', 'Datos::02_01_DSI_Unidad1': 'm',
    'Datos::03_04_DSI_NombreDePartida1': 'INSTALACION DE TUBERIA HDPE DN 1000', 'Datos::03_05_DSI_CodigoDePartida1': '06.02.01.03.02',
};
const encofrado = {
    Name: 'Encofrado_Plano [6351783]', 'Otros::Área de encofrado': '0.000', 'Datos::02_04_DSI_Area1': '0.000',
    'Datos::03_04_DSI_NombreDePartida1': 'ENCOFRADO Y DESENCOFRADO PARA PAVIMENTO', 'Datos::02_01_DSI_Unidad1': 'm²',
};
const filas = [losa, barra, tubo, encofrado, { ...losa, Name: 'Suelo [2]', 'Cotas::Volumen': '2.000 m^3', 'Datos::02_05_DSI_Volumen1': '' }];
const claves = [...new Set(filas.flatMap(Object.keys))];
const dic = PP.diccionarioDSI(claves);

titulo('DICCIONARIO DSI (por el nombre del parámetro, en cualquier grupo)');
ok('reconoce las líneas sin número y 1, 2', Object.keys(dic.lineas).sort().join(',') === ',1,2');
ok('línea 1: código, nombre, unidad y cantidad manual', dic.lineas['1'].codigo === 'Datos::03_05_DSI_CodigoDePartida1' && dic.lineas['1'].unidad === 'Datos::02_01_DSI_Unidad1' && dic.lineas['1'].manualM3 === 'Datos::02_05_DSI_Volumen1');
ok('medidas nativas de Revit (Cotas)', dic.nativas.volumen === 'Cotas::Volumen' && dic.nativas.area === 'Cotas::Área' && dic.nativas.longitudBarra === 'Cotas::Longitud total de barra');
ok('hay estándar DSI', dic.hayDSI && !PP.diccionarioDSI(['Cotas::Área', 'Name']).hayDSI);

titulo('UNIDADES ESCRITAS DE VARIAS FORMAS');
ok('Kg → kg, m2 → m², M3 → m³', PP.normalizarUnidad('Kg') === 'kg' && PP.normalizarUnidad('m2') === 'm²' && PP.normalizarUnidad('M3') === 'm³');
ok('una unidad desconocida se deja tal cual («01»)', PP.normalizarUnidad('01') === '01');
ok('«Und.» con punto es und; «0» y «NA» no son unidad', PP.normalizarUnidad('Und.') === 'und' && PP.normalizarUnidad('0') === '' && PP.normalizarUnidad('NA') === '');

titulo('LA LOSA (Volumen nativo 1,416; manual 1,522)');
const ll = PP.lineasDePartida(losa, dic);
ok('dos líneas', ll.length === 2);
ok('la cantidad es la NATIVA (1,416), no la manual', cerca(ll[0].cantidad, 1.416) && ll[0].origen === 'nativa');
ok('la manual se guarda aparte (1,522)', cerca(ll[0].manual, 1.522));
ok('«m3» escrito así también es m³ y toma el volumen nativo', ll[1].unidad === 'm³' && cerca(ll[1].cantidad, 1.416));
ok('fechas de ejecución de la línea', ll[0].inicioReal === '20261024' && ll[0].finReal === '20261024');

titulo('LA BARRA (Ø 1/2", 20,25 m; Revit puso 11,232 kg)');
const lb = PP.lineasDePartida(barra, dic);
ok('kg = longitud total nativa × 0,994 kg/m = 20,1285', cerca(lb[0].cantidad, 20.25 * 0.994) && lb[0].origen === 'calculada');
ok('el combinado de Revit (11,232) queda aparte', cerca(lb[0].manual, 11.232));
ok('la regla se explica', lb[0].detalle.includes('0.994') && lb[0].detalle.includes('20.25'));

titulo('EL TUBO Y EL ENCOFRADO');
const lt = PP.lineasDePartida(tubo, dic);
ok('el tubo tiene la línea sin número (descripción) y la 1', lt.length === 2);
ok('la línea 1 en m toma la Longitud nativa', cerca(lt.find(l => l.linea === '1').cantidad, 107.152));
ok('la línea sin número no tiene unidad: sin cantidad, no se inventa', lt.find(l => l.linea === '0').cantidad === null && lt.find(l => l.linea === '0').unidad === '');
const le = PP.lineasDePartida(encofrado, dic);
ok('el encofrado (m²) no tiene medida nativa: sin cantidad', le[0].cantidad === null && le[0].manual === null);

titulo('UNA FILA POR PARTIDA');
const ps = PP.partidasDe(filas, dic, f => f.Name);
const corte = ps.find(p => p.codigo === '06.03.02.05.01');
ok('las dos losas se suman en su partida, con lo nativo: 1,416 + 2,000', cerca(corte.cantidad, 3.416) && corte.elementos === 2 && corte.conMedida === 2);
ok('lo manual se suma aparte (solo donde hay): 1,522', cerca(corte.manual, 1.522) && corte.conManual === 1);
ok('sabe qué elementos son (para el 3D)', corte.claves.join(',') === 'Suelo [6762790],Suelo [2]');
const enc = ps.find(p => p.nombre.startsWith('ENCOFRADO'));
ok('el encofrado cuenta como «sin medida»', enc.sinMedida === 1 && enc.conMedida === 0 && enc.cantidad === 0);
ok('primero los códigos 06.xx, luego los de texto, las sin código al final', /^06[.]/.test(ps[0].codigo) && ps[ps.length - 1].codigo === '' && ps.findIndex(p => p.codigo.startsWith('INSTALACION')) > ps.findIndex(p => p.codigo === '06.07.01.03.04'));

titulo('RELLENOS Y VARIANTES DE NOMBRE');
const relleno = { Name: 'R', 'Cotas::Volumen': '1 m^3', 'Datos::03_05_DSI_CodigoDePartida1': '0', 'Datos::03_04_DSI_NombreDePartida1': '0', 'Datos::02_01_DSI_Unidad1': 'm3' };
ok('una línea con código «0» y nombre «0» no es partida', PP.lineasDePartida(relleno, dic).length === 0);
const variante = { ...losa, Name: 'Suelo [3]', 'Datos::03_04_DSI_NombreDePartida1': 'CORTE Y ROTURA DE PAVIMENTO RÍGIDO' };
const pv = PP.partidasDe([losa, { ...losa, Name: 'Suelo [2]' }, variante], dic, f => f.Name).find(p => p.codigo === '06.03.02.05.01');
ok('el mismo código con otra redacción del nombre es la misma partida', pv.elementos === 3 && pv.variantesDeNombre === 2);
ok('se enseña el nombre más usado', pv.nombre === 'CORTE Y ROTURA DE PAVIMENTO RIGIDO - CONCRETO');
const otraUnidad = { ...losa, Name: 'Suelo [4]', 'Datos::02_01_DSI_Unidad1': 'm²' };
ok('el mismo código en otra unidad es otra fila (no se suman m³ con m²)', PP.partidasDe([losa, otraUnidad], dic, f => f.Name).filter(p => p.codigo === '06.03.02.05.01').length === 2);

titulo('JERARQUÍA, INTERCAMBIOS Y REPETIDAS (casos reales de Drenaje)');
// Tubo [2528502]: la línea sin número trae la descripción en CodigoDePartida y el código en
// NombreDePartida, y además repite la línea 2 (06.02.01.03.07).
const tuboIntercambiado = {
    Name: 'Tipos de tubería [2528502]', 'Cotas::Longitud': '37.791 m',
    'Datos::03_05_DSI_CodigoDePartida': 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE SEGUN NTP 21138-2 SN4', 'Datos::03_04_DSI_NombreDePartida': '06.02.01.03.07',
    'Datos::03_05_DSI_CodigoDePartida1': '06.02.01.03.03', 'Datos::03_04_DSI_NombreDePartida1': 'SUMINISTRO DE TUBERIA ESTRUCTURADA HDPE', 'Datos::02_01_DSI_Unidad1': 'm',
    'Datos::03_05_DSI_CodigoDePartida2': '06.02.01.03.07', 'Datos::03_04_DSI_NombreDePartida2': 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE', 'Datos::02_01_DSI_Unidad2': 'm',
};
// TapaBuzon [4610657]: la misma partida en la línea sin número, la 1 y la 2.
const tapa = { Name: '000_SYP_TapaBuzon [4610657]', 'Cotas::Volumen': '0.120 m^3',
    'Datos::03_05_DSI_CodigoDePartida': '06.02.01.04.05', 'Datos::03_05_DSI_CodigoDePartida1': '06.02.01.04.05', 'Datos::03_05_DSI_CodigoDePartida2': '06.02.01.04.05',
    'Datos::03_04_DSI_NombreDePartida1': 'BUZON TIPO T2', 'Datos::02_01_DSI_Unidad1': 'm3' };
// Buzón: la línea sin número es la partida padre de las numeradas.
const buzon = { Name: 'Buzón [1]', 'Cotas::Volumen': '2.000 m^3', 'Cotas::Área': '6.000 m^2',
    'Datos::03_05_DSI_CodigoDePartida': '06.05.02.04.03', 'Datos::03_04_DSI_NombreDePartida': 'BUZON DE REGISTRO TIPO T2, DE 2.01 A 2.50M',
    'Datos::03_05_DSI_CodigoDePartida1': '06.05.02.04.03.08', 'Datos::03_04_DSI_NombreDePartida1': 'FUSTE CONCRETO PREMEZCLADO', 'Datos::02_01_DSI_Unidad1': 'm3',
    'Datos::03_05_DSI_CodigoDePartida2': '06.05.02.04.03.10', 'Datos::03_04_DSI_NombreDePartida2': 'ENCOFRADO FUSTE', 'Datos::02_01_DSI_Unidad2': 'm2' };
const dicJ = PP.diccionarioDSI([...new Set([tuboIntercambiado, tapa, buzon].flatMap(Object.keys))]);
let an = PP.analizarElemento(tuboIntercambiado, dicJ);
ok('código y nombre intercambiados se leen al derecho', an.intercambiadas === 1 && an.lineas.some(l => l.codigo === '06.02.01.03.07' && l.nombre.startsWith('INSTALACION')));
ok('la repetida (sin número = línea 2) cuenta una vez: 2 líneas, no 3', an.lineas.length === 2 && an.repetidas === 1);
ok('y toma la unidad de la numerada: 37,791 m', an.lineas.find(l => l.codigo === '06.02.01.03.07').unidad === 'm' && cerca(an.lineas.find(l => l.codigo === '06.02.01.03.07').cantidad, 37.791));
an = PP.analizarElemento(tapa, dicJ);
ok('la tapa con la misma partida tres veces: una línea', an.lineas.length === 1 && an.repetidas === 2 && cerca(an.lineas[0].cantidad, 0.12));
an = PP.analizarElemento(buzon, dicJ);
ok('la línea sin número que contiene a las demás es la PADRE y no suma', an.padre?.codigo === '06.05.02.04.03' && an.lineas.length === 2 && an.lineas.every(l => l.padre?.codigo === '06.05.02.04.03'));
const { partidas: pj, calidad } = PP.analizarPartidas([tuboIntercambiado, tapa, buzon], dicJ, f => f.Name);
ok('calidad: 1 intercambiada, 3 repetidas, 1 elemento con padre', calidad.intercambiadas === 1 && calidad.repetidas === 3 && calidad.conPadre === 1);
const gj = PP.gruposDePartidas(pj);
const gBuzon = gj.find(g => g.codigo === '06.05.02.04.03');
ok('las hijas del buzón van bajo su padre, con su nombre', gBuzon.tipo === 'padre' && gBuzon.nombre.startsWith('BUZON') && gBuzon.partidas.length === 2);
const gTubo = gj.find(g => g.codigo === '06.02.01.03');
ok('sin padre: por capítulo (06.02.01.03.07 → 06.02.01.03)', gTubo.tipo === 'capitulo' && gTubo.partidas.map(p => p.codigo).join(',') === '06.02.01.03.03,06.02.01.03.07');
ok('capítulos en orden de código', gj.map(g => g.codigo).filter(Boolean).join(' ') === [...gj.map(g => g.codigo).filter(Boolean)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).join(' '));

titulo('EXCEL DE PARTIDAS');
const hs = PP.hojasDePartidas(ps, { ambito: '5 elementos seleccionados' });
ok('dos hojas: Partidas y Criterios', hs.map(h => h.nombre).join(',') === 'Partidas,Criterios');
const filaCorte = hs[0].filas.find(f => f[2] === '06.03.02.05.01');
ok('la cantidad nativa como número y la manual aparte; con su grupo', cerca(filaCorte[5], 3.416) && cerca(filaCorte[9], 1.522) && filaCorte[0] === '06.03.02.05');
ok('sin medida: celda vacía, no 0', hs[0].filas.find(f => String(f[3]).startsWith('ENCOFRADO'))[5] === '');
ok('el ámbito consta en criterios', hs[1].filas.some(f => f[0] === 'Ámbito' && f[1] === '5 elementos seleccionados'));

titulo('RENDIMIENTO (8.378 elementos con 3 líneas)');
const muchas = Array.from({ length: 8378 }, (_, i) => ({ ...losa, Name: 'E' + i, 'Datos::03_05_DSI_CodigoDePartida1': '06.0' + (i % 9) }));
const t0 = performance.now();
const pm = PP.partidasDe(muchas, dic, f => f.Name);
const ms = performance.now() - t0;
console.log(`  ${pm.length} partidas en ${ms.toFixed(0)} ms`);
ok('< 500 ms', ms < 500);

titulo('GLB ES GLOBAL, NO «UND» (26-oct-2026)');
{
    ok('glb, GBL y global → glb; pza → und', PP.normalizarUnidad('glb') === 'glb' && PP.normalizarUnidad('GBL') === 'glb' && PP.normalizarUnidad('Global') === 'glb' && PP.normalizarUnidad('pza') === 'und');
    const g = i => ({ Name: `Cartel [${i}]`, 'Datos::03_05_DSI_CodigoDePartida1': '01.02', 'Datos::03_04_DSI_NombreDePartida1': 'MOVILIZACION', 'Datos::02_01_DSI_Unidad1': 'glb' });
    const filasG = [g(1), g(2), g(3)];
    const dicG = PP.diccionarioDSI([...new Set(filasG.flatMap(Object.keys))]);
    const pg = PP.partidasDe(filasG, dicG, f => f.Name).find(p => p.codigo === '01.02');
    ok('una partida global con 3 elementos vale 1 glb (antes: 3 und), sin «sin medida»', pg.unidad === 'glb' && pg.cantidad === 1 && pg.elementos === 3 && pg.sinMedida === 0 && pg.origenes.includes('global'));
}

console.log('');
console.log(`${total - fallos}/${total} ${fallos ? 'CON FALLOS' : 'en verde'}`);
process.exit(fallos ? 1 : 0);
