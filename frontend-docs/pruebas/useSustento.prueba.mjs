// Ejecuta el hook real con un ciclo mínimo de hooks y fetch interceptado.
// No abre documentos ni consulta el backend: reproduce API='' de la web publicada.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { apiFetch } from '../src/utils/apiFetch.js';

const fuente = readFileSync(new URL('../src/hooks/useSustento.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export function useSustento', 'function useSustento');

function montar(API, nodeId = 'planilla-1') {
  const estados = [], efectos = [], pendientes = [], eventos = new Map();
  let cursor = 0, argumentos = [API, nodeId, 'obra'];
  const documento = {
    visibilityState: 'visible',
    addEventListener: (tipo, fn) => eventos.set(tipo, fn),
    removeEventListener: (tipo, fn) => { if (eventos.get(tipo) === fn) eventos.delete(tipo); },
  };
  const iguales = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hook = runInNewContext(`${fuente}\nuseSustento;`, {
    apiFetch, document: documento,
    useState(inicial) {
      const i = cursor++;
      if (!(i in estados)) estados[i] = inicial;
      return [estados[i], valor => { estados[i] = typeof valor === 'function' ? valor(estados[i]) : valor; }];
    },
    useCallback: fn => fn,
    useEffect(fn, deps) {
      const i = cursor++;
      if (iguales(efectos[i]?.deps, deps)) return;
      pendientes.push(() => {
        efectos[i]?.limpiar?.();
        efectos[i] = { deps, limpiar: fn() };
      });
    },
  });
  const render = (...nuevos) => {
    if (nuevos.length) argumentos = nuevos;
    cursor = 0;
    const resultado = hook(...argumentos);
    pendientes.splice(0).forEach(fn => fn());
    return resultado;
  };
  return {
    render,
    volver: () => eventos.get('visibilitychange')?.(),
    desmontar: () => efectos.forEach(e => e?.limpiar?.()),
    eventos,
  };
}

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;
globalThis.localStorage = { getItem: () => 'sesion-ficticia-del-banco' };
globalThis.sessionStorage = { getItem: () => null };
const recibir = () => new Promise(resolve => setImmediate(resolve));
const respuesta = (datos, status = 200) => new Response(JSON.stringify(datos), { status });
let casos = 0;

try {
  for (const API of ['', 'https://backend.example', 'http://localhost:5174']) {
    const pedidos = [];
    globalThis.fetch = async (url, opciones) => {
      pedidos.push({ url, opciones });
      return respuesta({ success: true, vinculos: [{ id: 'v1', planilla_node_id: 'planilla-1' }] });
    };
    const vista = montar(API);
    assert.equal(vista.render().listo, false);
    assert.equal(pedidos.length, 1, `API=${JSON.stringify(API)} debe consultar, no esperar para siempre`);
    assert.equal(pedidos[0].url, `${API}/api/docs/sustento?node_id=planilla-1&ambito=obra`);
    assert.equal(pedidos[0].opciones.headers.Authorization, 'Bearer sesion-ficticia-del-banco');
    await recibir();
    const listo = vista.render();
    assert.equal(listo.listo, true);
    assert.equal(listo.disponible, true);
    assert.equal(listo.vinculos[0].planilla_node_id, 'planilla-1');
    vista.volver();
    vista.render();
    assert.equal(pedidos.length, 2, 'volver de un plano también refresca con API relativa');
    await recibir();
    vista.desmontar();
    assert.equal(vista.eventos.size, 0);
    casos++;
  }

  // Sin vínculos, el lector debe poder decidir abrir como Excel.
  globalThis.fetch = async () => respuesta({ success: true, vinculos: [] });
  const sinVinculos = montar('');
  sinVinculos.render();
  await recibir();
  assert.equal(sinVinculos.render().listo, true);
  assert.equal(sinVinculos.render().vinculos.length, 0);
  sinVinculos.desmontar();
  casos++;

  // Una respuesta denegada, inválida o fallida no debe dejar bloqueado el Excel.
  for (const [contestar, esperados] of [
    [() => respuesta({ success: false }, 403), 1],
    [() => new Response('<html>no disponible</html>', { status: 404 }), 1],
    [() => Promise.reject(new Error('fallo de conexión simulado')), 3],
  ]) {
    const ultimaRespuesta = Promise.withResolvers();
    let intentos = 0;
    globalThis.fetch = () => {
      const resultado = contestar();
      if (++intentos === esperados) ultimaRespuesta.resolve();
      return resultado;
    };
    const vista = montar('');
    vista.render();
    await ultimaRespuesta.promise;
    await recibir();
    assert.equal(vista.render().listo, true);
    assert.equal(vista.render().disponible, false);
    assert.equal(vista.render().vinculos.length, 0);
    vista.desmontar();
    casos++;
  }

  let pedidos = 0;
  globalThis.fetch = async () => { pedidos++; return respuesta({ success: true, vinculos: [] }); };
  const sinDocumento = montar('', null);
  assert.equal(sinDocumento.render().listo, true);
  assert.equal(pedidos, 0);
  assert.equal(sinDocumento.eventos.size, 0);
  sinDocumento.desmontar();
  casos++;

  // Al cambiar de documento, una respuesta anterior no decide la vista del nuevo.
  const respuestas = [];
  globalThis.fetch = () => new Promise(resolve => respuestas.push(resolve));
  const cambio = montar('');
  cambio.render();
  cambio.render('', 'planilla-2', 'obra');
  respuestas[0](respuesta({ success: true, vinculos: [{ id: 'viejo' }] }));
  await recibir();
  assert.equal(cambio.render().listo, false);
  assert.equal(cambio.render().vinculos.length, 0);
  respuestas[1](respuesta({ success: true, vinculos: [] }));
  await recibir();
  assert.equal(cambio.render().listo, true);
  cambio.desmontar();
  casos++;

  console.log(`useSustento: ${casos}/${casos} casos, hook real y API autenticada, sin red`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalLocalStorage;
  globalThis.sessionStorage = originalSessionStorage;
}
