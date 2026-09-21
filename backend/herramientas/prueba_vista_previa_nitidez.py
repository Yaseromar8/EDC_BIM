# -*- coding: utf-8 -*-
"""Prueba local de la VISTA PREVIA del lector, por el camino REAL del backend.

    backend/venv/Scripts/python.exe backend/herramientas/prueba_vista_previa_nitidez.py

No toca GCS ni la base: llama a las mismas funciones que usa `crear_vista_previa`
(`_rasterizar_pdf_de_fichero` + `_afinar_vista_previa` + el mismo JPEG) sobre los
PDF que hay en `PDF/`, y mide la imagen AL TAMANO EN QUE SE VE EN PANTALLA.

Que se mide, en la columna del cajetin (x 0,78-0,98 de la hoja):
  · tinta      % de pixeles mas oscuros que 64 (la linea que SE VE negra)
  · luminancia media (cuanto mas baja, menos palida)
  · gradiente  media del salto horizontal (cuanto mas alto, mas definido el borde)

La referencia es lo que dibuja pdf.js --el propio lector-- a esos mismos pixeles
(docs/archivos/14): lamina LS-004120 tinta 3,03 / lum 218,3 / grad 9,27.
"""
import io
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from PIL import Image, ImageChops, ImageStat        # noqa: E402
from gcs_manager import (PX_VISTA_PREVIA, CALIDAD_VISTA_PREVIA,   # noqa: E402
                         _rasterizar_pdf_de_fichero, _afinar_vista_previa)

CARPETA = os.path.join(os.path.dirname(__file__), '..', '..', 'PDF')
PANTALLA = 972          # lo que mide la hoja en la pantalla del propietario
ZONA = (0.78, 0.98, 0.05, 0.95)
REFERENCIA = {'500125-CSSP001-740-XX-DR-LS-004120.pdf': (3.03, 218.3, 9.27)}


def medir(img):
    """(tinta %, luminancia media, gradiente medio) de la columna del cajetin.

    Con PIL a secas: el backend no lleva numpy y esta prueba tiene que correr
    en SU entorno, no en otro.
    """
    w, h = img.size
    gris = img.convert('RGB').crop((int(w * ZONA[0]), int(h * ZONA[2]),
                                    int(w * ZONA[1]), int(h * ZONA[3]))).convert('L')
    n = gris.size[0] * gris.size[1]
    hist = gris.histogram()
    tinta = 100.0 * sum(hist[:64]) / n
    lum = ImageStat.Stat(gris).mean[0]
    izq = gris.crop((1, 0, gris.size[0], gris.size[1]))
    der = gris.crop((0, 0, gris.size[0] - 1, gris.size[1]))
    grad = ImageStat.Stat(ImageChops.difference(izq, der)).mean[0]
    grad = grad * (gris.size[0] - 1) / gris.size[0]     # el mismo reparto que en el informe
    return round(tinta, 2), round(lum, 1), round(grad, 2)


def vista_previa(ruta):
    """Lo mismo que hace `crear_vista_previa`, pero desde un fichero local."""
    t = time.perf_counter()
    imagen = _rasterizar_pdf_de_fichero(ruta, PX_VISTA_PREVIA)
    if imagen is None:
        return None, 0, 0
    imagen = _afinar_vista_previa(imagen)
    out = io.BytesIO()
    imagen.save(out, format='JPEG', quality=CALIDAD_VISTA_PREVIA, optimize=True)
    return (Image.open(io.BytesIO(out.getvalue())),
            round((time.perf_counter() - t) * 1000),
            round(len(out.getvalue()) / 1024))


def main():
    nombres = sys.argv[1:] or sorted(f for f in os.listdir(CARPETA) if f.lower().endswith('.pdf'))[:2]
    print('vista previa: %d px, calidad %d, enfoque %s\n' % (PX_VISTA_PREVIA, CALIDAD_VISTA_PREVIA,
                                                             __import__('gcs_manager').ENFOQUE_VISTA_PREVIA))
    print('%-46s %7s %6s %7s %7s %7s' % ('lamina', 'ms', 'KB', 'tinta', 'lum', 'grad'))
    for nombre in nombres:
        ruta = os.path.join(CARPETA, nombre)
        if not os.path.exists(ruta):
            print('%-46s  no esta en PDF/' % nombre[:46])
            continue
        img, ms, kb = vista_previa(ruta)
        if img is None:
            print('%-46s  no se pudo rasterizar' % nombre[:46])
            continue
        vista = img.resize((PANTALLA, round(PANTALLA * img.height / img.width)), Image.LANCZOS)
        tinta, lum, grad = medir(vista)
        print('%-46s %7d %6d %7.2f %7.1f %7.2f' % (nombre[:46], ms, kb, tinta, lum, grad))
        ref = REFERENCIA.get(nombre)
        if ref:
            print('%-46s %7s %6s %7.2f %7.1f %7.2f   <- el lector (pdf.js)' % ('', '', '', ref[0], ref[1], ref[2]))


if __name__ == '__main__':
    main()
