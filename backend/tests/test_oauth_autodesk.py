"""El flujo OAuth con Autodesk no lo puede secuestrar un tercero.

Su callback CANJEA el 'code' y con el resultado SOBRESCRIBE la fila de
app_tokens: las credenciales ACC de TODA la plataforma. Sin proteccion, un
tercero completaba el flujo con SU cuenta de Autodesk y dejaba el backend
apuntando a la suya.

Hacen falta las DOS piezas, y por eso hay tests de las dos:
  1. el callback exige un 'state' que hayamos firmado nosotros, y
  2. la ruta que EMITE ese state exige rol admin.
Con solo la primera, cualquiera pedia un state valido y no servia de nada.
"""
import importlib

import pytest


@pytest.fixture
def firmas(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    import enlaces_firmados
    importlib.reload(enlaces_firmados)
    return enlaces_firmados


def test_el_state_es_de_su_propio_proposito(firmas):
    """Un token de otro proposito (una invitacion, un permiso de fichero) no
    puede reciclarse como state."""
    for otro in (firmas.PROPOSITO_INVITACION, firmas.PROPOSITO_RECURSO,
                 firmas.PROPOSITO_RESET):
        ajeno = firmas.emitir(otro, {'uid': 2})
        datos, _ = firmas.leer(firmas.PROPOSITO_OAUTH_APS, ajeno)
        assert datos is None


def test_un_state_inventado_no_cuela(firmas):
    datos, motivo = firmas.leer(firmas.PROPOSITO_OAUTH_APS, 'me-lo-invento')
    assert datos is None
    assert motivo == 'el enlace no es válido'


def test_el_state_caduca_pronto(firmas):
    """Entre pulsar 'conectar' y volver de Autodesk pasan segundos, no horas."""
    assert firmas.CADUCIDAD[firmas.PROPOSITO_OAUTH_APS] <= 900


def test_el_state_lleva_quien_inicio_el_flujo(firmas):
    token = firmas.emitir(firmas.PROPOSITO_OAUTH_APS, {'uid': 2, 'n': 'abc'})
    datos, _ = firmas.leer(firmas.PROPOSITO_OAUTH_APS, token)
    assert datos['uid'] == 2


def test_la_ruta_que_emite_el_state_no_es_publica():
    """Si /api/auth/aps/login quedara abierta, cualquiera obtendria un state
    valido y firmar el state no protegeria de nada."""
    import auth_middleware as am
    importlib.reload(am)
    assert '/api/auth/aps/login' not in am.PUBLIC_ENDPOINTS
    assert not am._abierto_por_prefijo('/api/auth/aps/login', 'GET')


def test_el_callback_si_debe_ser_alcanzable():
    """Lo invoca Autodesk tras el consentimiento: llega sin sesion por diseño."""
    import auth_middleware as am
    importlib.reload(am)
    assert am._abierto_por_prefijo('/api/auth/aps/callback', 'GET')
