/**
 * PortadaObra — la portada de una obra, por plazos (14-oct-2026).
 *
 * Patrón estándar del sector (la portada de Procore: atrasado, próximos 7 días y
 * después, por herramienta, y «mis elementos abiertos»). Lo nuestro:
 *   · el plazo sale del propio objeto (el paso de la revisión, el RFI, el
 *     compromiso del plan de entregas), no de una fecha escrita aparte;
 *   · el plan de entregas cuenta, y separa los compromisos vencidos SIN documento
 *     («no consta», no «incumplido»: ver plan_de_entrega.py);
 *   · los documentos se resumen con las vistas de ISO 19650 de Archivos, y cada
 *     cifra abre esa vista.
 *
 * Solo lee, con rutas que ya existen: /api/mi-trabajo, /api/reviews, /api/plan
 * y las cifras de las vistas. Una que falle no tumba las demás: su fila no sale.
 *
 * SIN RFI A PROPÓSITO: el perfil portal (el despliegue de Docs) no sirve
 * /api/rfis, y test_perfil_portal lo detectó. Los RFI pendientes de cada persona
 * sí salen, en «Mis pendientes», porque vienen de /api/mi-trabajo.
 */
import React, { useEffect, useState } from 'react';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import IconoModulo from './IconoModulo';
import { TRAMOS, resumenPorHerramienta, misPendientes, textoDePlazo } from '../utils/portadaObra';
import { VISTAS_DE_SERIE } from '../utils/vistasDeArchivos';
import './PortadaObra.css';

// A qué herramienta lleva cada encargo de «Mis pendientes».
const MODO_DE_TIPO = {
  REVIEW: 'reviews', RFI: 'rfis', REDLINE: 'redlines', TRANSMITTAL: 'transmittals', SUBMITTAL: 'submittals',
  ISSUE: 'punch', PROTOCOLO: 'protocolos', PARTE: 'cuaderno', ASIENTO: 'cuaderno', INSTRUCCION: 'cuaderno',
  AVANCE: 'avance',
};
const ICONO = { reviews: 'revisiones', rfis: 'rfi', plan: 'plan' };

async function leer(url) {
  try {
    const r = await apiFetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default function PortadaObra({ projectPrefix, projectId, nombreObra, recuentos, hayPlan, onIr, onAbrirVista }) {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    let vivo = true;
    const obra = encodeURIComponent(projectPrefix);
    Promise.all([
      leer(`${API}/api/mi-trabajo${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
      leer(`${API}/api/reviews?model_urn=${obra}&filtro=en_curso&limite=100`),
      leer(`${API}/api/plan?model_urn=${obra}`),
    ]).then(([trabajo, reviews, plan]) => {
      if (!vivo) return;
      setDatos({
        pendientes: trabajo ? (trabajo.pendientes || []).filter(p => !projectId || String(p.project_id) === String(projectId)) : null,
        reviews: reviews?.success ? reviews.reviews || [] : null,
        plan: plan && Array.isArray(plan.plan) ? plan.plan : null,
      });
    });
    return () => { vivo = false; };
  }, [projectPrefix, projectId]);

  const filas = datos ? resumenPorHerramienta(datos) : [];
  const mios = datos?.pendientes ? misPendientes(datos.pendientes) : null;
  const nMios = mios ? Object.values(mios).reduce((s, l) => s + l.length, 0) : 0;
  const vistas = VISTAS_DE_SERIE.filter(v => !v.soloConPlan || hayPlan);

  return (
    <div className="portada">
      <header className="portada__cab">
        <h1>Portada</h1>
        {nombreObra && <span>{nombreObra}</span>}
      </header>

      {!datos && <p className="portada__nota">Reuniendo los plazos de la obra…</p>}

      {datos && (
        <div className="portada__rejilla">
          <section className="portada__tarjeta portada__mios">
            <h2>Mis pendientes {mios && <em>{nMios}</em>}</h2>
            {!mios && <p className="portada__nota">No se pudo leer «Mi trabajo».</p>}
            {mios && nMios === 0 && <p className="portada__nota">Nada espera por ti en esta obra.</p>}
            {mios && nMios > 0 && (
              <div className="portada__tramos">
                {TRAMOS.filter(([k]) => mios[k].length > 0).map(([k, nombre]) => (
                  <div key={k} className={`portada__tramo portada__tramo--${k}`}>
                    <h3>{nombre} <em>{mios[k].length}</em></h3>
                    <ul>
                      {mios[k].slice(0, 6).map(p => (
                        <li key={p.id}>
                          <button type="button" onClick={() => onIr(MODO_DE_TIPO[p.tipo] || 'reviews')}>
                            <span className="portada__tipo">{p.etiqueta}</span>
                            <span className="portada__asunto">{p.asunto}</span>
                            <span className="portada__plazo">{textoDePlazo(p.dias)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {mios[k].length > 6 && <p className="portada__nota">y {mios[k].length - 6} más</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="portada__tarjeta portada__plazos">
            <h2>Plazos de la obra</h2>
            {filas.length === 0 ? <p className="portada__nota">No se pudo leer ninguna herramienta.</p> : (
              <table className="portada__tabla">
                <thead>
                  <tr><th />{TRAMOS.map(([k, n]) => <th key={k}>{n}</th>)}<th>Total</th></tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.clave} onClick={() => onIr(f.clave)} title={`Ir a ${f.nombre.toLowerCase()}`}>
                      <th scope="row"><IconoModulo nombre={ICONO[f.clave]} tamano={16} />{f.nombre}</th>
                      {TRAMOS.map(([k]) => (
                        <td key={k} className={k === 'atrasado' && f[k] > 0 ? 'es-atrasado' : ''}>{f[k] || '—'}</td>
                      ))}
                      <td>{f.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {filas.find(f => f.clave === 'plan' && f.atrasadosSinDocumento > 0) && (
              <p className="portada__nota">
                De los compromisos atrasados del plan, {filas.find(f => f.clave === 'plan').atrasadosSinDocumento} no
                tienen documento cotejado: no consta si se entregaron, que no es lo mismo que no haberlo hecho.
              </p>
            )}
            <p className="portada__nota">El plazo de cada fila es el que guarda el propio objeto: el paso actual de la
              revisión o la fecha comprometida en el plan.</p>
          </section>

          <section className="portada__tarjeta portada__docs">
            <h2>Documentos</h2>
            <ul className="portada__vistas">
              {vistas.map(v => (
                <li key={v.clave}>
                  <button type="button" title={v.ayuda} onClick={() => onAbrirVista(v)}>
                    <span>{v.etiqueta}</span><b>{recuentos ? recuentos[v.clave] ?? '—' : '…'}</b>
                  </button>
                </li>
              ))}
            </ul>
            <p className="portada__nota">Cada cifra abre esa vista en Archivos, sobre toda la obra.</p>
          </section>
        </div>
      )}
    </div>
  );
}
