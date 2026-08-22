# -*- coding: utf-8 -*-
"""Smoke de la CONTROLLED WINDOW: los codigos de error que la tabla REV.02 §4.2
exige y que la interfaz no puede producir.

POR QUE UN GUION Y NO LA INTERFAZ
---------------------------------
Tres de las pruebas congeladas son ERRORES deliberados -- registrar una
recepcion sin decir de quien (400), nombrar administrador a quien no es miembro
(404), y que el unico administrador de la obra intente retirarse (409). Una
interfaz correcta no ofrece esos botones, asi que la unica forma honesta de
demostrarlos es llamar a la API tal como lo haria un cliente equivocado o
malicioso. Ademas el desplegable de estado quedo recortado por el contenedor
(defecto anotado a capa 9), de modo que el paso WIP->SHARED tambien va por API.

TODO CONTRA LA OBRA DE PRUEBA. Ningun objeto contractual real se toca: la obra,
el documento y el transmittal nacieron esta noche para esta ventana. El unico
transmittal real del expediente (TR de PQT8) no aparece en ninguna linea.

CREDENCIALES: se TECLEAN aqui (getpass), nunca por argumento ni por chat, y no
se escriben en la evidencia. Hacen falta las dos sesiones:
  - el Entity Admin (con su codigo 2FA), y
  - el usuario de prueba nº 1 (miembro y unico admin de la obra de prueba).

USO:  python herramientas/smoke_de_ventana.py
"""
import getpass
import io
import json
import os
import sys

try:
    import requests
except ImportError:
    print('Falta el paquete `requests`. Ejecuta desde el venv del backend.')
    sys.exit(2)

URL = (os.getenv('ECD_URL') or 'https://visor-ecd-backend.onrender.com').rstrip('/')
TIEMPO = 45

# La obra de prueba, con sus DOS identificadores: el canonico (rutas de
# administracion) y el del arbol documental (docs y transmittals). Constantes a
# proposito: este guion no debe poder apuntarse a otra obra.
OBRA_CANONICA = 'b.proj_zz_prueba_ventana_2026_08_69360'
OBRA_DOCS = 'proyectos/ZZ_PRUEBA_VENTANA_2026-08'
NODO_DOC = 'f75b7c41-cf5c-4aaf-95d5-07afa692b72a'   # ZZ-PRUEBA-VENTANA-DOC-0001.pdf
USUARIO_PRUEBA = 22        # YASER HUAMANI, miembro y unico admin de la obra de prueba
USUARIO_NO_MIEMBRO = 19    # miembro de la obra real, NO de la de prueba


def entrar(etiqueta):
    """Login interactivo. Devuelve una sesion requests con el Bearer puesto."""
    print()
    correo = input('correo de %s: ' % etiqueta).strip()
    clave = getpass.getpass('contraseña de %s (no se muestra): ' % etiqueta)
    r = requests.post(URL + '/api/auth/login',
                      json={'email': correo, 'password': clave}, timeout=TIEMPO)
    del clave
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    if r.status_code != 200 and not d.get('requiere_2fa'):
        print('  login rechazado (%s): %s' % (r.status_code, d.get('error', '')))
        return None, correo
    if d.get('requiere_2fa'):
        codigo = input('  código 2FA de %s (6 dígitos): ' % etiqueta).strip()
        r = requests.post(URL + '/api/auth/2fa/verify',
                          json={'desafio': d.get('desafio'), 'codigo': codigo},
                          timeout=TIEMPO)
        d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
        if r.status_code != 200:
            print('  2FA rechazado: %s' % d.get('error', ''))
            return None, correo
    token = d.get('session_token')
    if not token:
        print('  el login no devolvió sesión')
        return None, correo
    s = requests.Session()
    s.headers['Authorization'] = 'Bearer %s' % token
    print('  sesión abierta.')
    return s, correo


PRUEBAS = []


def anota(nombre, esperado, obtenido, extra=''):
    ok = obtenido == esperado if not isinstance(esperado, (list, tuple)) \
        else obtenido in esperado
    PRUEBAS.append({'prueba': nombre, 'esperado': esperado,
                    'obtenido': obtenido, 'ok': ok, 'extra': extra})
    print('  %-6s %-52s esperado=%s obtenido=%s %s'
          % ('OK' if ok else 'FALLA', nombre[:52], esperado, obtenido, extra))
    return ok


def main():
    print('SMOKE DE VENTANA · %s' % URL)
    print('obra de prueba: %s' % OBRA_CANONICA)

    admin, correo_admin = entrar('Entity Admin')
    if not admin:
        return 2

    # ── 1 · El documento inventado sale de borrador ──────────────────────
    print('\n1. WIP -> SHARED del documento inventado (por API: el menú de la')
    print('   interfaz quedó recortado; defecto anotado)')
    r = admin.post(URL + '/api/docs/batch', timeout=TIEMPO,
                   json={'items': [NODO_DOC], 'action': 'SET_STATUS',
                         'status': 'SHARED', 'model_urn': OBRA_DOCS})
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    anota('cambiar estado del doc de prueba a SHARED', True,
          bool(r.status_code == 200 and d.get('success')),
          '(%s %s)' % (r.status_code, d.get('error', '')))

    # ── 2 · Emitir el transmittal de prueba ──────────────────────────────
    print('\n2. Emisión del transmittal de prueba (destinatario: usuario de prueba)')
    r = admin.post(URL + '/api/transmittals', timeout=TIEMPO,
                   json={'model_urn': OBRA_DOCS,
                         'subject': 'ZZ PRUEBA VENTANA — transmittal de prueba',
                         'message': 'Emitido solo para el smoke de la ventana '
                                    'controlada del 2026-08-22. Sin valor contractual.',
                         'items': [{'node_id': NODO_DOC,
                                    'name': 'ZZ-PRUEBA-VENTANA-DOC-0001.pdf'}],
                         'recipients': [{'email': 'omarsanchezh8+prueba1@gmail.com',
                                         'name': 'YASER HUAMANI'}]})
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    tid = d.get('id')
    anota('emitir transmittal de prueba', True,
          bool(r.status_code == 200 and d.get('success') and tid),
          '(TR-%s id=%s)' % (d.get('number'), tid))
    if not tid:
        print('  sin transmittal no hay pruebas de recepción; se detiene.')
        return _cierre(2)

    # ── 3 · Recepción administrativa SIN destinatario -> 400 ─────────────
    print('\n3. Registrar recepción sin decir de quién (debe RECHAZARSE)')
    r = admin.post(URL + '/api/transmittals/%s/acuse' % tid, json={}, timeout=TIEMPO)
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    anota('recepción sin destinatario_id', 400, r.status_code,
          '(code=%s)' % d.get('code'))
    anota('… con el código FALTA_DESTINATARIO', 'FALTA_DESTINATARIO', d.get('code'))

    # ── 4 · Recepción administrativa CON destinatario -> 200 ─────────────
    print('\n4. Registrar recepción por vía administrativa, diciendo de quién')
    r = admin.post(URL + '/api/transmittals/%s/acuse' % tid, timeout=TIEMPO,
                   json={'destinatario_id': USUARIO_PRUEBA,
                         'motivo': 'smoke de la ventana controlada 2026-08-22'})
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    anota('recepción administrativa registrada', 200, r.status_code,
          '(%s)' % (d.get('error') or 'ok'))

    # ── 5 · Sesión del usuario de prueba: 404 y 409 ──────────────────────
    p1, correo_p1 = entrar('usuario de prueba nº 1')
    if not p1:
        return _cierre(2)

    print('\n5. Su propia vista de administración (debe decir que administra)')
    r = p1.get(URL + '/api/projects/%s/mi-administracion' % OBRA_CANONICA,
               timeout=TIEMPO)
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    anota('mi-administracion responde', 200, r.status_code)
    anota('es admin de ESTA obra', True, d.get('es_admin_de_obra'))
    anota('NO es admin de la entidad', False, d.get('es_entity_admin'))

    print('\n6. Nombrar administrador a quien NO es miembro (debe RECHAZARSE)')
    r = p1.put(URL + '/api/projects/%s/miembros/%s/admin'
               % (OBRA_CANONICA, USUARIO_NO_MIEMBRO),
               json={'es_admin': True}, timeout=TIEMPO)
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    anota('nombrar a un no-miembro', 404, r.status_code, '(code=%s)' % d.get('code'))
    anota('… con el código NO_ES_MIEMBRO', 'NO_ES_MIEMBRO', d.get('code'))

    print('\n7. El único administrador intenta retirarse (debe RECHAZARSE)')
    r = p1.put(URL + '/api/projects/%s/miembros/%s/admin'
               % (OBRA_CANONICA, USUARIO_PRUEBA),
               json={'es_admin': False}, timeout=TIEMPO)
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    anota('retirar al único admin de la obra', 409, r.status_code,
          '(code=%s)' % d.get('code'))
    anota('… con el código ULTIMO_ADMIN_DE_OBRA', 'ULTIMO_ADMIN_DE_OBRA', d.get('code'))

    # ── 8 · La bandeja del destinatario tras la recepción del paso 4 ─────
    print('\n8. Mi trabajo del destinatario (el encargo del transmittal debe '
          'estar saldado)')
    r = p1.get(URL + '/api/mi-trabajo', timeout=TIEMPO)
    d = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    pendientes = d.get('pendientes') or d.get('encargos') or d.get('items') or []
    de_transmittal = [x for x in pendientes if isinstance(x, dict)
                      and 'transmittal' in json.dumps(x, ensure_ascii=False).lower()]
    anota('sin encargos de transmittal pendientes', 0, len(de_transmittal),
          '(bandeja: %s elementos)' % len(pendientes))

    p1.post(URL + '/api/auth/logout', timeout=TIEMPO)
    admin.post(URL + '/api/auth/logout', timeout=TIEMPO)
    print('\nsesiones cerradas.')
    return _cierre(0 if all(p['ok'] for p in PRUEBAS) else 1)


def _cierre(codigo_si_fallo):
    hechas = len(PRUEBAS)
    bien = len([p for p in PRUEBAS if p['ok']])
    print('\nRESULTADO: %s/%s correctas' % (bien, hechas))
    raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    destino = os.path.join(raiz, 'docs', 'entidad', 'evidencias',
                           'smoke-de-ventana-20260822.json')
    with io.open(destino, 'w', encoding='utf-8') as f:
        json.dump({'url': URL, 'obra_de_prueba': OBRA_CANONICA,
                   'pruebas': PRUEBAS, 'correctas': '%s/%s' % (bien, hechas)},
                  f, ensure_ascii=False, indent=2)
    print('evidencia escrita en: %s' % destino)
    return 0 if (bien == hechas and codigo_si_fallo == 0) else (codigo_si_fallo or 1)


if __name__ == '__main__':
    sys.exit(main())
