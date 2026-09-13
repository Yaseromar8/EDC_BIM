# -*- coding: utf-8 -*-
"""Que version se somete a revision, quien ve cada revision y quien puede actuar
en ella, contra PostgreSQL.

QUE DEMUESTRA
-------------
Con la aplicacion real (`server.app`), sesiones reales de usuarios ficticios y la
politica documental de siempre --sin dobles de ninguna validacion--:

  V1  alta sin version (omitida, null, vacia)   -> 400 VERSION_NO_DECLARADA, sin rastro
  V2  version ajena: de otro documento, que no
      existe, que no es un UUID, de otra obra    -> 400 VERSION_NO_VALIDA, sin nombres
  V3  paquete parcialmente invalido              -> se rechaza entero, sin rastro
  V4  alta valida y cierre valido                -> approved y emite la version fijada
  V5  AUTORIDAD_TERMINAL mal formada YA GUARDADA -> approve 409 ASOCIACION_DOCUMENTAL_INVALIDA
                                                    con CERO mutaciones; reject sigue abierto
  V6  una version nueva tras el alta             -> el cierre se sigue bloqueando
  L1  listado restringido                        -> ni la revision, ni su titulo, ni comentarios
  L2  listado mixto (abierto + reservado)        -> manda el conjunto completo
  L3  quien puede abrirlos la recibe (marcada si su asociacion no se sostiene), el
      administrador de la obra tambien, y el ajeno a la obra sigue con 403
  P1  PRE historica sin version                  -> cierra por posicion, sin `emitido`, sin marca

  QUIEN FIRMA TIENE QUE PODER VER LO QUE FIRMA
  A1  actor asignado sin acceso, paso intermedio
      y final, aprobar y rechazar                -> 403 SIN_PERMISO_DOCUMENTAL y NADA cambia:
                                                    estado, historial, encargos, actividad,
                                                    documentos, emisiones ni avisos
  A2  con permiso de consulta da su conformidad; el cierre final sigue exigiendo lo suyo
  A3  alta manual, alta desde plantilla con alguien sin acceso -> 400, sin rastro
  A4  retirar el acceso deja la revision PENDIENTE y BLOQUEADA; devolverlo, o sustituir
      al revisor por alguien con acceso (administrador, motivo, mismo paso), la desbloquea;
      sustituir por alguien sin acceso -> 400; el administrador no firma por nadie
  A5  Mi Trabajo (global y por obra) y el correo no cuentan el titulo a quien no puede verlo
  A6  el error del cierre no revela el documento restringido
  A7  PRE con actor sin acceso                   -> 403 (la PRE autorizada sigue en P1)
  A8  AT con version INEXISTENTE: sustituir a su aprobador por quien administra la obra
      permite gestionarla, pero aprobar sigue bloqueado por integridad (409, sin emitir,
      sin cambios y sin rellenar la version); rechazar sigue siendo la salida
  A9  el autor que administra no puede sustituirse a si mismo como unico revisor tras la
      perdida de acceso; sustituir por otra persona autorizada sigue funcionando

Las AUTORIDAD_TERMINAL mal formadas, las PRE y las revisiones asignadas a quien no
puede consultar sus documentos se siembran por SQL: el alta corregida ya no las
deja nacer, y lo que se prueba es que filas guardadas ANTES no avanzan ni emiten.
Unico espia: el envio de correo se envuelve para leer lo que saldria, y llama al
original (sin RESEND_API_KEY no sale nada).

QUE NO TOCA
-----------
Se niega a arrancar si `DB_NAME` no parece desechable o si hay `DATABASE_URL`. No
lee ningun `.env`: el entorno lo da quien lo lanza. Vacia las variables de correo
y de servicios externos, y arranca con el perfil `portal`, que no importa el
modulo de IA. Todo lleva el prefijo `zz_vyv_<hora>` y NO se borra: `activity_log`
es de solo insercion para `ecd_app`, asi que cada ejecucion usa nombres nuevos.

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app DB_PASS=<...> \
        python herramientas/ensayo_de_version_y_visibilidad.py
"""
import json
import os
import re
import secrets
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Ningun `.env` entra en este proceso: ni credenciales reales ni otra base.
import dotenv  # noqa: E402
dotenv.load_dotenv = lambda *a, **k: False
try:
    import dotenv.main as _dotenv_main
    _dotenv_main.load_dotenv = dotenv.load_dotenv
except Exception:
    pass

PREFIJO = 'zz_vyv_'
RUN = time.strftime('%H%M%S')

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
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
    import flujo_de_revision as flujo
    import folder_permissions as fp
    import mailer
    import referencias_de_obra as ref
    import routes.reviews as rv

    # El espia del correo: registra lo que saldria y llama al envio de siempre.
    correos = []
    _enviar = mailer.enviar

    def _espia(destino, asunto, titulo, cuerpo, *a, **k):
        correos.append({'destino': destino, 'asunto': asunto, 'cuerpo': cuerpo})
        return _enviar(destino, asunto, titulo, cuerpo, *a, **k)

    mailer.enviar = _espia

    obra, obra2 = PREFIJO + 'obra_' + RUN, PREFIJO + 'otra_' + RUN
    U, F = {}, {}

    # ── MONTAJE ────────────────────────────────────────────────────────────
    _titulo('MONTAJE · dos obras, carpetas reservadas, usuarios ficticios')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for o in (obra, obra2):
            cur.execute("INSERT INTO projects (id, name, model_urn, status) "
                        "VALUES (%s,%s,%s,'active')", (o, 'ZZ VYV ' + o, o))
            ref.registrar_obra(cur, o, nombre='ZZ VYV ' + o, model_urn=o,
                               origen='ensayo de version y visibilidad')

        def usuario(clave, miembro=True, admin=False, rol='editor'):
            correo = '%s%s_%s@ensayo.test' % (PREFIJO, clave, RUN)
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, "
                        "  activated_at) VALUES (%s,%s,'x',%s,TRUE,CURRENT_TIMESTAMP) "
                        "RETURNING id", ('VYV ' + clave, correo, rol))
            uid = cur.fetchone()[0]
            if miembro:
                cur.execute('INSERT INTO project_users (project_id, user_id, es_admin) '
                            'VALUES (%s,%s,%s)', (obra, uid, admin))
            U[clave] = {'id': uid, 'email': correo, 'name': 'VYV ' + clave}

        for clave in ('autor', 'r1', 'r2', 'con', 'sin', 'lector', 'sustituto'):
            usuario(clave)
        usuario('fuera', miembro=False)
        usuario('admin', admin=True)
        usuario('admin_global', rol='admin')

        def carpeta(o, nombre):
            cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                        "VALUES (%s,'FOLDER',%s,'WIP') RETURNING id::text", (o, nombre))
            return cur.fetchone()[0]

        F['abierta'] = carpeta(obra, 'ABIERTA')
        F['reservada'] = carpeta(obra, 'RESERVADA')
        F['reservada_b'] = carpeta(obra, 'RESERVADA_B')
        F['otra'] = carpeta(obra2, 'OTRA')
        conn.commit()
    db._project_resolver_cache['map'] = None
    # `sin` no puede abrir nada de RESERVADA; `lector` solo CONSULTA RESERVADA_B.
    # Las demas reglas las pone y las quita el propio ensayo, en A4 y A9.
    fp.set_folder_permission(F['reservada'], U['sin']['id'], 'none', U['admin']['id'], obra)
    fp.set_folder_permission(F['reservada_b'], U['lector']['id'], 'viewer',
                             U['admin']['id'], obra)

    def regla(carpeta_id, clave, nivel):
        fp.set_folder_permission(F[carpeta_id], U[clave]['id'], nivel, U['admin']['id'], obra)

    def documento(o, nombre):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text, current_version_id::text, status FROM file_nodes "
                        " WHERE model_urn=%s AND name=%s AND node_type='FILE'", (o, nombre))
            f = cur.fetchone()
        return {'node_id': f[0], 'version_id': f[1], 'status': f[2], 'name': nombre}

    def subir(o, carpeta_id, nombre, v=1):
        fsd.create_file_record(o, carpeta_id, nombre, 1000 + v,
                               '%s%s/%s/v%d' % (PREFIJO, RUN, nombre, v), 'application/pdf',
                               U['autor']['email'], None)
        return documento(o, nombre)

    D = {n: subir(obra, F['abierta'], 'VYV-%02d.pdf' % n) for n in range(1, 17)}
    DR1 = subir(obra, F['reservada'], 'VYV-RESERVADO-1.pdf')
    DR2 = subir(obra, F['reservada'], 'VYV-RESERVADO-2.pdf')
    DR3 = subir(obra, F['reservada'], 'VYV-RESERVADO-3.pdf')
    DB = {n: subir(obra, F['reservada_b'], 'VYV-B-%d.pdf' % n) for n in range(1, 6)}
    DZ = subir(obra2, F['otra'], 'VYV-OTRA-OBRA.pdf')
    _paso(all(d['version_id'] for d in list(D.values()) + list(DB.values())
              + [DR1, DR2, DR3, DZ]),
          'cada documento de ensayo tiene su version vigente')

    T = {k: am.create_session(v['id']) for k, v in U.items()}
    cli = server.app.test_client()

    def pedir(metodo, ruta, quien, **kw):
        r = getattr(cli, metodo)(ruta, headers={'Authorization': 'Bearer ' + T[quien]}, **kw)
        try:
            return r.status_code, r.get_json()
        except Exception:
            return r.status_code, None

    def paso(clave, decision=None):
        p = {'user_id': U[clave]['id'], 'email': U[clave]['email'], 'name': U[clave]['name']}
        if decision:
            p['decision'] = decision
        return p

    PASOS = [paso('r1', 'REVISA'), paso('r2', 'APRUEBA')]

    def it(d, **extra):
        base = {'node_id': d['node_id'], 'name': d['name'], 'version': 1,
                'version_id': d['version_id']}
        base.update(extra)
        return base

    def sin_version(d):
        return {'node_id': d['node_id'], 'name': d['name'], 'version': 1}

    def crear_con(titulo, items, pasos, quien='autor', extra=None):
        cuerpo = {'model_urn': obra, 'title': PREFIJO + titulo, 'items': items,
                  'final_status': 'SHARED'}
        if pasos is not None:
            cuerpo['steps'] = pasos
        cuerpo.update(extra or {})
        return pedir('post', '/api/reviews', quien, json=cuerpo)

    def crear(titulo, items, quien='autor'):
        return crear_con(titulo, items, PASOS, quien=quien)

    def actuar(rid, quien, accion='approve', comentario=''):
        return pedir('post', '/api/reviews/%s/act' % rid, quien,
                     json={'action': accion, 'comment': comentario})

    def listado(quien):
        s, b = pedir('get', '/api/reviews?model_urn=%s' % obra, quien)
        return s, b, {r['id']: r for r in (b or {}).get('reviews') or []}

    def trabajo(quien, por_obra=False):
        s, b = pedir('get', '/api/mi-trabajo' + ('?project_id=%s' % obra if por_obra else ''),
                     quien)
        return s, [p for p in (b or {}).get('pendientes') or []
                   if p.get('objeto_tipo') == 'REVIEW' and p.get('project_id') == obra]

    def conteos():
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT count(*) FROM doc_reviews WHERE model_urn=%s', (obra,))
            revisiones = cur.fetchone()[0]
            cur.execute('SELECT count(*) FROM encargos WHERE project_id=%s', (obra,))
            encargos = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM activity_log WHERE model_urn=%s "
                        "   AND action='review_created'", (obra,))
            testigos = cur.fetchone()[0]
        return (revisiones, encargos, testigos)

    def revision(rid):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT status, current_step, history FROM doc_reviews WHERE id=%s', (rid,))
            f = cur.fetchone()
        return {'status': f[0], 'current_step': f[1], 'history': f[2] or []}

    def emisiones(node_id):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COALESCE(file_version_id::text,''), destino FROM file_emisiones "
                        " WHERE file_node_id=%s ORDER BY id", (node_id,))
            return [list(f) for f in cur.fetchall()]

    def huella(rid, nodos):
        """Todo lo que un acto podria tocar, como texto para comparar."""
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT status, current_step, steps::text, history::text, items::text, "
                        "       COALESCE(paso_vence_en::text,''), COALESCE(cerrada_en::text,'') "
                        "  FROM doc_reviews WHERE id=%s", (rid,))
            fila = cur.fetchone()
            cur.execute("SELECT id, destino_usuario, estado, COALESCE(cerrado_en::text,'') "
                        "  FROM encargos WHERE objeto_tipo='REVIEW' AND objeto_id=%s ORDER BY id",
                        (str(rid),))
            encargos = cur.fetchall()
            cur.execute("SELECT count(*) FROM activity_log WHERE entity_type='review' "
                        "   AND entity_id=%s", (str(rid),))
            actividad = cur.fetchone()[0]
            cur.execute("SELECT id::text, status, COALESCE(current_version_id::text,'') "
                        "  FROM file_nodes WHERE id::text = ANY(%s) ORDER BY 1", (list(nodos),))
            documentos = cur.fetchall()
            cur.execute("SELECT count(*) FROM file_emisiones WHERE file_node_id::text = ANY(%s)",
                        (list(nodos),))
            emitidas = cur.fetchone()[0]
        return repr((fila, encargos, actividad, documentos, emitidas))

    def sembrar(titulo, items, pasos, contrato, paso_actual=0):
        """Una revision como las guardadas ANTES de la correccion, con su turno
        abierto por la misma funcion que usa el alta."""
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            historia = [{'event': 'created', 'by': U['autor']['email']}]
            cur.execute(
                "INSERT INTO doc_reviews (model_urn, title, items, steps, current_step, final_status, created_by, history, contrato) "
                "VALUES (%s,%s,%s,%s,%s,'SHARED',%s,%s,%s) RETURNING id",
                (obra, PREFIJO + titulo, json.dumps(items), json.dumps(pasos), paso_actual,
                 U['autor']['email'], json.dumps(historia), contrato))
            rid = cur.fetchone()[0]
            vence, historia = rv._empieza_el_turno(cur, rid, pasos, paso_actual,
                                                   U['autor']['email'], PREFIJO + titulo, historia)
            cur.execute('UPDATE doc_reviews SET paso_vence_en=%s, history=%s WHERE id=%s',
                        (vence, json.dumps(historia), rid))
            conn.commit()
        return rid

    def rechazo(texto, items, codigo, quien='autor', no_debe_decir=()):
        antes = conteos()
        s, b = crear('rechazo ' + texto, items, quien=quien)
        despues = conteos()
        error = (b or {}).get('error') or ''
        dichos = [n for n in no_debe_decir if n in error]
        return _paso(s == 400 and (b or {}).get('code') == codigo and antes == despues
                     and not dichos,
                     '%s -> 400 %s, sin revision, encargo ni testigo' % (texto, codigo),
                     'http=%s code=%s conteos %s -> %s nombres=%s'
                     % (s, (b or {}).get('code'), antes, despues, dichos))

    # ── V1 · ALTA SIN VERSION ──────────────────────────────────────────────
    _titulo('V1 · alta sin version')
    rechazo('version omitida', [sin_version(D[1])], 'VERSION_NO_DECLARADA')
    rechazo('version null', [it(D[1], version_id=None)], 'VERSION_NO_DECLARADA')
    rechazo('version vacia', [it(D[1], version_id='')], 'VERSION_NO_DECLARADA')

    # ── V2 · VERSION AJENA ─────────────────────────────────────────────────
    _titulo('V2 · version que no es de ese documento')
    rechazo('version de otro documento de la obra', [it(D[1], version_id=D[2]['version_id'])],
            'VERSION_NO_VALIDA', no_debe_decir=(D[2]['name'],))
    rechazo('version de un documento reservado', [it(D[1], version_id=DR1['version_id'])],
            'VERSION_NO_VALIDA', no_debe_decir=(DR1['name'],))
    rechazo('version inexistente', [it(D[1], version_id=str(uuid.uuid4()))], 'VERSION_NO_VALIDA')
    rechazo('version que no es un UUID', [it(D[1], version_id='no-es-una-version')],
            'VERSION_NO_VALIDA')
    rechazo('version de un documento de otra obra', [it(D[1], version_id=DZ['version_id'])],
            'VERSION_NO_VALIDA', no_debe_decir=(DZ['name'],))
    rechazo('documento y version de otra obra, pedidos por el administrador de esta',
            [it(DZ)], 'VERSION_NO_VALIDA', quien='admin', no_debe_decir=(DZ['name'],))

    # ── V3 · PAQUETE PARCIALMENTE INVALIDO ─────────────────────────────────
    _titulo('V3 · un documento valido y otro no: no se acepta a medias')
    rechazo('valido + version omitida', [it(D[2]), sin_version(D[1])], 'VERSION_NO_DECLARADA')
    rechazo('valido + version ajena', [it(D[2]), it(D[1], version_id=D[3]['version_id'])],
            'VERSION_NO_VALIDA')

    # ── V4 · ALTA Y CIERRE VALIDOS ─────────────────────────────────────────
    _titulo('V4 · alta valida y cierre valido')
    s, b = crear('valida', [it(D[4])])
    rid_valida = (b or {}).get('id')
    a1 = actuar(rid_valida, 'r1') if rid_valida else (None, None)
    a2 = actuar(rid_valida, 'r2') if rid_valida else (None, None)
    _paso(s == 200 and a1[0] == 200 and a2[0] == 200
          and revision(rid_valida)['status'] == 'approved'
          and [D[4]['version_id'], 'SHARED'] in emisiones(D[4]['node_id']),
          'nace, avanza, cierra y emite la version fijada',
          'alta=%s r1=%s r2=%s' % (s, a1[0], a2[0]))

    # ── V5 · AUTORIDAD_TERMINAL MAL FORMADA YA GUARDADA ────────────────────
    _titulo('V5 · AUTORIDAD_TERMINAL mal formada guardada antes de la correccion')
    malformadas = [
        ('sin version, paso intermedio', [sin_version(D[5])], 0, 'r1', [D[5]]),
        ('version null, paso final', [it(D[6], version_id=None)], 1, 'r2', [D[6]]),
        ('version de otro documento, paso final', [it(D[7], version_id=D[8]['version_id'])], 1,
         'r2', [D[7], D[8]]),
    ]
    rid_ajena = None
    for texto, items, paso_actual, quien, docs in malformadas:
        rid = sembrar('AT ' + texto, items, PASOS, flujo.AUTORIDAD_TERMINAL, paso_actual)
        if 'otro documento' in texto:
            rid_ajena = rid
        nodos = [d['node_id'] for d in docs]
        antes = huella(rid, nodos)
        s, b = actuar(rid, quien, 'approve')
        despues = huella(rid, nodos)
        _paso(s == 409 and (b or {}).get('code') == 'ASOCIACION_DOCUMENTAL_INVALIDA'
              and antes == despues,
              '%s: approve -> 409 y NADA cambia (estado, historial, encargos, '
              'actividad, documentos, emisiones)' % texto,
              'http=%s code=%s mutacion=%s' % (s, (b or {}).get('code'), antes != despues))
    rid_salida = sembrar('AT sin version, se rechaza', [sin_version(D[9])], PASOS,
                         flujo.AUTORIDAD_TERMINAL, 0)
    s, b = actuar(rid_salida, 'r1', 'reject', 'no se sabe que version se reviso')
    _paso(s == 200 and revision(rid_salida)['status'] == 'rejected',
          'y rechazarla sigue siendo posible: es la salida', 'http=%s' % s)

    # ── V6 · UNA VERSION NUEVA SIGUE BLOQUEANDO EL CIERRE ──────────────────
    _titulo('V6 · una version nueva despues del alta')
    s, b = crear('version nueva', [it(D[10])])
    rid_v6 = (b or {}).get('id')
    a1 = actuar(rid_v6, 'r1') if rid_v6 else (None, None)
    subir(obra, F['abierta'], D[10]['name'], 2)
    a2 = actuar(rid_v6, 'r2') if rid_v6 else (None, None)
    _paso(s == 200 and a1[0] == 200 and a2[0] == 409
          and revision(rid_v6)['status'] == 'pending' and emisiones(D[10]['node_id']) == [],
          'el cierre se bloquea con la guarda de siempre y no emite',
          'alta=%s r1=%s r2=%s' % (s, a1[0], a2[0]))

    # ── L · QUIEN VE CADA REVISION ─────────────────────────────────────────
    _titulo('L1 / L2 / L3 · listado')
    s, b = crear('reservada · ' + DR1['name'], [it(DR1)])
    rid_res = (b or {}).get('id')
    actuar(rid_res, 'r1', 'approve', 'comentario reservado sobre ' + DR1['name'])
    s, b = crear('mixta', [it(D[11]), it(DR2)])
    rid_mix = (b or {}).get('id')
    s, b = crear('abierta', [it(D[12])])
    rid_abierta = (b or {}).get('id')
    rid_pre = sembrar('PRE historica', [{'node_id': D[3]['node_id'], 'name': D[3]['name']}],
                      [paso('r1'), paso('r2')], flujo.PRE)

    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, history::text FROM doc_reviews WHERE model_urn=%s ORDER BY id',
                    (obra,))
        filas_antes = cur.fetchall()
    s_sin, b_sin, v_sin = listado('sin')
    s_con, _b, v_con = listado('con')
    s_adm, _b, v_adm = listado('admin')
    s_fuera, b_fuera, _v = listado('fuera')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, history::text FROM doc_reviews WHERE model_urn=%s ORDER BY id',
                    (obra,))
        filas_despues = cur.fetchall()

    crudo = json.dumps(b_sin, ensure_ascii=False)
    fugas = [t for t in (DR1['name'], DR2['name'], 'comentario reservado') if t in crudo]
    _paso(s_sin == 200 and rid_res not in v_sin and not fugas,
          'L1 · sin permiso documental: ni la revision, ni su titulo, ni sus comentarios',
          'visible=%s fugas=%s' % (rid_res in v_sin, fugas))
    _paso(rid_mix not in v_sin and rid_abierta in v_sin,
          'L2 · la mixta no se devuelve; la abierta si: el filtro es por revision',
          'mixta=%s abierta=%s' % (rid_mix in v_sin, rid_abierta in v_sin))
    completa = v_con.get(rid_res) or {}
    _paso(s_con == 200 and all(r in v_con for r in (rid_res, rid_mix, rid_abierta))
          and completa.get('items') and any(h.get('comment') for h in completa.get('history') or []),
          'L3 · quien puede abrirlos recibe las tres, con items e historial')
    marcados = (v_con.get(rid_ajena) or {}).get('items') or []
    _paso(bool(marcados) and all(i.get('asociacion_valida') is False for i in marcados),
          'L3 · la AUTORIDAD_TERMINAL con version ajena llega marcada como asociacion invalida')
    _paso(s_adm == 200 and all(r in v_adm for r in (rid_res, rid_mix, rid_ajena)),
          'L3 · el administrador de la obra ve lo que la politica documental ya le reconoce')
    _paso(s_fuera == 403, 'L3 · el ajeno a la obra sigue con la denegacion existente',
          'http=%s code=%s' % (s_fuera, (b_fuera or {}).get('code')))
    _paso(filas_antes == filas_despues, 'listar no reescribe ninguna revision ni su historial')

    # ── P1 · PRE HISTORICA ─────────────────────────────────────────────────
    _titulo('P1 · PRE historica sin version, con actores autorizados')
    pre_listada = (v_con.get(rid_pre) or {}).get('items') or []
    _paso(bool(pre_listada) and all('asociacion_valida' not in i for i in pre_listada),
          'se lista sin marca: sus items nunca fijaron version')
    p1 = actuar(rid_pre, 'r1')
    p2 = actuar(rid_pre, 'r2')
    fila = revision(rid_pre)
    _paso(p1[0] == 200 and p2[0] == 200 and fila['status'] == 'approved'
          and all('emitido' not in h for h in fila['history'])
          and documento(obra, D[3]['name'])['status'] == 'SHARED',
          'avanza y cierra por posicion, sin `emitido`, y el documento transiciona',
          'r1=%s r2=%s status=%s' % (p1[0], p2[0], fila['status']))

    # ══ A · QUIEN FIRMA TIENE QUE PODER VER LO QUE FIRMA ═══════════════════
    AVISO_SIN_ACCESO = 'no tienes acceso a todos sus documentos'

    def acto_denegado(texto, rid, quien, accion, docs, nombres):
        nodos = [d['node_id'] for d in docs]
        antes, avisos = huella(rid, nodos), len(correos)
        s, b = actuar(rid, quien, accion)
        despues = huella(rid, nodos)
        error = (b or {}).get('error') or ''
        dichos = [n for n in nombres if n in error]
        _paso(s == 403 and (b or {}).get('code') == 'SIN_PERMISO_DOCUMENTAL'
              and AVISO_SIN_ACCESO in error and antes == despues
              and len(correos) == avisos and not dichos,
              texto, 'http=%s code=%s mutacion=%s avisos=%d nombres=%s'
              % (s, (b or {}).get('code'), antes != despues, len(correos) - avisos, dichos))
        return error

    _titulo('A1 · actor asignado sin acceso: ni aprobar ni rechazar, en ningun paso')
    titulo_a1 = 'A1 revision de ' + DR3['name']
    rid_a1_int = sembrar(titulo_a1 + ' (intermedio)', [it(D[13]), it(DR3)],
                         [paso('sin', 'REVISA'), paso('r2', 'APRUEBA')],
                         flujo.AUTORIDAD_TERMINAL, 0)
    rid_a1_fin = sembrar(titulo_a1 + ' (final)', [it(D[14]), it(DR3)],
                         [paso('r1', 'REVISA'), paso('sin', 'APRUEBA')],
                         flujo.AUTORIDAD_TERMINAL, 1)
    reservados = (DR3['name'], titulo_a1)
    for accion in ('approve', 'reject'):
        acto_denegado('paso intermedio · %s -> 403 y NADA cambia (estado, historial, '
                      'encargos, actividad, documentos, emisiones, avisos)' % accion,
                      rid_a1_int, 'sin', accion, [D[13], DR3], reservados)
        acto_denegado('paso final · %s -> 403 y NADA cambia' % accion,
                      rid_a1_fin, 'sin', accion, [D[14], DR3], reservados)

    _titulo('A2 · con acceso sigue su contrato; consultar no es publicar')
    s, b = crear_con('A2 lector revisa', [it(DB[1])],
                     [paso('lector', 'REVISA'), paso('r2', 'APRUEBA')])
    rid_a2 = (b or {}).get('id')
    l1 = actuar(rid_a2, 'lector') if rid_a2 else (None, None)
    emitidos = [h.get('emitido') for h in revision(rid_a2)['history']
                if h.get('event') == 'approve'] if rid_a2 else []
    l2 = actuar(rid_a2, 'r2') if rid_a2 else (None, None)
    _paso(s == 200 and l1[0] == 200 and emitidos == ['CONFORME'] and l2[0] == 200
          and revision(rid_a2)['status'] == 'approved'
          and [DB[1]['version_id'], 'SHARED'] in emisiones(DB[1]['node_id']),
          'quien solo puede consultar da su CONFORME; el aprobador con autoridad cierra y emite',
          'alta=%s lector=%s r2=%s' % (s, l1[0], l2[0]))
    s, b = crear_con('A2 lector aprueba', [it(DB[2])],
                     [paso('r1', 'REVISA'), paso('lector', 'APRUEBA')])
    rid_a2b = (b or {}).get('id')
    r1a = actuar(rid_a2b, 'r1') if rid_a2b else (None, None)
    antes = huella(rid_a2b, [DB[2]['node_id']]) if rid_a2b else ''
    la = actuar(rid_a2b, 'lector') if rid_a2b else (None, None)
    _paso(s == 200 and r1a[0] == 200 and la[0] == 409
          and antes == huella(rid_a2b, [DB[2]['node_id']])
          and revision(rid_a2b)['status'] == 'pending',
          'el cierre final sigue exigiendo permiso de edicion: la guarda de siempre, sin cambios',
          'alta=%s r1=%s lector=%s' % (s, r1a[0], la[0]))

    _titulo('A3 · no se asigna a quien no puede consultar los documentos')

    def alta_rechazada(texto, items, pasos, extra=None):
        antes, avisos = conteos(), len(correos)
        s, b = crear_con(texto, items, pasos, extra=extra)
        error = (b or {}).get('error') or ''
        return _paso(s == 400 and (b or {}).get('code') == 'REVISOR_SIN_ACCESO_DOCUMENTAL'
                     and conteos() == antes and len(correos) == avisos
                     and DR3['name'] not in error,
                     '%s -> 400, sin revision, encargo, testigo ni aviso' % texto,
                     'http=%s code=%s error=%s' % (s, (b or {}).get('code'), error[:80]))

    alta_rechazada('alta manual con un revisor sin acceso', [it(DR3)],
                   [paso('sin', 'REVISA'), paso('r2', 'APRUEBA')])
    alta_rechazada('alta manual con el aprobador final sin acceso', [it(D[15]), it(DR3)],
                   [paso('r1', 'REVISA'), paso('sin', 'APRUEBA')])
    s, b = pedir('post', '/api/review-templates', 'admin', json={
        'model_urn': obra, 'alcance': 'OBRA', 'nombre': PREFIJO + 'flujo con sin ' + RUN,
        'pasos': [{'etiqueta': 'Revisa', 'decision': 'REVISA', 'user_id': U['sin']['id']},
                  {'etiqueta': 'Aprueba', 'decision': 'APRUEBA', 'user_id': U['r2']['id']}]})
    pid = (b or {}).get('id')
    _paso(s in (200, 201) and bool(pid),
          'la plantilla con esa persona se guarda: aun no hay documentos que comprobar',
          'http=%s' % s)
    alta_rechazada('alta desde esa plantilla sobre un documento que no puede consultar',
                   [it(DR3)], None, extra={'plantilla_id': pid})
    s, b = crear_con('alta desde la misma plantilla sobre un documento abierto', [it(D[15])],
                     None, extra={'plantilla_id': pid})
    _paso(s == 200, 'la misma plantilla sobre documentos que puede consultar: nace',
          'http=%s code=%s' % (s, (b or {}).get('code')))

    _titulo('A4 · perder el acceso deja la revision pendiente; recuperarlo o sustituir la desbloquea')
    s, b = crear_con('A4 recuperar el acceso ' + DB[3]['name'], [it(DB[3])],
                     [paso('con', 'REVISA'), paso('r2', 'APRUEBA')])
    rid_rec = (b or {}).get('id')
    _paso(s == 200, 'nace con un revisor que puede consultar sus documentos', 'http=%s' % s)
    regla('reservada_b', 'con', 'none')
    acto_denegado('retirado el acceso, su revisor ya no puede aprobar', rid_rec, 'con',
                  'approve', [DB[3]], (DB[3]['name'],))
    _s, _b, v_glob = listado('admin_global')
    r = v_glob.get(rid_rec) or {}
    _paso(r.get('status') == 'pending' and r.get('flujo') == 'BLOQUEADA'
          and DB[3]['name'] not in (r.get('flujo_motivo') or ''),
          'la revision queda PENDIENTE y BLOQUEADA, con un motivo que no nombra documentos',
          'status=%s flujo=%s motivo=%s' % (r.get('status'), r.get('flujo'), r.get('flujo_motivo')))
    for por_obra in (False, True):
        s, items = trabajo('con', por_obra)
        e = [p for p in items if str(p.get('objeto_id')) == str(rid_rec)]
        _paso(s == 200 and len(e) == 1 and e[0]['asunto'].startswith('Revisión RV-')
              and 'sin acceso a todos sus documentos' in e[0]['asunto']
              and DB[3]['name'] not in json.dumps(items, ensure_ascii=False),
              'A5 · Mi Trabajo %s: el encargo sigue, con asunto neutro'
              % ('por obra' if por_obra else 'global'),
              'asunto=%s' % (e[0]['asunto'] if e else None))
    regla('reservada_b', 'con', 'viewer')
    s, items = trabajo('con', True)
    e = [p for p in items if str(p.get('objeto_id')) == str(rid_rec)]
    _paso(len(e) == 1 and DB[3]['name'] in e[0]['asunto'],
          'devuelto el acceso (consulta), Mi Trabajo vuelve a mostrar el asunto completo',
          'asunto=%s' % (e[0]['asunto'] if e else None))
    s, b = actuar(rid_rec, 'con')
    _paso(s == 200 and revision(rid_rec)['current_step'] == 1,
          'y su revisor continua desde el mismo paso', 'http=%s' % s)

    s, b = crear_con('A4 sustituir ' + DB[4]['name'], [it(DB[4])],
                     [paso('r1', 'REVISA'), paso('r2', 'APRUEBA')])
    rid_sus = (b or {}).get('id')
    a1 = actuar(rid_sus, 'r1') if rid_sus else (None, None)
    hecho = revision(rid_sus)['history'] if rid_sus else []
    regla('reservada_b', 'r2', 'none')
    acto_denegado('retirado el acceso al aprobador final, no puede aprobar', rid_sus, 'r2',
                  'approve', [DB[4]], (DB[4]['name'],))
    antes = huella(rid_sus, [DB[4]['node_id']])
    s, b = actuar(rid_sus, 'admin_global')
    _paso(s == 403 and antes == huella(rid_sus, [DB[4]['node_id']]),
          'el administrador no puede aprobar el paso de otra persona', 'http=%s' % s)
    regla('reservada_b', 'sin', 'none')
    antes = huella(rid_sus, [DB[4]['node_id']])
    s, b = pedir('post', '/api/reviews/%s/reasignar' % rid_sus, 'admin_global',
                 json={'user_id': U['sin']['id'], 'motivo': 'el aprobador perdio el acceso'})
    _paso(s == 400 and (b or {}).get('code') == 'REVISOR_SIN_ACCESO_DOCUMENTAL'
          and antes == huella(rid_sus, [DB[4]['node_id']]),
          'sustituir por alguien sin acceso -> 400, sin cambios',
          'http=%s code=%s' % (s, (b or {}).get('code')))
    s, b = pedir('post', '/api/reviews/%s/reasignar' % rid_sus, 'admin_global',
                 json={'user_id': U['sustituto']['id'], 'motivo': ''})
    _paso(s == 400 and (b or {}).get('code') == 'FALTA_MOTIVO',
          'sin motivo no hay sustitucion', 'http=%s code=%s' % (s, (b or {}).get('code')))
    avisos = len(correos)
    s, b = pedir('post', '/api/reviews/%s/reasignar' % rid_sus, 'admin_global',
                 json={'user_id': U['sustituto']['id'],
                       'motivo': 'el aprobador perdio el acceso a RESERVADA_B'})
    fila = revision(rid_sus)
    _paso(s == 200 and a1[0] == 200 and fila['current_step'] == 1
          and fila['history'][:len(hecho)] == hecho
          and any(h.get('event') == 'step_reassigned' and h.get('reason')
                  for h in fila['history']),
          'sustituir por alguien con acceso: mismo paso, historial previo intacto y motivo',
          'http=%s code=%s paso=%s' % (s, (b or {}).get('code'), fila['current_step']))
    nuevos = correos[avisos:]
    _paso(any(c['destino'] == U['sustituto']['email'] and DB[4]['name'] in c['cuerpo']
              for c in nuevos),
          'A5 · quien SI puede consultar recibe el aviso completo', 'avisos=%d' % len(nuevos))
    s, b = actuar(rid_sus, 'sustituto')
    _paso(s == 200 and revision(rid_sus)['status'] == 'approved'
          and [DB[4]['version_id'], 'SHARED'] in emisiones(DB[4]['node_id']),
          'el sustituto aprueba con su autoridad; cierra y emite la version fijada',
          'http=%s' % s)

    _titulo('A5 · Mi Trabajo y avisos de quien no puede consultar')
    rid_pre_sin = sembrar('PRE revision de ' + DR3['name'],
                          [{'node_id': DR3['node_id'], 'name': DR3['name']}],
                          [paso('sin'), paso('r2')], flujo.PRE)
    suyas = {str(rid_a1_int), str(rid_a1_fin), str(rid_pre_sin)}
    for por_obra in (False, True):
        s, items = trabajo('sin', por_obra)
        propios = [p for p in items if str(p.get('objeto_id')) in suyas]
        crudo = json.dumps(items, ensure_ascii=False)
        _paso(s == 200 and len(propios) == 3
              and all(p['asunto'].startswith('Revisión RV-') for p in propios)
              and DR3['name'] not in crudo,
              'Mi Trabajo %s: sus tres encargos siguen ahi, neutros'
              % ('por obra' if por_obra else 'global'),
              'asuntos=%s' % [p['asunto'] for p in propios])
    a_sin = [c for c in correos if c['destino'] == U['sin']['email']]
    neutros = [c for c in a_sin if c['cuerpo'].startswith('Revisión RV-')]
    _paso(len(neutros) >= 3 and DR3['name'] not in json.dumps(a_sin, ensure_ascii=False),
          'sus avisos salen neutros: ni titulo ni nombres reservados',
          'avisos=%d neutros=%d' % (len(a_sin), len(neutros)))

    _titulo('A6 · el error del cierre no revela el documento restringido')
    error = acto_denegado('aprobar el paso final sin acceso: negativa sin nombres ni titulo',
                          rid_a1_fin, 'sin', 'approve', [D[14], DR3],
                          (DR3['name'], D[14]['name'], titulo_a1))
    _paso('RESERVADO' not in error and 'A1' not in error,
          'el mensaje es el mismo para cualquier revision', 'error=%s' % error)

    _titulo('A7 · PRE con actor sin acceso')
    acto_denegado('la PRE no cambia de semantica, pero quien no puede consultar no actua '
                  '(antes de esta correccion podia)', rid_pre_sin, 'sin', 'approve', [DR3],
                  (DR3['name'],))

    _titulo('A8 · version inexistente: quien administra la gestiona, pero no la aprueba')
    fantasma = str(uuid.uuid4())
    rid_inex = sembrar('A8 version inexistente', [it(D[16], version_id=fantasma)],
                       [paso('r1', 'REVISA'), paso('r2', 'APRUEBA')],
                       flujo.AUTORIDAD_TERMINAL, 1)
    acto_denegado('su aprobador no puede actuar: una version que no existe no es un '
                  'documento consultable', rid_inex, 'r2', 'approve', [D[16]],
                  (D[16]['name'],))
    _s, _b, v_glob = listado('admin_global')
    _paso((v_glob.get(rid_inex) or {}).get('flujo') == 'BLOQUEADA',
          'la revision queda BLOQUEADA',
          'flujo=%s' % (v_glob.get(rid_inex) or {}).get('flujo'))
    s, b = pedir('post', '/api/reviews/%s/reasignar' % rid_inex, 'admin_global',
                 json={'user_id': U['admin']['id'],
                       'motivo': 'version inexistente: la gestiona quien administra la obra'})
    _paso(s == 200, 'se puede sustituir al aprobador por quien administra la obra',
          'http=%s code=%s' % (s, (b or {}).get('code')))
    nodos = [D[16]['node_id']]
    antes, avisos = huella(rid_inex, nodos), len(correos)
    s, b = actuar(rid_inex, 'admin', 'approve')
    despues = huella(rid_inex, nodos)
    _paso(s == 409 and (b or {}).get('code') == 'ASOCIACION_DOCUMENTAL_INVALIDA'
          and antes == despues and len(correos) == avisos
          and emisiones(D[16]['node_id']) == []
          and documento(obra, D[16]['name'])['status'] == 'WIP',
          'asignado quien administra, aprobar sigue bloqueado por integridad: 409, sin '
          'emitir y sin cambiar revision, historial, items, encargos ni actividad',
          'http=%s code=%s mutacion=%s' % (s, (b or {}).get('code'), antes != despues))
    s, b = actuar(rid_inex, 'admin', 'reject', 'la version fijada no existe')
    fila = revision(rid_inex)
    _paso(s == 200 and fila['status'] == 'rejected'
          and any(h.get('emitido') == 'RECHAZA' for h in fila['history'])
          and emisiones(D[16]['node_id']) == []
          and fantasma in huella(rid_inex, nodos),
          'rechazar sigue siendo la salida: rejected con RECHAZA, sin emitir y sin '
          'rellenar la version', 'http=%s status=%s' % (s, fila['status']))

    _titulo('A9 · sustituir tras perder el acceso no rompe la independencia')
    s, b = crear_con('A9 autor administrador ' + DB[5]['name'], [it(DB[5])],
                     [paso('lector', 'APRUEBA')], quien='admin_global')
    rid_ind = (b or {}).get('id')
    _paso(s == 200, 'quien administra crea una revision de un solo paso para otra persona',
          'http=%s code=%s' % (s, (b or {}).get('code')))
    regla('reservada_b', 'lector', 'none')
    acto_denegado('esa persona pierde el acceso y ya no puede actuar', rid_ind, 'lector',
                  'approve', [DB[5]], (DB[5]['name'],))
    nodos = [DB[5]['node_id']]
    antes, avisos = huella(rid_ind, nodos), len(correos)
    s, b = pedir('post', '/api/reviews/%s/reasignar' % rid_ind, 'admin_global',
                 json={'user_id': U['admin_global']['id'], 'motivo': 'me la asigno'})
    _paso(s == 400 and (b or {}).get('code') == 'REVISION_SIN_INDEPENDENCIA'
          and antes == huella(rid_ind, nodos) and len(correos) == avisos,
          'el autor administrador no puede quedar como unico revisor de su revision: '
          '400 y sin cambios', 'http=%s code=%s' % (s, (b or {}).get('code')))
    hecho = revision(rid_ind)['history']
    s, b = pedir('post', '/api/reviews/%s/reasignar' % rid_ind, 'admin_global',
                 json={'user_id': U['sustituto']['id'],
                       'motivo': 'la revisora perdio el acceso a RESERVADA_B'})
    fila = revision(rid_ind)
    cambio = [h for h in fila['history'] if h.get('event') == 'step_reassigned']
    _paso(s == 200 and fila['current_step'] == 0 and fila['history'][:len(hecho)] == hecho
          and len(cambio) == 1 and (cambio[0].get('reason') or '').startswith('la revisora')
          and (cambio[0].get('from') or {}).get('user_id') == U['lector']['id']
          and (cambio[0].get('to') or {}).get('user_id') == U['sustituto']['id'],
          'sustituir por otra persona autorizada sigue funcionando, con motivo e historial',
          'http=%s code=%s' % (s, (b or {}).get('code')))

    fallos = [p for p in _pasos if not p[0]]
    print()
    print('=' * 76)
    print('%d de %d comprobaciones pasan · obra %s' % (len(_pasos) - len(fallos), len(_pasos), obra))
    for ok, texto in _pasos:
        if not ok:
            print('  FALLA  %s' % texto)
    print('=' * 76)
    return 1 if fallos else 0


if __name__ == '__main__':
    codigo = main()
    sys.stdout.flush()
    # Salida inmediata: el arranque de la aplicacion deja hilos de fondo que no
    # tienen nada que hacer en un ensayo que ya termino.
    os._exit(codigo)
