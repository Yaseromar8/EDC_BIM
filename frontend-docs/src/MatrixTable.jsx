import React, { useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

/**
 * TableRow Component - Renders an individual row in the virtualized list.
 */
const TableRow = ({ index, style, data }) => {
  const { items, selected, toggle, navigate, setActiveFile, onUpdateDescription, onRename, formatSize, formatDate, getInitials, user, isAdmin, onRowMenu, isTrashMode, onShowVersions, columnWidths, renderFileIconSop, editingNodeId, setEditingNodeId, rightClickedId, processingIds } = data;
  if (!items) return null;
  const item = items[index];
  if (!item) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [tempDesc, setTempDesc] = useState(item.description || '');

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(item.name || '');

  // Sync inline edit from context menu
  React.useEffect(() => {
    if (editingNodeId && editingNodeId.source === 'table' && editingNodeId.id === item.id) {
      setIsEditingName(true);
      let nameToEdit = item.name || '';
      if (item.type !== 'folder' && nameToEdit.includes('.')) {
        const parts = nameToEdit.split('.');
        parts.pop();
        nameToEdit = parts.join('.');
      }
      setTempName(nameToEdit);
      setEditingNodeId(null); // Clear the trigger
    }
  }, [editingNodeId, item.id, item.name, item.type, setEditingNodeId]);

  // Reset state when item changes (for virtualized list reuse)
  React.useEffect(() => {
    setTempDesc(item.description || '');
    if (!isEditingName) setTempName(item.name || '');
  }, [item.id, item.name, item.description, isEditingName]);

  const isFolder = item.type === 'folder';
  const isSelected = selected.has(item.fullName);

  const handleSave = () => {
    if (tempDesc !== (item.description || '')) {
      onUpdateDescription(item, tempDesc);
    }
    setIsEditing(false);
  };

  const handleRename = () => {
    let finalName = tempName;
    const itemName = item.name || '';
    if (!isFolder && itemName.includes('.')) {
      const ext = itemName.split('.').pop();
      finalName = `${tempName}.${ext}`;
    }
    
    console.log('TableRow handleRename: calling onRename for', item.id, 'with', finalName);
    if (finalName && finalName !== item.name) {
      if (onRename) {
        onRename(item, finalName);
      } else {
        console.error('onRename prop is MISSING in TableRow');
      }
    }
    setIsEditingName(false);
  };
   
  const startEditingName = (e) => {
    e.stopPropagation();
    console.log('startEditingName for', item.id, item.name);
    let nameToEdit = item.name || '';
    if (!isFolder && nameToEdit.includes('.')) {
      const parts = nameToEdit.split('.');
      parts.pop();
      nameToEdit = parts.join('.');
    }
    setTempName(nameToEdit);
    setIsEditingName(true);
  };

  return (
    <div 
      className={`data-row ${isSelected ? 'selected' : ''} ${item.id === rightClickedId ? 'context-active' : ''}`} 
      style={{ 
        ...style, 
        width: '100%',
        opacity: processingIds[item.id] ? 0.5 : 1,
        filter: processingIds[item.id] ? 'grayscale(1)' : 'none',
        pointerEvents: processingIds[item.id] ? 'none' : 'auto',
        transition: 'all 0.4s ease'
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onRowMenu(item, e);
      }}
    >
      <div className="td-cell checkbox-cell td-frozen-left" style={{ width: columnWidths.checkbox, left: 0 }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            toggle(item.fullName);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div 
        className="td-cell name-cell td-frozen-left name-cell-editable" 
        style={{ width: columnWidths.name, left: columnWidths.checkbox }}
      >
        {processingIds[item.id] ? (
          <div className="adsk-spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 8 }} />
        ) : (
          isFolder ? (
            <svg className="adsk-icon" width="20" height="20" viewBox="0 0 24 24" fill="#666" style={{ marginRight: 8 }}>
              <path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"/>
            </svg>
          ) : (
            renderFileIconSop ? renderFileIconSop(item.name, 22) : (
              <svg className="adsk-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginRight: 8, color: '#999' }}>
                <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            )
          )
        )}
        
        {isEditingName ? (
          <div className="inline-edit-box" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              className="name-input-acc"
              style={{ border: 'none', outline: 'none', width: '100%', padding: '0 8px' }}
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={(e) => {
                // Si el foco se mueve a uno de nuestros botones, no disparamos el save aquí
                if (e.relatedTarget && e.relatedTarget.closest('.inline-edit-box')) return;
                handleRename();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') { setTempName(item.name); setIsEditingName(false); }
              }}
            />
            <button 
              className="btn-cancel" 
              title="Cancelar"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); setTempName(item.name); setIsEditingName(false); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <button 
              className="btn-submit" 
              title="Aceptar"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); handleRename(); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}>
            <span 
              className="file-name-text" 
              style={{ marginLeft: isFolder ? 0 : 8, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => {
                setActiveFile(item);
                if (isFolder) navigate(item.fullName, item.id);
              }}
            >
              {item.name || 'Sin nombre'}
            </span>
            {isAdmin && (
              <svg 
                className="pencil-icon-acc name-pencil" 
                onClick={startEditingName}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0696d7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                style={{ cursor: 'pointer' }}
              >
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            )}
          </div>
        )}
      </div>
      
      {!isTrashMode && (
        <div 
          className="td-cell description-cell-editable" 
          style={{ width: columnWidths.description, position: 'relative' }}
          onClick={() => setIsEditing(true)}
        >
          {isEditing ? (
            <div className="inline-edit-box" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                className="description-input-acc"
                style={{ border: 'none', outline: 'none', width: '100%', padding: '0 8px' }}
                value={tempDesc}
                onChange={(e) => setTempDesc(e.target.value)}
                onBlur={(e) => {
                  if (e.relatedTarget && e.relatedTarget.closest('.inline-edit-box')) return;
                  handleSave();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') { setTempDesc(item.description || ''); setIsEditing(false); }
                }}
              />
              <button 
                className="btn-cancel" 
                title="Cancelar"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); setTempDesc(item.description || ''); setIsEditing(false); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <button 
                className="btn-submit" 
                title="Aceptar"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); handleSave(); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          ) : (
            <>
              <span className="description-text-value">{item.description || ''}</span>
              <svg className="pencil-icon-acc" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0696d7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </>
          )}
        </div>
      )}

      {!isTrashMode && (
        <>
          <div className="td-cell" style={{ width: columnWidths.version }}>
            {!isFolder && (
              <button 
                className="version-link-acc" 
                onClick={(e) => { e.stopPropagation(); onShowVersions(item, e); }}
              >
                V{item.version || 1}
              </button>
            )}
          </div>
          <div className="td-cell" style={{ width: columnWidths.indicators }}>--</div>
          <div className="td-cell" style={{ width: columnWidths.markup }}>--</div>
          <div className="td-cell" style={{ width: columnWidths.issues }}>--</div>
          <div className="td-cell" style={{ width: columnWidths.size }}>{isFolder ? '--' : formatSize(item.size)}</div>
          <div className="td-cell" style={{ width: columnWidths.updated }}>{formatDate(item.updated)}</div>
          <div className="td-cell" style={{ width: columnWidths.user }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
               <div className="user-avatar-acc" style={{ width: 24, height: 24, fontSize: 10, flexShrink: 0 }}>
                  {typeof item.updated_by === 'object' && item.updated_by !== null
                    ? (item.updated_by.initials || '??') 
                    : getInitials(String(item.updated_by || 'ADMIN'))}
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                 <span style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {typeof item.updated_by === 'object' && item.updated_by !== null
                      ? (item.updated_by.name || 'Usuario') 
                      : String(item.updated_by || 'ADMIN')}
                 </span>
                 <span style={{ fontSize: 11, color: '#999', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>Trial account ysan...</span>
               </div>
            </div>
          </div>
          <div className="td-cell" style={{ width: columnWidths.status }}>--</div>
        </>
      )}

      {!isTrashMode && (
        <div className="td-cell" style={{ width: columnWidths.action, textAlign: 'center', justifyContent: 'center' }}>
          <button className="row-menu-btn" onClick={(e) => { e.stopPropagation(); onRowMenu(item, e); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * MatrixTable Component - A virtualized, high-performance table with synchronized 
 * headers and sticky identity columns, matching the ACC interface.
 */
const MatrixTable = ({ 
  folders, 
  files, 
  selected, 
  columnWidths, 
  totalTableWidth,
  toggle, 
  navigate, 
  setActiveFile, 
  onUpdateDescription,
  onRename,
  formatSize, 
  formatDate, 
  getInitials, 
  user, 
  isAdmin, 
  isTrashMode, 
  onShowVersions,
  onRowMenu,
  startResizing,
  setSelected,
  renderFileIconSop,
  editingNodeId,
  setEditingNodeId,
  rightClickedId,
  processingIds
}) => {
  const allItems = [...folders, ...files];
  return (
    <div className="table-wrap" style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto', overflowY: 'hidden', height: '100%', background: '#fff' }}>
      <div style={{ width: totalTableWidth, flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Cabecera Tipo Div (Sticky al tope) */}
        <div className="data-header" style={{ width: totalTableWidth, flexShrink: 0 }}>
          <div className="td-cell checkbox-cell td-frozen-left" style={{ width: columnWidths.checkbox, left: 0 }}>
            <input
              type="checkbox"
              checked={selected.size === allItems.length && allItems.length > 0}
              onChange={() => {
                if (selected.size === allItems.length) setSelected(new Set());
                else setSelected(new Set(allItems.map(i => i.fullName)));
              }}
            />
          </div>
          <div className="td-cell name-cell td-frozen-left" style={{ width: columnWidths.name, left: columnWidths.checkbox }}>
            Nombre
            <div className="resizer-acc" onMouseDown={e => startResizing(e, 'name')} />
          </div>
          {!isTrashMode && (
            <div className="td-cell" style={{ width: columnWidths.description }}>
              Descripción
              <div className="resizer-acc" onMouseDown={e => startResizing(e, 'description')} />
            </div>
          )}
          {!isTrashMode && (
            <>
              <div className="td-cell" style={{ width: columnWidths.version }}>
                Versión
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'version')} />
              </div>
              <div className="td-cell" style={{ width: columnWidths.indicators }}>
                Indicadores
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'indicators')} />
              </div>
              <div className="td-cell" style={{ width: columnWidths.markup }}>
                Marcas de rev.
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'markup')} />
              </div>
              <div className="td-cell" style={{ width: columnWidths.issues }}>
                Incidencias
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'issues')} />
              </div>
              <div className="td-cell" style={{ width: columnWidths.size }}>
                Tamaño
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'size')} />
              </div>
              <div className="td-cell" style={{ width: columnWidths.updated }}>
                Últ. actualización
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'updated')} />
              </div>
              <div className="td-cell" style={{ width: columnWidths.user }}>
                Actualizado por
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'user')} />
              </div>
              <div className="td-cell" style={{ width: columnWidths.status }}>
                Estado de rev.
                <div className="resizer-acc" onMouseDown={e => startResizing(e, 'status')} />
              </div>
            </>
          )}
          {!isTrashMode && (
            <div className="td-cell" style={{ width: columnWidths.action, textAlign: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ cursor: 'pointer', opacity: 0.7 }}>
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </div>
          )}
        </div>
 
        {/* Cuerpo Virtualizado */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <AutoSizer disableWidth>
            {({ height }) => (
              <List
                height={height}
                itemCount={allItems.length}
                itemSize={48}
                width={totalTableWidth}
                itemData={{
                  items: allItems,
                  selected,
                  toggle,
                  navigate,
                  setActiveFile,
                  onUpdateDescription,
                  onRename,
                  formatSize,
                  formatDate,
                  getInitials,
                  user,
                  isAdmin,
                  onRowMenu,
                  isTrashMode,
                  onShowVersions,
                  columnWidths,
                  renderFileIconSop,
                  editingNodeId,
                  setEditingNodeId,
                  rightClickedId,
                  processingIds
                }}
              >
                {TableRow}
              </List>
            )}
          </AutoSizer>
        </div>
      </div>
    </div>
  );
};

export default MatrixTable;
