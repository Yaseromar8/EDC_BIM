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
import { EVENTOS_DE_ISSUE, actosDeIssue, aQuienLeTocaIssue, esDelResponsable, estadoDeIssue, issueViva,
         puedeVerificar, usaEstado } from './reglas.js';
import { ClasificacionDeAlta, ObservadoresDeAlta, ResponsableDeAlta, camposDelTipo, enviarJson, faltaObligatorio,
         leerJson, useObraDeIncidencias } from './piezas.jsx';
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

function fechaCorta(iso) {
  const d = iso ? new Date(iso) : null;
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
          <ul className="pinc-adjuntos">
            {adjuntos.map(a => (
              <li key={a.documento}>
                <span>{a.nombre}</span>
                <button type="button" className="pinc-quitar" aria-label={`Quitar ${a.nombre}`}
                  onClick={() => setAdjuntos(l => l.filter(x => x.documento !== a.documento))}>×</button>
              </li>
            ))}
          </ul>
        )}
        <Adjuntar entorno={entorno} obra={obra} ocupado={ocupado} setOcupado={setOcupado}
          onAdjunto={async (a) => setAdjuntos(l => (l.some(x => x.documento === a.documento) ? l : [...l, a]))} />
      </div>

      {extraAlta}

      <div className="pinc-pie">
        <button type="button" className="pinc-btn pinc-btn--prim" disabled={enviando || ocupado || !titulo.trim()}
          onClick={() => crearla(false)}>{enviando ? 'Creando…' : 'Crear'}</button>
        {usaEstado('Borrador', ob.config ? ob.config.opcionales : null) && (
          <button type="button" className="pinc-btn" disabled={enviando || ocupado || !titulo.trim()}
            onClick={() => crearla(true)}>Guardar borrador</button>
        )}
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
const PIN = 'M12 21s-6.5-5.6-6.5-10.8a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z';
const CLARO = '#faf9f5';
export function PinDeIncidencia({ color = '#d97757', tamano = 28, numero = null, ...resto }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }} {...resto}>
      <path d={PIN} fill={color} stroke={CLARO} strokeWidth="1.5" strokeLinejoin="round" />
      {numero != null
        ? <text x="12" y="12.8" textAnchor="middle" fontSize={String(numero).length > 2 ? 5.5 : 7} fontWeight="600" fill={CLARO}
            fontFamily="var(--a-font-sans, 'IBM Plex Sans', sans-serif)">{numero}</text>
        : <><path d="M12 6.7v3.8" stroke={CLARO} strokeWidth="1.5" strokeLinecap="round" /><circle cx="12" cy="13.2" r="1" fill={CLARO} /></>}
    </svg>
  );
}

export const numeroDe = (codigo) => (/(\d+)\s*$/.exec(String(codigo || '')) || [])[1]?.replace(/^0+(?=\d)/, '') || null;

function iniciales(nombre) {
  const p = String(nombre || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

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

function Detalle({ entorno, obra, ob, issueId, extraDetalle, onCambio, onCargada }) {
  const API = entorno.API ?? '';
  const [i, setI] = useState(null);
  const [acto, setActo] = useState(null);
  const [editando, setEditando] = useState(null);       // 'asignar' | 'observadores' | 'clasificar'
  const [borrador, setBorrador] = useState({});
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const d = await leerJson(entorno, `${API}/api/issues/${encodeURIComponent(issueId)}`);
    setI(d || false);
    if (d) onCargada?.(d);
  }, [API, issueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);

  const hacer = async (ruta, cuerpo, ok) => {
    setOcupado(true);
    try {
      const d = await enviarJson(entorno, `${API}/api/issues/${issueId}/${ruta}`, cuerpo);
      setI(d);
      onCargada?.(d);
      setActo(null); setEditando(null);
      if (ok) entorno.avisar.ok(ok);
      onCambio?.(d);
      return true;
    } catch (e) { entorno.avisar.error(e.message); return false; } finally { setOcupado(false); }
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
  // LA ACTIVIDAD, como en ACC: comentarios e historial juntos y en orden, lo último abajo, junto a donde se escribe.
  const actividad = (i.history || []).filter(h => h && typeof h === 'object');
  const campos = camposDelTipo(ob.config, i.tipo);
  const clasificacion = [i.subtipo && `Subtipo: ${i.subtipo}`, i.causa_raiz && `Causa raíz: ${i.causa_raiz}`,
    ...campos.filter(c => (i.campos || {})[c.clave] != null).map(c => `${c.etiqueta}: ${(i.campos || {})[c.clave]}`)].filter(Boolean);
  const hayClasificacion = clasificacion.length || ((ob.config?.subtipos || {})[i.tipo] || []).length
    || (ob.config?.causas || []).length || campos.length;
  const hayActos = actos.enviar || actos.empezar || actos.corregir || actos.disputar || actos.reafirmar || actos.anular || verifica || autoverif;

  const comentar = async () => {
    const t = comentario.trim();
    if (t && await hacer('comentar', { texto: t })) setComentario('');
  };

  const Fila = ({ etiqueta, children, accion = null }) => (
    <div className="pinc-fila">
      <dt>{etiqueta}</dt>
      <dd><span>{children}</span>{accion}</dd>
    </div>
  );

  return (
    <div className="pinc-cuerpo pinc-detalle">
      <div className="pinc-cabeza">
        <h3 className="pinc-titulo">{i.titulo}</h3>
        <div className="pinc-estado">
          <span className="pinc-chip" style={{ '--estado': e.color }}><i />{e.etiqueta}</span>
          {vencida && <span className="pinc-vencida">Vencida</span>}
          <small>{aQuienLeTocaIssue(i, { responsable, verificador, autor })}</small>
        </div>
      </div>

      {i.estado === 'Borrador' && <p className="pinc-aviso">Borrador: solo lo ves tú. Al enviarlo le llega al responsable, con su fecha.</p>}
      {i.estado === 'En disputa' && <p className="pinc-aviso pinc-aviso--ambar">{responsable || 'El responsable'} dice que no procede. Decide {autor || 'quien la levantó'}: reafirmarla o anularla.</p>}
      {i.estado === 'Corregido' && !verifica && esDelResponsable(i, yo, ob.miEmpresa) && (
        <p className="pinc-aviso">Corregiste tú: la verifica {verificador || 'otra persona'}. Quien corrige no verifica su propia corrección.</p>
      )}

      {acto && <Acto entorno={entorno} obra={obra} acto={acto} i={i} onCancelar={() => setActo(null)}
        onHacer={(texto, prueba) => {
          if (acto === 'corregir') {
            return hacer('corregir', { evidencia: [{ tipo: 'documento', documento: prueba.documento, nombre: prueba.nombre }], comentario: texto },
              'Declarada corregida: pasa a revisión');
          }
          if (acto === 'reabrir') return hacer('verificar', { acepta: false, motivo: texto }, 'No aprobada: vuelve al responsable');
          return hacer(acto, { motivo: texto }, { disputar: 'En disputa: decide quien la levantó', reafirmar: 'Reafirmada: vuelve al responsable',
            anular: 'Anulada', autoverificacion: 'Autoverificación autorizada' }[acto]);
        }} />}

      {!acto && hayActos && (
        <div className="pinc-botones pinc-actos">
          {actos.enviar && <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado} onClick={() => hacer('enviar', {}, 'Enviada: le llega al responsable')}>Enviar</button>}
          {actos.reafirmar && <button type="button" className="pinc-btn pinc-btn--prim" onClick={() => setActo('reafirmar')}>Reafirmar</button>}
          {actos.corregir && <button type="button" className="pinc-btn pinc-btn--prim" onClick={() => setActo('corregir')}>Declarar corregida</button>}
          {verifica && <button type="button" className="pinc-btn pinc-btn--prim" disabled={ocupado} onClick={() => hacer('verificar', { acepta: true }, 'Verificada y cerrada')}>Verificar y cerrar</button>}
          {verifica && <button type="button" className="pinc-btn" onClick={() => setActo('reabrir')}>No aprobar</button>}
          {actos.empezar && <button type="button" className="pinc-btn" disabled={ocupado} onClick={() => hacer('empezar', {}, 'En curso')}>Empezar a corregir</button>}
          {actos.disputar && <button type="button" className="pinc-btn" onClick={() => setActo('disputar')}>No procede</button>}
          {autoverif && <button type="button" className="pinc-btn" onClick={() => setActo('autoverificacion')}>Autorizar autoverificación</button>}
          {actos.anular && <button type="button" className="pinc-btn pinc-btn--peligro" onClick={() => setActo('anular')}>{i.estado === 'Borrador' ? 'Descartar' : 'Anular'}</button>}
        </div>
      )}

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

      <section className="pinc-seccion">
        <h4>Detalles</h4>
        <dl className="pinc-filas">
          <Fila etiqueta="Estado"><span className="pinc-chip" style={{ '--estado': e.color }}><i />{e.etiqueta}</span></Fila>
          <Fila etiqueta="Asignada a" accion={dirige && ESTADOS_DONDE_SE_REASIGNA.includes(i.estado) && editando !== 'asignar'
            ? <button type="button" className="pinc-enlace" onClick={() => { setBorrador({}); setEditando('asignar'); }}>Reasignar</button> : null}>
            {responsable || '—'}
          </Fila>
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
          <Fila etiqueta="Verifica">{verificador || (i.tipo === 'OBSERVACION' ? autor : null) || 'Sin designar'}</Fila>
          <Fila etiqueta="Fecha límite"><span className={vencida ? 'es-vencida' : ''}>{fechaDeDia(vence) || '—'}</span></Fila>
          <Fila etiqueta="Tipo">{i.tipo_etiqueta || i.tipo}</Fila>
          {(i.ubicacion || i.progresiva) && <Fila etiqueta="Ubicación">{[i.ubicacion, i.progresiva].filter(Boolean).join(' · ')}</Fila>}
          <Fila etiqueta="Observadores" accion={<>
            {i.estado !== 'Borrador' && (
              <button type="button" className="pinc-enlace" disabled={ocupado}
                onClick={() => hacer('editar', { seguir: !sigo }, sigo ? 'Ya no la sigues' : 'La sigues: te avisaremos de cada paso')}>
                {sigo ? 'Dejar de seguir' : 'Seguir'}</button>
            )}
            {dirige && editando !== 'observadores' && (
              <button type="button" className="pinc-enlace" onClick={() => { setBorrador({ observadores: i.observadores || [] }); setEditando('observadores'); }}>Cambiar</button>
            )}
          </>}>
            {(i.observadores || []).length ? i.observadores.map(u => ob.nombres[u] || `usuario ${u}`).join(', ') : 'Nadie'}
          </Fila>
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
          {hayClasificacion ? (
            <Fila etiqueta="Clasificación" accion={interviene && editando !== 'clasificar'
              ? <button type="button" className="pinc-enlace"
                  onClick={() => { setBorrador({ subtipo: i.subtipo, causa_raiz: i.causa_raiz, campos: i.campos || {} }); setEditando('clasificar'); }}>
                  {cerrada ? 'Causa raíz' : 'Editar'}</button> : null}>
              {clasificacion.join(' · ') || 'Sin clasificar'}
            </Fila>
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
          <Fila etiqueta="Levantó">{[autor, fechaCorta(i.creado_en)].filter(Boolean).join(' · ') || '—'}</Fila>
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
        <h4>Adjuntos <span>{(i.adjuntos || []).length || ''}</span></h4>
        {(i.adjuntos || []).length === 0 && <p className="pinc-nota">Sin fotos ni documentos.</p>}
        {(i.adjuntos || []).length > 0 && (
          <ul className="pinc-minis">
            {i.adjuntos.map(a => (
              <Miniatura key={a.documento} entorno={entorno} adjunto={a} onAbrir={() => entorno.abrirDocumento?.(a.documento)}
                onQuitar={!cerrada && a.por_id != null && String(a.por_id) === String(yo)
                  ? () => hacer('adjuntar', { quitar: a.documento }, 'Adjunto quitado') : null} />
            ))}
          </ul>
        )}
        {interviene && !cerrada && (
          <Adjuntar entorno={entorno} obra={obra} ocupado={ocupado} setOcupado={setOcupado} codigo={i.codigo}
            onAdjunto={(a) => hacer('adjuntar', { documento: a.documento }, 'Adjuntado')} />
        )}
      </section>

      <section className="pinc-seccion">
        <h4>Actividad</h4>
        <ol className="pinc-actividad">
          {actividad.map((h, n) => {
            const quien = ob.nombreDeQuien(h.by);
            return (
              <li key={`${h.at}-${n}`} className={h.event === 'commented' ? 'es-comentario' : ''}>
                <span className="pinc-avatar" aria-hidden="true">{iniciales(quien)}</span>
                <div>
                  <div className="pinc-actividad__cab">
                    <b>{quien || 'Alguien'}</b>
                    <span>{h.event === 'commented' ? 'comentó' : (EVENTOS_DE_ISSUE[h.event] || h.event).toLowerCase()}</span>
                    <small>{fechaCorta(h.at)}</small>
                  </div>
                  {(h.texto || h.motivo || h.comentario) && <p>{h.texto || h.motivo || h.comentario}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="pinc-comentar">
          <textarea value={comentario} onChange={ev => setComentario(ev.target.value)} rows={2} maxLength={2000}
            placeholder="Escribe un comentario…"
            onKeyDown={ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); comentar(); } }} />
          <div className="pinc-botones">
            <button type="button" className="pinc-btn pinc-btn--prim" disabled={!comentario.trim() || ocupado} onClick={comentar}>Comentar</button>
            <small className="pinc-nota">Queda en el expediente: no se edita ni se borra.</small>
          </div>
        </div>
      </section>
    </div>
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
    <aside className={`pinc${contenedor ? ' pinc--dentro' : ''}`} aria-label={id ? `Incidencia ${codigo || ''}` : 'Nueva incidencia'}
      {...AISLADO}>
      <header className="pinc-cab">
        {onVolver && <button type="button" className="pinc-icono" onClick={onVolver} aria-label="Volver"><Ico><path d="M15 6l-6 6 6 6" /></Ico></button>}
        <PinDeIncidencia color={id && cargada ? estadoDeIssue(cargada.estado).color : '#b0aea5'}
          numero={id && cargada ? numeroDe(cargada.codigo) : null} />
        <div className="pinc-cab__tit">
          <b>{cabecera}</b>
          {!id && nueva?.lugar && <small>{nueva.lugar}</small>}
          {id && cargada && <small>{[cargada.tipo_etiqueta, cargada.ubicacion].filter(Boolean).join(' · ')}</small>}
        </div>
        <button type="button" className="pinc-icono" onClick={onCerrar} aria-label="Cerrar"><Ico><path d="M6 6l12 12M18 6 6 18" /></Ico></button>
      </header>
      {id ? (
        <Detalle key={id} entorno={entorno} obra={obra} ob={ob} issueId={id} extraDetalle={extraDetalle}
          onCargada={(d) => { setCodigo(d?.codigo || null); setCargada(d); }} onCambio={onCambio} />
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
