import React from 'react';
import './TopBar.css';

// SVGs for Tandem-like icons
const LogoIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 4h16v16H4V4z" fill="#E1251B" />
        <path d="M8 8h8v2h-3v6h-2v-6H8V8z" fill="white" />
    </svg>
);

const SelectionIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
);

const MeasureIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 16.5c0 0-4-6.5-12-6.5S3 14 3 14" />
        <path d="M3 17h18" />
        <path d="M3 14v4" />
        <path d="M21 14v4" />
        <path d="M6 17v-1.5" />
        <path d="M9 17v-1.5" />
        <path d="M12 17v-1.5" />
        <path d="M15 17v-1.5" />
        <path d="M18 17v-1.5" />
    </svg>
);

const ChevronDown = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const SearchIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const BookmarkIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
);

const PieChartIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
);

const BellIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
);

const HelpIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const TopBar = ({
    activePanel,
    togglePanel,
    isViewsActive
}) => {
    return (
        <header className="top-bar">
            <div className="top-bar-left">
                <div className="logo-section">
                    <img src="/logo.png" alt="Logo" style={{ height: '32px' }} />
                </div>
            </div>

            <div className="top-bar-center">
                {/* Search removed */}
            </div>

            <div className="top-bar-right">
                <button
                    className={`tool-btn view-trigger ${isViewsActive ? 'active' : ''}`}
                    onClick={() => togglePanel('views')}
                    title="Saved Views"
                >
                    <BookmarkIcon />
                </button>
            </div>
        </header>
    );
};

export default TopBar;
