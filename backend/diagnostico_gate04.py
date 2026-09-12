# -*- coding: utf-8 -*-
"""CRONOMETRO DE CONEXION · TEMPORAL · GATE 04

QUE MIDE Y POR QUE
------------------
GATE 03 dejo siete etapas con un suelo comun de ~270 ms y unos escalones
(271 → 477 → 611 → 755 → 1025). De ahi salio un MODELO --«270 de conexion mas
200 por consulta»-- que NADIE ha demostrado. Este fichero existe para dejar de
modelar: cronometra por dentro el prestamo de conexion y las operaciones SQL
reales, una por una.

Regla que me impongo aqui, porque ya falle dos veces al darla por cumplida: se
reporta lo que marque el reloj. Si `pool.getconn()` sale en 2 ms y la guardia de
inventario en 267, se dice eso. Si sale al reves, se dice al reves. No se ajusta
ningun numero para que la suma cuadre con el total.

COMO ACUMULA
------------
Un acumulador por HILO --gunicorn usa `gthread`, cada peticion vive en el suyo--
que suma milisegundos por etiqueta y cuenta cuantas veces ocurrio cada una. Asi
una peticion que abre cinco conexiones da el total y el numero de veces, y el
coste unitario se obtiene dividiendo sin tener que inventarlo.

QUE NO REGISTRA
---------------
Ni usuario, ni obra, ni ruta, ni nombres, ni tokens, ni cuerpos. Solo etiquetas
tecnicas y milisegundos.

SE RETIRA AL CERRAR GATE 04.
"""
import threading
import time

_local = threading.local()


def reiniciar():
    """Arranca el acumulador de esta peticion."""
    _local.acc = {}


def anota(etiqueta, ms):
    """Suma una medicion. Nunca puede romper la peticion que la genera."""
    try:
        acc = getattr(_local, 'acc', None)
        if acc is None:
            return
        s, n = acc.get(etiqueta, (0.0, 0))
        acc[etiqueta] = (s + ms, n + 1)
    except Exception:
        pass


class Tramo:
    """`with Tramo('etiqueta'):` mide lo que haya dentro."""

    __slots__ = ('etiqueta', '_t')

    def __init__(self, etiqueta):
        self.etiqueta = etiqueta

    def __enter__(self):
        self._t = time.perf_counter()
        return self

    def __exit__(self, *exc):
        anota(self.etiqueta, (time.perf_counter() - self._t) * 1000.0)
        return False          # nunca traga excepciones


def cabecera():
    """`Server-Timing` con la suma y el numero de veces de cada etiqueta.

    `<etiqueta>` es el total acumulado en la peticion; `<etiqueta>_n` cuantas
    veces ocurrio. El coste unitario se divide, no se supone.
    """
    acc = getattr(_local, 'acc', None) or {}
    partes = []
    for etiqueta in sorted(acc):
        suma, veces = acc[etiqueta]
        partes.append('%s;dur=%.1f' % (etiqueta, suma))
        partes.append('%s_n;dur=%d' % (etiqueta, veces))
    return ', '.join(partes)
