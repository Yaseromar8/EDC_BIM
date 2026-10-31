import { fusionar, mismoContenido } from '../../design/lienzo/fusion.js';
let ok = 0, n = 0;
const ver = (nombre, cond, info) => { n++; if (cond) ok++; console.log((cond ? 'PASS ' : 'FAIL ') + nombre, cond ? '' : JSON.stringify(info)); };
const nota = (id, texto, x = 0) => ({ id, tipo: 'nota', x, y: 0, w: 200, h: 200, texto });
const ids = (c) => c.notas.map(x => x.id + ':' + x.texto + '@' + x.x).join(' ');
const base = { notas: [nota('a', 'A'), nota('b', 'B'), nota('c', 'C')], secciones: [] };

// 1 · Cada uno toca una nota distinta: se quedan los dos cambios
let r = fusionar(base, { ...base, notas: [nota('a', 'A mía'), nota('b', 'B'), nota('c', 'C')] },
  { ...base, notas: [nota('a', 'A'), nota('b', 'B suya'), nota('c', 'C')] });
ver('cambios en notas distintas se suman', ids(r) === 'a:A mía@0 b:B suya@0 c:C@0', ids(r));
// 2 · Los dos tocan la misma: gana la mía (soy quien guarda)
r = fusionar(base, { ...base, notas: [nota('a', 'mía'), nota('b', 'B'), nota('c', 'C')] },
  { ...base, notas: [nota('a', 'suya'), nota('b', 'B'), nota('c', 'C')] });
ver('misma nota: la mía', ids(r) === 'a:mía@0 b:B@0 c:C@0', ids(r));
// 3 · Notas nuevas de los dos: están todas; las suyas en su sitio y las mías detrás
r = fusionar(base, { ...base, notas: [...base.notas, nota('m', 'nueva mía')] },
  { ...base, notas: [...base.notas, nota('s', 'nueva suya')] });
ver('nuevas de los dos', ids(r) === 'a:A@0 b:B@0 c:C@0 s:nueva suya@0 m:nueva mía@0', ids(r));
// 4 · La borré yo y él no la tocó: borrada
r = fusionar(base, { ...base, notas: [nota('a', 'A'), nota('c', 'C')] }, base);
ver('borrada por mí, intacta en el servidor: fuera', ids(r) === 'a:A@0 c:C@0', ids(r));
// 5 · La borré yo pero él la movió: se queda la suya
r = fusionar(base, { ...base, notas: [nota('a', 'A'), nota('c', 'C')] },
  { ...base, notas: [nota('a', 'A'), nota('b', 'B', 300), nota('c', 'C')] });
ver('borrada por mí, cambiada por él: se queda', ids(r) === 'a:A@0 b:B@300 c:C@0', ids(r));
// 6 · La borró él y yo la cambié: se queda la mía
r = fusionar(base, { ...base, notas: [nota('a', 'A'), nota('b', 'B mía'), nota('c', 'C')] },
  { ...base, notas: [nota('a', 'A'), nota('c', 'C')] });
ver('borrada por él, cambiada por mí: se queda (detrás, encima)', ids(r) === 'a:A@0 c:C@0 b:B mía@0', ids(r));
// 7 · La borró él y yo no la toqué: borrada
r = fusionar(base, base, { ...base, notas: [nota('a', 'A'), nota('c', 'C')] });
ver('borrada por él, intacta en mí: fuera', ids(r) === 'a:A@0 c:C@0', ids(r));
// 8 · Las secciones se fusionan igual y las claves desconocidas del servidor se conservan
r = fusionar({ notas: [], secciones: [{ id: 'f', titulo: 'F' }] },
  { notas: [], secciones: [{ id: 'f', titulo: 'F mía' }] },
  { notas: [], secciones: [{ id: 'f', titulo: 'F' }, { id: 'g', titulo: 'G' }], futuro: 1 });
ver('secciones y claves ajenas', r.secciones.map(s => s.titulo).join(',') === 'F mía,G' && r.futuro === 1, r);
// 9 · Contenido vacío o sin listas no rompe
r = fusionar({}, { notas: [nota('a', 'A')] }, {});
ver('sin base ni servidor', ids(r) === 'a:A@0' && Array.isArray(r.secciones), r);
// 10 · mismoContenido
ver('mismoContenido', mismoContenido(base, JSON.parse(JSON.stringify(base))) && !mismoContenido(base, { notas: [] }), null);
console.log(`${ok}/${n}`);
