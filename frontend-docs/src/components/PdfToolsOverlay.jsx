// PdfToolsOverlay.jsx — Capa de ingeniería sobre PDF.js
// Mediciones (distancia/área/conteo), anotaciones (nube, flecha, rect, lápiz, texto)
// y calibración de escala. Geometrías en coordenadas PDF (independientes del zoom).
import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { PanelDeMarca, DialogoDeSello } from './MarcaConEnlace';
import { estadoDeObservacion, observacionViva } from '../utils/marcasConEnlace';
import { estadoDeSello, marcaDeLaDireccion, fechaCorta } from '../utils/marcasConEnlace';

// El sello mide lo mismo EN LA HOJA (puntos PDF), como un sello de goma: al alejar el plano se hace pequeño
// con él. 150 × 62 pt ≈ 53 × 22 mm de papel.
const SELLO_ANCHO = 150, SELLO_ALTO = 62;
// El marcador de foto mide lo mismo EN PANTALLA (px), como el conteo: se ve igual a cualquier zoom.
const FOTO_R = 13, FOTO_ABANICO = 36, FOTO_APERTURA = 50;

// Colores de marca de la paleta oficial (D-24, lista cerrada; docs/ux/ESTUCHE_COMPACTO.md): error, naranja 30D,
// aviso, azul 30D, verde 20D y Dark. Las marcas ya guardadas conservan el color con que se dibujaron.
const COLORS = ['#b93535', '#9e5943', '#734500', '#507294', '#64744e', '#141413'];

function dist2d(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function polyLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist2d(pts[i - 1], pts[i]); return s; }
function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}
function fmt(n) { return n >= 100 ? n.toFixed(1) : n.toFixed(2); }

// La escala como la dice un ingeniero: «≈ 1:500». Un punto PDF es 1/72 de pulgada (0,3528 mm de papel).
const A_METROS = { m: 1, cm: 0.01, km: 1000, ft: 0.3048 };
function escalaLegible(unidadesPorPunto, unidad) {
  const metros = unidadesPorPunto * (A_METROS[unidad] || 1);
  const n = metros / 0.000352778;
  if (!Number.isFinite(n) || n < 1) return '';
  const redondo = n >= 1000 ? Math.round(n / 50) * 50 : n >= 100 ? Math.round(n / 5) * 5 : Math.round(n);
  return `≈ 1:${redondo.toLocaleString('es-PE')}`;
}

// Path de nube de revisión: arcos festoneados sobre el perímetro de un rect
function cloudPath(x, y, w, h) {
  const r = Math.max(6, Math.min(14, Math.min(Math.abs(w), Math.abs(h)) / 6));
  const seg = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / (r * 1.6)));
    let d = '';
    for (let i = 0; i < n; i++) {
      const t2 = (i + 1) / n;
      d += ` A ${r} ${r} 0 0 1 ${x1 + (x2 - x1) * t2} ${y1 + (y2 - y1) * t2}`;
    }
    return d;
  };
  const x2 = x + w, y2 = y + h;
  return `M ${x} ${y}` + seg(x, y, x2, y) + seg(x2, y, x2, y2) + seg(x2, y2, x, y2) + seg(x, y2, x, y) + ' Z';
}

// EDITAR LA FIGURA (29-oct-2026, como la revisión de CAD): la marca entera se arrastra y sus tiradores cambian su
// tamaño o mueven un vértice. Todo en coordenadas del PDF, que es como se guarda.
function trasladar(g, dx, dy) {
  const mv = (p) => [p[0] + dx, p[1] + dy];
  if (g.w != null) return { ...g, x: g.x + dx, y: g.y + dy };
  if (g.p1) return { ...g, p1: mv(g.p1), p2: mv(g.p2) };
  if (g.points) return { ...g, points: g.points.map(mv) };
  if (g.p) return { ...g, p: mv(g.p) };
  return g;
}
// Las esquinas de una caja, en orden, para que la opuesta de la i sea la (i + 2) % 4.
const esquinasDe = (g) => [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]];
function tiradoresDe(kind, g) {
  if (g.w != null) return esquinasDe(g);
  if (g.p1) return [g.p1, g.p2];
  if (g.points && kind !== 'pen') return g.points;
  return [];
}
function conTirador(g, i, p) {
  if (g.w != null) {
    const o = esquinasDe(g)[(i + 2) % 4];
    return { ...g, x: Math.min(o[0], p[0]), y: Math.min(o[1], p[1]), w: Math.abs(p[0] - o[0]), h: Math.abs(p[1] - o[1]) };
  }
  if (g.p1) return i === 0 ? { ...g, p1: p } : { ...g, p2: p };
  if (g.points) return { ...g, points: g.points.map((q, j) => (j === i ? p : q)) };
  return g;
}

export default function PdfToolsOverlay({ vpInfo, page, nodeId, projectPrefix, tool, setTool, color, userName,
                                         versionDeLasMarcas = null, versionVigente = null, onIrAVersion = null }) {
  const [markups, setMarkups] = useState([]);          // todos los del documento
  const [calibrations, setCalibrations] = useState({}); // { page: {units_per_pdf, display_unit} }
  const [draft, setDraft] = useState(null);            // figura en construcción
  const [textDraft, setTextDraft] = useState(null);    // { px, py } posición de input de texto
  const [calibAsk, setCalibAsk] = useState(null);      // { p1, p2 } pidiendo distancia real
  const [recalibrar, setRecalibrar] = useState(false);  // «Cambiar» la escala ya fijada
  const [elegida, setElegida] = useState(null);         // id de la marca abierta en su panel
  const [selloEn, setSelloEn] = useState(null);         // { p } donde se colocará un sello
  const [enOtras, setEnOtras] = useState([]);           // [{ version_id, version_number, marcas }]
  // LAS MARCAS SON DE LA VERSIÓN QUE SE MIRA (migración 36). Sin versión (enlace compartido, banco viejo),
  // como antes: todas las del documento.
  const versionId = versionDeLasMarcas?.id || null;
  const vigenteId = versionVigente?.id || null;
  const enVigente = !versionId || !vigenteId || String(versionId) === String(vigenteId);
  const marcaPedida = useRef(marcaDeLaDireccion(window.location.search).marca);
  const svgRef = useRef(null);
  const draftRef = useRef(null);
  draftRef.current = draft;
  // La marca que se está moviendo o redimensionando: { id, indice (tirador, o null = mover), desde, geo0, geo }.
  const [arrastre, setArrastre] = useState(null);

  const vp = vpInfo?.vp;
  const cal = calibrations[String(page)];
  // LA ESCALA VA DENTRO DE MEDIR Y ÁREA: sin escala en esta página (o al pedir «Cambiar»), los dos primeros
  // clics fijan la escala y después se mide en metros. No hay un botón «Escala» aparte.
  const midiendo = tool === 'measure' || tool === 'area';
  const faltaEscala = midiendo && (!cal || recalibrar);

  // ── Cargar markups + calibraciones del documento ──
  useEffect(() => {
    if (!nodeId) return undefined;
    setElegida(null);   // otro documento: el panel de una marca del anterior no sigue abierto
    // Saltar a otro documento mientras estas dos respuestas viajaban pintaba
    // las marcas -y la escala- del documento ANTERIOR encima del que estas
    // mirando. Una redlinea sobre el plano equivocado no es una demora, es un
    // error: el pestillo descarta lo que llega cuando ya no es de este nodo.
    let vigente = true;
    setEnOtras([]);
    const deVersion = versionId ? `&version_id=${encodeURIComponent(versionId)}` : '';
    apiFetch(`${API}/api/pdf/markups?node_id=${nodeId}${deVersion}`).then(r => r.json())
      // Una respuesta «success» sin lista no puede dejar `markups` en undefined:
      // el render hace `markups.filter` y la página entera se quedaba en blanco.
      .then(d => {
        if (!vigente || !d.success) return;
        const lista = Array.isArray(d.markups) ? d.markups : [];
        setMarkups(lista);
        setEnOtras(Array.isArray(d.en_otras_versiones) ? d.en_otras_versiones : []);
        // Llegada desde «Citado en»: la marca pedida se abre en su panel (PDFViewer ya fue a su página).
        const pedida = marcaPedida.current;
        if (pedida && lista.some(m => String(m.id) === String(pedida))) setElegida(Number(pedida) || pedida);
        marcaPedida.current = null;
      }).catch(() => {});
    apiFetch(`${API}/api/pdf/calibration?node_id=${nodeId}`).then(r => r.json())
      .then(d => { if (vigente && d.success) setCalibrations(d.calibrations || {}); }).catch(() => {});
    return () => { vigente = false; };
  }, [nodeId, versionId]);

  // ── Transformaciones ──
  const toPdf = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    // La capa se ve al tamaño de la hoja, que durante el zoom va por delante del
    // ultimo dibujado nitido (ver el `viewBox` de abajo): el clic se lleva en
    // proporcion a las coordenadas de ese dibujado. Con la hoja quieta la
    // proporcion es 1, y esto da lo mismo que antes.
    const kx = rect.width ? vpInfo.w / rect.width : 1;
    const ky = rect.height ? vpInfo.h / rect.height : 1;
    return vp.convertToPdfPoint((e.clientX - rect.left) * kx, (e.clientY - rect.top) * ky);
  }, [vp, vpInfo]);
  const toScr = useCallback((p) => vp.convertToViewportPoint(p[0], p[1]), [vp]);

  // ── Persistencia ──
  // Devuelve el id guardado (o null), para abrir enseguida el panel de una foto o un sello recién puestos.
  const saveMarkup = async (kind, geometry, text = null, extra = {}) => {
    const style = { color, ...extra };
    const local = { id: `tmp_${Date.now()}`, page, kind, geometry, style, text, created_by: userName,
                    created_at: new Date().toISOString(), publicado: false, citas: [], fotos: [], _unsaved: true,
                    version_id: versionId, version_number: versionDeLasMarcas?.version_number ?? null };
    setMarkups(prev => [...prev, local]);
    try {
      const r = await apiFetch(`${API}/api/pdf/markups`, {
        method: 'POST',
        body: JSON.stringify({ node_id: nodeId, model_urn: projectPrefix, page, kind, geometry, style, text, user: userName,
                               version_id: versionId })
      });
      if (r.status === 404) throw new Error('endpoint-404');
      const d = await r.json();
      if (d.success) { setMarkups(prev => prev.map(m => m.id === local.id ? { ...m, id: d.id, _unsaved: false } : m)); return d.id; }
      throw new Error(d.error || 'fallo');
    } catch (e) {
      // No borramos la anotación: el usuario no pierde su trabajo en la sesión.
      // Queda marcada como no-guardada (no sobrevive a recargar hasta que el
      // backend responda). Mensaje accionable según el tipo de fallo.
      if (String(e.message).includes('404')) {
        toast.error('Backend desactualizado: reinícialo para guardar anotaciones.', { duration: 5000 });
      } else {
        toast.error('No se pudo guardar la anotación (revisa el backend).');
      }
    }
  };

  const deleteMarkup = async (m) => {
    setMarkups(prev => prev.filter(x => x.id !== m.id));
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${m.id}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error); }
    } catch (e) {
      toast.error(e.message || 'No se pudo eliminar');
      setMarkups(prev => [...prev, m]);
    }
  };

  // SUPR BORRA LA MARCA ELEGIDA (29-oct-2026, estuche compacto): «Borrar marca» ya no es una herramienta del
  // estuche. Como en el panel, solo su autor la borra; con una observación viva el servidor la rechaza (409).
  useEffect(() => {
    if (elegida == null) return undefined;
    const alTeclear = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const m = markups.find(x => x.id === elegida);
      if (!m || String(m.id).startsWith('tmp_') || !userName || m.created_by !== userName) return;
      e.preventDefault();
      setElegida(null);
      deleteMarkup(m);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [elegida, markups, userName]);

  // Publicar o retirar: un acto de su autor (GAP 02). Desde el panel de la marca.
  const publicarMarkup = async (m) => {
    const quiere = !m.publicado;
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${m.id}/publicar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicado: quiere }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo publicar.');
      setMarkups(prev => prev.map(x => x.id === m.id ? { ...x, publicado: d.publicado } : x));
      toast.success(d.publicado ? 'Publicada: la ve toda la obra' : 'Retirada: vuelve a ser solo tuya');
    } catch (e) { toast.error(e.message); }
  };

  // «Llevar a la vigente»: copia la marca (borrador, de quien la lleva) en la versión vigente y va allí a verla.
  const llevarMarca = async (m) => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${m.id}/llevar`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo llevar la marca.');
      toast.success(`Copiada a la V${versionVigente?.version_number ?? ''} como borrador. La de la V${m.version_number ?? d.desde_version} no cambia.`);
      setElegida(null);
      if (onIrAVersion && vigenteId) { marcaPedida.current = d.id; onIrAVersion(vigenteId); }
    } catch (e) { toast.error(e.message); }
  };

  const colocarSello = async (sello) => {
    const p = selloEn?.p;
    setSelloEn(null);
    if (!p) return;
    const id = await saveMarkup('sello', { p }, null, { sello });
    setTool('pan');
    if (id) setElegida(id);
  };

  // ── Editar la figura ──
  // Solo su autor, y solo mientras es su borrador sin observación abierta: es la regla del servidor (PATCH).
  const editable = (m) => !!m && !String(m.id).startsWith('tmp_') && !!userName && m.created_by === userName
    && !m.publicado && !observacionViva(m.observacion);
  const toPdfRef = useRef(toPdf);
  toPdfRef.current = toPdf;
  // Los escuchadores se ponen EN el mismo pointerdown, no en un efecto: un arrastre rápido soltaba el botón antes
  // del siguiente fotograma y la marca se quedaba sin mover (medido en el banco, 29-oct-2026).
  const soltarArrastre = useRef(null);
  useEffect(() => () => soltarArrastre.current?.(), []);
  const guardarArrastre = (a) => {
    if (!a.movido) return;
    if (a.geo.w != null && (a.geo.w < 2 || a.geo.h < 2)) return;   // una caja aplastada no se guarda
    setMarkups(prev => prev.map(x => (x.id === a.id ? { ...x, geometry: a.geo } : x)));
    apiFetch(`${API}/api/pdf/markups/${a.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometria: a.geo }),
    }).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok || !d.success) throw new Error(d.error || 'No se pudo mover la marca.');
      setMarkups(prev => prev.map(x => (x.id === a.id ? { ...x, geometry: d.markup.geometry } : x)));
    }).catch(err => {
      setMarkups(prev => prev.map(x => (x.id === a.id ? { ...x, geometry: a.geo0 } : x)));
      toast.error(err.message || 'No se pudo mover la marca.');
    });
  };
  const empezarArrastre = (m, indice = null) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();      // y así tampoco llega el mousedown que arrastraría la hoja
    e.stopPropagation();
    setElegida(m.id);
    soltarArrastre.current?.();
    let a = { id: m.id, indice, desde: toPdf(e), cx: e.clientX, cy: e.clientY, movido: false, geo0: m.geometry, geo: m.geometry };
    setArrastre(a);
    const alMover = (ev) => {
      const movido = a.movido || Math.hypot(ev.clientX - a.cx, ev.clientY - a.cy) > 3;
      if (!movido) return;
      const p = toPdfRef.current(ev);
      const geo = a.indice == null
        ? trasladar(a.geo0, p[0] - a.desde[0], p[1] - a.desde[1])
        : conTirador(a.geo0, a.indice, p);
      a = { ...a, movido, geo };
      setArrastre(a);
    };
    const quitar = () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      soltarArrastre.current = null;
    };
    const alSoltar = (ev) => {
      alMover(ev);
      quitar();
      setArrastre(null);
      guardarArrastre(a);
    };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    soltarArrastre.current = () => { quitar(); setArrastre(null); };
  };

  // ── Interacción de dibujo ──
  const onPointerDown = (e) => {
    if (tool === 'pan' || !vp) return;
    e.preventDefault(); e.stopPropagation();
    const p = toPdf(e);

    if (tool === 'count') { saveMarkup('count', { p }); return; }
    // Foto: el marcador se pone y se abre su panel para subir o elegir las fotos.
    if (tool === 'photo') {
      setTool('pan');
      saveMarkup('foto', { p, ang: 0 }).then(id => { if (id) setElegida(id); });
      return;
    }
    if (tool === 'stamp') { setSelloEn({ p }); return; }
    if (tool === 'text') { setTextDraft({ p }); return; }
    if (tool === 'measure' || tool === 'area' || tool === 'calibrate') {
      const modo = faltaEscala ? 'calibrate' : tool;
      setDraft(prev => {
        const pts = prev?.kind === modo && prev?.points ? [...prev.points, p] : [p];
        if (modo === 'calibrate' && pts.length === 2) { setCalibAsk({ p1: pts[0], p2: pts[1] }); return null; }
        return { kind: modo, points: pts, cursor: p };
      });
      return;
    }
    // Figuras: nube, rectángulo y flecha DE DOS CLICS, como en ACC (29-oct-2026): el primero fija una esquina
    // (o el origen) y el segundo crea la figura. Arrastrar de una vez también vale. El lápiz, solo arrastrando.
    const d = draftRef.current;
    if (d && d.esperando && d.kind === tool) {
      setDraft(null);
      guardarFigura(d.kind, d.start, p);
      return;
    }
    if (['cloud', 'rect', 'arrow', 'pen'].includes(tool)) {
      setDraft({ kind: tool, start: p, end: p, points: [p], dragging: true });
    }
  };

  const guardarFigura = (kind, start, end) => {
    if (dist2d(start, end) < 2) return; // los dos clics en el mismo sitio
    if (kind === 'arrow') saveMarkup('arrow', { p1: start, p2: end });
    else saveMarkup(kind, { x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]), w: Math.abs(end[0] - start[0]), h: Math.abs(end[1] - start[1]) });
  };

  const onPointerMove = (e) => {
    const d = draftRef.current;
    if (!d || !vp) return;
    const p = toPdf(e);
    if (d.dragging) {
      setDraft(prev => prev && ({ ...prev, end: p, points: prev.kind === 'pen' ? [...prev.points, p] : prev.points }));
    } else if (d.points) {
      setDraft(prev => prev && ({ ...prev, cursor: p }));
    }
  };

  const onPointerUp = () => {
    const d = draftRef.current;
    if (!d || !d.dragging || d.esperando) return;
    const { kind, start, end, points } = d;
    if (kind === 'pen') { setDraft(null); if (points.length > 2) saveMarkup('pen', { points }); return; }
    // Un clic sin arrastrar: la figura espera el segundo clic y sigue al cursor hasta entonces.
    if (dist2d(start, end) < 2) { setDraft({ ...d, esperando: true }); return; }
    setDraft(null);
    guardarFigura(kind, start, end);
  };

  const onDoubleClick = (e) => {
    const d = draftRef.current;
    if (!d || !d.points || d.points.length < 2) return;
    e.preventDefault(); e.stopPropagation();
    const pts = d.points;
    setDraft(null);
    if (d.kind === 'measure' && pts.length >= 2) saveMarkup('measure', { points: pts });
    if (d.kind === 'area' && pts.length >= 3) saveMarkup('area', { points: pts });
  };

  // Esc cancela el dibujo en curso y DESACTIVA la herramienta, como en ACC (29-oct-2026): hasta entonces la
  // herramienta sigue puesta para dibujar otra.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setDraft(null); setTextDraft(null); setCalibAsk(null); setSelloEn(null);
      setTool('pan');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

  // ── Etiquetas con escala ──
  const lenLabel = (pts) => {
    const u = polyLength(pts);
    return cal ? `${fmt(u * cal.units_per_pdf)} ${cal.display_unit}` : `${fmt(u)} pt (sin escala)`;
  };
  const areaLabel = (pts) => {
    const a = polyArea(pts);
    return cal ? `${fmt(a * cal.units_per_pdf * cal.units_per_pdf)} ${cal.display_unit}²` : `${fmt(a)} pt² (sin escala)`;
  };

  if (!vp) return null;
  // La marca que se arrastra se dibuja donde va, antes de guardarla.
  const pageMarkups = markups.filter(m => m.page === page)
    .map(m => (arrastre && arrastre.id === m.id ? { ...m, geometry: arrastre.geo } : m));
  const countTotal = pageMarkups.filter(m => m.kind === 'count').length;

  // ── Render de un markup ──
  // En «Mover» un clic en una marca la ELIGE (su panel: referencias, fotos, publicar, borrar); en «Borrar
  // marca» la borra; con cualquier otra herramienta las marcas no se tocan, para poder dibujar encima.
  const tocable = tool === 'erase' || tool === 'pan';
  const alTocar = (m) => (e) => {
    e.stopPropagation();
    if (tool === 'erase') deleteMarkup(m);
    else if (tool === 'pan' && !String(m.id).startsWith('tmp_')) setElegida(m.id);
  };
  // La caja del sello en pantalla: esquina en el clic, tamaño fijo en puntos de hoja × escala del dibujado.
  const cajaDelSello = (p) => {
    const s = toScr(p);
    const k = vp?.scale || 1;
    return { x: s[0], y: s[1], w: SELLO_ANCHO * k, h: SELLO_ALTO * k };
  };
  // La caja en pantalla de una marca: para el halo de la elegida y el distintivo de referencias.
  const cajaDe = (m) => {
    const g = m.geometry || {};
    let pts = [];
    if (g.points) pts = g.points.map(toScr);
    else if (g.p1) pts = [toScr(g.p1), toScr(g.p2)];
    else if (m.kind === 'sello' && g.p) { const c = cajaDelSello(g.p); pts = [[c.x, c.y], [c.x + c.w, c.y + c.h]]; }
    else if (g.w != null) pts = [toScr([g.x, g.y]), toScr([g.x + g.w, g.y + g.h])];
    else if (g.p) { const s = toScr(g.p); const r = m.kind === 'foto' ? FOTO_R + 3 : 10; pts = [[s[0] - r, s[1] - r], [s[0] + r, s[1] + r]]; }
    if (!pts.length) return null;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  };

  const renderMarkup = (m, i) => {
    const c = m.style?.color || '#e53935';
    // Con Seleccionar, una marca tuya en borrador se arrastra entera (y se elige); las demás solo se eligen.
    const arrastrable = tool === 'pan' && editable(m);
    const common = {
      stroke: c, fill: 'none', strokeWidth: 2,
      style: { cursor: tool === 'erase' ? 'not-allowed' : arrastrable ? 'move' : tool === 'pan' ? 'pointer' : 'default', pointerEvents: tocable ? 'all' : 'none' },
      onClick: tocable ? alTocar(m) : undefined,
      onPointerDown: arrastrable ? empezarArrastre(m) : undefined,
    };
    const g = m.geometry || {};
    if (m.kind === 'foto' && g.p) {
      // El marcador de cámara y, delante, el abanico de lo que se fotografió (0° = arriba en la hoja).
      const s = toScr(g.p);
      const a = ((Number(g.ang) || 0) - 90) * Math.PI / 180;
      const h = FOTO_APERTURA / 2 * Math.PI / 180;
      const R = FOTO_ABANICO + FOTO_R;
      const p1 = [s[0] + R * Math.cos(a - h), s[1] + R * Math.sin(a - h)];
      const p2 = [s[0] + R * Math.cos(a + h), s[1] + R * Math.sin(a + h)];
      const n = (m.fotos || []).length;
      return (
        <g key={m.id} style={common.style} onClick={common.onClick} onPointerDown={common.onPointerDown}>
          <path d={`M ${s[0]} ${s[1]} L ${p1[0]} ${p1[1]} A ${R} ${R} 0 0 1 ${p2[0]} ${p2[1]} Z`} fill={c} fillOpacity="0.14" stroke={c} strokeOpacity="0.5" strokeWidth="1" />
          <circle cx={s[0]} cy={s[1]} r={FOTO_R} fill="#fff" stroke={c} strokeWidth="2" />
          <g transform={`translate(${s[0] - 8} ${s[1] - 8}) scale(0.6667)`} fill="none" stroke={c} strokeWidth="2.2" strokeLinejoin="round">
            <path d="M3 7.5h3.2l1.7-2.3h8.2l1.7 2.3H21v11H3z" /><circle cx="12" cy="13" r="3.3" />
          </g>
          {n > 0 && (
            <g>
              <circle cx={s[0] + FOTO_R - 1} cy={s[1] - FOTO_R + 1} r="7.5" fill={c} stroke="#fff" strokeWidth="1.5" />
              <text x={s[0] + FOTO_R - 1} y={s[1] - FOTO_R + 4.5} fontSize="9.5" fontWeight="700" fill="#fff" textAnchor="middle" style={{ pointerEvents: 'none' }}>{n}</text>
            </g>
          )}
        </g>
      );
    }
    if (m.kind === 'sello' && g.p) {
      // Como un sello de goma, a escala de la hoja. El color dice el estado.
      const sel = m.style?.sello || {};
      const est = estadoDeSello(sel.estado);
      // EN EJES DE PANTALLA, no del PDF: en una lámina que el PDF trae girada (/Rotate 90) los ejes del PDF
      // van cruzados y el sello salía alto y estrecho, con el texto fuera (16-oct-2026, plano 004126).
      // Se ancla en el punto del clic y mide SELLO_ANCHO × SELLO_ALTO puntos a la escala de la hoja.
      const { x, y, w, h: hh } = cajaDelSello(g.p);
      const k = hh / SELLO_ALTO;   // tamaños de letra proporcionales a la caja
      const cx = x + w / 2;
      const pie = [m.created_by, fechaCorta(m.created_at)].filter(Boolean).join(' · ');
      return (
        <g key={m.id} style={common.style} onClick={common.onClick} onPointerDown={common.onPointerDown} fontFamily="'IBM Plex Sans', system-ui, sans-serif">
          <rect x={x} y={y} width={w} height={hh} rx={2 * k} fill="#fff" fillOpacity="0.9" stroke={est.color} strokeWidth={Math.max(1.2, 2 * k)} />
          <rect x={x + 3 * k} y={y + 3 * k} width={w - 6 * k} height={hh - 6 * k} rx={1.5 * k} fill="none" stroke={est.color} strokeWidth={Math.max(0.6, 0.8 * k)} />
          <text x={cx} y={y + 13 * k} fontSize={6.6 * k} fontWeight="600" letterSpacing={1.2 * k} fill={est.color} textAnchor="middle" style={{ pointerEvents: 'none' }}>SELLO DE REVISIÓN</text>
          <text x={cx} y={y + (sel.titulo ? 28 : 33) * k} fontSize={12.5 * k} fontWeight="700" fill={est.color} textAnchor="middle" style={{ pointerEvents: 'none' }}>{est.etiqueta}</text>
          {sel.titulo && <text x={cx} y={y + 40 * k} fontSize={8 * k} fill="#333330" textAnchor="middle" style={{ pointerEvents: 'none' }}>{sel.titulo.length > 34 ? `${sel.titulo.slice(0, 33)}…` : sel.titulo}</text>}
          <line x1={x + 10 * k} x2={x + w - 10 * k} y1={y + 46 * k} y2={y + 46 * k} stroke={est.color} strokeWidth={Math.max(0.5, 0.6 * k)} />
          <text x={cx} y={y + 55 * k} fontSize={6.8 * k} fill="#52524d" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" style={{ pointerEvents: 'none' }}>{pie}</text>
        </g>
      );
    }
    if (m.kind === 'measure' || m.kind === 'area' || m.kind === 'pen') {
      const pts = (g.points || []).map(toScr);
      if (pts.length < 2) return null;
      const mid = pts[Math.floor(pts.length / 2)];
      return (
        <g key={m.id}>
          {m.kind === 'area'
            ? <polygon points={pts.map(p => p.join(',')).join(' ')} {...common} fill={c + '22'} />
            : <polyline points={pts.map(p => p.join(',')).join(' ')} {...common} />}
          {m.kind !== 'pen' && (
            <text x={mid[0] + 6} y={mid[1] - 6} fontSize="13" fontWeight="700" fill={c} stroke="#fff" strokeWidth="3" paintOrder="stroke" style={{ pointerEvents: 'none' }}>
              {m.kind === 'measure' ? lenLabel(g.points) : areaLabel(g.points)}
            </text>
          )}
        </g>
      );
    }
    if (m.kind === 'count') {
      const s = toScr(g.p);
      const idx = pageMarkups.filter(x => x.kind === 'count').indexOf(m) + 1;
      return (
        <g key={m.id} style={common.style} onClick={common.onClick} onPointerDown={common.onPointerDown}>
          <circle cx={s[0]} cy={s[1]} r="10" fill={c} stroke="#fff" strokeWidth="2" pointerEvents={tocable ? 'all' : 'none'} />
          <text x={s[0]} y={s[1] + 4} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle" style={{ pointerEvents: 'none' }}>{idx}</text>
        </g>
      );
    }
    if (m.kind === 'arrow') {
      const a = toScr(g.p1), b = toScr(g.p2);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h = 12;
      return (
        <g key={m.id}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} strokeWidth={2.5} />
          <polygon points={`${b[0]},${b[1]} ${b[0] - h * Math.cos(ang - 0.45)},${b[1] - h * Math.sin(ang - 0.45)} ${b[0] - h * Math.cos(ang + 0.45)},${b[1] - h * Math.sin(ang + 0.45)}`}
            fill={c} style={common.style} onClick={common.onClick} onPointerDown={common.onPointerDown} pointerEvents={tocable ? 'all' : 'none'} />
        </g>
      );
    }
    if (m.kind === 'rect' || m.kind === 'cloud') {
      const a = toScr([g.x, g.y]), b = toScr([g.x + g.w, g.y + g.h]);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      return m.kind === 'cloud'
        ? <path key={m.id} d={cloudPath(x, y, w, h)} {...common} strokeWidth={2.2} />
        : <rect key={m.id} x={x} y={y} width={w} height={h} {...common} />;
    }
    if (m.kind === 'text') {
      const s = toScr(g.p);
      return (
        <text key={m.id} x={s[0]} y={s[1]} fontSize="14" fontWeight="600" fill={c} stroke="#fff" strokeWidth="3" paintOrder="stroke"
          style={common.style} pointerEvents={tocable ? 'all' : 'none'}
          onClick={common.onClick} onPointerDown={common.onPointerDown}>
          {m.text}
        </text>
      );
    }
    return null;
  };

  // Los tiradores de la marca elegida, si es tuya y se puede cambiar: esquinas de una caja, extremos de una
  // flecha y vértices de una medición o un área.
  const renderTiradores = () => {
    if (tool !== 'pan') return null;
    const m = pageMarkups.find(x => x.id === elegida);
    if (!editable(m)) return null;
    return tiradoresDe(m.kind, m.geometry || {}).map((q, i) => {
      const s = toScr(q);
      const caja = m.geometry.w != null;
      return (
        <rect key={`tir-${i}`} x={s[0] - 4.5} y={s[1] - 4.5} width="9" height="9" rx="1.5"
          fill="#fff" stroke="#507294" strokeWidth="1.5"
          style={{ pointerEvents: 'all', cursor: caja ? (i % 2 === 0 ? 'nesw-resize' : 'nwse-resize') : 'move' }}
          onPointerDown={empezarArrastre(m, i)} onClick={e => e.stopPropagation()} />
      );
    });
  };

  // ── Borrador en curso ──
  const renderDraft = () => {
    if (!draft) return null;
    if (draft.points && (draft.kind === 'measure' || draft.kind === 'area' || draft.kind === 'calibrate')) {
      const all = draft.cursor ? [...draft.points, draft.cursor] : draft.points;
      const pts = all.map(toScr);
      return (
        <g>
          <polyline points={pts.map(p => p.join(',')).join(' ')} stroke={color} strokeWidth="2" strokeDasharray="6 4" fill={draft.kind === 'area' ? color + '18' : 'none'} />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={color} />)}
          {draft.kind !== 'calibrate' && all.length >= 2 && (
            <text x={pts[pts.length - 1][0] + 8} y={pts[pts.length - 1][1] - 8} fontSize="13" fontWeight="700" fill={color} stroke="#fff" strokeWidth="3" paintOrder="stroke">
              {draft.kind === 'area' ? areaLabel(all) : lenLabel(all)}
            </text>
          )}
        </g>
      );
    }
    if (draft.dragging) {
      const { kind, start, end, points } = draft;
      if (kind === 'pen') return <polyline points={points.map(toScr).map(p => p.join(',')).join(' ')} stroke={color} strokeWidth="2" fill="none" />;
      if (kind === 'arrow') { const a = toScr(start), b = toScr(end); return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth="2.5" strokeDasharray="6 4" />; }
      const a = toScr(start), b = toScr(end);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      return kind === 'cloud'
        ? <path d={cloudPath(x, y, w, h)} stroke={color} strokeWidth="2" fill="none" strokeDasharray="6 4" />
        : <rect x={x} y={y} width={w} height={h} stroke={color} strokeWidth="2" fill="none" strokeDasharray="6 4" />;
    }
    return null;
  };

  const confirmCalibration = async (meters, unit) => {
    const pdfDist = dist2d(calibAsk.p1, calibAsk.p2);
    if (!pdfDist || !meters) return;
    const upp = meters / pdfDist;
    setCalibrations(prev => ({ ...prev, [String(page)]: { units_per_pdf: upp, display_unit: unit } }));
    setCalibAsk(null);
    setRecalibrar(false);
    // Se vuelve a lo que se estaba haciendo (Medir o Área), ya con la escala.
    if (!midiendo) setTool('measure');
    try {
      await apiFetch(`${API}/api/pdf/calibration`, {
        method: 'PUT',
        body: JSON.stringify({ node_id: nodeId, page, units_per_pdf: upp, display_unit: unit })
      });
      toast.success(`Escala fijada${escalaLegible(upp, unit) ? `: ${escalaLegible(upp, unit)}` : ''}. Ya puedes medir.`);
    } catch (e) { toast.error('No se pudo guardar la calibración'); }
  };

  // El halo de la marca elegida y el distintivo de las que citan documentos (con su número).
  const renderEnlaces = () => pageMarkups.map(m => {
    const n = (m.citas || []).length;
    const esElegida = m.id === elegida;
    const obs = m.observacion;
    if (!n && !esElegida && !obs) return null;
    const k = cajaDe(m);
    if (!k) return null;
    const ancho = n > 9 ? 34 : 28;
    const alto = 16;
    const enBordeSup = k.y < alto + 6;
    const sinSitioDer = k.x2 + ancho + 4 > vpInfo.w;
    const bx = Math.max(4, Math.min(
      enBordeSup || sinSitioDer ? k.x2 - ancho - 4 : k.x2 + 2,
      vpInfo.w - ancho - 4,
    ));
    const by = enBordeSup ? Math.max(4, k.y + 4) : k.y - alto - 2;
    const hx = Math.max(2, k.x - 6);
    const hy = Math.max(2, k.y - 6);
    const hw = Math.min(vpInfo.w - 2, k.x2 + 6) - hx;
    const hh = Math.min(vpInfo.h - 2, k.y2 + 6) - hy;
    return (
      <g key={`enl-${m.id}`}>
        {esElegida && <rect x={hx} y={hy} width={Math.max(0, hw)} height={Math.max(0, hh)} rx="4"
          fill="none" stroke="#6a9bcc" strokeWidth="1.5" strokeDasharray="5 3" style={{ pointerEvents: 'none' }} />}
        {n > 0 && (
          <g transform={`translate(${bx} ${by})`}
            style={{ pointerEvents: tocable ? 'all' : 'none', cursor: tool === 'erase' ? 'not-allowed' : tool === 'pan' ? 'pointer' : 'default' }}
            onClick={tocable ? alTocar(m) : undefined}>
            <rect width={ancho} height={alto} rx="8" fill="#fff" stroke="#507294" strokeWidth="1" />
            <g transform="translate(4 2.5) scale(0.46)" fill="none" stroke="#507294" strokeWidth="2.6" strokeLinecap="round">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </g>
            <text x="18" y="11.6" fontSize="10" fontWeight="600" fill="#507294" fontFamily="'IBM Plex Mono', monospace" style={{ pointerEvents: 'none' }}>{n}</text>
          </g>
        )}
        {obs && (() => {
          // OBSERVACIÓN (37): «ISS-012 · Abierta» bajo la marca, con la barra del color de su estado.
          const est = estadoDeObservacion(obs.estado);
          const texto = `${obs.codigo} · ${obs.vencida ? 'Vencida' : est.etiqueta}`;
          const anchoE = Math.round(texto.length * 6.1) + 16;
          const ex = Math.max(4, Math.min(k.x, vpInfo.w - anchoE - 4));
          const ey = k.y2 + 22 > vpInfo.h ? Math.max(4, k.y - 22) : k.y2 + 4;
          return (
            <g transform={`translate(${ex} ${ey})`}
              style={{ pointerEvents: tocable ? 'all' : 'none', cursor: tool === 'pan' ? 'pointer' : 'default' }}
              onClick={tocable ? alTocar(m) : undefined}>
              <title>{`${obs.titulo || ''}${obs.responsable ? ` — ${obs.responsable}` : ''}`}</title>
              <rect width={anchoE} height="18" rx="3" fill="#fff" stroke={obs.vencida ? '#b93535' : '#cccac0'} strokeWidth="1" />
              <rect x="0.5" y="0.5" width="4" height="17" rx="2" fill={est.color} />
              <text x="10" y="12.6" fontSize="10.5" fontWeight="500" fill={obs.vencida ? '#b93535' : '#141413'}
                fontFamily="'IBM Plex Sans', sans-serif" style={{ pointerEvents: 'none' }}>{texto}</text>
            </g>
          );
        })()}
      </g>
    );
  });

  const marcaElegida = elegida != null ? markups.find(m => m.id === elegida) : null;
  const interactive = tool !== 'pan';
  return (
    // zIndex 9: por encima de las teselas del lector (CapaMosaico, 8), que si no
    // taparian las marcas.
    <div style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: interactive ? 'auto' : 'none' }}>
      <svg
        ref={svgRef}
        width={vpInfo.w} height={vpInfo.h}
        // LA CAPA SIGUE A LA HOJA. Sus coordenadas son las del ultimo dibujado
        // nitido (`viewBox`), pero su tamaño es el de la hoja en pantalla. Con el
        // tamaño fijo de ese dibujado, durante el zoom la hoja y las marcas iban
        // cada una a su tamaño.
        viewBox={`0 0 ${vpInfo.w} ${vpInfo.h}`}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: '100%', cursor: interactive ? (tool === 'erase' ? 'pointer' : 'crosshair') : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {pageMarkups.map(renderMarkup)}
        {renderEnlaces()}
        {renderTiradores()}
        {renderDraft()}
      </svg>

      {/* MARCAS DE OTRAS VERSIONES (36): en la vigente, cuántas hay en las anteriores y un salto para verlas;
          en una anterior, que lo que se ve es de esa versión. Discreto, arriba al centro. */}
      {(enOtras.length > 0 || !enVigente) && !calibAsk && (
        <div className="marcas-version" role="status">
          {!enVigente
            ? <span>Marcas de la <b>V{versionDeLasMarcas?.version_number}</b>, que no es la vigente.</span>
            : <span>{enOtras.reduce((s, v) => s + v.marcas, 0) === 1 ? 'Hay 1 marca' : `Hay ${enOtras.reduce((s, v) => s + v.marcas, 0)} marcas`} en versiones anteriores:</span>}
          {enOtras.map(v => (
            <button key={v.version_id} type="button" disabled={!onIrAVersion} onClick={() => onIrAVersion?.(v.version_id)}
              title={`Ver la V${v.version_number} con sus marcas`}>
              V{v.version_number} <small>{v.marcas}</small>
            </button>
          ))}
        </div>
      )}

      {/* El panel de la marca elegida: referencias, fotos, sello, publicar y borrar. */}
      {marcaElegida && (
        <PanelDeMarca key={marcaElegida.id} API={API} obra={projectPrefix} marca={marcaElegida}
          esAutor={!!userName && marcaElegida.created_by === userName}
          editable={editable(marcaElegida)} colores={COLORS}
          versionVigente={versionVigente?.version_number ?? null}
          onLlevar={vigenteId && marcaElegida.version_id && String(marcaElegida.version_id) !== String(vigenteId)
            ? () => llevarMarca(marcaElegida) : null}
          onCambio={(nueva) => setMarkups(prev => prev.map(x => x.id === nueva.id ? { ...x, ...nueva } : x))}
          onPublicar={() => publicarMarkup(marcaElegida)}
          onBorrar={() => { setElegida(null); deleteMarkup(marcaElegida); }}
          onCerrar={() => setElegida(null)} />
      )}
      {selloEn && (
        <DialogoDeSello autor={userName} onAceptar={colocarSello} onCerrar={() => setSelloEn(null)} />
      )}

      {/* Input de texto flotante */}
      {textDraft && (() => {
        const s = toScr(textDraft.p);
        return (
          <input
            autoFocus
            placeholder="Texto…"
            style={{ position: 'absolute', left: `${(s[0] / vpInfo.w) * 100}%`, top: `calc(${(s[1] / vpInfo.h) * 100}% - 14px)`, width: 180, padding: '4px 8px', fontSize: 13, border: `2px solid ${color}`, borderRadius: 4, outline: 'none', background: '#fff' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) saveMarkup('text', { p: textDraft.p }, v); setTextDraft(null); }
              if (e.key === 'Escape') setTextDraft(null);
            }}
            onBlur={() => setTextDraft(null)}
          />
        );
      })()}

      {/* Diálogo de calibración */}
      {calibAsk && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#faf9f5', color: '#141413', padding: '10px 14px', border: '1px solid #cfcabb', borderRadius: 4, boxShadow: '0 2px 8px rgba(20,20,19,0.12)', display: 'flex', alignItems: 'center', gap: 8, zIndex: 50 }}>
          <span style={{ fontSize: 13 }}>Distancia real entre los dos puntos:</span>
          <input id="calib-input" autoFocus type="number" step="any" placeholder="10.00"
            style={{ width: 90, padding: '5px 8px', borderRadius: 3, border: '1px solid #cfcabb', background: '#fff', color: '#141413', fontSize: 13 }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmCalibration(parseFloat(e.target.value), document.getElementById('calib-unit').value); }} />
          <select id="calib-unit" defaultValue="m" style={{ padding: '5px', borderRadius: 3, background: '#fff', color: '#141413', border: '1px solid #cfcabb' }}>
            <option value="m">m</option><option value="cm">cm</option><option value="km">km</option><option value="ft">ft</option>
          </select>
          <button onClick={() => confirmCalibration(parseFloat(document.getElementById('calib-input').value), document.getElementById('calib-unit').value)}
            style={{ background: '#141413', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 3, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Fijar escala</button>
          <button onClick={() => { setCalibAsk(null); setRecalibrar(false); }} aria-label="Cancelar" style={{ background: 'transparent', border: '1px solid #cfcabb', color: '#52524d', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
        </div>
      )}

      {/* LA ESCALA, AL MEDIR: si falta, qué hacer; si está, cuál es y «Cambiar». */}
      {midiendo && !calibAsk && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid #cfcabb', borderRadius: 4, background: faltaEscala ? '#f6efe2' : '#faf9f5', color: faltaEscala ? '#734500' : '#141413', fontSize: 12.5 }}>
          {faltaEscala
            ? <span>Primero la escala: marca dos puntos de una distancia conocida (por ejemplo, la escala gráfica del plano).</span>
            : <><span>Escala {escalaLegible(cal.units_per_pdf, cal.display_unit) || 'fijada'}</span>
                <button type="button" onClick={() => { setDraft(null); setRecalibrar(true); }}
                  style={{ padding: '2px 8px', border: '1px solid #cfcabb', borderRadius: 3, background: '#fff', color: '#141413', fontSize: 12, cursor: 'pointer' }}>Cambiar</button></>}
          {recalibrar && cal && <button type="button" onClick={() => { setDraft(null); setRecalibrar(false); }}
            style={{ padding: '2px 8px', border: '1px solid #cfcabb', borderRadius: 3, background: '#fff', color: '#52524d', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>}
        </div>
      )}

      {/* Barra de estado: totales de la página */}
      {(pageMarkups.length > 0 || draft) && (
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: '#faf9f5', color: '#141413', border: '1px solid #cfcabb', padding: '5px 12px', borderRadius: 4, fontSize: 12, display: 'flex', gap: 14, pointerEvents: 'none', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          <span>{cal ? `Escala ${escalaLegible(cal.units_per_pdf, cal.display_unit) || 'fijada'}` : 'Sin escala'}</span>
          {countTotal > 0 && <span>Conteo: <b>{countTotal}</b></span>}
          {(() => {
            const ms = pageMarkups.filter(m => m.kind === 'measure');
            if (!ms.length || !cal) return null;
            const tot = ms.reduce((s, m) => s + polyLength(m.geometry.points), 0) * cal.units_per_pdf;
            return <span>Σ Distancias: <b>{fmt(tot)} {cal.display_unit}</b></span>;
          })()}
          {(() => {
            const as = pageMarkups.filter(m => m.kind === 'area');
            if (!as.length || !cal) return null;
            const tot = as.reduce((s, m) => s + polyArea(m.geometry.points), 0) * cal.units_per_pdf * cal.units_per_pdf;
            return <span>Σ Áreas: <b>{fmt(tot)} {cal.display_unit}²</b></span>;
          })()}
        </div>
      )}
    </div>
  );
}

export { COLORS };
