// Banco: la capa publicada de la ortofoto (OrthoCanalLayer) con los ajustes en vivo y guardados
// sin volver a subir los JPG (20-oct-2026). Ejecuta el componente REAL con un React simulado,
// apiFetch falso y la superficie/montaje inyectados por sus props. Sin red, sin visor, sin GPU.
//   node frontend-react/pruebas/ortofotoAjustes.prueba.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { transformSync } = require('esbuild');

let pass = 0, fail = 0;
async function test(nombre, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: String(e?.stack || e) })); }
}
const esperar = (ms = 0) => new Promise(r => setTimeout(r, ms));

function montarCapa({ manifiestos }) {
  const win = new EventTarget();
  win.__mainViewer = { id: 'visor' };
  const llamadas = { manifiesto: 0, mosaicos: 0, montajes: 0, relieve: [], sombra: [] };
  const apiFetch = async (url) => {
    if (/\/tiles\//.test(url)) {
      llamadas.mosaicos++;
      return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    }
    llamadas.manifiesto++;
    return new Response(JSON.stringify(manifiestos.actual), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const efectos = [];
  const react = { useEffect(fn) { efectos.push(fn); } };
  const codigo = transformSync(readFileSync(new URL('../src/components/OrthoCanalLayer.jsx', import.meta.url), 'utf8'),
    { loader: 'jsx', format: 'cjs', jsx: 'transform' }).code;
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'CustomEvent', codigo)((id) => {
    if (id === 'react') return react;
    if (id.includes('apiFetch')) return { apiFetch };
    if (id.includes('orthoCanalTrial')) return { CANAL_ORTHO_TILE_NAMES: { north: 'n.jpg', south: 's.jpg' } };
    throw new Error('import inesperado: ' + id);
  }, modulo, modulo.exports, win, CustomEvent);
  const superficie = { model: { id: 'topografia' }, dbId: 42 };
  const props = {
    scope: '1_CANAL', backendUrl: 'http://api',
    findSurface: () => superficie,
    mountLayer: async (_viewer, _files, opciones) => {
      llamadas.montajes++;
      llamadas.relieve.push(['montaje', opciones.reliefBlend]);
      return {
        setReliefBlend: (v) => llamadas.relieve.push(v),
        setHillshadeStrength: (v) => llamadas.sombra.push(v),
        dispose() {},
      };
    },
  };
  modulo.exports.default(props);
  const limpiar = efectos.map(fn => fn());
  return { win, llamadas, cerrar: () => limpiar.forEach(c => c?.()) };
}

const manifiesto = (revision, imagenes, relieve, sombra) => ({
  active: true, revision, imagenes_de: imagenes, published_at: '2026-10-20T20:48:57Z',
  model_urn: 'urn:topo', db_id: 42, relief_blend: relieve, directional_shade: sombra,
  north_path: `/api/orthophoto/1_CANAL/tiles/${revision}/north`,
  south_path: `/api/orthophoto/1_CANAL/tiles/${revision}/south`,
});

await test('monta la ortofoto publicada con sus ajustes', async () => {
  const manifiestos = { actual: manifiesto('r1', 'r1', 0.25, 0.4) };
  const capa = montarCapa({ manifiestos });
  await esperar(20);
  assert.equal(capa.llamadas.mosaicos, 2);
  assert.equal(capa.llamadas.montajes, 1);
  assert.deepEqual(capa.llamadas.relieve, [['montaje', 0.25]]);
  capa.cerrar();
});

await test('las barras mueven la capa publicada en vivo, y solo la de su frente', async () => {
  const manifiestos = { actual: manifiesto('r1', 'r1', 0.25, 0.4) };
  const capa = montarCapa({ manifiestos });
  await esperar(20);
  capa.win.dispatchEvent(new CustomEvent('orthophoto-ajuste-vivo', { detail: { scope: '1_CANAL', reliefBlend: 0.6, directionalShade: 0.9 } }));
  capa.win.dispatchEvent(new CustomEvent('orthophoto-ajuste-vivo', { detail: { scope: 'OTRO', reliefBlend: 0.1 } }));
  assert.deepEqual(capa.llamadas.relieve.slice(1), [0.6]);
  assert.deepEqual(capa.llamadas.sombra, [0.9]);
  capa.cerrar();
});

await test('un ajuste guardado NO vuelve a descargar ni montar las fotos', async () => {
  const manifiestos = { actual: manifiesto('r1', 'r1', 0.25, 0.4) };
  const capa = montarCapa({ manifiestos });
  await esperar(20);
  const estados = [];
  capa.win.addEventListener('orthophoto-status', (e) => estados.push(e.detail));
  manifiestos.actual = manifiesto('r2', 'r1', 0.5, 0.7);          // revisión nueva, mismas imágenes
  capa.win.dispatchEvent(new CustomEvent('orthophoto-changed', { detail: { scope: '1_CANAL' } }));
  await esperar(20);
  assert.equal(capa.llamadas.mosaicos, 2, 'no se vuelven a pedir los mosaicos');
  assert.equal(capa.llamadas.montajes, 1, 'no se vuelve a montar');
  assert.deepEqual(capa.llamadas.relieve.slice(1), [0.5]);
  assert.deepEqual(capa.llamadas.sombra, [0.7]);
  assert.equal(estados.at(-1).revision, 'r2');
  assert.equal(estados.at(-1).reliefBlend, 0.5);                   // el panel se entera de los ajustes
  capa.cerrar();
});

await test('una publicación con fotos nuevas sí se recarga', async () => {
  const manifiestos = { actual: manifiesto('r1', 'r1', 0.25, 0.4) };
  const capa = montarCapa({ manifiestos });
  await esperar(20);
  manifiestos.actual = manifiesto('r3', 'r3', 0.25, 0.4);
  capa.win.dispatchEvent(new CustomEvent('orthophoto-changed', { detail: { scope: '1_CANAL' } }));
  await esperar(20);
  assert.equal(capa.llamadas.mosaicos, 4);
  assert.equal(capa.llamadas.montajes, 2);
  capa.cerrar();
});

await test('un servidor anterior (sin imagenes_de) se trata por revisión, como antes', async () => {
  const viejo = (r) => { const m = manifiesto(r, undefined, 0.25, 0.4); delete m.imagenes_de; return m; };
  const manifiestos = { actual: viejo('r1') };
  const capa = montarCapa({ manifiestos });
  await esperar(20);
  manifiestos.actual = viejo('r2');
  capa.win.dispatchEvent(new CustomEvent('orthophoto-changed', { detail: { scope: '1_CANAL' } }));
  await esperar(20);
  assert.equal(capa.llamadas.montajes, 2);
  capa.cerrar();
});


// ── El panel (OrthoCanalTrial) con un React simulado de verdad: estado, efectos y JSX ──────────
function montarPanel({ publicado }) {
  const win = new EventTarget();
  const peticiones = [];
  const apiFetch = async (url, opciones = {}) => {
    peticiones.push({ url, metodo: opciones.method || 'GET', cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    if (url.endsWith('/ajustes')) {
      const c = JSON.parse(opciones.body);
      return new Response(JSON.stringify({ active: true, revision: 'r2', published_at: publicado.published_at,
        relief_blend: c.relief_blend, directional_shade: c.directional_shade, imagenes_de: 'r1' }), { status: 200 });
    }
    return new Response(JSON.stringify(publicado), { status: 200 });
  };
  const states = [], refs = [], effects = [];
  let cursor = 0, pendientes = [], sucio = false;
  const igual = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createElement: (type, p, ...children) => ({ type, props: { ...p, children: children.flat(Infinity) } }),
    Fragment: 'fragment',
    useState(init) { const i = cursor++; if (!(i in states)) states[i] = typeof init === 'function' ? init() : init;
      return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; sucio = true; }]; },
    useRef(init) { const i = cursor++; return refs[i] ||= { current: init }; },
    useEffect(fn, deps) { const i = cursor++; if (!deps || !igual(effects[i]?.deps, deps)) pendientes.push(() => {
      effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const codigo = transformSync(readFileSync(new URL('../src/components/OrthoCanalTrial.jsx', import.meta.url), 'utf8'),
    { loader: 'jsx', format: 'cjs', jsx: 'transform', define: { 'import.meta.hot': 'undefined' } }).code;
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'CustomEvent', codigo)((id) => {
    if (id === 'react') return { ...react, default: react };
    if (id.includes('apiFetch')) return { apiFetch };
    if (id.includes('publishAfterPreview')) return { publishAfterPreview: async () => {} };
    if (id.includes('orthoCanalTrial')) return { CANAL_ORTHO_TILE_NAMES: {}, DEFAULT_HILLSHADE_STRENGTH: 0.4, DEFAULT_RELIEF_BLEND: 0.25 };
    throw new Error('import inesperado: ' + id);
  }, modulo, modulo.exports, win, CustomEvent);
  const Panel = modulo.exports.default;
  const props = { scope: '1_CANAL', backendUrl: 'http://api', canPublish: true };
  let arbol;
  const pintar = () => { let vueltas = 0;
    do { sucio = false; cursor = 0; pendientes = []; arbol = Panel(props); pendientes.forEach(f => f());
      assert.ok(++vueltas < 20, 'bucle de render'); } while (sucio); return arbol; };
  const todos = (t) => !t || typeof t !== 'object' ? [] : [t, ...(t.props?.children || []).flatMap(todos)];
  const texto = (t) => typeof t === 'string' || typeof t === 'number' ? String(t) : (t?.props?.children || []).map(texto).join('');
  const boton = (t) => todos(arbol).find(n => n.type === 'button' && texto(n).includes(t));
  const barra = (aria) => todos(arbol).find(n => n.props?.['aria-label'] === aria);
  return { win, peticiones, pintar, boton, barra, get arbol() { return arbol; } };
}

await test('panel: las barras arrancan con lo publicado y mueven la capa en vivo; guardar manda solo los ajustes', async () => {
  const publicado = { active: true, revision: 'r1', published_at: '2026-10-20T20:48:57Z', relief_blend: 0.25, directional_shade: 0.4 };
  const panel = montarPanel({ publicado });
  panel.pintar(); await esperar(10); panel.pintar();
  assert.equal(panel.barra('Relieve visible bajo la ortofoto').props.value, 25);
  assert.equal(panel.barra('Sombreado direccional de pendientes').props.value, 40);
  assert.equal(panel.boton('Guardar ajustes para todos').props.disabled, true, 'sin cambios no se guarda');

  const vivos = [];
  panel.win.addEventListener('orthophoto-ajuste-vivo', (e) => vivos.push(e.detail));
  panel.barra('Relieve visible bajo la ortofoto').props.onChange({ target: { value: '50' } });
  panel.pintar();
  assert.deepEqual(vivos.at(-1), { scope: '1_CANAL', reliefBlend: 0.5, directionalShade: 0.4 });
  assert.equal(panel.boton('Guardar ajustes para todos').props.disabled, false);

  const cambios = [];
  panel.win.addEventListener('orthophoto-changed', (e) => cambios.push(e.detail));
  await panel.boton('Guardar ajustes para todos').props.onClick();
  panel.pintar();
  const post = panel.peticiones.find(p => p.url.endsWith('/ajustes'));
  assert.deepEqual(post.cuerpo, { expected_revision: 'r1', relief_blend: 0.5, directional_shade: 0.4 });
  assert.ok(!panel.peticiones.some(p => p.url.endsWith('/publish')), 'no se suben los JPG');
  assert.deepEqual(cambios, [{ scope: '1_CANAL' }]);
  assert.equal(panel.boton('Guardar ajustes para todos').props.disabled, true, 'guardado: ya coincide con lo publicado');
});

await test('panel: Descartar vuelve a lo publicado y lo aplica en vivo', async () => {
  const publicado = { active: true, revision: 'r9', published_at: '2026-10-20T20:48:57Z', relief_blend: 0.25, directional_shade: 0.4 };
  const panel = montarPanel({ publicado });
  panel.pintar(); await esperar(10); panel.pintar();
  panel.barra('Sombreado direccional de pendientes').props.onChange({ target: { value: '90' } });
  panel.pintar();
  const vivos = [];
  panel.win.addEventListener('orthophoto-ajuste-vivo', (e) => vivos.push(e.detail));
  panel.boton('Descartar').props.onClick();
  panel.pintar();
  assert.equal(panel.barra('Sombreado direccional de pendientes').props.value, 40);
  assert.deepEqual(vivos.at(-1), { scope: '1_CANAL', reliefBlend: 0.25, directionalShade: 0.4 });
});

console.log(`\nortofotoAjustes (con panel): ${pass} de ${pass + fail} pasan.`);
process.exit(fail ? 1 : 0);
