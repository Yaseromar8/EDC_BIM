/**
 * FichaDocumento — la FICHA COMPLETA de un documento (paso 3, 14-oct-2026).
 *
 * Diseño aprobado: maqueta v8 (docs/ux/maquetas/consulta_documento_v8.html) y
 * docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md §2-B. Se abre desde el panel de
 * consulta («Ficha completa») y ocupa el sitio del árbol y la tabla; «Volver a
 * Archivos» deja todo como estaba.
 *
 *   Resumen · Versiones · Trazabilidad · Accesos · Relacionados
 *   y a la derecha, siempre: recorrido ISO 19650, integridad y código.
 *
 * Patrón estándar (Procore y ACC tienen ficha con pestañas). Lo nuestro es lo de
 * dentro: la HUELLA de cada versión, el registro SELLADO, una sola línea de
 * tiempo que junta estados, versiones, revisiones, envíos, RFI y accesos, y
 * «Comprobar un archivo», que calcula la huella EN ESTE EQUIPO —el archivo no
 * sale de aquí— y la compara con todas las versiones.
 *
 * Solo lectura. Todo sale de `/api/docs/trazabilidad` (sin rutas nuevas). Lo que
 * el servidor no devuelva no se pinta: no se inventa nada.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { Ficha } from '../utils/estadosECD';
import IconoModulo from './IconoModulo';
import { piezasDelCodigo, PIEZAS, ETIQUETAS_DE_PIEZA } from '../utils/codigoDelNombre';
import {
  lineaDeTiempo, FILTROS_LINEA, accesosDe, comprobarHuella, TOPE_COMPROBAR,
  RECORRIDO, CON_HORA, CORTA, fecha, queOcurrio, fechasDelRecorrido,
} from '../utils/fichaDocumento';
import './PanelConsulta.css';
import './FichaDocumento.css';

// Estados de doc_reviews (routes/reviews.py). Uno que no se conozca se enseña tal cual.
const ETIQUETA_REVISION = { pending: 'en curso', approved: 'aprobada', rejected: 'rechazada' };

function copiar(texto) {
  try { navigator.clipboard.writeText(texto); toast.success('Huella copiada'); }
  catch { toast.error('No se pudo copiar'); }
}

function ComprobarArchivo({ versiones, onCerrar }) {
  const [estado, setEstado] = useState({ fase: 'espera' });
  const entrada = useRef(null);
  const [encima, setEncima] = useState(false);

  const comprobar = async (archivo) => {
    if (!archivo) return;
    if (archivo.size > TOPE_COMPROBAR) {
      setEstado({ fase: 'error', texto: 'El archivo pasa de 1,5 GB: es demasiado grande para comprobarlo en el navegador.' });
      return;
    }
    setEstado({ fase: 'calculando', nombre: archivo.name });
    try {
      const datos = await archivo.arrayBuffer();
      const resumen = await crypto.subtle.digest('SHA-256', datos);
      const hex = [...new Uint8Array(resumen)].map(b => b.toString(16).padStart(2, '0')).join('');
      setEstado({ fase: 'hecho', nombre: archivo.name, ...comprobarHuella(hex, versiones) });
    } catch {
      setEstado({ fase: 'error', texto: 'No se pudo leer el archivo en este navegador.' });
    }
  };

  return (
    <div className="ficha-velo" role="dialog" aria-modal="true" aria-label="Comprobar un archivo"
      onKeyDown={(e) => { if (e.key === 'Escape') onCerrar(); }}>
      <div className="ficha-modal">
        <h4>Comprobar un archivo</h4>
        <p>¿El archivo que te enseñan es el que se emitió? Se calcula su huella SHA-256 <b>en este equipo</b> y se
          compara con la de cada versión del documento. El archivo no se sube ni se guarda.</p>
        <div className={`ficha-drop${encima ? ' es-encima' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => { e.preventDefault(); setEncima(false); comprobar(e.dataTransfer.files?.[0]); }}>
          Suelta aquí el archivo o{' '}
          <button type="button" className="consulta__enlace" onClick={() => entrada.current?.click()}>elige uno</button>
          <input ref={entrada} type="file" hidden onChange={(e) => comprobar(e.target.files?.[0])} />
        </div>
        {estado.fase === 'calculando' && <p className="ficha-res">Calculando la huella de «{estado.nombre}»…</p>}
        {estado.fase === 'error' && <p className="ficha-res ficha-res--no">{estado.texto}</p>}
        {estado.fase === 'hecho' && (
          <div className={`ficha-res ${estado.coincide ? 'ficha-res--ok' : 'ficha-res--no'}`} role="status">
            {estado.coincide ? (
              <>
                <b>Coincide con la V{estado.version.version}{estado.version.revision ? ` · ${estado.version.revision}` : ''}.</b>
                {' '}{estado.version.emitida_en
                  ? `Emitida${estado.version.idoneidad ? ` como ${estado.version.idoneidad}` : ''} el ${fecha(estado.version.emitida_en, CON_HORA)}${estado.version.emitida_por ? ` por ${estado.version.emitida_por}` : ''}.`
                  : `Subida el ${fecha(estado.version.subida_en, CON_HORA)}${estado.version.subida_por ? ` por ${estado.version.subida_por}` : ''}.`}
                {!estado.esVigente && ' Ojo: no es la versión vigente.'}
              </>
            ) : estado.conHuella === 0 ? (
              <><b>No se puede afirmar nada.</b> Ninguna versión de este documento tiene huella todavía.</>
            ) : (
              <><b>No coincide con ninguna versión</b> de las {estado.conHuella} que tienen huella. El archivo es distinto
                de todo lo que se subió.{estado.sinHuella > 0 ? ` (${estado.sinHuella} versión${estado.sinHuella === 1 ? '' : 'es'} sin huella no se ha${estado.sinHuella === 1 ? '' : 'n'} podido comparar.)` : ''}</>
            )}
            <small>Huella de «{estado.nombre}»: <code>{estado.huella.slice(0, 16)}…</code></small>
          </div>
        )}
        <div className="ficha-modal__pie">
          <button type="button" className="barra-btn barra-btn--contorno" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function Recorrido({ item, datos }) {
  const estado = String(item.status || 'WIP').toUpperCase();
  const paso = Math.max(0, RECORRIDO.findIndex(([k]) => k === estado));
  const fechas = datos ? fechasDelRecorrido(datos) : {};
  return (
    <div className="recorrido" style={{ '--avance': `${paso * 25}%` }}>
      {RECORRIDO.map(([k, n], i) => (
        <div key={k} className={i < paso ? 'hecho' : i === paso ? 'aqui' : ''}>
          <i /><b>{n}</b><small>{i <= paso && fechas[k] ? fecha(fechas[k], CORTA) : '—'}</small>
        </div>
      ))}
    </div>
  );
}

export default function FichaDocumento({ item, lista, onCambiar, onCerrar, onAbrir, onVersiones, onIrA }) {
  // La respuesta se guarda CON el id que la pidió: al pasar a otro documento con
  // ‹ › lo anterior deja de valer sin tener que vaciarlo dentro del efecto.
  const [respuesta, setRespuesta] = useState({ id: null, datos: null, error: null });
  const datos = respuesta.id === item.id ? respuesta.datos : null;
  const error = respuesta.id === item.id ? respuesta.error : null;
  const [pestana, setPestana] = useState('resumen');
  const [filtro, setFiltro] = useState('todo');
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const id = item.id;
    apiFetch(`${API}/api/docs/trazabilidad?id=${encodeURIComponent(id)}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok || !j.success) setRespuesta({ id, datos: null, error: j.error || 'No se pudo leer la trazabilidad.' });
        else setRespuesta({ id, datos: j, error: null });
      })
      .catch(() => vivo && setRespuesta({ id, datos: null, error: 'Sin conexión con el servidor.' }));
    return () => { vivo = false; };
  }, [item.id]);

  const indice = (lista || []).findIndex(f => String(f.id) === String(item.id));
  const mover = (d) => { const s = lista[indice + d]; if (s) onCambiar(s); };
  useEffect(() => {
    const tecla = (e) => {
      if (comprobando || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [comprobando, onCerrar]);

  const linea = useMemo(() => (datos ? lineaDeTiempo(datos) : []), [datos]);
  const accesos = useMemo(() => (datos ? accesosDe(datos) : []), [datos]);
  const rel = datos?.relacionados || null;
  const nRel = rel ? (rel.revisiones.length + rel.envios.length + rel.rfis.length + rel.plan.length
    + (rel.marcas?.publicadas ? 1 : 0)) : null;
  const versiones = datos?.versiones || [];
  const vigente = versiones[0];
  const cadena = datos?.cadena;
  const piezas = piezasDelCodigo(item.name);
  const ubicacion = item.ubicacion ?? (item.fullName && item.fullName.includes('/')
    ? item.fullName.slice(0, item.fullName.lastIndexOf('/')).split('/').slice(1).join('/') : '');
  const lineaVisible = linea.filter(e => filtro === 'todo' || e.tipo === filtro);

  const PESTANAS = [
    ['resumen', 'Resumen', null],
    ['versiones', 'Versiones', datos ? versiones.length : null],
    ['traza', 'Trazabilidad', datos ? linea.length : null],
    ['accesos', 'Accesos', datos ? accesos.length : null],
    ['relacionados', 'Relacionados', nRel],
  ];

  return (
    <div className="ficha-doc">
      <nav className="ficha-doc__miga" aria-label="Ubicación">
        <button type="button" className="consulta__enlace" onClick={onCerrar}>← Archivos</button>
        {ubicacion && <span> › {ubicacion}</span>}
      </nav>

      <div className="ficha-doc__cab">
        <div className="ficha-doc__titulo">
          <h2 title={item.name}>{item.name}</h2>
          <span>V{item.version || 1}{item.codigo_revision ? ` · ${item.codigo_revision}` : ''}
            {item.codigo_idoneidad ? ` · ${item.codigo_idoneidad}` : ''}</span>
        </div>
        <Ficha estado={String(item.status || 'WIP').toUpperCase()} />
        <div className="ficha-doc__acciones">
          {lista && lista.length > 1 && indice >= 0 && (
            <span className="ficha-doc__nav">
              {indice + 1} de {lista.length}
              <button type="button" className="barra-btn barra-btn--contorno" disabled={indice === 0}
                onClick={() => mover(-1)} aria-label="Documento anterior" title="Documento anterior">‹</button>
              <button type="button" className="barra-btn barra-btn--contorno" disabled={indice === lista.length - 1}
                onClick={() => mover(1)} aria-label="Documento siguiente" title="Documento siguiente">›</button>
            </span>
          )}
          <button type="button" className="barra-btn barra-btn--contorno" disabled={!datos}
            onClick={() => setComprobando(true)}>
            <IconoModulo nombre="triaje" tamano={16} />Comprobar un archivo
          </button>
          <button type="button" className="barra-btn barra-btn--primario" onClick={() => onAbrir(item)}>Abrir</button>
        </div>
      </div>

      <div className="ficha-doc__pestanas" role="tablist">
        {PESTANAS.map(([k, n, c]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k}
            className={pestana === k ? 'es-activa' : ''} onClick={() => setPestana(k)}>
            {n}{c != null && <em>{c}</em>}
          </button>
        ))}
      </div>

      <div className="ficha-doc__cuerpo">
        <div className="ficha-doc__izq">
          {error && <p className="consulta__error">{error}</p>}
          {!datos && !error && <p className="consulta__nota">Leyendo la trazabilidad…</p>}

          {pestana === 'resumen' && (
            <div className="ficha-tarjeta">
              <dl className="ficha-datos">
                <dt>Ubicación</dt><dd>{ubicacion || 'Archivos de proyecto'}</dd>
                <dt>Descripción</dt><dd>{item.description || '—'}</dd>
                <dt>Revisión</dt><dd><b>{item.codigo_revision || 'sin emitir'}</b> · subida V{item.version || 1}</dd>
                <dt>Idoneidad</dt><dd>{item.codigo_idoneidad || '—'}</dd>
                <dt>Entrega</dt><dd>{item.entrega
                  ? `${item.entrega.etiqueta} · ${item.entrega.plan}${item.entrega.hito ? ` · ${item.entrega.hito}` : ''}${item.entrega.fecha ? ` · comprometido para ${item.entrega.fecha}` : ''}`
                  : 'Fuera del plan de entregas'}</dd>
                <dt>Actualizado</dt><dd>{item.updated ? fecha(item.updated, CON_HORA) : '—'}
                  {item.updated_by?.name ? ` · ${item.updated_by.name}` : ''}</dd>
                {item.bloqueado_por && (<><dt>Reservado</dt><dd>por {item.bloqueado_por}</dd></>)}
              </dl>
            </div>
          )}

          {pestana === 'versiones' && datos && (
            <>
              <div className="ficha-tarjeta ficha-tarjeta--tabla">
                <table className="ficha-tabla">
                  <thead><tr><th>Versión</th><th>Subida</th><th>Emitida</th><th>Idoneidad</th><th>Huella SHA-256</th></tr></thead>
                  <tbody>
                    {versiones.map((v, i) => (
                      <tr key={v.version}>
                        <td><b>V{v.version}</b>{v.revision ? ` · ${v.revision}` : ''}{i === 0 && <small>vigente</small>}</td>
                        <td>{v.subida_en ? fecha(v.subida_en, CON_HORA) : '—'}<small>{v.subida_por || ''}</small></td>
                        <td>{v.emitida_en ? fecha(v.emitida_en, CON_HORA) : '—'}<small>{v.emitida_por || ''}</small></td>
                        <td>{v.idoneidad || '—'}</td>
                        <td>{v.huella
                          ? <><code>{v.huella.slice(0, 12)}…</code>{' '}<button type="button" className="consulta__enlace" onClick={() => copiar(v.huella)}>copiar</button></>
                          : <span className="ficha-mudo">sin huella</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="consulta__nota">
                <button type="button" className="consulta__enlace" onClick={(e) => onVersiones(item, e)}>Abrir el historial de versiones</button>
                {' '}para ver una versión anterior en el lector o comparar dos.
              </p>
            </>
          )}

          {pestana === 'traza' && datos && (
            <>
              <div className="ficha-filtros" role="group" aria-label="Filtrar la línea de tiempo">
                {FILTROS_LINEA.map(([k, n]) => (
                  <button key={k} type="button" className={filtro === k ? 'es-activo' : ''} aria-pressed={filtro === k}
                    onClick={() => setFiltro(k)}>{n}</button>
                ))}
              </div>
              {lineaVisible.length === 0 ? (
                <p className="consulta__nota">Nada de este tipo en el registro del documento.</p>
              ) : (
                <ol className="ficha-linea">
                  {lineaVisible.map((e, i) => (
                    <li key={i}>
                      <time>{e.cuando ? fecha(e.cuando, CON_HORA) : '—'}</time>
                      <span className={`ficha-linea__punto${e.tipo === 'estado' ? ' es-estado' : ''}`}>
                        <IconoModulo nombre={e.icono} tamano={14} />
                      </span>
                      <div>
                        <div>{e.texto}{e.detalle && <span className="ficha-mudo"> · {e.detalle}</span>}</div>
                        <div className="ficha-linea__por">
                          {e.por}
                          {e.sellado === false && <span className="ficha-sin-sello" title="Este evento se escribió fuera de la cadena: no se puede demostrar que no se alteró."> · sin sellar</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {cadena && cadena.eventos > 0 && (
                <div className={`ficha-cadena${cadena.roturas?.length ? ' es-rota' : ''}`}>
                  <IconoModulo nombre="triaje" tamano={16} />
                  <span>
                    {cadena.roturas?.length
                      ? <><b>{cadena.roturas.length} evento{cadena.roturas.length === 1 ? '' : 's'} sin sello o alterado{cadena.roturas.length === 1 ? '' : 's'}.</b> </>
                      : cadena.sellados === cadena.eventos && cadena.tramo_integro
                        ? <><b>Registro íntegro.</b> </>
                        : <><b>{cadena.sellados} de {cadena.eventos} eventos sellados.</b> </>}
                    Cada evento sellado lleva la huella del anterior: si alguien altera o borra uno, aquí se ve dónde.
                    Detecta cambios; no impide que se hagan.
                  </span>
                </div>
              )}
            </>
          )}

          {pestana === 'accesos' && datos && (
            accesos.length === 0 ? (
              <p className="consulta__nota">Nadie ha recibido acceso a este documento todavía.</p>
            ) : (
              <>
                <div className="ficha-tarjeta ficha-tarjeta--tabla">
                  <table className="ficha-tabla">
                    <thead><tr><th>Fecha</th><th>Quién</th><th>Versión</th><th>Cómo</th></tr></thead>
                    <tbody>
                      {accesos.map((a, i) => (
                        <tr key={i} className={a.denegado ? 'es-denegado' : ''}>
                          <td>{a.cuando ? fecha(a.cuando, CON_HORA) : '—'}</td>
                          <td><b>{a.por}</b></td>
                          <td>{a.version ? `V${a.version}` : '—'}</td>
                          <td>{a.via || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="consulta__nota">«Accesos» y no «Descargas»: el sistema anota que entregó el acceso a esa versión,
                  no que la descarga terminara.</p>
              </>
            )
          )}

          {pestana === 'relacionados' && datos && (
            rel ? (
              <div className="ficha-tarjeta ficha-rel">
                <section>
                  <h3><IconoModulo nombre="revisiones" tamano={16} />Revisiones</h3>
                  {rel.revisiones.length === 0 ? <p className="ficha-mudo">En ninguna revisión.</p> : (
                    <ul>{rel.revisiones.map(r => (
                      <li key={r.id}><b>RV-{String(r.id).padStart(3, '0')}</b> {r.titulo}
                        <span className="ficha-mudo"> · {ETIQUETA_REVISION[r.estado] || r.estado}
                          {r.cerrada_en ? ` el ${fecha(r.cerrada_en, CORTA)}` : r.creada_en ? ` desde el ${fecha(r.creada_en, CORTA)}` : ''}</span></li>
                    ))}</ul>
                  )}
                  {rel.revisiones.length > 0 && onIrA && <button type="button" className="consulta__enlace" onClick={() => onIrA('reviews')}>Ir a Revisiones</button>}
                </section>
                <section>
                  <h3><IconoModulo nombre="transmittals" tamano={16} />Envíos</h3>
                  {rel.envios.length === 0 ? <p className="ficha-mudo">No se ha enviado en ningún transmittal.</p> : (
                    <ul>{rel.envios.map(t => (
                      <li key={t.id}><b>TR-{String(t.numero).padStart(4, '0')}</b> {t.asunto}
                        <span className="ficha-mudo"> · {t.cuando ? fecha(t.cuando, CORTA) : ''}{t.acuses ? ` · ${t.acuses} acuse${t.acuses === 1 ? '' : 's'} de recibo` : ' · sin acuse'}</span></li>
                    ))}</ul>
                  )}
                </section>
                <section>
                  <h3><IconoModulo nombre="rfi" tamano={16} />RFI</h3>
                  {rel.rfis.length === 0 ? <p className="ficha-mudo">No está adjunto a ningún RFI.</p> : (
                    <ul>{rel.rfis.map(r => (
                      <li key={r.id}><b>{r.codigo}</b> {r.titulo}<span className="ficha-mudo"> · {r.estado}</span></li>
                    ))}</ul>
                  )}
                </section>
                <section>
                  <h3><IconoModulo nombre="plan" tamano={16} />Plan de entregas</h3>
                  {rel.plan.length === 0 ? <p className="ficha-mudo">No está vinculado a ningún compromiso.</p> : (
                    <ul>{rel.plan.map((p, i) => (
                      <li key={i}><b>{p.etiqueta}</b> · {p.plan}{p.hito ? ` · ${p.hito}` : ''}
                        <span className="ficha-mudo">{p.fecha ? ` · comprometido para ${p.fecha}` : ''}</span></li>
                    ))}</ul>
                  )}
                </section>
                <section>
                  <h3><IconoModulo nombre="redline" tamano={16} />Marcas de revisión</h3>
                  <p className={rel.marcas?.publicadas ? '' : 'ficha-mudo'}>
                    {rel.marcas?.publicadas ? `${rel.marcas.publicadas} marca${rel.marcas.publicadas === 1 ? '' : 's'} publicada${rel.marcas.publicadas === 1 ? '' : 's'} sobre el plano.` : 'Sin marcas publicadas.'}
                  </p>
                </section>
                <p className="consulta__nota">Solo lo que está enlazado de verdad, buscado por el documento y no por su nombre.</p>
              </div>
            ) : <p className="consulta__nota">Este servidor todavía no informa de lo relacionado.</p>
          )}
        </div>

        <aside className="ficha-doc__der">
          <section className="ficha-tarjeta">
            <h3>Recorrido ISO 19650</h3>
            <Recorrido item={item} datos={datos} />
          </section>
          {vigente && 'huella' in vigente && (
            <section className="ficha-tarjeta">
              <h3>Integridad</h3>
              {vigente.huella ? (
                <div className="integridad integridad--ok">
                  <IconoModulo nombre="triaje" tamano={18} />
                  <div>
                    <b>Huella de la V{vigente.version}</b>
                    <span>SHA-256 <code>{vigente.huella.slice(0, 12)}…</code>{' '}
                      <button type="button" className="consulta__enlace" onClick={() => copiar(vigente.huella)}>copiar</button></span>
                  </div>
                </div>
              ) : (
                <div className="integridad">
                  <IconoModulo nombre="triaje" tamano={18} />
                  <div>
                    <b>La V{vigente.version} aún no tiene huella</b>
                    <span>{datos.huellas_en_curso ? 'Se está calculando ahora.' : 'Es anterior al control de huellas o no tiene archivo en el almacén.'}</span>
                  </div>
                </div>
              )}
              {cadena && cadena.eventos > 0 && (
                <p className="consulta__nota">{cadena.sellados} de {cadena.eventos} eventos sellados en el registro.</p>
              )}
            </section>
          )}
          {piezas && (
            <section className="ficha-tarjeta">
              <h3>Código del documento</h3>
              <div className="codigo-leido">
                {PIEZAS.map(k => <div key={k}><b>{piezas[k]}</b><small>{ETIQUETAS_DE_PIEZA[k]}</small></div>)}
              </div>
            </section>
          )}
          {datos && (datos.eventos || []).length > 0 && (
            <section className="ficha-tarjeta">
              <h3>Último movimiento</h3>
              <p className="ficha-ultimo">{queOcurrio(datos.eventos[0])}<small>{datos.eventos[0].por}
                {datos.eventos[0].cuando ? ` · ${fecha(datos.eventos[0].cuando, CON_HORA)}` : ''}</small></p>
            </section>
          )}
        </aside>
      </div>

      {comprobando && <ComprobarArchivo versiones={versiones} onCerrar={() => setComprobando(false)} />}
    </div>
  );
}
