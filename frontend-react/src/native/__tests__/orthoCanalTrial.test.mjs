import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANAL_ORTHO_BOUNDS, CANAL_ORTHO_TILE_NAMES,
  DEFAULT_HILLSHADE_STRENGTH, DEFAULT_RELIEF_BLEND,
  orthoUv, viewerPointToUtm,
  buildCanalOrthoGeometry, buildCanalOrthoGeometries,
  findPublishedSurface, mountCanalOrthoTrial,
} from '../orthoCanalTrial.js';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(value) { this.x = value.x; this.y = value.y; this.z = value.z; return this; }
  applyMatrix4(matrix) {
    this.x += matrix.dx || 0;
    this.y += matrix.dy || 0;
    this.z += matrix.dz || 0;
    return this;
  }
}

class Matrix4 {
  elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  clone() { return new Matrix4(); }
  invert() { return this; }
  makeScale(x, y, z) { this.elements[0] = x; this.elements[5] = y; this.elements[10] = z; return this; }
  multiply() { return this; }
}

class BufferGeometry {
  attributes = {};
  setAttribute(name, value) { this.attributes[name] = value; }
  computeBoundingSphere() {}
  dispose() { this.disposed = true; }
}

class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
}

class Texture {
  constructor(image) { this.image = image; }
  dispose() { this.disposed = true; }
}

class MeshBasicMaterial {
  constructor(options) { this.options = options; this.opacity = options.opacity; this.uniforms = options.uniforms; }
  dispose() { this.disposed = true; }
}

class ShaderMaterial extends MeshBasicMaterial {}

class Mesh {
  constructor(geometry, material) { this.geometry = geometry; this.material = material; this.matrix = new Matrix4(); }
}

const priorWindow = globalThis.window;
test.after(() => { globalThis.window = priorWindow; });
globalThis.window = {
  THREE: { Vector3, Matrix4, BufferGeometry, BufferAttribute, Texture, MeshBasicMaterial, ShaderMaterial, Mesh,
    LinearFilter: 1, DoubleSide: 2 },
  Autodesk: { Viewing: { Private: { VertexEnumerator: {
    enumMeshTriangles(geometry, visit) { geometry.triangles.forEach((triangle) => visit(...triangle)); },
  } } } },
};

const bounds = { minE: 100, maxE: 200, minN: 300, maxN: 400 };
function modelFor(triangles, { offset = { x: 100, y: 300 }, unit = 'm', additional = [] } = {}) {
  const geometryByFragment = new Map([[7, triangles], ...additional.map((part, index) => [8 + index, part])]);
  const fragId2dbId = Object.fromEntries([...geometryByFragment.keys()].map((id) => [id, 42]));
  return {
    getData: () => ({ globalOffset: offset }),
    getUnitString: () => unit,
    getInstanceTree: () => ({
      getRootId: () => 1,
      enumNodeFragments: (dbId, cb) => {
        if (dbId === 1) geometryByFragment.forEach((_part, id) => cb(id));
        else cb(7);
      },
    }),
    getFragmentList: () => ({
      getCount: () => geometryByFragment.size,
      fragments: { fragId2dbId },
      getVizmesh: (id) => geometryByFragment.has(id)
        ? { geometry: { triangles: geometryByFragment.get(id) } } : null,
      getWorldMatrix: (_fragId, matrix) => { matrix.dx = 0; matrix.dy = 0; matrix.dz = 0; },
    }),
  };
}

const triangle = (x, y) => [
  new Vector3(x, y, 5), new Vector3(x + 1, y, 5), new Vector3(x, y + 1, 5),
];

test('las esquinas EPSG:32717 corresponden a UV opuestas sin invertir norte', () => {
  assert.deepEqual(orthoUv(CANAL_ORTHO_BOUNDS.minE, CANAL_ORTHO_BOUNDS.minN), [0, 0]);
  assert.deepEqual(orthoUv(CANAL_ORTHO_BOUNDS.maxE, CANAL_ORTHO_BOUNDS.maxN), [1, 1]);
});

test('offset y unidades del modelo se aplican antes de generar UV', () => {
  const p = viewerPointToUtm(new Vector3(680.25, 420.5), { x: 469000, y: 9495000 }, 1);
  assert.deepEqual(p, { este: 469680.25, norte: 9495420.5 });
});

test('sólo se clonan triángulos dentro de la huella; la malla APS no se modifica', () => {
  const inside = triangle(10, 20);
  const outside = triangle(120, 20);
  const model = modelFor([inside, outside]);
  const result = buildCanalOrthoGeometry(model, 42, bounds, 10);
  assert.equal(result.inspected, 2);
  assert.equal(result.included, 1);
  assert.equal(result.fragments, 1);
  assert.equal(result.geometry.attributes.position.array.length, 9);
  assert.deepEqual(Array.from(result.geometry.attributes.uv.array), [0.1, 0.2, 0.11, 0.2, 0.1, 0.21]
    .map((v) => Math.fround(v)));
  assert.equal(inside[0].x, 10);
  result.geometry.dispose();
  assert.equal(result.geometry.disposed, true);
});

test('falla cerrado cuando la huella no cruza la superficie o supera el presupuesto', () => {
  assert.throws(() => buildCanalOrthoGeometry(modelFor([triangle(120, 20)]), 42, bounds, 10),
    /no cruza/);
  assert.throws(() => buildCanalOrthoGeometry(modelFor([triangle(10, 20), triangle(12, 20)]), 42, bounds, 1),
    /supera 1 triángulos/);
});

test('la cobertura de la superficie incluye sus fragmentos y recorta una cara en la junta de mosaicos', () => {
  const first = triangle(10, 49.5);
  const second = triangle(20, 50);
  const model = modelFor([first], { additional: [[second]] });
  const tiles = [
    { key: 'north', minU: 0, maxU: 1, minV: 0.5, maxV: 1 },
    { key: 'south', minU: 0, maxU: 1, minV: 0, maxV: 0.5 },
  ];
  const result = buildCanalOrthoGeometries(model, 42, bounds, 10,
    { allModelFragments: true, tiles });
  assert.equal(result.fragments, 2);
  assert.equal(result.coveredFragments, 2);
  assert.equal(result.included, 2);
  assert.ok(result.geometries.every(({ triangles }) => triangles > 0));
  assert.ok(result.geometries.reduce((total, part) => total + part.triangles, 0) >= 3);
  for (const { geometry } of result.geometries) {
    assert.ok([...geometry.attributes.uv.array].every((uv) => uv >= 0 && uv <= 1));
    geometry.dispose();
  }
  assert.equal(first[0].y, 49.5);
});

test('no incorpora geometría de otro dbId aunque pertenezca al mismo DWG', () => {
  const model = modelFor([triangle(10, 20)], { additional: [[triangle(20, 30)]] });
  const originalFrags = model.getFragmentList;
  model.getFragmentList = () => {
    const frags = originalFrags();
    return { ...frags, fragments: { fragId2dbId: { 7: 42, 8: 99 } } };
  };
  const result = buildCanalOrthoGeometries(model, 42, bounds, 10,
    { allModelFragments: true });
  assert.equal(result.fragments, 1);
  assert.equal(result.included, 1);
  result.geometries[0].geometry.dispose();
});

test('el root incompleto de un DWG no descarta el fragmento seleccionado', () => {
  const model = modelFor([triangle(10, 20)], { additional: [[triangle(20, 30)]] });
  const originalTree = model.getInstanceTree;
  model.getInstanceTree = () => {
    const tree = originalTree();
    return { ...tree, enumNodeFragments: (dbId, cb) => {
      if (dbId === 1) cb(8);
      else cb(7);
    } };
  };
  const result = buildCanalOrthoGeometries(model, 42, bounds, 10,
    { allModelFragments: true });
  assert.equal(result.fragments, 2);
  assert.equal(result.coveredFragments, 2);
  assert.equal(result.included, 2);
  result.geometries[0].geometry.dispose();
});

test('el bbox evita enumerar triángulos de fragmentos fuera de la huella', () => {
  const model = modelFor([triangle(10, 20)], { additional: [[triangle(1000, 1000)]] });
  const originalFrags = model.getFragmentList;
  model.getFragmentList = () => ({ ...originalFrags(), getWorldBounds: (id, box) => {
    const local = id === 7 ? 10 : 1000;
    box.min = new Vector3(local, local, 0);
    box.max = new Vector3(local + 2, local + 2, 10);
  } });
  globalThis.window.THREE.Box3 = class {};
  try {
    const result = buildCanalOrthoGeometries(model, 42, bounds, 1,
      { allModelFragments: true });
    assert.equal(result.fragments, 2);
    assert.equal(result.inspected, 1);
    assert.equal(result.coveredFragments, 1);
    result.geometries[0].geometry.dispose();
  } finally {
    delete globalThis.window.THREE.Box3;
  }
});

test('no mezcla fragmentos de otro modelo y rechaza un mosaico incompleto', async () => {
  const model = modelFor([triangle(10, 20)]);
  const viewer = {
    getAggregateSelection: () => [{ model, selection: [42] }],
    impl: {},
  };
  await assert.rejects(mountCanalOrthoTrial(viewer,
    [{ name: CANAL_ORTHO_TILE_NAMES.north, type: 'image/jpeg', size: 100 }]),
  /dos JPG/);
});

test('montar y desmontar libera malla, textura, material y escena sin alterar el modelo', async () => {
  const priorImage = globalThis.Image;
  const priorCreate = URL.createObjectURL;
  const priorRevoke = URL.revokeObjectURL;
  globalThis.Image = class {
    width = 2000;
    height = 5961;
    set src(_url) { queueMicrotask(() => this.onload()); }
  };
  URL.createObjectURL = () => 'blob:ensayo';
  let revoked = false;
  URL.revokeObjectURL = () => { revoked = true; };
  try {
    const model = modelFor([triangle(10, 20)],
      { offset: { x: 469680, y: 9495348 } });
    const events = [];
    const viewer = {
      getAggregateSelection: () => [{ model, selection: [42] }],
      clearSelection: () => events.push('clear-selection'),
      impl: {
        createOverlayScene: (name) => events.push(['create', name]),
        addOverlay: (name, mesh) => events.push(['add', name, mesh]),
        removeOverlay: (name, mesh) => events.push(['remove', name, mesh]),
        removeOverlayScene: (name) => events.push(['remove-scene', name]),
        invalidate: () => {},
      },
    };
    const original = model.getFragmentList().getVizmesh(7).geometry.triangles[0][0].x;
    const result = await mountCanalOrthoTrial(viewer, { type: 'image/png' },
      { maxTriangles: 10, signal: new AbortController().signal, allModelFragments: false });
    assert.ok(result.included > 0);
    assert.equal(events.filter((item) => item === 'clear-selection').length, 1);
    const added = events.find((item) => Array.isArray(item) && item[0] === 'add')[2];
    result.dispose();
    result.dispose();
    assert.equal(added.geometry.disposed, true);
    assert.equal(added.material.disposed, true);
    assert.equal(added.material.options.map.disposed, true);
    assert.equal(events.filter((item) => Array.isArray(item) && item[0] === 'remove').length, 1);
    assert.equal(model.getFragmentList().getVizmesh(7).geometry.triangles[0][0].x, original);
    assert.equal(revoked, true);
  } finally {
    globalThis.Image = priorImage;
    URL.createObjectURL = priorCreate;
    URL.revokeObjectURL = priorRevoke;
  }
});

test('monta ambos mosaicos y libera sus dos texturas al retirar la capa', async () => {
  const priorImage = globalThis.Image;
  const priorCreate = URL.createObjectURL;
  const priorRevoke = URL.revokeObjectURL;
  globalThis.Image = class {
    width = 4000;
    height = 5961;
    set src(_url) { queueMicrotask(() => this.onload()); }
  };
  URL.createObjectURL = () => 'blob:mosaico';
  URL.revokeObjectURL = () => {};
  try {
    const model = modelFor([triangle(10, 20)], {
      offset: { x: 469680, y: 9495348 },
      additional: [[triangle(20, 900)]],
    });
    const originalTree = model.getInstanceTree;
    model.getInstanceTree = () => ({ ...originalTree(),
      enumNodeFragments: (_dbId, cb) => { cb(7); cb(8); },
    });
    const added = [];
    const removed = [];
    const viewer = {
      getAggregateSelection: () => [{ model, selection: [42] }],
      clearSelection: () => {},
      impl: {
        createOverlayScene: () => {},
        addOverlay: (_name, mesh) => added.push(mesh),
        removeOverlay: (_name, mesh) => removed.push(mesh),
        removeOverlayScene: () => {},
        invalidate: () => {},
      },
    };
    const files = [
      { name: CANAL_ORTHO_TILE_NAMES.south, type: 'image/jpeg', size: 100 },
      { name: CANAL_ORTHO_TILE_NAMES.north, type: 'image/jpeg', size: 100 },
    ];
    const result = await mountCanalOrthoTrial(viewer, files,
      { maxTriangles: 10, allModelFragments: false });
    assert.equal(result.tiles, 2);
    assert.equal(result.mode, 'cpu');
    assert.equal(result.coveredFragments, 2);
    assert.equal(added.length, 2);
    assert.equal(added[0].material.options.opacity, 1 - DEFAULT_RELIEF_BLEND);
    assert.equal(added[0].material.options.depthTest, true);
    assert.equal(added[0].material.options.depthWrite, false);
    result.setReliefBlend(0.65);
    assert.equal(added[0].material.opacity, 0.35);
    assert.equal(added[1].material.opacity, 0.35);
    result.dispose();
    assert.equal(removed.length, 2);
    assert.ok(added.every((mesh) => mesh.geometry.disposed && mesh.material.disposed
      && mesh.material.options.map.disposed));
  } finally {
    globalThis.Image = priorImage;
    URL.createObjectURL = priorCreate;
    URL.revokeObjectURL = priorRevoke;
  }
});

test('proyecta en todos los fragmentos del mismo dbId sin copiar ni destruir mallas APS', async () => {
  const priorImage = globalThis.Image;
  const priorCreate = URL.createObjectURL;
  const priorRevoke = URL.revokeObjectURL;
  globalThis.Image = class {
    width = 4000;
    height = 5961;
    set src(_url) { queueMicrotask(() => this.onload()); }
  };
  URL.createObjectURL = () => 'blob:gpu';
  URL.revokeObjectURL = () => {};
  try {
    const model = modelFor([triangle(10, 20)], {
      additional: [[triangle(20, 30)], [triangle(30, 40)]],
    });
    const originalData = model.getData;
    model.getData = () => ({ ...originalData(), urn: 'urn:surface-canal' });
    const originalFrags = model.getFragmentList;
    model.getFragmentList = () => ({ ...originalFrags(),
      fragments: { fragId2dbId: { 7: 42, 8: 42, 9: 99 } },
    });
    const source7 = model.getFragmentList().getVizmesh(7).geometry;
    const source8 = model.getFragmentList().getVizmesh(8).geometry;
    const added = [];
    const removed = [];
    let cleared = 0;
    const viewer = {
      getAggregateSelection: () => [],
      getAllModels: () => [model],
      clearSelection: () => { cleared += 1; },
      impl: {
        createOverlayScene: () => {},
        addOverlay: (_name, mesh) => added.push(mesh),
        removeOverlay: (_name, mesh) => removed.push(mesh),
        removeOverlayScene: () => {},
        invalidate: () => {},
      },
    };
    const files = [
      { name: CANAL_ORTHO_TILE_NAMES.north, type: 'image/jpeg', size: 100 },
      { name: CANAL_ORTHO_TILE_NAMES.south, type: 'image/jpeg', size: 100 },
    ];
    const surface = findPublishedSurface(viewer, { model_urn: 'urn:surface-canal', db_id: 42 });
    assert.deepEqual(surface, { model, dbId: 42 });
    assert.equal(findPublishedSurface(viewer, { model_urn: 'urn:otra', db_id: 42 }), null);
    const result = await mountCanalOrthoTrial(viewer, files,
      { maxTriangles: 0, surface, clearSelection: false });
    assert.equal(cleared, 0, 'la capa compartida no borra la selección de otro usuario');
    assert.equal(result.mode, 'projection');
    assert.equal(result.coveredFragments, 2);
    assert.deepEqual(added.map((mesh) => mesh.geometry), [source7, source8]);
    const material = added[0].material;
    assert.equal(added[1].material, material);
    assert.equal(material.options.uniforms.uWorldToUv.type, 'm4');
    assert.equal(material.options.uniforms.uNorth.type, 't');
    assert.equal(material.options.uniforms.uSouth.type, 't');
    assert.equal(material.options.uniforms.uPhotoOpacity.type, 'f');
    assert.equal(material.options.uniforms.uPhotoOpacity.value, 1 - DEFAULT_RELIEF_BLEND);
    assert.equal(material.options.uniforms.uHillshadeStrength.value,
      DEFAULT_HILLSHADE_STRENGTH);
    assert.equal(material.options.extensions.derivatives, true);
    assert.match(material.options.fragmentShader, /cross\(dFdx\(vWorldPosition\), dFdy\(vWorldPosition\)\)/);
    assert.equal(material.options.depthTest, true);
    assert.equal(material.options.depthWrite, false);
    assert.equal(material.options.polygonOffset, true);
    result.setReliefBlend(0.65);
    assert.equal(material.options.uniforms.uPhotoOpacity.value, 0.35);
    result.setHillshadeStrength(0.9);
    assert.equal(material.options.uniforms.uHillshadeStrength.value, 0.9);
    result.setHillshadeStrength(2);
    assert.equal(material.options.uniforms.uHillshadeStrength.value, 1);
    assert.equal(added.length, 2);
    result.dispose();
    result.dispose();
    assert.equal(removed.length, 2);
    assert.equal(material.disposed, true);
    assert.equal(material.options.uniforms.uNorth.value.disposed, true);
    assert.equal(material.options.uniforms.uSouth.value.disposed, true);
    assert.notEqual(source7.disposed, true);
    assert.notEqual(source8.disposed, true);
  } finally {
    globalThis.Image = priorImage;
    URL.createObjectURL = priorCreate;
    URL.revokeObjectURL = priorRevoke;
  }
});
