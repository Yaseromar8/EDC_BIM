# -*- coding: utf-8 -*-
"""REVIEWS · E1.3 · flujos creados utilizables, contra PostgreSQL.

QUE DEMUESTRA
-------------
Con la aplicacion real (`server.app`), sesiones reales de usuarios ficticios y ENFORCE
encendido, las causas por las que un flujo creado fallaba al elegirlo
(docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md, §1) y su arreglo:

  L  el listado de flujos dice cual no se puede usar en esta obra y por que --ultimo
     paso que solo revisa, plazo de 0 dias, persona que salio de la obra, funcion que
     nadie tiene-- y NO marca el que solo pide elegir persona
  E  el editor no guarda un plazo de 0 dias ni, al modificar, a una persona de fuera;
     un nombre repetido se dice como tal
  P  la vista previa del alta pide elegir entre las dos personas con la funcion,
     acepta a la elegida, rechaza elecciones mal formadas o ajenas, dice ANTES de
     iniciar lo de la independencia, el acceso a los documentos, el plazo y el cierre,
     y no escribe nada
  A  el alta con la persona elegida nace con ese revisor, su procedencia y su encargo;
     sin elegir, sin titulo o sin idoneidad al publicar se sigue negando
  X  un identificador de plantilla que no es un numero es un 404 con mensaje, no un
     500; quien no es de la obra recibe el 403 del perimetro; la vista previa antigua
     responde igual que antes, para el portal que aun no se haya desplegado

QUE NO TOCA
-----------
Se niega a arrancar si `DB_NAME` no parece desechable o si hay `DATABASE_URL`. No lee
ningun `.env`. Vacia las variables de correo y de servicios externos y arranca con el
perfil `portal`. Las plantillas nacen por la ruta, salvo dos «viejas» que se escriben
directamente para simular datos anteriores a esta regla. Todo lleva el prefijo
`zz_e13_<hora>` y NO se borra (`activity_log` es de solo insercion).

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app DB_PASS=<...> \\
        python herramientas/ensayo_de_flujos_creados.py
"""
import json
import os
import re
import secrets
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import dotenv  # noqa: E402
dotenv.load_dotenv = lambda *a, **k: False
try:
    import dotenv.main as _dotenv_main
    _dotenv_main.load_dotenv = dotenv.load_dotenv
except Exception:
    pass

PREFIJO = 'zz_e13_'
RUN = time.strftime('%H%M%S')

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((bool(ok), texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def _titulo(t):
    print()
    print('── %s %s' % (t, '─' * max(0, 70 - len(t))))


def _codigo(cuerpo):
    return (cuerpo or {}).get('code')


def _error(cuerpo):
    return (cuerpo or {}).get('error') or ''


def main():
    if not re.search(r'(test|ensayo|prueba)', os.getenv('DB_NAME') or '', re.I):
        print('ME NIEGO A ARRANCAR: DB_NAME=%r no parece una base desechable.'
              % (os.getenv('DB_NAME'),))
        return 2
    if os.getenv('DATABASE_URL'):
        print('ME NIEGO A ARRANCAR: DATABASE_URL esta definida y podria mandar sobre DB_NAME.')
        return 2
    for clave in ('RESEND_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'APS_CLIENT_ID',
                  'APS_CLIENT_SECRET', 'REDIS_URL'):
        os.environ[clave] = ''
    os.environ.update({'AUTH_POLICY_MODE': 'estricto', 'ENFORCE_PROJECT_AUTHZ': 'true',
                       'DEPLOY_PROFILE': 'portal', 'DDL_EN_CALIENTE': 'false'})
    os.environ.setdefault('APP_SECRET', secrets.token_hex(24))

    import db
    db.init_db_pool()
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT current_database()')
        base = cur.fetchone()[0]
    if base != os.getenv('DB_NAME'):
        print('ME NIEGO A ARRANCAR: la conexion abrio %r y no %r.' % (base, os.getenv('DB_NAME')))
        return 2

    import server
    if 'routes.ai' in sys.modules:
        print('ME NIEGO A SEGUIR: el perfil portal no deberia importar el modulo de IA.')
        return 2
    import auth_middleware as am
    import file_system_db as fsd
    import folder_permissions as fp
    import referencias_de_obra as ref

    obra = PREFIJO + 'obra_' + RUN
    U = {}

    # ── MONTAJE ────────────────────────────────────────────────────────────
    _titulo('MONTAJE · Tu (admin), Ana y Beto (supervision), Colega, Ex y un Extrano')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO projects (id, name, model_urn, status) "
                    "VALUES (%s,%s,%s,'active')", (obra, 'ZZ E1.3 ' + obra, obra))
        ref.registrar_obra(cur, obra, nombre='ZZ E1.3 ' + obra, model_urn=obra,
                           origen='ensayo de flujos creados')
        cur.execute('INSERT INTO companies (name) VALUES (%s) RETURNING id',
                    (PREFIJO + 'supervisa_' + RUN,))
        supervisora = cur.fetchone()[0]
        cur.execute("INSERT INTO project_companies (project_id, company_id, funcion) "
                    "VALUES (%s,%s,'SUPERVISION')", (obra, supervisora))

        def usuario(clave, nombre, rol, miembro=True, empresa=None):
            correo = '%s%s_%s@ensayo.test' % (PREFIJO, clave, RUN)
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, "
                        "  activated_at, company_id) "
                        "VALUES (%s,%s,'x',%s,TRUE,CURRENT_TIMESTAMP,%s) RETURNING id",
                        (nombre, correo, rol, empresa))
            uid = cur.fetchone()[0]
            if miembro:
                cur.execute('INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)',
                            (obra, uid))
            U[clave] = {'id': uid, 'email': correo, 'name': nombre, 'role': rol}

        usuario('tu', 'E13 Tu', 'admin')
        usuario('ana', 'E13 Ana', 'editor', empresa=supervisora)
        usuario('beto', 'E13 Beto', 'editor', empresa=supervisora)
        usuario('colega', 'E13 Colega', 'editor')
        usuario('ex', 'E13 Ex', 'editor')
        usuario('extrano', 'E13 Extrano', 'editor', miembro=False)

        def carpeta(nombre):
            cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                        "VALUES (%s,'FOLDER',%s,'WIP') RETURNING id::text", (obra, nombre))
            return cur.fetchone()[0]

        abierta, reservada = carpeta('ABIERTA'), carpeta('RESERVADA')
        conn.commit()
    db._project_resolver_cache['map'] = None
    fp.set_folder_permission(reservada, U['beto']['id'], 'none', U['tu']['id'], obra)

    def subir(padre, nombre):
        fsd.create_file_record(obra, padre, nombre, 1001,
                               '%s%s/%s/v1' % (PREFIJO, RUN, nombre), 'application/pdf',
                               U['tu']['email'], None)
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text, current_version_id::text, version_number FROM file_nodes "
                        " WHERE model_urn=%s AND name=%s AND node_type='FILE'", (obra, nombre))
            f = cur.fetchone()
        return {'node_id': f[0], 'version_id': f[1], 'version': f[2], 'name': nombre}

    D1 = subir(abierta, 'E13-01.pdf')
    DR = subir(reservada, 'E13-RESERVADO.pdf')
    _paso(D1['version_id'] and DR['version_id'], 'cada documento tiene su version vigente')

    T = {k: am.create_session(v['id']) for k, v in U.items()}
    cli = server.app.test_client()

    def pedir(metodo, ruta, quien, **kw):
        r = getattr(cli, metodo)(ruta, headers={'Authorization': 'Bearer ' + T[quien]}, **kw)
        try:
            return r.status_code, r.get_json()
        except Exception:
            return r.status_code, None

    def item(doc):
        return {'node_id': doc['node_id'], 'name': doc['name'], 'version': doc['version'],
                'version_id': doc['version_id']}

    def previa(quien, plantilla_id, docs=None, **extra):
        cuerpo = {'model_urn': obra, 'plantilla_id': plantilla_id, 'final_status': 'SHARED',
                  'items': [item(d) for d in (docs or [D1])]}
        cuerpo.update(extra)
        return pedir('post', '/api/reviews/previsualizar', quien, json=cuerpo)

    def alta(quien, plantilla_id, docs=None, **extra):
        cuerpo = {'model_urn': obra, 'title': 'E13 alta ' + RUN, 'plantilla_id': plantilla_id,
                  'final_status': 'SHARED', 'items': [item(d) for d in (docs or [D1])]}
        cuerpo.update(extra)
        return pedir('post', '/api/reviews', quien, json=cuerpo)

    def flujo_nuevo(nombre, pasos):
        return pedir('post', '/api/review-templates', 'tu', json={
            'model_urn': obra, 'alcance': 'OBRA', 'nombre': PREFIJO + nombre + '_' + RUN,
            'pasos': pasos})

    def contar():
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            salida = {}
            for tabla in ('doc_reviews', 'encargos', 'activity_log'):
                cur.execute('SELECT count(*) FROM %s' % tabla)
                salida[tabla] = cur.fetchone()[0]
            return salida

    def opciones_de(cuerpo, paso='0'):
        return [c.get('id') for c in ((cuerpo or {}).get('opciones') or {}).get(paso) or []]

    ana, beto, colega = U['ana']['id'], U['beto']['id'], U['colega']['id']
    sup = {'etiqueta': 'Supervisión', 'decision': 'REVISA', 'funcion': 'SUPERVISION', 'dias': 3}
    jefe = {'etiqueta': 'Jefatura', 'decision': 'APRUEBA', 'user_id': colega}

    # ── PLANTILLAS ─────────────────────────────────────────────────────────
    _titulo('PLANTILLAS · por la ruta, y dos «viejas» escritas como antes de esta regla')
    s1, b1 = flujo_nuevo('funcion', [sup, jefe])
    s2, b2 = flujo_nuevo('ex', [{'etiqueta': 'Revisión', 'decision': 'REVISA',
                                 'user_id': U['ex']['id']}, jefe])
    s3, b3 = flujo_nuevo('sin_nadie', [{'etiqueta': 'Contratista', 'decision': 'APRUEBA',
                                        'funcion': 'CONTRATISTA'}])
    s4, b4 = flujo_nuevo('solo_tu', [{'etiqueta': 'Autorrevisión', 'decision': 'APRUEBA',
                                      'user_id': U['tu']['id']}])
    t_funcion, t_ex, t_nadie, t_tu = ((b or {}).get('id') for b in (b1, b2, b3, b4))
    _paso((s1, s2, s3, s4) == (201, 201, 201, 201) and all((t_funcion, t_ex, t_nadie, t_tu)),
          'cuatro flujos creados por la ruta: por funcion, con Ex, con una funcion sin nadie '
          'y con Tu solo', str((s1, s2, s3, s4)))

    viejos = {}
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for clave, pasos in (
                ('viejo_revisa', [{'etiqueta': 'Jefatura', 'decision': 'APRUEBA', 'user_id': ana},
                                  {'etiqueta': 'Cierre', 'decision': 'REVISA', 'user_id': colega}]),
                ('viejo_cero', [{'etiqueta': 'Revisión', 'decision': 'REVISA', 'user_id': ana,
                                 'dias': 0}, jefe])):
            cur.execute("INSERT INTO doc_review_plantillas (alcance, project_id, nombre, pasos, "
                        "  creado_por, history) VALUES ('OBRA', %s, %s, %s, %s, '[]') "
                        "RETURNING id", (obra, PREFIJO + clave + '_' + RUN, json.dumps(pasos),
                                         U['tu']['id']))
            viejos[clave] = str(cur.fetchone()[0])
        cur.execute('DELETE FROM project_users WHERE project_id = %s AND user_id = %s',
                    (obra, U['ex']['id']))
        conn.commit()
    _paso(len(viejos) == 2, 'dos flujos viejos escritos como antes de la regla, y Ex sale de la obra')

    # ── L · EL LISTADO ─────────────────────────────────────────────────────
    _titulo('L · el listado dice que flujo no se puede usar aqui, y por que')
    s, b = pedir('get', '/api/review-templates?model_urn=%s' % obra, 'tu')
    lista = {p['id']: p for p in (b or {}).get('plantillas') or []}

    def marca(pid, de=None):
        p = (de or lista).get(pid) or {}
        return p.get('utilizable'), p.get('motivo_no_utilizable') or ''

    _paso(s == 200 and lista and all('utilizable' in p and 'motivo_no_utilizable' in p
                                     for p in lista.values()),
          'cada flujo del listado dice si se puede usar y por que no', 'http=%s n=%d' % (s, len(lista)))
    u, m = marca(t_funcion)
    _paso(u is True and not m, 'el flujo por funcion, que pide elegir persona, SI se puede usar',
          repr((u, m)))
    u, m = marca(t_tu)
    _paso(u is True, 'el flujo con Tu solo se puede usar: la independencia depende de quien lo inicie',
          repr((u, m)))
    u, m = marca(viejos['viejo_revisa'])
    _paso(u is False and 'sólo revisa' in m, 'el flujo viejo que acaba en «revisa» no, con el motivo',
          repr((u, m)))
    u, m = marca(viejos['viejo_cero'])
    _paso(u is False and 'plazo' in m, 'el flujo viejo con plazo 0 no, con el motivo', repr((u, m)))
    u, m = marca(t_ex)
    _paso(u is False and 'E13 Ex' in m and 'ya no es participante' in m,
          'el flujo con alguien que salio de la obra no, y lo nombra', repr((u, m)))
    u, m = marca(t_nadie)
    _paso(u is False and 'no hay nadie con esa función' in m,
          'el flujo con una funcion que nadie tiene no, con el motivo', repr((u, m)))
    s, b = pedir('get', '/api/review-templates?model_urn=%s' % obra, 'colega')
    de_colega = {p['id']: p for p in (b or {}).get('plantillas') or []}
    _paso(s == 200 and all(marca(pid, de_colega) == marca(pid) for pid in lista),
          'Colega, que no administra, ve las mismas marcas', 'http=%s' % s)

    # ── E · EL EDITOR ──────────────────────────────────────────────────────
    _titulo('E · el editor de flujos')
    s, b = flujo_nuevo('cero', [dict(sup, dias=0), jefe])
    _paso(s == 400 and _codigo(b) == 'PASOS_INVALIDOS' and 'plazo' in _error(b),
          'un flujo nuevo con plazo 0 no se guarda', 'http=%s %s' % (s, _error(b)))
    s, b = pedir('put', '/api/review-templates/%s' % t_funcion, 'tu', json={
        'pasos': [sup, {'etiqueta': 'Jefatura', 'decision': 'APRUEBA', 'user_id': U['ex']['id']}],
        'motivo': 'poner a Ex'})
    sd, bd = pedir('get', '/api/review-templates/%s' % t_funcion, 'tu')
    _paso(s == 409 and _codigo(b) == 'REVISOR_NO_MIEMBRO' and (bd or {}).get('version') == 1,
          'modificar un flujo para poner a alguien de fuera no se guarda, y la version no sube',
          'http=%s %s version=%s' % (s, _codigo(b), (bd or {}).get('version')))
    s, b = pedir('post', '/api/review-templates', 'tu', json={
        'model_urn': obra, 'alcance': 'OBRA', 'nombre': PREFIJO + 'funcion_' + RUN,
        'pasos': [sup, jefe]})
    _paso(s == 409 and _codigo(b) == 'NOMBRE_REPETIDO', 'un nombre repetido se dice como tal',
          'http=%s %s' % (s, b))

    # ── P · LA VISTA PREVIA ────────────────────────────────────────────────
    _titulo('P · la vista previa hace todas las comprobaciones del alta y no escribe nada')
    antes = contar()
    s, b = previa('tu', t_funcion)
    _paso(s == 409 and _codigo(b) == 'ELIGE_REVISOR' and opciones_de(b) == [ana, beto],
          'sin elegir: pide elegir el paso 1 entre Ana y Beto', 'http=%s %s' % (s, _error(b)))
    s, b = previa('tu', t_funcion, elecciones={'0': ana})
    pasos = (b or {}).get('pasos') or []
    _paso(s == 200 and (b or {}).get('comprobado') is True
          and [p.get('user_id') for p in pasos] == [ana, colega]
          and pasos[0].get('de_funcion') == 'SUPERVISION' and pasos[0].get('dias') == 3
          and opciones_de(b) == [ana, beto],
          'eligiendo a Ana: salen los pasos con su plazo, y siguen las dos opciones para cambiar',
          'http=%s %s' % (s, _error(b)))
    for elecciones, que in (({'0': 'ana'}, 'un texto'), ({'0': colega}, 'a alguien sin la funcion')):
        s, b = previa('tu', t_funcion, elecciones=elecciones)
        _paso(s == 409 and _codigo(b) == 'ELECCION_INVALIDA', 'elegir %s es un error claro' % que,
              'http=%s %s' % (s, _codigo(b)))
    s, b = previa('tu', t_funcion, elecciones=['x'])
    _paso(s == 400 and _codigo(b) == 'ELECCION_INVALIDA',
          'unas elecciones que no son un diccionario son un error claro', 'http=%s %s' % (s, _codigo(b)))
    s, b = previa('tu', t_funcion, docs=[DR], elecciones={'0': beto})
    _paso(s == 400 and _codigo(b) == 'REVISOR_SIN_ACCESO_DOCUMENTAL',
          'eligiendo a Beto sobre un documento que no puede ver: se dice antes de iniciar',
          'http=%s %s' % (s, _codigo(b)))
    s, b = previa('tu', t_tu)
    _paso(s == 400 and _codigo(b) == 'REVISION_SIN_INDEPENDENCIA',
          'Tu como unico revisor de tu propia revision: se dice antes de iniciar',
          'http=%s %s' % (s, _codigo(b)))
    s, b = previa('colega', t_tu)
    _paso(s == 200, 'el mismo flujo iniciado por Colega si vale', 'http=%s %s' % (s, _error(b)))
    s, b = previa('tu', viejos['viejo_revisa'])
    _paso(s == 400 and _codigo(b) == 'FLUJO_SIN_CIERRE',
          'el flujo viejo que acaba en «revisa»: se dice antes de iniciar', 'http=%s %s' % (s, _codigo(b)))
    s, b = previa('tu', viejos['viejo_cero'])
    _paso(s == 400 and 'plazo' in _error(b), 'el flujo viejo con plazo 0: se dice antes de iniciar',
          'http=%s %s' % (s, _error(b)))
    s, b = previa('tu', t_ex)
    _paso(s == 409 and _codigo(b) == 'REVISOR_NO_MIEMBRO' and 'E13 Ex' in _error(b),
          'el flujo con alguien que salio de la obra: lo nombra antes de iniciar',
          'http=%s %s' % (s, _error(b)))
    s, b = previa('tu', t_funcion, elecciones={'0': ana}, final_status='PUBLISHED')
    _paso(s == 200, 'la vista previa no pide todavia el titulo ni la idoneidad',
          'http=%s %s' % (s, _error(b)))
    despues = contar()
    _paso(antes == despues,
          'tras todas esas vistas previas: ni una revision, ni un encargo, ni un registro nuevos',
          '%s -> %s' % (antes, despues))

    # ── A · EL ALTA ────────────────────────────────────────────────────────
    _titulo('A · el alta con la persona elegida')
    s, b = alta('tu', t_funcion)
    _paso(s == 409 and _codigo(b) == 'ELIGE_REVISOR' and opciones_de(b) == [ana, beto],
          'el alta sin elegir se sigue negando, con las opciones', 'http=%s %s' % (s, _codigo(b)))
    s, b = alta('tu', t_funcion, elecciones={'0': ana}, title='')
    _paso(s == 400, 'el alta sin titulo se sigue negando', 'http=%s %s' % (s, _error(b)))
    s, b = alta('tu', t_funcion, elecciones={'0': ana}, final_status='PUBLISHED')
    _paso(s == 400 and 'idoneidad' in _error(b),
          'publicar sin codigo de idoneidad se sigue negando al iniciar', 'http=%s %s' % (s, _error(b)))
    s, b = alta('tu', t_funcion, elecciones={'0': ana})
    rid = (b or {}).get('id')
    sd, bd = pedir('get', '/api/reviews/%s?model_urn=%s' % (rid, obra), 'tu')
    rev = (bd or {}).get('revision') or {}
    pasos = rev.get('steps') or []
    _paso(s == 200 and rid and sd == 200 and [p.get('user_id') for p in pasos] == [ana, colega]
          and pasos[0].get('de_funcion') == 'SUPERVISION'
          and rev.get('plantilla_nombre') == PREFIJO + 'funcion_' + RUN
          and rev.get('plantilla_version') == 1,
          'la revision nace con Ana en el paso 1, desde la funcion, y con su procedencia',
          'http=%s rid=%s detalle=%s' % (s, rid, sd))

    def trabajo(quien):
        _s, cuerpo = pedir('get', '/api/mi-trabajo', quien)
        return [p for p in (cuerpo or {}).get('pendientes') or []
                if p.get('objeto_tipo') == 'REVIEW' and str(p.get('objeto_id')) == str(rid)]

    _paso(len(trabajo('ana')) == 1 and trabajo('beto') == [],
          'Ana tiene la tarea en Mi Trabajo; Beto, que no fue elegido, no')

    # ── X · BORDES ─────────────────────────────────────────────────────────
    _titulo('X · identificadores malos, perimetro y la vista previa antigua')
    s, b = previa('tu', 'abc')
    _paso(s == 404 and _codigo(b) == 'PLANTILLA_NO_EXISTE',
          'vista previa con un identificador que no es un numero: 404 con mensaje',
          'http=%s %s' % (s, b))
    s, b = alta('tu', 'abc')
    _paso(s == 404 and _codigo(b) == 'PLANTILLA_NO_EXISTE',
          'alta con un identificador que no es un numero: 404 con mensaje, no 500',
          'http=%s %s' % (s, b))
    s, b = previa('extrano', t_funcion, elecciones={'0': ana})
    _paso(s == 403, 'quien no es de la obra recibe el 403 del perimetro', 'http=%s %s' % (s, _codigo(b)))
    s, b = pedir('get', '/api/review-templates/%s/resolver?model_urn=%s' % (t_funcion, obra), 'tu')
    _paso(s == 409 and _codigo(b) == 'ELIGE_REVISOR' and opciones_de(b) == [ana, beto],
          'la vista previa antigua responde como antes, para el portal aun sin desplegar',
          'http=%s %s' % (s, _codigo(b)))

    total, bien = len(_pasos), sum(1 for ok, _t in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, total))
    return 0 if bien == total else 1


if __name__ == '__main__':
    sys.exit(main())
