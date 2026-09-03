# -*- coding: utf-8 -*-
"""REVIEWS-R01 · el contrato de una revision, contra PostgreSQL de verdad.

QUE DEMUESTRA, Y CON QUE NUMERO DEL CONTRATO CONGELADO
------------------------------------------------------
Aplica la migracion 27 REAL --no una copia a mano-- y despues:

  A   el esquema queda como la fase A promete: columna NOT NULL, lista cerrada,
      disparador presente Y habilitado, y todas las filas en PRE.
  I7  INSERT con contrato desconocido        -> lo rechaza ck_contrato_conocido
      UPDATE que muta el contrato            -> lo intercepta el DISPARADOR, y el
                                                CHECK ni llega a evaluarse
  I2  UPDATE contrato=... COMO EL DUENO      -> lo rechaza el disparador
  I4  UPDATE contrato = contrato             -> permitido (IS DISTINCT FROM)
  I1  lo mismo COMO ecd_app                  -> permission denied for column
  I3  un UPDATE normal como ecd_app          -> FUNCIONA (no es freno colateral)
  I5  DISABLE TRIGGER + cambiar solo la columna -> pasa, Y LA CONTRADICCION CON
      EL TESTIGO SE DETECTA. Es la prueba del LIMITE, no de la garantia.
  I6  tras DROP DEFAULT, INSERT sin contrato -> falla
  I10 alta con CONTRATO_VIGENTE=PRE          -> columna PRE y testigo PRE
  I11 alta con CONTRATO_VIGENTE=AUT.TERMINAL -> columna y testigo coincidentes
  I12 alta manual con decision en cada paso  -> aceptada
  I13 alta manual sin decision               -> RECHAZADA (el bypass murio)
  I15 alta con terminal REVISA               -> RECHAZADA en el alta
  I17 REVISA intermedio + approve            -> emitido CONFORME y AVANZA
  I18 APRUEBA intermedio + approve           -> avanza y NO cierra
  I19 APRUEBA terminal + approve             -> approved + cerrada_en
  I20 terminal REVISA llegado FUERA DE BANDA -> 409 y CERO MUTACIONES
  I21 reject                                 -> rejected terminal + RECHAZA
  I23 una revision PRE recorre su ciclo      -> igual que antes y SIN emitido
  I16 una plantilla PRE historica            -> intacta y legible

QUE NO TOCA
-----------
Crea todo con prefijo `zz_r01_` y solo borra lo que crea. Y SE NIEGA A ARRANCAR
si `DB_NAME` no parece una base desechable: este guion ejecuta DDL y llega a
deshabilitar un disparador de `doc_reviews`. Hacer eso contra el expediente de
una obra no se arregla con un `git revert`.

    DB_NAME=ecd_ensayo python herramientas/ensayo_de_contrato_r01.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_r01_'
OBRA = PREFIJO + 'obra'
MIGRACION = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         'sql', '27_r01_contrato_de_revision.sql')

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def _titulo(t):
    print()
    print('── %s %s' % (t, '─' * max(0, 70 - len(t))))


def _revienta(cur, sql, args=None):
    """(True, mensaje) si la sentencia FALLA. Se usa para provocar el fallo.

    Cada intento va en su propio SAVEPOINT: una sentencia que revienta aborta la
    transaccion entera, y despues de eso cualquier comprobacion posterior
    fallaria por arrastre en vez de por si misma.
    """
    cur.execute('SAVEPOINT sp')
    try:
        cur.execute(sql, args)
    except Exception as e:
        cur.execute('ROLLBACK TO SAVEPOINT sp')
        return True, str(e).strip().splitlines()[0]
    cur.execute('RELEASE SAVEPOINT sp')
    return False, ''


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_reviews WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_review_plantillas WHERE project_id LIKE %s",
                (PREFIJO + '%',))
    cur.execute("DELETE FROM file_nodes WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM activity_log WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))


def montar(cur, ref):
    cur.execute("SELECT id FROM hubs LIMIT 1")
    fila = cur.fetchone()
    cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                "VALUES (%s,%s,'ZZ Contrato R01',%s,'active')",
                (OBRA, fila[0] if fila else None, OBRA))
    ref.registrar_obra(cur, OBRA, nombre='ZZ Contrato R01', model_urn=OBRA,
                       origen='ensayo de contrato R01')

    def usuario(nombre, correo):
        cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                    "VALUES (%s,%s,'x','editor',TRUE) RETURNING id",
                    (nombre, PREFIJO + correo))
        uid = cur.fetchone()[0]
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA, uid))
        return uid

    autor = usuario('Autor R01', 'autor@ensayo.test')
    r1 = usuario('Revisor Uno', 'r1@ensayo.test')
    r2 = usuario('Revisor Dos', 'r2@ensayo.test')
    cur.execute("INSERT INTO file_nodes (model_urn, node_type, name, status) "
                "VALUES (%s,'FILE','PLANO-R01.pdf','WIP') RETURNING id::text", (OBRA,))
    nodo = cur.fetchone()[0]
    return {'autor': autor, 'r1': r1, 'r2': r2, 'nodo': nodo}


def sembrar_historicas(cur):
    """Filas que imitan a las 9 reales: formas distintas, ninguna con contrato.

    Se siembran ANTES de la migracion a proposito. Si se sembraran despues, el
    DEFAULT les pondria PRE al nacer y no se podria demostrar nada sobre lo que
    la migracion le hace a lo que YA estaba.

    Las tres formas salen de la medicion del 3-sep-2026: manual sin `decision`,
    de plantilla con `decision` y terminal APRUEBA, y una con `history` NULL --
    que la columna admite, y es la razon por la que el contrato no vive ahi.
    """
    formas = [
        ('manual sin decision', 'pending',
         [{'user_id': 1, 'email': 'a@o.pe', 'name': 'A'}], '[]'),
        ('de plantilla, terminal APRUEBA', 'approved',
         [{'user_id': 1, 'decision': 'REVISA'}, {'user_id': 2, 'decision': 'APRUEBA'}],
         '[{"event":"created","by":"x"}]'),
        ('con history NULL', 'pending',
         [{'email': 'legacy@o.pe', 'name': 'Legacy'}], None),
    ]
    creadas = []
    for titulo, estado, pasos, hist in formas:
        cur.execute("INSERT INTO doc_reviews (model_urn, title, items, steps, "
                    "  final_status, created_by, history, status) "
                    "VALUES (%s,%s,'[]',%s,'SHARED','historico',%s,%s) RETURNING id",
                    (OBRA, PREFIJO + titulo, json.dumps(pasos), hist, estado))
        creadas.append(cur.fetchone()[0])
    return creadas


def huella_historica(cur):
    """Lo que la fase A NO puede tocar: estado, paso, pasos e historial.

    Se compara como TEXTO para que un reordenado de claves del JSONB cuente
    como cambio. Si la migracion tocara algo, aunque fuera reserializar, aqui
    se veria.
    """
    cur.execute("SELECT id, status, current_step, steps::text, "
                "       coalesce(history::text,'<NULL>') "
                "  FROM doc_reviews WHERE model_urn LIKE %s ORDER BY id",
                (PREFIJO + '%',))
    return cur.fetchall()


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


def sesion(cur, uid):
    cur.execute("SELECT id, name, email, role FROM users WHERE id=%s", (uid,))
    f = cur.fetchone()
    return {'id': f[0], 'name': f[1], 'email': f[2], 'role': f[3]}


def crear(cliente, pasos, titulo, nodo):
    return cliente.post('/api/reviews', json={
        'model_urn': OBRA, 'title': titulo, 'final_status': 'SHARED',
        'items': [{'node_id': nodo, 'name': 'PLANO-R01.pdf'}],
        'steps': pasos})


def instantanea(cur, rid):
    cur.execute("SELECT status, current_step, history::text, paso_vence_en, contrato "
                "  FROM doc_reviews WHERE id=%s", (rid,))
    fila = cur.fetchone()
    cur.execute("SELECT count(*) FROM encargos WHERE objeto_tipo='REVIEW' "
                "   AND objeto_id=%s AND cerrado_en IS NULL", (str(rid),))
    return tuple(fila) + (cur.fetchone()[0],)


def main():
    if not re.search(r'(test|ensayo|prueba)', os.getenv('DB_NAME') or '', re.I):
        print('ME NIEGO A ARRANCAR.')
        print('Este guion ejecuta DDL y llega a deshabilitar un disparador de')
        print('doc_reviews. DB_NAME=%r no parece una base desechable.'
              % (os.getenv('DB_NAME'),))
        return 2

    os.environ['ENFORCE_PROJECT_AUTHZ'] = 'true'
    os.environ['AUTH_POLICY_MODE'] = 'estricto'
    os.environ.setdefault('APP_SECRET', 'x' * 32)

    from db import init_db_pool, get_db_connection
    import referencias_de_obra as ref
    import flujo_de_revision as flujo
    import plantillas_de_revision as plt
    init_db_pool()

    # ── EL ESTADO HISTORICO, SEMBRADO ANTES DE LA MIGRACION ────────────────
    _titulo('ANTES de la fase A · se siembran revisiones sin contrato')
    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        ids = montar(cur, ref)
        historicas = sembrar_historicas(cur)
        conn.commit()
        antes = huella_historica(cur)
        _paso(len(antes) == len(historicas) == 3,
              'sembradas %d revisiones historicas de tres formas distintas' % len(antes))

    # ── LA MIGRACION REAL ──────────────────────────────────────────────────
    _titulo('FASE A · se aplica la migracion 27 tal como esta en el repositorio')
    with get_db_connection() as conn:
        conn.autocommit = True          # el fichero trae su propio BEGIN/COMMIT
        cur = conn.cursor()
        try:
            cur.execute(open(MIGRACION, encoding='utf-8').read())
            _paso(True, 'la migracion 27 se aplica sin errores')
        except Exception as e:
            _paso(False, 'la migracion 27 se aplica', str(e).splitlines()[0])
            return 1
        conn.autocommit = False

    with get_db_connection() as conn:
        cur = conn.cursor()

        # ── A · LA FASE A NO REINTERPRETA NADA ─────────────────────────────
        despues = huella_historica(cur)
        _paso(antes == despues,
              'la fase A NO toca status, current_step, steps ni history',
              'antes=%r despues=%r' % (antes, despues) if antes != despues else '')
        cur.execute("SELECT count(*) FROM doc_reviews WHERE model_urn LIKE %s "
                    "  AND contrato IS NULL", (PREFIJO + '%',))
        _paso(cur.fetchone()[0] == 0, 'y ninguna queda con contrato NULL')
        cur.execute("SELECT count(*) FROM doc_reviews WHERE model_urn LIKE %s "
                    "  AND contrato = 'PRE'", (PREFIJO + '%',))
        _paso(cur.fetchone()[0] == len(historicas),
              'las %d historicas quedan en PRE, incluida la de history NULL'
              % len(historicas))
        cur.execute("SELECT count(*) FROM doc_reviews WHERE model_urn LIKE %s "
                    "  AND history IS NULL", (PREFIJO + '%',))
        _paso(cur.fetchone()[0] == 1,
              'y la de history NULL SIGUE siendo NULL: no se normalizo nada')

        # ── A · EL ESQUEMA ─────────────────────────────────────────────────
        cur.execute("SELECT is_nullable, column_default FROM information_schema.columns "
                    " WHERE table_name='doc_reviews' AND column_name='contrato'")
        f = cur.fetchone()
        _paso(bool(f) and f[0] == 'NO', 'contrato existe y es NOT NULL')
        _paso(bool(f) and "'PRE'" in (f[1] or ''),
              'contrato tiene DEFAULT PRE (se retira en la fase E)', f[1] if f else '')
        cur.execute("SELECT 1 FROM pg_constraint WHERE conname='ck_contrato_conocido' "
                    "  AND conrelid='doc_reviews'::regclass")
        _paso(bool(cur.fetchone()), 'ck_contrato_conocido existe')
        cur.execute("SELECT tgenabled FROM pg_trigger WHERE tgname='tg_contrato_inmutable'"
                    "  AND tgrelid='doc_reviews'::regclass AND NOT tgisinternal")
        f = cur.fetchone()
        _paso(bool(f), 'tg_contrato_inmutable existe')
        _paso(bool(f) and f[0] != 'D', 'y esta HABILITADO', 'tgenabled=%s' % (f[0] if f else '?'))
        cur.execute("SELECT count(*) FROM doc_reviews WHERE contrato <> 'PRE'")
        _paso(cur.fetchone()[0] == 0, 'la fase A no deja ningun contrato distinto de PRE')

        # Una fila con la que trabajar: nace por la via directa, como las 9 reales.
        cur.execute("INSERT INTO doc_reviews (model_urn, title, items, steps, "
                    "  final_status, created_by, history) "
                    "VALUES (%s,'PRE directa','[]','[]','SHARED','x','[]') RETURNING id",
                    (OBRA,))
        rid_pre = cur.fetchone()[0]
        conn.commit()
        cur.execute("SELECT contrato FROM doc_reviews WHERE id=%s", (rid_pre,))
        _paso(cur.fetchone()[0] == 'PRE',
              'un INSERT que omite contrato hereda PRE del DEFAULT (fases A-D)')

        # ── I7 · LISTA CERRADA ─────────────────────────────────────────
        _titulo('I7 · un contrato inventado')
        # HALLAZGO DEL ENSAYO: por UPDATE el CHECK es INALCANZABLE. El
        # disparador es BEFORE y rechaza cualquier cambio de valor antes de que
        # la restriccion llegue a evaluarse. Asi que la lista cerrada se prueba
        # donde de verdad manda: en el INSERT.
        revento, msg = _revienta(
            cur, "INSERT INTO doc_reviews (model_urn, title, items, steps, "
                 "  final_status, created_by, history, contrato) "
                 "VALUES (%s,'inventado','[]','[]','SHARED','x','[]','OTRO')",
            (OBRA,))
        _paso(revento and 'ck_contrato_conocido' in msg,
              'ck_contrato_conocido rechaza un contrato fuera de la lista al INSERTAR',
              msg[:70])
        revento, msg = _revienta(
            cur, "UPDATE doc_reviews SET contrato='OTRO' WHERE id=%s", (rid_pre,))
        _paso(revento and 'no se puede cambiar' in msg,
              'y por UPDATE lo para antes el disparador: el CHECK ni se evalua',
              msg[:70])

        # ── I2 · EL DUENO TAMBIEN ESTA VINCULADO ───────────────────────────
        _titulo('I2 · el propietario intenta convertir un expediente')
        cur.execute("SELECT current_user, pg_get_userbyid(relowner) "
                    "  FROM pg_class WHERE oid='doc_reviews'::regclass")
        quien, dueno = cur.fetchone()
        revento, msg = _revienta(
            cur, "UPDATE doc_reviews SET contrato='AUTORIDAD_TERMINAL' WHERE id=%s",
            (rid_pre,))
        _paso(revento and 'no se puede cambiar' in msg,
              'el disparador rechaza el cambio (usuario=%s, dueno=%s)' % (quien, dueno),
              msg[:70])

        # ── I4 · MISMO VALOR, PERMITIDO ────────────────────────────────────
        revento, msg = _revienta(
            cur, "UPDATE doc_reviews SET contrato = contrato WHERE id=%s", (rid_pre,))
        _paso(not revento, 'poner el MISMO valor esta permitido: IS DISTINCT FROM', msg[:70])

        # ── I1 / I3 · LA IDENTIDAD DE APLICACION ───────────────────────────
        _titulo('I1 / I3 · como ecd_app')
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname='ecd_app'")
        hay_app = bool(cur.fetchone())
        if not hay_app:
            _paso(False, 'ecd_app no existe en este cluster: I1/I3 NO SE PROBARON',
                  'ejecuta 00_roles.sql para probar la defensa en profundidad')
        else:
            puesto, msg = _revienta(cur, 'SET ROLE ecd_app')
            if puesto:
                _paso(False, 'no se pudo SET ROLE ecd_app: I1/I3 NO SE PROBARON', msg[:70])
            else:
                revento, msg = _revienta(
                    cur, "UPDATE doc_reviews SET contrato='AUTORIDAD_TERMINAL' "
                         "  WHERE id=%s", (rid_pre,))
                _paso(revento and ('contrato' in msg or 'permis' in msg.lower()),
                      'ecd_app no puede ni nombrar contrato en un SET', msg[:70])
                revento, msg = _revienta(
                    cur, "UPDATE doc_reviews SET title='tocado por ecd_app' WHERE id=%s",
                    (rid_pre,))
                _paso(not revento,
                      'y un UPDATE normal como ecd_app SI funciona', msg[:70])
                cur.execute('RESET ROLE')
        conn.commit()

        # ── I5 · EL LIMITE DEL NIVEL 1 ─────────────────────────────────────
        _titulo('I5 · se desactiva el disparador a proposito (prueba del LIMITE)')
        from db import log_activity
        log_activity(OBRA, 'review_created', 'review', entity_id=str(rid_pre),
                     entity_name='PRE directa', performed_by='ensayo',
                     details={'contrato': 'PRE'})
        cur.execute("ALTER TABLE doc_reviews DISABLE TRIGGER tg_contrato_inmutable")
        revento, msg = _revienta(
            cur, "UPDATE doc_reviews SET contrato='AUTORIDAD_TERMINAL' WHERE id=%s",
            (rid_pre,))
        _paso(not revento,
              'con el disparador desactivado el cambio PASA: el nivel 2 no esta '
              'demostrado y el contrato no finge que si', msg[:70])
        cur.execute("SELECT contrato FROM doc_reviews WHERE id=%s", (rid_pre,))
        columna = cur.fetchone()[0]
        cur.execute("SELECT details->>'contrato' FROM activity_log "
                    " WHERE entity_type='review' AND entity_id=%s "
                    "   AND action='review_created' ORDER BY id DESC LIMIT 1",
                    (str(rid_pre),))
        f = cur.fetchone()
        testigo = f[0] if f else None
        _paso(testigo == 'PRE' and columna == 'AUTORIDAD_TERMINAL',
              'y LA CONTRADICCION SE DETECTA: columna=%s, testigo=%s'
              % (columna, testigo))
        cur.execute("ALTER TABLE doc_reviews ENABLE TRIGGER tg_contrato_inmutable")
        cur.execute("DELETE FROM doc_reviews WHERE id=%s", (rid_pre,))
        conn.commit()

        # ── I6 · LA PALANCA DE LA FASE E ───────────────────────────────────
        _titulo('I6 · fase E: sin DEFAULT, omitir el contrato es un error')
        cur.execute("ALTER TABLE doc_reviews ALTER COLUMN contrato DROP DEFAULT")
        revento, msg = _revienta(
            cur, "INSERT INTO doc_reviews (model_urn, title, items, steps, "
                 "  final_status, created_by, history) "
                 "VALUES (%s,'sin contrato','[]','[]','SHARED','x','[]')", (OBRA,))
        _paso(revento and ('contrato' in msg or 'null' in msg.lower()),
              'tras DROP DEFAULT un INSERT sin contrato FALLA', msg[:70])
        cur.execute("ALTER TABLE doc_reviews ALTER COLUMN contrato SET DEFAULT 'PRE'")
        conn.commit()
        _paso(True, 'y se restaura el DEFAULT: la fase E es reversible con SET DEFAULT')

        # ── EL ALTA Y EL MOTOR, POR LA RUTA REAL ───────────────────────────
        # UN CLIENTE NUEVO EN CADA PETICION.
        #
        # `cliente_como` parchea `auth_middleware.validate_session`, que es un
        # global del modulo: el ultimo cliente creado ganaba para TODOS los
        # anteriores. El ensayo daba 403 «este paso corresponde a otro» en cinco
        # comprobaciones, y el fallo era del guion, no del motor.
        def como(uid):
            return cliente_como(sesion(cur, uid))
        conn.commit()

        _titulo('I10 · alta bajo PRE (se FUERZA el contrato, no se hereda)')
        # Antes esto exigia `CONTRATO_VIGENTE == PRE` y por tanto solo pasaba en
        # la build B: con la fase D aplicada se ponia rojo sin que nada se
        # hubiera roto. El ensayo tiene que CONTROLAR el contrato que quiere
        # ejercitar, igual que hace mas abajo con AUTORIDAD_TERMINAL, en vez de
        # heredarlo de la build que le toque. Asi mide los dos contratos venga
        # de donde venga.
        vigente_real = flujo.CONTRATO_VIGENTE
        flujo.CONTRATO_VIGENTE = flujo.PRE
        _paso(flujo.CONTRATO_VIGENTE == flujo.PRE,
              'se fuerza PRE para ejercitar ese contrato (la build real crea %s)'
              % vigente_real)
        r = crear(como(ids['autor']), [{'user_id': ids['r1'], 'email': 'r1', 'name': 'R1'}],
                  'B sin decision', ids['nodo'])
        d = r.get_json() or {}
        _paso(r.status_code == 200 and d.get('success'),
              'bajo PRE el alta a mano SIN decision sigue aceptandose',
              json.dumps(d)[:80])
        rid_b = d.get('id')
        if rid_b:
            cur.execute("SELECT contrato FROM doc_reviews WHERE id=%s", (rid_b,))
            col = cur.fetchone()[0]
            cur.execute("SELECT details->>'contrato' FROM activity_log "
                        " WHERE entity_id=%s AND action='review_created' "
                        " ORDER BY id DESC LIMIT 1", (str(rid_b),))
            f = cur.fetchone()
            _paso(col == 'PRE' and f and f[0] == 'PRE',
                  'columna y testigo dicen PRE, y coinciden',
                  'col=%s testigo=%s' % (col, f[0] if f else None))

        # ── LA BUILD D, SIMULADA: se gira la constante ─────────────────────
        _titulo('FASE D simulada · se gira CONTRATO_VIGENTE en memoria')
        flujo.CONTRATO_VIGENTE = flujo.AUTORIDAD_TERMINAL
        _paso(True, 'CONTRATO_VIGENTE = AUTORIDAD_TERMINAL (solo en este proceso)')

        _titulo('I13 / I15 · el alta rechaza lo que no puede cerrarse')
        r = crear(como(ids['autor']), [{'user_id': ids['r1'], 'email': 'r1', 'name': 'R1'}],
                  'D sin decision', ids['nodo'])
        d = r.get_json() or {}
        _paso(r.status_code == 400 and d.get('code') == 'PASO_SIN_DECISION',
              'I13 · un alta a mano SIN decision se RECHAZA', json.dumps(d)[:90])
        r = crear(como(ids['autor']), [{'user_id': ids['r1'], 'email': 'r1', 'name': 'R1',
                             'decision': 'REVISA'}], 'D terminal REVISA', ids['nodo'])
        d = r.get_json() or {}
        _paso(r.status_code == 400 and d.get('code') == 'FLUJO_SIN_CIERRE',
              'I15 · un flujo cuyo ultimo paso solo revisa se RECHAZA',
              json.dumps(d)[:90])

        _titulo('I11 / I12 · alta valida bajo el contrato nuevo')
        r = crear(como(ids['autor']), [{'user_id': ids['r1'], 'email': 'r1', 'name': 'R1',
                             'decision': 'REVISA'},
                            {'user_id': ids['r2'], 'email': 'r2', 'name': 'R2',
                             'decision': 'APRUEBA'}], 'D valida', ids['nodo'])
        d = r.get_json() or {}
        _paso(r.status_code == 200 and d.get('success'),
              'I12 · alta a mano con decision en cada paso: aceptada',
              json.dumps(d)[:90])
        rid_d = d.get('id')
        cur.execute("SELECT contrato FROM doc_reviews WHERE id=%s", (rid_d,))
        col = cur.fetchone()[0]
        cur.execute("SELECT details->>'contrato' FROM activity_log "
                    " WHERE entity_id=%s AND action='review_created' "
                    " ORDER BY id DESC LIMIT 1", (str(rid_d),))
        f = cur.fetchone()
        _paso(col == 'AUTORIDAD_TERMINAL' and f and f[0] == 'AUTORIDAD_TERMINAL',
              'I11 · columna y testigo dicen AUTORIDAD_TERMINAL, y coinciden',
              'col=%s testigo=%s' % (col, f[0] if f else None))

        # ── I17 / I19 · EL RECORRIDO COMPLETO ──────────────────────────────
        _titulo('I17 / I19 · REVISA avanza como CONFORME, APRUEBA terminal cierra')
        r = como(ids['r1']).post('/api/reviews/%s/act' % rid_d,
                      json={'action': 'approve', 'comment': 'conforme'})
        _paso(r.status_code == 200, 'el paso REVISA se aprueba',
              json.dumps(r.get_json())[:80])
        cur.execute("SELECT status, current_step, history FROM doc_reviews WHERE id=%s",
                    (rid_d,))
        est, paso, hist = cur.fetchone()
        emitidos = [h.get('emitido') for h in (hist or []) if h.get('event') == 'approve']
        _paso(est == 'pending' and paso == 1,
              'I17 · avanza al paso 2 y NO cierra', 'estado=%s paso=%s' % (est, paso))
        _paso(emitidos == ['CONFORME'],
              'I17 · queda emitido como CONFORME', str(emitidos))

        r = como(ids['r2']).post('/api/reviews/%s/act' % rid_d,
                      json={'action': 'approve', 'comment': 'aprobado'})
        _paso(r.status_code == 200, 'el paso APRUEBA terminal se aprueba',
              json.dumps(r.get_json())[:80])
        cur.execute("SELECT status, cerrada_en, history FROM doc_reviews WHERE id=%s",
                    (rid_d,))
        est, cerrada, hist = cur.fetchone()
        emitidos = [h.get('emitido') for h in (hist or []) if h.get('event') == 'approve']
        _paso(est == 'approved' and cerrada is not None,
              'I19 · cierra en approved y queda fechada', 'estado=%s' % est)
        _paso(emitidos == ['CONFORME', 'APRUEBA'],
              'I19 · y el mapa de emitido es exacto', str(emitidos))

        # ── I20 · EL CASO DE LA DECISION FINAL DEL DUENO ───────────────────
        _titulo('I20 · terminal REVISA llegado FUERA DE BANDA')
        pasos_malos = [{'user_id': ids['r1'], 'email': 'r1', 'name': 'R1',
                        'decision': 'REVISA'}]
        cur.execute("INSERT INTO doc_reviews (model_urn, title, items, steps, "
                    "  final_status, created_by, history, contrato, current_step, status) "
                    "VALUES (%s,'fuera de banda','[]',%s,'SHARED','x','[]',"
                    "        'AUTORIDAD_TERMINAL',0,'pending') RETURNING id",
                    (OBRA, json.dumps(pasos_malos)))
        rid_ob = cur.fetchone()[0]
        conn.commit()
        antes = instantanea(cur, rid_ob)
        r = como(ids['r1']).post('/api/reviews/%s/act' % rid_ob,
                      json={'action': 'approve', 'comment': 'intento'})
        d = r.get_json() or {}
        _paso(r.status_code == 409 and d.get('code') == 'CONTRATO_NO_PERMITE_EL_ACTO',
              'el acto se RECHAZA con 409', json.dumps(d)[:90])
        despues = instantanea(cur, rid_ob)
        _paso(antes == despues,
              'y NO se muta NADA: estado, paso, historial, plazo y encargos idem',
              'antes=%r despues=%r' % (antes, despues) if antes != despues else '')
        _paso(despues[0] == 'pending',
              'en particular NO se convierte a rejected: nadie ejecuto reject')
        # Pero rechazarla si se puede: reject es terminal en cualquier paso.
        r = como(ids['r1']).post('/api/reviews/%s/act' % rid_ob,
                      json={'action': 'reject', 'comment': 'esto no cierra'})
        _paso(r.status_code == 200, 'I21 · y rechazarla si se puede',
              json.dumps(r.get_json())[:80])
        cur.execute("SELECT status, history FROM doc_reviews WHERE id=%s", (rid_ob,))
        est, hist = cur.fetchone()
        emit = [h.get('emitido') for h in (hist or []) if h.get('event') == 'reject']
        _paso(est == 'rejected' and emit == ['RECHAZA'],
              'I21 · rejected terminal, emitido RECHAZA', 'estado=%s %s' % (est, emit))

        # ── I23 · REGRESION DE PRE ─────────────────────────────────────────
        _titulo('I23 · una revision PRE recorre su ciclo igual que antes')
        flujo.CONTRATO_VIGENTE = flujo.PRE
        r = crear(como(ids['autor']), [{'user_id': ids['r1'], 'email': 'r1', 'name': 'R1'},
                            {'user_id': ids['r2'], 'email': 'r2', 'name': 'R2'}],
                  'PRE ciclo', ids['nodo'])
        rid_p = (r.get_json() or {}).get('id')
        _paso(bool(rid_p), 'se crea una PRE de dos pasos sin decision')
        r = como(ids['r1']).post('/api/reviews/%s/act' % rid_p, json={'action': 'approve'})
        cur.execute("SELECT status, current_step FROM doc_reviews WHERE id=%s", (rid_p,))
        est, paso = cur.fetchone()
        _paso(r.status_code == 200 and est == 'pending' and paso == 1,
              'el paso 1 avanza por POSICION, sin mirar decision')
        r = como(ids['r2']).post('/api/reviews/%s/act' % rid_p, json={'action': 'approve'})
        cur.execute("SELECT status, history FROM doc_reviews WHERE id=%s", (rid_p,))
        est, hist = cur.fetchone()
        _paso(r.status_code == 200 and est == 'approved',
              'el paso 2, ultimo posicional, cierra', 'estado=%s' % est)
        _paso(all('emitido' not in h for h in (hist or [])),
              'I23 · y NINGUNA entrada del historial tiene `emitido`',
              json.dumps(hist)[:100])

        # ── I16 · UNA PLANTILLA PRE HISTORICA ──────────────────────────────
        _titulo('I16 · una plantilla PRE historica queda intacta')
        historica = [{'etiqueta': 'unico', 'decision': 'REVISA', 'user_id': ids['r1']}]
        cur.execute("INSERT INTO doc_review_plantillas (alcance, project_id, nombre, "
                    "  pasos, creado_por) VALUES ('OBRA',%s,%s,%s,%s) RETURNING id",
                    (OBRA, PREFIJO + 'historica', json.dumps(historica), ids['autor']))
        pid = cur.fetchone()[0]
        conn.commit()
        flujo.CONTRATO_VIGENTE = flujo.AUTORIDAD_TERMINAL
        cur.execute("SELECT pasos::text FROM doc_review_plantillas WHERE id=%s", (pid,))
        _paso(json.loads(cur.fetchone()[0]) == historica,
              'sigue legible y byte a byte igual bajo el contrato nuevo')
        _paso(plt.validar_pasos(historica, plt.OBRA) is not None,
              'pero GUARDARLA de nuevo se rechazaria: editarla exige el contrato vigente')
        _paso(plt.validar_pasos(historica, plt.OBRA, contrato=flujo.PRE) is None,
              'y bajo PRE seguiria siendo valida: no se reescribe la historia')
        flujo.CONTRATO_VIGENTE = flujo.PRE

        # ── G1 · EL TESTIGO DEL ALTA ES ATOMICO ────────────────────────────
        _titulo('G1 · el testigo del alta, contra base real')
        import routes.reviews as rv
        flujo.CONTRATO_VIGENTE = flujo.AUTORIDAD_TERMINAL

        def cuentas():
            cur.execute("SELECT count(*) FROM doc_reviews WHERE model_urn LIKE %s",
                        (PREFIJO + '%',))
            revs = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM activity_log WHERE model_urn LIKE %s "
                        "  AND action='review_created'", (PREFIJO + '%',))
            return revs, cur.fetchone()[0]

        conn.commit()
        antes_r, antes_t = cuentas()

        # CASO NORMAL
        pasos_ok = [{'user_id': ids['r1'], 'email': 'r1', 'name': 'R1',
                     'decision': 'REVISA'},
                    {'user_id': ids['r2'], 'email': 'r2', 'name': 'R2',
                     'decision': 'APRUEBA'}]
        r = crear(como(ids['autor']), pasos_ok, 'G1 caso normal', ids['nodo'])
        d = r.get_json() or {}
        rid_g1 = d.get('id')
        conn.commit()
        despues_r, despues_t = cuentas()
        _paso(r.status_code == 200 and despues_r == antes_r + 1,
              'caso normal · la revision existe', 'revs %d -> %d' % (antes_r, despues_r))
        _paso(despues_t == antes_t + 1,
              'caso normal · y el testigo tambien, UNO SOLO (sin doble registro)',
              'testigos %d -> %d' % (antes_t, despues_t))
        cur.execute("SELECT contrato FROM doc_reviews WHERE id=%s", (rid_g1,))
        col = cur.fetchone()[0]
        cur.execute("SELECT count(*), min(details->>'contrato'), max(details->>'contrato') "
                    "  FROM activity_log WHERE entity_type='review' AND entity_id=%s "
                    "   AND action='review_created'", (str(rid_g1),))
        n_t, c_min, c_max = cur.fetchone()
        _paso(n_t == 1, 'caso normal · exactamente UN registro de alta', 'n=%s' % n_t)
        _paso(col == c_min == c_max == 'AUTORIDAD_TERMINAL',
              'caso normal · columna y testigo tienen EXACTAMENTE el mismo contrato',
              'col=%s testigo=%s' % (col, c_min))

        # CASO DE FALLO PROVOCADO
        antes_r, antes_t = cuentas()
        original = rv.registrar_actividad

        def revienta_el_testigo(*a, **k):
            raise RuntimeError('ensayo: el testigo no se puede escribir')

        rv.registrar_actividad = revienta_el_testigo
        try:
            r = crear(como(ids['autor']), pasos_ok, 'G1 fallo provocado', ids['nodo'])
        finally:
            rv.registrar_actividad = original
        conn.commit()
        despues_r, despues_t = cuentas()
        _paso(r.status_code == 500, 'fallo provocado · la peticion falla',
              'HTTP %s' % r.status_code)
        _paso(despues_r == antes_r,
              'fallo provocado · la REVISION NO existe', 'revs %d -> %d' % (antes_r, despues_r))
        _paso(despues_t == antes_t,
              'fallo provocado · el TESTIGO tampoco', 'testigos %d -> %d' % (antes_t, despues_t))
        cur.execute("SELECT count(*) FROM doc_reviews WHERE model_urn LIKE %s "
                    "  AND title = %s", (PREFIJO + '%', 'G1 fallo provocado'))
        _paso(cur.fetchone()[0] == 0,
              'fallo provocado · ningun efecto parcial quedo persistido')

        # EL ENVOLTORIO SIGUE SIRVIENDO A SUS OTROS CONSUMIDORES
        cur.execute("SELECT count(*) FROM activity_log WHERE model_urn LIKE %s "
                    "  AND action='zz_prueba_envoltorio'", (PREFIJO + '%',))
        antes_w = cur.fetchone()[0]
        log_activity(OBRA, 'zz_prueba_envoltorio', 'review', entity_id='0',
                     entity_name='envoltorio', performed_by='ensayo',
                     details={'x': 1})
        conn.commit()
        cur.execute("SELECT count(*) FROM activity_log WHERE model_urn LIKE %s "
                    "  AND action='zz_prueba_envoltorio'", (PREFIJO + '%',))
        _paso(cur.fetchone()[0] == antes_w + 1,
              'log_activity() sigue abriendo su conexion y confirmando sola')
        flujo.CONTRATO_VIGENTE = flujo.PRE

        limpiar(cur)
        conn.commit()
        cur.execute("SELECT count(*) FROM doc_reviews WHERE model_urn LIKE %s",
                    (PREFIJO + '%',))
        _paso(cur.fetchone()[0] == 0, 'teardown · el ensayo no deja ninguna fila suya')

    fallos = [p for p in _pasos if not p[0]]
    print()
    print('=' * 76)
    print('%d de %d comprobaciones pasan' % (len(_pasos) - len(fallos), len(_pasos)))
    for ok, texto in _pasos:
        if not ok:
            print('  FALLA  %s' % texto)
    print('=' * 76)
    return 1 if fallos else 0


if __name__ == '__main__':
    raise SystemExit(main())
