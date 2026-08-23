# -*- coding: utf-8 -*-
"""Dos productos, un backend: los caminos que chocan.

`/api/hubs` está declarado DOS veces en este producto:

  · `routes/projects.py`  las MUNICIPALIDADES de la entidad, en nuestra base;
  · `server.py`           las CUENTAS de Autodesk (APS), para el visor.

`_ruta_del_visor` las separa solo cuando `DEPLOY_PROFILE=portal`. En
producción el perfil es `completo` —un backend sirve portal y visor—, así que
la de APS gana por orden de registro y el portal recibía cuentas de Autodesk
donde esperaba municipalidades: el desplegable de «Crear proyecto» salía
VACÍO y la obra nacía colgada del hub de respaldo.

MEDIDO el 23-ago-2026 creando la obra del piloto por la interfaz real. Ninguna
prueba de API podía verlo: por separado, cada ruta responde perfectamente.

Lo que se fija aquí es el remedio: el portal pide LO SUYO por un camino que no
puede chocar (`/api/portal/hubs`), y la pantalla no vuelve a llamar al camino
ambiguo.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.join(RAIZ, 'backend')
PORTAL = os.path.join(RAIZ, 'frontend-docs', 'src')


def _leer(*partes):
    return io.open(os.path.join(*partes), encoding='utf-8').read()


def test_el_portal_tiene_un_camino_propio_para_sus_municipalidades():
    rutas = _leer(BACKEND, 'routes', 'projects.py')
    assert "@projects_bp.route('/api/portal/hubs', methods=['GET'])" in rutas, (
        'el portal se quedó sin camino propio: volvería a chocar con la ruta '
        'APS del visor cuando DEPLOY_PROFILE=completo')


def test_la_pantalla_no_llama_al_camino_ambiguo():
    pantalla = _leer(PORTAL, 'pages', 'SecureProjectsPage.jsx')
    assert '/api/portal/hubs' in pantalla
    assert '${API}/api/hubs`' not in pantalla, (
        'la pantalla volvió a pedir /api/hubs: en producción eso devuelve '
        'cuentas de Autodesk y el desplegable se queda vacío')


def test_la_ruta_del_visor_sigue_existiendo_para_el_visor():
    """El remedio NO consiste en quitarle a Autodesk su ruta: el visor la
    necesita. Las dos conviven; lo que cambia es que el portal ya no depende
    de quién gane el sorteo."""
    servidor = _leer(BACKEND, 'server.py')
    assert "@_ruta_del_visor('/api/hubs')" in servidor


def test_el_mecanismo_de_separacion_sigue_documentado():
    """Si alguien retira `_ruta_del_visor` creyendo que ya no hace falta,
    volvería el 404 de agosto que dejó al portal sin proyectos."""
    servidor = _leer(BACKEND, 'server.py')
    assert 'def _ruta_del_visor' in servidor
    assert "PERFIL_DESPLIEGUE == 'portal'" in servidor
