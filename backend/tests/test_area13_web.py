# -*- coding: utf-8 -*-
"""Tres agujeros del area 13 (seguridad web/API), la unica que faltaba por barrer.

Los tres se demostraron con peticiones reales el 13-ago-2026:

  1. el identificador de una vista compartida era la hora en milisegundos, y
     GET /api/views/<id> es publico: un anonimo sacaba nombre, obra y estado de
     camara de una vista ajena acertando 13 cifras derivadas del reloj;
  2. el correo de transmittal se componia concatenando HTML sin escapar, con
     destinatario libre: un enviador con la marca y el remitente verificado de
     la plataforma, hacia cualquier buzon, con el HTML que eligiera el emisor;
  3. /api/pins/upload no miraba tipo, tamano ni extension, y metia el projectId
     del formulario SIN SANEAR en el nombre del objeto del almacen.
"""
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _codigo(rel):
    texto = io.open(os.path.join(BACKEND, rel), encoding='utf-8').read()
    return '\n'.join(l for l in texto.splitlines() if not l.lstrip().startswith('#'))


# ── 1. El enlace compartido ────────────────────────────────────────────────

def test_el_identificador_de_una_vista_no_se_deriva_del_reloj():
    codigo = _codigo('routes/views.py')
    assert "int(time.time() * 1000)" not in codigo, (
        'el id vuelve a salir del reloj: es adivinable y ES la credencial')
    assert 'secrets.token_urlsafe' in codigo


def test_el_identificador_tiene_entropia_suficiente():
    import secrets
    # 24 bytes -> 32 caracteres en base64url. Un rango que no se recorre.
    assert len(secrets.token_urlsafe(24)) >= 30


# ── 2. El correo de transmittal ────────────────────────────────────────────

def test_el_correo_de_transmittal_escapa_lo_que_viene_de_fuera():
    codigo = _codigo('routes/transmittals.py')
    assert 'import html' in codigo and '_html.escape' in codigo, (
        'el nombre del documento y el mensaje libre entran en el HTML del correo')


def test_emitir_un_transmittal_tiene_limite():
    """Sin limite es un enviador de correo con remitente verificado."""
    codigo = _codigo('routes/transmittals.py')
    m = re.search(r"@transmittals_bp\.route\('/api/transmittals', methods=\['POST'\]\)\n(.*?)\ndef ",
                  codigo, re.S)
    assert m and '@limite' in m.group(1), 'create_transmittal sin @limite'


# ── 3. La subida de adjuntos ───────────────────────────────────────────────

def test_la_subida_de_adjuntos_valida_el_fichero():
    codigo = _codigo('routes/pins.py')
    cuerpo = codigo[codigo.index('def upload_pin_attachment('):]
    cuerpo = cuerpo[:cuerpo.index('\ndef ', 10)]
    assert 'validate_file' in cuerpo, 'entraba cualquier fichero, de cualquier tamano'


def test_el_identificador_de_obra_no_entra_crudo_en_la_ruta_del_objeto():
    """Llega del formulario: '../otra-obra' escribia fuera del prefijo propio."""
    codigo = _codigo('routes/pins.py')
    cuerpo = codigo[codigo.index('def upload_pin_attachment('):]
    cuerpo = cuerpo[:cuerpo.index('\ndef ', 10)]
    i_saneo = cuerpo.index('project_id = secure_filename')
    i_uso = cuerpo.index('multi-tenant/{project_id}')
    assert i_saneo < i_uso, 'el projectId se usa antes de sanearlo'
