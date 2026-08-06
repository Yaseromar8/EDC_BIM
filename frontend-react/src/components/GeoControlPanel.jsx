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

  // ── ENSAYO DE OFICINA ────────────────────────────────────────────────
  // Crea 3 puntos falsos (A/B/C, geometría de cinta métrica: B a 5.00 m al
  // este de A, C a 3.00 m al norte) y un amarre de PRUEBA calculado para que
  // el CENTRO del tramo50 del APK caiga en A con su cota de techo al piso.
  // Constantes ligadas a assets/ar/tramo50.geo.json (sidecar del GLB):
  //   svf→UTM: escala 0.3048 (pies), yaw 0, t = off_sidecar ∘ (A=1000,2000,100)
  // Es un KIT DE PRUEBA, no dato de proyecto: sobrescribe el amarre del
  // modelo abierto — úsalo en un modelo de ensayo o re-amarra después.
  const crearEnsayoOficina = async () => {
    if (!window.confirm('Esto crea los puntos ENSAYO-A/B/C y SOBRESCRIBE el amarre del modelo abierto con uno de prueba. ¿Continuar?')) return;
    const A = [1000, 2000, 100];
    const puntosEnsayo = [
      { punto_id: 'ENSAYO-A', este: A[0], norte: A[1], cota: A[2], descripcion: 'cruz de cinta — origen' },
      { punto_id: 'ENSAYO-B', este: A[0] + 5, norte: A[1], cota: A[2], descripcion: 'a 5.00 m de A (esa dirección será el Este)' },
      { punto_id: 'ENSAYO-C', este: A[0], norte: A[1] + 3, cota: A[2], descripcion: 'a 3.00 m de A, a la IZQUIERDA mirando a B' },
    ];
    // off del sidecar de tramo50.glb (precisión completa)
    const off = [0.392236523437532, -1.626842559814465, -0.24774301757810235];
    const transform = {
      escala: 0.3048, yawDeg: 0,
      tx: off[0] + A[0], ty: -off[2] + A[1], tz: off[1] + A[2],
    };
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
        body: JSON.stringify({ project: projectId, urn, crs: 'ENSAYO-OFICINA', pares: [], transform, residual_m: 0 }),
      });
      const d2 = await r2.json();
      if (!d2.ok) { setMsj('El servidor rechazó el amarre: ' + (d2.error || r2.status)); return; }
      const rr = await apiFetch(api(`/api/geo/control-points?project=${encodeURIComponent(projectId)}`));
      setPuntos((await rr.json()).puntos || []);
      setGeoref({ crs: 'ENSAYO-OFICINA', pares: [], transform, residual_m: 0 });
      setMsj('✅ Kit guardado EN EL SERVIDOR. Pega las cruces (B a 5.00 m de A; C a 3.00 m, a la izquierda mirando a B) y abre el AR en la tablet.');
    } catch (e) {
      setMsj('Sin conexión con el servidor: ' + String(e?.message || e));
    }
  };

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

  // ── capa de esferas sobre el modelo (con amarre: UTM → modelo) ───────
  useEffect(() => {
    const viewer = elViewer();
    const THREE = typeof window !== 'undefined' ? window.THREE : null;
    if (!viewer || !THREE || !georef?.transform || !puntos.length) return undefined;
    const t = georef.transform;
    const RAD = Math.PI / 180;
    const cos = Math.cos(t.yawDeg * RAD), sin = Math.sin(t.yawDeg * RAD);
    // inversa del Helmert: UTM → modelo
    const aModelo = (E, N, Z) => {
      const x = E - t.tx, y = N - t.ty;
      return [
        (cos * x + sin * y) / t.escala,
        (-sin * x + cos * y) / t.escala,
        (Z - t.tz) / t.escala,
      ];
    };
    const nombre = overlayRef.current.nombre;
    try { viewer.impl.createOverlayScene(nombre); } catch { /* ya existe */ }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc83d });
    const objetos = [];
    for (const p of puntos) {
      const [x, y, z] = aModelo(p.este, p.norte, p.cota ?? 0);
      const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), mat);
      esfera.position.set(x, y, z);
      viewer.impl.addOverlay(nombre, esfera);
      objetos.push(esfera);
    }
    viewer.impl.invalidate(false, false, true);
    overlayRef.current.instalado = true;
    return () => {
      try { objetos.forEach((o) => viewer.impl.removeOverlay(nombre, o)); viewer.impl.invalidate(false, false, true); } catch { /* visor cerrado */ }
    };
  }, [georef, puntos]);

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
        <div style={{ marginTop: 8 }}>
          <button style={S.botonGris} onClick={crearEnsayoOficina}>🧪 Ensayo de oficina (3 cruces de cinta)</button>
        </div>

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
            <strong>Red de puntos {georef?.transform ? '· dibujada sobre el modelo 🟡' : '(amarra para verlos en el 3D)'}</strong>
            <table style={{ ...S.tabla, marginTop: 6 }}>
              <tbody>
                {puntos.slice(0, 60).map((p) => (
                  <tr key={p.punto_id}>
                    <td style={{ ...S.celda, textAlign: 'left' }}>{p.punto_id}</td>
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
