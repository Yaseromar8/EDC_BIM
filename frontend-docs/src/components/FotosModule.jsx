/**
 * NG-02 · FOTOS DE CAMPO — la galería de evidencia.
 *
 * LO QUE ESTA PANTALLA DEFIENDE (doc 94):
 *   - La foto es EVIDENCIA CITABLE: se ve DE QUÉ obra es, DÓNDE (progresiva /
 *     elemento / texto) y QUIÉN LA CITA (los issues que llevan su objeto).
 *   - Sensibilidad, no «privado»: N2/N3 ni siquiera llegan del servidor si no
 *     te tocan. El álbum agrupa; jamás concede.
 *   - Las marcas son una capa aparte; el binario no se toca. Una marca nace
 *     PRIVADA y la publica su autor.
 *   - Sin red, la captura ENCOLA por el motor del GAP 07 — el mismo camino,
 *     con el mismo «Guardado en este dispositivo» honesto.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import * as campo from '../offline/captura';

const NIVELES = [
  ['N0', 'N0 · sin restricción'],
  ['N1', 'N1 · uso interno'],
  ['N2', 'N2 · restringido'],
  ['N3', 'N3 · crítico'],
];
const COLOR_NIVEL = { N0: '#1f6b3a', N1: '#5a6b7d', N2: '#8a5a00', N3: '#8a2020' };

function Miniatura({ API, foto, onAbrir }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let vivo = true, url = null;
    apiFetch(`${API}/api/fotos/${foto.id}/miniatura?px=420`)
      .then(r => (r.ok ? r.blob() : null))
      .then(b => { if (b && vivo) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => {});
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [API, foto.id]);
  return (
    <div onClick={() => onAbrir(foto)}
         style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
                  background: '#eef2f7', position: 'relative', aspectRatio: '4/3' }}>
      {src
        ? <img src={src} alt={foto.nombre || 'foto'}
               style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ display: 'grid', placeItems: 'center', height: '100%',
                        color: '#9aa7b4', fontSize: 12 }}>cargando…</div>}
      <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, fontWeight: 700,
                     color: '#fff', background: COLOR_NIVEL[foto.sensibilidad] || '#5a6b7d',
                     padding: '1px 6px', borderRadius: 4 }}>
        {foto.sensibilidad}
      </span>
      {(foto.citada_por || []).length > 0 && (
        <span style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 10,
                       background: 'rgba(22,32,43,.85)', color: '#fff',
                       padding: '1px 6px', borderRadius: 4 }}
              title={'Citada por ' + foto.citada_por.join(', ')}>
          {foto.citada_por.join(' · ')}
        </span>
      )}
      {(foto.progresiva || foto.ubicacion) && (
        <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10,
                       background: 'rgba(255,255,255,.9)', color: '#33475b',
                       padding: '1px 6px', borderRadius: 4 }}>
          {foto.progresiva || foto.ubicacion}
        </span>
      )}
    </div>
  );
}

/** El visor con la capa de marcas. Las figuras usan coordenadas RELATIVAS
 *  (0..1): la foto se muestra a cualquier tamaño y la marca no se descoloca. */
function Visor({ API, foto, onCerrar, onCambio }) {
  const [src, setSrc] = useState(null);
  const [modo, setModo] = useState(null);          // null | 'circulo' | 'texto'
  const [pendiente, setPendiente] = useState([]);  // figuras aún no guardadas
  const marco = useRef(null);

  useEffect(() => {
    let vivo = true, url = null;
    apiFetch(`${API}/api/fotos/${foto.id}/miniatura?px=1600`)
      .then(r => (r.ok ? r.blob() : null))
      .then(b => { if (b && vivo) { url = URL.createObjectURL(b); setSrc(url); } })
      .catch(() => {});
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [API, foto.id]);

  const relativo = (e) => {
    const r = marco.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const clic = (e) => {
    if (!modo) return;
    const p = relativo(e);
    if (modo === 'circulo') {
      setPendiente(f => [...f, { tipo: 'circulo', puntos: [p] }]);
    } else if (modo === 'texto') {
      const t = window.prompt('Texto de la marca:');
      if (t) setPendiente(f => [...f, { tipo: 'texto', puntos: [p], texto: t }]);
    }
  };

  const guardarMarca = async () => {
    if (!pendiente.length) return;
    const r = await apiFetch(`${API}/api/fotos/${foto.id}/marcas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figuras: pendiente }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || 'No se pudo guardar la marca.'); return; }
    toast.success('Marca guardada — PRIVADA hasta que la publiques.');
    setPendiente([]); setModo(null); onCambio();
  };

  const publicar = async (mid) => {
    const r = await apiFetch(`${API}/api/fotos/${foto.id}/marcas/${mid}/publicar`,
                             { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || 'No se pudo publicar.'); return; }
    toast.success('Marca publicada: ya la ve la obra.');
    onCambio();
  };

  const figuras = [
    ...(foto.marcas || []).flatMap(m => m.figuras.map(f => ({ ...f, marca: m }))),
    ...pendiente.map(f => ({ ...f, marca: { publicada: false, pendiente: true } })),
  ];

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,19,.82)',
                  zIndex: 1200, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, maxWidth: 980, width: '100%',
                    maxHeight: '94vh', overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <b>{foto.nombre || 'foto'}</b>
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700,
                           color: COLOR_NIVEL[foto.sensibilidad] }}>{foto.sensibilidad}</span>
            <div style={{ fontSize: 12, color: '#5a6b7d' }}>
              {foto.capturado_en
                ? <>el dispositivo declaró {new Date(foto.capturado_en).toLocaleString('es-PE')}</>
                : <>subida {foto.subido_en && new Date(foto.subido_en).toLocaleString('es-PE')}</>}
              {foto.progresiva && <> · prog. {foto.progresiva}</>}
              {foto.ubicacion && <> · {foto.ubicacion}</>}
              {(foto.citada_por || []).length > 0 && <> · citada por {foto.citada_por.join(', ')}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setModo(m => m === 'circulo' ? null : 'circulo')}
                    style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12,
                             border: '1px solid #c8d4e3',
                             background: modo === 'circulo' ? '#16202b' : '#fff',
                             color: modo === 'circulo' ? '#fff' : '#16202b' }}>
              ◯ marcar
            </button>
            <button onClick={() => setModo(m => m === 'texto' ? null : 'texto')}
                    style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12,
                             border: '1px solid #c8d4e3',
                             background: modo === 'texto' ? '#16202b' : '#fff',
                             color: modo === 'texto' ? '#fff' : '#16202b' }}>
              T texto
            </button>
            {pendiente.length > 0 && (
              <button onClick={guardarMarca}
                      style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12,
                               border: 'none', background: '#1f6b3a', color: '#fff' }}>
                Guardar marca ({pendiente.length})
              </button>
            )}
            <button onClick={onCerrar}
                    style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12,
                             border: '1px solid #c8d4e3', background: '#fff' }}>
              Cerrar
            </button>
          </div>
        </div>

        <div ref={marco} onClick={clic}
             style={{ position: 'relative', marginTop: 12,
                      cursor: modo ? 'crosshair' : 'default' }}>
          {src ? <img src={src} alt="" style={{ width: '100%', display: 'block',
                                                borderRadius: 6 }} />
               : <div style={{ padding: 60, textAlign: 'center', color: '#9aa7b4' }}>cargando…</div>}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                        pointerEvents: 'none' }}>
            {figuras.map((f, i) => {
              const p = f.puntos[0];
              const color = f.marca.pendiente ? '#b4501a'
                          : f.marca.publicada ? '#c62828' : '#8a5a00';
              if (f.tipo === 'circulo') {
                return <circle key={i} cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r="26"
                               fill="none" stroke={color} strokeWidth="3"
                               strokeDasharray={f.marca.publicada ? '' : '6 4'} />;
              }
              if (f.tipo === 'texto') {
                return <text key={i} x={`${p.x * 100}%`} y={`${p.y * 100}%`}
                             fill={color} fontSize="15" fontWeight="700"
                             style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
                  {f.texto}
                </text>;
              }
              return null;
            })}
          </svg>
        </div>

        {(foto.marcas || []).length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {foto.marcas.map(m => (
              <span key={m.id} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6,
                                        background: m.publicada ? '#fdeeee' : '#fbf1de',
                                        color: m.publicada ? '#8a2020' : '#8a5a00' }}>
                {m.publicada ? 'publicada' : 'PRIVADA — solo tú la ves'} · {m.por}
                {!m.publicada && (
                  <button onClick={() => publicar(m.id)}
                          style={{ marginLeft: 6, fontSize: 11, border: 'none',
                                   background: 'transparent', color: '#2c5d8a',
                                   cursor: 'pointer', textDecoration: 'underline' }}>
                    publicar
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModalSubir({ API, urn, user, project, onCerrar, onSubida }) {
  const [f, setF] = useState({ descripcion: '', progresiva: '', ubicacion: '',
                               sensibilidad: 'N1' });
  const [ficheros, setFicheros] = useState([]);
  const [ocupado, setOcupado] = useState(false);

  const subir = async () => {
    if (!ficheros.length) { toast.error('Elige al menos una foto.'); return; }
    setOcupado(true);
    let enLinea = 0, enCola = 0, fallos = 0;
    for (const fichero of ficheros) {
      try {
        if (navigator.onLine) {
          const forma = new FormData();
          forma.append('file', fichero);
          forma.append('model_urn', urn);
          Object.entries(f).forEach(([k, v]) => v && forma.append(k, v));
          const r = await apiFetch(`${API}/api/fotos`, { method: 'POST',
                                                         body: forma, isUpload: true });
          if (r.ok) { enLinea += 1; continue; }
          throw new Error('el servidor no la aceptó');
        }
        throw new Error('sin red');
      } catch (e) {
        // SIN RED (o la subida murió): a la cola del GAP 07. El blob queda
        // PERSISTIDO en IndexedDB — no una referencia al <input> — y el acto
        // FOTO/CREATE viaja con la metadata; el binario sube primero por la
        // ruta de evidencia, que también limpia el GPS.
        try {
          const ctx = campo.contextoDe(user, project);
          if (!ctx) throw new Error('sin identidad');
          await campo.capturarConEvidencia(API, ctx, {
            object_type: 'FOTO', action: campo.CREATE,
            local_object_id: campo.nuevoObjetoLocal(),
            payload: { ...f, nombre: fichero.name, model_urn: urn,
                       tipo_mime: fichero.type, tamano: fichero.size },
          }, [fichero]);
          enCola += 1;
        } catch (e2) { fallos += 1; }
      }
    }
    setOcupado(false);
    if (enLinea) toast.success(`${enLinea} foto(s) en la obra.`);
    if (enCola) toast.success(`${enCola} guardada(s) EN ESTE DISPOSITIVO — subirán con cobertura (míralas en Trabajo de campo).`, { duration: 6000 });
    if (fallos) toast.error(`${fallos} no se pudieron guardar.`);
    if (enLinea || enCola) { onSubida(); onCerrar(); }
  };

  const CAJA = { border: '1px solid #d5dde6', borderRadius: 6, padding: '7px 9px',
                 fontSize: 13, width: '100%' };
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0,
         background: 'rgba(15,20,26,.45)', display: 'flex', alignItems: 'center',
         justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 22, width: 460,
                    maxWidth: '92vw' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Subir fotos de campo</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#78838f' }}>
          El GPS del fichero se elimina antes de guardar — la ubicación de obra
          es la progresiva. Sin cobertura, quedan en este dispositivo y suben solas.
        </p>
        <input type="file" accept="image/*" multiple
               onChange={e => setFicheros([...e.target.files])}
               style={{ marginBottom: 10, fontSize: 13 }} />
        <input placeholder="Descripción" value={f.descripcion} style={{ ...CAJA, marginBottom: 8 }}
               onChange={e => setF(p => ({ ...p, descripcion: e.target.value }))} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="Progresiva (ej. 0+640)" value={f.progresiva} style={CAJA}
                 onChange={e => setF(p => ({ ...p, progresiva: e.target.value }))} />
          <input placeholder="Ubicación (texto)" value={f.ubicacion} style={CAJA}
                 onChange={e => setF(p => ({ ...p, ubicacion: e.target.value }))} />
        </div>
        <select value={f.sensibilidad} style={{ ...CAJA, marginBottom: 14 }}
                onChange={e => setF(p => ({ ...p, sensibilidad: e.target.value }))}>
          {NIVELES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCerrar} style={{ padding: '7px 14px', borderRadius: 6,
                  border: '1px solid #d5dde6', background: '#fff' }}>Cancelar</button>
          <button onClick={subir} disabled={ocupado}
                  style={{ padding: '7px 14px', borderRadius: 6, border: 'none',
                           background: '#16202b', color: '#fff', fontWeight: 600 }}>
            {ocupado ? 'Guardando…' : 'Subir'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FotosModule({ project, API, user, MultimediaLegacy }) {
  const urn = project?.scope_escritura || project?.model_urn || project?.id;
  const [pestana, setPestana] = useState('galeria');
  const [fotos, setFotos] = useState(null);
  const [albumes, setAlbumes] = useState([]);
  const [album, setAlbum] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = useCallback(async () => {
    if (!urn) return;
    try {
      const q = album ? `&album_id=${album}` : '';
      const [rf, ra] = await Promise.all([
        apiFetch(`${API}/api/fotos?model_urn=${encodeURIComponent(urn)}${q}`),
        apiFetch(`${API}/api/fotos/albumes?model_urn=${encodeURIComponent(urn)}`),
      ]);
      if (rf.ok) setFotos((await rf.json()).fotos || []);
      if (ra.ok) setAlbumes((await ra.json()).albumes || []);
    } catch (e) { setFotos([]); }
  }, [API, urn, album]);
  useEffect(() => { cargar(); }, [cargar]);

  const crearAlbum = async () => {
    const nombre = window.prompt('Nombre del álbum:');
    if (!nombre) return;
    const r = await apiFetch(`${API}/api/fotos/albumes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_urn: urn, nombre }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || 'No se pudo crear.'); return; }
    toast.success(`Álbum «${nombre}» creado.`);
    cargar();
  };

  if (pestana === 'multimedia' && MultimediaLegacy) {
    return (
      <div style={{ padding: '12px 16px' }}>
        <Pestanas pestana={pestana} setPestana={setPestana} />
        <MultimediaLegacy project={project} user={user} />
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1100, margin: '0 auto' }}>
      <Pestanas pestana={pestana} setPestana={setPestana} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                    flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 14px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={album} onChange={e => setAlbum(e.target.value)}
                  style={{ border: '1px solid #d5dde6', borderRadius: 6,
                           padding: '6px 9px', fontSize: 13 }}>
            <option value="">Todas las fotos</option>
            {albumes.map(a => (
              <option key={a.id} value={a.id}>{a.nombre} ({a.fotos})</option>
            ))}
          </select>
          <button onClick={crearAlbum} style={{ fontSize: 12.5, padding: '6px 10px',
                  borderRadius: 6, border: '1px solid #c8d4e3', background: '#fff' }}>
            + Álbum
          </button>
        </div>
        <button onClick={() => setSubiendo(true)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
                         background: '#16202b', color: '#fff', fontWeight: 600 }}>
          Subir fotos
        </button>
      </div>

      {fotos === null && <div style={{ padding: 40, textAlign: 'center',
                                       color: '#9aa7b4' }}>Cargando…</div>}
      {fotos && fotos.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#5a6b7d' }}>
          Todavía no hay fotos{album ? ' en este álbum' : ' en esta obra'}.
        </div>
      )}
      {fotos && fotos.length > 0 && (
        <div style={{ display: 'grid', gap: 10,
                      gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {fotos.map(f => <Miniatura key={f.id} API={API} foto={f} onAbrir={setAbierta} />)}
        </div>
      )}

      {abierta && <Visor API={API} foto={abierta}
                         onCerrar={() => setAbierta(null)}
                         onCambio={async () => {
                           await cargar();
                           const r = await apiFetch(`${API}/api/fotos/${abierta.id}`);
                           if (r.ok) setAbierta(await r.json());
                         }} />}
      {subiendo && <ModalSubir API={API} urn={urn} user={user} project={project}
                               onCerrar={() => setSubiendo(false)} onSubida={cargar} />}
    </div>
  );
}

function Pestanas({ pestana, setPestana }) {
  const estilo = (activa) => ({
    padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    border: '1px solid #c8d4e3',
    background: activa ? '#16202b' : '#fff', color: activa ? '#fff' : '#16202b',
  });
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button style={estilo(pestana === 'galeria')}
              onClick={() => setPestana('galeria')}>Galería de campo</button>
      <button style={estilo(pestana === 'multimedia')}
              onClick={() => setPestana('multimedia')}>Multimedia · WhatsApp</button>
    </div>
  );
}
