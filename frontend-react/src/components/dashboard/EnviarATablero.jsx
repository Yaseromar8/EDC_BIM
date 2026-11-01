// EnviarATablero — «Enviar a un tablero de Docs» (docs/visor/68). La gráfica se calcula aquí, con el modelo, y llega al
// tablero de Docs elegido como una foto con fecha y un enlace de vuelta a este Tablero. Volver a enviarla la pone al
// día en su sitio (no se duplica). Los tableros son los de la obra de este frente; donde eres lector no se puede.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/apiFetch';
import { DOCS_URL } from '../../utils/hubLink';
import { C, FUENTE, RADIO } from './tema';

async function llamar(url, opciones) {
  try {
    const r = await apiFetch(url, opciones);
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d.success !== false, estado: r.status, ...d };
  } catch {
    return { ok: false, estado: 0, error: 'No se pudo conectar con el servidor.' };
  }
}

export default function EnviarATablero({ grafica, backendUrl, frente, origen, onCerrar }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [elegido, setElegido] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(null);       // { nombre, id, reemplazada }
  useEffect(() => {
    let vivo = true;
    llamar(`${backendUrl}/api/docs/tableros?frente=${encodeURIComponent(frente)}`).then(d => {
      if (!vivo) return;
      if (!d.ok) { setError(d.estado === 404 ? 'Los tableros de Docs aún no están disponibles en este servidor.' : (d.error || 'No se pudo leer la lista de tableros.')); setLista([]); return; }
      setLista(d.tableros || []);
    });
    return () => { vivo = false; };
  }, [backendUrl, frente]);
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onCerrar]);

  const enviar = async () => {
    if (!elegido) return;
    setEnviando(true); setError('');
    const d = await llamar(`${backendUrl}/api/docs/tableros/${elegido.id}/graficas`, {
      method: 'POST', body: JSON.stringify({ grafica: { ...grafica, origen } }),
    });
    setEnviando(false);
    if (!d.ok) { setError(d.error || 'No se pudo enviar la gráfica.'); return; }
    setHecho({ nombre: d.tablero || elegido.nombre, id: elegido.id, reemplazada: !!d.reemplazada });
  };
  const enlaceDocs = hecho && DOCS_URL && origen.obra
    ? `${DOCS_URL.replace(/\/$/, '')}/?obra=${encodeURIComponent(origen.obra)}&tablero=${encodeURIComponent(hecho.id)}` : null;

  return (
    <div role="dialog" aria-label="Enviar a un tablero de Docs" onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999990, background: 'rgba(20,20,19,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh', fontFamily: FUENTE }}
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{ width: 'min(460px, calc(100vw - 32px))', background: C.blanco, borderRadius: RADIO, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: 20, boxSizing: 'border-box', color: C.dark }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Enviar a un tablero de Docs</div>
        <div style={{ fontSize: 13, color: C.gris600, lineHeight: 1.5, marginBottom: 14 }}>
          «{grafica.titulo}» llega como una foto con fecha y un enlace de vuelta aquí. Si ya estaba en ese tablero, se pone al día en su sitio.
        </div>
        {hecho ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 14 }}>{hecho.reemplazada ? 'Puesta al día en' : 'Enviada a'} «{hecho.nombre}».</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {enlaceDocs && <a href={enlaceDocs} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.blue30D, alignSelf: 'center', textDecoration: 'none' }}>Abrir en Docs ↗</a>}
              <button type="button" onClick={onCerrar} style={boton(true)}>Listo</button>
            </div>
          </div>
        ) : (
          <>
            <div role="listbox" aria-label="Tableros de la obra" style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.lightGray}`, borderRadius: 6 }}>
              {lista === null && <div style={{ padding: 12, fontSize: 13, color: C.gris600 }}>Cargando…</div>}
              {lista && !lista.length && !error && <div style={{ padding: 12, fontSize: 13, color: C.gris600 }}>La obra aún no tiene tableros en Docs. Crea uno en Docs › Tableros.</div>}
              {(lista || []).map(t => {
                const lector = t.mi_rol === 'lector';
                return (
                  <button key={t.id} type="button" role="option" aria-selected={elegido?.id === t.id} disabled={lector} data-tablero-docs={t.id}
                    onClick={() => setElegido(t)} title={lector ? 'En este tablero eres lector' : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none', borderBottom: `1px solid ${C.light50}`, textAlign: 'left',
                      background: elegido?.id === t.id ? 'rgba(13,102,180,0.10)' : 'transparent', cursor: lector ? 'default' : 'pointer', fontFamily: FUENTE, color: lector ? C.midGray : C.dark }}>
                    <span style={{ flex: 1, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nombre}</span>
                    <span style={{ fontSize: 12, color: C.gris600 }}>{lector ? 'Eres lector' : t.creado_por}</span>
                  </button>
                );
              })}
            </div>
            {error && <div style={{ fontSize: 13, color: C.error, marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={onCerrar} style={boton(false)}>Cancelar</button>
              <button type="button" onClick={enviar} disabled={!elegido || enviando} style={boton(true, !elegido || enviando)}>{enviando ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const boton = (principal, apagado = false) => ({
  height: 32, padding: '0 14px', borderRadius: 6, fontSize: 14, fontFamily: FUENTE, cursor: apagado ? 'default' : 'pointer',
  border: principal ? 'none' : `1px solid ${C.lightGray}`, background: principal ? (apagado ? C.gris300 : C.dark) : C.blanco, color: principal ? C.blanco : C.dark,
});
