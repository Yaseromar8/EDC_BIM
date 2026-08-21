# -*- coding: utf-8 -*-
"""Que `pytest` no pueda escribir en una base de datos real por accidente.

DOS PUERTAS, PORQUE HACEN FALTA LAS DOS
---------------------------------------
1. NO RECOLECTAR GUIONES. En la raiz hay ~28 ficheros `test_*.py` que no son
   pruebas sino guiones de diagnostico, y su cuerpo se ejecuta AL IMPORTARSE.
   `test_tracking.py` carga el `.env` real y hace un INSERT en
   `photo_evidences` sobre el alcance real '1_CANAL'. RECOLECTARLO BASTA para
   que escriba, aunque la ejecucion se aborte despues -- que es exactamente lo
   que paso el 21-ago-2026 y lo descubrio la comparacion de invariantes.

2. FALLAR CERRADO SI LA BASE NO ES DE PRUEBA. Esa puerta vive en
   `backend/tests/conftest.py`, NO aqui, y no por gusto: cuando el objetivo es
   `backend/tests` --que es como se lanza la suite-- pytest NO carga este
   fichero, asi que una fixture puesta aqui no se ejecutaria nunca. Se
   comprobo, fallo, y por eso esta donde esta.

   La reparte asi: este fichero decide QUE SE RECOLECTA; el de la suite decide
   QUE PUEDE ABRIR una prueba.
"""
import os

import pytest

_RAIZ = os.path.dirname(os.path.abspath(__file__))
_SUITE = os.path.join(_RAIZ, 'backend', 'tests')

# ── Puerta 1: los guiones no se recolectan ────────────────────────────────

# DESCUBRIMIENTO: se apartan en silencio, para que `pytest` a secas siga
# corriendo la suite oficial en vez de reventar.
collect_ignore_glob = ['test_*.py', 'backend/test_*.py']


def _es_guion(ruta):
    """Un `test_*.py` que NO esta en la suite oficial."""
    ruta = os.path.abspath(str(ruta))
    if not os.path.basename(ruta).startswith('test_') or not ruta.endswith('.py'):
        return False
    try:
        return os.path.commonpath([ruta, _SUITE]) != _SUITE
    except ValueError:            # unidades distintas en Windows
        return True


def pytest_collect_file(file_path, parent):
    """Si alguien NOMBRA un guion expresamente, se le dice por que no.

    En el descubrimiento normal ya no llegan aqui --los aparta
    `collect_ignore_glob`--, asi que esto solo salta cuando la ruta viene en la
    linea de ordenes. Ahi callar seria peor: `pytest test_tracking.py` diria
    «no tests ran» y quien lo lanzo no sabria que acaba de esquivar un INSERT
    en la base real.
    """
    ruta = os.path.abspath(str(file_path))
    if not _es_guion(ruta):
        return None
    try:
        args = [os.path.abspath(a.split('::')[0]) for a in (parent.config.args or [])]
    except Exception:
        return None
    if ruta not in args:
        return None
    raise pytest.UsageError(
        '%s no es una prueba: es un guion de diagnostico, y su cuerpo se '
        'ejecuta al importarse (alguno escribe en la base configurada en '
        '.env). La suite oficial es `backend/tests`: '
        'python -m pytest backend/tests' % os.path.relpath(ruta, _RAIZ))
