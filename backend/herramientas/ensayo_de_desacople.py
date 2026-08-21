# -*- coding: utf-8 -*-
"""Compartir MECANICA no puede haberse convertido en compartir FLUJO.

POR QUE EXISTE ESTE ENSAYO
--------------------------
`flujo_de_rfi.py` y `flujo_de_redline.py` se apoyan en una pieza comun,
`flujo_de_registro.py`. Eso evita que una regla de gobierno duplicada acabe
divergiendo --defecto ya pagado en este proyecto con `_faltantes` y
`_sigue_debiendose`-- pero introduce el riesgo CONTRARIO: que un cambio pensado
para un objeto se lleve por delante al otro sin que nadie lo note.

Un RFI y un Red Line son de la misma FAMILIA y hoy sus posiciones coinciden.
Pero significan cosas distintas --uno acepta una RESPUESTA, el otro una
MODIFICACION DEL PROYECTO-- y manana pueden separarse. Este ensayo comprueba
que separarlos SEA POSIBLE, no solo que hoy funcionen.

    python herramientas/ensayo_de_desacople.py
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pathlib
from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / '.env')
load_dotenv()

PREFIJO = 'zz_desac_'
OBRA = PREFIJO + 'obra'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_redlines WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_rfis WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (PREFIJO + '%',))


def main():
    os.environ.setdefault('AUTH_POLICY_MODE', 'sombra')
    os.environ.setdefault('APP_SECRET', 'x' * 32)

    import db
    importlib.reload(db)
    from db import init_db_pool, get_db_connection
    import referencias_de_obra as ref
    import flujo_de_registro as reg
    import flujo_de_rfi as rfi
    import flujo_de_redline as rl
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DE DESACOPLE ENTRE RFI Y RED LINE')
    print('=' * 76)

    print()
    print('1 · CADA OBJETO NOMBRA LO SUYO')
    _paso(rfi.SEMANTICA.tabla == 'doc_rfis' and rl.SEMANTICA.tabla == 'doc_redlines',
          'cada semantica apunta a SU tabla',
          '%s / %s' % (rfi.SEMANTICA.tabla, rl.SEMANTICA.tabla))
    _paso(rfi.SEMANTICA.prefijo == 'RFI' and rl.SEMANTICA.prefijo == 'RL',
          'y a su prefijo de numeracion')
    _paso(rfi.SEMANTICA.clave == 'RFI' and rl.SEMANTICA.clave == 'REDLINE',
          'y a su tipo de encargo')
    _paso(rfi.SEMANTICA is not rl.SEMANTICA,
          'no son el mismo objeto en memoria')
    _paso(rfi.ESTADOS is not rl.ESTADOS and rfi.TRANSICIONES is not rl.TRANSICIONES,
          'ni comparten la lista de estados ni el mapa de transiciones: '
          'hoy coinciden en valor, pero son declaraciones separadas')

    print()
    print('2 · LA SEMANTICA ES UN DATO, Y CAMBIARLA NO CONTAGIA')
    # Se declara un Red Line HIPOTETICO donde el veredicto lo dicta el emisor
    # --la regla CONTRARIA a la de hoy-- y se comprueba que el RFI ni se entera.
    hipotetico = rl.SEMANTICA._replace(quien_dicta_veredicto=(reg.AUTOR,))
    emisor = {'id': 1, 'email': 'a@x.test', 'name': 'A', 'role': 'editor'}
    responsable = {'id': 2, 'email': 'b@x.test', 'name': 'B', 'role': 'editor'}
    obj = {'created_by': 'a@x.test', 'responsable_id': 2, 'estado': 'En revisión'}

    _paso(reg.puede_dictar_veredicto(hipotetico, emisor, obj)
          and not reg.puede_dictar_veredicto(hipotetico, responsable, obj),
          'en el Red Line hipotetico dicta el EMISOR y no el responsable')
    _paso(not rfi.puede_dictar_veredicto(emisor, obj)
          and rfi.puede_dictar_veredicto(responsable, obj),
          'y el RFI real sigue exactamente igual: dicta SOLO el responsable')
    _paso(not rl.puede_dictar_veredicto(emisor, obj)
          and rl.puede_dictar_veredicto(responsable, obj),
          'y el Red Line real tambien: la declaracion hipotetica no lo tocó')

    print()
    print('3 · LOS MENSAJES SON DE CADA OBJETO')
    msgs_rfi = [rfi.SEMANTICA.msg_no_veredicto, rfi.SEMANTICA.msg_no_cierra,
                rfi.SEMANTICA.msg_cerrado, rfi.SEMANTICA.msg_necesita_adopcion,
                rfi.SEMANTICA.msg_no_reasigna]
    msgs_rl = [rl.SEMANTICA.msg_no_veredicto, rl.SEMANTICA.msg_no_cierra,
               rl.SEMANTICA.msg_cerrado, rl.SEMANTICA.msg_necesita_adopcion,
               rl.SEMANTICA.msg_no_reasigna]
    _paso(all('Red Line' not in m for m in msgs_rfi),
          'ningun mensaje del RFI habla de Red Lines')
    _paso(all('RFI' not in m for m in msgs_rl),
          'ningun mensaje del Red Line habla de RFI')
    _paso('modificación' in rl.SEMANTICA.msg_no_veredicto
          and 'responderlo' in rfi.SEMANTICA.msg_no_veredicto,
          'y cada uno dice lo que su veredicto SIGNIFICA: aceptar una '
          'MODIFICACION frente a responder una consulta')
    _paso(rl.SEMANTICA.asunto_encargo.startswith('Revisar')
          and rfi.SEMANTICA.asunto_encargo.startswith('Responder'),
          'el encargo pide cosas distintas: «Revisar» frente a «Responder»')
    vale, motivo_rfi = rfi.transicion_valida('Cerrado', 'En revisión')
    _paso2 = rl.transicion_valida('Cerrado', 'En revisión')
    _paso('RFI' in motivo_rfi and 'Red Line' in _paso2[1],
          'hasta el motivo de una transicion invalida nombra al objeto correcto')

    print()
    print('4 · UNA POSICION INVENTADA NO SE DA POR FALSA EN SILENCIO')
    roto = rl.SEMANTICA._replace(quien_cierra=('inspector',))
    try:
        reg.puede_cerrar(roto, emisor, obj)
        _paso(False, 'una posicion inexistente deberia reventar, no devolver False')
    except ValueError as e:
        _paso(True, 'una posicion inexistente REVIENTA: una regla que no gobierna '
                    'nada seria peor que ninguna', str(e)[:55])

    print()
    print('5 · LA NUMERACION DE UNO NO AVANZA LA DEL OTRO')
    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None
        cur.execute("SELECT id FROM hubs LIMIT 1")
        fila = cur.fetchone()
        cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                    "VALUES (%s,%s,'ZZ DESACOPLE',%s,'active')",
                    (OBRA, fila[0] if fila else None, OBRA))
        ref.registrar_obra(cur, OBRA, nombre='ZZ DESACOPLE', model_urn=OBRA,
                           origen='ensayo de desacople')
        conn.commit()
        db._project_resolver_cache['map'] = None

        for i in range(5):
            cur.execute("INSERT INTO doc_rfis (model_urn, codigo, titulo, created_by, "
                        "  project_id, estado) VALUES (%s,%s,'x','t',%s,'Emitido')",
                        (OBRA, 'RFI-%03d' % (i + 1), OBRA))
        conn.commit()
        _paso(rl.siguiente_codigo(cur, OBRA) == 'RL-001',
              'con 5 RFI creados, el siguiente Red Line sigue siendo RL-001',
              rl.siguiente_codigo(cur, OBRA))
        _paso(rfi.siguiente_codigo(cur, OBRA) == 'RFI-006',
              'y el siguiente RFI es el 006')

        for i in range(3):
            cur.execute("INSERT INTO doc_redlines (model_urn, codigo, titulo, created_by, "
                        "  project_id, estado) VALUES (%s,%s,'x','t',%s,'Emitido')",
                        (OBRA, 'RL-%03d' % (i + 1), OBRA))
        conn.commit()
        _paso(rfi.siguiente_codigo(cur, OBRA) == 'RFI-006',
              'y con 3 Red Lines creados, el siguiente RFI SIGUE siendo el 006',
              rfi.siguiente_codigo(cur, OBRA))
        _paso(rl.siguiente_codigo(cur, OBRA) == 'RL-004',
              'mientras el Red Line avanza al 004')

        print()
        print('6 · EL ESTADO DEL FLUJO LEE SU PROPIA TABLA')
        cur.execute("INSERT INTO users (name, email, password_hash, role, is_active) "
                    "VALUES ('Fuera',%s,'x','editor',TRUE) RETURNING id",
                    (PREFIJO + 'fuera@e.test',))
        fuera = cur.fetchone()[0]
        conn.commit()
        obj_fuera = {'estado': 'En revisión', 'responsable_id': fuera,
                     'responsable': None, 'project_id': OBRA}
        e_rfi, m_rfi = rfi.estado_del_flujo(cur, dict(obj_fuera))
        e_rl, m_rl = rl.estado_del_flujo(cur, dict(obj_fuera))
        _paso(e_rfi == 'BLOQUEADO' and e_rl == 'BLOQUEADO',
              'los dos detectan que el responsable no es miembro')
        _paso('responder este RFI' in m_rfi and 'este Red Line' in m_rl,
              'pero cada uno lo explica en sus propios terminos',
              m_rl[-32:])

        print()
        print('7 · LOS ENCARGOS NO SE CRUZAN')
        import encargos as enc
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA, fuera))
        conn.commit()
        # EL MISMO identificador para los dos tipos, en sus tablas respectivas.
        # Son tablas distintas, asi que un UUID puede repetirse entre ellas. Si
        # el tipo no discriminara, cerrar uno cerraria el otro.
        #
        # Y los objetos son REALES: `abrir()` se niega a abrir un encargo sobre
        # algo que no existe --lo que este mismo ensayo comprobo al escribirse
        # con un id inventado--, asi que un id falso probaria otra cosa.
        mismo = '00000000-0000-0000-0000-0000000000ff'
        cur.execute("INSERT INTO doc_rfis (id, model_urn, codigo, titulo, created_by, "
                    "  project_id, estado) VALUES (%s::uuid,%s,'RFI-900','x','t',%s,"
                    "  'Emitido')", (mismo, OBRA, OBRA))
        cur.execute("INSERT INTO doc_redlines (id, model_urn, codigo, titulo, created_by, "
                    "  project_id, estado) VALUES (%s::uuid,%s,'RL-900','x','t',%s,"
                    "  'Emitido')", (mismo, OBRA, OBRA))
        conn.commit()
        a = enc.abrir(cur, 'RFI', mismo, 'Responder RFI-001: x',
                      destino_usuario=fuera, creado_por='ensayo')
        b = enc.abrir(cur, 'REDLINE', mismo, 'Revisar RL-001: x',
                      destino_usuario=fuera, creado_por='ensayo')
        conn.commit()
        _paso(bool(a) and bool(b) and a != b,
              'un RFI y un Red Line con el MISMO id abren dos encargos distintos')
        enc.cerrar_los_de(cur, 'REDLINE', mismo, 'ensayo')
        conn.commit()
        cur.execute("SELECT objeto_tipo, estado FROM encargos WHERE objeto_id=%s "
                    " ORDER BY objeto_tipo", (mismo,))
        estados = dict(cur.fetchall())
        _paso(estados.get('RFI') == 'abierto' and estados.get('REDLINE') == 'cerrado',
              'cerrar el del Red Line NO cierra el del RFI', str(estados))
        cur.execute("DELETE FROM encargos WHERE objeto_id=%s", (mismo,))

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
