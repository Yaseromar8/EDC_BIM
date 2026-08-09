/**
 * idoneidad.jsx — Elegir PARA QUÉ queda autorizado un documento al publicarlo.
 *
 * POR QUÉ EXISTE: la plataforma sabía dónde estaba un documento (su punto del
 * ciclo de vida) pero nunca para qué se podía usar. "Publicado" a secas no
 * distingue un plano apto para construir de uno que es solo informativo, y con
 * esa diferencia se construye o no se construye. Es lo primero que mira una
 * supervisión.
 *
 * Se pide con una lista cerrada y no con un campo de texto a propósito: el
 * código tiene que salir del catálogo de la obra, que es lo que se audita.
 *
 * USO:
 *   const codigo = await pedirIdoneidad(API, projectPrefix, 'PUBLISHED');
 *   if (!codigo) return;   // se echó atrás
 *
 * Requiere <IdoneidadHost /> montado una vez en la raíz.
 */
import React, { useState, useEffect } from 'react';
import { apiFetch } from './apiFetch';

let _abrir = null;

export function pedirIdoneidad(API, modelUrn, destino = 'PUBLISHED') {
  if (!_abrir) return Promise.resolve(null);
  return new Promise(resolve => _abrir({ API, modelUrn, destino, resolve }));
}

// El backend decide qué familia vale para cada destino; aquí solo se filtra para
// no ofrecer códigos que va a rechazar.
const FAMILIA_DE_DESTINO = { PUBLISHED: 'publicado', SHARED: 'compartido' };

export function IdoneidadHost() {
  const [state, setState] = useState(null);
  const [codigos, setCodigos] = useState([]);
  const [elegido, setElegido] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    _abrir = setState;
    return () => { _abrir = null; };
  }, []);

  useEffect(() => {
    if (!state) { setCodigos([]); setElegido(''); setError(null); return; }
    let vivo = true;
    setCargando(true);
    setError(null);
    apiFetch(`${state.API}/api/docs/idoneidad?model_urn=${encodeURIComponent(state.modelUrn)}`)
      .then(r => r.json())
      .then(d => {
        if (!vivo) return;
        if (!d.success) throw new Error(d.error || 'No se pudo leer el catálogo');
        const familia = FAMILIA_DE_DESTINO[state.destino];
        setCodigos((d.codigos || []).filter(c => !familia || c.familia === familia));
      })
      .catch(e => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [state]);

  if (!state) return null;

  const cerrar = (valor) => {
    try { state.resolve(valor); } catch { /* noop */ }
    setState(null);
  };

  return (
    <div
      role="presentation"
      onClick={() => cerrar(null)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idoneidad-title"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 10, width: 'min(520px, 94vw)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.22)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 6px' }}>
          <h3 id="idoneidad-title" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1f2937' }}>
            ¿Para qué queda autorizado?
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4b5563', lineHeight: 1.55 }}>
            Publicar no dice para qué sirve el documento. El código de idoneidad sí, y es
            lo que se le enseña a una supervisión.
          </p>
        </div>

        <div style={{ padding: '14px 22px', maxHeight: '46vh', overflowY: 'auto' }}>
          {cargando && <div style={{ fontSize: 13, color: '#666' }}>Cargando el catálogo de la obra…</div>}
          {error && <div style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
          {!cargando && !error && codigos.length === 0 && (
            <div style={{ fontSize: 13, color: '#666' }}>
              Esta obra no tiene códigos de idoneidad configurados para esa acción.
            </div>
          )}
          {codigos.map(c => (
            <label
              key={c.codigo}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 10px',
                borderRadius: 6, cursor: 'pointer',
                background: elegido === c.codigo ? '#eef2f7' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="idoneidad"
                value={c.codigo}
                checked={elegido === c.codigo}
                onChange={() => setElegido(c.codigo)}
                style={{ marginTop: 2 }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{c.codigo}</span>
                <span style={{ fontSize: 13, color: '#4b5563' }}> · {c.etiqueta}</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px 18px', borderTop: '1px solid #eee' }}>
          <button
            onClick={() => cerrar(null)}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 5,
            }}
          >
            Cancelar
          </button>
          <button
            disabled={!elegido}
            onClick={() => cerrar(elegido)}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 600,
              cursor: elegido ? 'pointer' : 'not-allowed',
              background: elegido ? '#5f7fa3' : '#c7ced6', color: '#fff',
              border: 'none', borderRadius: 5,
            }}
          >
            Publicar
          </button>
        </div>
      </div>
    </div>
  );
}
