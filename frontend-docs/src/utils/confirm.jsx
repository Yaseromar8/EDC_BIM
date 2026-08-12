/**
 * confirm.jsx — Diálogo de confirmación consistente (reemplazo de window.confirm)
 *
 * POR QUÉ: `window.confirm` bloquea el hilo, no se puede estilizar, se ve
 * distinto en cada navegador y rompe la coherencia visual del producto. En una
 * app empresarial, una acción destructiva debe verse como parte del producto.
 *
 * USO (reemplazo directo, solo agrega `await`):
 *   if (!await confirmAction('¿Borrar?')) return;
 *   if (!await confirmAction({ title: 'Eliminar', message: '...', danger: true })) return;
 *
 * Requiere <ConfirmHost /> montado una vez en la raíz de la app.
 */
import React, { useState, useEffect, useRef } from 'react';

// Setter registrado por el host montado. Módulo-singleton: evita tener que
// pasar contexto por toda la app para algo tan transversal.
let _openDialog = null;

export function confirmAction(opts = {}) {
  const options = typeof opts === 'string' ? { message: opts } : opts;
  // Degradación segura: si el host no está montado, no rompemos el flujo.
  if (!_openDialog) {
    return Promise.resolve(window.confirm(options.message || '¿Confirmar?'));
  }
  return new Promise(resolve => _openDialog({ ...options, resolve }));
}

export function ConfirmHost() {
  const [state, setState] = useState(null);
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    _openDialog = setState;
    return () => { _openDialog = null; };
  }, []);

  // Foco automático en el botón principal (accesibilidad / teclado).
  useEffect(() => {
    if (state && confirmBtnRef.current) confirmBtnRef.current.focus();
  }, [state]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) return null;

  const close = (value) => {
    try { state.resolve(value); } catch { /* noop */ }
    setState(null);
  };

  const {
    title = 'Confirmar acción',
    message = '¿Deseas continuar?',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = false,
  } = state;

  const accent = danger ? '#d32f2f' : 'var(--accent)';

  return (
    <div
      role="presentation"
      onClick={() => close(false)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 10, width: 'min(440px, 92vw)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.22)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 8px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: danger ? '#fee2e2' : '#eef2f7', color: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 id="confirm-title" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{title}</h3>
            <p id="confirm-message" style={{ margin: '6px 0 0', fontSize: 13, color: '#4b5563', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
              {message}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px 18px' }}>
          <button
            onClick={() => close(false)}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 5,
            }}
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={() => close(true)}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: accent, color: '#fff', border: 'none', borderRadius: 5,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
