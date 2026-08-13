# -*- coding: utf-8 -*-
"""El interruptor que saca el DDL del tiempo de ejecucion.

POR QUE EXISTE
--------------
El backend construye su propio esquema en caliente: 237 sentencias DDL repartidas
por el codigo, de las cuales 101 salen de funciones invocadas DESDE handlers de
ruta. Son todas idempotentes (`IF NOT EXISTS`), asi que en una base ya creada no
hacen nada util: solo gastan una consulta por peticion.

El problema no es el gasto, es el PRIVILEGIO. Mientras la aplicacion pueda ejecutar
`ALTER TABLE`, necesita ser PROPIETARIA de las tablas, y una identidad propietaria
no se distingue de un administrador. Sin este interruptor, "usuario de aplicacion
con minimo privilegio" es imposible: habria que darle exactamente lo que hoy tiene
el superusuario, y la separacion seria de nombre.

QUE HACE
--------
Con DDL_EN_CALIENTE=false, las funciones de esquema decoradas devuelven sin tocar
la base. El esquema pasa a construirse en un paso PREVIO al despliegue, con la
identidad de migracion (ecd_migrator), y la aplicacion arranca contra un esquema ya
hecho, sin necesitar un solo permiso de DDL.

POR QUE NO SE BORRA EL CODIGO DDL
---------------------------------
Porque es el unico sitio donde vive la definicion del esquema, y esta probado. El
mismo codigo sirve de constructor cuando se le permite ejecutarse (bootstrap) y se
aparta cuando no (produccion). Borrarlo obligaria a reescribir 237 sentencias como
migraciones antes de poder separar identidades, y eso es un proyecto, no una
correccion de seguridad.

EL VALOR POR DEFECTO ES `true`, A PROPOSITO
-------------------------------------------
Quien no configure nada se comporta como hasta hoy. Un interruptor de seguridad que
rompe instalaciones existentes al desplegarse no llega a activarse nunca: se
revierte el mismo dia. Se apaga explicitamente donde ya se ha probado.
"""

import functools
import os

from app_logging import get_logger

logger = get_logger('esquema')

# Permite forzar el permiso dentro del proceso, sin tocar el entorno. Lo usa el
# bootstrap: es el unico que TIENE que poder ejecutar DDL, y pedirle que exporte
# una variable antes de importarse seria fragil.
_forzado = False


def ddl_permitido():
    """¿Se le permite a este proceso tocar el esquema?"""
    if _forzado:
        return True
    return os.getenv('DDL_EN_CALIENTE', 'true').strip().lower() in ('true', '1', 'yes', 'si')


class permitir_ddl:
    """Contexto que habilita el DDL. Solo para el bootstrap y las pruebas.

        with permitir_ddl():
            ensure_esquema_base()
    """

    def __enter__(self):
        global _forzado
        self._antes = _forzado
        _forzado = True
        return self

    def __exit__(self, *exc):
        global _forzado
        _forzado = self._antes
        return False


def solo_con_ddl(fn):
    """Decorador para una funcion que construye esquema.

    Con el DDL congelado no se ejecuta y devuelve None. Se registra a nivel DEBUG y
    no a nivel WARNING a proposito: en produccion esto va a ocurrir en cada
    peticion, y un aviso por peticion es ruido que acaba tapando lo importante.
    """
    @functools.wraps(fn)
    def envoltorio(*args, **kwargs):
        if not ddl_permitido():
            logger.debug(f"esquema congelado: se omite {fn.__name__}")
            return None
        return fn(*args, **kwargs)

    envoltorio._construye_esquema = True   # marca para el inventario del bootstrap
    return envoltorio
