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

Ahora `start` encadena las dos cosas:

    python bootstrap_esquema.py  &&  gunicorn server:app

Va encadenado y NO en un `prestart`: yarn 1 ejecuta los guiones `pre*`
automaticamente, yarn 2 y posteriores no. Dejarlo en `prestart` habria sido
escribir un paso de migracion que, segun la version de yarn que use Render,
podria no ejecutarse nunca -- y sin que nadie lo notara, porque el arranque
seguiria funcionando gracias al DDL en caliente. Exactamente el patron que este
trabajo viene persiguiendo.

Esta prueba fija ese orden. No levanta nada: lee el unico sitio donde el orden
esta escrito.
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
    assert 'bootstrap_esquema' in s['start'], (
        'no hay paso de migracion: el esquema se construiria en caliente desde '
        'los manejadores, que es el hallazgo N2')
    assert s['start'].index('bootstrap_esquema') < s['start'].index('gunicorn')


def test_va_encadenado_y_no_en_un_prestart():
    """Yarn 1 ejecuta los `pre*` automaticamente; yarn 2 y posteriores NO. En un
    `prestart`, el paso de migracion podria no ejecutarse nunca segun la version
    que use Render, y nadie se enteraria porque el DDL en caliente lo taparia."""
    s = _scripts()
    assert 'prestart' not in s
    assert '&&' in s['start'], 'sin && no hay garantia de orden ni de parada'


def test_el_paso_previo_no_es_solo_una_comprobacion():
    """`--verificar` mira y no construye. Poner eso aqui daria la sensacion de
    tener migracion sin tenerla -- el mismo patron que el modo estricto de
    nomenclatura o el @requiere_rol que no bloqueaba a nadie."""
    assert '--verificar' not in _scripts()['start']


def test_la_aplicacion_se_levanta_con_gunicorn_y_no_con_el_servidor_de_pruebas():
    s = _scripts()
    assert 'gunicorn' in s['start']
    assert 'server.py' not in s['start'], (
        'el servidor de desarrollo de Flask no sirve produccion')


def test_los_dos_pasos_usan_el_MISMO_interprete():
    """Si el bootstrap corriera con otro python que gunicorn, migraria un
    entorno y serviria otro -- y la diferencia solo se veria en produccion."""
    s = _scripts()
    assert s['start'].count('./venv/bin/') == 2, s['start']


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
