// HubPage — selector de producto, bajo la marca madre ALEPHIA.
//
// Criterio: sobrio. Sin eslóganes, sin descripciones, sin animaciones de
// entrada. Fichas con el nombre del producto y nada más — quien llega aquí
// ya sabe qué es cada cosa. Detrás, una única luz difusa que centra la
// mirada. Es una bifurcación de caminos: se entra, se elige y se sale.
//
// Identidad (ETAPA 3): fondo Ink, profundidad en Navy, logo oficial blanco,
// Signal SOLO en interacción (hover, foco). La jerarquía la hacen la
// tipografía y el espacio, no colores por producto ni brillos.
import React, { useState } from 'react';
import { API, VISOR_URL } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import MiTrabajo from '../components/MiTrabajo';
import SegundoFactorPanel from '../components/SegundoFactorPanel';

// Paleta oficial ALEPHIA (03_Web). El Hub es zona oscura: Ink de fondo,
// Navy como profundidad, Signal únicamente cuando el usuario interactúa.
const INK = '#0B0E12';
const NAVY = '#153754';
const SIGNAL = '#3E6F91';

function ProductCard({ icon, producto, onClick, locked = false, lockNote }) {
  const [hover, setHover] = useState(false);
  const [foco, setFoco] = useState(false);
  const active = (hover || foco) && !locked;
  return (
    <div
      role="button"
      tabIndex={locked ? -1 : 0}
      onClick={locked ? undefined : onClick}
      onKeyDown={e => { if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick?.(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFoco(true)}
      onBlur={() => setFoco(false)}
      style={{
        width: 250, maxWidth: '88vw', padding: '30px 26px',
        // Translúcida a propósito: la luz Navy del fondo se cuela por debajo.
        background: active ? 'rgba(17,28,42,0.85)' : 'rgba(11,14,18,0.72)',
        // La interacción es Signal; el reposo, un borde neutro casi invisible.
        border: `1px solid ${active ? 'rgba(62,111,145,0.60)' : 'rgba(255,255,255,0.09)'}`,
        outline: 'none',
        boxShadow: foco ? `0 0 0 3px rgba(62,111,145,0.30)` : 'none',
        borderRadius: 10,
        backdropFilter: 'blur(6px)',
        cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.5 : 1,
        transition: 'background .18s, border-color .18s, box-shadow .18s',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#cfd6e0' : '#8b94a1'}
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke .18s' }}>
        {icon}
      </svg>
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {/* MARCA + PRODUCTO en un solo renglón, jerarquía tipográfica:
            ALEPHIA sereno, el producto con el peso. Sin colores por producto. */}
        <span style={{ fontSize: 16, letterSpacing: -0.1, color: '#e9ecf1' }}>
          <span style={{ fontWeight: 400, opacity: 0.78 }}>ALEPHIA </span>
          <span style={{ fontWeight: 700 }}>{producto}</span>
        </span>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: INK, color: '#e9ecf1' }}>

      <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 24px', flexShrink: 0, borderBottom: '1px solid rgba(21,55,84,0.55)' }}>
        {/* Marca madre: logo horizontal oficial en blanco (01_Master_Vector),
            nunca redibujado. 28px de alto ⇒ ~126px, sobre el mínimo de 120px;
            cabe entero incluso en móvil, así que el símbolo suelto queda para
            espacios realmente compactos (favicon, launcher). */}
        <img src="/brand/ALEPHIA_Logo_Horizontal_White.svg" alt="ALEPHIA"
             style={{ height: 28, width: 'auto', display: 'block' }} />
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

        {/* Una sola luz detrás de las fichas. No decora: sitúa el centro de
            la pantalla y hace que las tarjetas floten sobre algo. La luz es
            NAVY — la profundidad de la marca — no un azul cualquiera. */}
        <div aria-hidden style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(1100px, 130vw)', height: 'min(760px, 95vh)', pointerEvents: 'none',
          background: [
            'radial-gradient(closest-side, rgba(21,55,84,0.55), rgba(21,55,84,0.28) 45%, rgba(21,55,84,0.10) 68%, transparent 82%)',
            'radial-gradient(closest-side, rgba(62,111,145,0.10), transparent 58%)',
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
          {/* ALEPHIA Docs = el portal documental (esta app). Nombre de
              producto solo si la función existe de verdad: hoy son estas dos. */}
          <ProductCard
            producto="Docs"
            icon={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>}
            onClick={onChooseDocs}
          />
          {/* ALEPHIA View = el visor 3D, entrada funcional independiente.
              Solo si esta instancia tiene visor contratado. Sin VITE_VISOR_URL
              la ficha no existe: antes llevaba al visor del PROVEEDOR con un
              ticket SSO de la entidad en la URL. Ver helpers.js. */}
          {VISOR_URL && (
            <ProductCard
              producto="View"
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
