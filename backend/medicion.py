"""Medición del tiempo de servidor por petición (docs/rendimiento/01 §H7, 20-oct-2026).

Sin esto no se podía saber, desde fuera, cuánto de cada petición es servidor y cuánto es red: el navegador
oculta los tiempos de otros dominios y View llama al backend desde otro dominio. Tres cosas, ninguna con datos:

- `Server-Timing: app;dur=<ms>` en cada respuesta: el navegador lo muestra en DevTools y en Resource Timing.
- `Timing-Allow-Origin` solo para los orígenes de CORS_ORIGINS (o `*` si CORS está abierto, como en desarrollo),
  para que esa medida y los tamaños sean visibles desde View y Docs.
- Una línea de registro por cada petición lenta (por defecto, más de 1500 ms; MEDICION_LENTO_MS), con la REGLA
  de la ruta y no la ruta concreta: nunca identificadores, consultas ni tokens.
"""
import logging
import os
import time

from flask import g, request

logger = logging.getLogger('medicion')

_LENTO_MS = float(os.getenv('MEDICION_LENTO_MS', '1500'))


def _origenes_permitidos():
    crudo = os.getenv('CORS_ORIGINS', '').strip()
    return None if not crudo else {o.strip() for o in crudo.split(',') if o.strip()}


def init_medicion(app):
    permitidos = _origenes_permitidos()

    @app.before_request
    def _medicion_inicio():
        g._medicion_t0 = time.perf_counter()

    @app.after_request
    def _medicion_fin(respuesta):
        t0 = getattr(g, '_medicion_t0', None)
        if t0 is None:
            return respuesta
        ms = (time.perf_counter() - t0) * 1000
        respuesta.headers['Server-Timing'] = f'app;dur={ms:.1f}'
        origen = request.headers.get('Origin')
        if permitidos is None:
            respuesta.headers['Timing-Allow-Origin'] = '*'
        elif origen and origen in permitidos:
            respuesta.headers['Timing-Allow-Origin'] = origen
            respuesta.headers.add('Vary', 'Origin')
        if ms >= _LENTO_MS and request.method != 'OPTIONS':
            regla = request.url_rule.rule if request.url_rule else '(sin ruta)'
            logger.warning('LENTO %s %s -> %s en %.0f ms', request.method, regla, respuesta.status_code, ms)
        return respuesta
