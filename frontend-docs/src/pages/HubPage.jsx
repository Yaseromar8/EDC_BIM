// HubPage — selector de producto.
//
// Criterio: sobrio. Sin eslóganes, sin descripciones, sin animaciones de
// entrada. Dos fichas con el nombre del producto y nada más — quien llega aquí
// ya sabe qué es cada cosa. Detrás de ambas, una única luz difusa que centra la
// mirada. Es una bifurcación de dos caminos: se entra, se elige y se sale.
import React, { useState } from 'react';
import { API, VISOR_URL } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import MiTrabajo from '../components/MiTrabajo';
import SegundoFactorPanel from '../components/SegundoFactorPanel';

const ACCENT = 'var(--accent)';

function ProductCard({ icon, title, onClick, locked = false, lockNote }) {
  const [hover, setHover] = useState(false);
  const active = hover && !locked;
  return (
    <div
      onClick={locked ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 250, maxWidth: '88vw', padding: '30px 26px',
        // Translúcida a propósito: la luz del fondo se cuela por debajo.
        background: active ? 'rgba(28,32,39,0.82)' : 'rgba(17,19,24,0.72)',
        border: `1px solid ${active ? 'rgba(120,140,175,0.45)' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 12,
        backdropFilter: 'blur(6px)',
        cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.5 : 1,
        transition: 'background .18s, border-color .18s',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#cfd6e0' : '#8b94a1'}
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke .18s' }}>
        {icon}
      </svg>
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#e9ecf1', letterSpacing: -0.2 }}>{title}</span>
        {!locked && (
          <span style={{ fontSize: 15, color: '#cfd6e0', opacity: active ? 1 : 0, transition: 'opacity .18s' }}>→</span>
        )}
      </div>
      {locked && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>{lockNote || 'Sin acceso'}</div>
      )}
    </div>
  );
}

export default function HubPage({ user, onChooseDocs, onLogout }) {
  const [verSeguridad, setVerSeguridad] = useState(false);

  const rawName = String(user?.name || user?.username || user?.email || '').trim();
  const first = rawName ? rawName.split(/[@\s._]+/)[0] : '';
  const niceName = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';

  const openVisor = async () => {
    // Sin destino declarado no se emite ticket. Emitirlo "por si acaso" era
    // regalar un token a un tercero.
    if (!VISOR_URL) return;
    try {
      const response = await apiFetch(`${API}/api/auth/handoff`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.ticket) throw new Error(data.error || 'No se pudo abrir el Visor.');
      // `pick=1`: entrar por el Hub SIEMPRE aterriza en el selector de modelos,
      // aunque el visor recuerde el último proyecto abierto. Elegir producto y
      // elegir modelo son dos decisiones distintas; no se salta la segunda.
      const sep = VISOR_URL.includes('?') ? '&' : '?';
      window.location.href = `${VISOR_URL}${sep}pick=1&sso_ticket=${encodeURIComponent(data.ticket)}`;
    } catch (error) {
      window.alert(error.message || 'No se pudo abrir el Visor. Intenta iniciar sesión nuevamente.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0b0d10', color: '#e9ecf1' }}>

      <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, borderBottom: '1px solid #16191e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill={ACCENT} />
            <path d="M7 8.5l5 8 5-8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          ECD<span style={{ color: '#79818d', fontWeight: 400 }}>&nbsp;Vision</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <button onClick={() => setVerSeguridad(true)} style={{ background: 'none', border: 'none', color: '#79818d', fontSize: 13, cursor: 'pointer', padding: 0 }}>
          Seguridad
        </button>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#79818d', fontSize: 13, cursor: 'pointer', padding: 0 }}>
          Cerrar sesión
        </button>
        </div>
      </header>

      {verSeguridad && <SegundoFactorPanel onClose={() => setVerSeguridad(false)} />}

      <main style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 64px', overflow: 'hidden' }}>

        {/* Una sola luz detrás de las dos fichas. No decora: sitúa el centro de
            la pantalla y hace que las tarjetas floten sobre algo. */}
        <div aria-hidden style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(1100px, 130vw)', height: 'min(760px, 95vh)', pointerEvents: 'none',
          background: [
            'radial-gradient(closest-side, rgba(64,96,168,0.34), rgba(44,68,124,0.20) 45%, rgba(24,36,70,0.09) 68%, transparent 82%)',
            'radial-gradient(closest-side, rgba(120,150,210,0.13), transparent 58%)',
          ].join(','),
          filter: 'blur(26px)',
        }} />

        <h1 style={{ position: 'relative', margin: '0 0 28px', fontSize: 20, fontWeight: 500, color: '#c3cad3', letterSpacing: -0.2 }}>
          {niceName ? `Hola, ${niceName}` : 'Hola'}
        </h1>

        <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
          {/* Documentos, abierta a todo el que inicia sesión: dentro, el listado
              sale filtrado por MEMBRESÍA desde el servidor, y lo administrativo
              lo decide `mi-administracion` obra por obra. El candado «Solo
              administradores» que había aquí era de antes de que existiera el
              perímetro por obra — hacía de la administración la llave de las
              herramientas, que son cosas distintas. */}
          <ProductCard
            title="Documentos"
            icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>}
            onClick={onChooseDocs}
          />
          {/* Solo si esta instancia tiene visor contratado. Sin VITE_VISOR_URL
              la ficha no existe: antes llevaba al visor del PROVEEDOR con un
              ticket SSO de la entidad en la URL. Ver helpers.js. */}
          {VISOR_URL && (
            <ProductCard
              title="Visor 3D"
              icon={<><path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" /><path d="M12 22V12" /><path d="M3.5 7L12 12l8.5-5" /></>}
              onClick={openVisor}
            />
          )}
        </div>

        {/* Lo que está esperando por esta persona, en la portada.
            Hasta ahora se entraba y se veían carpetas: nada estaba organizado
            por quién debe hacer qué. Sólo lee, y el backend la construye
            partiendo de la membresía, así que no muestra ni una obra de las que
            el usuario no forme parte. */}
        <div style={{ marginTop: 34, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <MiTrabajo compacto />
        </div>
      </main>
    </div>
  );
}
