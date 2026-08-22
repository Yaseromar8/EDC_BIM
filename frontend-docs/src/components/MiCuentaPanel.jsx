// MiCuentaPanel — P6 v1 del diseño de Identity & Access UX.
//
// LO QUE ES: la pantalla de la PERSONA sobre su propia cuenta — contraseña,
// verificación en dos pasos y sesiones. Tres cosas que ya existían en el motor
// (change-password, 2fa/*, revoke_all_sessions) y no tenían casa.
//
// LO QUE NO ES: administración. Aquí nadie toca a otro usuario, ni roles, ni
// membresías — eso vive en «Usuarios del sistema» (entidad) y en Participantes
// (obra). Mezclarlos sería reconstruir el «rol gigante» que el diseño prohíbe.
//
// P6 v1 = contraseña + 2FA + G4a (cerrar mis otras sesiones). Las sesiones con
// detalle (G4b: cuál, desde dónde, cerrar una) tienen su propia decisión de
// esquema y quedan explícitamente fuera.
import React, { useState } from 'react';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

const CAJA = {
  background: '#111318', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12, padding: 22, color: '#e9ecf1', width: 460, maxWidth: '92vw',
  maxHeight: '90vh', overflowY: 'auto',
};
const BOTON = {
  background: 'var(--alephia-signal, #3E6F91)', border: 'none', borderRadius: 7, color: '#fff',
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const BOTON_SUAVE = { ...BOTON, background: 'rgba(255,255,255,0.07)', color: '#cfd6e0', fontWeight: 500 };
const CAMPO = {
  width: '100%', boxSizing: 'border-box', background: '#0b0d10', color: '#e9ecf1',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, padding: '9px 11px', fontSize: 14,
};
const SECCION = { borderTop: '1px solid rgba(255,255,255,0.09)', marginTop: 18, paddingTop: 16 };

export default function MiCuentaPanel({ user, onClose, onAbrir2FA }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repite, setRepite] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msgClave, setMsgClave] = useState(null);       // {ok, texto}
  const [cerrando, setCerrando] = useState(false);
  const [msgSesiones, setMsgSesiones] = useState(null);

  const cambiarClave = async () => {
    setMsgClave(null);
    if (!actual || !nueva) { setMsgClave({ ok: false, texto: 'Escribe la contraseña actual y la nueva.' }); return; }
    if (nueva !== repite) { setMsgClave({ ok: false, texto: 'La contraseña nueva no coincide con su repetición.' }); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/auth/change-password`, {
        method: 'POST',
        body: JSON.stringify({ current_password: actual, new_password: nueva }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsgClave({ ok: false, texto: d.error || 'No se pudo cambiar.' }); return; }
      setActual(''); setNueva(''); setRepite('');
      setMsgClave({ ok: true, texto: 'Contraseña cambiada. Tus otras sesiones se cerraron; esta sigue viva.' });
    } catch {
      setMsgClave({ ok: false, texto: 'No se pudo conectar con el servidor.' });
    } finally { setGuardando(false); }
  };

  const cerrarOtras = async () => {
    setMsgSesiones(null); setCerrando(true);
    try {
      const r = await apiFetch(`${API}/api/auth/sesiones/cerrar-otras`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsgSesiones({ ok: false, texto: d.error || 'No se pudo.' }); return; }
      setMsgSesiones({
        ok: true,
        texto: d.sesiones_cerradas === 0
          ? 'No había ninguna otra sesión abierta.'
          : `Se cerraron ${d.sesiones_cerradas} ${d.sesiones_cerradas === 1 ? 'sesión' : 'sesiones'}. Esta sigue viva.`,
      });
    } catch {
      setMsgSesiones({ ok: false, texto: 'No se pudo conectar con el servidor.' });
    } finally { setCerrando(false); }
  };

  const Mensaje = ({ m }) => m && (
    <p style={{ margin: '10px 0 0', padding: '8px 11px', borderRadius: 7, fontSize: 13,
                background: m.ok ? 'rgba(78,130,166,0.15)' : 'rgba(255,107,107,0.12)',
                border: `1px solid ${m.ok ? 'rgba(78,130,166,0.4)' : 'rgba(255,107,107,0.35)'}`,
                color: m.ok ? '#cfe0ee' : '#FFC4C4' }}>{m.texto}</p>
  );

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={CAJA}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Mi cuenta</h2>
          <button onClick={onClose} style={{ ...BOTON_SUAVE, padding: '4px 9px' }}>Cerrar</button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8b94a1' }}>
          {user?.email} · tu cuenta y sus llaves. Lo de las obras vive en cada obra.
        </p>

        {/* ── Contraseña ── */}
        <div style={SECCION}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Contraseña</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input type="password" placeholder="Contraseña actual" autoComplete="current-password"
                   value={actual} onChange={(e) => setActual(e.target.value)} style={CAMPO} />
            <input type="password" placeholder="Contraseña nueva" autoComplete="new-password"
                   value={nueva} onChange={(e) => setNueva(e.target.value)} style={CAMPO} />
            <input type="password" placeholder="Repite la contraseña nueva" autoComplete="new-password"
                   value={repite} onChange={(e) => setRepite(e.target.value)} style={CAMPO} />
          </div>
          <div style={{ marginTop: 10 }}>
            <button onClick={cambiarClave} disabled={guardando} style={{ ...BOTON, opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8b94a1' }}>
            Al cambiarla se cierran tus demás sesiones — si perdiste un equipo con la sesión abierta,
            este es el camino completo.
          </p>
          <Mensaje m={msgClave} />
        </div>

        {/* ── Verificación en dos pasos ── */}
        <div style={SECCION}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Verificación en dos pasos</div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#8b94a1', lineHeight: 1.5 }}>
            El segundo factor protege la cuenta aunque la contraseña se filtre. Se configura con tu
            aplicación de autenticación y entrega códigos de recuperación para el día que pierdas el teléfono.
          </p>
          <button onClick={onAbrir2FA} style={BOTON_SUAVE}>Abrir configuración</button>
        </div>

        {/* ── Sesiones (G4a) ── */}
        <div style={SECCION}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Sesiones</div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#8b94a1', lineHeight: 1.5 }}>
            ¿Dejaste la sesión abierta en la tablet de obra o en otro navegador? Ciérralas todas
            menos esta, sin tocar la contraseña.
          </p>
          <button onClick={cerrarOtras} disabled={cerrando} style={{ ...BOTON, opacity: cerrando ? 0.6 : 1 }}>
            {cerrando ? 'Cerrando…' : 'Cerrar mis otras sesiones'}
          </button>
          <Mensaje m={msgSesiones} />
        </div>
      </div>
    </div>
  );
}
