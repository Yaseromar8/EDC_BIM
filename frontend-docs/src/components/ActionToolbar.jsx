import React from 'react';

export default function ActionToolbar({ search, onSearchChange, onUploadClick, isAdmin, isAiOpen, onAiToggle, onCreateFolder }) {
  return (
    <div className="action-toolbar">
      <div className="toolbar-left">
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="split-button-group">
              <button className="btn-main-blue" onClick={onUploadClick}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-10l5-5 5 5m-5-5v12"></path></svg>
                Cargar archivos
              </button>
              <button className="btn-main-blue-arrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"></path></svg>
              </button>
            </div>
            <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, fontSize: 13, borderColor: '#dcdcdc', background: '#fff', color: '#333' }} onClick={onCreateFolder}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
              Carpeta
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-right">
        <div className="search-box-pro">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            placeholder="Buscar por descripción en esta carpeta..." 
            value={search} 
            onChange={e => onSearchChange(e.target.value)} 
          />
        </div>

        <div className="view-toggle-group">
          <button className="toggle-btn active" title="Vista Lista"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="12" x2="3" y2="12"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg></button>
          <button className="toggle-btn" title="Vista Cuadrícula"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></button>
        </div>

        <button className={`ai-toggle-btn ${isAiOpen ? 'active' : ''}`} onClick={onAiToggle} title="Asistente AI">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>
    </div>
  );
}
