# -*- coding: utf-8 -*-
"""LA LLAVE MAESTRA DEJA DE SERLO: administrar una obra ≠ administrar la entidad.

QUE CIERRA
----------
Hasta el 21-ago-2026 `users.role = 'admin'` significaba TRES cosas a la vez, y
medido con sonda sobre un `admin` que NO era miembro de la obra y SIN ninguna
concesion de carpeta:

    200  /api/docs/list · global-search · indice-expediente · activity
    200  POST …/participantes   -> cambio la funcion contractual de una empresa
    200  POST /api/rfis         -> EMITIO UN RFI EN UNA OBRA AJENA
    permiso_efectivo(admin, contrato) = 'admin'

Ahora hay dos figuras y este ensayo comprueba que estan separadas DE VERDAD:

  ENTITY ADMIN    `users.role='admin'`. Custodio de la instancia. Conserva
                  alcance global mientras 1 instancia = 1 cliente.
  PROJECT ADMIN   `project_users.es_admin`. Administra UNA obra. Su autoridad
                  TERMINA ahi.

QUE SE MIDE, Y COMO
-------------------
No se comprueba que exista una funcion con buen nombre: se llama a las RUTAS
REALES con la sesion equivocada y se mira el codigo que devuelven. Una regla que
solo existe en un docstring no gobierna nada.

    python herramientas/ensayo_de_administracion.py
"""
import datetime
import importlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_adm_'
OBRA = PREFIJO + 'obra'
OTRA = PREFIJO + 'otra'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def _titulo(t):
    print()
    print(t.upper())


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM transmittals WHERE model_urn LIKE %s", (PREFIJO + '%',))
    for t in ('doc_rfis', 'doc_redlines'):
        cur.execute("DELETE FROM %s WHERE project_id LIKE %%s" % t, (PREFIJO + '%',))
    cur.execute("DELETE FROM folder_permissions WHERE folder_node_id IN "
                " (SELECT id FROM file_nodes WHERE model_urn LIKE %s)", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_versions WHERE file_node_id IN "
                " (SELECT id FROM file_nodes WHERE model_urn LIKE %s)", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_nodes WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_companies WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM companies WHERE name LIKE %s", (PREFIJO + '%',))


def cliente(usuario, *bps):
    """UN CLIENTE POR ACTO, y nunca uno guardado para luego.

    `validate_session` se parchea a nivel de MODULO: crear un cliente nuevo
    cambia la sesion de todos los anteriores. Guardar un cliente en una variable
    y reutilizarlo mas abajo hace que actue como OTRA PERSONA sin avisar -- y
    una comprobacion asi no falla: enseña lo contrario de lo que pasa.
    """
    from flask import Flask
    import auth_middleware as am
    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    for bp in bps:
        app.register_blueprint(bp)
    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ensayo'
    return c


def main():
    os.environ['ENFORCE_PROJECT_AUTHZ'] = 'true'
    os.environ.setdefault('AUTH_POLICY_MODE', 'sombra')
    os.environ.setdefault('APP_SECRET', 'x' * 32)

    import db
    importlib.reload(db)
    from db import init_db_pool, get_db_connection
    import referencias_de_obra as ref
    import administracion_de_obra as adm
    import permiso_documental as pd
    import flujo_de_rfi as frfi
    import flujo_de_redline as frl
    import routes.administracion as radm
    import routes.directorio as rdir
    import routes.documents as rdoc
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DE ADMINISTRACION — LA LLAVE MAESTRA DEJA DE SERLO')
    print('=' * 76)

    # La columna la crea el BOOTSTRAP, con el rol dueño del esquema. Aqui se
    # intenta por comodidad, pero si no esta el ensayo se para: medir sobre una
    # base que no es la que el codigo espera no demuestra nada.
    adm.asegurar_columna()
    with get_db_connection() as _c:
        _cur = _c.cursor()
        _cur.execute("SELECT 1 FROM information_schema.columns "
                     " WHERE table_name='project_users' AND column_name='es_admin'")
        if not _cur.fetchone():
            print()
            print('NO SE PUEDE ENSAYAR: falta `project_users.es_admin`.')
            print('Créala con el rol dueño del esquema:')
            print('    DB_USER=<rol migrador> python bootstrap_esquema.py')
            return 2

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None

        cur.execute("SELECT id FROM hubs LIMIT 1")
        hub = (cur.fetchone() or [None])[0]
        for obra, nombre in ((OBRA, 'ZZ ADM'), (OTRA, 'ZZ ADM OTRA')):
            cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                        "VALUES (%s,%s,%s,%s,'active')", (obra, hub, nombre, obra))
            ref.registrar_obra(cur, obra, nombre=nombre, model_urn=obra,
                               origen='ensayo de administracion')

        cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id",
                    (PREFIJO + 'CONSTRUCTORA',))
        emp = cur.fetchone()[0]
        cur.execute("INSERT INTO project_companies (project_id, company_id, funcion) "
                    "VALUES (%s,%s,'CONTRATISTA')", (OBRA, emp))

        def usuario(nombre, correo, rol, obras, empresa=None):
            cur.execute("INSERT INTO users (name, email, password_hash, role, "
                        "  is_active, company_id) VALUES (%s,%s,'x',%s,TRUE,%s) "
                        "RETURNING id", (nombre, PREFIJO + correo, rol, empresa))
            uid = cur.fetchone()[0]
            for o in obras:
                cur.execute("INSERT INTO project_users (project_id, user_id) "
                            "VALUES (%s,%s)", (o, uid))
            return uid

        g = {
            # Custodio de la instancia. NO es miembro de ninguna de las dos.
            'entidad': usuario('Custodia', 'entidad@t', 'admin', []),
            # Miembro de A. Sera administradora DE A, y de nada mas.
            'jefa':    usuario('Jefa de A', 'jefa@t', 'editor', [OBRA], emp),
            # Miembro de las DOS, administradora de B. Es la prueba de que la
            # administracion no viaja: en A no manda.
            'jefeB':   usuario('Jefe de B', 'jefeb@t', 'editor', [OBRA, OTRA], emp),
            # Miembro corriente de A.
            'resi':    usuario('Residente', 'resi@t', 'editor', [OBRA], emp),
        }
        correos = {'entidad': 'entidad@t', 'jefa': 'jefa@t',
                   'jefeB': 'jefeb@t', 'resi': 'resi@t'}
        SES = {k: {'id': v, 'email': PREFIJO + correos[k],
                   'name': {'entidad': 'Custodia', 'jefa': 'Jefa de A',
                            'jefeB': 'Jefe de B', 'resi': 'Residente'}[k],
                   'role': 'admin' if k == 'entidad' else 'editor'}
               for k, v in g.items()}
        conn.commit()

        def como(quien, *bps):
            return cliente(SES[quien], *bps)

        # ── 1 · nadie hereda administracion ──────────────────────────────
        _titulo('1 · la columna nace FALSE: nadie hereda autoridad')
        cur.execute("SELECT count(*) FROM project_users WHERE project_id LIKE %s "
                    "  AND es_admin", (PREFIJO + '%',))
        _paso(cur.fetchone()[0] == 0,
              'ninguna membresia nace administrando: no se infirio quien debia '
              'administrar que')

        _paso(adm.es_admin_de_obra(cur, SES['jefa'], OBRA) is False,
              'la jefa de A todavia NO administra A')
        _paso(adm.es_entity_admin(SES['entidad']) is True
              and adm.es_admin_de_obra(cur, SES['entidad'], OBRA) is True,
              'el Entity Admin conserva alcance: 1 instancia = 1 cliente, y eso '
              'no se rompe hoy')

        # ── 2 · sin administracion, no se administra ─────────────────────
        _titulo('2 · un miembro corriente no administra su propia obra')
        r = como('jefa', rdir.directorio_bp).post(
            '/api/projects/%s/participantes' % OBRA,
            json={'company_id': emp, 'funcion': 'ENTIDAD'})
        _paso(r.status_code == 403
              and (r.get_json() or {}).get('motivo') == 'NO_ES_ADMIN_DE_OBRA',
              'no puede cambiar la funcion contractual de una empresa',
              'devolvio %s' % r.status_code)

        # ── 3 · nombrar ───────────────────────────────────────────────────
        _titulo('3 · nombrar administrador de obra')
        r = como('entidad', radm.administracion_bp).put(
            '/api/projects/%s/miembros/%s/admin' % (OBRA, g['jefa']),
            json={'es_admin': True})
        _paso(r.status_code == 200, 'el Entity Admin la nombra', str(r.status_code))

        r = como('entidad', radm.administracion_bp).put(
            '/api/projects/%s/miembros/%s/admin' % (OTRA, g['jefeB']),
            json={'es_admin': True})
        _paso(r.status_code == 200, 'y nombra al jefe de B en B')

        conn.commit()
        cur.execute("SELECT es_admin FROM project_users WHERE project_id=%s "
                    "  AND user_id=%s", (OBRA, g['jefa']))
        _paso(cur.fetchone()[0] is True, 'la columna lo refleja')

        r = como('jefa', rdir.directorio_bp).post(
            '/api/projects/%s/participantes' % OBRA,
            json={'company_id': emp, 'funcion': 'ENTIDAD'})
        _paso(r.status_code == 200, 'y ahora SI puede administrar su obra',
              str(r.status_code))

        # ── 4 · LA AUTORIDAD TERMINA EN SU OBRA ──────────────────────────
        _titulo('4 · la administracion NO viaja a otra obra')
        r = como('jefeB', rdir.directorio_bp).post(
            '/api/projects/%s/participantes' % OBRA,
            json={'company_id': emp, 'funcion': 'PROYECTISTA'})
        _paso(r.status_code == 403,
              'quien administra B NO administra A, aunque participe en A',
              'devolvio %s' % r.status_code)

        _paso(adm.es_admin_de_obra(cur, SES['jefeB'], OTRA) is True
              and adm.es_admin_de_obra(cur, SES['jefeB'], OBRA) is False,
              'y la resolucion canonica dice exactamente eso')

        # ── 5 · quien no es miembro no puede ser nombrado ────────────────
        _titulo('5 · un administrador de obra existe como miembro, o no existe')
        cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                    " VALUES ('Ajeno', %s, 'x', 'editor', TRUE) RETURNING id",
                    (PREFIJO + 'ajeno@t',))
        ajeno = cur.fetchone()[0]
        conn.commit()
        r = como('entidad', radm.administracion_bp).put(
            '/api/projects/%s/miembros/%s/admin' % (OBRA, ajeno),
            json={'es_admin': True})
        _paso(r.status_code == 404
              and (r.get_json() or {}).get('code') == 'NO_ES_MIEMBRO',
              'no se puede nombrar a quien no participa en la obra',
              str(r.status_code))

        # RETIRAR LA MEMBRESIA RETIRA LA ADMINISTRACION, sin que nadie actue.
        cur.execute("DELETE FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OTRA, g['jefeB']))
        conn.commit()
        _paso(adm.es_admin_de_obra(cur, SES['jefeB'], OTRA) is False,
              'sacarlo de la obra le retira la administracion EN EL MISMO ACTO: '
              'no es una regla que se comprueba, es la forma de la tabla')
        cur.execute("INSERT INTO project_users (project_id, user_id, es_admin) "
                    " VALUES (%s,%s,TRUE)", (OTRA, g['jefeB']))
        conn.commit()

        # ── 6 · nadie se queda sin administrador por descuido ────────────
        _titulo('6 · el ultimo administrador no se retira a si mismo')
        r = como('jefa', radm.administracion_bp).put(
            '/api/projects/%s/miembros/%s/admin' % (OBRA, g['jefa']),
            json={'es_admin': False})
        _paso(r.status_code == 409
              and (r.get_json() or {}).get('code') == 'ULTIMO_ADMIN_DE_OBRA',
              'es la unica administradora: retirarse dejaria la obra sin quien '
              'la administre y sin quien pueda devolverle uno',
              str(r.status_code))
        r = como('entidad', radm.administracion_bp).put(
            '/api/projects/%s/miembros/%s/admin' % (OBRA, g['jefa']),
            json={'es_admin': False})
        _paso(r.status_code == 200,
              'el Entity Admin si puede: el siempre puede devolver uno')
        como('entidad', radm.administracion_bp).put(
            '/api/projects/%s/miembros/%s/admin' % (OBRA, g['jefa']),
            json={'es_admin': True})
        conn.commit()

        # ── 7 · el documento ──────────────────────────────────────────────
        _titulo('7 · sobre el expediente')
        cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, "
                    "  is_deleted, status, gcs_urn, version_number) "
                    "VALUES (%s,'FILE','CONTRATO.pdf',FALSE,'SHARED',%s,1) "
                    "RETURNING id::text", (OBRA, PREFIJO + 'obj/CONTRATO.pdf'))
        doc = cur.fetchone()[0]
        conn.commit()

        _paso(pd.permiso_efectivo(cur, SES['jefa'], OBRA, doc) == 'admin',
              'quien administra la obra ve su expediente')
        _paso(pd.permiso_efectivo(cur, SES['jefeB'], OBRA, doc) != 'admin',
              'quien administra OTRA obra, no',
              str(pd.permiso_efectivo(cur, SES['jefeB'], OBRA, doc)))

        # ── 8 · los flujos ────────────────────────────────────────────────
        _titulo('8 · RFI y Red Line: rescatar si, dictar veredicto NO')
        rfi = {'project_id': OBRA, 'created_by': SES['resi']['email'],
               'responsable_id': g['resi'], 'responsable': 'Residente',
               'estado': 'En revisión'}
        _paso(frfi.puede_pasar_la_pelota(SES['jefa'], rfi, cur) is True,
              'la administradora de la obra desatasca un RFI ajeno')
        _paso(frfi.puede_pasar_la_pelota(SES['jefeB'], rfi, cur) is False,
              'la de OTRA obra no toca este RFI')
        _paso(frfi.puede_dictar_veredicto(SES['jefa'], rfi) is False,
              'y NINGUN administrador responde por el responsable: un veredicto '
              'que puede dictar cualquiera no prueba nada')
        rl = dict(rfi)
        _paso(frl.puede_cerrar(SES['jefa'], rl, cur) is True
              and frl.puede_dictar_veredicto(SES['jefa'], rl, cur) is False,
              'el Red Line se comporta igual, y por su cuenta')

        # ── 9 · la interfaz pregunta, pero no autoriza ────────────────────
        _titulo('9 · `mi-administracion` informa; el servidor sigue decidiendo')
        d = (como('jefa', radm.administracion_bp)
             .get('/api/projects/%s/mi-administracion' % OBRA).get_json() or {})
        _paso(d.get('es_admin_de_obra') is True and d.get('es_entity_admin') is False,
              'a la administradora de obra le dice justo lo que es', json.dumps(d))
        d = (como('resi', radm.administracion_bp)
             .get('/api/projects/%s/mi-administracion' % OBRA).get_json() or {})
        _paso(d.get('es_admin_de_obra') is False,
              'y al residente le dice que no')
        r = como('resi', rdir.directorio_bp).post(
            '/api/projects/%s/participantes' % OBRA,
            json={'company_id': emp, 'funcion': 'ENTIDAD'})
        _paso(r.status_code == 403,
              'preguntar no concede nada: la ruta lo vuelve a comprobar')

        # ── 10 · el inventario de la Enmienda 1 ──────────────────────────
        _titulo('10 · inventario: quien tiene autoridad AHORA, y de que tipo')
        inv = [x for x in adm.inventario_de_administradores(cur)
               if str(x['correo'] or '').startswith(PREFIJO)]
        tipos = {x['correo'].replace(PREFIJO, ''): x['tipo'] for x in inv}
        _paso(tipos.get('entidad@t') == 'ENTITY ADMIN'
              and tipos.get('jefa@t') == 'PROJECT ADMIN',
              'las dos figuras se listan por separado', json.dumps(tipos))
        _paso('resi@t' not in tipos,
              'y quien no administra nada no aparece')

        # ── 11 · el registro administrativo de recepcion (Enmienda 2) ────
        _titulo('11 · registrar una recepcion NO es acusarla')
        import encargos as enc
        import routes.transmittals as rtr
        cur.execute("INSERT INTO transmittals (model_urn, number, subject, items, "
                    "  recipients, acuses, created_by) "
                    "VALUES (%s,901,'Planos para revision',%s::jsonb,%s::jsonb,"
                    "  '[]'::jsonb,%s) RETURNING id",
                    (OBRA, json.dumps([{'node_id': doc, 'name': 'CONTRATO.pdf'}]),
                     json.dumps([{'user_id': g['resi'], 'email': SES['resi']['email'],
                                  'name': 'Residente'}]),
                     SES['jefa']['email']))
        tid = cur.fetchone()[0]
        enc.abrir(cur, 'TRANSMITTAL', str(tid), 'Acusar recibo de TR-901',
                  destino_usuario=g['resi'], creado_por=SES['jefa']['email'])
        conn.commit()
        _paso(len(enc.mi_trabajo(cur, g['resi'])) == 1,
              'la recepcion la debe el DESTINATARIO')

        r = como('jefeB', rtr.transmittals_bp).post(
            '/api/transmittals/%s/acuse' % tid, json={'destinatario_id': g['resi']})
        _paso(r.status_code == 403,
              'quien administra OTRA obra no registra recepciones aqui',
              str(r.status_code))

        r = como('jefa', rtr.transmittals_bp).post('/api/transmittals/%s/acuse' % tid,
                                                   json={})
        _paso(r.status_code == 400
              and (r.get_json() or {}).get('code') == 'FALTA_DESTINATARIO',
              'y la administradora de la obra tiene que decir DE QUIEN es',
              str(r.status_code))

        r = como('jefa', rtr.transmittals_bp).post(
            '/api/transmittals/%s/acuse' % tid,
            json={'destinatario_id': g['resi'], 'motivo': 'avisó por teléfono'})
        _paso(r.status_code == 200, 'diciendolo, se registra', str(r.status_code))

        conn.commit()
        cur.execute("SELECT acuses FROM transmittals WHERE id=%s", (tid,))
        fila = (cur.fetchone()[0] or [None])[0] or {}
        _paso(fila.get('tipo') == 'ADMIN_RECORDED_RECEIPT'
              and 'por_id' not in fila
              and fila.get('registrado_por_id') == g['jefa']
              and fila.get('destinatario_id') == g['resi'],
              'la fila dice QUE es, DE QUIEN y QUIEN la anoto -- y no se puede '
              'leer como un acuse del destinatario', json.dumps(fila))

        _paso(len(enc.mi_trabajo(cur, g['resi'])) == 0,
              'salda al DESTINATARIO: antes cerraba el encargo de quien '
              'registraba --que no tenia ninguno-- y el destinatario seguia '
              'debiendolo con la emision mostrando un acuse')

        antes = enc.conciliar(cur, aplicar=True, actor='ensayo')
        despues = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(despues[0] == 0 and despues[1] == 0,
              'y la conciliacion no lo deshace: la segunda pasada no mueve nada',
              str(antes) + ' -> ' + str(despues))

        limpiar(cur)
        conn.commit()

    fallos = [p for p in _pasos if not p[0]]
    print()
    print('=' * 76)
    print('%d de %d comprobaciones pasan' % (len(_pasos) - len(fallos), len(_pasos)))
    print('=' * 76)
    return 1 if fallos else 0


if __name__ == '__main__':
    raise SystemExit(main())
