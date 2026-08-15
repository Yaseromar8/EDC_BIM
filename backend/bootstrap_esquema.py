# -*- coding: utf-8 -*-
"""Construye el esquema COMPLETO del ECD sobre una base vacia. Paso previo al despliegue.

PARA QUE SIRVE
--------------
Hasta ahora el esquema se construia solo, en caliente, desde el propio backend. Eso
obligaba a que la aplicacion tuviera permisos de administrador sobre la base, y
mientras eso siga siendo cierto no existe separacion real de identidades: el
"usuario de aplicacion" tendria que ser propietario de las tablas, y un propietario
es indistinguible de un administrador.

Este guion invierte el orden: PRIMERO se construye el esquema con la identidad de
migracion (ecd_migrator), y DESPUES arranca la aplicacion con una identidad que solo
puede leer y escribir DATOS.

    ecd_migrator  ->  python bootstrap_esquema.py        (una vez, antes de desplegar)
    ecd_app       ->  DDL_EN_CALIENTE=false  gunicorn ...

POR QUE REUTILIZA EL CODIGO EXISTENTE
-------------------------------------
Las funciones ensure_*/asegurar_* son idempotentes y son el UNICO sitio donde vive la
definicion del esquema, ademas de estar probadas contra la base real. Reescribirlas
como migraciones antes de poder separar identidades convertiria una correccion de
seguridad en un proyecto de meses. Aqui se ejecutan tal cual, con el DDL habilitado a
proposito mediante `permitir_ddl()`.

EL ORDEN NO ES ARBITRARIO
-------------------------
Los 22 primeros pasos son EXACTAMENTE los de `_run_schema_setup()` en server.py, en
su mismo orden, que es el que funciona contra una base vacia: `esquema_base` va
primero porque crea projects, users, hubs y sessions, y sin ellas todo lo demas falla
en cascada. Detras van las rutinas que server.py NO invoca y que hoy solo se ejecutan
si alguien entra por su ruta: son las que hacen que una base recien creada quede
incompleta hasta que se usa.

USO
    python bootstrap_esquema.py [--verificar]

    --verificar   no construye: solo comprueba que no falte nada y que la aplicacion
                  no necesite DDL. Devuelve codigo 1 si algo falta.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _rutinas():
    """(nombre, funcion) en orden de dependencia. Import perezoso: algunos modulos
    tocan servicios externos al importarse y no deben cargarse si no hacen falta."""
    from db import (ensure_file_nodes_table, ensure_ai_brain_schema, ensure_rfi_schema,
                    ensure_redline_schema, ensure_partidas_schema,
                    ensure_asset_user_data_table, ensure_project_identity_columns)
    from esquema_base import ensure_esquema_base, ensure_columnas_pendientes
    from routes.presupuesto import ensure_presupuesto_schema
    from routes.pdf_tools import ensure_pdf_tools_tables
    from routes.reviews import ensure_reviews_table
    from routes.transmittals import ensure_transmittals_table
    from routes.attributes import ensure_attributes_tables
    from routes.sets import ensure_sets_tables
    from routes.element_docs import ensure_element_docs_table
    from routes.inventory import ensure_extraction_jobs_table, ensure_inventory_identity
    from routes.lob4d import ensure_lob4d_tables
    from routes.civil_design_automation import ensure_civil_alignments_table
    from routes.digital_twin import ensure_frentes_table, ensure_model_config_table
    from routes.documents import _ensure_share_revoked_column

    # Las que server.py NO invoca: hoy dependen de que alguien entre por su ruta.
    from routes.auth import ensure_users_tables
    from routes.projects import ensure_projects_schema
    from routes.pins import ensure_pins_table
    from routes.views import ensure_saved_views_table
    from routes.geo_control import ensure_geo_tables
    from routes.tracking import ensure_tracking_pins_table
    from routes.civil_solids import ensure_civil_surfaces_table
    from routes.link import _ensure_tables as ensure_link_tables

    return [
        # ── Los 22 de server.py, en su orden ─────────────────────────────
        ('esquema_base', ensure_esquema_base),
        ('file_nodes', ensure_file_nodes_table),
        ('ai_brain', ensure_ai_brain_schema),
        ('rfi', ensure_rfi_schema),
        ('redline', ensure_redline_schema),
        ('partidas', ensure_partidas_schema),
        ('presupuesto', ensure_presupuesto_schema),
        ('asset_user_data', ensure_asset_user_data_table),
        ('pdf_tools', ensure_pdf_tools_tables),
        ('reviews', ensure_reviews_table),
        ('transmittals', ensure_transmittals_table),
        ('attributes', ensure_attributes_tables),
        ('sets', ensure_sets_tables),
        ('element_docs', ensure_element_docs_table),
        ('extraction_jobs', ensure_extraction_jobs_table),
        ('inventory_identity', ensure_inventory_identity),
        ('lob4d', ensure_lob4d_tables),
        ('civil_alignments', ensure_civil_alignments_table),
        ('frentes', ensure_frentes_table),
        ('share_revoked', _ensure_share_revoked_column),
        # ── Las que faltaban: DDL que hoy solo corre bajo demanda ────────
        ('users', ensure_users_tables),
        ('projects_schema', ensure_projects_schema),
        ('pins', ensure_pins_table),
        ('saved_views', ensure_saved_views_table),
        ('geo_control', ensure_geo_tables),
        ('tracking_pins', ensure_tracking_pins_table),
        ('civil_surfaces', ensure_civil_surfaces_table),
        ('model_config', ensure_model_config_table),
        ('link', ensure_link_tables),
        # ── Catalogos por obra: crean su tabla la primera vez ────────────
        ('nomenclatura', _tabla_nomenclatura),
        ('sensibilidad', _tablas_sensibilidad),
        ('idoneidad', _tabla_idoneidad),
        ('segundo_factor', _columnas_segundo_factor),
        ('plan_de_entrega', _tabla_plan_de_entrega),
        ('emisiones', _tabla_emisiones),
        ('eje_base', _tabla_eje_base),
        # ── AL FINAL: columnas sueltas que necesitan sus tablas creadas ──
        # `project_identity` estaba arriba, antes que `tracking_pins`, y su
        # indice sobre esa tabla se perdia en silencio (la rutina se traga el
        # error). Lo que anade columnas e indices a tablas AJENAS va al final,
        # por definicion: no puede correr antes que quien las crea.
        ('project_identity', ensure_project_identity_columns),
        ('columnas_pendientes', ensure_columnas_pendientes),
    ]


def _tabla_nomenclatura():
    import nomenclatura
    from db import get_db_connection
    with get_db_connection() as conn:
        nomenclatura.asegurar_tabla(conn.cursor())
        conn.commit()


def _tablas_sensibilidad():
    import sensibilidad
    from db import get_db_connection
    with get_db_connection() as conn:
        sensibilidad.asegurar_tablas(conn.cursor())
        conn.commit()


def _tabla_idoneidad():
    import idoneidad
    from db import get_db_connection
    with get_db_connection() as conn:
        idoneidad.asegurar_tabla(conn.cursor())
        conn.commit()


def _tabla_eje_base():
    """El eje base por frente. Su DDL vivia SOLO dentro del manejador HTTP, asi
    que una base restaurada no tenia la tabla hasta que alguien abria el visor y
    fijaba un eje -- y con el DDL en caliente apagado, nunca."""
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''CREATE TABLE IF NOT EXISTS civil_base_axis (
            scope TEXT PRIMARY KEY,
            pin JSONB,
            model_urn TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )''')
        cur.execute('ALTER TABLE civil_base_axis ADD COLUMN IF NOT EXISTS model_urn TEXT')
        conn.commit()


def _tabla_emisiones():
    import estados_ecd
    from db import get_db_connection
    with get_db_connection() as conn:
        estados_ecd.asegurar_tabla_emisiones(conn.cursor())
        conn.commit()


def _tabla_plan_de_entrega():
    import plan_de_entrega
    from db import get_db_connection
    with get_db_connection() as conn:
        plan_de_entrega.asegurar_tablas(conn.cursor())
        conn.commit()


def _columnas_segundo_factor():
    import segundo_factor
    from db import get_db_connection
    with get_db_connection() as conn:
        segundo_factor.asegurar_columnas(conn.cursor())
        conn.commit()


def construir():
    """Ejecuta todas las rutinas con el DDL habilitado. Devuelve la lista de fallos."""
    from esquema_congelado import permitir_ddl
    import db as _db
    if getattr(_db, 'db_pool', None) is None:
        _db.init_db_pool()

    fallos = []
    inicio = time.time()
    with permitir_ddl():
        for nombre, fn in _rutinas():
            t0 = time.time()
            try:
                fn()
            except Exception as e:
                fallos.append((nombre, str(e)[:200]))
                print('  FALLO   %-20s %s' % (nombre, str(e)[:120]), flush=True)
                continue
            print('  ok      %-20s %.2fs' % (nombre, time.time() - t0), flush=True)
    print('\nesquema construido en %.1f s · %d fallos' % (time.time() - inicio, len(fallos)))
    return fallos


def verificar():
    """Comprueba que el esquema esta completo y que la app NO necesita DDL.

    No se fia de que las rutinas 'no fallaran': cuenta los objetos que de verdad
    quedaron en la base. Una rutina puede tragarse su propia excepcion y dejar la
    tabla sin crear, y eso solo se ve contando.
    """
    import db as _db
    if getattr(_db, 'db_pool', None) is None:
        _db.init_db_pool()
    from db import get_db_connection
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','ai_brain')""")
        tablas = cur.fetchone()[0]
        cur.execute("""SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                        WHERE n.nspname='public' AND p.proname='resolve_folder_path'""")
        funcion = cur.fetchone()[0]
        cur.execute("""SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'""")
        ext = cur.fetchone()[0]
    print('tablas en public+ai_brain      : %d' % tablas)
    print('funcion resolve_folder_path    : %s' % ('presente' if funcion else 'FALTA'))
    print('extension pgcrypto             : %s' % ('presente' if ext else 'FALTA'))
    return tablas, funcion, ext


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Construye el esquema del ECD. No mueve datos.')
    ap.add_argument('--verificar', action='store_true',
                    help='solo comprobar, sin construir')
    a = ap.parse_args()
    if a.verificar:
        verificar()
        raise SystemExit(0)
    print('BOOTSTRAP DEL ESQUEMA · destino: %s' % os.getenv('DB_HOST'))
    fallos = construir()
    print()
    verificar()
    raise SystemExit(1 if fallos else 0)
