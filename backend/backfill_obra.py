"""Asigna la obra a los datos que quedaron sin ella ('global' o NULL).

POR QUE HACE FALTA
La autorizacion por proyecto filtra por project_id. Todo lo que quedo sin obra
se vuelve invisible para quien no es admin en cuanto se active — y mientras
tanto es un agujero, porque 'global' pasa la comprobacion de acceso sin mirar
nada. Este script cierra las dos cosas a la vez.

SEGURIDAD
- En SECO por defecto: cuenta y muestra, no escribe. Hay que pasar --aplicar.
- Idempotente: solo toca filas cuya obra sea NULL o 'global'.
- Nunca inventa: si resolve_project_id no reconoce el frente, esa fila se deja
  como esta y se reporta. Preferimos un dato sin obra a un dato en la obra
  equivocada.

    python backfill_obra.py              # solo informe
    python backfill_obra.py --aplicar    # escribe
"""

import pathlib
import sys

from dotenv import load_dotenv

# La consola de Windows usa cp1252 por defecto y revienta con cualquier caracter
# fuera de esa tabla. Se fuerza UTF-8 para que el informe se lea igual en
# PowerShell, en Git Bash y en los logs de Render.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

if not load_dotenv():
    load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')

from db import get_db_connection, resolve_project_id  # noqa: E402


def _informe(titulo, filas):
    print(f"\n── {titulo} ──")
    if not filas:
        print("   nada que hacer")
        return
    for texto in filas:
        print(f"   {texto}")


def inventario(cursor, aplicar):
    """inventory_assets.project_id se deduce del model_urn (el frente)."""
    cursor.execute("""
        SELECT COALESCE(model_urn, ''), COUNT(*)
        FROM inventory_assets WHERE project_id IS NULL
        GROUP BY 1 ORDER BY 2 DESC
    """)
    lineas, total, sin_resolver = [], 0, 0
    for urn, n in cursor.fetchall():
        # Sin model_urn no hay nada que deducir. resolve_project_id('') devuelve
        # la obra POR DEFECTO, y atribuir a la obra por defecto lo que no declara
        # obra no es deducir: es inventar. Es la misma leccion que documentos()
        # tiene escrita mas abajo -- «un dato sin obra es preferible a un dato en
        # la obra equivocada» -- y que esta funcion incumplia. Con el agravante
        # de que --aplicar escribe y no hay --deshacer.
        if not urn.strip():
            lineas.append(f"{n:>6} elementos  {'(sin model_urn)':58} -> SIN OBRA DECLARADA (no se toca)")
            sin_resolver += n
            continue
        obra = resolve_project_id(urn)
        if obra:
            lineas.append(f"{n:>6} elementos  {urn[:58]:58} -> {obra}")
            total += n
            if aplicar:
                cursor.execute(
                    "UPDATE inventory_assets SET project_id = %s"
                    " WHERE project_id IS NULL AND COALESCE(model_urn,'') = %s",
                    (obra, urn))
        else:
            lineas.append(f"{n:>6} elementos  {urn[:58]:58} -> SIN RESOLVER (se deja)")
            sin_resolver += n
    _informe("inventory_assets", lineas)
    return total, sin_resolver


def documentos(cursor, _aplicar):
    """file_nodes en 'global': SOLO INFORMA. A proposito no escribe.

    La primera version de este script queria mover la carpeta 'PQT8_TALARA' a la
    obra '1', y la prueba en seco lo delato: en esta tabla model_urn NO guarda el
    id de la obra sino el SCOPE DEL FRENTE ('proyectos/PQT8_TALARA', '1_CANAL',
    '1_DRENAJE', 'proyectos/PQT8_INTERFERENCIAS'). Escribir el id habria dejado
    esa carpeta incompatible con sus 93 hermanas.

    Y las fotos que quedan sueltas cuelgan de una carpeta MULTIMEDIA que tampoco
    tiene obra, asi que no hay forma de saber a que obra pertenecen sin decidirlo
    a mano. Un dato sin obra es preferible a un dato en la obra equivocada.
    """
    cursor.execute("""
        SELECT f.id, f.name, f.node_type, COALESCE(p.name, '(raiz)'), COALESCE(p.model_urn, '-')
        FROM file_nodes f LEFT JOIN file_nodes p ON f.parent_id = p.id
        WHERE f.model_urn = 'global'
        ORDER BY f.node_type DESC, f.name
    """)
    lineas = [f"[{tipo}] '{nombre[:38]}'  dentro de '{padre[:18]}' (obra del padre: {urn_padre})"
              for _nid, nombre, tipo, padre, urn_padre in cursor.fetchall()]
    _informe("file_nodes en 'global' (SOLO INFORME, no se toca)", lineas)
    return 0


def vistas(cursor):
    """saved_views sin obra: NO se adivinan. Se listan para decidir a mano."""
    cursor.execute("SELECT id, name FROM saved_views WHERE project_id IS NULL")
    filas = cursor.fetchall()
    _informe("saved_views sin obra (revisar a mano)",
             [f"id={vid}  '{nombre}'" for vid, nombre in filas])
    return len(filas)


def main():
    aplicar = '--aplicar' in sys.argv
    print("MODO:", "APLICAR (escribe en la base)" if aplicar else "EN SECO (no escribe nada)")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        total, sin_resolver = inventario(cursor, aplicar)
        carpetas = documentos(cursor, aplicar)
        pendientes = vistas(cursor)
        if aplicar:
            conn.commit()

    print("\n── RESUMEN ──")
    print(f"   elementos de inventario con obra asignada : {total}")
    print(f"   elementos que no se pudieron resolver     : {sin_resolver}")
    print(f"   documentos sin obra (solo informados)     : ver arriba")
    print(f"   vistas guardadas pendientes de decidir    : {pendientes}")
    if not aplicar:
        print("\n   Nada se ha escrito. Repite con --aplicar para hacerlo efectivo.")


if __name__ == '__main__':
    main()
