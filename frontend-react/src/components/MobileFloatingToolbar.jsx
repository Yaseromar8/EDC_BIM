import React, { useState } from 'react';
import './MobileFloatingToolbar.css';

// Reuse icons or accept them as props. 
// For cleaner code, we'll accept an config array of items: { id, icon, active, onClick, label }

const ChevronIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
);

const MobileFloatingToolbar = ({ items }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const toggle = () => setIsExpanded(!isExpanded);

    return (
        <div className="mobile-floating-toolbar">
            {/* Note: We put the list ABOVE/BELOW based on design. 
                 User example showed icons appearing.
                 Let's put the toggle at the BOTTOM of the stack or TOP?
                 Autodesk Viewer app often has tools on Right.
             */}

            <div className={`mft-items ${!isExpanded ? 'hidden' : ''}`}>
                {items.map((item) => (
                    <button
                        key={item.id}
                        className={`mft-action-btn ${item.active ? 'active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            item.onClick();
                            // Optional: Auto collapse? Maybe not if toggling panels.
                        }}
                        title={item.label}
                    >
                        {item.icon}
                    </button>
                ))}
            </div>

            <button
                className={`mft-toggle-btn ${!isExpanded ? 'collapsed' : ''}`}
                onClick={toggle}
                aria-label={isExpanded ? "Collapse Tools" : "Expand Tools"}
            >
                <ChevronIcon />
            </button>
        </div>
    );
};

export default MobileFloatingToolbar;
