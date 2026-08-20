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


# ── Un codigo TOTP no vale dos veces ───────────────────────────────────────

class _CursorFingido:
    """Lo minimo para `consumir()`: guarda el ultimo paso canjeado."""

    def __init__(self):
        self.ultimo = None
        self._devolver = None

    def execute(self, sql, args=()):
        if 'SELECT totp_ultimo_paso' in sql:
            self._devolver = (self.ultimo,)
        elif 'UPDATE users SET totp_ultimo_paso' in sql:
            self.ultimo = args[0]
            self._devolver = None

    def fetchone(self):
        return self._devolver


def test_el_mismo_codigo_no_se_canjea_dos_veces():
    """RFC 6238 §5.2: el verificador NO debe aceptar un segundo intento del
    codigo generado para la misma ventana de tiempo.

    Medido antes del arreglo: el mismo codigo entraba dos veces seguidas y las
    dos entregaban sesion. Importa porque el codigo VIAJA -- se lee en voz alta,
    se manda por WhatsApp al que esta en obra, se queda en el portapapeles.
    """
    import segundo_factor as dfa
    secreto = dfa.secreto_nuevo()
    cur = _CursorFingido()
    codigo = dfa.codigo(secreto)

    assert dfa.consumir(cur, 1, secreto, codigo) is True, 'el primer canje vale'
    assert dfa.consumir(cur, 1, secreto, codigo) is False, (
        'el SEGUNDO canje del mismo codigo tiene que fallar')


def test_no_vale_un_codigo_anterior_todavia_dentro_de_la_ventana():
    """La ventana de deriva admite el codigo del paso anterior. Si ya se canjeo
    uno mas nuevo, el viejo no puede volver a entrar por esa puerta."""
    import segundo_factor as dfa
    secreto = dfa.secreto_nuevo()
    cur = _CursorFingido()
    ahora = 1_600_000_000
    anterior = dfa.codigo(secreto, ahora - dfa.INTERVALO)

    assert dfa.consumir(cur, 1, secreto, dfa.codigo(secreto, ahora), momento=ahora) is True
    assert dfa.consumir(cur, 1, secreto, anterior, momento=ahora) is False, (
        'un codigo de un paso ya superado no puede canjearse'
    )


def test_comprobar_sigue_diciendo_si_sin_canjear():
    """`comprobar()` no toca la base: sirve para preguntar, no para canjear.
    Si alguien la usa donde deberia usar `consumir()`, esto no lo detecta -- lo
    detecta el test de endpoints. Aqui solo se fija el contrato."""
    import segundo_factor as dfa
    secreto = dfa.secreto_nuevo()
    c = dfa.codigo(secreto)
    assert dfa.comprobar(secreto, c) is True
    assert dfa.comprobar(secreto, c) is True


# ── El secreto TOTP, cifrado en reposo ────────────────────────────────────

def _con_clave(valor):
    import os
    os.environ['APP_SECRET'] = valor


def test_el_secreto_guardado_no_contiene_el_secreto():
    """Se guardaba EN CLARO en users.totp_secreto, y con el se generan codigos
    validos infinitos. Lo grave era por donde salia: LA COPIA DE SEGURIDAD lo
    llevaba dentro, y ese fichero se descarga, se guarda y se mueve.

    Medido el 20-ago-2026 sobre la copia real: antes aparecia el secreto tal
    cual; ahora solo la forma cifrada.
    """
    import os
    import segundo_factor as dfa
    antes = os.environ.get('APP_SECRET')
    try:
        _con_clave('una-clave-de-prueba-suficientemente-larga-0001')
        secreto = dfa.secreto_nuevo()
        guardado = dfa.cifrar_secreto(secreto)
        assert guardado.startswith('v1:')
        assert secreto not in guardado, 'el secreto no puede aparecer en lo guardado'
        assert dfa.descifrar_secreto(guardado) == secreto
    finally:
        if antes is None:
            os.environ.pop('APP_SECRET', None)
        else:
            os.environ['APP_SECRET'] = antes


def test_si_se_rota_la_clave_lo_DICE_en_vez_de_fallar_en_silencio():
    """Rotar APP_SECRET deja los secretos ilegibles. Eso ya paso con la pimienta
    y los codigos de recuperacion, y lo grave no fue perderlos: fue que el
    sistema seguia diciendo que estaban bien.

    «El codigo no vale» y «ya no puedo leer tu secreto» son cosas distintas y
    llevan a acciones distintas."""
    import os
    import segundo_factor as dfa
    antes = os.environ.get('APP_SECRET')
    try:
        _con_clave('clave-original-de-esta-instancia-000000001')
        guardado = dfa.cifrar_secreto(dfa.secreto_nuevo())
        _con_clave('clave-nueva-tras-una-rotacion-00000000002')
        try:
            dfa.descifrar_secreto(guardado)
            assert False, 'no deberia poder descifrarse con otra clave'
        except dfa.SecretoIlegible:
            pass
    finally:
        if antes is None:
            os.environ.pop('APP_SECRET', None)
        else:
            os.environ['APP_SECRET'] = antes


def test_los_secretos_anteriores_al_cifrado_se_siguen_leyendo():
    """Migrar no puede dejar fuera a quien ya tenia el 2FA puesto: su secreto
    esta en claro hasta que el bootstrap lo cifre, y mientras tanto tiene que
    seguir entrando."""
    import segundo_factor as dfa
    viejo = dfa.secreto_nuevo()          # tal cual, sin prefijo
    assert dfa.descifrar_secreto(viejo) == viejo


def test_sin_APP_SECRET_no_se_inventa_una_clave():
    """Sin clave no se puede cifrar. Lo que NO puede hacer es derivar una de la
    base --que es justo de lo que se protege-- ni romper el alta: se guarda como
    antes y se avisa."""
    import os
    import segundo_factor as dfa
    antes_a = os.environ.pop('APP_SECRET', None)
    antes_p = os.environ.pop('SESSION_PEPPER', None)
    try:
        assert dfa._clave_de_cifrado() is None
        secreto = dfa.secreto_nuevo()
        assert dfa.cifrar_secreto(secreto) == secreto
    finally:
        if antes_a is not None:
            os.environ['APP_SECRET'] = antes_a
        if antes_p is not None:
            os.environ['SESSION_PEPPER'] = antes_p
