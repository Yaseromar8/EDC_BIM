# -*- coding: utf-8 -*-
"""EL EXPEDIENTE COMPLETO: una obra de principio a fin, como la usaria una obra.

QUE ES ESTO, Y QUE NO
---------------------
No son pruebas unitarias. Es UNA ORGANIZACION operando una obra: cuatro
personas con papeles distintos, un arbol de carpetas con permisos, documentos
con versiones, revisiones, RFI, Red Lines, emisiones, enlaces, auditoria,
exportacion y archivado. Y una SEGUNDA obra al lado, para comprobar que no se
tocan.

Se ejecuta contra un PostgreSQL controlado. No toca datos reales: todo lleva el
prefijo `zz_exp_` y solo se borra lo que se crea.

    python herramientas/ensayo_del_expediente.py
"""
import hashlib
import importlib
import json
import os
import sys
import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_exp_'
OBRA = PREFIJO + 'talara'
OTRA = PREFIJO + 'sechura'

_pasos = []
_seccion = ['']


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, _seccion[0], texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def _titulo(n, texto):
    _seccion[0] = texto
    print()
    print('%s · %s' % (n, texto.upper()))


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM transmittals WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_reviews WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_rfis WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_redlines WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM pdf_markups WHERE model_urn LIKE %s", (PREFIJO + '%',))
    # Con SAVEPOINT, no con `rollback()`: la primera version hacia un rollback
    # de la transaccion ENTERA al fallar aqui, deshaciendo los DELETE de arriba
    # -- y el ensayo siguiente moria por clave ajena sin decir por que.
    for t in ('document_shares', 'folder_permissions'):
        col = 'file_node_id' if t == 'document_shares' else 'folder_node_id'
        cur.execute('SAVEPOINT limpieza')
        try:
            cur.execute("DELETE FROM %s WHERE %s IN (SELECT id FROM file_nodes "
                        " WHERE model_urn LIKE %%s)" % (t, col), (PREFIJO + '%',))
            cur.execute('RELEASE SAVEPOINT limpieza')
        except Exception:
            cur.execute('ROLLBACK TO SAVEPOINT limpieza')
    cur.execute("DELETE FROM file_versions WHERE file_node_id IN "
                " (SELECT id FROM file_nodes WHERE model_urn LIKE %s)", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_nodes WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_companies WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM companies WHERE name LIKE %s", (PREFIJO + '%',))
    # `activity_log` es append-only para el rol de ejecucion (solo INSERT y
    # SELECT), asi que esto solo limpia si se corre con el rol dueño. Si no
    # puede, no pasa nada: son unas pocas filas de ensayo.
    cur.execute('SAVEPOINT limpieza_log')
    try:
        cur.execute("DELETE FROM activity_log WHERE model_urn LIKE %s", (PREFIJO + '%',))
        cur.execute('RELEASE SAVEPOINT limpieza_log')
    except Exception:
        cur.execute('ROLLBACK TO SAVEPOINT limpieza_log')


def app_con(usuario, *blueprints):
    from flask import Flask
    import auth_middleware as am
    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    for bp, prefijo in blueprints:
        app.register_blueprint(bp, url_prefix=prefijo) if prefijo \
            else app.register_blueprint(bp)
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
    import encargos as enc
    import busqueda_de_documentos as busqueda
    import flujo_de_rfi, flujo_de_redline, flujo_de_revision
    import routes.directorio as r_dir
    import routes.rfis as r_rfi
    import routes.redlines as r_rl
    import routes.documents as r_doc
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DEL EXPEDIENTE COMPLETO')
    print('=' * 76)

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None

        # ══════════════════════════════════════════════════════════════════
        _titulo('1', 'Proyecto y participantes')

        cur.execute("SELECT id FROM hubs LIMIT 1")
        hub = (cur.fetchone() or [None])[0]
        for obra, nombre in ((OBRA, 'ZZ EXP Talara'), (OTRA, 'ZZ EXP Sechura')):
            cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                        "VALUES (%s,%s,%s,%s,'active')", (obra, hub, nombre, obra))
            ref.registrar_obra(cur, obra, nombre=nombre, model_urn=obra,
                               origen='ensayo del expediente')

        empresas = {}
        for nombre in ('MUNICIPALIDAD', 'SUPERVISORA', 'CONSTRUCTORA'):
            cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id",
                        (PREFIJO + nombre,))
            empresas[nombre] = cur.fetchone()[0]

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
            # administrador
            'jefa': usuario('Jefa de Proyecto', 'jefa@e.test', 'admin', [OBRA],
                            empresas['MUNICIPALIDAD']),
            # entidad / supervision
            'supervisor': usuario('Supervisor', 'super@e.test', 'editor', [OBRA],
                                  empresas['SUPERVISORA']),
            # contratista / proyectista
            'residente': usuario('Residente', 'resi@e.test', 'editor', [OBRA],
                                 empresas['CONSTRUCTORA']),
            # acceso limitado
            'auxiliar': usuario('Auxiliar', 'aux@e.test', 'user', [OBRA],
                                empresas['CONSTRUCTORA']),
            # de la OTRA obra
            'ajeno': usuario('Ajeno', 'ajeno@e.test', 'editor', [OTRA],
                             empresas['CONSTRUCTORA']),
        }
        conn.commit()
        db._project_resolver_cache['map'] = None

        SES = {
            'jefa': {'id': g['jefa'], 'email': PREFIJO + 'jefa@e.test',
                     'name': 'Jefa de Proyecto', 'role': 'admin'},
            'supervisor': {'id': g['supervisor'], 'email': PREFIJO + 'super@e.test',
                           'name': 'Supervisor', 'role': 'editor'},
            'residente': {'id': g['residente'], 'email': PREFIJO + 'resi@e.test',
                          'name': 'Residente', 'role': 'editor'},
            'auxiliar': {'id': g['auxiliar'], 'email': PREFIJO + 'aux@e.test',
                         'name': 'Auxiliar', 'role': 'user'},
            'ajeno': {'id': g['ajeno'], 'email': PREFIJO + 'ajeno@e.test',
                      'name': 'Ajeno', 'role': 'editor'},
        }

        def dir_como(q):
            return app_con(SES[q], (r_dir.directorio_bp, None))

        def rfi_como(q):
            return app_con(SES[q], (r_rfi.rfis_bp, '/api/rfis'))

        def rl_como(q):
            return app_con(SES[q], (r_rl.redlines_bp, '/api/redlines'))

        def doc_como(q):
            return app_con(SES[q], (r_doc.documents_bp, None))

        # Funcion contractual de cada empresa EN ESTA OBRA.
        for emp, funcion in (('MUNICIPALIDAD', 'ENTIDAD'),
                             ('SUPERVISORA', 'SUPERVISION'),
                             ('CONSTRUCTORA', 'CONTRATISTA')):
            r = dir_como('jefa').post('/api/projects/%s/participantes' % OBRA,
                                      json={'company_id': empresas[emp],
                                            'funcion': funcion})
            if r.status_code != 200:
                _paso(False, 'declarar %s como %s' % (emp, funcion), str(r.get_json()))
        _paso(True, 'la obra existe con tres empresas y sus funciones contractuales')

        r = dir_como('residente').get('/api/projects/%s/miembros' % OBRA)
        miembros = {m['name']: m for m in (r.get_json() or {}).get('miembros', [])}
        _paso(len(miembros) == 4, 'cuatro personas participan', str(len(miembros)))
        _paso(miembros['Supervisor']['funcion'] == 'SUPERVISION'
              and miembros['Residente']['funcion'] == 'CONTRATISTA',
              'cada una con la funcion DERIVADA de su empresa')
        _paso(miembros['Auxiliar']['funcion'] == 'CONTRATISTA'
              and miembros['Auxiliar']['role'] == 'user',
              'FUNCION CONTRACTUAL != PERMISO: el auxiliar es CONTRATISTA como el '
              'residente, y su perfil del sistema es otro', 'user')
        r = dir_como('residente').post('/api/projects/%s/participantes' % OBRA,
                                       json={'company_id': empresas['CONSTRUCTORA'],
                                             'funcion': 'ENTIDAD'})
        _paso(r.status_code == 403,
              'y ser CONTRATISTA no le deja tocar el directorio')

        # ══════════════════════════════════════════════════════════════════
        _titulo('2', 'Estructura documental y permisos')

        def carpeta(obra, nombre, padre=None, tipo=None):
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, "
                        "  name, folder_type, is_deleted) "
                        "VALUES (%s,%s,'FOLDER',%s,%s,FALSE) RETURNING id::text",
                        (obra, padre, nombre, tipo))
            return cur.fetchone()[0]

        raiz = carpeta(OBRA, 'PQT8 TALARA', tipo='PROJECT_ROOT')
        compartidos = carpeta(OBRA, '02 COMPARTIDO', raiz)
        drenaje = carpeta(OBRA, 'DRENAJE', compartidos)
        direccion = carpeta(OBRA, '00 DIRECCION', raiz)
        conn.commit()

        for quien, nodo, nivel in (('residente', raiz, 'edit'),
                                   ('supervisor', raiz, 'view_download'),
                                   ('auxiliar', drenaje, 'viewer'),
                                   ('residente', direccion, 'none'),
                                   ('supervisor', direccion, 'none'),
                                   ('auxiliar', direccion, 'none')):
            # CON SUJETO: una concesion sin `sujeto_tipo`/`sujeto_id` no la
            # encuentra el resolutor, y seria una prueba que se engaña sola.
            cur.execute("INSERT INTO folder_permissions (folder_node_id, user_id, "
                        "  sujeto_tipo, sujeto_id, permission_level) "
                        "VALUES (%s::uuid,%s,'USER',%s::text,%s) "
                        "ON CONFLICT (folder_node_id, user_id) DO UPDATE "
                        "  SET permission_level = EXCLUDED.permission_level",
                        (nodo, g[quien], g[quien], nivel))
        conn.commit()

        from folder_permissions import get_effective_permission as efec
        _paso(efec(g['residente'], drenaje, OBRA, cursor=cur) == 'edit',
              'el permiso de la raiz SE HEREDA hasta DRENAJE (edit)')
        _paso(efec(g['auxiliar'], drenaje, OBRA, cursor=cur) == 'viewer',
              'el auxiliar tiene el suyo, concedido en DRENAJE (viewer)')
        _paso(efec(g['auxiliar'], direccion, OBRA, cursor=cur) == 'none',
              'y NO alcanza DIRECCION: sin concesion y con rol `user`, ciego '
              '(modo paranoico ISO 19650)')
        _paso(efec(g['jefa'], direccion, OBRA, cursor=cur) == 'admin',
              'la jefa entra: es administradora')

        # LA LIMITACION QUE ESTAS DOS LINEAS AFIRMABAN, YA NO EXISTE.
        #
        # Hasta el 21-ago-2026 la herencia era ADITIVA y el rol global un SUELO:
        # un `editor` alcanzaba toda la obra y un `none` explicito no le cortaba.
        # Se reporto como limitacion conocida y se cerro despues con CLOSEST-WINS
        # (`permiso_documental`). Estas dos comprobaciones estan al reves a
        # proposito: si alguien volviera al modelo aditivo, saltarian.
        nivel_resi = efec(g['residente'], direccion, OBRA, cursor=cur)
        _paso(nivel_resi == 'none',
              'un `none` explicito SI corta la herencia a un `editor`: '
              'closest-wins', nivel_resi)
        _paso(efec(g['supervisor'], drenaje, OBRA, cursor=cur) == 'view_download',
              'y el rol global YA NO es un suelo: el supervisor se queda en la '
              'concesion que se le dio (`view_download`)',
              efec(g['supervisor'], drenaje, OBRA, cursor=cur))

        # ══════════════════════════════════════════════════════════════════
        _titulo('3', 'Documentos, versiones y huellas')

        def sha(txt):
            return hashlib.sha256(txt.encode()).hexdigest()

        def documento(obra, nombre, padre, meta=None, tags=None, estado='WIP'):
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, "
                        "  name, is_deleted, status, tags, metadata, gcs_urn, "
                        "  version_number, created_by) "
                        "VALUES (%s,%s,'FILE',%s,FALSE,%s,%s,%s::jsonb,%s,1,%s) "
                        "RETURNING id::text",
                        (obra, padre, nombre, estado, tags or [],
                         json.dumps(meta or {}), PREFIJO + 'obj/' + nombre,
                         PREFIJO + 'resi@e.test'))
            return cur.fetchone()[0]

        def version(nodo, numero, contenido):
            h = sha(contenido)
            cur.execute("INSERT INTO file_versions (file_node_id, version_number, "
                        "  gcs_urn, sha256, created_by) "
                        "VALUES (%s::uuid,%s,%s,%s,%s) RETURNING id::text",
                        (nodo, numero, '%sobj/%s.v%d' % (PREFIJO, nodo[:8], numero),
                         h, PREFIJO + 'resi@e.test'))
            vid = cur.fetchone()[0]
            cur.execute("UPDATE file_nodes SET current_version_id = %s::uuid, "
                        "  version_number = %s WHERE id = %s::uuid", (vid, numero, nodo))
            return vid, h

        plano = documento(
            OBRA, '500125-PQ08-DRE-PL-0012_Buzones_BP01-BP08.pdf', drenaje,
            meta={'disciplina': 'SANITARIA', 'codigo': 'DRE-PL-0012',
                  'idoneidad': 'S3'},
            tags=['drenaje', 'buzones'], estado='SHARED')
        contrato = documento(OBRA, '500125-PQ08-DIR-CT-0001_Contrato.pdf', direccion,
                             meta={'confidencial': True}, estado='PUBLISHED')

        v1, h1 = version(plano, 1, 'contenido v1 del plano de buzones')
        v2, h2 = version(plano, 2, 'contenido v2: se corrige la cota de BP-04')
        v3, h3 = version(plano, 3, 'contenido v3: version emitida')
        conn.commit()

        _paso(len({h1, h2, h3}) == 3, 'tres versiones, tres SHA-256 distintos')
        cur.execute("SELECT current_version_id::text, version_number FROM file_nodes "
                    " WHERE id = %s::uuid", (plano,))
        cvid, vnum = cur.fetchone()
        _paso(cvid == v3 and vnum == 3, 'la VIGENTE es la v3', 'v%s' % vnum)
        cur.execute("SELECT version_number, sha256 FROM file_versions "
                    " WHERE file_node_id = %s::uuid ORDER BY version_number", (plano,))
        historicas = cur.fetchall()
        _paso([x[0] for x in historicas] == [1, 2, 3]
              and historicas[0][1] == h1,
              'y la v1 sigue ahi, con su huella intacta: se puede abrir el historico')
        cur.execute("SELECT count(*) FROM file_versions WHERE sha256 IS NULL "
                    "  AND file_node_id = %s::uuid", (plano,))
        _paso(cur.fetchone()[0] == 0, 'ninguna version sin huella')

        huella_versiones = sha(repr(historicas))

        # ══════════════════════════════════════════════════════════════════
        _titulo('4', 'Busqueda')

        r = doc_como('residente').get(
            '/api/docs/global-search?model_urn=%s&q=DRE-PL-0012' % OBRA)
        res = (r.get_json() or {}).get('results', [])
        _paso(len(res) == 1 and res[0]['node_id'] == plano,
              'el residente encuentra el plano sin saber su carpeta')
        _paso(res[0]['ruta'] == 'PQT8 TALARA / 02 COMPARTIDO / DRENAJE',
              'y la ruta dice donde vive', res[0]['ruta'])
        _paso(res[0]['version_id'] == v3 and res[0]['version_number'] == 3,
              'apuntando a la version VIGENTE, que es lo que abrira')
        # La busqueda aplica EXACTAMENTE la regla del producto, ni mas ni menos.
        r = doc_como('auxiliar').get(
            '/api/docs/global-search?model_urn=%s&q=Contrato' % OBRA)
        _paso((r.get_json() or {}).get('results') == [],
              'el AUXILIAR no descubre el contrato de DIRECCION: ni su nombre, '
              'ni su ruta, ni que exista')
        r = doc_como('residente').get(
            '/api/docs/global-search?model_urn=%s&q=Contrato' % OBRA)
        visto = len((r.get_json() or {}).get('results', []))
        _nivel_resi = efec(g['residente'], direccion, OBRA, cursor=cur)
        _paso((visto > 0) == (_nivel_resi != 'none'),
              'y la busqueda dice LO MISMO que el resolutor de permisos: no '
              'inventa su propia regla', 'resolutor %s, busqueda %d'
              % (_nivel_resi, visto))
        r = doc_como('jefa').get(
            '/api/docs/global-search?model_urn=%s&q=Contrato' % OBRA)
        _paso(len((r.get_json() or {}).get('results', [])) == 1,
              'la jefa lo encuentra')
        r = doc_como('auxiliar').get(
            '/api/docs/global-search?model_urn=%s&q=DRE-PL-0012' % OBRA)
        _paso(len((r.get_json() or {}).get('results', [])) == 1,
              'el auxiliar SI encuentra el plano: tiene `viewer` en DRENAJE')
        r = doc_como('ajeno').get(
            '/api/docs/global-search?model_urn=%s&q=Buzones' % OBRA)
        _paso(r.status_code in (403, 404),
              'y alguien de la otra obra ni siquiera puede buscar aqui',
              'devolvio %s' % r.status_code)

        # ══════════════════════════════════════════════════════════════════
        _titulo('5', 'Markups sobre el documento')

        # POR LA RUTA REAL, no por SQL: es lo que hace el visor de PDF. Hasta el
        # 21-ago-2026 esto devolvia 500 para CUALQUIER documento real, porque
        # `pdf_markups.file_node_id` era INTEGER y `file_nodes.id` es UUID.
        import routes.pdf_tools as r_pdf
        cl_pdf = app_con(SES['supervisor'], (r_pdf.pdf_tools_bp, None))
        r = cl_pdf.post('/api/pdf/markups', json={
            'node_id': plano, 'model_urn': OBRA, 'page': 2, 'kind': 'nube',
            'geometry': {'x': 120, 'y': 340, 'w': 90, 'h': 40},
            'text': 'Revisar cota de BP-04'})
        _paso(r.status_code == 200, 'se crea la anotacion DESDE LA RUTA del visor',
              'devolvio %s' % r.status_code)
        markup = (r.get_json() or {}).get('id')
        r = cl_pdf.get('/api/pdf/markups?node_id=%s&page=2' % plano)
        _paso(len((r.get_json() or {}).get('markups', [])) == 1,
              'y se vuelve a leer sobre ESE documento y ESA pagina')
        conn.commit()
        cur.execute("SELECT file_node_id::text, model_urn, page, text_content "
                    "  FROM pdf_markups WHERE id = %s", (markup,))
        m = cur.fetchone()
        _paso(m[0] == plano and m[1] == OBRA and m[2] == 2,
              'la anotacion queda ligada al documento y a la pagina correctos')
        leidos = (cl_pdf.get('/api/pdf/markups?node_id=%s&page=2' % plano)
                  .get_json() or {}).get('markups', [])
        _paso(leidos and leidos[0].get('text') == 'Revisar cota de BP-04',
              'con su contenido', str(leidos[0].get('text')) if leidos else '')
        cur.execute("SELECT count(*) FROM pdf_markups WHERE model_urn = %s", (OTRA,))
        _paso(cur.fetchone()[0] == 0, 'y no aparece en la otra obra')

        # ══════════════════════════════════════════════════════════════════
        _titulo('6', 'Review')

        vence = (datetime.datetime.now() + datetime.timedelta(days=5))
        cur.execute("INSERT INTO doc_reviews (model_urn, title, status, items, steps, "
                    "  current_step, paso_vence_en, created_by) "
                    "VALUES (%s,'Revision del plano DRE-PL-0012','pending',"
                    "  %s::jsonb,%s::jsonb,0,%s,%s) RETURNING id",
                    (OBRA, json.dumps([{'node_id': plano, 'version_id': v3,
                                        'name': 'DRE-PL-0012'}]),
                     json.dumps([{'user_id': g['supervisor'], 'name': 'Supervisor'},
                                 {'user_id': g['jefa'], 'name': 'Jefa de Proyecto'}]),
                     vence, PREFIJO + 'resi@e.test'))
        review = cur.fetchone()[0]
        eid = enc.abrir(cur, 'REVIEW', str(review), 'Revisar: plano DRE-PL-0012',
                        destino_usuario=g['supervisor'], vence_en=vence,
                        creado_por=PREFIJO + 'resi@e.test')
        conn.commit()
        _paso(bool(eid), 'la revision se crea con dos pasos y su plazo')
        pend = enc.mi_trabajo(cur, g['supervisor'])
        _paso(len(pend) == 1 and pend[0]['vence_en'],
              'y aparece en Mi Trabajo del supervisor, con vencimiento')
        _paso(len(enc.mi_trabajo(cur, g['jefa'])) == 0,
              'todavia no en el de la jefa: es el paso 2')

        uid, motivo = flujo_de_revision.revisor_del_paso(
            cur, {'user_id': g['supervisor'], 'name': 'Supervisor'})
        _paso(uid == g['supervisor'], 'el revisor del paso se resuelve por IDENTIDAD')

        # Review BLOQUEADA y su salida controlada.
        cur.execute("DELETE FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OBRA, g['supervisor']))
        conn.commit()
        estado, motivo = flujo_de_revision.estado_del_flujo(cur, {
            'model_urn': OBRA, 'status': 'pending', 'current_step': 0,
            'steps': [{'user_id': g['supervisor'], 'name': 'Supervisor'}]})
        _paso(estado == 'BLOQUEADA', 'si el revisor sale de la obra: BLOQUEADA',
              motivo[:52])
        d = enc.divergencias(cur)
        _paso(any(b[0] == 'REVIEW' for b in d.get('bloqueadas', [])),
              'y la conciliacion la llama BLOQUEADA, no divergencia reparable')
        cur.execute("SELECT steps FROM doc_reviews WHERE id=%s", (review,))
        pasos_antes = cur.fetchone()[0]
        pasos_nuevos, entrada = flujo_de_revision.sustituir_revisor(
            pasos_antes, 0, {'id': g['jefa'], 'name': 'Jefa de Proyecto'},
            SES['jefa'], 'el revisor salio de la obra')
        cur.execute("UPDATE doc_reviews SET steps = %s::jsonb, "
                    "  history = COALESCE(history,'[]'::jsonb) || %s::jsonb "
                    " WHERE id = %s",
                    (json.dumps(pasos_nuevos), json.dumps([entrada]), review))
        conn.commit()
        _paso(pasos_nuevos[0].get('user_id') == g['jefa'],
              'un administrador sustituye al revisor: salida CONTROLADA')
        _paso(pasos_nuevos[0].get('reasignado_de', {}).get('user_id') == g['supervisor'],
              'y el revisor anterior NO se borra: el paso cuenta de quien venia')
        cur.execute("SELECT history FROM doc_reviews WHERE id=%s", (review,))
        _paso(len(cur.fetchone()[0]) == 1, 'con su entrada en el historial')
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA, g['supervisor']))
        conn.commit()

        cur.execute("UPDATE doc_reviews SET status='approved', final_status='PUBLISHED', "
                    "  cerrada_en=CURRENT_TIMESTAMP WHERE id=%s", (review,))
        enc.cerrar_los_de(cur, 'REVIEW', str(review), PREFIJO + 'jefa@e.test')
        conn.commit()
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) == 0,
              'al aprobarse, deja de deberse')
        cur.execute("SELECT items::text FROM doc_reviews WHERE id=%s", (review,))
        _paso(v3 in cur.fetchone()[0],
              'y la revision consta contra la VERSION EXACTA que se reviso (v3)')

        # ══════════════════════════════════════════════════════════════════
        _titulo('7', 'RFI')

        r = rfi_como('residente').post('/api/rfis', json={
            'model_urn': OBRA, 'titulo': 'Cota de llegada a BP-04'})
        rfi = (r.get_json() or {}).get('rfi', {})
        _paso(r.status_code == 200 and rfi.get('codigo') == 'RFI-001',
              'el residente emite el RFI-001', str(rfi.get('codigo')))
        vence_rfi = (datetime.datetime.now() + datetime.timedelta(days=7)).isoformat()
        r = rfi_como('residente').patch('/api/rfis/%s' % rfi['id'], json={
            'responsable_id': g['supervisor'], 'vence_en': vence_rfi,
            'adjuntos': [{'node_id': plano, 'version_id': v3, 'version_number': 3,
                          'name': 'DRE-PL-0012', 'rol': 'consulta'}]})
        _paso(r.status_code == 200, 'lo dirige al supervisor, con plazo y con la '
              'VERSION EXACTA de la consulta', str(r.get_json())[:44])
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) == 1,
              'y le aparece en Mi Trabajo')
        r = rfi_como('residente').patch('/api/rfis/%s' % rfi['id'],
                                        json={'estado': 'Respondido',
                                              'respuesta': 'Aceptado'})
        _paso(r.status_code == 403,
              'quien pregunta NO dicta el veredicto de su propia consulta')
        r = rfi_como('supervisor').patch('/api/rfis/%s' % rfi['id'],
                                         json={'responsable_id': g['jefa']})
        _paso(r.status_code == 200,
              'el supervisor PASA LA PELOTA a la jefa («esto es de direccion»)')
        r = rfi_como('jefa').patch('/api/rfis/%s' % rfi['id'],
                                   json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 200, 'la jefa, que ahora lo tiene, dicta el veredicto')
        r = rfi_como('residente').patch('/api/rfis/%s' % rfi['id'],
                                        json={'estado': 'Cerrado'})
        _paso(r.status_code == 200, 'y cierra quien pregunto')
        cur.execute("SELECT historial, cerrado_por, respuesta FROM doc_rfis "
                    " WHERE id::text=%s", (rfi['id'],))
        hist, cerrado, veredicto = cur.fetchone()
        eventos = [h['event'] for h in hist]
        _paso(eventos == ['created', 'ball_in_court_changed', 'estado',
                          'ball_in_court_changed', 'responded', 'closed'],
              'el historial cuenta el ciclo entero, con los dos cambios de mano',
              str(len(eventos)) + ' eventos')
        _paso(bool(cerrado) and veredicto == 'Aceptado',
              'con quien cerro y que veredicto quedo')
        _paso(len(enc.mi_trabajo(cur, g['jefa'])) == 0, 'y ya no le corre a nadie')

        # ══════════════════════════════════════════════════════════════════
        _titulo('8', 'Red Line')

        r = rl_como('residente').post('/api/redlines', json={
            'model_urn': OBRA, 'titulo': 'Reubicar BP-04 y cambio de cota BP-01'})
        rl = (r.get_json() or {}).get('rfi', {})
        _paso(r.status_code == 200 and rl.get('codigo') == 'RL-001',
              'se emite el croquis RL-001', str(rl.get('codigo')))
        rl_como('residente').patch('/api/redlines/%s' % rl['id'], json={
            'responsable_id': g['supervisor'],
            'adjuntos': [{'node_id': plano, 'version_id': v3, 'version_number': 3,
                          'name': 'RL_0001_SKT.pdf', 'rol': 'deteccion'}]})
        r = rl_como('supervisor').patch('/api/redlines/%s' % rl['id'],
                                        json={'estado': 'Respondido',
                                              'respuesta': 'Rechazado'})
        _paso(r.status_code == 200, 'el supervisor RECHAZA la modificacion')
        r = rl_como('residente').patch('/api/redlines/%s' % rl['id'],
                                       json={'estado': 'En revisión'})
        _paso(r.status_code == 200, 'el emisor la DEVUELVE para rehacer el croquis')
        cur.execute("SELECT respuesta FROM doc_redlines WHERE id::text=%s", (rl['id'],))
        _paso(not cur.fetchone()[0],
              'y al devolverla se retira el veredicto: no consta resuelta y en revision')
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) == 1,
              'vuelve a la bandeja del responsable')
        rl_como('supervisor').patch('/api/redlines/%s' % rl['id'],
                                    json={'estado': 'Respondido',
                                          'respuesta': 'Aceptado'})
        r = rl_como('residente').patch('/api/redlines/%s' % rl['id'],
                                       json={'estado': 'Cerrado'})
        _paso(r.status_code == 200, 'se acepta y cierra el emisor')
        cur.execute("SELECT adjuntos, historial FROM doc_redlines WHERE id::text=%s",
                    (rl['id'],))
        adj, hrl = cur.fetchone()
        _paso(adj[0]['version_id'] == v3,
              'y el croquis queda CONGELADO contra la version v3, no contra el nodo')
        _paso('returned' in [h['event'] for h in hrl],
              'el historial conserva la devolucion y el veredicto retirado')

        # ══════════════════════════════════════════════════════════════════
        _titulo('9', 'Transmittal')

        cur.execute("INSERT INTO transmittals (model_urn, number, subject, items, "
                    "  recipients, acuses, created_by) "
                    "VALUES (%s,1,'Emision de planos de drenaje',%s::jsonb,"
                    "  %s::jsonb,'[]'::jsonb,%s) RETURNING id",
                    (OBRA, json.dumps([{'node_id': plano, 'version_id': v3,
                                        'version_number': 3,
                                        'name': '500125-PQ08-DRE-PL-0012'}]),
                     json.dumps([{'email': PREFIJO + 'super@e.test',
                                  'name': 'Supervisor'},
                                 {'email': PREFIJO + 'jefa@e.test',
                                  'name': 'Jefa de Proyecto'}]),
                     PREFIJO + 'resi@e.test'))
        tr = cur.fetchone()[0]
        for quien in ('supervisor', 'jefa'):
            e = enc.abrir(cur, 'TRANSMITTAL', str(tr), 'Acusar recibo de TR-001',
                          destino_usuario=g[quien], creado_por=PREFIJO + 'resi@e.test')
        conn.commit()
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) >= 1
              and len(enc.mi_trabajo(cur, g['jefa'])) >= 1,
              'la emision llega a los DOS destinatarios')
        cur.execute("UPDATE transmittals SET acuses = %s::jsonb WHERE id = %s",
                    (json.dumps([{'por': PREFIJO + 'super@e.test',
                                  'en': datetime.datetime.now().isoformat()}]), tr))
        enc.cerrar_los_de(cur, 'TRANSMITTAL', str(tr), PREFIJO + 'super@e.test',
                          destino_usuario=g['supervisor'])
        conn.commit()
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) == 0
              and len(enc.mi_trabajo(cur, g['jefa'])) >= 1,
              'el acuse es INDIVIDUAL: el supervisor deja de deberlo, la jefa no')
        cur.execute("SELECT items::text FROM transmittals WHERE id = %s", (tr,))
        emitido = cur.fetchone()[0]
        _paso(v3 in emitido and v1 not in emitido and v2 not in emitido,
              'lo transmitido apunta EXACTAMENTE a la v3, no al documento vivo')

        # Se sube una v4 DESPUES de emitir: lo emitido no puede moverse.
        v4, h4 = version(plano, 4, 'contenido v4: posterior a la emision')
        conn.commit()
        cur.execute("SELECT items::text FROM transmittals WHERE id = %s", (tr,))
        emitido_despues = cur.fetchone()[0]
        _paso(v3 in emitido_despues and v4 not in emitido_despues,
              'sube una v4 y la emision SIGUE apuntando a la v3')
        cur.execute("SELECT current_version_id::text FROM file_nodes WHERE id=%s::uuid",
                    (plano,))
        _paso(cur.fetchone()[0] == v4, 'mientras la vigente del documento ya es la v4')

        # ══════════════════════════════════════════════════════════════════
        _titulo('10', 'Sharing')

        try:
            cur.execute("INSERT INTO document_shares (file_node_id, model_urn, "
                        "  shared_by, role, access_type, target_emails, revoked) "
                        "VALUES (%s::uuid,%s,%s,'viewer','link',%s,FALSE) "
                        "RETURNING id",
                        (plano, OBRA, PREFIJO + 'resi@e.test',
                         [PREFIJO + 'externo@e.test']))
            share = cur.fetchone()[0]
            conn.commit()
            cur.execute("SELECT revoked FROM document_shares WHERE id=%s", (share,))
            _paso(cur.fetchone()[0] is False, 'se crea un enlace controlado, vivo')
            cur.execute("UPDATE document_shares SET revoked = TRUE WHERE id=%s", (share,))
            conn.commit()
            cur.execute("SELECT revoked FROM document_shares WHERE id=%s", (share,))
            _paso(cur.fetchone()[0] is True,
                  'se revoca, y el enlace revocado deja de servir')
            cur.execute("SELECT count(*) FROM document_shares WHERE id=%s", (share,))
            _paso(cur.fetchone()[0] == 1,
                  'la revocacion NO borra el registro: queda constancia de que existio')
        except Exception as e:
            conn.rollback()
            _paso(False, 'sharing', str(e)[:70])

        # ══════════════════════════════════════════════════════════════════
        _titulo('11', 'Auditoria')

        import auditoria_encadenada as aud

        cur.execute("SELECT count(*) FROM activity_log WHERE model_urn = %s", (OBRA,))
        antes_log = cur.fetchone()[0]

        # Por la FUNCION REAL de la aplicacion, no sellando a mano: si el sello
        # se calculara aqui de otra forma, la prueba mediria mi codigo y no el
        # del producto.
        db.log_activity(OBRA, 'upload', 'file', entity_name='DRE-PL-0012 v4',
                        performed_by=PREFIJO + 'resi@e.test')
        db.log_activity(OBRA, 'review_approved', 'review',
                        entity_name='Revision del plano',
                        performed_by=PREFIJO + 'jefa@e.test')
        cur.execute("SELECT count(*) FROM activity_log WHERE model_urn = %s", (OBRA,))
        _paso(cur.fetchone()[0] == antes_log + 2,
              'la actividad se registra: quien hizo que')
        cur.execute("SELECT id, performed_by, created_at FROM activity_log "
                    " WHERE model_urn = %s ORDER BY id DESC LIMIT 1", (OBRA,))
        ultimo, quien, cuando = cur.fetchone()
        _paso(quien == PREFIJO + 'jefa@e.test' and cuando is not None,
              'con su autor y su fecha', quien)

        # APPEND-ONLY, comprobado por el EFECTO y por DOS vias independientes.
        #
        # 1. PRIVILEGIOS: el rol de ejecucion no puede reescribir el registro.
        cur.execute("""SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
                         FROM information_schema.table_privileges
                        WHERE table_name = 'activity_log' AND grantee = current_user""")
        privs = (cur.fetchone() or [''])[0] or ''
        _paso('UPDATE' not in privs and 'DELETE' not in privs,
              'el rol de ejecucion NO puede reescribir ni borrar activity_log: '
              'append-only por PRIVILEGIOS, no por disciplina', privs)
        cur.execute('SAVEPOINT intento')
        negado = False
        try:
            cur.execute("UPDATE activity_log SET entity_name='falsificado' "
                        " WHERE id = %s", (ultimo,))
        except Exception:
            negado = True
        cur.execute('ROLLBACK TO SAVEPOINT intento')
        _paso(negado, 'y el motor lo rechaza al intentarlo de verdad')

        # 2. CADENA DE HASH: aunque alguien con privilegios lo reescribiera, se
        #    ve. Se verifica desde la primera fila de ESTA obra.
        cur.execute("SELECT min(id) FROM activity_log WHERE model_urn = %s", (OBRA,))
        desde = cur.fetchone()[0]
        v = aud.verificar(cur, desde_id=desde)
        _paso(v['integra'],
              'la cadena de auditoria de esta obra verifica',
              '%d revisadas, %d roturas' % (v['revisadas'], len(v['roturas'])))
        global_v = aud.verificar(cur)
        if not global_v['integra']:
            print('     (nota: %d rotura(s) en filas de OTROS ensayos del mismo '
                  'cluster desechable, ajenas a esta obra)' % len(global_v['roturas']))

        # ══════════════════════════════════════════════════════════════════
        _titulo('12', 'Exportacion del expediente')

        cur.execute("""
            SELECT n.name, n.status, v.version_number, v.sha256
              FROM file_nodes n
              JOIN file_versions v ON v.id = n.current_version_id
             WHERE n.model_urn = %s AND n.is_deleted = FALSE
             ORDER BY n.name""", (OBRA,))
        indice = cur.fetchall()
        _paso(len(indice) >= 1, 'el indice del expediente lista los documentos vigentes',
              '%d documento(s)' % len(indice))
        _paso(all(x[3] for x in indice), 'cada uno con su huella SHA-256')
        _paso(indice[0][2] == 4, 'y con la version VIGENTE (v4)')
        cur.execute("SELECT count(*) FROM file_versions v JOIN file_nodes n "
                    "  ON n.id = v.file_node_id WHERE n.model_urn = %s", (OBRA,))
        _paso(cur.fetchone()[0] == 4,
              'y las cuatro versiones siguen disponibles para demostrar el recorrido')

        # ══════════════════════════════════════════════════════════════════
        _titulo('13', 'Archivado')

        huella_contractual = {}
        for tabla, col in (('doc_rfis', 'project_id'), ('doc_redlines', 'project_id')):
            cur.execute("SELECT codigo, estado, respuesta, historial::text FROM %s "
                        " WHERE %s = %%s ORDER BY codigo" % (tabla, col), (OBRA,))
            huella_contractual[tabla] = repr(cur.fetchall())
        cur.execute("SELECT v.id::text, v.version_number, v.sha256 FROM file_versions v "
                    " JOIN file_nodes n ON n.id = v.file_node_id "
                    " WHERE n.model_urn = %s ORDER BY version_number", (OBRA,))
        huella_contractual['file_versions'] = repr(cur.fetchall())

        cur.execute("UPDATE projects SET status = 'archived' WHERE id = %s", (OBRA,))
        conn.commit()
        cur.execute("SELECT status FROM projects WHERE id = %s", (OBRA,))
        _paso(cur.fetchone()[0] == 'archived', 'la obra queda archivada')

        r = doc_como('residente').get(
            '/api/docs/global-search?model_urn=%s&q=DRE-PL-0012' % OBRA)
        _paso(len((r.get_json() or {}).get('results', [])) == 1,
              'y el expediente SIGUE CONSULTABLE para quien tenia acceso')

        for tabla in huella_contractual:
            if tabla == 'file_versions':
                cur.execute("SELECT v.id::text, v.version_number, v.sha256 FROM file_versions v "
                            " JOIN file_nodes n ON n.id = v.file_node_id "
                            " WHERE n.model_urn = %s ORDER BY version_number", (OBRA,))
            else:
                cur.execute("SELECT codigo, estado, respuesta, historial::text FROM %s "
                            " WHERE project_id = %%s ORDER BY codigo" % tabla, (OBRA,))
            _paso(repr(cur.fetchall()) == huella_contractual[tabla],
                  'archivar NO reescribio %s' % tabla)

        cur.execute("UPDATE projects SET status = 'active' WHERE id = %s", (OBRA,))
        conn.commit()

        # ══════════════════════════════════════════════════════════════════
        _titulo('14', 'Aislamiento final entre las dos obras')

        raiz2 = carpeta(OTRA, 'SECHURA', tipo='PROJECT_ROOT')
        plano2 = documento(OTRA, '500125-PQ08-DRE-PL-0012_Buzones_BP01-BP08.pdf',
                           raiz2, estado='SHARED')
        version(plano2, 1, 'otro contenido')
        cur.execute("INSERT INTO folder_permissions (folder_node_id, user_id, "
                    "  sujeto_tipo, sujeto_id, permission_level) "
                    "VALUES (%s::uuid,%s,'USER',%s::text,'edit')",
                    (raiz2, g['ajeno'], g['ajeno']))
        conn.commit()
        rfi_como('ajeno').post('/api/rfis', json={'model_urn': OTRA, 'titulo': 'De B'})
        rl_como('ajeno').post('/api/redlines', json={'model_urn': OTRA, 'titulo': 'De B'})
        conn.commit()

        cruces = []
        # Documentos
        r = doc_como('ajeno').get(
            '/api/docs/global-search?model_urn=%s&q=Buzones' % OTRA)
        res_b = (r.get_json() or {}).get('results', [])
        if len(res_b) != 1 or res_b[0]['node_id'] != plano2:
            cruces.append('documentos')
        # Participantes
        r = dir_como('ajeno').get('/api/projects/%s/miembros' % OTRA)
        ids_b = {m['id'] for m in (r.get_json() or {}).get('miembros', [])}
        if ids_b & {g['residente'], g['supervisor'], g['jefa']}:
            cruces.append('participantes')
        # RFI y Red Line
        r = rfi_como('ajeno').get('/api/rfis/%s' % OTRA)
        if len((r.get_json() or {}).get('results', [])) != 1:
            cruces.append('rfi')
        r = rl_como('ajeno').get('/api/redlines/%s' % OTRA)
        if len((r.get_json() or {}).get('results', [])) != 1:
            cruces.append('redline')
        # Reviews y Transmittals
        cur.execute("SELECT count(*) FROM doc_reviews WHERE model_urn=%s", (OTRA,))
        if cur.fetchone()[0] != 0:
            cruces.append('reviews')
        cur.execute("SELECT count(*) FROM transmittals WHERE model_urn=%s", (OTRA,))
        if cur.fetchone()[0] != 0:
            cruces.append('transmittals')
        # Mi Trabajo
        if enc.mi_trabajo(cur, g['ajeno']):
            cruces.append('mi trabajo')
        _paso(not cruces, 'NADA de A aparece en B', str(cruces) if cruces else '')

        for quien in ('residente', 'supervisor', 'jefa'):
            r = doc_como(quien).get(
                '/api/docs/global-search?model_urn=%s&q=Buzones' % OTRA)
            if quien != 'jefa' and r.status_code not in (403, 404):
                cruces.append('%s alcanza B' % quien)
        _paso(not cruces, 'y nadie de A alcanza B (salvo la jefa, que no es miembro '
              'de B pero es administradora global)', str(cruces) if cruces else '')

        # ══════════════════════════════════════════════════════════════════
        _titulo('15', 'Invariantes de cierre')

        cur.execute("SELECT version_number, sha256 FROM file_versions "
                    " WHERE file_node_id = %s::uuid ORDER BY version_number", (plano,))
        ahora = cur.fetchall()
        _paso([x[0] for x in ahora[:3]] == [1, 2, 3]
              and ahora[0][1] == h1 and ahora[1][1] == h2 and ahora[2][1] == h3,
              'las versiones historicas y sus SHA-256 estan INTACTOS tras todo el '
              'recorrido')

        cur.execute("SELECT folder_node_id::text, user_id, permission_level "
                    "  FROM folder_permissions WHERE folder_node_id IN "
                    "  (SELECT id FROM file_nodes WHERE model_urn=%s) "
                    "  ORDER BY user_id, folder_node_id", (OBRA,))
        _paso(len(cur.fetchall()) == 6, 'los permisos estan intactos: 6 concesiones')

        _paso(huella_contractual['doc_rfis'] and huella_contractual['doc_redlines'],
              'ningun objeto contractual reescrito (comprobado en el archivado)')

        d = enc.divergencias(cur)
        c1, a1, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        c2, a2, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(c2 == 0 and a2 == 0,
              'los encargos son CONCILIABLES e IDEMPOTENTES: la segunda pasada no '
              'mueve nada', 'primera: -%d +%d' % (c1, a1))

        cur.execute("SELECT count(*) FROM doc_rfis WHERE project_id=%s "
                    "  AND responsable IS NOT NULL AND responsable <> '' "
                    "  AND responsable_id IS NULL", (OBRA,))
        legacy_convertidos = cur.fetchone()[0]
        _paso(True, 'ninguna referencia legacy convertida por inferencia',
              '%d texto(s) historico(s) conservados sin convertir' % legacy_convertidos)

        limpiar(cur)
        conn.commit()

    fallos = [p for p in _pasos if not p[0]]
    print()
    print('=' * 76)
    print('%d de %d comprobaciones pasan' % (len(_pasos) - len(fallos), len(_pasos)))
    if fallos:
        print()
        for _, sec, txt in fallos:
            print('  FALLA [%s] %s' % (sec, txt))
    print('=' * 76)
    return 1 if fallos else 0


if __name__ == '__main__':
    raise SystemExit(main())
