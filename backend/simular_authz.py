"""Simulacro: que pasaria si se activara la autorizacion por obra.

Antes de poner ENFORCE_PROJECT_AUTHZ=true conviene saber a QUIEN deja fuera. La
respuesta no esta en el codigo, esta en los datos: quien es miembro de que obra.

Este script NO escribe nada. Solo lee y responde tres preguntas:
  1. Que obras veria cada persona.
  2. Quien se quedaria sin ver NADA (el fallo que se descubre un lunes por la
     mañana, con el equipo en obra y sin poder abrir el modelo).
  3. Cuantos datos quedan sin obra asignada y por tanto se volverian invisibles.

    python simular_authz.py
"""

import pathlib
import sys

from dotenv import load_dotenv

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

if not load_dotenv():
    load_dotenv(pathlib.Path(__file__).resolve().parent.parent / '.env')

from db import get_db_connection  # noqa: E402


def _titulo(texto):
    print(f"\n--- {texto} ---")


def main():
    print("SIMULACRO de ENFORCE_PROJECT_AUTHZ (no escribe nada)")

    with get_db_connection() as conn:
        cur = conn.cursor()

        cur.execute("SELECT id, name FROM projects WHERE status = 'active' ORDER BY name")
        obras = cur.fetchall()

        cur.execute("""
            SELECT u.id, u.name, u.email, u.role, COALESCE(u.is_active, TRUE),
                   COALESCE(u.password_hash, '') <> '' AS reclamada
            FROM users u ORDER BY u.role DESC, u.email
        """)
        usuarios = cur.fetchall()

        cur.execute("SELECT user_id, project_id FROM project_users")
        membresias = {}
        for uid, pid in cur.fetchall():
            membresias.setdefault(uid, set()).add(pid)

        _titulo(f"Que veria cada persona ({len(obras)} obras activas)")
        sin_nada = []
        for uid, nombre, correo, rol, activo, reclamada in usuarios:
            if not activo:
                print(f"  (desactivado)  {correo[:38]:38} — no entra")
                continue
            if rol == 'admin':
                print(f"  ADMIN          {correo[:38]:38} — TODAS ({len(obras)})")
                continue
            mias = membresias.get(uid, set())
            visibles = [n for (i, n) in obras if i in mias]
            if visibles:
                print(f"  usuario        {correo[:38]:38} — {', '.join(visibles)}")
            else:
                estado = 'invitación sin reclamar' if not reclamada else 'SIN NINGUNA OBRA'
                print(f"  usuario        {correo[:38]:38} — {estado}")
                if reclamada:
                    sin_nada.append(correo)

        _titulo("Quien se quedaria sin ver NADA")
        if sin_nada:
            print("  Estas cuentas SI pueden entrar y no verian ni una obra.")
            print("  Asignales acceso ANTES de activar, o se enteraran en campo:")
            for correo in sin_nada:
                print(f"    · {correo}")
        else:
            print("  Nadie: toda cuenta que puede entrar tiene al menos una obra.")

        _titulo("Datos sin obra asignada")
        pendientes = 0
        # El aviso se distingue por tabla, porque NO todas se comportan igual:
        #  - 'arreglable': hoy se ven y al activar dejarian de verse. Urgente.
        #  - 'ya invisible': el listado ya filtra por obra, asi que estas filas
        #    no se ven NI HOY. Activar no cambia nada; es huerfano antiguo.
        for tabla, columna, etiqueta, efecto in [
            ('inventory_assets', 'project_id', 'elementos de inventario', 'arreglable'),
            ('control_pins', 'project_id', 'pines de control', 'arreglable'),
            ('saved_views', 'project_id', 'vistas guardadas', 'ya invisible'),
        ]:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {tabla} WHERE {columna} IS NULL")
                n = cur.fetchone()[0]
                cur.execute(f"SELECT COUNT(*) FROM {tabla}")
                total = cur.fetchone()[0]
                if not n:
                    aviso = ''
                elif efecto == 'arreglable':
                    aviso = '   <-- se volverian invisibles: corre backfill_obra.py --aplicar'
                    pendientes += n
                else:
                    aviso = '   (ya no se ven hoy: el listado filtra por obra. Huerfanas antiguas)'
                print(f"  {etiqueta:26} {n:>7} de {total}{aviso}")
            except Exception:
                conn.rollback()
                print(f"  {etiqueta:26} (tabla no disponible)")

    _titulo("VEREDICTO")
    if sin_nada:
        print("  NO ACTIVAR todavia: hay cuentas que se quedarian sin ver nada.")
    elif pendientes:
        print("  Corre antes backfill_obra.py --aplicar; si no, esos datos desaparecen.")
    else:
        print("  Se puede activar. Hazlo primero en sombra y lee los logs unos dias.")


if __name__ == '__main__':
    main()
