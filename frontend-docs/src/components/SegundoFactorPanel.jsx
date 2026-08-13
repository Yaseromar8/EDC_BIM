// SegundoFactorPanel — alta y baja de la verificación en dos pasos.
//
// POR QUÉ EXISTE
// Sin esta pantalla, el segundo factor sólo se podría dar de alta llamando a la
// API a mano, y entonces no lo activaría nadie. La cuenta que puede archivar
// obras y borrar documentos seguiría protegida sólo por una contraseña.
//
// POR QUÉ NO HAY CÓDIGO QR
// Dibujar un QR obliga a meter una dependencia nueva en el frontend, y todas las
// aplicaciones de autenticación admiten teclear o pegar la clave. En el móvil,
// además, el enlace `otpauth://` abre la aplicación directamente, que es más
// rápido que enfocar una cámara. Si algún día entra una librería de QR por otro
// motivo, aquí se añade en cuatro líneas.
import React, { useCallback, useEffect, useState } from 'react';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const CAJA = {
  background: '#111318', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12, padding: 22, color: '#e9ecf1', width: 460, maxWidth: '92vw',
};
const BOTON = {
  background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff',
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const BOTON_SUAVE = { ...BOTON, background: 'rgba(255,255,255,0.07)', color: '#cfd6e0', fontWeight: 500 };
const CAMPO = {
  width: '100%', boxSizing: 'border-box', background: '#0b0d10', color: '#e9ecf1',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, padding: '9px 11px', fontSize: 14,
};

function enGrupos(clave) {
  // La clave se teclea a mano en el móvil: en bloques de cuatro se lee.
  return (clave || '').replace(/(.{4})/g, '$1 ').trim();
}

export default function SegundoFactorPanel({ onClose }) {
  const [estado, setEstado] = useState(null);
  const [alta, setAlta] = useState(null);        // {secreto, uri} mientras se da de alta
  const [codigo, setCodigo] = useState('');
  const [recuperacion, setRecuperacion] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const pedir = useCallback(async (ruta, cuerpo) => {
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch(`${API}${ruta}`, cuerpo === undefined
        ? {} : { method: 'POST', body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'No se pudo completar la operación.'); return null; }
      return d;
    } catch {
      setError('No se pudo conectar con el servidor.');
      return null;
    } finally {
      setOcupado(false);
    }
  }, []);

  useEffect(() => { pedir('/api/auth/2fa/estado').then((d) => d && setEstado(d)); }, [pedir]);

  const empezar = async () => {
    const d = await pedir('/api/auth/2fa/setup', {});
    if (d) { setAlta(d); setCodigo(''); }
  };

  const activar = async () => {
    const d = await pedir('/api/auth/2fa/activar', { codigo: codigo.trim() });
    if (d) {
      // Los códigos de recuperación se enseñan UNA vez. A partir de aquí el
      // servidor sólo guarda su huella y no hay forma de volver a mostrarlos.
      setRecuperacion(d.codigos_de_recuperacion);
      setAlta(null);
      setCodigo('');
      setEstado({ ...(estado || {}), activo: true });
    }
  };

  const desactivar = async () => {
    const d = await pedir('/api/auth/2fa/desactivar', { codigo: codigo.trim() });
    if (d) { setCodigo(''); setEstado({ ...(estado || {}), activo: false }); }
  };

  const descargarCodigos = () => {
    const texto = ['Códigos de recuperación — ECD', '',
      'Cada uno sirve UNA sola vez. Guárdalos donde no estén junto a tu contraseña.',
      '', ...recuperacion].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    a.download = 'codigos-recuperacion-ecd.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={CAJA}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Verificación en dos pasos</h2>
          <button onClick={onClose} style={{ ...BOTON_SUAVE, padding: '4px 9px' }}>Cerrar</button>
        </div>

        {error && (
          <p style={{ margin: '14px 0 0', padding: '9px 11px', borderRadius: 7, fontSize: 13,
                      background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.35)',
                      color: '#FFC4C4' }}>{error}</p>
        )}

        {/* ── Códigos de recuperación recién generados ── */}
        {recuperacion ? (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: '#cfd6e0' }}>
              Ya está activa. Guarda estos códigos: cada uno sirve <b>una sola vez</b> y
              son la única forma de entrar si pierdes el teléfono. No se vuelven a mostrar.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
                          background: '#0b0d10', border: '1px solid rgba(255,255,255,0.09)',
                          borderRadius: 7, padding: 12, fontFamily: 'monospace', fontSize: 13 }}>
              {recuperacion.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={descargarCodigos} style={BOTON}>Descargar</button>
              <button onClick={() => setRecuperacion(null)} style={BOTON_SUAVE}>Ya los guardé</button>
            </div>
          </>
        ) : alta ? (
          /* ── Alta en curso: clave + comprobación ── */
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: '#cfd6e0' }}>
              Añade esta clave en tu aplicación de autenticación (Google Authenticator,
              Aegis, 1Password…) con la opción de <i>introducir clave manualmente</i>, o
              abre el enlace desde el móvil.
            </p>
            <code style={{ display: 'block', background: '#0b0d10', padding: '11px 12px',
                           borderRadius: 7, border: '1px solid rgba(255,255,255,0.09)',
                           fontSize: 14, letterSpacing: 1, wordBreak: 'break-all' }}>
              {enGrupos(alta.secreto)}
            </code>
            <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
              <button onClick={() => navigator.clipboard?.writeText(alta.secreto)}
                      style={{ ...BOTON_SUAVE, fontSize: 12 }}>Copiar clave</button>
              <a href={alta.uri} style={{ ...BOTON_SUAVE, fontSize: 12, textDecoration: 'none' }}>
                Abrir en la aplicación
              </a>
            </div>
            <label style={{ fontSize: 12, color: '#8b94a1' }}>Código de 6 cifras</label>
            <input
              value={codigo} onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric" autoComplete="one-time-code" autoFocus
              style={{ ...CAMPO, marginTop: 5 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={activar} disabled={ocupado || !codigo.trim()} style={BOTON}>Activar</button>
              <button onClick={() => { setAlta(null); setError(''); }} style={BOTON_SUAVE}>Cancelar</button>
            </div>
          </>
        ) : estado?.activo ? (
          /* ── Ya activa ── */
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: '#cfd6e0' }}>
              Activa{estado.activado_en ? ` desde el ${new Date(estado.activado_en).toLocaleDateString('es-PE')}` : ''}.
              Te quedan {estado.codigos_de_recuperacion_sin_usar} códigos de recuperación sin usar.
            </p>
            <p style={{ fontSize: 12, color: '#8b94a1', lineHeight: 1.5 }}>
              Para desactivarla hace falta un código: tener la sesión abierta no basta.
            </p>
            <input
              value={codigo} onChange={(e) => setCodigo(e.target.value)}
              placeholder="Código de 6 cifras" inputMode="numeric" autoComplete="one-time-code"
              style={CAMPO}
            />
            <button onClick={desactivar} disabled={ocupado || !codigo.trim()}
                    style={{ ...BOTON_SUAVE, marginTop: 12, color: '#FFC4C4' }}>
              Desactivar
            </button>
          </>
        ) : (
          /* ── Sin activar ── */
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: '#cfd6e0' }}>
              Añade un código temporal de tu teléfono a la contraseña. Si alguien te la
              roba, seguirá sin poder entrar.
              {estado?.exigido && <b> A tu cuenta se le exige por el rol que tiene.</b>}
            </p>
            <button onClick={empezar} disabled={ocupado} style={BOTON}>Activar</button>
          </>
        )}
      </div>
    </div>
  );
}
