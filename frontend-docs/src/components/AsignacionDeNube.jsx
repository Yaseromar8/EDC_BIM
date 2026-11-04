/**
 * A QUIÉN LE TOCA APORTAR EN ESTA NUBE (3-nov-2026, docs/archivos/23). Va arriba de la nota de comentarios de la nube,
 * no en el panel (el dueño: «la asignación debe ser desde la nube misma… como ya tenemos una opción para dejar
 * comentario, debería ser ahí mismo»). Dice a quién se asignó y en qué va; el encargado del plano la asigna o la cambia
 * aquí: persona o empresa, qué se le pide y para cuándo. Lo demás de la nube (entregas, rondas, verificación) sigue en
 * la pestaña «Nubes» del panel de la incidencia.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';

const hoy = () => {
  const d = new Date();
  const dos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};
const fechaDeDia = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '';
};

/**
 * «COMPARAR EN ESTA NUBE» (doc 23 §6.7): el panel de la incidencia lo pide y el lector del plano (DocumentViewer) abre
 * «Comparar versiones» entre la versión de la nube y la vigente, encuadrado en ella. Un aviso de ventana: el panel vive
 * en design/ y no conoce al lector.
 */
export const PEDIR_COMPARAR_NUBE = 'alephia:comparar-nube';
export function pedirCompararNube(n) {
  const m = n?.marca || {};
  window.dispatchEvent(new CustomEvent(PEDIR_COMPARAR_NUBE, { detail: {
    documento: m.documento, version: m.version_id, pagina: m.page || 1, geometria: m.geometria,
  } }));
}

/** Quién está en esta sesión (su id), como lo guarda el inicio de sesión. */
export function miIdDeSesion() {
  try {
    const u = JSON.parse(localStorage.getItem('visor_user') || sessionStorage.getItem('visor_user') || '{}');
    return u?.id ?? null;
  } catch { return null; }
}

/**
 * EL ENCARGADO REPARTE TRABAJO A SU EQUIPO (D6, doc 23): una nube suya se vuelve nube de ENCARGO de una incidencia de la
 * que es encargado. Luego la asigna a su cadista o modelador desde la nota, como cualquier otra nube.
 */
export function CrearEncargo({ API, marca, incidencias, onHecho, onCancelar }) {
  const [iid, setIid] = useState(incidencias.length === 1 ? String(incidencias[0].id) : '');
  const [ocupado, setOcupado] = useState(false);
  const crear = async () => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/issues/${iid}/nubes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acto: 'crear', marca: marca.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo crear el encargo.');
      toast.success('Nube de encargo creada: asígnala a quien la haga');
      onHecho();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };
  return (
    <form className="bdm-asignar" onSubmit={e => { e.preventDefault(); if (iid) crear(); }}>
      <span className="bdm-asignar__titulo">Encargo para tu equipo</span>
      <select value={iid} autoFocus aria-label="De qué incidencia" onChange={e => setIid(e.target.value)}>
        {incidencias.length > 1 && <option value="">¿De qué incidencia?</option>}
        {incidencias.map(o => <option key={o.id} value={o.id}>{o.codigo}{o.titulo ? ` · ${o.titulo}` : ''}</option>)}
      </select>
      <small className="bdm-asignar__ayuda">La asignas a tu cadista o modelador y la aceptas tú. La ven tu equipo y quien
        revisa.</small>
      <div className="bdm-asignar__fila">
        <button type="button" className="bdm-accion" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="bdm-accion bdm-accion--prim" disabled={!iid || ocupado}>Crear encargo</button>
      </div>
    </form>
  );
}

/** La nube de esta marca en su incidencia (GET /api/issues/<id>/nubes), o null si la marca no es nube de ninguna. */
export function useNubeDeLaMarca(API, marca) {
  const obs = marca?.observacion;
  const es = marca?.kind === 'cloud' && obs?.id != null && !marca._unsaved;
  const [nube, setNube] = useState(null);
  useEffect(() => {
    if (!es) return undefined;
    let vivo = true;
    apiFetch(`${API}/api/issues/${obs.id}/nubes`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo) setNube((d?.nubes || []).find(n => String(n.markup_id) === String(marca.id)) || null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [API, es, obs?.id, marca?.id]);
  return [es ? nube : null, setNube];
}

function Formulario({ API, obra, obsId, marcaId, nube, pedidoSugerido, onHecha, onCancelar }) {
  const [miembros, setMiembros] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [quien, setQuien] = useState(nube.destino_usuario ? `u${nube.destino_usuario}` : nube.destino_empresa ? `e${nube.destino_empresa}` : '');
  const [pedido, setPedido] = useState(nube.pedido || pedidoSugerido || '');
  const [vence, setVence] = useState(String(nube.vence_en || '').slice(0, 10));
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let vivo = true;
    const o = encodeURIComponent(obra);
    const leer = (ruta, clave, fijar) => apiFetch(`${API}/api/projects/${o}/${ruta}`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo) fijar(d?.[clave] || []); }).catch(() => {});
    leer('miembros', 'miembros', setMiembros);
    leer('participantes', 'participantes', setEmpresas);
    return () => { vivo = false; };
  }, [API, obra]);
  const asignar = async () => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/issues/${obsId}/nubes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acto: 'asignar', ...(nube.id != null ? { nube: nube.id } : { marca: marcaId }),
          ...(quien.startsWith('u') ? { destino_usuario: Number(quien.slice(1)) } : { destino_empresa: Number(quien.slice(1)) }),
          pedido: pedido.trim(), vence_en: vence || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo asignar.');
      toast.success(nube.estado === 'sin_asignar' ? 'Asignada: le llega a quien aporta' : 'Reasignada');
      onHecha((d.nubes || []).find(n => String(n.markup_id) === String(marcaId)) || null);
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };
  return (
    <form className="bdm-asignar" onSubmit={e => { e.preventDefault(); if (quien && pedido.trim()) asignar(); }}>
      <select value={quien} autoFocus aria-label="A quién se asigna" onChange={e => setQuien(e.target.value)}>
        <option value="">Asignar a…</option>
        <optgroup label="Personas">
          {miembros.filter(m => m.id != null).map(m => (
            <option key={`u${m.id}`} value={`u${m.id}`}>{m.name || m.email}{m.empresa ? ` · ${m.empresa}` : ''}</option>
          ))}
        </optgroup>
        {empresas.length > 0 && (
          <optgroup label="Empresas">
            {empresas.map(e => <option key={`e${e.company_id}`} value={`e${e.company_id}`}>{e.nombre}</option>)}
          </optgroup>
        )}
      </select>
      <input value={pedido} maxLength={2000} aria-label="Qué se le pide" placeholder="Qué se le pide"
        onChange={e => setPedido(e.target.value)} />
      <div className="bdm-asignar__fila">
        <input type="date" value={vence} min={hoy()} aria-label="Para cuándo" title="Para cuándo (opcional)"
          onChange={e => setVence(e.target.value)} />
        <button type="button" className="bdm-accion" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="bdm-accion bdm-accion--prim" disabled={!quien || !pedido.trim() || ocupado}>
          {nube.estado === 'sin_asignar' ? 'Asignar' : 'Reasignar'}</button>
      </div>
    </form>
  );
}

/** La línea de arriba de la nota: «Asignada a Mario · pedida · vence 20 nov.» y, a quien puede, asignar o cambiar. */
export default function AsignacionDeNube({ API, obra, marca, nube, onCambio, pedidoSugerido = '' }) {
  const [editando, setEditando] = useState(false);
  if (!nube) return null;
  const puede = (nube.actos || []).includes('asignar');
  if (!nube.destino_nombre && !puede) return null;
  if (editando) {
    return (
      <Formulario API={API} obra={obra} obsId={marca.observacion.id} marcaId={marca.id} nube={nube}
        pedidoSugerido={pedidoSugerido} onCancelar={() => setEditando(false)}
        onHecha={(n) => { setEditando(false); if (n) onCambio(n); }} />
    );
  }
  if (!nube.destino_nombre) {
    return (
      <button type="button" className="bdm-asignada bdm-asignada--vacia" onClick={() => setEditando(true)}>
        Asignar a una persona o empresa…</button>
    );
  }
  const detalle = [nube.estado_etiqueta, nube.vence_en && `vence ${fechaDeDia(nube.vence_en)}`].filter(Boolean).join(' · ');
  return (
    <div className="bdm-asignada">
      <span>
        <span className="bdm-asignada__quien">Asignada a <b>{nube.destino_nombre}</b>{nube.destino_es_empresa ? ' (empresa)' : ''}</span>
        <small>{detalle}</small>
        {nube.pedido && <small className="bdm-asignada__pide" title={nube.pedido}>{nube.pedido}</small>}
      </span>
      {puede && <button type="button" className="bdm-accion" onClick={() => setEditando(true)}>Cambiar</button>}
    </div>
  );
}
