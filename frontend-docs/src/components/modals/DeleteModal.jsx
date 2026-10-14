/**
 * DeleteModal.jsx — Modal de confirmación de supresión
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2583-2611
 */
import React from 'react';

export default function DeleteModal({ isOpen, deleteTask, onConfirm, onClose }) {
  if (!isOpen) return null;

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
