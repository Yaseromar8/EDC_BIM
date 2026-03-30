import sys

filepath = r'd:\VISOR_APS_TL\frontend-docs\src\App.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_folder_node = '''function FolderNode({ 
  user,
  folder, 
  currentPath, 
  onNavigate, 
  projectPrefix, 
  level = 1, 
  defaultExpanded = false, 
  isAdmin, 
  onTreeRefresh, 
  onGlobalRefresh, 
  refreshSignal = 0, 
  onInitiateMove, 
  collapseSignal = 0, 
  onReset,
  onRowMenu,
  editingNodeId,
  setEditingNodeId,
  rightClickedId,
  processingIds,
  setProcessingIds,
  creatingChildParentId,
  setCreatingChildParentId,
  cacheMethods
}) {
  const folderFullName = folder.fullName || '';
  const nodeId = folder.id || folderFullName;
  const isActive = currentPath === folderFullName;
  const isChildrenActive = folderFullName && currentPath.startsWith(folderFullName) && !isActive;

  const [expanded, setExpanded] = React.useState(defaultExpanded || isChildrenActive);
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef(null);

  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const [isCreatingChild, setIsCreatingChild] = React.useState(false);
  const [newChildName, setNewChildName] = React.useState('');

  const { folders: cachedFolders, files: cachedFiles, stale, loading } = cacheMethods ? cacheMethods.getChildren(nodeId) : { folders: null, loading: false };
  const children = cachedFolders || null;

  const submitRename = async () => {
    const folderNameStr = folder.name || '';
    if (!renameValue.trim() || renameValue.trim() === folderNameStr.replace(/\\/$/, '')) {
      setIsRenaming(false);
      return;
    }
    const newName = renameValue.trim();
    if (cacheMethods) cacheMethods.optimisticRename(folder.parentId || null, nodeId, newName);
    setIsRenaming(false);
    
    try {
      const res = await apiFetch(`${API}/api/docs/rename`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ node_id: nodeId, new_name: newName, model_urn: projectPrefix })
      });
      if (res.ok) {
        if (cacheMethods) cacheMethods.commitRename(folder.parentId || null, nodeId);
        if (onGlobalRefresh) onGlobalRefresh();
      } else {
        if (cacheMethods) cacheMethods.rollbackRename(folder.parentId || null, nodeId, folderNameStr);
        const err = await res.json();
        toast.error('Error al renombrar: ' + (err.error || 'Desconocido'));
      }
    } catch (e) {
      if (cacheMethods) cacheMethods.rollbackRename(folder.parentId || null, nodeId, folderNameStr);
      toast.error('Error de conexión');
    }
  };

  const submitCreateChild = async () => {
    if (!newChildName.trim()) { setIsCreatingChild(false); return; }
    const base = folderFullName;
    const newPath = base + (base.endsWith('/') ? '' : '/') + newChildName.trim() + '/';
    
    const tempId = 'temp_' + Date.now();
    const tempFolder = {
      id: tempId,
      name: newChildName.trim(),
      fullName: newPath,
      parentId: nodeId,
      type: 'folder',
      _syncing: true
    };
    
    if (cacheMethods) cacheMethods.optimisticCreate(nodeId, tempFolder);
    setIsCreatingChild(false);
    setNewChildName('');
    setExpanded(true);

    try { 
      const res = await apiFetch(`${API}/api/docs/folder`, { 
        method: 'POST', 
        headers: getAuthHeaders(), 
        body: JSON.stringify({ path: newPath, model_urn: projectPrefix, user: user?.name }) 
      });
      if (res.ok) {
        const data = await res.json();
        const realId = data.folder_id || newPath;
        if (cacheMethods) cacheMethods.commitCreate(nodeId, tempId, realId);
        if (onGlobalRefresh) onGlobalRefresh();
      } else {
        if (cacheMethods) cacheMethods.rollbackCreate(nodeId, tempId);
        const err = await res.json();
        toast.error('Error al crear: ' + (err.error || 'Desconocido'));
      }
    } catch (e) { 
      if (cacheMethods) cacheMethods.rollbackCreate(nodeId, tempId);
      toast.error('Error de red');
    }
  };

  React.useEffect(() => {
    if (expanded && refreshSignal > 0 && cacheMethods) {
      cacheMethods.expandNode(nodeId, folderFullName);
    }
  }, [refreshSignal, expanded, cacheMethods, nodeId, folderFullName]);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (defaultExpanded && !children && cacheMethods) {
      cacheMethods.expandNode(nodeId, folderFullName);
    }
  }, [defaultExpanded, children, cacheMethods, nodeId, folderFullName]);

  React.useEffect(() => {
    if (collapseSignal > 0 && level > 0) {
      setExpanded(false);
    }
  }, [collapseSignal, level]);

  React.useEffect(() => {
    if (folderFullName && currentPath.startsWith(folderFullName) && currentPath !== folderFullName) {
      if (!expanded) setExpanded(true);
      if (!children && cacheMethods) cacheMethods.expandNode(nodeId, folderFullName);
    }
  }, [currentPath, folderFullName, expanded, children, cacheMethods, nodeId]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!expanded && !children && cacheMethods) {
      cacheMethods.expandNode(nodeId, folderFullName);
    }
    setExpanded(!expanded);
  };

  React.useEffect(() => {
    if (editingNodeId && editingNodeId.source === 'sidebar' && editingNodeId.id === nodeId) {
      setIsRenaming(true);
      setRenameValue((folder.name || '').replace(/\\/$/, ''));
      setEditingNodeId(null);
    }
  }, [editingNodeId, folder.name, nodeId, setEditingNodeId]);

  React.useEffect(() => {
    if (creatingChildParentId === nodeId) {
      if (!expanded) {
         setExpanded(true);
      }
      if (cacheMethods) cacheMethods.expandNode(nodeId, folderFullName);
      setIsCreatingChild(true);
      setNewChildName('');
      setCreatingChildParentId(null);
    }
  }, [creatingChildParentId, nodeId, folderFullName, expanded, cacheMethods, setCreatingChildParentId]);

  return (
    <>
      <div
        className={`folder-tree-item ${isActive ? 'active' : ''} ${isChildrenActive ? 'child-active' : ''} ${nodeId === rightClickedId ? 'context-active' : ''}`}
        style={{ paddingLeft: `${8 + (level * 28)}px`, color: isActive ? '#0696D7' : folder._syncing ? '#999' : '#3c3c3c' }}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(folderFullName, folder.id);
          if (level === 0 && onReset) onReset();
        }}
        onContextMenu={(e) => {
          if (isAdmin) {
            e.preventDefault();
            e.stopPropagation();
            const item = { ...folder, type: 'folder', id: nodeId }; 
            onRowMenu(item, e);
          }
        }}
      >
        <div className="tree-toggle" onClick={handleToggle} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (!loading && children && children.length === 0 && expanded) ? 0 : 1 }}>
          {processingIds[nodeId] ? (
            <div className="adsk-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          ) : (
            loading && expanded && !children ? (
              <div className="adsk-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            ) : (
              <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor" style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', width: 20, height: 20 }}>
                <path d="M12,16.17a.74.74,0,0,1-.54-.23L6.23,10.52a.75.75,0,0,1,1.08-1L12,14.34l4.69-4.86a.75.75,0,1,1,1.08,1l-5.23,5.42A.74.74,0,0,1,12,16.17Z"></path>
              </svg>
            )
          )}
        </div>

        <div className="tree-icon" style={{ display: 'flex', alignItems: 'center', marginLeft: 4, marginRight: 8, opacity: folder._syncing ? 0.5 : 1 }}>
          <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
            <path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"></path>
          </svg>
        </div>

        {isRenaming ? (
          <div className="inline-edit-box" style={{ margin: '0 8px', height: 28 }} onClick={e => e.stopPropagation()}>
            <input 
              autoFocus 
              value={renameValue} 
              onFocus={(e) => e.target.select()}
              onChange={e => setRenameValue(e.target.value)} 
              onBlur={(e) => {
                if (e.relatedTarget && e.relatedTarget.closest('.inline-edit-box')) return;
                submitRename();
              }}
              onKeyDown={e => { 
                if (e.key === 'Enter') submitRename(); 
                if (e.key === 'Escape') setIsRenaming(false); 
              }}
              style={{ padding: '0 4px', fontSize: 13 }}
            />
            <button className="btn-cancel" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setIsRenaming(false); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <button className="btn-submit" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); submitRename(); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          </div>
        ) : (
          <div className="tree-text" style={{ textDecoration: undefined }}>
            {folder.name.replace(/\\/$/, '')}
          </div>
        )}
      </div>

      {expanded && (
        <div className="folder-children" style={{ display: 'block' }}>
          {isCreatingChild && (
            <div className="folder-tree-item child-creating" style={{ paddingLeft: `${8 + ((level + 1) * 28)}px` }}>
              <div className="tree-icon" style={{ display: 'flex', alignItems: 'center', marginLeft: 28, marginRight: 8 }}>
                 <svg fill="#e0e0e0" viewBox="0 0 24 24" width="24" height="24"><path d="M18,20.45H6a3.6,3.6,0,0,1-3.6-3.6V7.15A3.6,3.6,0,0,1,6,3.55h4.84a.71.71,0,0,1,.53.22l2.12,2.1H18a3.61,3.61,0,0,1,3.6,3.61v7.37A3.6,3.6,0,0,1,18,20.45ZM3.89,9.48v7.37A2.1,2.1,0,0,0,6,19H18a2.1,2.1,0,0,0,2.1-2.1V9.48A2.1,2.1,0,0,0,18,7.37H13.17a.75.75,0,0,1-.53-.22l-2.12-2.1H6a2.1,2.1,0,0,0-2.1,2.1Z"></path></svg>
              </div>
              <div className="inline-edit-box" style={{ flex: 1, margin: '0 8px', height: 28 }}>
                <input 
                  autoFocus 
                  value={newChildName} 
                  onChange={e => setNewChildName(e.target.value)}
                  onBlur={(e) => {
                    if (e.relatedTarget && e.relatedTarget.closest('.inline-edit-box')) return;
                    submitCreateChild();
                  }}
                  onKeyDown={e => { 
                    if (e.key === 'Enter') submitCreateChild(); 
                    if (e.key === 'Escape') setIsCreatingChild(false); 
                  }}
                  style={{ padding: '0 4px', fontSize: 13, width: '100%' }}
                  placeholder="Nombre de carpeta..."
                />
                <button className="btn-cancel" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={() => setIsCreatingChild(false)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <button className="btn-submit" style={{ width: 22, height: 22, marginLeft: 2 }} onMouseDown={(e) => e.preventDefault()} onClick={submitCreateChild}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
              </div>
            </div>
          )}
          {children && children.map(child => (
            <FolderNode 
              key={child.id || child.fullName} 
              user={user}
              folder={child} 
              currentPath={currentPath} 
              onNavigate={onNavigate} 
              projectPrefix={projectPrefix} 
              level={level + 1} 
              isAdmin={isAdmin}
              onTreeRefresh={onTreeRefresh}
              onGlobalRefresh={onGlobalRefresh}
              refreshSignal={refreshSignal}
              onInitiateMove={onInitiateMove}
              collapseSignal={collapseSignal}
              onReset={onReset}
              onRowMenu={onRowMenu}
              editingNodeId={editingNodeId}
              setEditingNodeId={setEditingNodeId}
              rightClickedId={rightClickedId}
              processingIds={processingIds}
              setProcessingIds={setProcessingIds}
              creatingChildParentId={creatingChildParentId}
              setCreatingChildParentId={setCreatingChildParentId}
              cacheMethods={cacheMethods}
            />
          ))}
        </div>
      )}
    </>
  );
}
'''

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if line.startswith('function FolderNode({'):
        start_idx = i
        break

if start_idx != -1:
    brace_count = 0
    for i in range(start_idx, len(lines)):
        line = lines[i]
        brace_count += line.count('{') - line.count('}')
        if brace_count == 0 and i > start_idx + 10:
            end_idx = i
            break

if start_idx != -1 and end_idx != -1:
    lines = lines[:start_idx] + [new_folder_node + '\n'] + lines[end_idx+1:]
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Replaced FolderNode successfully!")
else:
    print(f"Failed to find bounds. start: {start_idx}, end: {end_idx}")
