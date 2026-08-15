# -*- coding: utf-8 -*-
"""El GPS de una foto de obra no puede viajar dentro del fichero.

AREA 15 · datos personales. Medido en el baseline: 6 de 6 fotografias de obra
muestreadas llevan coordenadas dentro del JPEG. Y no las usa nadie -- el portal
solo lee la fecha para ordenar, el backend solo la orientacion para girar la
miniatura.

Lo que convierte esto en dato personal no es la coordenada suelta, sino la
combinacion que ya esta en la misma fila: QUIEN subio la foto, CUANDO y DONDE
estaba. Eso situa a una persona identificada en un sitio y una hora concretos.

Y el problema es que viaja DENTRO de los bytes: una foto compartida por enlace,
adjunta a un transmittal o descargada por un subcontratista se lleva las
coordenadas puestas, fuera de cualquier permiso que el ECD sepa aplicar. Los
controles de acceso no alcanzan a un fichero que ya salio.
"""
import io
from fractions import Fraction

import pytest

import privacidad_imagen as pv

PIL = pytest.importorskip('PIL')


def _foto(con_gps=True, formato='JPEG'):
    from PIL import Image
    img = Image.new('RGB', (48, 36), (120, 140, 160))
    ex = Image.Exif()
    ex[271] = 'FabricanteX'
    ex[272] = 'ModeloY'
    ex[306] = '2026:08:15 09:30:00'
    if con_gps:
        # Talara, Piura: 4°34'12"S 81°16'30"W
        ex[34853] = {1: 'S', 2: (Fraction(4), Fraction(34), Fraction(12)),
                     3: 'W', 4: (Fraction(81), Fraction(16), Fraction(30))}
    buf = io.BytesIO()
    img.save(buf, format=formato, exif=ex.tobytes())
    return buf.getvalue()


# ── Lo que hay que quitar ─────────────────────────────────────────────────

def test_la_foto_limpia_ya_no_lleva_coordenadas():
    crudo = _foto()
    assert pv.lleva_ubicacion(crudo, 'obra.jpg') is True
    limpio, _ = pv.limpiar(crudo, 'obra.jpg')
    assert pv.lleva_ubicacion(limpio, 'obra.jpg') is False


def test_tampoco_lleva_el_modelo_del_telefono():
    """El fabricante y el modelo identifican el aparato, y con el a quien lo
    lleva. No hace falta para nada en un expediente."""
    limpio, _ = pv.limpiar(_foto(), 'obra.jpg')
    assert pv.leer_metadatos(limpio) == {}


# ── Lo que NO se puede perder ─────────────────────────────────────────────

def test_las_coordenadas_se_extraen_antes_de_borrarlas():
    """Borrarlas sin mas seria mas simple y perderia informacion util de un
    registro de obra: una foto situada se puede relacionar con una progresiva."""
    _limpio, meta = pv.limpiar(_foto(), 'obra.jpg')
    assert meta['latitud'] == pytest.approx(-4.57, abs=1e-4)
    assert meta['longitud'] == pytest.approx(-81.275, abs=1e-4)
    assert meta['tomada_en'] == '2026:08:15 09:30:00'


def test_el_hemisferio_sur_y_oeste_salen_negativos():
    """Talara esta en S y W. Ignorar la referencia pondria la obra en Rusia."""
    meta = pv.leer_metadatos(_foto())
    assert meta['latitud'] < 0 and meta['longitud'] < 0


def test_una_foto_sin_gps_no_inventa_coordenadas():
    _limpio, meta = pv.limpiar(_foto(con_gps=False), 'obra.jpg')
    assert 'latitud' not in meta and 'longitud' not in meta
    assert meta['tomada_en'] == '2026:08:15 09:30:00'


def test_la_imagen_sigue_siendo_legible_y_del_mismo_tamano():
    """Es evidencia de obra: se amplia para leer una regla o una fisura."""
    from PIL import Image
    limpio, _ = pv.limpiar(_foto(), 'obra.jpg')
    img = Image.open(io.BytesIO(limpio))
    assert img.size == (48, 36)
    assert pv.CALIDAD >= 90


# ── Lo que no se toca ─────────────────────────────────────────────────────

def test_un_documento_que_no_es_imagen_pasa_intacto():
    """Reescribir un PDF o un DWG «por si acaso» seria alterar un entregable."""
    datos = b'%PDF-1.4 contenido'
    salida, meta = pv.limpiar(datos, 'memoria.pdf')
    assert salida is datos and meta == {}


def test_si_no_se_puede_limpiar_se_sube_el_original():
    """Una foto que no se sube es una evidencia que se pierde y no se puede
    volver a tomar; una foto con EXIF es un riesgo que ya existia. No se cambia
    una perdida segura por un riesgo conocido."""
    roto = b'\xff\xd8\xff esto no es un JPEG entero'
    salida, _meta = pv.limpiar(roto, 'rota.jpg')
    assert salida == roto


# ── Que este puesto donde toca ────────────────────────────────────────────

def test_la_limpieza_va_ANTES_de_subir_al_almacen():
    """Si se subiera primero, el fichero con coordenadas ya estaria en el
    almacen y en el historial de versiones, y limpiarlo despues no lo quita de
    donde ya fue."""
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'tracking.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    # Solo el manejador que sube la foto: en el fichero hay otras subidas.
    cuerpo = fuente[fuente.index('def add_photo_to_pin'):]
    cuerpo = cuerpo[:cuerpo.index(chr(10) + 'def ', 1)]
    i = cuerpo.index('privacidad_imagen.limpiar')
    j = cuerpo.index('upload_file_to_gcs(file')   # la LLAMADA, no el import
    assert i < j, 'la foto se sube antes de quitarle el GPS'


def test_las_coordenadas_se_guardan_en_la_fila_de_la_foto():
    """El dato no se tira: pasa a donde el perimetro de obra ya manda."""
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'tracking.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert 'latitud DOUBLE PRECISION' in fuente
    assert "metadatos.get('latitud')" in fuente
