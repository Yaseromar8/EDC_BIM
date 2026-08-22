import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { ESTADOS } from './utils/estadosECD';

// ── ISO 19650 Document Lifecycle ──────────────────────────────────────────
//
// Los colores NO se definen aqui. En un ECD el color significa: quien aprende
// en esta tabla que verde = publicado tiene que encontrarse lo mismo en todas
// las pantallas. Definirlos en cada modulo hace que la misma cosa se vea
// distinta segun donde se mire, y entonces el color deja de querer decir nada.
//
// Antes esto llevaba cuatro hexadecimales a mano, fuera del sistema de color
// del portal y sin contraste medido. Ahora sale de `utils/estadosECD`, que es
// el unico sitio donde vive el vocabulario visual del expediente.
const STATUS_CONFIG = Object.fromEntries(
  Object.entries(ESTADOS).map(([codigo, e]) => [
    codigo, { label: e.etiqueta, color: e.texto, bg: e.fondo, borde: e.borde },
  ]),
);

const VALID_TRANSITIONS = {
  WIP:       ['SHARED'],
  SHARED:    ['WIP', 'PUBLISHED'],
  PUBLISHED: ['SHARED', 'ARCHIVED'],
  ARCHIVED:  ['PUBLISHED'],
};

const ReviewStatusControl = ({ item, isAdmin, onStatusChange }) => {
  const st = item.status || 'WIP';
  const cfg = STATUS_CONFIG[st] || STATUS_CONFIG.WIP;
  const transitions = VALID_TRANSITIONS[st] || [];
  const [showDrop, setShowDrop] = useState(false);
  // Coordenadas de pantalla del menú. Ver el comentario del portal, abajo.
  const [pos, setPos] = useState(null);
  const dropRef = useRef(null);
  const menuRef = useRef(null);

  // ALTO ESTIMADO del menú, para decidir si cabe debajo del botón. Es
  // `transiciones × alto de fila + bordes`: no hace falta medirlo porque las
  // filas son de tamaño fijo y como mucho hay dos transiciones.
  const altoMenu = transitions.length * 33 + 10;

  const situar = useCallback(() => {
    const b = dropRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    // Si no cabe debajo, se abre HACIA ARRIBA. Sin esto, en la última fila de
    // una tabla llena el menú nacía fuera de la ventana.
    const cabeDebajo = window.innerHeight - r.bottom >= altoMenu + 8;
    setPos({
      left: Math.min(r.left, window.innerWidth - 150),
      top: cabeDebajo ? r.bottom + 4 : r.top - altoMenu - 4,
    });
  }, [altoMenu]);

  useEffect(() => {
    if (!showDrop) return;

    const fueraDeAmbos = (e) =>
      !(dropRef.current && dropRef.current.contains(e.target)) &&
      !(menuRef.current && menuRef.current.contains(e.target));

    const alPulsarFuera = (e) => { if (fueraDeAmbos(e)) setShowDrop(false); };
    // EL MENÚ VA EN COORDENADAS DE PANTALLA, así que si la lista se desplaza
    // o la ventana cambia de tamaño dejaría de estar sobre su botón. Se cierra:
    // reposicionarlo mientras rueda la lista virtualizada da un menú que
    // persigue al cursor sobre una fila que ya no es la suya.
    const alMover = () => setShowDrop(false);

    document.addEventListener('mousedown', alPulsarFuera);
    // `true` = fase de captura: el scroll de react-window no burbujea.
    window.addEventListener('scroll', alMover, true);
    window.addEventListener('resize', alMover);
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera);
      window.removeEventListener('scroll', alMover, true);
      window.removeEventListener('resize', alMover);
    };
  }, [showDrop]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={dropRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!isAdmin || transitions.length === 0) return;
          if (showDrop) { setShowDrop(false); return; }
          situar();
          setShowDrop(true);
        }}
        style={{
          background: cfg.bg,
          color: cfg.color,
          border: 'none',
          borderRadius: 12,
          padding: '2px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: isAdmin && transitions.length > 0 ? 'pointer' : 'default',
          whiteSpace: 'nowrap',
          lineHeight: '20px',
        }}
        title={item.codigo_idoneidad
          ? `${cfg.label} · ${item.codigo_idoneidad} (para qué está autorizado)`
          : (isAdmin && transitions.length > 0 ? 'Clic para cambiar estado' : cfg.label)}
      >
        {cfg.label}
        {/* El estado dice DÓNDE está; la idoneidad, PARA QUÉ sirve. Un documento
            publicado puede ser "solo para información": construir con él sería
            un error, y por eso el código va junto al estado y no escondido. */}
        {item.codigo_idoneidad ? ` · ${item.codigo_idoneidad}` : ''}
        {isAdmin && transitions.length > 0 ? ' ▾' : ''}
      </button>
      {/* EL MENÚ SE DIBUJA FUERA DE LA TABLA, EN EL BODY.
          Estaba `position:absolute` dentro de la fila, y la fila vive dentro
          del scroller de react-window -- que recorta lo que se sale. Resultado:
          el desplegable existía, respondía y no se veía, así que un documento
          no se podía sacar de Borrador desde la pantalla. Un portal con
          coordenadas de pantalla es lo único que escapa de un contenedor con
          scroll; `absolute` no puede, por muchos z-index que se le pongan. */}
      {showDrop && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 10000,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            minWidth: 130,
            overflow: 'hidden',
          }}
        >
          {transitions.map(nextSt => {
            const nextCfg = STATUS_CONFIG[nextSt];
            return (
              <button
                key={nextSt}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDrop(false);
                  if (onStatusChange) onStatusChange(item, nextSt);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#333',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.target.style.background = 'none'}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: nextCfg.color,
                    flexShrink: 0,
                  }}
                />
                {nextCfg.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};

/**
 * TableRow Component - Renders an individual row in the virtualized list.
 */
const TableRow = ({ index, style, data }) => {
  const { items, selected, toggle, navigate, setActiveFile, onUpdateDescription, onRename, formatSize, formatDate, getInitials, user, isAdmin, onRowMenu, isTrashMode, onShowVersions, columnWidths, renderFileIconSop, editingNodeId, setEditingNodeId, rightClickedId, processingIds, onStatusChange } = data;
  
  const item = items && items[index] ? items[index] : {};

  const [isEditing, setIsEditing] = useState(false);
  const [tempDesc, setTempDesc] = useState(item.description || '');

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(item.name || '');

  // Sync inline edit from context menu
  React.useEffect(() => {
    if (item.id && editingNodeId && editingNodeId.source === 'table' && editingNodeId.id === item.id) {
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

  if (!items || !items[index]) return null;

  const isFolder = item.type === 'folder';
  const isSelected = selected.has(item.fullName);
  const isGrey = item.has_access === false;

  // Abrir elemento: carpeta navega, archivo abre el visor
  const openItem = () => {
    if (isGrey) return;
    if (isFolder) navigate(item.fullName, item.id);
    else setActiveFile(item);
  };

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
      className={`data-row ${isSelected && !isGrey ? 'selected' : ''} ${item.id === rightClickedId && !isGrey ? 'context-active' : ''}`} 
      style={{ 
        ...style, 
        width: '100%',
        opacity: processingIds[item.id] ? 0.5 : (isGrey ? 0.6 : 1),
        filter: processingIds[item.id] ? 'grayscale(1)' : 'none',
        pointerEvents: processingIds[item.id] ? 'none' : 'auto',
        color: isGrey ? '#999' : 'inherit',
        transition: 'all 0.4s ease'
      }}
      // La fila no hace nada por sí sola. Abrir es de la columna Nombre y solo de
      // ella (como ACC); seleccionar es de la casilla y solo de ella. Antes el clic
      // de fila marcaba la casilla, y eso se pisaba con lo que el usuario iba a
      // hacer de verdad: entrar en la carpeta. En una tabla donde "seleccionado"
      // decide qué se borra y qué se desplaza, marcar sin querer sale caro.
      onDoubleClick={() => {
        if (isEditingName || isEditing) return;
        openItem();
      }}
      onContextMenu={(e) => {
        if (isGrey) {
          e.preventDefault();
          return;
        }
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
      {/* TODA la columna Nombre abre, no solo el texto: el icono y el hueco a la
          derecha del nombre también. Es lo que hace ACC, y evita el clic que no
          pasa nada por haber caído dos píxeles al lado de la letra. El lápiz, la
          casilla y la caja de edición paran la propagación por su cuenta. */}
      <div
        className="td-cell name-cell td-frozen-left name-cell-editable"
        style={{
          width: columnWidths.name,
          left: columnWidths.checkbox,
          cursor: (isGrey || isEditingName) ? 'default' : 'pointer'
        }}
        onClick={() => {
          if (isGrey || isEditingName) return;
          openItem();
        }}
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
              style={{ 
                marginLeft: isFolder ? 0 : 8, 
                cursor: isGrey ? 'not-allowed' : 'pointer', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap'
              }}
            >
              {item.name || 'Sin nombre'}
            </span>
            {/* Reservado para editar. Se ve en la fila, sin abrir nada: quien va a
                trabajar en un documento tiene que enterarse ANTES de empezar, no
                cuando ya ha invertido dos horas y le rechazan la subida. */}
            {item.bloqueado_por && (
              <span
                title={`Reservado por ${item.bloqueado_por}` + (item.bloqueado_en ? ` desde el ${new Date(item.bloqueado_en).toLocaleDateString()}` : '')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, color: '#b26a00', fontSize: 11 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                {String(item.bloqueado_por).split('@')[0]}
              </span>
            )}
            {isAdmin && !isGrey && (
              <svg 
                className="pencil-icon-acc name-pencil" 
                onClick={startEditingName}
                width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                style={{ cursor: 'pointer', stroke: 'var(--accent)' }}
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
          onClick={(e) => {
            // Editar descripción: solo admin con acceso; el clic no debe alterar la selección
            if (!isAdmin || isGrey) return;
            e.stopPropagation();
            setIsEditing(true);
          }}
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
              {isAdmin && !isGrey && (
                <svg className="pencil-icon-acc" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--accent)' }}>
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              )}
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
                title={item.codigo_revision
                  ? `Revisión emitida ${item.codigo_revision} · subida V${item.version || 1}`
                  : `Subida V${item.version || 1} — todavía sin emitir`}
              >
                {/* La REVISIÓN es la emisión formal; la V es el contador de
                    subidas. Corregir una errata sube la V y no la revisión, y
                    confundirlas es lo que impedía decir "esta es la P02". */}
                {item.codigo_revision || `V${item.version || 1}`}
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
               </div>
            </div>
          </div>
          <div className="td-cell" style={{ width: columnWidths.status }}>
            {!isFolder && (
              <ReviewStatusControl
                item={item}
                isAdmin={isAdmin}
                onStatusChange={onStatusChange}
              />
            )}
          </div>
        </>
      )}

      {!isTrashMode && (
        <div className="td-cell" style={{ width: columnWidths.action, textAlign: 'center', justifyContent: 'center' }}>
          {!isGrey && (
            <button className="row-menu-btn" onClick={(e) => { e.stopPropagation(); onRowMenu(item, e); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
          )}
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
  processingIds,
  onStatusChange
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
              checked={allItems.length > 0 && allItems.every(i => selected.has(i.fullName))}
              onChange={() => {
                const allChecked = allItems.length > 0 && allItems.every(i => selected.has(i.fullName));
                if (allChecked) setSelected(new Set());
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
            <div className="td-cell" style={{ width: columnWidths.action }} />
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
                  processingIds,
                  onStatusChange
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
