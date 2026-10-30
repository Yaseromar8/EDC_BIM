// auditoriaPresupuesto.js — los elementos del frente frente a SU itemizado (el que el dueño sube a
// la Planilla), por ÍTEM, DESCRIPCIÓN y UNIDAD (docs/visor/50). Capa PURA: sin dibujo ni red.
//
// Cada elemento puede llevar hasta seis partidas: 03_05_DSI_CodigoDePartidaN con su
// 03_04_DSI_NombreDePartidaN y su 02_01_DSI_UnidadN (N vacío, 1…5; también con el prefijo
// «Datos::» de su grupo de Revit). Tres pruebas por partida asignada:
//   ítem         ¿el código es una partida del itemizado (no un título)?
//   descripción  ¿es la del itemizado? (sin mayúsculas, tildes ni espacios de más)
//   unidad       ¿es la del itemizado? (m² = m2, m³ = m3, und = u)
// Y una clase por elemento: la de su mejor partida. Nada de criterios de obra aquí: el
// criterio es el itemizado que se sube.
import { C } from './tema';

export const CLASES = [
  { id: 'ok', nombre: 'Ítem, descripción y unidad correctos', color: C.green },
  { id: 'difiere', nombre: 'Ítem existe; descripción o unidad distinta', color: C.orange },
  { id: 'soloDesc', nombre: 'Descripción del itemizado, sin código', color: C.blue },
  { id: 'noExiste', nombre: 'Código que no está en el itemizado', color: C.error },
  { id: 'titulo', nombre: 'Código de un título, no de una partida', color: C.orange30D },
  { id: 'sin', nombre: 'Sin partida', color: C.gris300 },
];
export const PRUEBAS_COLOR = { Igual: C.green, Distinta: C.orange, Vacía: C.gris300, 'No existe': C.error };
export const META = 95;   // % con partida que se toma como referencia visual del indicador

const RANURAS = ['', '1', '2', '3', '4', '5'];
const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
const unidad = (s) => String(s || '').toLowerCase().replace(/\s/g, '').replace(/²/g, '2').replace(/³/g, '3')
  .replace(/^(u|und|unid|unidad|und\.)$/, 'und').replace(/\.$/, '');
const valor = (r, k) => { const v = r[k] ?? r['Datos::' + k]; return v == null || String(v).trim() === '' ? null : String(v).trim(); };

export function auditarPresupuesto(rows, items) {
  const porCodigo = new Map((items || []).map(i => [i.item, i]));
  const descripciones = new Set((items || []).filter(i => i.unidad).map(i => norm(i.descripcion)));
  const nombreDe = (c) => porCodigo.get(c)?.descripcion || c;
  const clases = Object.fromEntries(CLASES.map(c => [c.id, []]));
  const porCategoria = new Map();
  const pruebas = {
    'Ítem': { Igual: 0, 'No existe': 0 },
    'Descripción': { Igual: 0, Distinta: 0, Vacía: 0 },
    'Unidad': { Igual: 0, Distinta: 0, Vacía: 0 },
  };
  const usados = new Map();
  const embudo = { conCodigo: [], existe: [], descripcion: [], completo: [] };
  const problemas = new Map();
  const arbol = new Map();
  const tuplas = new Map();
  const anotarProblema = (c, tipo) => {
    if (!problemas.has(c)) problemas.set(c, { codigo: c, n: 0, tipos: new Set() });
    const p = problemas.get(c); p.n++; p.tipos.add(tipo);
  };
  for (const r of rows || []) {
    let mejor = 5, hayCodigo = false, existe = false, descOk = false, completo = false;
    let est = { item: 'Sin código', desc: 'Descripción no evaluada', uni: 'Unidad no evaluada' }, puntos = -1;
    const nombres = [];
    for (const s of RANURAS) {
      const c = valor(r, '03_05_DSI_CodigoDePartida' + s);
      const n = valor(r, '03_04_DSI_NombreDePartida' + s);
      const u = valor(r, '02_01_DSI_Unidad' + s);
      if (n) nombres.push(n);
      if (!c) continue;
      hayCodigo = true;
      const it = porCodigo.get(c);
      if (!it) {
        pruebas['Ítem']['No existe']++; mejor = Math.min(mejor, 3); anotarProblema(c, 'no existe');
        if (puntos < 0) { est = { item: 'Código no existe', desc: 'Descripción no evaluada', uni: 'Unidad no evaluada' }; puntos = 0; }
        continue;
      }
      if (!it.unidad) { mejor = Math.min(mejor, 4); continue; }
      existe = true;
      pruebas['Ítem'].Igual++;
      usados.set(c, (usados.get(c) || 0) + 1);
      const d = n ? norm(n) === norm(it.descripcion) : null;
      const un = u ? unidad(u) === unidad(it.unidad) : null;
      pruebas['Descripción'][d === null ? 'Vacía' : d ? 'Igual' : 'Distinta']++;
      pruebas['Unidad'][un === null ? 'Vacía' : un ? 'Igual' : 'Distinta']++;
      mejor = Math.min(mejor, d && un ? 0 : 1);
      if (d) descOk = true;
      if (d && un) completo = true;
      if (d === false) anotarProblema(c, 'descripción');
      if (un === false) anotarProblema(c, 'unidad');
      const pts = 1 + (d ? 1 : 0) + (un ? 1 : 0);
      if (pts > puntos) {
        puntos = pts;
        est = { item: 'Ítem existe', desc: d === null ? 'Descripción vacía' : d ? 'Descripción igual' : 'Descripción distinta',
          uni: un === null ? 'Unidad vacía' : un ? 'Unidad igual' : 'Unidad distinta' };
      }
      const partes = c.split('.');
      const cap = partes.slice(0, 2).join('.'), sub = partes.slice(0, 3).join('.');
      if (!arbol.has(cap)) arbol.set(cap, new Map());
      if (!arbol.get(cap).has(sub)) arbol.get(cap).set(sub, new Map());
      const hojas = arbol.get(cap).get(sub);
      hojas.set(c, (hojas.get(c) || 0) + 1);
    }
    if (hayCodigo) embudo.conCodigo.push(r.dbId);
    if (existe) embudo.existe.push(r.dbId);
    if (descOk) embudo.descripcion.push(r.dbId);
    if (completo) embudo.completo.push(r.dbId);
    let id = CLASES[mejor].id;
    if (!hayCodigo) id = nombres.some(n => descripciones.has(norm(n))) ? 'soloDesc' : 'sin';
    clases[id].push(r.dbId);
    const cat = r['Revit Category'] || '(sin categoría)';
    if (!porCategoria.has(cat)) porCategoria.set(cat, Object.fromEntries(CLASES.map(c => [c.id, []])));
    porCategoria.get(cat)[id].push(r.dbId);
    const kt = [cat, est.item, est.desc, est.uni].join('|');
    tuplas.set(kt, (tuplas.get(kt) || 0) + 1);
  }
  const capitulos = new Map();
  for (const it of items || []) {
    if (!it.unidad) continue;
    const cap = it.item.split('.').slice(0, 2).join('.');
    if (!capitulos.has(cap)) capitulos.set(cap, { cap, nombre: nombreDe(cap), partidas: 0, conElementos: 0 });
    const k = capitulos.get(cap);
    k.partidas++;
    if (usados.has(it.item)) k.conElementos++;
  }
  const cats = [...porCategoria.entries()]
    .map(([cat, cl]) => ({ cat, cl, total: Object.values(cl).reduce((s, v) => s + v.length, 0) }))
    .sort((a, b) => b.total - a.total).slice(0, 10);
  const pareto = [...problemas.values()].sort((a, b) => b.n - a.n);
  const totalProblemas = pareto.reduce((s, p) => s + p.n, 0);
  let acumulado = 0;
  const paretoTop = pareto.slice(0, 15).map(p => {
    acumulado += p.n;
    return { ...p, tipos: [...p.tipos].join(', '), nombre: nombreDe(p.codigo), acum: Math.round((acumulado / (totalProblemas || 1)) * 100) };
  });
  const arbolLista = [...arbol.entries()].map(([cap, subs]) => ({
    name: cap, full: `${cap} ${nombreDe(cap)}`,
    children: [...subs.entries()].map(([sub, hojas]) => ({
      name: sub, full: `${sub} ${nombreDe(sub)}`,
      children: [...hojas.entries()].map(([c, n]) => ({ name: c, full: `${c} ${nombreDe(c)}`, value: n })),
    })),
  }));
  const catsTop = new Set(cats.slice(0, 6).map(c => c.cat));
  const paralelas = new Map();
  for (const [k, n] of tuplas) {
    const [cat, ...resto] = k.split('|');
    const kk = [catsTop.has(cat) ? cat : 'Otras categorías', ...resto].join('|');
    paralelas.set(kk, (paralelas.get(kk) || 0) + n);
  }
  return {
    total: (rows || []).length, clases, cats, pruebas, embudo, arbol: arbolLista,
    pareto: paretoTop, totalProblemas, codigosConProblema: pareto.length,
    paralelas: [...paralelas.entries()].map(([k, n]) => ({ pasos: k.split('|'), n })),
    capitulos: [...capitulos.values()].map(k => ({ ...k, pct: Math.round((k.conElementos / k.partidas) * 100) })),
    partidas: (items || []).filter(i => i.unidad).length, partidasUsadas: usados.size,
    conPartida: clases.ok.length + clases.difiere.length + clases.soloDesc.length,
  };
}

// El cálculo de 20.000 elementos tarda; diez tarjetas con los mismos datos lo hacen UNA vez.
const memo = new WeakMap();   // filas → Map(clave → resultado)
export function auditarConMemoria(rows, items, huella) {
  if (!rows) return null;
  if (!memo.has(rows)) memo.set(rows, new Map());
  const cache = memo.get(rows);
  if (!cache.has(huella)) {
    if (cache.size > 8) cache.clear();
    cache.set(huella, auditarPresupuesto(rows, items));
  }
  return cache.get(huella);
}

// Grupos para «Pintar» y aislar: cada clase con su color.
export const gruposDeClases = (res) => CLASES.map(c => ({ key: c.nombre, value: res.clases[c.id].length, count: res.clases[c.id].length,
  externalIds: res.clases[c.id], color: c.color })).filter(g => g.count);

export const pasosEmbudo = (res) => [
  { paso: 'Elementos del modelo', ids: null, n: res.total },
  { paso: 'Con código de partida', ids: res.embudo.conCodigo, n: res.embudo.conCodigo.length },
  { paso: 'Código existe en el itemizado', ids: res.embudo.existe, n: res.embudo.existe.length },
  { paso: '… y descripción igual', ids: res.embudo.descripcion, n: res.embudo.descripcion.length },
  { paso: '… y unidad igual', ids: res.embudo.completo, n: res.embudo.completo.length },
];
export const pctConPartida = (res) => (res.total ? Math.round((res.conPartida / res.total) * 1000) / 10 : 0);
export const colorPct = (v) => (v >= META ? C.green : v >= 75 ? C.orange : C.error);
// Color de un paso del recorrido según lo que dice: bien verde, distinto naranja, no existe rojo, vacío gris.
export const colorPaso = (n) => (/existe$|igual$/.test(n) && !/no existe/i.test(n) ? C.green
  : /distinta/.test(n) ? C.orange : /no existe|Sin código/i.test(n) ? C.error
    : /vacía|no evaluada/.test(n) ? C.gris300 : C.gris700);
// Flujo de 4 pasos con nombres únicos por paso (categoría → ítem → descripción → unidad).
export const flujo4 = (res) => {
  const nodos = new Set(), enl = new Map();
  for (const { pasos, n } of res.paralelas) {
    pasos.forEach(x => nodos.add(x));
    for (let i = 0; i < 3; i++) { const k = pasos[i] + '→' + pasos[i + 1]; enl.set(k, (enl.get(k) || 0) + n); }
  }
  return { nodos: [...nodos], enlaces: [...enl.entries()].map(([k, v]) => { const [source, target] = k.split('→'); return { source, target, value: v }; }) };
};
