# -*- coding: utf-8 -*-
"""Bateria de comprobaciones AUTENTICADAS contra el servicio real.

POR QUE HACE FALTA, Y POR QUE LA EJECUTA EL PROPIETARIO
--------------------------------------------------------
Todo el saneamiento esta probado en local con cursores de mentira, y desplegado
con el commit verificado por el propio latido. Eso demuestra QUE CODIGO corre.
No demuestra que las guardias BLOQUEEN cuando alguien lo intenta de verdad.

Y esa es la diferencia que un auditor va a mirar primero. «El codigo desplegado
coincide» no es comportamiento; es un indicio.

Yo no puedo cerrar ese hueco: no manejo contrasenas ni las tecleo en ningun
sitio. Asi que la bateria se escribe aqui y la ejecuta el propietario con sus
propias credenciales. Nada de lo que salga por pantalla ni por el fichero de
evidencia lleva una credencial, ni un token, ni una cookie.

COMO SE USA (las credenciales van por ENTORNO, no por argumento)
----------------------------------------------------------------
Un argumento en la linea de ordenes queda en el historial del terminal y en la
lista de procesos. Por eso van por entorno:

    set ECD_URL=https://visor-ecd-backend.onrender.com
    set ECD_CORREO_A=...      &  set ECD_CLAVE_A=...
    set ECD_CORREO_B=...      &  set ECD_CLAVE_B=...
    set ECD_OBRA_A=...        &  set ECD_OBRA_B=...
    python herramientas/verificar_produccion.py

`A` y `B` son dos usuarios de OBRAS DISTINTAS. Si no hay un segundo usuario, la
mitad interesante de la bateria -- la que demuestra el aislamiento -- se salta y
lo dice, en vez de dar por buena una prueba que no se hizo.

QUE PRUEBA, Y QUE SIGNIFICA CADA COSA
-------------------------------------
No se comprueba «que responda»: se comprueba que responda LO QUE DEBE. Un 200
donde tocaba un 403 es el fallo; un 403 donde tocaba un 200 tambien, porque un
control que bloquea al legitimo no se puede desplegar.
"""

import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print('Falta el paquete `requests`. Instalalo o ejecuta desde el venv.')
    sys.exit(2)

URL = (os.getenv('ECD_URL') or 'https://visor-ecd-backend.onrender.com').rstrip('/')
TIEMPO = 30


class Bateria:
    def __init__(self):
        self.pruebas = []

    def comprobar(self, nombre, esperado, obtenido, detalle=''):
        ok = obtenido == esperado if not isinstance(esperado, (list, tuple)) \
            else obtenido in esperado
        self.pruebas.append({'prueba': nombre, 'esperado': esperado,
                             'obtenido': obtenido, 'ok': ok, 'detalle': detalle})
        print('  %-6s %-58s esperado=%s obtenido=%s'
              % ('OK' if ok else 'FALLA', nombre[:58], esperado, obtenido))
        return ok

    def saltar(self, nombre, motivo):
        self.pruebas.append({'prueba': nombre, 'ok': None, 'motivo': motivo})
        print('  SALTA  %-58s %s' % (nombre[:58], motivo))

    def resumen(self):
        hechas = [p for p in self.pruebas if p['ok'] is not None]
        return {'total': len(hechas),
                'ok': len([p for p in hechas if p['ok']]),
                'fallan': len([p for p in hechas if not p['ok']]),
                'saltadas': len([p for p in self.pruebas if p['ok'] is None])}


def entrar(correo, clave):
    """Devuelve (sesion, error). NUNCA imprime ni guarda la clave ni el token."""
    s = requests.Session()
    try:
        r = s.post(URL + '/api/auth/login', json={'email': correo, 'password': clave},
                   timeout=TIEMPO)
    except Exception as e:
        return None, 'no se pudo conectar: %s' % str(e)[:80]
    if r.status_code != 200:
        return None, 'login devolvio %d' % r.status_code
    d = {}
    try:
        d = r.json()
    except Exception:
        pass
    tok = d.get('token') or d.get('access_token')
    if tok:
        s.headers['Authorization'] = 'Bearer %s' % tok
    return s, None


def codigo(sesion, metodo, ruta, **kw):
    try:
        r = sesion.request(metodo, URL + ruta, timeout=TIEMPO, **kw)
        return r.status_code
    except Exception:
        return 0


def main():
    b = Bateria()
    correo_a, clave_a = os.getenv('ECD_CORREO_A'), os.getenv('ECD_CLAVE_A')
    correo_b, clave_b = os.getenv('ECD_CORREO_B'), os.getenv('ECD_CLAVE_B')
    obra_a, obra_b = os.getenv('ECD_OBRA_A'), os.getenv('ECD_OBRA_B')

    print('VERIFICACION AUTENTICADA CONTRA %s\n' % URL)

    # ── 1. Sin sesion ─────────────────────────────────────────────────────
    print('1. Sin sesion')
    anon = requests.Session()
    b.comprobar('el latido responde sin sesion', 200, codigo(anon, 'GET', '/api/health'))
    b.comprobar('una ruta de obra pide sesion', 401,
                codigo(anon, 'GET', '/api/plan?model_urn=' + (obra_a or 'x')))
    b.comprobar('la postura de seguridad pide sesion', 401,
                codigo(anon, 'GET', '/api/seguridad/postura'))

    # La version y la postura publica, para dejarlas en la evidencia.
    contexto = {}
    try:
        contexto = anon.get(URL + '/api/health', timeout=TIEMPO).json()
    except Exception:
        pass

    if not (correo_a and clave_a and obra_a):
        b.saltar('todo lo autenticado', 'faltan ECD_CORREO_A / ECD_CLAVE_A / ECD_OBRA_A')
        return informe(b, contexto)

    # ── 2. Usuario A ──────────────────────────────────────────────────────
    print('\n2. Usuario A contra SU obra')
    sa, err = entrar(correo_a, clave_a)
    if err:
        b.comprobar('login del usuario A', 'ok', err)
        return informe(b, contexto)
    b.comprobar('login del usuario A', 'ok', 'ok')
    b.comprobar('lee el plan de SU obra', 200,
                codigo(sa, 'GET', '/api/plan?model_urn=' + obra_a))
    b.comprobar('lista documentos de SU obra', [200, 404],
                codigo(sa, 'GET', '/api/docs/tree?model_urn=' + obra_a))
    b.comprobar('lee el catalogo de idoneidad de SU obra', 200,
                codigo(sa, 'GET', '/api/docs/idoneidad?model_urn=' + obra_a))
    b.comprobar('lee el triaje de SU obra', 200,
                codigo(sa, 'GET', '/api/docs/sensibilidad?model_urn=' + obra_a))

    # ── 3. Aislamiento: A contra la obra B ────────────────────────────────
    print('\n3. Usuario A contra la obra AJENA (lo que de verdad importa)')
    if not obra_b:
        b.saltar('aislamiento entre obras', 'falta ECD_OBRA_B')
    else:
        b.comprobar('NO lee el plan de otra obra', [403, 404],
                    codigo(sa, 'GET', '/api/plan?model_urn=' + obra_b))
        b.comprobar('NO lee el catalogo de otra obra', [403, 404],
                    codigo(sa, 'GET', '/api/docs/idoneidad?model_urn=' + obra_b))
        b.comprobar('NO lee el triaje de otra obra', [403, 404],
                    codigo(sa, 'GET', '/api/docs/sensibilidad?model_urn=' + obra_b))
        b.comprobar('NO escribe el catalogo de otra obra', [400, 403, 404],
                    codigo(sa, 'PUT', '/api/docs/idoneidad',
                           json={'model_urn': obra_b, 'codigos': [
                               {'codigo': 'XX', 'etiqueta': 'intruso',
                                'familia': 'compartido'}]}))
        b.comprobar('NO importa un plan en otra obra', [400, 403, 404],
                    codigo(sa, 'POST', '/api/plan/importar',
                           data={'model_urn': obra_b, 'tipo': 'MIDP'}))

    # ── 4. Usuario B ──────────────────────────────────────────────────────
    print('\n4. Usuario B (segundo par de ojos)')
    if not (correo_b and clave_b and obra_b):
        b.saltar('usuario B', 'faltan ECD_CORREO_B / ECD_CLAVE_B / ECD_OBRA_B')
    else:
        sb, err = entrar(correo_b, clave_b)
        if err:
            b.comprobar('login del usuario B', 'ok', err)
        else:
            b.comprobar('login del usuario B', 'ok', 'ok')
            b.comprobar('B lee SU obra', 200,
                        codigo(sb, 'GET', '/api/plan?model_urn=' + obra_b))
            b.comprobar('B NO lee la obra de A', [403, 404],
                        codigo(sb, 'GET', '/api/plan?model_urn=' + obra_a))

    # ── 5. Postura y salida ───────────────────────────────────────────────
    print('\n5. Postura de seguridad y cierre de sesion')
    p = codigo(sa, 'GET', '/api/seguridad/postura')
    b.comprobar('la postura responde a un usuario con sesion', [200, 403], p)
    if p == 200:
        try:
            contexto['postura'] = sa.get(URL + '/api/seguridad/postura',
                                         timeout=TIEMPO).json()
        except Exception:
            pass
    codigo(sa, 'POST', '/api/auth/logout')
    b.comprobar('tras cerrar sesion ya no se lee la obra', [401, 403],
                codigo(sa, 'GET', '/api/plan?model_urn=' + obra_a))

    return informe(b, contexto)


def informe(b, contexto):
    r = b.resumen()
    print('\n%s' % ('-' * 68))
    print('RESUMEN  %d comprobaciones · %d OK · %d FALLAN · %d saltadas'
          % (r['total'], r['ok'], r['fallan'], r['saltadas']))

    carpeta = os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), 'docs', 'entidad', 'evidencias')
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, 'verificacion-produccion-%s.json'
                        % time.strftime('%Y%m%d-%H%M'))
    # La evidencia NO lleva credenciales: solo que se probo, contra que version,
    # y que respondio. Los correos tampoco: bastan «A» y «B».
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump({'servicio': URL, 'cuando': time.strftime('%Y-%m-%d %H:%M:%S'),
                   'version_desplegada': contexto.get('version'),
                   'configuracion': contexto.get('configuracion'),
                   'postura': contexto.get('postura'),
                   'resumen': r, 'pruebas': b.pruebas},
                  f, ensure_ascii=False, indent=2)
    print('evidencia: %s' % ruta)
    if r['fallan']:
        print('\nHAY FALLOS. Un 200 donde tocaba 403 es una fuga; un 403 donde')
        print('tocaba 200 es un control que bloquea al legitimo. Los dos cuentan.')
    return 1 if r['fallan'] else 0


if __name__ == '__main__':
    sys.exit(main())
