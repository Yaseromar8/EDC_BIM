import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import './HeatmapConfigPanel.css';

export const THEME_PALETTES = {
    'Classic Tandem': ['#3AA0FF', '#F97316', '#10B981', '#F43F5E', '#A855F7', '#0EA5E9', '#EAB308', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#84CC16', '#F59E0B'],
    'Purple - Red': ['#6366F1', '#8B5CF6', '#A855F7', '#EC4899', '#F43F5E', '#EF4444'],
    'Blue - Green': ['#0EA5E9', '#3AA0FF', '#14B8A6', '#10B981', '#84CC16'],
    'Heatmap (Cold-Hot)': ['#3AA0FF', '#10B981', '#F59E0B', '#F97316', '#EF4444']
};

const HeatmapConfigPanel = ({ propId, propName, initialPalette, onApply, onClose }) => {
    const [selectedPalette, setSelectedPalette] = useState(initialPalette || 'Classic Tandem');

    const handleApply = () => {
        onApply(selectedPalette);
    };

    const targetDiv = document.getElementById('viewer-top-portal');
    if (!targetDiv) return null;

    return ReactDOM.createPortal(
        <div className="heatmap-overlay" data-test-id="heatmap-portal" style={{ pointerEvents: 'auto' }}>
            <div className="heatmap-dialog">
                <header className="heatmap-dialog-header">
                    <h4>Theming: {propName || propId.split('::').pop()}</h4>
                    <button onClick={onClose} className="heatmap-close">&times;</button>
                </header>
                <div className="heatmap-dialog-body">
                    <p className="heatmap-desc">Select a color spectrum to colorize elements by this property.</p>
                    <div className="heatmap-palettes">
                        {Object.entries(THEME_PALETTES).map(([name, colors]) => (
                            <button 
                                key={name} 
                                className={`heatmap-palette-btn ${selectedPalette === name ? 'active' : ''}`}
                                onClick={() => setSelectedPalette(name)}
                                data-test-id={`palette-option-${name.replace(/\s+/g, '-')}`}
                            >
                                <span className="heatmap-palette-name">{name}</span>
                                <div className="heatmap-palette-preview">
                                    <svg width="100%" height="24" style={{ borderRadius: '4px' }}>
                                        <defs>
                                            <linearGradient id={`grad-${name.replace(/\s+/g, '')}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                                {colors.map((c, i) => (
                                                    <stop key={c + i} offset={`${(i / (colors.length - 1)) * 100}%`} stopColor={c} />
                                                ))}
                                            </linearGradient>
                                        </defs>
                                        <rect width="100%" height="100%" fill={`url(#grad-${name.replace(/\s+/g, '')})`} />
                                    </svg>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
                <footer className="heatmap-dialog-footer">
                    <button className="heatmap-btn-secondary" onClick={onClose} data-test-id="heatmap-cancel">Cancel</button>
                    <button className="heatmap-btn-primary" onClick={handleApply} data-test-id="heatmap-apply">Apply Theme</button>
                </footer>
            </div>
        </div>,
        targetDiv
    );
};

export default HeatmapConfigPanel;
