# -*- coding: utf-8 -*-
"""El ciclo completo de un RFI profesional, contra PostgreSQL.

QUE DEMUESTRA
-------------
  1. Se crea sin responsable -> no aparece en la bandeja de nadie.
  2. Se asigna -> el responsable lo ve CON plazo; nadie mas.
  3. Un miembro cualquiera NO puede cambiar el responsable; el autor y el
     responsable actual SI.
  4. Otro usuario NO puede dictar el veredicto.
  5. El responsable responde -> veredicto y fecha congelados, encargo cerrado.
  6. Cierra el autor -> queda quien y cuando.
  7. Un RFI cerrado ya no se reasigna ni se modifica.
  8. Pasar la pelota: el anterior deja de deberlo, el nuevo lo ve, y el
     historial dice de quien a quien.
  9. El responsable SALE DE LA OBRA -> BLOQUEADO, y se desatasca reasignando.
 10. Un legacy ABIERTO no admite veredicto hasta ser ADOPTADO.
 11. Un legacy CERRADO queda intacto y no pide adopcion.
 12. Dos RFI de la MISMA OBRA bajo ALCANCES DISTINTOS no comparten codigo.
 13. CONCURRENCIA REAL: seis creaciones simultaneas -> seis codigos distintos,
     ningun 500. Y una colision forzada se recupera por SAVEPOINT.
 14. Un adjunto nuevo se fija a `version_id`; uno legacy sigue abriendo lo vivo.
 15. La conciliacion detecta un encargo de RFI que FALTA -- lo que antes no podia.

QUE NO TOCA
-----------
Crea todo con prefijo `zz_rfi_` y solo borra lo que crea.

    python herramientas/ensayo_de_rfi.py
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

PREFIJO = 'zz_rfi_'
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
    cur.execute("DELETE FROM doc_rfis WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM file_nodes WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))


def montar(cur, ref):
    cur.execute("SELECT id FROM hubs LIMIT 1")
    fila = cur.fetchone()
    cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                "VALUES (%s,%s,'ZZ RFI',%s,'active')",
                (OBRA, fila[0] if fila else None, OBRA))
    ref.registrar_obra(cur, OBRA, nombre='ZZ RFI', model_urn=OBRA, origen='ensayo de rfi')

    def usuario(nombre, correo, miembro=True):
        cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                    "VALUES (%s,%s,'x','editor',TRUE) RETURNING id",
                    (nombre, PREFIJO + correo))
        uid = cur.fetchone()[0]
        if miembro:
            cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                        (OBRA, uid))
        return uid

    g = {'autor': usuario('Autor', 'autor@e.test'),
         'proyectista': usuario('Proyectista', 'proy@e.test'),
         'supervisor': usuario('Supervisor', 'sup@e.test'),
         'ajeno': usuario('Ajeno', 'ajeno@e.test')}

    cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                "VALUES (%s,'FILE','PLANO-RFI.pdf','WIP') RETURNING id::text", (OBRA,))
    g['nodo'] = cur.fetchone()[0]
    cur.execute("INSERT INTO file_versions (file_node_id, version_number, gcs_urn) "
                "VALUES (%s::uuid, 1, %s) RETURNING id::text",
                (g['nodo'], PREFIJO + 'obj/plano-v1.pdf'))
    g['version'] = cur.fetchone()[0]
    return g


def cliente(usuario):
    """App con el blueprint REAL de RFI. Se construye ANTES de cada peticion:
    `validate_session` es una global del modulo y solo vale la ultima."""
    from flask import Flask
    import auth_middleware as am
    import routes.rfis as rf

    app = Flask(__name__)
    am.validate_session = lambda t: usuario
    am.init_auth_middleware(app)
    app.register_blueprint(rf.rfis_bp, url_prefix='/api/rfis')
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
    import flujo_de_rfi as flujo
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DEL CICLO DE RFI')
    print('=' * 76)

    def como(quien, rol='editor'):
        return cliente({'id': g[quien], 'email': PREFIJO + quien[:4] + '@e.test',
                        'name': quien.capitalize(), 'role': rol})

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None
        g = montar(cur, ref)
        conn.commit()
        db._project_resolver_cache['map'] = None

        sesion_autor = {'id': g['autor'], 'email': PREFIJO + 'autor@e.test',
                        'name': 'Autor', 'role': 'editor'}

        print()
        print('1 · SE CREA SIN RESPONSABLE')
        r = cliente(sesion_autor).post('/api/rfis', json={
            'model_urn': OBRA, 'titulo': 'Consulta de trazo en BZ-10'})
        ok = r.status_code == 200
        _paso(ok, 'el RFI se crea', str(r.get_json())[:80])
        if not ok:
            return 1
        rfi = r.get_json()['rfi']
        _paso(rfi['codigo'] == 'RFI-001', 'y numera desde 001', rfi['codigo'])
        _paso(rfi['project_id'] == OBRA, 'con su obra canonica guardada')
        _paso(all(len(enc.mi_trabajo(cur, g[q])) == 0
                  for q in ('autor', 'proyectista', 'supervisor')),
              'sin responsable, no aparece en la bandeja de NADIE')

        print()
        print('2 y 3 · ASIGNAR: QUIEN PUEDE Y QUIEN NO')
        vence = (datetime.datetime.now() + datetime.timedelta(days=4)).isoformat()
        r = cliente({'id': g['ajeno'], 'email': PREFIJO + 'ajen@e.test',
                     'name': 'Ajeno', 'role': 'editor'}).patch(
            '/api/rfis/%s' % rfi['id'], json={'responsable_id': g['proyectista']})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'NO_PUEDE_REASIGNAR',
              'un miembro cualquiera NO puede cambiar el responsable',
              'devolvio %s' % r.status_code)

        r = cliente(sesion_autor).patch('/api/rfis/%s' % rfi['id'], json={
            'responsable_id': g['proyectista'], 'vence_en': vence})
        _paso(r.status_code == 200, 'el AUTOR si puede asignarlo', str(r.get_json())[:70])

        cur.execute("SELECT estado, responsable_id, vence_en FROM doc_rfis WHERE id::text=%s",
                    (rfi['id'],))
        est, resp, vn = cur.fetchone()
        _paso(est == 'En revisión', 'y el RFI pasa a «En revisión»', est)
        _paso(vn is not None, 'el PLAZO queda en el OBJETO, no solo en el encargo')
        del_proy = enc.mi_trabajo(cur, g['proyectista'])
        _paso(len(del_proy) == 1 and del_proy[0]['vence_en'],
              'el proyectista lo ve en su bandeja CON vencimiento')
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) == 0, 'y nadie mas lo ve')

        print()
        print('4 · SOLO QUIEN LO TIENE PUEDE DICTAR EL VEREDICTO')
        r = cliente(sesion_autor).patch('/api/rfis/%s' % rfi['id'],
                                        json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'NO_PUEDE_RESPONDER',
              'ni siquiera el AUTOR puede responder su propio RFI',
              'devolvio %s' % r.status_code)

        r = como('proyectista').patch('/api/rfis/%s' % rfi['id'],
                                      json={'estado': 'Respondido'})
        _paso(r.status_code == 400 and (r.get_json() or {}).get('code') == 'FALTA_VEREDICTO',
              'responder SIN veredicto no vale')

        print()
        print('5 · RESPONDE EL RESPONSABLE')
        r = como('proyectista').patch('/api/rfis/%s' % rfi['id'],
                                      json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 200, 'el proyectista responde', str(r.get_json())[:60])
        cur.execute("SELECT estado, respuesta, fecha_respuesta, historial "
                    "  FROM doc_rfis WHERE id::text=%s", (rfi['id'],))
        est, ver, fr, hist = cur.fetchone()
        _paso(est == 'Respondido' and ver == 'Aceptado' and fr is not None,
              'veredicto y fecha quedan congelados', '%s / %s' % (est, ver))
        _paso(len(enc.mi_trabajo(cur, g['proyectista'])) == 0,
              'y deja de deberlo: su encargo se cierra')

        print()
        print('6 y 7 · CIERRA EL AUTOR, Y CERRADO ES CERRADO')
        r = como('proyectista').patch('/api/rfis/%s' % rfi['id'], json={'estado': 'Cerrado'})
        _paso(r.status_code == 403 and (r.get_json() or {}).get('code') == 'NO_PUEDE_CERRAR',
              'el responsable NO cierra: cierra quien pregunto')
        r = cliente(sesion_autor).patch('/api/rfis/%s' % rfi['id'], json={'estado': 'Cerrado'})
        _paso(r.status_code == 200, 'el autor cierra')
        cur.execute("SELECT cerrado_por, historial FROM doc_rfis WHERE id::text=%s", (rfi['id'],))
        cp, hist = cur.fetchone()
        _paso(bool(cp), 'y queda escrito quien cerro', str(cp))
        eventos = [h.get('event') for h in hist]
        _paso(eventos == ['created', 'ball_in_court_changed', 'estado', 'responded', 'closed'],
              'el historial cuenta el ciclo entero', str(eventos))
        r = cliente(sesion_autor).patch('/api/rfis/%s' % rfi['id'],
                                        json={'responsable_id': g['supervisor']})
        _paso(r.status_code == 409 and (r.get_json() or {}).get('code') == 'RFI_CERRADO',
              'un RFI cerrado ya no se reasigna')

        print()
        print('8 · PASAR LA PELOTA')
        r = cliente(sesion_autor).post('/api/rfis', json={'model_urn': OBRA,
                                                          'titulo': 'Consulta 2'})
        rfi2 = r.get_json()['rfi']
        cliente(sesion_autor).patch('/api/rfis/%s' % rfi2['id'],
                                    json={'responsable_id': g['proyectista']})
        r = como('proyectista').patch('/api/rfis/%s' % rfi2['id'],
                                      json={'responsable_id': g['supervisor']})
        _paso(r.status_code == 200,
              'el RESPONSABLE ACTUAL puede pasarla («esto es del supervisor»)',
              str(r.get_json())[:60])
        _paso(len(enc.mi_trabajo(cur, g['proyectista'])) == 0, 'el anterior deja de deberlo')
        _paso(len(enc.mi_trabajo(cur, g['supervisor'])) == 1, 'y el nuevo lo ve')
        cur.execute("SELECT historial FROM doc_rfis WHERE id::text=%s", (rfi2['id'],))
        cambios = [h for h in cur.fetchone()[0] if h.get('event') == 'ball_in_court_changed']
        _paso(len(cambios) == 2 and cambios[-1]['de'] == g['proyectista']
              and cambios[-1]['a'] == g['supervisor'],
              'y el historial dice de quien a quien', str(cambios[-1])[:70])

        print()
        print('9 · EL RESPONSABLE SALE DE LA OBRA')
        cur.execute("DELETE FROM project_users WHERE project_id=%s AND user_id=%s",
                    (OBRA, g['supervisor']))
        conn.commit()
        cur.execute("SELECT %s FROM doc_rfis WHERE id::text=%%s"
                    % 'estado, responsable_id, responsable, project_id', (rfi2['id'],))
        e2, r2, rt2, p2 = cur.fetchone()
        est_flujo, motivo = flujo.estado_del_flujo(
            cur, {'estado': e2, 'responsable_id': r2, 'responsable': rt2, 'project_id': p2})
        _paso(est_flujo == 'BLOQUEADO', 'el RFI queda BLOQUEADO', motivo[:60])
        r = cliente(sesion_autor).patch('/api/rfis/%s' % rfi2['id'],
                                        json={'responsable_id': g['proyectista']})
        _paso(r.status_code == 200,
              'y se desatasca reasignando, SIN puertas de administrador')

        print()
        print('10 y 11 · RFI LEGACY')
        cur.execute("INSERT INTO doc_rfis (model_urn, codigo, titulo, estado, responsable, "
                    "  created_by, project_id) VALUES (%s,'RFI-900','Legacy abierto',"
                    "  'En revisión','Ing. Valeria Barrenechea',%s,%s) RETURNING id::text",
                    (OBRA, PREFIJO + 'autor@e.test', OBRA))
        leg_abierto = cur.fetchone()[0]
        cur.execute("INSERT INTO doc_rfis (model_urn, codigo, titulo, estado, responsable, "
                    "  respuesta, created_by, project_id) VALUES (%s,'RFI-901','Legacy cerrado',"
                    "  'Cerrado','Ing. Valeria Barrenechea','Aceptado',%s,%s) RETURNING id::text",
                    (OBRA, PREFIJO + 'autor@e.test', OBRA))
        leg_cerrado = cur.fetchone()[0]
        conn.commit()

        r = como('proyectista').patch('/api/rfis/%s' % leg_abierto,
                                      json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 409 and (r.get_json() or {}).get('code') == 'NECESITA_ADOPCION',
              'un legacy ABIERTO no admite veredicto hasta ser adoptado',
              'devolvio %s' % r.status_code)

        r = cliente(sesion_autor).patch('/api/rfis/%s' % leg_abierto,
                                        json={'responsable_id': g['proyectista']})
        _paso(r.status_code == 200, 'el autor lo ADOPTA eligiendo un usuario de la obra')
        cur.execute("SELECT responsable, responsable_id, historial FROM doc_rfis "
                    "  WHERE id::text=%s", (leg_abierto,))
        txt, rid, hist = cur.fetchone()
        _paso(txt == 'Ing. Valeria Barrenechea',
              'y el TEXTO historico se conserva intacto', txt)
        ad = [h for h in hist if h.get('event') == 'adopted']
        _paso(len(ad) == 1 and ad[0].get('responsable_texto') == 'Ing. Valeria Barrenechea'
              and ad[0].get('by'),
              'el historial dice quien lo adoptó y de que texto venia', str(ad[0])[:80])
        r = como('proyectista').patch('/api/rfis/%s' % leg_abierto,
                                      json={'estado': 'Respondido', 'respuesta': 'Aceptado'})
        _paso(r.status_code == 200, 'y ya se puede responder con normalidad')

        cur.execute("SELECT estado, responsable, respuesta FROM doc_rfis WHERE id::text=%s",
                    (leg_cerrado,))
        ec, rc, vc = cur.fetchone()
        _paso(ec == 'Cerrado' and rc == 'Ing. Valeria Barrenechea' and vc == 'Aceptado',
              'un legacy CERRADO queda EXACTAMENTE como estaba')
        _paso(not flujo.necesita_adopcion({'responsable_id': None, 'estado': 'Cerrado'}),
              'y no pide adopcion: es archivo')

        print()
        print('12 · DOS ALCANCES DE LA MISMA OBRA NO COMPARTEN CODIGO')
        db._project_resolver_cache['map'] = None
        r = cliente(sesion_autor).post('/api/rfis', json={'model_urn': ALIAS,
                                                          'titulo': 'Desde otro alcance'})
        ok = r.status_code == 200
        _paso(ok, 'se crea un RFI bajo el alcance «%s»' % ALIAS, str(r.get_json())[:70])
        if ok:
            cur.execute("SELECT count(*), count(DISTINCT codigo) FROM doc_rfis "
                        "  WHERE project_id=%s", (OBRA,))
            n, distintos = cur.fetchone()
            _paso(n == distintos,
                  'y su codigo NO choca con los del otro alcance: %d RFI, %d codigos'
                  % (n, distintos))

        print()
        print('13 · CONCURRENCIA REAL')
        # (a) Colision FORZADA: se demuestra que el SAVEPOINT recupera.
        import routes.rfis as rf
        original = flujo.siguiente_codigo
        estado_falso = {'veces': 0}

        def colisiona(cur_, obra_, prefijo='RFI'):
            estado_falso['veces'] += 1
            if estado_falso['veces'] == 1:
                cur_.execute("SELECT codigo FROM doc_rfis WHERE project_id=%s "
                             " ORDER BY codigo LIMIT 1", (obra_,))
                fila = cur_.fetchone()
                if fila:
                    return fila[0]          # un codigo YA existente
            return original(cur_, obra_, prefijo)

        rf.flujo.siguiente_codigo = colisiona
        try:
            r = cliente(sesion_autor).post('/api/rfis', json={'model_urn': OBRA,
                                                              'titulo': 'Tras colision'})
            _paso(r.status_code == 200,
                  'una colision de codigo se recupera por SAVEPOINT, sin 500',
                  'devolvio %s' % r.status_code)
        finally:
            rf.flujo.siguiente_codigo = original

        # (b) Rafaga SIMULTANEA de verdad.
        resultados, barrera = [], threading.Barrier(6)

        def crear(i):
            barrera.wait()
            try:
                rr = cliente(dict(sesion_autor)).post(
                    '/api/rfis', json={'model_urn': OBRA, 'titulo': 'Simultaneo %d' % i})
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
        _paso(not quinientos, 'seis creaciones simultaneas: NINGUN 500 opaco',
              str(resultados[:3]))
        _paso(len(codigos) == len(set(codigos)),
              'y todos los codigos son DISTINTOS', str(sorted(codigos)))
        cur.execute("SELECT count(*), count(DISTINCT codigo) FROM doc_rfis WHERE project_id=%s",
                    (OBRA,))
        n, distintos = cur.fetchone()
        _paso(n == distintos, 'la obra no tiene ni un codigo repetido: %d/%d' % (n, distintos))

        print()
        print('14 · ADJUNTOS: EL NUEVO SE FIJA A UNA VERSION')
        r = cliente(sesion_autor).post('/api/rfis', json={'model_urn': OBRA,
                                                          'titulo': 'Con adjunto'})
        rfi3 = r.get_json()['rfi']
        r = cliente(sesion_autor).patch('/api/rfis/%s' % rfi3['id'], json={'adjuntos': [
            {'node_id': g['nodo'], 'version_id': g['version'], 'version_number': 1,
             'name': 'PLANO-RFI.pdf', 'rol': 'consulta'},
            {'id': 'viejo', 'name': 'legacy.pdf', 'gcs_urn': 'multi-tenant/x/y.pdf'}]})
        _paso(r.status_code == 200, 'se adjuntan un documento nuevo y uno legacy')
        cur.execute("SELECT adjuntos FROM doc_rfis WHERE id::text=%s", (rfi3['id'],))
        adj = cur.fetchone()[0]
        _paso(adj[0].get('version_id') == g['version'] and adj[0].get('rol') == 'consulta',
              'el nuevo guarda `version_id` y su `rol`')
        _paso(adj[1].get('gcs_urn') and not adj[1].get('version_id'),
              'y el legacy se conserva tal cual, sin convertirse')

        cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                    "VALUES ('otra_obra_zz','FILE','ajeno.pdf','WIP') RETURNING id::text")
        ajeno = cur.fetchone()[0]
        conn.commit()
        r = cliente(sesion_autor).patch('/api/rfis/%s' % rfi3['id'], json={'adjuntos': [
            {'node_id': ajeno, 'name': 'ajeno.pdf'}]})
        _paso(r.status_code == 400 and (r.get_json() or {}).get('code') == 'ADJUNTO_DE_OTRA_OBRA',
              'no se puede adjuntar un documento de OTRA obra',
              'devolvio %s' % r.status_code)
        cur.execute("DELETE FROM file_nodes WHERE id::text=%s", (ajeno,))

        print()
        print('15 · LA CONCILIACION YA DETECTA UN ENCARGO DE RFI QUE FALTA')
        cur.execute("DELETE FROM encargos WHERE objeto_tipo='RFI' AND objeto_id=%s",
                    (rfi2['id'],))
        conn.commit()
        d = enc.divergencias(cur)
        falta = [f for f in d['faltantes'] if f[0] == 'RFI' and f[1] == rfi2['id']]
        _paso(bool(falta), 'detecta que FALTA el encargo del RFI -- antes no podia',
              str(falta[0])[:70] if falta else 'no lo vio')
        cerrados, abiertos, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(abiertos >= 1, 'y lo reconstruye')
        resto = enc.divergencias(cur)
        _paso(not resto['faltantes'] and not resto['sobrantes'],
              'quedando convergida', 'faltan %d, sobran %d'
              % (len(resto['faltantes']), len(resto['sobrantes'])))

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
