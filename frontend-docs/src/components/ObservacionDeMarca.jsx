/**
 * ObservacionDeMarca — lo que hay que corregir de una marca (20-oct-2026; panel lateral único el 2-nov, docs/archivos/19).
 *
 * La marca DIBUJA; la OBSERVACIÓN se gestiona. Es una incidencia de tipo «Observación de documento» (doc_issues,
 * migración 37) con los estados de ACC (45). En el panel de la marca se ve su resumen —estado, a quién le toca, fecha—
 * y «Abrir» la lleva al MISMO panel lateral que en todas las herramientas (design/incidencias/PanelDeIncidencia.jsx),
 * donde se trabaja: actos, responsable o empresa, observadores, adjuntos, clasificación, comentarios e historial.
 * «Crear observación» abre ese panel para levantarla desde esta marca (la verifica quien la dibujó).
 * Estudio y decisión: docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md (opción A).
 */
import React, { useCallback, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { estadoDeObservacion, observacionViva, aQuienLeToca, fechaDeDia } from '../utils/marcasConEnlace';
import IncidenciaLateral from './IncidenciaLateral';
import { pedirCompararNube } from './AsignacionDeNube';
import { destinoDelLector } from './ObservacionesDelPlano';

export function EtiquetaDeObservacion({ obs }) {
  if (!obs) return null;
  const e = estadoDeObservacion(obs.estado);
  return (
    <span className="mce-obs-etq" title={obs.vencida ? 'Fuera de plazo' : e.etiqueta}>
      <i style={{ background: e.color }} />
      <span>{obs.codigo}</span>
      <b>{obs.vencida ? 'Vencida' : e.etiqueta}</b>
    </span>
  );
}

export default function ObservacionDeMarca({ API, obra, marca, esAutor, onCambio }) {
  const obs = marca.observacion || null;
  const [lateral, setLateral] = useState(null);          // 'nueva' | id de la observación

  // Tras un acto en el panel, el resumen de la marca (su etiqueta en la hoja) se vuelve a leer.
  const releer = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/observacion`);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) onCambio?.({ ...marca, observacion: d.observacion });
    } catch { /* se queda el resumen */ }
  }, [API, marca, onCambio]);

  const crearDesdeLaMarca = async (cuerpo) => {
    const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/observacion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo crear.');
    if (d.publicado) onCambio?.({ ...marca, publicado: true });
    return d.observacion;
  };

  const e = obs ? estadoDeObservacion(obs.estado) : null;
  return (
    <section className="mce-sec mce-obs">
      <h3>Observación {obs && <span>{obs.codigo}</span>}</h3>
      {obs ? (
        <>
          <div className="mce-obs-cab">
            <span className="mce-obs-estado" style={{ '--estado': e.color }}><i />{e.etiqueta}</span>
            {obs.vencida && <span className="mce-obs-vencida">Vencida</span>}
            <small>{aQuienLeToca(obs)}</small>
          </div>
          <p className="mce-obs-titulo">{obs.titulo}</p>
          <dl className="mce-obs-datos">
            <dt>Responsable</dt><dd>{obs.responsable || '—'}</dd>
            <dt>Fecha límite</dt><dd className={obs.vencida ? 'es-vencida' : ''}>{fechaDeDia(obs.vence_en) || '—'}</dd>
          </dl>
          {obs.del_plano && <p className="mce-nota">Es una observación del plano entero que incluye esta marca.</p>}
          <div className="mce-acciones">
            <button type="button" className="mce-btn mce-btn--prim" onClick={() => setLateral(String(obs.id))}>Abrir</button>
            {!observacionViva(obs) && esAutor && !obs.del_plano && (
              <button type="button" className="mce-btn mce-btn--sec" onClick={() => setLateral('nueva')}>Crear otra observación</button>
            )}
          </div>
        </>
      ) : esAutor ? (
        <>
          <p className="mce-vacio">Si lo marcado hay que corregirlo, levanta una observación: tendrá responsable, fecha
            límite e historial, y la verás cerrada cuando la verifiques.</p>
          <button type="button" className="mce-btn mce-btn--sec" onClick={() => setLateral('nueva')}>Crear observación</button>
        </>
      ) : <p className="mce-vacio">Sin observación. La levanta quien dibujó la marca.</p>}

      {lateral && (
        <IncidenciaLateral API={API} obra={obra} contenedor={destinoDelLector()} onVolver={() => setLateral(null)}
          issueId={lateral === 'nueva' ? null : lateral}
          // Abierta desde su marca: el panel va a la pestaña «Nubes», a ESTA nube.
          nube={lateral === 'nueva' ? null : marca.id}
          onCompararNube={pedirCompararNube}
          nueva={lateral === 'nueva' ? { tipo: 'OBSERVACION', lugar: `Desde una marca · pág. ${marca.page}` } : null}
          titulo="Nueva observación de la marca" crear={crearDesdeLaMarca}
          onCreada={releer} onCambio={releer} onCerrar={() => setLateral(null)} />
      )}
    </section>
  );
}
