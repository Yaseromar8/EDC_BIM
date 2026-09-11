/**
 * MoveModal.jsx — Modal de desplazar archivos/carpetas
 * Refactorización Fase 2: Capa de Modales
 * Incluye SelectFolderNode (árbol mini de selección)
 * Extraído de App.jsx líneas 557-613, 2613-2677
 */
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/apiFetch';
import { API } from '../../utils/helpers';

// ── Mini Select Folder Tree (Embedded) ──
function SelectFolderNode({ folder, defaultExpanded = false, selectedPath, onSelect, modelUrn }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadChildren = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/docs/list?path=${encodeURIComponent(folder.fullName)}&model_urn=${encodeURIComponent(modelUrn || 'global')}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.data || {};
        const sorted = (data.folders || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setChildren(sorted);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    if (defaultExpanded && !children) loadChildren();
  }, [defaultExpanded]);

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (!expanded && !children) await loadChildren();
    setExpanded(!expanded);
  };

  const isSelected = selectedPath === folder.fullName;

  return (
    <div style={{ marginLeft: 16 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', cursor: 'pointer', background: isSelected ? '#e6f3fa' : 'transparent', color: isSelected ? 'var(--accent)' : '#333', borderRadius: 4 }}
        onClick={() => onSelect(folder.fullName, folder.id)}
      >
        <div style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, cursor: 'pointer' }} onClick={handleToggle}>
          {loading ? <div className="adsk-spinner" style={{ width: 10, height: 10, borderWidth: 1 }} /> : (
            <svg height="16" width="16" viewBox="0 0 24 24" fill="currentColor" style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: (children && children.length === 0 && expanded) ? 0 : 1 }}>
              <path d="M12,16.17a.74.74,0,0,1-.54-.23L6.23,10.52a.75.75,0,0,1,1.08-1L12,14.34l4.69-4.86a.75.75,0,1,1,1.08,1l-5.23,5.42A.74.74,0,0,1,12,16.17Z"></path>
            </svg>
          )}
        </div>
        <svg viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: 6, fill: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
        </svg>
        <span style={{ fontSize: 13, userSelect: 'none', whiteSpace: 'nowrap', flex: 1 }}>{folder.name.replace(/\/$/, '')}</span>
      </div>
      {expanded && children && (
        <div>
          {children.map(c => <SelectFolderNode key={c.fullName} folder={c} selectedPath={selectedPath} onSelect={onSelect} modelUrn={modelUrn} />)}
        </div>
      )}
    </div>
  );
}

// ── Move Modal ──
export default function MoveModal({ moveState, setMoveState, projectPrefix, projectRootId, onExecuteMove }) {
  if (!moveState || moveState.step <= 0) return null;

  const close = () => setMoveState({ step: 0, items: [], itemIds: [], destPath: '', destId: null });

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="acc-modal-box" onClick={e => e.stopPropagation()} style={{ width: 500, borderRadius: 2, padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300 }}>
            {moveState.items.length > 1
              ? `Mover ${moveState.items.length} elementos a…`
              : 'Mover a…'}
          </h3>
          <button onClick={close} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>

        <div style={{ padding: '24px', minHeight: 300 }}>
          {/* UN SOLO PASO (M-2). Antes había una pantalla previa cuyo único
              contenido era esta advertencia, y obligaba a pulsar «Continuar»
              para llegar a lo que de verdad hacía falta: elegir destino.
              La advertencia NO se pierde -- vive aquí, junto al árbol, que es
              donde significa algo: se lee mientras se elige la carpeta. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: '10px 12px',
                        background: 'var(--neutral-100, #eef2f7)', borderRadius: 4,
                        fontSize: 12.5, color: 'var(--text-secondary, #555)', lineHeight: 1.5 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            <span>Lo que muevas heredará los permisos y los suscriptores de la carpeta de destino. Los suscriptores de la carpeta actual no se conservan.</span>
          </div>
          {(
            <div className="acc-move-tree-container" style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #eee', padding: '12px', borderRadius: 2 }}>
              <SelectFolderNode 
                folder={{ name: 'Archivos de proyecto', fullName: projectPrefix, id: projectRootId }} 
                defaultExpanded={true} 
                selectedPath={moveState.destPath} 
                onSelect={(path, id) => setMoveState({ ...moveState, destPath: path, destId: id })} 
                modelUrn={projectPrefix}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid #eee', background: '#fafafa' }}>
          {(
            <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontSize: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4m0-4h.01"/></svg>
              <span>¿Estos archivos se sincronizan...?</span>
            </div>
          )}
          <button 
            className="acc-btn-flat" 
            onClick={close}
            style={{ padding: '8px 16px', background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          {/* El destino es entrada OBLIGATORIA, no una confirmación: sin él,
              confirmar no puede hacer nada, así que va apagado. */}
          <button 
            className={!moveState.destPath ? 'acc-btn-disabled' : 'acc-btn-primary-2'} 
            disabled={!moveState.destPath}
            title={!moveState.destPath ? 'Elige antes una carpeta de destino' : undefined}
            onClick={() => { if (moveState.destPath) onExecuteMove(); }}
            style={{ 
              padding: '8px 24px', 
              background: !moveState.destPath ? '#eeeeee' : 'var(--accent)', 
              color: !moveState.destPath ? '#999' : '#fff', 
              border: 'none', borderRadius: 4, fontWeight: 600, 
              cursor: !moveState.destPath ? 'default' : 'pointer' 
            }}
          >
            Desplazar
          </button>
        </div>
      </div>
    </div>
  );
}

export { SelectFolderNode };
