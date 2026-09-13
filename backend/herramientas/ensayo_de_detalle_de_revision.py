# -*- coding: utf-8 -*-
"""REVIEWS · E1 · el detalle de una revision y el listado filtrado, contra PostgreSQL.

QUE DEMUESTRA
-------------
Con la aplicacion real (`server.app`), sesiones reales de usuarios ficticios, la
politica documental de siempre y ENFORCE encendido --sin dobles de ninguna
validacion--:

  D1  el detalle abre por su id y trae codigo, obra, pasos, papel, plazo e historial
  D2  a quien le toca: conformidad (REVISA) y, tras ella, «aprobar y cerrar» para el
      APRUEBA final; quien no es el revisor --aunque administre la obra-- no ve actos
  D3  LO QUE `acciones` OFRECE, `/act` LO ACEPTA; LO QUE NIEGA, `/act` LO RECHAZA y no
      cambia nada
  D4  una version nueva despues del alta: el detalle la marca, apaga «aprobar y cerrar»
      con su motivo y `/act` responde 409 sin cambios
  D5  revision BLOQUEADA por perdida de acceso: solo el administrador GLOBAL ve
      «sustituir», y `/reasignar` coincide (el administrador de obra recibe 403)
  D6  puertas: sin permiso documental 403 sin titulo ni nombres; ajeno a la obra 403;
      ambito de otra obra 404; inexistente 404
  D7  abrir el detalle no escribe nada
  L1  filtros me_toca, en_curso, bloqueadas, terminadas, iniciadas_por_mi y todas
  L2  paginas por cursor sin repetir ni saltar, llenas salvo la ultima, sin revisiones
      ni nombres que quien pide no puede ver
  M1  Mi Trabajo da la obra y la revision con las que se abre el detalle

QUE NO TOCA
-----------
Se niega a arrancar si `DB_NAME` no parece desechable o si hay `DATABASE_URL`. No lee
ningun `.env`. Vacia las variables de correo y de servicios externos y arranca con el
perfil `portal`. No inserta revisiones por SQL: todas nacen por la ruta de alta. Todo
lleva el prefijo `zz_e1_<hora>` y NO se borra (`activity_log` es de solo insercion).

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app DB_PASS=<...> \
        python herramientas/ensayo_de_detalle_de_revision.py
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

PREFIJO = 'zz_e1_'
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
    import file_system_db as fsd
    import folder_permissions as fp
    import referencias_de_obra as ref

    obra, obra2 = PREFIJO + 'obra_' + RUN, PREFIJO + 'otra_' + RUN
    U, F = {}, {}

    # ── MONTAJE ────────────────────────────────────────────────────────────
    _titulo('MONTAJE · dos obras, carpeta reservada y de bloqueo, usuarios ficticios')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for o in (obra, obra2):
            cur.execute("INSERT INTO projects (id, name, model_urn, status) "
                        "VALUES (%s,%s,%s,'active')", (o, 'ZZ E1 ' + o, o))
            ref.registrar_obra(cur, o, nombre='ZZ E1 ' + o, model_urn=o,
                               origen='ensayo del detalle de revision')

        def usuario(clave, miembro=True, admin=False, rol='editor'):
            correo = '%s%s_%s@ensayo.test' % (PREFIJO, clave, RUN)
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, "
                        "  activated_at) VALUES (%s,%s,'x',%s,TRUE,CURRENT_TIMESTAMP) "
                        "RETURNING id", ('E1 ' + clave, correo, rol))
            uid = cur.fetchone()[0]
            if miembro:
                cur.execute('INSERT INTO project_users (project_id, user_id, es_admin) '
                            'VALUES (%s,%s,%s)', (obra, uid, admin))
            U[clave] = {'id': uid, 'email': correo, 'name': 'E1 ' + clave}

        for clave in ('autor', 'r1', 'r2', 'r3', 'sin'):
            usuario(clave)
        usuario('fuera', miembro=False)
        usuario('admin', admin=True)
        usuario('admin_global', rol='admin')
        # El autor tambien es miembro de la OTRA obra: asi la puerta que se mide es la
        # de la ruta («esa revision es de otra obra») y no la de membresia.
        cur.execute('INSERT INTO project_users (project_id, user_id, es_admin) '
                    'VALUES (%s,%s,FALSE)', (obra2, U['autor']['id']))

        def carpeta(o, nombre):
            cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                        "VALUES (%s,'FOLDER',%s,'WIP') RETURNING id::text", (o, nombre))
            return cur.fetchone()[0]

        F['abierta'] = carpeta(obra, 'ABIERTA')
        F['reservada'] = carpeta(obra, 'RESERVADA')
        F['bloqueo'] = carpeta(obra, 'BLOQUEO')
        conn.commit()
    db._project_resolver_cache['map'] = None
    fp.set_folder_permission(F['reservada'], U['sin']['id'], 'none', U['admin']['id'], obra)

    def documento(nombre):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text, current_version_id::text, version_number FROM file_nodes "
                        " WHERE model_urn=%s AND name=%s AND node_type='FILE'", (obra, nombre))
            f = cur.fetchone()
        return {'node_id': f[0], 'version_id': f[1], 'version': f[2], 'name': nombre}

    def subir(carpeta_id, nombre, v=1):
        fsd.create_file_record(obra, carpeta_id, nombre, 1000 + v,
                               '%s%s/%s/v%d' % (PREFIJO, RUN, nombre, v), 'application/pdf',
                               U['autor']['email'], None)
        return documento(nombre)

    D = {n: subir(F['abierta'], 'E1-%02d.pdf' % n) for n in range(1, 13)}
    DR = subir(F['reservada'], 'E1-RESERVADO.pdf')
    DB = subir(F['bloqueo'], 'E1-BLOQUEO.pdf')
    _paso(all(d['version_id'] for d in list(D.values()) + [DR, DB]),
          'cada documento de ensayo tiene su version vigente')

    T = {k: am.create_session(v['id']) for k, v in U.items()}
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

    def it(d):
        return {'node_id': d['node_id'], 'name': d['name'], 'version': d['version'],
                'version_id': d['version_id']}

    def crear(titulo, docs, pasos=None):
        s, b = pedir('post', '/api/reviews', 'autor', json={
            'model_urn': obra, 'title': PREFIJO + titulo, 'items': [it(d) for d in docs],
            'final_status': 'SHARED',
            'steps': pasos or [paso('r1', 'REVISA'), paso('r2', 'APRUEBA')]})
        if s != 200:
            print('     alta fallida %s: %s %s' % (titulo, s, b))
        return (b or {}).get('id')

    def detalle(rid, quien, ambito=None):
        ruta = '/api/reviews/%s' % rid + (('?model_urn=%s' % ambito) if ambito else '')
        return pedir('get', ruta, quien)

    def actuar(rid, quien, accion='approve'):
        return pedir('post', '/api/reviews/%s/act' % rid, quien,
                     json={'action': accion, 'comment': 'ensayo E1'})

    def listado(quien, **query):
        query.setdefault('model_urn', obra)
        q = '&'.join('%s=%s' % kv for kv in query.items())
        return pedir('get', '/api/reviews?' + q, quien)

    def ids(quien, **query):
        s, b = listado(quien, **query)
        return s, [r['id'] for r in (b or {}).get('reviews') or []], b

    def huella(rid):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT status, current_step, steps::text, history::text, "
                        "       COALESCE(paso_vence_en::text,''), COALESCE(cerrada_en::text,'') "
                        "  FROM doc_reviews WHERE id=%s", (rid,))
            fila = cur.fetchone()
            cur.execute("SELECT id, estado FROM encargos WHERE objeto_tipo='REVIEW' "
                        "   AND objeto_id=%s ORDER BY id", (str(rid),))
            encargos = cur.fetchall()
            cur.execute("SELECT count(*) FROM activity_log WHERE entity_type='review' "
                        "   AND entity_id=%s", (str(rid),))
            actividad = cur.fetchone()[0]
        return repr((fila, encargos, actividad))

    # ── ALTAS ──────────────────────────────────────────────────────────────
    _titulo('ALTAS · todas por la ruta de alta')
    rid_a = crear('A dos pasos', [D[1], D[2]])
    rid_res = crear('reservada · ' + DR['name'], [DR])
    rid_cerrada = crear('C para cerrar', [D[3]])
    rid_rechazada = crear('R para rechazar', [D[4]])
    rid_version = crear('V version nueva', [D[5]])
    rid_bloq = crear('B bloqueo', [DB], [paso('r3', 'REVISA'), paso('r2', 'APRUEBA')])
    relleno = [crear('relleno %d' % n, [D[5 + n]]) for n in range(1, 6)]
    todas = [rid_a, rid_res, rid_cerrada, rid_rechazada, rid_version, rid_bloq] + relleno
    _paso(all(todas), 'nacen %d revisiones AUTORIDAD_TERMINAL' % len(todas))
    actuar(rid_cerrada, 'r1')
    s_c, _b = actuar(rid_cerrada, 'r2')
    s_r, _b = actuar(rid_rechazada, 'r1', 'reject')
    _paso(s_c == 200 and s_r == 200, 'una cerrada aprobada y otra rechazada por la via de siempre',
          'cierre=%s rechazo=%s' % (s_c, s_r))

    # ── D1 · DETALLE ───────────────────────────────────────────────────────
    _titulo('D1 · el detalle trae lo que se va a ensenar')
    s, b = detalle(rid_a, 'autor')
    rev = (b or {}).get('revision') or {}
    pasos = rev.get('pasos') or []
    _paso(s == 200 and rev.get('codigo') == 'RV-%03d' % rid_a and rev.get('obra_id') == obra,
          'codigo RV y obra del enlace', 'http=%s codigo=%s obra=%s'
          % (s, rev.get('codigo'), rev.get('obra_id')))
    _paso([p.get('estado') for p in pasos] == ['actual', 'pendiente']
          and [p.get('decision') for p in pasos] == ['REVISA', 'APRUEBA']
          and pasos and pasos[1].get('terminal') is True
          and pasos[0].get('persona') == U['r1']['name'],
          'pasos con estado, papel declarado, responsable y ultimo marcado')
    eventos = [h.get('event') for h in rev.get('history') or []]
    _paso(eventos[:2] == ['created', 'step_started']
          and all(i.get('es_version_vigente') is True for i in rev.get('items') or []),
          'historial desde el alta y versiones vigentes marcadas', 'eventos=%s' % eventos)

    # ── D2 / D3 · A QUIEN LE TOCA, Y /act COINCIDE ─────────────────────────
    _titulo('D2 / D3 · acciones por actor, y /act dice lo mismo')

    def acciones(rid, quien):
        _s, b = detalle(rid, quien)
        return ((b or {}).get('revision') or {}).get('acciones') or {}

    no_revisor = []
    for quien in ('autor', 'r2', 'admin', 'admin_global'):
        a = acciones(rid_a, quien)
        antes = huella(rid_a)
        s_apr, _b = actuar(rid_a, quien, 'approve')
        s_rec, _b = actuar(rid_a, quien, 'reject')
        no_revisor.append((quien, a.get('aprobar', {}).get('disponible'),
                           a.get('rechazar', {}).get('disponible'), s_apr, s_rec,
                           antes == huella(rid_a)))
    _paso(all(not ap and not rc and s1 >= 400 and s2 >= 400 and igual
              for _q, ap, rc, s1, s2, igual in no_revisor),
          'quien no es el revisor (autor, aprobador, admin de obra, admin global): '
          'sin botones, y /act lo rechaza sin cambiar nada',
          '; '.join('%s ap=%s rc=%s act=%s/%s igual=%s' % x for x in no_revisor))

    a_r1 = acciones(rid_a, 'r1')
    _paso(a_r1.get('aprobar', {}).get('disponible') is True
          and a_r1['aprobar'].get('tipo') == 'conformidad'
          and (a_r1['aprobar'].get('siguiente_paso') or {}).get('persona') == U['r2']['name']
          and a_r1.get('rechazar', {}).get('disponible') is True,
          'r1 (REVISA): «Dar conformidad», pasa al paso 2 de r2, y puede rechazar',
          json.dumps(a_r1, ensure_ascii=False))
    s, _b = actuar(rid_a, 'r1', 'approve')
    _paso(s == 200, 'y /act acepta la conformidad', 'http=%s' % s)
    a_r2 = acciones(rid_a, 'r2')
    a_r1b = acciones(rid_a, 'r1')
    _paso(a_r2.get('aprobar', {}).get('tipo') == 'aprobar_y_cerrar'
          and a_r2['aprobar'].get('disponible') is True
          and a_r2['aprobar'].get('destino') == 'SHARED'
          and not a_r1b.get('aprobar', {}).get('disponible'),
          'ahora r2 (APRUEBA final): «Aprobar y cerrar» hacia Compartido; r1 ya no actua')

    # ── D4 · VERSION NUEVA ─────────────────────────────────────────────────
    _titulo('D4 · una version nueva apaga el cierre y /act coincide')
    actuar(rid_version, 'r1', 'approve')
    subir(F['abierta'], D[5]['name'], 2)
    s, b = detalle(rid_version, 'r2')
    rev = (b or {}).get('revision') or {}
    a = rev.get('acciones') or {}
    item = (rev.get('items') or [{}])[0]
    antes = huella(rid_version)
    s_act, b_act = actuar(rid_version, 'r2', 'approve')
    _paso(item.get('es_version_vigente') is False and item.get('version_vigente_numero') == 2
          and a.get('aprobar', {}).get('disponible') is False
          and 'versión nueva' in (a.get('aprobar', {}).get('motivo_no') or '')
          and a.get('rechazar', {}).get('disponible') is True
          and s_act == 409 and antes == huella(rid_version),
          'marca «hay v2», apaga aprobar con su motivo, deja rechazar; /act 409 sin cambios',
          'vigente=%s numero=%s disponible=%s act=%s'
          % (item.get('es_version_vigente'), item.get('version_vigente_numero'),
             a.get('aprobar', {}).get('disponible'), s_act))

    # ── D5 · BLOQUEADA ─────────────────────────────────────────────────────
    _titulo('D5 · bloqueada por perdida de acceso: sustituir solo el administrador global')
    fp.set_folder_permission(F['bloqueo'], U['r3']['id'], 'none', U['admin']['id'], obra)
    _s, b_glob = detalle(rid_bloq, 'admin_global')
    _s, b_obra = detalle(rid_bloq, 'admin')
    rev_g = (b_glob or {}).get('revision') or {}
    rev_o = (b_obra or {}).get('revision') or {}
    s_reas_obra, b_reas = pedir('post', '/api/reviews/%s/reasignar' % rid_bloq, 'admin',
                                json={'user_id': U['r1']['id'], 'motivo': 'ensayo E1'})
    _paso(rev_g.get('flujo') == 'BLOQUEADA'
          and (rev_g.get('acciones') or {}).get('sustituir') is True
          and (rev_o.get('acciones') or {}).get('sustituir') is False
          and s_reas_obra == 403 and (b_reas or {}).get('code') == 'SOLO_ADMIN',
          'global ve «sustituir»; el de obra no, y /reasignar le da 403 SOLO_ADMIN',
          'flujo=%s global=%s obra=%s reasignar_obra=%s'
          % (rev_g.get('flujo'), (rev_g.get('acciones') or {}).get('sustituir'),
             (rev_o.get('acciones') or {}).get('sustituir'), s_reas_obra))

    # ── D6 · PUERTAS ───────────────────────────────────────────────────────
    _titulo('D6 · puertas del detalle')
    s, b = detalle(rid_res, 'sin')
    crudo = json.dumps(b, ensure_ascii=False)
    fugas = [t for t in (DR['name'], 'reservada') if t in crudo]
    _paso(s == 403 and (b or {}).get('code') == 'SIN_PERMISO_DOCUMENTAL' and not fugas,
          'sin permiso documental: 403 sin titulo ni nombres', 'http=%s fugas=%s' % (s, fugas))
    s, b = detalle(rid_a, 'fuera')
    _paso(s == 403, 'ajeno a la obra: 403', 'http=%s code=%s' % (s, (b or {}).get('code')))
    s, b = detalle(rid_a, 'autor', ambito=obra2)
    _paso(s == 404 and (b or {}).get('code') == 'REVISION_DE_OTRA_OBRA',
          'pedida desde el ambito de otra obra de la que tambien es miembro: 404 de la ruta',
          'http=%s code=%s' % (s, (b or {}).get('code')))
    s, b = detalle(rid_a, 'r1', ambito=obra2)
    _paso(s == 403,
          'pedida desde el ambito de una obra ajena: la membresia la para antes (403)',
          'http=%s code=%s' % (s, (b or {}).get('code')))
    s, b = detalle(10 ** 9, 'autor')
    _paso(s in (403, 404), 'inexistente: no existe', 'http=%s code=%s'
          % (s, (b or {}).get('code')))

    # ── D7 · SOLO LECTURA ──────────────────────────────────────────────────
    _titulo('D7 · abrir el detalle no escribe nada')
    antes = {rid: huella(rid) for rid in (rid_a, rid_bloq, rid_cerrada)}
    for quien in ('autor', 'r1', 'r2', 'admin', 'admin_global', 'sin'):
        for rid in (rid_a, rid_bloq, rid_cerrada):
            detalle(rid, quien)
            listado(quien)
    _paso(all(antes[rid] == huella(rid) for rid in antes),
          'ni estado, ni historial, ni encargos, ni actividad cambian por mirar')

    # ── L1 · FILTROS ───────────────────────────────────────────────────────
    _titulo('L1 · filtros')
    _s, me_toca_r2, _b = ids('r2', filtro='me_toca')
    _s, me_toca_r1, _b = ids('r1', filtro='me_toca')
    _s, bloqueadas, _b = ids('admin_global', filtro='bloqueadas')
    _s, terminadas, _b = ids('autor', filtro='terminadas')
    _s, en_curso, _b = ids('autor', filtro='en_curso')
    _s, mias, _b = ids('autor', filtro='iniciadas_por_mi')
    _s, de_r1, _b = ids('r1', filtro='iniciadas_por_mi')
    _paso(rid_a in me_toca_r2 and rid_version in me_toca_r2 and rid_a not in me_toca_r1
          and all(r in me_toca_r1 for r in relleno),
          'me_toca: a r2 le tocan A y V; a r1 los rellenos y ya no A',
          'r2=%s r1=%s' % (me_toca_r2, me_toca_r1))
    _paso(bloqueadas == [rid_bloq], 'bloqueadas: solo la bloqueada', '%s' % bloqueadas)
    _paso(set(terminadas) == {rid_cerrada, rid_rechazada}
          and not ({rid_cerrada, rid_rechazada} & set(en_curso))
          and rid_a in en_curso and rid_bloq in en_curso,
          'terminadas y en_curso se reparten sin solaparse',
          'terminadas=%s en_curso=%s' % (terminadas, en_curso))
    _paso(set(todas) <= set(mias) and de_r1 == [],
          'iniciadas_por_mi: las del autor; r1 no inicio ninguna',
          'autor=%d r1=%s' % (len(mias), de_r1))
    s, b = listado('autor', filtro='inventado')
    _paso(s == 400 and (b or {}).get('code') == 'FILTRO_DESCONOCIDO', 'un filtro inventado: 400')

    # ── L2 · PAGINAS ───────────────────────────────────────────────────────
    _titulo('L2 · paginas por cursor, con una revision que no se puede ver')
    s, b = listado('sin')
    visibles = [r['id'] for r in (b or {}).get('reviews') or []]
    paginas, cursor, crudos = [], None, []
    for _ in range(20):
        query = {'limite': '2'}
        if cursor:
            query['antes_de'] = str(cursor)
        s, b = listado('sin', **query)
        crudos.append(json.dumps(b, ensure_ascii=False))
        pagina = [r['id'] for r in (b or {}).get('reviews') or []]
        paginas.append(pagina)
        cursor = (b or {}).get('siguiente')
        if not cursor:
            break
    unidas = [x for p in paginas for x in p]
    fugas = [t for c in crudos for t in (DR['name'],) if t in c]
    _paso(rid_res not in visibles and unidas == visibles and len(set(unidas)) == len(unidas)
          and all(len(p) == 2 for p in paginas[:-1]) and not fugas,
          'las paginas unidas son el listado completo, sin repetir, llenas salvo la ultima, '
          'y sin la reservada ni su nombre',
          'paginas=%s visibles=%s fugas=%s' % (paginas, visibles, fugas))

    # ── M1 · MI TRABAJO ────────────────────────────────────────────────────
    _titulo('M1 · Mi Trabajo abre el detalle')
    s, b = pedir('get', '/api/mi-trabajo', 'r2')
    fila = next((p for p in (b or {}).get('pendientes') or []
                 if p.get('objeto_tipo') == 'REVIEW' and str(p.get('objeto_id')) == str(rid_a)),
                None)
    s_det, b_det = (detalle(fila['objeto_id'], 'r2') if fila else (None, None))
    _paso(bool(fila) and fila.get('project_id') == obra and s_det == 200
          and ((b_det or {}).get('revision') or {}).get('obra_id') == fila.get('project_id'),
          'la fila trae la obra y la revision, y con ellas el detalle abre',
          'fila=%s detalle=%s' % (bool(fila), s_det))

    total, bien = len(_pasos), sum(1 for ok, _t in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, total))
    return 0 if bien == total else 1


if __name__ == '__main__':
    sys.exit(main())
