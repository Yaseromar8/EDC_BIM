import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { extractModelMeasurements, calculateMetradoReal } from './budgetEngine';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * BudgetTree - Panel 5D de Presupuesto
 * ======================================
 * Muestra el presupuesto maestro como árbol jerárquico colapsable.
 * Integra motor de cálculo para METRADO REAL desde el modelo 3D.
 * Hatch patterns: rojo (sin vincular), amarillo (sin metrado), verde (completo).
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Helpers ────────────────────────────────────────────
const fmt = (n, decimals = 2) => {
  if (n == null || isNaN(n)) return '';
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const fmtS = (n, decimals = 2) => {
  if (n == null || isNaN(n)) return '';
  return 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

// ─── Hatch pattern backgrounds (CSS repeating-linear-gradient) ───
const HATCH_STYLES = {
  no_link: {
    background: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 3px,
      rgba(239, 68, 68, 0.25) 3px,
      rgba(239, 68, 68, 0.25) 5px
    )`,
  },
  no_metrado: {
    background: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 3px,
      rgba(234, 179, 8, 0.3) 3px,
      rgba(234, 179, 8, 0.3) 5px
    )`,
  },
  complete: {
    background: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 3px,
      rgba(34, 197, 94, 0.2) 3px,
      rgba(34, 197, 94, 0.2) 5px
    )`,
  },
};

// ─── Tree Builder ───────────────────────────────────────
function buildTree(flatRows) {
  const map = {};
  const roots = [];
  
  flatRows.forEach(row => {
    map[row.item] = { ...row, children: [] };
  });
  
  flatRows.forEach(row => {
    if (row.parent_item && map[row.parent_item]) {
      map[row.parent_item].children.push(map[row.item]);
    } else {
      roots.push(map[row.item]);
    }
  });
  
  return { roots, map };
}

// ─── Flatten visible tree rows using expandedSet ────────
function flattenVisible(roots, expandedSet, engineResults = {}) {
  const result = [];
  const walk = (nodes) => {
    nodes.forEach(node => {
      result.push(node);
      const isExpanded = expandedSet.has(node.item);
      
      if (isExpanded) {
        if (node.children && node.children.length > 0) {
          walk(node.children);
        } else if (!node.es_titulo) {
          // Es una partida expandida: inyectar elementos si los hay
          const eng = engineResults[node.item];
          if (eng && eng.elements && eng.elements.length > 0) {
            eng.elements.forEach(el => {
              result.push({
                is_element: true,
                parent_item: node.item,
                item: node.item + '_' + el.dbId,
                descripcion: el.name,
                nivel: node.nivel + 1,
                es_titulo: false,
                metrado_real: el.value,
                dbIds: [{ id: el.dbId, modelUrn: el.modelUrn }],
                rawProps: el.rawProps || {},
                matchedSlot: el.matchedSlot || 1,
                parent_unidad: node.unidad,
                parent_nombre: node.descripcion
              });
            });
          }
        }
      }
    });
  };
  walk(roots);
  return result;
}

// ─── Collect titulo items for initial expand ────────────
function getInitialExpanded(flatRows, maxLevel = 1) {
  const set = new Set();
  flatRows.forEach(r => {
    if (r.es_titulo && r.nivel <= maxLevel) set.add(r.item);
  });
  return set;
}

// ─── Popout HTML Generator ──────────────────────────────
function generatePopoutHTML(flatRows, engineResults) {
  const fmtPop = (n) => n != null ? 'S/ ' + Number(n).toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';
  const fmtQty = (n) => n != null ? Number(n).toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';
  
  const hatchCSS = `
    .hatch-no_link { background: repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(239,68,68,0.25) 3px, rgba(239,68,68,0.25) 5px); }
    .hatch-no_metrado { background: repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(234,179,8,0.3) 3px, rgba(234,179,8,0.3) 5px); }
    .hatch-complete { background: repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(34,197,94,0.2) 3px, rgba(34,197,94,0.2) 5px); }
  `;
  
  const rows = flatRows.map(r => {
    const eng = engineResults[r.item];
    const metradoReal = eng ? eng.metrado_real : r.metrado_real;
    const status = eng ? eng.status : null;
    const parcialReal = (metradoReal != null && r.precio_unitario != null)
      ? metradoReal * r.precio_unitario : null;
    const hatchClass = status ? `hatch-${status}` : '';
    
    return `<tr class="row n${r.nivel} ${r.es_titulo ? 'titulo' : 'partida'}" data-item="${r.item}" onclick="selectRow('${r.item}')">
      <td class="cell-item" style="padding-left:${(r.nivel - 1) * 20 + 8}px">
        ${r.es_titulo ? '<span class="arrow">▼</span>' : ''} ${r.item}
      </td>
      <td class="cell-desc">${r.descripcion || ''}</td>
      <td class="cell-und">${r.unidad || ''}</td>
      <td class="cell-num">${fmtQty(r.metrado_contractual)}</td>
      <td class="cell-num ${hatchClass}">${metradoReal != null ? fmtQty(metradoReal) : ''}</td>
      <td class="cell-num">${fmtPop(r.precio_unitario)}</td>
      <td class="cell-num">${fmtPop(r.parcial_contractual)}</td>
      <td class="cell-num ${hatchClass}">${parcialReal != null ? fmtPop(parcialReal) : ''}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><title>BIM 5D - Presupuesto</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#1a1b1f; color:#e0e0e0; font-size:12px; }
  .header { background:#222; padding:8px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; }
  .header h3 { margin:0; font-size:14px; color:#3aa0ff; }
  .dock-btn { background:#3aa0ff; color:#fff; border:none; padding:5px 14px; border-radius:4px; cursor:pointer; font-size:12px; }
  .dock-btn:hover { background:#2980d9; }
  table { width:100%; border-collapse:collapse; }
  th { background:#2a2b30; color:#aaa; padding:6px 8px; text-align:left; font-size:11px; font-weight:600; position:sticky; top:0; z-index:2; border-bottom:1px solid #333; }
  th.num { text-align:right; }
  .row { border-bottom:1px solid #2a2b30; cursor:pointer; transition:background 0.15s; }
  .row:hover { background:#2a2b30; }
  .row.selected { background:#1a3a5c; }
  .row.titulo { font-weight:700; background:#1e1f23; }
  .row.titulo td { color:#ccc; }
  .row.n1 { font-size:13px; }
  .row.n1 td { padding:8px; }
  td { padding:4px 8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cell-item { color:#3aa0ff; min-width:140px; }
  .cell-desc { max-width:400px; }
  .cell-und { text-align:center; color:#888; min-width:50px; }
  .cell-num { text-align:right; min-width:100px; font-variant-numeric:tabular-nums; }
  .arrow { font-size:10px; margin-right:4px; }
  .table-wrap { overflow:auto; height:calc(100vh - 40px); }
  ${hatchCSS}
</style>
</head><body>
<div class="header">
  <h3>5D - Presupuesto Maestro</h3>
  <button class="dock-btn" onclick="dockBack()">⬅ Dock</button>
</div>
<div class="table-wrap">
<table><thead><tr>
  <th>ÍTEM</th><th>DESCRIPCIÓN</th><th>UND.</th>
  <th class="num">METRADO CONTRACTUAL</th><th class="num">METRADO REAL</th>
  <th class="num">P.U (S/)</th><th class="num">P. PARCIAL (S) CONTRACTUAL</th><th class="num">P. PARCIAL (S) REAL</th>
</tr></thead><tbody>${rows}</tbody></table>
</div>
<script>
  let lastClickTime = 0;
  let lastClickItem = '';
  function selectRow(item) {
    document.querySelectorAll('.row.selected').forEach(r => r.classList.remove('selected'));
    const row = document.querySelector('[data-item="' + item + '"]');
    if (row) row.classList.add('selected');
    const now = Date.now();
    if (lastClickItem === item && (now - lastClickTime) < 400) {
      if (window.opener) window.opener.postMessage({ type: 'budget-popout-isolate', item }, '*');
    } else {
      if (window.opener) window.opener.postMessage({ type: 'budget-popout-select', item }, '*');
    }
    lastClickTime = now;
    lastClickItem = item;
  }
  function dockBack() {
    if (window.opener) window.opener.postMessage({ type: 'budget-dock' }, '*');
    window.close();
  }
  window.addEventListener('beforeunload', () => {
    if (window.opener) window.opener.postMessage({ type: 'budget-dock' }, '*');
  });
</script>
</body></html>`;
}


// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
const BudgetTree = ({ activeModelUrn = 'global', onClose }) => {
  const [flatData, setFlatData] = useState([]);
  const [treeRoots, setTreeRoots] = useState([]);
  const [treeMap, setTreeMap] = useState({});
  const [expandedSet, setExpandedSet] = useState(new Set());
  const [engineResults, setEngineResults] = useState({});
  const [engineStatus, setEngineStatus] = useState('idle'); // idle | loading | done | error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const containerRef = useRef(null);
  const ROW_HEIGHT = 30;

  // ─── Fetch presupuesto data ────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      let rows = [];
      
      try {
        const resp = await fetch(`${API_BASE}/api/presupuesto/${encodeURIComponent(activeModelUrn)}`);
        if (resp.ok) {
          const json = await resp.json();
          rows = json.results || [];
        }
      } catch (e) {
        console.warn('[BudgetTree] API no disponible, intentando JSON local...', e.message);
      }
      
      if (rows.length === 0) {
        try {
          const resp2 = await fetch('/presupuesto_maestro.json');
          if (resp2.ok) {
            rows = await resp2.json();
            console.log('[BudgetTree] Cargado desde JSON local:', rows.length, 'filas');
          }
        } catch (e2) {
          console.error('[BudgetTree] JSON local tampoco disponible:', e2.message);
          setError('No se pudo cargar el presupuesto.');
          setLoading(false);
          return;
        }
      }
      
      if (rows.length === 0) {
        setLoading(false);
        return;
      }
      
      setFlatData(rows);
      const { roots, map } = buildTree(rows);
      setTreeRoots(roots);
      setTreeMap(map);
      setExpandedSet(new Set()); // Start collapsed
      setLoading(false);
    };
    fetchData();
  }, [activeModelUrn]);

  // ─── Run budget engine using PostgreSQL Inventory ─────
  useEffect(() => {
    if (flatData.length === 0) return;

    const runEngine = () => {
      if (!window.postgresInventory || window.postgresInventory.length === 0) {
        return; // Esperamos silenciosamente a que postgresInventory cargue
      }

      setEngineStatus('loading');
      console.log('[BudgetEngine] Iniciando extracción de propiedades (PostgreSQL)...');

      extractModelMeasurements()
        .then((modelData) => {
          const count = Object.keys(modelData).length;
          console.log(`[BudgetEngine] ${count} códigos de partida encontrados en el CDE`);
          
          const results = calculateMetradoReal(flatData, modelData);
          setEngineResults(results);
          setEngineStatus('done');

          // Log resumen
          let complete = 0, noMetrado = 0, noLink = 0;
          Object.values(results).forEach(r => {
            if (r.status === 'complete') complete++;
            else if (r.status === 'no_metrado') noMetrado++;
            else if (r.status === 'no_link') noLink++;
          });
          console.log(`[BudgetEngine] Resultados: ${complete} completos, ${noMetrado} sin metrado, ${noLink} sin vincular`);
        })
        .catch((err) => {
          console.error('[BudgetEngine] Error:', err);
          setEngineStatus('error');
        });
    };

    // Intentar inmediatamente si ya hay data de Postgres
    if (window.postgresInventory && window.postgresInventory.length > 0) {
      runEngine();
    }

    // Escuchar cuando el CDE Postgres termina de cargar
    window.addEventListener('viewer-schema-extracted', runEngine);

    return () => {
      window.removeEventListener('viewer-schema-extracted', runEngine);
    };
  }, [flatData]);

  // ─── Auto-resize observer ─────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ─── Toggle expand/collapse ───────────────────────
  const toggleExpand = useCallback((itemCode) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(itemCode)) {
        next.delete(itemCode);
      } else {
        next.add(itemCode);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const next = new Set();
    flatData.forEach(r => { if (r.es_titulo) next.add(r.item); });
    setExpandedSet(next);
  }, [flatData]);

  const collapseAll = useCallback(() => {
    setExpandedSet(new Set());
  }, []);

  const exportToExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Presupuesto 5D');

      // Configurar agrupación (Outline) para que el resumen esté ARRIBA de los detalles
      worksheet.properties.outlineProperties = {
        summaryBelow: false,
        summaryRight: false,
      };

      // Freeze first row
      worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

      worksheet.columns = [
        { header: 'ÍTEM', key: 'col1', width: 18 },
        { header: 'DESCRIPCIÓN', key: 'col2', width: 50 },
        { header: 'UND.', key: 'col3', width: 10 },
        { header: 'METRADO CONTR.', key: 'col4', width: 18 },
        { header: 'METRADO REAL', key: 'col5', width: 18 },
        { header: 'P.U (S/)', key: 'col6', width: 15 },
        { header: 'PARCIAL CONTR.', key: 'col7', width: 18 },
        { header: 'PARCIAL REAL', key: 'col8', width: 18 },
        { header: 'METRADO SUSTENTO', key: 'col9', width: 18 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF212529' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      const applyRowStyles = (row, type, level = 0) => {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          // Alineación por defecto para números
          if (colNumber >= 4) {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          } else {
            cell.alignment = { vertical: 'middle' };
          }

          // Indentation (Sangría) para descripciones
          if (colNumber === 2 && level > 1) {
            cell.alignment = { ...cell.alignment, indent: level - 1 };
          }

          // Formatos de número nativos
          if (colNumber === 4 || colNumber === 5 || colNumber === 9) {
            cell.numFmt = '#,##0.00';
          }
          if (colNumber === 6 || colNumber === 7 || colNumber === 8) {
            cell.numFmt = '"S/" #,##0.00';
          }

          // Estilos específicos según tipo de fila
          if (type === 'titulo_principal') {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF343A40' } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
          } else if (type === 'titulo_secundario') {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6C757D' } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
          } else if (type === 'partida') {
            cell.font = { bold: true, color: { argb: 'FF000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
              bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }
            };
          } else if (type === 'subheader') {
            cell.font = { italic: true, color: { argb: 'FF888888' }, size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFEEEEEE' } } };
            if (colNumber < 4) cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else if (type === 'elemento') {
            cell.font = { color: { argb: 'FF666666' }, size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          }
        });
      };

      const addNodeToExcel = (node, level) => {
        if (node.es_titulo) {
          const row = worksheet.addRow({
            col1: node.item,
            col2: node.descripcion,
            col3: node.unidad,
            col4: node.metrado_contractual ? Number(node.metrado_contractual) : null,
            col5: engineResults[node.item] && engineResults[node.item].metrado_real != null ? Number(engineResults[node.item].metrado_real) : null,
            col6: node.precio_unitario ? Number(node.precio_unitario) : null,
            col7: node.parcial_contractual ? Number(node.parcial_contractual) : null,
            col8: null
          });
          row.outlineLevel = Math.max(0, level - 1);
          
          const type = level === 1 ? 'titulo_principal' : 'titulo_secundario';
          applyRowStyles(row, type, level);
          
          if (node.children) {
            node.children.forEach(child => addNodeToExcel(child, level + 1));
          }
        } else {
          const eng = engineResults[node.item];
          const metradoReal = eng && eng.metrado_real != null ? Number(eng.metrado_real) : (node.metrado_real != null ? Number(node.metrado_real) : null);
          const parcialReal = (metradoReal != null && node.precio_unitario != null) ? metradoReal * Number(node.precio_unitario) : null;
          
          const row = worksheet.addRow({
            col1: node.item,
            col2: node.descripcion,
            col3: node.unidad,
            col4: node.metrado_contractual ? Number(node.metrado_contractual) : null,
            col5: metradoReal,
            col6: node.precio_unitario ? Number(node.precio_unitario) : null,
            col7: node.parcial_contractual ? Number(node.parcial_contractual) : null,
            col8: parcialReal
          });
          row.outlineLevel = Math.max(0, level - 1);
          applyRowStyles(row, 'partida', level);
          
          if (eng && eng.elements && eng.elements.length > 0) {
            const subHeaderRow = worksheet.addRow({
                col1: '[ID] ELEMENTO',
                col2: 'ZONA',
                col3: 'UBICACIÓN',
                col4: 'SUBZONA',
                col5: 'SUBUBICACIÓN',
                col6: 'CÓD. PARTIDA',
                col7: 'NOMBRE PARTIDA',
                col8: 'UND.',
                col9: 'METRADO SUST.'
            });
            subHeaderRow.outlineLevel = level;
            applyRowStyles(subHeaderRow, 'subheader', level + 1);

            eng.elements.forEach(el => {
              const matchedSlot = el.matchedSlot || 1;
              const rawProps = el.props || el.rawProps || {};
              const elRow = worksheet.addRow({
                col1: `[${el.dbId}]`,
                col2: rawProps['01_13_DSI_Zona'] || '-',
                col3: rawProps['01_11_DSI_Ubicacion'] || '-',
                col4: rawProps['01_14_DSI_SubZona'] || '-',
                col5: rawProps['01_12_DSI_SubUbicacion'] || '-',
                col6: node.item,
                col7: rawProps[`03_04_DSI_NombreDePartida${matchedSlot}`] || node.descripcion,
                col8: rawProps[`02_01_DSI_Unidad${matchedSlot}`] || node.unidad || '-',
                col9: el.value != null ? Number(el.value) : null
              });
              elRow.outlineLevel = level;
              applyRowStyles(elRow, 'elemento', level + 1);
            });
          }
        }
      };

      treeRoots.forEach(root => addNodeToExcel(root, 1));

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, 'Presupuesto_BIM_5D.xlsx');
    } catch (err) {
      console.error('Error al exportar a Excel:', err);
    }
  };

  // ─── Visible rows ─────────────────────────────────
  const visibleRows = useMemo(
    () => flattenVisible(treeRoots, expandedSet, engineResults),
    [treeRoots, expandedSet, engineResults]
  );

  // ─── Virtual scrolling ───────────────────────────
  const totalHeight = visibleRows.length * ROW_HEIGHT;
  const effectiveHeight = Math.max(containerHeight, 600);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const endIndex = Math.min(visibleRows.length, Math.ceil((scrollTop + effectiveHeight) / ROW_HEIGHT) + 5);
  const slicedRows = visibleRows.slice(startIndex, endIndex);

  // ─── Interaction Handlers (Tandem-Style) ──────────
  
  const normalizeUrn = (urn) => {
    if (!urn) return '';
    let decoded = urn;
    try { decoded = atob(urn.replace(/_/g, '/').replace(/-/g, '+')); } catch (e) { }
    const match = decoded.match(/urn:adsk\.wipprod:fs\.file:vf\.([a-zA-Z0-9_-]+)/);
    return match ? match[1] : urn.split('?')[0];
  };

  const getDbIdsForNode = useCallback((node) => {
    let rawDbIds = [];
    let leafItems = [];
    if (node.is_element) {
      rawDbIds = node.dbIds || [];
      leafItems = [node.parent_item];
    } else {
      const collectLeafItems = (n) => {
        if (!n.es_titulo && n.item) return [n.item];
        const results = [];
        (n.children || []).forEach(child => {
          results.push(...collectLeafItems(child));
        });
        return results;
      };
      leafItems = node.es_titulo ? collectLeafItems(node) : [node.item];
      leafItems.forEach(li => {
        const eng = engineResults[li];
        if (eng && eng.dbIds) rawDbIds.push(...eng.dbIds);
      });
    }

    const idsByUrn = {};
    const simpleIds = [];
    rawDbIds.forEach(entry => {
      if (typeof entry === 'object' && entry.id) {
        const urn = entry.modelUrn;
        let actualDbId = entry.id;

        // Si entry.id es un ExtId (UUID/Handle de Postgres), traducirlo al dbId entero del visor (Rosetta)
        if (window.rosettaToDbId && urn && typeof actualDbId === 'string') {
          const rosettaUrn = Object.keys(window.rosettaToDbId).find(u => normalizeUrn(u) === normalizeUrn(urn) || u === urn);
          if (rosettaUrn && window.rosettaToDbId[rosettaUrn][actualDbId] !== undefined) {
            actualDbId = window.rosettaToDbId[rosettaUrn][actualDbId];
          }
        }

        if (!idsByUrn[urn]) idsByUrn[urn] = new Set();
        idsByUrn[urn].add(actualDbId);
        simpleIds.push(actualDbId);
      } else {
        simpleIds.push(entry);
      }
    });

    return { idsByUrn, simpleIds, leafItems };
  }, [engineResults]);

  const handleRowSelect = useCallback((node) => {
    setSelectedItem(node.item);
    
    const { idsByUrn, simpleIds, leafItems } = getDbIdsForNode(node);

    const viewer = window.NOP_VIEWER;
    if (viewer) {
      viewer.clearSelection();
    }
    
    // Disparar evento para que el DataVizEngine (Tandem Stripes) lo intercepte en Viewer.jsx
    window.dispatchEvent(new CustomEvent('budget-tandem-highlight', {
      detail: { idsByUrn, simpleIds }
    }));

    window.dispatchEvent(new CustomEvent('budget-select-partidas', {
      detail: { items: leafItems, parentItem: node.is_element ? node.parent_item : node.item, dbIds: simpleIds, idsByUrn }
    }));
  }, [getDbIdsForNode]);

  const handleRowIsolate = useCallback((node) => {
    setSelectedItem(node.item);
    
    const { idsByUrn, simpleIds, leafItems } = getDbIdsForNode(node);

    // ═══ DIAGNÓSTICO JERÁRQUICO ═══
    if (node.es_titulo) {
      console.log(`[BudgetTree] 🏗️ Aislamiento JERÁRQUICO: "${node.descripcion}" → ${leafItems.length} partidas, ${simpleIds.length} elementos 3D`);
    } else {
      console.log(`[BudgetTree] 🎯 Aislamiento partida: "${node.item}" → ${simpleIds.length} elementos 3D`);
    }

    // Aislamiento y Enfoque en visor 3D multi-modelo
    const viewer = window.NOP_VIEWER;
    if (viewer) {
      if (Object.keys(idsByUrn).length > 0) {
        viewer.setGhosting(true);
        const modelsQueue = viewer.impl.modelQueue().getModels();
        modelsQueue.forEach(m => {
          const rawViewerUrn = m.getData()?.urn;
          const vUrnNorm = normalizeUrn(rawViewerUrn);
          const matchingUrn = Object.keys(idsByUrn).find(u => normalizeUrn(u) === vUrnNorm || u === rawViewerUrn);
          
          if (matchingUrn && idsByUrn[matchingUrn].size > 0) {
            viewer.isolate(Array.from(idsByUrn[matchingUrn]), m);
          } else {
            viewer.impl.visibilityManager.isolate([-1], m);
          }
        });
        viewer.impl.invalidate(true, true, true);
        viewer.fitToView();
      } else if (simpleIds.length > 0) {
        viewer.isolate(simpleIds);
        viewer.fitToView(simpleIds);
      } else {
        // Sin elementos encontrados: restaurar vista completa
        const modelsQueue = viewer.impl.modelQueue().getModels();
        modelsQueue.forEach(m => viewer.isolate([], m));
        if (node.es_titulo) {
          console.warn(`[BudgetTree] ⚠️ "${node.descripcion}": ${leafItems.length} partidas encontradas pero 0 elementos 3D vinculados. ¿Ya se ejecutó el motor 5D?`);
        }
      }
    }
  }, [getDbIdsForNode]);

  // ─── Open in New Window ───────────────────────────
  const openPopout = useCallback(() => {
    const html = generatePopoutHTML(flatData, engineResults);
    const popup = window.open('', 'BudgetPopout', 'width=1200,height=700,menubar=no,toolbar=no,location=no,status=no');
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      window.__budgetPopup = popup;
      setIsPoppedOut(true);
    }
  }, [flatData, engineResults]);

  // ─── Listen for popout messages ───────────────────
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === 'budget-popout-select') {
        const node = treeMap[e.data.item];
        if (node) handleRowSelect(node);
      } else if (e.data?.type === 'budget-popout-isolate') {
        const node = treeMap[e.data.item];
        if (node) handleRowIsolate(node);
      } else if (e.data?.type === 'budget-dock') {
        setIsPoppedOut(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [treeMap, handleRowSelect, handleRowIsolate]);

  // ─── Engine status indicator ──────────────────────
  const engineLabel = useMemo(() => {
    if (engineStatus === 'loading') return '⏳ Extrayendo del modelo...';
    if (engineStatus === 'done') {
      const total = Object.keys(engineResults).length;
      const complete = Object.values(engineResults).filter(r => r.status === 'complete').length;
      return `✅ ${complete}/${total} partidas vinculadas`;
    }
    if (engineStatus === 'error') return '⚠️ Error en extracción';
    return '⏸ Esperando modelo 3D...';
  }, [engineStatus, engineResults]);

  // ─── Render ───────────────────────────────────────
  if (isPoppedOut) {
    return null;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1a1b1f', color: '#888' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
          <div>Cargando Presupuesto Maestro...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1a1b1f', color: '#ff6b6b', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '24px' }}>⚠️</div>
        <div>Error: {error}</div>
      </div>
    );
  }

  if (flatData.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#1a1b1f', color: '#888', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '24px' }}>📭</div>
        <div>No hay datos de presupuesto</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a1b1f', color: '#e0e0e0', fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: '12px', userSelect: 'none' }}>
      {/* ─── HEADER ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', background: '#222', borderBottom: '1px solid #333',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#3aa0ff' }}>5D</span>
          <span style={{ color: '#666', fontSize: '10px' }}>{engineLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={expandAll} title="Expandir Todo"
            style={{ background: 'none', border: '1px solid #444', color: '#aaa', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>
            ▼ Expandir
          </button>
          <button onClick={collapseAll} title="Contraer Todo"
            style={{ background: 'none', border: '1px solid #444', color: '#aaa', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>
            ▶ Contraer
          </button>
          <button onClick={openPopout} title="Open in a new window"
            style={{ background: 'none', border: '1px solid #444', color: '#aaa', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>
            ↗ New Window
          </button>
          <button onClick={exportToExcel} title="Exportar a Excel con agrupaciones"
            style={{ background: 'none', border: '1px solid #444', color: '#aaa', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            📊 Exportar
          </button>
          {onClose && (
            <button onClick={onClose} title="Cerrar"
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── TABLE HEADER ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr 55px 120px 120px 110px 155px 155px',
        background: '#2a2b30', borderBottom: '1px solid #333',
        position: 'sticky', top: 0, zIndex: 5, flexShrink: 0
      }}>
        {['ÍTEM', 'DESCRIPCIÓN', 'UND.', 'METRADO\nCONTRACTUAL', 'METRADO\nREAL', 'P.U (S/)', 'P. PARCIAL (S)\nCONTRACTUAL', 'P. PARCIAL (S)\nREAL'].map((h, i) => (
          <div key={i} style={{
            padding: '6px 8px', fontSize: '10.5px', fontWeight: 600, color: '#aaa',
            textAlign: i >= 3 ? 'right' : 'left',
            whiteSpace: 'pre-line', lineHeight: '1.3',
            borderRight: i < 7 ? '1px solid #333' : 'none'
          }}>
            {h}
          </div>
        ))}
      </div>

      {/* ─── VIRTUAL SCROLLING BODY ─── */}
      <div
        ref={containerRef}
        onScroll={(e) => setScrollTop(e.target.scrollTop)}
        style={{ flex: 1, overflow: 'auto', position: 'relative' }}
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: `${startIndex * ROW_HEIGHT}px`, left: 0, right: 0 }}>
            {slicedRows.map((node) => {
              const isSelected = selectedItem === node.item;
              const isTitulo = node.es_titulo;
              const isElement = node.is_element;
              const isExpanded = expandedSet.has(node.item);
              
              const eng = engineResults[node.item];
              const hasSubElements = !isTitulo && !isElement && eng?.elements?.length > 0;
              const hasChildren = (node.children && node.children.length > 0) || hasSubElements;
              
              const metradoReal = isElement ? node.metrado_real : (eng ? eng.metrado_real : node.metrado_real);
              const cellStatus = isElement ? 'complete' : (eng ? eng.status : null);
              const parcialReal = (!isElement && metradoReal != null && node.precio_unitario != null)
                ? metradoReal * node.precio_unitario : null;

              const hatchStyle = (!isTitulo && !isElement && cellStatus && HATCH_STYLES[cellStatus]) ? HATCH_STYLES[cellStatus] : {};

              return (
                <div
                  key={node.item}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 55px 120px 120px 110px 155px 155px',
                    height: `${ROW_HEIGHT}px`,
                    alignItems: 'center',
                    borderBottom: '1px solid #2a2b30',
                    background: isSelected ? '#1a3a5c' : isElement ? '#151619' : isTitulo ? '#1e1f23' : 'transparent',
                    fontWeight: isTitulo ? 700 : 400,
                    fontStyle: isElement ? 'italic' : 'normal',
                    transition: 'background 0.12s'
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = isElement ? '#1c1e22' : '#2a2b30'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isElement ? '#151619' : isTitulo ? '#1e1f23' : 'transparent'; }}
                >
                  {/* ÍTEM (Solo para expandir) */}
                  <div 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setSelectedItem(node.item);
                      if (hasChildren) toggleExpand(node.item); 
                    }}
                    style={{
                    padding: '0 8px', paddingLeft: `${(node.nivel - 1) * 18 + 8}px`,
                    color: isElement ? '#6a737d' : '#3aa0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', gap: '5px',
                    cursor: hasChildren ? 'pointer' : 'default', height: '100%'
                  }}>
                    {hasChildren ? (
                      <span
                        style={{
                          fontSize: '11px', color: '#ccc', display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', width: '16px', height: '16px', flexShrink: 0,
                          cursor: 'pointer', borderRadius: '3px',
                          transition: 'transform 0.2s ease, background 0.15s',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#444'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        title={isExpanded ? 'Contraer' : 'Expandir'}
                      >▶</span>
                    ) : (
                      <span style={{ width: '16px', flexShrink: 0, fontSize: '12px', display: 'flex', justifyContent: 'center' }}>
                        {isElement ? '🧊' : ''}
                      </span>
                    )}
                    <span>{isElement ? `[${typeof node.dbIds[0] === 'object' ? node.dbIds[0].id : node.dbIds[0]}]` : node.item}</span>
                  </div>

                  {isElement ? (
                    <div
                      style={{ 
                        gridColumn: '2 / -1', 
                        display: 'grid', 
                        gridTemplateColumns: 'minmax(90px, 1fr) minmax(120px, 1.2fr) minmax(130px, 1.5fr) max-content max-content minmax(150px, 2fr) 40px 80px',
                        height: '100%',
                        cursor: 'pointer',
                        fontSize: '10.5px',
                        color: '#a0aab5'
                      }}
                      onClick={(e) => { e.stopPropagation(); handleRowSelect(node); }}
                      onDoubleClick={(e) => { e.stopPropagation(); handleRowIsolate(node); }}
                      title="Clic para seleccionar, Doble clic para aislar"
                    >
                       <div style={{ padding: '0 8px', borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={node.rawProps['01_13_DSI_Zona']}>{node.rawProps['01_13_DSI_Zona'] || '-'}</div>
                       <div style={{ padding: '0 8px', borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={node.rawProps['01_11_DSI_Ubicacion']}>{node.rawProps['01_11_DSI_Ubicacion'] || '-'}</div>
                       <div style={{ padding: '0 8px', borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={node.rawProps['01_14_DSI_SubZona']}>{node.rawProps['01_14_DSI_SubZona'] || '-'}</div>
                       <div style={{ padding: '0 8px', borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={node.rawProps['01_12_DSI_SubUbicacion']}>{node.rawProps['01_12_DSI_SubUbicacion'] || '-'}</div>
                       
                       <div style={{ padding: '0 8px', borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#6a737d' }} title={node.parent_item}>{node.parent_item}</div>
                       <div style={{ padding: '0 8px', borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={node.rawProps[`03_04_DSI_NombreDePartida${node.matchedSlot}`] || node.parent_nombre}>{node.rawProps[`03_04_DSI_NombreDePartida${node.matchedSlot}`] || node.parent_nombre}</div>
                       
                       <div style={{ padding: '0 8px', borderRight: '1px solid #2a2b30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{node.rawProps[`02_01_DSI_Unidad${node.matchedSlot}`] || node.parent_unidad || '-'}</div>
                       
                       <div style={{ padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: '#4caf50', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {metradoReal != null && metradoReal !== 0 ? fmt(metradoReal) : ''}
                       </div>
                    </div>
                  ) : (
                    <div
                      style={{ display: 'contents', cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); handleRowSelect(node); }}
                      onDoubleClick={(e) => { e.stopPropagation(); handleRowIsolate(node); }}
                      title="Clic para seleccionar, Doble clic para aislar"
                    >
                      {/* DESCRIPCIÓN */}
                      <div style={{
                        padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: isTitulo ? '#ccc' : '#e0e0e0',
                        borderRight: '1px solid #2a2b30', height: '100%', display: 'flex', alignItems: 'center'
                      }}>
                        {node.descripcion}
                      </div>
                      {/* UND */}
                      <div style={{ padding: '0 4px', textAlign: 'center', color: '#888', borderRight: '1px solid #2a2b30', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {node.unidad || ''}
                      </div>
                      {/* METRADO CONTRACTUAL */}
                      <div style={{ padding: '0 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid #2a2b30', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {node.metrado_contractual != null ? fmt(node.metrado_contractual) : ''}
                      </div>
                      {/* METRADO REAL */}
                      <div style={{
                        padding: '0 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        borderRight: '1px solid #2a2b30', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        color: cellStatus === 'complete' ? '#22c55e' : cellStatus === 'no_metrado' ? '#eab308' : cellStatus === 'no_link' ? '#ef4444' : '#4caf50',
                        fontWeight: 600,
                        ...hatchStyle
                      }}>
                        {metradoReal != null && metradoReal !== 0 ? fmt(metradoReal) : (cellStatus === 'no_metrado' ? '0.00' : '')}
                      </div>
                      {/* P.U (S/) */}
                      <div style={{ padding: '0 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid #2a2b30', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {node.precio_unitario != null ? fmtS(node.precio_unitario) : ''}
                      </div>
                      {/* P. PARCIAL CONTRACTUAL */}
                      <div style={{ padding: '0 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid #2a2b30', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {node.parcial_contractual != null ? fmtS(node.parcial_contractual) : ''}
                      </div>
                      {/* P. PARCIAL REAL */}
                      <div style={{
                        padding: '0 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        color: cellStatus === 'complete' ? '#22c55e' : cellStatus === 'no_metrado' ? '#eab308' : cellStatus === 'no_link' ? '#ef4444' : '#4caf50',
                        fontWeight: 600,
                        ...hatchStyle
                      }}>
                        {parcialReal != null && parcialReal !== 0 ? fmtS(parcialReal) : (cellStatus === 'no_metrado' ? 'S/ 0.00' : '')}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BudgetTree;
