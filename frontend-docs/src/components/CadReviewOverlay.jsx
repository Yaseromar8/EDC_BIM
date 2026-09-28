import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../utils/helpers';
import { apiFetch, apiJson } from '../utils/apiFetch';
import { enlaceDeArchivos } from '../utils/enlacesDeArchivos';
import './CadReviewOverlay.css';

const BASE = `${API}/api/docs/cad/reviews`;
const FloatingCadViewer = React.lazy(() => import('./CadViewer'));
const CAD_FILES = /\.(dwg|dxf|dwf|dwfx|rvt|rfa|ifc|nwd|nwc|dgn|3dm|sat|step|stp|iges|igs|obj|fbx|stl)$/i;
const INLINE_FILES = /\.(pdfx?|png|jpe?g|webp|gif)$/i;
const IMAGE_FILES = /\.(png|jpe?g|webp|gif)$/i;
const TEXT_FILES = /\.(txt|csv|log|json)$/i;

function ReviewIcon({ kind }) {
  const paths = {
    select: <path d="M5 3v16l4.3-4.3 3.2 5 2.2-1.3-3.2-5 5.5-1.2L5 3Z" />,
    cloud: <path d="M5.5 5.2c.2-2.3 2.8-3.1 4.3-1.4 1.6-1.8 4.2-1.1 4.8.7 2.3-.7 4.2 1.3 3.5 3.5 2.1 1.2 2.2 4.1.1 5.3.8 2.3-1 4.4-3.2 4.5-.8 2.2-3.7 3-5.4 1.1-1.8 1.7-4.3.8-4.8-1.3-2.3.4-4.1-1.6-3.2-3.8-1.8-1.2-1.8-3.8 0-5.2Z" />,
    text: <><path d="M4 5h16M12 5v14M8 19h8" /></>,
    photo: <><path d="M3.5 7.5h4l1.4-2h6.2l1.4 2h4v11h-17v-11Z" /><circle cx="12" cy="13" r="3.2" /></>,
    file: <><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6" /></>,
    plan: <><path d="M4 5h16v14H4zM8 5v14M12 9h5M12 13h5" /></>,
    folder: <path d="M3 6h7l2 2h9v11H3z" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[kind]}
  </svg>;
}

function screenPoint(viewer, point) {
  try {
    const p = viewer.worldToClient(new window.THREE.Vector3(point.x, point.y, point.z || 0));
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch { return null; }
}

function worldPoint(viewer, x, y) {
  try {
    const hit = viewer.clientToWorld(x, y, true);
    const p = hit?.point;
    return p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ? { x: p.x, y: p.y, z: p.z || 0 } : null;
  } catch { return null; }
}

function cloudPath(x, y, w, h) {
  const perimeter = 2 * (w + h);
  const count = Math.max(4, Math.round(perimeter / 52));
  const nx = Math.max(2, Math.round(count * w / perimeter * 2));
  const ny = Math.max(2, Math.round(count * h / perimeter * 2));
  let path = `M ${x} ${y}`;
  for (let i = 0; i < nx; i++) {
    path += ` Q ${x + w * (i + .5) / nx} ${y - 14} ${x + w * (i + 1) / nx} ${y}`;
  }
  for (let i = 0; i < ny; i++) {
    path += ` Q ${x + w + 14} ${y + h * (i + .5) / ny} ${x + w} ${y + h * (i + 1) / ny}`;
  }
  for (let i = 0; i < nx; i++) {
    path += ` Q ${x + w * (1 - (i + .5) / nx)} ${y + h + 14} ${x + w * (1 - (i + 1) / nx)} ${y + h}`;
  }
  for (let i = 0; i < ny; i++) {
    path += ` Q ${x - 14} ${y + h * (1 - (i + .5) / ny)} ${x} ${y + h * (1 - (i + 1) / ny)}`;
  }
  return `${path} Z`;
}

function visibleTextLines(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const previous = lines[lines.length - 1];
    if (previous && `${previous} ${word}`.length <= 19) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word.length > 19 ? `${word.slice(0, 18)}…` : word);
    if (lines.length > 3) break;
  }
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines[2].slice(0, 17)}…`];
  return lines.length ? lines : ['Texto'];
}

function FilePicker({ projectPrefix, kind, onChoose, onClose }) {
  const [stack, setStack] = useState([{ id: null, name: 'Archivos de proyecto' }]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const folder = stack[stack.length - 1];
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const query = new URLSearchParams({ model_urn: projectPrefix });
    if (folder.id) query.set('id', folder.id);
    apiJson(`${API}/api/docs/list?${query}`)
      .then(response => {
        if (!active) return;
        const data = response?.data || {};
        setItems([...(data.folders || []).map(x => ({ ...x, folder: true })),
          ...(data.files || []).map(x => ({ ...x, folder: false }))]);
      })
      .catch(e => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [projectPrefix, folder.id]);
  const matches = items.filter(item => String(item.name || '').toLowerCase().includes(search.toLowerCase()));
  const isImage = item => /\.(png|jpe?g|webp)$/i.test(item.name || '') || /^image\//i.test(item.mime_type || '');
  const isPlan = item => /\.(dwg|dxf|rvt|rfa|ifc|nwd|nwc|ipt|iam|idw|pdf)$/i.test(item.name || '');
  return <div className="cad-review-modal" role="dialog" aria-modal="true" aria-label="Elegir documento">
    <div className="cad-review-dialog">
      <header><strong>Elegir {kind === 'photo' ? 'foto' : kind === 'plan' ? 'plano' : 'archivo'} de ALEPHIA</strong><button onClick={onClose} aria-label="Cerrar">×</button></header>
      <div className="cad-review-crumbs">{stack.map((entry, index) => <button key={index} onClick={() => setStack(stack.slice(0, index + 1))}>{entry.name}</button>)}</div>
      <input autoFocus placeholder="Buscar en esta carpeta" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="cad-review-picker-list">
        {loading ? <p>Cargando carpetas…</p> : error ? <p role="alert">{error}</p> : matches.length ? matches.map(item =>
          <button key={item.id} onClick={() => item.folder ? setStack([...stack, { id: item.id, name: item.name }]) : onChoose(item)}
            disabled={!item.folder && ((kind === 'photo' && !isImage(item)) || (kind === 'plan' && !isPlan(item)))}>
            <span className="cad-review-picker-icon" aria-hidden="true"><ReviewIcon kind={item.folder ? 'folder' : isPlan(item) ? 'plan' : 'file'} /></span> {item.name}
          </button>) : <p>Sin documentos en esta carpeta.</p>}
      </div>
      <footer><button onClick={onClose}>Cancelar</button></footer>
    </div>
  </div>;
}

function PhotoPreview({ markId, attachmentId }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let url;
    apiFetch(`${BASE}/${markId}/photos/${attachmentId}`).then(async response => {
      if (!response.ok) throw new Error('No se pudo abrir la foto.');
      return response.blob();
    }).then(blob => { if (active) { url = URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => active && setFailed(true));
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [markId, attachmentId]);
  return src ? <img className="cad-review-photo-preview" src={src} alt="Foto de revisión" />
    : <p>{failed ? 'Foto no disponible.' : 'Cargando foto…'}</p>;
}

function FloatingPreview({ markId, reference, projectPrefix, onClose }) {
  const [url, setUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [textLoaded, setTextLoaded] = useState(false);
  const [error, setError] = useState('');
  const isPhoto = reference.kind === 'photo';
  const isCad = !isPhoto && CAD_FILES.test(reference.name || '');
  const inline = !isPhoto && !isCad && INLINE_FILES.test(reference.name || '');
  const isText = !isPhoto && !isCad && TEXT_FILES.test(reference.name || '');
  const documentUrl = reference.file_node_id
    ? enlaceDeArchivos(window.location.origin, { obra: projectPrefix, documento: reference.file_node_id })
    : null;

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (!inline || !reference.file_node_id) return undefined;
    let active = true;
    const query = new URLSearchParams({ id: reference.file_node_id, model_urn: projectPrefix });
    apiJson(`${API}/api/docs/signed-url?${query}`, { retries: 0 })
      .then(data => { if (active) setUrl(data.url || ''); })
      .catch(cause => { if (active) setError(cause.message || 'No se pudo preparar la vista.'); });
    return () => { active = false; };
  }, [inline, reference.file_node_id, projectPrefix]);
  useEffect(() => {
    if (!isText || !reference.file_node_id) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({ id: reference.file_node_id, model_urn: projectPrefix });
    (async () => {
      const response = await apiFetch(`${API}/api/docs/proxy?${query}`, { signal: controller.signal, retries: 0 });
      if (!response.ok) throw new Error('No se pudo abrir el texto vinculado.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('El navegador no pudo leer este archivo.');
      const decoder = new TextDecoder();
      let size = 0;
      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new Error('El texto supera 1 MB; ábrelo en ALEPHIA.');
        }
        content += decoder.decode(value, { stream: true });
      }
      if (!controller.signal.aborted) { setTextContent(content + decoder.decode()); setTextLoaded(true); }
    })().catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [isText, reference.file_node_id, projectPrefix]);

  return createPortal(<div className="cad-review-preview-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="cad-review-preview" role="dialog" aria-modal="true" aria-label={`Vista de ${reference.name}`}>
      <header className="cad-review-preview-header">
        <div><ReviewIcon kind={isPhoto ? 'photo' : reference.kind === 'plan' ? 'plan' : 'file'} /><strong title={reference.name}>{reference.name}</strong></div>
        <div>{documentUrl && <a href={documentUrl} target="_blank" rel="noopener noreferrer">Abrir en ALEPHIA</a>}
          <button type="button" onClick={onClose} aria-label="Cerrar vista">×</button></div>
      </header>
      <div className="cad-review-preview-content">
        {isPhoto ? <PhotoPreview markId={markId} attachmentId={reference.id} />
          : isCad ? <Suspense fallback={<p>Cargando plano…</p>}><FloatingCadViewer
              file={{ id: reference.file_node_id, name: reference.name }}
              projectPrefix={projectPrefix} reviewEnabled={false} /></Suspense>
          : error ? <p role="alert">{error}</p>
          : isText ? <pre className="cad-review-preview-text">{textLoaded ? textContent : 'Cargando texto…'}</pre>
          : inline && !url ? <p>Cargando documento…</p>
          : inline && IMAGE_FILES.test(reference.name || '') ? <img src={url} alt={reference.name} />
          : inline ? <iframe title={reference.name} src={url} sandbox="allow-same-origin" />
          : <p>Este formato no tiene vista previa integrada. Puedes abrirlo en ALEPHIA.</p>}
      </div>
    </section>
  </div>, document.body);
}

export default function CadReviewOverlay({ viewer, nodeId, versionId, viewGuid, projectPrefix }) {
  const layerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [marks, setMarks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState(null);
  const [drag, setDrag] = useState(null);
  const [picker, setPicker] = useState(null);
  const [revision, setRevision] = useState(0);
  const [cameraTick, setCameraTick] = useState(0);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState('loading');
  const [showAvailabilityInfo, setShowAvailabilityInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [textPlacement, setTextPlacement] = useState(null);
  const [textDraft, setTextDraft] = useState('');
  const [editingText, setEditingText] = useState(false);
  const [preview, setPreview] = useState(null);
  const selected = marks.find(mark => mark.id === selectedId);

  const reload = useCallback(async () => {
    const query = new URLSearchParams({ node_id: nodeId, view_guid: viewGuid });
    if (versionId) query.set('version_id', versionId);
    const data = await apiJson(`${BASE}?${query}`);
    setMarks(data.marks || []);
    setAvailability('ready');
    setError('');
  }, [nodeId, versionId, viewGuid]);

  useEffect(() => {
    let active = true;
    const refresh = () => reload().catch(e => {
      if (!active) return;
      if (e.status === 404) {
        setAvailability('missing');
        setMarks([]);
        setTool(null);
        setError('');
      } else {
        setAvailability('error');
        setError(e.message);
      }
    });
    refresh();
    const interval = window.setInterval(() => { if (!document.hidden) refresh(); }, 20000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [reload, revision]);
  useEffect(() => { setSelectedId(null); setTool(null); setTextPlacement(null); setPreview(null); setMarks([]); }, [nodeId, versionId, viewGuid]);
  useEffect(() => {
    const Autodesk = window.Autodesk;
    const event = Autodesk?.Viewing?.CAMERA_CHANGE_EVENT;
    if (!event) return undefined;
    const update = () => setCameraTick(t => t + 1);
    viewer.addEventListener(event, update);
    return () => viewer.removeEventListener(event, update);
  }, [viewer]);

  const run = async action => {
    setBusy(true); setError('');
    try { await action(); setRevision(v => v + 1); }
    catch (e) {
      if (e.status === 404) { setAvailability('missing'); setError(''); }
      else setError(e.message || 'No se pudo guardar la revisión.');
    }
    finally { setBusy(false); }
  };
  const create = async (kind, geometry, content) => {
    const data = await apiJson(BASE, { method: 'POST', body: JSON.stringify({ node_id: nodeId, version_id: versionId, view_guid: viewGuid, kind, geometry, text: content }) });
    setSelectedId(data.id); setTool(null);
  };
  const local = event => {
    const box = layerRef.current.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const onPointerDown = event => {
    if (!tool || busy || availability !== 'ready') return;
    const p = local(event);
    if (tool === 'cloud') { setDrag({ start: p, end: p }); event.currentTarget.setPointerCapture(event.pointerId); }
    else {
      const world = worldPoint(viewer, p.x, p.y);
      if (!world) { setError('Haz clic sobre el plano para colocar la marca.'); return; }
      if (tool === 'text') {
        setTextPlacement(world); setTextDraft(''); setTool(null);
      } else run(() => create('photo', world));
    }
  };
  const onPointerUp = event => {
    if (!drag) return;
    const p = local(event);
    setDrag(null);
    if (Math.abs(p.x - drag.start.x) < 12 || Math.abs(p.y - drag.start.y) < 12) return;
    const a = worldPoint(viewer, Math.min(p.x, drag.start.x), Math.min(p.y, drag.start.y));
    const b = worldPoint(viewer, Math.max(p.x, drag.start.x), Math.max(p.y, drag.start.y));
    if (!a || !b) { setError('Dibuja la nube sobre el plano.'); return; }
    run(() => create('cloud', { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: a.z, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }));
  };
  const projected = marks.map(mark => {
    const { x, y, z = 0, w = 0, h = 0 } = mark.geometry;
    const a = screenPoint(viewer, { x, y, z });
    const b = mark.kind === 'cloud' ? screenPoint(viewer, { x: x + w, y: y + h, z }) : null;
    return { mark, a, b };
  }).filter(item => item.a);
  void cameraTick;

  const attachDoc = item => {
    const kind = picker;
    setPicker(null);
    run(() => apiJson(`${BASE}/${selected.id}/attachments`, {
      method: 'POST', body: JSON.stringify({ kind, file_node_id: item.id }),
    }));
  };
  const openReference = (mark, ref) => setPreview({ markId: mark.id, reference: ref });
  return <div className="cad-review-root" ref={layerRef}>
    <svg className="cad-review-svg" onPointerDown={onPointerDown} onPointerMove={e => { if (drag) setDrag(d => ({ ...d, end: local(e) })); }} onPointerUp={onPointerUp} style={{ pointerEvents: tool && availability === 'ready' ? 'auto' : 'none', cursor: tool ? 'crosshair' : 'default' }}>
      {projected.map(({ mark, a, b }) => {
        const mine = mark.mine;
        const color = mark.published ? '#e4483d' : '#cf8b24';
        if (mark.kind === 'cloud' && b) {
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
          return <g key={mark.id} onClick={e => { e.stopPropagation(); setSelectedId(mark.id); setTool(null); setEditingText(false); }} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
            <path d={cloudPath(x, y, w, h)} fill="rgba(255,255,255,.01)" stroke={color} strokeWidth="3" strokeDasharray={mark.published ? undefined : '8 4'} />
            {mark.attachments?.length > 0 && (() => {
              const ref = mark.attachments[0];
              const width = 184;
              const left = Math.max(8, Math.min(x + w - 8, (layerRef.current?.clientWidth || 1000) - width - 8));
              const top = Math.max(8, y - 38);
              const label = `${ref.name.slice(0, 20)}${ref.name.length > 20 ? '…' : ''}${mark.attachments.length > 1 ? ` +${mark.attachments.length - 1}` : ''}`;
              return <g onClick={e => { e.stopPropagation(); openReference(mark, ref); }} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>
                <rect x={left} y={top} width={width} height="29" rx="14" fill="white" stroke="#1682bd" strokeWidth="1.5" />
                <path d={`M ${left + 11} ${top + 7} h 9 l 4 4 v 11 h -13 z M ${left + 20} ${top + 7} v 4 h 4 M ${left + 15} ${top + 15} h 6 M ${left + 15} ${top + 18} h 6`}
                  fill="none" stroke="#1682bd" strokeWidth="1.3" strokeLinejoin="round" />
                <text x={left + 31} y={top + 19} fill="#17384e" fontSize="11.5">{label}</text>
              </g>;
            })()}
          </g>;
        }
        return <g key={mark.id} onClick={e => { e.stopPropagation(); setSelectedId(mark.id); setTool(null); setEditingText(false); }} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
          {mark.kind === 'photo' ? <><circle cx={a.x} cy={a.y} r="17" fill="white" stroke={color} strokeWidth="2.5" /><path d={`M ${a.x - 10} ${a.y - 5} h 4 l 2 -3 h 8 l 2 3 h 4 v 12 h -20 z M ${a.x + 4} ${a.y + 1} a 4 4 0 1 1 -8 0 a 4 4 0 1 1 8 0`}
              fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" /></>
            : (() => {
              const lines = visibleTextLines(mark.text);
              return <><rect x={a.x - 3} y={a.y - 28} width="236" height={Math.max(46, lines.length * 28 + 16)} rx="2" fill="white" stroke={color} strokeWidth="3" />
                <text x={a.x + 10} y={a.y + 2} fontSize="22" fill={color} fontFamily="Arial, sans-serif">
                  {lines.map((line, index) => <tspan key={index} x={a.x + 10} dy={index ? 28 : 0}>{line}</tspan>)}
                </text></>;
            })()}
          {!mark.published && mine && <circle cx={a.x - 12} cy={a.y - 18} r="4" fill="#cf8b24" />}
        </g>;
      })}
      {drag && <rect x={Math.min(drag.start.x, drag.end.x)} y={Math.min(drag.start.y, drag.end.y)}
        width={Math.abs(drag.start.x - drag.end.x)} height={Math.abs(drag.start.y - drag.end.y)}
        fill="rgba(228,72,61,.07)" stroke="#e4483d" strokeDasharray="5 4" />}
    </svg>
    <div className="cad-review-tools" aria-label="Herramientas de revisión" title={availability === 'missing' ? 'El backend conectado todavía no dispone de revisión CAD' : undefined}>
      <button title="Seleccionar" aria-label="Seleccionar" className={!tool && availability === 'ready' ? 'active' : ''} disabled={availability !== 'ready'} onClick={() => { setTool(null); setDrag(null); }}><ReviewIcon kind="select" /></button>
      <span className="cad-review-tools-divider" aria-hidden="true" />
      {[['cloud', 'Nube'], ['text', 'Texto'], ['photo', 'Foto']].map(([key, label]) =>
        <button key={key} title={label} aria-label={label} disabled={availability !== 'ready'} className={tool === key ? 'active' : ''} onClick={() => { setTool(tool === key ? null : key); setSelectedId(null); setTextPlacement(null); }}><ReviewIcon kind={key} /></button>)}
      {tool && <button title="Cancelar dibujo" onClick={() => { setTool(null); setDrag(null); }}>×</button>}
      {availability === 'missing' && <><span className="cad-review-tools-divider" aria-hidden="true" /><button title="¿Por qué no están activas las herramientas?" aria-label="Estado de revisión" className="cad-review-info-button" onClick={() => setShowAvailabilityInfo(v => !v)}><ReviewIcon kind="info" /></button></>}
    </div>
    {availability === 'missing' && showAvailabilityInfo && <div className="cad-review-unavailable" role="status">
      La revisión de planos aún no está habilitada en el backend conectado.
    </div>}
    {selected && <aside className="cad-review-panel">
      <header><strong>{selected.kind === 'cloud' ? 'Nube' : selected.kind === 'photo' ? 'Foto' : 'Texto'}</strong><button onClick={() => setSelectedId(null)} aria-label="Cerrar">×</button></header>
      <small>{selected.published ? 'Publicado · visible para usuarios con acceso' : 'Borrador · sólo lo ves tú'}<br />Por {selected.created_by || 'usuario'}</small>
      {selected.kind === 'text' && (editingText ? <>
        <textarea className="cad-review-textarea" value={textDraft} maxLength={4000} onChange={e => setTextDraft(e.target.value)} aria-label="Editar observación" />
        <div className="cad-review-actions"><button className="primary" disabled={!textDraft.trim() || busy} onClick={() => run(async () => { await apiJson(`${BASE}/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ text: textDraft.trim() }) }); setEditingText(false); })}>Guardar</button><button onClick={() => setEditingText(false)}>Cancelar</button></div>
      </> : <p>{selected.text}</p>)}
      {selected.kind === 'cloud' && selected.mine && <div className="cad-review-actions"><button onClick={() => setPicker('plan')}>+ Referencia a plano</button><button onClick={() => setPicker('file')}>+ Referencia a archivo</button></div>}
      {selected.kind === 'photo' && selected.mine && <div className="cad-review-actions"><button onClick={() => setPicker('photo')}>+ Foto de ALEPHIA</button><button onClick={() => fileInputRef.current?.click()}>+ Subir foto</button><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ''; if (!chosen) return; const form = new FormData(); form.append('file', chosen); run(() => apiJson(`${BASE}/${selected.id}/photos`, { method: 'POST', body: form, isUpload: true })); }} /></div>}
      {selected.attachments?.map(ref => <div className="cad-review-ref" key={ref.id}>
        <button className="cad-review-ref-open" onClick={() => openReference(selected, ref)} title="Ver en ventana flotante">
          <ReviewIcon kind={ref.kind === 'photo' ? 'photo' : ref.kind === 'plan' ? 'plan' : 'file'} />
          <span>{ref.name}</span>
        </button>
        {selected.mine && <button className="cad-review-remove" title="Quitar referencia" onClick={() => run(() => apiJson(`${BASE}/${selected.id}/attachments/${ref.id}`, { method: 'DELETE' }))}>×</button>}
      </div>)}
      {selected.mine && <div className="cad-review-actions bottom">
        {selected.kind === 'text' && !editingText && <button disabled={busy} onClick={() => { setTextDraft(selected.text || ''); setEditingText(true); }}>Editar</button>}
        {!selected.published && <button className="primary" disabled={busy || (selected.kind === 'photo' && !selected.attachments?.length)} onClick={() => run(() => apiJson(`${BASE}/${selected.id}/publish`, { method: 'POST' }))}>Publicar</button>}
        <button disabled={busy} onClick={() => { if (window.confirm('¿Eliminar esta marca?')) run(async () => { await apiJson(`${BASE}/${selected.id}`, { method: 'DELETE' }); setSelectedId(null); }); }}>Eliminar</button>
      </div>}
    </aside>}
    {error && <div className="cad-review-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
    {textPlacement && <div className="cad-review-modal" role="dialog" aria-modal="true" aria-label="Nueva observación de texto"><div className="cad-review-dialog cad-review-text-dialog">
      <header><strong>Nueva observación</strong><button onClick={() => setTextPlacement(null)} aria-label="Cerrar">×</button></header>
      <textarea autoFocus className="cad-review-textarea" placeholder="Describe qué debe corregirse en el plano…" maxLength={4000} value={textDraft} onChange={e => setTextDraft(e.target.value)} />
      <small>Se guardará como borrador privado. Publica cuando esté lista para los demás.</small>
      <footer><button onClick={() => setTextPlacement(null)}>Cancelar</button><button className="primary" disabled={!textDraft.trim() || busy} onClick={() => run(async () => { await create('text', textPlacement, textDraft.trim()); setTextPlacement(null); })}>Guardar borrador</button></footer>
    </div></div>}
    {picker && selected && <FilePicker projectPrefix={projectPrefix} kind={picker} onChoose={attachDoc} onClose={() => setPicker(null)} />}
    {preview && <FloatingPreview key={`${preview.markId}:${preview.reference.id}`} markId={preview.markId}
      reference={preview.reference} projectPrefix={projectPrefix} onClose={() => setPreview(null)} />}
  </div>;
}
