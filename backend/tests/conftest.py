# -*- coding: utf-8 -*-
"""Setup de la suite oficial del ECD.

DOS COSAS
---------
1. `backend/` en `sys.path`, para importar los modulos de la aplicacion.

2. LA BASE REAL QUEDA FUERA DE ALCANCE. Fail closed.

   Esta suite es DB-free: inyecta dobles donde tocaria la base. Y esta
   COMPROBADO, no supuesto -- `DB_NAME=no_existe_esta_base python -m pytest
   backend/tests` pasa las 876--. Pero sostenerlo hace falta: este mismo
   docstring ya afirmaba «los tests son DB-free» mientras ocho ficheros
   contenian INSERT/UPDATE/DELETE (contra dobles, si, pero nadie lo estaba
   verificando). Una afirmacion que nadie comprueba se cae sola.

   Asi que aqui el acceso real a la base se sustituye por uno que REVIENTA con
   un mensaje claro, salvo que `DB_NAME` identifique una base de prueba. Una
   prueba nueva que se olvide de inyectar su doble falla en voz alta en vez de
   escribir en el expediente de una obra.

   Ocurrio de verdad el 21-ago-2026, aunque por otra via: `pytest` desde la
   raiz recolecto `test_tracking.py` --un GUION con nombre de prueba-- y su
   cuerpo, que se ejecuta al importarse, escribio en `photo_evidences` de la
   base real. Esa via la cierra el `conftest.py` de la raiz; esta cierra la
   otra.

PRUEBAS DE INTEGRACION
----------------------
Apuntando a una base de prueba: `DB_NAME` que contenga `test`, `ensayo` o
`prueba`. Los ensayos de `backend/herramientas/` no pasan por aqui --no son
pytest-- y ya corren contra un cluster desechable.
"""
import os
import re
import sys

import pytest

# backend/ (un nivel arriba de tests/) al sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Una base "de prueba" se reconoce por el nombre. Es tosco a proposito: un
# criterio que hay que leer para entender no protege a nadie.
NOMBRE_DE_PRUEBA = re.compile(r'(test|ensayo|prueba)', re.IGNORECASE)


def es_base_de_prueba():
    return bool(NOMBRE_DE_PRUEBA.search(os.getenv('DB_NAME') or ''))


@pytest.fixture(autouse=True, scope='session')
def base_real_fuera_de_alcance():
    """Sustituye el acceso a la base por uno que revienta. Fail closed.

    No se toca nada si `DB_NAME` es una base de prueba: ahi una prueba de
    integracion puede conectarse con normalidad.
    """
    if es_base_de_prueba():
        yield
        return
    try:
        import psycopg2
    except Exception:
        yield              # sin driver no hay nada que proteger
        return

    def negado(*_a, **_k):
        raise RuntimeError(
            'Una prueba ha intentado abrir la base de datos REAL (DB_NAME=%r). '
            'La suite oficial es DB-free: inyecta un doble donde toque la base. '
            'Si necesitas PostgreSQL de verdad, apunta DB_NAME a una base de '
            'prueba (que contenga «test», «ensayo» o «prueba»).'
            % (os.getenv('DB_NAME') or ''))

    # SE PARCHEA EL DRIVER, NO `db`.
    #
    # La primera version sustituia `db.get_db_connection` y `db.init_db_pool`, y
    # `test_aislamiento_por_obra` hace `importlib.reload(db)`: el modulo volvia a
    # nacer con las funciones originales y el candado desaparecia a mitad de la
    # suite -- sin que nadie se enterara, porque el candado seguia «puesto» en el
    # fichero. Lo encontro la propia prueba guardiana.
    #
    # `psycopg2.connect` es el punto por el que pasa TODO --incluido el pool, que
    # lo llama por dentro-- y ningun `reload` de un modulo nuestro lo restaura.
    original = psycopg2.connect
    psycopg2.connect = negado
    try:
        yield
    finally:
        psycopg2.connect = original
