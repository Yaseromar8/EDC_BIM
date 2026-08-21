# -*- coding: utf-8 -*-
"""Las invariantes del motor de encargo, contra PostgreSQL de verdad.

POR QUE NO BASTAN LAS PRUEBAS SIN BASE DE DATOS
-----------------------------------------------
La invariante «un encargo nunca amplia acceso» vive dentro de una consulta con
tres JOIN. Una prueba que falsee el cursor puede comprobar que el texto del SQL
contiene `JOIN project_users`, pero no que ese JOIN haga lo que promete. Eso solo
lo puede juzgar una base de datos.

EL ESCENARIO
------------
Dos obras. Tres empresas con las tres funciones contractuales que conviven en una
obra publica peruana. Y las dos personas que rompen los supuestos ingenuos:

    OBRA A                                    OBRA B
      ENTIDAD      -> Ana    (miembro)          CONTRATISTA -> Ana (¡tambien!)
      SUPERVISION  -> Sonia  (miembro)
      CONTRATISTA  -> Carlos (miembro)
                      Sergio (MISMA empresa que Sonia, NO es miembro de A)

  - Sergio es de la empresa supervisora y NO pertenece a la obra. Un encargo a
    «SUPERVISION» no debe alcanzarle.
  - Ana pertenece a las DOS obras. Debe ver lo suyo de cada una, y nada mas.

QUE NO TOCA
-----------
Crea todo con prefijo `zz_enc_` y solo borra lo que crea. No modifica ninguna
obra, documento, version, huella ni permiso existente.

    python herramientas/ensayo_de_encargos.py
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

PREFIJO = 'zz_enc_'
OBRA_A = PREFIJO + 'obra_a'
OBRA_B = PREFIJO + 'obra_b'
CORREO = PREFIJO + '%'

_pasos = []


def _paso(ok, texto, detalle=''):
    _pasos.append((ok, texto))
    print('  %s  %s%s' % ('OK  ' if ok else 'FALLA', texto,
                          ('   -- ' + detalle) if detalle else ''))
    return ok


def limpiar(cur):
    cur.execute("DELETE FROM encargos WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_rfis WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM doc_reviews WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM transmittals WHERE model_urn LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_companies WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_users WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM project_ref WHERE project_id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM projects WHERE id LIKE %s", (PREFIJO + '%',))
    cur.execute("DELETE FROM users WHERE email LIKE %s", (CORREO,))
    cur.execute("DELETE FROM companies WHERE name LIKE %s", (PREFIJO + '%',))


def montar(cur, ref):
    """Construye el escenario. Devuelve los ids que hacen falta."""
    cur.execute("SELECT id FROM hubs LIMIT 1")
    fila = cur.fetchone()
    hub = fila[0] if fila else None

    for pid, nombre in ((OBRA_A, 'ZZ Encargos Obra A'), (OBRA_B, 'ZZ Encargos Obra B')):
        cur.execute("INSERT INTO projects (id, hub_id, name, model_urn, status) "
                    "VALUES (%s,%s,%s,%s,'active')", (pid, hub, nombre, pid))
        ref.registrar_obra(cur, pid, nombre=nombre, model_urn=pid, origen='ensayo de encargos')

    empresas = {}
    for clave in ('entidad', 'supervision', 'contratista'):
        cur.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id",
                    (PREFIJO + clave,))
        empresas[clave] = cur.fetchone()[0]

    def usuario(nombre, empresa):
        cur.execute("INSERT INTO users (name, email, password_hash, role, is_active, company_id) "
                    "VALUES (%s,%s,'x','editor',TRUE,%s) RETURNING id",
                    (nombre, PREFIJO + nombre.lower() + '@ensayo.test', empresa))
        return cur.fetchone()[0]

    ana = usuario('Ana', empresas['entidad'])
    sonia = usuario('Sonia', empresas['supervision'])
    carlos = usuario('Carlos', empresas['contratista'])
    sergio = usuario('Sergio', empresas['supervision'])   # misma empresa, NO miembro

    # Membresias: Sergio queda FUERA de la obra A a proposito.
    for uid in (ana, sonia, carlos):
        cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                    (OBRA_A, uid))
    cur.execute("INSERT INTO project_users (project_id, user_id) VALUES (%s,%s)",
                (OBRA_B, ana))          # Ana esta en las DOS obras

    # Funciones contractuales: las tres conviviendo en la obra A.
    for clave, funcion in (('entidad', 'ENTIDAD'), ('supervision', 'SUPERVISION'),
                           ('contratista', 'CONTRATISTA')):
        cur.execute("INSERT INTO project_companies (project_id, company_id, funcion) "
                    "VALUES (%s,%s,%s)", (OBRA_A, empresas[clave], funcion))
    # En la obra B, la empresa de Ana ejerce de CONTRATISTA (funcion distinta).
    cur.execute("INSERT INTO project_companies (project_id, company_id, funcion) "
                "VALUES (%s,%s,'CONTRATISTA')", (OBRA_B, empresas['entidad']))

    return {'ana': ana, 'sonia': sonia, 'carlos': carlos, 'sergio': sergio,
            'empresas': empresas}


def main():
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    import db
    importlib.reload(db)
    from db import init_db_pool, get_db_connection
    import referencias_de_obra as ref
    import encargos as enc
    import directorio_de_obra as dir_obra
    init_db_pool()

    print()
    print('=' * 76)
    print('ENSAYO DEL MOTOR DE ENCARGO')
    print('=' * 76)

    with get_db_connection() as conn:
        cur = conn.cursor()
        limpiar(cur)
        conn.commit()
        db._project_resolver_cache['map'] = None
        gente = montar(cur, ref)
        conn.commit()
        db._project_resolver_cache['map'] = None

        # Un RFI y un transmittal de la obra A sobre los que colgar encargos.
        cur.execute("INSERT INTO doc_rfis (model_urn, codigo, titulo, project_id) "
                    "VALUES (%s,'RFI-001','Consulta de trazo',%s) RETURNING id::text",
                    (OBRA_A, OBRA_A))
        rfi = cur.fetchone()[0]
        cur.execute("INSERT INTO transmittals (model_urn, number, subject, recipients, items) "
                    "VALUES (%s,1,'Emision 1','[]'::jsonb,'[]'::jsonb) RETURNING id",
                    (OBRA_A,))
        tr = cur.fetchone()[0]
        conn.commit()

        print()
        print('1 · UN ENCARGO A UNA FUNCION SOLO ALCANZA A MIEMBROS DE LA OBRA')
        eid = enc.abrir(cur, 'RFI', rfi, 'Responder RFI-001 (a la Supervision)',
                        destino_funcion='SUPERVISION', creado_por='ensayo')
        conn.commit()
        _paso(eid is not None, 'se abre el encargo dirigido a SUPERVISION')

        de_sonia = enc.mi_trabajo(cur, gente['sonia'])
        de_sergio = enc.mi_trabajo(cur, gente['sergio'])
        _paso(len(de_sonia) == 1,
              'Sonia (Supervision Y miembro) SI lo ve', '%d encargos' % len(de_sonia))
        _paso(len(de_sergio) == 0,
              'Sergio (misma empresa supervisora, NO miembro) NO lo ve',
              '%d encargos' % len(de_sergio))

        alcanzados = dir_obra.usuarios_de_la_funcion(cur, OBRA_A, 'SUPERVISION')
        _paso([u[0] for u in alcanzados] == [gente['sonia']],
              'la resolucion de la funcion excluye al no miembro',
              'alcanza a %s' % [u[0] for u in alcanzados])

        print()
        print('2 · LAS TRES FUNCIONES CONVIVEN Y NO SE PISAN')
        for funcion, quien, otros in (('ENTIDAD', 'ana', ('sonia', 'carlos')),
                                      ('CONTRATISTA', 'carlos', ('ana', 'sonia'))):
            e = enc.abrir(cur, 'RFI', rfi, 'Tarea para %s' % funcion,
                          destino_funcion=funcion, creado_por='ensayo')
            conn.commit()
            mios = enc.mi_trabajo(cur, gente[quien])
            ajenos = [len(enc.mi_trabajo(cur, gente[o])) for o in otros]
            _paso(any(x['id'] == e for x in mios),
                  '%s: le llega a %s' % (funcion, quien))
            _paso(all(e not in [x['id'] for x in enc.mi_trabajo(cur, gente[o])] for o in otros),
                  '%s: NO les llega a %s' % (funcion, ', '.join(otros)))

        print()
        print('3 · UN USUARIO EN DOS OBRAS VE LO DE CADA UNA, Y NADA MAS')
        cur.execute("INSERT INTO doc_rfis (model_urn, codigo, titulo, project_id) "
                    "VALUES (%s,'RFI-B01','Consulta obra B',%s) RETURNING id::text",
                    (OBRA_B, OBRA_B))
        rfi_b = cur.fetchone()[0]
        enc.abrir(cur, 'RFI', rfi_b, 'Responder RFI-B01', destino_usuario=gente['ana'],
                  creado_por='ensayo')
        conn.commit()
        de_ana = enc.mi_trabajo(cur, gente['ana'])
        obras_de_ana = sorted({x['project_id'] for x in de_ana})
        _paso(obras_de_ana == sorted([OBRA_A, OBRA_B]),
              'Ana ve trabajo de sus DOS obras', str(obras_de_ana))
        solo_a = enc.mi_trabajo(cur, gente['ana'], project_id=OBRA_A)
        _paso(all(x['project_id'] == OBRA_A for x in solo_a),
              'y filtrando por obra solo ve la que pide')
        _paso(not any(x['project_id'] == OBRA_B for x in enc.mi_trabajo(cur, gente['sonia'])),
              'Sonia NO ve nada de la obra B, donde no esta')

        print()
        print('4 · CERRAR EL OBJETO CIERRA SU ENCARGO')
        abiertos_antes = len(enc.mi_trabajo(cur, gente['sonia']))
        n = enc.cerrar_los_de(cur, 'RFI', rfi, 'ensayo')
        conn.commit()
        _paso(n >= 1, 'cerrar el RFI cierra sus %d encargos' % n)
        _paso(len(enc.mi_trabajo(cur, gente['sonia'])) < abiertos_antes,
              'y desaparece de la bandeja de Sonia')
        cur.execute("SELECT count(*) FROM encargos WHERE objeto_tipo='RFI' AND objeto_id=%s "
                    "  AND estado='abierto'", (rfi,))
        _paso(cur.fetchone()[0] == 0, 'no queda ningun encargo abierto de ese RFI')

        print()
        print('5 · LA BANDEJA SOLO DEVUELVE LO ABIERTO')
        cur.execute("SELECT count(*) FROM encargos WHERE project_id=%s AND estado='cerrado'",
                    (OBRA_A,))
        cerrados = cur.fetchone()[0]
        vistos = enc.mi_trabajo(cur, gente['sonia']) + enc.mi_trabajo(cur, gente['carlos'])
        cur.execute("SELECT id FROM encargos WHERE estado='cerrado'")
        ids_cerrados = {r[0] for r in cur.fetchall()}
        _paso(cerrados > 0 and not (set(x['id'] for x in vistos) & ids_cerrados),
              'ninguno de los %d encargos cerrados aparece en ninguna bandeja' % cerrados)

        print()
        print('6 · NO PUEDE QUEDAR UN ENCARGO APUNTANDO A NADA')
        sueltos = enc.huerfanos(cur)
        _paso(not sueltos, 'ningun encargo abierto apunta a un objeto inexistente o ajeno',
              str(sueltos[:2]))
        # Y no se puede crear uno asi ni queriendo:
        malo = enc.abrir(cur, 'RFI', 'no-existe-99', 'x', destino_usuario=gente['ana'])
        _paso(malo is None, 'no se puede abrir uno sobre un objeto que no existe')
        # Un objeto de la obra B con un destinatario que no esta en la obra B:
        malo2 = enc.abrir(cur, 'RFI', rfi_b, 'x', destino_usuario=gente['sonia'])
        _paso(malo2 is None,
              'ni dirigirlo a alguien que no es miembro de la obra del objeto')

        print()
        print('7 · EL TRANSMITTAL: CADA DESTINATARIO DEBE EL SUYO')
        e1 = enc.abrir(cur, 'TRANSMITTAL', tr, 'Acusar TR-001', destino_usuario=gente['sonia'])
        e2 = enc.abrir(cur, 'TRANSMITTAL', tr, 'Acusar TR-001', destino_usuario=gente['carlos'])
        conn.commit()
        enc.cerrar_los_de(cur, 'TRANSMITTAL', tr, 'sonia', destino_usuario=gente['sonia'])
        conn.commit()
        _paso(e1 and e2, 'se abre un encargo por destinatario')
        _paso(not any(x['id'] == e1 for x in enc.mi_trabajo(cur, gente['sonia'])),
              'Sonia acusa y deja de deberlo')
        _paso(any(x['id'] == e2 for x in enc.mi_trabajo(cur, gente['carlos'])),
              'Carlos NO se libera porque haya acusado Sonia')

        print()
        print('8 · CONSISTENCIA EVENTUAL: divergencia, deteccion y reparacion')
        # 1. El objeto transiciona CORRECTAMENTE.
        cur.execute("INSERT INTO doc_rfis (model_urn, codigo, titulo, project_id) "
                    "VALUES (%s,'RFI-009','Consulta que se respondera',%s) RETURNING id::text",
                    (OBRA_A, OBRA_A))
        rfi_d = cur.fetchone()[0]
        e_d = enc.abrir(cur, 'RFI', rfi_d, 'Responder RFI-009',
                        destino_usuario=gente['carlos'], creado_por='ensayo')
        conn.commit()
        _paso(any(x['id'] == e_d for x in enc.mi_trabajo(cur, gente['carlos'])),
              'Carlos ve el encargo del RFI-009')

        # 2. FALLO DELIBERADO DE LA PROYECCION: el RFI se responde -- que es la
        #    transicion contractual, y sobrevive-- y el encargo NO se cierra.
        #    Se reproduce escribiendo el objeto directamente, que es exactamente
        #    lo que queda cuando `cerrar_los_de` revienta y su try lo absorbe.
        cur.execute("UPDATE doc_rfis SET estado='Cerrado', respuesta='Ya esta', "
                    "       fecha_respuesta=CURRENT_DATE WHERE id::text = %s", (rfi_d,))
        conn.commit()
        cur.execute("SELECT estado FROM doc_rfis WHERE id::text=%s", (rfi_d,))
        _paso(cur.fetchone()[0] == 'Cerrado',
              'el RFI queda RESPONDIDO (la transicion contractual sobrevive)')
        _paso(any(x['id'] == e_d for x in enc.mi_trabajo(cur, gente['carlos'])),
              'y el encargo se queda ABIERTO: la divergencia existe de verdad')

        # 3. DETECCION.
        d = enc.divergencias(cur)
        detectado = [s for s in d['sobrantes'] if s[0] == e_d]
        _paso(bool(detectado), 'la conciliacion DETECTA la divergencia de estado',
              detectado[0][3] if detectado else 'no la vio')
        _paso(not any(s[0] == e_d for s in enc.huerfanos(cur)),
              'y `huerfanos()` NO la ve -- por eso hacia falta `divergencias()`')

        # 4. REPARACION.
        cerrados, abiertos, _ = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(cerrados >= 1, 'la conciliacion cierra %d encargo(s) sobrante(s)' % cerrados)

        # 5. LA BANDEJA REFLEJA EL ESTADO CORRECTO.
        _paso(not any(x['id'] == e_d for x in enc.mi_trabajo(cur, gente['carlos'])),
              'Carlos deja de ver en su bandeja algo que ya salda')

        # Y es IDEMPOTENTE: repetirla no cambia nada.
        c2, a2, resto = enc.conciliar(cur, aplicar=True, actor='ensayo')
        conn.commit()
        _paso(c2 == 0 and a2 == 0,
              'correrla otra vez no cambia nada (es idempotente)',
              'cerro %d, abrio %d' % (c2, a2))
        _paso(not resto['sobrantes'] and not resto['faltantes'],
              'y no queda ninguna divergencia',
              'sobran %d, faltan %d' % (len(resto['sobrantes']), len(resto['faltantes'])))

        # Un tipo desconocido no puede llegar a existir: lo impide la BASE.
        # El guardia en Python (`TipoNoInterpretable`) es la segunda linea, para
        # una base antigua que no tenga la restriccion; se prueba aparte, sin
        # base de datos, porque aqui no se puede ni insertar la fila.
        try:
            cur.execute("INSERT INTO encargos (project_id, objeto_tipo, objeto_id, "
                        "  destino_usuario, asunto) VALUES (%s,'SUBMITTAL','1',%s,'x')",
                        (OBRA_A, gente['ana']))
            conn.rollback()
            _paso(False, 'la base ACEPTO un tipo de encargo desconocido')
        except Exception:
            conn.rollback()
            _paso(True, 'la base RECHAZA un tipo de encargo desconocido (ck_encargos_tipo)')

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
