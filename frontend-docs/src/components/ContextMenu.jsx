import React, { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, onClose, actions }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div 
      ref={menuRef}
      className="context-menu-floating"
      style={{ top: y, left: x }}
    >
      {actions.map((action, i) => (
        <div 
          key={i} 
          className={`menu-item ${action.danger ? 'danger' : ''}`}
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          {action.icon && <span className="menu-icon">{action.icon}</span>}
          <span className="menu-label">{action.label}</span>
        </div>
      ))}
    </div>
  );
}
