// Banco: la MatrixTable REAL con el aviso de observaciones (AvisoObservaciones) en los cuatro casos, con nombres de
// plano reales de la obra. `window.__abiertos` recoge lo que se abre con un clic.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MatrixTable from './MatrixTable';
import { useColumnResize } from './hooks/useColumnResize';
import { renderFileIconSop } from './utils/fileIcons';
import { instalarTooltips } from '../../design/ui/tooltips.js';
import './index.css';

instalarTooltips();
window.__abiertos = [];
const plano = (id, n, observaciones) => ({ id, name: `500125-CSSP001-740-XX-DR-GG-${n}.pdf`, fullName: `500125-CSSP001-740-XX-DR-GG-${n}.pdf`,
  version: 1, size: 3100000, updated: '2026-10-30T16:52:00Z', updated_by: 'ADMIN', status: 'WIP', observaciones });
const FICHEROS = [
  plano('p0', '000800'),
  plano('p1', '004120', { abiertas: 2, vencidas: 0, cerradas: 0, vence: '2026-11-05T12:00:00', responsable: 'Ana Torres' }),
  plano('p2', '004121', { abiertas: 1, vencidas: 1, cerradas: 0, vence: '2026-10-28T12:00:00', responsable: 'luis@e.test' }),
  plano('p3', '004122', { abiertas: 0, vencidas: 0, cerradas: 3, vence: null, responsable: null }),
  plano('p4', '004123', { abiertas: 5, vencidas: 2, cerradas: 1, vence: null, responsable: null }),
];
const formatDate = d => new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

function Banco() {
  const { columnWidths, totalTableWidth, startResizing, ajustarAncho } = useColumnResize();
  const [selected, setSelected] = useState(new Set());
  const [editingNodeId, setEditingNodeId] = useState(null);
  return (
    <div style={{ height: '100vh', background: '#fff' }}>
      <MatrixTable folders={[]} files={FICHEROS} selected={selected} setSelected={setSelected} columnWidths={columnWidths}
        totalTableWidth={totalTableWidth} startResizing={startResizing} ajustarAncho={ajustarAncho}
        toggle={n => setSelected(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; })}
        navigate={() => {}} setActiveFile={(f) => window.__abiertos.push(f.id)} onUpdateDescription={() => {}} onRename={() => {}}
        formatSize={() => '3 MB'} formatDate={formatDate} getInitials={() => 'A'} user={{ name: 'Banco' }} isAdmin isTrashMode={false}
        onShowVersions={() => {}} onRowMenu={() => {}} renderFileIconSop={renderFileIconSop} editingNodeId={editingNodeId}
        setEditingNodeId={setEditingNodeId} rightClickedId={null} processingIds={{}} onStatusChange={() => {}} />
    </div>
  );
}
createRoot(document.getElementById('raiz')).render(<Banco />);
