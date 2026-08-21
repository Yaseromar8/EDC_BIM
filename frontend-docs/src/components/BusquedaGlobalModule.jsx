// BusquedaGlobalModule — encontrar un documento sin saber en qué carpeta está.
//
// QUÉ RESUELVE
// En una obra con miles de planos, el filtro de la barra superior sólo mira la
// carpeta abierta: para encontrar «DRE-PL-0012» había que saber ya dónde vive.
// Esto busca en TODA la obra —y sólo en ella—.
//
// LO QUE NO ES
// No es un buscador enterprise. No hay índice externo, ni embeddings, ni
// búsqueda semántica: es PostgreSQL sobre las columnas que ya existen
// (`name`, `tags`, `metadata`). Medido con 5.008 documentos: 68 ms el peor
// caso, así que no hacía falta nada más.
//
// LO QUE NO SE ENSEÑA
// Un documento sobre cuya carpeta no se tiene permiso no aparece —ni su
// nombre, ni su ruta, ni sus metadatos, ni el hecho de que exista—. Eso lo
// decide el servidor DENTRO de la consulta; aquí no se filtra nada, porque un
// filtro en el navegador no es una barrera.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import useDocPreview from '../hooks/useDocPreview';
// El estado se pinta con el VOCABULARIO COMUN, no con un mapa propio. La
// primera version de esta pantalla se invento sus colores y lo cazo
// `test_ningun_modulo_se_inventa_el_color_de_un_estado`: el mismo estado se
// habria visto de un color en Archivos y de otro aqui.
import { Ficha } from '../utils/estadosECD';

export default function BusquedaGlobalModule({ project }) {
  const obra = project?.id;
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);   // null = todavía no se buscó
  const [buscando, setBuscando] = useState(false);
  const [truncado, setTruncado] = useState(false);
  const [preview, abrir, cerrar] = useDocPreview(obra);
  const peticion = useRef(0);

  const buscar = useCallback(async (q) => {
    if (!obra) return;
    if ((q || '').trim().length < 2) { setResultados(null); setTruncado(false); return; }
    // Cada búsqueda lleva número: si vuelve una vieja después de una nueva, se
    // descarta. Sin esto, teclear rápido puede dejar en pantalla el resultado
    // de una consulta anterior.
    const mia = ++peticion.current;
    setBuscando(true);
    try {
      const r = await apiFetch(
        `${API}/api/docs/global-search?model_urn=${encodeURIComponent(obra)}` +
        `&q=${encodeURIComponent(q.trim())}`);
      const d = await r.json();
      if (mia !== peticion.current) return;
      if (!r.ok) throw new Error(d.error || 'No se pudo buscar');
      setResultados(d.results || []);
      setTruncado(Boolean(d.truncado));
    } catch (e) {
      if (mia === peticion.current) {
        toast.error(e.message || 'No se pudo buscar');
        setResultados([]);
      }
    } finally {
      if (mia === peticion.current) setBuscando(false);
    }
  }, [obra]);

  // Se espera a que la persona deje de teclear: una consulta por pulsación
  // sería una consulta por pulsación.
  useEffect(() => {
    const t = setTimeout(() => buscar(texto), 280);
    return () => clearTimeout(t);
  }, [texto, buscar]);

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <div style={{ fontSize: 24, fontWeight: 300, marginBottom: 4 }}>Buscar documentos</div>
      <div style={{ fontSize: 12.5, color: '#777', marginBottom: 20, maxWidth: 720 }}>
        Busca en <b>toda esta obra</b> por nombre, código, etiqueta o metadatos.
        Sólo aparece lo que puedes ver.
      </div>

      <div style={{ position: 'relative', maxWidth: 560, marginBottom: 22 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999"
             strokeWidth="2" strokeLinecap="round"
             style={{ position: 'absolute', left: 11, top: 11 }}>
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          autoFocus
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="500125-PQ08-DRE-PL-0012, buzones, SANITARIA…"
          style={{ width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
                   border: '1px solid #ddd', borderRadius: 6, fontSize: 14,
                   outline: 'none' }}
        />
      </div>

      {texto.trim().length === 1 && (
        <div style={{ fontSize: 12.5, color: '#999' }}>
          Escribe al menos dos caracteres.
        </div>
      )}

      {buscando && (
        <div style={{ fontSize: 13, color: '#888' }}>Buscando…</div>
      )}

      {!buscando && resultados !== null && resultados.length === 0 && (
        <div style={{ padding: '16px 18px', background: '#fafbfc',
                      border: '1px dashed #ddd', borderRadius: 8,
                      fontSize: 13, color: '#777', maxWidth: 720 }}>
          Ningún documento de esta obra coincide con «{texto.trim()}»
          {/* Se dice también la otra posibilidad, sin revelar nada: que exista
              y no se pueda ver es indistinguible de que no exista, y así debe
              ser -- pero quien busca merece saber que esa puerta existe. */}
          <div style={{ marginTop: 5, fontSize: 12, opacity: .85 }}>
            Si crees que debería estar, puede vivir en una carpeta a la que no
            tienes acceso. Pídeselo a quien administra la obra.
          </div>
        </div>
      )}

      {!buscando && resultados !== null && resultados.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            {resultados.length} documento{resultados.length !== 1 ? 's' : ''}
            {truncado && ' (se muestran los más recientes)'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid #eee', color: '#888',
                                fontWeight: 500 }}>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Documento</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Carpeta</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Estado</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Versión</th>
              <th style={{ padding: '9px 12px', textAlign: 'left' }}>Actualizado</th>
            </tr></thead>
            <tbody>
              {resultados.map(it => (
                <tr key={it.node_id}
                    onClick={() => abrir(it)}
                    style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                    onMouseOver={e => (e.currentTarget.style.background = '#fafbfc')}
                    onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                  <td style={{ padding: '11px 12px', fontWeight: 500 }}>{it.name}</td>
                  <td style={{ padding: '11px 12px', color: '#666', fontSize: 12 }}>
                    {it.ruta || <span style={{ color: '#ccc' }}>raíz</span>}
                  </td>
                  <td style={{ padding: '11px 12px' }}>
                    {it.status ? <Ficha estado={it.status} tamano="pequena" />
                               : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 12px', color: '#666', fontSize: 12 }}>
                    {/* La VIGENTE. Un documento heredado no tiene versión propia:
                        lo vigente es el nodo, y se dice así en vez de fingir. */}
                    {it.version_id ? `v${it.version_number}` : 'versión actual'}
                  </td>
                  <td style={{ padding: '11px 12px', color: '#999', fontSize: 12 }}>
                    {it.updated_at ? new Date(it.updated_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {preview && (
        <div
          onClick={e => { if (e.target === e.currentTarget) cerrar(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
                   backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex',
                   alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '85vw',
                        height: '85vh', maxWidth: 1200, maxHeight: 900,
                        display: 'flex', flexDirection: 'column',
                        boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', padding: '12px 16px',
                          borderBottom: '1px solid #eee' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{preview.name}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <a href={preview.url} target="_blank" rel="noreferrer"
                   style={{ fontSize: 12, color: 'var(--accent)' }}>Abrir aparte</a>
                <button onClick={cerrar}
                        style={{ border: 'none', background: 'none', fontSize: 20,
                                 cursor: 'pointer', color: '#666' }}>×</button>
              </div>
            </div>
            <iframe title={preview.name} src={preview.url}
                    style={{ flex: 1, border: 'none', borderRadius: '0 0 12px 12px' }} />
          </div>
        </div>
      )}
    </div>
  );
}
