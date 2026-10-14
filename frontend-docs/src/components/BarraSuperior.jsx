/**
 * BarraSuperior — la navegación de ALEPHIA Docs arriba (13-oct-2026).
 *
 * El patrón es el estándar de los gestores de obra (Procore, ACC, Trimble):
 * una barra fina con el selector de OBRA y el de HERRAMIENTA, un buscador y el
 * usuario; sin barra lateral de módulos, así la izquierda queda para la
 * herramienta (el árbol de carpetas). La identidad es de ALEPHIA: Navy, el
 * símbolo de la marca como «Inicio», el logo horizontal y los iconos sólidos.
 * Maqueta aprobada: docs/ux/maquetas/interior_v4_estructura_procore.html.
 *
 * SOLO DIBUJA. Qué herramientas hay, en qué grupos, quién las ve y qué hace
 * cada una lo sigue decidiendo FilesPage (`grupos`), exactamente igual que
 * cuando las pintaba la barra lateral: mismas entradas, mismos filtros de
 * permisos y mismos manejadores.
 */
import React, { useEffect, useRef, useState } from 'react';
import './BarraSuperior.css';

export default function BarraSuperior({
  proyecto,            // nombre de la obra
  grupos,              // [{ titulo, items: [{ label, mode, icon, onClick }] }]
  activo,              // modo de la herramienta abierta
  onInicio,            // volver al inicio (Hub) — o a la lista de obras
  onCambiarObra,       // ir a la lista de obras
  onBuscar,            // abrir la búsqueda de la obra
  derecha,             // lo que va a la derecha (el usuario)
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);

  const items = grupos.flatMap(g => g.items);
  // Si la vista abierta no es una entrada del menú (p. ej. la cuarentena, que
  // es una pestaña de Archivos), se nombra la herramienta que la contiene.
  const actual = items.find(i => i.mode === activo) || items.find(i => i.mode === 'files') || items[0];

  // Cerrar al pulsar fuera y con Escape.
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); setAbierto(false); } };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [abierto]);

  // Ctrl/Cmd + K: buscar en la obra, como en las demás plataformas.
  useEffect(() => {
    if (!onBuscar) return undefined;
    const atajo = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); onBuscar(); }
    };
    document.addEventListener('keydown', atajo);
    return () => document.removeEventListener('keydown', atajo);
  }, [onBuscar]);

  return (
    <header className="a-sup">
      {/* Una sola marca, como en la lista de proyectos: el logo y «Docs» SON el botón de
          Inicio. Antes iban el símbolo suelto (Inicio) y, al lado, el logo con el mismo
          símbolo: la marca salía dos veces. En pantallas estrechas queda solo el símbolo. */}
      <button type="button" className="a-sup__inicio" onClick={onInicio} title="Inicio" aria-label="Inicio">
        <img className="a-sup__simbolo" src="/brand/ALEPHIA_Symbol_Light.svg" alt="" />
        <img className="a-sup__logo" src="/brand/ALEPHIA_Logo_Horizontal_Light.svg" alt="ALEPHIA" />
        <span className="a-sup__producto">Docs</span>
      </button>

      <button type="button" className="a-sup__selector" onClick={onCambiarObra} title="Cambiar de obra">
        <small>Obra</small>
        <b>{proyecto}</b>
      </button>

      <div className="a-sup__caja" ref={caja}>
        <button type="button" className={'a-sup__selector' + (abierto ? ' es-abierto' : '')}
          aria-haspopup="true" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
          <small>Herramienta</small>
          <b>{actual?.label || '—'}</b>
        </button>
        {abierto && (
          <div className="a-sup__menu" role="menu" aria-label="Herramientas de la obra">
            <div className="a-sup__columnas">
              {grupos.map(g => (
                <div key={g.titulo} className="a-sup__grupo">
                  <div className="a-sup__titulo">{g.titulo}</div>
                  {g.items.map(it => (
                    <button key={it.mode} type="button" role="menuitem"
                      className={'a-sup__herramienta' + (it.mode === actual?.mode ? ' es-activa' : '')}
                      onClick={() => { setAbierto(false); if (it.onClick) it.onClick(); }}>
                      <span className="a-sup__icono">{it.icon}</span>
                      <span>{it.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {onBuscar && (
        <button type="button" className="a-sup__buscar" onClick={onBuscar}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" />
          </svg>
          <span>Buscar en la obra</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}

      <span className="a-sup__espacio" />
      <div className="a-sup__derecha">{derecha}</div>
    </header>
  );
}
