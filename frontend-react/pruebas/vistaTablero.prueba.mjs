// Banco de las VISTAS PUBLICADAS de un tablero (docs/visor/63): qué enseña una vista, cómo se encuadra, qué pasa
// de `config.vistas` y cómo se fusionan cuando dos personas las tocan a la vez.
import { elementosDeVista, cajaDeVista, encuadre, limpiarVistas, nombreArchivo, MAX_VISTAS } from '../../design/lienzo/vista.js';
import { fusionar, mismoContenido } from '../../design/lienzo/fusion.js';
let ok = 0, n = 0;
const ver = (nombre, cond, info) => { n++; if (cond) ok++; console.log((cond ? 'PASS ' : 'FAIL ') + nombre, cond ? '' : JSON.stringify(info)); };
const nota = (id, x, y, w = 200, h = 200) => ({ id, tipo: 'nota', x, y, w, h, texto: id });
const contenido = {
  secciones: [{ id: 's1', x: 1000, y: 0, w: 600, h: 400, titulo: 'Frente' }],
  notas: [nota('a', 0, 0), nota('b', 300, 0), nota('dentro', 1100, 100), nota('asomada', 1500, 300)],
};

// 1 · Elementos: los elegidos, en el orden del tablero; lo que ya no está, fuera
let e = elementosDeVista(contenido, ['b', 'a', 'borrada']);
ver('solo los elegidos que siguen, en el orden de dibujo', e.notas.map(x => x.id).join() === 'a,b' && !e.secciones.length, e);
// 2 · Una sección publica lo que tiene dentro (entero), no lo que solo asoma
e = elementosDeVista(contenido, ['s1']);
ver('una sección lleva lo que tiene dentro', e.secciones.length === 1 && e.notas.map(x => x.id).join() === 'dentro', e.notas.map(x => x.id));
// 3 · Nada que enseñar
ver('vista sin nada: caja nula', cajaDeVista(elementosDeVista(contenido, ['x'])) === null);
// 4 · La caja incluye el título de la sección (36 por encima)
const c = cajaDeVista(elementosDeVista(contenido, ['a', 's1']));
ver('caja: de la nota a la sección, con su título', c.x1 === 0 && c.y1 === -36 && c.x2 === 1600 && c.y2 === 400, c);
// 5 · Encuadre: cabe con el margen y queda centrada
const cam = encuadre(c, 1000, 600, 50);
const ancho = (c.x2 - c.x1) * cam.s, alto = (c.y2 - c.y1) * cam.s;
ver('encuadre: cabe dentro del margen', ancho <= 900 + 1e-6 && alto <= 500 + 1e-6, { ancho, alto });
ver('encuadre: centrada', Math.abs(cam.tx + c.x1 * cam.s - (1000 - ancho) / 2) < 1e-6 && Math.abs(cam.ty + c.y1 * cam.s - (600 - alto) / 2) < 1e-6, cam);
ver('encuadre: una nota sola no pasa de ×2', encuadre(cajaDeVista({ notas: [nota('p', 0, 0, 10, 10)] }), 1000, 600).s === 2);
// 6 · limpiarVistas: solo pasa lo que tiene forma de vista
const sucias = [{ id: 'v1', titulo: '  ', ids: ['a', 3, 'b'] }, { id: 7, ids: [] }, null, { id: 'v2', ids: 'a' }, { id: 'v3', titulo: 'Reunión', ids: [], creadaPor: 'Ana', extra: 'x' }];
const limpias = limpiarVistas(sucias);
ver('limpiar: quedan las dos válidas', limpias.length === 2 && limpias[0].id === 'v1' && limpias[1].id === 'v3', limpias);
ver('limpiar: sin título → «Vista»; ids solo texto', limpias[0].titulo === 'Vista' && limpias[0].ids.join() === 'a,b', limpias[0]);
ver('limpiar: no deja pasar campos desconocidos', !('extra' in limpias[1]) && limpias[1].creadaPor === 'Ana', limpias[1]);
ver('limpiar: lo que no es lista → []', limpiarVistas(undefined).length === 0 && limpiarVistas({}).length === 0);
ver('limpiar: tope de vistas', limpiarVistas(Array.from({ length: MAX_VISTAS + 5 }, (_, i) => ({ id: `v${i}`, ids: [] }))).length === MAX_VISTAS);
// 7 · Fusión: dos personas publican a la vez → están las dos; una renombra y otra quita otra → los dos cambios
const v = (id, titulo) => ({ id, titulo, ids: ['a'] });
const base = { ...contenido, vistas: [v('x', 'X'), v('y', 'Y')] };
let r = fusionar(base, { ...base, vistas: [...base.vistas, v('mia', 'Mía')] }, { ...base, vistas: [...base.vistas, v('suya', 'Suya')] });
ver('fusión: las dos vistas nuevas', r.vistas.map(x => x.id).join() === 'x,y,suya,mia', r.vistas);
r = fusionar(base, { ...base, vistas: [v('x', 'X renombrada'), v('y', 'Y')] }, { ...base, vistas: [v('x', 'X')] });
ver('fusión: renombro una, el otro quita otra', r.vistas.map(x => `${x.id}:${x.titulo}`).join() === 'x:X renombrada', r.vistas);
ver('mismoContenido mira las vistas', !mismoContenido(base, { ...base, vistas: [v('x', 'X')] }) && mismoContenido(contenido, { ...contenido, vistas: [] }));
// 8 · Nombre de archivo
ver('nombre de archivo sin caracteres prohibidos', nombreArchivo('Tablero: A/B - "reunión"?') === 'Tablero A B - reunión', nombreArchivo('Tablero: A/B - "reunión"?'));

console.log(`${ok}/${n}`);
if (ok !== n) process.exit(1);
