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
import { PaisajeDeObra } from '../components/IlustracionesDeObra';
import './entradaGris.css';

// COLOR POR PRODUCTO (3-nov-2026, pedido del dueño: «el color es en todo el recuadro» y «las líneas, buen relieve, no
// tan gruesas»). De la paleta oficial (D-24): Docs en azul y View en verde, cada uno con su tinte de fondo y su tono
// para el icono y el borde al pasar. El naranja no: queda para enviar y lo activo.
const COLOR_DE_PRODUCTO = {
  Docs: { fondo: '#ECF0F1', tono: '#507294', foco: 'rgb(80 114 148 / .30)' },
  View: { fondo: '#E0E3D7', tono: '#64744E', foco: 'rgb(100 116 78 / .30)' },
};

function ProductCard({ icon, producto, onClick, locked = false, lockNote }) {
  const color = COLOR_DE_PRODUCTO[producto] || { fondo: 'var(--eg-sup)', tono: 'var(--eg-texto-2)', foco: 'rgb(80 114 148 / .30)' };
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
        // La ficha entera en el tinte del producto; al pasar, el borde en su tono.
        background: color.fondo,
        border: `1px solid ${active ? color.tono : color.fondo}`,
        outline: 'none',
        boxShadow: foco ? `0 0 0 3px ${color.foco}` : (active ? 'var(--eg-sombra)' : 'none'),
        borderRadius: 8,
        cursor: locked ? 'default' : 'pointer',
        opacity: locked ? 0.5 : 1,
        transition: 'border-color .18s, box-shadow .18s',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color.tono}
           strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {/* MARCA + PRODUCTO en un solo renglón, jerarquía tipográfica:
            ALEPHIA sereno, el producto con el peso. */}
        <span style={{ fontSize: 15, color: 'var(--eg-texto)' }}>
          <span style={{ fontWeight: 400, color: 'var(--eg-texto-3)' }}>ALEPHIA </span>
          <span style={{ fontWeight: 600 }}>{producto}</span>
        </span>
        {!locked && (
          <span style={{ fontSize: 15, color: color.tono, opacity: active ? 1 : 0, transition: 'opacity .18s' }}>→</span>
        )}
      </div>
      {locked && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--eg-texto-3)' }}>{lockNote || 'Sin acceso'}</div>
      )}
    </div>
  );
}

export default function HubPage({ user, onChooseDocs, onLogout, onAbrirRevision, onAbrirIncidencia = null }) {
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
        <img src="/brand/ALEPHIA_Logo_Horizontal_Light.svg" alt="ALEPHIA"
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

      <main style={{ position: 'relative', isolation: 'isolate', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 64px', overflow: 'hidden' }}>

        {/* PAISAJE DE OBRA al pie, solo líneas y en gris muy tenue (14-oct-2026).
            Aquí sí cabe: la entrada no tiene datos que leer. Detrás del
            contenido (`isolation` + z-index -1) y sin eventos. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 'min(34vh, 260px)',
                                         zIndex: -1, pointerEvents: 'none', color: '#72706B', opacity: 0.13 }}>
          <PaisajeDeObra />
        </div>

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
            icon={<><path d="M6.5 3.5H14l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" /><path d="M13.5 3.5v5h5" /><path d="M8.5 12.5h7M8.5 15.5h7M8.5 9.5h2.5" /></>}
            onClick={onChooseDocs}
          />
          {/* ALEPHIA View = el visor 3D, entrada funcional independiente.
              Solo si esta instancia tiene visor contratado. Sin VITE_VISOR_URL
              la ficha no existe: antes llevaba al visor del PROVEEDOR con un
              ticket SSO de la entidad en la URL. Ver helpers.js. */}
          {VISOR_URL && (
            <ProductCard
              producto="View"
              // «Modelo con órbita» (3-nov-2026, elegido por el dueño): el modelo y el giro de la cámara.
              icon={<><path d="M12 3.2 17.8 6.4v6.5L12 16.2l-5.8-3.3V6.4z" /><path d="M6.2 6.4 12 9.7l5.8-3.3M12 9.7v6.5" /><path d="M5.3 12.4C2.9 13.6 2 15.1 3.2 16.5c2.2 2.6 10.2 3.5 15.6 1.8" /><path d="m17.1 16.6 1.9 1.7-1.7 1.9" /><path d="M18.7 12.4c2.4 1.2 3.3 2.7 2.2 4.1" /></>}
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
          <MiTrabajo compacto onAbrir={onAbrirRevision} onAbrirIncidencia={onAbrirIncidencia} />
        </div>
      </main>
    </div>
  );
}
