/**
 * NewFolderModal.jsx — Modal de creación de nueva carpeta
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2545-2556
 */
import React from 'react';

export default function NewFolderModal({ isOpen, folderName, onFolderNameChange, onCreate, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Nueva Carpeta</h3>
        <input 
          autoFocus 
          value={folderName} 
          onChange={e => onFolderNameChange(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && onCreate()} 
        />
        <div className="modal-actions">
          <button onClick={onClose}>Cancelar</button>
          <button onClick={onCreate}>Crear</button>
        </div>
      </div>
    </div>
  );
}
