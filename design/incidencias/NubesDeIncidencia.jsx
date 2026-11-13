/**
 * LAS NUBES DE UNA INCIDENCIA (3-nov-2026, docs/archivos/23 y 24). La pestaña «Nubes» del panel de la incidencia.
 *
 * Cada marca de la incidencia es una nube. El encargado del plano la asigna a una persona o a una empresa con lo que
 * pide; quien la tiene entrega EN ESA NUBE (documentos de Docs, subidos aquí o enlazados, y notas); el encargado acepta
 * o la devuelve en la misma nube, que abre otra ronda; y cuando hay versión corregida, el revisor dice si quedó
 * levantada. Nada de eso lo decide la pantalla: `/api/issues/<id>/nubes` dice qué actos puede dar cada uno y aquí
 * solo se enseñan esos.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { enviarJson } from './piezas.jsx';
import { colorDeIndice, iniciales } from './reglas.js';
import { botonDeRespuesta, avisoDeRespuesta, rotuloDeRespondida } from './respuestaDeNube.js';

// Las fechas del historial ya traen su zona; las de la base no (UTC sin zona): igual que en el panel.
function fechaCorta(iso) {
  const s = String(iso || '');
  const d = s ? new Date(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}Z` : s) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

const TIPO_DE_MARCA = { cloud: 'Nube', rect: 'Recuadro', ellipse: 'Elipse', arrow: 'Flecha', line: 'Línea', text: 'Texto',
  freehand: 'Trazo', highlight: 'Resaltado', callout: 'Llamada', polygon: 'Polígono', stamp: 'Sello', photo: 'Foto' };

// El tono del estado de la nube: gris mientras espera, rojo si volvió o no quedó, verde si se aceptó o levantó.
const TONO = { devuelta: 'es-mal', no_levantada: 'es-mal', aceptada: 'es-bien', levantada: 'es-bien', entregada: 'es-entregada' };

/** «Entregado · ronda 2», «Pedida · vence el 05 nov.»… lo que se lee en la cabecera de la nube. */
function rotulo(n) {
  // Sin fechas: manda la de la incidencia (el dueño: «basta con la fecha del issue principal»).
  const r = n.ronda > 1 ? ` · ronda ${n.ronda}` : '';
  if (n.estado === 'aceptada') return `Aceptada${r}`;
  if (n.estado === 'levantada' || n.estado === 'no_levantada') {
    const v = n.verificacion?.version_number;
    return `${n.estado_etiqueta}${v ? ` en la V${v}` : ''}`;
  }
  // Respondida sin adjuntar nada («había que mover un cuadro»): se lee «Resuelta», no «Entregada» (13-nov-2026).
  return `${rotuloDeRespondida(n) || n.estado_etiqueta}${r}`;
}

/**
 * LA ENTREGA, IGUAL PARA CUALQUIER PEDIDO (4-nov-2026, el dueño: «hay casos donde se adjuntarán fotos o documentos y
 * otros donde solo se trata de mover un cuadro o borrar una descripción… profesional, estándar y escalable»): como la
 * respuesta de ACC o el «listo para revisar» de Procore, quien aporta RESPONDE qué hizo y, si hace falta, adjunta
 * (subido a la carpeta de la incidencia o enlazado de Docs). Basta una de las dos cosas; quien pidió acepta o devuelve.
 */
function Entrega({ entorno, obra, codigo, ronda, ocupado, onEntregar }) {
  const [lista, setLista] = useState([]);
  const [nota, setNota] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const fichero = useRef(null);
  const Elegir = entorno.ElegirDocumento;
  const subir = async (ficheros) => {
    for (const f of [...(ficheros || [])]) {
      setSubiendo(true);
      try {
        // A la CARPETA DE LA INCIDENCIA (D4): ahí sube quien aporta aunque solo pueda ver el plano.
        const s = await entorno.subirFoto(obra, f, `Aporte a ${codigo || 'una incidencia'}`,
          codigo ? `INCIDENCIAS/${codigo}/` : undefined);
        setLista(l => [...l, { tipo: 'documento', documento: String(s.id), nombre: s.nombre || f.name, subido: true }]);
      } catch (e) { entorno.avisar.error(`${f.name}: ${e.message}`); } finally { setSubiendo(false); }
    }
    if (fichero.current) fichero.current.value = '';
  };
  const entregas = [...lista.map(({ tipo, documento }) => ({ tipo, documento })),
    ...(nota.trim() ? [{ tipo: 'nota', texto: nota.trim() }] : [])];
  return (
    <div className="pinc-acto nub-entrega">
      <b>Responder{ronda > 1 ? ` la ronda ${ronda}` : ''}</b>
      <textarea value={nota} rows={2} maxLength={2000} onChange={e => setNota(e.target.value)} autoFocus
        placeholder="Qué se hizo" aria-label="Respuesta" />
      {lista.length > 0 && (
        <ul className="nub-entregas">
          {lista.map((e, k) => (
            <li key={`${e.documento}-${k}`} className="nub-ent">
              <span className="nub-ent__nombre">{e.nombre}</span>
              <small>{e.subido ? `subido a INCIDENCIAS/${codigo || ''}` : 'enlazado desde Docs'}</small>
              <button type="button" className="pinc-quitar" aria-label={`Quitar ${e.nombre}`}
                onClick={() => setLista(l => l.filter((_, j) => j !== k))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <input ref={fichero} type="file" multiple hidden onChange={e => subir(e.target.files)} />
      <div className="pinc-botones">
        {entorno.subirFoto && (
          <button type="button" className="pinc-btn" disabled={subiendo || ocupado} onClick={() => fichero.current?.click()}>
            {subiendo ? 'Subiendo…' : 'Adjuntar'}</button>
        )}
        {Elegir && (
          <button type="button" className="pinc-btn" disabled={subiendo || ocupado} onClick={() => setEligiendo(true)}>
            Enlazar de Docs</button>
        )}
      </div>
      <div className="pinc-botones">
        <button type="button" className="pinc-btn pinc-btn--prim" disabled={!entregas.length || subiendo || ocupado}
          onClick={() => onEntregar(entregas)}>{botonDeRespuesta(entregas)}</button>
      </div>
      {eligiendo && Elegir && createPortal(
        <Elegir obra={obra} titulo="Enlazar un documento de Docs"
          onElegir={(doc) => {
            setEligiendo(false);
            const id = String(doc.file_node_id || doc.id);
            if (lista.some(e => e.documento === id)) return;
            setLista(l => [...l, { tipo: 'documento', documento: id, nombre: doc.nombre || doc.name }]);
          }}
          onCerrar={() => setEligiendo(false)} />,
        document.fullscreenElement || document.body,
      )}
    </div>
  );
}

/** Una decisión con su motivo: devolver (falta algo) o no levantada (qué rehacer). */
function Motivo({ titulo, boton, peligro, ocupado, onHacer, onCancelar }) {
  const [texto, setTexto] = useState('');
  return (
    <div className="pinc-acto">
      <b>{titulo}</b>
      <textarea value={texto} rows={2} maxLength={2000} autoFocus onChange={e => setTexto(e.target.value)}
        placeholder="Motivo (obligatorio)" />
      <div className="pinc-botones">
        <button type="button" className={`pinc-btn ${peligro ? 'pinc-btn--peligro' : 'pinc-btn--prim'}`}
          disabled={!texto.trim() || ocupado} onClick={() => onHacer(texto.trim())}>{boton}</button>
        <button type="button" className="pinc-btn pinc-btn--plano" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function Ronda({ entorno, r, conCabecera }) {
  // Una ronda sin nada entregado no se pinta; con una sola, sin cabecera.
  if (!(r.entregas || []).length && r.decision !== 'devuelta') return null;
  return (
    <div className="nub-ronda">
      {conCabecera && <h5>Ronda {r.n}</h5>}
      {(r.entregas || []).length > 0 && (
        <ul className="nub-entregas">
          {r.entregas.map((e, k) => (
            <li key={k} className="nub-ent">
              {e.tipo === 'documento' ? (
                <>
                  <button type="button" className="pinc-cita nub-ent__nombre" onClick={() => entorno.abrirDocumento?.(e.documento)}>
                    {e.nombre || 'Documento'}</button>
                  <small>Docs</small>
                </>
              ) : <span className="nub-ent__nota">{e.texto}</span>}
            </li>
          ))}
        </ul>
      )}
      {r.entregado_por && <p className="pinc-nota">{r.entregado_por}{r.entregado_en ? ` · ${fechaCorta(r.entregado_en)}` : ''}</p>}
      {r.decision === 'devuelta' && r.motivo && (
        <p className="nub-devuelto"><b>{r.decidido_por || 'El encargado'}</b>{r.decidido_en ? ` · ${fechaCorta(r.decidido_en)}` : ''} — {r.motivo}</p>
      )}
    </div>
  );
}

function Nube({ entorno, obra, ob, i, n, numero, color, abierta, onAbrir, ocupado, hacer, onIrAMarca, onComparar }) {
  const [acto, setActo] = useState(null);
  const caja = useRef(null);
  useEffect(() => {
    if (abierta && caja.current) caja.current.scrollIntoView({ block: 'nearest' });
  }, [abierta]);
  const puede = (a) => (n.actos || []).includes(a);
  const sobre = n.id != null ? { nube: n.id } : { marca: n.markup_id };
  const dar = async (cuerpo, ok) => { if (await hacer({ ...sobre, ...cuerpo }, ok)) setActo(null); };
  const marca = n.marca || {};
  const tipo = TIPO_DE_MARCA[marca.kind] || 'Marca';
  const titulo = n.pedido || (n.estado === 'sin_asignar' ? 'Sin asignar' : `${tipo}${marca.page != null ? ` · pág. ${marca.page}` : ''}`);
  const rondas = n.rondas || [];
  // «Entregar» lo da el servidor solo a quien tiene la nube asignada y le toca (docs/archivos/25: la pantalla no decide).
  const debeEntregar = puede('entregar');
  return (
    <li ref={caja} className={`nub${abierta ? ' es-abierta' : ''}${n.clase === 'encargo' ? ' es-encargo' : ''}`}
      style={{ '--nube': color }}>
      <button type="button" className="nub-cab" aria-expanded={abierta}
        onClick={() => { onAbrir(); if (!abierta && onIrAMarca && n.markup_id != null) onIrAMarca(n.markup_id); }}>
        <span className="nub-num">{numero}</span>
        <b className={n.pedido ? undefined : 'es-vacio'}>{titulo}</b>
        {n.destino_nombre && (
          <span className="pinc-avatar pinc-avatar--chico" style={{ background: color, color: '#fff' }}
            title={`${n.destino_nombre}${n.destino_es_empresa ? ' (empresa)' : ''}`} aria-hidden="true">{iniciales(n.destino_nombre)}</span>
        )}
        {n.estado !== 'sin_asignar' && (
          <span className={`nub-estado ${TONO[n.estado] || ''}`}>{n.por_verificar && n.estado !== 'no_levantada' ? 'Por verificar' : rotulo(n)}</span>
        )}
      </button>
      {abierta && (
        <div className="nub-cuerpo">
          {/* Lo pedido ya es el título de la fila: debajo solo si no cabe entero en ella. */}
          {n.pedido && n.pedido.length > 48 && <p className="nub-pide">{n.pedido}</p>}
          {rondas.map((r, k) => <Ronda key={r.n ?? k} entorno={entorno} r={r} conCabecera={rondas.length > 1} />)}

          {n.verificacion && (
            <div className={`nub-verif ${n.estado === 'levantada' ? 'es-bien' : 'es-mal'}`}>
              <b>{n.estado === 'levantada' ? 'Levantada' : 'No levantada'}</b>
              {n.verificacion.version_number ? ` en la V${n.verificacion.version_number}` : ''}
              {n.verificacion.por ? ` · ${n.verificacion.por}` : ''}{n.verificacion.en ? ` · ${fechaCorta(n.verificacion.en)}` : ''}
              {n.verificacion.motivo && <p>{n.verificacion.motivo}</p>}
            </div>
          )}

          {acto === 'devolver' && <Motivo titulo="Devolver: falta algo" boton="Devolver" ocupado={ocupado}
            onCancelar={() => setActo(null)} onHacer={(m) => dar({ acto: 'devolver', motivo: m }, 'Devuelta: le llega de nuevo')} />}
          {acto === 'no_levantada' && <Motivo titulo="No quedó levantada" boton="No levantada" peligro ocupado={ocupado}
            onCancelar={() => setActo(null)} onHacer={(m) => dar({ acto: 'verificar', resultado: 'no_levantada', motivo: m }, 'Nube no levantada')} />}
          {acto === 'entregar' && <Entrega entorno={entorno} obra={obra} codigo={i.codigo} ronda={n.ronda} ocupado={ocupado}
            onEntregar={(entregas) => dar({ acto: 'entregar', entregas }, avisoDeRespuesta(entregas))} />}

          {!acto && (
            <div className="pinc-botones">
              {debeEntregar && <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado}
                onClick={() => setActo('entregar')}>Responder{n.ronda > 1 ? ` ronda ${n.ronda}` : ''}</button>}
              {puede('aceptar') && <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado}
                onClick={() => dar({ acto: 'aceptar' }, 'Aceptado')}>Aceptar</button>}
              {puede('devolver') && <button type="button" className="pinc-btn" disabled={ocupado}
                onClick={() => setActo('devolver')}>Devolver</button>}
              {puede('verificar') && n.por_verificar && <>
                {/* Antes de decidir, mirarlo: «Comparar versiones» encuadrado en ESTA nube (doc 23 §6.7). */}
                {onComparar && n.marca?.geometria && (
                  <button type="button" className="pinc-btn" disabled={ocupado} onClick={() => onComparar(n)}>
                    Comparar en esta nube</button>
                )}
                <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado}
                  onClick={() => dar({ acto: 'verificar', resultado: 'levantada' }, 'Nube levantada')}>Levantada</button>
                <button type="button" className="pinc-btn pinc-btn--plano pinc-btn--rojo" disabled={ocupado}
                  onClick={() => setActo('no_levantada')}>No levantada</button>
              </>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * La pestaña. `datos` es lo que devuelve GET /api/issues/<id>/nubes; `foco`, la marca a abrir (la nube que se pulsó
 * en el plano); `onCambio(datos)` recibe la respuesta tras cada acto.
 */
export default function NubesDeIncidencia({ entorno, obra, ob, i, datos, foco = null, onCambio, onIrAMarca = null,
                                            onComparar = null }) {
  const API = entorno.API ?? '';
  const [abierta, setAbierta] = useState(foco != null ? String(foco) : null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (foco != null) setAbierta(String(foco)); }, [foco]);
  const nubes = datos?.nubes || [];
  const hacer = async (cuerpo, ok) => {
    setOcupado(true);
    try {
      const d = await enviarJson(entorno, `${API}/api/issues/${i.id}/nubes`, cuerpo);
      onCambio?.(d);
      if (ok) entorno.avisar.ok(ok);
      return true;
    } catch (e) { entorno.avisar.error(e.message); return false; } finally { setOcupado(false); }
  };
  const clave = (n) => String(n.markup_id ?? `n${n.id}`);
  return (
    <div className="nub-pestana">
      <ol className="nub-lista">
        {nubes.map((n) => {
          // EL NÚMERO Y EL COLOR, LOS DEL SERVIDOR (47): el mismo número que en la hoja, para quien ve todas o no; el
          // color de su persona en este plano (gris mientras no se asigna).
          return (
            <Nube key={clave(n)} entorno={entorno} obra={obra} ob={ob} i={i} n={n} numero={n.numero}
              color={colorDeIndice(n.color)} abierta={abierta === clave(n)} ocupado={ocupado} hacer={hacer}
              onAbrir={() => setAbierta(a => (a === clave(n) ? null : clave(n)))} onIrAMarca={onIrAMarca}
              onComparar={onComparar} />
          );
        })}
      </ol>
    </div>
  );
}
