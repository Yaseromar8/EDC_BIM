import test from 'node:test';
import assert from 'node:assert/strict';
import { installForwardWheelZoom, forwardWheelDirectionForScope } from '../forwardWheelZoom.js';

test('la rueda conserva el sentido elegido despues de cada carga y restauracion', () => {
  const handlers = new Map();
  const calls = [];
  const navigation = {
    reverse: true,
    setReverseZoomDirection(value) {
      this.reverse = value;
      calls.push(value);
    },
  };
  const viewer = {
    getNavigation: () => navigation,
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: (name, handler) => {
      assert.equal(handlers.get(name), handler);
      handlers.delete(name);
    },
  };

  const dispose = installForwardWheelZoom(viewer, 'geometryLoaded', 'stateRestored');
  assert.equal(navigation.reverse, false);
  navigation.reverse = true; // Preferencia de un viewable cargado en Canal.
  handlers.get('geometryLoaded')();
  assert.equal(navigation.reverse, false);
  navigation.reverse = true;
  handlers.get('stateRestored')();
  assert.equal(navigation.reverse, false);
  assert.deepEqual(calls, [false, false, false]);

  dispose();
  assert.equal(handlers.size, 0);
});

// 17-oct-2026, requisito nuevo del propietario: como ACC, «Invertir dirección de zoom» APAGADO en todas las obras.
test('todas las obras: la rueda adelante acerca, como ACC', () => {
  assert.equal(forwardWheelDirectionForScope('1_CANAL'), true);
  assert.equal(forwardWheelDirectionForScope('1_DRENAJE'), true);
  assert.equal(forwardWheelDirectionForScope('OTRO_FRENTE'), true);
  const handlers = new Map();
  const applied = [];
  const viewer = {
    getNavigation: () => ({ setReverseZoomDirection: (value) => applied.push(['nav', value]) }),
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: (name) => handlers.delete(name),
  };
  // El mecanismo sigue sirviendo para fijar cualquier sentido.
  const dispose = installForwardWheelZoom(viewer, 'geometryLoaded', 'stateRestored', true);
  handlers.get('geometryLoaded')();
  handlers.get('stateRestored')();
  assert.deepEqual(applied, Array(3).fill(['nav', true]));
  dispose();
  assert.equal(handlers.size, 0);
});

test('cambiar Canal ↔ Drenaje reinstala sin invertir ni duplicar listeners', () => {
  const handlers = new Map(), calls = [];
  const viewer = {
    getNavigation: () => ({ setReverseZoomDirection: value => calls.push(value) }),
    addEventListener: (name, handler) => {
      assert.equal(handlers.has(name), false);
      handlers.set(name, handler);
    },
    removeEventListener: (name, handler) => {
      assert.equal(handlers.get(name), handler);
      handlers.delete(name);
    },
  };
  let dispose;
  for (const scope of ['1_CANAL', '1_DRENAJE', '1_CANAL']) {
    dispose?.();
    dispose = installForwardWheelZoom(viewer, 'geometryLoaded', 'stateRestored',
      forwardWheelDirectionForScope(scope));
    handlers.get('geometryLoaded')();
  }
  dispose();
  assert.deepEqual(calls, Array(6).fill(true));   // el mismo sentido en los dos frentes (17-oct)
  assert.equal(handlers.size, 0);
});

test('sin API de navegacion no inventa otro mecanismo de zoom', () => {
  const viewer = { addEventListener() {}, removeEventListener() {} };
  assert.doesNotThrow(() => installForwardWheelZoom(viewer, 'geometryLoaded')());
});

test('el interruptor queda apagado como en ACC aunque el perfil AEC lo encienda; la rueda sigue acercando', () => {
  const prefs = new Map([['reverseMouseZoomDir', true]]);   // lo que deja el perfil AEC al cargar
  const handlers = new Map();
  const viewer = {
    prefs: { get: k => prefs.get(k), set: (k, v) => prefs.set(k, v) },
    getNavigation: () => ({ setReverseZoomDirection: v => { nav.push(v); } }),
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: (name) => handlers.delete(name),
  };
  const nav = [];
  installForwardWheelZoom(viewer, 'geometryLoaded', 'stateRestored', true);
  assert.equal(prefs.get('reverseMouseZoomDir'), false);
  prefs.set('reverseMouseZoomDir', true);                      // otro modelo vuelve a aplicar el perfil
  handlers.get('geometryLoaded')();
  assert.equal(prefs.get('reverseMouseZoomDir'), false);
  assert.deepEqual(nav, [true, true]);
});
