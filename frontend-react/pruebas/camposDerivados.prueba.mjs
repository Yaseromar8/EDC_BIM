// Banco de lib/camposDerivados.js — node frontend-react/pruebas/camposDerivados.prueba.mjs
import { aplicarDerivados, quitarDerivados, esquemaDerivado, CAMPOS_DERIVADOS, ID_ESTADO, ID_CAPITULO, VARIOS_CAPITULOS } from '../src/lib/camposDerivados.js';
import { indiceDeItemizado } from '../src/lib/planillaItemizado.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };

const items = [
    { item: '05', descripcion: 'ESTRUCTURAS', unidad: '' },
    { item: '05.15.03.05', descripcion: 'ACERO DE REFUERZO FY=4200', unidad: 'kg' },
    { item: '05.15.03.06', descripcion: 'ACERO DE REFUERZO EN LOSAS', unidad: 'kg' },
    { item: '05.15.04.01', descripcion: 'CONCRETO FC=280', unidad: 'm3' },
    { item: '05.15.04.02', descripcion: 'CONCRETO FC=210', unidad: 'm3' },
    { item: '06', descripcion: 'DRENAJE URBANO', unidad: '' },
    { item: '06.02.01.03.05', descripcion: 'INSTALACION DE TUBERIA HDPE', unidad: 'm' },
    { item: '06.05.02.04.03', descripcion: 'BUZON TIPO T2', unidad: 'und' },
];
const itemizado = { items, indice: indiceDeItemizado(items) };
// Filas como las del inventario: parámetros con grupo, una línea de partida con código, nombre y unidad.
const linea = (cod, nom, und) => ({ 'Datos::CodigoDePartida1': cod, 'Datos::NombreDePartida1': nom, 'Datos::Unidad1': und });
const filas = [];
const base = [
    linea('05.15.03.05', 'ACERO DE REFUERZO FY=4200', 'kg'), linea('05.15.03.06', 'ACERO DE REFUERZO EN LOSAS', 'kg'),
    linea('05.15.04.01', 'CONCRETO FC=280', 'm3'), linea('05.15.04.02', 'CONCRETO FC=210', 'm3'),
    linea('06.02.01.03.05', 'INSTALACION DE TUBERIA HDPE', 'm'), linea('06.05.02.04.03', 'BUZON TIPO T2', 'und'),
];
for (let i = 0; i < 60; i++) filas.push({ id: `e${i}`, 'Revit Category': 'Genérico', 'Otros::Comentario': `nota ${i % 4}`, ...base[i % base.length] });
filas.push({ id: 'sub', ...linea('06.05.02.04.03.08', 'FUSTE', 'und') });
filas.push({ id: 'fuera', ...linea('09.01.01', 'OTRA COSA', 'm') });
filas.push({ id: 'sin', 'Revit Category': 'Suelos' });
// Elementos con DOS líneas (la segunda en otro capítulo); la línea 2 tiene que repetirse para deducirse.
const segunda = [['06.02.01.03.05', 'INSTALACION DE TUBERIA HDPE', 'm'], ['06.05.02.04.03', 'BUZON TIPO T2', 'und']];
for (let i = 0; i < 8; i++) {
    const [c, n, u] = segunda[i % 2];
    filas.push({ id: i ? `dos${i}` : 'dos', ...linea('05.15.03.05', 'ACERO DE REFUERZO FY=4200', 'kg'), 'Datos::CodigoDePartida2': c, 'Datos::NombreDePartida2': n, 'Datos::Unidad2': u });
}
const de = id => filas.find(f => f.id === id);

titulo('ESQUEMA (lo que lista el ⚙ de Filters)');
const esq = esquemaDerivado();
ok('dos campos, con grupo «Planilla» y su regla', esq.length === 2 && esq.every(e => e.category === 'Planilla' && e.id.startsWith('Planilla::') && e.regla && e.derivado));
ok('los ids son los que se escriben en las filas', esq.map(e => e.id).join() === [ID_ESTADO, ID_CAPITULO].join());
ok('congelado', Object.isFrozen(CAMPOS_DERIVADOS) && Object.isFrozen(CAMPOS_DERIVADOS[0]));

titulo('APLICAR');
const r = aplicarDerivados(filas, itemizado);
ok('deduce la línea de partida de los valores (sin nombres)', r.roles.lineas.some(l => l.codigo === 'Datos::CodigoDePartida1'));
ok('escribe el estado en cada fila', filas.every(f => typeof f[ID_ESTADO] === 'string') && r.aplicados === filas.length);
ok('estados correctos', de('e0')[ID_ESTADO] === 'Con partida del itemizado' && de('sub')[ID_ESTADO] === 'Con sub-partida de un ítem'
    && de('fuera')[ID_ESTADO] === 'Partida fuera del itemizado o sin código' && de('sin')[ID_ESTADO] === 'Sin partida');
ok('capítulo con su nombre oficial', de('e0')[ID_CAPITULO] === '05 ESTRUCTURAS' && de('e4')[ID_CAPITULO] === '06 DRENAJE URBANO' && de('sub')[ID_CAPITULO] === '06 DRENAJE URBANO');
ok('dos capítulos: «Varios capítulos»', de('dos')[ID_CAPITULO] === VARIOS_CAPITULOS);
ok('sin partida o fuera: sin capítulo', !(ID_CAPITULO in de('sin')) && !(ID_CAPITULO in de('fuera')));
ok('cuenta por estado', r.porEstado.sin === 1 && r.porEstado.fuera === 1 && r.porEstado.subpartida === 1 && r.porEstado.exacta === 68);
ok('devuelve el diccionario para que la Planilla no deduzca otra vez', r.dic && r.dic.itemizado === itemizado.indice);

titulo('OTRO ITEMIZADO Y QUITAR');
// Otro itemizado SIN las partidas de acero (05.15.03.*): el acero queda fuera y sin capítulo.
const sinAcero = items.filter(x => !x.item.startsWith('05.15.03'));
aplicarDerivados(filas, { items: sinAcero, indice: indiceDeItemizado(sinAcero) });
ok('con otro itemizado no queda NADA del anterior', de('e0')[ID_ESTADO] === 'Partida fuera del itemizado o sin código' && !(ID_CAPITULO in de('e0'))
    && de('e2')[ID_CAPITULO] === '05 ESTRUCTURAS' && de('e4')[ID_CAPITULO] === '06 DRENAJE URBANO' && de('dos')[ID_CAPITULO] === '06 DRENAJE URBANO');
const r0 = aplicarDerivados(filas, null);
ok('sin itemizado: los campos se quitan de todas las filas', r0.aplicados === 0 && filas.every(f => !(ID_ESTADO in f) && !(ID_CAPITULO in f)));
ok('quitar dos veces no falla', quitarDerivados(filas) === 0 && quitarDerivados(null) === 0);
ok('sin filas: nada', aplicarDerivados([], itemizado).aplicados === 0);

titulo('ESCALA');
const muchas = Array.from({ length: 20000 }, (_, i) => ({ id: `x${i}`, 'Otros::A': `v${i % 30}`, 'Otros::B': i % 5, ...base[i % base.length] }));
const rg = aplicarDerivados(muchas, itemizado);
ok(`20.000 elementos en ${rg.ms} ms (< 2.000)`, rg.ms < 2000 && rg.aplicados === 20000);

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
