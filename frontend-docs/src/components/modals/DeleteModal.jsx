/**
 * DeleteModal.jsx — Modal de confirmación de supresión
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2583-2611
 */
import React from 'react';

export default function DeleteModal({ isOpen, deleteTask, onConfirm, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-content" style={{ width: 448, background: '#fff', borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div className="modal-header" style={{ height: 48, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#1f1f1f' }}>
            {deleteTask.count === 1 ? '¿Suprimir elemento seleccionado?' : `¿Suprimir ${deleteTask.count} elementos seleccionados?`}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#666', cursor: 'pointer' }}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '24px 16px', fontSize: 13, color: '#3c3c3c' }}>
          Los elementos seleccionados se suprimirán del proyecto.
        </div>
        <div className="modal-footer" style={{ padding: '16px', display: 'flex', justifyContent: 'flex-end', gap: 12, background: '#fcfcfc', borderTop: '1px solid #eee' }}>
          <button 
            onClick={onClose} 
            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #dcdcdc', borderRadius: 4, fontSize: 13, fontWeight: 500, color: '#3c3c3c', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button 
            onClick={onConfirm}
            style={{ padding: '8px 24px', background: '#d92c2c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Suprimir
          </button>
        </div>
      </div>
    </div>
  );
}
