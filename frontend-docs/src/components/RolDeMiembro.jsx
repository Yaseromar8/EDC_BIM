// RolDeMiembro — cambiar el rol de un usuario, desde la pantalla de Miembros.
//
// POR QUÉ ESTE COMPONENTE
// El backend sabía cambiar roles desde hace tiempo, y lo sabía hacer BIEN:
// solo administradores, rol validado, no puedes degradarte a ti mismo, protege
// al último administrador activo, revoca las sesiones del afectado para que el
// cambio surta efecto ya, y deja rastro en el registro. Y ningún cliente lo
// llamaba: una entidad no podía administrar su propio equipo sin tocar la base.
// La capacidad estaba; la puerta no — otra vez.
//
// DECISIONES
// · Confirmación SOLO en las transiciones delicadas (dar admin, quitar admin).
//   Confirmarlo todo entrena a la gente a pulsar «aceptar» sin leer.
// · El error del backend se enseña TAL CUAL: «es el único administrador activo»
//   dice exactamente qué pasa y qué hacer. Taparlo con un «no se pudo» genérico
//   sería tirar la mejor parte del backend.
// · Al cambiar un rol se avisa de que la sesión del afectado se cierra: no es
//   un fallo, es el cambio surtiendo efecto.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';

const ROLES = [
  { valor: 'viewer', etiqueta: 'Ver' },
  { valor: 'user', etiqueta: 'Usar' },
  { valor: 'editor', etiqueta: 'Editar' },
  { valor: 'admin', etiqueta: 'Administrador' },
];

function _usuarioActual() {
  try {
    return JSON.parse(localStorage.getItem('visor_user')
      || sessionStorage.getItem('visor_user') || 'null');
  } catch { return null; }
}

export function RolDeMiembro({ miembro, isAdmin, onCambiado }) {
  const [cambiando, setCambiando] = useState(false);
  const yo = _usuarioActual();
  const esYo = yo && String(yo.id) === String(miembro.id);
  const rol = miembro.role || 'user';

  // Sin permiso de administrar, o sobre uno mismo, la etiqueta de siempre.
  // Sobre uno mismo A PROPÓSITO: el backend ya lo rechaza, y ofrecer un control
  // que siempre contesta «no» solo enseña a desconfiar de los controles.
  if (!isAdmin || esYo) {
    return (
      <span title={esYo ? 'Tu propio rol lo cambia otro administrador.' : undefined}
            style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                     textTransform: 'uppercase', background: '#eef2f7', color: '#4d6a8f' }}>
        {rol}
      </span>
    );
  }

  const cambiar = async (nuevo) => {
    if (nuevo === rol) return;
    const daAdmin = nuevo === 'admin';
    const quitaAdmin = rol === 'admin' && nuevo !== 'admin';
    // EL DIALOGO ES DEL PRODUCTO, NO DEL NAVEGADOR.
    //
    // Esto usaba `window.confirm`, y Chrome lo SUPRIME cuando una pagina ya
    // mostro varios dialogos (o el usuario marco "impedir mas dialogos").
    // Suprimido devuelve `false`, asi que el cambio se cancelaba EN SILENCIO:
    // el desplegable volvia solo a su valor anterior y no habia forma de
    // saber por que. Medido el 23-ago-2026 intentando nombrar al segundo
    // custodio de la entidad -- el acto quedo bloqueado sin un solo mensaje,
    // y no habia manera de distinguirlo de un permiso denegado.
    //
    // `confirmAction` es el modal del propio producto (utils/confirm.jsx), el
    // mismo que ya usan retirar acceso y revocar invitacion: no lo puede
    // suprimir el navegador y se ve igual en todas partes.
    if (daAdmin && !await confirmAction({
      title: 'Hacer administrador',
      message: `${miembro.name || miembro.email} pasara a ver y administrar TODO: `
             + 'obras, miembros, documentos y configuracion de la entidad. '
             + 'Su sesion se cerrara para que el cambio surta efecto.',
      confirmText: 'Hacer administrador',
    })) return;
    if (quitaAdmin && !await confirmAction({
      title: 'Quitar administrador',
      message: `${miembro.name || miembro.email} dejara de poder administrar `
             + 'miembros, obras y configuracion.',
      confirmText: 'Quitar administrador',
      danger: true,
    })) return;

    setCambiando(true);
    try {
      const r = await apiFetch(`${API}/api/users/${miembro.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nuevo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) {
        // El mensaje del backend dice la causa real («es el único administrador
        // activo»); un genérico aquí escondería justo lo que hay que saber.
        toast.error(d.error || 'No se pudo cambiar el rol.');
        return;
      }
      toast.success(
        `${miembro.name || miembro.email} ahora es «${nuevo}». Su sesión se cerró: ` +
        'tendrá que volver a entrar para que el cambio surta efecto.');
      if (onCambiado) onCambiado();
    } catch {
      toast.error('No se pudo cambiar el rol.');
    } finally {
      setCambiando(false);
    }
  };

  return (
    <select value={rol} disabled={cambiando}
            onChange={e => cambiar(e.target.value)}
            title="Cambiar el rol de este miembro"
            style={{
              padding: '4px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid #d8dee6', background: cambiando ? '#f4f4f4' : '#fff',
              color: '#4d6a8f', cursor: cambiando ? 'default' : 'pointer',
            }}>
      {ROLES.map(o => (
        <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
      ))}
    </select>
  );
}
