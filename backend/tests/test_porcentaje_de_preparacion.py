# -*- coding: utf-8 -*-
"""El porcentaje al abrir un CAD cuenta algo real (16-sep-2026).

QUE DIJO EL DUENO
-----------------
«al abrir el porcentaje tampoco es coherente». Y tenia razon: mientras el
fichero viajaba a Autodesk no habia manifiesto, y `/status` contestaba un `0%`
fijo durante TODO ese tramo --tres minutos y medio con el DWG de 260,3 MB-- para
saltar despues al 99% que informa Model Derivative. La barra no media nada; solo
corria el reloj. Encima el visor ya decia «Traduciendo el modelo…» cuando la
traduccion ni siquiera habia empezado.

QUE SE FIJA
-----------
- La subida por bloques avisa de cuantos lleva (`avisar(hechas, total)`), y eso
  se guarda en la version. Es el unico avance real de ese tramo.
- `/status` sin manifiesto devuelve `fase='subiendo'` y el porcentaje de bloques,
  para que el visor diga «Enviando el archivo a Autodesk…» y no otra cosa.
- Con un solo bloque no se inventa barra: se devuelve vacio y el visor gira.
- Contar el avance NUNCA puede tumbar una subida.

DB-free: se sustituyen la red y el guardado.
"""
import pytest

import routes.docs_cad as cad

MB = 1024 * 1024


class _Respuesta:
    def __init__(self, ok=True, cuerpo=None):
        self.ok = ok
        self.status_code = 200 if ok else 500
        self._cuerpo = cuerpo or {}
        self.text = ''

    def json(self):
        return self._cuerpo


# ── El porcentaje que se cuenta ───────────────────────────────────────────

def test_sin_datos_no_se_inventa_barra():
    assert cad._progreso_de_subida({}) == ''


def test_un_solo_bloque_no_tiene_nada_que_repartir():
    """Un DWG de 20 MB va en un PUT: una barra ahi seria decorado."""
    assert cad._progreso_de_subida({'bloques': 0, 'bloques_total': 1}) == ''


def test_cuenta_los_bloques_que_van():
    """El caso del dueno: 260,3 MB son tres bloques de 90 MB."""
    assert cad._progreso_de_subida({'bloques': 0, 'bloques_total': 3}) == '0%'
    assert cad._progreso_de_subida({'bloques': 1, 'bloques_total': 3}) == '33%'
    assert cad._progreso_de_subida({'bloques': 2, 'bloques_total': 3}) == '67%'


def test_no_llega_al_cien_hasta_que_autodesk_lo_acepta():
    """Subir el ultimo bloque no es terminar: queda el cierre y la traduccion."""
    assert cad._progreso_de_subida({'bloques': 3, 'bloques_total': 3}) == '99%'


# ── Quien lo cuenta: la subida por bloques ────────────────────────────────

@pytest.fixture
def red(monkeypatch):
    """La red de Autodesk, de mentira: tres bloques y un cierre que acepta."""
    monkeypatch.setattr(cad.requests, 'get',
                        lambda url, **kw: _Respuesta(True, {'urls': ['u1', 'u2', 'u3'],
                                                            'uploadKey': 'k'}))
    monkeypatch.setattr(cad.requests, 'put', lambda url, **kw: _Respuesta(True))
    monkeypatch.setattr(cad.requests, 'post',
                        lambda url, **kw: _Respuesta(True, {'objectId': 'urn:x'}))
    monkeypatch.setattr(cad.time, 'sleep', lambda s: None)


def _subir(avisar, tam=260 * MB):
    return cad._upload_to_oss('tok', 'bucket', 'clave', b'x' * 10, size=tam,
                              avisar=avisar)


def test_avisa_al_empezar_y_tras_cada_bloque(red):
    """Empezar tambien es noticia: hasta hoy el primer rastro llegaba al final."""
    pasos = []
    object_id, error = _subir(lambda hechas, total: pasos.append((hechas, total)))
    assert error is None and object_id == 'urn:x'
    assert pasos == [(0, 3), (1, 3), (2, 3), (3, 3)]


def test_un_fallo_al_contar_no_tumba_la_subida(red):
    """Guardar el avance toca la base: si eso falla, el fichero sigue subiendo."""
    def _explota(hechas, total):
        raise RuntimeError('base caida')
    object_id, error = _subir(_explota)
    assert error is None and object_id == 'urn:x'


def test_sin_quien_escuche_la_subida_va_igual(red):
    object_id, error = _subir(None)
    assert error is None and object_id == 'urn:x'


def test_un_bloque_que_falla_no_se_cuenta_como_hecho(red, monkeypatch):
    """La barra no puede avanzar por un bloque que Autodesk rechazo."""
    monkeypatch.setattr(cad.requests, 'put', lambda url, **kw: _Respuesta(False))
    pasos = []
    object_id, error = _subir(lambda hechas, total: pasos.append(hechas))
    assert object_id is None and error
    assert pasos == [0], 'solo el aviso de arranque, ningun bloque dado por bueno'
