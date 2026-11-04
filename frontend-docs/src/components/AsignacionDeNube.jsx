/**
 * A QUIÉN LE TOCA APORTAR EN ESTA NUBE (3-nov-2026, docs/archivos/23), desde la barra de la nube (el dueño: «la
 * asignación debe ser desde la nube misma»): a quién se asignó y en qué va; quien puede la asigna o la cambia aquí,
 * persona o empresa y qué se le pide. Lo demás de la nube (entregas, rondas, verificación) sigue en la pestaña «Nubes».
 *
 * LA PANTALLA SOLO PINTA (docs/archivos/25, fase 2): qué puede hacer cada uno lo dice el servidor —los `actos` de la
 * nube; en una nube SUELTA, `puede_unirse_a` (a qué incidencias puede ir y si quien mira la asigna ya)—. La nube se lee
 * y se escribe en la copia única de las nubes (design/incidencias/datosDeNubes.js): lo que cambia aquí se ve en la
 * hoja, en la leyenda y en el panel a la vez.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { fijarNubes } from '../../../design/incidencias/datosDeNubes.js';
import useNubesDeIncidencia from '../../../design/incidencias/useNubesDeIncidencia.js';


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

const leerNubes = (API) => (id) => apiFetch(`${API}/api/issues/${encodeURIComponent(id)}/nubes`)
  .then(r => (r.ok ? r.json() : null));

async function enviar(API, issueId, cuerpo) {
  const r = await apiFetch(`${API}/api/issues/${encodeURIComponent(issueId)}/nubes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo.');
  fijarNubes(issueId, d);     // la respuesta ES el estado nuevo de sus nubes: se ve en todas partes
  return d;
}

/** La nube de esta marca en su incidencia (de la copia única), o null si la marca no es nube de ninguna. */
export function useNubeDeLaMarca(API, marca) {
  const obs = marca?.observacion;
  const es = marca?.kind === 'cloud' && obs?.id != null && !marca._unsaved;
  const datos = useNubesDeIncidencia(leerNubes(API), es ? obs.id : null);
  if (!es) return null;
  return (datos?.nubes || []).find(n => String(n.markup_id) === String(marca.id)) || null;
}

/**
 * ASIGNAR UNA NUBE SUELTA (4-nov-2026, el dueño: «no veo dónde asignar»): una nube dibujada después de levantar la
 * incidencia. Las incidencias a las que puede ir, y cómo, las da el servidor con la marca (`puede_unirse_a`).
 */
export function AsignarSuelta({ API, obra, marca, pedidoSugerido = '', onHecho, onCancelar }) {
  return (
    <Formulario API={API} obra={obra} marcaId={marca.id} nube={{ estado: 'sin_asignar' }}
      incidencias={marca.puede_unirse_a || []} pedidoSugerido={pedidoSugerido} onCancelar={onCancelar}
      onHecha={() => onHecho?.()} />
  );
}

function Formulario({ API, obra, issueId = null, marcaId, nube, incidencias = null, pedidoSugerido, onHecha, onCancelar }) {
  const suelta = issueId == null;
  // Nube suelta: primero su incidencia (si hay una sola, ya elegida).
  const [iid, setIid] = useState(!suelta ? String(issueId) : incidencias?.length === 1 ? String(incidencias[0].id) : '');
  const destino = suelta ? (incidencias || []).find(o => String(o.id) === iid) : null;
  // En una nube suelta, asignar ya lo puede quien el servidor dice (`asigna`): quien revisa la AÑADE y la asigna su
  // encargado. En una nube de la incidencia, este formulario solo se abre si el servidor da el acto «asignar».
  const asigna = !suelta || !!destino?.asigna;
  const [miembros, setMiembros] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [quien, setQuien] = useState(nube.destino_usuario ? `u${nube.destino_usuario}` : nube.destino_empresa ? `e${nube.destino_empresa}` : '');
  const [pedido, setPedido] = useState(nube.pedido || pedidoSugerido || '');
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
  const aQuien = () => (quien.startsWith('u') ? { destino_usuario: Number(quien.slice(1)) }
    : { destino_empresa: Number(quien.slice(1)) });
  const guardar = async () => {
    setOcupado(true);
    try {
      if (suelta) {
        // AÑADIR Y ASIGNAR, UN SOLO ACTO (docs/archivos/25, P3): si algo no vale, no queda nada a medias.
        await enviar(API, iid, { acto: 'crear', marca: marcaId, ...(asigna ? { ...aQuien(), pedido: pedido.trim() } : {}) });
        toast.success(asigna ? 'Asignada: le llega a quien aporta'
          : `Nube añadida a ${destino?.codigo || 'la incidencia'}: la asigna su encargado`);
      } else {
        await enviar(API, iid, { acto: 'asignar', ...(nube.id != null ? { nube: nube.id } : { marca: marcaId }),
                                 ...aQuien(), pedido: pedido.trim() });
        toast.success(nube.estado === 'sin_asignar' ? 'Asignada: le llega a quien aporta' : 'Reasignada');
      }
      onHecha();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  };
  const listo = !!iid && (!asigna || (quien && pedido.trim()));
  return (
    <form className="bdm-asignar" onSubmit={e => { e.preventDefault(); if (listo && !ocupado) guardar(); }}>
      {suelta && incidencias.length > 1 && (
        <select value={iid} aria-label="De qué incidencia" onChange={e => setIid(e.target.value)}>
          <option value="">¿De qué incidencia?</option>
          {incidencias.map(o => <option key={o.id} value={o.id}>{o.codigo}{o.titulo ? ` · ${o.titulo}` : ''}</option>)}
        </select>
      )}
      {asigna && <>
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
      </>}
      <div className="bdm-asignar__fila">
        <button type="button" className="bdm-accion" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="bdm-accion bdm-accion--prim" disabled={!listo || ocupado}>
          {!asigna ? 'Añadir a la incidencia' : nube.estado === 'sin_asignar' ? 'Asignar' : 'Reasignar'}</button>
      </div>
    </form>
  );
}

/** La línea de la nota: «Asignada a Mario · Pedida» y, a quien puede (el servidor da «asignar»), asignar o cambiar. */
export default function AsignacionDeNube({ API, obra, marca, nube, pedidoSugerido = '', editarDeEntrada = false,
                                          onCerrar = null }) {
  // Desde el botón «Asignar» de la barra, una nube sin asignar abre ya el formulario.
  const [editando, setEditando] = useState(editarDeEntrada && !!nube && !nube.destino_nombre);
  if (!nube) return null;
  const puede = (nube.actos || []).includes('asignar');
  if (!nube.destino_nombre && !puede) return null;
  if (editando) {
    return (
      <Formulario API={API} obra={obra} issueId={marca.observacion.id} marcaId={marca.id} nube={nube}
        pedidoSugerido={pedidoSugerido} onCancelar={() => (editarDeEntrada && !nube.destino_nombre ? onCerrar?.() : setEditando(false))}
        onHecha={() => setEditando(false)} />
    );
  }
  if (!nube.destino_nombre) {
    return (
      <button type="button" className="bdm-asignada bdm-asignada--vacia" onClick={() => setEditando(true)}>
        Asignar a una persona o empresa…</button>
    );
  }
  return (
    <div className="bdm-asignada">
      <span>
        <span className="bdm-asignada__quien">Asignada a <b>{nube.destino_nombre}</b>{nube.destino_es_empresa ? ' (empresa)' : ''}</span>
        <small>{nube.estado_etiqueta}</small>
        {nube.pedido && <small className="bdm-asignada__pide" title={nube.pedido}>{nube.pedido}</small>}
      </span>
      {puede && <button type="button" className="bdm-accion" onClick={() => setEditando(true)}>Cambiar</button>}
    </div>
  );
}
