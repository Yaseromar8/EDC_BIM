/**
 * DeleteModal.jsx — Modal de confirmación de supresión
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2583-2611
 */
import React, { useEffect, useState } from 'react';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';

// ANTES DE SUPRIMIR LO CITADO (16-oct-2026): si una foto o un informe está citado en marcas de planos, se
// dice cuántas y en cuántos planos. No bloquea: quien borra decide. Las marcas lo mostrarán «eliminado» y
// vuelve a verse si se restaura de la papelera. Solo cuenta lo que el usuario puede ver (/api/pdf/citas-de).
function useCitasDe(ids, activo) {
  const [respuesta, setRespuesta] = useState({ para: '', citas: {} });
  const clave = activo ? ids.join(',') : '';
  useEffect(() => {
    if (!clave) return undefined;
    let vivo = true;
    apiFetch(`${API}/api/pdf/citas-de?ids=${encodeURIComponent(clave)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo) setRespuesta({ para: clave, citas: d?.success ? d.citas || {} : {} }); })
      .catch(() => { if (vivo) setRespuesta({ para: clave, citas: {} }); });
    return () => { vivo = false; };
  }, [clave]);
  // Solo la respuesta de ESTOS documentos: la del borrado anterior no se enseña.
  return clave && respuesta.para === clave ? respuesta.citas : {};
}

export default function DeleteModal({ isOpen, deleteTask, onConfirm, onClose }) {
  const ids = deleteTask?.single ? [deleteTask.single.id] : (deleteTask?.ids || []);
  const citas = useCitasDe(ids.map(String), isOpen);
  if (!isOpen) return null;
  const citados = Object.values(citas);
  const marcas = citados.reduce((s, c) => s + c.marcas, 0);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--a-surface-overlay)' }}>
      <div className="modal-content" style={{ width: 448, overflow: 'hidden' }}>
        <div className="modal-header" style={{ height: 48, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f0e8' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#141413' }}>
            {deleteTask.count === 1 ? '¿Suprimir elemento seleccionado?' : `¿Suprimir ${deleteTask.count} elementos seleccionados?`}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#72706b', cursor: 'pointer' }}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '24px 16px', fontSize: 13, color: '#333330' }}>
          {/* CUÁNTOS y A DÓNDE. «Se suprimirán del proyecto» sonaba definitivo
              sin serlo: van a la papelera y se pueden recuperar, y saberlo
              cambia la decisión de quien está a punto de pulsar. */}
          {deleteTask.count === 1
            ? 'Este elemento pasa a la papelera. Puedes recuperarlo desde allí.'
            : `Estos ${deleteTask.count} elementos pasan a la papelera. Puedes recuperarlos desde allí.`}
          {citados.length > 0 && (
            <div role="alert" style={{ marginTop: 14, padding: '10px 12px', borderRadius: 6, background: '#f9eeda',
                                       color: '#734500', fontSize: 12.5, lineHeight: 1.5 }}>
              {citados.length === 1
                ? <>«{citados[0].nombre}» está citado en <b>{citados[0].marcas === 1 ? '1 marca' : `${citados[0].marcas} marcas`}</b> de {citados[0].planos === 1 ? '1 plano' : `${citados[0].planos} planos`}.</>
                : <><b>{citados.length} de estos documentos</b> están citados en {marcas === 1 ? '1 marca' : `${marcas} marcas`} de planos.</>}
              {' '}{citados.length === 1 && citados[0].marcas === 1
                ? 'Si lo suprimes, esa marca lo mostrará como eliminado hasta que se restaure.'
                : citados.length === 1
                  ? 'Si lo suprimes, esas marcas lo mostrarán como eliminado hasta que se restaure.'
                  : 'Si los suprimes, esas marcas los mostrarán como eliminados hasta que se restauren.'}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end', gap: 12, background: '#faf9f5', borderTop: '1px solid #f1f0e8' }}>
          <button 
            onClick={onClose} 
            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e8e6dc', borderRadius: 4, fontSize: 13, fontWeight: 500, color: '#333330', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button 
            onClick={onConfirm}
            style={{ padding: '8px 24px', background: '#b93535', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Suprimir
          </button>
        </div>
      </div>
    </div>
  );
}
