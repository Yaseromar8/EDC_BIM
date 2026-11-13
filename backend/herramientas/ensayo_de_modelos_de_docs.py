# -*- coding: utf-8 -*-
"""ENSAYO · «Importar modelo → ALEPHIA Docs» con la aplicacion real contra PostgreSQL LOCAL.

docs/archivos/29 §8. Dos defectos vistos en produccion el 12 y el 13-nov-2026, que las pruebas no vieron porque
sus datos eran demasiado limpios. Aqui la obra es como las de verdad:

  · su id, su `projects.model_urn` y el alcance donde Docs guarda su expediente son TRES cadenas distintas;
  · una de sus carpetas usa el «puente ACC»: sus modelos se ven por Autodesk Docs y no tienen traduccion propia.

QUE COMPRUEBA
  A · el selector recibe el alcance de escritura y con el la raiz ensena las carpetas (con `projects.model_urn`,
      como antes, sale vacia);
  P · un modelo que se ve por Autodesk Docs se vincula por Autodesk Docs: la ficha es la de un modelo de ACC, con
      los datos del enlace que guardo Docs, y no se repite;
  E · con el puente sin terminar, en pausa o fallido, no se vincula nada y se dice por que;
  G · las guardas de siempre: otra obra y quien no ve el documento.

Autodesk esta sustituido: no se llama a ningun servicio externo. Lo real es la aplicacion, sus rutas, sus permisos
y la base.

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app python herramientas/ensayo_de_modelos_de_docs.py

Se niega a arrancar si la base no esta en esta maquina o no es desechable. No lee ningun `.env`. Deja sus filas
(prefijo `zz_mdocs_`), como los demas ensayos.
"""
import json
import os
import re
import secrets
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import dotenv  # noqa: E402
dotenv.load_dotenv = lambda *a, **k: False

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((bool(ok), texto))
    print('  %s  %s%s' % ('OK   ' if ok else 'FALLA', texto,
                          ('   -- ' + str(detalle)) if detalle not in ('', None) else ''))
    return ok


def _titulo(t):
    print()
    print('── %s %s' % (t, '─' * max(0, 70 - len(t))))


def main():
    if (os.getenv('DB_HOST') or '') not in ('127.0.0.1', 'localhost', '::1'):
        print('ME NIEGO A ARRANCAR: DB_HOST=%r no es esta maquina.' % (os.getenv('DB_HOST'),))
        return 2
    if not re.search(r'(test|ensayo|prueba|banco)', os.getenv('DB_NAME') or '', re.I):
        print('ME NIEGO A ARRANCAR: DB_NAME=%r no parece una base desechable.' % (os.getenv('DB_NAME'),))
        return 2
    if os.getenv('DATABASE_URL'):
        print('ME NIEGO A ARRANCAR: DATABASE_URL esta definida y podria mandar sobre DB_NAME.')
        return 2
    for clave in ('RESEND_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'APS_CLIENT_ID', 'APS_CLIENT_SECRET',
                  'REDIS_URL'):
        os.environ[clave] = ''
    os.environ.update({'AUTH_POLICY_MODE': 'estricto', 'ENFORCE_PROJECT_AUTHZ': 'true', 'DDL_EN_CALIENTE': 'false',
                       'FLASK_SKIP_DOTENV': '1'})
    os.environ.setdefault('APP_SECRET', secrets.token_hex(24))

    import db
    db.init_db_pool()
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT current_database()')
        if cur.fetchone()[0] != os.getenv('DB_NAME'):
            print('ME NIEGO A ARRANCAR: la conexion abrio otra base.')
            return 2

    import server
    import auth_middleware as am
    import file_system_db as fsd
    import folder_permissions as fp
    import referencias_de_obra as ref
    import acc_emergency_bridge as puente
    from routes import digital_twin as dt

    run = time.strftime('%H%M%S')
    obra, urn_3d, alcance = 'zz_mdocs_%s' % run, 'zz_mdocs_urn3d_%s' % run, 'proyectos/ZZ_MDOCS_%s' % run
    otra = 'zz_mdocs_otra_%s' % run
    U = {}

    _titulo('MONTAJE · una obra cuyo id, model_urn y alcance son distintos, con una carpeta de puente')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for pid, nombre, urn in ((obra, 'ZZ MDOCS ' + run, urn_3d), (otra, 'ZZ MDOCS OTRA ' + run, otra)):
            cur.execute("INSERT INTO projects (id, name, model_urn, status) VALUES (%s,%s,%s,'active')",
                        (pid, nombre, urn))
            ref.registrar_obra(cur, pid, nombre=nombre, model_urn=urn, origen='ensayo de modelos de Docs')
        ref.anotar(cur, alcance, obra, 'LEGACY_PATH', 'ensayo de modelos de Docs')
        ref.marcar_escritura(cur, obra, alcance)
        for clave, rol, obras in (('adm', 'admin', (obra, otra)), ('ve', 'editor', (obra,)), ('ciego', 'editor', (obra,))):
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, activated_at) "
                        "VALUES (%s,%s,'x',%s,TRUE,CURRENT_TIMESTAMP) RETURNING id",
                        ('ZZ Mdocs ' + clave, 'zz_mdocs_%s_%s@ensayo.test' % (clave, run), rol))
            U[clave] = cur.fetchone()[0]
            for pid in obras:
                cur.execute('INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)', (pid, U[clave]))
        conn.commit()
    db._project_resolver_cache['map'] = None

    raiz = fsd.ensure_project_root_node(alcance)
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, name, status) "
                    "VALUES (%s,%s,'FOLDER','RVT','WIP') RETURNING id::text", (alcance, raiz))
        carpeta = cur.fetchone()[0]
        conn.commit()
    fp.set_folder_permission(carpeta, U['ve'], 'viewer', U['adm'], alcance)
    fp.set_folder_permission(carpeta, U['ciego'], 'none', U['adm'], alcance)

    def subir(nombre):
        gcs = 'zz_mdocs/%s/%s/v1' % (run, nombre)
        fsd.create_file_record(alcance, carpeta, nombre, 5000, gcs, 'application/octet-stream', 'zz@ensayo.test', None)
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text, current_version_id::text FROM file_nodes WHERE model_urn = %s AND name = %s",
                        (alcance, nombre))
            nid, vid = cur.fetchone()
        return {'id': nid, 'version': vid, 'gcs': gcs, 'name': nombre}

    def metadata_de_version(doc, **claves):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE file_versions SET metadata = COALESCE(metadata,'{}'::jsonb) || %s::jsonb WHERE id = %s",
                        (json.dumps(claves), doc['version']))
            conn.commit()

    def enlace(doc, pieza, version=2):
        vid = 'urn:adsk.wipprod:fs.file:vf.%s?version=%d' % (pieza, version)
        import base64
        return {'project_id': 'b.zz-proyecto-acc', 'item_id': 'urn:adsk.wipprod:dm.lineage:%s' % pieza,
                'version_id': vid, 'version_number': None, 'name': doc['name'],
                'viewer_urn': base64.urlsafe_b64encode(vid.encode()).decode().rstrip('='),
                'gcs_urn': doc['gcs'], 'linked_at': int(time.time()), 'source': 'emergency_folder_bridge'}

    trabajo = {'status': 'ready', 'project_id': 'b.zz-proyecto-acc', 'folder_id': 'urn:adsk.wipprod:fs.folder:co.zz'}
    listo = subir('ESTRUCTURAL.rvt')
    metadata_de_version(listo, acc_emergency_bridge=trabajo, acc_link=enlace(listo, 'ZZ%sEst' % run))
    pendiente = subir('ELECTRICAS.rvt')
    metadata_de_version(pendiente, acc_emergency_bridge=dict(trabajo, status='preparing'))
    _paso(listo['id'] and pendiente['id'], 'dos modelos en la carpeta: uno que Autodesk ya preparo y otro en preparacion')

    cli = server.app.test_client()
    T = {k: {'Authorization': 'Bearer ' + am.create_session(v)} for k, v in U.items()}
    lanzadas = []
    dt._lanzar_extraccion = lambda urn, frente, job: lanzadas.append((urn, frente)) or job
    # Ni siquiera se pide un token a Autodesk: sin esto, el camino «sin traducir» lo intentaba con credenciales
    # vacias (y Autodesk contestaba 403). El ensayo no sale de esta maquina.
    dt.get_internal_token = lambda: (None, 'sin credenciales en el ensayo')
    estado_del_puente = {'valor': {'status': 'preparing'}}
    puente.status_and_link = lambda nodo: (dict(estado_del_puente['valor']), None)

    def modelos_del(frente):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT name, source, urn, project_id, item_id, version_id, version_number, default_view_name "
                        "  FROM model_config WHERE app_project_id = %s ORDER BY model_id", (frente,))
            return cur.fetchall()

    def vincular(doc, quien='adm', frente=None, **mas):
        r = cli.post('/api/config/project/add-from-docs', headers=T[quien],
                     json=dict({'project': frente or obra, 'documento': doc['id']}, **mas))
        return r.status_code, (r.get_json() or {})

    # ══ A · EL ALCANCE ═════════════════════════════════════════════════════
    _titulo('A · el selector lista la obra por el alcance con el que Docs guarda su expediente')
    r = cli.get('/api/config/project/docs-obra?project=' + obra, headers=T['adm'])
    d = r.get_json() or {}
    _paso(r.status_code == 200 and d.get('model_urn') == alcance,
          'recibe el alcance de escritura, no el id ni projects.model_urn', (r.status_code, d.get('model_urn')))
    r = cli.get('/api/docs/list?model_urn=%s&enlaces=0' % d.get('model_urn', ''), headers=T['adm'])
    datos = (r.get_json() or {}).get('data') or {}
    _paso([c['name'].rstrip('/') for c in datos.get('folders') or []] == ['RVT'], 'la raiz ensena las carpetas de la obra')
    r = cli.get('/api/docs/list?model_urn=%s&enlaces=0&id=%s' % (alcance, carpeta), headers=T['adm'])
    datos = (r.get_json() or {}).get('data') or {}
    _paso(sorted(f['name'] for f in datos.get('files') or []) == ['ELECTRICAS.rvt', 'ESTRUCTURAL.rvt'],
          'y dentro, sus modelos')
    r = cli.get('/api/docs/list?model_urn=%s&enlaces=0' % urn_3d, headers=T['adm'])
    datos = (r.get_json() or {}).get('data') or {}
    _paso(not datos.get('folders') and not datos.get('files'),
          'con projects.model_urn, como antes, la raiz sale vacia (el defecto del 12-nov)')

    # ══ P · POR AUTODESK DOCS ══════════════════════════════════════════════
    _titulo('P · un modelo que se ve por Autodesk Docs se vincula por Autodesk Docs')
    r = cli.get('/api/docs/cad/acc-link?node_id=' + listo['id'], headers=T['adm'])
    d = r.get_json() or {}
    _paso(r.status_code == 200 and (d.get('link') or {}).get('viewer_urn') == enlace(listo, 'ZZ%sEst' % run)['viewer_urn'],
          'lo que pregunta el selector antes de preparar nada: el enlace con ACC de esa version', (r.status_code, d))
    s, b = vincular(listo, defaultViewGuid='guid-3d', defaultViewName='{3D}')
    filas = modelos_del(obra)
    e = enlace(listo, 'ZZ%sEst' % run)
    _paso(s == 200 and b.get('por_autodesk_docs') is True and b.get('urn') == e['viewer_urn'], 'se vincula', (s, b))
    _paso(len(filas) == 1 and filas[0] == ('ESTRUCTURAL.rvt', 'DOCS', e['viewer_urn'], 'b.zz-proyecto-acc',
                                           e['item_id'], e['version_id'], 2, '{3D}'),
          'la ficha es la de un modelo de ACC: fuente, URN, proyecto, pieza, version y numero, del enlace', filas)
    _paso(lanzadas == [(e['viewer_urn'], obra)], 'y se lanza la extraccion de su inventario con el URN de ACC', lanzadas)
    _paso(len(b.get('models') or []) == 1 and b['models'][0].get('itemId') == e['item_id'],
          'el visor recibe el modelo en la lista del frente')
    s, b = vincular(listo)
    _paso(s == 409 and b.get('code') == 'DUPLICADO' and len(modelos_del(obra)) == 1, 'la misma pieza no entra dos veces',
          (s, b.get('code')))

    # ══ E · EL PUENTE SIN TERMINAR ═════════════════════════════════════════
    _titulo('E · con el puente sin terminar no se vincula nada, y se dice por que')
    for valor, palabra in (({'status': 'preparing'}, 'aún está preparando'),
                           ({'status': 'error', 'error': 'ACC no pudo preparar esta version'}, 'no pudo preparar'),
                           ({'status': 'preparing', 'paused': True}, 'en pausa')):
        estado_del_puente['valor'] = valor
        s, b = vincular(pendiente)
        _paso(s == 409 and b.get('code') == 'PUENTE_SIN_TERMINAR' and palabra in (b.get('error') or '')
              and len(modelos_del(obra)) == 1, '%s -> 409 «%s», sin escribir' % (valor, palabra), (s, b))
    _paso(len(lanzadas) == 1, 'y no se lanza ninguna extraccion')

    # Autodesk termina: el enlace queda escrito en la version (lo hace Docs) y ya se vincula.
    metadata_de_version(pendiente, acc_link=enlace(pendiente, 'ZZ%sEle' % run, version=1))
    s, b = vincular(pendiente)
    _paso(s == 200 and len(modelos_del(obra)) == 2 and modelos_del(obra)[1][6] == 1,
          'cuando Autodesk termina, se vincula (version 1, leida del id de la version de ACC)', (s, b.get('error')))

    # ══ G · LAS GUARDAS ════════════════════════════════════════════════════
    _titulo('G · las guardas de siempre')
    s, b = vincular(listo, frente=otra)
    _paso(s == 403 and b.get('code') == 'OTRA_OBRA' and not modelos_del(otra), 'a un frente de otra obra: no', (s, b))
    s, b = vincular(listo, quien='ciego')
    _paso(s in (403, 404) and len(modelos_del(obra)) == 2, 'quien no ve el documento en Docs no lo vincula', (s, b))
    # Un enlace que es de OTROS bytes (la version cambio) no vale: se cae al camino de siempre.
    viejo = subir('ARQUITECTURA.rvt')
    metadata_de_version(viejo, acc_link=dict(enlace(viejo, 'ZZ%sArq' % run), gcs_urn='otros/bytes'))
    s, b = vincular(viejo)
    _paso(s == 409 and b.get('code') == 'SIN_TRADUCIR' and len(modelos_del(obra)) == 2,
          'un enlace que pertenece a otros bytes no vale: sigue el camino de Docs («sin traducir»)', (s, b.get('code')))

    bien = sum(1 for ok, _ in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, len(_pasos)))
    for ok, texto in _pasos:
        if not ok:
            print('  FALLA  ' + texto)
    return 0 if bien == len(_pasos) else 1


if __name__ == '__main__':
    sys.exit(main())
