// AccesoAHerramientas — CAPA 08 · a qué herramientas entra esta persona AQUÍ.
//
// Se abre desde Participantes, junto a la persona: es un dato SUYO en esta
// obra, no una configuración global.
//
// LAS DOS CAPAS SE ENSEÑAN POR SEPARADO, A PROPÓSITO:
//
//   «apagada en la obra»  →  no la tiene NADIE (capa 16). Se arregla en
//                            Configuración de la obra.
//   «retirada a esta       →  la tienen otros y a ella no (capa 08). Se
//    persona»                 arregla aquí.
//
// Fundirlas en un solo interruptor sería el atajo que borra la distinción, y
// quien administra necesita saber CUÁL de las dos le falta para poder
// arreglarlo en el sitio correcto.
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

export default function AccesoAHerramientas({ obra, persona, onClose }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(null);

  const cargar = async () => {
    setError('');
    try {
      const r = await apiFetch(
        `${API}/api/projects/${encodeURIComponent(obra)}/miembros/${persona.id}/herramientas`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setFilas(d.herramientas || []);
    } catch (e) {
      setFilas([]);
      setError(e.message || 'No se pudo cargar el acceso a herramientas.');
    }
  };

  useEffect(() => { cargar(); }, [obra, persona?.id]);

  const cambiar = async (h, permitido) => {
    setGuardando(h.codigo);
    try {
      const r = await apiFetch(
        `${API}/api/projects/${encodeURIComponent(obra)}/miembros/${persona.id}/herramientas/${h.codigo}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permitido }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar.');
      setFilas(prev => prev.map(x => x.codigo === h.codigo
        ? { ...x, acceso_del_miembro: permitido,
            efectivo: permitido && x.activa_en_la_obra }
        : x));
      toast.success(permitido
        ? `${persona.name || persona.email} entra a ${h.etiqueta}`
        : `${persona.name || persona.email} deja de entrar a ${h.etiqueta}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h3 style={{ margin: 0 }}>Acceso a herramientas</h3>
        <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
          {persona.name || persona.email} · en esta obra
        </div>
        <p style={{ fontSize: 12.3, color: '#777', margin: '10px 0 14px', lineHeight: 1.55 }}>
          A qué herramientas entra esta persona <b>aquí</b>. Esto no le da ningún
          documento —eso lo decide el permiso de cada carpeta— ni la saca de la
          obra. Y una herramienta <b>apagada para toda la obra</b> no se arregla
          desde aquí: se enciende en <b>Configuración</b>.
        </p>

        {error && (
          <div role="alert" style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 6,
                                     background: '#fef2f2', border: '1px solid #fecaca',
                                     color: '#991b1b', fontSize: 12.5 }}>
            {error} <b>La lista está incompleta</b>, no vacía.
          </div>
        )}

        {filas === null ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>
            Cargando…
          </div>
        ) : (
          <div>
            {filas.map(h => {
              const apagada = !h.activa_en_la_obra;
              return (
                <div key={h.codigo}
                     style={{ display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 2px', borderBottom: '1px solid #f2f4f6' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500,
                                   color: h.efectivo ? '#222' : '#98a1ab' }}>
                      {h.etiqueta}
                    </span>
                    {apagada && (
                      <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 10,
                                     fontSize: 10.5, fontWeight: 600,
                                     background: '#f3f4f6', color: '#6b7280' }}>
                        APAGADA EN LA OBRA
                      </span>
                    )}
                    {!apagada && !h.acceso_del_miembro && (
                      <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 10,
                                     fontSize: 10.5, fontWeight: 600,
                                     background: '#fff8e6', color: '#b45309' }}>
                        RETIRADA A ESTA PERSONA
                      </span>
                    )}
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                                  fontSize: 12, color: apagada ? '#b6bec6' : '#555',
                                  cursor: apagada ? 'not-allowed'
                                        : guardando === h.codigo ? 'wait' : 'pointer' }}
                         title={apagada
                           ? 'Apagada para toda la obra: se enciende en Configuración'
                           : undefined}>
                    <input type="checkbox" checked={h.acceso_del_miembro}
                           disabled={apagada || guardando === h.codigo || Boolean(error)}
                           onChange={e => cambiar(h, e.target.checked)} />
                    {h.acceso_del_miembro ? 'Entra' : 'No entra'}
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
