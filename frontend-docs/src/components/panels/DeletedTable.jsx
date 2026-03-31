/**
 * DeletedTable.jsx — Tabla de elementos eliminados (papelera)
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 933-1028
 */
import React from 'react';
import { renderFileIconSop } from '../../utils/fileIcons';

export default function DeletedTable({ items, selectedIds, onToggle, onRestore, getInitials, restoringIds }) {
  const colWidths = { checkbox: 40, name: 400, filename: 300, user: 250, date: 150 };
  const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);

  return (
    <div className="table-wrap" style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', height: '100%', background: '#fff' }}>
      <div style={{ width: totalWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #eee' }}>
        <div className="data-header" style={{ position: 'sticky', top: 0, zIndex: 30, width: totalWidth, background: '#f8f9fa' }}>
          <div className="td-cell checkbox-cell" style={{ width: colWidths.checkbox }}>
            <input 
              type="checkbox" 
              checked={selectedIds.length === items.length && items.length > 0} 
              onChange={() => {
                if (selectedIds.length === items.length) onToggle([]);
                else onToggle(items.map(it => it.id));
              }}
            />
          </div>
          <div className="td-cell" style={{ width: colWidths.name }}>Nombre</div>
          <div className="td-cell" style={{ width: colWidths.filename }}>Nombre de archivo</div>
          <div className="td-cell" style={{ width: colWidths.user }}>Suprimido por</div>
          <div className="td-cell" style={{ width: colWidths.date }}>Fecha de supresión</div>
        </div>
        <div className="deleted-rows" style={{ flex: 1 }}>
          {items.map(item => {
            const isSelected = selectedIds.includes(item.id);
            const isRestoring = restoringIds[item.id];
            return (
              <div 
                key={item.id} 
                className={`data-row ${isSelected ? 'selected' : ''}`} 
                style={{ 
                  height: 48, display: 'flex', alignItems: 'center', 
                  borderBottom: '1px solid #f2f2f2',
                  opacity: isRestoring ? 0.5 : 1,
                  filter: isRestoring ? 'grayscale(1)' : 'none',
                  transition: 'all 0.4s ease',
                  width: totalWidth
                }}
              >
                <div className="td-cell checkbox-cell" style={{ width: colWidths.checkbox }}>
                  {!isRestoring && (
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => {
                        if (isSelected) onToggle(selectedIds.filter(id => id !== item.id));
                        else onToggle([...selectedIds, item.id]);
                      }}
                    />
                  )}
                </div>
                <div className="td-cell" style={{ width: colWidths.name, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.type === 'folder' ? (
                     <svg width="20" height="20" viewBox="0 0 24 24" fill={isRestoring ? '#ccc' : "#666"}><path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"/></svg>
                  ) : (
                    renderFileIconSop(item.name, 22)
                  )}
                  <span style={{ fontSize: 13, color: isRestoring ? '#aaa' : '#1f1f1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
                <div className="td-cell" style={{ width: colWidths.filename, fontSize: 13, color: isRestoring ? '#ccc' : '#666', borderRight: 'none' }}>{item.filename}</div>
                <div className="td-cell" style={{ width: colWidths.user }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="user-avatar-acc" style={{ width: 24, height: 24, fontSize: 10, background: isRestoring ? '#eee' : '#f5c6cb', color: isRestoring ? '#ccc' : 'white' }}>{item.deletedBy.initials}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span style={{ fontSize: 13, color: isRestoring ? '#aaa' : '#1f1f1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.deletedBy.name}</span>
                        <span style={{ fontSize: 11, color: isRestoring ? '#ddd' : '#999' }}>Trial account ysan...</span>
                      </div>
                   </div>
                </div>
                <div className="td-cell" style={{ width: colWidths.date, fontSize: 13, color: isRestoring ? '#ccc' : '#666', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 }}>
                   <span>{item.date}</span>
                   {!isRestoring && (
                     <button 
                      onClick={() => onRestore(item.id)}
                      className="restore-btn-acc"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 4 }}
                      title="Restaurar"
                     >
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>
                     </button>
                   )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 32, borderTop: '1px solid #f2f2f2', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 12, color: '#666', background: '#fff' }}>
          Mostrando {items.length} elementos
        </div>
      </div>
    </div>
  );
}
