/**
 * «ALEPHIA DOCS» EN «IMPORTAR MODELO» (10-nov-2026, docs/archivos/29, F2). El dueño: «hagamos algo profesional para
 * también conectar Docs y poder vincular nuestros modelos de Docs».
 *
 * Elegir un modelo de la obra en Docs, prepararlo para el visor si su versión vigente aún no lo está (la traducción
 * de Docs, `/api/docs/cad/translate` y `/status`, con su permiso de plano), elegir la vista y vincularlo al frente
 * (`/api/config/project/add-from-docs`). El URN, el linaje y la versión los pone el servidor (backend/
 * modelos_de_docs.py): aquí solo se elige y se espera.
 *
 * Lo que cuida (revisión del 10-nov-2026):
 * - Una carpeta lenta no pinta su contenido bajo otra: cada listado lleva su turno y el viejo se descarta.
 * - Cerrar o cambiar de pestaña a media preparación no deja el modal bloqueado (`setOcupado(false)` al desmontar).
 * - Un vínculo que el servidor ya hizo llega al visor aunque el usuario haya cerrado el modal mientras tanto.
 * - Filas que son botones: se recorren y se eligen con el teclado.
 * - La espera tiene tope: un modelo enorme sigue preparándose en Docs y se vincula después, sin dejar la pantalla
 *   sondeando para siempre.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

const ESPERA_MS = 3000;
const FALLOS_TOLERADOS = 20;              // ~1 min: Render se reinicia y despierta a su ritmo (como el lector de Docs)
const TOPE_DE_ESPERA_MS = 20 * 60 * 1000; // la traducción sigue en Docs; esta pantalla deja de esperarla
const sinBarra = (nombre) => String(nombre || '').replace(/\/$/, '');

function icono(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.endsWith('.rvt') || n.endsWith('.ifc') || n.endsWith('.nwd') || n.endsWith('.nwc')) return 'fas fa-cube';
  if (n.endsWith('.dwg') || n.endsWith('.dxf')) return 'fas fa-drafting-compass';
  return 'fas fa-file-alt';
}

// El aspecto de botón lo quita `button.import-selector-option` (ImportModelModal.css), que pierde frente a `.active`.
const fila = { display: 'flex', alignItems: 'center', gap: 8 };
// Hereda el color de la fila (gris en reposo, claro sobre la seleccion): un gris fijo desaparecia sobre el azul.
const secundario = { fontSize: 12, opacity: 0.75, marginLeft: 'auto', paddingLeft: 12, flexShrink: 0 };

export default function ImportarDesdeDocs({ backendUrl, frente, onVinculado, onCerrar, ocupado, setOcupado }) {
  const [obra, setObra] = useState(null);             // {model_urn, nombre, formatos}
  const [migas, setMigas] = useState([]);             // [{id, nombre}], la raíz es []
  const [lista, setLista] = useState({ carpetas: [], modelos: [] });
  const [cargando, setCargando] = useState(false);
  const [elegido, setElegido] = useState(null);       // {id, name}
  const [fase, setFase] = useState('elegir');         // elegir | preparando | vista | vinculando
  const [progreso, setProgreso] = useState('');
  const [vistas, setVistas] = useState([]);
  const [vista, setVista] = useState(null);
  const [urn, setUrn] = useState(null);
  const [error, setError] = useState('');
  const vivo = useRef(true);
  const turno = useRef(0);                            // el listado vigente; los anteriores se descartan
  const ocupar = useRef(setOcupado);
  ocupar.current = setOcupado;

  useEffect(() => () => {
    vivo.current = false;
    ocupar.current?.(false);                          // cerrar a media preparación no deja el modal bloqueado
  }, []);

  const pedir = useCallback(async (ruta, opciones) => {
    const r = await apiFetch(`${backendUrl}${ruta}`, opciones);
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  }, [backendUrl]);

  // La obra de Docs del frente.
  useEffect(() => {
    if (!frente) return;
    pedir(`/api/config/project/docs-obra?project=${encodeURIComponent(frente)}`).then(({ ok, d }) => {
      if (!vivo.current) return;
      if (ok && d.success) setObra(d);
      else setError(d.error || 'No se pudo abrir el Docs de esta obra.');
    }).catch(() => vivo.current && setError('Sin conexión con el servidor.'));
  }, [frente, pedir]);

  // El contenido de la carpeta abierta: subcarpetas y solo los modelos que el visor federa.
  useEffect(() => {
    if (!obra) return;
    const mio = ++turno.current;
    const carpeta = migas.at(-1)?.id;
    // `enlaces=0`: aquí solo hacen falta nombres y versiones; firmar una descarga por fichero era lo lento.
    const q = new URLSearchParams({ model_urn: obra.model_urn, enlaces: '0', ...(carpeta ? { id: carpeta } : {}) });
    setCargando(true);
    pedir(`/api/docs/list?${q}`).then(({ ok, d }) => {
      if (!vivo.current || mio !== turno.current) return;
      if (!ok || d.success === false) { setError(d.error || 'No se pudo abrir la carpeta.'); return; }
      const datos = d.data || {};
      const formatos = obra.formatos || [];
      setLista({
        carpetas: (datos.folders || []).filter(c => c.has_access !== false),
        modelos: (datos.files || []).filter(f => formatos.some(e => String(f.name || '').toLowerCase().endsWith(e))),
      });
    }).catch(() => vivo.current && mio === turno.current && setError('Sin conexión con el servidor.'))
      .finally(() => vivo.current && mio === turno.current && setCargando(false));
  }, [obra, migas, pedir]);

  const irA = (nuevasMigas) => { setMigas(nuevasMigas); setElegido(null); setError(''); };

  // Elegida la versión preparada: sus vistas, la 3D primero.
  const cargarVistas = useCallback(async (u) => {
    const { status, d } = await pedir(`/api/inventory/viewables/${encodeURIComponent(u)}`);
    if (!vivo.current) return;
    if (status === 202 || !(d.views || []).length) {
      setError('Autodesk aún está procesando este modelo. Inténtalo de nuevo en unos minutos.');
      setFase('elegir'); setOcupado?.(false);
      return;
    }
    setVistas(d.views);
    setVista((d.views.find(v => v.is3D) || d.views[0]).guid);
    setFase('vista'); setOcupado?.(false);
  }, [pedir, setOcupado]);

  // Preparar para el visor: la traducción de Docs, que no gasta nada si ya está hecha.
  const preparar = useCallback(async (doc) => {
    const rendirse = (texto) => { setError(texto); setFase('elegir'); setOcupado?.(false); };
    const traducir = () => pedir('/api/docs/cad/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node_id: doc.id }),
    });
    setError(''); setFase('preparando'); setProgreso('Comprobando el modelo…'); setOcupado?.(true);
    const desde = Date.now();
    const primera = await traducir().catch(() => null);
    if (!vivo.current) return;
    if (!primera || !primera.ok || primera.d.success === false) {
      return rendirse(primera?.d?.error || 'No se pudo preparar el modelo.');
    }
    let estado = primera.d;
    let fallos = 0;
    while (vivo.current && estado.status !== 'success') {
      if (['failed', 'timeout'].includes(estado.status)) {
        return rendirse(`Autodesk no pudo procesar este modelo${estado.detalle ? `: ${estado.detalle}` : '.'}`);
      }
      if (estado.status === 'none') return rendirse('La preparación no llegó a iniciarse. Vuelve a intentarlo.');
      if (Date.now() - desde > TOPE_DE_ESPERA_MS) {
        return rendirse('El modelo sigue preparándose en Docs. Vuelve a vincularlo dentro de un rato: '
          + 'lo que ya se hizo no se repite.');
      }
      setProgreso(fallos > 2 ? 'Reconectando con el servidor…'
        : estado.progress ? `Preparando para el visor · ${estado.progress}` : 'Preparando para el visor…');
      await new Promise(r => setTimeout(r, ESPERA_MS));
      if (!vivo.current) return;
      // El paquete con la imagen adjunta fracasó y el servidor ya se rindió con ella: se pide del modelo suelto.
      const s = estado.status === 'retry_plain' ? await traducir().catch(() => null)
        : await pedir(`/api/docs/cad/status?node_id=${encodeURIComponent(doc.id)}`).catch(() => null);
      if (!vivo.current) return;
      if (!s || !s.ok || s.d.success === false) {
        // El primer 502 no es el final: la preparación sigue viva en Autodesk.
        if (++fallos > FALLOS_TOLERADOS) return rendirse(s?.d?.error || 'Se perdió el estado de la preparación.');
        continue;
      }
      fallos = 0;
      estado = s.d;
    }
    if (!vivo.current) return;
    setUrn(estado.urn);
    setProgreso('Leyendo sus vistas…');
    await cargarVistas(estado.urn);
  }, [pedir, cargarVistas, setOcupado]);

  const vincular = async () => {
    const v = vistas.find(x => x.guid === vista);
    setFase('vinculando'); setError(''); setOcupado?.(true);
    const r = await pedir('/api/config/project/add-from-docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: frente, documento: elegido.id, defaultViewGuid: v?.guid || null,
                             defaultViewName: v?.name || null }),
    }).catch(() => null);
    if (r?.ok) {
      // El vínculo ya está hecho en el servidor: el visor se entera AUNQUE este panel se haya cerrado.
      onVinculado?.(r.d.models || [], r.d.urn || urn, v?.guid || null, r.d.extraction_job_id || null);
      if (vivo.current) { setOcupado?.(false); onCerrar?.(); }
      return;
    }
    if (!vivo.current) return;
    setOcupado?.(false);
    setError(r?.d?.message || r?.d?.error
      || (r?.status === 409 ? 'Ese modelo ya está vinculado a este frente.' : 'No se pudo vincular.'));
    setFase('vista');
  };

  if (!obra && !error) return <div className="import-docs-section"><p className="import-label">Abriendo el Docs de la obra…</p></div>;

  return (
    <div className="import-docs-section">
      {obra && fase === 'elegir' && (
        <>
          <nav aria-label="Ruta en Docs" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                                                  fontSize: 13, marginBottom: 8 }}>
            <button type="button" className="import-btn-cancel" style={{ padding: '2px 6px' }} onClick={() => irA([])}>
              {obra.nombre || 'Docs'}</button>
            {migas.map((m, k) => (
              <React.Fragment key={m.id}>
                <span aria-hidden="true" style={{ color: '#72706b' }}>/</span>
                <button type="button" className="import-btn-cancel" style={{ padding: '2px 6px' }}
                  aria-current={k === migas.length - 1 ? 'location' : undefined}
                  onClick={() => irA(migas.slice(0, k + 1))}>{m.nombre}</button>
              </React.Fragment>
            ))}
          </nav>
          <div className="import-tree-container" aria-busy={cargando}>
            {lista.carpetas.map(c => (
              <button type="button" key={c.id} className="import-selector-option" style={fila}
                onClick={() => irA([...migas, { id: c.id, nombre: sinBarra(c.name) }])}>
                <i className="fas fa-folder" aria-hidden="true" style={{ color: '#FFC107', width: 16 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sinBarra(c.name)}</span>
              </button>
            ))}
            {lista.modelos.map(f => (
              <button type="button" key={f.id} aria-pressed={elegido?.id === f.id}
                className={`import-selector-option ${elegido?.id === f.id ? 'active' : ''}`} style={fila}
                onClick={() => setElegido({ id: f.id, name: f.name })}
                onDoubleClick={() => { setElegido({ id: f.id, name: f.name }); preparar({ id: f.id, name: f.name }); }}>
                <i className={icono(f.name)} aria-hidden="true" style={{ opacity: 0.75, width: 16 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={secundario}>V{f.version || 1}</span>
              </button>
            ))}
            {!cargando && !lista.carpetas.length && !lista.modelos.length && (
              <p style={{ padding: 12, color: '#72706b', fontSize: 13 }}>No hay modelos RVT, DWG, DXF, NWD, NWC ni IFC en esta carpeta.</p>
            )}
          </div>
        </>
      )}

      {fase === 'preparando' && (
        <div style={{ padding: '16px 0' }} role="status" aria-live="polite">
          <div className="import-label">{elegido?.name}</div>
          <p style={{ color: '#52524d', fontSize: 13 }}>{progreso}</p>
        </div>
      )}

      {(fase === 'vista' || fase === 'vinculando') && (
        <div className="import-field">
          <div className="import-label" id="vistas-de-docs">Vista de «{elegido?.name}»</div>
          <div className="import-tree-container" role="group" aria-labelledby="vistas-de-docs">
            {vistas.map(v => (
              <button type="button" key={v.guid} aria-pressed={vista === v.guid} disabled={fase === 'vinculando'}
                className={`import-selector-option ${vista === v.guid ? 'active' : ''}`} style={fila}
                onClick={() => setVista(v.guid)}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                <span style={secundario}>{v.is3D ? '3D' : '2D'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#b93535', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        {fase === 'vista' && (
          <button type="button" className="import-btn-cancel" onClick={() => { setFase('elegir'); setError(''); }}>
            Elegir otro modelo</button>
        )}
        {fase === 'elegir' && (
          <button type="button" className="import-btn-primary" disabled={!elegido || ocupado} onClick={() => preparar(elegido)}>
            Siguiente</button>
        )}
        {(fase === 'vista' || fase === 'vinculando') && (
          <button type="button" className="import-btn-primary" disabled={!vista || fase === 'vinculando'} onClick={vincular}>
            {fase === 'vinculando' ? 'Vinculando…' : 'Vincular al frente'}</button>
        )}
      </div>
    </div>
  );
}
