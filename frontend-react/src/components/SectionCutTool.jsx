// SectionCutTool — corte guiado por la CARA del elemento (obra lineal-friendly).
//
// Por qué por la cara y no por ejes globales: el proyecto es lineal y
// georreferenciado → el modelo está ROTADO respecto al mundo (sigue el
// alineamiento). Cortar en X/Y/Z globales daría planos diagonales inútiles.
// En cambio, la cara que clickeas YA está alineada con la obra (el canal se
// modeló sobre el eje), así que de ella derivo una base ortonormal {n,u,v} y
// ofrezco los 3 cortes ortogonales con sentido de obra + planta horizontal.
//
// Usa el motor de sección REAL de LMV (Autodesk.Section → setSectionPlane):
// no es geometría nueva, es el corte auténtico posicionado por ti.
import React, { useEffect, useRef, useState } from 'react';

// Normal de la cara clickeada, en coordenadas de MUNDO.
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

// Base ortonormal a partir de la normal de la cara.
const buildBasis = (normal) => {
  const THREE = window.THREE;
  const n = normal.clone().normalize();
  // "arriba" del mundo; si la cara es casi horizontal, usa otro eje de apoyo.
  let up = new THREE.Vector3(0, 0, 1);
  if (Math.abs(n.dot(up)) > 0.95) up = new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { n, u, v };
};

export default function SectionCutTool() {
  const [mode, setMode] = useState(false);
  const [hit, setHit] = useState(null);          // { point, basis }
  const [applied, setApplied] = useState(null);   // { dir: 'n'|'u'|'v'|'z', flipped }
  const modeRef = useRef(false);
  useEffect(() => { modeRef.current = mode; }, [mode]);

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
      if (h.normal) {
        setHit({ point: h.point, basis: buildBasis(h.normal), hasFace: true });
      } else {
        // DWG/línea sin cara: al menos permite planta por el punto tocado
        setHit({ point: h.point, basis: null, hasFace: false });
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [mode]);

  const applyCut = async (dir, flipped = false) => {
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    if (!viewer || !hit) return;
    const THREE = window.THREE;
    let normal;
    if (dir === 'z') normal = new THREE.Vector3(0, 0, 1);
    else if (hit.basis) normal = hit.basis[dir].clone();
    else normal = new THREE.Vector3(0, 0, 1);
    if (flipped) normal.multiplyScalar(-1);

    try {
      const ext = viewer.getExtension('Autodesk.Section') || await viewer.loadExtension('Autodesk.Section');
      ext.setSectionPlane(normal, hit.point, false);
      setApplied({ dir, flipped });
    } catch (e) {
      console.warn('[Corte] No se pudo aplicar el plano de sección:', e);
    }
  };

  const clearCut = () => {
    const viewer = window.__mainViewer || window.NOP_VIEWER;
    try { viewer?.getExtension('Autodesk.Section')?.deactivate?.(); } catch { /* sin extensión */ }
    setApplied(null);
    setHit(null);
  };

  const exitMode = () => { setMode(false); setHit(null); };

  // Iconos simples (línea), estilo nativo. n=paralelo cara, u/v=perpendiculares, z=planta.
  const DIRS = [
    { key: 'n', tip: 'Paralelo a la cara', icon: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 9h16" /></> },
    { key: 'u', tip: 'Perpendicular A (transversal/longitudinal)', icon: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M10 4v16" /></> },
    { key: 'v', tip: 'Perpendicular B', icon: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 4l16 16" /></> },
    { key: 'z', tip: 'Planta (horizontal)', icon: <><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M3 8v0M21 8v0" /></> },
  ];

  const iconBtn = (bg, border, children, onClick, title) => (
    <button onClick={onClick} title={title}
      style={{
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, border: `1px solid ${border}`, borderRadius: 7, cursor: 'pointer', padding: 0,
      }}>{children}</button>
  );

  return (
    <>
      <button
        onClick={() => (mode ? exitMode() : setMode(true))}
        title={mode ? 'Salir del modo corte' : 'Corte por cara: actívalo y toca una cara del modelo'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', height: 26,
          background: mode ? '#7c3aed' : 'transparent',
          color: mode ? '#fff' : '#8d98a8',
          border: `1px solid ${mode ? 'rgba(255,255,255,0.25)' : '#3a4351'}`,
          borderRadius: 15, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8h16" strokeDasharray="3 3" /><path d="M12 3v18" /><path d="M8 6l4 2 4-2" />
        </svg>
        Corte{applied && <span style={{ fontSize: 10, opacity: 0.9 }}> ✓</span>}
      </button>

      {/* Tira vertical de iconos (estilo nativo). Sin texto: todo por tooltip. */}
      {mode && (
        <div style={{
          position: 'fixed', bottom: 96, right: 16, zIndex: 1250,
          display: 'flex', flexDirection: 'column', gap: 4, padding: 4,
          background: 'rgba(30,33,39,0.96)', border: '1px solid #3a3f47', borderRadius: 9,
          boxShadow: '0 6px 20px rgba(0,0,0,.45)',
        }}>
          {DIRS.map(d => {
            const enabled = hit && (hit.hasFace || d.key === 'z');
            const active = applied?.dir === d.key;
            return iconBtn(
              active ? '#3b9eff' : 'transparent',
              active ? '#3b9eff' : 'transparent',
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={enabled ? (active ? '#fff' : '#cdd3dc') : '#555b63'}
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d.icon}</svg>,
              () => enabled && applyCut(d.key, active ? !applied.flipped : false),
              d.tip + (active ? ' — clic: invertir lado' : ''),
            );
          })}
          <div style={{ height: 1, background: '#3a3f47', margin: '2px 4px' }} />
          {iconBtn('transparent', 'transparent',
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={applied ? '#cdd3dc' : '#555b63'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4" /><path d="M7 21l-4-4 4-4" /><path d="M21 7H8a4 4 0 0 0-4 4M3 17h13a4 4 0 0 0 4-4" /></svg>,
            () => applied && applyCut(applied.dir, !applied.flipped), 'Invertir lado')}
          {iconBtn('transparent', 'transparent',
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#e0888a" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
            clearCut, 'Quitar corte')}
        </div>
      )}
    </>
  );
}
