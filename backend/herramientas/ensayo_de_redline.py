# -*- coding: utf-8 -*-
"""El ciclo completo de un Red Line profesional, contra PostgreSQL.

QUE ES UN RED LINE, Y QUE NO
----------------------------
Es el REGISTRO DE LOS CROQUIS DE MODIFICACION del proyecto, no una observacion
ni un markup grafico. El veredicto acepta o rechaza LA MODIFICACION.

QUE DEMUESTRA
-------------
  1. Se crea sin responsable -> no aparece en la bandeja de nadie.
  2. Se asigna -> el responsable lo ve CON plazo (dias calendario); nadie mas.
  3. Un miembro cualquiera NO puede cambiar el responsable.
  4. SOLO el responsable dicta el veredicto -- ni siquiera el EMISOR.
  5. Aceptado -> veredicto y fecha congelados, encargo cerrado.
  6. DEVOLVER a revision: lo hace el emisor, retira el veredicto y vuelve a la
     bandeja del responsable.
  7. Cierra el emisor; un cerrado no se reasigna ni se modifica.
  8. El responsable SALE DE LA OBRA -> BLOQUEADO, y se desatasca reasignando.
  9. El EMISOR sale de la obra -> un administrador puede cerrarlo igualmente.
 10. Los HISTORICOS quedan intactos y NINGUNO pide adopcion.
 11. Dos alcances de la MISMA OBRA no comparten codigo `RL-`.
 12. CONCURRENCIA REAL: seis creaciones simultaneas -> seis codigos distintos.
 13. Un adjunto nuevo se fija a `version_id` con rol `deteccion`; el legacy no.
 14. Se puede CERRAR SIN adjunto de correccion: es capacidad, no obligacion.
 15. La conciliacion detecta un encargo de Red Line que FALTA -- antes no podia.
 16. El contrato `{"results": [...]}` que la interfaz ya espera.

QUE NO TOCA
-----------
Crea todo con prefijo `zz_rl_` y solo borra lo que crea.

    python herramientas/ensayo_de_redline.py
"""
import datetime
import importlib
import json
import os
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_rl_'
OBRA = PREFIJO + 'obra'
ALIAS = OBRA + '_DRENAJE'          # otro alcance de LA MISMA obra

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_redlines WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_nodes WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))


def montar(cur, ref):
    cur.execute("SELECT id FROM hubs LIMIT 1")
    fila = cur.fetchone()
    cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                "VALUES (%s,%s,'ZZ RL',%s,'active')",
                (OBRA, fila[0] if fila else None, OBRA))
    ref.registrar_obra(cur, OBRA, nombre='ZZ RL', model_urn=OBRA,
                       origen='ensayo de redline')

    def usuario(nombre, correo, miembro=True):
        cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                    "VALUES (%s,%s,'x','editor',TRUE) RETURNING id",
                    (nombre, PREFIJO + correo))
        uid = cur.fetchone()[0]
        if miembro:
            cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                        (OBRA, uid))
        return uid

    g = {'emisor': usuario('Emisor', 'emis@e.test'),
         'proyectista': usuario('Proyectista', 'proy@e.test'),
         'supervisor': usuario('Supervisor', 'sup@e.test'),
         'ajeno': usuario('Ajeno', 'ajeno@e.test')}
    cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                "VALUES ('Jefa','%sjefa@e.test','x','admin',TRUE) RETURNING id" % PREFIJO)
    g['admin'] = cur.fetchone()[0]
    cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                (OBRA, g['admin']))

    cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                "VALUES (%s,'FILE','PLANO-BP-04.pdf','WIP') RETURNING id::text", (OBRA,))
    g['nodo'] = cur.fetchone()[0]
    cur.execute("INSERT INTO file_versions (file_node_id, version_number, gcs_urn) "
                "VALUES (%s::uuid, 1, %s) RETURNING id::text",
                (g['nodo'], PREFIJO + 'obj/plano-v1.pdf'))
    g['version'] = cur.fetchone()[0]
    return g


def cliente(usuario):
    """App con el blueprint REAL de Red Line. Se construye ANTES de cada
    peticion: `validate_session` es una global del modulo y solo vale la ultima.
    Este mismo descuido ya hizo pasar en falso una prueba de revisiones."""
    from flask import Flask
    import auth_middleware as am
    import routes.redlines as rl

    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    app.register_blueprint(rl.redlines_bp, url_prefix='/api/redlines')
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
    import encargos as enc
    import flujo_de_redline as flujo
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DEL CICLO DE RED LINE')
    print('=' * 76)

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None
        g = montar(cur, ref)
        conn.commit()
        db._project_resolver_cache['map'] = None

        def sesion(quien, rol='editor'):
            correos = {'emisor': 'emis', 'proyectista': 'proy', 'supervisor': 'sup',
                       'ajeno': 'ajeno', 'admin': 'jefa'}
            return {'id': g[quien], 'email': PREFIJO + correos[quien] + '@e.test',
                    'name': quien.capitalize(),
                    'role': 'admin' if quien == 'admin' else rol}

        def como(quien):
            return cliente(sesion(quien))

        print()
        print('1 · SE EMITE SIN RESPONSABLE')
        r = como('emisor').post('/api/redlines', json={
            'model_urn': OBRA, 'titulo': 'Reubicar BP-04 y cambio de cota BP-01'})
        ok = r.status_code == 200
        _paso(ok, 'el Red Line se emite', str(r.get_json())[:80])
        if not ok:
            return 1
        rl = r.get_json()['rfi']
        _paso(rl['codigo'] == 'RL-001', 'y numera desde RL-001', rl['codigo'])
        _paso(rl['project_id'] == OBRA, 'con su obra canonica guardada')

        # 16 · EL CONTRATO DE LA LISTA, como cliente HTTP y no como consulta a
        # la base. Se comprueba porque la ruta gemela del RFI ya lo rompio una
        # vez sin que nadie lo notara.
        r = como('emisor').get('/api/redlines/%s' % OBRA)
        cuerpo = r.get_json()
        _paso(r.status_code == 200 and isinstance(cuerpo, dict)
              and isinstance(cuerpo.get('results'), list),
              'la lista respeta el contrato {"results": [...]}', str(cuerpo)[:60])
        uno = next((x for x in cuerpo.get('results', []) if x['id'] == rl['id']), {})
        _paso(bool(uno), 'y el Red Line recien emitido aparece en ella')
        _paso(uno.get('flujo') == 'SIN_ASIGNAR' and 'necesita_adopcion' in uno,
              'con su estado de flujo calculado', str(uno.get('flujo')))
        _paso(all(len(enc.mi_trabajo(cur, g[q])) == 0
                  for q in ('emisor', 'proyectista', 'supervisor')),
              'sin responsable, no le corre a NADIE')

        print()
        print('2 y 3 · ASIGNAR: QUIEN PUEDE Y QUIEN NO')
        vence = (datetime.datetime.now() + datetime.timedelta(days=4)).isoformat()
        r = como('ajeno').patch('/api/redlines/%s' % rl['id'],
                                json={'responsable_id': g['proyectista']})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'NO_PUEDE_REASIGNAR',
              'un miembro cualquiera NO puede cambiar el responsable',
              'devolvio %s' % r.status_code)

        r = como('emisor').patch('/api/redlines/%s' % rl['id'], json={
            'responsable_id': g['proyectista'], 'vence_en': vence})
        _paso(r.status_code == 200, 'el EMISOR si puede asignarlo', str(r.get_json())[:70])
        cur.execute("SELECT estado, responsable_id, vence_en FROM doc_redlines "
                    "  WHERE id::text=%s", (rl['id'],))
        est, resp, vn = cur.fetchone()
        _paso(est == 'En revisión', 'y pasa a «En revisión»', est)
        _paso(vn is not None, 'el PLAZO queda en el OBJETO, no solo en el encargo')
        del_proy = enc.mi_trabajo(cur, g['proyectista'])
        _paso(len(del_proy) == 1 and del_proy[0]['vence_en'],
              'el proyectista lo ve en su bandeja CON vencimiento')
        _paso(del_proy[0]['asunto'].startswith('Revisar'),
              'y el encargo dice REVISAR la modificacion, no «responder»',
              del_proy[0]['asunto'][:40])
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) == 0, 'y nadie mas lo ve')

        print()
        print('4 · SOLO QUIEN LO TIENE ACEPTA O RECHAZA LA MODIFICACION')
        r = como('emisor').patch('/api/redlines/%s' % rl['id'],
                                 json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'NO_PUEDE_RESPONDER',
              'ni siquiera el EMISOR acepta su propia modificacion',
              'devolvio %s' % r.status_code)
        r = como('admin').patch('/api/redlines/%s' % rl['id'],
                                json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 403, 'ni un ADMINISTRADOR: primero tendria que asignarselo',
              'devolvio %s' % r.status_code)
        r = como('proyectista').patch('/api/redlines/%s' % rl['id'],
                                      json={'estado': 'Respondido'})
        _paso(r.status_code == 400 and (r.get_json() or {}).get('code') == 'FALTA_VEREDICTO',
              'pronunciarse SIN veredicto no vale')

        print()
        print('5 · EL RESPONSABLE SE PRONUNCIA')
        r = como('proyectista').patch('/api/redlines/%s' % rl['id'],
                                      json={'estado': 'Respondido', 'respuesta': 'Rechazado'})
        _paso(r.status_code == 200, 'el proyectista RECHAZA la modificacion',
              str(r.get_json())[:60])
        cur.execute("SELECT estado, respuesta, fecha_respuesta FROM doc_redlines "
                    "  WHERE id::text=%s", (rl['id'],))
        est, ver, fr = cur.fetchone()
        _paso(est == 'Respondido' and ver == 'Rechazado' and fr is not None,
              'veredicto y fecha quedan congelados', '%s / %s' % (est, ver))
        _paso(len(enc.mi_trabajo(cur, g['proyectista'])) == 0,
              'y deja de deberlo: su encargo se cierra')

        print()
        print('6 · DEVOLVER A CORRECCION')
        r = como('proyectista').patch('/api/redlines/%s' % rl['id'],
                                      json={'estado': 'En revisión'})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'NO_PUEDE_DEVOLVER',
              'quien dicto el veredicto NO puede deshacerlo',
              'devolvio %s' % r.status_code)
        r = como('emisor').patch('/api/redlines/%s' % rl['id'],
                                 json={'estado': 'En revisión'})
        _paso(r.status_code == 200, 'el EMISOR lo devuelve para que se rehaga el croquis')
        cur.execute("SELECT estado, respuesta, fecha_respuesta, historial "
                    "  FROM doc_redlines WHERE id::text=%s", (rl['id'],))
        est, ver, fr, hist = cur.fetchone()
        _paso(est == 'En revisión' and not ver and fr is None,
              'y el veredicto SE RETIRA: no puede constar resuelto y en revision',
              '%s / %r' % (est, ver))
        dev = [h for h in hist if h.get('event') == 'returned']
        _paso(len(dev) == 1 and dev[0].get('veredicto') == 'Rechazado',
              'pero el historial conserva cual era', str(dev[0])[:70])
        _paso(len(enc.mi_trabajo(cur, g['proyectista'])) == 1,
              'y vuelve a la bandeja del responsable: una devolucion que nadie ve '
              'no es una devolucion')
        # Y las dos mitades de la conciliacion tienen que estar de acuerdo.
        d = enc.divergencias(cur)
        _paso(not [x for x in d['sobrantes'] if x[1] == rl['id']],
              'la conciliacion NO lo declara sobrante: no oscila')

        print()
        print('7 · CIERRA EL EMISOR, Y CERRADO ES CERRADO')
        como('proyectista').patch('/api/redlines/%s' % rl['id'],
                                  json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        r = como('proyectista').patch('/api/redlines/%s' % rl['id'],
                                      json={'estado': 'Cerrado'})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'NO_PUEDE_CERRAR',
              'el responsable NO cierra: cierra quien lo emitio')
        r = como('emisor').patch('/api/redlines/%s' % rl['id'], json={'estado': 'Cerrado'})
        _paso(r.status_code == 200, 'el emisor cierra')
        cur.execute("SELECT cerrado_por, historial FROM doc_redlines WHERE id::text=%s",
                    (rl['id'],))
        cp, hist = cur.fetchone()
        _paso(bool(cp), 'y queda escrito quien cerro', str(cp))
        eventos = [h.get('event') for h in hist]
        _paso(eventos == ['created', 'ball_in_court_changed', 'estado', 'responded',
                          'returned', 'responded', 'closed'],
              'el historial cuenta el ciclo entero, devolucion incluida', str(eventos))
        r = como('emisor').patch('/api/redlines/%s' % rl['id'],
                                 json={'responsable_id': g['supervisor']})
        _paso(r.status_code == 409 and (r.get_json() or {}).get('code') == 'REDLINE_CERRADO',
              'un Red Line cerrado ya no se reasigna')
        r = como('emisor').patch('/api/redlines/%s' % rl['id'], json={'titulo': 'Otro'})
        _paso(r.status_code == 409, 'ni se modifica')

        print()
        print('8 · EL RESPONSABLE SALE DE LA OBRA')
        r = como('emisor').post('/api/redlines', json={'model_urn': OBRA,
                                                       'titulo': 'Refuerzo en aberturas'})
        rl2 = r.get_json()['rfi']
        como('emisor').patch('/api/redlines/%s' % rl2['id'],
                             json={'responsable_id': g['supervisor']})
        cur.execute("DELETE FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OBRA, g['supervisor']))
        conn.commit()
        cur.execute("SELECT estado, responsable_id, responsable, project_id "
                    "  FROM doc_redlines WHERE id::text=%s", (rl2['id'],))
        e2, r2, rt2, p2 = cur.fetchone()
        est_flujo, motivo = flujo.estado_del_flujo(
            cur, {'estado': e2, 'responsable_id': r2, 'responsable': rt2, 'project_id': p2})
        _paso(est_flujo == 'BLOQUEADO', 'el Red Line queda BLOQUEADO', motivo[:60])
        d = enc.divergencias(cur)
        _paso(any(b[0] == 'REDLINE' and b[1] == rl2['id'] for b in d.get('bloqueadas', [])),
              'y la conciliacion lo llama BLOQUEADO, no «divergencia reparable»')
        r = como('emisor').patch('/api/redlines/%s' % rl2['id'],
                                 json={'responsable_id': g['proyectista']})
        _paso(r.status_code == 200,
              'se desatasca reasignando, SIN puertas de administrador')

        print()
        print('9 · EL EMISOR SALE DE LA OBRA')
        como('proyectista').patch('/api/redlines/%s' % rl2['id'],
                                  json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        cur.execute("UPDATE users SET is_active = FALSE WHERE id = %s", (g['emisor'],))
        cur.execute("DELETE FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OBRA, g['emisor']))
        conn.commit()
        r = como('admin').patch('/api/redlines/%s' % rl2['id'], json={'estado': 'Cerrado'})
        _paso(r.status_code == 200,
              'un ADMINISTRADOR lo cierra: no queda bloqueado para siempre',
              str(r.get_json())[:60])
        cur.execute("UPDATE users SET is_active = TRUE WHERE id = %s", (g['emisor'],))
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA, g['emisor']))
        conn.commit()

        print()
        print('10 · LOS HISTORICOS QUEDAN INTACTOS')
        # Con la MISMA forma que los 33 reales: cerrados, veredicto puesto,
        # responsable en TEXTO, y el adjunto apuntando solo al nodo.
        cur.execute("INSERT INTO doc_redlines (model_urn, codigo, titulo, estado, "
                    "  responsable, respuesta, created_by, project_id, adjuntos) "
                    "VALUES (%s,'RL-900','ACABADO_DE_TAPAS_DE_BUZONES','Cerrado',"
                    "  'Yaser Omar','Aceptado',%s,%s,%s::jsonb) RETURNING id::text",
                    (OBRA, 'Yaser Omar', OBRA,
                     json.dumps([{'id': 'viejo', 'name': 'RL_0010_..._RL_OK.pdf',
                                  'gcs_urn': 'multi-tenant/x/rl.pdf'}])))
        hist_cerrado = cur.fetchone()[0]
        cur.execute("SELECT estado, responsable, respuesta, adjuntos FROM doc_redlines "
                    "  WHERE id::text=%s", (hist_cerrado,))
        antes = cur.fetchone()
        conn.commit()
        _paso(not flujo.necesita_adopcion({'responsable': 'Yaser Omar',
                                           'responsable_id': None, 'estado': 'Cerrado'}),
              'un historico CERRADO no pide adopcion: es archivo')
        r = como('emisor').get('/api/redlines/%s' % OBRA)
        h = next((x for x in r.get_json()['results'] if x['id'] == hist_cerrado), {})
        _paso(h.get('flujo') == 'CERRADO' and h.get('necesita_adopcion') is False,
              'y la lista lo dice tambien', str(h.get('flujo')))
        r = como('emisor').patch('/api/redlines/%s' % hist_cerrado,
                                 json={'respuesta': 'Rechazado'})
        _paso(r.status_code == 409,
              'y no se le puede reescribir la historia', 'devolvio %s' % r.status_code)
        cur.execute("SELECT estado, responsable, respuesta, adjuntos FROM doc_redlines "
                    "  WHERE id::text=%s", (hist_cerrado,))
        _paso(cur.fetchone() == antes,
              'sigue EXACTAMENTE igual: estado, texto, veredicto y adjunto')

        # Y uno heredado ABIERTO si necesita adopcion -- aunque de los 33 reales
        # no haya ninguno, la regla tiene que existir.
        cur.execute("INSERT INTO doc_redlines (model_urn, codigo, titulo, estado, "
                    "  responsable, created_by, project_id) VALUES (%s,'RL-901',"
                    "  'Heredado abierto','En revisión','Yaser Omar',%s,%s) "
                    "RETURNING id::text", (OBRA, PREFIJO + 'emis@e.test', OBRA))
        hist_abierto = cur.fetchone()[0]
        conn.commit()
        r = como('proyectista').patch('/api/redlines/%s' % hist_abierto,
                                      json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 409 and (r.get_json() or {}).get('code') == 'NECESITA_ADOPCION',
              'un heredado ABIERTO no admite veredicto hasta ser adoptado')
        r = como('emisor').patch('/api/redlines/%s' % hist_abierto,
                                 json={'responsable_id': g['proyectista']})
        _paso(r.status_code == 200, 'el emisor lo ADOPTA eligiendo a un miembro')
        cur.execute("SELECT responsable, historial FROM doc_redlines WHERE id::text=%s",
                    (hist_abierto,))
        txt, hh = cur.fetchone()
        ad = [x for x in hh if x.get('event') == 'adopted']
        _paso(txt == 'Yaser Omar' and len(ad) == 1
              and ad[0].get('responsable_texto') == 'Yaser Omar',
              'el TEXTO historico se conserva y el historial dice quien lo adoptó')

        print()
        print('11 · DOS ALCANCES DE LA MISMA OBRA NO COMPARTEN CODIGO')
        db._project_resolver_cache['map'] = None
        r = como('emisor').post('/api/redlines', json={'model_urn': ALIAS,
                                                       'titulo': 'Desde otro alcance'})
        ok = r.status_code == 200
        _paso(ok, 'se emite un Red Line bajo el alcance «%s»' % ALIAS,
              str(r.get_json())[:70])
        if ok:
            cur.execute("SELECT count(*), count(DISTINCT codigo) FROM doc_redlines "
                        "  WHERE project_id=%s", (OBRA,))
            n, distintos = cur.fetchone()
            _paso(n == distintos,
                  'y su codigo NO choca con los del otro alcance: %d Red Lines, '
                  '%d codigos' % (n, distintos))

        print()
        print('12 · CONCURRENCIA REAL')
        import routes.redlines as rlmod
        original = flujo.siguiente_codigo
        estado_falso = {'veces': 0}

        def colisiona(cur_, obra_):
            estado_falso['veces'] += 1
            if estado_falso['veces'] == 1:
                cur_.execute("SELECT codigo FROM doc_redlines WHERE project_id=%s "
                             " ORDER BY codigo LIMIT 1", (obra_,))
                fila = cur_.fetchone()
                if fila:
                    return fila[0]          # un codigo YA existente
            return original(cur_, obra_)

        rlmod.flujo.siguiente_codigo = colisiona
        try:
            r = como('emisor').post('/api/redlines', json={'model_urn': OBRA,
                                                           'titulo': 'Tras colision'})
            _paso(r.status_code == 200,
                  'una colision de codigo se recupera por SAVEPOINT, sin 500',
                  'devolvio %s' % r.status_code)
        finally:
            rlmod.flujo.siguiente_codigo = original

        resultados, barrera = [], threading.Barrier(6)

        def crear(i):
            barrera.wait()
            try:
                rr = cliente(sesion('emisor')).post(
                    '/api/redlines', json={'model_urn': OBRA, 'titulo': 'Simultaneo %d' % i})
                resultados.append((rr.status_code, (rr.get_json() or {})
                                   .get('rfi', {}).get('codigo')))
            except Exception as e:
                resultados.append((500, str(e)[:40]))

        hilos = [threading.Thread(target=crear, args=(i,)) for i in range(6)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()

        codigos = [c for s, c in resultados if s == 200 and c]
        quinientos = [s for s, _ in resultados if s == 500]
        _paso(not quinientos, 'seis emisiones simultaneas: NINGUN 500 opaco',
              str(resultados[:3]))
        _paso(len(codigos) == len(set(codigos)),
              'y todos los codigos son DISTINTOS', str(sorted(codigos)))
        cur.execute("SELECT count(*), count(DISTINCT codigo) FROM doc_redlines "
                    "  WHERE project_id=%s", (OBRA,))
        n, distintos = cur.fetchone()
        _paso(n == distintos, 'la obra no tiene ni un codigo repetido: %d/%d'
              % (n, distintos))

        print()
        print('13 y 14 · DOCUMENTOS: LA VERSION DE DETECCION SE CONGELA')
        r = como('emisor').post('/api/redlines', json={'model_urn': OBRA,
                                                       'titulo': 'Con croquis'})
        rl3 = r.get_json()['rfi']
        r = como('emisor').patch('/api/redlines/%s' % rl3['id'], json={'adjuntos': [
            {'node_id': g['nodo'], 'version_id': g['version'], 'version_number': 1,
             'name': 'RL_0004_..._SKT_....pdf', 'rol': 'deteccion'},
            {'id': 'viejo', 'name': 'legacy.pdf', 'gcs_urn': 'multi-tenant/x/y.pdf'}]})
        _paso(r.status_code == 200, 'se adjuntan un croquis nuevo y uno heredado')
        cur.execute("SELECT adjuntos FROM doc_redlines WHERE id::text=%s", (rl3['id'],))
        adj = cur.fetchone()[0]
        _paso(adj[0].get('version_id') == g['version'] and adj[0].get('rol') == 'deteccion',
              'el nuevo guarda `version_id` y el rol `deteccion`')
        _paso(adj[1].get('gcs_urn') and not adj[1].get('version_id'),
              'y el heredado se conserva tal cual, sin convertirse')

        cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                    "VALUES ('otra_obra_zz','FILE','ajeno.pdf','WIP') RETURNING id::text")
        ajeno = cur.fetchone()[0]
        conn.commit()
        r = como('emisor').patch('/api/redlines/%s' % rl3['id'], json={'adjuntos': [
            {'node_id': ajeno, 'name': 'ajeno.pdf'}]})
        _paso(r.status_code == 400 and (r.get_json() or {}).get('code') == 'ADJUNTO_DE_OTRA_OBRA',
              'no se puede adjuntar un documento de OTRA obra',
              'devolvio %s' % r.status_code)
        cur.execute("DELETE FROM file_nodes WHERE id::text=%s", (ajeno,))
        conn.commit()

        # 14 · El documento de correccion es CAPACIDAD, no obligacion.
        como('emisor').patch('/api/redlines/%s' % rl3['id'],
                             json={'responsable_id': g['proyectista']})
        como('proyectista').patch('/api/redlines/%s' % rl3['id'],
                                  json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        r = como('emisor').patch('/api/redlines/%s' % rl3['id'], json={'estado': 'Cerrado'})
        cur.execute("SELECT adjuntos FROM doc_redlines WHERE id::text=%s", (rl3['id'],))
        roles = [a.get('rol') for a in cur.fetchone()[0]]
        _paso(r.status_code == 200 and 'correccion' not in roles,
              'se CIERRA sin adjunto de correccion: es capacidad, no obligacion '
              '(29 de los 33 reales tienen un solo adjunto)', str(roles))

        print()
        print('15 · LA CONCILIACION YA RECONSTRUYE UN ENCARGO DE RED LINE')
        r = como('emisor').post('/api/redlines', json={'model_urn': OBRA,
                                                       'titulo': 'Para conciliar'})
        rl4 = r.get_json()['rfi']
        como('emisor').patch('/api/redlines/%s' % rl4['id'],
                             json={'responsable_id': g['proyectista']})
        cur.execute("DELETE FROM encargos WHERE objeto_tipo='REDLINE' AND objeto_id=%s",
                    (rl4['id'],))
        conn.commit()
        d = enc.divergencias(cur)
        falta = [f for f in d['faltantes'] if f[0] == 'REDLINE' and f[1] == rl4['id']]
        _paso(bool(falta), 'detecta que FALTA el encargo del Red Line -- antes no podia',
              str(falta[0])[:70] if falta else 'no lo vio')
        cerrados, abiertos, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(abiertos >= 1, 'y lo reconstruye')
        resto = enc.divergencias(cur)
        _paso(not resto['faltantes'] and not resto['sobrantes'],
              'quedando convergida', 'faltan %d, sobran %d'
              % (len(resto['faltantes']), len(resto['sobrantes'])))
        # Y una segunda pasada no puede volver a mover nada: si moviera, las dos
        # mitades estarian usando criterios distintos.
        c2, a2, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(c2 == 0 and a2 == 0,
              'y una segunda pasada NO mueve nada: converge, no oscila',
              'cerro %d, abrio %d' % (c2, a2))

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
