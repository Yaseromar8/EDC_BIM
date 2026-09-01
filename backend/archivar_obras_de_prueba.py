# -*- coding: utf-8 -*-
"""Archiva las obras de prueba y CONSERVA las reales.

  python archivar_obras_de_prueba.py                # solo mira y cuenta
  python archivar_obras_de_prueba.py --confirmar    # aplica

POR QUE ARCHIVAR Y NO BORRAR
----------------------------
El producto no borra obras: `DELETE /api/projects/<id>` hace
`UPDATE status='archived'`, y una obra archivada desaparece de la lista de
tarjetas -- que es exactamente el resultado que se busca. Ademas se deshace
desde `/api/projects/<id>/restaurar`.

Un `DELETE FROM projects` de verdad se llevaria por delante los documentos, los
permisos y la actividad que cuelgan de esa obra. La norma de la casa es no
purgar evidencia, y el 7-ago-2026 ya hubo un incidente con una obra archivada
sin saber quien.

ESTE SCRIPT NO CONTIENE NINGUN DELETE. A proposito.

CUIDADO CON delete_projects.py
------------------------------
Hay en el repositorio un `delete_projects.py` que ejecuta
`DELETE FROM projects WHERE name != 'PQT8_TALARA'`: borrado duro, sin
confirmacion y contra el .env de produccion. Se llevaria tambien
PQT8_INTERFERENCIAS, que es una de las dos que se conservan. No usarlo.
"""
import os
import sys

# LAS QUE SE QUEDAN. Cualquier obra que no este aqui se archiva.
CONSERVAR = {
    'PQT8_INTERFERENCIAS',
    'PQT8_TALARA',
}

APLICAR = '--confirmar' in sys.argv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
except ImportError:
    pass
from db import get_db_connection


def quien_la_creo(cursor, project_id):
    """Quien creo la obra, segun la auditoria.

    `projects` NO guarda el autor -- no hay columna. Lo unico que lo sabe es
    `auth_events`, donde el producto escribe `obra_creada` con el correo (ver
    routes/projects.py::_auditar).

    OJO CON EL SILENCIO: esa auditoria se anadio DESPUES del incidente del
    7-ago-2026, cuando alguien creo una obra y renombro PQT8_TALARA sin que se
    pudiera saber quien. Una obra SIN evento no es una obra sin autor: es una
    obra anterior al registro. Se muestra como «(sin registro)» y no como una
    acusacion a nadie.
    """
    try:
        cursor.execute(
            "SELECT email, creado_en FROM auth_events"
            "  WHERE evento = 'obra_creada' AND detalle LIKE %s"
            "  ORDER BY creado_en LIMIT 1",
            ('obra=%s%%' % project_id,))
        fila = cursor.fetchone()
        return (fila[0] or '?') if fila else None
    except Exception as e:
        # NO DEVOLVER None AQUI: se pintaria como «(sin registro)» y un fallo de
        # consulta pareceria un dato. Si la auditoria no se puede leer, que se
        # vea que no se pudo leer.
        conn = getattr(cursor, 'connection', None)
        if conn:
            conn.rollback()      # la transaccion queda abortada tras el error
        return '(auditoria ilegible: %s)' % ' '.join(str(e).split())[:40]


def cuantos_documentos(cursor, project_id, model_urn):
    """Cuantos documentos cuelgan de la obra. Red de seguridad: si una obra
    'de prueba' tiene cientos de ficheros, conviene verlo ANTES de archivarla."""
    try:
        cursor.execute(
            "SELECT COUNT(*) FROM file_nodes WHERE model_urn IN (%s, %s)",
            (project_id, model_urn or project_id))
        return cursor.fetchone()[0]
    except Exception:
        return None


def main():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, COALESCE(status, 'active'), created_at, model_urn"
            "  FROM projects ORDER BY created_at NULLS LAST, name")
        obras = cursor.fetchall()

        if not obras:
            print('No hay obras. Nada que hacer.')
            return 0

        # GUARDA: si un nombre a conservar no aparece, algo no cuadra --
        # renombrada, otra base de datos, un typo. Seguir seria archivarlo todo.
        nombres = {o[1] for o in obras}
        faltan = CONSERVAR - nombres
        if faltan:
            print('ABORTADO: no encuentro las obras a conservar: %s' % ', '.join(sorted(faltan)))
            print('Obras existentes: %s' % ', '.join(sorted(nombres)))
            return 1

        print('%-32s %-9s %-11s %-6s %-26s %s'
              % ('OBRA', 'ESTADO', 'CREADA', 'DOCS', 'CREADA POR', 'QUE PASA'))
        print('-' * 118)
        a_archivar = []
        for pid, nombre, estado, creada, urn in obras:
            docs = cuantos_documentos(cursor, pid, urn)
            if nombre in CONSERVAR:
                que = 'SE CONSERVA'
            elif estado == 'archived':
                que = 'ya archivada'
            else:
                que = 'SE ARCHIVA'
                a_archivar.append((pid, nombre, docs))
            autor = quien_la_creo(cursor, pid)
            print('%-32s %-9s %-11s %-6s %-26s %s' % (
                (nombre or '')[:32], estado,
                creada.strftime('%Y-%m-%d') if creada else '?',
                '?' if docs is None else docs,
                (autor or '(sin registro)')[:26], que))

        print('-' * 118)
        print('Total %d obras · se conservan %d · se archivan %d'
              % (len(obras), len(CONSERVAR), len(a_archivar)))

        con_docs = [x for x in a_archivar if x[2]]
        if con_docs:
            print('\nATENCION: estas «de prueba» tienen documentos dentro:')
            for _, nombre, docs in con_docs:
                print('   %-38s %s documento(s)' % (nombre[:38], docs))
            print('Archivar NO los borra -- siguen ahi y se recuperan al restaurar.')

        if not a_archivar:
            print('\nNada que archivar.')
            return 0

        if not APLICAR:
            print('\nEN SECO: no se ha tocado nada.')
            print('Para aplicarlo:  python archivar_obras_de_prueba.py --confirmar')
            return 0

        quien = os.environ.get('ECD_ACTOR') or 'script:archivar_obras_de_prueba'
        for pid, nombre, _docs in a_archivar:
            cursor.execute(
                "UPDATE projects SET status = 'archived' WHERE id = %s", (pid,))
            # El mismo rastro que deja el producto (routes/projects.py::_auditar).
            # Se escribe directo porque `registrar_evento` necesita una peticion
            # de Flask viva, y aqui no la hay: llamarlo fallaria en silencio.
            try:
                cursor.execute(
                    'INSERT INTO auth_events (evento, email, user_id, ip, user_agent, detalle)'
                    ' VALUES (%s, %s, %s, %s, %s, %s)',
                    ('obra_archivada', quien[:255], None, '', 'archivar_obras_de_prueba.py',
                     "obra=%s · nombre='%s' · limpieza de obras de prueba" % (pid, nombre)))
            except Exception as e:
                print('   (no se pudo auditar %s: %s)' % (nombre, e))
        conn.commit()

        print('\nArchivadas %d obras. Ninguna se ha borrado.' % len(a_archivar))
        print('Se deshace desde el portal o con POST /api/projects/<id>/restaurar')
        return 0


if __name__ == '__main__':
    sys.exit(main())
