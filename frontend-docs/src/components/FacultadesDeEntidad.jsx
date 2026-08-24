// FacultadesDeEntidad — CAPA 15 · delegación acotada al nivel de la entidad.
//
// EL PROBLEMA QUE RESUELVE, dicho donde se usa: antes solo había dos
// posibilidades — «usuario normal» o «Administrador de la entidad», que lo
// administra TODO. Quien solo tenía que dar de alta gente acababa siendo
// custodio de la instancia entera.
//
// LO QUE UNA FACULTAD NO ES, y la pantalla lo dice porque es donde se
// confunde: no administra ninguna obra, no abre ninguna herramienta y no
// concede ni un documento. Es un acto de ENTIDAD y termina ahí.
//
// REPARTIR FACULTADES NO SE DELEGA: esta pantalla es solo del Entity Admin.
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

export default function FacultadesDeEntidad() {
  const [datos, setDatos] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(null);

  const cargar = async () => {
    setError('');
    try {
      const [r1, r2] = await Promise.all([
        apiFetch(`${API}/api/roles-de-entidad`),
        apiFetch(`${API}/api/users`),
      ]);
      const d = await r1.json();
      if (!r1.ok) throw new Error(d.error || 'No se pudo cargar.');
      setDatos(d);
      if (r2.ok) {
        const u = await r2.json();
        setPersonas(Array.isArray(u) ? u : (u.users || []));
      }
    } catch (e) {
      setDatos({ catalogo: [], delegados: [], entity_admins: [] });
      setError(e.message || 'No se pudieron cargar las facultades.');
    }
  };

  useEffect(() => { cargar(); }, []);

  const cambiar = async (userId, facultad, concedida, quien) => {
    setGuardando(`${userId}:${facultad}`);
    try {
      const r = await apiFetch(`${API}/api/users/${userId}/facultades/${facultad}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concedida }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar.');
      toast.success(concedida
        ? `${quien} puede ${facultad.replace('gestionar_', 'gestionar ')}`
        : `${quien} deja de poder ${facultad.replace('gestionar_', 'gestionar ')}`);
      cargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(null);
    }
  };

  if (datos === null) {
    return <div style={{ fontSize: 13, color: '#888' }}>Cargando facultades…</div>;
  }

  // Candidatos: personas activas que NO son Entity Admin (esos ya las tienen
  // todas por definición, y escribirles filas sugeriría lo contrario).
  const adminIds = new Set((datos.entity_admins || []).map(a => a.user_id));
  const delegadoDe = {};
  (datos.delegados || []).forEach(d => { delegadoDe[d.user_id] = d.facultades; });
  const candidatos = personas.filter(p => !adminIds.has(p.id) && p.activo !== false);

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
                  padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 6 }}>
        Facultades de la entidad
      </div>
      <p style={{ fontSize: 12.5, color: '#777', margin: '0 0 16px', maxWidth: 760,
                  lineHeight: 1.55 }}>
        Delegación <b>acotada</b>: permite encargar una parte de la administración
        sin entregar la entidad entera. Una facultad <b>no administra ninguna obra</b>,
        <b> no abre ninguna herramienta</b> y <b>no concede ningún documento</b> — para eso
        están la administración de cada obra, el acceso a herramientas y los
        permisos de carpeta.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 6,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.5 }}>
          {error} <b>La lista está incompleta</b>, no vacía.
        </div>
      )}

      {(datos.entity_admins || []).length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 12px', background: '#f8fafc',
                      border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12.3,
                      color: '#475569', lineHeight: 1.5 }}>
          <b>Administradores de la entidad:</b>{' '}
          {datos.entity_admins.map(a => a.nombre || a.email).join(' · ')}.
          Tienen <b>todas</b> las facultades por definición y no aparecen abajo:
          su autoridad no sale de esta tabla.
        </div>
      )}

      {candidatos.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888' }}>
          No hay personas a las que delegar todavía.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', color: '#888', fontWeight: 500,
                           textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Persona</th>
                {(datos.catalogo || []).map(f => (
                  <th key={f.codigo} style={{ padding: '8px 10px', fontWeight: 500 }}
                      title={f.descripcion}>
                    {f.etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidatos.map(p => {
                const suyas = delegadoDe[p.id] || [];
                const quien = p.name || p.email;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f2f4f6' }}>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ fontWeight: 500 }}>{quien}</div>
                      {p.email && p.name && (
                        <div style={{ fontSize: 11.5, color: '#98a1ab' }}>{p.email}</div>
                      )}
                    </td>
                    {(datos.catalogo || []).map(f => (
                      <td key={f.codigo} style={{ padding: '9px 10px' }}>
                        <input type="checkbox"
                               checked={suyas.includes(f.codigo)}
                               disabled={guardando === `${p.id}:${f.codigo}` || Boolean(error)}
                               onChange={e => cambiar(p.id, f.codigo, e.target.checked, quien)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11.5, color: '#98a1ab', maxWidth: 760,
                    lineHeight: 1.5 }}>
        {(datos.catalogo || []).map(f => (
          <div key={f.codigo} style={{ marginBottom: 3 }}>
            <b>{f.etiqueta}:</b> {f.descripcion}
          </div>
        ))}
      </div>
    </div>
  );
}
