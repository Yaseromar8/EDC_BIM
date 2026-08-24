// PerfilesDeAcceso — CAPA 13 · configuración de acceso reutilizable.
//
// QUÉ ES UN PERFIL, dicho donde se usa: «cuando incorpores a alguien así,
// deja esto configurado». No es la función contractual de nadie —esa dice
// quién es su empresa y en qué calidad viene, y es un hecho del contrato—
// sino una preferencia repetible del administrador.
//
// LA PROPIEDAD QUE LA PANTALLA TIENE QUE DEJAR CLARÍSIMA:
//
//     UN PERFIL SE APLICA; NO GOBIERNA.
//
// Al aplicarlo escribe el acceso a herramientas de esa persona en esa obra,
// y ahí termina su papel. Editarlo después NO cambia a quien ya lo llevaba:
// sus accesos son suyos, no la proyección viva de una plantilla. Por eso la
// pantalla dice a cuánta gente afectaría re-aplicarlo, y nunca sugiere que
// un cambio se propaga solo.
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';

const HERRAMIENTAS = [
  { codigo: 'rfi', etiqueta: 'RFI' },
  { codigo: 'redlines', etiqueta: 'Red Lines' },
  { codigo: 'reviews', etiqueta: 'Revisiones' },
  { codigo: 'transmittals', etiqueta: 'Transmittals' },
  { codigo: 'plan_entregas', etiqueta: 'Plan de entrega' },
  { codigo: 'conjuntos', etiqueta: 'Conjuntos' },
  { codigo: 'fotos', etiqueta: 'Fotos de campo' },
  { codigo: 'visor', etiqueta: 'Visor 3D' },
];

const VACIO = { nombre: '', descripcion: '', herramientas: {} };

export default function PerfilesDeAcceso() {
  const [perfiles, setPerfiles] = useState(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null);   // null | VACIO | perfil
  const [afectados, setAfectados] = useState(null); // perfil abierto en «quién lo lleva»
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setError('');
    try {
      const r = await apiFetch(`${API}/api/perfiles-de-acceso`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setPerfiles(d.perfiles || []);
    } catch (e) {
      setPerfiles([]);
      setError(e.message || 'No se pudieron cargar los perfiles.');
    }
  };

  useEffect(() => { cargar(); }, []);

  const guardar = async () => {
    if (!editando?.nombre?.trim()) { toast.error('El perfil necesita un nombre.'); return; }
    setGuardando(true);
    try {
      const nuevo = !editando.id;
      const r = await apiFetch(
        `${API}/api/perfiles-de-acceso${nuevo ? '' : '/' + editando.id}`,
        { method: nuevo ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: editando.nombre.trim(),
            descripcion: editando.descripcion || null,
            herramientas: editando.herramientas || {},
          }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      // La verdad, sin adornos: editar NO propaga.
      if (!nuevo && d.miembros_con_este_perfil > 0) {
        toast(`Guardado. ${d.miembros_con_este_perfil} persona${d.miembros_con_este_perfil !== 1 ? 's' : ''} `
              + 'lo lleva puesto y NO cambia: re-aplícalo donde quieras propagarlo.',
              { duration: 7000 });
      } else {
        toast.success('Perfil guardado');
      }
      setEditando(null);
      cargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p) => {
    if (!await confirmAction({
      title: 'Borrar perfil',
      message: `Se elimina «${p.nombre}» del catálogo. Quien lo lleve puesto `
             + 'CONSERVA sus accesos: lo que tienen ya está escrito en cada obra. '
             + 'Lo que se pierde es saber de qué perfil salió.',
      confirmText: 'Borrar perfil', danger: true })) return;
    try {
      const r = await apiFetch(`${API}/api/perfiles-de-acceso/${p.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo borrar.');
      toast.success('Perfil borrado — nadie perdió accesos');
      cargar();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const verAfectados = async (p) => {
    try {
      const r = await apiFetch(`${API}/api/perfiles-de-acceso/${p.id}/afectados`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setAfectados({ perfil: p, miembros: d.miembros || [] });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const alternar = (codigo) => setEditando(p => ({
    ...p, herramientas: { ...(p.herramientas || {}), [codigo]: !(p.herramientas || {})[codigo] },
  }));

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
                  padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
          Perfiles de acceso
        </div>
        <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12.5 }}
                onClick={() => setEditando({ ...VACIO })}>
          + Nuevo perfil
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: '#777', margin: '0 0 16px', maxWidth: 720,
                  lineHeight: 1.55 }}>
        Configuraciones de acceso reutilizables: «cuando incorpores a alguien así,
        deja esto puesto». <b>No son la función contractual de nadie</b> —eso describe
        en qué calidad participa su empresa— sino una preferencia repetible tuya.
        Un perfil <b>se aplica</b> desde Participantes de cada obra; después manda el
        acceso de cada persona, y <b>editar el perfil no cambia a quien ya lo lleva</b>.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 6,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.5 }}>
          {error} <b>La lista está incompleta</b>, no vacía.
        </div>
      )}

      {perfiles === null ? (
        <div style={{ fontSize: 13, color: '#888' }}>Cargando…</div>
      ) : perfiles.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888', padding: '10px 2px' }}>
          Todavía no hay perfiles. Se crean cuando repetir la misma configuración
          a mano empieza a producir resultados distintos.
        </div>
      ) : (
        <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            {perfiles.map(p => (
              <tr key={p.id}>
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                  {p.descripcion && (
                    <div style={{ fontSize: 11.5, color: '#98a1ab', marginTop: 2 }}>
                      {p.descripcion}
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: '#98a1ab', marginTop: 3 }}>
                    {HERRAMIENTAS.filter(h => p.herramientas?.[h.codigo]).map(h => h.etiqueta).join(' · ')
                      || 'sin herramientas concedidas'}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button onClick={() => verAfectados(p)}
                          style={{ border: '1px solid #ddd', background: '#fff', borderRadius: 4,
                                   padding: '3px 9px', fontSize: 11.5, color: '#4d6a8f',
                                   cursor: 'pointer', marginRight: 6 }}>
                    {p.miembros_con_este_perfil} lo lleva{p.miembros_con_este_perfil !== 1 ? 'n' : ''}
                  </button>
                  <button onClick={() => setEditando({ ...p })}
                          style={{ border: '1px solid #ddd', background: '#fff', borderRadius: 4,
                                   padding: '3px 9px', fontSize: 11.5, color: '#4d6a8f',
                                   cursor: 'pointer', marginRight: 6 }}>
                    Editar
                  </button>
                  <button onClick={() => borrar(p)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer',
                                   color: '#c0392b', fontSize: 15 }} title="Borrar perfil">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Crear / editar ── */}
      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 style={{ margin: 0 }}>{editando.id ? 'Editar perfil' : 'Nuevo perfil'}</h3>
            <div style={{ marginTop: 14 }}>
              <input className="adsk-input" placeholder="Nombre (p. ej. Supervisión documental)"
                     style={{ width: '100%', marginBottom: 8 }}
                     value={editando.nombre}
                     onChange={e => setEditando(p => ({ ...p, nombre: e.target.value }))} />
              <input className="adsk-input" placeholder="Descripción (opcional)"
                     style={{ width: '100%', marginBottom: 14 }}
                     value={editando.descripcion || ''}
                     onChange={e => setEditando(p => ({ ...p, descripcion: e.target.value }))} />
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#888',
                            letterSpacing: '.04em', marginBottom: 8 }}>
                HERRAMIENTAS QUE DEJA CONCEDIDAS
              </div>
              {HERRAMIENTAS.map(h => (
                <label key={h.codigo}
                       style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0',
                                fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(editando.herramientas?.[h.codigo])}
                         onChange={() => alternar(h.codigo)} />
                  {h.etiqueta}
                </label>
              ))}
            </div>
            {editando.id > 0 && editando.miembros_con_este_perfil > 0 && (
              <div role="note" style={{ marginTop: 14, background: '#fffbeb',
                                        border: '1px solid #fde68a', color: '#92400e',
                                        borderRadius: 6, padding: '9px 11px', fontSize: 12,
                                        lineHeight: 1.5 }}>
                <b>{editando.miembros_con_este_perfil} persona
                {editando.miembros_con_este_perfil !== 1 ? 's' : ''} lleva
                {editando.miembros_con_este_perfil !== 1 ? 'n' : ''} este perfil.</b>{' '}
                Guardar aquí <b>no les cambia nada</b>: sus accesos ya son suyos. Para
                propagarlo hay que re-aplicar el perfil en cada obra.
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quién lo lleva ── */}
      {afectados && (
        <div className="modal-overlay" onClick={() => setAfectados(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 style={{ margin: 0 }}>Quién lleva «{afectados.perfil.nombre}»</h3>
            <p style={{ fontSize: 12.3, color: '#777', margin: '8px 0 14px', lineHeight: 1.5 }}>
              Es la <b>procedencia</b> de su configuración, no una regla viva: lo que
              cada uno puede hacer está escrito en su acceso de cada obra y no
              cambia si editas el perfil.
            </p>
            {afectados.miembros.length === 0 ? (
              <div style={{ fontSize: 13, color: '#888' }}>Nadie lo lleva puesto todavía.</div>
            ) : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  {afectados.miembros.map(m => (
                    <tr key={`${m.project_id}-${m.user_id}`}
                        style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 4px' }}>{m.nombre || m.email}</td>
                      <td style={{ padding: '8px 4px', color: '#98a1ab' }}>{m.obra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => setAfectados(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
