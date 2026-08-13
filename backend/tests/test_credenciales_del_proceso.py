# -*- coding: utf-8 -*-
"""Ningun modulo puede repartir credenciales de nube a todo el proceso.

QUE PASO
--------
`routes/ai.py` hacia esto al importarse:

    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = ".../gcp_sa.json"

Como `server.py` importa ese blueprint al arrancar, la variable quedaba puesta
para TODO el backend, y `gcs_manager.get_storage_client()` la lee de ahi. El
entorno de desarrollo apuntaba a proposito a un fichero inexistente para no
poder tocar el almacen de produccion, y al importar la aplicacion la variable
volvia a apuntar a la clave real: `storage.Client()` se autenticaba como
`visor-backend@...` y el bucket de produccion quedaba escribible desde local.

Medido el 13-ago-2026. La comprobacion anterior, que dio el hallazgo N5 por
cerrado, se hizo con un guion suelto que no importaba la aplicacion y por eso
no lo vio. Esta prueba existe para que no vuelva a colarse por ese hueco.

COMO SE HACE BIEN
-----------------
Cargar la credencial en un objeto y pasarsela al cliente que la necesita
(`vertexai.init(credentials=...)`). Lo que un modulo necesite para si mismo no
tiene por que heredarlo el resto del proceso.
"""
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Variables cuyo valor concede acceso a un servicio externo.
VARIABLES = ('GOOGLE_APPLICATION_CREDENTIALS', 'AWS_ACCESS_KEY_ID',
             'AWS_SECRET_ACCESS_KEY', 'AZURE_CLIENT_SECRET')

# Unica excepcion: gcs_manager NORMALIZA a ruta absoluta un valor que YA existe.
# No concede acceso nuevo -- resuelve el que el entorno ya declaro.
PERMITIDOS = {'gcs_manager.py'}

CARPETAS = ('', 'routes')
ASIGNACION = re.compile(
    r"""os\.environ\s*\[\s*['"](%s)['"]\s*\]\s*=""" % '|'.join(VARIABLES))
ASIGNACION_SETDEFAULT = re.compile(
    r"""os\.environ\.setdefault\s*\(\s*['"](%s)['"]""" % '|'.join(VARIABLES))


def _ficheros():
    for carpeta in CARPETAS:
        raiz = os.path.join(BACKEND, carpeta) if carpeta else BACKEND
        for nombre in sorted(os.listdir(raiz)):
            if nombre.endswith('.py') and nombre not in PERMITIDOS:
                yield os.path.join(carpeta, nombre), os.path.join(raiz, nombre)


def test_ningun_modulo_pone_credenciales_de_nube_en_el_entorno():
    culpables = []
    for relativo, ruta in _ficheros():
        with open(ruta, encoding='utf-8', errors='ignore') as f:
            for n, linea in enumerate(f, 1):
                if linea.lstrip().startswith('#'):
                    continue
                if ASIGNACION.search(linea) or ASIGNACION_SETDEFAULT.search(linea):
                    culpables.append(f'{relativo}:{n}')
    assert not culpables, (
        'estos modulos reparten credenciales de nube a todo el proceso:\n  '
        + '\n  '.join(culpables)
        + '\nCargalas en un objeto y pasaselas al cliente que las necesita.')


def test_la_ia_carga_su_credencial_sin_tocar_el_entorno():
    """Regresion concreta sobre routes/ai.py."""
    with open(os.path.join(BACKEND, 'routes', 'ai.py'), encoding='utf-8') as f:
        fuente = f.read()
    codigo = '\n'.join(l for l in fuente.splitlines() if not l.lstrip().startswith('#'))
    assert 'from_service_account_file' in codigo, 'la IA debe cargar la clave en un objeto'
    assert 'credentials=_CREDENCIALES_IA' in codigo, 'y pasarsela a Vertex explicitamente'
    assert 'os.environ["GOOGLE_APPLICATION_CREDENTIALS"]' not in codigo


def test_no_quedan_rutas_de_otra_maquina_en_el_codigo():
    """Habia una ruta absoluta al escritorio de otro usuario en la lista de
    busqueda de la clave. Buscar credenciales por rutas ajenas no es un fallo
    de estilo: es un sitio mas donde una clave puede aparecer sin querer."""
    with open(os.path.join(BACKEND, 'routes', 'ai.py'), encoding='utf-8') as f:
        fuente = f.read()
    assert 'c:/Users/omars' not in fuente.lower()
