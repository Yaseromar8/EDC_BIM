# -*- coding: utf-8 -*-
"""«EDITAR» SUPRIME Y RESTAURA, contra PostgreSQL.

QUE DEMUESTRA
-------------
Con la aplicacion real (`server.app`), sesiones reales de usuarios ficticios y ENFORCE
encendido, la decision del propietario del 14-sep-2026 (docs/usuarios/03_EDITAR_SUPRIME_Y_RESTAURA.md):

  S  con «Editar» en la carpeta se manda un documento a la papelera y se restaura
  N  con «Ver» no; tampoco en una carpeta donde no se tiene «Editar»
  L  el borrado en lote suprime solo lo que se puede y dice cuanto no
  C  una carpeta se suprime y se restaura con todo su contenido, salvo que dentro haya
     carpetas donde esa persona no llega a «Editar»: entonces se niega, sin tocar nada,
     y la misma carpeta si la suprime o restaura quien si llega
  D  eliminar definitivamente sigue siendo solo del administrador
  T  cada acto queda en el registro de actividad con quien lo hizo

QUE NO TOCA
-----------
Se niega a arrancar si `DB_NAME` no parece desechable o si hay `DATABASE_URL`. No lee
ningun `.env`. Vacia las variables de correo y de servicios externos y arranca con el
perfil `portal`. Obras, carpetas y personas llevan el prefijo `zz_sup_<hora>` y NO se
borran (`activity_log` es de solo insercion).

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app DB_PASS=<...> \\
        python herramientas/ensayo_de_editar_suprime_y_restaura.py
"""
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

PREFIJO = 'zz_sup_'
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


def main():
    if not re.search(r'(test|ensayo|prueba)', os.getenv('DB_NAME') or '', re.I):
        print('ME NIEGO A ARRANCAR: DB_NAME=%r no parece una base desechable.' % (os.getenv('DB_NAME'),))
        return 2
    if os.getenv('DATABASE_URL'):
        print('ME NIEGO A ARRANCAR: DATABASE_URL esta definida y podria mandar sobre DB_NAME.')
        return 2
    for clave in ('RESEND_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'APS_CLIENT_ID',
                  'APS_CLIENT_SECRET', 'REDIS_URL', 'STRICT_ISO_VISIBILITY'):
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
    _titulo('MONTAJE · una obra, carpetas con reglas y cuatro personas')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO projects (id, name, model_urn, status) VALUES (%s,%s,%s,'active')",
                    (obra, 'ZZ SUPRIMIR ' + RUN, obra))
        ref.registrar_obra(cur, obra, nombre='ZZ SUPRIMIR ' + RUN, model_urn=obra,
                           origen='ensayo de editar suprime y restaura')

        def usuario(clave, nombre, rol):
            correo = '%s%s_%s@ensayo.test' % (PREFIJO, clave, RUN)
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, activated_at) "
                        "VALUES (%s,%s,'x',%s,TRUE,CURRENT_TIMESTAMP) RETURNING id", (nombre, correo, rol))
            uid = cur.fetchone()[0]
            cur.execute('INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)', (obra, uid))
            U[clave] = {'id': uid, 'email': correo, 'name': nombre, 'role': rol}

        usuario('tu', 'SUP Tu', 'admin')
        usuario('editora', 'SUP Editora', 'user')
        usuario('editora2', 'SUP Editora2', 'user')
        usuario('lectora', 'SUP Lectora', 'user')
        conn.commit()
    db._project_resolver_cache['map'] = None

    raiz = str(fsd.ensure_project_root_node(obra))
    with db.get_db_connection() as conn:
        cur = conn.cursor()

        def carpeta(nombre, padre):
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, name, is_deleted) "
                        "VALUES (%s,%s,'FOLDER',%s,FALSE) RETURNING id::text", (obra, padre, nombre))
            return cur.fetchone()[0]

        A = carpeta('A', raiz)
        SUB = carpeta('Sub', A)
        PRIVADA = carpeta('Privada', A)
        B = carpeta('B', raiz)
        conn.commit()

    fp.set_folder_permission(A, U['editora']['id'], 'edit', U['tu']['id'], obra)
    fp.set_folder_permission(A, U['editora2']['id'], 'edit', U['tu']['id'], obra)
    fp.set_folder_permission(PRIVADA, U['editora2']['id'], 'none', U['tu']['id'], obra)
    fp.set_folder_permission(A, U['lectora']['id'], 'viewer', U['tu']['id'], obra)

    def subir(padre, nombre):
        fsd.create_file_record(obra, padre, nombre, 1001, '%s%s/%s/v1' % (PREFIJO, RUN, nombre),
                               'application/pdf', U['tu']['email'], None)
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text FROM file_nodes WHERE model_urn=%s AND name=%s AND node_type='FILE'",
                        (obra, nombre))
            return cur.fetchone()[0]

    DOC1, DOC2 = subir(A, 'DOC-1.pdf'), subir(A, 'DOC-2.pdf')
    DOC3, SECRETO, DOCB = subir(SUB, 'DOC-3.pdf'), subir(PRIVADA, 'SECRETO.pdf'), subir(B, 'DOC-B.pdf')
    _paso(all((DOC1, DOC2, DOC3, SECRETO, DOCB)),
          'A (Editora y Editora2: Editar; Lectora: Ver), A/Sub, A/Privada (Editora2: Restringido) y B (sin regla)')

    T = {k: am.create_session(v['id']) for k, v in U.items()}
    cli = server.app.test_client()

    def pedir(metodo, ruta, quien, **kw):
        r = getattr(cli, metodo)(ruta, headers={'Authorization': 'Bearer ' + T[quien]}, **kw)
        try:
            return r.status_code, r.get_json() or {}
        except Exception:
            return r.status_code, {}

    def suprimir(quien, nodo, nombre='x'):
        return pedir('delete', '/api/docs/delete', quien, json={'fullName': nombre, 'id': nodo, 'model_urn': obra})

    def restaurar(quien, nodo):
        return pedir('post', '/api/docs/restore', quien, json={'id': nodo, 'model_urn': obra})

    def borrados(*nodos):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text, is_deleted FROM file_nodes WHERE id::text = ANY(%s)", (list(nodos),))
            estado = dict(cur.fetchall())
        return [estado.get(n) for n in nodos]

    # ── S · UN DOCUMENTO CON «EDITAR» ──────────────────────────────────────
    _titulo('S · con «Editar» se suprime y se restaura un documento')
    s, b = suprimir('editora', DOC1, 'DOC-1.pdf')
    _paso(s == 200 and borrados(DOC1) == [True], 'Editora manda DOC-1 a la papelera', 'http=%s %s' % (s, b))
    s, b = pedir('get', '/api/docs/deleted?model_urn=%s' % obra, 'editora')
    en_papelera = [f.get('id') for f in ((b.get('data') or {}).get('files') or [])]
    _paso(s == 200 and DOC1 in en_papelera, 'y lo ve en la papelera', 'http=%s' % s)
    s, b = restaurar('editora', DOC1)
    _paso(s == 200 and borrados(DOC1) == [False], 'Editora lo restaura', 'http=%s %s' % (s, b))

    # ── N · SIN «EDITAR» ───────────────────────────────────────────────────
    _titulo('N · sin «Editar», no')
    s, b = suprimir('lectora', DOC2, 'DOC-2.pdf')
    _paso(s == 403 and 'Editar' in (b.get('error') or '') and borrados(DOC2) == [False],
          'Lectora (Ver) no suprime DOC-2, y se le dice que hace falta Editar', 'http=%s %s' % (s, b))
    s, b = suprimir('tu', DOC2, 'DOC-2.pdf')
    s2, b2 = restaurar('lectora', DOC2)
    _paso(s == 200 and s2 == 403 and borrados(DOC2) == [True],
          'Tu lo suprime; Lectora no lo puede restaurar', 'http=%s/%s %s' % (s, s2, b2))
    s, b = restaurar('editora', DOC2)
    _paso(s == 200 and borrados(DOC2) == [False], 'Editora si lo restaura', 'http=%s' % s)
    s, b = suprimir('editora', DOCB, 'DOC-B.pdf')
    _paso(s == 403 and borrados(DOCB) == [False], 'en B, donde no tiene Editar, Editora no suprime nada',
          'http=%s %s' % (s, b))

    # ── L · EN LOTE ────────────────────────────────────────────────────────
    _titulo('L · en lote se suprime solo lo que se puede')
    s, b = pedir('post', '/api/docs/batch', 'editora', json={'items': [DOC2, DOCB], 'action': 'DELETE',
                                                            'model_urn': obra})
    _paso(s == 200 and b.get('processed') == 1 and b.get('sin_permiso') == 1
          and borrados(DOC2, DOCB) == [True, False],
          'Editora pide DOC-2 y DOC-B: suprime DOC-2 y dice que 1 quedó sin permiso', 'http=%s %s' % (s, b))
    restaurar('editora', DOC2)

    # ── C · CARPETAS Y SU CONTENIDO ────────────────────────────────────────
    _titulo('C · una carpeta arrastra su contenido')
    s, b = suprimir('editora', SUB, 'A/Sub/')
    _paso(s == 200 and borrados(SUB, DOC3) == [True, True], 'Editora suprime A/Sub y DOC-3 va con ella',
          'http=%s %s' % (s, b))
    s, b = restaurar('editora', SUB)
    _paso(s == 200 and borrados(SUB, DOC3) == [False, False], 'y la restaura con DOC-3', 'http=%s %s' % (s, b))
    s, b = suprimir('editora2', A, 'A/')
    _paso(s == 403 and b.get('code') == 'SUBCARPETAS_SIN_PERMISO' and '«A»' in (b.get('error') or '')
          and 'Privada' not in (b.get('error') or '') and borrados(A, PRIVADA, SECRETO) == [False, False, False],
          'Editora2 no puede suprimir A: dentro está Privada, donde no tiene Editar; no se toca nada',
          'http=%s %s' % (s, b))
    s, b = pedir('post', '/api/docs/batch', 'editora2', json={'items': [A], 'action': 'DELETE', 'model_urn': obra})
    _paso(s == 403 and borrados(A) == [False], 'tampoco en lote', 'http=%s %s' % (s, b))
    s, b = suprimir('editora2', DOC1, 'DOC-1.pdf')
    s2, b2 = restaurar('editora2', DOC1)
    _paso(s == 200 and s2 == 200 and borrados(DOC1) == [False],
          'Editora2 sí suprime y restaura un documento de A', 'http=%s/%s' % (s, s2))
    s, b = suprimir('tu', A, 'A/')
    _paso(s == 200 and borrados(A, SUB, PRIVADA, SECRETO) == [True, True, True, True],
          'Tu suprime A entera', 'http=%s' % s)
    s, b = restaurar('editora2', A)
    _paso(s == 403 and b.get('code') == 'SUBCARPETAS_SIN_PERMISO' and borrados(A) == [True],
          'Editora2 no puede restaurar A por lo mismo', 'http=%s %s' % (s, b))
    s, b = restaurar('editora', A)
    _paso(s == 200 and borrados(A, SUB, PRIVADA, SECRETO) == [False, False, False, False],
          'Editora, que sí llega a Editar en todo A, la restaura entera', 'http=%s %s' % (s, b))

    # ── D · ELIMINAR DEFINITIVAMENTE ───────────────────────────────────────
    _titulo('D · eliminar definitivamente no cambia')
    s, b = pedir('delete', '/api/docs/permanent-delete', 'editora', json={'id': DOC2, 'model_urn': obra})
    _paso(s == 403 and borrados(DOC2) == [False], 'Editora no puede eliminar definitivamente', 'http=%s %s' % (s, b))

    # ── T · TRAZABILIDAD ───────────────────────────────────────────────────
    _titulo('T · queda escrito quién lo hizo')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT action, count(*) FROM activity_log WHERE model_urn = %s AND performed_by = %s "
                    " AND action IN ('delete', 'restore', 'batch_delete') GROUP BY action",
                    (obra, U['editora']['email']))
        actos = dict(cur.fetchall())
    _paso(actos.get('delete', 0) >= 2 and actos.get('restore', 0) >= 3 and actos.get('batch_delete', 0) >= 1,
          'el registro de actividad tiene las supresiones y restauraciones de Editora', str(actos))

    total, bien = len(_pasos), sum(1 for ok, _t in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, total))
    return 0 if bien == total else 1


if __name__ == '__main__':
    sys.exit(main())
