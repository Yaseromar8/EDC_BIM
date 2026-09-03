# -*- coding: utf-8 -*-
"""El ciclo completo de una revision de dos pasos, contra PostgreSQL.

QUE DEMUESTRA
-------------
  1. Se crea con plazo -> el revisor 1 la ve en su bandeja CON vencimiento; el 2 no.
  2. El historial registra el comienzo del turno, con destinatario y plazo.
  3. El revisor 2 NO puede actuar en el paso 1.
  4. El 1 aprueba -> su encargo se cierra y se abre el del 2, CON SU PROPIO plazo.
  5. El 2 aprueba -> los documentos transicionan y `cerrada_en` queda fechada.
  6. No queda ningun encargo abierto de esa revision.
  7. Un revisor sale de la obra a mitad -> la revision sale BLOQUEADA y la
     conciliacion CONVERGE en vez de intentar repararla eternamente.
  8. Se pierde el encargo -> la conciliacion lo reconstruye CON EL PLAZO del
     Review. Es la prueba de que el plazo esta en el sitio correcto.
  9. Una revision HISTORICA (sin `user_id` ni `dias`) sigue funcionando igual.
 10. El recordatorio encuentra la revision vencida.
  +  GUARDIANA: dos personas con el mismo nombre no pueden confundirse.

QUE NO TOCA
-----------
Crea todo con prefijo `zz_rev_` y solo borra lo que crea.

    python herramientas/ensayo_de_revisiones.py
"""
import datetime
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

PREFIJO = 'zz_rev_'
OBRA = PREFIJO + 'obra'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    for t in ('doc_reviews', 'file_versions', 'file_nodes'):
        col = 'model_urn' if t != 'file_versions' else None
        if col:
            cur.execute("DELETE FROM %s WHERE %s LIKE %%s" % (t, col), (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))


def montar(cur, ref):
    cur.execute("SELECT id FROM hubs LIMIT 1")
    fila = cur.fetchone()
    cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                "VALUES (%s,%s,'ZZ Revisiones',%s,'active')",
                (OBRA, fila[0] if fila else None, OBRA))
    ref.registrar_obra(cur, OBRA, nombre='ZZ Revisiones', model_urn=OBRA,
                       origen='ensayo de revisiones')

    def usuario(nombre, correo):
        cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                    "VALUES (%s,%s,'x','editor',TRUE) RETURNING id",
                    (nombre, PREFIJO + correo))
        uid = cur.fetchone()[0]
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA, uid))
        return uid

    autor = usuario('Autor Uno', 'autor@ensayo.test')
    r1 = usuario('Revisor Uno', 'r1@ensayo.test')
    r2 = usuario('Revisor Dos', 'r2@ensayo.test')
    # El tocayo: MISMO NOMBRE que el revisor 1, persona distinta.
    tocayo = usuario('Revisor Uno', 'tocayo@ensayo.test')

    cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                "VALUES (%s,'FILE','PLANO-001.pdf','WIP') RETURNING id::text", (OBRA,))
    nodo = cur.fetchone()[0]
    return {'autor': autor, 'r1': r1, 'r2': r2, 'tocayo': tocayo, 'nodo': nodo}


def cliente_como(usuario):
    """App con el blueprint REAL de revisiones y la sesion falseada."""
    from flask import Flask
    import auth_middleware as am
    import routes.reviews as rv

    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    app.register_blueprint(rv.reviews_bp)
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
    import encargos as enc
    import flujo_de_revision as flujo
    from herramientas.recordatorios import pendientes_de_recordar

    # ESTE ENSAYO CORRE BAJO PRE, Y SE FUERZA EN VEZ DE HEREDARSE.
    #
    # Lo que mide es el CICLO DE VIDA de una revision --plazo por paso, apertura
    # y cierre de encargos, revision BLOQUEADA, conciliacion, recordatorio, el
    # tocayo-- y todo eso es agnostico del contrato. Su diseno es posicional de
    # arriba abajo: ninguno de sus pasos declara `decision`, ni al insertarlos
    # por SQL ni al crearlos por la ruta.
    #
    # Con la fase D de REVIEWS-R01 la constante pasa a AUTORIDAD_TERMINAL, y el
    # alta por ruta rechaza pasos sin `decision` -- correctamente. Heredar la
    # constante convertiria este ensayo en una prueba del contrato en vez de una
    # prueba del ciclo, y se pondria rojo por algo que no mide.
    #
    # El contrato NUEVO tiene su propio ensayo: `ensayo_de_contrato_r01.py`.
    flujo.CONTRATO_VIGENTE = flujo.PRE

    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DEL CICLO DE REVISION')
    print('=' * 76)

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None
        g = montar(cur, ref)
        conn.commit()
        db._project_resolver_cache['map'] = None

        sesion = {'id': g['autor'], 'email': PREFIJO + 'autor@ensayo.test',
                  'name': 'Autor Uno', 'role': 'admin'}
        cli = cliente_como(sesion)

        print()
        print('1 · SE CREA CON PLAZO POR PASO')
        r = cli.post('/api/reviews', json={
            'model_urn': OBRA, 'title': 'Revision del PLANO-001',
            'items': [{'node_id': g['nodo'], 'name': 'PLANO-001.pdf'}],
            'steps': [{'user_id': g['r1'], 'email': PREFIJO + 'r1@ensayo.test',
                       'name': 'Revisor Uno', 'dias': 3},
                      {'user_id': g['r2'], 'email': PREFIJO + 'r2@ensayo.test',
                       'name': 'Revisor Dos', 'dias': 5}],
            'final_status': 'SHARED'})
        ok = r.status_code == 200 and (r.get_json() or {}).get('success')
        _paso(ok, 'la revision se crea', str(r.get_json())[:90])
        if not ok:
            return 1
        rid = r.get_json()['id']

        r = cli.get('/api/reviews?model_urn=' + OBRA)
        listado = (r.get_json() or {}).get('reviews') or []
        creada = next((x for x in listado if x.get('id') == rid), None)
        _paso(r.status_code == 200 and creada is not None,
              'la revision se LISTA desde PostgreSQL por su obra')
        _paso(creada and creada.get('flujo') == 'ACTIVA' and creada.get('paso_vence_en'),
              'el listado expone flujo ACTIVA y plazo del turno')

        cur.execute("SELECT paso_vence_en, history FROM doc_reviews WHERE id=%s", (rid,))
        vence1, historia = cur.fetchone()
        _paso(vence1 is not None, 'el PLAZO queda guardado EN EL REVIEW',
              'vence %s' % (vence1.strftime('%d/%m/%Y') if vence1 else 'nunca'))
        esperado = (datetime.datetime.now() + datetime.timedelta(days=3)).date()
        _paso(vence1 and vence1.date() == esperado,
              'y son los 3 dias del paso 1, contados desde hoy')

        de_r1 = enc.mi_trabajo(cur, g['r1'])
        de_r2 = enc.mi_trabajo(cur, g['r2'])
        _paso(len(de_r1) == 1 and de_r1[0]['vence_en'],
              'el revisor 1 la ve en su bandeja CON vencimiento')
        _paso(len(de_r2) == 0, 'el revisor 2 NO la ve todavia', '%d encargos' % len(de_r2))

        print()
        print('2 · EL HISTORIAL REGISTRA EL COMIENZO DEL TURNO')
        inicios = [h for h in historia if h.get('event') == 'step_started']
        _paso(len(inicios) == 1 and inicios[0]['step'] == 0,
              'hay una entrada `step_started` del paso 1')
        _paso(inicios and inicios[0].get('to_user_id') == g['r1'] and inicios[0].get('due'),
              'y dice a quien y con que plazo', str(inicios[0])[:88] if inicios else '')

        print()
        print('3 · SOLO LE TOCA AL REVISOR DEL PASO')
        c2 = cliente_como({'id': g['r2'], 'email': PREFIJO + 'r2@ensayo.test',
                           'name': 'Revisor Dos', 'role': 'editor'})
        r = c2.post('/api/reviews/%s/act' % rid, json={'action': 'approve'})
        _paso(r.status_code == 403, 'el revisor 2 NO puede actuar en el paso 1',
              'devolvio %s' % r.status_code)

        print()
        print('GUARDIANA · DOS PERSONAS CON EL MISMO NOMBRE')
        ct = cliente_como({'id': g['tocayo'], 'email': PREFIJO + 'tocayo@ensayo.test',
                           'name': 'Revisor Uno', 'role': 'editor'})
        r = ct.post('/api/reviews/%s/act' % rid, json={'action': 'approve'})
        _paso(r.status_code == 403,
              'el TOCAYO del revisor 1 no puede firmar en su lugar',
              'devolvio %s' % r.status_code)

        print()
        print('4 · EL PASO 1 APRUEBA Y ARRANCA EL 2, CON SU PROPIO PLAZO')
        c1 = cliente_como({'id': g['r1'], 'email': PREFIJO + 'r1@ensayo.test',
                           'name': 'Revisor Uno', 'role': 'editor'})
        r = c1.post('/api/reviews/%s/act' % rid,
                    json={'action': 'approve', 'comment': 'conforme'})
        _paso(r.status_code == 200, 'el revisor 1 aprueba', str(r.get_json())[:80])
        cur.execute("SELECT current_step, paso_vence_en FROM doc_reviews WHERE id=%s", (rid,))
        paso, vence2 = cur.fetchone()
        _paso(paso == 1, 'la revision avanza al paso 2')
        esperado2 = (datetime.datetime.now() + datetime.timedelta(days=5)).date()
        _paso(vence2 and vence2.date() == esperado2,
              'con SU plazo de 5 dias, no el del paso anterior ni ninguno',
              'vence %s' % (vence2.strftime('%d/%m/%Y') if vence2 else 'nunca'))
        _paso(len(enc.mi_trabajo(cur, g['r1'])) == 0, 'el revisor 1 deja de deberla')
        de_r2 = enc.mi_trabajo(cur, g['r2'])
        _paso(len(de_r2) == 1 and de_r2[0]['vence_en'],
              'y el revisor 2 la ve ahora, con vencimiento')

        print()
        print('8 · SE PIERDE EL ENCARGO -> SE RECONSTRUYE **CON SU PLAZO**')
        cur.execute("DELETE FROM encargos WHERE objeto_tipo='REVIEW' AND objeto_id=%s",
                    (str(rid),))
        conn.commit()
        _paso(len(enc.mi_trabajo(cur, g['r2'])) == 0, 'el encargo desaparece (fallo simulado)')
        cerrados, abiertos, _d = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        rehecho = enc.mi_trabajo(cur, g['r2'])
        _paso(abiertos == 1 and len(rehecho) == 1, 'la conciliacion lo reconstruye')
        _paso(rehecho and rehecho[0]['vence_en']
              and rehecho[0]['vence_en'][:10] == vence2.date().isoformat(),
              'Y CON EL MISMO PLAZO, porque el Review lo sabia',
              rehecho[0]['vence_en'] if rehecho else 'sin plazo')

        print()
        print('5 y 6 · EL PASO 2 APRUEBA Y SE CIERRA EL CICLO')
        c2 = cliente_como({'id': g['r2'], 'email': PREFIJO + 'r2@ensayo.test',
                           'name': 'Revisor Dos', 'role': 'editor'})
        r = c2.post('/api/reviews/%s/act' % rid, json={'action': 'approve'})
        _paso(r.status_code == 200, 'el revisor 2 aprueba', str(r.get_json())[:80])
        cur.execute("SELECT status, cerrada_en, paso_vence_en FROM doc_reviews WHERE id=%s",
                    (rid,))
        estado, cerrada, vence_final = cur.fetchone()
        _paso(estado == 'approved' and cerrada is not None,
              'queda aprobada y fechada', 'estado=%s' % estado)
        _paso(vence_final is None, 'y sin turno vivo: ya no hay plazo que vencer')
        cur.execute("SELECT status FROM file_nodes WHERE id::text=%s", (g['nodo'],))
        _paso((cur.fetchone() or [''])[0] == 'SHARED',
              'el documento transiciona al estado ISO final')
        cur.execute("SELECT count(*) FROM encargos WHERE objeto_tipo='REVIEW' "
                    "  AND objeto_id=%s AND estado='abierto'", (str(rid),))
        _paso(cur.fetchone()[0] == 0, 'no queda ningun encargo abierto de esa revision')

        print()
        print('7 · UN REVISOR SALE DE LA OBRA A MITAD')
        # `contrato` EXPLICITO, y vale 'PRE' porque es lo que esta revision ES:
        # sus pasos no declaran `decision` y este ensayo mide el cierre por
        # POSICION. Bajo AUTORIDAD_TERMINAL un paso sin decision queda congelado
        # --el motor no lo interpreta-- y el ensayo dejaria de medir lo suyo.
        #
        # Va explicito porque la fase E de REVIEWS-R01 retira el `DEFAULT 'PRE'`:
        # desde entonces omitirlo es un error, no una herencia silenciosa.
        cur.execute("INSERT INTO doc_reviews (model_urn, title, items, steps, final_status, "
                    "  created_by, history, contrato) VALUES (%s,'Revision que se bloquea', "
                    "  %s,%s,'SHARED','ensayo','[]'::jsonb,'PRE') RETURNING id",
                    (OBRA, json.dumps([{'node_id': g['nodo']}]),
                     json.dumps([{'user_id': g['r2'], 'name': 'Revisor Dos', 'dias': 2}])))
        rid_b = cur.fetchone()[0]
        enc.abrir(cur, 'REVIEW', rid_b, 'Revisar', destino_usuario=g['r2'], creado_por='ensayo')
        cur.execute("DELETE FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OBRA, g['r2']))
        conn.commit()

        cur.execute("SELECT status, current_step, steps, model_urn FROM doc_reviews WHERE id=%s",
                    (rid_b,))
        st, cs, stp, mu = cur.fetchone()
        estado, motivo = flujo.estado_del_flujo(
            cur, {'status': st, 'current_step': cs, 'steps': stp, 'model_urn': mu})
        _paso(estado == 'BLOQUEADA', 'la revision se reporta BLOQUEADA', motivo[:70])
        _paso('Revisor Dos' in motivo, 'y dice quien es el revisor que falta')

        cerrados, abiertos, d = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(any(b[1] == str(rid_b) for b in d.get('bloqueadas') or []),
              'la conciliacion la lista como BLOQUEADA, no como «falta un encargo»')
        d2 = enc.divergencias(cur)
        _paso(not d2['sobrantes'] and not d2['faltantes'],
              'y CONVERGE: no la intenta reparar una y otra vez',
              'sobran %d, faltan %d' % (len(d2['sobrantes']), len(d2['faltantes'])))

        print()
        print('9 · UNA REVISION HISTORICA (sin user_id ni dias) SIGUE IGUAL')
        cur.execute("DELETE FROM encargos WHERE project_id=%s", (OBRA,))
        # PRE: es literalmente una revision HISTORICA, con paso legacy --solo
        # correo y nombre-- y sin `decision`. Ver la nota del primer INSERT.
        cur.execute("INSERT INTO doc_reviews (model_urn, title, items, steps, final_status, "
                    "  created_by, history, contrato) VALUES (%s,'Revision historica', "
                    "  %s,%s,'SHARED','ensayo','[]'::jsonb,'PRE') RETURNING id",
                    (OBRA, json.dumps([{'node_id': g['nodo']}]),
                     json.dumps([{'email': PREFIJO + 'r1@ensayo.test', 'name': 'Revisor Uno'}])))
        rid_h = cur.fetchone()[0]
        conn.commit()
        paso_h = {'email': PREFIJO + 'r1@ensayo.test', 'name': 'Revisor Uno'}
        _paso(flujo.es_legacy(paso_h), 'se reconoce como paso LEGACY')
        _paso(flujo.puede_actuar({'id': g['r1'], 'email': PREFIJO + 'r1@ensayo.test',
                                  'name': 'Revisor Uno'}, paso_h),
              'su revisor sigue pudiendo actuar (por correo)')
        _paso(flujo.vencimiento(paso_h) is None, 'y sigue sin plazo, como siempre')
        uid_h, _m = flujo.revisor_del_paso(cur, paso_h)
        _paso(uid_h == g['r1'], 'y su encargo se puede abrir igual')

        print()
        print('10 · EL RECORDATORIO ENCUENTRA LO VENCIDO')
        eid = enc.abrir(cur, 'REVIEW', rid_h, 'Revisar historica',
                        destino_usuario=g['r1'],
                        vence_en=datetime.datetime.now() - datetime.timedelta(days=2),
                        creado_por='ensayo')
        cur.execute("UPDATE encargos SET avisado_en=CURRENT_TIMESTAMP WHERE id=%s", (eid,))
        conn.commit()
        vencidos = pendientes_de_recordar(cur, 0)
        _paso(any(v[0] == eid for v in vencidos),
              'el recordatorio la ve vencida', '%d pendientes' % len(vencidos))

        print()
        print('11 · LA SALIDA CONTROLADA DE UNA REVISION BLOQUEADA')
        # `rid_b` sigue bloqueada: su revisor (r2) salio de la obra en el paso 7.
        # OJO: `cliente_como` reasigna `am.validate_session`, que es una global del
        # modulo. Guardar dos clientes y alternar entre ellos NO funciona: los dos
        # hablarian con la identidad del ultimo creado. Se construye uno nuevo
        # justo antes de cada peticion.
        def como_admin():
            return cliente_como({'id': g['autor'], 'email': PREFIJO + 'autor@ensayo.test',
                                 'name': 'Autor Uno', 'role': 'admin'})

        def como_r1():
            return cliente_como({'id': g['r1'], 'email': PREFIJO + 'r1@ensayo.test',
                                 'name': 'Revisor Uno', 'role': 'editor'})

        r = como_r1().post('/api/reviews/%s/reasignar' % rid_b,
                          json={'user_id': g['r1'], 'motivo': 'me la quedo yo'})
        _paso(r.status_code == 403, 'un NO administrador no puede sustituir',
              'devolvio %s' % r.status_code)

        r = como_admin().post('/api/reviews/%s/reasignar' % rid_b, json={'user_id': g['r1']})
        _paso(r.status_code == 400
              and (r.get_json() or {}).get('code') == 'FALTA_MOTIVO',
              'sin motivo NO se sustituye: el historial contaria que y no por que')

        cur.execute("SELECT id FROM doc_reviews WHERE model_urn=%s AND status='approved' "
                    " ORDER BY id LIMIT 1", (OBRA,))
        fila = cur.fetchone()
        if fila:
            r = como_admin().post('/api/reviews/%s/reasignar' % fila[0],
                           json={'user_id': g['r1'], 'motivo': 'porque si'})
            _paso(r.status_code == 409
                  and (r.get_json() or {}).get('code') == 'NO_ESTA_BLOQUEADA',
                  'no sirve para cambiar quien firma una revision que NO esta bloqueada',
                  'devolvio %s' % r.status_code)

        # El revisor nuevo tiene que estar en la obra: r2 sigue fuera.
        r = como_admin().post('/api/reviews/%s/reasignar' % rid_b,
                       json={'user_id': g['r2'], 'motivo': 'vuelve el mismo'})
        _paso(r.status_code == 400
              and (r.get_json() or {}).get('code') == 'REVISOR_FUERA_DE_LA_OBRA',
              'no se puede sustituir por alguien que no pertenece a la obra')

        # Independencia: una revision cuyo autor es el tocayo, con un solo paso.
        # PRE: paso sin `decision`, cierre por posicion. Ver el primer INSERT.
        cur.execute("INSERT INTO doc_reviews (model_urn, title, items, steps, final_status,"
                    "  created_by, history, contrato) VALUES (%s,'Revision del tocayo',"
                    "  %s,%s,'SHARED',%s,'[]'::jsonb,'PRE') RETURNING id",
                    (OBRA, json.dumps([{'node_id': g['nodo']}]),
                     json.dumps([{'user_id': g['r2'], 'name': 'Revisor Dos'}]),
                     PREFIJO + 'tocayo@ensayo.test'))
        rid_i = cur.fetchone()[0]
        conn.commit()
        r = como_admin().post('/api/reviews/%s/reasignar' % rid_i,
                       json={'user_id': g['tocayo'], 'motivo': 'que la firme el autor'})
        _paso(r.status_code == 400
              and (r.get_json() or {}).get('code') == 'REVISION_SIN_INDEPENDENCIA',
              'una sustitucion NO puede dejar al autor como unico revisor',
              'devolvio %s' % r.status_code)

        # Y ahora la sustitucion buena.
        antes_hist = None
        cur.execute("SELECT history FROM doc_reviews WHERE id=%s", (rid_b,))
        antes_hist = cur.fetchone()[0] or []
        r = como_admin().post('/api/reviews/%s/reasignar' % rid_b,
                       json={'user_id': g['r1'], 'motivo': 'Revisor Dos dejo la obra'})
        _paso(r.status_code == 200 and (r.get_json() or {}).get('success'),
              'el administrador SI puede sustituir en una bloqueada',
              str(r.get_json())[:80])

        cur.execute("SELECT steps, history, paso_vence_en FROM doc_reviews WHERE id=%s",
                    (rid_b,))
        pasos_b, hist_b, vence_b = cur.fetchone()
        paso_b = pasos_b[0]
        _paso(paso_b.get('user_id') == g['r1'], 'el paso apunta ya al nuevo revisor')
        _paso((paso_b.get('reasignado_de') or {}).get('user_id') == g['r2'],
              'y CONSERVA quien era el anterior, dentro del propio paso')

        cambio = [h for h in hist_b if h.get('event') == 'step_reassigned']
        _paso(len(cambio) == 1
              and cambio[0]['from']['user_id'] == g['r2']
              and cambio[0]['to']['user_id'] == g['r1']
              and cambio[0].get('reason')
              and cambio[0].get('by'),
              'el historial dice a quien, por quien, cuando y POR QUE',
              str(cambio[0])[:88] if cambio else 'sin entrada')
        _paso(all(h in hist_b for h in antes_hist),
              'y no se toco ni una entrada anterior del historial')

        estado, _m = flujo.estado_del_flujo(
            cur, {'status': 'pending', 'current_step': 0, 'steps': pasos_b,
                  'model_urn': OBRA})
        _paso(estado == 'ACTIVA', 'la revision deja de estar BLOQUEADA')
        de_r1 = [x for x in enc.mi_trabajo(cur, g['r1'])
                 if x['objeto_tipo'] == 'REVIEW' and x['objeto_id'] == str(rid_b)]
        _paso(len(de_r1) == 1, 'y el nuevo revisor la ve en su bandeja')
        _paso(vence_b is not None and de_r1 and de_r1[0]['vence_en'],
              'con el plazo del paso, recalculado al empezar su turno')

        r = como_r1().post('/api/reviews/%s/act' % rid_b, json={'action': 'approve'})
        _paso(r.status_code == 200, 'y puede aprobarla: la revision avanza de nuevo',
              'devolvio %s' % r.status_code)

        print()
        print('12 · EL RECORDATORIO NO SE REPITE')
        cur.execute("DELETE FROM encargos WHERE project_id=%s", (OBRA,))
        eid2 = enc.abrir(cur, 'REVIEW', rid_h, 'Revisar historica',
                         destino_usuario=g['r1'],
                         vence_en=datetime.datetime.now() - datetime.timedelta(days=1),
                         creado_por='ensayo')
        cur.execute("UPDATE encargos SET avisado_en=CURRENT_TIMESTAMP WHERE id=%s", (eid2,))
        conn.commit()
        primera = pendientes_de_recordar(cur, 0)
        _paso(any(v[0] == eid2 for v in primera), 'la primera vez, sale para recordar')

        cur.execute("UPDATE encargos SET recordado_en=CURRENT_TIMESTAMP WHERE id=%s", (eid2,))
        conn.commit()
        segunda = pendientes_de_recordar(cur, 0)
        _paso(not any(v[0] == eid2 for v in segunda),
              'recien recordado, YA NO sale: programarlo cada hora no manda un correo por hora')

        pasado = pendientes_de_recordar(cur, 0, cada_horas=0)
        _paso(any(v[0] == eid2 for v in pasado),
              'y cuando pasa la ventana, vuelve a salir')

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
