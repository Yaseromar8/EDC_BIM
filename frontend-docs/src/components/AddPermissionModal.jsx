// AddPermissionModal — conceder acceso a una carpeta.
//
// UNA REGLA SE DIRIGE A UN SUJETO, Y HAY TRES CLASES
//   PERSONA               alcanza a esa persona y a nadie más
//   EMPRESA               alcanza a todas las personas de esa empresa
//   FUNCIÓN CONTRACTUAL   alcanza a toda empresa que participe con esa
//                         función en esta obra — INCLUIDAS LAS QUE ENTREN
//                         DESPUÉS. Es la más potente y la menos evidente,
//                         así que se advierte donde se elige, no en una
//                         ayuda que nadie abre.
//
// El motor (`permiso_documental`) resuelve los tres desde hace tiempo; este
// modal ofrecía únicamente un cuadro de texto donde escribir un correo, lo
// que obligaba a saberse la dirección de memoria y permitía dirigir una
// regla a alguien que ni participa en la obra. Ahora se elige de lo que
// existe AQUÍ (`/api/docs/sujetos-concedibles`).
import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import '../index.css';

// Rango de barras por nivel REAL del backend (folder_permissions.PERMISSION_LEVELS).
// Antes comparaba con 'view_only'/'create'/'create_upload' —nombres que ya no
// existen— así que las barras se pintaban mal para viewer/view_markup.
const PILL_RANK = { none: 0, viewer: 1, view_download: 2, view_markup: 3, edit: 3, admin: 4 };

export const ACCPillBars = ({ level }) => {
  const rank = PILL_RANK[level] ?? 0;
  return (
    <div className="acc-pill-bars">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`acc-pill-bar ${rank >= i ? 'active' : 'outline'}`}></div>
      ))}
    </div>
  );
};

const SUJETOS = [
  { tipo: 'USER', label: 'Persona', lista: 'personas',
    ayuda: 'Alcanza solo a esa persona.' },
  { tipo: 'COMPANY', label: 'Empresa', lista: 'empresas',
    ayuda: 'Alcanza a todas las personas de esa empresa.' },
  { tipo: 'CONTRACTUAL_FUNCTION', label: 'Función contractual', lista: 'funciones',
    ayuda: 'Alcanza a toda empresa que participe con esa función.' },
];

export default function AddPermissionModal({ folder, modelUrn, apiBaseUrl, onClose, onSuccess }) {
  const [tipo, setTipo] = useState('USER');
  const [sujetoId, setSujetoId] = useState('');
  const [level, setLevel] = useState('view_download');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [catalogo, setCatalogo] = useState(null);

  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  useEffect(() => {
    apiFetch(`${apiBaseUrl}/api/docs/sujetos-concedibles?folder_id=${folder.id}&model_urn=${encodeURIComponent(modelUrn)}`)
      .then(r => r.json())
      .then(d => setCatalogo(d.success ? d : { personas: [], empresas: [], funciones: [] }))
      .catch(() => setCatalogo({ personas: [], empresas: [], funciones: [] }));
  }, [folder?.id, modelUrn, apiBaseUrl]);

  // Niveles EXACTOS que reconoce el backend (folder_permissions.PERMISSION_LEVELS).
  // Antes el modal ofrecía view_only/create/create_upload que NO existen en el
  // backend -> "Nivel inválido" al otorgar (el default view_only siempre fallaba).
  //
  // `Restringido` (none) es una CONCESIÓN legítima, no la ausencia de una: es
  // como se reserva una carpeta a quien tiene acceso concedido más arriba.
  const PERMISSION_LEVELS = [
    { value: 'none', label: 'Restringido', desc: 'Deniega el acceso aquí, aunque lo tenga concedido más arriba' },
    { value: 'viewer', label: 'Ver', desc: 'Solo ver archivos' },
    { value: 'view_download', label: 'Ver y descargar', desc: 'Ver y descargar archivos' },
    { value: 'view_markup', label: 'Comentar', desc: 'Ver, descargar y publicar marcas de revisión' },
    { value: 'edit', label: 'Editar', desc: 'Ver, descargar, marcar y subir/editar archivos' },
    { value: 'admin', label: 'Administrar', desc: 'Control total, incluida eliminación y permisos' }
  ];

  const selectedOption = PERMISSION_LEVELS.find(l => l.value === level);
  const sujetoActual = SUJETOS.find(s => s.tipo === tipo);
  const opciones = (catalogo && catalogo[sujetoActual.lista]) || [];
  const elegido = opciones.find(o => String(o.sujeto_id) === String(sujetoId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sujetoId) {
      setError('Elige a quién se concede.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/docs/folder-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_id: folder.id,
          model_urn: modelUrn,
          sujeto_tipo: tipo,
          sujeto_id: sujetoId,
          permission_level: level
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || "No se pudo conceder el permiso.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-permission-modal-overlay" onClick={onClose}>
      <div className="add-permission-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Conceder acceso</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-alert">{error}</div>}

            <div className="form-group">
              <label>¿A quién?</label>
              {/* Las tres clases de sujeto, a la vista. Elegir una cambia la
                  lista de abajo — no hay un campo de texto que acepte
                  cualquier cosa. */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {SUJETOS.map(s => (
                  <button
                    key={s.tipo}
                    type="button"
                    onClick={() => { setTipo(s.tipo); setSujetoId(''); }}
                    style={{
                      flex: 1, padding: '7px 8px', fontSize: 12.5, borderRadius: 5,
                      cursor: 'pointer',
                      border: `1px solid ${tipo === s.tipo ? 'var(--accent)' : '#ddd'}`,
                      background: tipo === s.tipo ? 'var(--accent)' : '#fff',
                      color: tipo === s.tipo ? '#fff' : '#555',
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>

              <select value={sujetoId} onChange={e => setSujetoId(e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd',
                               borderRadius: 5, fontSize: 13 }}>
                <option value="">
                  {catalogo === null ? 'Cargando…' : `Elegir ${sujetoActual.label.toLowerCase()}…`}
                </option>
                {opciones.map(o => (
                  <option key={o.sujeto_id} value={o.sujeto_id}>
                    {o.nombre}{o.detalle ? ` — ${o.detalle}` : ''}
                  </option>
                ))}
              </select>
              <span className="help-text">{sujetoActual.ayuda}</span>

              {/* EL ALCANCE FUTURO, donde se decide. Una regla de función no
                  se concede a un conjunto de personas: se concede a un PAPEL,
                  y quien adopte ese papel mañana entra sin que nadie lo
                  vuelva a mirar. Es lo que la hace útil y lo que la hace
                  peligrosa. */}
              {tipo === 'CONTRACTUAL_FUNCTION' && (
                <div role="note" style={{
                  marginTop: 10, background: '#fffbeb', border: '1px solid #fde68a',
                  color: '#92400e', borderRadius: 6, padding: '9px 11px', fontSize: 12,
                  lineHeight: 1.5,
                }}>
                  <b>Alcanza también a quien llegue después.</b> Cualquier empresa que
                  se incorpore a esta obra con la función <b>{elegido ? elegido.nombre : 'elegida'}</b> —
                  y todas sus personas— tendrá este permiso automáticamente, sin que
                  nadie vuelva a revisarlo.
                </div>
              )}
              {tipo === 'COMPANY' && elegido && (
                <div role="note" style={{
                  marginTop: 10, background: '#f8fafc', border: '1px solid #e2e8f0',
                  color: '#475569', borderRadius: 6, padding: '9px 11px', fontSize: 12,
                }}>
                  Alcanza a <b>todas las personas de {elegido.nombre}</b> en esta obra,
                  también a las que se incorporen después.
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Permisos*</label>
              <div className="acc-custom-select" ref={dropdownRef}>
                <div
                  className={`acc-select-trigger ${isOpen ? 'open' : ''}`}
                  onClick={() => setIsOpen(!isOpen)}
                >
                  <div className="trigger-content">
                    <ACCPillBars level={selectedOption.value} />
                    <span>{selectedOption.label}</span>
                  </div>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </div>

                {isOpen && (
                  <div className="acc-select-dropdown">
                    {PERMISSION_LEVELS.map(lvl => (
                      <div
                        key={lvl.value}
                        className="acc-select-option"
                        onClick={() => {
                          setLevel(lvl.value);
                          setIsOpen(false);
                        }}
                      >
                        <ACCPillBars level={lvl.value} />
                        <div className="option-text">
                          <span className="opt-title">{lvl.label}</span>
                          <span className="opt-desc">{lvl.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !sujetoId}>
              {loading ? 'Guardando…' : 'Conceder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
