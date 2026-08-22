# -*- coding: utf-8 -*-
"""El candado que impide que `pytest` escriba en una base real.

POR QUE EXISTE
--------------
El 21-ago-2026, ejecutar `python -m pytest` desde la raiz del repositorio
inserto una fila en `photo_evidences` de la base REAL, sobre el alcance real
'1_CANAL'. No fue una prueba portandose mal: fue `test_tracking.py`, un GUION de
diagnostico que vive en la raiz con nombre de prueba y cuyo cuerpo se ejecuta al
IMPORTARSE. Recolectarlo basta -- la ejecucion ni siquiera llego a empezar,
porque aborto con errores de recoleccion.

Lo descubrio la comparacion de invariantes, no la suite.

QUE SE COMPRUEBA AQUI
---------------------
Que las dos puertas del `conftest.py` de la raiz SIGUEN PUESTAS, y que muerden.
Un candado que nadie comprueba se cae solo: es la leccion que este proyecto ya
ha pagado varias veces con controles que se describian por intencion.
"""
import os
import re

import pytest

_RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def _por_ruta(nombre, ruta):
    """Carga un conftest POR RUTA.

    `import conftest` no vale: con la raiz en `sys.path` resuelve al de la
    raiz, no al de la suite, y los dos existen y son distintos a proposito.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _conftest_de_la_suite():
    return _por_ruta('conftest_suite', os.path.join(os.path.dirname(__file__), 'conftest.py'))


def _conftest_raiz():
    ruta = os.path.join(_RAIZ, 'conftest.py')
    assert os.path.exists(ruta), 'falta el conftest.py de la raiz'
    with open(ruta, encoding='utf-8') as f:
        return f.read()


def test_la_suite_oficial_esta_declarada_y_es_la_unica():
    """`pytest` a secas tiene que mirar solo `backend/tests`."""
    ruta = os.path.join(_RAIZ, 'pytest.ini')
    assert os.path.exists(ruta), 'falta pytest.ini en la raiz'
    with open(ruta, encoding='utf-8') as f:
        cfg = f.read()
    assert re.search(r'^\s*testpaths\s*=\s*backend/tests\s*$', cfg, re.MULTILINE), \
        'pytest.ini ya no limita el descubrimiento a backend/tests'


def test_los_guiones_de_la_raiz_no_se_recolectan():
    """La primera puerta: `collect_ignore_glob` aparta los `test_*.py` sueltos."""
    s = _conftest_raiz()
    assert 'collect_ignore_glob' in s, 'se quito el filtro de recoleccion'
    assert "'test_*.py'" in s and "'backend/test_*.py'" in s, \
        'el filtro ya no cubre la raiz y backend/'


def test_el_guion_que_escribia_sigue_siendo_un_guion():
    """Si `test_tracking.py` dejara de estar apartado, esto tiene que saltar.

    No se comprueba que el fichero NO exista --puede seguir siendo util como
    guion-- sino que el candado lo alcanza.
    """
    guion = os.path.join(_RAIZ, 'test_tracking.py')
    if not os.path.exists(guion):
        pytest.skip('el guion ya no existe: alguien lo reclasifico, que es mejor')
    with open(guion, encoding='utf-8') as f:
        cuerpo = f.read()
    # Sigue siendo peligroso: escribe al importarse.
    assert 'INSERT INTO' in cuerpo or 'photo_evidences' in cuerpo
    # El conftest de la RAIZ se carga POR RUTA: importarlo por nombre solo
    # funcionaba si la raiz estaba en sys.path -- verdad a veces, segun desde
    # donde se lanzara pytest. Un test de higiene no puede ser el flaky.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'conftest_de_la_raiz', os.path.join(_RAIZ, 'conftest.py'))
    raiz = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(raiz)
    assert raiz._es_guion(guion), \
        'test_tracking.py ya no lo detecta el candado: volveria a escribir en la base'


def test_la_base_real_esta_fuera_del_alcance_de_pytest():
    """La segunda puerta: si `DB_NAME` no es de prueba, `db` no se puede abrir.

    Se comprueba el EFECTO, no que exista una funcion con buen nombre: se
    intenta abrir la base de verdad y tiene que reventar.
    """
    if _conftest_de_la_suite().es_base_de_prueba():
        pytest.skip('esta sesion apunta a una base de prueba: el candado no aplica')

    # Se comprueba en el DRIVER, que es donde esta el candado y donde ningun
    # `importlib.reload` de un modulo nuestro puede deshacerlo.
    import psycopg2
    with pytest.raises(RuntimeError) as e:
        psycopg2.connect(dsn='host=127.0.0.1 dbname=lo_que_sea')
    assert 'REAL' in str(e.value)

    # Y el efecto que le importa a quien escribe una prueba: abrir la base
    # desde la aplicacion tampoco funciona.
    import db
    with pytest.raises(Exception):
        with db.get_db_connection():
            pass


def test_una_base_de_prueba_si_se_reconoce():
    """Y el candado no puede quedarse cerrado para siempre: una base de prueba
    tiene que poder usarse, o las pruebas de integracion serian imposibles."""
    es_base_de_prueba = _conftest_de_la_suite().es_base_de_prueba
    previo = os.environ.get('DB_NAME')
    try:
        for nombre in ('ecd_test', 'ecd_ensayo', 'base_de_prueba', 'ECD_TEST'):
            os.environ['DB_NAME'] = nombre
            assert es_base_de_prueba(), '%s deberia valer como base de prueba' % nombre
        for nombre in ('ecd_dr12d', 'ecd_produccion', ''):
            os.environ['DB_NAME'] = nombre
            assert not es_base_de_prueba(), '%r NO es una base de prueba' % nombre
    finally:
        if previo is None:
            os.environ.pop('DB_NAME', None)
        else:
            os.environ['DB_NAME'] = previo
