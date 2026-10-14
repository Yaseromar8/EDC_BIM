# -*- coding: utf-8 -*-
"""Vistas de Archivos, ficha del documento y portada, contra PostgreSQL de verdad.

QUE DEMUESTRA (14-oct-2026)
---------------------------
Las consultas nuevas de backend/vistas_de_obra.py y backend/ficha_documento.py solo
se habian probado con un doble de la base. Aqui corren contra un esquema REAL
(construido con bootstrap_esquema.py) y por las rutas reales, con el middleware de
autorizacion real; solo se sustituye la sesion.

  1. Cada vista trae lo que dice, con su cifra, para dos personas distintas.
  2. El permiso de carpeta oculta lo reservado en vistas, recuentos y busqueda.
  3. «Asignados a mi empresa» sigue las tres formas de destino de un encargo.
  4. Una vista propia (vista=todos) aplica sus filtros en el servidor.
  5. La trazabilidad trae lo relacionado y respeta el permiso de carpeta.
  6. Las rutas que usa la portada devuelven la forma que la portada espera.

DONDE CORRE
-----------
SOLO contra una base de ensayo en esta maquina: se niega si DB_NAME no contiene
«ensayo» o si DB_HOST no es local. No lee .env: la conexion se da por entorno.

    DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=ecd_migrator DB_PASS=x \\
    DB_NAME=ensayo_vistas python herramientas/ensayo_de_vistas_y_ficha.py
"""
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

if 'ensayo' not in (os.getenv('DB_NAME') or '') or os.getenv('DB_HOST') not in ('127.0.0.1', 'localhost'):
    print('NEGADO: este ensayo solo corre contra una base local cuyo nombre contenga «ensayo».')
    raise SystemExit(2)

PREFIJO = 'zz_vf_'
OBRA = PREFIJO + 'obra'
_pasos = []


def paso(ok, texto, detalle=''):
    _pasos.append((bool(ok), texto))
    print('  %s  %s%s' % ('OK   ' if ok else 'FALLA', texto, ('   -- ' + str(detalle)) if detalle else ''))


def cliente(usuario):
    from flask import Flask
    import auth_middleware as am
    import routes.documents as doc
    import routes.plan_entregas as plan
    import routes.reviews as rev
    import routes.directorio as dirb
    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    for bp in (doc.documents_bp, plan.plan_bp, rev.reviews_bp, dirb.directorio_bp):
        app.register_blueprint(bp)
    c = app.test_client()
    c.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ensayo'
    return c


def main():
    os.environ['ENFORCE_PROJECT_AUTHZ'] = 'true'
    os.environ.setdefault('AUTH_POLICY_MODE', 'sombra')
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    import db
    from db import init_db_pool, get_db_connection
    import referencias_de_obra as ref
    init_db_pool()

    print('\n' + '=' * 76 + '\nENSAYO · VISTAS DE ARCHIVOS, FICHA Y PORTADA (PostgreSQL real)\n' + '=' * 76)
    hoy = dt.date.today()
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('SELECT current_database()')
        base = cur.fetchone()[0]
        if 'ensayo' not in base:
            print('NEGADO: conectado a «%s»' % base)
            raise SystemExit(2)
        print('base: %s' % base)

        # ── Datos ─────────────────────────────────────────────────────────
        cur.execute("INSERT INTO projects (id, name, model_urn, status) VALUES (%s,'ZZ VF',%s,'active')", (OBRA, OBRA))
        ref.registrar_obra(cur, OBRA, nombre='ZZ VF', model_urn=OBRA, origen='ensayo de vistas')
        cur.execute("INSERT INTO companies (name) VALUES ('ZZ Contratista') RETURNING id")
        emp_a = cur.fetchone()[0]
        cur.execute("INSERT INTO companies (name) VALUES ('ZZ Supervision') RETURNING id")
        emp_b = cur.fetchone()[0]
        cur.execute("INSERT INTO project_companies (project_id, company_id, funcion) VALUES (%s,%s,'SUPERVISION')",
                    (OBRA, emp_b))

        def usuario(nombre, rol, empresa, admin_obra=False):
            cur.execute("INSERT INTO users (name, email, password_hash, role, company_id, is_active) "
                        "VALUES (%s,%s,'x',%s,%s,TRUE) RETURNING id",
                        (nombre, PREFIJO + nombre.lower() + '@e.test', rol, empresa))
            uid = cur.fetchone()[0]
            cur.execute("INSERT INTO project_users (project_id, user_id, es_admin) VALUES (%s,%s,%s)",
                        (OBRA, uid, admin_obra))
            return {'id': uid, 'email': PREFIJO + nombre.lower() + '@e.test', 'name': nombre, 'role': rol}

        resi = usuario('Residente', 'editor', emp_a)
        colega = usuario('Colega', 'editor', emp_a)
        sup = usuario('Supervisor', 'editor', emp_b)
        jefa = usuario('Jefa', 'editor', emp_a, admin_obra=True)

        def nodo(nombre, padre=None, tipo='FOLDER', estado=None, folder_type=None):
            cur.execute("INSERT INTO file_nodes (model_urn, parent_id, node_type, name, is_deleted, status, "
                        "  folder_type, version_number, created_by) "
                        "VALUES (%s,%s,%s,%s,FALSE,%s,%s,1,'ensayo') RETURNING id::text",
                        (OBRA, padre, tipo, nombre, estado, folder_type))
            return cur.fetchone()[0]

        raiz = nodo('Archivos de proyecto', folder_type='PROJECT_ROOT')
        planos = nodo('Planos', raiz)
        reservada = nodo('Reservada', raiz)
        cod = '500125-CSSP001-000-XX-%s-%s-%06d.pdf'
        d1 = nodo(cod % ('DR', 'ES', 1), planos, 'FILE', 'SHARED')      # vencido + en revision
        d2 = nodo(cod % ('DR', 'ES', 2), planos, 'FILE', 'WIP')         # vence pronto
        d3 = nodo(cod % ('M3', 'AR', 3), planos, 'FILE', 'PUBLISHED')   # publicado sin entrega
        d4 = nodo(cod % ('DR', 'ES', 4), planos, 'FILE', 'PUBLISHED')   # publicado y entregado
        dr = nodo(cod % ('DR', 'ES', 9), reservada, 'FILE', 'PUBLISHED')
        cur.execute("INSERT INTO file_versions (file_node_id, version_number, gcs_urn, sha256, created_by) "
                    "VALUES (%s::uuid,1,'zz/d1',%s,'ensayo') RETURNING id::text", (d1, 'a' * 64))
        v1 = cur.fetchone()[0]
        cur.execute("UPDATE file_nodes SET current_version_id=%s::uuid WHERE id=%s::uuid", (v1, d1))

        # El residente NO ve «Reservada»; la jefa administra la obra y lo ve todo.
        for u in (resi, colega, sup):
            cur.execute("INSERT INTO folder_permissions (folder_node_id, user_id, sujeto_tipo, sujeto_id, permission_level) "
                        "VALUES (%s::uuid,%s,'USER',%s::text,'edit')", (raiz, u['id'], u['id']))
            cur.execute("INSERT INTO folder_permissions (folder_node_id, user_id, sujeto_tipo, sujeto_id, permission_level) "
                        "VALUES (%s::uuid,%s,'USER',%s::text,'none')", (reservada, u['id'], u['id']))

        def compromiso(ident, fecha, nodo_id=None):
            cur.execute("INSERT INTO plan_entregas (model_urn, tipo, identificador, hito, fecha_comprometida, file_node_id) "
                        "VALUES (%s,'MIDP',%s,'Etapa 2',%s,%s::uuid)", (OBRA, ident, fecha, nodo_id))
        compromiso('C1', hoy - dt.timedelta(days=5), d1)
        compromiso('C2', hoy + dt.timedelta(days=3), d2)
        compromiso('C4', hoy - dt.timedelta(days=20), d4)
        compromiso('C9', hoy - dt.timedelta(days=2))            # vencido y SIN documento

        def revision(titulo, items):
            # El contrato que la aplicacion escribe al crear (flujo_de_revision.CONTRATO_VIGENTE):
            # desde la migracion 28 la columna no tiene valor por defecto.
            cur.execute("INSERT INTO doc_reviews (model_urn, title, items, steps, status, paso_vence_en, contrato) "
                        "VALUES (%s,%s,%s::jsonb,'[]'::jsonb,'pending',%s,'AUTORIDAD_TERMINAL') RETURNING id",
                        (OBRA, titulo, json.dumps(items), dt.datetime.now() - dt.timedelta(days=1)))
            return cur.fetchone()[0]
        r1 = revision('Revisión de estructuras', [{'node_id': d1}])
        r2 = revision('Revisión de memoria', [{'node_id': d2}])

        def encargo(rid, **destino):
            cols = ', '.join(destino)
            cur.execute("INSERT INTO encargos (project_id, objeto_tipo, objeto_id, asunto, estado, vence_en, %s) "
                        "VALUES (%%s,'REVIEW',%%s,'Revisar',%%s,%%s, %s)" % (cols, ', '.join(['%s'] * len(destino))),
                        (OBRA, str(rid), 'abierto', dt.datetime.now() + dt.timedelta(days=2), *destino.values()))
        encargo(r1, destino_usuario=resi['id'])                 # me toca (residente)
        encargo(r2, destino_usuario=colega['id'])               # a mi empresa, por una persona de ella
        encargo(r2, destino_funcion='SUPERVISION')              # a la empresa supervisora, por su funcion

        cur.execute("INSERT INTO transmittals (model_urn, number, subject, recipients, items, acuses) "
                    "VALUES (%s,12,'Entrega a supervisión','[]'::jsonb,%s::jsonb,%s::jsonb)",
                    (OBRA, json.dumps([{'node_id': d1}]), json.dumps([{'por': 'x', 'en': 'y'}])))
        cur.execute("INSERT INTO doc_rfis (model_urn, project_id, codigo, titulo, estado, adjuntos) "
                    "VALUES (%s,%s,'RFI-007','Cota de fondo','Emitido',%s::jsonb)",
                    (OBRA, OBRA, json.dumps([{'node_id': d1}])))
        cur.execute("INSERT INTO cad_review_marks (file_node_id, version_id, view_guid, kind, geometry, created_by_id, published) "
                    "VALUES (%s::uuid,%s::uuid,'v','cloud','{}'::jsonb,%s,TRUE)", (d1, v1, resi['id']))
        conn.commit()
    db._project_resolver_cache['map'] = None

    def get(quien, url):
        r = cliente(quien).get(url)
        return r.status_code, (r.get_json(silent=True) or {})

    q = '/api/docs/search?model_urn=' + OBRA
    print('\n1 · RECUENTOS (residente y jefa)')
    s, d = get(resi, q + '&vista=recuentos')
    rc = d.get('recuentos') or {}
    paso(s == 200 and d.get('success'), 'la ruta responde', s)
    esperado = {'en_revision': 1, 'me_toca_revisar': 1, 'asignados_mi_empresa': 2, 'publicados': 2,
                'publicados_sin_entrega': 1, 'plazo_vencido': 1, 'vence_pronto': 1}
    paso(rc == esperado, 'cifras del residente', rc)
    paso(d.get('hay_plan') is True and d.get('vencidos_sin_documento') == 1, 'plan y compromisos vencidos sin documento',
         (d.get('hay_plan'), d.get('vencidos_sin_documento')))
    s, d = get(jefa, q + '&vista=recuentos')
    rc = d.get('recuentos') or {}
    paso(rc.get('publicados') == 3 and rc.get('publicados_sin_entrega') == 2,
         'la jefa (administra la obra) cuenta también lo reservado', rc)

    print('\n2 · CADA VISTA Y SU FORMA')
    for clave, ids in (('plazo_vencido', {d1}), ('vence_pronto', {d2}), ('publicados', {d3, d4}),
                       ('publicados_sin_entrega', {d3}), ('me_toca_revisar', {d1}),
                       ('asignados_mi_empresa', {d1, d2}), ('en_revision', {d1})):
        s, d = get(resi, q + '&vista=' + clave)
        got = {x['id'] for x in d.get('data') or []}
        paso(s == 200 and got == ids, 'vista %s' % clave, sorted(got))
    s, d = get(resi, q + '&vista=plazo_vencido')
    f = (d.get('data') or [{}])[0]
    paso(f.get('ubicacion') == 'Planos' and f.get('entrega', {}).get('estado') == 'vinculado'
         and f.get('entrega', {}).get('fecha') == str(hoy - dt.timedelta(days=5)),
         'fila con ubicación y entrega del plan', {k: f.get(k) for k in ('ubicacion', 'entrega')})
    paso(d.get('vencidos_sin_documento') == 1, 'plazo vencido avisa de los compromisos sin documento')

    print('\n3 · MI EMPRESA Y EL PERMISO DE CARPETA')
    s, d = get(sup, q + '&vista=asignados_mi_empresa')
    paso({x['id'] for x in d.get('data') or []} == {d2}, 'la supervisión recibe lo de su función', len(d.get('data') or []))
    s, d = get(resi, q + '&vista=todos&estado=PUBLISHED&disciplina=ES')
    paso({x['id'] for x in d.get('data') or []} == {d4}, 'vista propia: publicados de ES, sin lo reservado',
         [x['name'] for x in d.get('data') or []])
    s, d = get(jefa, q + '&vista=todos&estado=PUBLISHED&disciplina=ES')
    paso({x['id'] for x in d.get('data') or []} == {d4, dr}, 'la jefa sí ve el reservado')
    s, d = get(resi, q + '&q=000009')
    paso(s == 200 and not (d.get('data') or []), 'la búsqueda no descubre el reservado al residente', d.get('data'))
    s, d = get(jefa, q + '&q=000009')
    paso(len(d.get('data') or []) == 1, 'la búsqueda sí lo encuentra para la jefa')

    print('\n4 · FICHA: TRAZABILIDAD Y RELACIONADOS')
    s, d = get(resi, '/api/docs/trazabilidad?id=' + d1)
    rel = d.get('relacionados') or {}
    paso(s == 200 and d.get('success'), 'trazabilidad responde', s)
    paso(len(rel.get('revisiones', [])) == 1 and rel['revisiones'][0]['id'] == r1, 'revisiones', rel.get('revisiones'))
    paso(len(rel.get('envios', [])) == 1 and rel['envios'][0]['acuses'] == 1, 'envíos con acuse', rel.get('envios'))
    paso(len(rel.get('rfis', [])) == 1 and rel['rfis'][0]['codigo'] == 'RFI-007', 'RFI', rel.get('rfis'))
    paso(len(rel.get('plan', [])) == 1 and rel['plan'][0]['estado'] == 'vinculado', 'plan', rel.get('plan'))
    paso(rel.get('marcas') == {'publicadas': 1}, 'marcas publicadas', rel.get('marcas'))
    paso((d.get('versiones') or [{}])[0].get('huella') == 'a' * 64, 'versión con su huella')
    s, d = get(resi, '/api/docs/trazabilidad?id=' + dr)
    paso(s == 403, 'la historia del reservado se niega al residente', s)
    s, d = get(jefa, '/api/docs/trazabilidad?id=' + dr)
    paso(s == 200, 'y se da a la jefa', s)

    print('\n5 · LO QUE LEE LA PORTADA')
    s, d = get(resi, '/api/plan?model_urn=' + OBRA)
    filas = d.get('plan') or []
    paso(s == 200 and all('fecha_comprometida' in x and 'estado' in x and 'documento' in x for x in filas) and len(filas) == 4,
         'plan: filas con fecha, estado y documento', (s, len(filas)))
    s, d = get(resi, '/api/reviews?model_urn=%s&filtro=en_curso&limite=100' % OBRA)
    revs = d.get('reviews') or []
    paso(s == 200 and d.get('success') and all('paso_vence_en' in x for x in revs), 'revisiones en curso con plazo del paso',
         (s, len(revs), d.get('error')))
    s, d = get(resi, '/api/mi-trabajo?project_id=' + OBRA)
    pend = d.get('pendientes') or []
    paso(s == 200 and any(str(p.get('project_id')) == OBRA and p.get('objeto_tipo') == 'REVIEW' for p in pend),
         'mi trabajo: el encargo del residente, con su obra', (s, len(pend), d.get('error')))

    malos = [t for ok, t in _pasos if not ok]
    print('\n' + '=' * 76)
    print('RESULTADO: %d de %d comprobaciones en verde' % (len(_pasos) - len(malos), len(_pasos)))
    for t in malos:
        print('  FALLA: ' + t)
    raise SystemExit(1 if malos else 0)


if __name__ == '__main__':
    main()
