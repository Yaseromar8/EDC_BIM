# -*- coding: utf-8 -*-
"""ENSAYO · LA VALORIZACIÓN DEL MES GUARDADA PARA TODA LA OBRA (25-nov-2026, docs/visor/71 §8, migración 52).

Con la aplicación REAL (`server.app`, middleware, guardias) y sesiones reales contra un PostgreSQL LOCAL DESECHABLE
con la migración 52 aplicada:

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_banco DB_USER=ecd_app DB_PASS= DDL_EN_CALIENTE=false \\
        python backend/herramientas/ensayo_de_valorizacion.py [<un Excel real>]

Qué demuestra: sólo un administrador de la obra sube o quita; los miembros leen el mismo Excel, byte a byte; quien no
es de la obra no lo ve; el mismo Excel no crea otra versión; una nueva deja la anterior en el historial; lo que no es un
Excel no se guarda; cada frente tiene la suya. Deja sus filas (prefijo `zz_val_`).
"""
import base64
import hashlib
import io
import os
import re
import secrets
import sys
import time
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dotenv  # noqa: E402
dotenv.load_dotenv = lambda *a, **k: False

_pasos = []


def paso(ok, texto, detalle=''):
    _pasos.append(bool(ok))
    print('  %s  %s%s' % ('OK   ' if ok else 'FALLA', texto, ('   -- ' + str(detalle)) if detalle not in ('', None) else ''))


def titulo(t):
    print('\n── %s %s' % (t, '─' * max(0, 70 - len(t))))


def excel_de_mentira(texto):
    """Un .xlsx mínimo (es un ZIP): basta para la ruta, que sólo mira que sea un Excel."""
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w') as z:
        z.writestr('[Content_Types].xml', '<Types/>')
        z.writestr('xl/workbook.xml', '<workbook>%s</workbook>' % texto)
    return b.getvalue()


def main():
    if (os.getenv('DB_HOST') or '') not in ('127.0.0.1', 'localhost', '::1'):
        print('ME NIEGO A ARRANCAR: DB_HOST=%r no es esta maquina.' % (os.getenv('DB_HOST'),))
        return 2
    if not re.search(r'(test|ensayo|prueba|banco)', os.getenv('DB_NAME') or '', re.I) or os.getenv('DATABASE_URL'):
        print('ME NIEGO A ARRANCAR: la base no parece desechable.')
        return 2
    for clave in ('RESEND_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'APS_CLIENT_ID', 'APS_CLIENT_SECRET', 'REDIS_URL'):
        os.environ[clave] = ''
    os.environ.update({'AUTH_POLICY_MODE': 'estricto', 'ENFORCE_PROJECT_AUTHZ': 'true', 'DDL_EN_CALIENTE': 'false',
                       'FLASK_SKIP_DOTENV': '1', 'ALLOW_DEMO_TOKEN': 'false'})
    os.environ.setdefault('APP_SECRET', secrets.token_hex(24))
    os.environ.setdefault('SESSION_PEPPER', 'pimienta-de-ensayo')

    import db
    db.init_db_pool()
    import server
    import auth_middleware as am

    run = time.strftime('%H%M%S')
    A, B = 'zz_val_a_%s' % run, 'zz_val_b_%s' % run

    titulo('MONTAJE · obra A (administradora y miembro) y obra B (ajeno)')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for obra in (A, B):
            cur.execute("INSERT INTO projects (id, name, model_urn, status) VALUES (%s,%s,%s,'active')", (obra, obra.upper(), obra))

        def usuario(nombre, obra, es_admin):
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, activated_at) "
                        "VALUES (%s,%s,'x','editor',TRUE,NOW()) RETURNING id", (nombre, '%s.%s@banco.test' % (nombre, run)))
            uid = cur.fetchone()[0]
            cur.execute("INSERT INTO project_users (project_id, user_id, es_admin) VALUES (%s,%s,%s)", (obra, uid, es_admin))
            token = am.generate_session_token()
            cur.execute("INSERT INTO sessions (token, user_id, expires_at, is_active) VALUES (%s,%s,NOW() + INTERVAL '1 day',TRUE)",
                        (am.hash_de_token(token), uid))
            return {'Authorization': 'Bearer ' + token}
        jefa = usuario('jefa', A, True)
        miembro = usuario('miembro', A, False)
        ajeno = usuario('ajeno', B, False)
        conn.commit()
    db._project_resolver_cache['map'] = None
    cli = server.app.test_client()
    ruta = '/api/planilla/valorizacion'
    frente = A + '_DRENAJE'
    real = sys.argv[1] if len(sys.argv) > 1 else None
    v1 = open(real, 'rb').read() if real else excel_de_mentira('v1')
    v2 = excel_de_mentira('v2-%s' % run)
    b64 = lambda d: base64.b64encode(d).decode('ascii')
    paso(True, 'obra A con su frente DRENAJE; jefa administra A; miembro es de A; ajeno es de B',
         'Excel real: %s (%d bytes)' % (os.path.basename(real), len(v1)) if real else 'Excel de prueba')

    titulo('1 · VACÍO')
    r = cli.get(ruta + '?project=' + frente, headers=miembro)
    paso(r.status_code == 200 and r.get_json()['vigente'] is None and r.get_json()['puede_editar'] is False,
         'el miembro ve el frente sin valorización y sin poder editar', r.status_code)
    r = cli.get(ruta + '?project=' + frente, headers=jefa)
    paso(r.status_code == 200 and r.get_json()['puede_editar'] is True, 'la administradora puede editar', r.status_code)

    titulo('2 · SUBIR: SÓLO LA ADMINISTRADORA')
    r = cli.post(ruta, headers=miembro, json={'project': frente, 'archivo': 'VAL13.xlsx', 'contenido_b64': b64(v1)})
    paso(r.status_code == 403 and r.get_json().get('code') == 'NOT_PROJECT_ADMIN', 'el miembro no puede subir', r.status_code)
    r = cli.post(ruta, headers=ajeno, json={'project': frente, 'archivo': 'VAL13.xlsx', 'contenido_b64': b64(v1)})
    paso(r.status_code in (403, 404), 'quien no es de la obra tampoco', r.status_code)
    r = cli.post(ruta, headers=jefa, json={'project': frente, 'archivo': 'C:\\ruta\\VAL13.xlsx', 'contenido_b64': b64(v1)})
    paso(r.status_code == 201 and r.get_json()['version'] == 1, 'la administradora sube: versión 1', (r.status_code, r.get_json()))
    r = cli.post(ruta, headers=jefa, json={'project': frente, 'archivo': 'VAL13.xlsx', 'contenido_b64': b64(v1)})
    paso(r.status_code == 200 and r.get_json()['sin_cambios'] is True, 'el mismo Excel otra vez no crea otra versión', r.get_json())

    titulo('3 · LEER: TODOS LOS DE LA OBRA, EL MISMO EXCEL')
    r = cli.get(ruta + '?project=' + frente, headers=miembro)
    j = r.get_json()
    leido = base64.b64decode(j['vigente']['contenido_b64']) if j.get('vigente') else b''
    paso(r.status_code == 200 and leido == v1, 'el miembro recibe el Excel byte a byte',
         'sha256 igual: %s' % (hashlib.sha256(leido).hexdigest() == hashlib.sha256(v1).hexdigest()))
    paso(j['vigente']['archivo'] == 'VAL13.xlsx' and j['vigente']['creado_por'] == 'jefa', 'con su nombre (sin la ruta del disco) y quién lo subió',
         (j['vigente']['archivo'], j['vigente']['creado_por']))
    r = cli.get(ruta + '?project=' + frente, headers=ajeno)
    paso(r.status_code in (403, 404), 'quien no es de la obra no lo ve', r.status_code)
    r = cli.get(ruta + '?project=' + A, headers=miembro)
    paso(r.status_code == 200 and r.get_json()['vigente'] is None, 'la obra entera (otro frente) no tiene la del DRENAJE', r.status_code)

    titulo('4 · OTRA VERSIÓN Y EL HISTORIAL')
    r = cli.post(ruta, headers=jefa, json={'project': frente, 'archivo': 'VAL14.xlsx', 'contenido_b64': b64(v2)})
    paso(r.status_code == 201 and r.get_json()['version'] == 2, 'versión 2', r.get_json())
    j = cli.get(ruta + '?project=' + frente, headers=miembro).get_json()
    paso(base64.b64decode(j['vigente']['contenido_b64']) == v2 and [v['vigente'] for v in j['versiones']] == [True, False],
         'la vigente es la 2; la 1 queda en el historial', [(v['version'], v['vigente']) for v in j['versiones']])

    titulo('5 · LO QUE NO ES UN EXCEL')
    for nombre, datos, por in (('VAL.pdf', v2, 'extensión'), ('VAL.xlsx', b'%PDF-1.7 no soy un excel', 'contenido'),
                               ('VAL.xlsx', b'', 'vacío')):
        r = cli.post(ruta, headers=jefa, json={'project': frente, 'archivo': nombre, 'contenido_b64': b64(datos)})
        paso(r.status_code == 400 and r.get_json().get('code') == 'INVALID_EXCEL', 'rechazado por %s' % por, r.get_json().get('error'))
    r = cli.post(ruta, headers=jefa, json={'project': frente, 'archivo': 'VAL.xlsx', 'contenido_b64': '###'})
    paso(r.status_code == 400, 'base64 roto: rechazado', r.status_code)

    titulo('6 · QUITAR')
    r = cli.delete(ruta + '?project=' + frente, headers=miembro)
    paso(r.status_code == 403, 'el miembro no puede quitar', r.status_code)
    r = cli.delete(ruta + '?project=' + frente, headers=jefa)
    paso(r.status_code == 200 and r.get_json()['quitada'] == 2, 'la administradora quita la 2', r.get_json())
    j = cli.get(ruta + '?project=' + frente, headers=miembro).get_json()
    paso(j['vigente'] is None and len(j['versiones']) == 2, 'sin vigente; las dos siguen en el historial', len(j['versiones']))

    titulo('7 · LA BASE NO DEJA BORRAR NI REESCRIBIR (ecd_app)')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for sql, que in (("DELETE FROM planilla_valorizaciones WHERE project_id = %s", 'borrar'),
                         ("UPDATE planilla_valorizaciones SET contenido = '\\x00' WHERE project_id = %s", 'reescribir el Excel')):
            try:
                cur.execute(sql, (A,))
                conn.rollback()
                paso(False, 'no se puede %s' % que, 'se pudo')
            except Exception as e:
                conn.rollback()
                paso('permission denied' in str(e) or 'permiso denegado' in str(e), 'no se puede %s' % que, str(e).splitlines()[0])

    print('\n%d de %d' % (sum(_pasos), len(_pasos)))
    return 0 if all(_pasos) else 1


if __name__ == '__main__':
    sys.exit(main())
