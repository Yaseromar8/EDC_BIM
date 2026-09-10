/**
 * BANCO VISUAL · tabla de ficheros del segundo panel.
 *
 * Monta el `MatrixTable` REAL con el hook `useColumnResize` REAL y datos de
 * mentira. Existe para poder ARRASTRAR las columnas: que un tirador exista en
 * el marcado no demuestra que se pueda agarrar, y ese era justo el fallo —los
 * nueve tiradores estaban dibujados y apilados fuera de su columna—.
 *
 * Lo que este banco NO cubre: la carga real, los permisos, el menú de fila
 * contra el backend. Eso sólo lo prueba la aplicación entera con sesión.
 *
 * No entra en producción: `vite.config.js` no lo conoce.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MatrixTable from './MatrixTable';
import { useColumnResize } from './hooks/useColumnResize';
import './index.css';

// Nombres y descripciones LARGOS a propósito: son los que el dueño no podía
// leer porque la columna los cortaba y no se dejaba ensanchar.
const FICHEROS = [
    {
        id: 1, name: 'POLITECNICO_TALARA_ESTRUCTURAS_R03.rvt', fullName: 'POLITECNICO_TALARA_ESTRUCTURAS_R03.rvt',
        description: 'Modelo estructural del politécnico — revisión para construcción',
        version: 3, codigo_revision: 'C03', size: 184300000, updated: '2026-09-01T10:12:00Z',
        updated_by: { name: 'Yaser Omar Sánchez', initials: 'YS' }, status: 'PUBLISHED',
    },
    {
        id: 2, name: 'SANTARITA_TOPOGRAFIA_LEVANTAMIENTO_GENERAL.dwg', fullName: 'SANTARITA_TOPOGRAFIA_LEVANTAMIENTO_GENERAL.dwg',
        description: 'Levantamiento topográfico general de la zona de Santa Rita',
        version: 1, size: 42100000, updated: '2026-08-27T16:40:00Z',
        updated_by: { name: 'Ana Quispe Mendoza', initials: 'AQ' }, status: 'SHARED',
    },
    {
        id: 3, name: '500125-CSSP001-740-XX-DR-ST-004120.pdf', fullName: '500125-CSSP001-740-XX-DR-ST-004120.pdf',
        description: 'Plano de detalle de canales — pendiente de emisión',
        version: 2, size: 3100000, updated: '2026-09-08T09:05:00Z',
        updated_by: 'ADMIN', status: 'WIP',
    },
];

const CARPETAS = [
    { id: 90, name: '02_MODELOS_FEDERADOS', fullName: '02_MODELOS_FEDERADOS', isFolder: true, type: 'folder', updated: '2026-09-05T12:00:00Z', updated_by: 'ADMIN' },
];

const formatSize = b => !b ? '--' : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`;
const formatDate = d => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
const getInitials = n => String(n || '?').slice(0, 2).toUpperCase();
const renderFileIconSop = () => <span className="icon">📄</span>;

function Banco() {
    const { columnWidths, totalTableWidth, startResizing, ajustarAncho } = useColumnResize();
    const [selected, setSelected] = useState(new Set());
    const [editingNodeId, setEditingNodeId] = useState(null);

    return (
        <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Tabla de ficheros · anchos de columna</p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: '#444' }}>
                <li>Acerca el ratón al borde derecho de CUALQUIER cabecera: el tirador se tiñe.</li>
                <li>Arrastra: sólo esa columna cambia; la tabla crece y se desplaza en horizontal.</li>
                <li>Nombre y la casilla siguen congeladas a la izquierda al desplazar.</li>
            </ul>
            <div style={{ height: 420, border: '1px solid #ddd', background: '#fff' }}>
                <MatrixTable
                    folders={CARPETAS}
                    files={FICHEROS}
                    selected={selected}
                    setSelected={setSelected}
                    columnWidths={columnWidths}
                    totalTableWidth={totalTableWidth}
                    startResizing={startResizing}
                    ajustarAncho={ajustarAncho}
                    toggle={n => setSelected(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; })}
                    navigate={() => {}}
                    setActiveFile={() => {}}
                    onUpdateDescription={() => {}}
                    onRename={() => {}}
                    formatSize={formatSize}
                    formatDate={formatDate}
                    getInitials={getInitials}
                    user={{ name: 'Banco' }}
                    isAdmin
                    isTrashMode={false}
                    onShowVersions={() => {}}
                    onRowMenu={() => {}}
                    renderFileIconSop={renderFileIconSop}
                    editingNodeId={editingNodeId}
                    setEditingNodeId={setEditingNodeId}
                    rightClickedId={null}
                    processingIds={{}}
                    onStatusChange={() => {}}
                />
            </div>
            <p id="medida" style={{ marginTop: 12, fontSize: 12, color: '#666', fontFamily: 'monospace' }}>
                {JSON.stringify(columnWidths)}
            </p>
        </div>
    );
}

const nodo = document.getElementById('raiz');
if (!nodo.__raiz) nodo.__raiz = createRoot(nodo);
nodo.__raiz.render(<Banco />);
