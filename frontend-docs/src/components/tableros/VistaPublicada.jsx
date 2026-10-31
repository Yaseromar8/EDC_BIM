// VistaPublicada — una vista publicada del tablero a pantalla completa, de consulta (docs/visor/63). Encima del
// tablero; solo se mira: rueda para acercar, arrastrar para moverse, doble clic en un documento o una incidencia para
// abrirlos. El «⋯» trae, como las vistas del Tablero de View (docs/visor/52): Compartir (copiar enlace, imagen PNG,
// PDF A4 apaisado con el título, la obra, el tablero y la fecha) y Vista (renombrar, quitar).
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import VistaLienzo from '../../../../design/lienzo/VistaLienzo';
import { elementosDeVista, nombreArchivo } from '../../../../design/lienzo/vista';

const GRIS = '#72706b', LINEA = '#e8e6dc', SUAVE = '#f1f0e8', TINTA = '#141413', FONDO = '#faf9f5';

// Chrome solo deja bajar un archivo sin preguntar si el clic es reciente; la captura puede tardar más. Si el clic ya
// caducó, el archivo queda listo y «Guardar» lo baja con un clic nuevo (como en View, doc 52).
function bajar({ nombre, url }) {
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
}

export default function VistaPublicada({ vista, contenido, tipos, tablero, obra, enlace, puedeEditar, onCerrar, onRenombrar, onQuitar }) {
  const vistaRef = useRef(null), capaRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [titulo, setTitulo] = useState(vista.titulo);
  const [ocupado, setOcupado] = useState('');
  const [listo, setListo] = useState(null);
  useEffect(() => { if (!renombrando) setTitulo(vista.titulo); }, [vista.titulo, renombrando]);
  useEffect(() => { capaRef.current?.focus({ preventScroll: true }); }, []);
  // LAS TECLAS SIN DUEÑO SON DE LA VISTA. Al cerrarse el menú o el renombrado el foco cae al body, y el tablero de
  // debajo atiende desde window lo que llega con el foco en el body: Supr borraría lo elegido allí y Ctrl+V pegaría.
  // Mientras la vista está abierta, eso no le llega (y la vista recupera el foco); lo de una ventana que esté encima
  // (el lector, una incidencia) sigue siendo de esa ventana. Escape cierra el menú o, sin menú, la vista.
  const menuRef = useRef(false), renombrandoRef = useRef(false), cerrarRef = useRef(onCerrar);
  menuRef.current = menu; renombrandoRef.current = renombrando; cerrarRef.current = onCerrar;
  useEffect(() => {
    const deOtraVentana = () => { const a = document.activeElement; return !!a && a !== document.body && !capaRef.current?.contains(a); };
    const sinDueno = () => { const a = document.activeElement; return !a || a === document.body; };
    const tecla = (e) => {
      if (deOtraVentana()) return;
      if (e.type === 'keydown' && e.key === 'Escape' && !renombrandoRef.current) {
        e.preventDefault();
        if (menuRef.current) setMenu(false); else cerrarRef.current();
      }
      if (sinDueno()) { e.stopPropagation(); capaRef.current?.focus({ preventScroll: true }); }
    };
    const portapapeles = (e) => { if (!deOtraVentana() && sinDueno()) e.stopPropagation(); };
    const tipos = [['keydown', tecla], ['keyup', tecla], ['copy', portapapeles], ['cut', portapapeles], ['paste', portapapeles]];
    tipos.forEach(([t, f]) => window.addEventListener(t, f, true));
    return () => tipos.forEach(([t, f]) => window.removeEventListener(t, f, true));
  }, []);
  useEffect(() => () => { if (listo) setTimeout(() => URL.revokeObjectURL(listo.url), 60000); }, [listo]);
  const { secciones, notas } = elementosDeVista(contenido, vista.ids);
  const cuantos = secciones.length + notas.length;

  const copiarEnlace = async () => {
    try { await navigator.clipboard.writeText(enlace); toast.success('Enlace copiado'); }
    catch { window.prompt('Copia el enlace de la vista:', enlace); }
  };
  const capturar = async () => {
    const { default: html2canvas } = await import('html2canvas');
    return html2canvas(vistaRef.current.nodo(), { scale: 2, backgroundColor: FONDO, useCORS: true, logging: false });
  };
  const exportar = async (tipo) => {
    setListo(null);
    setOcupado(tipo === 'pdf' ? 'Creando el PDF…' : 'Creando la imagen…');
    try {
      let blob, nombre;
      if (tipo === 'png') {
        const lienzo = await capturar();
        blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
        nombre = `${nombreArchivo(`${tablero} - ${vista.titulo}`)}.png`;
      } else {
        const [lienzo, { jsPDF }] = await Promise.all([capturar(), import('jspdf')]);
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const ancho = pdf.internal.pageSize.getWidth(), alto = pdf.internal.pageSize.getHeight();
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
        pdf.text(vista.titulo, 10, 12);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(114, 112, 107);
        pdf.text([obra, `Tablero: ${tablero}`, new Date().toLocaleString('es-PE')].filter(Boolean).join(' · '), 10, 17);
        const libre = { w: ancho - 20, h: alto - 26 };
        const k = Math.min(libre.w / lienzo.width, libre.h / lienzo.height);
        // JPEG y no PNG: con la captura en PNG el PDF pesa decenas de MB (doc 52).
        pdf.addImage(lienzo.toDataURL('image/jpeg', 0.9), 'JPEG', 10 + (libre.w - lienzo.width * k) / 2, 21, lienzo.width * k, lienzo.height * k);
        blob = pdf.output('blob');
        nombre = `${nombreArchivo(`${tablero} - ${vista.titulo}`)}.pdf`;
      }
      if (!blob) throw new Error('la captura salió vacía');
      const archivo = { nombre, url: URL.createObjectURL(blob) };
      if (navigator.userActivation?.isActive) { bajar(archivo); toast.success('Descargado'); }
      else setListo(archivo);
    } catch (e) {
      toast.error(`No se pudo exportar: ${e.message}`);
    }
    setOcupado('');
  };
  const guardarListo = () => { if (listo) { bajar(listo); setListo(null); } };
  const terminarRenombrado = (aceptar) => {
    setRenombrando(false);
    const limpio = titulo.trim().replace(/\s+/g, ' ');
    if (aceptar && limpio && limpio !== vista.titulo) onRenombrar(limpio);
    else setTitulo(vista.titulo);
  };
  const quitar = () => {
    if (!window.confirm(`¿Quitar la vista «${vista.titulo}»? Lo que enseña sigue en el tablero.`)) return;
    onQuitar();
  };

  const opcion = (texto, accion, { peligro = false, apagado = false } = {}) => (
    <button type="button" role="menuitem" disabled={apagado} onClick={() => { setMenu(false); accion(); }}
      style={{ display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 14, fontFamily: 'inherit',
        cursor: apagado ? 'default' : 'pointer', color: apagado ? '#b0aea5' : peligro ? '#b93535' : TINTA }}
      onMouseEnter={e => { if (!apagado) e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>{texto}</button>
  );
  const grupo = (texto) => <div style={{ padding: '6px 14px 2px', fontSize: 12, fontWeight: 600, color: GRIS }}>{texto}</div>;

  return (
    <div ref={capaRef} tabIndex={-1} role="dialog" aria-label={`Vista ${vista.titulo}`}
      style={{ position: 'fixed', inset: 0, zIndex: 10040, display: 'flex', flexDirection: 'column', background: FONDO, outline: 'none' }}>
      <header style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: '#fff', borderBottom: `1px solid ${LINEA}` }}>
        <button type="button" onClick={onCerrar} title="Volver al tablero (Esc)"
          style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px 0 6px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', color: TINTA }}
          onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 6 8.5 12l6 6" /></svg>
          {tablero}
        </button>
        <span style={{ width: 1, height: 20, background: LINEA }} />
        {renombrando ? (
          <input autoFocus value={titulo} maxLength={120} aria-label="Nombre de la vista" onChange={e => setTitulo(e.target.value)}
            onBlur={() => terminarRenombrado(true)}
            onKeyDown={e => { if (e.key === 'Enter') terminarRenombrado(true); if (e.key === 'Escape') terminarRenombrado(false); }}
            style={{ width: `${Math.max(12, titulo.length + 2)}ch`, maxWidth: 480, height: 30, padding: '0 8px', border: `1px solid ${LINEA}`, borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: TINTA, outline: 'none' }} />
        ) : (
          <span onDoubleClick={() => puedeEditar && setRenombrando(true)} title={puedeEditar ? 'Doble clic para renombrar' : undefined}
            style={{ fontSize: 14, fontWeight: 600, color: TINTA, padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 480 }}>{vista.titulo}</span>
        )}
        <span style={{ fontSize: 13, color: GRIS, whiteSpace: 'nowrap' }}>Vista de consulta · {cuantos === 1 ? '1 elemento' : `${cuantos} elementos`}</span>
        <div style={{ flex: 1 }} />
        {ocupado && <span aria-live="polite" style={{ fontSize: 13, color: GRIS }}>{ocupado}</span>}
        {listo && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: GRIS }}>
            {listo.nombre.endsWith('.pdf') ? 'PDF listo' : 'Imagen lista'}
            <button type="button" className="barra-btn" onClick={guardarListo}>Guardar</button>
          </span>
        )}
        <button type="button" onClick={() => vistaRef.current?.encajar()} title="Ajustar a la pantalla"
          style={{ height: 32, padding: '0 10px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', color: TINTA }}
          onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>Ajustar</button>
        <div style={{ position: 'relative' }}>
          <button type="button" aria-label="Más opciones de la vista" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, background: menu ? SUAVE : 'transparent', cursor: 'pointer', color: TINTA }}
            onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { if (!menu) e.currentTarget.style.background = 'transparent'; }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {menu && (
            <>
              <div onPointerDown={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
              <div role="menu" aria-label="Vista" style={{ position: 'absolute', right: 0, top: 38, zIndex: 2, minWidth: 240, padding: '6px 0', background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)' }}>
                {grupo('Compartir')}
                {opcion('Copiar enlace', copiarEnlace)}
                {opcion('Descargar imagen (PNG)', () => exportar('png'), { apagado: !!ocupado || !cuantos })}
                {opcion('Descargar PDF', () => exportar('pdf'), { apagado: !!ocupado || !cuantos })}
                {puedeEditar && (
                  <>
                    <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '5px 0' }} />
                    {grupo('Vista')}
                    {opcion('Renombrar', () => setRenombrando(true))}
                    {opcion('Quitar vista', quitar, { peligro: true })}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </header>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <VistaLienzo ref={vistaRef} contenido={contenido} ids={vista.ids} tipos={tipos} fondo={FONDO} />
      </div>
    </div>
  );
}
