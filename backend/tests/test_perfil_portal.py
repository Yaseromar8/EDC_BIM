# -*- coding: utf-8 -*-
"""El perfil 'portal' sirve TODO lo que el portal usa, y nada del visor.

POR QUE EXISTE EL PERFIL
------------------------
El portal documental es lo que se ofrece a una entidad, y su perimetro auditable
no puede ser el de la plataforma entera. Medido: el portal y el visor solo
comparten /api/docs, /api/auth y /api/projects; todo lo demas del visor (civil,
inventario, 4D, comparador, IA) es superficie que una entidad pagaria en riesgo
sin usarla. Con DEPLOY_PROFILE=portal esos planos no se registran.

LAS DOS MITADES DE LA PROMESA
-----------------------------
1. COMPLETO: cada llamada que frontend-docs hace tiene su ruta en el perfil.
   Se mide contra el CODIGO del portal, no contra una lista escrita a mano --
   una lista a mano envejece, y este mismo dia se pago ese error dos veces.
2. RECORTADO: las familias del visor NO estan. Si vuelven a aparecer, el
   perimetro crecio sin que nadie lo decidiera.

El perfil se arranca en un SUBPROCESO: importar server.py dos veces con entornos
distintos en el mismo proceso deja estado a medias y miente.
"""
import io
import json
import os
import re
import subprocess
import sys

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAIZ = os.path.dirname(BACKEND)
PORTAL_SRC = os.path.join(RAIZ, 'frontend-docs', 'src')

# Familias que el perfil portal NO debe servir. Si una ruta de estas aparece,
# el recorte dejo de recortar.
# La lista ANTERIOR era demasiado estrecha: decia '/api/inventory/extract' en vez
# de '/api/inventory', y por eso no vio que el perfil portal seguia sirviendo el
# inventario entero. Lo encontro el simulacro de primera entidad probando el
# perimetro de verdad. Una lista de prohibiciones mal recortada es peor que no
# tenerla: da por vigilado lo que no lo esta.
DEL_VISOR = ('/api/lob', '/api/compare', '/api/inventory', '/api/geo',
             '/api/link', '/api/dashboards', '/api/civil',
             '/api/rfis', '/api/redlines', '/api/presupuesto', '/api/schedule',
             '/api/build', '/api/hubs', '/api/images/proxy')


def _rutas_del_perfil_portal():
    """Arranca el perfil en un subproceso y devuelve sus rutas."""
    codigo = (
        "import sys, json\n"
        "sys.path.insert(0, %r)\n"
        "import server\n"
        "print('RUTAS::' + json.dumps(sorted(str(r) for r in server.app.url_map.iter_rules())))\n"
    ) % BACKEND
    entorno = dict(os.environ)
    entorno['DEPLOY_PROFILE'] = 'portal'
    entorno.setdefault('APP_SECRET', 'x' * 32)
    r = subprocess.run([sys.executable, '-c', codigo], capture_output=True,
                       text=True, encoding='utf-8', errors='ignore',
                       cwd=BACKEND, env=entorno, timeout=300)
    for linea in (r.stdout or '').splitlines():
        if linea.startswith('RUTAS::'):
            return json.loads(linea[len('RUTAS::'):])
    raise AssertionError('el perfil portal no arranco:\n' + (r.stderr or '')[-1500:])


def _llamadas_del_portal():
    """Los prefijos /api/... literales que el codigo del portal construye."""
    llamadas = set()
    for raiz, _dirs, ficheros in os.walk(PORTAL_SRC):
        if 'node_modules' in raiz:
            continue
        for f in ficheros:
            if not f.endswith(('.jsx', '.js')):
                continue
            src = io.open(os.path.join(raiz, f), encoding='utf-8', errors='ignore').read()
            # hasta la primera interpolacion o cierre: el prefijo literal
            for m in re.finditer(r'/api/[A-Za-z0-9_/-]*', src):
                llamadas.add(m.group(0).rstrip('/'))
    return {c for c in llamadas if len(c) > len('/api/')}


@pytest.fixture(scope='module')
def rutas_portal():
    return _rutas_del_perfil_portal()


# Llamadas del portal que el perfil portal NO sirve A PROPOSITO. Una a una,
# con su motivo: sin motivo escrito esto seria una lista de tapaderas.
FUERA_DEL_PERFIL = {
    # El boton «publicar al visor». Publica un modelo del ECD al visor de
    # Autodesk -- pero en un despliegue solo-portal NO HAY visor al que
    # publicar: esa capacidad pertenece al producto visor. El boton respondera
    # 404 y su manejador de error lo dice; cuando una entidad contrate tambien
    # el visor, se despliega el perfil completo y el boton vuelve.
    '/api/modelos/publicar-desde-ecd',
}


def test_el_portal_no_pierde_ninguna_llamada(rutas_portal):
    texto_rutas = '\n'.join(rutas_portal)
    sin_servir = []
    for llamada in sorted(_llamadas_del_portal() - FUERA_DEL_PERFIL):
        # la llamada es un prefijo literal: basta con que alguna ruta lo lleve
        if llamada not in texto_rutas:
            sin_servir.append(llamada)
    assert not sin_servir, (
        'el portal llama a rutas que el perfil portal NO sirve -- desplegarlo '
        'asi romperia esas pantallas:\n  ' + '\n  '.join(sin_servir))


# Rutas del visor declaradas DIRECTAMENTE sobre la aplicacion (no en un
# blueprint): se registran pase lo que pase, asi que en el url_map aparecen
# siempre. A esas NO las puede juzgar la prueba del mapa -- las corta un
# before_request y por tanto solo se ven pidiendo. Las cubre, por
# comportamiento, test_las_rutas_del_visor_declaradas_sobre_la_app_no_se_sirven.
EN_EL_MAPA_PERO_CORTADAS = ('/api/inventory', '/api/civil/base-axis', '/api/build',
                            '/api/hubs', '/api/images/proxy', '/api/documents/link')


def test_el_perfil_portal_no_arrastra_al_visor(rutas_portal):
    de_mas = sorted({r for r in rutas_portal
                     if any(r.startswith(p) for p in DEL_VISOR)
                     and not any(r.startswith(c) for c in EN_EL_MAPA_PERO_CORTADAS)})
    assert not de_mas, (
        'el perfil portal sirve rutas del visor; el perimetro crecio sin que '
        'nadie lo decidiera:\n  ' + '\n  '.join(de_mas))


def test_el_recorte_es_real(rutas_portal):
    """Mas que un numero: si el recorte deja de recortar, esto lo dice."""
    assert len(rutas_portal) < 220, (
        'el perfil portal sirve %d rutas: eso ya no es un perimetro reducido'
        % len(rutas_portal))


def test_las_rutas_del_visor_declaradas_sobre_la_app_no_se_sirven():
    """Las que NO viven en un blueprint hay que probarlas por COMPORTAMIENTO.

    23 rutas estan declaradas directamente sobre la aplicacion en server.py, asi
    que se registran pase lo que pase con los blueprints: estan en el url_map
    incluso en perfil portal. El corte lo hace un before_request, y por tanto
    solo se ve pidiendo. El simulacro encontro asi que /api/inventory contestaba
    200 en una instancia «solo portal».
    """
    guion = '\n'.join([
        'import sys, json',
        'sys.path.insert(0, %r)' % BACKEND,
        'import server',
        'c = server.app.test_client()',
        "rutas = ['/api/inventory', '/api/hubs', '/api/civil/base-axis', '/api/images/proxy']",
        'res = {r: c.get(r).status_code for r in rutas}',
        "print('RES::' + json.dumps(res))",
    ])
    entorno = dict(os.environ)
    entorno['DEPLOY_PROFILE'] = 'portal'
    entorno.setdefault('APP_SECRET', 'x' * 32)
    r = subprocess.run([sys.executable, '-c', guion], capture_output=True, text=True,
                       encoding='utf-8', errors='ignore', cwd=BACKEND, env=entorno, timeout=300)
    linea = next((l for l in (r.stdout or '').splitlines() if l.startswith('RES::')), None)
    assert linea, 'no se pudo arrancar el perfil portal:\n' + (r.stderr or '')[-1200:]
    res = json.loads(linea[5:])
    servidas = [ruta for ruta, codigo_http in res.items() if codigo_http != 404]
    assert not servidas, (
        'el perfil portal SIRVE rutas del visor (deberian ser 404): '
        + ', '.join('%s->%s' % (r_, res[r_]) for r_ in servidas))
