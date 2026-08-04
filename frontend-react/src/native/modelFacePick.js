// modelFacePick.js — Qué cara del modelo hay debajo del dedo.
//
// La calibración por esquina necesita las tres caras del rincón EN EL MODELO,
// y la única forma razonable de señalarlas en una tablet es tocándolas.
//
// El detalle que se paga caro si se hace mal: la normal que devuelve el visor
// viene en coordenadas de la GEOMETRÍA, no del mundo. Un modelo enlazado o
// rotado tiene su propia matriz, así que usar esa normal tal cual da un rincón
// girado respecto al real — y encima de forma que parece plausible. Por eso
// aquí se transforma con la matriz del fragmento antes de devolverla.

const tres = () => window.THREE
  || (window.Autodesk && window.Autodesk.Viewing
      && window.Autodesk.Viewing.Private && window.Autodesk.Viewing.Private.THREE);

/**
 * @param {Object} viewer visor de Autodesk
 * @param {number} clientX coordenada de pantalla del toque
 * @param {number} clientY
 * @returns {{n:number[], p:number[], dbId:number}|null} plano en coordenadas y
 *          unidades del MUNDO del visor, o null si no se tocó geometría.
 */
export function planoDelToque(viewer, clientX, clientY) {
  const THREE = tres();
  if (!viewer || !THREE) return null;

  const lienzo = viewer.impl?.canvas || viewer.canvas;
  if (!lienzo) return null;
  const caja = lienzo.getBoundingClientRect();
  const x = clientX - caja.left;
  const y = clientY - caja.top;

  let golpe = null;
  try { golpe = viewer.impl.hitTest(x, y, false); } catch { /* siguiente intento */ }
  if (!golpe) { try { golpe = viewer.hitTest(x, y); } catch { /* nada */ } }
  if (!golpe) return null;

  const punto = golpe.intersectPoint || golpe.point;
  const cara = golpe.face && golpe.face.normal;
  if (!punto || !cara) return null;

  const n = cara.clone ? cara.clone() : new THREE.Vector3(cara.x, cara.y, cara.z);

  // Geometría -> mundo. La matriz normal es la inversa traspuesta: con escalado
  // no uniforme, aplicar la matriz a secas tuerce las normales.
  try {
    const modelo = golpe.model || viewer.model;
    const proxy = viewer.impl.getFragmentProxy(modelo, golpe.fragId);
    if (proxy) {
      proxy.getAnimTransform?.();
      const m = new THREE.Matrix4();
      proxy.getWorldMatrix(m);
      n.applyMatrix3(new THREE.Matrix3().getNormalMatrix(m));
    }
  } catch { /* sin matriz de fragmento, la normal ya venía en mundo */ }

  n.normalize();
  return {
    n: [n.x, n.y, n.z],
    p: [punto.x, punto.y, punto.z],
    dbId: golpe.dbId,
  };
}

/** Dónde está la cámara del visor, para orientar las normales hacia quien mira. */
export function camaraDelVisor(viewer) {
  try {
    const p = viewer.navigation.getPosition();
    return [p.x, p.y, p.z];
  } catch {
    return null;
  }
}
