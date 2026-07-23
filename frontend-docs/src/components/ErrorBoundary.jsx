import React from 'react';

/**
 * ErrorBoundary — red de seguridad de la interfaz.
 *
 * Sin esto, CUALQUIER error de render (un campo null inesperado del backend,
 * una fecha inválida, un array que llega como objeto) desmonta todo el árbol
 * de React y el usuario queda ante una PANTALLA BLANCA, sin saber qué pasó ni
 * cómo salir. Aquí lo contenemos: se muestra el error, se ofrece recargar y
 * el resto de la app (o el módulo hermano) sigue en pie.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary${this.props.scope ? ` · ${this.props.scope}` : ''}]`, error, info?.componentStack);
    // Buffer para diagnóstico posterior (mismo patrón que el visor)
    window.__stabilityLog = window.__stabilityLog || [];
    window.__stabilityLog.push({
      kind: 'render-error',
      scope: this.props.scope || 'docs',
      detail: String(error?.stack || error).slice(0, 400),
      at: new Date().toISOString(),
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        padding: '28px 32px', margin: 16, background: '#fff',
        border: '1px solid #f0d0d0', borderRadius: 8, color: '#3c3c3c',
        fontFamily: 'inherit', maxWidth: 620,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {this.props.title || 'Esta sección no se pudo mostrar'}
          </h3>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.5 }}>
          {this.props.message || 'Ocurrió un error inesperado al dibujar esta vista. Tus datos están a salvo — no se perdió nada.'}
        </p>
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#8b93a0' }}>Detalle técnico</summary>
          <pre style={{ fontSize: 11, color: '#8b93a0', whiteSpace: 'pre-wrap', marginTop: 8, maxHeight: 160, overflow: 'auto' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </details>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '7px 14px', fontSize: 13, border: '1px solid #dcdcdc', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '7px 14px', fontSize: 13, border: 'none', background: '#5f7fa3', color: '#fff', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
          >
            Recargar página
          </button>
        </div>
      </div>
    );
  }
}
