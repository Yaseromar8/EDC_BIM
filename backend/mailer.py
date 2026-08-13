"""Envio de correo transaccional (invitacion, reset, verificacion).

Usa la API HTTP de Resend con `requests`, que ya es dependencia: no hace falta
SMTP, ni una libreria nueva, ni abrir puertos salientes raros en Render.

MODO DEGRADADO A PROPOSITO: si no hay RESEND_API_KEY, no se cae ni se traga el
error en silencio. Registra el enlace en el log y devuelve enviado=False con el
enlace dentro, para que el administrador pueda copiarlo y hacerlo llegar a mano.
Asi el flujo de reset funciona el primer dia, antes de dar de alta el dominio, y
el dia que se configure la clave deja de hacer falta tocar nada.

Variables de entorno:
  RESEND_API_KEY   clave de https://resend.com (plan gratis: 3.000 correos/mes)
  MAIL_FROM        remitente verificado, p. ej. "COTA <acceso@tudominio.com>"
                   Sin dominio propio, Resend permite onboarding@resend.dev pero
                   SOLO entrega al correo del titular de la cuenta.
"""

import os

import requests

from app_logging import get_logger

logger = get_logger('mailer')

RESEND_API_KEY = os.getenv('RESEND_API_KEY', '').strip()
MAIL_FROM = os.getenv('MAIL_FROM', 'COTA <onboarding@resend.dev>').strip()
_URL = 'https://api.resend.com/emails'


def hay_correo_configurado():
    return bool(RESEND_API_KEY)


def enviar(destino, asunto, titulo, cuerpo, enlace=None, texto_boton='Abrir'):
    """Envia un correo. Devuelve (enviado: bool, detalle: str)."""
    html = _plantilla(titulo, cuerpo, enlace, texto_boton)

    if not RESEND_API_KEY:
        # AQUI SE ESCRIBIA EL ENLACE ENTERO EN EL LOG.
        #
        # El razonamiento era "el enlace no es secreto frente al propio admin".
        # Es falso: ese enlace lleva dentro el token de restablecimiento, que da
        # la cuenta a quien lo abra -- y ademas revoca las sesiones de la
        # victima. Los registros de Render los ve cualquiera con acceso al
        # panel, se conservan, y se pueden reenviar a terceros. Peor todavia:
        # en produccion NO hay RESEND_API_KEY, asi que este era el camino
        # normal, no el excepcional, y todos los enlaces de restablecimiento
        # emitidos han pasado por aqui.
        #
        # Se registra lo necesario para saber que ocurrio -- a quien iba y una
        # huella corta del token, para poder correlacionarlo -- y nada con lo
        # que se pueda entrar. Si hace falta ayudar a alguien, se emite un
        # enlace nuevo; no se rescata este del log.
        huella = ''
        if enlace:
            import hashlib
            huella = ' token_fp=' + hashlib.sha256(enlace.encode()).hexdigest()[:8]
        logger.warning(
            f"Correo NO enviado (falta RESEND_API_KEY). destino={destino} asunto={asunto}"
            + huella
        )
        return False, 'correo no configurado'


    try:
        r = requests.post(
            _URL,
            headers={'Authorization': f'Bearer {RESEND_API_KEY}',
                     'Content-Type': 'application/json'},
            json={'from': MAIL_FROM, 'to': [destino], 'subject': asunto, 'html': html},
            timeout=15,
        )
        if r.status_code >= 400:
            logger.error(f"Resend rechazo el envio ({r.status_code}): {r.text[:300]}")
            return False, f'el proveedor de correo respondio {r.status_code}'
        return True, 'enviado'
    except requests.exceptions.RequestException as e:
        logger.error(f"Error de red enviando correo: {e}")
        return False, 'no se pudo contactar con el proveedor de correo'


def _plantilla(titulo, cuerpo, enlace, texto_boton):
    """HTML sobrio con estilos EN LINEA: los clientes de correo ignoran <style>."""
    boton = ''
    if enlace:
        boton = f'''
      <tr><td style="padding:8px 0 24px">
        <a href="{enlace}" style="display:inline-block;background:#1473E6;color:#fff;
           text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;
           font-size:15px">{texto_boton}</a>
      </td></tr>
      <tr><td style="padding:0 0 8px;color:#6B7784;font-size:12px;line-height:1.5">
        Si el botón no funciona, copia esta dirección en tu navegador:<br>
        <span style="color:#1473E6;word-break:break-all">{enlace}</span>
      </td></tr>'''
    return f'''<!doctype html>
<html lang="es"><body style="margin:0;background:#F2F5F8;font-family:-apple-system,
  BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#F2F5F8;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#fff;border-radius:10px;padding:32px">
        <tr><td style="padding:0 0 20px;font-size:19px;font-weight:800;
                       letter-spacing:.16em;color:#0B0F14">COTA</td></tr>
        <tr><td style="padding:0 0 10px;font-size:20px;font-weight:700;color:#0B0F14">{titulo}</td></tr>
        <tr><td style="padding:0 0 20px;font-size:15px;line-height:1.6;color:#3A4B5C">{cuerpo}</td></tr>
        {boton}
        <tr><td style="padding:20px 0 0;border-top:1px solid #E6EAEF;color:#8A96A3;
                       font-size:12px;line-height:1.5">
          Si no esperabas este correo, puedes ignorarlo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>'''
