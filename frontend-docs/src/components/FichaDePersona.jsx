// FichaDePersona — P4 del diseño de Identity & Access UX.
//
// La escalera de una persona, en una sola vista: persona → entidad → sus
// obras → empresa → función por obra → qué administra.
//
// SOLO LECTURA A PROPÓSITO. Cada dato se edita donde vive: el perfil del
// sistema en «Usuarios», la empresa y la función en Participantes de cada
// obra, la administración en su obra. Esta ficha junta; no duplica caminos
// de edición que luego se desincronizan.
//
// Y la regla de la casa, visible aquí también: el PERFIL DEL SISTEMA y la
// FUNCIÓN CONTRACTUAL nunca se presentan como si fueran variantes de la misma
// cosa — perfil arriba (de la entidad), función dentro de cada obra (del par
// empresa–obra).
import React, { useEffect, useState } from 'react';
import { API, formatDate } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const ETIQUETA_ROL = { admin: 'Administrador de la entidad', user: 'Usuario', editor: 'Editor', viewer: 'Lector' };

function Chip({ children, tono = '#f1f0e8', color = '#333330' }) {
  return (
    <span style={{ padding: '2px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, background: tono, color }}>
      {children}
    </span>
  );
}

export default function FichaDePersona({ userId, onClose }) {
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    apiFetch(`${API}/api/users/${userId}/ficha`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || 'No se pudo cargar')))
      .then(d => { if (vigente) setFicha(d); })
      .catch(e => { if (vigente) setError(String(e)); });
    return () => { vigente = false; };
  }, [userId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        {!ficha && !error && <div style={{ padding: 24, textAlign: 'center', color: '#72706b' }}>Cargando…</div>}
        {ficha && (
          <>
            {/* ── La persona ── */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <h3 style={{ margin: 0 }}>{ficha.name || '(sin nombre)'}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {!ficha.activa && <Chip tono="#f1f0e8" color="#72706b">DESACTIVADA</Chip>}
                {ficha.activa && ficha.pendiente && <Chip tono="#faf9f5" color="#9e5943">PENDIENTE</Chip>}
                {ficha.dos_pasos && <Chip tono="#e0e3d7" color="#0e6e53">2FA</Chip>}
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#72706b', marginTop: 2 }}>{ficha.email}</div>

            {/* ── En la entidad ── */}
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 13 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#72706b', letterSpacing: '0.04em', marginBottom: 8 }}>EN LA ENTIDAD</div>
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '6px 12px' }}>
                <span style={{ color: '#72706b' }}>Perfil del sistema</span>
                <span>{ETIQUETA_ROL[ficha.perfil_del_sistema] || ficha.perfil_del_sistema}</span>
                <span style={{ color: '#72706b' }}>Empresa</span>
                <span>{ficha.empresa?.name || <i style={{ color: '#72706b' }}>sin empresa</i>}
                  <span style={{ color: '#72706b', fontSize: 12 }}> — la empresa es de la persona, la misma en todas las obras</span></span>
                <span style={{ color: '#72706b' }}>Cargo</span>
                <span>{ficha.cargo || <i style={{ color: '#72706b' }}>—</i>}</span>
                <span style={{ color: '#72706b' }}>Alta</span>
                <span>{ficha.alta ? formatDate(ficha.alta) : '—'}</span>
                <span style={{ color: '#72706b' }}>Último acceso</span>
                <span>{ficha.ultimo_acceso ? formatDate(ficha.ultimo_acceso) : <i style={{ color: '#72706b' }}>nunca</i>}</span>
              </div>
            </div>

            {/* ── Sus obras ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#72706b', letterSpacing: '0.04em', marginBottom: 8 }}>
                SUS OBRAS ({ficha.obras.length})
              </div>
              {ficha.obras.length === 0 ? (
                <div style={{ fontSize: 13, color: '#72706b', padding: '8px 2px' }}>
                  No participa en ninguna obra. {ficha.es_entity_admin && 'Como Administrador de la entidad las alcanza todas sin membresía.'}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f1f0e8', color: '#72706b', fontWeight: 500, textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Obra</th>
                      <th style={{ padding: '6px 8px' }}>Función contractual</th>
                      <th style={{ padding: '6px 8px' }}>Administra</th>
                      <th style={{ padding: '6px 8px' }}>Desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ficha.obras.map(o => (
                      <tr key={o.id} style={{ borderBottom: '1px solid #f1f0e8' }}>
                        <td style={{ padding: '8px' }}>{o.name}</td>
                        <td style={{ padding: '8px' }}>
                          {o.funcion_contractual
                            ? <Chip tono="#f1f0e8" color="#507294">{o.funcion_contractual}</Chip>
                            : <i style={{ color: '#cccac0', fontSize: 12 }}>sin función declarada</i>}
                        </td>
                        <td style={{ padding: '8px' }}>{o.administra ? <Chip tono="#f1f0e8" color="#507294">ESTA OBRA</Chip> : '—'}</td>
                        <td style={{ padding: '8px', color: '#72706b', fontSize: 12 }}>{o.desde ? formatDate(o.desde) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 11.5, color: '#72706b', lineHeight: 1.5 }}>
              Esta ficha es de <b>solo lectura</b>: el perfil se cambia en Usuarios, la empresa y la
              función en Participantes de cada obra, y la administración en su obra. La función
              contractual describe en qué calidad participa su empresa — <b>no concede permisos</b>.
            </p>

            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
