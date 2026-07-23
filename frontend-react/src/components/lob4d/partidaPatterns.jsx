import React from 'react';

// Patrones realmente definidos abajo — el trazo usa hatch SOLO si su familia
// tiene patrón; si no, cae a línea de color sólido.
export const DEFINED_PATTERNS = new Set([
    'excavT', 'excavM', 'excavE', 'relleE', 'relleno', 'cama', 'concr',
    'encofr', 'acero', 'solado', 'gavion', 'geot', 'refine', 'curado',
]);

// Definiciones SVG de <pattern> por familia — se inyectan en <defs> del gráfico.
// El id que usa el <line>/<rect> es "lobpat-{pattern}"
export const svgPatternDefs = () => (
    <defs>
        <pattern id="lobpat-excavT" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#8b5a2b" strokeWidth="1.6" />
        </pattern>
        <pattern id="lobpat-excavM" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#7c3f00" strokeWidth="2" />
        </pattern>
        <pattern id="lobpat-excavE" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#a56236" strokeWidth="1.2" />
        </pattern>
        <pattern id="lobpat-relleE" width="8" height="8" patternUnits="userSpaceOnUse">
            <polygon points="4,0 8,7 0,7" fill="#65a30d" opacity="0.6" />
        </pattern>
        <pattern id="lobpat-relleno" width="10" height="10" patternUnits="userSpaceOnUse">
            <polygon points="5,1 9,8 1,8" fill="#84cc16" opacity="0.5" />
        </pattern>
        <pattern id="lobpat-cama" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.7" fill="#f59e0b" />
        </pattern>
        <pattern id="lobpat-concr" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="6" height="6" fill="#334155" opacity="0.85" />
            <rect x="0.5" y="0.5" width="5" height="5" fill="none" stroke="#1e293b" strokeWidth="0.4" />
        </pattern>
        <pattern id="lobpat-encofr" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="5" height="5" fill="#a1a1aa" opacity="0.35" />
            <line x1="0" y1="0" x2="5" y2="5" stroke="#71717a" strokeWidth="0.4" />
        </pattern>
        <pattern id="lobpat-acero" width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="6" y2="6" stroke="#475569" strokeWidth="1" />
            <line x1="6" y1="0" x2="0" y2="6" stroke="#475569" strokeWidth="1" />
        </pattern>
        <pattern id="lobpat-solado" width="8" height="4" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="8" height="4" fill="#94a3b8" opacity="0.6" />
            <line x1="0" y1="2" x2="8" y2="2" stroke="#64748b" strokeWidth="0.4" />
        </pattern>
        <pattern id="lobpat-gavion" width="10" height="10" patternUnits="userSpaceOnUse">
            <polygon points="5,0 10,5 5,10 0,5" fill="none" stroke="#a16207" strokeWidth="1" />
        </pattern>
        <pattern id="lobpat-geot" width="8" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="2" x2="8" y2="2" stroke="#166534" strokeWidth="0.6" strokeDasharray="2 2" />
        </pattern>
        <pattern id="lobpat-refine" width="6" height="3" patternUnits="userSpaceOnUse">
            <line x1="0" y1="1.5" x2="6" y2="1.5" stroke="#a08a5b" strokeWidth="0.5" />
        </pattern>
        <pattern id="lobpat-curado" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.2" fill="none" stroke="#0284c7" strokeWidth="0.7" />
        </pattern>
    </defs>
);
