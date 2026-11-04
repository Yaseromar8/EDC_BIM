/**
 * BarraDeMarca — el menú de una marca elegida en el lector (2-nov-2026), como en ACC: junto a la marca, sin panel.
 *
 * Al elegir una nube, un rectángulo, una flecha, un texto, un trazo, una medición o un sello aparece encima de ella
 * (debajo si no cabe) un menú pequeño:
 *   Estilo       color de trazo, relleno, grosor y, en la nube, el tamaño de los festones (el «Estilo» de ACC)
 *   Texto        en las marcas de texto
 *   Sello        editar el sello (su diálogo)
 *   Referencia   los documentos que cita, con su número; añadir (como el menú «Referencia» de ACC)
 *   Comentarios  la conversación sobre la marca (3-nov-2026): cualquiera que la ve comenta; solo se añade, con autor
 *                y fecha, y sin estado ni responsable (eso es la observación)
 *   Observación  la suya, si la tiene (abre el panel de la incidencia) o crearla
 *   Llevar a la vigente · Duplicar · Publicar o retirar · Suprimir
 * Solo la FOTO tiene panel propio (como «Referencias a fotos» de ACC), y la INCIDENCIA el suyo.
 *
 * Lo que la marca puede cambiar lo decide el servidor (routes/pdf_tools.py `editar_markup`): la figura —estilo y
 * texto— solo en un borrador tuyo sin observación abierta; referencias y publicar, su autor.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { abrirDocumento } from '../utils/enlaceDeMarcas';
import { confirmAction } from '../utils/confirm';
import { conSuConversacion, estadoDeObservacion, etiquetaDeCita, fechaCorta, fechaYHora, observacionViva, textoDeCitas,
  TOPE_CITAS } from '../utils/marcasConEnlace';
import SelectorDeDocumento from './SelectorDeDocumento';
import IconoModulo from './IconoModulo';
import IncidenciaLateral from './IncidenciaLateral';
import AsignacionDeNube, { AsignarSuelta, pedirCompararNube, useNubeDeLaMarca } from './AsignacionDeNube';
import { colorDeIndice, iniciales } from '../../../design/incidencias/reglas.js';
import { useDestinoDelLector } from '../utils/contextoDelLector';
import { DialogoDeSello } from './MarcaConEnlace';
import { AISLADO } from '../../../design/incidencias/PanelDeIncidencia.jsx';
import useCapa from '../../../design/ui/useCapa.js';
import './BarraDeMarca.css';

const NOMBRE = {
  sello: 'Sello', cloud: 'Nube', arrow: 'Flecha', text: 'Texto', measure: 'Medición', area: 'Área', count: 'Conteo',
  rect: 'Rectángulo', pen: 'Trazo',
};
const GROSORES = [['fino', 'Fino'], ['medio', 'Medio'], ['grueso', 'Grueso']];
const FESTONES = [['pequenos', 'Pequeños'], ['medianos', 'Medianos'], ['grandes', 'Grandes']];
const CON_RELLENO = ['cloud', 'rect'];
const CON_GROSOR = ['cloud', 'rect', 'arrow', 'pen'];

const Ico = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoTexto = () => <Ico><path d="M5 6h14M12 6v13" /></Ico>;
const IcoRef = () => <Ico><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Ico>;
const IcoIssue = () => <IconoModulo nombre="incidencia" tamano={16} />;
const IcoComentario = () => <IconoModulo nombre="comentario" tamano={16} />;
const TOPE_COMENTARIO = 2000;
// «11:14» si es de hoy; si no, «03 nov.»: la fecha entera va en el título.
const horaCorta = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
};
const IcoDuplicar = () => <Ico><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></Ico>;
const IcoPublicar = () => <Ico><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></Ico>;
const IcoRetirar = () => <Ico><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></Ico>;
const IcoVigente = () => <Ico><path d="M4 12h12" /><path d="M12 6l6 6-6 6" /><path d="M20 4v16" /></Ico>;
const IcoBorrar = () => <Ico><path d="M5 7h14" /><path d="M10 7V5h4v2" /><path d="M7 7l1 12h8l1-12" /></Ico>;
const IcoSello = () => <Ico><path d="M9.5 4h5l-1 6h-3z" /><path d="M5 13h14v3.5H5z" /><path d="M6 20h12" /></Ico>;

function Boton({ etiqueta, activo, onClick, disabled, peligro, children, conTexto }) {
  return (
    <button type="button" className={`bdm-btn${peligro ? ' bdm-btn--peligro' : ''}${conTexto ? ' bdm-btn--texto' : ''}`}
      aria-label={etiqueta} data-tip={etiqueta} aria-pressed={activo || undefined} aria-expanded={activo ?? undefined}
      onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function BarraDeMarca({ API, obra, marca, esAutor, editable, colores = [], posicion, versionVigente = null,
                                       revisionSugerida = '', pedido = null, bajoLaMarca = null,
                                       onAbrirIncidencia = null, conPanel = false, panelAbierto = false,
                                       onLlevar = null, onDuplicar, onCambio, onPublicar, onBorrar, onCerrar }) {
  const [abierto, setAbierto] = useState(null);         // 'estilo' | 'texto' | 'referencias' | 'comentarios'
  const [comentario, setComentario] = useState('');
  const [comentando, setComentando] = useState(false);
  const listaDeComentarios = useRef(null);
  const [texto, setTexto] = useState(marca.text || '');
  const [eligiendo, setEligiendo] = useState(false);
  const [sello, setSello] = useState(false);
  const [lateral, setLateral] = useState(null);         // 'nueva' | id de la observación
  const [triangulo, setTriangulo] = useState(marca.style?.triangulo || revisionSugerida || '');
  const raiz = useRef(null);
  const nota = useRef(null);
  const quienAbrio = useRef(null);     // el botón que abrió lo desplegado: el foco vuelve a él al cerrarlo
  const destino = useDestinoDelLector();
  const citas = marca.citas || [];
  const comentarios = marca.style?.comentarios || [];
  const obs = marca.observacion || null;
  const viva = observacionViva(obs);
  // Si esta marca es una NUBE de su incidencia (46), a quién le toca aportar (de la copia única de las nubes).
  const nube = useNubeDeLaMarca(API, marca);
  const asignable = !!nube && (nube.actos || []).includes('asignar');
  // Una nube SUELTA (de ninguna incidencia) se asigna si el servidor dice a qué incidencias puede ir y cómo.
  const repartible = marca.kind === 'cloud' && !obs && !marca._unsaved && (marca.puede_unirse_a || []).length > 0;
  const estilo = marca.style || {};
  // El chip «🔗 N» de la hoja abre la lista de referencias, no solo elige la marca.
  useEffect(() => { if (pedido) setAbierto(pedido.que); }, [pedido?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESCAPE Y EL CLIC FUERA, COMO CAPAS (design/ui/capas.js, docs/archivos/25 P5). Antes: dos escuchadores propios, uno
  // en captura porque el panel de la incidencia paraba las teclas, y un `setTimeout(0)` para que el clic que abría la
  // barra no la cerrase. Ahora:
  //   · la barra (nivel 2): Escape o un clic fuera la sueltan. Fuera es fuera de la barra, de su nota y —si su panel
  //     está abierto con ella (una nube de una incidencia)— de ese panel;
  //   · lo desplegado en ella (nivel 3): Escape lo pliega, aunque se esté escribiendo en la nota;
  //   · un diálogo abierto desde ella (nivel 4: elegir documento, el sello, la observación lateral) para el clic fuera
  //     y Escape lo cierra.
  // `propios`: la barra y su nota (Escape escribiendo en ellas las cierra). `contiene`: además su panel (pulsar en él no la
  // suelta; escribir en él y pulsar Escape, tampoco: ese Escape es del campo).
  const propios = (t) => !!(raiz.current?.contains(t) || nota.current?.contains(t));
  const contiene = (t) => propios(t) || !!(conPanel && t?.closest?.('[data-panel-de-incidencia]'));
  useCapa(true, { nivel: 2, escapeDesdeCampos: true, contiene, propios, cerrar: () => onCerrar?.() });
  useCapa(!!abierto, { nivel: 3, escapeDesdeCampos: true, alPulsarFuera: false, contiene, propios,
    cerrar: () => setAbierto(null) });
  useCapa(!!(lateral || eligiendo || sello), { nivel: 4, bloquea: true, alPulsarFuera: false, contiene: () => true,
    cerrar: () => { setLateral(null); setEligiendo(false); setSello(false); } });
  // Al plegar lo desplegado, el foco vuelve al botón que lo abrió (si estaba dentro de lo que se cerró).
  const antes = useRef(abierto);
  useEffect(() => {
    const habia = antes.current;
    antes.current = abierto;
    if (!habia || abierto) return;
    const a = document.activeElement;
    if (!a || a === document.body || raiz.current?.contains(a) || nota.current?.contains(a)) quienAbrio.current?.focus();
  }, [abierto]);

  const cambiar = useCallback(async (cuerpo, ok) => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo guardar.');
      onCambio(conSuConversacion(marca, d.markup));
      if (ok) toast.success(ok);
      return true;
    } catch (e) { toast.error(e.message); return false; }
  }, [API, marca, onCambio]);

  const releerObservacion = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/observacion`);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) onCambio({ ...marca, observacion: d.observacion });
    } catch { /* se queda la que había */ }
  }, [API, marca, onCambio]);

  const crearDesdeLaMarca = async (cuerpo) => {
    const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/observacion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo crear.');
    if (d.publicado) onCambio({ ...marca, publicado: true });
    return d.observacion;
  };

  // QUE EL MENÚ Y LO DESPLEGADO QUEDEN ENTEROS A LA VISTA: si chocan con el borde de la ventana o con lo que en el lector
  // se declara OBSTÁCULO (`data-obstaculo`: el estuche de herramientas, el panel de la incidencia), se corren a la
  // izquierda. Se mide al cambiar lo que puede moverlo —lo desplegado, la posición, el panel— y cuando el lector cambia de
  // tamaño o la propia barra (crece al llegar los datos de su nube); antes, con un temporizador de 400 ms «porque el
  // panel llega después» y buscando cada pieza por su clase.
  const [medida, setMedida] = useState(0);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setMedida(x => x + 1));
    if (destino) ro.observe(destino);
    // Lo mismo que se mide abajo: la barra y lo desplegado (el contenedor no cambia de tamaño cuando ellas crecen).
    for (const el of [raiz.current, nota.current]) {
      for (const hijo of el?.querySelectorAll(':scope > .bdm-barra, :scope > .bdm-menu') || []) ro.observe(hijo);
    }
    return () => ro.disconnect();
  }, [destino, abierto]);
  useLayoutEffect(() => {
    for (const el of [raiz.current, nota.current]) {
      if (!el) continue;
      el.style.marginLeft = '';
      let derecha = 0;
      let caja = null;
      for (const hijo of el.querySelectorAll(':scope > .bdm-barra, :scope > .bdm-menu')) {
        const r = hijo.getBoundingClientRect();
        derecha = Math.max(derecha, r.right);
        caja = caja ? { top: Math.min(caja.top, r.top), bottom: Math.max(caja.bottom, r.bottom), left: Math.min(caja.left, r.left) }
          : { top: r.top, bottom: r.bottom, left: r.left };
      }
      if (!caja) continue;
      let tope = window.innerWidth - 8;
      for (const o of destino?.querySelectorAll?.('[data-obstaculo]') || []) {
        const r = o.getBoundingClientRect();
        // Cuenta el que se cruza con ella en altura y no queda entero a su izquierda (también si la barra empieza ya
        // debajo de él: entonces se corre hasta dejarlo libre).
        if (r.width && r.top < caja.bottom && r.bottom > caja.top && r.right > caja.left) tope = Math.min(tope, r.left - 8);
      }
      const sobra = Math.min(derecha - tope, caja.left - 8);
      if (sobra > 0) el.style.marginLeft = `${-sobra}px`;
    }
    // Lo que cambia su CONTENIDO también la mueve: al llegar los datos de su nube aparece «Asignada a…» y crece.
  }, [abierto, posicion?.left, posicion?.top, bajoLaMarca?.top, comentarios.length, citas.length, nube?.destino_nombre,
      asignable, panelAbierto, medida, destino]);

  // Al abrir la conversación, se ve lo último.
  useEffect(() => {
    if (abierto === 'comentarios' && listaDeComentarios.current) {
      listaDeComentarios.current.scrollTop = listaDeComentarios.current.scrollHeight;
    }
  }, [abierto, comentarios.length]);

  const comentar = async () => {
    const t = comentario.trim();
    if (!t || comentando) return;
    setComentando(true);
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/comentarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: t }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo comentar.');
      onCambio({ ...marca, style: { ...(marca.style || {}), comentarios: d.comentarios } });
      setComentario('');
    } catch (e) { toast.error(e.message); }
    finally { setComentando(false); }
  };

  const suprimir = async () => {
    const ok = await confirmAction({
      title: `¿Suprimir esta ${(NOMBRE[marca.kind] || 'marca').toLowerCase()}?`,
      message: 'Se borra la marca del plano. Los documentos que cita no cambian.', confirmText: 'Suprimir', danger: true,
    });
    if (ok) onBorrar();
  };

  const alternar = (que, e) => {
    if (e?.currentTarget) quienAbrio.current = e.currentTarget;
    setAbierto(a => (a === que ? null : que));
  };
  const est = obs ? estadoDeObservacion(obs.estado) : null;
  const alMoverseConFlechas = (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const botones = [...e.currentTarget.querySelectorAll('button:not([disabled])')];
    const k = botones.indexOf(document.activeElement);
    if (!botones.length) return;
    e.preventDefault();
    const sig = e.key === 'Home' ? 0 : e.key === 'End' ? botones.length - 1
      : (k + (e.key === 'ArrowRight' ? 1 : -1) + botones.length) % botones.length;
    botones[sig].focus();
  };
  const motivoFijo = viva ? 'Tiene una observación abierta: queda fija mientras el responsable la corrige.'
    : marca.publicado ? 'Publicada: retírala de la obra para cambiarla.' : null;

  // La nota de comentarios va DEBAJO de la marca, no debajo del menú: el menú está encima de la marca y lo que despliega
  // la tapaba (el dueño, 3-nov-2026).
  const notaAparte = (abierto === 'comentarios' || abierto === 'encargo' || abierto === 'asignar') && bajoLaMarca;
  // ASIGNAR, DIRECTO EN LA BARRA (4-nov-2026, el dueño: «es muy confuso tener que ir hasta el mensaje»): su propia nota.
  const notaDeAsignar = (
    <div className="bdm-menu bdm-nota-de-marca" role="dialog" aria-label="Asignar la nube">
      <AsignacionDeNube API={API} obra={obra} marca={marca} nube={nube} editarDeEntrada onCerrar={() => setAbierto(null)}
        pedidoSugerido={comentarios[comentarios.length - 1]?.texto || ''} />
    </div>
  );
  const notaDeEncargo = (
    <div className="bdm-menu bdm-nota-de-marca" role="dialog" aria-label="Encargo para tu equipo">
      <AsignarSuelta API={API} obra={obra} marca={marca} onCancelar={() => setAbierto(null)}
        pedidoSugerido={comentarios[comentarios.length - 1]?.texto || ''} onHecho={() => setAbierto(null)} />
    </div>
  );
  const notaDeComentarios = (
        // Una nota discreta junto a la nube, no un panel (el dueño, 3-nov-2026: «solo para anotar… que no tape todo»).
        <div className="bdm-menu bdm-nota-de-marca" role="dialog" aria-label="Comentarios">
          {comentarios.length > 0 && (
            <ol className="bdm-comentarios" ref={listaDeComentarios}>
              {comentarios.map(c => (
                <li key={c.id}>
                  <span className="bdm-quien"><b>{c.autor}</b><time dateTime={c.en} title={fechaYHora(c.en)}>{horaCorta(c.en)}</time></span>
                  <p>{c.texto}</p>
                </li>
              ))}
            </ol>
          )}
          <form className="bdm-anotar" onSubmit={e => { e.preventDefault(); comentar(); }}>
            <input value={comentario} maxLength={TOPE_COMENTARIO} autoFocus aria-label="Comentario"
              placeholder={comentarios.length ? 'Responder…' : 'Anotar un comentario…'}
              onChange={e => setComentario(e.target.value)} />
            <button type="submit" aria-label="Comentar" data-tip="Comentar" disabled={!comentario.trim() || comentando}>
              <Ico size={14}><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></Ico>
            </button>
          </form>
        </div>
  );
  return (
    <>
    <div ref={raiz} className="bdm" style={posicion} role="toolbar" aria-label={`${NOMBRE[marca.kind] || 'Marca'} elegida`}
      {...AISLADO}>
      {/* LA BARRA NO ENCOGE AL ALEJAR (docs/archivos/25 P7): sus botones son para pulsar y no bajan de su tamaño
          (WCAG 2.5.8); lo que encoge con la hoja es lo dibujado en ella. Con el teclado, las flechas pasan de un botón
          al siguiente (patrón WAI-ARIA «toolbar»). */}
      <div className="bdm-barra" onKeyDown={alMoverseConFlechas}>
        <span className="bdm-info" data-tip={[marca.version_number ? `V${marca.version_number}` : '', marca.created_by,
          fechaCorta(marca.created_at), marca.publicado ? 'Publicada' : 'Borrador'].filter(Boolean).join(' · ')}>
          {NOMBRE[marca.kind] || 'Marca'}
        </span>

        {esAutor && marca.kind !== 'sello' && (
          <Boton etiqueta={editable ? 'Estilo' : motivoFijo || 'Estilo'} activo={abierto === 'estilo'} disabled={!editable}
            onClick={e => alternar('estilo', e)}>
            <i className="bdm-muestra" style={{ background: estilo.color || '#d97757' }} />
          </Boton>
        )}
        {esAutor && marca.kind === 'text' && (
          <Boton etiqueta={editable ? 'Editar texto' : motivoFijo || 'Editar texto'} activo={abierto === 'texto'} disabled={!editable}
            onClick={e => { setTexto(marca.text || ''); alternar('texto', e); }}><IcoTexto /></Boton>
        )}
        {esAutor && marca.kind === 'sello' && (
          <Boton etiqueta="Editar el sello" onClick={() => setSello(true)}><IcoSello /></Boton>
        )}

        <Boton etiqueta={citas.length ? `Referencias (${citas.length})` : 'Referencia'} activo={abierto === 'referencias'}
          onClick={e => alternar('referencias', e)} conTexto={citas.length > 0}>
          <IcoRef />{citas.length > 0 && <b>{citas.length}</b>}
        </Boton>

        {!marca._unsaved && (
          <Boton etiqueta={comentarios.length ? `Comentarios (${comentarios.length})` : 'Comentar'}
            activo={abierto === 'comentarios'} onClick={e => alternar('comentarios', e)} conTexto={comentarios.length > 0}>
            <IcoComentario />{comentarios.length > 0 && <b>{comentarios.length}</b>}
          </Boton>
        )}

        {nube && (asignable || nube.destino_nombre) && (
          <Boton etiqueta={nube.destino_nombre ? `Asignada a ${nube.destino_nombre}` : 'Asignar'} activo={abierto === 'asignar'}
            onClick={e => alternar('asignar', e)} conTexto={!!nube.destino_nombre}>
            {nube.destino_nombre
              ? <span className="bdm-quien-chip" style={{ background: colorDeIndice(nube.color) }}>{iniciales(nube.destino_nombre)}</span>
              : <Ico><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Ico>}
          </Boton>
        )}

        {obs && marca.kind === 'cloud' ? null : obs ? (
          // Solo su código, con el punto de su estado: el detalle, en el panel (el dueño: «quita espacio»).
          <button type="button" className="bdm-obs" style={{ '--estado': est.color }}
            data-tip={`${obs.titulo || obs.codigo} · ${obs.vencida ? 'Vencida' : est.etiqueta}`}
            onClick={() => (onAbrirIncidencia ? onAbrirIncidencia() : setLateral(String(obs.id)))}>
            <i />{obs.codigo}
          </button>
        ) : esAutor && (
          <Boton etiqueta="Crear observación" onClick={() => setLateral('nueva')}><IcoIssue /></Boton>
        )}
        {repartible && (
          <Boton etiqueta="Asignar" activo={abierto === 'encargo'} onClick={e => alternar('encargo', e)}>
            <Ico><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Ico>
          </Boton>
        )}

        <span className="bdm-sep" />
        {onLlevar && <Boton etiqueta={`Llevar a la vigente${versionVigente ? ` (V${versionVigente})` : ''}`} onClick={onLlevar}><IcoVigente /></Boton>}
        {marca.kind !== 'sello' && <Boton etiqueta="Duplicar" onClick={onDuplicar}><IcoDuplicar /></Boton>}
        {esAutor && (
          <Boton etiqueta={marca.publicado ? 'Retirar de la obra' : 'Publicar'} onClick={onPublicar}
            disabled={marca.publicado && viva}>
            {marca.publicado ? <IcoRetirar /> : <IcoPublicar />}
          </Boton>
        )}
        {esAutor && (
          <Boton etiqueta={viva ? 'Tiene una observación abierta: anúlala o ciérrala antes' : 'Suprimir'} peligro
            disabled={viva} onClick={suprimir}><IcoBorrar /></Boton>
        )}
      </div>

      {abierto === 'estilo' && (
        <div className="bdm-menu" role="dialog" aria-label="Estilo">
          <span className="bdm-rotulo">Trazo</span>
          <div className="bdm-colores" role="radiogroup" aria-label="Color de trazo">
            {colores.map(c => (
              <button key={c} type="button" role="radio" aria-checked={(estilo.color || '').toLowerCase() === c}
                aria-label={`Trazo ${c}`} style={{ background: c }} onClick={() => cambiar({ color: c })} />
            ))}
          </div>
          {CON_RELLENO.includes(marca.kind) && (
            <>
              <span className="bdm-rotulo">Relleno</span>
              <div className="bdm-colores" role="radiogroup" aria-label="Color de relleno">
                <button type="button" role="radio" aria-checked={!estilo.relleno} aria-label="Sin relleno"
                  className="bdm-sin" onClick={() => cambiar({ estilo: { relleno: null } })} />
                {colores.map(c => (
                  <button key={c} type="button" role="radio" aria-checked={(estilo.relleno || '').toLowerCase() === c}
                    aria-label={`Relleno ${c}`} style={{ background: c, opacity: 0.45 }} onClick={() => cambiar({ estilo: { relleno: c } })} />
                ))}
              </div>
            </>
          )}
          {CON_GROSOR.includes(marca.kind) && (
            <>
              <span className="bdm-rotulo">Grosor</span>
              <div className="bdm-opciones" role="radiogroup" aria-label="Grosor">
                {GROSORES.map(([v, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={(estilo.grosor || 'medio') === v}
                    onClick={() => cambiar({ estilo: { grosor: v } })}>{t}</button>
                ))}
              </div>
            </>
          )}
          {marca.kind === 'cloud' && (
            <>
              <span className="bdm-rotulo">Festones</span>
              <div className="bdm-opciones" role="radiogroup" aria-label="Festones">
                {FESTONES.map(([v, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={(estilo.festones || 'medianos') === v}
                    onClick={() => cambiar({ estilo: { festones: v } })}>{t}</button>
                ))}
              </div>
            </>
          )}
          {marca.kind === 'cloud' && (
            <>
              <span className="bdm-rotulo">Triángulo de revisión</span>
              <div className="bdm-triangulo">
                <input value={triangulo} maxLength={8} placeholder="C02" aria-label="Código de la revisión"
                  onChange={e => setTriangulo(e.target.value.toUpperCase())} />
                <button type="button" className="bdm-accion bdm-accion--prim" disabled={!triangulo.trim()}
                  onClick={() => cambiar({ estilo: { triangulo: triangulo.trim() } })}>
                  {estilo.triangulo ? 'Cambiar' : 'Poner'}</button>
                {estilo.triangulo && (
                  <button type="button" className="bdm-accion" onClick={() => cambiar({ estilo: { triangulo: null } })}>Quitar</button>
                )}
              </div>
            </>
          )}
          <span className="bdm-nota">Arrástrala para moverla{['cloud', 'rect', 'arrow', 'measure', 'area'].includes(marca.kind) ? '; los cuadrados cambian su forma' : ''}.</span>
        </div>
      )}

      {abierto === 'texto' && (
        <div className="bdm-menu" role="dialog" aria-label="Editar texto">
          <textarea value={texto} maxLength={500} rows={3} autoFocus onChange={e => setTexto(e.target.value)} />
          <div className="bdm-acciones">
            <button type="button" className="bdm-accion bdm-accion--prim" disabled={!texto.trim()}
              onClick={async () => { if (await cambiar({ texto }, 'Texto cambiado')) setAbierto(null); }}>Guardar</button>
            <button type="button" className="bdm-accion" onClick={() => setAbierto(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {abierto === 'referencias' && (
        <div className="bdm-menu bdm-menu--ancho" role="dialog" aria-label="Referencias">
          {citas.length ? (
            <ul className="bdm-citas">
              {citas.map(c => (
                <li key={c.id}>
                  {c.nombre
                    ? <button type="button" className="bdm-cita" onClick={() => abrirDocumento(c.id)} title="Abrir en otra pestaña">{c.nombre}</button>
                    : <span className="bdm-cita bdm-cita--tenue">{etiquetaDeCita(c)}</span>}
                  {esAutor && (
                    <button type="button" className="bdm-quitar" aria-label="Quitar la referencia"
                      onClick={() => cambiar({ citas: citas.map(x => x.id).filter(x => x !== c.id) })}>×</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <span className="bdm-nota">{textoDeCitas(0)}. Enlaza un informe, una especificación o un plano relacionado.</span>}
          {esAutor && citas.length < TOPE_CITAS && (
            <div className="bdm-acciones">
              <button type="button" className="bdm-accion bdm-accion--prim" onClick={() => setEligiendo(true)}>+ Añadir referencia</button>
            </div>
          )}
        </div>
      )}

      {abierto === 'comentarios' && !notaAparte && notaDeComentarios}
      {abierto === 'encargo' && !notaAparte && notaDeEncargo}
      {abierto === 'asignar' && !notaAparte && notaDeAsignar}

      {eligiendo && createPortal(
        <SelectorDeDocumento API={API} project={{ id: obra, model_urn: obra }} titulo="Añadir una referencia"
          ayuda="Elige el documento que esta marca cita. No se copia ni se mueve, y quien no pueda abrirlo no verá su nombre."
          onElegir={async (doc) => {
            setEligiendo(false);
            if (citas.some(c => c.id === doc.file_node_id)) { toast('Ese documento ya está citado.'); return; }
            await cambiar({ citas: [...citas.map(c => c.id), doc.file_node_id] }, 'Referencia añadida');
          }}
          onCerrar={() => setEligiendo(false)} />,
        document.fullscreenElement || document.body,
      )}
      {sello && (
        <DialogoDeSello inicial={estilo.sello} autor={marca.created_by} editar
          onAceptar={async (s) => { if (await cambiar({ sello: s }, 'Sello actualizado')) setSello(false); }}
          onCerrar={() => setSello(false)} />
      )}
      {lateral && (
        <IncidenciaLateral API={API} obra={obra} contenedor={destino} onVolver={() => setLateral(null)}
          issueId={lateral === 'nueva' ? null : lateral}
          // Abierta desde su marca: el panel va a la pestaña «Nubes», a ESTA nube.
          nube={lateral === 'nueva' ? null : marca.id}
          onCompararNube={pedirCompararNube}
          nueva={lateral === 'nueva' ? { tipo: 'OBSERVACION', lugar: `Desde una marca · pág. ${marca.page}` } : null}
          titulo="Nueva observación de la marca" crear={crearDesdeLaMarca}
          onCreada={releerObservacion} onCambio={releerObservacion} onCerrar={() => setLateral(null)} />
      )}
    </div>
    {notaAparte && (
      <div ref={nota} className="bdm bdm-suelta" {...AISLADO} style={bajoLaMarca}>
        {abierto === 'encargo' ? notaDeEncargo : abierto === 'asignar' ? notaDeAsignar : notaDeComentarios}
      </div>
    )}
    </>
  );
}
