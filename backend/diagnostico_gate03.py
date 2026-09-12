# -*- coding: utf-8 -*-
"""CRONOMETRO DE DIAGNOSTICO · TEMPORAL · GATE 03

QUE HACE Y POR QUE EXISTE
-------------------------
Mide, DESDE DENTRO del servidor, cuanto tarda cada etapa de crear, listar y
borrar. Nada mas. No decide, no cachea, no cambia ninguna respuesta.

Existe porque desde fuera no se puede saber: `POST /api/docs/folder` tarda 3,4 s
y el navegador solo ve un numero. Repartir ese numero contando consultas fue un
error --GATE 02 lo desmintio midiendo: una conexion entera cuesta ~5 ms-- asi
que ahora se cronometra en vez de deducirse.

SE RETIRA AL CERRAR GATE 03. Vive en su propio fichero y su propio commit para
que revertirlo sea borrar dos cosas, no pescar lineas sueltas.

QUE NO REGISTRA, A PROPOSITO
----------------------------
Ni usuario, ni correo, ni obra, ni ruta, ni nombre de carpeta o fichero, ni
tokens, ni cuerpos. Solo: endpoint, un identificador aleatorio de la medicion,
milisegundos por etapa y codigo HTTP. Un cronometro no necesita saber de quien
es el expediente.

POR QUE UNA CABECERA Y NO SOLO UN LOG
-------------------------------------
`Server-Timing` es la cabecera estandar para esto y el navegador la expone en
`PerformanceResourceTiming.serverTiming`. Asi la evidencia se recoge desde el
mismo sitio donde se provoca la operacion, sin depender de tener acceso al log
del servicio. La linea de log se emite igual, UNA sola vez al final: un `print`
por etapa mediria el coste de imprimir.
"""
import logging
import time
import uuid

logger = logging.getLogger(__name__)

# Los nombres viajan en una cabecera HTTP: deben ser tokens, sin espacios ni
# acentos. Se mantienen cortos porque la cabecera se lee entera de un vistazo.
_LIMPIO = str.maketrans('', '', ' \t\n\r"\',;=')


class Cronometro:
    """Marcas monotonicas en memoria. Una sola emision al final."""

    def __init__(self, endpoint):
        self.endpoint = endpoint
        self.id = uuid.uuid4().hex[:8]
        self._t0 = time.perf_counter()
        self._ultimo = self._t0
        self._etapas = []

    def marca(self, nombre):
        """Cierra la etapa que iba corriendo y abre la siguiente."""
        ahora = time.perf_counter()
        self._etapas.append((str(nombre).translate(_LIMPIO)[:24],
                             (ahora - self._ultimo) * 1000.0))
        self._ultimo = ahora

    def cabecera(self, status=None):
        """`Server-Timing` con cada etapa, el residual y el total.

        `otro` es el tiempo que transcurrio dentro de la peticion y NO cayo en
        ninguna etapa marcada. Es la casilla que importa: si sale grande, el
        coste esta en un sitio que todavia no hemos mirado.
        """
        total = (time.perf_counter() - self._t0) * 1000.0
        suma = sum(ms for _, ms in self._etapas)
        partes = ['%s;dur=%.1f' % (n, ms) for n, ms in self._etapas]
        partes.append('otro;dur=%.1f' % max(0.0, total - suma))
        partes.append('total;dur=%.1f' % total)
        if status is not None:
            partes.append('http%s;dur=0' % status)
        return ', '.join(partes), total


def emitir(respuesta, crono, status=None):
    """Adjunta la medicion a la respuesta y deja UNA linea en el log.

    Envuelto entero: un cronometro no puede tumbar una peticion. Si algo falla
    aqui, la respuesta sale tal cual y el diagnostico se pierde, que es el orden
    correcto de prioridades.
    """
    try:
        cabecera, total = crono.cabecera(status)
        try:
            respuesta.headers['Server-Timing'] = cabecera
            respuesta.headers['X-Diag-Id'] = crono.id
            # NO se toca `Access-Control-Expose-Headers`: lo gobierna flask-cors
            # y pisarlo desde aqui cambiaria lo que ven otros clientes. La
            # medicion se hace en el mismo origen (`alephia.com.pe/api/...`),
            # donde esa cabecera no hace falta.
        except Exception:
            pass
        logger.info('[gate03] %s id=%s status=%s total=%.1fms %s',
                    crono.endpoint, crono.id, status, total, cabecera)
    except Exception:
        pass
    return respuesta
