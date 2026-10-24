// Banco de lib/planillaPerfil.js — node frontend-react/pruebas/planillaPerfil.prueba.mjs
import * as PF from '../src/lib/planillaPerfil.js';
import * as PP from '../src/lib/planillaPartidas.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };

titulo('FORMA DE UN VALOR');
ok('códigos de varios niveles y sistemas', ['06.02.01.03', '1.2.3', '01-02-03', 'OE.2.1.1', '01.01', 'OE.2'].every(PF.esCodigo));
ok('números y medidas NO son códigos', !['1.522', '0.500', '37.791 m', '2026', '12', '1.5'].some(PF.esCodigo));
ok('unidades de obra', ['m', 'm2', 'M3', 'Kg', 'und', 'glb', 'Und.', 'm³'].every(PF.esUnidad) && !PF.esUnidad('TUBERIA'));
ok('formas', PF.formaDeValor('06.02.01') === 'codigo' && PF.formaDeValor('m3') === 'unidad' && PF.formaDeValor('20261024') === 'fecha'
    && PF.formaDeValor('24/10/2026') === 'fecha' && PF.formaDeValor('37.791 m') === 'numero' && PF.formaDeValor('NA') === 'relleno'
    && PF.formaDeValor('SUMINISTRO DE TUBERIA') === 'texto' && PF.formaDeValor('') === 'vacio');
ok('familia: el número final es la línea', PF.familia('Datos::03_05_DSI_CodigoDePartida3').sufijo === '3'
    && PF.familia('Datos::03_05_DSI_CodigoDePartida').sufijo === '' && PF.familia('Datos::Nivel_2').sufijo === '');

// Un proyecto que NO usa DSI: «ITEM», «DESCRIPCION PARTIDA», «UND» y otros parámetros.
const partidas = [
    ['01.02.03', 'EXCAVACION DE ZANJA CON MAQUINARIA', 'm3'],
    ['01.02.04', 'RELLENO COMPACTADO CON MATERIAL PROPIO', 'm3'],
    ['02.01.01', 'SUMINISTRO DE TUBERIA PVC UF DN 200 MM', 'm'],
    ['02.01.02', 'INSTALACION DE TUBERIA PVC UF DN 200 MM', 'm'],
    ['03.01.05', 'CONCRETO F\'C=210 KG/CM2 EN LOSAS', 'm3'],
];
const filas = [];
for (let i = 0; i < 60; i++) {
    const [c, d, u] = partidas[i % partidas.length];
    filas.push({
        Name: `Elemento [${1000 + i}]`, 'Identidad::Marca': `M-${i}`, 'Datos::ITEM': c, 'Datos::DESCRIPCION PARTIDA': d, 'Datos::UND': u,
        'Datos::Comentarios': i % 7 ? '' : 'REVISAR EN OBRA CON SUPERVISION', 'Datos::Frente': i < 30 ? 'FRENTE 1' : 'FRENTE 2',
        'Cotas::Longitud': `${(i + 1) * 1.5} m`, 'Cotas::Volumen': `${i + 1}.000 m^3`, 'Datos::Fecha de vaciado': '20261024',
    });
}
const perfiles = PF.perfilarCampos(filas);
const de = clave => perfiles.find(p => p.clave === clave);

titulo('PERFIL DE LOS PARÁMETROS (sin mirar sus nombres)');
ok('ITEM tiene forma de código (100 %)', de('Datos::ITEM').forma === 'codigo' && de('Datos::ITEM').fraccion === 1);
ok('UND tiene forma de unidad', de('Datos::UND').forma === 'unidad');
ok('Longitud es número; la fecha, fecha', de('Cotas::Longitud').forma === 'numero' && de('Datos::Fecha de vaciado').forma === 'fecha');
ok('cobertura y distintos', de('Datos::Comentarios').llenos === 9 && de('Datos::Frente').distintos === 2 && de('Datos::ITEM').distintos === 5);

titulo('ROLES DEDUCIDOS POR LOS VALORES');
const roles = PF.deducirRoles(filas, perfiles);
ok('una línea de partida', roles.lineas.length === 1);
const l = roles.lineas[0];
ok('código = ITEM', l.codigo === 'Datos::ITEM');
ok('descripción = DESCRIPCION PARTIDA (no Comentarios, no Name)', l.descripcion === 'Datos::DESCRIPCION PARTIDA');
ok('unidad = UND', l.unidad === 'Datos::UND');
ok('dice por qué, con números', l.porque.length === 3 && /100 %/.test(l.porque[1]));

titulo('EL MISMO MOTOR DE PARTIDAS, CON LO DEDUCIDO');
const claves = [...new Set(filas.flatMap(Object.keys))];
const dic = PF.diccionarioDeducido(roles, claves);
const { partidas: res } = PP.analizarPartidas(filas, dic, f => f.Name);
const tubo = res.find(p => p.codigo === '02.01.01');
ok('5 partidas', res.length === 5);
ok('la tubería suma su Longitud nativa', tubo && tubo.unidad === 'm' && Math.abs(tubo.cantidad - [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57].reduce((s, i) => s + (i + 1) * 1.5, 0)) < 1e-6);

titulo('VARIAS LÍNEAS POR ELEMENTO (como DSI) Y UN CÓDIGO INTERCAMBIADO');
const dsi = [];
const DN = [200, 300, 400, 600, 800, 1000];
for (let i = 0; i < 48; i++) {
    const k = i % 6;
    const instalacion = `INSTALACION DE TUBERIA HDPE DN ${DN[k]} MM`;
    dsi.push({
        Name: `Tubo [${i}]`, 'Cotas::Longitud': '10 m', 'Otros::Nombre de proyecto': 'DRENAJE PLUVIAL TALARA',
        'Datos::03_05_DSI_CodigoDePartida1': `06.02.01.03.0${k + 1}`, 'Datos::03_04_DSI_NombreDePartida1': `SUMINISTRO DE TUBERIA HDPE DN ${DN[k]} MM`, 'Datos::02_01_DSI_Unidad1': 'm',
        'Datos::03_05_DSI_CodigoDePartida2': `06.02.01.04.0${k + 1}`, 'Datos::03_04_DSI_NombreDePartida2': instalacion, 'Datos::02_01_DSI_Unidad2': 'm',
        // la línea sin número repite la 2; en 3 elementos, con código y descripción cambiados de sitio
        'Datos::03_05_DSI_CodigoDePartida': i < 3 ? instalacion : `06.02.01.04.0${k + 1}`,
        'Datos::03_04_DSI_NombreDePartida': i < 3 ? `06.02.01.04.0${k + 1}` : instalacion,
    });
}
const rd = PF.deducirRoles(dsi);
const porSufijo = Object.fromEntries(rd.lineas.map(x => [x.sufijo, x]));
ok('tres líneas: sin número, 1 y 2', rd.lineas.map(x => x.sufijo).join(',') === ',1,2');
ok('cada código con la descripción y unidad de SU línea', porSufijo['1'].descripcion === 'Datos::03_04_DSI_NombreDePartida1' && porSufijo['2'].descripcion === 'Datos::03_04_DSI_NombreDePartida2'
    && porSufijo['1'].unidad === 'Datos::02_01_DSI_Unidad1' && porSufijo['2'].unidad === 'Datos::02_01_DSI_Unidad2');
ok('la línea sin número encuentra su descripción', porSufijo[''].descripcion === 'Datos::03_04_DSI_NombreDePartida');
ok('un texto igual en toda la obra (nombre del proyecto) no es descripción', !rd.lineas.some(x => x.descripcion === 'Otros::Nombre de proyecto'));
ok('el parámetro sin grupo repetido no da una línea doble', PF.deducirRoles(dsi.map(f => ({ ...f, '03_05_DSI_CodigoDePartida1': f['Datos::03_05_DSI_CodigoDePartida1'] }))).lineas.length === 3);
const clavesDsi = [...new Set(dsi.flatMap(Object.keys))];
const conDsi = PP.analizarPartidas(dsi, PP.diccionarioDSI(clavesDsi), f => f.Name);
const conDeducido = PP.analizarPartidas(dsi, PF.diccionarioDeducido(rd, clavesDsi), f => f.Name);
const firma = r => r.partidas.map(p => `${p.codigo}|${p.unidad}|${p.cantidad}|${p.elementos}`).sort().join(';');
ok('mismo resultado que el diccionario DSI escrito a mano', firma(conDsi) === firma(conDeducido) && conDsi.calidad.intercambiadas === conDeducido.calidad.intercambiadas);

titulo('LO QUE NO ES PARTIDA NO SE CONFUNDE');
const sinPartida = filas.map(({ 'Datos::ITEM': _a, 'Datos::DESCRIPCION PARTIDA': _b, 'Datos::UND': _c, ...resto }) => resto);
ok('sin parámetro con forma de código → ninguna línea', PF.deducirRoles(sinPartida).lineas.length === 0);
const clasificacion = filas.map((f, i) => ({ ...f, 'Datos::Clasificacion': ['01.10', '01.20', '01.30'][i % 3] }));
ok('una clasificación con 3 códigos no es lista de partidas', !PF.deducirRoles(clasificacion).lineas.some(x => x.codigo === 'Datos::Clasificacion'));
const pocos = filas.slice(0, 2);
ok('con 2 elementos no se deduce nada (mínimo 3 valores)', PF.deducirRoles(pocos).lineas.length === 0);

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
