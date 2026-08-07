"""Politica de contraseñas.

Hasta ahora habia TRES reglas distintas para lo mismo: el registro no validaba
nada en el servidor (solo que el campo viniera), cambiar la contraseña pedia 6
caracteres, y el minimo de 8 vivia unicamente en la pantalla — o sea que
llamando la API se creaba una cuenta con "a".
"""
import pytest

from password_policy import LARGO_MINIMO, validar


@pytest.mark.parametrize('password', [
    '', 'a', 'corta1', '123456789',                 # por debajo del minimo
    'aaaaaaaaaaaaaa',                               # un solo caracter
    'abababababab',                                 # dos caracteres alternos
    '1234567890123',                                # escalera de digitos
    'abcdefghijkl',                                 # escalera de letras
    'x' * 200,                                      # tan larga que el hash es un DoS
])
def test_rechaza_lo_indefendible(password):
    assert validar(password) is not None


@pytest.mark.parametrize('password', [
    'drenaje talara 2026',       # frase: larga y facil de recordar
    'buzon-pk617-canal',
    'MiClaveDeObra2026',
    'zanja profunda 3m',
])
def test_acepta_frases_razonables(password):
    assert validar(password) is None


def test_minimo_declarado_es_el_que_se_aplica():
    assert validar('a' * (LARGO_MINIMO - 1) + 'b') is not None
    assert validar('correcto-caballo-bateria') is None


def test_no_puede_ser_tu_propio_correo():
    assert validar('residenteobra2026', correo='residenteobra@contratista.com') is not None


def test_no_puede_contener_tu_nombre():
    assert validar('sanchez-2026-obra', nombre='Omar Sanchez') is not None
    assert validar('sanchez-2026-obra', nombre='Ana Torres') is None


def test_las_tildes_no_esconden_una_prohibida():
    """'contraseña' y 'contrasena' son la misma palabra para un atacante."""
    assert validar('contraseña') is not None
    assert validar('contrasena') is not None


def test_el_mensaje_dice_que_hacer():
    """Se le enseña al usuario: tiene que ser accionable, no un codigo."""
    mensaje = validar('corta')
    assert mensaje and str(LARGO_MINIMO) in mensaje
