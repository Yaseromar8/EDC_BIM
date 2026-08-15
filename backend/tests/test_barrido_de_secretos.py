# -*- coding: utf-8 -*-
"""El detector de secretos tiene que detectar. Con canario.

POR QUE ESTA PRUEBA EXISTE, Y NO ES UNA FORMALIDAD
---------------------------------------------------
Escribi el detector, lo pase por el repositorio, dijo «0 hallazgos» y estuve a
punto de darlo por bueno. Antes de eso metí una credencial de mentira a
proposito -- un canario -- y **tampoco la encontro**.

La causa: una edicion habia metido caracteres de retroceso (0x08) donde debian
ir los bordes de palabra del patron. El fichero se veia normal en pantalla,
compilaba sin quejarse, y el patron no casaba con NADA.

Un detector averiado no avisa de que esta averiado: responde «0 hallazgos», que
es justo lo que uno quiere leer. Es la misma familia que el `@requiere_rol` que
no bloqueaba y el modo estricto que no aislaba, pero peor, porque este vigila
precisamente lo que no se puede dejar escapar.

Por eso la prueba no comprueba que el barrido «corra»: comprueba que ENCUENTRA
lo que tiene que encontrar y que NO grita con lo que es inocente. Las dos mitades
importan -- un detector que grita siempre se acaba ignorando, que es otra forma
de no detectar.
"""
import io
import os
import subprocess
import sys

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BACKEND, 'herramientas'))

import barrido_de_secretos as bs  # noqa: E402


# ── El canario: tiene que cazarlo ─────────────────────────────────────────

@pytest.mark.parametrize('linea', [
    'password="clave123"',
    'PASSWORD = "otra_clave"',
    "client_secret: 'ab12cd34ef56'",
    'postgresql://admin:secreta99@localhost:5432/visor',
    'postgres://usuario:otraclave@10.0.0.1/base',
    'api_key="AKIAIOSFODNN7QWERTY9"',
])
def test_caza_lo_que_parece_una_credencial(linea):
    assert bs.analizar_texto(linea), 'no detecto: %s' % linea


def test_caza_una_clave_privada():
    assert bs.analizar_texto('-----BEGIN RSA PRIVATE KEY-----')


def test_caza_una_cuenta_de_servicio_de_google():
    assert bs.analizar_texto('  "type": "service_account",')


# ── Y NO tiene que gritar con lo inocente ─────────────────────────────────

@pytest.mark.parametrize('linea', [
    'password = os.getenv("DB_PASS")',
    'clave = os.environ.get("APP_SECRET")',
    'password="tu_clave_aqui"',
    'token = "<pon aqui tu token>"',
    'nombre = "documento_final.pdf"',
    "monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')",
    "PIMIENTA_POR_DEFECTO = 'sin-pimienta'",
    # Diccionario de traducciones del formulario de acceso: seis falsos
    # positivos de seis en la primera version. Un detector que solo da ruido se
    # deja de mirar, que es otra forma de no detectar.
    "password: 'Contrasena',",
    'password: "Password",',
    # Sustitucion de variable de psql: lo entrecomillado es el NOMBRE.
    "ALTER ROLE ecd_app WITH PASSWORD :'clave_app';",
])
def test_no_grita_con_lo_que_no_es_un_secreto(linea):
    assert not bs.analizar_texto(linea), 'falso positivo: %s' % linea


# ── Higiene del propio detector ───────────────────────────────────────────

def test_no_imprime_nunca_el_valor_encontrado():
    """Un detector que escribe el secreto en su salida lo reparte: acaba en un
    log, en una consola compartida o en un informe."""
    fuente = io.open(os.path.join(BACKEND, 'herramientas', 'barrido_de_secretos.py'),
                     encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def main'):]
    assert "m.group" not in cuerpo
    assert "x['huella']" in cuerpo


def test_el_fichero_no_tiene_caracteres_de_control():
    """Fue el fallo real: bytes 0x08 invisibles dentro de los patrones. No se
    ven al leer, compilan sin queja, y rompen el detector en silencio."""
    crudo = io.open(os.path.join(BACKEND, 'herramientas', 'barrido_de_secretos.py'),
                    encoding='utf-8').read()
    sospechosos = [c for c in crudo if ord(c) < 32 and c not in '\n\r\t']
    assert not sospechosos, ('el fichero lleva caracteres de control invisibles: %r'
                             % sorted({hex(ord(c)) for c in sospechosos}))


# ── El arbol publicado, hoy ───────────────────────────────────────────────

def test_el_arbol_publicado_no_lleva_secretos():
    """Se ejecuta de verdad contra lo que git tiene rastreado. Si alguien
    committea una credencial, esto se pone rojo antes de que llegue lejos."""
    if subprocess.run(['git', 'rev-parse', '--git-dir'],
                      cwd=bs.RAIZ, capture_output=True).returncode != 0:
        pytest.skip('no es un repositorio git')
    hallazgos = bs.barrer()
    assert not hallazgos, (
        'hay credenciales en el arbol publicado: '
        + ', '.join('%s:%d [%s]' % (h['fichero'], h['linea'], h['tipo'])
                    for h in hallazgos))
