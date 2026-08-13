"""Segundo factor: que la contrasena deje de ser lo unico que protege el expediente.

BASELINE 0 · C9. Estos tests fijan tres cosas:

1. La implementacion es TOTP DE VERDAD, no algo parecido. Se comprueba contra los
   vectores del RFC 6238: si el codigo no coincide con el que genera Google
   Authenticator, el segundo factor no sirve de nada porque nadie podra entrar.
2. Se admite deriva de reloj. Rechazar por dos segundos de desfase convierte el
   2FA en algo que la gente desactiva, y un control desactivado no protege.
3. La comparacion es en tiempo constante. Con seis cifras, filtrar por tiempo
   cuantas van acertadas reduce el espacio de busqueda de forma util.
"""
import base64
import time

import segundo_factor as dfa


# ── Vectores oficiales del RFC 6238 ────────────────────────────────────────
# Secreto '12345678901234567890' en base32. Si estos fallan, la implementacion no
# es compatible con ninguna aplicacion de autenticacion del mercado.
SECRETO_RFC = base64.b32encode(b'12345678901234567890').decode().rstrip('=')


def test_vectores_del_rfc_6238():
    for momento, esperado in [(59, '287082'), (1111111109, '081804'),
                              (1111111111, '050471'), (1234567890, '005924'),
                              (2000000000, '279037')]:
        assert dfa.codigo(SECRETO_RFC, momento) == esperado, f'falla en t={momento}'


def test_el_codigo_tiene_seis_cifras():
    c = dfa.codigo(dfa.secreto_nuevo())
    assert len(c) == dfa.DIGITOS and c.isdigit()


def test_el_codigo_cambia_con_el_intervalo():
    s = dfa.secreto_nuevo()
    assert dfa.codigo(s, 1000) != dfa.codigo(s, 1000 + dfa.INTERVALO)


def test_dos_secretos_dan_codigos_distintos():
    assert dfa.codigo(dfa.secreto_nuevo(), 1000) != dfa.codigo(dfa.secreto_nuevo(), 1000)


# ── La comprobacion ────────────────────────────────────────────────────────

def test_el_codigo_correcto_pasa():
    s = dfa.secreto_nuevo()
    assert dfa.comprobar(s, dfa.codigo(s)) is True


def test_admite_deriva_de_reloj():
    """Un intervalo arriba y otro abajo: los telefonos se desvian."""
    s = dfa.secreto_nuevo()
    ahora = time.time()
    assert dfa.comprobar(s, dfa.codigo(s, ahora - dfa.INTERVALO), ahora) is True
    assert dfa.comprobar(s, dfa.codigo(s, ahora + dfa.INTERVALO), ahora) is True


def test_no_admite_una_deriva_grande():
    """Aceptar codigos de hace cinco minutos alargaria la ventana de reuso."""
    s = dfa.secreto_nuevo()
    ahora = time.time()
    assert dfa.comprobar(s, dfa.codigo(s, ahora - 300), ahora) is False


def test_rechaza_lo_que_no_es_un_codigo():
    s = dfa.secreto_nuevo()
    for basura in ('', None, 'abcdef', '12345', '1234567', '   ', 'null'):
        assert dfa.comprobar(s, basura) is False


def test_sin_secreto_no_pasa_nada():
    assert dfa.comprobar(None, '123456') is False
    assert dfa.comprobar('', '123456') is False


def test_tolera_espacios_al_pegar_el_codigo():
    """Las aplicaciones lo muestran como '123 456' y la gente lo pega tal cual."""
    s = dfa.secreto_nuevo()
    c = dfa.codigo(s)
    assert dfa.comprobar(s, f'{c[:3]} {c[3:]}') is True


# ── El alta ────────────────────────────────────────────────────────────────

def test_la_uri_es_la_que_leen_las_aplicaciones():
    s = dfa.secreto_nuevo()
    uri = dfa.uri_de_provisionamiento(s, 'ana@obra.pe')
    assert uri.startswith('otpauth://totp/')
    assert f'secret={s}' in uri and 'digits=6' in uri and 'period=30' in uri
    assert 'ana%40obra.pe' in uri, 'el correo tiene que ir escapado'


def test_los_secretos_son_distintos_cada_vez():
    assert len({dfa.secreto_nuevo() for _ in range(50)}) == 50


# ── Codigos de recuperacion ────────────────────────────────────────────────

def test_hay_codigos_de_recuperacion_y_son_unicos():
    """Sin ellos, perder el telefono es perder la unica cuenta administradora."""
    c = dfa.codigos_de_recuperacion()
    assert len(c) == dfa.CODIGOS_RECUPERACION == len(set(c))


def test_los_de_recuperacion_se_guardan_hasheados():
    c = dfa.codigos_de_recuperacion()[0]
    h = dfa.huella_de_codigo(c)
    assert h != c and len(h) == 64
    assert dfa.huella_de_codigo(c.upper()) == h, 'no debe importar como lo teclee'


# ── A quien se le exige ────────────────────────────────────────────────────

def test_por_defecto_se_exige_al_administrador():
    assert dfa.exigido_para('admin') is True
    assert dfa.exigido_para('user') is False


def test_se_puede_endurecer_a_todos(monkeypatch):
    monkeypatch.setenv('EXIGIR_2FA', 'todos')
    assert dfa.exigido_para('user') is True


def test_no_se_puede_aflojar_por_debajo_de_admin(monkeypatch):
    """La cuenta que archiva obras es justo la que motivo este hallazgo."""
    for intento in ('ninguno', 'no', 'false', '', 'off'):
        monkeypatch.setenv('EXIGIR_2FA', intento)
        assert dfa.exigido_para('admin') is True, f'"{intento}" no puede eximir al admin'
