# -*- coding: utf-8 -*-
"""Producción tiene que poder decir su propia postura de seguridad.

EL PROBLEMA
-----------
No había forma de comprobar desde fuera si producción tenía puestas sus
variables de seguridad. El middleware responde 401 a todo lo que no lleva sesión
—también a una ruta inventada—, así que sondear no distingue nada, y sin
credenciales no se puede entrar a mirar. La única «verificación» era abrir el
panel de Render y creérselo: el acuse de otro, no una prueba.

Eso dejaba varios hallazgos incomprobables —N3, N4, C8, N2/N6—: se podían
arreglar y no se podían demostrar. Y un saneamiento que no se puede demostrar no
sirve para una reauditoría.

LA LÍNEA QUE NO SE CRUZA
------------------------
Público: si está completa y CUÁNTOS puntos faltan.
Con sesión de administrador: cuáles.

Decirle a cualquiera «falta SESSION_PEPPER» es darle un mapa —sabe que las
sesiones se firman con la constante por defecto, que además está en un
repositorio público—. Decirle «faltan 3 de 6» le dice que hay trabajo pendiente
sin señalar por dónde entrar, y a nosotros nos basta: cuando el número baje,
el cambio se aplicó.
"""
import importlib

import pytest

import postura_de_seguridad as ps

TODAS = {
    'APP_SECRET': 'x' * 40,
    'SESSION_PEPPER': 'y' * 40,
    'CORS_ORIGINS': 'https://portal.example',
    'DDL_EN_CALIENTE': 'false',
    'ENFORCE_PROJECT_AUTHZ': 'true',
    'AUTH_POLICY_MODE': 'estricto',
}


@pytest.fixture
def entorno(monkeypatch):
    for k in list(TODAS) + ['GIT_COMMIT', 'RENDER_GIT_COMMIT']:
        monkeypatch.delenv(k, raising=False)
    return monkeypatch


def _poner(mp, valores):
    for k, v in valores.items():
        mp.setenv(k, v)


# ── El recuento ───────────────────────────────────────────────────────────

def test_sin_nada_puesto_la_postura_no_esta_completa(entorno):
    r = ps.resumen_publico()
    assert r['completa'] is False
    assert r['faltan'] == r['puntos']


def test_con_todo_puesto_la_postura_esta_completa(entorno):
    _poner(entorno, TODAS)
    r = ps.resumen_publico()
    assert r['completa'] is True and r['faltan'] == 0


def test_cada_variable_que_se_pone_baja_el_contador(entorno):
    """Es lo que permite verificar desde fuera que un cambio se aplicó."""
    antes = ps.resumen_publico()['faltan']
    _poner(entorno, {'CORS_ORIGINS': 'https://portal.example'})
    assert ps.resumen_publico()['faltan'] == antes - 1


# ── Lo que cuenta como «puesto» ───────────────────────────────────────────

def test_un_secreto_corto_no_cuenta_como_puesto(entorno):
    """Poner `APP_SECRET=abc` para que deje de avisar sería peor que no
    ponerlo: la pantalla diría verde y la firma seguiría siendo trivial."""
    _poner(entorno, dict(TODAS, APP_SECRET='abc'))
    assert ps.resumen_publico()['completa'] is False


def test_el_DDL_en_caliente_cuenta_al_reves(entorno):
    """Aquí lo correcto es que esté APAGADO. Es el único punto invertido, y
    tratarlo como los demás daría por bueno justo lo contrario."""
    _poner(entorno, dict(TODAS, DDL_EN_CALIENTE='true'))
    assert ps.resumen_publico()['completa'] is False


def test_el_modo_sombra_no_cuenta_como_autorizacion(entorno):
    """En sombra los decoradores de rol no bloquean a nadie: es exactamente el
    fallo del `@requiere_rol('admin')` que no impedía archivar una obra."""
    _poner(entorno, dict(TODAS, AUTH_POLICY_MODE='sombra'))
    assert ps.resumen_publico()['completa'] is False


def test_por_defecto_el_DDL_se_considera_encendido(entorno):
    """Si la variable no existe vale `true`: dar por apagado lo que no consta
    es como se firman posturas que no son ciertas."""
    _poner(entorno, {k: v for k, v in TODAS.items() if k != 'DDL_EN_CALIENTE'})
    assert ps.resumen_publico()['completa'] is False


# ── Lo que NUNCA sale ─────────────────────────────────────────────────────

def test_el_resumen_publico_no_dice_QUE_falta(entorno):
    """Nombrar lo que falta es dar un mapa de por dónde entrar."""
    r = ps.resumen_publico()
    assert set(r) == {'completa', 'puntos', 'faltan'}


def test_no_se_publica_ningun_valor_en_ningun_sitio(entorno):
    """Con valores distinguibles: `'true'`/`'false'` colisionarían con los
    booleanos del propio JSON y darían un falso positivo."""
    import json
    marcados = dict(TODAS,
                    APP_SECRET='SECRETO-MARCADO-APP-' + 'z' * 20,
                    SESSION_PEPPER='SECRETO-MARCADO-PEPPER-' + 'w' * 20,
                    CORS_ORIGINS='https://marcado.example')
    _poner(entorno, marcados)
    texto = json.dumps(ps.resumen_publico()) + json.dumps(ps.detalle())
    for clave in ('APP_SECRET', 'SESSION_PEPPER', 'CORS_ORIGINS'):
        assert marcados[clave] not in texto, (
            'se está filtrando el valor de %s' % clave)


def test_el_detalle_dice_por_que_importa_cada_punto(entorno):
    """Una lista de nombres de variable no le dice a nadie qué se está jugando."""
    for d in ps.detalle():
        assert d['por_que'] and len(d['por_que']) > 20


# ── La ruta del detalle ───────────────────────────────────────────────────

def test_el_detalle_pide_sesion_de_administrador():
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'server.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def postura_de_seguridad_detallada'):]
    cuerpo = cuerpo[:cuerpo.index('\n@')]
    assert "u.get('role') != 'admin'" in cuerpo
    assert '401' in cuerpo and '403' in cuerpo


def test_el_latido_publica_el_recuento():
    """Es lo que permite verificar producción sin credenciales."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'server.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def health_check'):]
    cuerpo = cuerpo[:cuerpo.index('@app.route', 10)]
    assert 'resumen_publico()' in cuerpo
    assert 'detalle()' not in cuerpo, 'el latido es público: no puede llevar el detalle'
