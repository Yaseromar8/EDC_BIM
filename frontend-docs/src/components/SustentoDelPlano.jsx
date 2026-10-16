import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { avisoDeVersion, cantidadLegible, numeroDe, zonaDeArrastre } from '../utils/sustento';
import './SustentoDelPlano.css';

/**
 * EL SUSTENTO DE METRADOS SOBRE UN PLANO (ESTANDAR_LDA §6; LECTOR_ALEPHIA_ESTANDAR §21).
 *
 * Dos piezas que comparten estado (lo guarda DocumentViewer):
 *  - CapaDeSustento: va DENTRO de la hoja (slot `sobreLaHoja` del lector de PDF), así que se mueve con
 *    ella. Pinta las zonas de la página y, en modo «vincular», recoge el arrastre de una zona nueva.
 *  - PanelDeSustento: «lo que sale de este plano», el formulario de la zona nueva y el aviso cuando
 *    una cantidad se midió sobre otra versión del plano.
 *
 * NO HAY BOTÓN FIJO (decisión del propietario, 15-oct): el metrado se revisa al final y un botón
 * «Sustento» en cada plano durante meses estorba. El panel se abre desde el estuche («Ver → Metrados»),
 * que solo aparece si el plano ya tiene vínculos, o solo cuando se llega desde la planilla para vincular
 * («+ Vincular un plano» en la fila del Excel).
 */

export function CapaDeSustento({ vinculos = [], pagina = 1, versionVista = null, dibujando = false,
                                  borrador = null, elegido = null, onZona, onElegir, discreta = false }) {
  const capa = useRef(null);
  const [inicio, setInicio] = useState(null);
  const [actual, setActual] = useState(null);

  const punto = (e) => ({ x: e.clientX, y: e.clientY });

  // Mientras se dibuja, la capa se queda con el ratón: el arrastre NO mueve el plano.
  const eventos = dibujando ? {
    // La caja de la hoja se toma al empezar: durante el arrastre la hoja no se mueve.
    onMouseDown: (e) => {
      e.stopPropagation(); e.preventDefault();
      setInicio({ ...punto(e), caja: capa.current?.getBoundingClientRect() }); setActual(punto(e));
    },
    onMouseMove: (e) => { if (inicio) { e.stopPropagation(); setActual(punto(e)); } },
    onMouseUp: (e) => {
      if (!inicio) return;
      e.stopPropagation();
      const zona = zonaDeArrastre(inicio, punto(e), inicio.caja);
      setInicio(null); setActual(null);
      if (zona) onZona?.(zona);
    },
    onDoubleClick: (e) => e.stopPropagation(),
  } : {};

  const enCurso = inicio && actual ? zonaDeArrastre(inicio, actual, inicio.caja) : null;
  const pct = (z) => ({ left: `${z[0] * 100}%`, top: `${z[1] * 100}%`, width: `${(z[2] - z[0]) * 100}%`, height: `${(z[3] - z[1]) * 100}%` });

  return (
    <div ref={capa} className={`sustento-capa${dibujando ? ' es-dibujo' : ''}${discreta ? ' es-discreta' : ''}`} {...eventos}>
      {vinculos.filter(v => !v.vista && (v.pagina || 1) === pagina && Array.isArray(v.zona)).map(v => {
        const otraVersion = versionVista && v.version_number !== versionVista;
        return (
          <button key={v.id} type="button" style={pct(v.zona)}
            className={`sustento-zona${elegido === v.id ? ' es-elegida' : ''}${otraVersion ? ' es-otra-version' : ''}`}
            title={`${v.item} · ${cantidadLegible(v.cantidad, v.unidad)}${otraVersion ? ` · medida sobre la V${v.version_number}` : ''}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onElegir?.(v.id); }}>
            <b>{v.item}{typeof v.cantidad === 'number' ? ` · ${cantidadLegible(v.cantidad, v.unidad)}` : ''}</b>
          </button>
        );
      })}
      {(enCurso || borrador) && <div className="sustento-zona es-borrador" style={pct(enCurso || borrador)} />}
    </div>
  );
}

/**
 * LA MISMA CAPA SOBRE UN DWG (visor de Autodesk, vista 2D). La zona se guarda en COORDENADAS DEL DIBUJO
 * ([x0, y0, x1, y1], y hacia arriba) con la vista donde se marcó: así sigue en su sitio aunque la presentación
 * cambie de tamaño, y en el espacio modelo son las coordenadas reales de obra. Se recoloca al mover la cámara.
 */
export function CapaDeSustentoEnCad({ viewer, vista, vinculos = [], dibujando = false, borrador = null, elegido = null,
                                      onZona, onElegir, discreta = false }) {
  const capa = useRef(null);
  const [, setTic] = useState(0);
  const [inicio, setInicio] = useState(null);
  const [actual, setActual] = useState(null);

  useEffect(() => {
    const evento = window.Autodesk?.Viewing?.CAMERA_CHANGE_EVENT;
    if (!viewer || !evento) return undefined;
    const alMover = () => setTic(t => t + 1);
    viewer.addEventListener(evento, alMover);
    return () => viewer.removeEventListener(evento, alMover);
  }, [viewer]);

  const aPantalla = (x, y) => {
    try {
      const p = viewer.worldToClient(new window.THREE.Vector3(x, y, 0));
      return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
    } catch { return null; }
  };
  const aDibujo = (x, y) => {
    try {
      let p = viewer.clientToWorld(x, y, true)?.point;
      // Sobre papel en blanco puede no haber «impacto»: entonces, el plano del dibujo (z = 0).
      if (!p && viewer.impl?.intersectGround) p = viewer.impl.intersectGround(x, y);
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
    } catch { return null; }
  };
  const local = (e) => {
    const b = capa.current.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const caja = (z) => {
    const a = aPantalla(z[0], z[1]);
    const b = aPantalla(z[2], z[3]);
    if (!a || !b) return null;
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  };

  // Mientras se dibuja, la capa se queda con el ratón: el arrastre NO mueve el plano.
  const eventos = dibujando ? {
    onPointerDown: (e) => {
      e.stopPropagation(); e.preventDefault();
      const p = local(e); setInicio(p); setActual(p);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    },
    onPointerMove: (e) => { if (inicio) { e.stopPropagation(); setActual(local(e)); } },
    onPointerUp: (e) => {
      if (!inicio) return;
      e.stopPropagation();
      const p = local(e);
      const a0 = inicio;
      setInicio(null); setActual(null);
      if (Math.abs(p.x - a0.x) < 8 || Math.abs(p.y - a0.y) < 8) return;   // un clic, no una zona
      const a = aDibujo(Math.min(a0.x, p.x), Math.max(a0.y, p.y));
      const b = aDibujo(Math.max(a0.x, p.x), Math.min(a0.y, p.y));
      if (!a || !b) { toast.error('Marca la zona sobre el plano.'); return; }
      onZona?.([Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]);
    },
    onDoubleClick: (e) => e.stopPropagation(),
  } : {};

  const enCurso = inicio && actual
    ? { left: Math.min(inicio.x, actual.x), top: Math.min(inicio.y, actual.y), width: Math.abs(actual.x - inicio.x), height: Math.abs(actual.y - inicio.y) }
    : null;
  const deEstaVista = vinculos.filter(v => v.vista === vista && Array.isArray(v.zona));
  const cajaBorrador = borrador ? caja(borrador) : null;

  return (
    <div ref={capa} className={`sustento-capa sustento-capa--cad${dibujando ? ' es-dibujo' : ''}${discreta ? ' es-discreta' : ''}`} {...eventos}>
      {deEstaVista.map(v => {
        const c = caja(v.zona);
        if (!c) return null;
        const otraVersion = v.version_number && v.version_vigente && v.version_number !== v.version_vigente;
        return (
          <button key={v.id} type="button" style={c}
            className={`sustento-zona${elegido === v.id ? ' es-elegida' : ''}${otraVersion ? ' es-otra-version' : ''}`}
            title={`${v.item} · ${cantidadLegible(v.cantidad, v.unidad)}${otraVersion ? ` · medida sobre la V${v.version_number}` : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onElegir?.(v.id); }}>
            <b>{v.item}{typeof v.cantidad === 'number' ? ` · ${cantidadLegible(v.cantidad, v.unidad)}` : ''}</b>
          </button>
        );
      })}
      {(enCurso || cajaBorrador) && <div className="sustento-zona es-borrador" style={enCurso || cajaBorrador} />}
    </div>
  );
}

export function PanelDeSustento({ vinculos = [], abierto, onCerrar, dibujando, onDibujar, borrador,
                                  onDescartar, onGuardar, elegido, onElegir, onRetirar,
                                  desdePlanilla = null, onVolverAPlanilla, onAbrirPlanilla }) {
  // Llegando desde la planilla, el ítem y lo que falta por sustentar ya vienen escritos.
  const [form, setForm] = useState(() => ({
    item: desdePlanilla?.item || '', cantidad: desdePlanilla?.cantidad || '', unidad: desdePlanilla?.unidad || 'm3', nota: '',
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  if (!abierto) return null;

  const guardar = async () => {
    setGuardando(true); setError('');
    const r = await onGuardar({ ...form, item: form.item.trim() });
    setGuardando(false);
    if (r.ok) { setForm(f => ({ ...f, item: '', cantidad: '', nota: '' })); toast.success('Vínculo guardado'); }
    else setError(r.error);
  };

  return (
    <aside className="sustento-panel" aria-label="Sustento de metrados de este plano">
      <header>
        <span>Metrados · lo que sale de este plano</span>
        <button type="button" className="sustento-cerrar" onClick={onCerrar} aria-label="Cerrar el panel">✕</button>
      </header>

      {desdePlanilla && (
        <div className="sustento-origen">
          <span>Desde la planilla · <b>{desdePlanilla.item}</b>{dibujando ? ' · marca la zona en el plano' : ''}</span>
          {onVolverAPlanilla && <button type="button" onClick={onVolverAPlanilla}>Volver a la planilla ›</button>}
        </div>
      )}

      <div className="sustento-lista">
        {!vinculos.length && !borrador && (
          <p className="sustento-vacio">Ninguna partida se sustenta todavía en este plano.</p>
        )}
        {vinculos.map(v => {
          const aviso = avisoDeVersion(v);
          return (
            <div key={v.id} className={`sustento-fila${elegido === v.id ? ' es-elegida' : ''}`}
              role="button" tabIndex={0} onClick={() => onElegir(v.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') onElegir(v.id); }}>
              <div className="sustento-fila__l1">
                <span className="sustento-item">{v.item}</span>
                <span className="sustento-q">{cantidadLegible(v.cantidad, v.unidad)}</span>
              </div>
              <div className="sustento-fila__l3">
                <span>{v.vista_nombre || (v.vista ? 'vista del dibujo' : `pág. ${v.pagina}`)} · V{v.version_number} · {v.autor || '—'}</span>
                <span className="sustento-acciones">
                  {v.planilla_node_id && onAbrirPlanilla && (
                    <button type="button" className="sustento-planilla" title="Abrir la planilla en esta partida"
                      onClick={(e) => { e.stopPropagation(); onAbrirPlanilla(v); }}>Planilla ›</button>
                  )}
                  {v.mio && <button type="button" className="sustento-retirar"
                    onClick={(e) => { e.stopPropagation(); onRetirar(v); }}>Retirar</button>}
                </span>
              </div>
              {v.nota && <div className="sustento-nota">{v.nota}</div>}
              {aviso && <div className="sustento-aviso">{aviso}</div>}
            </div>
          );
        })}
      </div>

      {borrador ? (
        <div className="sustento-form">
          <div className="sustento-form__t">Zona nueva · ¿qué partida sustenta?</div>
          <label>Ítem<input value={form.item} placeholder="02.01.03" autoFocus
            onChange={e => setForm(f => ({ ...f, item: e.target.value }))} /></label>
          <div className="sustento-form__par">
            <label>Cantidad<input value={form.cantidad} inputMode="decimal" placeholder="30.10"
              aria-invalid={String(form.cantidad).trim() !== '' && numeroDe(form.cantidad) == null}
              onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} /></label>
            <label>Unidad<input value={form.unidad}
              onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} /></label>
          </div>
          <label>Nota<input value={form.nota} placeholder="eje, tramo, elemento…"
            onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} /></label>
          {String(form.cantidad).trim() !== '' && (
            <div className="sustento-leida" aria-live="polite">
              {numeroDe(form.cantidad) == null ? 'No es un número.' : `Se guarda: ${cantidadLegible(numeroDe(form.cantidad), form.unidad.trim())}`}
            </div>
          )}
          {error && <div className="sustento-error" role="alert">{error}</div>}
          <div className="sustento-form__pie">
            <button type="button" onClick={onDescartar}>Descartar</button>
            <button type="button" className="es-principal" disabled={guardando || !form.item.trim() || (String(form.cantidad).trim() !== '' && numeroDe(form.cantidad) == null)} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar vínculo'}</button>
          </div>
        </div>
      ) : (
        <div className="sustento-pie">
          <button type="button" className={dibujando ? '' : 'es-principal'} onClick={onDibujar}>
            {dibujando ? 'Cancelar · no dibujar' : '+ Vincular una zona'}
          </button>
          {dibujando && <span className="sustento-ayuda">Arrastra sobre el plano para marcar la zona.</span>}
        </div>
      )}
    </aside>
  );
}
