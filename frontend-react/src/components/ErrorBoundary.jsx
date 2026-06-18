import React from 'react';

/**
 * ErrorBoundary — atrapa errores de render de su subárbol y muestra una UI de
 * recuperación en vez de dejar la app en pantalla blanca.
 *
 * Props:
 *   - scope: etiqueta para el log ('app' | 'viewer' | ...)
 *   - title / message: textos opcionales de la pantalla de recuperación
 *   - compact: variante chica (para envolver un panel, no toda la app)
 *   - onReset: callback opcional para reintentar sin recargar toda la página
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        // Log para diagnóstico (consola + cualquier hook futuro de telemetría)
        console.error(`[ErrorBoundary:${this.props.scope || 'app'}]`, error, info?.componentStack);
        // No reventar: el estado ya muestra la UI de recuperación
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        if (this.props.onReset) {
            try { this.props.onReset(); } catch (e) { /* noop */ }
        }
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        const { compact, title, message } = this.props;
        const errMsg = this.state.error?.message || 'Error desconocido';

        if (compact) {
            return (
                <div style={S.compactWrap}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e06a6a', marginBottom: 6 }}>
                        {title || 'Esta sección falló'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9aa3b0', marginBottom: 12 }}>
                        {message || 'Algo se rompió aquí, pero el resto de la app sigue funcionando.'}
                    </div>
                    <button style={S.btn} onClick={this.handleReset}>Reintentar</button>
                </div>
            );
        }

        return (
            <div style={S.fullWrap}>
                <div style={S.card}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                        {title || 'Algo salió mal'}
                    </div>
                    <div style={{ fontSize: 13, color: '#9aa3b0', marginBottom: 4, lineHeight: 1.5 }}>
                        {message || 'La aplicación encontró un error inesperado. Tus datos están a salvo en el servidor.'}
                    </div>
                    <div style={{ fontSize: 11, color: '#5d6672', marginBottom: 20, fontFamily: 'monospace', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {errMsg}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                        <button style={S.btn} onClick={this.handleReset}>Reintentar</button>
                        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => window.location.reload()}>Recargar la app</button>
                    </div>
                </div>
            </div>
        );
    }
}

const S = {
    fullWrap: { position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#15181d', padding: 24 },
    card: { background: '#1b2026', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '32px 40px', textAlign: 'center', maxWidth: 520 },
    compactWrap: { padding: 20, background: '#1b2026', border: '1px solid rgba(224,106,106,0.3)', borderRadius: 8, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    btn: { background: 'transparent', color: '#ccd2d9', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
    btnPrimary: { background: '#3d7eff', color: '#fff', border: 'none' },
};
