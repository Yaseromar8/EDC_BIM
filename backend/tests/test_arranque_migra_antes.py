# -*- coding: utf-8 -*-
"""Migracion y runtime usan identidades realmente separadas (N2/N6).

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

Ahora hay dos comandos y dos identidades:

    yarn migrate  -> bootstrap con ecd_migrator
    yarn start    -> verificar + gunicorn con ecd_app

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
import pytest
import json
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _scripts():
    ruta = os.path.join(BACKEND, 'package.json')
    return json.loads(io.open(ruta, encoding='utf-8').read()).get('scripts', {})


def test_hay_un_comando_explicito_de_migracion():
    s = _scripts()
    assert 'migrate' in s
    assert 'bootstrap_esquema' in s['migrate']
    assert '--verificar' not in s['migrate']


def test_convergencia_administrativa_no_es_el_arranque_normal():
    s = _scripts()
    assert 'converge:ownership' in s
    assert 'converger_propiedad.py' in s['converge:ownership']
    assert 'converge:ownership' not in s['start']
    assert 'converge:ownership' not in s['migrate']


def test_runtime_solo_verifica_y_no_construye():
    """La credencial del migrador no puede vivir en el proceso web. El runtime
    comprueba el resultado, pero nunca ejecuta el bootstrap constructor."""
    s = _scripts()
    assert 'prestart' not in s
    assert 'bootstrap_esquema.py --verificar' in s['start']
    assert '&&' in s['start'], 'sin && no hay garantia de orden ni de parada'


def test_la_verificacion_ocurre_antes_de_gunicorn():
    s = _scripts()['start']
    assert s.index('bootstrap_esquema.py --verificar') < s.index('gunicorn')


def test_la_aplicacion_se_levanta_con_gunicorn_y_no_con_el_servidor_de_pruebas():
    s = _scripts()
    assert 'gunicorn' in s['start']
    assert 'server.py' not in s['start'], (
        'el servidor de desarrollo de Flask no sirve produccion')


def test_cada_comando_usa_el_entorno_del_backend():
    s = _scripts()
    assert s['start'].count('./venv/bin/') == 2, s['start']
    assert s['migrate'].count('./venv/bin/') == 1, s['migrate']


def test_esta_escrito_que_pasa_si_la_migracion_falla():
    """Quien despliega tiene que saber, ANTES, que un fallo aqui para el
    despliegue y deja sirviendo la version anterior. Si no lo sabe, el dia que
    ocurra lo va a leer como una caida."""
    doc = io.open(os.path.join(BACKEND, 'ARRANQUE.md'), encoding='utf-8').read()
    assert 'falla' in doc.lower()
    assert 'version anterior' in doc.lower() or 'versión anterior' in doc.lower()


def test_esta_escrita_la_separacion_y_el_ddl_congelado():
    doc = io.open(os.path.join(BACKEND, 'ARRANQUE.md'), encoding='utf-8').read()
    assert 'DDL_EN_CALIENTE=false' in doc
    assert 'DB_USER=ecd_migrator' in doc
    assert 'DB_USER=ecd_app' in doc
    assert 'no se declara en el servicio web' in doc


def test_bootstrap_constructor_exige_migrador_antes_de_construir():
    """El orden: se comprueba la identidad ANTES de la primera sentencia DDL."""
    fuente = io.open(os.path.join(BACKEND, 'bootstrap_esquema.py'),
                     encoding='utf-8').read()
    main = fuente.split("if __name__ == '__main__':", 1)[1]
    assert main.index('exigir_identidad_migrador()') < main.index('construir()')


def _bootstrap_con_usuario(monkeypatch, usuario):
    """Carga el bootstrap con una base falsa que autentica como `usuario`."""
    import importlib
    import db as _db
    import bootstrap_esquema as bs

    class Cur:
        def execute(self, *a, **k): pass
        def fetchone(self): return (usuario,)

    class Conn:
        def cursor(self): return Cur()
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(_db, 'db_pool', object(), raising=False)
    monkeypatch.setattr(_db, 'get_db_connection', lambda: Conn())
    return importlib.reload(bs)


def test_una_identidad_no_declarada_se_rechaza(monkeypatch):
    """SE COMPRUEBA EL EFECTO, no que el fichero contenga cierto texto.

    La version anterior de esta prueba afirmaba `"actual != 'ecd_migrator'" in
    fuente`. Cuando el nombre del rol paso a ser declarable --porque produccion
    no tiene `ecd_migrator` y el candado dejaba la base sin forma de migrar--,
    la prueba fallo sin que hubiera nada roto: medía la forma del codigo, no lo
    que el codigo hace.
    """
    monkeypatch.delenv('ROL_MIGRADOR', raising=False)
    bs = _bootstrap_con_usuario(monkeypatch, 'postgres')
    assert bs.ROL_MIGRADOR == 'ecd_migrator'      # el defecto no se afloja
    with pytest.raises(RuntimeError) as e:
        bs.exigir_identidad_migrador()
    assert 'postgres' in str(e.value) and 'ROL_MIGRADOR' in str(e.value),         'el rechazo tiene que decir COMO declararlo, o deja la base bloqueada'


def test_el_rol_de_migracion_se_puede_declarar(monkeypatch):
    """Y declararlo funciona: es la salida de una instancia sin identidades
    separadas. No es silenciosa -- avisa en cada construccion."""
    monkeypatch.setenv('ROL_MIGRADOR', 'postgres')
    bs = _bootstrap_con_usuario(monkeypatch, 'postgres')
    assert bs.ROL_MIGRADOR == 'postgres'
    bs.exigir_identidad_migrador()                # no levanta

    # Y si NO coincide, sigue rechazando: declarar no es desactivar.
    bs2 = _bootstrap_con_usuario(monkeypatch, 'otro_usuario')
    with pytest.raises(RuntimeError):
        bs2.exigir_identidad_migrador()


def test_migracion_aplica_grants_de_datos_al_final():
    fuente = io.open(os.path.join(BACKEND, 'bootstrap_esquema.py'),
                     encoding='utf-8').read()
    assert "'03_grants_ida.sql'" in fuente
    assert 'aplicar_grants_aplicacion()' in fuente
    assert 'if completo and not grants_ok' in fuente


def test_documenta_la_convergencia_unica_de_propiedad():
    doc = io.open(os.path.join(BACKEND, 'ARRANQUE.md'), encoding='utf-8').read()
    assert '05_convergencia_propiedad.sql' in doc
    assert doc.index('05_convergencia_propiedad.sql') < doc.rindex('yarn migrate')
    assert 'No se crea un segundo servicio permanente' in doc
    assert 'manualmente como `ecd_migrator`' in doc
