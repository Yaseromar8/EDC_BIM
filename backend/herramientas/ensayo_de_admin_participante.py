# -*- coding: utf-8 -*-
"""REVIEWS · E1.1 · el administrador de la entidad como participante, contra PostgreSQL.

QUE DEMUESTRA
-------------
Con la aplicacion real (`server.app`), sesiones reales de usuarios ficticios y
ENFORCE encendido --sin dobles de ninguna validacion--:

  H1  antes de participar, el alta con el administrador de revisor da 400
      REVISOR_FUERA_DE_LA_OBRA, y el mensaje ya lleva tildes (H4)
  A1  el administrador sale como candidato, se incorpora, aparece en `/miembros`
      --que pide un miembro corriente-- y deja de ser candidato; una cuenta
      retirada no sale en ninguna de las dos listas
  AC  participar NO le quita nada: antes, durante y despues sigue administrando la
      obra y atraviesa los permisos de carpeta
  A2  ya participante: el alta con el de revisor funciona, la revision queda ACTIVA,
      le toca, la ve en Mi Trabajo y su conformidad pasa por `/act`
  A3  «Guardar accesos» con una lista que no lo trae NO le borra la participacion;
      retirarlo desde Participantes SI, y entonces su revision queda BLOQUEADA con el
      motivo de siempre, ya con tildes

QUE NO TOCA
-----------
Se niega a arrancar si `DB_NAME` no parece desechable o si hay `DATABASE_URL`. No lee
ningun `.env`. Vacia las variables de correo y de servicios externos y arranca con el
perfil `portal`. No inserta revisiones por SQL: todas nacen por la ruta de alta. Todo
lleva el prefijo `zz_e11_<hora>` y NO se borra (`activity_log` es de solo insercion).

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app DB_PASS=<...> \
        python herramientas/ensayo_de_admin_participante.py
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

PREFIJO = 'zz_e11_'
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
    import administracion_de_obra as adm
    import file_system_db as fsd
    import permiso_documental as pd
    import referencias_de_obra as ref

    obra = PREFIJO + 'obra_' + RUN
    U = {}

    # ── MONTAJE ────────────────────────────────────────────────────────────
    _titulo('MONTAJE · una obra, dos miembros, un administrador sin participar')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO projects (id, name, model_urn, status) "
                    "VALUES (%s,%s,%s,'active')", (obra, 'ZZ E1.1 ' + obra, obra))
        ref.registrar_obra(cur, obra, nombre='ZZ E1.1 ' + obra, model_urn=obra,
                           origen='ensayo del administrador participante')

        def usuario(clave, miembro=True, rol='editor', activo=True):
            correo = '%s%s_%s@ensayo.test' % (PREFIJO, clave, RUN)
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, "
                        "  activated_at) VALUES (%s,%s,'x',%s,%s,CURRENT_TIMESTAMP) "
                        "RETURNING id", ('E11 ' + clave, correo, rol, activo))
            uid = cur.fetchone()[0]
            if miembro:
                cur.execute('INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)',
                            (obra, uid))
            U[clave] = {'id': uid, 'email': correo, 'name': 'E11 ' + clave, 'role': rol}

        usuario('autor')
        usuario('r1')
        usuario('admin', miembro=False, rol='admin')
        usuario('retirada', activo=False)
        cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                    "VALUES (%s,'FOLDER','ABIERTA','WIP') RETURNING id::text", (obra,))
        carpeta = cur.fetchone()[0]
        conn.commit()
    db._project_resolver_cache['map'] = None

    def subir(nombre):
        fsd.create_file_record(obra, carpeta, nombre, 1001,
                               '%s%s/%s/v1' % (PREFIJO, RUN, nombre), 'application/pdf',
                               U['autor']['email'], None)
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text, current_version_id::text, version_number FROM file_nodes "
                        " WHERE model_urn=%s AND name=%s AND node_type='FILE'", (obra, nombre))
            f = cur.fetchone()
        return {'node_id': f[0], 'version_id': f[1], 'version': f[2], 'name': nombre}

    D = [subir('E11-%02d.pdf' % n) for n in (1, 2)]
    _paso(all(d['version_id'] for d in D), 'cada documento de ensayo tiene su version vigente')

    T = {k: am.create_session(v['id']) for k, v in U.items() if k != 'retirada'}
    cli = server.app.test_client()

    def pedir(metodo, ruta, quien, **kw):
        r = getattr(cli, metodo)(ruta, headers={'Authorization': 'Bearer ' + T[quien]}, **kw)
        try:
            return r.status_code, r.get_json()
        except Exception:
            return r.status_code, None

    def paso(clave, decision):
        return {'user_id': U[clave]['id'], 'email': U[clave]['email'], 'name': U[clave]['name'],
                'decision': decision}

    def crear(titulo):
        return pedir('post', '/api/reviews', 'autor', json={
            'model_urn': obra, 'title': PREFIJO + titulo, 'final_status': 'SHARED',
            'items': [{'node_id': d['node_id'], 'name': d['name'], 'version': d['version'],
                       'version_id': d['version_id']} for d in D],
            'steps': [paso('admin', 'REVISA'), paso('r1', 'APRUEBA')]})

    def participa(clave):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s',
                        (obra, U[clave]['id']))
            return cur.fetchone() is not None

    def autoridad():
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            return (adm.es_admin_de_obra(cur, U['admin'], obra),
                    pd.permiso_efectivo(cur, U['admin'], obra, carpeta))

    def ids_de(lista):
        return [x.get('id') for x in lista or []]

    # ── H1 · EL DEFECTO, REPRODUCIDO ───────────────────────────────────────
    _titulo('H1 · sin participar, el administrador no puede revisar (y el mensaje se lee)')
    autoridad_antes = autoridad()
    s, b = crear('antes de participar')
    error = (b or {}).get('error') or ''
    _paso(s == 400 and (b or {}).get('code') == 'REVISOR_FUERA_DE_LA_OBRA'
          and 'así que no puede revisar' in error and 'Añádelo a la obra' in error,
          'alta rechazada con REVISOR_FUERA_DE_LA_OBRA y el texto con tildes',
          'http=%s code=%s error=%r' % (s, (b or {}).get('code'), error))

    # ── A1 · INCORPORARLO ──────────────────────────────────────────────────
    _titulo('A1 · candidato, incorporado, en /miembros y ya no candidato')
    s, b = pedir('get', '/api/projects/%s/candidatos' % obra, 'admin')
    candidatos = (b or {}).get('candidatos') or []
    admin_candidato = next((c for c in candidatos if c.get('id') == U['admin']['id']), None)
    _paso(s == 200 and admin_candidato is not None and admin_candidato.get('role') == 'admin'
          and U['autor']['id'] not in ids_de(candidatos)
          and U['retirada']['id'] not in ids_de(candidatos),
          'el administrador es candidato (con su rol); los miembros y la retirada no',
          'http=%s candidatos=%s' % (s, ids_de(candidatos)))
    s, b = pedir('post', '/api/projects/%s/miembros' % obra, 'admin',
                 json={'user_id': U['admin']['id']})
    _paso(s == 200 and (b or {}).get('ya_estaba') is False and participa('admin'),
          'se incorpora: 200 y nace su fila de participacion', 'http=%s cuerpo=%s' % (s, b))
    s, b = pedir('get', '/api/projects/%s/miembros' % obra, 'r1')
    miembros = (b or {}).get('miembros') or []
    fila_admin = next((m for m in miembros if m.get('id') == U['admin']['id']), None)
    _paso(s == 200 and fila_admin is not None and fila_admin.get('role') == 'admin'
          and U['retirada']['id'] not in ids_de(miembros),
          'un miembro corriente lo ve en /miembros (la lista del alta); la retirada no sale',
          'http=%s miembros=%s' % (s, ids_de(miembros)))
    _s, b = pedir('get', '/api/projects/%s/candidatos' % obra, 'admin')
    _paso(U['admin']['id'] not in ids_de((b or {}).get('candidatos')),
          'y deja de ser candidato')

    # ── AC · NO LE QUITA NADA ──────────────────────────────────────────────
    _titulo('AC · participar no reduce la autoridad del administrador')
    autoridad_dentro = autoridad()
    _paso(autoridad_antes == (True, 'admin') and autoridad_dentro == (True, 'admin'),
          'antes y dentro: administra la obra y atraviesa los permisos de carpeta',
          'antes=%s dentro=%s' % (autoridad_antes, autoridad_dentro))

    # ── A2 · REVISA ────────────────────────────────────────────────────────
    _titulo('A2 · ya participante, revisa como cualquiera')
    s, b = crear('con el administrador de revisor')
    rid = (b or {}).get('id')
    _paso(s == 200 and rid, 'el alta con el administrador de revisor funciona',
          'http=%s cuerpo=%s' % (s, b))
    s, b = pedir('get', '/api/reviews/%s' % rid, 'admin')
    rev = (b or {}).get('revision') or {}
    aprobar = (rev.get('acciones') or {}).get('aprobar') or {}
    _paso(s == 200 and rev.get('flujo') == 'ACTIVA' and rev.get('me_toca') is True
          and aprobar.get('disponible') is True and aprobar.get('tipo') == 'conformidad',
          'la revision queda ACTIVA, le toca, y puede dar conformidad',
          'http=%s flujo=%s me_toca=%s aprobar=%s'
          % (s, rev.get('flujo'), rev.get('me_toca'), aprobar))
    s, b = pedir('get', '/api/mi-trabajo', 'admin')
    fila = next((p for p in (b or {}).get('pendientes') or []
                 if p.get('objeto_tipo') == 'REVIEW' and str(p.get('objeto_id')) == str(rid)),
                None)
    _paso(s == 200 and fila is not None and fila.get('project_id') == obra,
          'la ve en Mi Trabajo, con la obra con la que se abre', 'http=%s fila=%s' % (s, fila))
    s, b = pedir('post', '/api/reviews/%s/act' % rid, 'admin',
                 json={'action': 'approve', 'comment': 'ensayo E1.1'})
    _s, b2 = pedir('get', '/api/reviews/%s' % rid, 'r1')
    rev2 = (b2 or {}).get('revision') or {}
    _paso(s == 200 and rev2.get('current_step') == 1 and rev2.get('me_toca') is True,
          'su conformidad pasa por /act y el paso 2 le toca a r1',
          'act=%s paso=%s' % (s, rev2.get('current_step')))

    # ── A3 · GUARDAR ACCESOS Y RETIRAR ─────────────────────────────────────
    _titulo('A3 · «Guardar accesos» no lo borra; retirarlo desde Participantes si')
    s, b = crear('para bloquear al retirarlo')
    rid_b = (b or {}).get('id')
    _paso(s == 200 and rid_b, 'segunda revision con el administrador en el paso actual',
          'http=%s' % s)
    s, b = pedir('post', '/api/projects/%s/users' % obra, 'admin',
                 json={'user_ids': [U['autor']['id'], U['r1']['id']]})
    _paso(s == 200 and participa('admin') and U['admin']['id'] not in ((b or {}).get('salieron') or []),
          'guardar la lista de accesos (que nunca trae administradores) no le borra la fila',
          'http=%s cuerpo=%s participa=%s' % (s, b, participa('admin')))
    s, b = pedir('delete', '/api/projects/%s/miembros/%s' % (obra, U['admin']['id']), 'admin')
    _paso(s == 200 and not participa('admin'), 'retirarlo desde Participantes borra su fila',
          'http=%s' % s)
    s, b = pedir('get', '/api/reviews/%s' % rid_b, 'admin')
    rev_b = (b or {}).get('revision') or {}
    motivo = rev_b.get('flujo_motivo') or ''
    _paso(s == 200 and rev_b.get('flujo') == 'BLOQUEADA'
          and 'ya no pertenece a esta obra, así que nadie puede' in motivo,
          'su revision en curso queda BLOQUEADA, con el motivo con tildes',
          'http=%s flujo=%s motivo=%r' % (s, rev_b.get('flujo'), motivo))
    autoridad_fuera = autoridad()
    _s, b = pedir('get', '/api/projects/%s/candidatos' % obra, 'admin')
    _paso(autoridad_fuera == (True, 'admin')
          and U['admin']['id'] in ids_de((b or {}).get('candidatos')),
          'fuera sigue administrando la obra, y vuelve a ser candidato',
          'fuera=%s' % (autoridad_fuera,))

    total, bien = len(_pasos), sum(1 for ok, _t in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, total))
    return 0 if bien == total else 1


if __name__ == '__main__':
    sys.exit(main())
