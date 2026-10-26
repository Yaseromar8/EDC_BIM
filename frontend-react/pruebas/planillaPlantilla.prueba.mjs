// Banco de lib/planillaPlantilla.js — node frontend-react/pruebas/planillaPlantilla.prueba.mjs
import * as T from '../src/lib/planillaPlantilla.js';
import { indiceDeItemizado } from '../src/lib/planillaItemizado.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };

// Un itemizado tipo presupuesto (S10): títulos sin unidad, partidas con unidad, en SU orden (no por código).
const ITEMS = [
    { item: '01', descripcion: 'OBRAS PROVISIONALES', unidad: '' },
    { item: '01.02', descripcion: 'CARTEL DE OBRA', unidad: 'und' },
    { item: '01.01', descripcion: 'MOVILIZACION', unidad: 'glb' },
    { item: '02', descripcion: 'CANAL', unidad: '' },
    { item: '02.01', descripcion: 'MOVIMIENTO DE TIERRAS', unidad: '' },
    { item: '02.01.01', descripcion: 'EXCAVACION', unidad: 'm3' },
    { item: '2.1.2', descripcion: 'RELLENO', unidad: 'm3' },
    { item: '02.02', descripcion: 'CONCRETO', unidad: '' },
    { item: '02.02.01', descripcion: 'SOLADO', unidad: 'm3' },
    { item: '03', descripcion: 'DRENAJE', unidad: '' },
    { item: '03.01', descripcion: 'TUBERIA', unidad: 'm' },
];
const p = (codigo, cantidad, claves, extra = {}) => ({ clave: `${codigo}|m³`, codigo, nombre: 'x', unidad: 'm³', elementos: claves.length, conMedida: claves.length, sinMedida: 0,
    cantidad, manual: 0, conManual: 0, porCriterio: 0, conflictos: 0, unidadDistinta: 0, intercambiadas: 0, origenes: ['nativa'], medidoCon: [], claves, ...extra });
const PARTIDAS = [
    p('02.01.01', 100, ['a', 'b']),
    p('2.1.1', 5, ['c']),                       // el mismo ítem escrito sin ceros en otro elemento
    p('02.02.01.08', 12, ['d']),                // sub-partida del solado
    p('09.99', 1, ['z']),                       // fuera del itemizado
    { ...p('', 3, ['y']), codigo: '' },         // sin código
];
const pl = T.plantillaDelItemizado(ITEMS, PARTIDAS, indiceDeItemizado(ITEMS));

titulo('LA PLANTILLA ES EL ITEMIZADO, EN SU ORDEN');
ok('todas las filas, en el orden del Excel (01.02 antes que 01.01)', pl.filas.map(f => f.item).join(',') === ITEMS.map(x => x.item).join(','));
ok('títulos = filas sin unidad; partidas = con unidad', pl.resumen.titulos === 5 && pl.resumen.partidas === 6);
ok('nivel por los tramos del código (con o sin ceros)', pl.filas.map(f => f.nivel).join('') === '12212332312');
const exc = pl.filas.find(f => f.item === '02.01.01');
ok('partida con dato: une «02.01.01» y «2.1.1» en una sola suma', exc.datos.cantidad === 105 && exc.datos.elementos === 3 && exc.datos.unidas === 2 && exc.datos.claves.length === 3);
const rel = pl.filas.find(f => f.item === '2.1.2');
ok('partida SIN dato: queda, vacía', rel.datos === null && rel.sub.length === 0 && rel.conDato === false);
const sol = pl.filas.find(f => f.item === '02.02.01');
ok('sub-partida del modelo, debajo de su ítem', sol.datos === null && sol.sub.length === 1 && sol.sub[0].codigo === '02.02.01.08' && sol.conDato);
ok('las del modelo fuera del itemizado (y sin código), aparte', pl.fuera.length === 2 && pl.resumen.fuera === 2);
ok('resumen: 2 de 6 partidas con dato', pl.resumen.conDato === 2);

titulo('TÍTULOS: «x de y con dato», por el orden');
const t = item => pl.filas.find(f => f.item === item);
ok('01: 0 de 2', t('01').total === 2 && t('01').conDato === 0);
ok('02 contiene a 02.01 y 02.02: 2 de 3', t('02').total === 3 && t('02').conDato === 2);
ok('02.01: 1 de 2 · 02.02: 1 de 1', t('02.01').total === 2 && t('02.01').conDato === 1 && t('02.02').total === 1 && t('02.02').conDato === 1);
ok('03: 0 de 1, y termina al final', t('03').total === 1 && t('03').hasta === ITEMS.length);
ok('los elementos de un título (para aislar en 3D)', T.clavesDelTitulo(pl, pl.filas.indexOf(t('02'))).sort().join('') === 'abcd');

titulo('QUÉ SE VE');
const todas = T.filasVisibles(pl);
ok('por defecto TODO, desplegado, como un Excel', todas.length === ITEMS.length);
const plegado = T.filasVisibles(pl, { plegados: new Set([pl.filas.indexOf(t('02'))]) });
ok('plegar un título a mano oculta lo suyo y nada más', plegado.map(i => pl.filas[i].item).join(',') === '01,01.02,01.01,02,03,03.01');
const solo = T.filasVisibles(pl, { soloConDato: true }).map(i => pl.filas[i].item);
ok('«solo con dato»: las partidas con dato y sus títulos', solo.join(',') === '02,02.01,02.01.01,02.02,02.02.01');
const busca = T.filasVisibles(pl, { texto: 'relleno' }).map(i => pl.filas[i].item);
ok('el buscador encuentra también la partida vacía, con sus títulos', busca.includes('2.1.2') && busca.includes('02.01') && busca.includes('02') && !busca.includes('03.01'));
ok('…y la búsqueda por código, con o sin ceros', T.filasVisibles(pl, { texto: '03.01' }).map(i => pl.filas[i].item).includes('03.01'));

titulo('UN ITEMIZADO SIN TÍTULOS NI TRAMOS');
{
    const plano = [{ item: 'A1', descripcion: 'uno', unidad: 'm' }, { item: 'A2', descripcion: 'dos', unidad: 'm' }];
    const pp = T.plantillaDelItemizado(plano, [], indiceDeItemizado(plano));
    ok('lista plana en su orden, todo nivel 1, nada con dato', pp.filas.map(f => `${f.item}${f.nivel}`).join(',') === 'A11,A21' && pp.resumen.conDato === 0 && T.filasVisibles(pp).length === 2);
}

titulo('A ESCALA');
{
    const grande = [];
    for (let c = 1; c <= 50; c++) {
        grande.push({ item: String(c).padStart(2, '0'), descripcion: `CAP ${c}`, unidad: '' });
        for (let s = 1; s <= 999; s++) grande.push({ item: `${String(c).padStart(2, '0')}.${String(s).padStart(3, '0')}`, descripcion: `P ${c}.${s}`, unidad: 'm' });
    }
    const part = Array.from({ length: 3000 }, (_, i) => p(grande[1 + (i * 13) % (grande.length - 1)].item, 1, [`e${i}`]));
    const t0 = performance.now();
    const pg = T.plantillaDelItemizado(grande, part, indiceDeItemizado(grande));
    const vis = T.filasVisibles(pg, { texto: 'P 7.1' });
    const ms = performance.now() - t0;
    console.log(`  ${grande.length} filas, ${part.length} partidas del modelo: ${ms.toFixed(0)} ms`);
    ok('50.000 filas (el máximo aceptado) en menos de 1,5 s', pg.filas.length === 50000 && vis.length > 0 && ms < 1500);
}

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
