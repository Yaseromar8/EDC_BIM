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

export default function MiTrabajo({ compacto = false }) {
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
          {pendientes.slice(0, compacto ? 5 : 50).map((p) => {
            const dias = diasPara(p.vence_en);
            const vencido = dias !== null && dias < 0;
            return (
              <li key={p.id} style={S.fila}>
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const S = {
  caja: { background: 'var(--panel, #14161a)', border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 12, padding: '18px 20px', color: '#e8eaed', maxWidth: 720 },
  titulo: { fontSize: 15, fontWeight: 600, letterSpacing: .2, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8 },
  contador: { background: '#2f6fed', color: '#fff', borderRadius: 10, padding: '1px 8px',
              fontSize: 12, fontWeight: 700 },
  vacio: { opacity: .55, fontSize: 13, padding: '6px 0' },
  lista: { listStyle: 'none', margin: 0, padding: 0 },
  fila: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
          borderTop: '1px solid rgba(255,255,255,.06)' },
  tipo: { fontSize: 11, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase',
          background: 'rgba(255,255,255,.07)', borderRadius: 6, padding: '3px 8px',
          minWidth: 92, textAlign: 'center' },
  tipoVencido: { background: 'rgba(220,80,80,.18)', color: '#ff9d9d' },
  centro: { flex: 1, minWidth: 0 },
  asunto: { fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis' },
  meta: { fontSize: 11.5, opacity: .5, marginTop: 2 },
  plazo: { fontSize: 12, opacity: .6, whiteSpace: 'nowrap' },
  plazoVencido: { fontSize: 12, color: '#ff9d9d', fontWeight: 600, whiteSpace: 'nowrap' },
};
