// SectionCutTool — corte PREDECIBLE para obra lineal.
//
// Regla de diseño: siempre se corta respecto al EJE de la obra y al elemento
// que tocas, nunca respecto a ejes globales (el modelo está georreferenciado y
// rotado: X/Y/Z del mundo dan planos diagonales inútiles).
//
// Tres cortes con significado FIJO — el mismo botón hace lo mismo toques la
// cara que toques:
//   · Transversal  → plano ⊥ al eje (la sección del canal)
//   · Longitudinal → plano que sigue el eje (desarrollo y pendiente)
//   · Planta       → horizontal siguiendo el elemento (si la cara está
//                    inclinada, el corte acompaña su pendiente)
// Más "Invertir lado" y "Quitar". Sin cara tocada no se corta: así nunca
// aparece un plano en un sitio que no elegiste.
//
// Usa el motor de sección REAL de LMV (Autodesk.Section → setSectionPlane).
import React, { useEffect, useRef, useState } from 'react';

const PICK_OVERLAY = 'ecd-cut-pick';

// Punto + normal de la cara clickeada, en coordenadas de MUNDO.
const getFaceHit = (viewer, clientX, clientY) => {
  const THREE = window.THREE;
  try {
    const canvas = viewer.impl?.canvas || viewer.canvas;
    const rect = canvas.getBoundingClientRect();
    const res = viewer.impl.hitTest(clientX - rect.left, clientY - rect.top, false);
    if (!res || !res.point) return null;

    let normal = null;
    if (res.face && res.face.normal) {
      const m = new THREE.Matrix4();
      try { res.model.getFragmentList().getWorldMatrix(res.fragId, m); } catch { /* usa identidad */ }
      const nm = new THREE.Matrix3().getNormalMatrix(m);
      normal = res.face.normal.clone().applyMatrix3(nm).normalize();
    }
    return { point: res.point.clone(), normal };
  } catch { return null; }
};

// Radio en unidades del modelo para que algo se vea de `px` pixeles en pantalla
// a la distancia a la que esta la camara ahora mismo.
//
// Es la unica forma de que un marcador funcione igual en un buzon de 60 cm y en
// un canal de 2 km: lo que importa es lo que ve el ojo, no las unidades del
// modelo.
const radioEnPantalla = (viewer, point, px = 26) => {
  const POR_DEFECTO = 0.25;
  try {
    const cam = viewer.impl?.camera;
    const alto = viewer.impl?.canvas?.clientHeight || viewer.container?.clientHeight;
    if (!cam || !alto) return POR_DEFECTO;
    const dist = cam.position.distanceTo(point);
    if (!isFinite(dist) || dist <= 0) return POR_DEFECTO;
    if (cam.isPerspective !== false && cam.fov) {
      // Altura del plano visible a esa distancia, repartida entre los pixeles.
      const alturaMundo = 2 * dist * Math.tan((cam.fov * Math.PI / 180) / 2);
      return Math.max(alturaMundo * (px / alto), 1e-4);
    }
    // Camara ortografica: el tamano no depende de la distancia.
    const alturaMundo = Math.abs((cam.top ?? 1) - (cam.bottom ?? -1)) / (cam.zoom || 1);
    return Math.max(alturaMundo * (px / alto), 1e-4);
  } catch {
    return POR_DEFECTO;
  }
};

// Marca visual de la cara tocada: disco orientado por la normal. Confirma
// DÓNDE se va a apoyar el plano antes de cortar.
const showPickMarker = (viewer, point, normal) => {
  const THREE = window.THREE;
  try {
    clearPickMarker(viewer);
    if (!viewer.impl.overlayScenes || !viewer.impl.overlayScenes[PICK_OVERLAY]) {
      viewer.impl.createOverlayScene(PICK_OVERLAY);
    }
    // El radio se calcula para que el disco se vea SIEMPRE del mismo tamaño en
    // pantalla (~26 px), no en proporcion al modelo.
    //
    // Antes salia de la caja del modelo completo: r = span * 0.004. En una obra
    // lineal de kilometros -- o con un solo elemento perdido lejos, que estira
    // la caja -- ese 0,4% son METROS de radio, y el marcador acababa tapando
    // media pantalla en vez de senalar la cara tocada.
    const r = radioEnPantalla(viewer, point, 26);
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(r, 28),
      new THREE.MeshBasicMaterial({
        color: 0x7c3aed, transparent: true, opacity: 0.42,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false,
      }),
    );
    mesh.position.copy(point);
    if (normal) {
      // CircleGeometry vive en XY (normal +Z): mirar hacia la normal la orienta
      try { mesh.lookAt(point.clone().add(normal)); } catch { /* queda plano */ }
    }
    viewer.impl.addOverlay(PICK_OVERLAY, mesh);
    viewer.impl.invalidate(false, false, true);

    // El marcador confirma DONDE se va a apoyar el plano; una vez visto, sobra.
    // Antes se quedaba en pantalla hasta salir del modo corte, encima de todo
    // (depthTest desactivado), y acababa estorbando justo lo que se queria
    // mirar. Se retira solo.
    try {
      clearTimeout(viewer.__pickMarkerTimer);
      viewer.__pickMarkerTimer = setTimeout(() => clearPickMarker(viewer), 1400);
    } catch { /* sin temporizador: se ira al salir del modo */ }
  } catch { /* sin overlay: la herramienta sigue funcionando */ }
};

const clearPickMarker = (viewer) => {
  try {
    clearTimeout(viewer?.__pickMarkerTimer);
    if (viewer?.impl?.overlayScenes && viewer.impl.overlayScenes[PICK_OVERLAY]) {
      viewer.impl.clearOverlay(PICK_OVERLAY);
      viewer.impl.invalidate(false, false, true);
    }
  } catch { /* noop */ }
};

// Marco del EJE en el punto tocado (tangente horizontal + PK). Si el eje aún
// no está cargado, se deriva del propio elemento.
const axisFrameAt = (viewer, point) => {
  try {
    const ext = viewer.getExtension && viewer.getExtension('LOB4DExtension');
    const fr = ext?.axisFrameAtPoint?.(point);
    if (fr && fr.tangent) return fr;
  } catch { /* sin eje: fallback por cara */ }
  return null;
};

// ── Iconos: cubo isométrico con el PLANO de sección en su orientación real ───
const ISO_CUBE = "M12 3 L20 7.5 L20 15.5 L12 20 L4 15.5 L4 7.5 Z";
const ISO_EDGES = "M4 7.5 L12 12 L20 7.5 M12 12 L12 20";
const ISO_PLANES = {
  top: "M12 3 L20 7.5 L12 12 L4 7.5 Z",       // planta
  left: "M4 7.5 L12 12 L12 20 L4 15.5 Z",     // transversal
  right: "M20 7.5 L12 12 L12 20 L20 15.5 Z",  // longitudinal
};
const IsoCutIcon = ({ plane, edge, planeColor }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" strokeLinejoin="round">
    <path d={ISO_CUBE} stroke={edge} strokeWidth="1.3" />
    <path d={ISO_EDGES} stroke={edge} strokeWidth="1.1" />
    <path d={ISO_PLANES[plane]} fill={planeColor} fillOpacity="0.7" stroke={planeColor} strokeWidth="1.2" />
  </svg>
);

const CUTS = [
  { key: 'transversal', label: 'Transversal', plane: 'left', tip: 'Transversal — plano perpendicular al eje (sección del canal)' },
  { key: 'longitudinal', label: 'Longitudinal', plane: 'right', tip: 'Longitudinal — plano que sigue el eje (desarrollo y pendiente)' },
  { key: 'planta', label: 'Planta', plane: 'top', tip: 'Planta — horizontal siguiendo la inclinación del elemento' },
];

// Normal del plano de corte para cada modo. Determinista: mismo botón, mismo
// significado, sin depender de la cara tocada (cuando hay eje cargado).
const normalFor = (key, hit) => {
  const THREE = window.THREE;
  const Z = new THREE.Vector3(0, 0, 1);
  const n = hit.normal ? hit.normal.clone().normalize() : null;

  if (key === 'planta') {
    // "respetando el elemento": una losa/solera inclinada corta con SU pendiente
    if (n && Math.abs(n.dot(Z)) > 0.6) return n.clone();
    return Z.clone();
  }

  // dirección "a lo largo" de la obra
  let along = null;
  if (hit.axis && hit.axis.tangent) {
    along = hit.axis.tangent.clone();
  } else if (n) {
    // sin eje: la horizontal contenida en la cara marca el desarrollo del muro
    const horiz = new THREE.Vector3().crossVectors(Z, n);
    if (horiz.lengthSq() > 1e-6) along = horiz.normalize();
  }
  if (!along) along = new THREE.Vector3(1, 0, 0);

  if (key === 'transversal') return along;                                  // ⊥ al eje
  return new THREE.Vector3().crossVectors(along, Z).normalize();            // ∥ al eje
};

const fmtPk = (s) => {
  if (!Number.isFinite(s)) return null;
  const km = Math.floor(s / 1000);
  return `${km}+${String((s - km * 1000).toFixed(2)).padStart(6, '0')}`;
};

export default function SectionCutTool() {
  const [mode, setMode] = useState(false);
  const [hit, setHit] = useState(null);          // { point, normal, axis }
  const [applied, setApplied] = useState(null);  // { key, flipped }
  const modeRef = useRef(false);
  const appliedRef = useRef(null);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { appliedRef.current = applied; }, [applied]);

  // Captura de cara por clic (sin romper el orbitar: solo cuenta si no arrastraste).
  useEffect(() => {
    if (!mode) return undefined;
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    const canvas = viewer?.impl?.canvas || viewer?.canvas;
    if (!viewer || !canvas) return undefined;

    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!down || !modeRef.current) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return; // fue un arrastre (orbitar), no un pick
      const h = getFaceHit(viewer, e.clientX, e.clientY);
      if (!h) return;
      const next = { point: h.point, normal: h.normal || null, axis: axisFrameAt(viewer, h.point) };
      setHit(next);
      showPickMarker(viewer, h.point, h.normal);
      // si ya había un corte, se RECOLOCA al punto nuevo con la misma
      // orientación (mover el corte = tocar otra cara, sin re-elegir modo)
      const cur = appliedRef.current;
      if (cur) applyPlane(cur.key, cur.flipped, next);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const applyPlane = async (key, flipped, h) => {
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    const target = h || hit;
    if (!viewer || !target) return;
    const normal = normalFor(key, target);
    if (flipped) normal.multiplyScalar(-1);
    try {
      const ext = viewer.getExtension('Autodesk.Section') || await viewer.loadExtension('Autodesk.Section');
      ext.setSectionPlane(normal, target.point, false);
    } catch (e) {
      console.warn('[Corte] No se pudo aplicar el plano de sección:', e);
    }
  };

  const chooseCut = (key) => {
    if (!hit) return;
    const flipped = applied?.key === key ? applied.flipped : false;
    setApplied({ key, flipped });
    applyPlane(key, flipped);
  };

  const invert = () => {
    if (!applied) return;
    const next = { ...applied, flipped: !applied.flipped };
    setApplied(next);
    applyPlane(next.key, next.flipped);
  };

  const clearCut = () => {
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    try { viewer?.getExtension('Autodesk.Section')?.deactivate?.(); } catch { /* sin extensión */ }
    clearPickMarker(viewer);
    setApplied(null);
    setHit(null);
  };

  const exitMode = () => {
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    clearPickMarker(viewer);
    setMode(false);
    setHit(null);
  };

  const iconBtn = (bg, border, children, onClick, title, disabled = false) => (
    <button onClick={onClick} title={title} disabled={disabled}
      style={{
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, border: `1px solid ${border}`, borderRadius: 7,
        cursor: disabled ? 'default' : 'pointer', padding: 0,
      }}>{children}</button>
  );

  const activeCut = applied && CUTS.find(c => c.key === applied.key);
  const pk = hit?.axis ? fmtPk(hit.axis.station) : null;

  return (
    <>
      <button
        onClick={() => (mode ? exitMode() : setMode(true))}
        title={mode ? 'Salir del modo corte' : 'Corte: actívalo y toca una cara del elemento'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', height: 26,
          background: mode ? '#7c3aed' : 'transparent',
          color: mode ? '#fff' : '#d8d8d8',
          border: `1px solid ${mode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.22)'}`,
          borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {/* Cubo con el PLANO de corte rebanándolo: mismo lenguaje visual que
            los tres modos de la tira, y se entiende sin leer el texto (el
            icono anterior parecía una cruz "†" y no decía nada). */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeLinejoin="round" strokeLinecap="round">
          <path d={ISO_CUBE} stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
          <path d={ISO_EDGES} stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
          <path d={ISO_PLANES.left} fill="currentColor" fillOpacity="0.85" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Corte{applied && <span style={{ fontSize: 10, opacity: 0.9 }}> ✓</span>}
      </button>

      {mode && (
        <div style={{
          position: 'fixed', bottom: 96, right: 16, zIndex: 1250,
          display: 'flex', flexDirection: 'column', gap: 4, padding: 4,
          background: 'rgba(30,33,39,0.96)', border: '1px solid #3a3f47', borderRadius: 9,
          boxShadow: '0 6px 20px rgba(0,0,0,.45)', alignItems: 'stretch', width: 42,
        }}>
          {/* Estado: qué corte está puesto y dónde se apoya */}
          <div style={{
            fontSize: 8.5, lineHeight: 1.25, textAlign: 'center', padding: '2px 1px 3px',
            color: activeCut ? '#c9b7ff' : '#7d8896', borderBottom: '1px solid #3a3f47', marginBottom: 1,
          }}>
            {!hit ? 'toca una cara'
              : activeCut ? <>{activeCut.label}{applied.flipped ? ' ⇄' : ''}{pk ? <><br />{pk}</> : null}</>
                : <>listo{pk ? <><br />{pk}</> : null}</>}
          </div>

          {CUTS.map(c => {
            const enabled = !!hit;
            const active = applied?.key === c.key;
            const edge = enabled ? (active ? '#ffffff' : '#7f8896') : '#464c54';
            const planeColor = enabled ? (active ? '#ffffff' : '#5fa8ff') : '#4b5159';
            return (
              <div key={c.key} style={{ display: 'flex', justifyContent: 'center' }}>
                {iconBtn(
                  active ? '#2563eb' : 'transparent',
                  active ? '#2563eb' : 'transparent',
                  <IsoCutIcon plane={c.plane} edge={edge} planeColor={planeColor} />,
                  () => chooseCut(c.key),
                  enabled ? c.tip : 'Primero toca una cara del elemento',
                  !enabled,
                )}
              </div>
            );
          })}

          <div style={{ height: 1, background: '#3a3f47', margin: '2px 4px' }} />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {iconBtn('transparent', 'transparent',
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={applied ? '#cdd3dc' : '#555b63'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4" /><path d="M7 21l-4-4 4-4" /><path d="M21 7H8a4 4 0 0 0-4 4M3 17h13a4 4 0 0 0 4-4" /></svg>,
              invert, applied ? 'Invertir el lado visible' : 'Aplica un corte primero', !applied)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {iconBtn('transparent', 'transparent',
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#e0888a" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
              clearCut, 'Quitar corte')}
          </div>
        </div>
      )}
    </>
  );
}
