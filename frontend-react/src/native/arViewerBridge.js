// Connects the native ARCore pose to the Autodesk Viewer camera.
//
// ARCore reports a Y-up world in meters. The aggregated APS viewer uses a
// Z-up world in millimeters. We transform the camera instead of moving each
// model so every linked model keeps its existing alignment.

import { onCameraPose, onTracking } from './arcore';

/**
 * @param {Object} viewer Autodesk.Viewing.Viewer3D with loaded models.
 * @param {Object} opts
 * @param {number[]} opts.anchorMatrix Physical AR anchor matrix.
 * @param {{x:number,y:number,z:number}} opts.modelOrigin Viewer point matched to the anchor.
 * @param {number} opts.unitsPerMeter Viewer units per physical meter.
 * @param {number} opts.yawDegrees Horizontal alignment correction.
 * @param {Function} opts.onStatus Tracking callback.
 * @returns {Function} Cleanup function with setAnchorMatrix/setYawDegrees methods.
 */
export function attachArToViewer(viewer, opts = {}) {
  const THREE = window.THREE;
  if (!viewer || !THREE) return () => {};

  const camera = viewer.impl.camera;
  // Unidades del visor por METRO físico. En 1:1 = unidades-del-modelo-por-metro
  // (p.ej. modelo en metros -> 1; en mm -> 1000). Mutable para ajustarlo EN VIVO
  // desde el celular (botón "1:1" / slider) sin recompilar el APK.
  let unitsPerMeter = Number.isFinite(opts.unitsPerMeter) ? opts.unitsPerMeter : 1000;
  const modelOrigin = opts.modelOrigin || { x: 0, y: 0, z: 0 };
  let yawDegrees = Number(opts.yawDegrees) || 0;
  // "Alinear con mi dirección": mientras aligning=true, el giro del modelo sigue
  // el giro físico del celular (agarrar el modelo y girarlo con tu cuerpo).
  let aligning = false;
  let alignBaseHeading = 0;
  let alignBaseYaw = 0;

  const saved = {
    position: camera.position.clone(),
    target: viewer.navigation.getTarget().clone ? viewer.navigation.getTarget().clone() : null,
    up: camera.up.clone(),
    fov: camera.fov,
    autoUpdate: camera.matrixAutoUpdate,
  };

  camera.matrixAutoUpdate = false;

  const mView = new THREE.Matrix4();
  const mProj = new THREE.Matrix4();
  const mWorld = new THREE.Matrix4();
  const mRelative = new THREE.Matrix4();
  const mBasis = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const mYaw = new THREE.Matrix4();
  const mAnchorInv = new THREE.Matrix4().identity();
  const mHeading = new THREE.Matrix4();
  const cameraScale = new THREE.Vector3();

  // Rumbo del celular en el plano horizontal (ARCore Y-up). Solo usamos deltas,
  // así que el signo exacto no importa (si gira al revés, se invierte fácil).
  function headingDeg() {
    if (!latest?.view) return 0;
    mHeading.fromArray(latest.view).invert(); // cámara -> mundo
    const e = mHeading.elements;
    return THREE.MathUtils.radToDeg(Math.atan2(-e[8], -e[10]));
  }

  function setAnchorMatrix(matrix) {
    if (matrix && matrix.length === 16) {
      mAnchorInv.fromArray(matrix).invert();
    } else {
      mAnchorInv.identity();
    }
  }

  setAnchorMatrix(opts.anchorMatrix);

  let raf = null;
  let latest = null;
  let frameCount = 0; // diagnóstico: cuántas poses de ARCore se han aplicado

  const unsubPose = onCameraPose((data) => {
    latest = data;
    if (!raf) raf = requestAnimationFrame(apply);
  });
  const unsubTrack = onTracking((status) => opts.onStatus?.(status));

  function apply() {
    raf = null;
    if (!latest?.view) return;

    // Camera-to-world, expressed relative to the physical anchor.
    mView.fromArray(latest.view);
    mRelative.copy(mView).invert();
    mRelative.premultiply(mAnchorInv);

    // Convert the ARCore world basis while keeping the OpenGL camera-local
    // basis unchanged: ARCore (x, y, z) -> APS (x, -z, y).
    mWorld.copy(mBasis).multiply(mRelative);

    // Mientras alineas girando el cuerpo, el yaw del modelo sigue tu rumbo.
    if (aligning) {
      yawDegrees = alignBaseYaw + (headingDeg() - alignBaseHeading);
    }

    // Rotating the virtual model clockwise equals rotating the camera in the
    // opposite direction around the matched BIM point.
    mYaw.makeRotationZ(THREE.MathUtils.degToRad(-yawDegrees));
    mWorld.premultiply(mYaw);

    // Convert AR meters to APS millimeters and place them at the BIM origin.
    const elements = mWorld.elements;
    elements[12] = elements[12] * unitsPerMeter + modelOrigin.x;
    elements[13] = elements[13] * unitsPerMeter + modelOrigin.y;
    elements[14] = elements[14] * unitsPerMeter + modelOrigin.z;

    camera.matrix.copy(mWorld);
    camera.matrix.decompose(camera.position, camera.quaternion, cameraScale);
    camera.up.set(0, 0, 1);
    camera.matrixWorld.copy(mWorld);
    camera.matrixWorldInverse?.copy(mWorld).invert();
    camera.matrixWorldNeedsUpdate = false;

    if (latest.proj && camera.projectionMatrix) {
      mProj.fromArray(latest.proj);
      camera.projectionMatrix.copy(mProj);
      camera.projectionMatrixInverse?.copy(mProj).invert();
    }

    try { viewer.impl.syncCamera(true); } catch { /* Viewer version dependent. */ }
    viewer.impl.invalidate(true, true, true);

    // Diagnóstico en vivo (throttle ~5/seg): confirma que las poses llegan y que
    // los controles cambian los valores que de verdad usa el puente.
    frameCount++;
    if (opts.onFrame && frameCount % 12 === 0) {
      opts.onFrame({ frames: frameCount, upm: Math.round(unitsPerMeter * 100) / 100, yaw: Math.round(yawDegrees), aligning });
    }
  }

  const detach = function detach() {
    unsubPose();
    unsubTrack();
    if (raf) cancelAnimationFrame(raf);
    camera.matrixAutoUpdate = saved.autoUpdate;
    camera.position.copy(saved.position);
    camera.up.copy(saved.up);
    camera.fov = saved.fov;
    if (saved.target && viewer.navigation.setTarget) viewer.navigation.setTarget(saved.target);
    camera.updateProjectionMatrix?.();
    try { viewer.impl.syncCamera(true); } catch { /* Viewer version dependent. */ }
    viewer.impl.invalidate(true, true, true);
  };

  detach.setAnchorMatrix = setAnchorMatrix;
  detach.setYawDegrees = (value) => {
    yawDegrees = Number(value) || 0;
    if (latest && !raf) raf = requestAnimationFrame(apply);
  };
  // Escala en vivo: unidades del visor por metro físico. Menor = modelo más
  // grande (hacia 1:1); mayor = más chico (maqueta).
  detach.setUnitsPerMeter = (value) => {
    const v = Number(value);
    if (Number.isFinite(v) && v > 0) unitsPerMeter = v;
    if (latest && !raf) raf = requestAnimationFrame(apply);
  };
  detach.getUnitsPerMeter = () => unitsPerMeter;

  // Alinear girando el celular: captura el rumbo base y sigue el giro físico.
  detach.startAlign = () => {
    if (!latest?.view) return false;
    alignBaseHeading = headingDeg();
    alignBaseYaw = yawDegrees;
    aligning = true;
    return true;
  };
  detach.stopAlign = () => { aligning = false; };
  detach.getYawDegrees = () => yawDegrees;

  return detach;
}
