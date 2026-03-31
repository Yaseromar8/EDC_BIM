/**
 * VersionPanel.jsx — Panel lateral de historial de versiones
 * Refactorización Fase 2: Capa de Modales
 * Extraído de App.jsx líneas 2300-2466
 */
import React from 'react';
import { renderFileIconSop } from '../../utils/fileIcons';
import { formatSizeDetailed as formatSize, formatDate, getInitialsDetailed as getInitials } from '../../utils/helpers';

export default function VersionPanel({
  isOpen,
  versionTarget,
  versionHistory,
  loadingVersions,
  versionPanelWidth,
  startVersionResize,
  selectedVersions, setSelectedVersions,
  versionRowMenu, setVersionRowMenu,
  projectPrefix,
  onClose,
  onPromote,
}) {
  if (!isOpen || !versionTarget) return null;

  const API = (typeof window !== 'undefined' && window.__VISOR_API__) || '';

  return (
    <>
      <div className="side-panel-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.1)' }}>
        <div className="right-side-panel" onClick={e => e.stopPropagation()} style={{ position: 'relative', width: versionPanelWidth, height: '100%', background: '#fff', borderLeft: '1px solid #dcdcdc', display: 'flex', flexDirection: 'column', animation: 'slideRight 0.3s ease-out' }}>
          {/* Resize Handle */}
          <div 
            onMouseDown={startVersionResize}
            style={{ position: 'absolute', left: -2, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 100 }}
          />
          <div className="right-panel-header" style={{ height: 48, borderBottom: '1px solid #dcdcdc', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: '#333' }}>Historial de versiones</h1>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' }}>×</button>
          </div>
          
          <div className="panel-version-table-container" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #dcdcdc', height: 36 }}>
                  <th style={{ width: 40, padding: '0 12px', position: 'sticky', left: 0, top: 0, background: '#f5f5f5', zIndex: 20, borderBottom: '1px solid #dcdcdc', whiteSpace: 'nowrap' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedVersions.size === versionHistory.length && versionHistory.length > 0} 
                      onChange={() => {
                        if (selectedVersions.size === versionHistory.length) setSelectedVersions(new Set());
                        else setSelectedVersions(new Set(versionHistory.map(v => v.id)));
                      }}
                    />
                  </th>
                  <th style={{ width: 80, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', position: 'sticky', left: 40, top: 0, background: '#f5f5f5', zIndex: 20, borderBottom: '1px solid #dcdcdc', whiteSpace: 'nowrap' }}>Versión</th>
                  <th style={{ minWidth: 300, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Nombre</th>
                  <th style={{ width: 100, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Indicadores</th>
                  <th style={{ width: 100, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Marcas de rev.</th>
                  <th style={{ width: 100, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Tamaño</th>
                  <th style={{ width: 150, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Última actualización</th>
                  <th style={{ width: 220, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Actualizado por</th>
                  <th style={{ width: 220, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Versión añadida por</th>
                  <th style={{ width: 150, padding: '0 12px', fontSize: 13, color: '#666', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Estado de revisión</th>
                  <th style={{ width: 40, padding: '0 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {loadingVersions ? (
                  <tr><td colSpan="11" style={{ textAlign: 'center', padding: 40 }}><div className="adsk-spinner" /></td></tr>
                ) : versionHistory.map((v, i) => {
                  const isSelected = selectedVersions.has(v.id);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', background: isSelected ? '#f6fbff' : '#fff' }}>
                      <td style={{ padding: '16px 12px', position: 'sticky', left: 0, background: isSelected ? '#f6fbff' : '#fff', zIndex: 5 }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => {
                            const next = new Set(selectedVersions);
                            if (isSelected) next.delete(v.id); else next.add(v.id);
                            setSelectedVersions(next);
                          }} 
                        />
                      </td>
                      <td style={{ padding: '16px 12px', position: 'sticky', left: 40, background: isSelected ? '#f6fbff' : '#fff', zIndex: 5 }}>
                         <span className="version-link-acc">{v.version_number ? `V${v.version_number}` : 'V1'}</span>
                      </td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 12 }}>
                          {renderFileIconSop(versionTarget.name, 22)}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#3c3c3c' }}>{versionTarget.name}</span>
                            <span style={{ fontSize: 11, color: '#999' }}>Cargado por <span style={{ textTransform: 'uppercase' }}>{v.updated_by || 'ADMIN'}</span></span>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>--</td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>--</td>
                      <td style={{ padding: '16px 12px', fontSize: 13, color: '#3c3c3c', whiteSpace: 'nowrap' }}>{formatSize(v.size || 0)}</td>
                      <td style={{ padding: '16px 12px', fontSize: 13, color: '#3c3c3c', whiteSpace: 'nowrap' }}>{formatDate(v.updated)}</td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <div className="user-avatar-acc" style={{ width: 24, height: 24, fontSize: 10, flexShrink: 0 }}>{getInitials(v.updated_by || 'ADMIN')}</div>
                           <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                             <span style={{ fontSize: 13, color: '#3c3c3c', textOverflow: 'ellipsis', overflow: 'hidden' }}>{v.updated_by || 'ADMIN'}</span>
                             <span style={{ fontSize: 11, color: '#999', textOverflow: 'ellipsis', overflow: 'hidden' }}>Trial account ysan...</span>
                           </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <div className="user-avatar-acc" style={{ width: 24, height: 24, fontSize: 10, flexShrink: 0 }}>{getInitials(v.updated_by || 'ADMIN')}</div>
                           <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                             <span style={{ fontSize: 13, color: '#3c3c3c', textOverflow: 'ellipsis', overflow: 'hidden' }}>{v.updated_by || 'ADMIN'}</span>
                             <span style={{ fontSize: 11, color: '#999', textOverflow: 'ellipsis', overflow: 'hidden' }}>Trial account ysan...</span>
                           </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>--</td>
                      <td style={{ padding: '16px 12px', whiteSpace: 'nowrap' }}>
                        <button 
                          className="row-menu-btn" 
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setVersionRowMenu({ v, x: rect.left - 180, y: rect.bottom + 5, isSelected });
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <footer style={{ height: 40, borderTop: '1px solid #dcdcdc', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 12, color: '#666', background: '#fff' }}>
             {selectedVersions.size > 0 ? `${selectedVersions.size} de ${versionHistory.length} seleccionadas` : `Se están mostrando ${versionHistory.length} versiones`}
          </footer>
        </div>
      </div>

      {/* VERSION ROW CONTEXT MENU */}
      {versionRowMenu && (
        <div 
          className="modal-overlay" 
          onClick={() => setVersionRowMenu(null)}
          style={{ background: 'transparent', zIndex: 11000 }}
        >
          <div 
            className="row-context-menu" 
            style={{ position: 'fixed', left: versionRowMenu.x, top: versionRowMenu.y, width: 220 }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { setVersionRowMenu(null); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              Copiar
            </button>
            <button onClick={() => { setVersionRowMenu(null); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Añadir a paquetes
            </button>
            <button onClick={() => {
              const token = localStorage.getItem('visor_session_token') || sessionStorage.getItem('visor_session_token');
              const tokenQuery = token ? `&session_token=${token}` : '';
              if (versionRowMenu.v.gcs_urn) window.open(`${API}/api/docs/view?urn=${encodeURIComponent(versionRowMenu.v.gcs_urn)}&model_urn=${encodeURIComponent(projectPrefix)}${tokenQuery}`, '_blank');
              setVersionRowMenu(null);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Descargar archivo de origen
            </button>
            
            {versionRowMenu.isSelected && versionRowMenu.v.version_number !== versionHistory[0]?.version_number && (
              <>
                <div className="menu-divider" />
                <button 
                  onClick={() => { onPromote(versionRowMenu.v); setVersionRowMenu(null); }}
                  style={{ fontWeight: 600 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                  Establecer como actual
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
