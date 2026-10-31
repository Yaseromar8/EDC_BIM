// VistaLienzo — una vista publicada de un tablero (docs/visor/63): solo lo elegido, encajado en su marco y de solo
// lectura. Son los mismos elementos del tablero, con las mismas piezas, y vivos: lo que cambie en el tablero se ve
// aquí. La rueda acerca y aleja donde está el ratón y arrastrar mueve; doble clic en una tarjeta propia (un
// documento, una incidencia) hace lo mismo que en el tablero. Mientras no se toque la cámara, la vista se vuelve a
// encajar sola si cambia su contenido o el tamaño de la ventana.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { C, FUENTE, RADIO, COLORES_SECCION } from './tema';
import { Nota, TextoLibre, Forma, Flecha, Trazo } from './PiezasLienzo';
import { elementosDeVista, cajaDeVista, encuadre } from './vista';

const ZOOM_MIN = 0.02, ZOOM_MAX = 4;
const nada = () => {};
const SIN_TIPOS = {};
const CSS_VISTA = '[data-vista-lienzo] .tablero-nodo, [data-vista-lienzo] .tablero-nodo * { cursor: inherit !important; }';

const VistaLienzo = forwardRef(function VistaLienzo({ contenido, ids, tipos = SIN_TIPOS, margen = 48, fondo = C.light }, ref) {
  const marcoRef = useRef(null);
  const { secciones, notas } = useMemo(() => elementosDeVista(contenido, ids), [contenido, ids]);
  const caja = useMemo(() => cajaDeVista({ secciones, notas }), [secciones, notas]);
  const [cam, setCam] = useState(null);
  const manual = useRef(false);

  const encajar = useCallback(() => {
    const r = marcoRef.current?.getBoundingClientRect();
    if (!r || !r.width || !caja) return;
    manual.current = false;
    setCam(encuadre(caja, r.width, r.height, margen));
  }, [caja, margen]);
  useLayoutEffect(() => { if (!manual.current || !cam) encajar(); }, [encajar]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const alCambiarTamano = () => { if (!manual.current) encajar(); };
    window.addEventListener('resize', alCambiarTamano);
    return () => window.removeEventListener('resize', alCambiarTamano);
  }, [encajar]);
  useImperativeHandle(ref, () => ({ nodo: () => marcoRef.current, encajar }), [encajar]);

  // La rueda, con un oyente no pasivo: la de React lo es y no deja impedir que se desplace la página.
  useEffect(() => {
    const el = marcoRef.current;
    if (!el) return undefined;
    const alRodar = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      manual.current = true;
      setCam(c => {
        if (!c) return c;
        const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
        const k = s / c.s;
        return { s, tx: px - (px - c.tx) * k, ty: py - (py - c.ty) * k };
      });
    };
    el.addEventListener('wheel', alRodar, { passive: false });
    return () => el.removeEventListener('wheel', alRodar);
  }, []);
  const alPulsar = (e) => {
    if ((e.button !== 0 && e.button !== 1) || e.target.closest?.('button, a, input, select, textarea')) return;
    e.preventDefault();
    const ini = { x: e.clientX, y: e.clientY }, c0 = cam;
    if (!c0) return;
    const el = marcoRef.current;
    el.style.cursor = 'grabbing';
    const mover = (ev) => { manual.current = true; setCam({ ...c0, tx: c0.tx + ev.clientX - ini.x, ty: c0.ty + ev.clientY - ini.y }); };
    const soltar = () => { el.style.cursor = ''; window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar);
  };

  return (
    <div ref={marcoRef} data-vista-lienzo="" onPointerDown={alPulsar} onContextMenu={e => e.preventDefault()}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: fondo, cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', fontFamily: FUENTE }}>
      <style>{CSS_VISTA}</style>
      {!caja ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gris600, fontSize: 14, textAlign: 'center', padding: 24 }}>
          Lo que tenía esta vista ya no está en el tablero.
        </div>
      ) : cam && (
        <div style={{ position: 'absolute', top: 0, left: 0, '--s': cam.s, transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`, transformOrigin: '0 0' }}>
          {secciones.map(f => (
            <div key={f.id} style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(241, 240, 232, 0.72)', borderRadius: RADIO, border: `1px solid ${C.lightGray}` }} />
              <div style={{ position: 'absolute', top: -32, left: 0, height: 24, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                <span style={{ width: 3, height: 16, background: COLORES_SECCION[(f.color || 0) % COLORES_SECCION.length] }} />
                <span style={{ color: C.dark, fontWeight: 600, fontSize: 14 }}>{f.titulo}</span>
              </div>
            </div>
          ))}
          {notas.map(n => {
            const tipo = tipos[n.tipo];
            if (tipo) {
              const PiezaPropia = tipo.Pieza;
              return (
                <div key={n.id} className="tablero-nodo" onDoubleClick={(e) => { e.stopPropagation(); tipo.alDobleClic?.(n); }}
                  style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h }}>
                  <PiezaPropia elemento={n} elegido={false} ajustar={nada} />
                </div>
              );
            }
            const Pieza = n.tipo === 'texto' ? TextoLibre : n.tipo === 'forma' ? Forma : n.tipo === 'flecha' ? Flecha : n.tipo === 'trazo' ? Trazo : Nota;
            return <Pieza key={n.id} nota={n} editando={false} onPointerDown={undefined} onDoubleClick={undefined} onCambiar={nada} onTerminar={nada} />;
          })}
        </div>
      )}
    </div>
  );
});

export default VistaLienzo;
