"""Enlaces firmados: invitacion, reset y verificacion.

Cubre el agujero de toma de cuenta: reclamar una invitacion pendiente exigia
solo CONOCER EL CORREO, y se heredaba el rol invitado (admin incluido).
"""
import pytest


@pytest.fixture(autouse=True)
def secreto(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba-no-usar-en-produccion')
    import enlaces_firmados
    return enlaces_firmados


def test_ida_y_vuelta(secreto):
    token = secreto.emitir(secreto.PROPOSITO_INVITACION, {'email': 'a@b.com', 'role': 'user'})
    datos, motivo = secreto.leer(secreto.PROPOSITO_INVITACION, token)
    assert motivo is None
    assert datos == {'email': 'a@b.com', 'role': 'user'}


def test_un_token_de_invitacion_no_sirve_para_resetear(secreto):
    """El proposito va en la firma: un token robado no cambia de funcion."""
    token = secreto.emitir(secreto.PROPOSITO_INVITACION, {'email': 'a@b.com'})
    datos, motivo = secreto.leer(secreto.PROPOSITO_RESET, token)
    assert datos is None
    assert motivo == 'el enlace no es válido'


def test_token_manipulado_se_rechaza(secreto):
    token = secreto.emitir(secreto.PROPOSITO_INVITACION, {'email': 'a@b.com', 'role': 'user'})
    manipulado = token[:-3] + ('aaa' if not token.endswith('aaa') else 'bbb')
    datos, motivo = secreto.leer(secreto.PROPOSITO_INVITACION, manipulado)
    assert datos is None
    assert motivo == 'el enlace no es válido'


def test_token_de_otro_secreto_se_rechaza(secreto, monkeypatch):
    token = secreto.emitir(secreto.PROPOSITO_INVITACION, {'email': 'a@b.com'})
    monkeypatch.setenv('APP_SECRET', 'otro-secreto-distinto')
    datos, _motivo = secreto.leer(secreto.PROPOSITO_INVITACION, token)
    assert datos is None


def test_sin_token_no_se_reclama(secreto):
    datos, motivo = secreto.leer(secreto.PROPOSITO_INVITACION, None)
    assert datos is None
    assert motivo == 'falta el token'


def test_token_caducado_se_rechaza(secreto, monkeypatch):
    monkeypatch.setitem(secreto.CADUCIDAD, secreto.PROPOSITO_RESET, -1)  # ya vencido
    token = secreto.emitir(secreto.PROPOSITO_RESET, {'email': 'a@b.com'})
    datos, motivo = secreto.leer(secreto.PROPOSITO_RESET, token)
    assert datos is None
    assert motivo == 'el enlace ha caducado'
