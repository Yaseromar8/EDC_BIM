import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { letraDeColumna, columnaClave, buscarFilas, escribirAncla, filaDeClave, motivoSiNoEsPlanilla } from '../utils/lectorDeTablas';
import { porItem, cuadre, columnaMetrado, columnaUnidad, mismaUnidad, columnasConNombre, numeroDe, avisoDeVersion, cantidadLegible,
  conCircuito, filaDeLaDireccion, sinCircuito } from '../utils/sustento';
import SelectorDeDocumento from './SelectorDeDocumento';
import { conArchivos, leerEnlaceDeArchivos } from '../utils/enlacesDeArchivos';
import { useSustento } from '../hooks/useSustento';
import './LectorDeTabla.css';

/**
 * EL MODO TABLA DEL LECTOR (ESTANDAR_LDA.md §5; LECTOR_ALEPHIA_ESTANDAR.md §20).
 *
 * Una planilla se lee como TABLA y en el propio lector, no en el visor de Office: así ALEPHIA sabe qué
 * hay en cada fila. Un Excel se ve como Excel por defecto; esta vista la pide el conmutador del cajetín,
 * o sale sola si la planilla ya sustenta algún plano (DocumentViewer, «Excel o planilla»). Las hojas van abajo, como en Excel; la columna CLAVE (el ítem) se reconoce sola y se
 * marca; al elegir una fila se ve y se copia su ANCLA (`lda:…#hoja=…&clave=…`), que sigue valiendo
 * aunque el Excel se actualice, porque va por la clave y no por el número de fila.
 *
 * Se lee en el navegador con SheetJS (el mismo que usa Partidas); el archivo no sale de aquí.
 */

const TOPE_FILAS = 2000;

export default function LectorDeTabla({ url, cargando = false, codigo = '', version = null, API = '', nodeId = null,
                                       nombre = '',
                                       projectPrefix = '' }) {
  const [libro, setLibro] = useState(null);
  const [error, setError] = useState('');
  const [hoja, setHoja] = useState('');
  const [consulta, setConsulta] = useState('');
  const [elegida, setElegida] = useState(null);
  const tablaRef = useRef(null);
  // EL SUSTENTO DE CADA PARTIDA (ESTANDAR_LDA §6): las zonas de planos de la obra que sustentan cada
  // ítem. La llave es el ítem, así que vale aunque el Excel se actualice. Sin la ruta, no se enseña.
  const sustento = useSustento(API, nodeId, 'obra');
  // «+ Vincular un plano»: el selector del expediente, para la fila elegida.
  const [eligiendoPlano, setEligiendoPlano] = useState(false);
  // La columna del METRADO contra la que se cuadra: se reconoce sola, pero una planilla real puede
  // tener varias (MTO DISEÑO, LA MALA, LA BUENA…) y la decide quien la lee. Se recuerda por planilla y
  // hoja en este navegador.
  const [metradoElegido, setMetradoElegido] = useState({});

  useEffect(() => {
    if (!url) return undefined;
    let vivo = true;
    // Cada archivo monta su propio lector (key = url en DocumentViewer): no hay estado viejo que limpiar.
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(buf => {
        if (!vivo) return;
        // Antes de leer, ¿es de verdad una planilla? SheetJS «lee» también un PDF y daría filas de basura.
        const motivo = motivoSiNoEsPlanilla(new Uint8Array(buf.slice(0, 512)), nombre || codigo + '.xlsx');
        if (motivo) { setError(motivo); return; }
        const lb = XLSX.read(buf, { type: 'array', cellDates: true });
        setLibro(lb);
        let hojaInicial = lb.SheetNames[0] || '';
        const pedida = filaDeLaDireccion(window.location.search);
        const esEsta = new URLSearchParams(window.location.search).get('documento') === String(nodeId);
        if (pedida && esEsta) {
          for (const nombre of lb.SheetNames) {
            const fs = XLSX.utils.sheet_to_json(lb.Sheets[nombre], { header: 1, defval: '', raw: false, blankrows: true });
            const k = columnaClave(fs);
            const i = k ? filaDeClave(fs, k.columna, pedida) : -1;
            if (i >= 0) {
              hojaInicial = nombre;
              setElegida(i);
              requestAnimationFrame(() => requestAnimationFrame(() => {
                tablaRef.current?.querySelector(`[data-fila="${i}"]`)?.scrollIntoView({ block: 'center' });
              }));
              break;
            }
          }
          window.history.replaceState(window.history.state, '',
            window.location.pathname + sinCircuito(window.location.search) + window.location.hash);
        }
        setHoja(hojaInicial);
      })
      .catch(e => { if (vivo) setError(e.message || 'No se pudo leer la planilla'); });
    return () => { vivo = false; };
  }, [url, nodeId, nombre, codigo]);

  const filas = useMemo(() => {
    const ws = libro && hoja ? libro.Sheets[hoja] : null;
    return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true }) : [];
  }, [libro, hoja]);
  // Los valores CRUDOS de las mismas celdas (mismas filas: mismas opciones salvo `raw`). El metrado se toma de
  // aquí cuando la celda es un número: el texto con formato («9,490» con `#,##0`) es ambiguo; el número, no.
  const crudas = useMemo(() => {
    const ws = libro && hoja ? libro.Sheets[hoja] : null;
    return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true }) : [];
  }, [libro, hoja]);
  const metradoDe = (i) => {
    if (colMetrado == null || i == null) return null;
    const c = (crudas[i] || [])[colMetrado];
    return typeof c === 'number' && Number.isFinite(c) ? c : numeroDe((filas[i] || [])[colMetrado]);
  };

  const ancho = useMemo(() => filas.reduce((m, f) => Math.max(m, (f || []).length), 0), [filas]);
  const clave = useMemo(() => columnaClave(filas), [filas]);
  const resultados = useMemo(() => buscarFilas(filas, consulta, clave?.columna ?? null), [filas, consulta, clave]);
  const visibles = filas.length > TOPE_FILAS ? filas.slice(0, TOPE_FILAS) : filas;
  const colMetradoDetectada = useMemo(() => columnaMetrado(filas, clave?.filaCabecera ?? null), [filas, clave]);
  const colUnidad = useMemo(() => columnaUnidad(filas, clave?.filaCabecera ?? null), [filas, clave]);
  const claveMetrado = `lda.metrado.${nodeId}.${hoja}`;
  const metradoGuardado = (() => {
    try { const v = localStorage.getItem(claveMetrado); return v === null ? null : Number(v); } catch { return null; }
  })();
  // «— sin columna —» es una elección (-1), no la ausencia de elección: con null se volvía a la detectada.
  const colElegida = metradoElegido[hoja] ?? metradoGuardado ?? colMetradoDetectada;
  const colMetrado = colElegida === -1 ? null : colElegida;
  const elegirMetrado = (valor) => {
    const n = valor === '' ? -1 : Number(valor);
    setMetradoElegido(m => ({ ...m, [hoja]: n }));
    try { localStorage.setItem(claveMetrado, String(n)); } catch { /* sin almacenamiento */ }
  };
  const columnasDeCabecera = useMemo(() => columnasConNombre(filas, clave?.filaCabecera ?? null), [filas, clave]);
  const deItem = useMemo(() => porItem(sustento.vinculos), [sustento.vinculos]);
  const conSustento = sustento.disponible && !!clave;
  const cuadreDeFila = (fila, i) => {
    const item = String((fila || [])[clave.columna] ?? '').trim();
    const vs = deItem[item] || [];
    // Sumar m3 con km no es cuadrar: si alguna zona trae otra unidad que la fila, se avisa y no se da por buena.
    const unidadFila = colUnidad != null ? String((fila || [])[colUnidad] ?? '').trim() : '';
    const otraUnidad = vs.find(v => !mismaUnidad(v.unidad, unidadFila))?.unidad || '';
    return { item, vs, unidadFila, otraUnidad, ...cuadre(vs, metradoDe(i)) };
  };
  const obraDeLaDireccion = () =>
    leerEnlaceDeArchivos(window.location.search)?.obra || new URLSearchParams(window.location.search).get('obra');

  // «+ Vincular un plano»: abre el plano elegido con la intención en la dirección (ítem, lo que falta por
  // sustentar y esta planilla), en la pestaña del plano. Allí se dibuja la zona; el vínculo vuelve aquí.
  const vincularPlano = (plano) => {
    setEligiendoPlano(false);
    const obra = obraDeLaDireccion();
    if (!obra || !plano?.file_node_id) { toast.error('No se pudo abrir el plano.'); return; }
    const q = cuadreDeFila(filas[elegida], elegida);
    const base = conArchivos(window.location.search, { obra, documento: plano.file_node_id });
    window.open(window.location.pathname + conCircuito(base, {
      // Lo que falta por sustentar; y si aún no hay ninguna zona, el metrado entero de la fila.
      vincular: valorClave, planilla: nodeId,
      cantidad: q.estado === 'falta' ? String(q.diferencia)
        : q.estado === 'sin-sustento' && metradoDe(elegida) != null ? String(metradoDe(elegida)) : '',
      // La unidad de la fila (km, m3, kg…), para que el plano no proponga otra.
      unidad: colUnidad != null ? String((filas[elegida] || [])[colUnidad] ?? '').trim() : '',
    }), 'lda-plano');
  };

  // Abre el plano VIGENTE en otra pestaña (el enlace de Archivos). Si la zona se midió en una versión
  // anterior, allí se ve en ámbar con su aviso: el revisor llega a lo que vale hoy, no a lo sustituido.
  const abrirPlano = (v) => {
    const obra = obraDeLaDireccion();
    if (!obra) { toast.error('No se pudo saber la obra para abrir el plano.'); return; }
    // En un DWG, en la presentación donde se marcó la zona.
    window.open(window.location.pathname + conCircuito(sinCircuito(conArchivos(window.location.search,
      { obra, documento: v.file_node_id })), { vista: v.vista || '' }), 'lda-plano');
  };

  // Al buscar, la primera coincidencia se elige y se trae a la vista.
  const alBuscar = (v) => {
    setConsulta(v);
    const r = buscarFilas(filas, v, clave?.columna ?? null);
    if (!r.length) return;
    setElegida(r[0]);
    requestAnimationFrame(() => {
      tablaRef.current?.querySelector(`[data-fila="${r[0]}"]`)?.scrollIntoView({ block: 'center' });
    });
  };

  const valorClave = elegida != null && clave ? String((filas[elegida] || [])[clave.columna] ?? '').trim() : '';
  const ancla = valorClave ? escribirAncla({ codigo, version, selector: { hoja, clave: valorClave } }) : '';

  const copiarAncla = () => {
    try { navigator.clipboard.writeText(ancla); toast.success('Ancla copiada'); }
    catch { toast.error('No se pudo copiar'); }
  };

  if (cargando || (!libro && !error)) {
    return <div className="tabla-lda__estado" role="status">Leyendo la planilla…</div>;
  }
  if (error) {
    return (
      <div className="tabla-lda__estado" role="alert">
        {/^El archivo que llegó/.test(error) ? error : `No se pudo leer la planilla (${error}). Puedes descargarla y abrirla en Excel.`}
      </div>
    );
  }

  return (
    <div className="tabla-lda">
      <div className="tabla-lda__barra">
        <input className="tabla-lda__buscar" type="search" value={consulta}
          placeholder={clave ? 'Buscar un ítem (02.01.03) o un texto…' : 'Buscar en la hoja…'}
          aria-label="Buscar en la planilla" onChange={e => alBuscar(e.target.value)} />
        <span className="tabla-lda__cuenta">
          {consulta.trim().length >= 2 ? (resultados.length ? `${resultados.length} filas` : 'Sin resultados') : ''}
        </span>
        {conSustento && columnasDeCabecera.length > 0 && (
          <label className="tabla-lda__metrado" title="La columna contra la que se cuadra el sustento de cada partida">
            Metrado:
            <select value={colMetrado ?? ''} onChange={e => elegirMetrado(e.target.value)}>
              <option value="">— sin columna —</option>
              {columnasDeCabecera.map(c => <option key={c.col} value={c.col}>{letraDeColumna(c.col)} · {c.nombre}</option>)}
            </select>
          </label>
        )}
        <span className="tabla-lda__clave">
          {clave ? <>Columna clave: <b>{letraDeColumna(clave.columna)}</b>
            {clave.filaCabecera != null && <> · «{String((filas[clave.filaCabecera] || [])[clave.columna] ?? '')}»</>}</>
            : 'Sin columna clave reconocida'}
        </span>
      </div>

      <div className="tabla-lda__rejilla" ref={tablaRef}>
        <table>
          <thead>
            <tr>
              <th className="tabla-lda__num" aria-label="Fila" />
              {Array.from({ length: ancho }, (_, c) => (
                <th key={c} className={clave?.columna === c ? 'es-clave' : undefined}>{letraDeColumna(c)}</th>
              ))}
              {conSustento && <th className="tabla-lda__sus">Sustento en planos</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila, i) => (
              <tr key={i} data-fila={i}
                className={`${i === clave?.filaCabecera ? 'es-cabecera' : ''}${i === elegida ? ' es-elegida' : ''}`}
                onClick={() => setElegida(i)}>
                <td className="tabla-lda__num">{i + 1}</td>
                {Array.from({ length: ancho }, (_, c) => (
                  <td key={c} className={clave?.columna === c ? 'es-clave' : undefined}>{String((fila || [])[c] ?? '')}</td>
                ))}
                {conSustento && (() => {
                  if (i === clave.filaCabecera) return <td className="tabla-lda__sus" />;
                  const q = cuadreDeFila(fila, i);
                  if (!q.item || !/^\d/.test(q.item)) return <td className="tabla-lda__sus" />;
                  // Una fila de título (02.01 CONCRETO) no tiene metrado: no se le pide sustento.
                  if (!q.vs.length) return <td className="tabla-lda__sus">{q.estado !== 'sin-sustento' || metradoDe(i) == null ? null : <span className="sus-sin">sin sustento</span>}</td>;
                  return (
                    <td className="tabla-lda__sus">
                      <span className={`sus-chip sus-${q.otraUnidad ? 'sobra' : q.estado}`}>
                        {q.vs.length} {q.vs.length === 1 ? 'zona' : 'zonas'} · {cantidadLegible(q.suma, q.vs[0].unidad)}
                        {q.otraUnidad ? ` · unidad distinta (${q.otraUnidad} ≠ ${q.unidadFila})`
                          : q.estado === 'cuadra' ? ' · cuadra' : q.estado === 'falta' ? ` · faltan ${cantidadLegible(q.diferencia, q.vs[0].unidad)}`
                          : q.estado === 'sobra' ? ` · sobran ${cantidadLegible(-q.diferencia, q.vs[0].unidad)}` : ''}
                      </span>
                      {q.vs.some(v => avisoDeVersion(v)) && <span className="sus-chip sus-version" title="Alguna zona se midió sobre una versión anterior del plano">revisar versión</span>}
                    </td>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length > TOPE_FILAS && (
          <div className="tabla-lda__tope">Se muestran las primeras {TOPE_FILAS.toLocaleString('es-PE')} de {filas.length.toLocaleString('es-PE')} filas. Usa «Buscar» para llegar al resto.</div>
        )}
      </div>

      {elegida != null && (
        <div className="tabla-lda__fila" role="status">
          <span>Fila <b>{elegida + 1}</b> de la hoja «{hoja}»</span>
          {valorClave
            ? <><span>· ítem <b>{valorClave}</b></span>
                <code title="Dirección de esta fila según el estándar LDA">{ancla}</code>
                <button type="button" onClick={copiarAncla}>Copiar ancla</button></>
            : <span className="tabla-lda__sin">· esta fila no tiene ítem: no se puede anclar</span>}
        </div>
      )}

      {conSustento && elegida != null && valorClave && (() => {
        const q = cuadreDeFila(filas[elegida], elegida);
        return (
          <div className="tabla-lda__sustento">
            <span className="tabla-lda__rot">Sustento de {valorClave}</span>
            {!q.vs.length && <span className="tabla-lda__sin">Ningún plano sustenta esta partida todavía.</span>}
            {q.vs.map(v => (
              <button key={v.id} type="button" className={`sus-plano${avisoDeVersion(v) ? ' sus-version' : ''}`}
                title={avisoDeVersion(v) || 'Abrir el plano vigente'} onClick={() => abrirPlano(v)}>
                ▸ {v.plano.replace(/\.[^.]+$/, '')}{v.vista_nombre ? ` · ${v.vista_nombre}` : ''} · V{v.version_number} · {cantidadLegible(v.cantidad, v.unidad)}
              </button>
            ))}
            {q.vs.length > 0 && (
              <span className={`sus-cuadre sus-${q.estado}`}>
                Suma {cantidadLegible(q.suma, q.vs[0].unidad)}
                {q.estado === 'cuadra' ? ' · cuadra con la planilla'
                  : q.estado === 'falta' ? ` · la planilla dice ${cantidadLegible(q.suma + q.diferencia, q.vs[0].unidad)}: faltan ${cantidadLegible(q.diferencia, q.vs[0].unidad)}`
                  : q.estado === 'sobra' ? ` · la planilla dice ${cantidadLegible(q.suma + q.diferencia, q.vs[0].unidad)}: sobran ${cantidadLegible(-q.diferencia, q.vs[0].unidad)}`
                  : ' · la fila no tiene metrado'}
              </span>
            )}
            <button type="button" className="sus-vincular" onClick={() => setEligiendoPlano(true)}
              title="Elegir el plano y marcar en él la zona que sustenta esta partida">+ Vincular un plano</button>
          </div>
        );
      })()}

      {eligiendoPlano && (
        <SelectorDeDocumento API={API} project={{ id: projectPrefix, model_urn: projectPrefix }}
          titulo={`¿Qué plano sustenta ${valorClave}?`}
          ayuda="Elige el plano. Se abrirá en otra pestaña, listo para marcar la zona."
          onElegir={vincularPlano} onCerrar={() => setEligiendoPlano(false)} />
      )}

      <div className="tabla-lda__hojas" role="tablist" aria-label="Hojas de la planilla">
        {libro.SheetNames.map(n => (
          <button key={n} role="tab" aria-selected={n === hoja}
            onClick={() => { setHoja(n); setElegida(null); setConsulta(''); }}>{n}</button>
        ))}
        <span className="tabla-lda__pie">{filas.length.toLocaleString('es-PE')} filas · {ancho} columnas</span>
      </div>
    </div>
  );
}
