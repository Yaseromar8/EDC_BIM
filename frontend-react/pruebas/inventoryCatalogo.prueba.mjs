// Banco de lib/inventoryCatalogo.js — node frontend-react/pruebas/inventoryCatalogo.prueba.mjs
import * as C from '../src/lib/inventoryCatalogo.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 200 elementos con los cuatro casos medidos en Drenaje.
const filas = Array.from({ length: 200 }, (_, i) => ({
    Name: `Suelo [${i}]`,
    'Cotas::Área': `${(i % 17) + 1}.5 m^2`,                  // útil, numérica con unidad
    'Datos::01_14_DSI_SubZona': i < 108 ? `ZONA ${i % 9}` : '', // útil, 54 % con dato
    'Otros::Nombre de proyecto': 'PQT8',                     // mismo valor en todos
    'Construcción::Partición': i === 7 ? 'MUROS' : '',       // casi sin datos (0,5 %)
    'Construcción::Envolvente en inserciones': i < 40 ? (i % 2 ? 'Ambas' : 'Interior') : '',
}));
const claves = Object.keys(filas[0]);
const cat = C.catalogoDeCampos(filas, claves);

console.log('\nFICHAS');
const area = cat.get('Cotas::Área');
ok('nombre y grupo separados', area.nombre === 'Área' && area.grupo === 'Cotas');
ok('unidad leída del dato', area.unidad === 'm²' && area.tipo === 'numero');
ok('Name es de la Planilla', cat.get('Name').clase === 'propio' && cat.get('Name').grupo === 'Planilla');
ok('SubZona útil con 54 % de dato', cat.get('Datos::01_14_DSI_SubZona').clase === 'util' && Math.round(cat.get('Datos::01_14_DSI_SubZona').conDato * 100) === 54);
ok('nombre de proyecto: mismo valor en todos', cat.get('Otros::Nombre de proyecto').clase === 'constante');
ok('Partición: casi sin datos', cat.get('Construcción::Partición').clase === 'raro');
ok('Envolvente con dos valores en el 20 %: útil, no se esconde', cat.get('Construcción::Envolvente en inserciones').clase === 'util');
ok('notas legibles', C.notaDeCampo(cat.get('Datos::01_14_DSI_SubZona')) === '54 % con dato' && C.notaDeCampo(cat.get('Otros::Nombre de proyecto')) === 'mismo valor en todos' && C.notaDeCampo(cat.get('Construcción::Partición')) === 'casi sin datos');
ok('clave sin grupo', igual(C.partesDeClave('Material'), { grupo: 'Planilla', nombre: 'Material' }));
const conInterno = C.catalogoDeCampos([{ '__category__::__category__': 'Walls', Name: 'x' }], ['__category__::__category__', 'Name']);
ok('las claves de servicio son internas y no se ofrecen', conInterno.get('__category__::__category__').clase === 'interno' && C.buscarCampos([...conInterno.values()], '').length === 1 && C.seccionesDeCampos([...conInterno.values()]).flatMap(s => s.fichas).length === 1);

console.log('\nBUSCAR');
const fichas = [...cat.values()];
ok('sin tildes ni mayúsculas', C.buscarCampos(fichas, 'AREA')[0].clave === 'Cotas::Área');
ok('por grupo y nombre a la vez', igual(C.buscarCampos(fichas, 'construccion envolvente').map(f => f.clave), ['Construcción::Envolvente en inserciones']));
ok('por la unidad', C.buscarCampos(fichas, 'm²').some(f => f.clave === 'Cotas::Área'));
const dos = [{ clave: 'A::Área de paso', nombre: 'Área de paso', grupo: 'A', unidad: '', clase: 'util', conDato: 0.9 }, { clave: 'B::Paso', nombre: 'Paso', grupo: 'B', unidad: '', clase: 'util', conDato: 0.1 }];
ok('lo que empieza por lo escrito va primero (aunque tenga menos datos)', C.buscarCampos(dos, 'paso')[0].clave === 'B::Paso');
ok('sin texto: Planilla primero y lo raro al final', (() => { const l = C.buscarCampos(fichas, ''); return l[0].clase === 'propio' && l[l.length - 1].clase === 'raro'; })());

console.log('\nSECCIONES');
const sec = C.seccionesDeCampos(fichas, 1);
ok('Planilla, luego «Con más datos»', sec[0].titulo === 'Planilla' && sec[1].titulo === 'Con más datos' && sec[1].fichas.length === 1);
ok('ningún campo se pierde ni se repite', (() => { const todas = sec.flatMap(s => s.fichas.map(f => f.clave)); return todas.length === claves.length && new Set(todas).size === claves.length; })());
ok('dentro de un grupo, lo raro al final', (() => { const g = sec.find(s => s.titulo === 'Construcción'); return !g || g.fichas[g.fichas.length - 1].clase === 'raro'; })());

console.log('\nRENDIMIENTO (20.000 filas × 360 campos, como Drenaje)');
const grandes = Array.from({ length: 20000 }, (_, i) => Object.fromEntries(Array.from({ length: 360 }, (_, j) => [`G${j % 20}::P${j}`, j % 4 === 0 ? '' : j % 4 === 1 ? 'X' : `${(i * j) % 97}.1 m^3`])));
const t0 = performance.now();
const grande = C.catalogoDeCampos(grandes, Object.keys(grandes[0]));
const ms = performance.now() - t0;
console.log(`  catálogo en ${ms.toFixed(0)} ms (${grande.size} campos)`);
ok('catálogo de 360 campos < 1,5 s', ms < 1500);

console.log(`\n${total - fallos}/${total} ${fallos ? 'CON FALLOS' : 'en verde'}\n`);
process.exit(fallos ? 1 : 0);
