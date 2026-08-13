# -*- coding: utf-8 -*-
"""Encadenamiento del registro de actividad: que alterarlo se NOTE.

QUE PROBLEMA ATACA
------------------
BASELINE 0 · C3. En la base de produccion, `activity_log` tenia 1.755 filas
insertadas y **552 actualizadas**, y `auth_events` 2 borradas -- faltan los id 6 y
7. El codigo de la aplicacion no modifica ni borra esas tablas en ningun sitio
(comprobado: 7 puntos que insertan, 0 que modifican), asi que esas escrituras
vinieron de fuera: scripts de mantenimiento con la credencial de superusuario.

Casi con seguridad fueron tareas legitimas del propio equipo. **Y ese es justo el
problema: hoy no existe forma de distinguirlo.** Un registro cuya integridad
depende de la buena fe de quien tiene la contrasena no se sostiene ante una
auditoria.

QUE HACE ESTO, Y QUE NO
-----------------------
Cada fila lleva la huella de la anterior. Alterar una fila del medio -- o
borrarla -- rompe la cadena a partir de ahi, y la rotura se localiza.

  SI da:  DETECTABILIDAD. Se puede demostrar que el tramo A..B no ha cambiado
          desde que se sello, y senalar exactamente donde se rompio si cambio.

  NO da:  INMUTABILIDAD. Quien pueda escribir en la tabla puede recalcular la
          cadena entera y dejarla coherente. Para que eso no sea posible hace
          falta que quien administra no pueda escribir en el registro, o que
          exista una copia fuera de su alcance. Eso es separacion de funciones y
          almacenamiento externo, y va aparte.

No se va a afirmar "inmutable" mientras eso no exista.

POR QUE AL INSERTAR Y NO EN UNA PASADA PERIODICA
-----------------------------------------------
Una pasada periodica deja una ventana en la que las filas nuevas aun no estan
selladas, y esa ventana es exactamente cuando alguien querria borrar su rastro.
Encadenar al insertar cuesta una consulta mas por evento, y aqui se registran
1.755 eventos en toda la vida del sistema: es irrelevante.

POR QUE UN CERROJO DE AVISO
---------------------------
Dos eventos simultaneos leerian la misma fila anterior y se encadenarian los dos
al mismo sitio, dejando una bifurcacion que parece una manipulacion. El cerrojo
de aviso (advisory lock) serializa solo el calculo de la cadena, no la tabla.
"""

import hashlib
import json

from app_logging import get_logger

logger = get_logger('auditoria')

# Identificador arbitrario pero FIJO del cerrojo de aviso. Si cambia entre
# despliegues, dos procesos con distinto valor no se serializan entre si.
CERROJO = 0x0EC0_A0D1

# Semilla del primer eslabon. Una cadena tiene que empezar en algo conocido: si
# empezara en NULL no se podria distinguir "es la primera fila" de "le borraron
# las anteriores".
GENESIS = '0' * 64


def _canonico(fila):
    """El texto exacto sobre el que se calcula la huella de una fila.

    Ordenado y sin espacios variables: si el texto cambiara segun como se
    serialice, la verificacion daria roturas falsas y el control se volveria
    inservible a los dos dias.
    """
    return json.dumps(fila, sort_keys=True, separators=(',', ':'), default=str)


def huella_de_fila(hash_anterior, fila):
    return hashlib.sha256((str(hash_anterior or GENESIS) + _canonico(fila)).encode()).hexdigest()


def asegurar_columnas(cursor):
    """Las dos columnas de la cadena. Se llama desde el bootstrap, no en caliente."""
    cursor.execute("ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS hash_anterior CHAR(64)")
    cursor.execute("ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS hash CHAR(64)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_log_hash ON activity_log(hash)")


def encadenar(cursor, fila_id, contenido):
    """Sella una fila recien insertada con la huella de la anterior.

    `contenido` es el diccionario de campos que se protegen. Lo que no entre aqui
    no queda protegido por la cadena, asi que quien anada una columna con valor
    probatorio tiene que anadirla tambien a este diccionario.

    Devuelve la huella, o None si no se pudo sellar. NUNCA levanta: perder un
    evento de auditoria porque falle el sellado seria peor que el sellado.
    """
    try:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", (CERROJO,))
        cursor.execute("SELECT hash FROM activity_log WHERE hash IS NOT NULL "
                       " ORDER BY id DESC LIMIT 1")
        prev = cursor.fetchone()
        hash_anterior = prev[0] if prev else GENESIS
        h = huella_de_fila(hash_anterior, contenido)
        cursor.execute("UPDATE activity_log SET hash_anterior = %s, hash = %s WHERE id = %s",
                       (hash_anterior, h, fila_id))
        return h
    except Exception as e:
        logger.warning(f"no se pudo encadenar el evento {fila_id}: {e}")
        return None


def verificar(cursor, desde_id=None, limite=None):
    """Recorre la cadena y devuelve donde se rompe, si es que se rompe.

    Devuelve un diccionario con:
      revisadas      cuantas filas selladas se comprobaron
      sin_sellar     filas anteriores al encadenamiento (no son una rotura)
      roturas        lista de {id, motivo}
      integra        True si no hay ninguna rotura

    Tres motivos posibles de rotura, y son distintos:
      'huella no coincide'  el CONTENIDO de la fila cambio despues de sellarla
      'eslabon roto'        la fila anterior no es la que dice ser: falta alguna
      'sin huella'          se inserto salteando el sellado
    """
    sql = ("SELECT id, model_urn, action, entity_type, entity_id, entity_name, "
           "       performed_by, details, created_at, hash_anterior, hash "
           "  FROM activity_log ")
    cond, params = [], []
    if desde_id:
        cond.append("id >= %s"); params.append(desde_id)
    if cond:
        sql += " WHERE " + " AND ".join(cond)
    sql += " ORDER BY id ASC"
    if limite:
        sql += " LIMIT %s"; params.append(limite)
    cursor.execute(sql, params)

    revisadas = sin_sellar = 0
    roturas = []
    esperado = None
    for (fid, urn, accion, tipo, eid, enom, quien, det, cuando, h_ant, h) in cursor.fetchall():
        if h is None:
            sin_sellar += 1
            continue
        contenido = {'model_urn': urn, 'action': accion, 'entity_type': tipo,
                     'entity_id': eid, 'entity_name': enom, 'performed_by': quien,
                     'details': det, 'created_at': cuando}
        if esperado is not None and h_ant != esperado:
            roturas.append({'id': fid, 'motivo': 'eslabon roto',
                            'detalle': 'apunta a una fila anterior que no es la que le precede'})
        if huella_de_fila(h_ant, contenido) != h:
            roturas.append({'id': fid, 'motivo': 'huella no coincide',
                            'detalle': 'el contenido de esta fila cambio despues de sellarse'})
        esperado = h
        revisadas += 1
    return {'revisadas': revisadas, 'sin_sellar': sin_sellar,
            'roturas': roturas, 'integra': not roturas}


def sellar_pendientes(cursor, tope=5000):
    """Encadena las filas que aun no lo estan, en orden.

    Para las 1.755 filas que ya existian antes de que esto existiera. Sellarlas
    NO demuestra que no fueran alteradas antes: solo fija el punto a partir del
    cual una alteracion se notaria. Se deja dicho en la evidencia.
    """
    cursor.execute("SELECT pg_advisory_xact_lock(%s)", (CERROJO,))
    cursor.execute("SELECT hash FROM activity_log WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1")
    fila = cursor.fetchone()
    anterior = fila[0] if fila else GENESIS
    cursor.execute("""SELECT id, model_urn, action, entity_type, entity_id, entity_name,
                             performed_by, details, created_at
                        FROM activity_log WHERE hash IS NULL ORDER BY id ASC LIMIT %s""", (tope,))
    filas = cursor.fetchall()
    n = 0
    for (fid, urn, accion, tipo, eid, enom, quien, det, cuando) in filas:
        contenido = {'model_urn': urn, 'action': accion, 'entity_type': tipo,
                     'entity_id': eid, 'entity_name': enom, 'performed_by': quien,
                     'details': det, 'created_at': cuando}
        h = huella_de_fila(anterior, contenido)
        cursor.execute("UPDATE activity_log SET hash_anterior = %s, hash = %s WHERE id = %s",
                       (anterior, h, fid))
        anterior = h
        n += 1
    return n
