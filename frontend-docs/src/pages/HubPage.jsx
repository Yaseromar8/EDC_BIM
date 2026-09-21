// HubPage — selector de producto, bajo la marca madre ALEPHIA.
//
// Criterio: sobrio. Sin eslóganes, sin descripciones, sin animaciones de
// entrada. Fichas con el nombre del producto y nada más — quien llega aquí
// ya sabe qué es cada cosa. Detrás, una única luz difusa que centra la
// mirada. Es una bifurcación de caminos: se entra, se elige y se sale.
//
// Identidad: gris medio desde el 21-sep-2026 («no tan blanco sino como escala de
// grises», maqueta v4). Cabecera gris carbón con el logo oficial blanco, fondo
// gris y fichas con borde fino; Signal SOLO en interacción (hover, foco). Sin
// brillos ni transparencias. La paleta vive en entradaGris.css.
import React, { useState } from 'react';
import { API, VISOR_URL } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import MiTrabajo from '../components/MiTrabajo';
import SegundoFactorPanel from '../components/SegundoFactorPanel';
import MiCuentaPanel from '../components/MiCuentaPanel';
import './entradaGris.css';

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
        width: 260, maxWidth: '88vw', padding: '22px 22px 20px',
        // Ficha sólida con borde fino; la interacción es Signal.
        background: 'var(--eg-sup)',
        border: `1px solid ${active ? 'var(--eg-foco)' : 'var(--eg-linea)'}`,
        outline: 'none',
        boxShadow: foco ? '0 0 0 3px rgb(62 111 145 / .30)' : (active ? 'var(--eg-sombra)' : 'none'),
        borderRadius: 4,
        cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.5 : 1,
        transition: 'border-color .18s, box-shadow .18s',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--eg-texto-2)"
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {/* MARCA + PRODUCTO en un solo renglón, jerarquía tipográfica:
            ALEPHIA sereno, el producto con el peso. Sin colores por producto. */}
        <span style={{ fontSize: 15, color: 'var(--eg-texto)' }}>
          <span style={{ fontWeight: 400, color: 'var(--eg-texto-3)' }}>ALEPHIA </span>
          <span style={{ fontWeight: 600 }}>{producto}</span>
        </span>
        {!locked && (
          <span style={{ fontSize: 15, color: 'var(--eg-foco)', opacity: active ? 1 : 0, transition: 'opacity .18s' }}>→</span>
        )}
      </div>
      {locked && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--eg-texto-3)' }}>{lockNote || 'Sin acceso'}</div>
      )}
    </div>
  );
}

export default function HubPage({ user, onChooseDocs, onLogout, onAbrirRevision }) {
  // P6 v1: «Mi cuenta» (contraseña · 2FA · sesiones). El panel del segundo
  // factor se conserva tal cual y se abre DESDE Mi cuenta.
  const [panel, setPanel] = useState(null); // null | 'cuenta' | '2fa'

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
    <div className="entrada-gris" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      <header className="eg-cab" style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 24px', flexShrink: 0 }}>
        {/* Marca madre: logo horizontal oficial en blanco (01_Master_Vector),
            nunca redibujado. 22px de alto ⇒ ~138px, sobre el mínimo de 120px;
            cabe entero incluso en móvil, así que el símbolo suelto queda para
            espacios realmente compactos (favicon, launcher). */}
        <img src="/brand/ALEPHIA_Logo_Horizontal_White.svg" alt="ALEPHIA"
             style={{ height: 22, width: 'auto', display: 'block' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <button className="eg-cab-enlace" onClick={() => setPanel('cuenta')}>
          Mi cuenta
        </button>
        <button className="eg-cab-enlace" onClick={onLogout}>
          Cerrar sesión
        </button>
        </div>
      </header>

      {panel === 'cuenta' && (
        <MiCuentaPanel user={user} onClose={() => setPanel(null)}
                       onAbrir2FA={() => setPanel('2fa')} />
      )}
      {panel === '2fa' && <SegundoFactorPanel onClose={() => setPanel('cuenta')} />}

      <main style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 64px', overflow: 'hidden' }}>

        {/* Sin la luz difusa de antes: el fondo gris y el borde de las fichas
            bastan para situar el centro (maqueta v4). */}
        <h1 className="eg-saludo">
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
        <div style={{ marginTop: 24, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <MiTrabajo compacto onAbrir={onAbrirRevision} />
        </div>
      </main>
    </div>
  );
}
