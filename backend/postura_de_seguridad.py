# -*- coding: utf-8 -*-
"""Que postura de seguridad tiene ESTE proceso, mirando su propia configuracion.

EL PROBLEMA QUE RESUELVE
------------------------
Hasta ahora no habia forma de saber desde fuera si produccion tenia puestas sus
variables de seguridad. El middleware responde 401 a todo lo que no lleva sesion
-- tambien a una ruta inventada -- asi que sondear no distingue nada, y sin
credenciales no se puede entrar a mirar. La unica «verificacion» era abrir el
panel de Render y creerselo, que es el acuse de otro, no una prueba.

Eso convertia varios hallazgos en incomprobables: N3 (APP_SECRET/SESSION_PEPPER),
N4 (CORS), C8 (autorizacion transversal), N2/N6 (DDL en caliente). Se podian
arreglar, pero no demostrar.

QUE SE PUBLICA, Y QUE NO
------------------------
Publico: si la postura esta completa y CUANTOS puntos faltan. Nunca cuales, y
nunca ningun valor.

El detalle -- que punto concreto falla -- solo con sesion de administrador.

La diferencia importa. Decirle a cualquiera «falta SESSION_PEPPER» es darle un
mapa: sabe que las sesiones se firman con la constante por defecto, que ademas
esta en un repositorio publico. Decirle «faltan 3 de 6» le dice que hay trabajo
pendiente sin senalar por donde entrar, y a nosotros nos basta para verificar
que un cambio se aplico: el numero baja.
"""

import os


def _si(valor):
    return str(valor or '').strip().lower() in ('true', '1', 'yes', 'si', 'sí')


def _puesta(nombre, minimo=16):
    """La variable existe y no es un relleno. Se mira la LONGITUD, nunca el valor."""
    v = os.getenv(nombre) or ''
    return len(v.strip()) >= minimo


def puntos():
    """Cada punto: (clave, cumple, por que importa). Sin valores, nunca.

    El orden es el de la conversacion con el propietario, no el alfabetico: lo
    que primero rompe la confianza va arriba.
    """
    return [
        ('APP_SECRET', _puesta('APP_SECRET'),
         'firma los enlaces de invitacion, restablecimiento y verificacion'),
        ('SESSION_PEPPER', _puesta('SESSION_PEPPER'),
         'sin ella la pimienta efectiva es una constante publica del repositorio'),
        ('CORS_ORIGINS', bool((os.getenv('CORS_ORIGINS') or '').strip()),
         'sin ella el backend acepta peticiones de cualquier origen'),
        ('DDL_EN_CALIENTE_APAGADO', not _si(os.getenv('DDL_EN_CALIENTE', 'true')),
         'mientras este encendido la aplicacion puede alterar su propio esquema'),
        ('ENFORCE_PROJECT_AUTHZ', _si(os.getenv('ENFORCE_PROJECT_AUTHZ')),
         'el control transversal de acceso por obra'),
        ('AUTH_POLICY_MODE_ESTRICTO',
         (os.getenv('AUTH_POLICY_MODE') or 'sombra').strip().lower() != 'sombra',
         'en modo sombra los decoradores de rol no bloquean a nadie'),
    ]


def resumen_publico():
    """Lo que puede ver cualquiera: cuantos faltan, no cuales."""
    p = puntos()
    faltan = [x for x in p if not x[1]]
    return {'completa': not faltan, 'puntos': len(p), 'faltan': len(faltan)}


def detalle():
    """Solo para administrador: que punto concreto falla y por que importa."""
    return [{'punto': n, 'cumple': ok, 'por_que': razon} for n, ok, razon in puntos()]
