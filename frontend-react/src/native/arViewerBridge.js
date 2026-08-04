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
  // APS NO expone THREE en window; el visor lo tiene en Private.THREE. Si esto
  // quedaba undefined, attach devolvía un no-op -> sin poses, botones muertos,
  // modelo congelado. Era EL bug de "poses: 0".
  const THREE = window.THREE
    || (window.Autodesk && window.Autodesk.Viewing && window.Autodesk.Viewing.Private && window.Autodesk.Viewing.Private.THREE);
  // ABANDONAR EN SILENCIO ES EL PEOR FALLO POSIBLE: sin THREE no hay poses, el
  // modelo se queda congelado y el panel muestra ceros — pero nada dice POR
  // QUÉ. Se ha perdido una tarde entera creyendo que era la cámara. Ahora el
  // motivo sube a la interfaz.
  const abandonar = (motivo) => {
    console.warn('[AR] attach: ' + motivo);
    try { opts.onFrame?.({ src: 'NO', poseEvents: 0, applied: 0, upm: 0, yaw: 0, aligning: false, err: motivo }); } catch { /* noop */ }
    const nop = () => {};
    nop.fallo = motivo;
    return nop;
  };
  if (!viewer) return abandonar('sin viewer');
  if (!THREE) return abandonar('THREE no encontrado (ni window ni Autodesk.Viewing.Private)');

  const camera = viewer.impl.camera;
  // Unidades del visor por METRO físico. En 1:1 = unidades-del-modelo-por-metro
  // (p.ej. modelo en metros -> 1; en mm -> 1000). Mutable para ajustarlo EN VIVO
  // desde el celular (botón "1:1" / slider) sin recompilar el APK.
  let unitsPerMeter = Number.isFinite(opts.unitsPerMeter) ? opts.unitsPerMeter : 1000;
  // Mutable: el anclaje por GPS lo reescribe con las coords del visor que
  // corresponden a tu posición real (viewer = UTM/mpu − globalOffset).
  let modelOrigin = opts.modelOrigin || { x: 0, y: 0, z: 0 };
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
  let poseEvents = 0; // eventos de pose recibidos del plugin (ANTES de aplicar)
  let applied = 0;    // veces que apply() completó sin error
  let lastErr = '';
  const threeSrc = window.THREE ? 'win' : 'priv';

  const unsubPose = onCameraPose((data) => {
    poseEvents++;
    latest = data;
    // Llamar apply() DIRECTO (rAF puede no tickear en el WebView transparente).
    try { apply(); } catch (e) { lastErr = String((e && e.message) || e); }
    if (opts.onFrame) {
      opts.onFrame({ src: threeSrc, poseEvents, applied, upm: Math.round(unitsPerMeter * 100) / 100, yaw: Math.round(yawDegrees), aligning, err: lastErr });
    }
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

    applied++;
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
    if (latest) { try { apply(); } catch (e) { lastErr = String((e && e.message) || e); } }
  };
  // Escala en vivo: unidades del visor por metro físico. Menor = modelo más
  // grande (hacia 1:1); mayor = más chico (maqueta).
  detach.setUnitsPerMeter = (value) => {
    const v = Number(value);
    if (Number.isFinite(v) && v > 0) unitsPerMeter = v;
    if (latest) { try { apply(); } catch (e) { lastErr = String((e && e.message) || e); } }
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

  // ── Anclaje por GPS ────────────────────────────────────────────────────────
  // Reescribe el punto del visor que se coloca en el anclaje físico. Para GPS,
  // es el punto del visor que corresponde a TU posición real (calculado en
  // geoAnchor.geoToViewer). Reusa el mismo apply() ya probado.
  detach.setModelOrigin = (o) => {
    if (o && Number.isFinite(o.x) && Number.isFinite(o.y)) {
      modelOrigin = { x: o.x, y: o.y, z: Number.isFinite(o.z) ? o.z : modelOrigin.z };
    }
    if (latest) { try { apply(); } catch (e) { lastErr = String((e && e.message) || e); } }
  };
  detach.getModelOrigin = () => ({ ...modelOrigin });

  // ── AJUSTAR (mover · elevar · girar) ───────────────────────────────────────
  // Es la herramienta que Revizto ofrece en DOS de sus tres modos de
  // calibración, y la que usan para corregir la deriva sin recalibrar entero.
  // Sin esto, el modo "sin calibración" no sirve de nada — y ese modo es el
  // único que funciona en un canal a cielo abierto, donde no hay rincones.
  //
  // Se mueve en METROS y RESPECTO A LO QUE MIRAS: el operario piensa "medio
  // metro a mi derecha", no "+500 en la X del modelo". La dirección se saca de
  // la cámara ya aplicada, proyectada al plano horizontal.
  //
  // OJO AL SIGNO: modelOrigin desplaza la CÁMARA dentro del modelo, así que
  // mover la cámara a la derecha se ve como el modelo yéndose a la izquierda.
  // Por eso va negado. Si en campo resulta invertido, se cambia SENTIDO a -1 y
  // queda arreglado sin tocar nada más.
  const SENTIDO = -1;
  detach.nudgeMeters = (dDerecha = 0, dAdelante = 0, dArriba = 0) => {
    const e = mWorld.elements;
    // Tercera columna de la matriz cámara→mundo = eje Z de la cámara; el
    // "adelante" de una cámara OpenGL es su -Z.
    let ax = -e[8], ay = -e[9];
    const largo = Math.hypot(ax, ay);
    if (largo < 1e-6) { ax = 1; ay = 0; } else { ax /= largo; ay /= largo; }
    // Derecha = adelante girado -90° en el plano XY (visor Z arriba).
    const dx = ay, dy = -ax;

    const u = unitsPerMeter * SENTIDO;
    modelOrigin = {
      x: modelOrigin.x + (dx * dDerecha + ax * dAdelante) * u,
      y: modelOrigin.y + (dy * dDerecha + ay * dAdelante) * u,
      z: modelOrigin.z + dArriba * u,
    };
    if (latest) { try { apply(); } catch (err) { lastErr = String((err && err.message) || err); } }
  };

  // Vuelve al estado con el que se entró: deshace todo el ajuste manual.
  const origenInicial = { ...modelOrigin };
  const yawInicial = yawDegrees;
  detach.resetAdjust = () => {
    modelOrigin = { ...origenInicial };
    yawDegrees = yawInicial;
    if (latest) { try { apply(); } catch (err) { lastErr = String((err && err.message) || err); } }
  };
  // Cuánto se ha movido a mano desde el inicio, en metros. Se enseña al
  // operario: un ajuste de 3 m suele significar que la calibración estaba mal,
  // no que el modelo esté mal dibujado.
  detach.getAdjustMeters = () => ({
    x: (modelOrigin.x - origenInicial.x) / unitsPerMeter,
    y: (modelOrigin.y - origenInicial.y) / unitsPerMeter,
    z: (modelOrigin.z - origenInicial.z) / unitsPerMeter,
    giro: yawDegrees - yawInicial,
  });
  // Rumbo actual de la cámara en el mundo ARCore: lo usa geoAnchor para sembrar
  // el yaw a partir del rumbo verdadero de la brújula.
  detach.getArHeading = () => headingDeg();

  return detach;
}
