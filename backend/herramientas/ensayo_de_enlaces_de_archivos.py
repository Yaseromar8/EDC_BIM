# -*- coding: utf-8 -*-
"""ARCHIVOS · ENLACES POR OBRA, CARPETA Y DOCUMENTO, contra PostgreSQL.

QUE DEMUESTRA
-------------
Con la aplicacion real (`server.app`), sesiones reales de usuarios ficticios y ENFORCE
encendido, la ruta que valida los enlaces internos de Archivos, `GET /api/docs/ubicacion`
(docs/archivos/02_ENLACES_INFORME_DE_CIERRE.md):

  C  una carpeta devuelve su cadena de arriba abajo, sin la raiz; la raiz es la obra
  D  un documento se abre en su carpeta real, aunque el enlace diga otra
  L  el listado y la ruta dicen lo mismo de cada documento
  V  una version solo vale si es de ese documento; su clave, solo para quien descarga
  M  mover y renombrar no rompen el enlace: el documento movido se abre donde esta hoy
  N  inexistente, de otra obra, en la papelera, sin permiso, version de otro documento o
     identificador mal formado: la MISMA respuesta, sin nombres
  P  quien no es de la obra se queda en el 403 del perimetro
  I  el modo ISO estricto esconde por enlace lo mismo que el listado
  E  la ruta no escribe nada

QUE NO TOCA
-----------
Se niega a arrancar si `DB_NAME` no parece desechable o si hay `DATABASE_URL`. No lee
ningun `.env`. Vacia las variables de correo y de servicios externos y arranca con el
perfil `portal`. Obras, carpetas y personas llevan el prefijo `zz_enl_<hora>` y NO se
borran (`activity_log` es de solo insercion).

    DB_HOST=127.0.0.1 DB_PORT=<puerto> DB_NAME=ecd_ensayo DB_USER=ecd_app DB_PASS=<...> \\
        python herramientas/ensayo_de_enlaces_de_archivos.py
"""
import json
import os
import re
import secrets
import sys
import time
import uuid
from urllib.parse import urlencode

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import dotenv  # noqa: E402
dotenv.load_dotenv = lambda *a, **k: False
try:
    import dotenv.main as _dotenv_main
    _dotenv_main.load_dotenv = dotenv.load_dotenv
except Exception:
    pass

PREFIJO = 'zz_enl_'
RUN = time.strftime('%H%M%S')
NEUTRO = {'success': False, 'code': 'ENLACE_NO_DISPONIBLE',
          'error': 'No tienes acceso a ese elemento o ya no existe.'}

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

    obra, otra = PREFIJO + 'obra_' + RUN, PREFIJO + 'otra_' + RUN
    U = {}

    # ── MONTAJE ────────────────────────────────────────────────────────────
    _titulo('MONTAJE · dos obras, carpetas anidadas, documentos con versiones, cinco personas')
    with db.get_db_connection() as conn:
        cur = conn.cursor()
        for o, nombre in ((obra, 'ZZ ENLACES ' + RUN), (otra, 'ZZ OTRA ' + RUN)):
            cur.execute("INSERT INTO projects (id, name, model_urn, status) "
                        "VALUES (%s,%s,%s,'active')", (o, nombre, o))
            ref.registrar_obra(cur, o, nombre=nombre, model_urn=o,
                               origen='ensayo de enlaces de archivos')

        def usuario(clave, nombre, rol, obras):
            correo = '%s%s_%s@ensayo.test' % (PREFIJO, clave, RUN)
            cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, "
                        "  activated_at) VALUES (%s,%s,'x',%s,TRUE,CURRENT_TIMESTAMP) "
                        "RETURNING id", (nombre, correo, rol))
            uid = cur.fetchone()[0]
            for o in obras:
                cur.execute('INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)',
                            (o, uid))
            U[clave] = {'id': uid, 'email': correo, 'name': nombre, 'role': rol}

        usuario('tu', 'ENL Tu', 'admin', [obra])
        usuario('colega', 'ENL Colega', 'editor', [obra])
        usuario('lector', 'ENL Lector', 'user', [obra])
        usuario('restringido', 'ENL Restringido', 'editor', [obra])
        usuario('ajeno', 'ENL Ajeno', 'editor', [otra])
        conn.commit()
    db._project_resolver_cache['map'] = None

    raiz = str(fsd.ensure_project_root_node(obra))
    raiz_otra = str(fsd.ensure_project_root_node(otra))
    with db.get_db_connection() as conn:
        cur = conn.cursor()

        def carpeta(o, nombre, padre):
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, name, is_deleted) "
                        "VALUES (%s,%s,'FOLDER',%s,FALSE) RETURNING id::text", (o, padre, nombre))
            return cur.fetchone()[0]

        wip = carpeta(obra, '01_WIP', raiz)
        planos = carpeta(obra, 'Planos', wip)
        detalles = carpeta(obra, 'Detalles', planos)
        sha = carpeta(obra, '02_SHA', raiz)
        vieja = carpeta(obra, 'Vieja', raiz)
        equis = carpeta(otra, 'X', raiz_otra)
        conn.commit()
    # Restringido: «Restringido» en 01_WIP. Lector (perfil sin permisos): «Ver» en Planos.
    fp.set_folder_permission(wip, U['restringido']['id'], 'none', U['tu']['id'], obra)
    fp.set_folder_permission(planos, U['lector']['id'], 'viewer', U['tu']['id'], obra)

    def subir(o, padre, nombre, n):
        fsd.create_file_record(o, padre, nombre, 1000 + n, '%s%s/%s/v%d' % (PREFIJO, RUN, nombre, n),
                               'application/pdf', U['tu']['email'], None)

    subir(obra, detalles, 'PL-001.pdf', 1)
    subir(obra, detalles, 'PL-001.pdf', 2)
    subir(obra, detalles, 'PL-002.pdf', 1)
    subir(obra, raiz, 'EN-RAIZ.pdf', 1)
    subir(obra, vieja, 'VIEJO.pdf', 1)
    subir(otra, equis, 'AJENO.pdf', 1)

    def documento(o, nombre):
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id::text, current_version_id::text FROM file_nodes "
                        " WHERE model_urn = %s AND name = %s AND node_type = 'FILE'", (o, nombre))
            nid, vigente = cur.fetchone()
            cur.execute("SELECT id::text FROM file_versions WHERE file_node_id::text = %s "
                        " ORDER BY version_number", (nid,))
            return {'id': nid, 'vigente': vigente, 'versiones': [r[0] for r in cur.fetchall()]}

    D1, D2 = documento(obra, 'PL-001.pdf'), documento(obra, 'PL-002.pdf')
    DR, DV, DA = documento(obra, 'EN-RAIZ.pdf'), documento(obra, 'VIEJO.pdf'), documento(otra, 'AJENO.pdf')
    _paso(len(D1['versiones']) == 2 and D1['vigente'] == D1['versiones'][1] and len(D2['versiones']) == 1,
          'PL-001 tiene dos versiones (la vigente es la 2) y PL-002 una', json.dumps(D1))

    T = {k: am.create_session(v['id']) for k, v in U.items()}
    cli = server.app.test_client()

    def pedir(metodo, ruta, quien, **kw):
        r = getattr(cli, metodo)(ruta, headers={'Authorization': 'Bearer ' + T[quien]}, **kw)
        try:
            return r.status_code, r.get_json()
        except Exception:
            return r.status_code, None

    def ubicacion(quien, en=None, **q):
        consulta = {'model_urn': en or obra}
        consulta.update({k: v for k, v in q.items() if v is not None})
        return pedir('get', '/api/docs/ubicacion?' + urlencode(consulta), quien)

    def nombres(cuerpo):
        return [c.get('name') for c in (cuerpo or {}).get('ruta') or []]

    def ids(cuerpo):
        return [c.get('id') for c in (cuerpo or {}).get('ruta') or []]

    def listado(quien, carpeta_id, ruta):
        s, b = pedir('get', '/api/docs/list?' + urlencode({'path': ruta, 'id': carpeta_id,
                                                           'model_urn': obra}), quien)
        return s, [f.get('id') for f in ((b or {}).get('data') or {}).get('files') or []]

    # ── C · CARPETAS ───────────────────────────────────────────────────────
    _titulo('C · una carpeta, por su identificador')
    s, b = ubicacion('colega', carpeta=detalles)
    _paso(s == 200 and (b or {}).get('carpeta') == detalles and nombres(b) == ['01_WIP', 'Planos', 'Detalles']
          and ids(b) == [wip, planos, detalles] and b.get('documento') is None,
          'la carpeta anidada devuelve su cadena de arriba abajo, sin la raiz', 'http=%s %s' % (s, b))
    s, b = ubicacion('colega', carpeta=raiz)
    _paso(s == 200 and (b or {}).get('carpeta') is None and b.get('ruta') == [],
          'la carpeta raiz es el enlace de la obra: sin carpeta', 'http=%s %s' % (s, b))
    s, b = ubicacion('lector', carpeta=detalles)
    _paso(s == 200 and (b or {}).get('carpeta') == detalles,
          'Lector, con «Ver» heredado de Planos, abre Detalles', 'http=%s' % s)

    # ── D · DOCUMENTOS ─────────────────────────────────────────────────────
    _titulo('D · un documento: manda donde esta, no la carpeta del enlace')
    s, b = ubicacion('colega', carpeta=planos, documento=D1['id'])
    _paso(s == 200 and (b or {}).get('carpeta') == detalles and b.get('documento') == D1['id']
          and ids(b) == [wip, planos, detalles] and b.get('version') is None,
          'el enlace dice Planos y PL-001 se abre en Detalles, que es donde esta', 'http=%s %s' % (s, b))
    s, b = ubicacion('colega', documento=DR['id'])
    _paso(s == 200 and (b or {}).get('carpeta') is None and b.get('ruta') == [],
          'un documento de la raiz se abre en la raiz', 'http=%s %s' % (s, b))
    s, b = ubicacion('restringido', documento=DR['id'])
    _paso(s == 200, 'Restringido si abre lo que no esta bajo 01_WIP: la negativa es por permiso, no por persona',
          'http=%s' % s)

    # ── L · EL LISTADO Y EL ENLACE DICEN LO MISMO ──────────────────────────
    _titulo('L · el listado y el enlace')
    ruta_detalles = '%s/01_WIP/Planos/Detalles/' % obra
    s, lista = listado('colega', detalles, ruta_detalles)
    _paso(s == 200 and D1['id'] in lista and D2['id'] in lista,
          'el listado de Detalles trae PL-001 y PL-002 a Colega, que los abre por enlace', 'http=%s' % s)
    s, lista = listado('restringido', detalles, ruta_detalles)
    _paso(D1['id'] not in lista, 'a Restringido el listado no le trae PL-001, y el enlace tampoco se lo abre (N)',
          'http=%s' % s)

    # ── V · VERSIONES ──────────────────────────────────────────────────────
    _titulo('V · una version fija')
    v1, v2 = D1['versiones']
    s, b = ubicacion('colega', carpeta=detalles, documento=D1['id'], version=v1)
    version = (b or {}).get('version') or {}
    _paso(s == 200 and version.get('id') == v1 and version.get('version_number') == 1
          and version.get('gcs_urn'),
          'la version 1 de PL-001, con su clave para quien puede descargar (Colega, Editar)',
          'http=%s %s' % (s, version))
    s, b = ubicacion('lector', documento=D1['id'], version=v1)
    version = (b or {}).get('version') or {}
    _paso(s == 200 and version.get('id') == v1 and 'gcs_urn' not in version,
          'Lector, con «Ver», la abre sin la clave de almacenamiento', 'http=%s %s' % (s, version))
    sh, bh = pedir('get', '/api/docs/versions?' + urlencode({'id': D1['id'], 'model_urn': obra}), 'lector')
    historial = {v.get('id'): v for v in (bh or {}).get('versions') or []}
    _paso(sh == 200 and historial.get(v1) == version,
          'la version por enlace es identica a la del historial de versiones de esa persona',
          'http=%s' % sh)

    # ── M · MOVER Y RENOMBRAR ──────────────────────────────────────────────
    _titulo('M · mover y renombrar no rompen el enlace')
    s, b = pedir('put', '/api/docs/move', 'tu', json={'node_id': D2['id'], 'destNodeId': sha,
                                                      'model_urn': obra, 'user': U['tu']['email']})
    _paso(s == 200, 'Tu mueve PL-002 de Detalles a 02_SHA por la ruta de siempre', 'http=%s %s' % (s, b))
    s, b = ubicacion('colega', carpeta=detalles, documento=D2['id'])
    _paso(s == 200 and (b or {}).get('carpeta') == sha and nombres(b) == ['02_SHA']
          and b.get('documento') == D2['id'],
          'el enlace copiado antes (carpeta Detalles) abre PL-002 donde esta hoy: 02_SHA',
          'http=%s %s' % (s, b))
    s, b = pedir('post', '/api/docs/rename', 'tu', json={'node_id': planos, 'new_name': 'Planos_R1',
                                                         'model_urn': obra})
    _paso(s == 200, 'Tu renombra Planos a Planos_R1', 'http=%s %s' % (s, b))
    s, b = ubicacion('colega', carpeta=detalles, documento=D1['id'])
    _paso(s == 200 and nombres(b) == ['01_WIP', 'Planos_R1', 'Detalles'] and ids(b) == [wip, planos, detalles],
          'el mismo enlace sigue abriendo PL-001: mismos identificadores, nombre nuevo',
          'http=%s %s' % (s, nombres(b)))

    # ── N · LA RESPUESTA NEUTRA ────────────────────────────────────────────
    _titulo('N · lo que no se abre responde siempre lo mismo')
    fsd.soft_delete_node(vieja, obra, performed_by=U['tu']['email'])
    negativas = [
        ('inexistente', 'colega', {'documento': str(uuid.uuid4())}),
        ('documento de otra obra', 'colega', {'carpeta': detalles, 'documento': DA['id']}),
        ('carpeta de otra obra', 'colega', {'carpeta': equis}),
        ('documento en la papelera', 'colega', {'carpeta': vieja, 'documento': DV['id']}),
        ('carpeta en la papelera', 'colega', {'carpeta': vieja}),
        ('documento sin permiso', 'restringido', {'carpeta': detalles, 'documento': D1['id']}),
        ('carpeta sin permiso', 'restringido', {'carpeta': detalles}),
        ('version de otro documento', 'colega', {'carpeta': detalles, 'documento': D1['id'],
                                                 'version': D2['versiones'][0]}),
        ('version sin documento', 'colega', {'version': v1}),
        ('identificador mal formado', 'colega', {'carpeta': 'Detalles'}),
        ('documento pedido como carpeta', 'colega', {'carpeta': D1['id']}),
    ]
    vistos = []
    for nombre, quien, consulta in negativas:
        s, b = ubicacion(quien, **consulta)
        vistos.append(b)
        _paso(s == 404 and b == NEUTRO, 'neutra: %s' % nombre, 'http=%s %s' % (s, b))
    texto = json.dumps(vistos, ensure_ascii=False)
    _paso(not any(n in texto for n in ('PL-00', 'Detalles', '01_WIP', 'Planos', 'AJENO', 'VIEJO', 'Vieja')),
          'ninguna negativa nombra una carpeta o un documento')
    s, b = ubicacion('ajeno', en=otra, documento=DA['id'])
    s2, b2 = ubicacion('ajeno', en=otra, documento=D1['id'])
    _paso(s == 200 and s2 == 404 and b2 == NEUTRO,
          'desde su obra, Ajeno abre AJENO.pdf; un documento de la otra obra pedido desde la suya, no',
          'http=%s/%s' % (s, s2))

    # ── P · EL PERIMETRO ───────────────────────────────────────────────────
    _titulo('P · quien no es de la obra no llega a la ruta')
    s, b = ubicacion('ajeno', carpeta=detalles)
    _paso(s == 403 and (b or {}).get('code') == 'PROJECT_FORBIDDEN',
          'Ajeno pidiendo en la obra: 403 del perimetro, sin nada de la carpeta', 'http=%s %s' % (s, b))

    # ── I · MODO ISO ESTRICTO ──────────────────────────────────────────────
    _titulo('I · el modo ISO estricto esconde lo mismo por enlace y en el listado')
    os.environ['STRICT_ISO_VISIBILITY'] = 'true'
    try:
        s, b = ubicacion('colega', documento=D1['id'])
        _paso(s == 404 and b == NEUTRO,
              'PL-001 esta en Trabajo en curso: Colega, que no administra, no lo abre por enlace',
              'http=%s' % s)
        s, lista = listado('colega', detalles, '%s/01_WIP/Planos_R1/Detalles/' % obra)
        _paso(s == 200 and D1['id'] not in lista, 'y el listado tampoco se lo trae', 'http=%s' % s)
        s, b = ubicacion('tu', documento=D1['id'])
        _paso(s == 200, 'Tu, que administra la obra, si lo abre', 'http=%s' % s)
    finally:
        os.environ['STRICT_ISO_VISIBILITY'] = ''

    # ── E · SOLO LECTURA ───────────────────────────────────────────────────
    _titulo('E · la ruta no escribe nada')

    def contar():
        with db.get_db_connection() as conn:
            cur = conn.cursor()
            salida = {}
            for tabla in ('file_nodes', 'file_versions', 'folder_permissions', 'activity_log'):
                cur.execute('SELECT count(*) FROM %s' % tabla)
                salida[tabla] = cur.fetchone()[0]
            return salida

    antes = contar()
    for _ in range(3):
        ubicacion('colega', carpeta=detalles, documento=D1['id'], version=v1)
        ubicacion('restringido', documento=D1['id'])
        ubicacion('colega', carpeta=vieja)
    despues = contar()
    _paso(antes == despues, 'nueve consultas despues: ni nodos, ni versiones, ni permisos, ni registros nuevos',
          '%s -> %s' % (antes, despues))

    total, bien = len(_pasos), sum(1 for ok, _t in _pasos if ok)
    print()
    print('RESULTADO: %d/%d' % (bien, total))
    return 0 if bien == total else 1


if __name__ == '__main__':
    sys.exit(main())
