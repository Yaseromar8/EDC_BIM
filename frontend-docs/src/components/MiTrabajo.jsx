/**
 * «Mi Trabajo»: lo que está esperando por esta persona.
 *
 * POR QUÉ ESTÁ EN LA PORTADA
 * --------------------------
 * Hasta ahora se entraba al ECD y se veían carpetas. Todo estaba organizado por
 * obra y por carpeta, y nada por *quién debe hacer qué*: ninguno de los cuatro
 * módulos de colaboración tenía un endpoint capaz de responder «¿qué me toca?».
 *
 * Esta lista sólo LEE. No concede nada: el backend la construye partiendo de la
 * membresía del usuario (`JOIN project_users`), así que un encargo dirigido a una
 * función contractual —«la Supervisión»— sólo aparece si además se pertenece a
 * esa obra. Abrir cualquiera de estos elementos vuelve a pasar por los guardias
 * de siempre.
 *
 * ABRIR UNA REVISIÓN (REVIEWS · E1). Con `onAbrir`, las filas de tipo Revisión
 * llevan a su detalle. Una fila con asunto neutro también se abre: el detalle
 * dice que no hay acceso a todos sus documentos, sin nombrar ninguno.
 *
 * ABRIR UNA INCIDENCIA (3-nov-2026, «al hacer clic no te lleva al archivo»). Con
 * `onAbrirIncidencia`: si vive en un plano, al plano con la incidencia abierta;
 * si no, a la herramienta Issues de su obra, con ella abierta.
 *
 * EL RESUMEN AL ENTRAR (13-nov-2026, el dueño: «un resumen de cada usuario de lo que está pendiente, vencido y
 * entregado… para que cada vez que ingresen sepa qué le falta»). Arriba, tres números; debajo, lo pendiente con lo
 * vencido primero; y al final lo que la persona YA entregó y espera a que otro lo acepte o lo verifique. Contar y
 * ordenar es de `utils/miTrabajo.js`; qué sale lo decide el servidor.
 */
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
// CON el prefijo `API`, como todo lo demas. El backend NO sirve el frontend:
// son origenes distintos, asi que una ruta relativa iba al sitio estatico y no
// al backend. En desarrollo colaba por el proxy de Vite, que es justo lo que
// hacia que el defecto no se viera.
import { API } from '../utils/helpers';
import {
  diasPara, resumenDeMiTrabajo, pendientesEnOrden, haceCuanto, fraseSinPendientes,
} from '../utils/miTrabajo';

const ETIQUETA = {
  REVIEW: 'Revisión',
  RFI: 'RFI',
  REDLINE: 'Observación',
  TRANSMITTAL: 'Emisión',
  NUBE: 'Nube',
};

const ETIQUETA_ISSUE = 'Incidencia';

export default function MiTrabajo({ compacto = false, onAbrir = null, onAbrirIncidencia = null }) {
  const [estado, setEstado] = useState('cargando');
  const [pendientes, setPendientes] = useState([]);
  const [entregados, setEntregados] = useState([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await apiFetch(`${API}/api/mi-trabajo`);
        if (!vivo) return;
        if (!r.ok) { setEstado('error'); return; }
        const d = await r.json();
        setPendientes(d.pendientes || []);
        setEntregados(d.entregados || []);
        setEstado('listo');
      } catch {
        if (vivo) setEstado('error');
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (estado === 'cargando') {
    return <div style={S.caja}><div style={S.titulo}>Mi trabajo</div>
      <div style={S.vacio}>Cargando…</div></div>;
  }

  // Un fallo aquí no puede tapar el resto de la portada: se dice y se sigue.
  if (estado === 'error') {
    return <div style={S.caja}><div style={S.titulo}>Mi trabajo</div>
      <div style={S.vacio}>No se pudo cargar el trabajo pendiente.</div></div>;
  }

  const resumen = resumenDeMiTrabajo(pendientes, entregados);
  const enOrden = pendientesEnOrden(pendientes);
  const abrirEntregado = (e) => onAbrirIncidencia({
    obra: e.project_id, incidencia: e.incidencia, documento: e.documento || null, version: e.version || null,
    nube: e.objeto_tipo === 'NUBE' ? (e.marca || null) : null });

  return (
    <div style={S.caja}>
      <div style={S.titulo}>Mi trabajo</div>

      {/* Los tres números: lo que falta, lo que ya pasó su fecha y lo que espera a otro. */}
      <dl style={S.resumen} aria-label="Resumen de mi trabajo">
        <div style={S.cifra}>
          <dt style={S.rotulo}>Pendiente</dt>
          <dd style={S.numero}>{resumen.pendiente}</dd>
        </div>
        <div style={S.cifra}>
          <dt style={S.rotulo}>Vencido</dt>
          <dd style={{ ...S.numero, ...(resumen.vencido ? S.numeroVencido : null) }}>{resumen.vencido}</dd>
        </div>
        <div style={S.cifra}>
          <dt style={S.rotulo}>Entregado</dt>
          <dd style={S.numero}>{resumen.entregado}</dd>
        </div>
      </dl>

      {pendientes.length === 0 ? (
        <div style={S.vacio}>{fraseSinPendientes(resumen)}</div>
      ) : (
        <ul style={S.lista}>
          {enOrden.slice(0, compacto ? 5 : 50).map((p, i) => {
            const dias = diasPara(p.vence_en);
            const vencido = dias !== null && dias < 0;
            const esRevision = Boolean(onAbrir) && p.objeto_tipo === 'REVIEW' && p.objeto_id && p.project_id;
            const esIncidencia = Boolean(onAbrirIncidencia) && p.objeto_tipo === 'ISSUE' && p.objeto_id && p.project_id;
            // Una NUBE que te toca alimentar (46): a su plano, con su incidencia abierta en ESA nube.
            const esNube = Boolean(onAbrirIncidencia) && p.objeto_tipo === 'NUBE' && p.incidencia && p.project_id;
            const abrible = esRevision || esIncidencia || esNube;
            const contenido = (
              <>
                <span style={{ ...S.tipo, ...(vencido ? S.tipoVencido : {}) }}>
                  {p.objeto_tipo === 'ISSUE' ? ETIQUETA_ISSUE : (ETIQUETA[p.objeto_tipo] || p.objeto_tipo)}
                </span>
                <div style={S.centro}>
                  <div style={S.asunto}>{p.asunto}</div>
                  <div style={S.meta}>
                    {p.project_name || p.project_id}
                    {p.destino_funcion && <> · dirigido a {p.destino_funcion}</>}
                  </div>
                </div>
                {dias !== null && (
                  <span style={vencido ? S.plazoVencido : S.plazo}>
                    {vencido ? `vencido hace ${-dias} d` : `en ${dias} d`}
                  </span>
                )}
              </>
            );
            return (
              <li key={p.id} style={{ ...(abrible ? S.filaAbrible : S.fila), ...(i === 0 ? S.primera : {}) }}>
                {abrible ? (
                  <button type="button" className="mt-abrir"
                          title={esRevision ? 'Abrir la revisión' : esNube ? 'Abrir el plano en esta nube'
                            : p.documento ? 'Abrir el plano y la incidencia' : 'Abrir la incidencia'}
                          onClick={() => (esRevision
                            ? onAbrir({ obra: p.project_id, revision: p.objeto_id })
                            : esNube
                              ? onAbrirIncidencia({ obra: p.project_id, incidencia: p.incidencia, documento: p.documento || null,
                                                    version: p.version || null, nube: p.marca || null })
                              : onAbrirIncidencia({ obra: p.project_id, incidencia: p.objeto_id,
                                                    documento: p.documento || null, version: p.version || null }))}>
                    {contenido}
                  </button>
                ) : contenido}
              </li>
            );
          })}
        </ul>
      )}

      {entregados.length > 0 && (
        <>
          <div style={S.subtitulo}>Entregado, esperando respuesta</div>
          <ul style={S.lista}>
            {entregados.slice(0, compacto ? 3 : 50).map((e, i) => {
              const abrible = Boolean(onAbrirIncidencia) && e.incidencia && e.project_id;
              const contenido = (
                <>
                  <span style={S.tipo}>{e.objeto_tipo === 'ISSUE' ? ETIQUETA_ISSUE : (ETIQUETA[e.objeto_tipo] || e.objeto_tipo)}</span>
                  <div style={S.centro}>
                    <div style={S.asunto}>{e.asunto}</div>
                    <div style={S.meta}>{e.project_name || e.project_id}{e.espera ? ` · espera a ${e.espera}` : ''}</div>
                  </div>
                  <span style={S.plazo}>{haceCuanto(e.entregado_en)}</span>
                </>
              );
              return (
                <li key={e.id} style={{ ...(abrible ? S.filaAbrible : S.fila), ...(i === 0 ? S.primera : {}) }}>
                  {abrible ? (
                    <button type="button" className="mt-abrir" title="Abrir el plano donde lo entregaste"
                            onClick={() => abrirEntregado(e)}>{contenido}</button>
                  ) : contenido}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// Colores de la paleta gris del inicio (pages/entradaGris.css): «Mi trabajo»
// solo vive dentro de `.entrada-gris`, en la portada.
const S = {
  caja: { background: 'var(--eg-sup)', border: '1px solid var(--eg-linea)',
          borderRadius: 8, padding: '14px 18px 6px', color: 'var(--eg-texto)',
          width: 536, maxWidth: '100%', boxSizing: 'border-box' },
  titulo: { fontSize: 14, fontWeight: 600, marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 8 },
  // El resumen: el dato manda (el número); el color, solo en lo vencido cuando lo hay.
  resumen: { display: 'flex', gap: 28, margin: '2px 0 8px', padding: '8px 0 10px',
             borderBottom: '1px solid var(--eg-fila)' },
  cifra: { display: 'flex', flexDirection: 'column-reverse', gap: 2, minWidth: 72 },
  numero: { margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
            color: 'var(--eg-texto)' },
  numeroVencido: { color: 'var(--eg-peligro)' },
  rotulo: { fontSize: 12, color: 'var(--eg-texto-3)' },
  subtitulo: { fontSize: 13, fontWeight: 600, color: 'var(--eg-texto-3)', margin: '10px 0 2px',
               paddingTop: 10, borderTop: '1px solid var(--eg-fila)' },
  vacio: { color: 'var(--eg-texto-3)', fontSize: 14, padding: '6px 0 10px' },
  lista: { listStyle: 'none', margin: 0, padding: 0 },
  fila: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
          borderTop: '1px solid var(--eg-fila)' },
  filaAbrible: { borderTop: '1px solid var(--eg-fila)' },
  primera: { borderTop: 'none' },
  // La fila que se abre es `.mt-abrir` (entradaGris.css): un estilo en línea
  // no puede tener :hover, y la fila no respondía al puntero (UI polish F4).
  tipo: { fontSize: 12, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
          background: 'var(--eg-chip)', color: 'var(--eg-chip-texto)', borderRadius: 4,
          padding: '4px 6px', minWidth: 92, textAlign: 'center' },
  tipoVencido: { background: 'var(--eg-peligro-fondo)', color: 'var(--eg-peligro)' },
  centro: { flex: 1, minWidth: 0 },
  asunto: { fontSize: 14, color: 'var(--eg-texto)', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis' },
  meta: { fontSize: 13, color: 'var(--eg-texto-3)', marginTop: 2 },
  plazo: { fontSize: 13, color: 'var(--eg-texto-3)', whiteSpace: 'nowrap' },
  plazoVencido: { fontSize: 13, color: 'var(--eg-peligro)', fontWeight: 500, whiteSpace: 'nowrap' },
};
