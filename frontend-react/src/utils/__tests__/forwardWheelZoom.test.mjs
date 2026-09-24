import test from 'node:test';
import assert from 'node:assert/strict';
import { installForwardWheelZoom } from '../forwardWheelZoom.js';

test('la rueda conserva el sentido de Drenaje despues de cada carga y restauracion', () => {
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

test('sin API de navegacion no inventa otro mecanismo de zoom', () => {
  const viewer = { addEventListener() {}, removeEventListener() {} };
  assert.doesNotThrow(() => installForwardWheelZoom(viewer, 'geometryLoaded')());
});
