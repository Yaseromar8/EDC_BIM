# -*- coding: utf-8 -*-
"""La bateria de E-4: los tres contratos de Saved Views, contra una base de verdad.

    python herramientas/ensayo_de_vistas_v2.py

QUE COMPRUEBA, Y POR QUE NO BASTA CON PYTEST
--------------------------------------------
`test_vistas_v2.py` prueba el invariante como logica pura, sin base. Aqui se
prueba lo OTRO: que la ruta consulta lo que dice consultar, que un rechazo no
deja media fila escrita, y que la negativa la da el servidor y no la interfaz.
Eso necesita SQL de verdad antes y despues de cada mutacion, y por eso esto es
un ensayo y no un test unitario.

DONDE CORRE
-----------
Contra un PostgreSQL DESECHABLE, no contra la base de trabajo:

    initdb -U ecd_migrator --auth=trust     # el DDL lo firma ecd_migrator
    createdb ecd_e4_prueba
    <esquema v1>  +  sql/29_saved_views_v2.sql  +  las 14 vistas reales
    projects + project_users, para que la obra se resuelva de verdad
    ecd_app con SELECT/INSERT/UPDATE/DELETE y ni un permiso de esquema

    Ana(1) y Beto(2)  miembros de la obra '1'  --frentes 1_CANAL y 1_DRENAJE--
    Carla(4)          miembro de 'obra_B'      --la de fuera--
    Admin(3)          Entity Admin, atraviesa todo

Las 14 vistas v1 son las de verdad, copiadas de la base local: la bateria mide
el peso del listado sobre documentos reales de 12 KB, no sobre maquetas.

    E4_DB_HOST / E4_DB_PORT / E4_DB_NAME / E4_DB_USER / E4_DB_PASS
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# La base desechable, ANTES de importar nada que abra el pool.
os.environ['DB_HOST'] = os.getenv('E4_DB_HOST', '127.0.0.1')
os.environ['DB_PORT'] = os.getenv('E4_DB_PORT', '55433')
os.environ['DB_NAME'] = os.getenv('E4_DB_NAME', 'ecd_e4_prueba')
os.environ['DB_USER'] = os.getenv('E4_DB_USER', 'ecd_app')
os.environ['DB_PASS'] = os.getenv('E4_DB_PASS', 'clave_desechable_e4')
os.environ.setdefault('AUTH_POLICY_MODE', 'sombra')
os.environ.setdefault('APP_SECRET', 'x' * 32)
os.environ.setdefault('SESSION_PEPPER', 'pimienta-de-ensayo')
os.environ.setdefault('DDL_EN_CALIENTE', 'false')     # el esquema ya esta hecho
os.environ.setdefault('ALLOW_DEMO_TOKEN', 'false')

import base64

from flask import Flask

import auth_middleware
import politica
import vistas_v2
from db import get_db_connection, init_db_pool
from routes.views import views_bp

_pasos = []


def paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK   ' if ok else 'FALLA', texto,
                          ('\n          -- ' + str(detalle)) if detalle else ''))
    return ok


def titulo(t):
    print()
    print(t)
    print('-' * len(t))


# ── El banco de pruebas ────────────────────────────────────────────────────

def construir_app():
    """SOLO el blueprint de vistas, con el middleware y la politica de verdad.

    No se importa `server.py`: arrastraria 89 endpoints y sus tablas, y lo que
    hay que demostrar aqui son estas rutas. El middleware y `politica` si son
    los reales -- son justamente lo que decide quien entra.
    """
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(views_bp)
    auth_middleware.init_auth_middleware(app)
    politica.aplicar_politicas_por_defecto(app, politica.POLITICAS_POR_BLUEPRINT)
    return app


def sesion_para(user_id):
    """Una sesion DE VERDAD: fila en `sessions` con la huella del token.

    Nada de fingir `g.current_user`. Si el middleware cambiara la forma de
    autenticar, esta bateria tiene que enterarse.
    """
    token = auth_middleware.generate_session_token()
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO sessions (token, user_id, expires_at, is_active) "
                    "VALUES (%s, %s, NOW() + INTERVAL '1 day', TRUE)",
                    (auth_middleware.hash_de_token(token), user_id))
        conn.commit()
    return {'Authorization': 'Bearer ' + token}


def sql(consulta, args=None, una=True):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(consulta, args or ())
        fila = cur.fetchone() if una else cur.fetchall()
    return fila


def urn_de_version(id_, version=50):
    crudo = 'urn:adsk.wipprod:fs.file:vf.%s?version=%d' % (id_, version)
    return base64.urlsafe_b64encode(crudo.encode()).decode().rstrip('=')


# El frente donde se guardan las vistas de la bateria. Resoluble a la obra '1'
# por la convencion `<obra>_<FRENTE>` que aplica `resolve_project_id`.
FRENTE = '1_CANAL'
FRENTE_AJENO = 'obra_B_DRENAJE'      # la obra de Carla; Ana y Beto no entran
FRENTE_SIN_OBRA = 'zz_no_resuelve'   # no casa con ninguna obra: nadie entra

LIN_A = 'urn:adsk.wipprod:dm.lineage:zzE4AaaaAaaaAaaaAaaaAa'
LIN_B = 'urn:adsk.wipprod:dm.lineage:zzE4BbbbBbbbBbbbBbbbBb'
URN_A = urn_de_version('zzE4AaaaAaaaAaaaAaaaAa', 50)


def doc_v2(**cambios):
    d = {
        'schemaVersion': 2,
        'lmv': {'viewport': {'eye': [1, 2, 3]}, 'cutplanes': [[0, 0, 1, -5]],
                'objectSet': [{'id': [966], 'seedUrn': URN_A}]},
        'models': [{'lineage': LIN_A, 'urnAtSave': URN_A, 'versionAtSave': 50,
                    'visible': True, 'order': 0}],
        'federation': {'activeLineage': LIN_A, 'globalOffsetAtSave': None},
        'filters': {'properties': [], 'selections': {}, 'colors': {}, 'valueColors': {},
                    'sourceColor': {'on': False, 'custom': {}}, 'hiddenModelLineages': []},
        'inventory': {'columns': {'mode': 'all'}},
        'extensions': {'pkHeatmap': None},
        'meta': {'appVersion': '2026.09', 'capturedAt': '2026-09-05T12:00:00Z'},
    }
    d.update(cambios)
    return d


def huella_de_la_tabla():
    """Como esta la tabla AHORA. Sirve para probar que un rechazo no escribio."""
    filas = sql("SELECT id, name, project_id, schema_version, "
                "       md5(coalesce(viewer_state::text,'')||coalesce(filter_state::text,'')"
                "           ||coalesce(config::text,'')||coalesce(state::text,'')), "
                "       created_by, updated_at, description, thumbnail "
                "  FROM saved_views ORDER BY id", una=False)
    return [tuple(str(c) for c in f) for f in filas]


def main():
    init_db_pool()
    app = construir_app()
    cli = app.test_client()

    ana, beto, admin = sesion_para(1), sesion_para(2), sesion_para(3)
    carla = sesion_para(sql("SELECT id FROM users WHERE email = %s",
                            ('zz_e4_carla@ejemplo.invalido',))[0])
    anonimo = {}

    print()
    print('=' * 78)
    print('BATERIA DE E-4 · CONTRATOS DE SAVED VIEWS')
    print('=' * 78)
    print('  base    %s:%s/%s como %s' % (os.environ['DB_HOST'], os.environ['DB_PORT'],
                                          os.environ['DB_NAME'], os.environ['DB_USER']))

    # Restos de una ejecucion anterior que se cortara a medias. Las 14 vistas de
    # verdad tienen `created_by` NULL --son anteriores a E-0-- y las de la
    # bateria SIEMPRE quedan firmadas, asi que la frontera es exacta.
    with get_db_connection() as _c:
        _cur = _c.cursor()
        _cur.execute("DELETE FROM saved_views WHERE created_by IS NOT NULL")
        if _cur.rowcount:
            print('  limpieza  %d fila(s) de una ejecucion anterior' % _cur.rowcount)
        _c.commit()

    n_v1 = sql("SELECT count(*) FROM saved_views WHERE schema_version = 1")[0]
    ids_v1 = [f[0] for f in sql("SELECT id FROM saved_views ORDER BY created_at", una=False)]
    # Para las pruebas de detalle y autoria hace falta una v1 cuyo frente
    # RESUELVA a una obra: las tres de marzo tienen project_id vacio y no
    # resuelven, que es un caso aparte y se prueba como tal.
    ids_con_obra = [f[0] for f in sql(
        "SELECT id FROM saved_views WHERE project_id LIKE %s AND created_by IS NULL "
        " ORDER BY created_at", ("1\\_%",), una=False)]
    ids_sin_obra = [f[0] for f in sql(
        "SELECT id FROM saved_views WHERE coalesce(project_id,'') = '' ORDER BY created_at", una=False)]
    huella_v1_inicial = huella_de_la_tabla()
    # Copia literal de la vista que se usara para probar la conversion. Se
    # devuelve tal cual al terminar, y el md5 del final lo comprueba.
    estado_cobaya = sql("SELECT viewer_state, filter_state, config FROM saved_views WHERE id = %s",
                        (ids_con_obra[-1],))
    print('  vistas  %d en v1 al empezar' % n_v1)

    # ═══════════════════════════════════════════════ E-4A · LISTADO
    titulo('E-4A · 1. EL LISTADO NO DESCARGA LOS DOCUMENTOS')
    r = cli.get('/api/views?project=' + FRENTE, headers=ana)
    paso(r.status_code == 200, 'GET /api/views?project= responde 200 con sesion', r.status_code)
    lista = r.get_json()
    n_frente = sql("SELECT count(*) FROM saved_views WHERE project_id = %s", (FRENTE,))[0]
    paso(isinstance(lista, list) and len(lista) == n_frente,
         'devuelve las %d vistas de %s' % (n_frente, FRENTE),
         len(lista) if isinstance(lista, list) else lista)
    paso(cli.get('/api/views', headers=ana).status_code == 400,
         'sin `project` -> 400: un listado sin acotar devolvia las de TODAS las obras')

    prohibidos = set()
    for v in lista:
        prohibidos |= (set(v.keys()) & set(('viewerState', 'filterState', 'config', 'state')))
    paso(not prohibidos, 'ninguna trae viewerState / filterState / config / state',
         'aparecieron: %s' % sorted(prohibidos))

    peso_listado = len(r.data)
    peso_documentos = sql(
        "SELECT coalesce(sum(pg_column_size(viewer_state)+pg_column_size(filter_state)"
        "                   +pg_column_size(config)),0) FROM saved_views WHERE project_id = %s",
        (FRENTE,))[0]
    paso(peso_listado < peso_documentos,
         'el listado pesa %d bytes; los documentos que ya NO viajan, %d'
         % (peso_listado, peso_documentos))
    paso(all(set(('id', 'name', 'schemaVersion', 'createdAt')) <= set(v.keys()) for v in lista),
         'y si trae lo que la galeria necesita (id, name, schemaVersion, createdAt)')

    r = cli.get('/api/views?project=' + FRENTE, headers=anonimo)
    paso(r.status_code == 401, 'sin sesion el listado responde 401', r.status_code)

    titulo('E-4A · 2. DETALLE v1 CON SESION')
    r = cli.get('/api/views/%s' % ids_con_obra[0], headers=ana)
    d = r.get_json()
    paso(r.status_code == 200 and d.get('schemaVersion') == 1, 'responde 200 y se declara v1')
    paso(all(k in d for k in ('viewerState', 'filterState', 'config')),
         'trae las tres columnas de v1')
    paso('state' not in d, 'y NO trae `state`: una v1 no se convierte al leerla')

    titulo('E-4A · 4. DETALLE PUBLICO (ENLACE COMPARTIDO)')
    r = cli.get('/api/views/%s' % ids_con_obra[0], headers=anonimo)
    pub_v1 = r.get_json()
    paso(r.status_code == 200, 'el enlace v1 sigue abriendo sin sesion', r.status_code)
    paso(all(k in pub_v1 for k in ('id', 'name', 'projectId', 'viewerState', 'filterState',
                                   'config', 'createdAt')),
         'y con los mismos campos que antes de E-4 (compatibilidad del enlace)')
    fuera = set(pub_v1.keys()) & set(('createdBy', 'esMia', 'permisos', 'email',
                                      'description', 'thumbnail', 'updatedAt'))
    paso(not fuera, 'sin autor, sin permisos y sin metadatos internos',
         'se colaron: %s' % sorted(fuera))

    # ═══════════════════════════════════════════════ E-4B · ESCRITURA
    titulo('E-4B · 5. POST DE UNA v2 VALIDA')
    r = cli.post('/api/views', headers=ana, json={
        'name': 'zz_e4 v2 de Ana', 'project': FRENTE,
        'description': 'la primera v2', 'state': doc_v2()})
    creada = r.get_json()
    paso(r.status_code == 201, 'responde 201', r.status_code)
    id_v2_ana = (creada or {}).get('id')
    fila = sql("SELECT schema_version, created_by, viewer_state, filter_state, config, "
               "       state IS NOT NULL, created_at IS NOT NULL, updated_at IS NOT NULL "
               "  FROM saved_views WHERE id = %s", (id_v2_ana,))
    paso(fila and fila[0] == 2, 'la fila queda con schema_version = 2', fila[0] if fila else None)
    paso(fila and fila[1] == 1, 'y firmada por quien la guardo (created_by = 1)', fila[1] if fila else None)
    paso(fila and fila[2] is None and fila[3] is None and fila[4] is None,
         'las tres columnas de v1 quedan NULL')
    paso(fila and fila[5] and fila[6] and fila[7], '`state`, created_at y updated_at, puestos')

    titulo('E-4A · 3. DETALLE v2 CON SESION')
    r = cli.get('/api/views/%s' % id_v2_ana, headers=ana)
    d = r.get_json()
    paso(r.status_code == 200 and d.get('schemaVersion') == 2, 'responde 200 y se declara v2')
    paso(isinstance(d.get('state'), dict) and d['state'].get('schemaVersion') == 2,
         'trae `state`, y el documento de dentro tambien dice v2')
    paso(not any(k in d for k in ('viewerState', 'filterState', 'config')),
         'y NO trae las columnas de v1: en una v2 estan vacias y no se fingen')
    paso(d.get('createdBy') == 1 and d.get('esMia') is True,
         'con sesion si se dice quien es el autor, y si eres tu')

    titulo('E-4A · 4b. ENLACE COMPARTIDO DE UNA v2')
    r = cli.get('/api/views/%s' % id_v2_ana, headers=anonimo)
    pub = r.get_json()
    paso(r.status_code == 200, 'abre sin sesion', r.status_code)
    paso(sorted(pub.keys()) == ['id', 'name', 'projectId', 'schemaVersion', 'state'],
         'y devuelve EXACTAMENTE id, name, projectId, schemaVersion y state',
         sorted(pub.keys()))
    paso('createdBy' not in pub and 'permisos' not in pub and 'esMia' not in pub,
         'NO expone created_by, ni permisos, ni nada de personas')
    paso(pub['state'] == d['state'], 'el documento que llega es el mismo, sin recortar')

    titulo('E-4B · 6-7. LO QUE NO SE PUEDE GUARDAR')
    casos_malos = [
        ('lineage null', doc_v2(models=[{'lineage': None, 'urnAtSave': URN_A}]), 'LINAJE_AUSENTE'),
        ('hiddenModelUrnsV1', doc_v2(filters={'hiddenModelUrnsV1': [URN_A]}), 'TRANSITO_V1'),
        ('meta.migradoDeV1', doc_v2(meta={'migradoDeV1': True}), 'TRANSITO_V1'),
        ('mapa por urn', doc_v2(filters={'sourceColor': {'on': True, 'custom': {URN_A: '#fff'}}}),
         'MAPA_INDEXADO_POR_URN'),
        ('schemaVersion 1', doc_v2(schemaVersion=1), 'SCHEMA_VERSION'),
    ]
    for nombre, estado, motivo_esperado in casos_malos:
        antes = sql("SELECT count(*) FROM saved_views")[0]
        r = cli.post('/api/views', headers=ana,
                     json={'name': 'zz_e4 no deberia existir', 'project': FRENTE,
                           'state': estado})
        cuerpo = r.get_json() or {}
        motivos = [p['motivo'] for p in cuerpo.get('problemas', [])]
        despues = sql("SELECT count(*) FROM saved_views")[0]
        paso(r.status_code == 422 and motivo_esperado in motivos and antes == despues,
             'POST con %s -> 422 %s y NI UNA FILA escrita' % (nombre, motivo_esperado),
             'http=%s motivos=%s filas %s->%s' % (r.status_code, motivos, antes, despues))

    paso(sql("SELECT count(*) FROM saved_views WHERE name = 'zz_e4 no deberia existir'")[0] == 0,
         'ninguno de los rechazados dejo rastro con su nombre')

    titulo('E-4B · 8-9. PUT')
    doc_nuevo = doc_v2(lmv={'viewport': {'eye': [9, 9, 9]}})
    r = cli.put('/api/views/%s' % id_v2_ana, headers=ana, json={'state': doc_nuevo})
    puesta = r.get_json() or {}
    paso(r.status_code == 200, 'PUT valido responde 200', r.status_code)
    paso(puesta.get('id') == id_v2_ana, 'CONSERVA EL ID -- y por tanto el enlace compartido')
    fila = sql("SELECT state->'lmv'->'viewport'->'eye'->>0, name, updated_at > created_at "
               "  FROM saved_views WHERE id = %s", (id_v2_ana,))
    paso(fila and fila[0] == '9', 'el estado quedo reemplazado', fila[0] if fila else None)
    paso(fila and fila[1] == 'zz_e4 v2 de Ana', 'y el nombre NO cambio de rebote')
    paso(fila and fila[2], 'updated_at avanzo')

    antes = sql("SELECT state::text, updated_at::text FROM saved_views WHERE id = %s", (id_v2_ana,))
    r = cli.put('/api/views/%s' % id_v2_ana, headers=ana,
                json={'state': doc_v2(models=[{'lineage': None}])})
    despues = sql("SELECT state::text, updated_at::text FROM saved_views WHERE id = %s", (id_v2_ana,))
    paso(r.status_code == 422 and antes == despues,
         'PUT invalido -> 422 y LA FILA NO SE MUEVE (ni el estado ni la fecha)',
         'http=%s' % r.status_code)

    r = cli.put('/api/views/%s' % id_v2_ana, headers=ana,
                json={'state': doc_v2(), 'name': 'renombrada de rebote'})
    paso(r.status_code == 400 and (r.get_json() or {}).get('code') == 'CAMPO_NO_PERMITIDO',
         'PUT rechaza cambiar metadatos: eso es PATCH', r.status_code)

    r = cli.put('/api/views/%s' % ids_con_obra[0], headers=admin, json={'state': doc_v2()})
    paso(r.status_code == 409 and (r.get_json() or {}).get('code') == 'V1_NO_SE_CONVIERTE',
         'PUT sobre una v1 -> 409: no se convierte en sitio, ni siquiera un admin',
         r.status_code)
    paso(sql("SELECT schema_version FROM saved_views WHERE id = %s", (ids_con_obra[0],))[0] == 1,
         'y la v1 sigue siendo v1')

    titulo('E-4B · 9b. EL INTERRUPTOR DE CONVERSION, EN SUS DOS POSICIONES')
    import routes.views as _rutas
    paso(_rutas.CONVERSION_V1_EN_SITIO is False,
         'CONVERSION_V1_EN_SITIO viene APAGADO, que es la posicion vigente')
    _rutas.CONVERSION_V1_EN_SITIO = True
    try:
        v1_cobaya = ids_con_obra[-1]
        antes = sql("SELECT schema_version, viewer_state IS NOT NULL FROM saved_views WHERE id = %s",
                    (v1_cobaya,))
        r = cli.put('/api/views/%s' % v1_cobaya, headers=admin, json={'state': doc_v2()})
        despues = sql("SELECT schema_version, viewer_state IS NULL, filter_state IS NULL, "
                      "       config IS NULL, state IS NOT NULL FROM saved_views WHERE id = %s",
                      (v1_cobaya,))
        paso(antes == (1, True), 'la cobaya empezaba siendo v1 con su documento dentro', antes)
        paso(r.status_code == 200 and despues == (2, True, True, True, True),
             'ENCENDIDO: la v1 pasa a v2 y las tres columnas viejas quedan NULL',
             'http=%s fila=%s' % (r.status_code, despues))
        paso(True, 'ES DESTRUCTIVO Y NO TIENE VUELTA: por eso el interruptor esta apagado')
    finally:
        _rutas.CONVERSION_V1_EN_SITIO = False
        with get_db_connection() as conn:      # se devuelve la cobaya a su sitio
            c = conn.cursor()
            c.execute("UPDATE saved_views SET schema_version = 1, state = NULL, "
                      "       updated_at = NULL, viewer_state = %s, filter_state = %s, config = %s "
                      "  WHERE id = %s",
                      (json.dumps(estado_cobaya[0]), json.dumps(estado_cobaya[1]),
                       json.dumps(estado_cobaya[2]), v1_cobaya))
            conn.commit()
    paso(_rutas.CONVERSION_V1_EN_SITIO is False, 'y el interruptor vuelve a su sitio')

    titulo('E-4B · 10. PATCH')
    r = cli.patch('/api/views/%s' % id_v2_ana, headers=ana,
                  json={'name': 'zz_e4 renombrada', 'description': 'otra nota'})
    paso(r.status_code == 200, 'PATCH de nombre y descripcion responde 200', r.status_code)
    fila = sql("SELECT name, description, state->'lmv'->'viewport'->'eye'->>0, schema_version, created_by "
               "  FROM saved_views WHERE id = %s", (id_v2_ana,))
    paso(fila[0] == 'zz_e4 renombrada' and fila[1] == 'otra nota', 'los metadatos cambian')
    paso(fila[2] == '9' and fila[3] == 2 and fila[4] == 1,
         'y el estado, la version y el autor NO se tocan')

    for campo, valor in (('state', doc_v2()), ('schemaVersion', 2), ('createdBy', 3),
                         ('projectId', 'otra_obra')):
        r = cli.patch('/api/views/%s' % id_v2_ana, headers=ana, json={campo: valor})
        paso(r.status_code == 400 and (r.get_json() or {}).get('code') == 'CAMPO_NO_PERMITIDO',
             'PATCH rechaza `%s` por su nombre, no lo ignora' % campo, r.status_code)

    # ═══════════════════════════════════════════════ E-4C · AUTORIA
    titulo('E-4C · 11-12. VISTA HISTORICA (created_by NULL)')
    historica = ids_con_obra[0]
    paso(sql("SELECT created_by FROM saved_views WHERE id = %s", (historica,))[0] is None,
         'la vista de prueba no tiene autor (es de antes de E-0)')

    for verbo, llamada in (('PUT', lambda h: cli.put('/api/views/%s' % historica, headers=h,
                                                     json={'state': doc_v2()})),
                           ('PATCH', lambda h: cli.patch('/api/views/%s' % historica, headers=h,
                                                         json={'name': 'zz_e4 secuestrada'})),
                           ('DELETE', lambda h: cli.delete('/api/views/%s' % historica, headers=h))):
        r = llamada(ana)
        cuerpo = r.get_json() or {}
        paso(r.status_code == 403 and cuerpo.get('motivo') == 'VISTA_HISTORICA_SIN_AUTOR',
             '%s de un usuario normal -> 403 VISTA_HISTORICA_SIN_AUTOR' % verbo,
             'http=%s cuerpo=%s' % (r.status_code, str(cuerpo)[:120]))

    paso(sql("SELECT count(*) FROM saved_views WHERE id = %s", (historica,))[0] == 1,
         'y la vista historica sigue ahi, con su nombre')

    r = cli.patch('/api/views/%s' % historica, headers=admin, json={'description': 'zz_e4 nota del admin'})
    paso(r.status_code == 200, 'PATCH del admin sobre la historica -> 200', r.status_code)
    paso(sql("SELECT description, schema_version FROM saved_views WHERE id = %s",
             (historica,)) == ('zz_e4 nota del admin', 1),
         'cambia la nota y NO la convierte en v2')
    with get_db_connection() as conn:      # se deja como estaba
        c = conn.cursor()
        c.execute("UPDATE saved_views SET description = NULL, updated_at = NULL WHERE id = %s",
                  (historica,))
        conn.commit()

    titulo('E-4C · 13-14. VISTA PROPIA Y VISTA AJENA')
    r = cli.patch('/api/views/%s' % id_v2_ana, headers=ana, json={'name': 'zz_e4 mia y la toco'})
    paso(r.status_code == 200, 'Ana renombra SU vista -> 200', r.status_code)

    for verbo, llamada in (('PUT', lambda: cli.put('/api/views/%s' % id_v2_ana, headers=beto,
                                                   json={'state': doc_v2()})),
                           ('PATCH', lambda: cli.patch('/api/views/%s' % id_v2_ana, headers=beto,
                                                       json={'name': 'zz_e4 de Beto ahora'})),
                           ('DELETE', lambda: cli.delete('/api/views/%s' % id_v2_ana, headers=beto))):
        r = llamada()
        cuerpo = r.get_json() or {}
        paso(r.status_code == 403 and cuerpo.get('motivo') == 'VISTA_DE_OTRA_PERSONA',
             '%s de Beto sobre la vista de Ana -> 403 VISTA_DE_OTRA_PERSONA' % verbo,
             'http=%s' % r.status_code)

    paso(sql("SELECT name FROM saved_views WHERE id = %s", (id_v2_ana,))[0] == 'zz_e4 mia y la toco',
         'la vista de Ana conserva su nombre')

    titulo('E-4C · 15. «GUARDAR COMO» DE UNA VISTA AJENA')
    detalle = cli.get('/api/views/%s' % id_v2_ana, headers=beto).get_json()
    paso(detalle.get('permisos', {}) == {'actualizar': False, 'renombrar': False, 'borrar': False,
                                         'guardarComo': True, 'esMia': False, 'autorConocido': True},
         'Beto la puede LEER, y la respuesta le dice exactamente que puede hacer',
         detalle.get('permisos'))
    r = cli.post('/api/views', headers=beto,
                 json={'name': 'zz_e4 copia de Beto', 'project': FRENTE,
                       'state': detalle['state']})
    copia = r.get_json() or {}
    paso(r.status_code == 201, '«Guardar como» de una vista ajena -> 201', r.status_code)
    paso(sql("SELECT created_by FROM saved_views WHERE id = %s", (copia.get('id'),))[0] == 2,
         'la copia es de Beto, no de Ana')
    paso(sql("SELECT created_by FROM saved_views WHERE id = %s", (id_v2_ana,))[0] == 1,
         'y la original sigue siendo de Ana')

    r = cli.delete('/api/views/%s' % copia.get('id'), headers=beto)
    paso(r.status_code == 200 and
         sql("SELECT count(*) FROM saved_views WHERE id = %s", (copia.get('id'),))[0] == 0,
         'Beto borra SU copia -> 200 y la fila desaparece', r.status_code)

    r = cli.delete('/api/views/zz_e4_no_existe', headers=admin)
    paso(r.status_code == 404,
         'borrar una vista que no existe -> 404 (antes respondia success)', r.status_code)

    titulo('E-4C · LA INTERFAZ NO AUTORIZA')
    frente_hist = sql("SELECT project_id FROM saved_views WHERE id = %s", (historica,))[0]
    lista = cli.get('/api/views?project=' + frente_hist, headers=ana).get_json()
    hist = next(v for v in lista if v['id'] == historica)
    paso(hist['permisos']['borrar'] is False,
         'el listado le dice a Ana que no puede borrar la historica')
    r = cli.delete('/api/views/%s' % historica, headers=ana)
    paso(r.status_code == 403,
         'y aunque pulse igualmente, el SERVIDOR es quien lo impide', r.status_code)

    r = cli.delete('/api/views/%s' % historica, headers=anonimo)
    paso(r.status_code == 401, 'sin sesion, ni siquiera llega a la guardia', r.status_code)

    # ═══════════════════════════════════════════════ ACCESO AL RECURSO
    titulo('E-F-G · UN USUARIO DE OTRA OBRA (Carla, solo en obra_B)')
    r = cli.get('/api/views?project=' + FRENTE, headers=carla)
    paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'PROJECT_FORBIDDEN',
         'E · LIST de un frente ajeno -> 403 PROJECT_FORBIDDEN',
         'http=%s %s' % (r.status_code, str(r.get_json())[:90]))

    r = cli.get('/api/views/%s' % id_v2_ana, headers=carla)
    paso(r.status_code == 403,
         'F · DETALLE autenticado de una vista ajena -> 403', r.status_code)
    paso('state' not in (r.get_json() or {}),
         '  y en el 403 no viaja el documento')

    r = cli.post('/api/views', headers=carla,
                 json={'name': 'zz_e4 de Carla en obra ajena', 'project': FRENTE,
                       'state': doc_v2()})
    paso(r.status_code == 403, 'G · POST en un frente ajeno -> 403', r.status_code)
    paso(sql("SELECT count(*) FROM saved_views WHERE name = 'zz_e4 de Carla en obra ajena'")[0] == 0,
         '  y no se escribio ninguna fila')

    for verbo, llamada in (('PUT', lambda: cli.put('/api/views/%s' % id_v2_ana, headers=carla,
                                                   json={'state': doc_v2()})),
                           ('PATCH', lambda: cli.patch('/api/views/%s' % id_v2_ana, headers=carla,
                                                       json={'name': 'zz_e4 secuestro'})),
                           ('DELETE', lambda: cli.delete('/api/views/%s' % id_v2_ana, headers=carla))):
        r = llamada()
        cuerpo = r.get_json() or {}
        paso(r.status_code == 403 and cuerpo.get('code') == 'PROJECT_FORBIDDEN',
             '  %s desde fuera de la obra -> 403 y NI SIQUIERA llega a la autoria' % verbo,
             'http=%s code=%s' % (r.status_code, cuerpo.get('code')))

    paso(sql("SELECT name FROM saved_views WHERE id = %s", (id_v2_ana,))[0].startswith('zz_e4'),
         '  la vista de Ana sigue como estaba')

    titulo('H · MIEMBRO DE LA OBRA, VISTA AJENA: LAS DOS CAPAS, POR SEPARADO')
    r = cli.get('/api/views/%s' % id_v2_ana, headers=beto)
    paso(r.status_code == 200, 'H · Beto ES de la obra: el ACCESO AL RECURSO pasa', r.status_code)
    permisos_beto = (r.get_json() or {}).get('permisos', {})
    paso(permisos_beto.get('actualizar') is False and permisos_beto.get('guardarComo') is True,
         'H · ...y la AUTORIA es la que dice que no puede modificarla', permisos_beto)
    r = cli.put('/api/views/%s' % id_v2_ana, headers=beto, json={'state': doc_v2()})
    paso(r.status_code == 403 and (r.get_json() or {}).get('motivo') == 'VISTA_DE_OTRA_PERSONA',
         'H · y el 403 lo da la AUTORIA (VISTA_DE_OTRA_PERSONA), no la obra',
         'http=%s motivo=%s' % (r.status_code, (r.get_json() or {}).get('motivo')))

    titulo('EL FRENTE QUE NO RESUELVE A NINGUNA OBRA')
    if ids_sin_obra:
        huerfana = ids_sin_obra[0]
        r = cli.get('/api/views/%s' % huerfana, headers=ana)
        paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'PROJECT_UNRESOLVED',
             'las 3 vistas de marzo (project_id vacio) -> 403 PROJECT_UNRESOLVED',
             'http=%s' % r.status_code)
        paso(cli.get('/api/views/%s' % huerfana, headers=admin).status_code == 200,
             '...salvo para el Entity Admin, que atraviesa')
        paso(cli.get('/api/views/%s' % huerfana).status_code == 200,
             'y su enlace compartido sigue abriendo: es la excepcion publica deliberada')
    r = cli.get('/api/views?project=' + FRENTE_SIN_OBRA, headers=ana)
    paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'PROJECT_UNRESOLVED',
         'un frente inventado no resuelve, y no resolver es NEGAR', r.status_code)

    titulo('I · EL ENLACE COMPARTIDO SIGUE SIENDO PUBLICO')
    r = cli.get('/api/views/%s' % ids_con_obra[0])
    paso(r.status_code == 200 and 'viewerState' in (r.get_json() or {}),
         'I · v1 sin sesion: abre y trae lo necesario para restaurar', r.status_code)
    r = cli.get('/api/views/%s' % id_v2_ana)
    paso(r.status_code == 200 and 'state' in (r.get_json() or {}),
         'I · v2 sin sesion: abre y trae `state`', r.status_code)
    paso('createdBy' not in (r.get_json() or {}) and 'permisos' not in (r.get_json() or {}),
         'I · y sigue sin decir de quien es')

    titulo('J · EL ORDEN DEL LISTADO')
    lista = cli.get('/api/views?project=' + FRENTE, headers=ana).get_json()
    orden = [(v['updatedAt'], v['createdAt'], v['name']) for v in lista]
    con_fecha = [o for o in orden if o[0]]
    sin_fecha = [o for o in orden if not o[0]]
    paso(all(orden[i][0] for i in range(len(con_fecha))),
         'J · las actualizadas van PRIMERO (updated_at DESC NULLS LAST)',
         [o[2] for o in orden])
    paso([o[0] for o in con_fecha] == sorted([o[0] for o in con_fecha], reverse=True),
         'J · y entre ellas, la mas reciente arriba')
    paso([o[1] for o in sin_fecha] == sorted([o[1] for o in sin_fecha], reverse=True),
         'J · las que nunca se tocaron desempatan por created_at DESC')
    paso(len(sin_fecha) > 0 and len(con_fecha) > 0,
         'J · la prueba tiene de los dos tipos (%d con updated_at, %d sin)'
         % (len(con_fecha), len(sin_fecha)))

    # ═══════════════════════════════════════════════ 16 · LAS 14 SIGUEN
    titulo('16. LAS %d VISTAS v1 DESPUES DE TODA LA BATERIA' % n_v1)
    with get_db_connection() as conn:      # se retiran las de la bateria
        c = conn.cursor()
        # Mismo criterio que la limpieza de entrada: lo que firma la bateria.
        c.execute("DELETE FROM saved_views WHERE created_by IS NOT NULL")
        conn.commit()

    huella_final = huella_de_la_tabla()
    paso(sql("SELECT count(*) FROM saved_views")[0] == n_v1,
         'siguen siendo %d' % n_v1, sql("SELECT count(*) FROM saved_views")[0])
    paso(sql("SELECT count(*) FROM saved_views WHERE schema_version = 1")[0] == n_v1,
         'las %d siguen en schema_version = 1' % n_v1)
    paso(sql("SELECT count(*) FROM saved_views WHERE state IS NOT NULL")[0] == 0,
         'ninguna adquirio un documento v2')
    paso(sql("SELECT count(*) FROM saved_views WHERE created_by IS NOT NULL")[0] == 0,
         'ninguna adquirio un autor inventado')
    paso(huella_final == huella_v1_inicial,
         'y la huella md5 de las %d filas es IDENTICA a la del principio' % n_v1,
         'difieren %d filas' % sum(1 for a, b in zip(huella_v1_inicial, huella_final) if a != b))

    print()
    print('=' * 78)
    fallos = sum(1 for ok, _ in _pasos if not ok)
    print('%d de %d pasan.' % (len(_pasos) - fallos, len(_pasos)))
    if fallos:
        print()
        for ok, texto in _pasos:
            if not ok:
                print('  FALLA  ' + texto)
    print('=' * 78)
    return 1 if fallos else 0


if __name__ == '__main__':
    sys.exit(main())
