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
 */
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
// CON el prefijo `API`, como todo lo demas. El backend NO sirve el frontend:
// son origenes distintos, asi que una ruta relativa iba al sitio estatico y no
// al backend. En desarrollo colaba por el proxy de Vite, que es justo lo que
// hacia que el defecto no se viera.
import { API } from '../utils/helpers';

const ETIQUETA = {
  REVIEW: 'Revisión',
  RFI: 'RFI',
  REDLINE: 'Observación',
  TRANSMITTAL: 'Emisión',
};

function diasPara(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export default function MiTrabajo({ compacto = false, onAbrir = null }) {
  const [estado, setEstado] = useState('cargando');
  const [pendientes, setPendientes] = useState([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await apiFetch(`${API}/api/mi-trabajo`);
        if (!vivo) return;
        if (!r.ok) { setEstado('error'); return; }
        const d = await r.json();
        setPendientes(d.pendientes || []);
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

  return (
    <div style={S.caja}>
      <div style={S.titulo}>
        Mi trabajo
        {pendientes.length > 0 && <span style={S.contador}>{pendientes.length}</span>}
      </div>

      {pendientes.length === 0 ? (
        <div style={S.vacio}>No tienes nada pendiente.</div>
      ) : (
        <ul style={S.lista}>
          {pendientes.slice(0, compacto ? 5 : 50).map((p, i) => {
            const dias = diasPara(p.vence_en);
            const vencido = dias !== null && dias < 0;
            const abrible = Boolean(onAbrir) && p.objeto_tipo === 'REVIEW' && p.objeto_id && p.project_id;
            const contenido = (
              <>
                <span style={{ ...S.tipo, ...(vencido ? S.tipoVencido : {}) }}>
                  {ETIQUETA[p.objeto_tipo] || p.objeto_tipo}
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
                  <button type="button" style={S.boton} title="Abrir la revisión"
                          onClick={() => onAbrir({ obra: p.project_id, revision: p.objeto_id })}>
                    {contenido}
                  </button>
                ) : contenido}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Colores de la paleta gris del inicio (pages/entradaGris.css): «Mi trabajo»
// solo vive dentro de `.entrada-gris`, en la portada.
const S = {
  caja: { background: 'var(--eg-sup)', border: '1px solid var(--eg-linea)',
          borderRadius: 4, padding: '14px 18px 6px', color: 'var(--eg-texto)',
          width: 536, maxWidth: '100%', boxSizing: 'border-box' },
  titulo: { fontSize: 14, fontWeight: 600, marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 8 },
  contador: { background: 'var(--eg-acento)', color: '#fff', borderRadius: 9, padding: '1px 7px',
              fontSize: 11, fontWeight: 600 },
  vacio: { color: 'var(--eg-texto-3)', fontSize: 13, padding: '6px 0 10px' },
  lista: { listStyle: 'none', margin: 0, padding: 0 },
  fila: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
          borderTop: '1px solid var(--eg-fila)' },
  filaAbrible: { borderTop: '1px solid var(--eg-fila)' },
  primera: { borderTop: 'none' },
  boton: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', width: '100%',
           background: 'none', border: 'none', color: 'inherit', font: 'inherit',
           textAlign: 'left', cursor: 'pointer' },
  tipo: { fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
          background: 'var(--eg-chip)', color: 'var(--eg-chip-texto)', borderRadius: 2,
          padding: '4px 6px', minWidth: 92, textAlign: 'center' },
  tipoVencido: { background: 'var(--eg-peligro-fondo)', color: 'var(--eg-peligro)' },
  centro: { flex: 1, minWidth: 0 },
  asunto: { fontSize: 13.5, color: 'var(--eg-texto)', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis' },
  meta: { fontSize: 12, color: 'var(--eg-texto-3)', marginTop: 2 },
  plazo: { fontSize: 12, color: 'var(--eg-texto-3)', whiteSpace: 'nowrap' },
  plazoVencido: { fontSize: 12, color: 'var(--eg-peligro)', fontWeight: 500, whiteSpace: 'nowrap' },
};
