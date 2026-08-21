# -*- coding: utf-8 -*-
"""El directorio de la obra: persona, empresa y funcion contractual.

LAS CUATRO COSAS SON DISTINTAS, Y ESTE ENSAYO LO DEFIENDE
---------------------------------------------------------
  Persona   un usuario concreto.
  Empresa   a que organizacion pertenece. GLOBAL: `users.company_id`.
  Funcion   ENTIDAD / SUPERVISION / CONTRATISTA / PROYECTISTA / OTRO. Cuelga del
            par (empresa, obra).
  Permiso   lo que la persona PUEDE HACER. Rol del sistema y `folder_permissions`.

QUE DEMUESTRA
-------------
  1. Un participante de una obra NO ve los participantes de otra.
  2. La MISMA empresa tiene funciones DISTINTAS en obras distintas.
  3. Cambiar la funcion contractual NO otorga ningun permiso.
  4. Quitar o cambiar una relacion NO reescribe historicos de RFI, Review ni
     Red Line.
  5. Los selectores de miembros siguen resolviendo identidades correctamente.
  6. La funcion de una PERSONA se DERIVA de su empresa: no hay columna que la
     declare, y por tanto ninguna que pueda contradecirla.
  7. Solo un administrador escribe el directorio.
  8. La empresa de alguien solo se cambia si participa en ESTA obra.

QUE NO TOCA
-----------
Crea todo con prefijo `zz_dir_` y solo borra lo que crea.

    python herramientas/ensayo_de_participantes.py
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_dir_'
OBRA_A = PREFIJO + 'obra_a'
OBRA_B = PREFIJO + 'obra_b'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_rfis WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_redlines WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_reviews WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_companies WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("UPDATE users SET company_id = NULL WHERE email LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM companies WHERE name LIKE %s", (PREFIJO + '%',))


def cliente(usuario):
    """App con los blueprints REALES. Se construye antes de cada peticion:
    `validate_session` es una global del modulo y solo vale la ultima."""
    from flask import Flask
    import auth_middleware as am
    import routes.directorio as d

    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    app.register_blueprint(d.directorio_bp)
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
    import directorio_de_obra as dir_obra
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DEL DIRECTORIO DE LA OBRA')
    print('=' * 76)

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None

        cur.execute("SELECT id FROM hubs LIMIT 1")
        hub = (cur.fetchone() or [None])[0]
        for obra, nombre in ((OBRA_A, 'ZZ DIR A'), (OBRA_B, 'ZZ DIR B')):
            cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                        "VALUES (%s,%s,%s,%s,'active')", (obra, hub, nombre, obra))
            ref.registrar_obra(cur, obra, nombre=nombre, model_urn=obra,
                               origen='ensayo de participantes')

        # UNA empresa, DOS obras. Es el caso que da sentido a la tabla.
        cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id",
                    (PREFIJO + 'SINOHYDRO',))
        emp = cur.fetchone()[0]
        cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id",
                    (PREFIJO + 'SUPERVISORA',))
        emp2 = cur.fetchone()[0]

        def usuario(nombre, correo, rol, obras, company=None):
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, "
                        "  company_id) VALUES (%s,%s,'x',%s,TRUE,%s) RETURNING id",
                        (nombre, PREFIJO + correo, rol, company))
            uid = cur.fetchone()[0]
            for o in obras:
                cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                            (o, uid))
            return uid

        g = {
            'jefa':      usuario('Jefa', 'jefa@e.test', 'admin', [OBRA_A, OBRA_B]),
            'residente': usuario('Residente', 'resi@e.test', 'editor', [OBRA_A], emp),
            'obrero':    usuario('Obrero', 'obre@e.test', 'viewer', [OBRA_A], emp),
            'ajeno':     usuario('Ajeno', 'ajen@e.test', 'editor', [OBRA_B], emp),
            'sinempresa': usuario('Sin Empresa', 'sine@e.test', 'editor', [OBRA_A]),
        }
        conn.commit()
        db._project_resolver_cache['map'] = None

        def como(quien):
            correos = {'jefa': 'jefa', 'residente': 'resi', 'obrero': 'obre',
                       'ajeno': 'ajen', 'sinempresa': 'sine'}
            roles = {'jefa': 'admin', 'residente': 'editor', 'obrero': 'viewer',
                     'ajeno': 'editor', 'sinempresa': 'editor'}
            return cliente({'id': g[quien], 'email': PREFIJO + correos[quien] + '@e.test',
                            'name': quien.capitalize(), 'role': roles[quien]})

        print()
        print('1 · UN PARTICIPANTE DE UNA OBRA NO VE LOS DE OTRA')
        r = como('residente').get('/api/projects/%s/participantes' % OBRA_B)
        _paso(r.status_code in (403, 404),
              'el residente de A NO puede ver los participantes de B',
              'devolvio %s' % r.status_code)
        r = como('residente').get('/api/projects/%s/miembros' % OBRA_B)
        _paso(r.status_code in (403, 404),
              'ni sus miembros', 'devolvio %s' % r.status_code)
        r = como('residente').get('/api/projects/%s/miembros' % OBRA_A)
        _paso(r.status_code == 200, 'pero SI los de la suya')
        ids = {m['id'] for m in (r.get_json() or {}).get('miembros', [])}
        _paso(g['ajeno'] not in ids,
              'y en la lista de A no aparece nadie que solo esta en B',
              '%d miembros' % len(ids))

        print()
        print('2 · LA MISMA EMPRESA, FUNCIONES DISTINTAS EN CADA OBRA')
        r = como('jefa').post('/api/projects/%s/participantes' % OBRA_A,
                              json={'company_id': emp, 'funcion': 'CONTRATISTA'})
        _paso(r.status_code == 200, 'en la obra A es CONTRATISTA', str(r.get_json())[:60])
        r = como('jefa').post('/api/projects/%s/participantes' % OBRA_B,
                              json={'company_id': emp, 'funcion': 'PROYECTISTA'})
        _paso(r.status_code == 200, 'y en la obra B, PROYECTISTA')
        cur.execute("SELECT project_id, funcion FROM project_companies "
                    " WHERE company_id=%s ORDER BY project_id", (emp,))
        filas = dict(cur.fetchall())
        _paso(filas.get(OBRA_A) == 'CONTRATISTA' and filas.get(OBRA_B) == 'PROYECTISTA',
              'las dos conviven: la funcion cuelga del par (empresa, obra)', str(filas))

        print()
        print('3 · LA FUNCION CONTRACTUAL NO OTORGA NINGUN PERMISO')
        # El obrero es `viewer` y su empresa es CONTRATISTA en A. Se le sube la
        # funcion a ENTIDAD -- la mas "alta" que existe -- y nada cambia.
        cur.execute("SELECT role FROM users WHERE id=%s", (g['obrero'],))
        rol_antes = cur.fetchone()[0]
        r = como('obrero').post('/api/projects/%s/participantes' % OBRA_A,
                                json={'company_id': emp, 'funcion': 'ENTIDAD'})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'FORBIDDEN',
              'un no administrador NO puede escribir el directorio',
              'devolvio %s' % r.status_code)
        como('jefa').post('/api/projects/%s/participantes' % OBRA_A,
                          json={'company_id': emp, 'funcion': 'ENTIDAD'})
        cur.execute("SELECT role FROM users WHERE id=%s", (g['obrero'],))
        _paso(cur.fetchone()[0] == rol_antes,
              'su ROL DEL SISTEMA no se ha movido', rol_antes)
        cur.execute("SELECT count(*) FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OBRA_B, g['obrero']))
        _paso(cur.fetchone()[0] == 0,
              'ser ENTIDAD en A no le ha metido en B: la membresia sigue siendo '
              'project_users')
        # Y sigue sin poder escribir el directorio, que es lo que se prueba de verdad.
        r = como('obrero').post('/api/projects/%s/participantes' % OBRA_A,
                                json={'company_id': emp2, 'funcion': 'SUPERVISION'})
        _paso(r.status_code == 403,
              'y con la funcion mas alta sigue sin poder escribir el directorio',
              'devolvio %s' % r.status_code)
        # Restaurar para el resto del ensayo.
        como('jefa').post('/api/projects/%s/participantes' % OBRA_A,
                          json={'company_id': emp, 'funcion': 'CONTRATISTA'})

        print()
        print('4 · QUITAR UNA RELACION NO REESCRIBE NINGUN HISTORICO')
        import json as _json
        cur.execute("INSERT INTO doc_rfis (model_urn, codigo, titulo, estado, responsable, "
                    "  responsable_id, respuesta, created_by, project_id, historial) "
                    "VALUES (%s,'RFI-001','Consulta','Cerrado','Ing. X',%s,'Aceptado',%s,%s,"
                    "  %s::jsonb) RETURNING id::text",
                    (OBRA_A, g['residente'], PREFIJO + 'resi@e.test', OBRA_A,
                     _json.dumps([{'event': 'closed', 'by': PREFIJO + 'resi@e.test'}])))
        rfi = cur.fetchone()[0]
        cur.execute("INSERT INTO doc_redlines (model_urn, codigo, titulo, estado, responsable, "
                    "  responsable_id, respuesta, created_by, project_id) "
                    "VALUES (%s,'RL-001','Reubicar BP-04','Cerrado','Yaser Omar',%s,"
                    "  'Aceptado',%s,%s) RETURNING id::text",
                    (OBRA_A, g['residente'], PREFIJO + 'resi@e.test', OBRA_A))
        rl = cur.fetchone()[0]
        # `doc_reviews` se identifica por `model_urn`, no lleva `project_id`.
        cur.execute("INSERT INTO doc_reviews (model_urn, title, status, items, steps, "
                    "  current_step) VALUES (%s,'Revision','approved',%s::jsonb,%s::jsonb,0) "
                    "RETURNING id::text",
                    (OBRA_A, _json.dumps([{'name': 'PLANO.pdf'}]),
                     _json.dumps([{'user_id': g['residente'], 'name': 'Residente'}])))
        rev = cur.fetchone()[0]
        conn.commit()

        def huella():
            cur.execute("SELECT codigo, estado, responsable, responsable_id, respuesta, "
                        "       historial::text FROM doc_rfis WHERE id::text=%s", (rfi,))
            a = cur.fetchone()
            cur.execute("SELECT codigo, estado, responsable, responsable_id, respuesta "
                        "  FROM doc_redlines WHERE id::text=%s", (rl,))
            b = cur.fetchone()
            cur.execute("SELECT title, status, steps::text, items::text "
                        "  FROM doc_reviews WHERE id::text=%s", (rev,))
            return (a, b, cur.fetchone())

        antes = huella()
        r = como('jefa').post('/api/projects/%s/participantes' % OBRA_A,
                              json={'company_id': emp, 'funcion': 'SUPERVISION'})
        _paso(r.status_code == 200, 'se CAMBIA la funcion de la empresa')
        _paso(huella() == antes, 'RFI, Red Line y Review siguen EXACTAMENTE igual')

        r = como('jefa').delete('/api/projects/%s/participantes/%s' % (OBRA_A, emp))
        _paso(r.status_code == 200, 'se QUITA la empresa del directorio',
              str(r.get_json())[:40])
        _paso(huella() == antes,
              'y los tres historicos siguen EXACTAMENTE igual: el directorio no '
              'es duenno de ningun registro')
        cur.execute("SELECT count(*) FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OBRA_A, g['residente']))
        _paso(cur.fetchone()[0] == 1,
              'quitar la empresa tampoco saca a nadie de la obra')
        # Se restaura para lo que viene.
        como('jefa').post('/api/projects/%s/participantes' % OBRA_A,
                          json={'company_id': emp, 'funcion': 'CONTRATISTA'})

        print()
        print('5 · LOS SELECTORES SIGUEN RESOLVIENDO IDENTIDADES')
        r = como('residente').get('/api/projects/%s/miembros' % OBRA_A)
        miembros = (r.get_json() or {}).get('miembros', [])
        porid = {m['id']: m for m in miembros}
        _paso(r.status_code == 200 and len(miembros) == 4,
              'un NO administrador obtiene los miembros de su obra',
              '%d miembros' % len(miembros))
        _paso(all(m.get('id') and m.get('email') for m in miembros),
              'cada uno con IDENTIDAD, no solo un nombre')
        _paso(porid[g['residente']]['empresa'] == PREFIJO + 'SINOHYDRO'
              and porid[g['residente']]['company_id'] == emp,
              'con su empresa y el id de la empresa',
              str(porid[g['residente']]['empresa']))
        _paso(porid[g['residente']]['funcion'] == 'CONTRATISTA',
              'y la funcion contractual DERIVADA de esa empresa')
        _paso(porid[g['residente']]['role'] == 'editor',
              'y su perfil del sistema, que es OTRA cosa',
              porid[g['residente']]['role'])
        _paso(porid[g['sinempresa']]['empresa'] is None
              and porid[g['sinempresa']]['funcion'] is None,
              'quien no tiene empresa no tiene funcion: no se inventa ninguna')

        print()
        print('6 · LA FUNCION DE UNA PERSONA SE DERIVA, NO SE DECLARA')
        cur.execute("""SELECT count(*) FROM information_schema.columns
                        WHERE table_name = 'project_users'
                          AND column_name IN ('funcion','role','rol')""")
        _paso(cur.fetchone()[0] == 0,
              'no hay ninguna columna en project_users que declare funcion o rol')
        # Se cambia la funcion DE LA EMPRESA y la de la persona cambia sola.
        como('jefa').post('/api/projects/%s/participantes' % OBRA_A,
                          json={'company_id': emp, 'funcion': 'SUPERVISION'})
        _paso(dir_obra.funcion_de(cur, OBRA_A, g['residente']) == 'SUPERVISION',
              'al cambiar la de la empresa, la de la persona cambia sola')
        _paso(dir_obra.funcion_de(cur, OBRA_B, g['ajeno']) == 'PROYECTISTA',
              'y en la otra obra la misma empresa sigue siendo PROYECTISTA')
        como('jefa').post('/api/projects/%s/participantes' % OBRA_A,
                          json={'company_id': emp, 'funcion': 'CONTRATISTA'})

        print()
        print('7 · A QUIEN SE LE PUEDE PONER EMPRESA')
        r = como('residente').patch('/api/projects/%s/miembros/%s' % (OBRA_A, g['sinempresa']),
                                    json={'company_id': emp})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'FORBIDDEN',
              'un no administrador NO puede cambiar la empresa de nadie',
              'devolvio %s' % r.status_code)
        r = como('jefa').patch('/api/projects/%s/miembros/%s' % (OBRA_A, g['ajeno']),
                               json={'company_id': emp2})
        _paso(r.status_code == 404 and (r.get_json() or {}).get('code') == 'NO_ES_MIEMBRO',
              'ni el administrador, si esa persona NO participa en esta obra',
              'devolvio %s' % r.status_code)
        r = como('jefa').patch('/api/projects/%s/miembros/%s' % (OBRA_A, g['sinempresa']),
                               json={'company_id': emp})
        d = r.get_json() or {}
        _paso(r.status_code == 200 and d.get('funcion') == 'CONTRATISTA',
              'al ponerle empresa, la funcion aparece DERIVADA en la respuesta',
              str(d)[:70])
        _paso(d.get('alcance') == 'global',
              'y la respuesta AVISA de que la empresa es global, no de esta obra')
        r = como('jefa').patch('/api/projects/%s/miembros/%s' % (OBRA_A, g['sinempresa']),
                               json={'company_id': 999999})
        _paso(r.status_code == 400, 'una empresa inexistente se rechaza',
              'devolvio %s' % r.status_code)
        r = como('jefa').patch('/api/projects/%s/miembros/%s' % (OBRA_A, g['sinempresa']),
                               json={'company_id': None})
        cur.execute("SELECT company_id FROM users WHERE id=%s", (g['sinempresa'],))
        _paso(r.status_code == 200 and cur.fetchone()[0] is None,
              'y se le puede quitar la empresa con null')

        print()
        print('8 · UN ENCARGO A UNA FUNCION NO METE A NADIE EN LA OBRA')
        gente = dir_obra.usuarios_de_la_funcion(cur, OBRA_A, 'CONTRATISTA')
        ids = {u[0] for u in gente}
        _paso(g['residente'] in ids and g['obrero'] in ids,
              'los CONTRATISTA de A son quienes ademas son miembros de A',
              '%d personas' % len(ids))
        _paso(g['ajeno'] not in ids,
              'y el de la MISMA empresa que solo esta en B queda fuera')

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
