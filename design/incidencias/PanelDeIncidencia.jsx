/**
 * PanelDeIncidencia — el panel lateral de una incidencia, como el de ACC, para TODAS las herramientas (docs/archivos/19).
 *
 * Es el mismo panel para crearla y para trabajarla:
 *   · sin `issueId`: el ALTA (título, tipo, responsable —persona o empresa—, quien verifica, observadores, fecha,
 *     ubicación, clasificación, fotos y documentos desde el primer momento). «Crear» o «Guardar borrador».
 *   · con `issueId` (o recién creada): el DETALLE. Arriba código, estado y a quién le toca; los actos del paso que le
 *     toca a quien mira; sus datos (editables por quien puede); y Comentarios, Adjuntos e Historial.
 *
 * Desde dónde nace lo dice la herramienta: `nueva.origen` (una lámina, una foto, un elemento del modelo…) o, si nace
 * por otra ruta (la observación de una marca o del plano), `crear(cuerpo)`. El resto es igual en todas partes.
 *
 * No sabe de qué aplicación es: `entorno` trae cómo pedir al servidor, avisar, abrir un documento, subir una foto,
 * elegir un documento y quién soy. Las reglas las hace cumplir el servidor (routes/issues.py); aquí solo se ofrece lo
 * que va a aceptar.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { actosDeIssue, aQuienLeTocaIssue, esDelResponsable, estadoDeIssue, iniciales, issueViva, pasosDeEstado,
         puedeVerificar, textoDeEvento, usaEstado } from './reglas.js';
import { fijarNubes, recargarNubes } from './datosDeNubes.js';
import useNubesDeIncidencia from './useNubesDeIncidencia.js';
import { ClasificacionDeAlta, ObservadoresDeAlta, ResponsableDeAlta, camposDelTipo, enviarJson, faltaObligatorio,
         leerJson, useObraDeIncidencias } from './piezas.jsx';
import NubesDeIncidencia from './NubesDeIncidencia.jsx';
import './incidencias.css';

const hoyMas = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const dos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

function fechaDeDia(aaaammdd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(aaaammdd || ''));
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Las fechas de la base son TIMESTAMP sin zona, en UTC (Cloud SQL): sin zona, se leen como UTC. Sin esto «Levantó»
// salía 5 horas adelantada frente al historial, que ya trae su zona.
function fechaCorta(iso) {
  const s = String(iso || '');
  const d = s ? new Date(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}Z` : s) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

const Ico = ({ children }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** Fotos y documentos: los de un alta (aún sin incidencia) o los de una incidencia. */
function Adjuntar({ entorno, obra, ocupado, setOcupado, onAdjunto, codigo }) {
  const foto = useRef(null);
  const [eligiendo, setEligiendo] = useState(false);
  const Elegir = entorno.ElegirDocumento;
  const subir = async (lista) => {
    for (const f of [...(lista || [])]) {
      setOcupado(true);
      try {
        const s = await entorno.subirFoto(obra, f, codigo ? `Adjunto de ${codigo}` : 'Adjunto de una incidencia');
        await onAdjunto({ documento: s.id, nombre: s.nombre || f.name });
      } catch (e) { entorno.avisar.error(`${f.name}: ${e.message}`); } finally { setOcupado(false); }
    }
    if (foto.current) foto.current.value = '';
  };
  return (
    <div className="pinc-botones">
      {entorno.subirFoto && (
        <>
          <input ref={foto} type="file" accept="image/*" multiple hidden onChange={e => subir(e.target.files)} />
          <button type="button" className="pinc-btn" disabled={ocupado} onClick={() => foto.current?.click()}>
            {ocupado ? 'Subiendo…' : 'Añadir fotos'}</button>
        </>
      )}
      {Elegir && <button type="button" className="pinc-btn" disabled={ocupado} onClick={() => setEligiendo(true)}>Añadir documento</button>}
      {eligiendo && Elegir && createPortal(
        <Elegir obra={obra} titulo="Adjuntar un documento"
          ayuda="Un documento de esta obra: plano, informe, foto… Quien abra la incidencia lo abrirá desde aquí."
          onElegir={(doc) => { setEligiendo(false); onAdjunto({ documento: doc.file_node_id || doc.id, nombre: doc.nombre || doc.name }); }}
          onCerrar={() => setEligiendo(false)} />,
        document.fullscreenElement || document.body,
      )}
    </div>
  );
}

// ── EL ALTA ──────────────────────────────────────────────────────────────────

function Alta({ entorno, obra, ob, nueva, crear, extraAlta, onCreada, onCerrar }) {
  const API = entorno.API ?? '';
  const tipos = (ob.catalogo?.tipos || []).filter(t => (nueva.tipo ? t.codigo === nueva.tipo : !t.solo_desde_marca));
  const [tipo, setTipo] = useState(nueva.tipo || 'PUNCH');
  const t = tipos.find(x => x.codigo === tipo) || {};
  const esObservacion = tipo === 'OBSERVACION';
  const [titulo, setTitulo] = useState(nueva.titulo || '');
  const [descripcion, setDescripcion] = useState(nueva.descripcion || '');
  const [asignado, setAsignado] = useState({});
  const [verificador, setVerificador] = useState('');
  const [observadores, setObservadores] = useState([]);
  const [vence, setVence] = useState(hoyMas(7));
  const [ubicacion, setUbicacion] = useState(nueva.ubicacion || '');
  const [revision, setRevision] = useState('');
  const [planos, setPlanos] = useState(null);
  const [clasif, setClasif] = useState({ subtipo: null, causa_raiz: null, campos: {} });
  const [adjuntos, setAdjuntos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // EL ESTADO SE ELIGE AL CREAR (como ACC): «Abierta» le llega ya al responsable; «Borrador» solo la ve quien la
  // levanta, si la obra usa borradores.
  const conBorrador = usaEstado('Borrador', ob.config ? ob.config.opcionales : null);
  const [estadoInicial, setEstadoInicial] = useState('Abierto');
  const yo = ob.yo;

  useEffect(() => {
    if (!t.exige_ubicacion || planos !== null || !obra) return;
    leerJson(entorno, `${API}/api/planos?model_urn=${encodeURIComponent(obra)}`).then(d => setPlanos((d?.planos || []).filter(p => p.vigente)));
  }, [t.exige_ubicacion, planos, obra]); // eslint-disable-line react-hooks/exhaustive-deps

  const crearla = async (borrador) => {
    if (!titulo.trim()) { entorno.avisar.error('Escribe qué hay que corregir.'); return; }
    if (!borrador) {
      if (t.exige_responsable && !asignado.responsable_id && !asignado.responsable_empresa) {
        entorno.avisar.error('Elige a quién le toca corregir: una persona o una empresa.'); return;
      }
      if (t.exige_verificador && !esObservacion && !verificador) {
        entorno.avisar.error('Este tipo exige a alguien que verifique la corrección.'); return;
      }
      if (t.exige_ubicacion && !revision) { entorno.avisar.error('Elige la lámina donde se levanta.'); return; }
      const falta = faltaObligatorio(ob.config, clasif.campos, tipo);
      if (falta) { entorno.avisar.error(`Falta «${falta.etiqueta}».`); return; }
    }
    if (asignado.responsable_id && String(asignado.responsable_id) === String(verificador)) {
      entorno.avisar.error('Quien corrige no puede ser quien verifica.'); return;
    }
    const cuerpo = {
      model_urn: obra, tipo, titulo: titulo.trim(), descripcion: descripcion.trim() || null, ...asignado,
      verificador_id: esObservacion ? undefined : (verificador ? Number(verificador) : null),
      observadores, vence_en: vence || null, ubicacion: ubicacion.trim() || null, revision_id: revision || null,
      subtipo: clasif.subtipo || null, causa_raiz: clasif.causa_raiz || null, campos: clasif.campos || {},
      adjuntos: adjuntos.map(a => ({ documento: a.documento })),
      ...(nueva.origen || {}), ...(borrador ? { borrador: true } : {}),
    };
    setEnviando(true);
    try {
      const hecha = crear ? await crear(cuerpo)
        : entorno.crearIncidencia ? await entorno.crearIncidencia(cuerpo)
          : await enviarJson(entorno, `${API}/api/issues`, cuerpo);
      // Sin `hecha` la guardó la aplicación en otro sitio (sin cobertura, en el dispositivo) y ya lo dijo ella.
      if (hecha) {
        entorno.avisar.ok(borrador ? `${hecha.codigo || 'Incidencia'} guardada como borrador: solo la ves tú`
          : `${hecha.codigo || 'Incidencia'} creada: le llega a quien la corrige`);
      }
      onCreada(hecha);
    } catch (e) { entorno.avisar.error(e.message); } finally { setEnviando(false); }
  };

  const personasVerifica = ob.miembros.filter(m => String(m.id) !== String(asignado.responsable_id));
  return (
    <div className="pinc-cuerpo pinc-alta">
      {!nueva.tipo && (
        <label className="pinc-campo">
          <span>Tipo</span>
          <select value={tipo} onChange={e => { setTipo(e.target.value); setClasif({ subtipo: null, causa_raiz: null, campos: {} }); }}>
            {tipos.map(x => <option key={x.codigo} value={x.codigo}>{x.etiqueta}</option>)}
          </select>
        </label>
      )}
      {conBorrador && (
        <label className="pinc-campo">
          <span>Estado</span>
          <select value={estadoInicial} onChange={e => setEstadoInicial(e.target.value)}>
            <option value="Abierto">Abierta: le llega al responsable al crearla</option>
            <option value="Borrador">Borrador: solo la ves tú hasta enviarla</option>
          </select>
        </label>
      )}
      <label className="pinc-campo">
        <span>Qué hay que corregir *</span>
        <input value={titulo} maxLength={180} autoFocus onChange={e => setTitulo(e.target.value)}
          placeholder="Ej. Revisar cotas y pendientes del tramo" />
      </label>
      <label className="pinc-campo">
        <span>Detalle <small>(opcional)</small></span>
        <textarea value={descripcion} maxLength={2000} rows={3} onChange={e => setDescripcion(e.target.value)} />
      </label>
      <ResponsableDeAlta miembros={ob.miembros} empresas={ob.empresas} valor={asignado} onChange={setAsignado}
        excluir={esObservacion ? yo : verificador} etiqueta={`Responsable de corregir${t.exige_responsable ? ' *' : ''}`} />
      {esObservacion ? (
        <p className="pinc-nota">La verificas tú, que la levantas.</p>
      ) : (
        <label className="pinc-campo">
          <span>Verifica{t.exige_verificador ? ' *' : ''}</span>
          <select value={verificador} onChange={e => setVerificador(e.target.value)}>
            <option value="">{t.exige_verificador ? 'Elige quién verifica…' : 'Sin designar'}</option>
            {personasVerifica.map(m => <option key={m.id} value={m.id}>{m.name || m.email}{m.empresa ? ` · ${m.empresa}` : ''}</option>)}
          </select>
          <small>Quien corrige no verifica su propia corrección.</small>
        </label>
      )}
      <label className="pinc-campo">
        <span>Fecha límite</span>
        <input type="date" value={vence} min={hoyMas(0)} onChange={e => setVence(e.target.value)} />
      </label>
      {t.exige_ubicacion && (
        <label className="pinc-campo">
          <span>Lámina *</span>
          <select value={revision} onChange={e => setRevision(e.target.value)}>
            <option value="">{planos === null ? 'Cargando…' : 'Elige la lámina vigente…'}</option>
            {(planos || []).map(p => <option key={p.id} value={p.vigente.id}>{p.numero} — {p.titulo} (rev. {p.vigente.codigo})</option>)}
          </select>
        </label>
      )}
      {!esObservacion && (
        <label className="pinc-campo">
          <span>Ubicación <small>(opcional)</small></span>
          <input value={ubicacion} maxLength={300} onChange={e => setUbicacion(e.target.value)} placeholder="Ej. Losa eje 4, nivel +3.20" />
        </label>
      )}
      <ObservadoresDeAlta miembros={ob.miembros} valor={observadores} onChange={setObservadores}
        excluir={[yo, asignado.responsable_id, verificador]} />
      <ClasificacionDeAlta config={ob.config} tipo={tipo} valores={clasif} onChange={setClasif} />

      <div className="pinc-campo">
        <span>Fotos y documentos <small>(opcional)</small></span>
        {adjuntos.length > 0 && (
          <ul className="pinc-minis">
            {adjuntos.map(a => (
              <Miniatura key={a.documento} entorno={entorno} adjunto={a} onAbrir={() => entorno.abrirDocumento?.(a.documento)}
                onQuitar={() => setAdjuntos(l => l.filter(x => x.documento !== a.documento))} />
            ))}
          </ul>
        )}
        <Adjuntar entorno={entorno} obra={obra} ocupado={ocupado} setOcupado={setOcupado}
          onAdjunto={async (a) => setAdjuntos(l => (l.some(x => x.documento === a.documento) ? l : [...l, a]))} />
      </div>

      {extraAlta}

      <div className="pinc-pie">
        <button type="button" className="pinc-btn pinc-btn--prim" disabled={enviando || ocupado || !titulo.trim()}
          onClick={() => crearla(conBorrador && estadoInicial === 'Borrador')}>
          {enviando ? 'Creando…' : conBorrador && estadoInicial === 'Borrador' ? 'Guardar borrador' : 'Crear'}</button>
        <button type="button" className="pinc-btn pinc-btn--plano" onClick={onCerrar} disabled={enviando}>Cancelar</button>
      </div>
    </div>
  );
}

// ── EL DETALLE ───────────────────────────────────────────────────────────────

const AYUDA_DEL_ACTO = {
  corregir: { titulo: 'Declarar corregida', boton: 'Declarar corregida', ayuda: 'Enseña la prueba: el documento corregido o una foto. Quien verifica la comprobará con ella.' },
  disputar: { titulo: 'No procede', boton: 'No procede', obligatorio: true, ayuda: 'Di por qué no hay que corregirlo. Pasa a quien la levantó, que la reafirma o la anula.' },
  reafirmar: { titulo: 'Reafirmar', boton: 'Reafirmar', obligatorio: true, ayuda: 'Responde al responsable: vuelve a él, abierta y con su fecha.' },
  reabrir: { titulo: 'No aprobar la corrección', boton: 'No aprobar', obligatorio: true, peligro: true, ayuda: 'Vuelve al responsable con el motivo, para que sepa qué rehacer.' },
  anular: { titulo: 'Anular', boton: 'Anular', obligatorio: true, peligro: true, ayuda: 'Para lo que se levantó por error. Queda en el historial con el motivo.' },
  autoverificacion: { titulo: 'Autorizar la autoverificación', boton: 'Autorizar', obligatorio: true, ayuda: 'Excepción: quien corrigió podrá cerrarla. Queda escrita en el historial.' },
};

function Acto({ entorno, obra, acto, i, onHacer, onCancelar }) {
  const a = AYUDA_DEL_ACTO[acto];
  const [texto, setTexto] = useState('');
  const [prueba, setPrueba] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const titulo = acto === 'anular' && i.estado === 'Borrador' ? 'Descartar el borrador' : a.titulo;
  const listo = (!a.obligatorio || texto.trim()) && (acto !== 'corregir' || prueba) && !ocupado;
  return (
    <div className="pinc-acto">
      <b>{titulo}</b>
      <p className="pinc-nota">{a.ayuda}</p>
      {acto === 'corregir' && (prueba
        ? <div className="pinc-adjuntos"><span>{prueba.nombre}</span>
            <button type="button" className="pinc-quitar" aria-label="Quitar la prueba" onClick={() => setPrueba(null)}>×</button></div>
        : <Adjuntar entorno={entorno} obra={obra} ocupado={ocupado} setOcupado={setOcupado} codigo={i.codigo} onAdjunto={async (x) => setPrueba(x)} />)}
      <textarea value={texto} rows={2} maxLength={2000} onChange={e => setTexto(e.target.value)}
        placeholder={a.obligatorio ? 'Motivo (obligatorio)' : 'Comentario (opcional)'} />
      <div className="pinc-botones">
        <button type="button" className={`pinc-btn ${a.peligro ? 'pinc-btn--peligro' : 'pinc-btn--prim'}`} disabled={!listo}
          onClick={async () => { setOcupado(true); try { await onHacer(texto.trim(), prueba); } finally { setOcupado(false); } }}>
          {acto === 'anular' && i.estado === 'Borrador' ? 'Descartar' : a.boton}</button>
        <button type="button" className="pinc-btn pinc-btn--plano" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

const ESTADOS_DONDE_SE_REASIGNA = ['Borrador', 'Abierto', 'En curso', 'Reabierto'];

// El PIN de la incidencia, en la hoja, en la cabecera del panel y en las listas. Es el MISMO dibujo del juego oficial
// (design/iconos/iconos-obra.json, «incidencia»: retícula 24, trazo 1,5, puntas redondas), relleno con el color de su
// estado (lista cerrada D-24) y perfilado en Light #faf9f5 para que se lea sobre cualquier plano. El número, en IBM
// Plex Sans 600, como el resto de la interfaz.
// EL PIN PROPIO (4-nov-2026, el dueño: «que no vaya el número y que tengamos uno propio, ese parece al de Autodesk»):
// un HITO, como los de topografía: un rombo del color de su estado, con su punto, y la punta de abajo en el sitio
// (y = 21, como el anterior). `numero` se acepta y no se pinta.
const PIN = 'M12 21 4 12 12 3 20 12Z';
// Su geometría, para quien lo coloca en la hoja: dibujado en una caja de `lado`, con la punta (el sitio) en `punta` y
// el centro del rombo en `centro`, las dos en el eje vertical de esa caja.
export const GEOMETRIA_DEL_PIN = { lado: 24, punta: 21, centro: 12 };
const CLARO = '#faf9f5';
export function PinDeIncidencia({ color = '#d97757', tamano = 28, numero: _numero = null, ...resto }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }} {...resto}>
      <path d={PIN} fill={color} stroke={CLARO} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.3" fill={CLARO} />
    </svg>
  );
}

export const numeroDe = (codigo) => (/(\d+)\s*$/.exec(String(codigo || '')) || [])[1]?.replace(/^0+(?=\d)/, '') || null;


/** Una miniatura de un adjunto: la imagen si la aplicación sabe darla; si no, el icono de documento. */
function Miniatura({ entorno, adjunto, onAbrir, onQuitar }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!entorno.miniatura || !/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(adjunto.nombre || '')) return undefined;
    let vivo = true;
    let creada = null;
    entorno.miniatura(adjunto.documento).then((b) => {
      if (vivo && b) { creada = URL.createObjectURL(b); setUrl(creada); }
    }).catch(() => {});
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [entorno, adjunto.documento, adjunto.nombre]);
  return (
    <li className="pinc-mini">
      <button type="button" className="pinc-mini__img" onClick={onAbrir} title={adjunto.nombre}>
        {url ? <img src={url} alt={adjunto.nombre} />
          : <Ico><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></Ico>}
      </button>
      <span className="pinc-mini__nombre" title={adjunto.nombre}>{adjunto.nombre}</span>
      {onQuitar && <button type="button" className="pinc-mini__quitar" aria-label={`Quitar ${adjunto.nombre}`} onClick={onQuitar}>×</button>}
    </li>
  );
}

function Detalle({ entorno, obra, ob, issueId, extraDetalle, nube = null, vez = null, onIrAMarca = null, onCompararNube = null,
                  onCambio, onCargada, onDescartada }) {
  const API = entorno.API ?? '';
  const [i, setI] = useState(null);
  const [acto, setActo] = useState(null);
  const [editando, setEditando] = useState(null);       // 'asignar' | 'observadores' | 'clasificar'
  const [borrador, setBorrador] = useState({});
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [menuEstado, setMenuEstado] = useState(false);
  // TRES PESTAÑAS (3-nov-2026, el dueño: «lo que le corresponde al issue, lo que corresponde a cada nube y el
  // historial; si hago clic a la nube se abre en esa pestaña»).
  const [pestana, setPestana] = useState(nube != null ? 'nubes' : 'incidencia');
  // LAS NUBES, DE LA COPIA ÚNICA (datosDeNubes.js): lo que cambia en la barra de la nube se ve aquí y al revés.
  // Cada pedido nuevo (un clic en su pin o en una de sus nubes) abre donde se pidió: el pin, en «Incidencia»; la nube,
  // en «Nubes». Antes, con «Nubes» ya abierta, el clic en el pin no llevaba a su información (4-nov-2026).
  useEffect(() => { setPestana(nube != null ? 'nubes' : 'incidencia'); }, [nube, vez]);
  const comentando = useRef(false);    // un comentario no sale dos veces aunque se pulse dos veces seguidas

  const cargar = useCallback(async () => {
    const d = await leerJson(entorno, `${API}/api/issues/${encodeURIComponent(issueId)}`);
    setI(d || false);
    if (d) onCargada?.(d);
  }, [API, issueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);
  // Las nubes van aparte: un servidor sin la 46 responde que no, y el panel sigue con sus dos pestañas de siempre.
  const leerNubes = (id) => leerJson(entorno, `${API}/api/issues/${encodeURIComponent(id)}/nubes`);
  const nubes = useNubesDeIncidencia(leerNubes, issueId);

  const hacer = async (ruta, cuerpo, ok) => {
    setOcupado(true);
    try {
      const d = await enviarJson(entorno, `${API}/api/issues/${issueId}/${ruta}`, cuerpo);
      setI(d);
      onCargada?.(d);
      setActo(null); setEditando(null);
      if (ok) entorno.avisar.ok(ok);
      onCambio?.(d);
      recargarNubes(leerNubes, issueId).catch(() => {});   // su estado cambia el de sus nubes («por verificar»)
      return true;
    } catch (e) {
      entorno.avisar.error(e.message);
      if (e.code === 'NUBES_SIN_LEVANTAR') { setActo(null); setPestana('nubes'); }
      return false;
    } finally { setOcupado(false); }
  };

  if (i === null) return <div className="pinc-cuerpo"><p className="pinc-nota">Cargando…</p></div>;
  if (i === false) return <div className="pinc-cuerpo"><p className="pinc-nota">Esta incidencia no existe o no la puedes ver.</p></div>;

  const yo = ob.yo;
  const e = estadoDeIssue(i.estado);
  const actos = actosDeIssue(i, yo, { opcionales: ob.config ? ob.config.opcionales : null, esAdmin: ob.esAdmin, miEmpresa: ob.miEmpresa });
  const verifica = puedeVerificar(i, yo, ob.esAdmin, ob.miEmpresa);
  const autoverif = ob.esAdmin && i.estado === 'Corregido' && i.responsable_id && !i.verificador_id && !i.autoverificacion;
  const soyAutor = yo != null && String(i.autor_id) === String(yo);
  const dirige = soyAutor || ob.esAdmin;
  const interviene = dirige || esDelResponsable(i, yo, ob.miEmpresa) || String(i.verificador_id) === String(yo);
  const cerrada = ['Verificado', 'Anulado'].includes(i.estado);
  const sigo = (i.observadores || []).some(u => String(u) === String(yo));
  const responsable = i.responsable_id ? (ob.nombres[i.responsable_id] || `usuario ${i.responsable_id}`)
    : i.responsable_empresa ? `${ob.nombresDeEmpresa[i.responsable_empresa] || 'Empresa'} (empresa)` : null;
  const verificador = i.verificador_id ? (ob.nombres[i.verificador_id] || `usuario ${i.verificador_id}`) : null;
  const autor = ob.nombres[i.autor_id] || null;
  const vence = String(i.vence_en || '').slice(0, 10);
  const vencida = vence && vence < hoyMas(0) && issueViva(i);
  // LOS COMENTARIOS SON SOLO LO QUE ESCRIBE LA GENTE (el dueño: «el chat solo es cuando un usuario quiere comentar
  // algo»); el resto de pasos va al historial, plegado debajo.
  const lineas = (i.history || []).filter(h => h && typeof h === 'object');
  const comentarios = lineas.filter(h => h.event === 'commented');
  const historial = lineas.filter(h => h.event !== 'commented');
  const campos = camposDelTipo(ob.config, i.tipo);
  const clasificacion = [i.subtipo && `Subtipo: ${i.subtipo}`, i.causa_raiz && `Causa raíz: ${i.causa_raiz}`,
    ...campos.filter(c => (i.campos || {})[c.clave] != null).map(c => `${c.etiqueta}: ${(i.campos || {})[c.clave]}`)].filter(Boolean);
  const hayClasificacion = clasificacion.length || ((ob.config?.subtipos || {})[i.tipo] || []).length
    || (ob.config?.causas || []).length || campos.length;
  // EL ESTADO SE CAMBIA DESDE EL ESTADO (como ACC): un desplegable con los pasos que salen del actual. Los que esta
  // persona puede dar se eligen; los de otros se ven apagados con quién los da, para que nadie se quede sin saber
  // «cómo se pasa al otro».
  const quienDa = { responsable: responsable || 'el responsable', autor: autor || 'quien la levantó',
    verificador: verificador || (i.tipo === 'OBSERVACION' ? autor : null) || 'quien verifica' };
  const puede = (acto) => (acto === 'verificar' || acto === 'reabrir' ? verifica : !!actos[acto]);
  const pasos = pasosDeEstado(i, { opcionales: ob.config ? ob.config.opcionales : null })
    .map(p => ({ ...p, puede: puede(p.acto) }));
  const misPasos = pasos.filter(p => p.puede);
  const dar = (p) => {
    setMenuEstado(false);
    if (p.acto === 'enviar') hacer('enviar', {}, 'Enviada: le llega al responsable');
    else if (p.acto === 'empezar') hacer('empezar', {}, 'En curso');
    else if (p.acto === 'verificar') hacer('verificar', { acepta: true }, 'Verificada y cerrada');
    // Un BORRADOR se descarta (se borra de verdad, nunca llegó a nadie); lo enviado se anula con su motivo.
    else if (p.acto === 'anular' && i.estado === 'Borrador') setActo('descartar');
    else setActo(p.acto);
  };
  const ETIQUETA_DEL_PASO = { anular: i.estado === 'Borrador' ? 'Descartar' : null, reabrir: 'No aprobar' };

  const comentar = async () => {
    const t = comentario.trim();
    if (!t || comentando.current) return;
    comentando.current = true;
    try { if (await hacer('comentar', { texto: t })) setComentario(''); } finally { comentando.current = false; }
  };

  // LO QUE TE TOCA (2-nov-2026, el dueño: «más profesional e intuitivo»). Arriba, en una frase, a quién le toca y
  // qué; si te toca a ti, el botón del paso principal y los otros pasos tuyos al lado. El desplegable del estado
  // sigue teniendo todos los pasos, con quién los da.
  const esResp = esDelResponsable(i, yo, ob.miEmpresa);
  const fechaVence = fechaDeDia(vence);
  const antesDe = fechaVence ? ` antes del ${fechaVence}` : '';
  let turno = null;
  if (i.estado === 'Borrador') {
    const sinResponsable = !i.responsable_id && !i.responsable_empresa;
    turno = {
      mio: true,
      texto: sinResponsable ? 'Es un borrador: solo lo ves tú. Para enviarlo, asígnale antes un responsable (en «Asignada a»).'
        : 'Es un borrador: solo lo ves tú. Al enviarlo le llega al responsable, con su fecha.',
      prim: actos.enviar && !sinResponsable ? { etiqueta: 'Enviar', fn: () => dar({ acto: 'enviar' }) } : null,
      sec: [{ etiqueta: 'Descartar', fn: () => setActo('descartar'), peligro: true }],
    };
  } else if (['Abierto', 'Reabierto', 'En curso'].includes(i.estado)) {
    turno = esResp && actos.corregir ? {
      mio: true,
      texto: `Te toca corregirla${antesDe}.${i.estado === 'Reabierto' ? ' La corrección anterior no se aprobó: el motivo está en el historial.' : ''}`,
      prim: { etiqueta: 'Declarar corregida', fn: () => setActo('corregir') },
      sec: [actos.empezar && { etiqueta: 'Empezar', fn: () => dar({ acto: 'empezar' }) },
        actos.disputar && { etiqueta: 'No procede', fn: () => setActo('disputar') }].filter(Boolean),
    } : { texto: `Le toca a ${quienDa.responsable} corregirla${antesDe}.` };
  } else if (i.estado === 'En disputa') {
    turno = actos.reafirmar ? {
      mio: true, texto: `${quienDa.responsable} dice que no procede. Te toca decidir.`,
      prim: { etiqueta: 'Reafirmar', fn: () => setActo('reafirmar') },
      sec: actos.anular ? [{ etiqueta: 'Anular', fn: () => setActo('anular'), peligro: true }] : [],
    } : { texto: `${quienDa.responsable} dice que no procede. Decide ${quienDa.autor}.` };
  } else if (i.estado === 'Corregido') {
    turno = verifica ? {
      mio: true, texto: 'Te toca verificar la corrección.',
      prim: { etiqueta: 'Verificar y cerrar', fn: () => dar({ acto: 'verificar' }) },
      sec: [{ etiqueta: 'No aprobar', fn: () => setActo('reabrir'), peligro: true }],
    } : {
      texto: esResp ? `Corregiste tú: la verifica ${quienDa.verificador}. Quien corrige no verifica su propia corrección.`
        : `Le toca a ${quienDa.verificador} verificar la corrección.`,
    };
  } else if (i.estado === 'Verificado') {
    turno = { fin: true, texto: `Cerrada${i.verificado_en ? ` el ${fechaCorta(i.verificado_en)}` : ''}: la corrección se verificó.` };
  } else if (i.estado === 'Anulado') {
    turno = { fin: true, texto: 'Anulada: se levantó por error. El motivo está en el historial.' };
  }
  const reasignable = dirige && ESTADOS_DONDE_SE_REASIGNA.includes(i.estado);
  const listaDeNubes = nubes?.nubes || [];
  const hayNubes = listaDeNubes.length > 0 || (nubes?.encargos_internos || 0) > 0;
  // El número que guarda la nube (47): el mismo en la hoja, en la pestaña y en el historial.
  const numeroDeNube = (id) => listaDeNubes.find(n => String(n.id) === String(id))?.numero ?? null;
  const verPestana = hayNubes ? pestana : (pestana === 'nubes' ? 'incidencia' : pestana);
  const nombresObs = (i.observadores || []).map(u => ob.nombres[u] || `usuario ${u}`);

  return (
    <div className="pinc-cuerpo pinc-detalle">
      <div className="pinc-cabeza">
        <h3 className="pinc-titulo">{i.titulo}</h3>
        <div className="pinc-estado">
          <span className="pinc-estado__caja">
            <button type="button" className="pinc-chip pinc-chip--boton" style={{ '--estado': e.color }}
              aria-haspopup="menu" aria-expanded={menuEstado} disabled={!pasos.length || ocupado || !!acto}
              aria-label={`Estado: ${e.etiqueta}${pasos.length ? '. Cambiar el estado' : ''}`}
              data-tip={misPasos.length ? 'Cambiar el estado' : pasos.length ? 'Ver quién da cada paso' : undefined}
              onClick={() => setMenuEstado(v => !v)}>
              <i />{e.etiqueta}
              {pasos.length > 0 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}
            </button>
            {menuEstado && (
              <>
                <span className="pinc-telon" onClick={() => setMenuEstado(false)} aria-hidden="true" />
                <span className="pinc-estado-menu" role="menu" aria-label="Cambiar el estado">
                  {pasos.map(p => {
                    const est = estadoDeIssue(p.a);
                    return (
                      <button key={p.acto} type="button" role="menuitem" disabled={!p.puede} onClick={() => dar(p)}>
                        <i style={{ background: est.color }} />
                        <span>{ETIQUETA_DEL_PASO[p.acto] || est.etiqueta}</span>
                        {!p.puede && <small>lo da {quienDa[p.quien]}</small>}
                      </button>
                    );
                  })}
                </span>
              </>
            )}
          </span>
          {fechaVence && (
            <span className={`pinc-vence${vencida ? ' es-vencida' : ''}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>
              {vencida ? `Vencida · ${fechaVence}` : fechaVence}
            </span>
          )}
          {i.estado !== 'Borrador' && (
            <button type="button" className={`pinc-seguir${sigo ? ' es-activo' : ''}`} disabled={ocupado} aria-pressed={sigo}
              onClick={() => hacer('editar', { seguir: !sigo }, sigo ? 'Ya no la sigues' : 'La sigues: te avisaremos de cada paso')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={sigo ? 'currentColor' : 'none'} stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 16.5v-5.5a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
              {sigo ? 'Siguiendo' : 'Seguir'}
            </button>
          )}
        </div>
      </div>

      {turno && !acto && (
        <div className={`pinc-turno${turno.mio ? ' es-mio' : ''}${turno.fin ? ' es-fin' : ''}`} style={{ '--estado': e.color }}>
          <p>{turno.texto}</p>
          {(turno.prim || (turno.sec || []).length > 0) && (
            <div className="pinc-botones">
              {turno.prim && <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado} onClick={turno.prim.fn}>{turno.prim.etiqueta}</button>}
              {(turno.sec || []).map(s => (
                <button key={s.etiqueta} type="button" className={`pinc-btn ${s.peligro ? 'pinc-btn--plano pinc-btn--rojo' : ''}`}
                  disabled={ocupado} onClick={s.fn}>{s.etiqueta}</button>
              ))}
            </div>
          )}
          {autoverif && (
            <button type="button" className="pinc-enlace pinc-enlace--suelto" onClick={() => setActo('autoverificacion')}>
              Autorizar que el responsable verifique su propia corrección</button>
          )}
        </div>
      )}

      {acto === 'descartar' && (
        <div className="pinc-acto">
          <b>¿Descartar este borrador?</b>
          <p className="pinc-nota">Se borra. Nadie más lo ha visto: no llegó al responsable ni a los observadores. Lo que
            ya se envió no se borra nunca, se anula.</p>
          <div className="pinc-botones">
            <button type="button" className="pinc-btn pinc-btn--peligro" disabled={ocupado} onClick={async () => {
              setOcupado(true);
              try {
                await enviarJson(entorno, `${API}/api/issues/${issueId}/descartar`, {});
                entorno.avisar.ok('Borrador descartado');
                onDescartada?.();
              } catch (err) { entorno.avisar.error(err.message); setOcupado(false); }
            }}>Descartar</button>
            <button type="button" className="pinc-btn pinc-btn--plano" onClick={() => setActo(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {acto && acto !== 'descartar' && <Acto entorno={entorno} obra={obra} acto={acto} i={i} onCancelar={() => setActo(null)}
        onHacer={(texto, prueba) => {
          if (acto === 'corregir') {
            return hacer('corregir', { evidencia: [{ tipo: 'documento', documento: prueba.documento, nombre: prueba.nombre }], comentario: texto },
              'Declarada corregida: pasa a revisión');
          }
          if (acto === 'reabrir') return hacer('verificar', { acepta: false, motivo: texto }, 'No aprobada: vuelve al responsable');
          return hacer(acto, { motivo: texto }, { disputar: 'En disputa: decide quien la levantó', reafirmar: 'Reafirmada: vuelve al responsable',
            anular: 'Anulada', autoverificacion: 'Autoverificación autorizada' }[acto]);
        }} />}

      {(i.evidencia_correccion || []).length > 0 && (
        <div className="pinc-correccion">
          <b>Corrección</b>
          {i.evidencia_correccion.map((ev, n) => (
            <div key={n}>
              {ev.documento
                ? <button type="button" className="pinc-cita" onClick={() => entorno.abrirDocumento?.(ev.documento)}>{ev.nombre || 'Documento corregido'}</button>
                : <span>{ev.nombre || 'Evidencia'}</span>}
              {ev.comentario && <p className="pinc-texto">{ev.comentario}</p>}
            </div>
          ))}
        </div>
      )}

      {/* PESTAÑAS COMO MANDA EL PATRÓN (WAI-ARIA «tabs»): cada una dice qué panel controla, solo la elegida está en el
          orden del tabulador y las flechas pasan de una a otra. */}
      <div className="pinc-pestanas pinc-pestanas--panel" role="tablist" aria-label="Partes de la incidencia"
        onKeyDown={(ev) => {
          const orden = ['incidencia', ...(hayNubes ? ['nubes'] : []), 'historial'];
          const k = orden.indexOf(verPestana);
          const sig = ev.key === 'ArrowRight' ? orden[(k + 1) % orden.length]
            : ev.key === 'ArrowLeft' ? orden[(k - 1 + orden.length) % orden.length]
              : ev.key === 'Home' ? orden[0] : ev.key === 'End' ? orden[orden.length - 1] : null;
          if (!sig) return;
          ev.preventDefault();
          setPestana(sig);
          ev.currentTarget.querySelector(`#pinc-tab-${issueId}-${sig}`)?.focus();
        }}>
        {[['incidencia', 'Incidencia', comentarios.length], ...(hayNubes ? [['nubes', 'Nubes', listaDeNubes.length]] : []),
          ['historial', 'Historial', historial.length]].map(([clave, rotulo, cuantos]) => (
          <button key={clave} type="button" role="tab" id={`pinc-tab-${issueId}-${clave}`} aria-controls={`pinc-panel-${issueId}`}
            aria-selected={verPestana === clave} tabIndex={verPestana === clave ? 0 : -1} onClick={() => setPestana(clave)}>
            {rotulo} <span>{cuantos || ''}</span></button>
        ))}
      </div>
      <div id={`pinc-panel-${issueId}`} role="tabpanel" aria-labelledby={`pinc-tab-${issueId}-${verPestana}`} className="pinc-tabpanel">

      {verPestana === 'nubes' && (
        <NubesDeIncidencia entorno={entorno} obra={obra} ob={ob} i={i} datos={nubes} foco={nube} onIrAMarca={onIrAMarca}
          onComparar={onCompararNube}
          onCambio={(d) => { fijarNubes(i.id, d); cargar(); }} />
      )}

      {verPestana === 'historial' && (
        <ol className="pinc-actividad pinc-actividad--historial">
          {historial.map((h, n) => {
            const quien = ob.nombreDeQuien(h.by);
            return (
              <li key={`${h.at}-${n}`}>
                <span className="pinc-punto" style={{ '--estado': e.color }} aria-hidden="true" />
                <div>
                  <div className="pinc-actividad__cab"><span><b>{quien || 'Alguien'}</b> {textoDeEvento(h, numeroDeNube)}</span><small>{fechaCorta(h.at)}</small></div>
                  {(h.motivo || h.comentario) && <p>{h.motivo || h.comentario}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {verPestana === 'incidencia' && <>
      <section className="pinc-seccion">
        <h4>Detalles</h4>
        <dl className="pinc-filas">
          <div className="pinc-fila">
            <dt>Asignada a</dt>
            <dd>
              {reasignable && editando !== 'asignar' ? (
                <button type="button" className="pinc-valor" data-tip="Reasignar"
                  onClick={() => { setBorrador({}); setEditando('asignar'); }}>
                  <span className="pinc-avatar pinc-avatar--chico" aria-hidden="true">{iniciales(responsable)}</span>
                  {responsable || 'Sin asignar'}
                  <IcoEditar />
                </button>
              ) : (
                <span className="pinc-valor pinc-valor--fijo">
                  {responsable && <span className="pinc-avatar pinc-avatar--chico" aria-hidden="true">{iniciales(responsable)}</span>}
                  {responsable || 'Sin asignar'}
                </span>
              )}
            </dd>
          </div>
          {editando === 'asignar' && (
            <div className="pinc-editor">
              <ResponsableDeAlta miembros={ob.miembros} empresas={ob.empresas} valor={borrador} excluir={i.verificador_id}
                etiqueta="Nuevo responsable" onChange={setBorrador} />
              <div className="pinc-botones">
                <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado || !(borrador.responsable_id || borrador.responsable_empresa)}
                  onClick={() => hacer('editar', borrador, 'Reasignada: le llega al nuevo responsable')}>Reasignar</button>
                <button type="button" className="pinc-btn pinc-btn--plano" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </div>
          )}
          <div className="pinc-fila">
            <dt>Verifica</dt>
            <dd><span className="pinc-valor pinc-valor--fijo">{quienDa.verificador}</span></dd>
          </div>
          <div className="pinc-fila">
            <dt>Observadores</dt>
            <dd>
              <span className="pinc-chips">
                {nombresObs.map(n => (
                  <span key={n} className="pinc-persona"><span className="pinc-avatar pinc-avatar--chico" aria-hidden="true">{iniciales(n)}</span>{n}</span>
                ))}
                {!nombresObs.length && editando !== 'observadores' && <span className="pinc-vacio">Nadie</span>}
                {dirige && editando !== 'observadores' && (
                  <button type="button" className="pinc-anadir"
                    onClick={() => { setBorrador({ observadores: i.observadores || [] }); setEditando('observadores'); }}>
                    {nombresObs.length ? 'Cambiar' : '+ Añadir'}</button>
                )}
              </span>
            </dd>
          </div>
          {editando === 'observadores' && (
            <div className="pinc-editor">
              <ObservadoresDeAlta miembros={ob.miembros} valor={borrador.observadores || []} onChange={v => setBorrador({ observadores: v })} />
              <div className="pinc-botones">
                <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado}
                  onClick={() => hacer('editar', { observadores: borrador.observadores || [] }, 'Observadores guardados')}>Guardar</button>
                <button type="button" className="pinc-btn pinc-btn--plano" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {(i.ubicacion || i.progresiva) && (
            <div className="pinc-fila">
              <dt>Ubicación</dt>
              <dd><span className="pinc-valor pinc-valor--fijo pinc-valor--largo">{[i.ubicacion, i.progresiva].filter(Boolean).join(' · ')}</span></dd>
            </div>
          )}
          {hayClasificacion ? (
            <div className="pinc-fila">
              <dt>Clasificación</dt>
              <dd>
                {interviene && editando !== 'clasificar' ? (
                  <button type="button" className="pinc-valor" data-tip={cerrada ? 'Indicar la causa raíz' : 'Editar la clasificación'}
                    onClick={() => { setBorrador({ subtipo: i.subtipo, causa_raiz: i.causa_raiz, campos: i.campos || {} }); setEditando('clasificar'); }}>
                    {clasificacion.join(' · ') || 'Sin clasificar'}<IcoEditar />
                  </button>
                ) : <span className="pinc-valor pinc-valor--fijo">{clasificacion.join(' · ') || 'Sin clasificar'}</span>}
              </dd>
            </div>
          ) : null}
          {editando === 'clasificar' && (
            <div className="pinc-editor">
              <ClasificacionDeAlta config={cerrada ? { causas: ob.config?.causas } : ob.config} tipo={i.tipo} valores={borrador} onChange={setBorrador} />
              <div className="pinc-botones">
                <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado}
                  onClick={() => hacer('editar', cerrada ? { causa_raiz: borrador.causa_raiz } : borrador, 'Clasificación guardada')}>Guardar</button>
                <button type="button" className="pinc-btn pinc-btn--plano" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </div>
          )}
          <div className="pinc-fila">
            <dt>Levantó</dt>
            <dd><span className="pinc-valor pinc-valor--fijo">{[autor, fechaCorta(i.creado_en)].filter(Boolean).join(' · ') || '—'}</span></dd>
          </div>
        </dl>
        {extraDetalle?.(i)}
      </section>

      {i.descripcion && (
        <section className="pinc-seccion">
          <h4>Descripción</h4>
          <p className="pinc-texto">{i.descripcion}</p>
        </section>
      )}

      <section className="pinc-seccion">
        <h4>Fotos y documentos <span>{(i.adjuntos || []).length || ''}</span></h4>
        <ul className="pinc-minis">
          {(i.adjuntos || []).map(a => (
            <Miniatura key={a.documento} entorno={entorno} adjunto={a} onAbrir={() => entorno.abrirDocumento?.(a.documento)}
              onQuitar={!cerrada && a.por_id != null && String(a.por_id) === String(yo)
                ? () => hacer('adjuntar', { quitar: a.documento }, 'Adjunto quitado') : null} />
          ))}
          {interviene && !cerrada && (
            <TeselaDeAdjuntar entorno={entorno} obra={obra} ocupado={ocupado} setOcupado={setOcupado} codigo={i.codigo}
              onAdjunto={(a) => hacer('adjuntar', { documento: a.documento }, 'Adjuntado')} />
          )}
        </ul>
        {!(i.adjuntos || []).length && !(interviene && !cerrada) && <p className="pinc-nota">Sin fotos ni documentos.</p>}
      </section>

      <section className="pinc-seccion pinc-conversacion">
        <h4>Comentarios <span>{comentarios.length || ''}</span></h4>
        {comentarios.length ? (
          <ol className="pinc-actividad">
            {comentarios.map((h, n) => {
              const quien = ob.nombreDeQuien(h.by);
              return (
                <li key={`${h.at}-${n}`} className="es-comentario">
                  <span className="pinc-avatar" aria-hidden="true">{iniciales(quien)}</span>
                  <div>
                    <div className="pinc-actividad__cab"><b>{quien || 'Alguien'}</b><small>{fechaCorta(h.at)}</small></div>
                    <p>{h.texto}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="pinc-nota">Aún no hay comentarios. Escribe abajo para preguntar o aclarar algo a quienes la siguen.</p>}
      </section>

      <div className="pinc-comentar">
        <textarea value={comentario} onChange={ev => setComentario(ev.target.value)} rows={/\n/.test(comentario) || comentario.length > 60 ? 3 : 1}
          maxLength={2000} placeholder="Escribe un comentario…" aria-label="Comentario"
          onKeyDown={ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); comentar(); } }} />
        <button type="button" className="pinc-btn pinc-btn--prim" disabled={!comentario.trim() || ocupado} onClick={comentar}>Comentar</button>
      </div>
      </>}
      </div>
    </div>
  );
}

const IcoEditar = () => (
  <svg className="pinc-valor__lapiz" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 5.5l4 4" /><path d="M16.6 3.4a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 19l-4.5 1 1-4.5z" /></svg>
);

/** Añadir una foto o un documento: una tesela más del mosaico de adjuntos, con un menú de dos opciones. */
function TeselaDeAdjuntar({ entorno, obra, ocupado, setOcupado, onAdjunto, codigo }) {
  const foto = useRef(null);
  const [menu, setMenu] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const Elegir = entorno.ElegirDocumento;
  const subir = async (lista) => {
    for (const f of [...(lista || [])]) {
      setOcupado(true);
      try {
        const s = await entorno.subirFoto(obra, f, codigo ? `Adjunto de ${codigo}` : 'Adjunto de una incidencia');
        await onAdjunto({ documento: s.id, nombre: s.nombre || f.name });
      } catch (e) { entorno.avisar.error(`${f.name}: ${e.message}`); } finally { setOcupado(false); }
    }
    if (foto.current) foto.current.value = '';
  };
  return (
    <li className="pinc-mini pinc-mini--nuevo">
      <input ref={foto} type="file" accept="image/*" multiple hidden onChange={e => subir(e.target.files)} />
      <button type="button" className="pinc-mini__img" disabled={ocupado} aria-haspopup="menu" aria-expanded={menu}
        onClick={() => setMenu(v => !v)}>
        {ocupado ? <span className="pinc-nota">Subiendo…</span> : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        )}
      </button>
      <span className="pinc-mini__nombre">Añadir</span>
      {menu && (
        <>
          <span className="pinc-telon" onClick={() => setMenu(false)} aria-hidden="true" />
          <span className="pinc-estado-menu pinc-mini__menu" role="menu">
            {entorno.subirFoto && (
              <button type="button" role="menuitem" onClick={() => { setMenu(false); foto.current?.click(); }}>
                <span>Subir fotos</span><small>Del equipo o del móvil; quedan en MULTIMEDIA de la obra</small></button>
            )}
            {Elegir && (
              <button type="button" role="menuitem" onClick={() => { setMenu(false); setEligiendo(true); }}>
                <span>Documento de la obra</span><small>Un plano, informe o foto que ya está en Docs</small></button>
            )}
          </span>
        </>
      )}
      {eligiendo && Elegir && createPortal(
        <Elegir obra={obra} titulo="Adjuntar un documento"
          ayuda="Un documento de esta obra: plano, informe, foto… Quien abra la incidencia lo abrirá desde aquí."
          onElegir={(doc) => { setEligiendo(false); onAdjunto({ documento: doc.file_node_id || doc.id, nombre: doc.nombre || doc.name }); }}
          onCerrar={() => setEligiendo(false)} />,
        document.fullscreenElement || document.body,
      )}
    </li>
  );
}

// ── EL PANEL ─────────────────────────────────────────────────────────────────

// EL PANEL NO ES DEL LIENZO (2-nov-2026, el dueño: «cuando hago clic dentro del panel se mueve el plano, y en Detalle
// no se puede escribir»). El panel se dibuja en otro sitio del DOM, pero React hace subir sus eventos por el árbol de
// componentes hasta quien lo monta: en el lector, el contenedor del plano, que con «Mover» arrastra la hoja y anula
// el clic (`preventDefault`), así que un campo nunca recibía el foco ni un desplegable se abría. Lo que pasa dentro
// del panel se queda dentro.
export const AISLADO = Object.fromEntries(['onMouseDown', 'onMouseUp', 'onMouseMove', 'onPointerDown', 'onPointerUp',
  'onPointerMove', 'onClick', 'onDoubleClick', 'onWheel', 'onKeyDown', 'onContextMenu']
  .map(k => [k, (e) => e.stopPropagation()]));

export default function PanelDeIncidencia({ entorno, obra, issueId = null, nueva = null, crear = null, titulo = null,
                                            extraAlta = null, extraDetalle = null, contenedor = null,
                                            nube = null, vez = null, onIrAMarca = null, onCompararNube = null,
                                            onVolver = null, onCreada, onCambio, onCerrar }) {
  const ob = useObraDeIncidencias(entorno, obra);
  const [id, setId] = useState(issueId);
  const [codigo, setCodigo] = useState(null);
  const [cargada, setCargada] = useState(null);
  useEffect(() => { setId(issueId); }, [issueId]);
  const tipoNuevo = (ob.catalogo?.tipos || []).find(t => t.codigo === nueva?.tipo);
  const cabecera = id ? (codigo || 'Incidencia') : (titulo || (tipoNuevo ? `Nueva ${tipoNuevo.etiqueta.toLowerCase()}` : 'Nueva incidencia'));
  const destino = contenedor || document.body;
  return createPortal(
    // `data-obstaculo`: lo que el lector no tapa (la barra de la marca se aparta); `data-panel-de-incidencia`: pulsar
    // en él no suelta la nube cuya incidencia enseña (docs/archivos/25).
    <aside className={`pinc${contenedor ? ' pinc--dentro' : ''}`} aria-label={id ? `Incidencia ${codigo || ''}` : 'Nueva incidencia'}
      data-obstaculo data-panel-de-incidencia
      {...AISLADO}>
      <header className="pinc-cab">
        {onVolver && <button type="button" className="pinc-icono" onClick={onVolver} aria-label="Volver"><Ico><path d="M15 6l-6 6 6 6" /></Ico></button>}
        <PinDeIncidencia color={id && cargada ? estadoDeIssue(cargada.estado).color : '#b0aea5'}
          numero={id && cargada ? numeroDe(cargada.codigo) : null} />
        <div className="pinc-cab__tit">
          <b>{cabecera}</b>
          {!id && nueva?.lugar && <small>{nueva.lugar}</small>}
          {id && cargada && <small>{cargada.tipo_etiqueta || ''}</small>}
        </div>
        <button type="button" className="pinc-icono" onClick={onCerrar} aria-label="Cerrar"><Ico><path d="M6 6l12 12M18 6 6 18" /></Ico></button>
      </header>
      {id ? (
        <Detalle key={id} entorno={entorno} obra={obra} ob={ob} issueId={id} extraDetalle={extraDetalle}
          nube={nube} vez={vez} onIrAMarca={onIrAMarca} onCompararNube={onCompararNube}
          onCargada={(d) => { setCodigo(d?.codigo || null); setCargada(d); }} onCambio={onCambio}
          onDescartada={() => { onCambio?.(null); if (onVolver) onVolver(); else onCerrar?.(); }} />
      ) : (
        <Alta entorno={entorno} obra={obra} ob={ob} nueva={nueva || {}} crear={crear} extraAlta={extraAlta} onCerrar={onCerrar}
          onCreada={(hecha) => {
            onCreada?.(hecha);
            if (hecha?.id) { setCodigo(hecha.codigo || null); setId(String(hecha.id)); } else onCerrar?.();
          }} />
      )}
    </aside>,
    destino,
  );
}
