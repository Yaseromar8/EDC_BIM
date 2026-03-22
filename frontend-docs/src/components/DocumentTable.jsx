import React, { useState } from 'react';

export default function DocumentTable({ items, isAdmin, onNavigate, onAction, fileIcon, formatDate, formatSize }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (e, item) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditValue(item.name.replace(/\/$/, ''));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const submitEdit = (e, item) => {
    e.stopPropagation();
    onAction('rename', item, editValue);
    setEditingId(null);
  };

  return (
    <div className="document-table-container">
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="sticky-col checkbox-col"><input type="checkbox" /></th>
            <th className="sticky-col name-col">Nombre</th>
            <th className="desc-col">Descripción</th>
            <th className="version-col">Versión</th>
            <th className="size-col">Tamaño</th>
            <th className="date-col">Última actualización</th>
            <th className="user-col">Actualizado por</th>
            <th className="actions-col"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const isFolder = item.type === 'folder' || item.is_folder;
            return (
              <tr key={item.id} onClick={() => isFolder ? onNavigate(item.fullName) : onAction('open', item)}>
                <td className="sticky-col checkbox-col" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" />
                </td>
                <td className="sticky-col name-col">
                  <div className="document-name-cell">
                    <span className="icon">{isFolder ? '📁' : fileIcon(item.name)}</span>
                    {editingId === item.id ? (
                      <div className="inline-edit" onClick={e => e.stopPropagation()}>
                        <input 
                          autoFocus 
                          value={editValue} 
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') submitEdit(e, item);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                        <button onClick={(e) => submitEdit(e, item)}>✔</button>
                      </div>
                    ) : (
                      <span className="name">{item.name.replace(/\/$/, '')}</span>
                    )}
                    {!editingId && (
                      <button className="pencil-btn" onClick={(e) => startEdit(e, item)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </button>
                    )}
                  </div>
                </td>
                <td className="desc-col">{item.description || '--'}</td>
                <td className="version-col">V1</td>
                <td className="size-col">{isFolder ? '--' : formatSize(item.size)}</td>
                <td className="date-col">{formatDate(item.updated_at || item.created_at)}</td>
                <td className="user-col">
                  {item.updated_by || 'Admin'}
                </td>
                <td className="actions-col" onClick={e => e.stopPropagation()}>
                  <button className="dots-btn" onClick={(e) => onAction('menu', item, e)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
