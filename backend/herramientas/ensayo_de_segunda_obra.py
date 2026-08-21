# -*- coding: utf-8 -*-
"""¿Puede convivir una SEGUNDA obra sin cambiar el comportamiento de la primera?

POR QUE ESTE ENSAYO Y NO OTRO
-----------------------------
Es la pregunta que el propio codigo advertia que no se pasaria. `resolve_project_id`
lo decia por escrito antes de arreglarse:

    «el dia que entrara la segunda [obra], la mitad del sistema cambiaria de
     comportamiento a la vez»

Porque el resolutor tenia un atajo: si habia UNA sola obra activa, cualquier
alcance desconocido acababa en ella. Con una obra todo resolvia -- por accidente.
Con dos, no.

QUE COMPRUEBA, CONTRA LA BASE DE VERDAD
---------------------------------------
  1. Los alcances de las obras QUE YA EXISTEN resuelven igual antes y despues de
     crear la segunda obra. Si algo cambia, el aislamiento se logro moviendo el
     suelo.
  2. Cada recurso resuelve a UNA obra, deterministicamente.
  3. Con ENFORCE encendido, un miembro de A no alcanza datos de B.
  4. Y un miembro de B no alcanza datos de A. En los DOS sentidos: comprobar uno
     solo deja pasar un fallo que solo afecte a una direccion.
  5. Lo que no resuelve se NIEGA, no se concede.
  6. Al borrar las obras de ensayo, sus membresias y referencias se van con
     ellas -- que es lo que garantizan las claves ajenas nuevas.

QUE NO TOCA
-----------
Crea DOS obras propias con prefijo `zz_ensayo_`, y solo borra lo que ha creado
el mismo. No modifica ninguna obra, documento, version ni huella existente. Si
encuentra restos de un ensayo anterior, los limpia; nada mas.

    python herramientas/ensayo_de_segunda_obra.py
"""
import importlib
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_ensayo_'
OBRA_A = PREFIJO + 'obra_a'
OBRA_B = PREFIJO + 'obra_b'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto, detalle))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def borrar_las_obras(cur):
    """Borra SOLO las obras del ensayo. NADA MAS -- a proposito.

    El criterio 6 mide si al borrar una obra se van con ella sus membresias y
    referencias. Si esta funcion las borrara tambien, ese criterio pasaria
    siempre y no mediria nada: estaria comprobando su propia limpieza.
    """
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    return cur.rowcount


def limpiar_restos(cur):
    """Al EMPEZAR: barre lo que quedara de una ejecucion anterior.

    Hace falta porque en una base SIN las claves ajenas nuevas, borrar la obra
    deja las membresias huerfanas y el ensayo siguiente choca contra su propia
    basura. Que esta funcion sea necesaria es, en si misma, el problema que las
    claves ajenas cierran.
    """
    borrar_las_obras(cur)
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))


def alcances_existentes(cur):
    """Los alias que ya estan en uso, con la obra a la que resuelven hoy."""
    from db import resolve_project_id
    cur.execute("SELECT alias FROM project_ref WHERE alias NOT LIKE %s ORDER BY alias",
                (PREFIJO + '%',))
    return {a: resolve_project_id(a) for (a,) in cur.fetchall()}


def montar_app(usuario, obras_del_usuario):
    """App minima con el middleware REAL y el resolutor REAL contra la base."""
    from flask import Flask, jsonify
    import auth_middleware as am

    app = Flask(__name__)
    am.init_auth_middleware(app)

    # La sesion se falsea; TODO lo demas -- resolutor, pertenencia, middleware --
    # es el de verdad y consulta la base.
    am.validate_session = lambda t: usuario

    @app.route('/api/docs/listar', methods=['GET'])
    def listar():
        return jsonify({'ok': True})

    @app.route('/api/lob/timeline', methods=['GET'])
    def timeline():
        return jsonify({'ok': True})

    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ensayo'
    return c


def main():
    os.environ['ENFORCE_PROJECT_AUTHZ'] = 'true'
    os.environ['AUTH_POLICY_MODE'] = 'estricto'
    os.environ.setdefault('APP_SECRET', 'x' * 32)

    import db
    importlib.reload(db)
    from db import init_db_pool, get_db_connection
    import referencias_de_obra as ref
    init_db_pool()

    print()
    print('=' * 74)
    print('ENSAYO DE SEGUNDA OBRA')
    print('=' * 74)
    print()

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar_restos(cur)
        conn.commit()

        # ── 1. Como resuelve el sistema HOY, con las obras que ya hay ──────
        db._project_resolver_cache['map'] = None
        antes = alcances_existentes(cur)
        print('Alcances en uso antes del ensayo: %d' % len(antes))
        print()

        # ── 2. Entran DOS obras nuevas ────────────────────────────────────
        cur.execute("SELECT id FROM hubs LIMIT 1")
        fila = cur.fetchone()
        hub = fila[0] if fila else None
        for pid, nombre in ((OBRA_A, 'ZZ Ensayo Obra A'), (OBRA_B, 'ZZ Ensayo Obra B')):
            cur.execute(
                "INSERT INTO projects (id, hub_id, name, model_urn, status) "
                "VALUES (%s, %s, %s, %s, 'active')", (pid, hub, nombre, pid))
            ref.registrar_obra(cur, pid, nombre=nombre, model_urn=pid,
                               origen='ensayo de segunda obra')
        # Un usuario en cada una. Se reutilizan dos usuarios reales cualesquiera
        # que NO sean administradores: el administrador salta la comprobacion a
        # proposito, asi que con el este ensayo no mediria nada.
        cur.execute("SELECT id FROM users WHERE role <> 'admin' ORDER BY id LIMIT 2")
        usuarios = [u for (u,) in cur.fetchall()]
        if len(usuarios) < 2:
            print('  Hacen falta dos usuarios no administradores en la base.')
            return 1
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA_A, usuarios[0]))
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA_B, usuarios[1]))
        conn.commit()
        db._project_resolver_cache['map'] = None

        print('CRITERIO 1 -- la primera obra no cambia de comportamiento')
        despues = alcances_existentes(cur)
        cambiados = {a: (antes[a], despues.get(a)) for a in antes
                     if antes[a] != despues.get(a)}
        _paso(not cambiados,
              'los %d alcances ya existentes resuelven igual que antes' % len(antes),
              '' if not cambiados else 'cambiaron: %s' % list(cambiados.items())[:3])

        print()
        print('CRITERIO 2 -- cada recurso resuelve a UNA obra, deterministicamente')
        from db import resolve_project_id
        _paso(resolve_project_id(OBRA_A) == OBRA_A, 'el alcance de A resuelve a A')
        _paso(resolve_project_id(OBRA_B) == OBRA_B, 'el alcance de B resuelve a B')
        _paso(resolve_project_id(OBRA_A + '_DRENAJE') == OBRA_A,
              'el frente «%s_DRENAJE» resuelve a A' % OBRA_A)
        _paso(resolve_project_id('zz_no_existe_nada') is None,
              'un alcance inventado NO resuelve (no se adivina)')

        print()
        print('CRITERIO 3 y 4 -- aislamiento cruzado, en los DOS sentidos')
        usuario_a = {'id': usuarios[0], 'email': 'a@ensayo', 'role': 'user'}
        usuario_b = {'id': usuarios[1], 'email': 'b@ensayo', 'role': 'user'}

        ca = montar_app(usuario_a, {OBRA_A})
        r = ca.get('/api/docs/listar?project_id=' + OBRA_B)
        _paso(r.status_code == 403, 'el miembro de A NO alcanza los documentos de B',
              'devolvio %s' % r.status_code)
        r = ca.get('/api/docs/listar?project_id=' + OBRA_A)
        _paso(r.status_code == 200, 'el miembro de A SI alcanza los suyos',
              'devolvio %s' % r.status_code)

        cb = montar_app(usuario_b, {OBRA_B})
        r = cb.get('/api/docs/listar?project_id=' + OBRA_A)
        _paso(r.status_code == 403, 'el miembro de B NO alcanza los documentos de A',
              'devolvio %s' % r.status_code)
        r = cb.get('/api/docs/listar?project_id=' + OBRA_B)
        _paso(r.status_code == 200, 'el miembro de B SI alcanza los suyos',
              'devolvio %s' % r.status_code)

        admin = montar_app({'id': 0, 'email': 'admin@ensayo', 'role': 'admin'},
                           {OBRA_A, OBRA_B})
        ra = admin.get('/api/docs/listar?project_id=' + OBRA_A)
        rb = admin.get('/api/docs/listar?project_id=' + OBRA_B)
        _paso(ra.status_code == 200 and rb.status_code == 200,
              'el administrador de la instancia conserva acceso a ambas obras',
              'A=%s B=%s' % (ra.status_code, rb.status_code))

        print()
        print('CRITERIO 5 -- lo que no resuelve se niega')
        r = ca.get('/api/lob/timeline?dataset_id=' + str(uuid.uuid4()))
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'PROJECT_UNRESOLVED',
              'un alcance indeterminable recibe 403 PROJECT_UNRESOLVED',
              'devolvio %s' % r.status_code)

        print()
        print('CRITERIO 6 -- las claves ajenas arrastran lo que cuelga')
        cur.execute("SELECT count(*) FROM project_users WHERE project_id LIKE %s",
                    (PREFIJO + '%',))
        membresias = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM project_ref WHERE project_id LIKE %s",
                    (PREFIJO + '%',))
        refs = cur.fetchone()[0]

        # Antes de juzgar el arrastre, se comprueba que las claves EXISTAN. Si
        # faltan, el fallo no es «el borrado en cascada no funciona» sino «el
        # bootstrap no ha corrido aqui con la identidad de migracion», y son
        # dos cosas muy distintas de arreglar.
        cur.execute("""SELECT conname, convalidated FROM pg_constraint
                        WHERE conname IN ('fk_project_users_project',
                                          'fk_project_users_user',
                                          'fk_projects_hub',
                                          'fk_project_ref_project')""")
        presentes = dict(cur.fetchall())
        faltan = [n for n in ('fk_project_users_project', 'fk_projects_hub',
                              'fk_project_ref_project') if n not in presentes]
        if faltan:
            _paso(False, 'las claves ajenas NO estan en esta base',
                  'faltan %s -- el bootstrap tiene que correr como ecd_migrator'
                  % ', '.join(faltan))
        else:
            _paso(True, 'las %d claves ajenas existen%s' % (
                len(presentes),
                '' if all(presentes.values()) else ' (alguna sin validar)'))

        borrar_las_obras(cur)
        conn.commit()
        cur.execute("SELECT count(*) FROM project_users WHERE project_id LIKE %s",
                    (PREFIJO + '%',))
        quedan_m = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM project_ref WHERE project_id LIKE %s",
                    (PREFIJO + '%',))
        quedan_r = cur.fetchone()[0]
        if faltan:
            # Sin claves ajenas quedan huerfanas: se limpian a mano para no
            # dejar restos del ensayo, y se dice que ese es justamente el
            # agujero que las claves cierran.
            cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
            cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
            conn.commit()
        _paso(membresias == 2 and quedan_m == 0,
              'al borrar las obras, sus %d membresias se van con ellas' % membresias,
              'quedaron %d' % quedan_m)
        _paso(refs > 0 and quedan_r == 0,
              'y sus %d referencias de alias tambien' % refs,
              'quedaron %d' % quedan_r)
        _paso(quedan_m == 0,
              'no queda ninguna membresia huerfana que pueda revivir sobre otra obra')

        db._project_resolver_cache['map'] = None
        final = alcances_existentes(cur)
        _paso(final == antes,
              'y los alcances vuelven a resolver exactamente como al principio')

    fallos = [p for p in _pasos if not p[0]]
    print()
    print('=' * 74)
    print('%d de %d comprobaciones pasan' % (len(_pasos) - len(fallos), len(_pasos)))
    print('=' * 74)
    return 1 if fallos else 0


if __name__ == '__main__':
    raise SystemExit(main())
