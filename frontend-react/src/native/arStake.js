// arStake.js — ESTACA DE VERIFICACIÓN del anclaje AR.
//
// Para saber si el modelo está realmente clavado al terreno (y no siguiéndote)
// hace falta una referencia que se pueda mirar de frente: un poste vertical de
// 1 m con marcas cada 25 cm, plantado EXACTAMENTE en el punto donde se creó el
// anclaje, más un anillo de 0.5 m en el suelo.
//
// Cómo se lee:
//   · La estaca se queda clavada en el mismo punto del piso real mientras
//     caminas alrededor  → el anclaje y la escala son correctos.
//   · La estaca "flota", se desliza o te acompaña  → la escala (unidades por
//     metro) no corresponde: 1 paso tuyo no equivale a 1 metro del modelo.
//   · La estaca se ve mucho más alta o más baja que 1 m real  → misma causa,
//     medida directamente (la estaca MIDE un metro del modelo).
//
// Es geometría de overlay: no toca el modelo ni queda en la vista guardada.

const OVERLAY = 'ecd-ar-stake';

export function showArStake(viewer, origin, unitsPerMeter) {
  const THREE = window.THREE;
  if (!viewer || !THREE || !origin) return;
  const m = Number(unitsPerMeter) || 1;   // unidades del visor por metro real
  try {
    clearArStake(viewer);
    if (!viewer.impl.overlayScenes || !viewer.impl.overlayScenes[OVERLAY]) {
      viewer.impl.createOverlayScene(OVERLAY);
    }

    const add = (geo, color, opacity) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.position.set(origin.x, origin.y, origin.z);
      viewer.impl.addOverlay(OVERLAY, mesh);
      return mesh;
    };

    // Poste de 1 m (eje Z del visor = vertical), radio 2 cm
    const post = add(new THREE.CylinderGeometry(0.02 * m, 0.02 * m, 1.0 * m, 12), 0xff3b30, 0.95);
    post.rotation.x = Math.PI / 2;                 // el cilindro nace en Y: se para
    post.position.z = origin.z + 0.5 * m;          // apoyado en el suelo

    // Marcas cada 25 cm (discos blancos): permiten estimar la altura real
    for (let k = 1; k <= 3; k++) {
      const tick = add(new THREE.CylinderGeometry(0.045 * m, 0.045 * m, 0.012 * m, 12), 0xffffff, 0.95);
      tick.rotation.x = Math.PI / 2;
      tick.position.z = origin.z + 0.25 * k * m;
    }

    // Anillo de 0.5 m en el suelo: marca el punto exacto del anclaje
    const ring = add(new THREE.RingGeometry(0.44 * m, 0.5 * m, 40), 0x00e5ff, 0.85);
    ring.position.z = origin.z + 0.004 * m;        // apenas sobre el piso

    // Cruz de 1 m en el suelo (dos barras finas): da parallaje al caminar
    for (const rot of [0, Math.PI / 2]) {
      const bar = add(new THREE.BoxGeometry(1.0 * m, 0.02 * m, 0.004 * m), 0x00e5ff, 0.7);
      bar.rotation.z = rot;
      bar.position.z = origin.z + 0.003 * m;
    }

    viewer.impl.invalidate(false, false, true);
  } catch { /* sin overlay: el AR sigue funcionando igual */ }
}

export function clearArStake(viewer) {
  try {
    if (viewer?.impl?.overlayScenes && viewer.impl.overlayScenes[OVERLAY]) {
      viewer.impl.clearOverlay(OVERLAY);
      viewer.impl.invalidate(false, false, true);
    }
  } catch { /* noop */ }
}
