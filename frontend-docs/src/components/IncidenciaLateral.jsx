/**
 * El panel lateral de la incidencia (design/incidencias/PanelDeIncidencia.jsx, docs/archivos/19) con lo que pone Docs:
 * cómo pide al servidor (`apiFetch`, con la sesión), cómo avisa (`toast`), cómo abre un documento, sube una foto (a
 * MULTIMEDIA/, como las de las marcas) y elige un documento (el selector de Docs).
 *
 * Y una cosa que solo tiene Docs: levantar una incidencia SIN COBERTURA. Un punch se levanta en obra, donde no hay
 * señal: si el alta no trae nada que la cola de campo no sepa llevar (empresa, observadores, clasificación, adjuntos,
 * borrador), va por `offline/captura` como siempre, y si no hay red se guarda en el dispositivo.
 */
import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import PanelDeIncidencia from '../../../design/incidencias/PanelDeIncidencia.jsx';
import { API as API_DOCS } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { abrirDocumento, subirFoto } from '../utils/enlaceDeMarcas';
import * as campo from '../offline/captura';
import SelectorDeDocumento from './SelectorDeDocumento';

function idDeLaSesion() {
  try {
    const u = JSON.parse(localStorage.getItem('visor_user') || sessionStorage.getItem('visor_user') || '{}');
    return u?.id ?? null;
  } catch { return null; }
}

const llevaLoDeLa45 = (c) => !!(c.responsable_empresa || (c.observadores || []).length || c.subtipo || c.causa_raiz
  || Object.values(c.campos || {}).some(v => v != null && String(v).trim() !== '') || (c.adjuntos || []).length || c.borrador);

export function useEntornoDocs({ API = API_DOCS, user = null, project = null } = {}) {
  return useMemo(() => ({
    API,
    pedir: apiFetch,
    avisar: { ok: (m) => toast.success(m), error: (m) => toast.error(m) },
    abrirDocumento: (id) => abrirDocumento(id),
    // La miniatura de una foto adjunta: la misma que la galería (proxy del documento con `thumb=1`).
    miniatura: (id) => apiFetch(`${API}/api/docs/proxy?id=${encodeURIComponent(id)}&thumb=1`)
      .then(r => (r.ok ? r.blob() : null)),
    subirFoto: (obra, f, descripcion) => subirFoto(API, obra, f, descripcion),
    ElegirDocumento: ({ obra, titulo, ayuda, onElegir, onCerrar }) => (
      <SelectorDeDocumento API={API} project={{ id: obra, model_urn: obra }} titulo={titulo} ayuda={ayuda}
        onElegir={onElegir} onCerrar={onCerrar} />
    ),
    yo: idDeLaSesion,
    // SIN RED, EL CATALOGO SALE DE LA PRECARGA: pedirlo solo a la red dejaba el alta sin tipos justo cuando más falta
    // hace (lo destapó la EXP de campo). La precarga es una foto y se usa como tal.
    catalogoSinRed: async () => {
      const ctx = user && project ? campo.contextoDe(user, project) : null;
      if (!ctx) return null;
      try {
        const pre = await import('../offline/precarga');
        const { datos } = await pre.leer(ctx, pre.CATALOGOS);
        return datos || null;
      } catch { return null; }
    },
    crearIncidencia: async (cuerpo) => {
      const ctx = user && project ? campo.contextoDe(user, project) : null;
      const directo = async () => {
        const r = await apiFetch(`${API}/api/issues`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'No se pudo crear.');
        return d;
      };
      if (!ctx || llevaLoDeLa45(cuerpo)) return directo();
      const { modo, datos, veredicto, sinCampo } = await campo.capturar(API, ctx, {
        object_type: campo.ISSUE, action: campo.CREATE, local_object_id: campo.nuevoObjetoLocal(),
        // LA RUTA DE SIEMPRE, por si este servidor todavía no recibe campo.
        payload: cuerpo, enLinea: async () => directo(),
      });
      if (sinCampo) return datos;
      if (modo === 'servidor') return { ...(datos?.canonical_result || {}), id: datos?.canonical_result?.id ?? datos?.object_id };
      if (veredicto) throw new Error(veredicto.error || 'El servidor no la aceptó.');
      // Guardada en este dispositivo, sin número todavía: se dice tal cual.
      toast.success('Guardado en este dispositivo. Subirá cuando haya cobertura; míralo en «Trabajo de campo».', { duration: 6000 });
      return null;
    },
  }), [API, user, project]);
}

export default function IncidenciaLateral({ API, user = null, project = null, ...resto }) {
  const entorno = useEntornoDocs({ API, user, project });
  return <PanelDeIncidencia entorno={entorno} {...resto} />;
}
