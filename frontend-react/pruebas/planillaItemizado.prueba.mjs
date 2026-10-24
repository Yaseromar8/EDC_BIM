// Banco de lib/planillaItemizado.js — node frontend-react/pruebas/planillaItemizado.prueba.mjs
import * as IT from '../src/lib/planillaItemizado.js';
import * as PF from '../src/lib/planillaPerfil.js';
import * as PP from '../src/lib/planillaPartidas.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };

// Como el Presupuesto_Rv00.xlsx de PQ-08: título arriba, encabezado en la fila 8, la columna A
// vacía, ítem en B, fase/subfase en C-D, descripción en E, unidad en F, metrado y precios después.
const vacia = n => Array.from({ length: n }, () => '');
const CAOV = [
    vacia(9), ['', '', 'CALENDARIO DE AVANCE DE OBRA'], vacia(9), vacia(9),
    ['', '', '«CONSTRUCCIÓN DEL SISTEMA DE DRENAJE»'], vacia(9), vacia(9),
    ['', 'ÍTEM', 'FASE', 'SUBFASE', 'DESCRIPCIÓN', 'UND.', 'METRADO', 'P.U (S/)', 'P. PARCIAL (S)'],
    vacia(9),
    ['', '06', '', '', 'DRENAJE URBANO', '', '', '', '1000'],
    ['', '06.02.01.03', '', '', 'TUBERIAS', '', '', '', ''],
    ['', '06.02.01.03.01', '', '', 'SUMINISTRO DE TUBERIA ESTRUCTURADA HDPE SEGUN NTP 21138-2 SN4', 'm', '120', '10', '1200'],
    ['', '06.02.01.03.05', '', '', 'INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1500 MM, INC. PRUEBA HIDRAULICA', 'm', '120', '5', '600'],
    ['', '06.05.02.04.03', '', '', 'BUZON DE REGISTRO TIPO "T2", DE 2.01 A 2.50M DE PROF.', 'und', '3', '22089.73', '66269'],
    ['', '06.09.01.01.01', '', '', 'TRANSPORTE DE MATERIAL EXCEDENTE', 'm3-km', '500', '2', '1000'],
];
// Cronograma: los mismos ítems y descripciones, sin unidad.
const CAOP = CAOV.map(f => [f[0], f[1], f[4], '#REF!', '#REF!']);
const leido = IT.leerItemizado({ CAOP, CAOV });

titulo('LEER EL ITEMIZADO (columnas por sus valores, no por sus encabezados)');
ok('elige la hoja con unidad (CAOV), no el cronograma', leido.hoja === 'CAOV');
ok('ítem en B, descripción en E, unidad en F', leido.columnas.item === 1 && leido.columnas.descripcion === 4 && leido.columnas.unidad === 5);
ok('6 ítems (los títulos con código cuentan; el encabezado no)', leido.items.length === 6);
ok('unidad leída; títulos sin unidad', leido.items.find(x => x.item === '06.05.02.04.03').unidad === 'und' && leido.items.find(x => x.item === '06').unidad === '');
ok('dice de dónde lo leyó', /CAOV/.test(leido.porque) && /columna B/.test(leido.porque));

titulo('UBICAR UN CÓDIGO DEL MODELO');
const ind = IT.indiceDeItemizado(leido.items);
ok('exacto', ind.ubicar('06.02.01.03.05').tipo === 'exacto');
ok('sub-partida (el modelo baja un nivel: FUSTE dentro del buzón)', ind.ubicar('06.05.02.04.03.08').tipo === 'subpartida' && ind.ubicar('06.05.02.04.03.08').item === '06.05.02.04.03');
ok('fuera (ningún antecesor en el itemizado)', ind.ubicar('09.01.01').tipo === 'fuera');
ok('sub-partida solo si el PADRE INMEDIATO está (04.15.03.05 no lo es por existir el capítulo 06)', ind.ubicar('06.15.03.05').tipo === 'fuera' && ind.ubicar('06.05.02.04.03.08.01').tipo === 'fuera');
ok('la unidad oficial se normaliza; m3-km se queda como está', ind.porCodigo.get('06.05.02.04.03').unidad === 'und' && ind.porCodigo.get('06.09.01.01.01').unidad === 'm3-km');

// El modelo: tubos con su suministro e instalación (descripción del modelo distinta a la oficial
// en la instalación y unidad del modelo «m²» equivocada en un tubo), un fuste (sub-partida) y un
// código que no está en el itemizado.
const filas = [];
for (let i = 0; i < 12; i++) {
    filas.push({
        Name: `Tubo [${i}]`, 'Cotas::Longitud': '10 m',
        'Datos::Partida1': '06.02.01.03.01', 'Datos::Desc1': 'SUMINISTRO DE TUBERÍA ESTRUCTURADA HDPE SEGÚN NTP 21138-2 SN4', 'Datos::Und1': 'm',
        'Datos::Partida2': '06.02.01.03.05', 'Datos::Desc2': 'INSTALACION DE TUBERIA HDPE DN 1500', 'Datos::Und2': i === 0 ? 'm2' : 'm',
    });
}
for (let i = 0; i < 6; i++) {
    filas.push({ Name: `Fuste [${i}]`, 'Cotas::Volumen': '2 m^3', 'Datos::Partida1': '06.05.02.04.03.08', 'Datos::Desc1': 'FUSTE CONCRETO F\'C=280', 'Datos::Und1': 'm3' });
    filas.push({ Name: `Cartel [${i}]`, 'Datos::Partida1': '09.01.01', 'Datos::Desc1': 'CARTEL DE OBRA PROVISIONAL', 'Datos::Und1': 'und' });
}
const perfiles = PF.perfilarCampos(filas);

titulo('CRUZAR LOS PARÁMETROS DEL MODELO CON EL ITEMIZADO');
const cruce = IT.cruzarCampos(filas, perfiles, ind);
const de = c => cruce.find(x => x.clave === c);
ok('Partida1: 1 exacto, 1 sub-partida, 1 fuera', de('Datos::Partida1') && de('Datos::Partida1').exactos === 1 && de('Datos::Partida1').subpartidas === 1 && de('Datos::Partida1').fuera === 1);
ok('Partida2: todo exacto', de('Datos::Partida2') && de('Datos::Partida2').exactos === 1 && de('Datos::Partida2').fuera === 0);
ok('Desc1: la del suministro coincide aunque lleve tildes', de('Datos::Desc1') && de('Datos::Desc1').exactos === 1);
ok('Desc2 no coincide (redactada distinto) → no aparece', !de('Datos::Desc2'));

titulo('PARTIDAS CON EL ITEMIZADO: UNIDAD Y DESCRIPCIÓN OFICIALES');
const roles = PF.deducirRoles(filas, perfiles, { itemizado: ind });
ok('con itemizado, Partida1 y Partida2 son códigos aunque tengan menos de 5 distintos', roles.lineas.map(l => l.codigo).sort().join(',') === 'Datos::Partida1,Datos::Partida2');
ok('sin itemizado no lo serían', PF.deducirRoles(filas, perfiles).lineas.length === 0);
// Otro parámetro con forma de código (como 03_03_01_DSI_CodigoDePartida en el Canal), con códigos
// que NO están en el itemizado: no es una línea de partidas, aunque tenga muchos códigos.
const conOtro = filas.map((f, i) => ({ ...f, 'Datos::OtroCodigo': `07.0${i % 6}.0${i % 9}.01` }));
const rolesOtro = PF.deducirRoles(conOtro, PF.perfilarCampos(conOtro), { itemizado: ind });
ok('con itemizado, un parámetro de códigos ajenos al itemizado no cuenta como partidas', !rolesOtro.lineas.some(l => l.codigo === 'Datos::OtroCodigo'));
ok('descripciones: Desc1 y Desc2 de su línea', roles.lineas.find(l => l.codigo === 'Datos::Partida1').descripcion === 'Datos::Desc1' && roles.lineas.find(l => l.codigo === 'Datos::Partida2').descripcion === 'Datos::Desc2');
const claves = [...new Set(filas.flatMap(Object.keys))];
const dic = { ...PF.diccionarioDeducido(roles, claves), itemizado: ind };
const { partidas } = PP.analizarPartidas(filas, dic, f => f.Name);
const inst = partidas.filter(p => p.codigo === '06.02.01.03.05');
ok('la instalación es UNA partida en m (la unidad oficial manda sobre el m² del modelo)', inst.length === 1 && inst[0].unidad === 'm' && inst[0].elementos === 12 && inst[0].cantidad === 120);
ok('lleva la descripción oficial y guarda la del modelo', inst[0].nombre.startsWith('INSTALACION DE TUBERIA ESTRUCTURADA HDPE NTP 21138-2 DN 1500') && inst[0].nombreModelo === 'INSTALACION DE TUBERIA HDPE DN 1500');
const fuste = partidas.find(p => p.codigo === '06.05.02.04.03.08');
ok('la sub-partida conserva su unidad y descripción del modelo', fuste && fuste.unidad === 'm³' && fuste.nombre === 'FUSTE CONCRETO F\'C=280' && !fuste.oficial);
const grupos = PP.gruposDePartidas(partidas, ind);
ok('el capítulo lleva su descripción oficial', grupos.find(g => g.codigo === '06.02.01.03')?.nombre === 'TUBERIAS');

titulo('LO QUE NO CUADRA');
const dif = IT.diferencias(partidas, ind, leido.items);
ok('el cartel no está en el itemizado', dif.fuera.length === 1 && dif.fuera[0].codigo === '09.01.01');
ok('la instalación: descripción del modelo distinta de la oficial', dif.descripcionDistinta.some(x => x.p.codigo === '06.02.01.03.05'));
ok('ítems con unidad sin elementos en el modelo: transporte (el buzón tiene su fuste)', dif.sinElementos.map(x => x.item).join(',') === '06.09.01.01.01');

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
