"""La base no guarda tokens de sesion usables, solo su huella.

Antes, la tabla `sessions` guardaba el token EN CLARO. Un volcado de la base --
una copia de seguridad mal guardada, un acceso de lectura, una captura de un
cliente SQL -- era un pase de sesion para todas las cuentas a la vez, valido 7
dias. De hecho habia un script del propio repo (profiler_docs.py) que sacaba de
ahi una sesion ajena para usarla.
"""
import importlib

import pytest


@pytest.fixture
def am(monkeypatch):
    monkeypatch.setenv('SESSION_PEPPER', 'pimienta-de-prueba')
    import auth_middleware
    importlib.reload(auth_middleware)
    return auth_middleware


def test_la_huella_no_es_el_token(am):
    token = am.generate_session_token()
    assert am.hash_de_token(token) != token


def test_la_huella_es_estable(am):
    """Si no lo fuera, nadie podria validar su propia sesion."""
    token = am.generate_session_token()
    assert am.hash_de_token(token) == am.hash_de_token(token)


def test_dos_tokens_distintos_dan_huellas_distintas(am):
    assert am.hash_de_token(am.generate_session_token()) != am.hash_de_token(am.generate_session_token())


def test_sin_la_pimienta_no_se_recalcula_la_huella(am, monkeypatch):
    """La pimienta vive en el entorno, NO en la base: con el volcado solo no se
    pueden recalcular las huellas para buscar un token por fuerza bruta."""
    token = am.generate_session_token()
    original = am.hash_de_token(token)
    monkeypatch.setenv('SESSION_PEPPER', 'otra-pimienta-distinta')
    assert am.hash_de_token(token) != original


def test_el_token_sigue_teniendo_256_bits(am):
    """El hash no sustituye a la aleatoriedad: si el token fuera adivinable, la
    huella no salvaria nada."""
    token = am.generate_session_token()
    assert len(token) == 64          # 32 bytes en hexadecimal
    int(token, 16)                   # y es hexadecimal de verdad


def test_la_revocacion_no_tarda_un_minuto(am):
    """La cache es POR WORKER y gunicorn corre con 4: el TTL es lo que tarda una
    revocacion en surtir efecto en los demas. 60 s era demasiado justo cuando
    hay que echar a alguien con prisa."""
    assert am._SESSION_CACHE_TTL <= 15
