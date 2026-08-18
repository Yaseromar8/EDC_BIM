// ArchivarObraPanel — la puerta que no existía, y su vuelta.
//
// POR QUÉ ESTE COMPONENTE
// El backend sabía archivar una obra desde siempre: ruta admin, auditada, con
// borrado suave. Y NINGÚN cliente la llamaba. Cero. Es decir: la capacidad
// estaba, la puerta no — el mismo patrón que en esta plataforma ya apareció con
// el catálogo de idoneidad, con el triaje de seguridad y con `puede_salir_del_ecd`.
//
// DOS DECISIONES QUE NO SON DE ESTILO
//
// 1. HAY QUE ESCRIBIR EL NOMBRE. El 2026-08-07 alguien archivó PQT8_TALARA por
//    error y no se pudo saber quién. Un botón de un clic para una acción que
//    retira una obra entera del trabajo diario es cómo se repite ese día. Que
//    haya que teclear el nombre no es fricción decorativa: es la diferencia
//    entre una decisión y un resbalón.
//
// 2. SE ENSEÑA LA VUELTA ATRÁS, Y EXISTE. Antes no: `UPDATE status='archived'`
//    y ninguna vía para deshacerlo, así que la única salida de aquel incidente
//    fue tocar la base a mano. Una acción destructiva sin retorno no es una
//    medida de orden, es una trampa — y en el expediente de una obra pública,
//    peor. La lista de archivadas vive aquí mismo, con su botón de restaurar.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

export function ArchivarObraPanel({ project, isAdmin, onArchivada }) {
  const [confirmacion, setConfirmacion] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [archivadas, setArchivadas] = useState([]);

  const cargarArchivadas = useCallback(() => {
    if (!isAdmin) return;
    apiFetch(`${API}/api/projects/archivadas`)
      .then(r => r.json())
      .then(d => setArchivadas(d.obras || []))
      .catch(() => setArchivadas([]));
  }, [isAdmin]);

  useEffect(() => { cargarArchivadas(); }, [cargarArchivadas]);

  if (!isAdmin) return null;

  const nombre = project?.name || '';
  const puedeArchivar = confirmacion.trim() === nombre.trim() && nombre.trim() !== '';

  const archivar = async () => {
    if (!puedeArchivar) return;
    setTrabajando(true);
    try {
      const r = await apiFetch(`${API}/api/projects/${encodeURIComponent(project.id)}`,
                               { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { toast.error(d.error || 'No se pudo archivar.'); return; }
      toast.success(`«${nombre}» archivada. Puedes restaurarla desde aquí.`);
      setConfirmacion('');
      cargarArchivadas();
      if (onArchivada) onArchivada();
    } catch {
      toast.error('No se pudo archivar.');
    } finally {
      setTrabajando(false);
    }
  };

  const restaurar = async (obra) => {
    setTrabajando(true);
    try {
      const r = await apiFetch(`${API}/api/projects/${encodeURIComponent(obra.id)}/restaurar`,
                               { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { toast.error(d.error || 'No se pudo restaurar.'); return; }
      toast.success(`«${obra.name}» vuelve al trabajo.`);
      cargarArchivadas();
    } catch {
      toast.error('No se pudo restaurar.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border-danger, #f0c9c9)',
      borderRadius: 8, padding: 24, marginBottom: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger, #b3261e)', marginBottom: 6 }}>
        Archivar esta obra
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#666', lineHeight: 1.6, maxWidth: 620 }}>
        La obra deja de aparecer en las listas y nadie sigue trabajando en ella.
        <strong> No se borra nada</strong>: sus documentos, su plan y su historial
        siguen donde están, y puedes devolverla al trabajo desde esta misma
        pantalla. Queda registrado quién la archivó y cuándo.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, color: '#888', letterSpacing: 0.3, marginBottom: 4 }}>
            ESCRIBE <strong style={{ color: '#333' }}>{nombre}</strong> PARA CONFIRMAR
          </div>
          <input value={confirmacion} onChange={e => setConfirmacion(e.target.value)}
                 placeholder={nombre}
                 style={{
                   fontSize: 13, padding: '8px 11px', minWidth: 260,
                   border: '1px solid #ddd', borderRadius: 7,
                 }} />
        </div>
        <button onClick={archivar} disabled={!puedeArchivar || trabajando}
                style={{
                  background: puedeArchivar ? 'var(--danger, #b3261e)' : '#e8e8e8',
                  color: puedeArchivar ? '#fff' : '#aaa',
                  border: 'none', borderRadius: 7, padding: '9px 18px',
                  fontSize: 12.5, fontWeight: 600,
                  cursor: puedeArchivar && !trabajando ? 'pointer' : 'default',
                }}>
          {trabajando ? 'Archivando…' : 'Archivar obra'}
        </button>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#999', maxWidth: 620, lineHeight: 1.6 }}>
        Hay que escribir el nombre a propósito. El 7 de agosto de 2026 esta obra
        se archivó por error y hubo que arreglarlo por fuera del producto.
      </p>

      {archivadas.length > 0 && (
        <div style={{ marginTop: 22, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4 }}>
            Obras archivadas
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#888' }}>
            Siguen completas. Restaurar las devuelve a las listas tal y como estaban.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {archivadas.map(o => (
              <li key={o.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '9px 0', borderBottom: '1px solid #f4f4f4', fontSize: 13,
              }}>
                <span style={{ color: '#333' }}>
                  {o.name}
                  {o.archivada_en && (
                    <span style={{ color: '#aaa', fontSize: 11.5, marginLeft: 8 }}>
                      {String(o.archivada_en).slice(0, 10)}
                    </span>
                  )}
                </span>
                <button onClick={() => restaurar(o)} disabled={trabajando}
                        style={{
                          background: 'transparent', color: 'var(--accent, #1a73e8)',
                          border: '1px solid var(--accent, #1a73e8)', borderRadius: 6,
                          padding: '5px 12px', fontSize: 12, fontWeight: 600,
                          cursor: trabajando ? 'default' : 'pointer',
                        }}>
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
