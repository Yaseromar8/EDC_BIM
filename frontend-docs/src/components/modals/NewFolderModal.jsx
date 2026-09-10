/**
 * NewFolderModal.jsx — Modal de creación de nueva carpeta
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2545-2556
 */
import React from 'react';

export default function NewFolderModal({ isOpen, folderName, onFolderNameChange, onCreate, onClose, creando = false }) {
  if (!isOpen) return null;

  // Mientras la petición viaja el diálogo se QUEDA, pero diciéndolo. Antes se
  // quedaba mudo varios segundos: no se sabía si el clic había entrado, y se
  // podía pulsar «Crear» otra vez —y otra—, cada una con su carpeta.
  const sinNombre = !folderName.trim();

  return (
    <div className="modal-overlay" onClick={creando ? undefined : onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Nueva Carpeta</h3>
        <input 
          autoFocus 
          value={folderName} 
          disabled={creando}
          onChange={e => onFolderNameChange(e.target.value)} 
          onKeyDown={e => { if (e.key === 'Enter' && !creando && !sinNombre) onCreate(); }} 
        />
        <div className="modal-actions">
          <button onClick={onClose} disabled={creando}>Cancelar</button>
          <button onClick={onCreate} disabled={creando || sinNombre}>
            {creando ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}
