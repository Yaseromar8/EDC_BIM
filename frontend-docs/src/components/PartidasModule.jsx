import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';
import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

const PartidasModule = ({ project, API, user, isAdmin }) => {
  const modelUrn = project.urn || `proyectos/${project.name.replace(/ /g, '_')}`;
  const [partidas, setPartidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef(null);
  const fileInputRef = useRef(null);

  // Inline Edit State
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [collapsedNodes, setCollapsedNodes] = useState(new Set());

  // ── Column Resize State ──
  const COL_DEFS = [
    { key: 'item',         label: 'Item',         initW: 80 },
    { key: 'descripcion',  label: 'Descripción',  initW: 300 },
    { key: 'unidad',       label: 'Und.',         initW: 60 },
    { key: 'metrado',      label: 'Metrado',      initW: 80 },
    { key: 'precio_unitario', label: 'P.U (S/)',  initW: 80 },
    { key: 'precio',       label: 'P. Parcial (S/)', initW: 100 },
    { key: 'incidencia',   label: 'Incidencia (%)', initW: 90 },
    { key: 'metodologia',  label: 'Metodología',  initW: 110 },
    { key: 'software',     label: 'Software',     initW: 100 },
    { key: 'avance',       label: '% Modelado',   initW: 80 },
  ];
  const [colWidths, setColWidths] = useState(() => COL_DEFS.map(c => c.initW));
  const resizingRef = useRef(null);

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

  useEffect(() => {
    fetchPartidas();
  }, [modelUrn]);

  const fetchPartidas = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/partidas/${encodeURIComponent(modelUrn)}`, {
      });
      const data = await res.json();
      if (data.results) {
        setPartidas(data.results);
      }
    } catch (err) {
      console.error('Error fetching Partidas:', err);
    } finally {
      setLoading(false);
    }
  };

  const createPartida = async () => {
    try {
      const res = await apiFetch(`${API}/api/partidas`, {
        method: 'POST',
        body: JSON.stringify({
          model_urn: modelUrn,
          created_by: user?.name || 'Usuario',
          descripcion: 'Nueva Partida',
          item: ''
        })
      });
      const data = await res.json();
      if (data.partida) {
        setPartidas(prev => [data.partida, ...prev]);
        startEditing(data.partida);
      }
    } catch (err) {
      console.error('Error creating Partida:', err);
    }
  };

  // --- Import Excel ---
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Asumimos que la fila 0 o 1 tiene los encabezados. Buscaremos las columnas clave.
        if (data.length < 2) {
          toast('El archivo Excel está vacío o no tiene el formato correcto.');
          setLoading(false);
          return;
        }

        // Buscar encabezados
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(10, data.length); i++) {
          const row = data[i];
          if (row && row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('descripc'))) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) headerRowIdx = 0;
        
        const headers = data[headerRowIdx].map(h => typeof h === 'string' ? h.toLowerCase().trim() : '');
        const getColIdx = (names) => {
          for (const n of names) {
            const idx = headers.findIndex(h => h && h.includes(n));
            if (idx !== -1) return idx;
          }
          return -1;
        };
        const colItem = getColIdx(['item', 'ítem', 'codigo', 'n°']);
        const colDesc = getColIdx(['descripc', 'partida']);
        const colUnidad = getColIdx(['und', 'unidad']);
        const colMetrado = getColIdx(['metrado', 'cantidad']);
        const colPU = getColIdx(['p.u', 'unitario']);
        const colPrecio = getColIdx(['p. parcial', 'parcial', 'costo', 'monto', 'precio']);
        const colIncid = getColIdx(['incidencia', 'peso']);
        const colMetodo = getColIdx(['metodolog', 'bim']);
        const colSoft = getColIdx(['software', 'programa']);
        const colAvance = getColIdx(['avance', 'progreso', '%']);

        const newPartidas = [];
        for (let i = headerRowIdx + 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0 || !row[colDesc]) continue; 

          // Parsear avance (puede venir como '50.00%', '50', 0.5)
          let parsedAvance = 0;
          if (colAvance >= 0 && row[colAvance] != null) {
            let val = row[colAvance];
            if (typeof val === 'string') {
               val = val.replace('%', '').trim();
               parsedAvance = parseFloat(val) || 0;
            } else if (typeof val === 'number') {
               // A veces Excel exporta 50% como 0.5
               parsedAvance = val <= 1 && val > 0 ? val * 100 : val;
            }
          }

          newPartidas.push({
            item: colItem >= 0 ? String(row[colItem] || '').trim() : '',
            descripcion: String(row[colDesc] || '').trim(),
            unidad: colUnidad >= 0 ? String(row[colUnidad] || '').trim() : '',
            metrado: colMetrado >= 0 ? parseFloat(row[colMetrado]) || 0 : 0,
            precio_unitario: colPU >= 0 ? parseFloat(row[colPU]) || 0 : 0,
            precio: colPrecio >= 0 ? parseFloat(row[colPrecio]) || 0 : 0,
            incidencia: colIncid >= 0 ? parseFloat(row[colIncid]) || 0 : 0,
            metodologia: colMetodo >= 0 ? String(row[colMetodo] || '').toUpperCase().trim() : '',
            software: colSoft >= 0 ? String(row[colSoft] || '').toUpperCase().trim() : '',
            avance: parsedAvance
          });
        }

        if (newPartidas.length === 0) {
          toast.error('No se encontraron datos válidos para importar.');
          setLoading(false);
          return;
        }

        // Send to backend
        const res = await apiFetch(`${API}/api/partidas/batch`, {
          method: 'POST',
          body: JSON.stringify({
            model_urn: modelUrn,
            created_by: user?.name || 'Usuario',
            partidas: newPartidas
          })
        });

        if (res.ok) {
          toast(`¡Importación exitosa! Se cargaron ${newPartidas.length} partidas.`);
          fetchPartidas(); // recargar
        } else {
          toast.error('Hubo un error al guardar las partidas en el servidor.');
        }
      } catch (err) {
        console.error(err);
        toast.error('Error leyendo el archivo Excel.');
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const startEditing = (p) => {
    if (!isAdmin || !p.metrado || p.metrado <= 0) return;
    setEditingId(p.id);
    setEditFormData({ ...p });
  };

  const handleFieldChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePaste = async (e, startPartidaId, colKey) => {
    if (!isAdmin) return;
    e.preventDefault();
    const pasteData = e.clipboardData.getData('Text');
    const rows = pasteData.split(/\r?\n/).filter(r => r.trim() !== '');
    if (rows.length === 0) return;

    const startIdx = filteredPartidas.findIndex(p => p.id === startPartidaId);
    if (startIdx === -1) return;

    const updates = [];
    const newPartidas = [...partidas];

    let rowIdx = 0;
    for (let targetIdx = startIdx; targetIdx < filteredPartidas.length && rowIdx < rows.length; targetIdx++) {
      const p = filteredPartidas[targetIdx];
      // Solo pegamos sobre partidas que tengan metrado (no titulos)
      if (!p.metrado || p.metrado <= 0) continue;
      
      let val = rows[rowIdx].trim().toUpperCase(); 
      if (colKey === 'incidencia') {
        val = parseFloat(val) || 0;
      }
      
      updates.push({ id: p.id, [colKey]: val });
      
      const globalIdx = newPartidas.findIndex(gp => gp.id === p.id);
      if (globalIdx !== -1) {
        newPartidas[globalIdx] = { ...newPartidas[globalIdx], [colKey]: val };
      }
      rowIdx++;
    }

    setPartidas(newPartidas);

    try {
      await Promise.all(updates.map(u => 
        apiFetch(`${API}/api/partidas/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ [colKey]: u[colKey] })
        })
      ));
    } catch(err) {
      console.error("Error patching pasted data", err);
    }
  };

  const deleteAllPartidas = async () => {
    if (!await confirmAction({ title: 'Eliminar todo el presupuesto', message: 'Se borrarán TODAS las partidas importadas de este proyecto. Esta acción no se puede deshacer.', confirmText: 'Eliminar todo', danger: true })) return;
    try {
      const res = await apiFetch(`${API}/api/partidas/all/${encodeURIComponent(modelUrn)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPartidas([]);
      } else {
        toast.error('Error al limpiar el presupuesto.');
      }
    } catch (err) {
      console.error('Error delete all Partidas:', err);
    }
  };

  const savePartida = async (partidaId) => {
    try {
      const payload = { ...editFormData };
      // Limpieza de datos numericos si se escribio texto invalido
      payload.precio = parseFloat(payload.precio) || 0;
      payload.incidencia = parseFloat(payload.incidencia) || 0;

      const res = await apiFetch(`${API}/api/partidas/${partidaId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setPartidas(prev => prev.map(p => p.id === partidaId ? { ...p, ...payload } : p));
        setEditingId(null);
      }
    } catch (err) {
      console.error('Error saving Partida:', err);
    }
  };

  const deletePartida = async (partidaId) => {
    if (!await confirmAction({ title: 'Eliminar partida', message: 'Se eliminará esta partida del presupuesto.', confirmText: 'Eliminar', danger: true })) return;
    try {
      const res = await apiFetch(`${API}/api/partidas/${partidaId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPartidas(prev => prev.filter(p => p.id !== partidaId));
      }
    } catch (err) {
      console.error('Error deleting Partida:', err);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditFormData({});
  };

  // Close export menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const exportToExcel = () => {
    setShowExportMenu(false);
    const data = filteredPartidas.map(p => ({
      'Item': p.item,
      'Descripción': p.descripcion,
      'Precio': p.precio,
      'Incidencia': totalBudget > 0 && p.precio ? ((p.precio / totalBudget) * 100).toFixed(3) + '%' : '0.000%',
      'Metodología': p.metodologia,
      'Software': p.software
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Metrados');
    XLSX.writeFile(wb, `Metrados_${project.name.replace(/ /g, '_')}.xlsx`);
  };

  const exportToPDF = async () => {
    setShowExportMenu(false);
    
    // Capturar dashboard
    const dashboardEl = document.getElementById('dashboard-bottom');
    let canvas = null;
    if (dashboardEl) {
      try {
        canvas = await html2canvas(dashboardEl, { scale: 2, useCORS: true });
      } catch (err) {
        console.error("Error capturing dashboard", err);
      }
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Cabecera y Gráficas
    doc.setFillColor(10, 138, 246);
    doc.rect(0, 0, pageWidth, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('Resumen Ejecutivo de Proyecto BIM', 14, 12);
    
    let currentY = 25;

    if (canvas) {
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const imgProps = doc.getImageProperties(imgData);
      const margin = 14;
      const pdfWidth = pageWidth - (margin * 2);
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text('1. Gráficas y Resumen General', 14, currentY);
      currentY += 5;
      
      doc.addImage(imgData, 'JPEG', margin, currentY, pdfWidth, pdfHeight);
      currentY += pdfHeight + 15;
    }

    // 2. Resumen Contraído de la Data (Solo Títulos Nivel 1)
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('2. Resumen Contraído (Títulos Principales)', 14, currentY);
    currentY += 5;

    const level1Partidas = filteredPartidas.filter(p => p.item && (p.item.match(/\./g) || []).length === 0);
    const summaryData = level1Partidas.map(p => [
      p.item || '',
      (p.descripcion || '').substring(0, 80),
      p.precio ? p.precio.toFixed(2) : '0.00',
      computedTitleAvance[p.id] !== undefined ? `${computedTitleAvance[p.id].toFixed(2)}%` : '0.00%',
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Item', 'Descripción del Título', 'P. Parcial (S/)', 'Avance Ponderado']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 9, cellPadding: 3, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 160 },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' }
      }
    });

    currentY = doc.lastAutoTable.finalY + 15;

    // 3. Data Expandida (Todas las partidas)
    doc.addPage(); 
    currentY = 20;

    doc.setFontSize(12);
    doc.text('3. Desglose Completo de Partidas (Data Expandida)', 14, currentY);
    currentY += 5;

    const expandedData = filteredPartidas.map(p => {
      const isTitle = p.item && (p.item.match(/\./g) || []).length === 0;
      return [
        p.item || '',
        (p.descripcion || '').substring(0, 80),
        p.precio ? p.precio.toFixed(2) : '0.00',
        p.metodologia || '',
        p.software || '',
        isTitle && computedTitleAvance[p.id] !== undefined ? `${computedTitleAvance[p.id].toFixed(2)}%` : (p.avance ? `${parseFloat(p.avance).toFixed(2)}%` : '0.00%')
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Item', 'Descripción', 'Precio (S/)', 'Metodología', 'Software', '% Avance']],
      body: expandedData,
      theme: 'grid',
      headStyles: { fillColor: [10, 138, 246], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      willDrawCell: function(data) {
        if (data.row.raw[0] && (data.row.raw[0].match(/\./g) || []).length === 0) {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 120 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 35, halign: 'center' },
        4: { cellWidth: 30, halign: 'center' },
        5: { cellWidth: 20, halign: 'right' }
      }
    });

    doc.save(`Reporte_Ejecutivo_${project.name.replace(/ /g, '_')}.pdf`);
  };

  // Tree Grid Helpers
  const normalizeWbs = useCallback((item) => {
    if (!item) return '';
    return item.split('.').map(part => part.replace(/^0+/, '') || '0').join('.');
  }, []);

  const parentPrefixes = useMemo(() => {
    const prefixes = new Set();
    partidas.forEach(p => {
      if (p.item) {
        const norm = normalizeWbs(p.item);
        const parts = norm.split('.');
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
          current = current ? current + '.' + parts[i] : parts[i];
          prefixes.add(current);
        }
      }
    });
    return prefixes;
  }, [partidas, normalizeWbs]);

  const totalBudget = useMemo(() => {
    return partidas.reduce((acc, p) => {
      const depth = p.item ? (normalizeWbs(p.item).match(/\./g) || []).length : -1;
      if (depth === 0 && p.precio) {
        return acc + parseFloat(p.precio);
      }
      return acc;
    }, 0);
  }, [partidas, normalizeWbs]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value || 0);
  };

  const toggleNode = (e, item) => {
    e.stopPropagation();
    const normItem = normalizeWbs(item);
    setCollapsedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(normItem)) newSet.delete(normItem);
      else newSet.add(normItem);
      return newSet;
    });
  };

  const isParent = (item) => {
    if (!item) return false;
    return parentPrefixes.has(normalizeWbs(item));
  };

  const isVisible = (item) => {
    if (!item) return true;
    const normParts = normalizeWbs(item).split('.');
    let current = '';
    for (let i = 0; i < normParts.length - 1; i++) {
      current = current ? current + '.' + normParts[i] : normParts[i];
      if (collapsedNodes.has(current)) return false;
    }
    return true;
  };

  // ROLLUP DE AVANCE PARA TITULOS
  const computedTitleAvance = useMemo(() => {
    const result = {};
    const leafNodes = partidas.filter(p => p.metrado && p.metrado > 0);
    
    partidas.forEach(p => {
      if (!p.metrado || p.metrado <= 0) { 
        const children = leafNodes.filter(leaf => leaf.item && p.item && leaf.item.startsWith(p.item + '.'));
        let sumWeightedAvance = 0;
        let sumPrecio = 0;
        children.forEach(child => {
          const precio = parseFloat(child.precio) || 0;
          const av = parseFloat(child.avance) || 0;
          sumWeightedAvance += (av * precio);
          sumPrecio += precio;
        });
        result[p.id] = sumPrecio > 0 ? (sumWeightedAvance / sumPrecio) : 0;
      }
    });
    return result;
  }, [partidas]);

  const filteredPartidas = partidas.filter(p => {
    const term = searchTerm.toLowerCase();
    return (p.descripcion || '').toLowerCase().includes(term) ||
           (p.item || '').toLowerCase().includes(term) ||
           (p.metodologia || '').toLowerCase().includes(term) ||
           (p.software || '').toLowerCase().includes(term);
  }).sort((a, b) => {
    // WBS sorting to respect hierarchies (e.g., 1, 1.1, 1.2, 2)
    if (!a.item || !b.item) return 0;
    const pA = a.item.split('.');
    const pB = b.item.split('.');
    for (let i = 0; i < Math.max(pA.length, pB.length); i++) {
      const vA = parseInt(pA[i]);
      const vB = parseInt(pB[i]);
      if (!isNaN(vA) && !isNaN(vB)) {
        if (vA !== vB) return vA - vB;
      } else {
        const sA = pA[i] || '';
        const sB = pB[i] || '';
        if (sA !== sB) return sA.localeCompare(sB);
      }
    }
    return 0;
  });

  // --- Dashboard Calcs ---
  const countBim = partidas.filter(p => p.metodologia === 'BIM').length;
  const countConv = partidas.filter(p => p.metodologia === 'CONVENCIONAL').length;

  const incBim = partidas.filter(p => p.metodologia === 'BIM').reduce((acc, p) => {
    return acc + (totalBudget > 0 && p.precio ? (p.precio / totalBudget) * 100 : 0);
  }, 0);
  const incConv = partidas.filter(p => p.metodologia === 'CONVENCIONAL').reduce((acc, p) => {
    return acc + (totalBudget > 0 && p.precio ? (p.precio / totalBudget) * 100 : 0);
  }, 0);
  const totalInc = incBim + incConv;
  
  const pctBim = totalInc > 0 ? Math.round((incBim / totalInc) * 100) : 0;
  const pctConv = totalInc > 0 ? Math.round((incConv / totalInc) * 100) : 0;

  const softwareData = useMemo(() => {
    const swMap = {};
    let totalSwInc = 0;
    partidas.forEach(p => {
      if (!p.software) return;
      const sw = p.software.trim().toUpperCase();
      const inc = (totalBudget > 0 && p.precio) ? (p.precio / totalBudget) * 100 : 0;
      if (!swMap[sw]) swMap[sw] = { count: 0, inc: 0 };
      swMap[sw].count += 1;
      swMap[sw].inc += inc;
      totalSwInc += inc;
    });
    // Ordenamos por incidencia (jerarquía financiera) para no distorsionar el orden visual
    const sorted = Object.entries(swMap).sort((a, b) => b[1].inc - a[1].inc);
    return { list: sorted, total: totalSwInc };
  }, [partidas, totalBudget]);

  const titleData = useMemo(() => {
    const tMap = {};
    let totalTInc = 0;
    partidas.forEach(p => {
      if (!p.item || !p.precio) return;
      const depth = (normalizeWbs(p.item).match(/\./g) || []).length;
      if (depth === 0) {
        const name = p.item + ' ' + (p.descripcion ? p.descripcion.substring(0, 20) : '');
        const inc = (totalBudget > 0) ? (p.precio / totalBudget) * 100 : 0;
        tMap[name] = inc;
        totalTInc += inc;
      }
    });
    const sorted = Object.entries(tMap).sort((a, b) => b[1] - a[1]);
    return { list: sorted, total: totalTInc };
  }, [partidas, totalBudget, normalizeWbs]);

  const swColors = ['#0f9d58', '#db4437', '#f4b400', '#ab47bc', '#00acc1', '#ff7043', '#26a69a'];
  
  const generateConicGradient = (list, total) => {
    if (total === 0) return 'transparent';
    let currentPct = 0;
    const parts = list.map(([name, val], idx) => {
      const pct = (val / total) * 100;
      const start = currentPct;
      const end = currentPct + pct;
      currentPct = end;
      return `${swColors[idx % swColors.length]} ${start}% ${end}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  };

  // --- RECHARTS DATA PREP ---
  const chartBimConv = [
    { name: 'BIM', value: pctBim, color: '#7e9bbd' },
    { name: 'CONVENCIONAL', value: pctConv, color: '#e37400' }
  ].filter(d => d.value > 0);

  const chartSoftware = softwareData.list.map(([name, data], idx) => ({
    name,
    cantidad: data.count,
    value: Number(data.inc.toFixed(2)),
    color: swColors[idx % swColors.length]
  }));

  const globalProgress = useMemo(() => {
    let earnedValue = 0;
    let sumTotalPrecio = 0;
    // Solo medimos el universo que realmente es BIM (Modelado)
    const leafNodes = partidas.filter(p => p.metrado && p.metrado > 0 && ['CIVIL 3D', 'REVIT'].includes((p.software || '').toUpperCase()));
    leafNodes.forEach(child => {
      const precio = parseFloat(child.precio) || 0;
      const avance = parseFloat(child.avance) || 0;
      earnedValue += (precio * (avance / 100));
      sumTotalPrecio += precio;
    });
    return sumTotalPrecio > 0 ? (earnedValue / sumTotalPrecio) * 100 : 0;
  }, [partidas]);

  const renderCustomizedPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
    if (percent < 0.05) return null; // Ocultar etiquetas muy pequeñas
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const renderCustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isCantidad = payload[0].dataKey === 'cantidad';
      return (
        <div style={{ backgroundColor: '#fff', border: '1px solid #ccc', padding: '10px', fontSize: '13px', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          <p style={{ margin: 0, color: '#333' }}>
            <b>{data.name}</b>: {isCantidad ? data.cantidad : `${data.value}%`}
          </p>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: '11px' }}>Clic para filtrar</p>
        </div>
      );
    }
    return null;
  };

  const handleChartClick = (data) => {
    if (data && data.name) {
      // Toggle search term
      setSearchTerm(prev => prev === data.name ? '' : data.name);
    }
  };

  return (
    <div style={{ padding: '0px 24px 16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #4d6a8f, #7e9bbd, #9bb2cc)', borderRadius: '0 0 4px 4px', flexShrink: 0 }} />
      
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingTop: 16, backgroundColor: '#fff', paddingBottom: 8, borderBottom: '1px solid #eee', flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 400, color: '#333', margin: 0 }}>Control de Metrados</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Buscar partida..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 4, width: 200, fontSize: 13 }}
          />
          {isAdmin && (
            <>
              <button onClick={deleteAllPartidas} style={{ background: '#fff', color: '#d93025', border: '1px solid #d93025', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                Limpiar Presupuesto
              </button>
              <button onClick={() => fileInputRef.current?.click()} style={{ background: '#fff', color: '#1e8e3e', border: '1px solid #1e8e3e', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Importar Excel
              </button>
              <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} />
              <button onClick={createPartida} style={{ background: '#0a8af6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
                + Nueva Partida
              </button>
            </>
          )}
          <button onClick={() => setCollapsedNodes(new Set(parentPrefixes))} title="Contraer Todo" style={{ height: 36, padding: '0 12px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
             Contraer Todo
          </button>
          <button onClick={() => setCollapsedNodes(new Set())} title="Expandir Todo" style={{ height: 36, padding: '0 12px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
             Expandir Todo
          </button>
          <button onClick={fetchPartidas} title="Actualizar" style={{ width: 36, height: 36, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>
             ↻
          </button>
          
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={{ width: 36, height: 36, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ⤓
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, zIndex: 100, minWidth: 150 }}>
                <button onClick={exportToExcel} style={{ width: '100%', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>Excel</button>
                <button onClick={exportToPDF} style={{ width: '100%', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>PDF</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DATA GRID */}
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0, marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11, tableLayout: 'fixed' }}>
          <thead style={{ background: '#f8f9fa', color: '#5f6368', borderBottom: '2px solid #e0e0e0', position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {COL_DEFS.map((col, idx) => (
                <th key={col.key} style={{ padding: '8px 10px', fontWeight: 600, width: colWidths[idx], position: 'relative', background: '#f8f9fa' }}>
                  {col.label}
                  <div
                    onMouseDown={(e) => onResizeStart(e, idx)}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--accent)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  />
                </th>
              ))}
              {isAdmin && <th style={{ padding: '8px 10px', width: 80, background: '#f8f9fa', textAlign: 'center' }}>Acción</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 10 : 9} style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando datos...</td></tr>
            ) : filteredPartidas.length === 0 ? (
              <tr><td colSpan={isAdmin ? 10 : 9} style={{ textAlign: 'center', padding: 40, color: '#888' }}>No hay partidas. Usa "Importar Excel" para comenzar.</td></tr>
            ) : (
              filteredPartidas.map(p => {
                if (!isVisible(p.item)) return null;
                const isEditing = editingId === p.id;
                // Calculate hierarchy level based on dots in the item number
                const depth = p.item ? (p.item.match(/\./g) || []).length : 0;
                const hasChildren = isParent(p.item);
                const isTitle = depth === 0 || hasChildren; 
                const indent = Math.min(depth * 18, 64); // Max indent of 64px
                const isCollapsed = collapsedNodes.has(normalizeWbs(p.item));
                
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #eee', background: isEditing ? '#f4f6f9' : (isTitle ? '#fafafa' : '#fff'), fontWeight: isTitle ? '600' : '400', color: isTitle ? '#111' : '#444' }}>
                    
                    {/* ITEM */}
                    <td style={{ padding: '4px 10px', background: isTitle ? 'transparent' : '#fafafa' }}>
                      {p.item}
                    </td>

                    {/* DESCRIPCION */}
                    <td style={{ padding: `4px 10px 4px ${10 + indent}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: isTitle ? 'transparent' : '#fafafa' }} title={p.descripcion}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {hasChildren ? (
                            <button 
                              onClick={(e) => toggleNode(e, p.item)}
                              style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 3, color: '#666' }}
                              onMouseOver={e => e.currentTarget.style.background = '#e8eaed'}
                              onMouseOut={e => e.currentTarget.style.background = 'none'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                              </svg>
                            </button>
                          ) : (
                            <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {depth > 0 && <span style={{ color: '#ccc', fontSize: 10 }}>↳</span>}
                            </div>
                          )}
                          {p.descripcion}
                        </div>
                    </td>

                    {/* UNIDAD */}
                    <td style={{ padding: '4px 10px', textAlign: 'center', background: isTitle ? 'transparent' : '#fafafa' }}>
                      {p.unidad}
                    </td>

                    {/* METRADO */}
                    <td style={{ padding: '4px 10px', textAlign: 'right', background: isTitle ? 'transparent' : '#fafafa' }}>
                      {p.metrado ? p.metrado.toFixed(2) : ''}
                    </td>

                    {/* PRECIO UNITARIO */}
                    <td style={{ padding: '4px 10px', textAlign: 'right', background: isTitle ? 'transparent' : '#fafafa' }}>
                      {p.precio_unitario ? formatCurrency(p.precio_unitario) : ''}
                    </td>

                    {/* PRECIO PARCIAL */}
                    <td style={{ padding: '4px 10px', textAlign: 'right', background: isTitle ? 'transparent' : '#fafafa' }}>
                      <span style={{ fontWeight: 500 }}>{p.precio ? formatCurrency(p.precio) : ''}</span>
                    </td>

                    {/* INCIDENCIA */}
                    <td style={{ padding: '4px 10px', textAlign: 'right', background: isTitle ? 'transparent' : '#fafafa' }}>
                      <span style={{ fontWeight: 600, color: '#005a9e' }}>
                        {totalBudget > 0 && p.precio ? ((p.precio / totalBudget) * 100).toFixed(3) + '%' : '0.000%'}
                      </span>
                    </td>

                    {/* METODOLOGIA */}
                    <td 
                      style={{ padding: '4px 10px', cursor: (p.metrado && p.metrado > 0) ? 'pointer' : 'default', outline: 'none' }} 
                      onClick={() => !isEditing && startEditing(p)}
                      tabIndex={0}
                      onPaste={(e) => handlePaste(e, p.id, 'metodologia')}
                    >
                      {isEditing ? (
                        <select value={editFormData.metodologia || ''} onChange={e => handleFieldChange('metodologia', e.target.value)} style={{ width: '100%', padding: 4 }}>
                          <option value="">Seleccionar...</option>
                          <option value="BIM">BIM</option>
                          <option value="CONVENCIONAL">CONVENCIONAL</option>
                        </select>
                      ) : (
                        <span style={{ 
                          padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 'bold',
                          background: p.metodologia === 'BIM' ? '#eef2f7' : p.metodologia === 'CONVENCIONAL' ? '#fef7e0' : 'transparent',
                          color: p.metodologia === 'BIM' ? '#7e9bbd' : p.metodologia === 'CONVENCIONAL' ? '#b06000' : '#333'
                        }}>
                          {p.metodologia}
                        </span>
                      )}
                    </td>

                    {/* SOFTWARE */}
                    <td 
                      style={{ padding: '4px 10px', cursor: (p.metrado && p.metrado > 0) ? 'pointer' : 'default', outline: 'none' }} 
                      onClick={() => !isEditing && startEditing(p)}
                      tabIndex={0}
                      onPaste={(e) => handlePaste(e, p.id, 'software')}
                    >
                      {isEditing ? (
                        <select value={editFormData.software || ''} onChange={e => handleFieldChange('software', e.target.value)} style={{ width: '100%', padding: 4 }}>
                          <option value="">Seleccionar...</option>
                          <option value="CIVIL 3D">CIVIL 3D</option>
                          <option value="REVIT">REVIT</option>
                          <option value="EXCEL">EXCEL</option>
                          <option value="PROJECT">PROJECT</option>
                        </select>
                      ) : (p.software)}
                    </td>

                    {/* AVANCE */}
                    <td 
                      style={{ padding: '4px 10px', cursor: 'pointer', outline: 'none', textAlign: 'center' }} 
                      onClick={() => !isEditing && startEditing(p)}
                      tabIndex={0}
                      onPaste={(e) => handlePaste(e, p.id, 'avance')}
                    >
                      {isEditing ? (
                        <input type="number" min="0" max="100" value={editFormData.avance || 0} onChange={e => handleFieldChange('avance', e.target.value)} style={{ width: '100%', padding: 4 }} />
                      ) : (
                        <span style={{ fontWeight: 'bold', color: (isTitle ? computedTitleAvance[p.id] : p.avance) >= 99.99 ? '#1e8e3e' : (isTitle ? computedTitleAvance[p.id] : p.avance) > 0 ? '#7e9bbd' : '#888' }}>
                          {(isTitle ? computedTitleAvance[p.id] : p.avance) ? parseFloat((isTitle ? computedTitleAvance[p.id] : p.avance)).toFixed(2) + '%' : '0.00%'}
                        </span>
                      )}
                    </td>

                    {/* ACCIONES */}
                    {isAdmin && (
                      <td style={{ padding: '4px 10px', textAlign: 'center' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={() => savePartida(p.id)} style={{ background: '#1e8e3e', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}>✓</button>
                            <button onClick={cancelEditing} style={{ background: '#d93025', color: '#fff', border: 'none', borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}>✕</button>
                          </div>
                        ) : (
                          <button onClick={() => deletePartida(p.id)} style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* DASHBOARD BOTTOM */}
      <div id="dashboard-bottom" style={{ display: 'flex', gap: 12, flexShrink: 0, padding: '12px', background: '#f8f9fa', borderRadius: 8, border: '1px solid #e0e0e0', flexWrap: 'wrap', alignItems: 'stretch' }}>
        
        {/* TOTALES */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 150 }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#555' }}>Resumen ({partidas.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            
            <div style={{ background: '#fff', padding: '12px', borderRadius: 6, border: '1px solid #e0e0e0', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Partidas BIM</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#7e9bbd' }}>{countBim}</div>
            </div>
            <div style={{ background: '#fff', padding: '12px', borderRadius: 6, border: '1px solid #e0e0e0', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Partidas Convencionales</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#e37400' }}>{countConv}</div>
            </div>
          </div>
        </div>
        
        {/* GRAFICA 1: METODOLOGIA (DONA) */}
        {totalInc > 0 && (
          <div style={{ background: '#fff', padding: '10px', borderRadius: 6, border: '1px solid #e0e0e0', flex: '1 1 200px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#444' }}>Por Metodología</h4>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={chartBimConv} cx="50%" cy="45%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value" onClick={handleChartClick} style={{ cursor: 'pointer' }} label={renderCustomizedPieLabel} labelLine={false}>
                  {chartBimConv.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip content={renderCustomTooltip} />
                <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11, paddingTop: 5 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* GRAFICA 2: SOFTWARE (BARRAS) */}
        {softwareData.total > 0 && (
          <div style={{ background: '#fff', padding: '10px', borderRadius: 6, border: '1px solid #e0e0e0', flex: '1 1 250px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#444' }}>Por Software</h4>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartSoftware} margin={{ top: 15, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={renderCustomTooltip} cursor={{ fill: '#f5f5f5' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={30} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                  {chartSoftware.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  <LabelList dataKey="cantidad" position="top" style={{ fontSize: '10px', fill: '#444', fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* GRAFICA 3: AVANCE GLOBAL */}
        <div style={{ background: '#f6fdf8', padding: '20px', borderRadius: 6, border: '1px solid #1e8e3e', flex: '1 1 250px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h4 style={{ margin: '0 0 15px 0', fontSize: 14, color: '#1e8e3e', fontWeight: 'bold' }}>AVANCE GLOBAL DE MODELADO</h4>
          
          <div style={{ fontSize: 42, fontWeight: 'bold', color: '#1e8e3e', marginBottom: 20 }}>
            {globalProgress.toFixed(2)}%
          </div>
          
          <div style={{ width: '100%', background: '#e0e0e0', height: 12, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${globalProgress}%`, background: '#1e8e3e', height: '100%', borderRadius: 6, transition: 'width 0.5s ease-in-out' }}></div>
          </div>
        </div>

      </div>

          </div>
  );
};

export default PartidasModule;
