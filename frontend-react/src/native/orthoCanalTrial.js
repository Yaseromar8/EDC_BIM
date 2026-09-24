// Ensayo LOCAL: ortofoto 260911 sobre la superficie APS seleccionada.
// El ECW original permanece fuera del navegador; se eligen mosaicos derivados locales.

export const CANAL_ORTHO_BOUNDS = Object.freeze({
  minE: 469680.2345774082,
  maxE: 470236.3495282178,
  minN: 9495348.9581837,
  maxN: 9497006.411206856,
});

const UNIT_TO_METERS = Object.freeze({
  m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
  mm: 0.001, millimeter: 0.001, millimeters: 0.001,
  cm: 0.01, centimeter: 0.01, centimeters: 0.01,
  ft: 0.3048, feet: 0.3048, foot: 0.3048,
  in: 0.0254, inch: 0.0254, inches: 0.0254,
});
let overlaySequence = 0;
export const DEFAULT_RELIEF_BLEND = 0.4;
export const DEFAULT_HILLSHADE_STRENGTH = 0.7;

function hillshadeStrength(value) {
  const numeric = Number(value);
  return Math.min(1, Math.max(0, Number.isFinite(numeric) ? numeric : DEFAULT_HILLSHADE_STRENGTH));
}

function photoOpacity(reliefBlend) {
  const value = Number(reliefBlend);
  return 1 - Math.min(0.75, Math.max(0, Number.isFinite(value) ? value : DEFAULT_RELIEF_BLEND));
}

export const CANAL_ORTHO_TILE_NAMES = Object.freeze({
  north: '260911-Paquete08-Canal-north-4000.jpg',
  south: '260911-Paquete08-Canal-south-4000.jpg',
});

const FULL_TILE = Object.freeze({ key: 'full', minU: 0, maxU: 1, minV: 0, maxV: 1 });
const MOSAIC_TILES = Object.freeze([
  { key: 'north', minU: 0, maxU: 1, minV: 0.5, maxV: 1 },
  { key: 'south', minU: 0, maxU: 1, minV: 0, maxV: 0.5 },
]);

export function orthoUv(este, norte, bounds = CANAL_ORTHO_BOUNDS) {
  return [
    (este - bounds.minE) / (bounds.maxE - bounds.minE),
    (norte - bounds.minN) / (bounds.maxN - bounds.minN),
  ];
}

export function viewerPointToUtm(point, offset, metersPerUnit, inverseTransform = null) {
  const local = point.clone();
  if (inverseTransform) local.applyMatrix4(inverseTransform);
  return {
    este: (local.x + (offset?.x || 0)) * metersPerUnit,
    norte: (local.y + (offset?.y || 0)) * metersPerUnit,
  };
}

function modelInverseTransform(model, THREE) {
  const value = model.getModelTransform?.();
  if (!value) return null;
  const matrix = value.isMatrix4 ? value.clone() : new THREE.Matrix4().fromArray(value);
  if (matrix.invert) return matrix.invert();
  return matrix.getInverse(matrix);
}

function fragmentIntersectsBounds(frags, fragId, bounds, offset, metersPerUnit,
  inverseTransform, THREE) {
  if (!frags.getWorldBounds || !THREE.Box3) return true;
  const box = new THREE.Box3();
  try { frags.getWorldBounds(fragId, box); } catch { return true; }
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return true;
  let minE = Infinity; let maxE = -Infinity;
  let minN = Infinity; let maxN = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const utm = viewerPointToUtm(new THREE.Vector3(x, y, z),
          offset, metersPerUnit, inverseTransform);
        minE = Math.min(minE, utm.este); maxE = Math.max(maxE, utm.este);
        minN = Math.min(minN, utm.norte); maxN = Math.max(maxN, utm.norte);
      }
    }
  }
  return maxE >= bounds.minE && minE <= bounds.maxE
    && maxN >= bounds.minN && minN <= bounds.maxN;
}

export function selectedSurface(viewer) {
  const selections = (viewer.getAggregateSelection?.() || [])
    .filter((entry) => entry?.model && entry.selection?.length);
  if (selections.length !== 1 || selections[0].selection.length !== 1) {
    throw new Error('Selecciona solamente la superficie del DWG antes de elegir la ortofoto.');
  }
  return { model: selections[0].model, dbId: selections[0].selection[0] };
}

export function findPublishedSurface(viewer, manifest) {
  if (!viewer?.impl || !manifest?.model_urn || !Number.isInteger(manifest.db_id)
      || manifest.db_id <= 0) return null;
  const models = viewer.getAllModels?.() || (viewer.model ? [viewer.model] : []);
  const model = models.find((item) => item.getData?.()?.urn === manifest.model_urn);
  return model ? { model, dbId: manifest.db_id } : null;
}

function fragmentIds(model, dbId, allModelFragments) {
  const tree = model.getInstanceTree?.() || model.getData?.()?.instanceTree;
  const frags = model.getFragmentList?.();
  const ids = new Set();
  if (allModelFragments) {
    // En Civil 3D la selección puede enumerar un solo fragmento aunque muchos
    // otros pertenezcan al mismo dbId. No incluir otros elementos del DWG.
    const ownerIds = frags?.fragments?.fragId2dbId;
    if (!ownerIds) throw new Error('Este DWG no expone la identidad de todos los fragmentos de la superficie.');
    for (const [id, ownerDbId] of Object.entries(ownerIds)) {
      if (Number(ownerDbId) === Number(dbId)) ids.add(Number(id));
    }
  } else {
    tree?.enumNodeFragments(dbId, (id) => ids.add(id), true);
  }
  return [...ids];
}

function interpolate(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t, u: a.u + (b.u - a.u) * t,
    v: a.v + (b.v - a.v) * t,
  };
}

function clipEdge(points, axis, limit, keepGreater) {
  if (!points.length) return points;
  const inside = (point) => keepGreater ? point[axis] >= limit : point[axis] <= limit;
  const result = [];
  let previous = points[points.length - 1];
  for (const current of points) {
    const previousInside = inside(previous);
    const currentInside = inside(current);
    if (previousInside !== currentInside) {
      const fraction = (limit - previous[axis]) / (current[axis] - previous[axis]);
      result.push(interpolate(previous, current, fraction));
    }
    if (currentInside) result.push(current);
    previous = current;
  }
  return result;
}

function clipToTile(points, tile) {
  let result = clipEdge(points, 'u', tile.minU, true);
  result = clipEdge(result, 'u', tile.maxU, false);
  result = clipEdge(result, 'v', tile.minV, true);
  return clipEdge(result, 'v', tile.maxV, false);
}

export function buildCanalOrthoGeometries(model, dbId, bounds, maxTriangles,
  { allModelFragments = false, tiles = [FULL_TILE] } = {}) {
  const THREE = window.THREE;
  const enumTriangles = window.Autodesk?.Viewing?.Private?.VertexEnumerator?.enumMeshTriangles;
  const tree = model.getInstanceTree?.() || model.getData?.()?.instanceTree;
  const frags = model.getFragmentList?.();
  if (!THREE || !enumTriangles || !tree || !frags) {
    throw new Error('El visor no expone los triángulos de esta superficie.');
  }

  const fragIds = fragmentIds(model, dbId, allModelFragments);
  if (!fragIds.length) throw new Error('El elemento seleccionado no contiene una malla visible.');

  const offset = model.getData?.()?.globalOffset || model.getGlobalOffset?.() || { x: 0, y: 0 };
  const unit = String(model.getUnitString?.() || 'm').toLowerCase();
  const metersPerUnit = UNIT_TO_METERS[unit];
  if (!metersPerUnit) throw new Error(`Unidad del modelo no reconocida: ${unit}`);
  const inverseTransform = modelInverseTransform(model, THREE);
  const worldMatrix = new THREE.Matrix4();
  const world = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const buffers = tiles.map((tile) => ({ tile, positions: [], uvs: [], triangles: 0 }));
  let inspected = 0;
  let included = 0;
  let usableFragments = 0;
  let coveredFragments = 0;

  for (const fragId of fragIds) {
    const mesh = frags.getVizmesh(fragId);
    if (!mesh?.geometry) continue;
    usableFragments += 1;
    if (!fragmentIntersectsBounds(frags, fragId, bounds, offset, metersPerUnit,
      inverseTransform, THREE)) continue;
    frags.getWorldMatrix(fragId, worldMatrix);
    let fragmentIncluded = false;
    enumTriangles(mesh.geometry, (a, b, c) => {
      inspected += 1;
      if (inspected > maxTriangles) {
        throw new Error(`El modelo supera ${maxTriangles.toLocaleString()} triángulos; prueba sólo el elemento seleccionado.`);
      }
      const source = [a, b, c];
      const triangle = [];
      for (let i = 0; i < 3; i += 1) {
        world[i].copy(source[i]).applyMatrix4(worldMatrix);
        const utm = viewerPointToUtm(world[i], offset, metersPerUnit, inverseTransform);
        const [u, v] = orthoUv(utm.este, utm.norte, bounds);
        triangle.push({ x: world[i].x, y: world[i].y, z: world[i].z, u, v });
      }
      let matched = false;
      for (const buffer of buffers) {
        const polygon = clipToTile(triangle, buffer.tile);
        if (polygon.length < 3) continue;
        matched = true;
        for (let i = 1; i < polygon.length - 1; i += 1) {
          for (const point of [polygon[0], polygon[i], polygon[i + 1]]) {
            buffer.positions.push(point.x, point.y, point.z);
            buffer.uvs.push(
              (point.u - buffer.tile.minU) / (buffer.tile.maxU - buffer.tile.minU),
              (point.v - buffer.tile.minV) / (buffer.tile.maxV - buffer.tile.minV),
            );
          }
          buffer.triangles += 1;
        }
      }
      if (matched) { included += 1; fragmentIncluded = true; }
    });
    if (fragmentIncluded) coveredFragments += 1;
  }
  if (!included) {
    throw new Error('La ortofoto no cruza este terreno. Revisa coordenadas, modelo y versión.');
  }
  const geometries = buffers.map(({ tile, positions, uvs, triangles }) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, data, size] of [['position', positions, 3], ['uv', uvs, 2]]) {
      const value = new THREE.BufferAttribute(new Float32Array(data), size);
      if (geometry.setAttribute) geometry.setAttribute(name, value);
      else geometry.addAttribute(name, value);
    }
    geometry.computeBoundingSphere();
    return { key: tile.key, geometry, triangles };
  });
  return { geometries, inspected, included, fragments: usableFragments, coveredFragments };
}

export function buildCanalOrthoGeometry(model, dbId, bounds, maxTriangles) {
  const result = buildCanalOrthoGeometries(model, dbId, bounds, maxTriangles);
  return { ...result, geometry: result.geometries[0].geometry };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen de la ortofoto.')); };
    image.src = url;
  });
}

function chosenTiles(files) {
  const selected = files?.length != null && !files?.name ? Array.from(files) : [files];
  if (selected.length === 1 && selected[0]
    && (selected[0].type === 'image/png' || /\.png$/i.test(selected[0].name || ''))) {
    return [{ ...FULL_TILE, file: selected[0] }];
  }
  const byName = new Map(selected.map((file) => [String(file?.name || '').toLowerCase(), file]));
  if (selected.length !== 2
    || !byName.has(CANAL_ORTHO_TILE_NAMES.north.toLowerCase())
    || !byName.has(CANAL_ORTHO_TILE_NAMES.south.toLowerCase())) {
    throw new Error('Selecciona juntos los dos JPG north-4000 y south-4000 del mosaico local.');
  }
  return MOSAIC_TILES.map((tile) => ({
    ...tile, file: byName.get(CANAL_ORTHO_TILE_NAMES[tile.key].toLowerCase()),
  }));
}

function worldToOrthoUvMatrix(model, bounds, THREE) {
  const offset = model.getData?.()?.globalOffset || model.getGlobalOffset?.() || { x: 0, y: 0 };
  const unit = String(model.getUnitString?.() || 'm').toLowerCase();
  const metersPerUnit = UNIT_TO_METERS[unit];
  if (!metersPerUnit) throw new Error(`Unidad del modelo no reconocida: ${unit}`);
  const transform = new THREE.Matrix4().makeScale(
    metersPerUnit / (bounds.maxE - bounds.minE),
    metersPerUnit / (bounds.maxN - bounds.minN), 1,
  );
  const inverse = modelInverseTransform(model, THREE);
  if (inverse) transform.multiply(inverse);
  transform.elements[12] += (offset.x * metersPerUnit - bounds.minE) / (bounds.maxE - bounds.minE);
  transform.elements[13] += (offset.y * metersPerUnit - bounds.minN) / (bounds.maxN - bounds.minN);
  return transform;
}

async function mountProjectedSurface(viewer, model, dbId, tiles, signal,
  reliefBlend, directionalShade, clearSelection) {
  const THREE = window.THREE;
  if (!THREE?.ShaderMaterial) throw new Error('El visor no admite proyección de textura en este navegador.');
  const frags = model.getFragmentList?.();
  const ids = fragmentIds(model, dbId, true);
  if (ids.length > 256) throw new Error('La superficie supera 256 fragmentos; no se abrirá este ensayo local.');
  const offset = model.getData?.()?.globalOffset || model.getGlobalOffset?.() || { x: 0, y: 0 };
  const unit = String(model.getUnitString?.() || 'm').toLowerCase();
  const metersPerUnit = UNIT_TO_METERS[unit];
  if (!metersPerUnit) throw new Error(`Unidad del modelo no reconocida: ${unit}`);
  const inverseTransform = modelInverseTransform(model, THREE);
  const relevant = ids.filter((id) => frags.getVizmesh(id)?.geometry
    && fragmentIntersectsBounds(frags, id, CANAL_ORTHO_BOUNDS, offset,
      metersPerUnit, inverseTransform, THREE));
  if (!relevant.length) throw new Error('La ortofoto no cruza los fragmentos de esta superficie.');
  const images = await Promise.all(tiles.map(({ file }) => loadImage(file)));
  if (signal?.aborted) throw new Error('Ensayo cancelado.');
  if (images.some((image) => image.width > 8192 || image.height > 8192
    || image.width * image.height > 25_000_000)) {
    throw new Error('Un mosaico supera el límite de textura del ensayo.');
  }
  const textures = images.map((image) => {
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uWorldToUv: { type: 'm4', value: worldToOrthoUvMatrix(model, CANAL_ORTHO_BOUNDS, THREE) },
      uNorth: { type: 't', value: textures[0] },
      uSouth: { type: 't', value: textures[1] || textures[0] },
      uTwoTiles: { type: 'f', value: tiles.length === 2 ? 1 : 0 },
      uPhotoOpacity: { type: 'f', value: photoOpacity(reliefBlend) },
      uHillshadeStrength: { type: 'f', value: hillshadeStrength(directionalShade) },
    },
    vertexShader: `
      uniform mat4 uWorldToUv;
      varying vec2 vRasterUv;
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vRasterUv = (uWorldToUv * worldPos).xy;
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uNorth;
      uniform sampler2D uSouth;
      uniform float uTwoTiles;
      uniform float uPhotoOpacity;
      uniform float uHillshadeStrength;
      varying vec2 vRasterUv;
      varying vec3 vWorldPosition;
      void main() {
        if (vRasterUv.x < 0.0 || vRasterUv.x > 1.0 || vRasterUv.y < 0.0 || vRasterUv.y > 1.0) discard;
        vec4 pixel;
        if (uTwoTiles > 0.5) {
          pixel = vRasterUv.y >= 0.5
            ? texture2D(uNorth, vec2(vRasterUv.x, (vRasterUv.y - 0.5) * 2.0))
            : texture2D(uSouth, vec2(vRasterUv.x, vRasterUv.y * 2.0));
        } else {
          pixel = texture2D(uNorth, vRasterUv);
        }
        // Normal geométrica por píxel: funciona también si el DWG no trae
        // atributo normal. Luz fija en el mundo, no gira con la cámara.
        vec3 slopeNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
        if (slopeNormal.z < 0.0) slopeNormal = -slopeNormal;
        float diffuse = max(0.0, dot(slopeNormal, normalize(vec3(-0.45, 0.50, 0.75))));
        float light = mix(1.0, 0.55 + 0.70 * diffuse, uHillshadeStrength);
        gl_FragColor = vec4(clamp(pixel.rgb * light, 0.0, 1.0), pixel.a * uPhotoOpacity);
      }
    `,
    extensions: { derivatives: true },
    // La ortofoto debe respetar el z-buffer del modelo: una ladera posterior
    // nunca puede pintarse encima de otra al orbitar. El pequeño offset sólo
    // evita parpadeos contra la misma malla coplanar que ya dibujó LMV.
    transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const overlayName = `alephia-ortho-canal-local-trial-${++overlaySequence}`;
  const mounted = [];
  try {
    viewer.impl.createOverlayScene(overlayName);
    for (const fragId of relevant) {
      if (signal?.aborted) throw new Error('Ensayo cancelado.');
      const source = frags.getVizmesh(fragId);
      if (!source?.geometry) continue;
      const mesh = new THREE.Mesh(source.geometry, material);
      mesh.matrixAutoUpdate = false;
      frags.getWorldMatrix(fragId, mesh.matrix);
      mesh.renderOrder = 1000;
      viewer.impl.addOverlay(overlayName, mesh);
      mounted.push(mesh);
    }
    if (!mounted.length) throw new Error('No hay mallas utilizables en la superficie seleccionada.');
    if (clearSelection) viewer.clearSelection?.();
    viewer.impl.invalidate(false, false, true);
    let disposed = false;
    return {
      mode: 'projection', inspected: null, included: null,
      fragments: ids.length, coveredFragments: mounted.length,
      width: images[0].width, height: images[0].height, tiles: tiles.length,
      setReliefBlend(value) {
        if (disposed) return;
        material.uniforms.uPhotoOpacity.value = photoOpacity(value);
        viewer.impl.invalidate(false, false, true);
      },
      setHillshadeStrength(value) {
        if (disposed) return;
        material.uniforms.uHillshadeStrength.value = hillshadeStrength(value);
        viewer.impl.invalidate(false, false, true);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const mesh of mounted) {
          try { viewer.impl.removeOverlay(overlayName, mesh); } catch { /* visor desmontado */ }
        }
        try { viewer.impl.removeOverlayScene?.(overlayName); } catch { /* visor desmontado */ }
        material.dispose();
        textures.forEach((texture) => texture.dispose());
        try { viewer.impl.invalidate(false, false, true); } catch { /* visor desmontado */ }
      },
    };
  } catch (error) {
    for (const mesh of mounted) {
      try { viewer.impl.removeOverlay(overlayName, mesh); } catch { /* montaje incompleto */ }
    }
    try { viewer.impl.removeOverlayScene?.(overlayName); } catch { /* montaje incompleto */ }
    material.dispose();
    textures.forEach((texture) => texture.dispose());
    throw error;
  }
}

export async function mountCanalOrthoTrial(viewer, files,
  { maxTriangles = 750000, signal, allModelFragments = true,
    reliefBlend = DEFAULT_RELIEF_BLEND,
    directionalShade = DEFAULT_HILLSHADE_STRENGTH,
    surface = null, clearSelection = true } = {}) {
  if (!viewer?.impl) throw new Error('Espera a que termine de cargar el visor.');
  const tiles = chosenTiles(files);
  if (tiles.some(({ file }) => file.size > 35_000_000)) {
    throw new Error('Un mosaico supera 35 MB; usa los JPG locales de 4000 píxeles.');
  }
  const { model, dbId } = surface || selectedSurface(viewer);
  if (!model || !Number.isInteger(Number(dbId)) || Number(dbId) <= 0) {
    throw new Error('La superficie guardada no es válida en este visor.');
  }
  if (allModelFragments) return mountProjectedSurface(viewer, model, dbId, tiles, signal,
    reliefBlend, directionalShade, clearSelection);
  const { geometries, inspected, included, fragments, coveredFragments } = buildCanalOrthoGeometries(
    model, dbId, CANAL_ORTHO_BOUNDS, maxTriangles, { allModelFragments, tiles },
  );
  const mounted = [];
  let overlayName;
  try {
    const images = await Promise.all(tiles.map(({ file }) => loadImage(file)));
    if (signal?.aborted) throw new Error('Ensayo cancelado.');
    if (images.some((image) => image.width > 8192 || image.height > 8192
      || image.width * image.height > 25_000_000)) {
      throw new Error('Un mosaico supera el límite de textura del ensayo.');
    }
    const THREE = window.THREE;
    overlayName = `alephia-ortho-canal-local-trial-${++overlaySequence}`;
    try { viewer.impl.createOverlayScene(overlayName); } catch { /* escena ya creada */ }
    for (let index = 0; index < tiles.length; index += 1) {
      if (!geometries[index].triangles) continue;
      const texture = new THREE.Texture(images[index]);
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: photoOpacity(reliefBlend),
        depthTest: true, depthWrite: false,
        side: THREE.DoubleSide, polygonOffset: true,
        polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(geometries[index].geometry, material);
      mesh.renderOrder = 1000;
      mounted.push({ mesh, material, texture });
      viewer.impl.addOverlay(overlayName, mesh);
    }
    if (clearSelection) viewer.clearSelection?.();
    if (!allModelFragments) viewer.fitToView?.([dbId], model);
    viewer.impl.invalidate(false, false, true);
    let disposed = false;
    return {
      mode: 'cpu',
      inspected, included, fragments, coveredFragments,
      width: images[0].width, height: images[0].height, tiles: tiles.length,
      setReliefBlend(value) {
        if (disposed) return;
        for (const { material } of mounted) {
          material.opacity = photoOpacity(value);
          material.needsUpdate = true;
        }
        viewer.impl.invalidate(false, false, true);
      },
      setHillshadeStrength() { /* Sólo disponible con proyección GPU. */ },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const { mesh, material, texture } of mounted) {
          try { viewer.impl.removeOverlay(overlayName, mesh); } catch { /* visor desmontado */ }
          material.dispose(); texture.dispose();
        }
        try { viewer.impl.removeOverlayScene?.(overlayName); } catch { /* visor desmontado */ }
        geometries.forEach(({ geometry }) => geometry.dispose());
        try { viewer.impl.invalidate(false, false, true); } catch { /* visor desmontado */ }
      },
    };
  } catch (error) {
    for (const { mesh, material, texture } of mounted) {
      try { viewer.impl.removeOverlay(overlayName, mesh); } catch { /* montaje incompleto */ }
      material.dispose(); texture.dispose();
    }
    if (overlayName) {
      try { viewer.impl.removeOverlayScene?.(overlayName); } catch { /* montaje incompleto */ }
    }
    geometries.forEach(({ geometry }) => geometry.dispose());
    throw error;
  }
}
