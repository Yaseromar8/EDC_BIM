// arViewerBridge.js — Conecta la pose de ARCore con la cámara del viewer de Autodesk.
//
// ARCore (nativo) manda por frame:
//   viewMatrix  (4x4, column-major, world -> camera)
//   projMatrix  (4x4, column-major, proyección de la cámara física)
//   anchorMatrix(4x4) opcional: transform del anchor en el mundo AR
//
// Convertimos eso en la cámara de Three.js que usa LMV y la sobreescribimos.
// El modelo se re-origina para que el anchor quede en el origen del mundo AR,
// a escala 1:1 (metros). El ajuste fino (ejes, escala, drift) se itera en device.
//
// NOTA: las convenciones exactas de ejes (Y-up de Three vs Y-up de ARCore) y el
// signo de algunas filas pueden requerir ajuste contra el celular real. Los
// puntos a tocar están marcados con [TUNE].

import { onCameraPose, onTracking } from './arcore';

/**
 * Activa el modo AR sobre un viewer ya cargado.
 * @param {Object} viewer  - Autodesk.Viewing.Viewer3D ya inicializado y con modelo.
 * @param {Object} opts
 *   opts.anchorMatrix  Float32Array(16) del anchor (si null, mundo = origen cámara).
 *   opts.modelOffset   {x,y,z} re-origen del modelo (normalmente el globalOffset del modelo).
 *   opts.scale         escala modelo->real (default 1 = el modelo ya está en metros).
 *   opts.onStatus      callback(estadoTracking).
 * @returns función para desconectar y restaurar la cámara normal.
 */
export function attachArToViewer(viewer, opts = {}) {
  const THREE = window.THREE;
  if (!viewer || !THREE) return () => {};

  const camera = viewer.impl.camera;             // THREE.Camera de LMV
  const prevAutoUpdate = camera.matrixAutoUpdate;
  const scale = opts.scale || 1;
  const off = opts.modelOffset || { x: 0, y: 0, z: 0 };

  // Guardar estado para restaurar al salir de AR
  const saved = {
    position: camera.position.clone(),
    target: viewer.navigation.getTarget().clone ? viewer.navigation.getTarget().clone() : null,
    up: camera.up.clone(),
    fov: camera.fov,
    autoUpdate: prevAutoUpdate,
  };

  // Tomamos control manual de la matriz de la cámara
  camera.matrixAutoUpdate = false;

  // Matrices reutilizables (sin alocar por frame)
  const mView = new THREE.Matrix4();
  const mProj = new THREE.Matrix4();
  const mWorld = new THREE.Matrix4();
  const mAnchorInv = new THREE.Matrix4().identity();
  const mModel = new THREE.Matrix4();

  // Re-origen del modelo: trasladar al anchor + escalar a real. [TUNE: ejes/escala]
  mModel.makeTranslation(-off.x, -off.y, -off.z).premultiply(
    new THREE.Matrix4().makeScale(scale, scale, scale)
  );
  if (opts.anchorMatrix) {
    mAnchorInv.fromArray(opts.anchorMatrix).invert();
  }

  let raf = null;
  let latest = null;

  const unsubPose = onCameraPose((data) => {
    // data.view / data.proj: arrays de 16 (column-major)
    latest = data;
    if (!raf) raf = requestAnimationFrame(apply);
  });

  const unsubTrack = onTracking((s) => { if (opts.onStatus) opts.onStatus(s); });

  function apply() {
    raf = null;
    if (!latest) return;

    // 1) Cámara: mundo = inversa de la matriz de vista, relativa al anchor
    mView.fromArray(latest.view);
    mWorld.copy(mView).invert();          // camera-to-world
    mWorld.premultiply(mAnchorInv);       // relativizar al anchor [TUNE]

    // Aplicar a la cámara de Three (control manual)
    camera.matrix.copy(mWorld);
    camera.matrix.decompose(camera.position, camera.quaternion, new THREE.Vector3());
    camera.matrixWorldNeedsUpdate = true;

    // 2) Proyección: usar la de la cámara física para que el modelo "calce"
    if (latest.proj && camera.projectionMatrix) {
      mProj.fromArray(latest.proj);
      camera.projectionMatrix.copy(mProj);
      if (camera.projectionMatrixInverse) camera.projectionMatrixInverse.copy(mProj).invert();
    }

    // 3) Sincronizar LMV con la cámara que acabamos de imponer
    try { viewer.impl.syncCamera(true); } catch (e) { /* noop */ }
    viewer.impl.invalidate(true, true, true);
  }

  // Devolver función de limpieza: restaura la cámara normal
  return function detach() {
    unsubPose();
    unsubTrack();
    if (raf) cancelAnimationFrame(raf);
    camera.matrixAutoUpdate = saved.autoUpdate;
    camera.position.copy(saved.position);
    camera.up.copy(saved.up);
    camera.fov = saved.fov;
    if (saved.target && viewer.navigation.setTarget) viewer.navigation.setTarget(saved.target);
    camera.updateProjectionMatrix && camera.updateProjectionMatrix();
    try { viewer.impl.syncCamera(true); } catch (e) { /* noop */ }
    viewer.impl.invalidate(true, true, true);
  };
}
