// VistaDePagina — una «vista» del Tablero: las tarjetas que el usuario eligió, ENCAJADAS en el panel
// como una página (sin zoom ni arrastre), para mostrarlas en una reunión. Son las mismas tarjetas
// del lienzo, vivas: un clic sigue aislando en el 3D, y lo que se cambia en el lienzo se ve aquí.
// Sus acciones (compartir, renombrar, quitar) viven en la barra de vistas (BarraDeVistas.jsx); de
// aquí sale solo lo que necesita las tarjetas dibujadas: la imagen y el PDF (docs/visor/52), como archivo
// ({ nombre, blob }); bajarlo lo decide el lienzo, que sabe si el navegador aún lo deja.
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import ChartCard from './ChartCard';
import { C, RADIO } from './tema';

const COLUMNAS = { s: 1, m: 2, l: 3 };
const nombreArchivo = (t) => (t || 'vista').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);

// Reparto en filas de tres columnas, en el orden elegido. Una tarjeta que no cabe en lo que queda de la
// fila abre otra, y la última de la fila se estira hasta el borde: ninguna fila queda con hueco.
function repartir(tarjetas) {
  const filas = [];
  let fila = [], libres = 3;
  for (const cfg of tarjetas) {
    const ancho = Math.min(COLUMNAS[cfg.size] || (cfg.type === 'kpi' ? 1 : 2), 3);
    if (ancho > libres && fila.length) { fila[fila.length - 1].span += libres; filas.push(fila); fila = []; libres = 3; }
    fila.push({ cfg, span: ancho });
    libres -= ancho;
  }
  if (fila.length) { fila[fila.length - 1].span += libres; filas.push(fila); }
  return filas;
}

const VistaDePagina = forwardRef(function VistaDePagina({
  vista, charts, rows, fields, meta, itemizado, contexto, activo,
  onIsolate, onPaint, onEdit, onUpdateChart, onQuitarDeVista,
}, ref) {
  const rejilla = useRef(null);
  const tarjetas = vista.cards.map(id => charts.find(c => c.id === id)).filter(Boolean);
  const filas = repartir(tarjetas);

  // Fuera de la captura: los botones de cada tarjeta y el recuadro de ayuda del ratón (el de ECharts va
  // con z-index 9999999): en la imagen solo van los gráficos.
  const capturar = async () => {
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(rejilla.current, {
      scale: 2, backgroundColor: C.light, useCORS: true, logging: false,
      ignoreElements: (el) => el.hasAttribute?.('data-sin-exportar') || el.style?.zIndex === '9999999',
    });
  };
  useImperativeHandle(ref, () => ({
    async exportar(tipo) {
      if (!rejilla.current) throw new Error('la vista no tiene gráficas');
      if (tipo === 'png') {
        const lienzo = await capturar();
        const blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
        return { nombre: `${nombreArchivo(vista.titulo)}.png`, blob };
      }
      const [lienzo, { jsPDF }] = await Promise.all([capturar(), import('jspdf')]);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const ancho = pdf.internal.pageSize.getWidth(), alto = pdf.internal.pageSize.getHeight();
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
      pdf.text(vista.titulo, 10, 12);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(114, 112, 107);
      pdf.text([contexto, new Date().toLocaleString('es-PE')].filter(Boolean).join(' · '), 10, 17);
      const libre = { w: ancho - 20, h: alto - 26 };
      const k = Math.min(libre.w / lienzo.width, libre.h / lienzo.height);
      // JPEG y no PNG: el PNG de la captura pesaba 17 MB en el PDF.
      pdf.addImage(lienzo.toDataURL('image/jpeg', 0.9), 'JPEG', 10, 21, lienzo.width * k, lienzo.height * k);
      return { nombre: `${nombreArchivo(vista.titulo)}.pdf`, blob: pdf.output('blob') };
    },
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: C.light, display: 'flex', flexDirection: 'column' }}>
      {!tarjetas.length ? (
        <div style={{ padding: 24, color: C.gris600, fontSize: 13 }}>Las gráficas de esta vista ya no están en el lienzo.</div>
      ) : (
        <div ref={rejilla} style={{
          flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, boxSizing: 'border-box', background: C.light,
          // Todas las filas reparten el alto del panel: la vista entera cabe sin desplazarse (si hay
          // muchas filas, cada una se queda en 200 px como mínimo y entonces sí aparece la barra).
          display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: `repeat(${filas.length}, minmax(200px, 1fr))`, gap: 12,
        }}>
          {filas.flat().map(({ cfg, span }) => (
            <div key={cfg.id} style={{ gridColumn: `span ${span}`, minWidth: 0, minHeight: 0, borderRadius: RADIO }}>
              <ChartCard
                config={cfg} rows={rows} fields={fields} meta={meta} itemizado={itemizado}
                onEdit={onEdit} onUpdate={onUpdateChart}
                onDelete={() => onQuitarDeVista(cfg.id)}
                onIsolate={onIsolate} onPaint={onPaint} onCreateFromField={() => {}}
                activeKey={activo?.chartId === cfg.id ? activo.key : null}
                dragHandlers={{}} zoom={1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default VistaDePagina;
