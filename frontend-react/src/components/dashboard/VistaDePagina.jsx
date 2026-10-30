// VistaDePagina — una «vista» del Tablero: las tarjetas que el usuario eligió, ENCAJADAS en el panel
// como una página (sin zoom ni arrastre), para mostrarlas en una reunión. Son las mismas tarjetas
// del lienzo, vivas: un clic sigue aislando en el 3D, y lo que se cambia en el lienzo se ve aquí.
//
// Compartir (pedido del dueño, 30-oct-2026):
//   A · enlace para la gente de la obra: abre el visor en el frente, con el Tablero en esta vista
//       (quien lo abre entra con su usuario: respeta los permisos de la obra);
//   B · imagen (PNG) o PDF de la vista, para enviarla o ponerla en una presentación.
import React, { useRef, useState } from 'react';
import ChartCard from './ChartCard';
import { C, FUENTE, RADIO } from './tema';

const COLUMNAS = { s: 1, m: 2, l: 3 };

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
const nombreArchivo = (t) => (t || 'vista').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);

export default function VistaDePagina({
  vista, charts, rows, fields, meta, itemizado, contexto, enlace, activo,
  onIsolate, onPaint, onEdit, onUpdateChart, onQuitarDeVista, onRenombrar, onBorrar, onVolver,
}) {
  const rejilla = useRef(null);
  const [aviso, setAviso] = useState('');
  const [exportando, setExportando] = useState('');
  const [renombrando, setRenombrando] = useState(false);
  const [titulo, setTitulo] = useState(vista.titulo);
  const tarjetas = vista.cards.map(id => charts.find(c => c.id === id)).filter(Boolean);
  const filas = repartir(tarjetas);

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2600); };
  const copiarEnlace = async () => {
    try { await navigator.clipboard.writeText(enlace); avisar('Enlace copiado: quien lo abra entra con su usuario de ALEPHIA.'); }
    catch { window.prompt('Copia el enlace de la vista:', enlace); }
  };
  // La imagen sale de las mismas tarjetas que se ven (los gráficos de ECharts son canvas).
  const capturar = async () => {
    const { default: html2canvas } = await import('html2canvas');
    // Fuera de la captura: los botones de cada tarjeta y el recuadro de ayuda del ratón (el de ECharts
    // va con z-index 9999999): en la imagen solo van los gráficos.
    return html2canvas(rejilla.current, {
      scale: 2, backgroundColor: C.light, useCORS: true, logging: false,
      ignoreElements: (el) => el.hasAttribute?.('data-sin-exportar') || el.style?.zIndex === '9999999',
    });
  };
  const exportarPng = async () => {
    setExportando('png');
    try {
      const lienzo = await capturar();
      const a = document.createElement('a');
      a.href = lienzo.toDataURL('image/png');
      a.download = `${nombreArchivo(vista.titulo)}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { avisar(`No se pudo crear la imagen: ${e.message}`); }
    setExportando('');
  };
  const exportarPdf = async () => {
    setExportando('pdf');
    try {
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
      pdf.save(`${nombreArchivo(vista.titulo)}.pdf`);
    } catch (e) { avisar(`No se pudo crear el PDF: ${e.message}`); }
    setExportando('');
  };

  const boton = (principal = false) => ({
    padding: '5px 11px', borderRadius: 6, fontSize: 12, fontFamily: FUENTE, cursor: 'pointer',
    border: `1px solid ${principal ? C.dark : C.gris300}`, background: principal ? C.dark : C.blanco, color: principal ? C.light : C.dark,
  });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: C.light, display: 'flex', flexDirection: 'column', fontFamily: FUENTE }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${C.lightGray}`, background: C.blanco, flexWrap: 'wrap' }}>
        {renombrando ? (
          <input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)}
            onBlur={() => { setRenombrando(false); if (titulo.trim()) onRenombrar(titulo.trim()); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTitulo(vista.titulo); setRenombrando(false); } }}
            style={{ fontSize: 14, fontWeight: 600, fontFamily: FUENTE, border: `1px solid ${C.blue}`, borderRadius: 4, padding: '2px 6px', outline: 'none', minWidth: 260 }} />
        ) : (
          <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }} title="Doble clic: cambiar el nombre" onDoubleClick={() => setRenombrando(true)}>{vista.titulo}</div>
        )}
        <span style={{ fontSize: 11.5, color: C.gris600 }}>{tarjetas.length} {tarjetas.length === 1 ? 'gráfica' : 'gráficas'}</span>
        {aviso && <span style={{ fontSize: 11.5, color: C.blue30D }}>{aviso}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={copiarEnlace} title="Enlace para la gente de la obra: abre el visor en esta vista (con su usuario)" style={boton()}>Copiar enlace</button>
        <button onClick={exportarPng} disabled={!!exportando} title="Descargar la vista como imagen" style={boton()}>{exportando === 'png' ? 'Creando…' : 'Imagen'}</button>
        <button onClick={exportarPdf} disabled={!!exportando} title="Descargar la vista en PDF (A4 apaisado)" style={boton()}>{exportando === 'pdf' ? 'Creando…' : 'PDF'}</button>
        <button onClick={() => setRenombrando(true)} style={boton()}>Renombrar</button>
        <button onClick={() => { if (window.confirm(`¿Quitar la vista «${vista.titulo}»? Las gráficas siguen en el lienzo.`)) onBorrar(); }} style={{ ...boton(), color: C.error }}>Quitar vista</button>
        <button onClick={onVolver} style={boton(true)}>Volver al lienzo</button>
      </div>
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
}
