# -*- coding: utf-8 -*-
"""El despliegue construye el esquema ANTES de levantar la aplicacion (N2).

EL HALLAZGO
-----------
`yarn start` -- que es lo que ejecuta Render -- lanzaba gunicorn directamente.
No habia ningun paso de migracion, asi que el esquema de produccion se construia
solo, en caliente, desde los propios manejadores HTTP: 237 sentencias de DDL, 8
de ellas en caminos de peticion, y un `CREATE TABLE sessions` en CADA login.

Eso no es un problema de rendimiento. Tiene dos consecuencias de fondo:

  1. Obliga a que la aplicacion sea DUEÑA de las tablas. Mientras el usuario de
     aplicacion pueda alterar el esquema no hay separacion de identidades: un
     propietario es indistinguible de un administrador. Es la raiz de C1, y de
     que el registro de auditoria sea alterable (C3).
  2. El esquema depende de que alguien entre por la ruta correcta. Una base
     recien restaurada se queda incompleta hasta que se usa, que es como se
     descubre tarde.

Yarn ejecuta `prestart` antes de `start`, asi que el orden real pasa a ser:

    prestart -> bootstrap_esquema.py    (construye/actualiza el esquema)
    start    -> gunicorn server:app     (levanta la aplicacion)

Esta prueba fija ese orden. No levanta nada: lee el manifiesto de arranque, que
es el unico sitio donde el orden esta escrito.
"""
import io
import json
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _scripts():
    ruta = os.path.join(BACKEND, 'package.json')
    return json.loads(io.open(ruta, encoding='utf-8').read()).get('scripts', {})


def test_el_arranque_construye_el_esquema_antes_de_servir():
    s = _scripts()
    assert 'prestart' in s, (
        'no hay paso de migracion: el esquema se construiria en caliente desde '
        'los manejadores, que es el hallazgo N2')
    assert 'bootstrap_esquema' in s['prestart']


def test_el_paso_previo_no_es_solo_una_comprobacion():
    """`--verificar` mira y no construye. Poner eso aqui daria la sensacion de
    tener migracion sin tenerla -- el mismo patron que el modo estricto de
    nomenclatura o el @requiere_rol que no bloqueaba a nadie."""
    assert '--verificar' not in _scripts().get('prestart', '')


def test_la_aplicacion_se_levanta_con_gunicorn_y_no_con_el_servidor_de_pruebas():
    s = _scripts()
    assert 'gunicorn' in s['start']
    assert 'server.py' not in s['start'], (
        'el servidor de desarrollo de Flask no sirve produccion')


def test_los_dos_pasos_usan_el_MISMO_interprete():
    """Si el bootstrap corriera con otro python que gunicorn, migraria un
    entorno y serviria otro -- y la diferencia solo se veria en produccion."""
    s = _scripts()
    assert s['prestart'].startswith('./venv/bin/'), s['prestart']
    assert s['start'].startswith('./venv/bin/'), s['start']


def test_esta_escrito_que_pasa_si_la_migracion_falla():
    """Quien despliega tiene que saber, ANTES, que un fallo aqui para el
    despliegue y deja sirviendo la version anterior. Si no lo sabe, el dia que
    ocurra lo va a leer como una caida."""
    doc = io.open(os.path.join(BACKEND, 'ARRANQUE.md'), encoding='utf-8').read()
    assert 'falla' in doc.lower()
    assert 'version anterior' in doc.lower() or 'versión anterior' in doc.lower()


def test_esta_escrito_que_falta_apagar_el_DDL_en_caliente():
    """Construir el esquema en el despliegue no cierra el agujero por si solo:
    mientras `DDL_EN_CALIENTE` no este en false, la aplicacion CONSERVA el
    permiso de tocar el esquema en caliente. Es media solucion, y decirlo evita
    darla por entera."""
    doc = io.open(os.path.join(BACKEND, 'ARRANQUE.md'), encoding='utf-8').read()
    assert 'DDL_EN_CALIENTE=false' in doc
