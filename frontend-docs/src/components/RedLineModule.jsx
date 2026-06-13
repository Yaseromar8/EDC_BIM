import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthHeaders } from '../utils/helpers';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PDFViewer from './PDFViewer';

const RedLineModule = ({ project, API, user, isAdmin }) => {
  const modelUrn = project.urn || `proyectos/${project.name.replace(/ /g, '_')}`;
  const projectPrefix = `proyectos/${project.name.replace(/ /g, '_')}`;
  const [rfis, setRfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dashFilter, setDashFilter] = useState(null); // { type: 'respuesta'|'estado', value: string }
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef(null);

  // Inline Edit State
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Preview Modal State
  const [previewFile, setPreviewFile] = useState(null); // { name, url }
  const [loadingAdjuntoKey, setLoadingAdjuntoKey] = useState(null); // "rfiId-idx" while fetching

  // ── Column Resize State ──
  const COL_DEFS = [
    { key: 'codigo',      label: 'Código',      initW: 90 },
    { key: 'titulo',      label: 'Título',      initW: 320 },
    { key: 'estado',      label: 'Estado',      initW: 130 },
    { key: 'respuesta',   label: 'Respuesta',   initW: 120 },
    { key: 'responsable', label: 'Responsable', initW: 170 },
    { key: 'fecha',       label: 'Fecha',       initW: 110 },
    { key: 'adjuntos',    label: 'Adjuntos',    initW: 100 },
    { key: 'accion',      label: 'Acción',      initW: 80 },
  ];
  const [colWidths, setColWidths] = useState(() => COL_DEFS.map(c => c.initW));
  const resizingRef = useRef(null); // { colIdx, startX, startW }

  const onResizeStart = useCallback((e, colIdx) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colIdx, startX: e.clientX, startW: colWidths[colIdx] };
    const onMove = (me) => {
      if (!resizingRef.current) return;
      const diff = me.clientX - resizingRef.current.startX;
      const newW = Math.max(50, resizingRef.current.startW + diff);
      setColWidths(prev => { const n = [...prev]; n[resizingRef.current.colIdx] = newW; return n; });
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colWidths]);

  // Selector Interno (Modal) State
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [activeRfiForLink, setActiveRfiForLink] = useState(null);
  const [projectNodes, setProjectNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectorPath, setSelectorPath] = useState([]);

  // Responsable dropdown (persistido en localStorage)
  const [showResponsableDropdown, setShowResponsableDropdown] = useState(false);
  const [newResponsableName, setNewResponsableName] = useState('');
  const [responsableOptions, setResponsableOptions] = useState(() => {
    try {
      const saved = localStorage.getItem('rfi_responsables');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [user?.name || 'Usuario'];
  });

  const addResponsable = () => {
    const name = newResponsableName.trim();
    if (!name || responsableOptions.includes(name)) return;
    const updated = [...responsableOptions, name];
    setResponsableOptions(updated);
    localStorage.setItem('rfi_responsables', JSON.stringify(updated));
    handleFieldChange('responsable', name);
    setNewResponsableName('');
    setShowResponsableDropdown(false);
  };

  const STATES = [
    { value: 'Emitido',      bg: '#f1f3f4', text: '#5f6368', icon: '●' },
    { value: 'En revisión',  bg: '#fef7e0', text: '#b06000', icon: '◐' },
    { value: 'Respondido',   bg: '#e8f0fe', text: '#1a73e8', icon: '◉' },
    { value: 'Cerrado',      bg: '#e6f4ea', text: '#1e8e3e', icon: '✓' },
  ];

  useEffect(() => {
    fetchRfis();
  }, [modelUrn]);

  const fetchRfis = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/redlines/${encodeURIComponent(modelUrn)}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.results) {
        setRfis(data.results);
      }
    } catch (err) {
      console.error('Error fetching RFIs:', err);
    } finally {
      setLoading(false);
    }
  };

  const createRfi = async () => {
    try {
      const res = await fetch(`${API}/api/redlines`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          model_urn: modelUrn,
          titulo: '',
          created_by: user?.name || 'Usuario'
        })
      });
      const data = await res.json();
      if (data.rfi) {
        const newRfi = data.rfi;
        setRfis(prev => [newRfi, ...prev]);
        setEditingId(newRfi.id);
        setEditFormData({
          titulo: '',
          estado: newRfi.estado || 'Emitido',
          responsable: '',
          adjuntos: [],
          respuesta: '',
          fecha: newRfi.fecha ? new Date(newRfi.fecha).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
          fecha_respuesta: ''
        });
      }
    } catch (err) {
      console.error('Error creating RFI:', err);
    }
  };

  const saveRfi = async (rfiId) => {
    setSaving(true);
    try {
      const payload = { ...editFormData };
      const res = await fetch(`${API}/api/redlines/${rfiId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setRfis(prev => prev.map(r => r.id === rfiId ? { ...r, ...payload } : r));
        setEditingId(null);
        setShowResponsableDropdown(false);
      }
    } catch (err) {
      console.error('Error saving RFI:', err);
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFormData({});
    setShowResponsableDropdown(false);
  };

  // --- State Color Helper ---
  const getStateStyle = (estado) => {
    const found = STATES.find(s => s.value === estado);
    return found || STATES[0];
  };

  // --- SLA Helper ---
  // Evita el desfase de zona horaria al crear fechas locales
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.substring(0, 10).split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };

  const getSlaInfo = (fecha, fechaRespuesta, estado) => {
    if (!fecha) return null;
    const SLA_DAYS = 2; // Plazo máximo de respuesta para RFI (días calendario)

    const f1 = parseLocalDate(fecha);
    
    // Solo usamos la fecha de respuesta si el estado es final, de lo contrario usamos hoy (reloj corriendo)
    const isResolved = estado === 'Respondido' || estado === 'Cerrado';
    const f2 = (fechaRespuesta && isResolved) ? parseLocalDate(fechaRespuesta) : new Date();
    
    // Nivelamos f2 a la medianoche (00:00:00) para que la resta con f1 (que también es a las 00:00:00) 
    // nos dé días calendario exactos y no fracciones afectadas por la hora actual.
    f2.setHours(0, 0, 0, 0);
    
    const diffTime = f2 - f1;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (isResolved) {
      const onTime = diffDays <= SLA_DAYS;
      return { text: `Resuelto en ${diffDays} día(s)`, color: onTime ? '#1e8e3e' : '#e37400' };
    } else {
      if (diffDays > SLA_DAYS) {
        const overdue = diffDays - SLA_DAYS;
        return { text: `Retraso de ${overdue}d (${diffDays}d total)`, color: '#d32f2f' };
      }
      const remaining = SLA_DAYS - Math.abs(diffDays);
      return { text: `Hace ${Math.abs(diffDays)}d · Quedan ${remaining}d`, color: '#888' };
    }
  };

  // Close export menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Export to Excel ──
  const exportToExcel = () => {
    setShowExportMenu(false);
    const data = filteredRfis.map(r => ({
      'Código': r.codigo,
      'Título': r.titulo || '',
      'Estado': r.estado || 'Emitido',
      'Respuesta': r.respuesta || 'Pendiente',
      'Responsable': r.responsable || '',
      'Fecha': r.fecha || '',
      'Adjuntos': (r.adjuntos || []).map(a => a.name || a).join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    // Auto-width columns
    const colKeys = Object.keys(data[0] || {});
    ws['!cols'] = colKeys.map(k => ({ wch: Math.max(k.length, ...data.map(r => String(r[k] || '').length)) + 2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RedLines');
    XLSX.writeFile(wb, `RFI_${project.name.replace(/ /g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Export to PDF ──
  const exportToPDF = () => {
    setShowExportMenu(false);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(211, 47, 47);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('Reporte de Red Lines', 14, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(project.name, pageW - 14, 12, { align: 'right' });

    // Metadata
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-PE')}`, 14, 26);
    const aceptados = rfis.filter(r => r.respuesta === 'Aceptado').length;
    const rechazados = rfis.filter(r => r.respuesta === 'Rechazado').length;
    const pendientes = rfis.filter(r => !r.respuesta || r.respuesta === '').length;
    const total = rfis.length;
    if (dashFilter) {
      doc.setTextColor(26, 115, 232);
      doc.text(`Filtro activo: ${dashFilter.type === 'respuesta' ? 'Respuesta' : 'Estado'}: ${dashFilter.value}`, 14, 31);
    }

    // ── DASHBOARD SECTION ──
    const dashY = dashFilter ? 36 : 31;

    // KPI Cards
    const cardW = 42, cardH = 28, cardGap = 6;
    const kpis = [
      { label: 'Aceptados', count: aceptados, rgb: [30, 142, 62], bgRgb: [230, 244, 234] },
      { label: 'Rechazados', count: rechazados, rgb: [217, 48, 37], bgRgb: [252, 232, 230] },
      { label: 'Pendientes', count: pendientes, rgb: [128, 134, 139], bgRgb: [241, 243, 244] },
    ];
    kpis.forEach((kpi, i) => {
      const x = 14 + i * (cardW + cardGap);
      doc.setFillColor(...kpi.bgRgb);
      doc.roundedRect(x, dashY, cardW, cardH, 3, 3, 'F');
      doc.setDrawColor(...kpi.rgb);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, dashY, cardW, cardH, 3, 3, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...kpi.rgb);
      doc.text(String(kpi.count), x + cardW / 2, dashY + 14, { align: 'center' });
      doc.setFontSize(8);
      doc.text(kpi.label, x + cardW / 2, dashY + 21, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(128, 134, 139);
      doc.text(`${total > 0 ? Math.round(kpi.count / total * 100) : 0}%`, x + cardW / 2, dashY + 26, { align: 'center' });
    });

    // Stacked bar
    const barX = 14, barY = dashY + cardH + 4, barW = 3 * cardW + 2 * cardGap, barH = 5;
    doc.setFillColor(241, 243, 244);
    doc.roundedRect(barX, barY, barW, barH, 2, 2, 'F');
    let bOff = 0;
    if (aceptados > 0) { const w = (aceptados / total) * barW; doc.setFillColor(30, 142, 62); doc.rect(barX + bOff, barY, w, barH, 'F'); bOff += w; }
    if (rechazados > 0) { const w = (rechazados / total) * barW; doc.setFillColor(217, 48, 37); doc.rect(barX + bOff, barY, w, barH, 'F'); bOff += w; }

    // Total label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Total RL: ${total}`, barX + barW + 4, barY + 4);

    // Donut Chart (right side)
    const donutCx = 200, donutCy = dashY + 16, donutR = 14, donutInner = 8;
    const estadoCounts = STATES.map(s => ({ ...s, count: rfis.filter(r => (r.estado || 'Emitido') === s.value).length })).filter(s => s.count > 0);

    // Draw donut arcs
    let angleOff = -Math.PI / 2;
    estadoCounts.forEach(s => {
      const sweep = (s.count / total) * 2 * Math.PI;
      const midAngle = angleOff + sweep / 2;
      // Draw thick arc as a filled wedge
      const steps = Math.max(20, Math.round(sweep * 30));
      const cRgb = s.text;
      // Parse hex color
      const r = parseInt(cRgb.slice(1, 3), 16), g = parseInt(cRgb.slice(3, 5), 16), b = parseInt(cRgb.slice(5, 7), 16);
      doc.setFillColor(r, g, b);
      // Create path points for the arc segment
      const pts = [];
      for (let j = 0; j <= steps; j++) {
        const a = angleOff + (sweep * j) / steps;
        pts.push({ x: donutCx + donutR * Math.cos(a), y: donutCy + donutR * Math.sin(a) });
      }
      for (let j = steps; j >= 0; j--) {
        const a = angleOff + (sweep * j) / steps;
        pts.push({ x: donutCx + donutInner * Math.cos(a), y: donutCy + donutInner * Math.sin(a) });
      }
      // Draw as polygon
      if (pts.length > 2) {
        doc.setFillColor(r, g, b);
        const lines = pts.slice(1).map(p => [p.x, p.y]);
        doc.triangle(pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, 'F');
        // Approximate with small triangles fan
        for (let j = 2; j < pts.length - 1; j++) {
          doc.triangle(pts[0].x, pts[0].y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y, 'F');
        }
      }
      angleOff += sweep;
    });

    // Center circle (white)
    doc.setFillColor(255, 255, 255);
    doc.circle(donutCx, donutCy, donutInner - 0.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(32, 33, 36);
    doc.text(String(total), donutCx, donutCy + 1.5, { align: 'center' });
    doc.setFontSize(5);
    doc.setTextColor(128, 134, 139);
    doc.text('TOTAL', donutCx, donutCy + 5, { align: 'center' });

    // Legend
    const legX = donutCx + donutR + 6;
    estadoCounts.forEach((s, i) => {
      const ly = dashY + 4 + i * 7;
      const r2 = parseInt(s.text.slice(1, 3), 16), g2 = parseInt(s.text.slice(3, 5), 16), b2 = parseInt(s.text.slice(5, 7), 16);
      doc.setFillColor(r2, g2, b2);
      doc.roundedRect(legX, ly, 4, 4, 1, 1, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(`${s.value}: ${s.count} (${Math.round(s.count / total * 100)}%)`, legX + 6, ly + 3.5);
    });

    // Table starts below dashboard
    const startY = barY + barH + 8;
    const tableData = filteredRfis.map(r => [
      r.codigo,
      (r.titulo || '').substring(0, 60),
      r.estado || 'Emitido',
      r.respuesta || 'Pendiente',
      r.responsable || '',
      r.fecha || '',
    ]);

    autoTable(doc, {
      startY,
      head: [['Código', 'Título', 'Estado', 'Respuesta', 'Responsable', 'Fecha']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [211, 47, 47], textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center' },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold', cellWidth: 22 },
        1: { cellWidth: 80 },
        2: { halign: 'center', cellWidth: 28 },
        3: { halign: 'center', cellWidth: 28 },
        4: { cellWidth: 55 },
        5: { halign: 'center', cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw;
          if (val === 'Aceptado') { data.cell.styles.textColor = [30, 142, 62]; data.cell.styles.fontStyle = 'bold'; }
          else if (val === 'Rechazado') { data.cell.styles.textColor = [217, 48, 37]; data.cell.styles.fontStyle = 'bold'; }
          else { data.cell.styles.textColor = [150, 150, 150]; }
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(180, 180, 180);
      doc.text(`Página ${i} de ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
      doc.text('VISOR APS — Sistema de Gestión BIM', 14, doc.internal.pageSize.getHeight() - 8);
    }

    doc.save(`RFI_${project.name.replace(/ /g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // SVG icons for file types
  const PdfIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#E53935" />
      <text x="12" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize="7" fontFamily="sans-serif">PDF</text>
    </svg>
  );
  const CadIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#1565C0" />
      <text x="12" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize="6" fontFamily="sans-serif">CAD</text>
    </svg>
  );
  const ImgIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#43A047" />
      <text x="12" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize="6" fontFamily="sans-serif">IMG</text>
    </svg>
  );
  const FileIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#757575" />
      <text x="12" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize="6" fontFamily="sans-serif">FILE</text>
    </svg>
  );

  const getMimeIconComponent = (filename) => {
    const ext = filename?.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return <PdfIcon />;
    if (['dwg', 'dxf', 'cad'].includes(ext)) return <CadIcon />;
    if (['jpg', 'png', 'jpeg', 'webp'].includes(ext)) return <ImgIcon />;
    return <FileIcon />;
  };

  const handleAdjuntoClick = async (adj, rfiId, idx) => {
    const key = `${rfiId}-${idx}`;
    setLoadingAdjuntoKey(key);
    // Obtener la URL firmada de Google Cloud segura usando nuestro token
    try {
      let url = `${API}/api/docs/signed-url?model_urn=${encodeURIComponent(projectPrefix)}`;
      if (adj.id) {
        url += `&id=${adj.id}`;
      } else if (adj.gcs_urn) {
        url += `&urn=${encodeURIComponent(adj.gcs_urn)}`;
      }
      
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.url) {
          // Abrir ventana flotante en lugar de nueva pestaña
          setPreviewFile({ name: adj.name, url: data.url, nodeId: adj.id || null });
        } else {
          alert('Error: ' + (data.error || 'No se pudo generar la URL.'));
        }
      } else {
        alert('Permiso denegado o sesión expirada.');
      }
    } catch (err) {
      console.error('Error opening file:', err);
    } finally {
      setLoadingAdjuntoKey(null);
    }
  };

  // --- Handlers ---
  const startEditing = (rfi) => {
    if (!isAdmin) return;
    setEditingId(rfi.id);
    setEditFormData({
      titulo: rfi.titulo || '',
      estado: rfi.estado || 'Emitido',
      responsable: rfi.responsable || '',
      adjuntos: rfi.adjuntos || [],
      respuesta: rfi.respuesta || '',
      fecha: rfi.fecha ? new Date(rfi.fecha).toISOString().slice(0,10) : '',
      fecha_respuesta: rfi.fecha_respuesta ? new Date(rfi.fecha_respuesta).toISOString().slice(0,10) : ''
    });
    setShowResponsableDropdown(false);
  };

  const handleFieldChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  // --- File Linking Modal (usa la API real /api/docs/list) ---
  const openFileSelector = (rfi) => {
    setActiveRfiForLink(rfi);
    setIsSelectorOpen(true);
    setSelectorPath([{ id: null, name: project.name, path: projectPrefix + '/' }]);
    fetchDocsNodes(null, projectPrefix + '/');
  };

  const closeFileSelector = () => {
    setIsSelectorOpen(false);
    setActiveRfiForLink(null);
    setProjectNodes([]);
  };

  const fetchDocsNodes = async (nodeId, path) => {
    setNodesLoading(true);
    try {
      let url = `${API}/api/docs/list?model_urn=${encodeURIComponent(projectPrefix)}`;
      if (nodeId) {
        url += `&id=${nodeId}`;
      }
      if (path) {
        url += `&path=${encodeURIComponent(path)}`;
      }
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        const data = json.data || {};
        const allNodes = [
          ...(data.folders || []).map(f => ({ ...f, _isFolder: true })),
          ...(data.files || []).map(f => ({ ...f, _isFolder: false }))
        ];
        setProjectNodes(allNodes);
      }
    } catch (err) {
      console.error('Error fetching docs nodes:', err);
    }
    setNodesLoading(false);
  };

  const onNodeClick = (node) => {
    if (node._isFolder) {
      const newCrumb = { id: node.id, name: node.name, path: node.fullName || '' };
      setSelectorPath(prev => [...prev, newCrumb]);
      fetchDocsNodes(node.id, node.fullName);
    } else {
      linkSelectedFile(node);
    }
  };

  const navigateBreadcrumb = (idx) => {
    const crumb = selectorPath[idx];
    setSelectorPath(prev => prev.slice(0, idx + 1));
    fetchDocsNodes(crumb.id, crumb.path);
  };

  const linkSelectedFile = async (fileNode) => {
    const newAdjunto = { id: fileNode.id, name: fileNode.name, gcs_urn: fileNode.gcs_urn };

    if (editingId === activeRfiForLink?.id) {
      setEditFormData(prev => ({ ...prev, adjuntos: [...prev.adjuntos, newAdjunto] }));
    } else {
      const newAdjuntosArr = [...(activeRfiForLink.adjuntos || []), newAdjunto];
      setRfis(prev => prev.map(r => r.id === activeRfiForLink.id ? { ...r, adjuntos: newAdjuntosArr } : r));
      try {
        await fetch(`${API}/api/redlines/${activeRfiForLink.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ adjuntos: newAdjuntosArr })
        });
      } catch (err) { }
    }
    closeFileSelector();
  };

  const removeAdjunto = (idx) => {
    if (editingId) {
      setEditFormData(prev => ({ ...prev, adjuntos: prev.adjuntos.filter((_, i) => i !== idx) }));
    }
  };

  const filteredRfis = rfis.filter(r => {
    const matchesSearch = r.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.titulo || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (!dashFilter) return true;
    if (dashFilter.type === 'respuesta') {
      if (dashFilter.value === 'Pendiente') return !r.respuesta || r.respuesta === '';
      return r.respuesta === dashFilter.value;
    }
    if (dashFilter.type === 'estado') return r.estado === dashFilter.value;
    return true;
  });

  return (
    <div style={{ padding: '0px 24px 16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* RED LINE ACCENT BAR */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #d32f2f, #e53935, #ef5350)', borderRadius: '0 0 4px 4px', flexShrink: 0 }} />
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingTop: 12, backgroundColor: '#fff', paddingBottom: 8, borderBottom: '1px solid #eee', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 400, color: '#333', margin: 0 }}>Listado de Red Lines</h1>
          {dashFilter && (
            <span
              onClick={() => setDashFilter(null)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e8f0fe', color: '#1a73e8', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseOver={e => e.currentTarget.style.background = '#d2e3fc'}
              onMouseOut={e => e.currentTarget.style.background = '#e8f0fe'}
            >
              {dashFilter.type === 'respuesta' ? `Respuesta: ${dashFilter.value}` : `Estado: ${dashFilter.value}`}
              <span style={{ fontWeight: 400, fontSize: 14 }}>&times;</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: 8, color: '#999' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input
              type="text"
              placeholder="Buscar Red Line..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '8px 12px 8px 32px', border: '1px solid #ddd', borderRadius: 4, width: 200, fontSize: 13 }}
            />
          </div>
          {isAdmin && (
            <button onClick={createRfi} style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>+</span> Nuevo RL
            </button>
          )}
          <button onClick={fetchRfis} title="Actualizar" style={{ width: 36, height: 36, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
          {/* Export Dropdown */}
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Exportar"
              style={{ width: 36, height: 36, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 180, overflow: 'hidden' }}>
                <button
                  onClick={exportToExcel}
                  style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, color: '#333', textAlign: 'left' }}
                  onMouseOver={e => e.currentTarget.style.background = '#f8f9fa'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e8e3e" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Exportar a Excel
                </button>
                <div style={{ height: 1, background: '#eee' }} />
                <button
                  onClick={exportToPDF}
                  style={{ width: '100%', padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, color: '#333', textAlign: 'left' }}
                  onMouseOver={e => e.currentTarget.style.background = '#f8f9fa'}
                  onMouseOut={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d93025" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Exportar a PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DATA GRID */}
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11, tableLayout: 'fixed' }}>
          <thead style={{ background: '#f8f9fa', color: '#5f6368', borderBottom: '2px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {COL_DEFS.map((col, idx) => (
                <th key={col.key} style={{ padding: '5px 10px', fontWeight: 600, width: colWidths[idx], position: 'relative', textAlign: col.key === 'accion' ? 'center' : 'left', background: '#f8f9fa', fontSize: 11 }}>
                  {col.label}
                  <div
                    onMouseDown={(e) => onResizeStart(e, idx)}
                    style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                      cursor: 'col-resize', background: 'transparent',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = '#0696d7'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando Red Lines...</td></tr>
            ) : filteredRfis.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: '#888' }}>No se encontraron Red Lines. Presiona "+ Nuevo Red Line" para comenzar.</td></tr>
            ) : (
              filteredRfis.map(rfi => {
                const isEditing = editingId === rfi.id;
                const currentEstado = isEditing ? editFormData.estado : rfi.estado;
                const stateStyle = getStateStyle(currentEstado);
                const currentAdjuntos = isEditing ? editFormData.adjuntos : (rfi.adjuntos || []);

                return (
                  <tr key={rfi.id} style={{ borderBottom: '1px solid #eee', background: isEditing ? '#f0f7ff' : '#fff', transition: 'background 0.2s' }}>

                    {/* CODIGO */}
                    <td style={{ padding: '3px 10px', fontWeight: 600, color: '#d32f2f', fontFamily: 'monospace', fontSize: 11 }}>
                      {rfi.codigo}
                    </td>

                    {/* TITULO */}
                    <td style={{ padding: '3px 10px', overflow: 'hidden' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editFormData.titulo}
                          onChange={e => handleFieldChange('titulo', e.target.value)}
                          placeholder="Escribir título del Red Line..."
                          style={{ width: '100%', padding: '4px 10px', border: '1.5px solid #d32f2f', borderRadius: 4, outline: 'none', fontSize: 13 }}
                          autoFocus
                        />
                      ) : (
                        <span onClick={() => isAdmin && startEditing(rfi)} style={{ cursor: isAdmin ? 'pointer' : 'default', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rfi.titulo || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Sin título</span>}
                        </span>
                      )}
                    </td>

                    {/* ESTADO — Siempre con badge de color */}
                    <td style={{ padding: '3px 10px' }}>
                      {isEditing ? (
                        <div style={{ position: 'relative' }}>
                          <select
                            value={editFormData.estado}
                            onChange={e => handleFieldChange('estado', e.target.value)}
                            style={{
                              padding: '5px 10px', borderRadius: 16, outline: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 12,
                              border: '1.5px solid #d32f2f',
                              background: getStateStyle(editFormData.estado).bg,
                              color: getStateStyle(editFormData.estado).text,
                              appearance: 'none', WebkitAppearance: 'none',
                              paddingRight: 24
                            }}
                          >
                            {STATES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.value}</option>)}
                          </select>
                          <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 10, color: '#999' }}>▼</span>
                        </div>
                      ) : (
                        <div
                          onClick={() => isAdmin && startEditing(rfi)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: stateStyle.bg, color: stateStyle.text,
                            padding: '4px 12px', borderRadius: 16, fontWeight: 500, fontSize: 12,
                            cursor: isAdmin ? 'pointer' : 'default', transition: 'all 0.15s'
                          }}
                        >
                          <span style={{ fontSize: 10 }}>{stateStyle.icon}</span>
                          {currentEstado}
                        </div>
                      )}
                    </td>

                    {/* RESPUESTA */}
                    <td style={{ padding: '3px 10px' }}>
                      {isEditing ? (
                        <select
                          value={editFormData.respuesta || ''}
                          onChange={e => handleFieldChange('respuesta', e.target.value)}
                          style={{
                            padding: '5px 10px', borderRadius: 4, outline: 'none', cursor: 'pointer', fontSize: 12,
                            border: '1px solid #ddd', width: '100%',
                            background: editFormData.respuesta === 'Aceptado' ? '#e6f4ea' : editFormData.respuesta === 'Rechazado' ? '#fce8e6' : '#fff'
                          }}
                        >
                          <option value="">Pendiente</option>
                          <option value="Aceptado">Aceptado</option>
                          <option value="Rechazado">Rechazado</option>
                        </select>
                      ) : (
                        <span onClick={() => isAdmin && startEditing(rfi)} style={{ 
                          cursor: isAdmin ? 'pointer' : 'default', display: 'inline-block', minHeight: 20, 
                          padding: rfi.respuesta ? '4px 10px' : '0', 
                          borderRadius: 12, fontSize: 12, fontWeight: rfi.respuesta ? 500 : 400,
                          background: rfi.respuesta === 'Aceptado' ? '#e6f4ea' : rfi.respuesta === 'Rechazado' ? '#fce8e6' : 'transparent',
                          color: rfi.respuesta === 'Aceptado' ? '#1e8e3e' : rfi.respuesta === 'Rechazado' ? '#d93025' : '#bbb',
                        }}>
                          {rfi.respuesta || <span style={{ fontStyle: 'italic' }}>--</span>}
                        </span>
                      )}
                    </td>

                    {/* RESPONSABLE — con dropdown selector */}
                    <td style={{ padding: '3px 10px' }}>
                      {isEditing ? (
                        <div style={{ position: 'relative' }}>
                          <div
                            onClick={() => setShowResponsableDropdown(!showResponsableDropdown)}
                            style={{
                              padding: '5px 10px', border: '1.5px solid #d32f2f', borderRadius: 4,
                              cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', minHeight: 30, background: '#fff'
                            }}
                          >
                            <span style={{ color: editFormData.responsable ? '#333' : '#bbb' }}>
                              {editFormData.responsable || 'Seleccionar...'}
                            </span>
                            <span style={{ fontSize: 10, color: '#999' }}>▼</span>
                          </div>
                          {showResponsableDropdown && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                              background: '#fff', border: '1px solid #ddd', borderRadius: 6,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto', marginTop: 4
                            }}>
                              {responsableOptions.map((name, i) => (
                                <div
                                  key={i}
                                  onClick={() => { handleFieldChange('responsable', name); setShowResponsableDropdown(false); }}
                                  style={{
                                    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                                    background: editFormData.responsable === name ? '#e8f0fe' : '#fff',
                                    borderBottom: '1px solid #f5f5f5'
                                  }}
                                  onMouseOver={e => e.currentTarget.style.background = '#f0f7ff'}
                                  onMouseOut={e => e.currentTarget.style.background = editFormData.responsable === name ? '#e8f0fe' : '#fff'}
                                >
                                  {name}
                                </div>
                              ))}
                              {/* ── + Agregar nuevo responsable ── */}
                              <div style={{ padding: '8px 10px', borderTop: '1px solid #eee', display: 'flex', gap: 6 }}>
                                <input
                                  type="text"
                                  value={newResponsableName}
                                  onChange={e => setNewResponsableName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') addResponsable(); }}
                                  placeholder="Nuevo nombre..."
                                  onClick={e => e.stopPropagation()}
                                  style={{ flex: 1, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, outline: 'none' }}
                                />
                                <button
                                  onClick={(e) => { e.stopPropagation(); addResponsable(); }}
                                  style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span onClick={() => isAdmin && startEditing(rfi)} style={{ cursor: isAdmin ? 'pointer' : 'default', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rfi.responsable || <span style={{ color: '#bbb', fontStyle: 'italic' }}>--</span>}
                        </span>
                      )}
                    </td>

                    {/* FECHA (MINIMALISTA) */}
                    <td style={{ padding: '3px 10px', color: '#333', fontSize: 11 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input 
                            type="date" 
                            title="Fecha de presentación"
                            value={editFormData.fecha || ''} 
                            onChange={e => handleFieldChange('fecha', e.target.value)}
                            style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, outline: 'none' }}
                          />
                          {(editFormData.estado === 'Respondido' || editFormData.estado === 'Cerrado') && (
                            <input 
                              type="date" 
                              title="Fecha de respuesta"
                              value={editFormData.fecha_respuesta || ''} 
                              onChange={e => handleFieldChange('fecha_respuesta', e.target.value)}
                              style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, outline: 'none', background: '#f5f5f5' }}
                            />
                          )}
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 400 }}>
                            {rfi.fecha ? parseLocalDate(rfi.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                          </div>
                          {rfi.fecha && (
                            <div style={{ fontSize: 11, color: getSlaInfo(rfi.fecha, rfi.fecha_respuesta, rfi.estado)?.color, marginTop: 2 }}>
                              {getSlaInfo(rfi.fecha, rfi.fecha_respuesta, rfi.estado)?.text}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* ADJUNTOS (Iconos SVG clickeables para descargar) */}
                    <td style={{ padding: '3px 10px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {currentAdjuntos.map((aj, idx) => {
                          const adjKey = `${rfi.id}-${idx}`;
                          const isLoadingThis = loadingAdjuntoKey === adjKey;
                          return (
                          <div key={idx} style={{ position: 'relative', cursor: isEditing ? 'default' : 'pointer' }} title={`${aj.name} — Click para abrir`}>
                            <span 
                              onClick={() => !isEditing && !isLoadingThis && handleAdjuntoClick(aj, rfi.id, idx)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 4, padding: 2, transition: 'transform 0.15s, box-shadow 0.15s, background 0.15s',
                                transform: isLoadingThis ? 'scale(0.85)' : 'scale(1)',
                                background: isLoadingThis ? '#e3f2fd' : 'transparent',
                                boxShadow: isLoadingThis ? '0 0 0 2px #0696d7' : 'none',
                                opacity: isLoadingThis ? 0.6 : 1,
                                position: 'relative'
                              }}
                              onMouseOver={e => { if (!isEditing && !isLoadingThis) { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.background = '#e3f2fd'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(6,150,215,0.25)'; }}}
                              onMouseOut={e => { if (!isLoadingThis) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}}
                              onMouseDown={e => { if (!isEditing) e.currentTarget.style.transform = 'scale(0.85)'; }}
                              onMouseUp={e => { if (!isEditing) e.currentTarget.style.transform = 'scale(1.15)'; }}
                            >
                              {getMimeIconComponent(aj.name)}
                              {isLoadingThis && (
                                <span style={{
                                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'rgba(255,255,255,0.7)', borderRadius: 4
                                }}>
                                  <span style={{ width: 14, height: 14, border: '2px solid #0696d7', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin-acc 0.6s linear infinite' }} />
                                </span>
                              )}
                            </span>
                            {isEditing && (
                              <button onClick={() => removeAdjunto(idx)} style={{ position: 'absolute', top: -6, right: -6, background: '#e53935', color: '#fff', borderRadius: '50%', width: 14, height: 14, border: 'none', fontSize: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}>×</button>
                            )}
                          </div>
                          );
                        })}
                        {currentAdjuntos.length === 0 && !isEditing && <span style={{ color: '#ccc' }}>--</span>}

                        {isEditing && (
                          <button
                            onClick={() => openFileSelector(rfi)}
                            style={{ background: 'none', border: '1px dashed #d32f2f', color: '#d32f2f', borderRadius: 4, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, fontWeight: 300 }}
                            title="Vincular archivo"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>

                    {/* ACCIONES */}
                    <td style={{ padding: '3px 10px', textAlign: 'center' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button onClick={() => saveRfi(rfi.id)} disabled={saving} style={{ background: '#c62828', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                            {saving ? '...' : 'Guardar'}
                          </button>
                          <button onClick={cancelEditing} style={{ background: 'none', border: '1px solid #ddd', color: '#888', padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                            ✕
                          </button>
                        </div>
                      ) : (
                        isAdmin && (
                          <button onClick={() => startEditing(rfi)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }} title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                          </button>
                        )
                      )}
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── DASHBOARD DE ESTADO RED LINE — Enterprise Edition ── */}
      {!loading && rfis.length > 0 && (() => {
        const aceptados = rfis.filter(r => r.respuesta === 'Aceptado').length;
        const rechazados = rfis.filter(r => r.respuesta === 'Rechazado').length;
        const pendientes = rfis.filter(r => !r.respuesta || r.respuesta === '').length;
        const total = rfis.length;

        const estadoCounts = STATES.map(s => ({
          ...s,
          count: rfis.filter(r => r.estado === s.value).length
        })).filter(s => s.count > 0);

        const radius = 58;
        const circumference = 2 * Math.PI * radius;
        let offset = 0;

        // ── Tendencia de Resolución (datos) ──
        const calcDays = (fechaStr, fechaRespStr, est) => {
          if (!fechaStr) return null;
          const f1 = parseLocalDate(fechaStr);
          const isRes = est === 'Respondido' || est === 'Cerrado';
          const f2 = (fechaRespStr && isRes) ? parseLocalDate(fechaRespStr) : new Date();
          f2.setHours(0, 0, 0, 0);
          return Math.round((f2 - f1) / (1000 * 60 * 60 * 24));
        };
        const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const resolvedRfis = rfis.filter(r => (r.estado === 'Respondido' || r.estado === 'Cerrado') && r.fecha);
        const mMap = {};
        resolvedRfis.forEach(r => {
          const d = parseLocalDate(r.fecha);
          const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          const days = calcDays(r.fecha, r.fecha_respuesta, r.estado);
          if (days !== null && days >= 0) {
            if (!mMap[k]) mMap[k] = { total: 0, count: 0 };
            mMap[k].total += days; mMap[k].count += 1;
          }
        });
        const trendData = Object.keys(mMap).sort().map(k => ({
          month: k, label: MN[parseInt(k.split('-')[1]) - 1] + ' ' + k.split('-')[0].slice(2),
          avg: Math.round(mMap[k].total / mMap[k].count * 10) / 10, count: mMap[k].count,
          projected: false
        }));

        // ── Proyección: agregar 2 meses futuros con regresión lineal ──
        if (trendData.length >= 2) {
          const last3 = trendData.slice(-3);
          const slope = last3.length >= 2
            ? (last3[last3.length-1].avg - last3[0].avg) / (last3.length - 1)
            : 0;
          const lastAvg = trendData[trendData.length - 1].avg;
          const lastKey = trendData[trendData.length - 1].month;
          for (let f = 1; f <= 2; f++) {
            const [ly, lm] = lastKey.split('-').map(Number);
            const nm = lm + f > 12 ? (lm + f - 12) : lm + f;
            const ny = lm + f > 12 ? ly + 1 : ly;
            const projAvg = Math.max(0, Math.round((lastAvg + slope * f) * 10) / 10);
            trendData.push({
              month: `${ny}-${String(nm).padStart(2,'0')}`,
              label: MN[nm - 1] + ' ' + String(ny).slice(2),
              avg: projAvg, count: 0, projected: true
            });
          }
        }

        const tW = 440, tH = 130, tPL = 30, tPR = 10, tPT = 16, tPB = 22;
        const tAW = tW - tPL - tPR, tAH = tH - tPT - tPB;
        const tMax = trendData.length > 0 ? Math.max(...trendData.map(d => d.avg), 1) : 1;
        const tPts = trendData.map((d, i) => ({
          x: tPL + (trendData.length > 1 ? (i / (trendData.length - 1)) * tAW : tAW / 2),
          y: tPT + tAH - (d.avg / tMax) * tAH, ...d
        }));
        const realPts = tPts.filter(p => !p.projected);
        const projPts = tPts.filter(p => p.projected);
        const tLine = realPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const tArea = realPts.length > 0 ? `${tLine} L${realPts[realPts.length-1].x},${tPT+tAH} L${realPts[0].x},${tPT+tAH} Z` : '';
        const projLine = realPts.length > 0 && projPts.length > 0
          ? `M${realPts[realPts.length-1].x},${realPts[realPts.length-1].y} ${projPts.map(p => `L${p.x},${p.y}`).join(' ')}`
          : '';

        const kpiCards = [
          {
            label: 'Aceptados', filterValue: 'Aceptado', count: aceptados, color: '#1e8e3e', bg: 'linear-gradient(135deg, #e6f4ea 0%, #d4edda 100%)', border: '#b7dfc3',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e8e3e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          },
          {
            label: 'Rechazados', filterValue: 'Rechazado', count: rechazados, color: '#d93025', bg: 'linear-gradient(135deg, #fce8e6 0%, #f8d7da 100%)', border: '#f0b8b3',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d93025" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          },
          {
            label: 'Pendientes', filterValue: 'Pendiente', count: pendientes, color: '#80868b', bg: 'linear-gradient(135deg, #f1f3f4 0%, #e8eaed 100%)', border: '#dadce0',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#80868b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          },
        ];

        return (
          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start', flexShrink: 0 }}>

            {/* LEFT: KPI Cards */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#5f6368', letterSpacing: '0.3px', textTransform: 'uppercase' }}>Respuestas</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {kpiCards.map(card => {
                  const isActive = dashFilter?.type === 'respuesta' && dashFilter.value === card.filterValue;
                  return (
                    <div
                      key={card.label}
                      onClick={() => setDashFilter(isActive ? null : { type: 'respuesta', value: card.filterValue })}
                      style={{
                        background: card.bg, borderRadius: 6, padding: '5px 4px', textAlign: 'center',
                        border: isActive ? `2.5px solid ${card.color}` : `1px solid ${card.border}`,
                        cursor: 'pointer', userSelect: 'none',
                        boxShadow: isActive ? `0 0 0 3px ${card.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'box-shadow 0.2s, transform 0.2s, border 0.2s',
                        transform: isActive ? 'translateY(-2px)' : 'none',
                      }}
                      onMouseOver={e => { if (!isActive) { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                      onMouseOut={e => { if (!isActive) { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2, opacity: 0.85 }}>{card.icon}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.count}</div>
                      <div style={{ fontSize: 9, color: card.color, fontWeight: 600, marginTop: 2, letterSpacing: '0.3px' }}>{card.label}</div>
                      <div style={{ fontSize: 9, color: '#80868b', marginTop: 0, fontWeight: 500 }}>{total > 0 ? Math.round(card.count/total*100) : 0}%</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 4, background: '#fff', borderRadius: 6, padding: '4px 10px', border: '1px solid #e0e0e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: '#80868b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total RL</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#202124' }}>{total}</span>
                </div>
                <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6, background: '#f1f3f4' }}>
                  {aceptados > 0 && <div title={`Aceptados: ${aceptados}`} style={{ width: `${aceptados/total*100}%`, background: '#1e8e3e', transition: 'width 0.6s ease' }} />}
                  {rechazados > 0 && <div title={`Rechazados: ${rechazados}`} style={{ width: `${rechazados/total*100}%`, background: '#d93025', transition: 'width 0.6s ease' }} />}
                  {pendientes > 0 && <div title={`Pendientes: ${pendientes}`} style={{ width: `${pendientes/total*100}%`, background: '#dadce0', transition: 'width 0.6s ease' }} />}
                </div>
              </div>
            </div>

            {/* RIGHT: Tendencia de Resolución */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#5f6368', letterSpacing: '0.3px', textTransform: 'uppercase' }}>Tendencia de Resolución</span>
              </div>
              <div style={{ background: '#fff', borderRadius: 6, padding: '4px 6px', border: '1px solid #e0e0e0' }}>
                {trendData.filter(d => !d.projected).length < 2 ? (
                  <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 10, fontStyle: 'italic' }}>
                    Se necesitan al menos 2 meses con datos.
                  </div>
                ) : (
                  <svg width="100%" viewBox={`0 0 ${tW} ${tH}`} style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e53935" stopOpacity="0.18"/>
                        <stop offset="100%" stopColor="#e53935" stopOpacity="0.01"/>
                      </linearGradient>
                    </defs>
                    {[0, 0.5, 1].map((pct, i) => {
                      const gy = tPT + tAH - pct * tAH;
                      return (
                        <g key={i}>
                          <line x1={tPL} y1={gy} x2={tW - tPR} y2={gy} stroke="#f0f0f0" strokeWidth="1"/>
                          <text x={tPL - 4} y={gy + 3} textAnchor="end" fill="#aaa" fontSize="9">{Math.round(tMax * pct)}d</text>
                        </g>
                      );
                    })}
                    {/* Area fill (real data only) */}
                    <path d={tArea} fill="url(#trendGrad)"/>
                    {/* Real line */}
                    <path d={tLine} fill="none" stroke="#e53935" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    {/* Projected line (dashed) */}
                    {projLine && <path d={projLine} fill="none" stroke="#f9ab00" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round"/>}
                    {/* Real points */}
                    {realPts.map((p, i) => (
                      <g key={`r${i}`}>
                        <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#e53935" strokeWidth="2"/>
                        <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#e53935" fontSize="9" fontWeight="700">{p.avg}d</text>
                        <text x={p.x} y={tH - 2} textAnchor="middle" fill="#666" fontSize="8">{p.label}</text>
                        <rect x={p.x - 16} y={tPT} width="32" height={tAH + tPB} fill="transparent" style={{ cursor: 'pointer' }}>
                          <title>{p.label}: {p.avg} día(s) — {p.count} RFI(s)</title>
                        </rect>
                      </g>
                    ))}
                    {/* Projected points */}
                    {projPts.map((p, i) => (
                      <g key={`p${i}`}>
                        <circle cx={p.x} cy={p.y} r="2.5" fill="#fff" stroke="#f9ab00" strokeWidth="1.5" strokeDasharray="2 1"/>
                        <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#f9ab00" fontSize="9" fontWeight="600">{p.avg}d</text>
                        <text x={p.x} y={tH - 2} textAnchor="middle" fill="#aaa" fontSize="8" fontStyle="italic">{p.label}</text>
                        <rect x={p.x - 16} y={tPT} width="32" height={tAH + tPB} fill="transparent" style={{ cursor: 'pointer' }}>
                          <title>{p.label}: Proyección {p.avg} día(s)</title>
                        </rect>
                      </g>
                    ))}

                  </svg>
                )}

              </div>
            </div>

          </div>
        );
      })()}


      {/* --- MODAL: PREVIEW ADJUNTO (Ventana Flotante) --- */}
      {previewFile && (() => {
        const lowerName = previewFile.name.toLowerCase();
        const isPdf = lowerName.endsWith('.pdf');
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some(ext => lowerName.endsWith(ext));
        const isVideo = ['.mp4', '.webm', '.ogg'].some(ext => lowerName.endsWith(ext));


        return (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'fadeInOverlay 0.2s ease'
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setPreviewFile(null); }}
          >
            <div style={{
              background: '#fff', borderRadius: 12, width: '85vw', height: '85vh',
              maxWidth: 1200, maxHeight: 900,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.05)',
              overflow: 'hidden',
              animation: 'scaleInModal 0.25s ease'
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', background: '#222', color: '#fff', flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isPdf && <PdfIcon />}
                  {isImage && <ImgIcon />}
                  {isVideo && (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="1" width="18" height="22" rx="2" fill="#7B1FA2" />
                      <text x="12" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize="6" fontFamily="sans-serif">VID</text>
                    </svg>
                  )}
                  {!isPdf && !isImage && !isVideo && <FileIcon />}
                  <span style={{ fontSize: 14, fontWeight: 500, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {previewFile.name}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <a
                    href={previewFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir en pestaña nueva"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, background: '#333', color: '#ddd', textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseOver={e => e.currentTarget.style.background = '#555'}
                    onMouseOut={e => e.currentTarget.style.background = '#333'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    title="Descargar"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, background: '#333', color: '#ddd', textDecoration: 'none', transition: 'background 0.2s' }}
                    onMouseOver={e => e.currentTarget.style.background = '#555'}
                    onMouseOut={e => e.currentTarget.style.background = '#333'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  </a>
                  <button
                    onClick={() => setPreviewFile(null)}
                    title="Cerrar"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, background: '#444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 300, transition: 'background 0.2s' }}
                    onMouseOver={e => e.currentTarget.style.background = '#d93025'}
                    onMouseOut={e => e.currentTarget.style.background = '#444'}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, position: 'relative', background: '#f5f5f5', overflow: 'hidden' }}>
                {isPdf && (
                  <PDFViewer url={previewFile.url} fileName={previewFile.name}
                    nodeId={previewFile.nodeId || null} projectPrefix={projectPrefix} />
                )}
                {isImage && (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <img src={previewFile.url} alt={previewFile.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }} />
                  </div>
                )}
                {isVideo && (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                    <video controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}>
                      <source src={previewFile.url} type={`video/${lowerName.split('.').pop()}`} />
                    </video>
                  </div>
                )}
                {!isPdf && !isImage && !isVideo && (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="#bbb"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                    <p style={{ color: '#666', fontSize: 14, margin: 0 }}>Vista previa no disponible para este tipo de archivo.</p>
                    <a href={previewFile.url} target="_blank" rel="noopener noreferrer" style={{ background: '#d32f2f', color: '#fff', padding: '10px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>Descargar Archivo</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* --- MODAL: BROWSE FILES FROM DOCS --- */}
      {isSelectorOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>

            <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Vincular Archivo del Proyecto</h3>
              <button onClick={closeFileSelector} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#999' }}>&times;</button>
            </div>

            {/* Breadcrumbs */}
            <div style={{ padding: '10px 24px', background: '#f8f9fa', borderBottom: '1px solid #eee', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
              {selectorPath.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  <span
                    onClick={() => navigateBreadcrumb(idx)}
                    style={{ cursor: 'pointer', color: idx === selectorPath.length - 1 ? '#333' : '#0696d7', fontWeight: idx === selectorPath.length - 1 ? 600 : 400 }}
                  >
                    {crumb.name}
                  </span>
                  {idx < selectorPath.length - 1 && <span style={{ color: '#ccc' }}>/</span>}
                </React.Fragment>
              ))}
            </div>

            {/* File List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 0, minHeight: 200, maxHeight: 400 }}>
              {nodesLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Cargando carpetas...</div>
              ) : projectNodes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carpeta vacía</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {projectNodes.map(node => (
                    <li
                      key={node.id}
                      onClick={() => onNodeClick(node)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.background = '#f0f7ff'}
                      onMouseOut={e => e.currentTarget.style.background = 'none'}
                    >
                      {node._isFolder ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffd54f"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                      ) : (
                        getMimeIconComponent(node.name)
                      )}
                      <span style={{ fontSize: 13, color: '#333', flex: 1 }}>{node.name}</span>
                      {!node._isFolder && (
                        <span style={{ fontSize: 11, color: '#d32f2f', fontWeight: 500 }}>Seleccionar</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default RedLineModule;
