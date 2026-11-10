/**
 * «ALEPHIA DOCS» EN «IMPORTAR MODELO» (10-nov-2026, docs/archivos/29, F2). El dueño: «hagamos algo profesional para
 * también conectar Docs y poder vincular nuestros modelos de Docs».
 *
 * Elegir un modelo de la obra en Docs, prepararlo para el visor si su versión vigente aún no lo está (la traducción
 * de Docs, `/api/docs/cad/translate` y `/status`, con su permiso de plano), elegir la vista y vincularlo al frente
 * (`/api/config/project/add-from-docs`). El URN, el linaje y la versión los pone el servidor (backend/
 * modelos_de_docs.py): aquí solo se elige y se espera.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

const ESPERA_MS = 3000;
const FALLOS_TOLERADOS = 20;   // ~1 min: Render se reinicia y despierta a su ritmo (como el lector de Docs)

export default function ImportarDesdeDocs({ backendUrl, frente, onVinculado, onCerrar, ocupado, setOcupado }) {
  const [obra, setObra] = useState(null);             // {model_urn, nombre, formatos}
  const [migas, setMigas] = useState([]);             // [{id, nombre}], la raíz es []
  const [lista, setLista] = useState({ carpetas: [], modelos: [] });
  const [elegido, setElegido] = useState(null);       // {id, name}
  const [fase, setFase] = useState('elegir');         // elegir | preparando | vista | vinculando
  const [progreso, setProgreso] = useState('');
  const [vistas, setVistas] = useState([]);
  const [vista, setVista] = useState(null);
  const [urn, setUrn] = useState(null);
  const [error, setError] = useState('');
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

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
    const carpeta = migas.at(-1)?.id;
    const q = new URLSearchParams({ model_urn: obra.model_urn, ...(carpeta ? { id: carpeta } : {}) });
    pedir(`/api/docs/list?${q}`).then(({ ok, d }) => {
      if (!vivo.current) return;
      if (!ok || d.success === false) { setError(d.error || 'No se pudo abrir la carpeta.'); return; }
      const datos = d.data || {};
      const formatos = obra.formatos || [];
      setLista({
        carpetas: (datos.folders || []).filter(c => c.has_access !== false),
        modelos: (datos.files || []).filter(f => formatos.some(e => String(f.name || '').toLowerCase().endsWith(e))),
      });
    }).catch(() => vivo.current && setError('Sin conexión con el servidor.'));
  }, [obra, migas, pedir]);

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
    const { ok, d } = await traducir();
    if (!vivo.current) return;
    if (!ok || d.success === false) return rendirse(d.error || 'No se pudo preparar el modelo.');
    let estado = d;
    let fallos = 0;
    while (vivo.current && estado.status !== 'success') {
      if (['failed', 'timeout'].includes(estado.status)) {
        return rendirse(`Autodesk no pudo procesar este modelo${estado.detalle ? `: ${estado.detalle}` : '.'}`);
      }
      if (estado.status === 'none') return rendirse('La preparación no llegó a iniciarse. Vuelve a intentarlo.');
      setProgreso(fallos > 2 ? 'Reconectando con el servidor…'
        : estado.progress ? `Preparando para el visor · ${estado.progress}` : 'Preparando para el visor…');
      await new Promise(r => setTimeout(r, ESPERA_MS));
      if (!vivo.current) return;
      // El paquete con la imagen adjunta fracasó y el servidor ya se rindió con ella: se pide del modelo suelto.
      const s = estado.status === 'retry_plain' ? await traducir().catch(() => null)
        : await pedir(`/api/docs/cad/status?node_id=${encodeURIComponent(doc.id)}`).catch(() => null);
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
    const { ok, status, d } = await pedir('/api/config/project/add-from-docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: frente, documento: elegido.id, defaultViewGuid: v?.guid || null,
                             defaultViewName: v?.name || null }),
    });
    setOcupado?.(false);
    if (!vivo.current) return;
    if (!ok) {
      setError(d.message || d.error || (status === 409 ? 'Ese modelo ya está vinculado a este frente.' : 'No se pudo vincular.'));
      setFase('vista');
      return;
    }
    onVinculado?.(d.models || [], d.urn || urn, v?.guid || null, d.extraction_job_id || null);
    onCerrar?.();
  };

  if (!obra && !error) return <div className="import-docs-section"><p className="import-label">Abriendo el Docs de la obra…</p></div>;

  return (
    <div className="import-docs-section">
      {obra && fase === 'elegir' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
            <button type="button" className="import-btn-cancel" style={{ padding: '2px 6px' }} onClick={() => setMigas([])}>
              {obra.nombre || 'Docs'}</button>
            {migas.map((m, k) => (
              <React.Fragment key={m.id}>
                <span style={{ color: '#72706b' }}>/</span>
                <button type="button" className="import-btn-cancel" style={{ padding: '2px 6px' }}
                  onClick={() => setMigas(migas.slice(0, k + 1))}>{m.nombre}</button>
              </React.Fragment>
            ))}
          </div>
          <div className="import-tree-container" role="listbox" aria-label="Modelos de Docs">
            {lista.carpetas.map(c => (
              <div key={c.id} className="import-selector-option" role="option" aria-selected="false"
                onClick={() => setMigas([...migas, { id: c.id, nombre: String(c.name || '').replace(/\/$/, '') }])}>
                📁 {String(c.name || '').replace(/\/$/, '')}
              </div>
            ))}
            {lista.modelos.map(f => (
              <div key={f.id} role="option" aria-selected={elegido?.id === f.id}
                className={`import-selector-option ${elegido?.id === f.id ? 'active' : ''}`}
                onClick={() => setElegido({ id: f.id, name: f.name })}>
                {f.name}
                <span style={{ fontSize: 12, color: '#72706b', marginLeft: 'auto', paddingLeft: 12 }}>V{f.version || 1}</span>
              </div>
            ))}
            {!lista.carpetas.length && !lista.modelos.length && (
              <p style={{ padding: 12, color: '#72706b', fontSize: 13 }}>No hay modelos RVT, DWG, DXF, NWD, NWC ni IFC en esta carpeta.</p>
            )}
          </div>
        </>
      )}

      {fase === 'preparando' && (
        <div style={{ padding: '16px 0' }}>
          <div className="import-label">{elegido?.name}</div>
          <p style={{ color: '#52524d', fontSize: 13 }}>{progreso}</p>
        </div>
      )}

      {(fase === 'vista' || fase === 'vinculando') && (
        <div className="import-field">
          <label className="import-label">Vista de «{elegido?.name}»</label>
          <div className="import-tree-container" role="listbox" aria-label="Vistas del modelo">
            {vistas.map(v => (
              <div key={v.guid} role="option" aria-selected={vista === v.guid}
                className={`import-selector-option ${vista === v.guid ? 'active' : ''}`} onClick={() => setVista(v.guid)}>
                {v.name}
                <span style={{ fontSize: 12, color: '#72706b', marginLeft: 'auto', paddingLeft: 12 }}>{v.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#b93535', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
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
