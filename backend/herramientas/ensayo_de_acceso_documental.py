# -*- coding: utf-8 -*-
"""UNA SOLA DECISION para todas las puertas de un documento.

LO QUE DEMUESTRA
----------------
Que para el MISMO principal y el MISMO recurso responden igual:

    navegacion == busqueda == preview == descarga == signed-url == proxy

Y que la regla es CLOSEST-WINS con sujetos:

    USER  >  COMPANY  >  CONTRACTUAL_FUNCTION

con `none` negando de verdad y el perfil global actuando SOLO como valor por
defecto cuando no hay ninguna regla en toda la cadena.

POR QUE SE COMPRUEBAN LAS SEIS Y NO UNA
---------------------------------------
Porque hasta el 21-ago-2026 NO respondian igual: el permiso de carpeta
gobernaba descubrir --navegacion y busqueda-- y no obtener --bytes--. Un
miembro que conociera un `node_id` se llevaba el documento. Comprobar solo la
busqueda habria dado verde.

    python herramientas/ensayo_de_acceso_documental.py
"""
import importlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_acc_'
OBRA = PREFIJO + 'obra'
OTRA = PREFIJO + 'otra'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def _titulo(t):
    print()
    print(t.upper())


def limpiar(cur):
    cur.execute("DELETE FROM folder_permissions WHERE folder_node_id IN "
                " (SELECT id FROM file_nodes WHERE model_urn LIKE %s)", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_versions WHERE file_node_id IN "
                " (SELECT id FROM file_nodes WHERE model_urn LIKE %s)", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_nodes WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_companies WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM companies WHERE name LIKE %s", (PREFIJO + '%',))


def cliente(usuario, bp):
    from flask import Flask
    import auth_middleware as am
    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    app.register_blueprint(bp)
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
    import permiso_documental as pd
    import busqueda_de_documentos as busq
    import routes.documents as rdoc
    import file_system_db as fsdb
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DE ACCESO DOCUMENTAL — UNA SOLA DECISION')
    print('=' * 76)

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None

        cur.execute("SELECT id FROM hubs LIMIT 1")
        hub = (cur.fetchone() or [None])[0]
        for obra, nombre in ((OBRA, 'ZZ ACC'), (OTRA, 'ZZ ACC OTRA')):
            cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                        "VALUES (%s,%s,%s,%s,'active')", (obra, hub, nombre, obra))
            ref.registrar_obra(cur, obra, nombre=nombre, model_urn=obra,
                               origen='ensayo de acceso')

        emp = {}
        for n in ('SUPERVISORA', 'CONSTRUCTORA'):
            cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id",
                        (PREFIJO + n,))
            emp[n] = cur.fetchone()[0]
        for e, f in (('SUPERVISORA', 'SUPERVISION'), ('CONSTRUCTORA', 'CONTRATISTA')):
            cur.execute("INSERT INTO project_companies (project_id, company_id, funcion) "
                        "VALUES (%s,%s,%s)", (OBRA, emp[e], f))

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
            'jefa':   usuario('Jefa', 'jefa@t', 'admin', [OBRA]),
            'super':  usuario('Supervisor', 'super@t', 'editor', [OBRA], emp['SUPERVISORA']),
            'resi':   usuario('Residente', 'resi@t', 'editor', [OBRA], emp['CONSTRUCTORA']),
            'aux':    usuario('Auxiliar', 'aux@t', 'user', [OBRA], emp['CONSTRUCTORA']),
            'ajeno':  usuario('Ajeno', 'ajeno@t', 'editor', [OTRA], emp['CONSTRUCTORA']),
        }

        def carpeta(obra, nombre, padre=None, tipo=None):
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, "
                        "  name, folder_type, is_deleted) "
                        "VALUES (%s,%s,'FOLDER',%s,%s,FALSE) RETURNING id::text",
                        (obra, padre, nombre, tipo))
            return cur.fetchone()[0]

        def documento(obra, nombre, padre):
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, "
                        "  name, is_deleted, status, gcs_urn, version_number) "
                        "VALUES (%s,%s,'FILE',%s,FALSE,'SHARED',%s,1) RETURNING id::text",
                        (obra, padre, nombre, PREFIJO + 'obj/' + nombre))
            nid = cur.fetchone()[0]
            vs = []
            for n in (1, 2):
                cur.execute("INSERT INTO file_versions (file_node_id, version_number, "
                            "  gcs_urn, sha256) VALUES (%s::uuid,%s,%s,%s) "
                            "RETURNING id::text",
                            (nid, n, '%sobj/%s.v%d' % (PREFIJO, nombre, n),
                             ('%064d' % n)))
                vs.append(cur.fetchone()[0])
            cur.execute("UPDATE file_nodes SET current_version_id = %s::uuid, "
                        "  version_number = 2 WHERE id = %s::uuid", (vs[1], nid))
            return nid, vs

        raiz = carpeta(OBRA, 'OBRA', tipo='PROJECT_ROOT')
        compartido = carpeta(OBRA, 'COMPARTIDO', raiz)
        drenaje = carpeta(OBRA, 'DRENAJE', compartido)
        direccion = carpeta(OBRA, 'DIRECCION', raiz)
        solo_super = carpeta(OBRA, 'SUPERVISION', raiz)

        doc_abierto, vs_ab = documento(OBRA, 'PLANO_ABIERTO.pdf', drenaje)
        doc_reservado, vs_res = documento(OBRA, 'CONTRATO_RESERVADO.pdf', direccion)
        doc_super, vs_sup = documento(OBRA, 'INFORME_SUPERVISION.pdf', solo_super)

        raiz_b = carpeta(OTRA, 'OTRA', tipo='PROJECT_ROOT')
        doc_b, vs_b = documento(OTRA, 'PLANO_ABIERTO.pdf', raiz_b)

        def regla(nodo, tipo, sujeto, nivel):
            cur.execute("INSERT INTO folder_permissions (folder_node_id, user_id, "
                        "  sujeto_tipo, sujeto_id, permission_level) "
                        "VALUES (%s::uuid,%s,%s,%s,%s)",
                        (nodo, int(sujeto) if tipo == pd.USER else None,
                         tipo, str(sujeto), nivel))

        # El reparto de la obra, con los tres sujetos.
        regla(raiz, pd.USER, g['resi'], 'edit')            # persona
        regla(direccion, pd.USER, g['resi'], 'none')       # ... y se le corta aqui
        regla(compartido, pd.COMPANY, emp['CONSTRUCTORA'], 'view_download')
        regla(solo_super, pd.FUNCTION, 'SUPERVISION', 'edit')
        conn.commit()
        db._project_resolver_cache['map'] = None

        SES = {k: {'id': g[k], 'email': PREFIJO + {'jefa': 'jefa@t', 'super': 'super@t',
                                                   'resi': 'resi@t', 'aux': 'aux@t',
                                                   'ajeno': 'ajeno@t'}[k],
                   'name': k.capitalize(),
                   'role': {'jefa': 'admin', 'aux': 'user'}.get(k, 'editor')}
               for k in g}

        # ── LAS SEIS PUERTAS, PARA EL MISMO RECURSO Y EL MISMO PRINCIPAL ──
        def puertas(quien, nodo, version=None, urn=None, obra=OBRA):
            """Devuelve {puerta: True si CONCEDE}. La verdad de cada superficie."""
            ses = SES[quien]
            c = cliente(ses, rdoc.documents_bp)
            r = {}
            # 1. NAVEGACION: por la RUTA REAL del listado, no por el
            #    resolutor. Medir el resolutor seria medir mi propia funcion; lo
            #    que importa es lo que el usuario ve al abrir la carpeta.
            cur.execute("SELECT parent_id::text FROM file_nodes WHERE id::text=%s",
                        (nodo,))
            padre = (cur.fetchone() or [None])[0]
            _lista = c.get('/api/docs/list?model_urn=%s&id=%s' % (obra, padre))
            _d = (_lista.get_json() or {}).get('data') or {}
            _items = list(_d.get('files') or []) + list(_d.get('folders') or [])
            r['navegacion'] = (_lista.status_code not in (401, 403)
                               and any(str(x.get('id')) == nodo for x in _items))
            # 2. BUSQUEDA
            cur.execute("SELECT name FROM file_nodes WHERE id::text=%s", (nodo,))
            nombre = (cur.fetchone() or [''])[0]
            hallados = busq.buscar(cur, obra, nombre, ses)
            r['busqueda'] = any(x['node_id'] == nodo for x in hallados)
            # 3-6. Las cuatro rutas de bytes. Se mira si la GUARDIA deja pasar,
            #      no si GCS responde: en el cluster de ensayo no hay credencial
            #      y un 500 de almacenamiento no es una denegacion.
            def concede(resp):
                return resp.status_code not in (401, 403)
            r['preview'] = concede(c.get('/api/docs/view?model_urn=%s&id=%s' % (obra, nodo)))
            r['signed_url'] = concede(c.get('/api/docs/signed-url?model_urn=%s&id=%s'
                                            % (obra, nodo)))
            r['proxy'] = concede(c.get('/api/docs/proxy?model_urn=%s&id=%s' % (obra, nodo)))
            if version:
                r['descarga_version'] = concede(
                    c.get('/api/docs/signed-url?model_urn=%s&version_id=%s' % (obra, version)))
            if urn:
                r['legacy_gcs_urn'] = concede(
                    c.get('/api/docs/signed-url?model_urn=%s&urn=%s' % (obra, urn)))
            return r

        def coinciden(quien, nodo, esperado, texto, version=None, urn=None, obra=OBRA):
            r = puertas(quien, nodo, version, urn, obra)
            todas = set(r.values())
            ok = len(todas) == 1 and todas.pop() == esperado
            _paso(ok, texto, '' if ok else str(r))
            return r

        _titulo('1 · las seis puertas responden lo mismo')
        coinciden('resi', doc_abierto, True,
                  'el residente ACCEDE al plano abierto por las 6 puertas',
                  version=vs_ab[0], urn=PREFIJO + 'obj/PLANO_ABIERTO.pdf.v1')
        coinciden('resi', doc_reservado, False,
                  'y NO accede al reservado por NINGUNA de las 6',
                  version=vs_res[0], urn=PREFIJO + 'obj/CONTRATO_RESERVADO.pdf.v1')
        coinciden('jefa', doc_reservado, True,
                  'la administradora accede al reservado por las 6')
        coinciden('aux', doc_reservado, False,
                  'el auxiliar tampoco, por ninguna')

        _titulo('2 · `none` niega de verdad, y el mas cercano gana')
        _paso(pd.permiso_efectivo(cur, SES['resi'], OBRA, doc_abierto) != 'none',
              'el residente tiene `edit` desde la raiz')
        _paso(pd.permiso_efectivo(cur, SES['resi'], OBRA, doc_reservado) == 'none',
              'y el `none` de DIRECCION LO CORTA: closest-wins',
              pd.permiso_efectivo(cur, SES['resi'], OBRA, doc_reservado))

        _titulo('3 · sujeto COMPANY')
        _paso(pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_abierto) == 'view_download',
              'el auxiliar accede por su EMPRESA, no por su persona',
              pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_abierto))
        r = puertas('aux', doc_abierto, version=vs_ab[0])
        _paso(all(r.values()), 'y las seis puertas se lo conceden', str(r))

        _titulo('4 · sujeto CONTRACTUAL_FUNCTION')
        _paso(pd.permiso_efectivo(cur, SES['super'], OBRA, doc_super) == 'edit',
              'el supervisor accede por su FUNCION contractual',
              pd.permiso_efectivo(cur, SES['super'], OBRA, doc_super))
        _paso(pd.permiso_efectivo(cur, SES['resi'], OBRA, doc_super) == 'edit',
              'el residente llega por HERENCIA de su `edit` en la raiz')
        _paso(pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_super) == 'none',
              'y el auxiliar NO: su empresa no manda ahi y su perfil es `user`',
              pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_super))

        _titulo('5 · precedencia USER > COMPANY > FUNCTION en el MISMO nivel')
        regla(drenaje, pd.FUNCTION, 'CONTRATISTA', 'admin')
        conn.commit()
        _paso(pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_abierto) == 'admin',
              'con solo FUNCTION en DRENAJE, el auxiliar toma esa')
        regla(drenaje, pd.COMPANY, emp['CONSTRUCTORA'], 'viewer')
        conn.commit()
        _paso(pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_abierto) == 'viewer',
              'al añadir COMPANY en el mismo nivel, COMPANY gana a FUNCTION')
        regla(drenaje, pd.USER, g['aux'], 'none')
        conn.commit()
        _paso(pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_abierto) == 'none',
              'y al añadir USER, USER gana a las dos -- aunque diga `none`')
        r = puertas('aux', doc_abierto, version=vs_ab[0])
        _paso(not any(r.values()),
              'las seis puertas le niegan ahora el mismo documento', str(r))
        cur.execute("DELETE FROM folder_permissions WHERE folder_node_id = %s::uuid",
                    (drenaje,))
        conn.commit()

        _titulo('6 · el perfil global es DEFECTO, no suelo')
        # `solo_super` tiene regla de FUNCTION; el auxiliar no la cumple, pero
        # su empresa tampoco tiene regla ahi -> sigue subiendo -> nada -> defecto.
        _paso(pd.permiso_efectivo(cur, SES['aux'], OBRA, doc_super) == 'none',
              'sin ninguna regla aplicable, el `user` cae en su defecto: `none`')
        # Y el residente tiene `edit` explicito en la raiz: eso decide, no su rol.
        cur.execute("UPDATE folder_permissions SET permission_level = 'viewer' "
                    " WHERE folder_node_id = %s::uuid AND sujeto_tipo = 'USER' "
                    "   AND sujeto_id = %s", (raiz, str(g['resi'])))
        conn.commit()
        _paso(pd.permiso_efectivo(cur, SES['resi'], OBRA, doc_super) == 'viewer',
              'y un `editor` con regla `viewer` se queda en `viewer`: el rol '
              'global YA NO es un suelo que se imponga',
              pd.permiso_efectivo(cur, SES['resi'], OBRA, doc_super))
        cur.execute("UPDATE folder_permissions SET permission_level = 'edit' "
                    " WHERE folder_node_id = %s::uuid AND sujeto_tipo = 'USER' "
                    "   AND sujeto_id = %s", (raiz, str(g['resi'])))
        conn.commit()

        _titulo('7 · conocer un identificador NO aumenta el acceso')
        c_aux = cliente(SES['aux'], rdoc.documents_bp)
        r1 = c_aux.get('/api/docs/signed-url?model_urn=%s&id=%s' % (OBRA, doc_reservado))
        _paso(r1.status_code == 403, 'node_id reservado -> 403', str(r1.status_code))
        r2 = c_aux.get('/api/docs/signed-url?model_urn=%s&version_id=%s' % (OBRA, vs_res[0]))
        _paso(r2.status_code == 403, 'version_id reservado -> 403', str(r2.status_code))
        r3 = c_aux.get('/api/docs/signed-url?model_urn=%s&urn=%s'
                       % (OBRA, PREFIJO + 'obj/CONTRATO_RESERVADO.pdf.v1'))
        _paso(r3.status_code == 403,
              'gcs_urn LEGACY reservado -> 403 ANTES de tocar GCS', str(r3.status_code))
        _paso('SIN_PERMISO_DOCUMENTAL' in json.dumps(r3.get_json() or {}),
              'y con el codigo que dice por que', str(r3.get_json())[:60])
        r4 = c_aux.get('/api/docs/proxy?model_urn=%s&urn=%s'
                       % (OBRA, PREFIJO + 'obj/CONTRATO_RESERVADO.pdf.v2'))
        _paso(r4.status_code == 403, 'ni por el proxy con la version VIGENTE')

        _titulo('8 · versiones historicas')
        _paso(c_aux.get('/api/docs/signed-url?model_urn=%s&version_id=%s'
                        % (OBRA, vs_ab[0])).status_code != 403,
              'la v1 HISTORICA de un documento permitido se entrega')
        _paso(c_aux.get('/api/docs/signed-url?model_urn=%s&version_id=%s'
                        % (OBRA, vs_res[1])).status_code == 403,
              'y ninguna version del reservado, ni la vigente')
        cur.execute("SELECT count(*), count(DISTINCT sha256) FROM file_versions v "
                    " JOIN file_nodes n ON n.id = v.file_node_id "
                    " WHERE n.model_urn = %s", (OBRA,))
        nv, nsha = cur.fetchone()
        _paso(nv == 6 and nsha == 2,
              'las 6 versiones y sus SHA-256 siguen intactos: el permiso no '
              'toca el expediente', '%d versiones' % nv)

        _titulo('9 · dos obras')
        r = cliente(SES['ajeno'], rdoc.documents_bp).get(
            '/api/docs/signed-url?model_urn=%s&id=%s' % (OBRA, doc_abierto))
        _paso(r.status_code == 403, 'el de la obra B no alcanza un documento de A')
        r = cliente(SES['resi'], rdoc.documents_bp).get(
            '/api/docs/signed-url?model_urn=%s&urn=%s'
            % (OBRA, PREFIJO + 'obj/PLANO_ABIERTO.pdf.v1'))
        # Ese urn existe en las DOS obras con nombre igual pero clave distinta;
        # aqui se pide el de A, que es suyo.
        _paso(r.status_code != 403, 'y el de A si alcanza el suyo')
        r = cliente(SES['resi'], rdoc.documents_bp).get(
            '/api/docs/signed-url?model_urn=%s&id=%s' % (OBRA, doc_b))
        _paso(r.status_code == 403,
              'decir que un documento de B es de A no lo convierte en suyo: '
              'decide el DUEÑO real del recurso')

        _titulo('10 · indice del expediente y descarga masiva')
        c_resi = cliente(SES['resi'], rdoc.documents_bp)
        d = (c_resi.get('/api/docs/indice-expediente?model_urn=%s' % OBRA)
             .get_json() or {})
        nombres = [x.get('nombre') or x.get('name') for x in d.get('documentos', [])]
        _paso('CONTRATO_RESERVADO.pdf' not in nombres,
              'el indice NO lista el documento reservado para quien no lo ve',
              str(nombres))
        d2 = (cliente(SES['jefa'], rdoc.documents_bp)
              .get('/api/docs/indice-expediente?model_urn=%s' % OBRA).get_json() or {})
        n2 = [x.get('nombre') or x.get('name') for x in d2.get('documentos', [])]
        _paso('CONTRATO_RESERVADO.pdf' in n2, 'y la administradora si lo ve', str(n2))

        _titulo('11 · sharing conserva su umbral (`edit`)')
        r = cliente(SES['aux'], rdoc.documents_bp).post('/api/docs/share', json={
            'node_id': doc_abierto, 'model_urn': OBRA, 'access_type': 'anyone',
            'role': 'viewer'})
        _paso(r.status_code == 403,
              'el auxiliar tiene `view_download` y NO puede compartir: sigue '
              'exigiendo `edit`', str(r.status_code))

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
