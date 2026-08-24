// PlantillasDeObra — CAPA 14 · la configuración de una obra, reproducible.
//
// LO QUE UNA PLANTILLA ES, dicho donde se usa: un molde vacío, no una
// fotocopia. Copia la estructura de carpetas, las herramientas activas, las
// empresas con su función y el vocabulario de idoneidad.
//
// LO QUE NO COPIA, NUNCA — y la pantalla lo dice porque es justo lo que la
// gente espera y no debe pasar:
//   · documentos, versiones y su historia
//   · RFI, Red Lines, revisiones, transmittals y sus acuses
//   · auditoría, encargos y responsabilidades
//   · MIEMBROS y sus permisos
//
// Los miembros son la tentación evidente («la obra nueva tiene el mismo
// equipo»), y es donde una plantilla se convertiría en un agujero: crear una
// obra concedería acceso a personas que nadie invitó a ESA obra. La
// estructura se hereda; la gente se incorpora.
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';

export default function PlantillasDeObra({ obras = [] }) {
  const [plantillas, setPlantillas] = useState(null);
  const [error, setError] = useState('');
  const [capturando, setCapturando] = useState(null); // {nombre, desde_obra}

  const cargar = async () => {
    setError('');
    try {
      const r = await apiFetch(`${API}/api/plantillas-de-obra`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setPlantillas(d.plantillas || []);
    } catch (e) {
      setPlantillas([]);
      setError(e.message || 'No se pudieron cargar las plantillas.');
    }
  };

  useEffect(() => { cargar(); }, []);

  const capturar = async () => {
    if (!capturando?.nombre?.trim() || !capturando?.desde_obra) {
      toast.error('Elige un nombre y la obra de la que capturar.');
      return;
    }
    try {
      const r = await apiFetch(`${API}/api/plantillas-de-obra`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: capturando.nombre.trim(),
                               descripcion: capturando.descripcion || null,
                               desde_obra: capturando.desde_obra }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo capturar.');
      toast.success(`Plantilla «${d.nombre}» capturada`);
      setCapturando(null);
      cargar();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const borrar = async (p) => {
    if (!await confirmAction({
      title: 'Borrar plantilla',
      message: `Se elimina el molde «${p.nombre}». Las obras que se crearon con `
             + 'él NO cambian: lo que tienen ya es suyo.',
      confirmText: 'Borrar', danger: true })) return;
    try {
      const r = await apiFetch(`${API}/api/plantillas-de-obra/${p.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo borrar.');
      toast.success('Plantilla borrada');
      cargar();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
                  padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
          Plantillas de obra
        </div>
        <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12.5 }}
                onClick={() => setCapturando({ nombre: '', descripcion: '', desde_obra: '' })}>
          + Capturar de una obra
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: '#777', margin: '0 0 14px', maxWidth: 760,
                  lineHeight: 1.55 }}>
        La <b>configuración</b> de una obra, para reproducirla en otras: estructura de
        carpetas, herramientas activas, empresas con su función y códigos de
        idoneidad. Se aplica desde <b>Configuración</b> de la obra nueva.
      </p>

      <div role="note" style={{ background: '#f8fafc', border: '1px solid #e2e8f0',
                                borderRadius: 6, padding: '10px 12px', marginBottom: 16,
                                fontSize: 12.3, color: '#475569', lineHeight: 1.55 }}>
        <b>Un molde vacío, no una fotocopia.</b> Nunca copia documentos, RFI,
        observaciones, revisiones, transmittals, auditoría ni responsabilidades —
        eso es la historia de <i>esa</i> obra. Y <b>tampoco copia los miembros</b>: la
        gente entra por invitación y membresía, no por herencia de una plantilla.
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 6,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.5 }}>
          {error} <b>La lista está incompleta</b>, no vacía.
        </div>
      )}

      {plantillas === null ? (
        <div style={{ fontSize: 13, color: '#888' }}>Cargando…</div>
      ) : plantillas.length === 0 ? (
        <div style={{ fontSize: 13, color: '#888', padding: '8px 2px' }}>
          Todavía no hay plantillas. Se capturan de una obra ya montada, cuando
          repetir su estructura a mano empieza a producir resultados distintos.
        </div>
      ) : (
        <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            {plantillas.map(p => (
              <tr key={p.id}>
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                  {p.descripcion && (
                    <div style={{ fontSize: 11.5, color: '#98a1ab', marginTop: 2 }}>
                      {p.descripcion}
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: '#98a1ab', marginTop: 3 }}>
                    {p.contiene?.carpetas} carpetas ·{' '}
                    {p.contiene?.herramientas_activas} herramientas ·{' '}
                    {p.contiene?.empresas} empresas ·{' '}
                    {p.contiene?.codigos_idoneidad} códigos de idoneidad
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', width: 40 }}>
                  <button onClick={() => borrar(p)} title="Borrar plantilla"
                          style={{ border: 'none', background: 'none', cursor: 'pointer',
                                   color: '#c0392b', fontSize: 15 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {capturando && (
        <div className="modal-overlay" onClick={() => setCapturando(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ margin: 0 }}>Capturar plantilla</h3>
            <p style={{ fontSize: 12.3, color: '#777', margin: '8px 0 14px', lineHeight: 1.5 }}>
              Se lee la <b>configuración</b> de la obra elegida. No se copia ni un
              documento, ni un acto, ni un miembro.
            </p>
            <input className="adsk-input" placeholder="Nombre de la plantilla"
                   style={{ width: '100%', marginBottom: 8 }}
                   value={capturando.nombre}
                   onChange={e => setCapturando(c => ({ ...c, nombre: e.target.value }))} />
            <input className="adsk-input" placeholder="Descripción (opcional)"
                   style={{ width: '100%', marginBottom: 8 }}
                   value={capturando.descripcion || ''}
                   onChange={e => setCapturando(c => ({ ...c, descripcion: e.target.value }))} />
            <select value={capturando.desde_obra}
                    onChange={e => setCapturando(c => ({ ...c, desde_obra: e.target.value }))}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd',
                             borderRadius: 5, fontSize: 13 }}>
              <option value="">Capturar de la obra…</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setCapturando(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={capturar}>Capturar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
