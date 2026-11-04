# -*- coding: utf-8 -*-
"""COPIAR LA ESTRUCTURA DE CARPETAS: las carpetas elegidas, VACÍAS, en una o varias carpetas destino (4-nov-2026, el
dueño: «tengo 10 carpetas que tendrán las mismas subcarpetas. Quisiera poder copiar esas subcarpetas, obviamente
vacías, solo carpetas»).

Qué hace y por qué así:
  · Se copian las CARPETAS QUE SE MARCAN (una o varias), cada una con sus subcarpetas, sus nombres y su anidación.
    Ningún documento. Es como lo usa el dueño: marca las subcarpetas que quiere repetir y las copia (5-nov-2026: la
    primera forma copiaba solo el interior de UNA carpeta y le negaba la copia con varias marcadas).
  · Se copia lo que quien copia VE: una subcarpeta que no puede ver (ni lo de dentro) no se copia, ni se anuncia.
  · Si en el destino ya hay una subcarpeta con ese nombre, se USA (y se sigue dentro): copiar dos veces no duplica, y se
    puede completar una estructura a medias.
  · Las carpetas nuevas heredan los permisos de su destino, como al crear una carpeta a mano (no se copian los de la
    modelo: el destino puede ser de otro equipo).
  · Cada carpeta nueva pasa las MISMAS reglas que crear una a mano: «Editar» donde se crea, la nomenclatura de la obra,
    la profundidad máxima y la cuota. Si una falla, no se crea NINGUNA (una transacción): nada a medias.
  · Un tope (`TOPE_CARPETAS`) por operación.

Este módulo decide y escribe con el cursor que le dan; la ruta (`routes/documents.py`) comprueba el acceso a la obra y
los permisos de las carpetas, hace el commit y deja la actividad.
"""

from collections import defaultdict

TOPE_CARPETAS = 500
TOPE_DESTINOS = 50


class Negativa(Exception):
    """Por qué no se puede: un código, el texto para la persona y su código HTTP."""
    def __init__(self, codigo, texto, http=400):
        super().__init__(texto)
        self.codigo, self.texto, self.http = codigo, texto, http


def subcarpetas(cur, model_urn, raiz_id):
    """Las carpetas vivas bajo `raiz_id` (sin ella), por nivel: [(id, padre, nombre)]. Sin las de sistema."""
    cur.execute("""WITH RECURSIVE t AS (
                       SELECT id, parent_id, name, 1 AS nivel FROM file_nodes
                        WHERE parent_id = %s AND model_urn = %s AND node_type = 'FOLDER'
                          AND is_deleted = FALSE AND folder_type IS NULL
                       UNION ALL
                       SELECT f.id, f.parent_id, f.name, t.nivel + 1 FROM file_nodes f JOIN t ON f.parent_id = t.id
                        WHERE f.model_urn = %s AND f.node_type = 'FOLDER' AND f.is_deleted = FALSE
                          AND f.folder_type IS NULL AND t.nivel < 64
                   )
                   SELECT id, parent_id, name FROM t ORDER BY nivel, name""", (raiz_id, model_urn, model_urn))
    return [(str(r[0]), str(r[1]), r[2]) for r in cur.fetchall()]


def visibles(filas, raiz_id, puede_ver):
    """Las que se copian: las que se ven, y solo bajo una que se ve (lo de dentro de una oculta tampoco)."""
    hijos = defaultdict(list)
    for fid, padre, nombre in filas:
        hijos[padre].append((fid, nombre))
    salida, cola = [], [str(raiz_id)]
    while cola:
        padre = cola.pop(0)
        for fid, nombre in hijos.get(padre, []):
            if puede_ver(fid):
                salida.append((fid, padre, nombre))
                cola.append(fid)
    return salida


def es_de_su_arbol(cur, raiz_id, nodo_id):
    """¿`nodo_id` es `raiz_id` o está debajo de ella?"""
    cur.execute("""WITH RECURSIVE t AS (
                       SELECT id FROM file_nodes WHERE id = %s
                       UNION ALL
                       SELECT f.id FROM file_nodes f JOIN t ON f.parent_id = t.id)
                   SELECT 1 FROM t WHERE id = %s LIMIT 1""", (raiz_id, nodo_id))
    return cur.fetchone() is not None


# La clave del destino en el plan: las carpetas de primer nivel cuelgan de ella.
_DESTINO = ''


def plan_de(cur, model_urn, raices, puede_ver, con_las_raices=True):
    """Lo que se copia en cada destino, de arriba abajo: [(id, padre, nombre)], con padre `_DESTINO` en el primer nivel.

    `con_las_raices`: las carpetas elegidas van ELLAS MISMAS, cada una con sus subcarpetas (lo que el dueño marca y
    copia). Sin ellas, solo sus subcarpetas (la forma del 4-nov, que sigue sirviendo al portal anterior)."""
    plan = []
    for raiz in raices:
        debajo = visibles(subcarpetas(cur, model_urn, raiz), raiz, puede_ver)
        if con_las_raices:
            plan.append((str(raiz), _DESTINO, _nombre(cur, raiz)))
            plan.extend(debajo)
        else:
            plan.extend((fid, _DESTINO if padre == str(raiz) else padre, nombre) for fid, padre, nombre in debajo)
    return plan


def copiar(cur, model_urn, raices, destinos, creado_por, puede_ver, puede_crear_en, validar, con_las_raices=True):
    """Copia la estructura de `raices` en cada destino. Devuelve {'creadas', 'ya_estaban', 'por_destino', 'modelo'}.

    `puede_ver(id)`: si quien copia ve esa carpeta. `puede_crear_en(id)`: si puede crear carpetas en esa del destino.
    `validar(nombre, padre)`: None o (codigo, texto) con las reglas de la obra. Lanza `Negativa`."""
    plan = plan_de(cur, model_urn, raices, puede_ver, con_las_raices)
    if not plan:
        raise Negativa('SIN_SUBCARPETAS', 'Esa carpeta no tiene subcarpetas que copiar.')
    if len(plan) * len(destinos) > TOPE_CARPETAS:
        raise Negativa('DEMASIADAS', 'Serían %d carpetas: como mucho %d por vez. Copia a menos destinos a la vez.'
                       % (len(plan) * len(destinos), TOPE_CARPETAS))
    creadas = ya = 0
    por_destino = {}
    for destino in destinos:
        mapa = {_DESTINO: str(destino)}
        nuevas = set()            # creadas ahora: heredan el permiso de su padre, ya comprobado
        antes = creadas
        for fid, padre, nombre in plan:
            donde = mapa[padre]
            cur.execute("""SELECT id FROM file_nodes WHERE model_urn = %s AND parent_id = %s AND name = %s
                              AND node_type = 'FOLDER' AND is_deleted = FALSE""", (model_urn, donde, nombre))
            f = cur.fetchone()
            if f:
                mapa[fid] = str(f[0])
                ya += 1
                continue
            if donde not in nuevas and not puede_crear_en(donde):
                raise Negativa('SIN_PERMISO', 'No tienes permiso para crear carpetas dentro de «%s».'
                               % _nombre(cur, donde), 403)
            error = validar(nombre, donde)
            if error:
                raise Negativa(error[0], error[1], 422)
            cur.execute("""INSERT INTO file_nodes (model_urn, parent_id, node_type, name, created_by)
                           VALUES (%s, %s, 'FOLDER', %s, %s) RETURNING id""", (model_urn, donde, nombre, creado_por))
            nuevo = str(cur.fetchone()[0])
            mapa[fid] = nuevo
            nuevas.add(nuevo)
            creadas += 1
        por_destino[str(destino)] = creadas - antes
    return {'creadas': creadas, 'ya_estaban': ya, 'por_destino': por_destino, 'modelo': len(plan)}


def _nombre(cur, nodo_id):
    cur.execute('SELECT name FROM file_nodes WHERE id = %s', (nodo_id,))
    f = cur.fetchone()
    return f[0] if f else 'esa carpeta'
