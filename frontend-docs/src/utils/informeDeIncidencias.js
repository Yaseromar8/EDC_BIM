/**
 * El INFORME de incidencias (migración 45, docs/archivos/18 §5): lo que se ve en la lista —o las observaciones de un
 * plano— en Excel o en PDF, como el «Export» de los issues de ACC. Se arma en el navegador con lo que la pantalla ya
 * tiene: no hay ruta nueva ni copia en el servidor.
 *
 * `filasDelInforme` es pura (la prueba pruebas/estadosDeIssue.prueba.mjs); las librerías se cargan al exportar, para no
 * pesar en la carga de la página.
 */
import { estadoDeIssue, issueViva } from './estadosDeIssue.js';

const hoyISO = () => new Date().toISOString().slice(0, 10);

function fecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Las columnas del informe: las fijas y, al final, los campos propios de la obra. */
export function filasDelInforme(incidencias, { nombres = {}, empresas = {}, campos = [], hoy = hoyISO() } = {}) {
  const cabecera = ['Código', 'Tipo', 'Subtipo', 'Título', 'Estado', 'Asignada a', 'Verifica', 'Fecha límite',
    'Vencida', 'Causa raíz', 'Ubicación', 'Creada', ...campos.map(c => c.etiqueta)];
  const filas = (incidencias || []).map((i) => {
    const asignada = i.responsable_id ? (nombres[i.responsable_id] || i.responsable || `usuario ${i.responsable_id}`)
      : i.responsable_empresa ? (empresas[i.responsable_empresa] || i.responsable || `empresa ${i.responsable_empresa}`)
        : (i.responsable || '');
    const vence = String(i.vence_en || '').slice(0, 10);
    return [
      i.codigo || '', i.tipo_etiqueta || i.tipo || 'Observación de documento', i.subtipo || '', i.titulo || '',
      estadoDeIssue(i.estado).etiqueta, asignada,
      i.verificador_id ? (nombres[i.verificador_id] || i.verificador || '') : (i.verificador || ''),
      fecha(vence), vence && vence < hoy && issueViva(i) ? 'Sí' : '', i.causa_raiz || '', i.ubicacion || '',
      fecha(i.creado_en),
      ...campos.map(c => {
        const v = (i.campos || {})[c.clave];
        return v == null ? '' : c.tipo === 'fecha' ? fecha(v) : String(v);
      }),
    ];
  });
  return { cabecera, filas };
}

const nombreDeFichero = (titulo, ext) =>
  `${String(titulo || 'Incidencias').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)} ${hoyISO()}.${ext}`;

export async function exportarExcel(titulo, { cabecera, filas }) {
  const XLSX = await import('xlsx');
  const hoja = XLSX.utils.aoa_to_sheet([cabecera, ...filas]);
  hoja['!cols'] = cabecera.map((c, n) => ({ wch: Math.min(60, Math.max(c.length, ...filas.map(f => String(f[n] || '').length)) + 2) }));
  hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: cabecera.length - 1 } }) };
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Incidencias');
  XLSX.writeFile(libro, nombreDeFichero(titulo, 'xlsx'));
}

export async function exportarPdf(titulo, subtitulo, { cabecera, filas }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 19);
  doc.text(titulo, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(114, 112, 107);
  doc.text(`${subtitulo} · ${filas.length} ${filas.length === 1 ? 'incidencia' : 'incidencias'} · ${fecha(hoyISO())}`, 14, 22);
  // El resumen por estado, en una línea: lo primero que se mira de un informe.
  const porEstado = {};
  filas.forEach(f => { porEstado[f[4]] = (porEstado[f[4]] || 0) + 1; });
  doc.text(Object.entries(porEstado).map(([e, n]) => `${e}: ${n}`).join('   '), 14, 27);
  // En PDF, sin Ubicación ni Creada si no caben los campos propios: el Excel los trae todos.
  const columnas = cabecera.length > 13 ? cabecera.map((_, n) => n).filter(n => n !== 10 && n !== 11) : cabecera.map((_, n) => n);
  autoTable(doc, {
    startY: 31,
    head: [columnas.map(n => cabecera[n])],
    body: filas.map(f => columnas.map(n => f[n])),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, lineColor: [232, 230, 220], lineWidth: 0.2, textColor: [20, 20, 19] },
    headStyles: { fillColor: [48, 47, 46], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 249, 245] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 20 }, 3: { cellWidth: 60 } },
    didParseCell: (d) => {
      if (d.section === 'body' && cabecera[columnas[d.column.index]] === 'Vencida' && d.cell.raw === 'Sí') {
        d.cell.styles.textColor = [185, 53, 53];
        d.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14 },
  });
  const paginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(176, 174, 165);
    doc.text(`Página ${p} de ${paginas}`, ancho - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text('ALEPHIA Docs', 14, doc.internal.pageSize.getHeight() - 8);
  }
  doc.save(nombreDeFichero(titulo, 'pdf'));
}
