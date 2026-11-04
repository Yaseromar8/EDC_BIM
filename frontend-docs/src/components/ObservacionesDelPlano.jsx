/**
 * ObservacionesDelPlano — UNA observación para el plano entero (2-nov-2026, docs/archivos/18 y 19).
 *
 * En un plano se dibujan varias marcas; lo que se gestiona es una sola observación con responsable, estado y fecha
 * límite que las agrupa (o el plano entero, sin marcas). Es la misma incidencia que en cualquier otra herramienta
 * (doc_issues, tipo «Observación de documento») y se crea y se trabaja en el MISMO panel lateral que en todas
 * (design/incidencias/PanelDeIncidencia.jsx). Lo propio del plano es esta lista, y elegir sus marcas al crearla.
 *
 *   GET  /api/pdf/planos/<plano>/observacion          las del plano (un borrador ajeno no se ve)
 *   POST /api/pdf/planos/<plano>/observacion          levantarla (o `borrador: true`), con sus marcas y su pin
 *
 * EL PIN (2-nov-2026, docs/archivos/21): con la herramienta «Incidencia» se hace clic en la hoja y el panel se abre
 * ya en el alta, con ese punto; el lector lo pide con `pedido` ({ vista, pin, n }) y dibuja el pin mientras dure.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { estadoDeIssue, issueViva } from '../utils/estadosDeIssue';
import { fechaDeDia, observacionViva } from '../utils/marcasConEnlace';
import { exportarExcel, exportarPdf, filasDelInforme } from '../utils/informeDeIncidencias';
import IncidenciaLateral from './IncidenciaLateral';
import { pedirCompararNube } from './AsignacionDeNube';
import IconoModulo from './IconoModulo';
import { AISLADO, PinDeIncidencia, numeroDe } from '../../../design/incidencias/PanelDeIncidencia.jsx';

const NOMBRE_DE_TIPO = {
  foto: 'Foto', sello: 'Sello', cloud: 'Nube', arrow: 'Flecha', text: 'Texto', measure: 'Medición',
  area: 'Área', count: 'Conteo', rect: 'Rectángulo', pen: 'Trazo',
};

const Ico = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export function destinoDelLector() {
  return document.querySelector('.pdf-viewer .pdf-body') || document.querySelector('.file-viewer-content') || document.body;
}

export function textoDeMarca(m) {
  return `${NOMBRE_DE_TIPO[m.kind] || 'Marca'} · pág. ${m.page}${m.text ? ` · ${String(m.text).slice(0, 40)}` : ''}`;
}

/** Las marcas de la versión que entran en la observación (las que no están ya en otra abierta, por defecto). */
function MarcasDeLaVersion({ version, marcas, elegidas, setElegidas }) {
  const libres = marcas.filter(m => !observacionViva(m.observacion));
  const todas = libres.length > 0 && libres.every(m => elegidas.has(m.id));
  const cambiar = (id) => setElegidas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="pinc-campo obp-marcas">
      <span className="pinc-campo__cab">
        Marcas de la {version?.numero ? `V${version.numero}` : 'versión'}
        {libres.length > 1 && (
          <button type="button" className="pinc-enlace"
            onClick={() => setElegidas(todas ? new Set() : new Set(libres.map(m => m.id)))}>{todas ? 'Ninguna' : 'Todas'}</button>
        )}
      </span>
      {marcas.length === 0 && <small>Sin marcas: la observación será del plano entero.</small>}
      <ul>
        {marcas.map(m => {
          const ocupada = observacionViva(m.observacion);
          return (
            <li key={m.id}>
              <label className={ocupada ? 'es-ocupada' : ''}>
                <input type="checkbox" disabled={ocupada} checked={!ocupada && elegidas.has(m.id)} onChange={() => cambiar(m.id)} />
                <i style={{ background: m.style?.color || '#d97757' }} />
                <span>{textoDeMarca(m)}</span>
                {ocupada && <small>{m.observacion.codigo}</small>}
              </label>
            </li>
          );
        })}
      </ul>
      {marcas.length > 0 && elegidas.size === 0 && <small>Ninguna marca elegida: la observación será del plano entero.</small>}
      <small>Tus marcas que aún son borrador se publican al enviarla, para que el responsable las vea.</small>
    </div>
  );
}

function FilaDelPlano({ o, onAbrir }) {
  const e = estadoDeIssue(o.estado);
  const n = (o.marcas || []).length;
  return (
    <li>
      <button type="button" className="obp-fila" onClick={onAbrir}>
        <span className="obp-fila__cab">
          <PinDeIncidencia color={e.color} tamano={20} numero={numeroDe(o.codigo)} />
          <span className="mce-obs-estado" style={{ '--estado': e.color }}><i />{e.etiqueta}</span>
          <b>{o.codigo}</b>
          {o.vencida && <span className="mce-obs-vencida">Vencida</span>}
        </span>
        <span className="obp-fila__tit">{o.titulo}</span>
        <small>
          {[o.responsable, o.vence_en ? fechaDeDia(o.vence_en) : null, o.version_numero ? `V${o.version_numero}` : null,
            o.pin ? `pág. ${o.pin.pagina}` : null,
            n ? `${n} marca${n === 1 ? '' : 's'}` : (o.pin ? null : 'plano entero')].filter(Boolean).join(' · ')}
        </small>
      </button>
    </li>
  );
}

export default function ObservacionesDelPlano({ API, obra, nodeId, nombre = '', version, marcas = [], pedido = null,
  onCambio, onIrAMarca, onIrAPin, onPinPendiente, onAbierta, onCerrar }) {
  const [lista, setLista] = useState(null);
  const [vista, setVista] = useState(pedido?.vista ?? 'lista');   // 'lista' | 'nueva' | id de una observación
  const [pin, setPin] = useState(pedido?.pin || null);             // el punto de la hoja de la que se levanta
  // La nube en la que se abre (desde «Mi trabajo»), atada a SU incidencia: abrir otra de la lista no la arrastra.
  const [nubePedida, setNubePedida] = useState(pedido?.nube != null ? { vista: pedido.vista, nube: pedido.nube } : null);
  const libres = useMemo(() => marcas.filter(m => !observacionViva(m.observacion)), [marcas]);
  // Con pin se señala UN sitio: no se le cuelgan todas las marcas libres por defecto.
  const [elegidas, setElegidas] = useState(() => new Set(pedido?.pin ? [] : libres.map(m => m.id)));
  // Un pedido nuevo del lector (otro clic con «Incidencia», o un pin de la hoja) manda sobre lo que se mostraba.
  useEffect(() => {
    if (!pedido) return;
    setVista(pedido.vista);
    setPin(pedido.pin || null);
    setNubePedida(pedido.nube != null ? { vista: pedido.vista, nube: pedido.nube } : null);
    if (pedido.vista === 'nueva') setElegidas(new Set(pedido.pin ? [] : libres.map(m => m.id)));
  }, [pedido?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // El pin fantasma de la hoja dura lo que dura el alta.
  useEffect(() => { onPinPendiente?.(vista === 'nueva' ? pin : null); }, [vista, pin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onAbierta?.(vista === 'lista' || vista === 'nueva' ? null : vista); }, [vista]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/api/pdf/planos/${nodeId}/observacion`);
      const d = await r.json().catch(() => ({}));
      setLista(r.ok && d.success ? d.observaciones || [] : []);
    } catch { setLista([]); }
  }, [API, nodeId]);
  useEffect(() => { cargar(); }, [cargar]);

  const porId = useMemo(() => new Map(marcas.map(m => [String(m.id), m])), [marcas]);
  const informe = async (formato) => {
    const filas = filasDelInforme(lista || [], {});
    if (!filas.filas.length) { toast.error('Este plano no tiene observaciones.'); return; }
    const titulo = `Observaciones ${nombre || 'del plano'}`;
    try {
      if (formato === 'xlsx') await exportarExcel(titulo, filas);
      else await exportarPdf(titulo, version?.numero ? `Plano · vigente V${version.numero}` : 'Plano', filas);
    } catch (e) { toast.error(`No se pudo exportar: ${e.message}`); }
  };

  // Crearla con sus marcas: la ruta del plano, que fija la versión y comprueba que las marcas son de ella.
  const crearDelPlano = async (cuerpo) => {
    const r = await apiFetch(`${API}/api/pdf/planos/${nodeId}/observacion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cuerpo, version_id: version?.id || undefined, marcas: [...elegidas], ...(pin ? { pin } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo crear.');
    return d.observacion;
  };

  const tras = () => { cargar(); onCambio?.(); };

  if (vista !== 'lista') {
    return (
      <IncidenciaLateral API={API} obra={obra} contenedor={destinoDelLector()} onVolver={() => setVista('lista')}
        issueId={vista === 'nueva' ? null : vista}
        nueva={vista === 'nueva' ? { tipo: 'OBSERVACION', lugar: [nombre, version?.numero ? `V${version.numero}` : null].filter(Boolean).join(' · ') } : null}
        titulo={pin ? 'Nueva incidencia' : 'Nueva incidencia del plano'}
        crear={crearDelPlano}
        onIrAMarca={(id) => { const m = porId.get(String(id)); if (m) onIrAMarca?.(m); }}
        onCompararNube={pedirCompararNube}
        nube={nubePedida && String(nubePedida.vista) === String(vista) ? nubePedida.nube : null}
        extraAlta={<>
          {pin && (
            <div className="pinc-campo">
              <span className="pinc-campo__cab">Pin en la hoja
                <button type="button" className="pinc-enlace" onClick={() => setPin(null)}>Quitar</button></span>
              <small>Página {pin.pagina}: el pin queda donde hiciste clic.</small>
            </div>
          )}
          <MarcasDeLaVersion version={version} marcas={marcas} elegidas={elegidas} setElegidas={setElegidas} />
        </>}
        extraDetalle={(i) => {
          const ids = (i.evidencia || []).filter(e => e && e.tipo === 'marca' && e.marca != null).map(e => e.marca);
          const suPin = ((i.evidencia || []).find(e => e && e.tipo === 'plano') || {}).pin;
          const irAlPin = suPin ? (
            <dl className="pinc-filas">
              <div className="pinc-fila">
                <dt>Pin</dt>
                <dd><span className="pinc-valor pinc-valor--fijo">Página {suPin.pagina}</span>
                  <button type="button" className="pinc-anadir" onClick={() => onIrAPin?.(suPin)}>Ver en el plano</button></dd>
              </div>
            </dl>
          ) : null;
          if (!ids.length) return irAlPin || (i.origen_tipo === 'PLANO' ? <p className="pinc-nota">Observación del plano entero.</p> : null);
          return (
            <div className="pinc-campo">
              {irAlPin}
              <span>Marcas</span>
              <ul className="pinc-adjuntos">
                {ids.map(id => {
                  const m = porId.get(String(id));
                  return (
                    <li key={id}>
                      {m ? <button type="button" className="pinc-cita" onClick={() => onIrAMarca?.(m)}>{textoDeMarca(m)}</button>
                        : <span className="pinc-nota">Marca de otra versión</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }}
        onCreada={(hecha) => { tras(); if (hecha?.id) { setPin(null); setVista(hecha.id); } }}
        onCambio={tras} onCerrar={onCerrar} />
    );
  }

  const vivas = (lista || []).filter(o => issueViva(o) || o.estado === 'Borrador');
  const cerradas = (lista || []).filter(o => !(issueViva(o) || o.estado === 'Borrador'));

  return createPortal(
    <aside className="mce-panel" aria-label="Observaciones del plano" {...AISLADO}>
      <header className="mce-panel__cab">
        <span className="mce-panel__ico"><IconoModulo nombre="incidencia" tamano={20} /></span>
        <div className="mce-panel__tit">
          <b>Incidencias del plano</b>
          <small>{vivas.length ? `${vivas.length} sin cerrar` : 'Ninguna sin cerrar'}{version?.numero ? ` · vigente V${version.numero}` : ''}</small>
        </div>
        <button type="button" className="mce-icono" onClick={onCerrar} aria-label="Cerrar">
          <Ico><path d="M6 6l12 12M18 6 6 18" /></Ico>
        </button>
      </header>

      <div className="mce-panel__cuerpo">
        <section className="mce-sec">
          <p className="mce-vacio">Con la herramienta «Incidencia» (I) haz clic donde está el problema: queda un pin en la
            hoja. O levanta una para el plano entero, con las marcas que elijas de esta versión.</p>
          <div className="mce-acciones">
            <button type="button" className="mce-btn mce-btn--prim"
              onClick={() => { setPin(null); setElegidas(new Set(libres.map(m => m.id))); setVista('nueva'); }}>
              Nueva incidencia del plano</button>
            {(lista || []).length > 0 && (
              <>
                <button type="button" className="mce-btn mce-btn--sec" onClick={() => informe('pdf')}>Informe PDF</button>
                <button type="button" className="mce-btn mce-btn--sec" onClick={() => informe('xlsx')}>Excel</button>
              </>
            )}
          </div>
        </section>
        <section className="mce-sec">
          <h3>Sin cerrar <span>{vivas.length}</span></h3>
          {lista === null ? <p className="mce-vacio">Cargando…</p>
            : vivas.length === 0 ? <p className="mce-vacio">Ninguna.</p>
              : <ul className="obp-lista">{vivas.map(o => <FilaDelPlano key={o.id} o={o} onAbrir={() => setVista(o.id)} />)}</ul>}
        </section>
        {cerradas.length > 0 && (
          <section className="mce-sec">
            <h3>Cerradas <span>{cerradas.length}</span></h3>
            <ul className="obp-lista">{cerradas.map(o => <FilaDelPlano key={o.id} o={o} onAbrir={() => setVista(o.id)} />)}</ul>
          </section>
        )}
      </div>
    </aside>,
    destinoDelLector(),
  );
}
