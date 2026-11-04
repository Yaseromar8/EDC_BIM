/**
 * «VISTA DE APERTURA» en la barra del visor (5-nov-2026, docs/archivos/28; el dueño: «si es un archivo enlazado en
 * distintas carpetas, y esas carpetas representan distintas vistas»).
 *
 * Dice con qué vista abre este documento desde ESTA carpeta y, a quien tiene «Editar» en ella, le deja fijar la que
 * está mirando o volver a la de por defecto. Qué se captura lo da el visor (`capturar()`, CAD o PDF); qué se puede, el
 * servidor (`puedeFijar`). Escape y el clic fuera lo cierran, como las demás capas (design/ui/capas.js).
 */
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useCapa from '../../../design/ui/useCapa.js';
import IconoModulo from './IconoModulo';
import { describirVista } from '../utils/vistaDeApertura';

export default function VistaDeApertura({ estado, capturar, claseBoton = '', estiloBoton = null }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const raiz = useRef(null);
  useCapa(abierto, { nivel: 2, contiene: (t) => !!raiz.current?.contains(t), cerrar: () => setAbierto(false) });
  if (!estado?.disponible) return null;
  const carpeta = estado.carpeta?.nombre ? `«${estado.carpeta.nombre}»` : 'esta carpeta';
  const titulo = estado.vista ? `Desde ${carpeta} se abre en ${describirVista(estado.vista)}` : 'Vista de apertura';

  const fijar = async () => {
    const vista = capturar?.();
    if (!vista) { toast.error('Espera a que el documento termine de abrir.'); return; }
    setOcupado(true);
    try {
      await estado.fijar(vista);
      toast.success(`Desde ${carpeta} se abrirá en ${describirVista(vista)}`);
      setAbierto(false);
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };
  const restablecer = async () => {
    setOcupado(true);
    try {
      await estado.restablecer();
      toast.success(`Desde ${carpeta} se abrirá en la vista por defecto`);
      setAbierto(false);
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };

  return (
    <span ref={raiz} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={claseBoton} aria-haspopup="dialog" aria-expanded={abierto}
        aria-label={titulo} data-tip={titulo} onClick={() => setAbierto(a => !a)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: estado.vista ? '#507294' : undefined,
                 ...(estiloBoton || {}) }}>
        <IconoModulo nombre="vistas" tamano={18} />
      </button>
      {abierto && (
        <div role="dialog" aria-label="Vista de apertura"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60, width: 300, padding: 12,
                   background: '#fff', border: '1px solid #e8e6dc', borderRadius: 8,
                   boxShadow: '0 8px 24px rgb(20 20 19 / .12)', color: '#141413', fontSize: 13, textAlign: 'left' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Vista de apertura</div>
          <p style={{ margin: '0 0 10px', color: '#52524d', lineHeight: 1.45 }}>
            Desde {carpeta} se abre en <b style={{ color: '#141413', fontWeight: 600 }}>{describirVista(estado.vista)}</b>
            {estado.vista && estado.fijadaPor ? <>, fijada por {estado.fijadaPor}</> : null}.
          </p>
          {estado.puedeFijar ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button type="button" className="barra-btn barra-btn--primario" disabled={ocupado} onClick={fijar}>
                Abrir siempre así en esta carpeta</button>
              {estado.vista && (
                <button type="button" className="barra-btn barra-btn--contorno" disabled={ocupado} onClick={restablecer}>
                  Restablecer la vista por defecto</button>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, color: '#72706b', fontSize: 12 }}>
              La cambia quien puede editar en esta carpeta.</p>
          )}
        </div>
      )}
    </span>
  );
}
