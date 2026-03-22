import React, { useState, useEffect, useRef } from 'react';

export default function SidebarTree({ currentPath, onNavigate, project, isAdmin, API }) {
  const [rootFolders, setRootFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(280);
  const isResizing = useRef(false);

  useEffect(() => {
    const listRoot = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/docs/list?path=&model_urn=${encodeURIComponent(project?.model_urn || project?.id || 'global')}`);
        if (res.ok) {
          const response = await res.json();
          const data = response.data || {};
          setRootFolders((data.folders || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    if (project) listRoot();
  }, [project, API]);

  const startResizing = (e) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
  };

  const handleMouseMove = (e) => {
    if (!isResizing.current) return;
    const newWidth = e.clientX;
    if (newWidth > 150 && newWidth < 600) setWidth(newWidth);
  };

  const stopResizing = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
  };

  return (
    <div className="sidebar-tree-container" style={{ width, minWidth: width, position: 'relative' }}>
      <div className="sidebar-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span>Archivos de proyecto</span>
      </div>
      <div className="sidebar-content">
        {loading && <div className="tree-loading-shimmer" />}
        {rootFolders.map(f => (
          <FolderNode 
            key={f.id} 
            folder={f} 
            level={0} 
            onNavigate={onNavigate} 
            currentPath={currentPath} 
            project={project}
            isAdmin={isAdmin}
            API={API}
          />
        ))}
      </div>
      <div className="sidebar-resizer" onMouseDown={startResizing} />
    </div>
  );
}

function FolderNode({ folder, level, onNavigate, currentPath, project, isAdmin, API }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentPath.startsWith(folder.fullName) && !expanded) {
      setExpanded(true);
    }
  }, [currentPath, folder.fullName, expanded]);

  const loadChildren = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/docs/list?path=${encodeURIComponent(folder.fullName)}&model_urn=${encodeURIComponent(project?.model_urn || project?.id || 'global')}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.data || {};
        const sorted = (data.folders || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setChildren(sorted);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleToggle = async (e) => {
    e.stopPropagation();
    if (!expanded && !children) await loadChildren();
    setExpanded(!expanded);
  };

  const isActive = currentPath === folder.fullName;
  const isChildrenActive = currentPath.startsWith(folder.fullName) && !isActive;

  return (
    <div className="folder-node-wrapper">
      <div 
        className={`folder-row ${isActive ? 'active' : ''} ${isChildrenActive ? 'child-active' : ''}`}
        style={{ paddingLeft: level * 16 + 12 }}
        onClick={() => onNavigate(folder.fullName)}
      >
        <div className="expander" onClick={handleToggle}>
          {loading ? (
            <div className="spinner-tiny" />
          ) : (
            <svg 
              width="12" height="12" viewBox="0 0 24 24" 
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }}
              fill="currentColor"
            >
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          )}
        </div>
        <span className="icon">📁</span>
        <span className="name">{folder.name.replace(/\/$/, '')}</span>
      </div>
      {expanded && children && (
        <div className="folder-children">
          {children.map(c => (
            <FolderNode 
              key={c.id} 
              folder={c} 
              level={level + 1} 
              onNavigate={onNavigate} 
              currentPath={currentPath} 
              project={project}
              isAdmin={isAdmin}
              API={API}
            />
          ))}
        </div>
      )}
    </div>
  );
}
