# -*- coding: utf-8 -*-
"""REVIEWS · E1.2 · dos revisiones con los mismos documentos, contra PostgreSQL.

QUE DEMUESTRA
-------------
Con la aplicacion real (`server.app`), sesiones reales de usuarios ficticios y ENFORCE
encendido, el bloque C de la guia tal como lo hizo el propietario el 13-sep --T1 y T2
con los MISMOS dos PDF y las mismas dos personas, en orden cruzado--, y lo que corrige
E1.2:

  C   cada acto (C3, C6, C8, C9, C10) cambia solo SU revision: la fila de la otra sale
      identica byte a byte, y «Me toca» y Mi Trabajo dicen lo correcto en cada paso
  A7  H7-A: el detalle y la pregunta del alta nombran las OTRAS revisiones en curso con
      el mismo documento, solo si esa persona puede verlas; una revision terminada
      deja de nombrarse
  AC  H7-A: al cerrar, `acciones` dice si los documentos ya estan en su destino o si
      alguno volveria atras (de Publicado a Compartido), sin impedir nada
  F9  H9: la creacion y el plazo de una revision, y el plazo de Mi Trabajo, salen con
      zona, y son el instante real

QUE NO TOCA
-----------
Se niega a arrancar si `DB_NAME` no parece desechable o si hay `DATABASE_URL`. No lee
ningun `.env`. Vacia las variables de correo y de servicios externos y arranca con el
perfil `portal`. Las revisiones nacen por la ruta de alta y los actos pasan por `/act`;
la unica escritura directa es poner un documento en Publicado, como punto de partida
del caso del retroceso. Todo lleva el prefijo `zz_e12_<hora>` y NO se borra
(`activity_log` es de solo insercion).

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app DB_PASS=<...> \\
        python herramientas/ensayo_de_revisiones_gemelas.py
"""
import datetime as dt
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

PREFIJO = 'zz_e12_'
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


def _instante(texto):
    """El instante de una fecha ISO que trae zona; None si no la trae."""
    try:
        valor = dt.datetime.fromisoformat(texto)
    except (TypeError, ValueError):
        return None
    return valor if valor.tzinfo else None


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
    _titulo('MONTAJE · Tu (administrador que participa), Colega y Tercero; una carpeta reservada')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO projects (id, name, model_urn, status) "
                    "VALUES (%s,%s,%s,'active')", (obra, 'ZZ E1.2 ' + obra, obra))
        ref.registrar_obra(cur, obra, nombre='ZZ E1.2 ' + obra, model_urn=obra,
                           origen='ensayo de revisiones gemelas')

        def usuario(clave, nombre, rol):
            correo = '%s%s_%s@ensayo.test' % (PREFIJO, clave, RUN)
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, "
                        "  activated_at) VALUES (%s,%s,'x',%s,TRUE,CURRENT_TIMESTAMP) "
                        "RETURNING id", (nombre, correo, rol))
            uid = cur.fetchone()[0]
            cur.execute('INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)',
                        (obra, uid))
            U[clave] = {'id': uid, 'email': correo, 'name': nombre, 'role': rol}

        usuario('tu', 'E12 Tu', 'admin')
        usuario('colega', 'E12 Colega', 'editor')
        usuario('tercero', 'E12 Tercero', 'editor')

        def carpeta(nombre):
            cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                        "VALUES (%s,'FOLDER',%s,'WIP') RETURNING id::text", (obra, nombre))
            return cur.fetchone()[0]

        abierta, reservada = carpeta('ABIERTA'), carpeta('RESERVADA')
        conn.commit()
    db._project_resolver_cache['map'] = None
    fp.set_folder_permission(reservada, U['colega']['id'], 'none', U['tu']['id'], obra)

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

    D = [subir(abierta, 'E12-%02d.pdf' % n) for n in (1, 2)]
    DR = subir(reservada, 'E12-RESERVADO.pdf')
    DP = subir(abierta, 'E12-PUBLICADO.pdf')
    n1, n2 = D[0]['name'], D[1]['name']
    _paso(all(d['version_id'] for d in D + [DR, DP]), 'cada documento tiene su version vigente')

    T = {k: am.create_session(v['id']) for k, v in U.items()}
    cli = server.app.test_client()

    def pedir(metodo, ruta, quien, **kw):
        r = getattr(cli, metodo)(ruta, headers={'Authorization': 'Bearer ' + T[quien]}, **kw)
        try:
            return r.status_code, r.get_json()
        except Exception:
            return r.status_code, None

    def paso(clave, decision, dias=None):
        p = {'user_id': U[clave]['id'], 'email': U[clave]['email'], 'name': U[clave]['name'],
             'decision': decision}
        if dias:
            p['dias'] = dias
        return p

    def crear(titulo, docs, pasos, quien='tu'):
        return pedir('post', '/api/reviews', quien, json={
            'model_urn': obra, 'title': titulo, 'final_status': 'SHARED', 'steps': pasos,
            'items': [{'node_id': d['node_id'], 'name': d['name'], 'version': d['version'],
                       'version_id': d['version_id']} for d in docs]})

    def actuar(rid, quien, accion, comentario=''):
        return pedir('post', '/api/reviews/%s/act' % rid, quien,
                     json={'action': accion, 'comment': comentario})

    def crudo(rid):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT status, current_step, steps, history, items FROM doc_reviews '
                        ' WHERE id=%s', (rid,))
            return json.dumps(list(cur.fetchone()), sort_keys=True, default=str)

    def estados(docs):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT name, status FROM file_nodes WHERE id = ANY(%s::uuid[])',
                        ([d['node_id'] for d in docs],))
            return dict(sorted(cur.fetchall()))

    def foto(rid, quien):
        s, b = pedir('get', '/api/reviews/%s?model_urn=%s' % (rid, obra), quien)
        r = (b or {}).get('revision') or {}
        ap = (r.get('acciones') or {}).get('aprobar') or {}
        return {'http': s, 'id': r.get('id'), 'title': r.get('title'), 'status': r.get('status'),
                'paso': r.get('current_step'),
                'aprobar': ap.get('tipo') if ap.get('disponible') else None,
                'ya': sorted(ap.get('ya_en_destino') or []), 'todos': ap.get('todos_en_destino'),
                'retroceden': ap.get('retroceden'),
                'tambien': {it.get('name'): [o['id'] for o in it.get('tambien_en') or []]
                            for it in r.get('items') or [] if 'tambien_en' in it},
                'created_at': r.get('created_at'), 'paso_vence_en': r.get('paso_vence_en')}

    def me_toca(quien):
        _s, b = pedir('get', '/api/reviews?model_urn=%s&filtro=me_toca' % obra, quien)
        return sorted(r['id'] for r in (b or {}).get('reviews') or [])

    def trabajo(quien):
        _s, b = pedir('get', '/api/mi-trabajo', quien)
        return sorted(int(p['objeto_id']) for p in (b or {}).get('pendientes') or []
                      if p.get('objeto_tipo') == 'REVIEW' and p.get('project_id') == obra)

    def en_curso(quien, docs):
        q = '&'.join(['model_urn=%s' % obra] + ['node_id=%s' % d['node_id'] for d in docs])
        s, b = pedir('get', '/api/reviews/en-curso?' + q, quien)
        return s, {nodo: [o['id'] for o in lista]
                   for nodo, lista in ((b or {}).get('documentos') or {}).items()}

    s1, b1 = crear('PRUEBA E1 — T1', D, [paso('tu', 'REVISA', 1), paso('colega', 'APRUEBA')])
    s2, b2 = crear('PRUEBA E1 — T2', D, [paso('colega', 'APRUEBA'), paso('tu', 'APRUEBA')])
    s3, b3 = crear('PRUEBA E1 — T3 (con un reservado)', [D[0], DR],
                   [paso('tercero', 'REVISA'), paso('tu', 'APRUEBA')])
    t1, t2, t3 = (b1 or {}).get('id'), (b2 or {}).get('id'), (b3 or {}).get('id')
    _paso(s1 == 200 and s2 == 200 and s3 == 200 and t1 and t2 and t3,
          'T1 y T2 con los mismos dos PDF; T3 con el PDF 1 y un documento reservado',
          'T1=%s T2=%s T3=%s' % ((s1, t1), (s2, t2), (s3, t3)))
    s, _b = pedir('get', '/api/reviews/%s?model_urn=%s' % (t3, obra), 'colega')
    _paso(s == 403, 'Colega no puede abrir T3', 'http=%s' % s)

    # ── A7 · LOS AVISOS ────────────────────────────────────────────────────
    _titulo('A7 · el detalle y el alta nombran las otras en curso que se pueden ver')
    f_tu, f_col = foto(t1, 'tu'), foto(t1, 'colega')
    _paso(f_tu['tambien'] == {n1: [t3, t2], n2: [t2]},
          'Tu, en T1: el PDF 1 también está en T3 y T2; el PDF 2, en T2', str(f_tu['tambien']))
    _paso(f_col['tambien'] == {n1: [t2], n2: [t2]},
          'Colega, en T1: solo T2; T3 no la puede ver y no se nombra', str(f_col['tambien']))
    s, mapa = en_curso('tu', D)
    _paso(s == 200 and mapa == {D[0]['node_id']: [t3, t2, t1], D[1]['node_id']: [t2, t1]},
          'el alta de Tu, con los dos PDF: el 1 está en T3, T2 y T1; el 2, en T2 y T1', str(mapa))
    s, mapa = en_curso('colega', D)
    _paso(s == 200 and mapa == {D[0]['node_id']: [t2, t1], D[1]['node_id']: [t2, t1]},
          'el alta de Colega no nombra T3', str(mapa))
    s, mapa = en_curso('colega', [DP])
    _paso(s == 200 and mapa == {}, 'un documento que no está en ninguna revisión en curso no avisa',
          'http=%s %s' % (s, mapa))

    # ── F9 · FECHAS CON ZONA ───────────────────────────────────────────────
    _titulo('F9 · las fechas salen con su zona y son el instante real')
    ahora = dt.datetime.now(dt.timezone.utc)
    creada, vence = _instante(f_tu['created_at']), _instante(f_tu['paso_vence_en'])
    _paso(creada is not None and abs(creada - ahora) < dt.timedelta(minutes=10),
          'la creación de T1 trae zona y es el instante real',
          'created_at=%r ahora=%s' % (f_tu['created_at'], ahora.isoformat()))
    _paso(vence is not None and creada is not None
          and abs((vence - creada) - dt.timedelta(days=1)) < dt.timedelta(minutes=2),
          'el plazo del paso 1 (1 día) trae zona y vence un día después de crearse',
          'paso_vence_en=%r' % f_tu['paso_vence_en'])
    _s, b = pedir('get', '/api/reviews?model_urn=%s' % obra, 'tu')
    fila_t1 = next((r for r in (b or {}).get('reviews') or [] if r.get('id') == t1), {})
    _paso(creada is not None and _instante(fila_t1.get('created_at')) == creada,
          'la lista da la misma fecha que el detalle', repr(fila_t1.get('created_at')))
    _s, b = pedir('get', '/api/mi-trabajo', 'tu')
    encargo = next((p for p in (b or {}).get('pendientes') or []
                    if p.get('objeto_tipo') == 'REVIEW' and str(p.get('objeto_id')) == str(t1)), {})
    plazo = _instante(encargo.get('vence_en'))
    _paso(plazo is not None and vence is not None and abs(plazo - vence) < dt.timedelta(seconds=5),
          'Mi Trabajo da el mismo plazo, con zona', repr(encargo.get('vence_en')))

    # ── C · LOS ACTOS DE LA GUIA ───────────────────────────────────────────
    _titulo('C · cada acto cambia solo su revision')
    _paso(me_toca('tu') == [t1] and me_toca('colega') == [t2]
          and trabajo('tu') == [t1] and trabajo('colega') == [t2],
          'al empezar: «Me toca» y Mi Trabajo son T1 para Tu y T2 para Colega')

    antes = crudo(t2)
    s, _b = actuar(t1, 'tu', 'approve', 'C3 conformidad')
    _paso(s == 200 and foto(t1, 'tu')['paso'] == 1 and crudo(t2) == antes,
          'C3 · Tu das conformidad en T1: pasa al paso 2 y T2 no cambia', 'http=%s' % s)
    _paso(me_toca('colega') == sorted([t1, t2]) and trabajo('colega') == sorted([t1, t2])
          and me_toca('tu') == [],
          'desde ahí Colega tiene las dos pendientes, que es lo que pide la guía')

    antes = crudo(t1)
    s, _b = actuar(t2, 'colega', 'approve', 'C6 aprobacion')
    _paso(s == 200 and foto(t2, 'tu')['aprobar'] == 'aprobar_y_cerrar' and crudo(t1) == antes,
          'C6 · Colega aprueba T2: pasa a tu paso y T1 no cambia', 'http=%s' % s)

    antes = crudo(t1)
    s, _b = actuar(t2, 'tu', 'approve', 'C8 cierre')
    _paso(s == 200 and foto(t2, 'tu')['status'] == 'approved' and crudo(t1) == antes
          and all(v == 'SHARED' for v in estados(D).values()),
          'C8 · Tu cierras T2: aprobada, sus PDF en Compartido y T1 no cambia',
          'http=%s docs=%s' % (s, estados(D)))

    f_col = foto(t1, 'colega')
    _paso(f_col['aprobar'] == 'aprobar_y_cerrar' and f_col['todos'] is True
          and f_col['ya'] == sorted([n1, n2]) and f_col['retroceden'] == [],
          'AC · a Colega, cerrar T1 le dice que los dos PDF ya están en Compartido, y puede hacerlo',
          str({k: f_col[k] for k in ('aprobar', 'ya', 'todos', 'retroceden')}))
    _paso(f_col['tambien'] == {n1: [], n2: []} and foto(t1, 'tu')['tambien'] == {n1: [t3], n2: []},
          'T2 ya terminó y deja de nombrarse en T1; para Tu sigue T3',
          '%s / %s' % (f_col['tambien'], foto(t1, 'tu')['tambien']))

    antes = crudo(t2)
    s, b = actuar(t2, 'tu', 'approve', 'C9 segundo cierre')
    _paso(s == 409 and crudo(t2) == antes, 'C9 · un segundo cierre de T2 da 409 y no registra nada',
          'http=%s cuerpo=%s' % (s, b))

    antes, docs_antes = crudo(t2), estados(D)
    s, _b = actuar(t1, 'colega', 'reject', 'C10 rechazo')
    _paso(s == 200 and foto(t1, 'colega')['status'] == 'rejected' and crudo(t2) == antes
          and estados(D) == docs_antes,
          'C10 · Colega rechaza T1: rechazada; T2 y los PDF no cambian', 'http=%s' % s)
    _paso(me_toca('tu') == [] and me_toca('colega') == [] and trabajo('tu') == []
          and trabajo('colega') == [],
          'al final ni Tu ni Colega tienen nada pendiente')

    # ── AC · EL RETROCESO SE AVISA, NO SE IMPIDE ───────────────────────────
    _titulo('AC · cerrar avisa si un documento volvería atrás')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE file_nodes SET status = 'PUBLISHED' WHERE id = %s::uuid",
                    (DP['node_id'],))
        conn.commit()
    s, b = crear('PRUEBA E1 — T4 (documento publicado)', [DP],
                 [paso('tu', 'REVISA'), paso('colega', 'APRUEBA')])
    t4 = (b or {}).get('id')
    sa, _b = actuar(t4, 'tu', 'approve', 'conformidad')
    f4 = foto(t4, 'colega')
    _paso(s == 200 and sa == 200 and f4['aprobar'] == 'aprobar_y_cerrar'
          and f4['retroceden'] == [{'name': DP['name'], 'estado': 'PUBLISHED'}]
          and f4['todos'] is False and f4['ya'] == [],
          'a Colega, cerrar T4 le avisa de que el PDF está en Publicado y volvería a Compartido',
          str({k: f4[k] for k in ('aprobar', 'ya', 'todos', 'retroceden')}))
    antes = estados([DP])
    sr, _b = actuar(t4, 'colega', 'reject', 'no lo devuelvo a Compartido')
    _paso(sr == 200 and estados([DP]) == antes, 'Colega rechaza T4 y el PDF sigue en Publicado',
          'http=%s docs=%s' % (sr, estados([DP])))

    total, bien = len(_pasos), sum(1 for ok, _t in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, total))
    return 0 if bien == total else 1


if __name__ == '__main__':
    sys.exit(main())
