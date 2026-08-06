// TOPOGRAFÍA — Puntos de control + amarre modelo↔UTM.
//
// La columna vertebral del AR georreferenciado, del lado de gabinete:
//   1) CARGAR: el topógrafo sube su CSV de puntos (los mismos del dron:
//      ID, Este, Norte, Cota[, descripción]). Viven en Postgres, por proyecto.
//   2) AMARRAR: 2+ pares "clic en el modelo ↔ punto de control" y el ajuste
//      Helmert (con tests) da la transformación modelo↔UTM con su residual.
//      La ESCALA sale sola: si el DWG está en pies, dirá 0.3048 — el desfase
//      de unidades se detecta con número, no con sorpresas en obra.
//   3) VER: con amarre guardado, los puntos se dibujan sobre el modelo como
//      esferas con etiqueta — verificación visual de que todo cierra.
// El campo (tablet) consumirá estos mismos datos: nada incrustado en APKs.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ajustarHelmert } from '../native/georefFit';
import { apiFetch } from '../utils/apiFetch';

const S = {
  panel: {
    position: 'fixed', top: 60, right: 12, width: 400, maxHeight: 'calc(100vh - 140px)',
    background: 'rgba(24,26,32,0.97)', color: '#e8e8ee', borderRadius: 12,
    border: '1px solid #33363f', zIndex: 60, display: 'flex', flexDirection: 'column',
    fontSize: 13, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', pointerEvents: 'auto',
  },
  cab: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #33363f' },
  cuerpo: { padding: 12, overflowY: 'auto' },
  boton: {
    background: '#2e6be6', border: 'none', color: '#fff', padding: '8px 12px',
    borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12.5,
  },
  botonGris: {
    background: '#3a3a46', border: 'none', color: '#e6e6f0', padding: '8px 12px',
    borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12.5,
  },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  celda: { padding: '4px 6px', borderBottom: '1px solid #2c2e36', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  aviso: { background: '#252833', borderRadius: 8, padding: 10, margin: '10px 0', lineHeight: 1.5 },
};

function elViewer() {
  return (typeof window !== 'undefined' && (window.__mainViewer || window.NOP_VIEWER)) || null;
}

// CSV del topógrafo, tolerante: separador , o ; · cabeceras con o sin tilde ·
// decimales con coma. Columnas reconocidas: id/punto/nombre, este/x/e,
// norte/y/n, cota/z/elevacion, desc/descripcion/tipo.
export function parsearCsvPuntos(texto) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return { puntos: [], errores: ['archivo vacío'] };
  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';
  const num = (s) => parseFloat(String(s).replace(',', '.'));
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cab = lineas[0].split(sep).map(norm);
  const idx = (...alias) => cab.findIndex((c) => alias.some((a) => c === a || c.startsWith(a)));
  let iId = idx('id', 'punto', 'nombre', 'pto');
  let iE = idx('este', 'e', 'x');
  let iN = idx('norte', 'n', 'y');
  let iZ = idx('cota', 'z', 'elev', 'altura');
  let iD = idx('desc', 'tipo', 'obs');
  let desde = 1;
  if (iE < 0 || iN < 0) {
    // Sin cabecera: formato topográfico clásico ID,E,N,Z[,desc]
    iId = 0; iE = 1; iN = 2; iZ = 3; iD = 4; desde = 0;
  }
  const puntos = []; const errores = [];
  for (let i = desde; i < lineas.length; i++) {
    const c = lineas[i].split(sep);
    const este = num(c[iE]); const norte = num(c[iN]);
    if (!isFinite(este) || !isFinite(norte)) { errores.push(`línea ${i + 1}: sin E/N válidos`); continue; }
    puntos.push({
      punto_id: String(c[iId] ?? `P${i}`).trim() || `P${i}`,
      este, norte,
      cota: isFinite(num(c[iZ])) ? num(c[iZ]) : null,
      descripcion: (iD >= 0 && c[iD]) ? String(c[iD]).trim() : '',
    });
  }
  return { puntos, errores };
}

export default function GeoControlPanel({ project, BACKEND_URL, onClose }) {
  const projectId = project?.id != null ? String(project.id) : null;
  // El URN del modelo: el objeto de proyecto no siempre lo trae (llegó vacío
  // en la primera prueba → 400 "project y urn son obligatorios"). El VISOR
  // siempre sabe qué modelo tiene cargado: se le pregunta a él, con
  // reintentos porque puede estar cargando cuando el panel abre.
  const [urn, setUrn] = useState(project?.urn || null);
  useEffect(() => {
    if (urn) return undefined;
    let intentos = 0;
    const timer = setInterval(() => {
      intentos += 1;
      const delVisor = (() => {
        try { return elViewer()?.model?.getData()?.urn || null; } catch { return null; }
      })();
      if (delVisor) { setUrn(delVisor); clearInterval(timer); }
      else if (intentos > 15) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [urn]);
  const [puntos, setPuntos] = useState([]);
  const [georef, setGeoref] = useState(null);
  const [pares, setPares] = useState([]);          // amarre en curso
  const [pcElegido, setPcElegido] = useState('');  // punto de control del próximo par
  const [amarrando, setAmarrando] = useState(false);
  const [msj, setMsj] = useState('');
  const fileRef = useRef(null);
  const overlayRef = useRef({ instalado: false, nombre: 'geo-puntos-control' });

  const api = (ruta) => `${BACKEND_URL}${ruta}`;

  // ── ENSAYO DE OFICINA — TÚ eliges los puntos tocando el modelo ───────
  // Flujo: tocas DOS sitios reconocibles del modelo (dos buzones); el panel
  // les inventa coordenadas de ensayo coherentes (A=1000,2000 y B al este a
  // la DISTANCIA REAL que separa tus toques), calcula el amarre con el mismo
  // ajuste Helmert de producción, y te dice a cuántos metros pegar la cruz B.
  // Las balizas quedan DONDE TOCASTE: sabes exactamente qué parte del modelo
  // caerá sobre cada cruz del piso.
  // REGLA DE ORO (aprendida a golpes): NADA se captura ni se guarda solo.
  // La versión anterior escuchaba clics del visor y los clics normales
  // (seleccionar un elemento) creaban ensayos fantasma, y además inventaba
  // un ENSAYO-C perpendicular "en el aire" que confundía. Ahora: armar la
  // captura es un botón, captura UN toque y se desarma; guardar es OTRO
  // botón; y solo existen A y B — exactamente donde TÚ tocaste.
  const [modoEnsayo, setModoEnsayo] = useState(false);
  const [capturando, setCapturando] = useState(null);   // null | 'A' | 'B'
  const [ensayoA, setEnsayoA] = useState(null);         // [x,y,z] modelo
  const [ensayoB, setEnsayoB] = useState(null);

  // El APK de prueba (ar-59) muestra el TRAMO DEL CANAL (URN v30 del DWG):
  // para que lo que tocas aquí sea lo que ves en AR, hay que amarrar ESE
  // modelo. Prefijo base64 de su URN (sin la versión):
  const URN_CANAL = 'dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnpWOE5LU2pzVDRxcUxLQ2plUm1pSEE';

  const crearEnsayoOficina = () => {
    if (urn && !urn.startsWith(URN_CANAL)) {
      if (!window.confirm('OJO: el AR de prueba muestra el modelo del CANAL y aquí tienes abierto OTRO modelo — en la tablet verías el canal donde no corresponde. ¿Continuar igual? (Recomendado: abre el modelo del canal y repite)')) return;
    }
    setModoEnsayo(true);
    setEnsayoA(null); setEnsayoB(null); setCapturando(null);
    setMsj('Modo ensayo abierto: captura tus 2 puntos con los botones de abajo. NADA se guarda hasta que toques «Crear ensayo».');
  };

  const guardarEnsayo = async () => {
    if (!ensayoA || !ensayoB) return;
    const clicA = ensayoA, clicB = ensayoB;
    // Distancia REAL entre los toques: unidades del modelo × escala a metros
    const viewer = elViewer();
    let escalaU = 1;
    try { escalaU = viewer?.model?.getUnitScale?.() || 1; } catch { /* 1 */ }
    const dU = Math.hypot(clicB[0] - clicA[0], clicB[1] - clicA[1], clicB[2] - clicA[2]);
    const dM = dU * escalaU;
    if (dM < 1 || dM > 60) {
      setMsj(`Esos puntos están a ${dM.toFixed(1)} m — captura dos entre 1 y 60 m.`);
      return;
    }
    const A = [1000, 2000, 100];
    const B = [1000 + dM, 2000, 100];
    const paresEnsayo = [
      { punto_id: 'ENSAYO-A', modelo: clicA, utm: A },
      { punto_id: 'ENSAYO-B', modelo: clicB, utm: B },
    ];
    const aj = ajustarHelmert(paresEnsayo.map((p) => ({ id: p.punto_id, origen: p.modelo, destino: p.utm })));
    if (!aj?.ok) { setMsj('El ajuste falló: ' + (aj?.error || '?')); return; }
    const puntosEnsayo = [
      { punto_id: 'ENSAYO-A', este: A[0], norte: A[1], cota: A[2], descripcion: 'cruz origen — el 1er punto que tocaste' },
      { punto_id: 'ENSAYO-B', este: B[0], norte: B[1], cota: B[2], descripcion: `cruz a ${dM.toFixed(2)} m de A — el 2º punto` },
    ];
    const transform = { escala: aj.escala, yawDeg: aj.yawDeg, tx: aj.tx, ty: aj.ty, tz: aj.tz };
    // Sin ilusiones: el éxito se declara SOLO si el servidor confirmó ambos
    // guardados (la primera versión pintaba "amarre vigente" aunque el
    // backend hubiera respondido 401 — y el usuario probaba contra nada).
    try {
      const r1 = await apiFetch(api('/api/geo/control-points'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId, puntos: puntosEnsayo }),
      });
      const d1 = await r1.json();
      if (!d1.ok) { setMsj('El servidor rechazó los puntos: ' + (d1.error || r1.status)); return; }
      const r2 = await apiFetch(api('/api/geo/georef'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId, urn, crs: 'ENSAYO-OFICINA', pares: paresEnsayo, transform, residual_m: 0 }),
      });
      const d2 = await r2.json();
      if (!d2.ok) { setMsj('El servidor rechazó el amarre: ' + (d2.error || r2.status)); return; }
      const rr = await apiFetch(api(`/api/geo/control-points?project=${encodeURIComponent(projectId)}`));
      setPuntos((await rr.json()).puntos || []);
      setGeoref({ crs: 'ENSAYO-OFICINA', pares: paresEnsayo, transform, residual_m: 0 });
      setModoEnsayo(false);
      const dTxt = (B[0] - A[0]).toFixed(2);
      setMsj(`✅ Guardado. EN EL PISO: cruz A donde quieras; cruz B a ${dTxt} m exactos en línea recta. En AR, lo que tocaste como A aparecerá sobre tu cruz A.`);
    } catch (e) {
      setMsj('Sin conexión con el servidor: ' + String(e?.message || e));
    }
  };

  // DIAGNÓSTICO DEL MARCO: el visor (LMV) aplica su propia conversión de
  // unidades y desplazamiento interno al cargar el modelo. Para casar los
  // clics del visor con el GLB del AR se necesita ese marco EXACTO — este
  // botón se lo pregunta al visor y lo muestra para copiarlo, en vez de
  // adivinar factores (así se cazó que "pies vs mm" era ambiguo).
  const diagnosticoMarco = () => {
    const viewer = elViewer();
    if (!viewer?.model) { setMsj('El visor aún no tiene modelo'); return; }
    const m = viewer.model;
    const d = {};
    try { d.unitScale = m.getUnitScale?.(); } catch { /* n/a */ }
    try { d.units = m.getUnitString?.(); } catch { /* n/a */ }
    try {
      const bb = m.getBoundingBox?.();
      if (bb) d.bbox = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
    } catch { /* n/a */ }
    try { d.globalOffset = m.getData?.()?.globalOffset || null; } catch { /* n/a */ }
    try { d.placement = m.getData?.()?.placementWithOffset?.elements || m.getData?.()?.placementTransform?.elements || null; } catch { /* n/a */ }
    // TESTIGOS: 3 fragmentos reales con su dbId y su centro EN EL MARCO DE
    // LOS CLICS. Esos mismos elementos viven en el GLB del AR con el mismo
    // dbId: comparar ambos resuelve la transformación exacta entre marcos,
    // medida sobre geometría real — cero teoría de LMV.
    try {
      const fl = m.getFragmentList?.();
      const THREE = window.THREE;
      if (fl && THREE) {
        const n = fl.getCount?.() ?? fl.fragments?.length ?? 0;
        const caja = new THREE.Box3();
        d.testigos = [];
        for (const f of [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]) {
          if (f < 0 || f >= n) continue;
          try {
            fl.getWorldBounds(f, caja);
            const dbId = fl.getDbIds ? fl.getDbIds(f) : (fl.fragments?.fragId2dbId?.[f]);
            d.testigos.push({
              dbId: Array.isArray(dbId) ? dbId[0] : dbId,
              c: [((caja.min.x + caja.max.x) / 2), ((caja.min.y + caja.max.y) / 2), ((caja.min.z + caja.max.z) / 2)].map((v) => Math.round(v * 10) / 10),
            });
          } catch { /* siguiente */ }
        }
      }
    } catch { /* n/a */ }
    const txt = JSON.stringify(d);
    try { navigator.clipboard?.writeText(txt); } catch { /* igual se muestra */ }
    console.log('[geo] marco del visor:', d);
    setMsj('MARCO DEL VISOR (copiado al portapapeles — pégamelo): ' + txt);
  };

  // Borra el kit de ensayo del SERVIDOR: puntos ENSAYO-* + amarre del modelo.
  const borrarEnsayo = async () => {
    if (!window.confirm('¿Borrar los puntos ENSAYO-* y el amarre de este modelo del servidor?')) return;
    try {
      for (const id of ['ENSAYO-A', 'ENSAYO-B', 'ENSAYO-C']) {
        await apiFetch(api(`/api/geo/control-points/${encodeURIComponent(id)}?project=${encodeURIComponent(projectId)}`), { method: 'DELETE' });
      }
      await apiFetch(api(`/api/geo/georef?project=${encodeURIComponent(projectId)}&urn=${encodeURIComponent(urn)}`), { method: 'DELETE' });
      const rr = await apiFetch(api(`/api/geo/control-points?project=${encodeURIComponent(projectId)}`));
      setPuntos((await rr.json()).puntos || []);
      setGeoref(null);
      setPares([]);
      setEnsayoA(null); setEnsayoB(null); setModoEnsayo(false); setCapturando(null);
      setMsj('Ensayo borrado del servidor. Empieza de cero cuando quieras.');
    } catch (e) {
      setMsj('No se pudo borrar: ' + String(e?.message || e));
    }
  };

  // Captura de UN toque quieto sobre el visor, solo mientras `capturando`
  // está armado por su botón. GUARDIA ANTI-ARRASTRE: navegar también dispara
  // 'click' al soltar; solo cuenta si el mouse se movió <6 px.
  useEffect(() => {
    if (!capturando) return undefined;
    const viewer = elViewer();
    if (!viewer) { setMsj('El visor aún no está listo'); setCapturando(null); return undefined; }
    const canvas = viewer.impl?.canvas || viewer.canvas;
    let bajo = null;
    const onDown = (ev) => { bajo = [ev.clientX, ev.clientY]; };
    const onClick = (ev) => {
      if (bajo && Math.hypot(ev.clientX - bajo[0], ev.clientY - bajo[1]) > 6) return;   // fue arrastre
      const rect = canvas.getBoundingClientRect();
      let golpe = null;
      try { golpe = viewer.impl.hitTest(ev.clientX - rect.left, ev.clientY - rect.top, false); } catch { /* nada */ }
      if (!golpe || !golpe.intersectPoint) { setMsj('Ese clic no tocó el modelo — apunta a una superficie'); return; }
      const p = [golpe.intersectPoint.x, golpe.intersectPoint.y, golpe.intersectPoint.z];
      if (capturando === 'A') setEnsayoA(p); else setEnsayoB(p);
      setMsj(`Punto ${capturando} capturado ✓ — revisa las coordenadas y captura el otro, o toca «Crear ensayo».`);
      setCapturando(null);   // UN toque y se desarma: nada queda escuchando
    };
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('click', onClick);
    return () => { canvas.removeEventListener('mousedown', onDown); canvas.removeEventListener('click', onClick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturando]);

  // ── datos ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    apiFetch(api(`/api/geo/control-points?project=${encodeURIComponent(projectId)}`))
      .then((r) => r.json()).then((d) => setPuntos(d.puntos || [])).catch(() => {});
    if (urn) {
      apiFetch(api(`/api/geo/georef?project=${encodeURIComponent(projectId)}&urn=${encodeURIComponent(urn)}`))
        .then((r) => r.json()).then((d) => setGeoref(d.georef || null)).catch(() => {});
    }
  }, [projectId, urn]);

  const subirCsv = async (file) => {
    const texto = await file.text();
    const { puntos: filas, errores } = parsearCsvPuntos(texto);
    if (!filas.length) { setMsj('CSV sin puntos válidos. ' + errores.join(' · ')); return; }
    const r = await apiFetch(api('/api/geo/control-points'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: projectId, puntos: filas }),
    });
    const d = await r.json();
    if (d.ok) {
      setMsj(`${d.cargados} puntos cargados${errores.length ? ` · ${errores.length} líneas ignoradas` : ''}`);
      const rr = await apiFetch(api(`/api/geo/control-points?project=${encodeURIComponent(projectId)}`));
      setPuntos((await rr.json()).puntos || []);
    } else setMsj('Error: ' + (d.error || '?'));
  };

  // ── amarre: clic en el modelo ↔ punto de control ─────────────────────
  useEffect(() => {
    if (!amarrando) return undefined;
    const viewer = elViewer();
    if (!viewer) { setMsj('El visor aún no está listo'); setAmarrando(false); return undefined; }
    const canvas = viewer.impl?.canvas || viewer.canvas;
    const onClick = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      let golpe = null;
      try { golpe = viewer.impl.hitTest(x, y, false); } catch { /* siguiente */ }
      if (!golpe || !golpe.intersectPoint) { setMsj('Ese clic no tocó el modelo — apunta a una superficie'); return; }
      const pc = puntos.find((p) => p.punto_id === pcElegido);
      if (!pc) { setMsj('Primero elige a qué punto de control corresponde'); return; }
      const p = golpe.intersectPoint;
      setPares((prev) => [...prev.filter((q) => q.punto_id !== pc.punto_id), {
        punto_id: pc.punto_id,
        modelo: [p.x, p.y, p.z],
        utm: [pc.este, pc.norte, pc.cota ?? 0],
      }]);
      setMsj(`Par «${pc.punto_id}» capturado. ${pares.length + 1 >= 2 ? 'Ya puedes calcular el amarre.' : 'Falta al menos otro par.'}`);
      setAmarrando(false);
    };
    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [amarrando, pcElegido, puntos, pares.length]);

  const ajuste = useMemo(() => {
    if (pares.length < 2) return null;
    return ajustarHelmert(pares.map((p) => ({ id: p.punto_id, origen: p.modelo, destino: p.utm })));
  }, [pares]);

  const guardarAmarre = async () => {
    if (!ajuste?.ok) return;
    const r = await apiFetch(api('/api/geo/georef'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: projectId, urn, crs: 'UTM WGS84 17S',
        pares,
        transform: { escala: ajuste.escala, yawDeg: ajuste.yawDeg, tx: ajuste.tx, ty: ajuste.ty, tz: ajuste.tz },
        residual_m: ajuste.rms,
      }),
    });
    const d = await r.json();
    if (d.ok) {
      setGeoref({ crs: 'UTM WGS84 17S', pares, transform: { escala: ajuste.escala, yawDeg: ajuste.yawDeg, tx: ajuste.tx, ty: ajuste.ty, tz: ajuste.tz }, residual_m: ajuste.rms });
      setMsj(`Amarre guardado · residual ${(ajuste.rms * 100).toFixed(1)} cm · escala ${ajuste.escala.toFixed(4)}`);
    } else setMsj('Error guardando: ' + (d.error || '?'));
  };

  // Inversa del Helmert del amarre: UTM → coordenadas del modelo. La usan la
  // capa de esferas y el "volar al punto" de la lista.
  const aModelo = useMemo(() => {
    const t = georef?.transform;
    if (!t) return null;
    const RAD = Math.PI / 180;
    const cos = Math.cos(t.yawDeg * RAD), sin = Math.sin(t.yawDeg * RAD);
    return (E, N, Z) => {
      const x = E - t.tx, y = N - t.ty;
      return [
        (cos * x + sin * y) / t.escala,
        (-sin * x + cos * y) / t.escala,
        (Z - t.tz) / t.escala,
      ];
    };
  }, [georef]);

  // Volar la cámara a un punto de control: así se VE dónde cayó cada uno.
  const volarAPunto = (p) => {
    const viewer = elViewer();
    const THREE = typeof window !== 'undefined' ? window.THREE : null;
    if (!viewer || !THREE || !aModelo) return;
    const [x, y, z] = aModelo(p.este, p.norte, p.cota ?? 0);
    try {
      const nav = viewer.navigation;
      const objetivo = new THREE.Vector3(x, y, z);
      const lejos = 12 / (georef?.transform?.escala || 1);   // ~12 m en unidades del modelo
      nav.setPivotPoint(objetivo);   // que la órbita gire alrededor del punto: sin esto el vuelo desorienta
      nav.setRequestTransition(true,
        new THREE.Vector3(x + lejos * 0.6, y - lejos * 0.6, z + lejos * 0.7),
        objetivo,
        nav.getCamera()?.fov || 45);
      setMsj(`Volando a «${p.punto_id}» — baliza amarilla con palo rojo. Orbita alrededor de ella para ubicarte.`);
    } catch { setMsj('No se pudo mover la cámara'); }
  };

  // ── capa de esferas sobre el modelo (con amarre: UTM → modelo) ───────
  useEffect(() => {
    const viewer = elViewer();
    const THREE = typeof window !== 'undefined' ? window.THREE : null;
    if (!viewer || !THREE || !aModelo || !puntos.length) return undefined;
    const nombre = overlayRef.current.nombre;
    try { viewer.impl.createOverlayScene(nombre); } catch { /* ya existe */ }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc83d });
    const matPalo = new THREE.MeshBasicMaterial({ color: 0xff5030 });
    const objetos = [];
    // Radio visible a zoom de red: ~60 cm reales, en unidades del modelo.
    const radio = 0.6 / (georef?.transform?.escala || 1);
    for (const p of puntos) {
      const [x, y, z] = aModelo(p.este, p.norte, p.cota ?? 0);
      const esfera = new THREE.Mesh(new THREE.SphereGeometry(radio, 14, 12), mat);
      esfera.position.set(x, y, z);
      viewer.impl.addOverlay(nombre, esfera);
      objetos.push(esfera);
      // Palo vertical de 8 m: un banderín que se ve desde lejos, como las
      // balizas de obra — la esfera sola se pierde en una red de cuadras.
      const alto = 8 / (georef?.transform?.escala || 1);
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.18, radio * 0.18, alto, 8), matPalo);
      palo.position.set(x, y, z + alto / 2);
      palo.rotation.x = Math.PI / 2;   // el cilindro nace a lo largo de Y; el modelo es Z-arriba
      viewer.impl.addOverlay(nombre, palo);
      objetos.push(palo);
    }
    viewer.impl.invalidate(false, false, true);
    overlayRef.current.instalado = true;
    return () => {
      try { objetos.forEach((o) => viewer.impl.removeOverlay(nombre, o)); viewer.impl.invalidate(false, false, true); } catch { /* visor cerrado */ }
    };
  }, [georef, puntos, aModelo]);

  if (!projectId) return null;

  return (
    <div style={S.panel}>
      <div style={S.cab}>
        <strong style={{ fontSize: 14 }}>📐 Topografía · Puntos de control</strong>
        <span style={{ flex: 1 }} />
        <button style={S.botonGris} onClick={onClose}>✕</button>
      </div>
      <div style={S.cuerpo}>
        {/* 1 · CARGA */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={S.boton} onClick={() => fileRef.current?.click()}>Subir CSV del topógrafo</button>
          <span style={{ opacity: 0.75 }}>{puntos.length} puntos</span>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subirCsv(f); e.target.value = ''; }} />
        </div>
        <div style={{ opacity: 0.65, marginTop: 4 }}>Formato: ID, Este, Norte, Cota[, descripción] — el mismo del dron.</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button style={S.botonGris} onClick={crearEnsayoOficina}>🧪 Ensayo de oficina (2 cruces de cinta)</button>
          {(georef || puntos.some((p) => p.punto_id.startsWith('ENSAYO'))) && (
            <button style={{ ...S.botonGris, color: '#ffb4b4' }} onClick={borrarEnsayo}>🗑 Borrar ensayo</button>
          )}
          <button style={S.botonGris} onClick={diagnosticoMarco} title="Marco de coordenadas del visor — para calibrar el GLB del AR">🔬</button>
        </div>

        {modoEnsayo && (
          <div style={{ ...S.aviso, borderLeft: '3px solid #ffc83d' }}>
            <strong>Ensayo: elige tus 2 puntos</strong>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <button
                style={capturando === 'A' ? { ...S.boton, background: '#c94f4f' } : S.boton}
                onClick={() => { setCapturando(capturando === 'A' ? null : 'A'); setMsj(capturando === 'A' ? 'Captura cancelada' : 'Toca (quieto) en el modelo tu punto A — un buzón que reconozcas.'); }}
              >
                {capturando === 'A' ? '… tocando A (cancelar)' : ensayoA ? 'A ✓ (re-capturar)' : 'Capturar punto A'}
              </button>
              <button
                style={capturando === 'B' ? { ...S.boton, background: '#c94f4f' } : S.boton}
                onClick={() => { setCapturando(capturando === 'B' ? null : 'B'); setMsj(capturando === 'B' ? 'Captura cancelada' : 'Toca (quieto) en el modelo tu punto B — otro buzón, a 3-10 m del A.'); }}
              >
                {capturando === 'B' ? '… tocando B (cancelar)' : ensayoB ? 'B ✓ (re-capturar)' : 'Capturar punto B'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                style={ensayoA && ensayoB ? { ...S.boton, background: '#1f8a4c' } : { ...S.botonGris, opacity: 0.5 }}
                disabled={!ensayoA || !ensayoB}
                onClick={guardarEnsayo}
              >
                💾 Crear ensayo (guardar en servidor)
              </button>
              <button style={S.botonGris} onClick={() => { setModoEnsayo(false); setCapturando(null); setMsj('Ensayo cancelado — nada se guardó.'); }}>Cancelar</button>
            </div>
          </div>
        )}

        {msj && <div style={S.aviso}>{msj}</div>}

        {/* 2 · AMARRE */}
        <div style={{ marginTop: 14, borderTop: '1px solid #33363f', paddingTop: 10 }}>
          <strong>Amarre modelo ↔ UTM</strong>
          {georef?.transform && (
            <div style={{ ...S.aviso, borderLeft: '3px solid #3ee87a' }}>
              Amarre vigente · residual {(georef.residual_m * 100).toFixed(1)} cm · escala {Number(georef.transform.escala).toFixed(4)}
              {Math.abs(georef.transform.escala - 0.3048) < 0.01 && ' (el modelo está en PIES — detectado)'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={pcElegido} onChange={(e) => setPcElegido(e.target.value)}
              style={{ background: '#252833', color: '#e8e8ee', border: '1px solid #33363f', borderRadius: 6, padding: '6px 8px' }}>
              <option value="">— punto de control —</option>
              {puntos.map((p) => <option key={p.punto_id} value={p.punto_id}>{p.punto_id}</option>)}
            </select>
            <button
              style={amarrando ? { ...S.boton, background: '#c94f4f' } : S.boton}
              disabled={!pcElegido}
              onClick={() => { setAmarrando((v) => !v); setMsj(amarrando ? '' : `Toca en el MODELO el sitio exacto del punto «${pcElegido}» (tapa de buzón, hito)…`); }}
            >
              {amarrando ? 'Cancelar clic' : 'Clic en el modelo'}
            </button>
          </div>

          {pares.length > 0 && (
            <table style={{ ...S.tabla, marginTop: 8 }}>
              <tbody>
                {pares.map((p) => (
                  <tr key={p.punto_id}>
                    <td style={{ ...S.celda, textAlign: 'left' }}>{p.punto_id}</td>
                    <td style={S.celda}>{p.utm[0].toFixed(2)} E</td>
                    <td style={S.celda}>{p.utm[1].toFixed(2)} N</td>
                    <td style={S.celda}>
                      {ajuste?.ok ? ((ajuste.residuales.find((r) => r.id === p.punto_id)?.m ?? 0) * 100).toFixed(1) + ' cm' : '—'}
                    </td>
                    <td style={S.celda}>
                      <button style={{ ...S.botonGris, padding: '2px 8px' }}
                        onClick={() => setPares((prev) => prev.filter((q) => q.punto_id !== p.punto_id))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {ajuste?.ok && (
            <div style={S.aviso}>
              Ajuste: residual <strong>{(ajuste.rms * 100).toFixed(1)} cm</strong> · giro {ajuste.yawDeg.toFixed(2)}° ·
              escala <strong>{ajuste.escala.toFixed(4)}</strong>
              {Math.abs(ajuste.escala - 0.3048) < 0.01 && ' ← PIES detectados'}
              {Math.abs(ajuste.escala - 1) < 0.01 && ' ← metros 1:1 ✓'}
              <div style={{ marginTop: 8 }}>
                <button style={S.boton} onClick={guardarAmarre}>Guardar amarre</button>
              </div>
            </div>
          )}
          {ajuste && !ajuste.ok && <div style={S.aviso}>⚠ {ajuste.error}</div>}
        </div>

        {/* 3 · LISTA */}
        {puntos.length > 0 && (
          <div style={{ marginTop: 14, borderTop: '1px solid #33363f', paddingTop: 10 }}>
            <strong>Red de puntos {georef?.transform ? '· toca uno para VOLAR a él 🟡' : '(amarra para verlos en el 3D)'}</strong>
            <table style={{ ...S.tabla, marginTop: 6 }}>
              <tbody>
                {puntos.slice(0, 60).map((p) => (
                  <tr key={p.punto_id} onClick={() => volarAPunto(p)} style={{ cursor: 'pointer' }}>
                    <td style={{ ...S.celda, textAlign: 'left', color: '#ffc83d' }}>{p.punto_id}</td>
                    <td style={S.celda}>{p.este.toFixed(2)}</td>
                    <td style={S.celda}>{p.norte.toFixed(2)}</td>
                    <td style={S.celda}>{p.cota != null ? p.cota.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {puntos.length > 60 && <div style={{ opacity: 0.6, marginTop: 4 }}>… y {puntos.length - 60} más</div>}
          </div>
        )}
      </div>
    </div>
  );
}
