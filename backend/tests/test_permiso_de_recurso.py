"""Permisos de lectura firmados para un fichero concreto.

Sustituyen al '?session_token=' que se incrustaba en los permalinks de las fotos
de obra. Aquello metia la sesion ENTERA -- reutilizable, de 7 dias y con todos
los permisos del usuario -- dentro de una URL que ademas se GUARDABA en la base
de datos y se compartia por WhatsApp: quien recibia la foto heredaba la cuenta.

Lo que estos tests fijan es la propiedad que lo hace seguro: el permiso abre UN
fichero y nada mas.
"""
import importlib

import pytest


@pytest.fixture
def firmas(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    import enlaces_firmados
    importlib.reload(enlaces_firmados)
    return enlaces_firmados


def test_el_permiso_solo_lleva_el_fichero(firmas):
    """Ni usuario, ni rol, ni obra: si se filtra, no dice nada de la cuenta."""
    token = firmas.emitir(firmas.PROPOSITO_RECURSO, {'r': 'urn-foto-buzon-17'})
    datos, motivo = firmas.leer(firmas.PROPOSITO_RECURSO, token)
    assert motivo is None
    assert datos == {'r': 'urn-foto-buzon-17'}


def test_un_permiso_no_vale_para_otro_proposito(firmas):
    """Que no se pueda reciclar como invitacion ni como reset."""
    token = firmas.emitir(firmas.PROPOSITO_RECURSO, {'r': 'urn-x'})
    for otro in (firmas.PROPOSITO_INVITACION, firmas.PROPOSITO_RESET):
        datos, _ = firmas.leer(otro, token)
        assert datos is None


def test_un_token_de_invitacion_no_abre_ficheros(firmas):
    token = firmas.emitir(firmas.PROPOSITO_INVITACION, {'r': 'urn-x', 'email': 'a@b.c'})
    datos, _ = firmas.leer(firmas.PROPOSITO_RECURSO, token)
    assert datos is None


def test_caduca(firmas, monkeypatch):
    """24 h: una foto compartida hace un mes no debe seguir abriendose."""
    monkeypatch.setitem(firmas.CADUCIDAD, firmas.PROPOSITO_RECURSO, -1)
    token = firmas.emitir(firmas.PROPOSITO_RECURSO, {'r': 'urn-x'})
    datos, motivo = firmas.leer(firmas.PROPOSITO_RECURSO, token)
    assert datos is None
    assert motivo == 'el enlace ha caducado'


def test_manipularlo_lo_invalida(firmas):
    token = firmas.emitir(firmas.PROPOSITO_RECURSO, {'r': 'urn-mio'})
    # Cambiar el recurso dentro del token sin volver a firmar
    manipulado = token[:-4] + ('aaaa' if not token.endswith('aaaa') else 'bbbb')
    datos, _ = firmas.leer(firmas.PROPOSITO_RECURSO, manipulado)
    assert datos is None


def test_la_caducidad_declarada_es_de_un_dia(firmas):
    """Si alguien la sube a semanas, que se vea en la revisión del cambio."""
    assert firmas.CADUCIDAD[firmas.PROPOSITO_RECURSO] == 24 * 3600
