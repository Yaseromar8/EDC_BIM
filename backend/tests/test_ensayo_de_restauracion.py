# -*- coding: utf-8 -*-
"""El ensayo de restauracion no puede convertirse en el accidente que ensaya.

Crea y BORRA bases de datos, y pide la contrasena del superusuario: es la
herramienta mas peligrosa del repositorio si se descuida. Estas pruebas fijan
sus seguros leyendo el fuente -- son estaticas a proposito, porque ejecutarla
de verdad exige una contrasena que ninguna prueba debe tener.
"""
import io
import os

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'herramientas', 'ensayo_de_restauracion.py')


def _fuente():
    return io.open(RUTA, encoding='utf-8').read()


def test_se_niega_a_correr_fuera_de_local():
    """Contra produccion esto no es un ensayo: es una ruleta. La comprobacion
    no se puede saltar con un parametro."""
    f = _fuente()
    assert "HOSTS_LOCALES = ('127.0.0.1', 'localhost', '::1')" in f
    assert 'host not in HOSTS_LOCALES' in f
    assert '--forzar' not in f and 'sobre-produccion' not in f


def test_la_contrasena_va_por_getpass_y_no_se_guarda():
    f = _fuente()
    assert 'getpass.getpass' in f
    assert "print(clave" not in f and 'clave)' not in f.replace('password=clave)', '')


def test_solo_borra_lo_que_este_ensayo_creo():
    """El DROP solo puede caer sobre una base con el prefijo del ensayo y que
    este mismo proceso acaba de crear; si ya existia, se aborta antes."""
    f = _fuente()
    assert "PREFIJO = 'ecd_ensayo_'" in f
    assert 'ya existe; no se toca' in f
    i_drop = f.index('DROP DATABASE')
    assert 'base_ensayo' in f[i_drop:i_drop + 60], 'el DROP debe ir sobre base_ensayo'


def test_la_base_del_ensayo_es_de_la_aplicacion_no_del_superusuario():
    """La base del ensayo se crea propiedad del USUARIO DE APLICACION: asi el
    bootstrap y la carga corren con los permisos reales, que es lo que el ensayo
    tiene que demostrar. Si se creara propiedad del superusuario, el ensayo
    diria que si sobre unos permisos que la aplicacion no tiene.

    Y el nombre del rol NO puede estar escrito en el codigo. Lo estaba --fijo a
    'ecd_app'-- y esta misma prueba exigia esa cadena literal, con lo cual
    blindaba el fallo: en la instancia de una entidad el usuario se llama
    `ecd_app_<entidad>` y el ensayo moria con «role "ecd_app" does not exist».
    La herramienta que demuestra que la copia sirve no funcionaba justo donde
    hacia falta demostrarlo.
    """
    f = _fuente()
    i = f.index('CREATE DATABASE')
    sentencia = f[i:i + 200]
    assert 'OWNER' in sentencia, 'la base del ensayo tiene que tener dueño explicito'
    assert 'ecd_app"' not in sentencia and "ecd_app'" not in sentencia, (
        'el nombre del rol no puede estar escrito a fuego: sale de DB_USER')
    assert "getenv('DB_USER')" in f, 'el dueño se lee del entorno'


def test_el_ensayo_no_confunde_su_base_desechable_con_produccion():
    """El guardia de restaurar.py compara el destino contra DB_NAME. El ensayo
    apunta DB_NAME a su base desechable para construirle el esquema, asi que sin
    decirle nada el guardia la tomaba por produccion y se negaba a cargar: el
    ensayo completo NUNCA paso del paso 3, y era justo lo que decia demostrar.
    """
    f = _fuente()
    assert 'base_de_produccion' in f, (
        'el ensayo tiene que decirle al guardia cual es la base de produccion real')
    i_guardar = f.index('base_de_produccion = os.environ.get')
    i_cambiar = f.index("os.environ['DB_NAME'] = base_ensayo")
    assert i_guardar < i_cambiar, (
        'hay que guardar el nombre de produccion ANTES de pisar DB_NAME')


def test_el_cotejo_compara_fila_a_fila_contra_la_copia():
    """Restaurar sin cotejar es esperar que haya ido bien. El veredicto se gana."""
    f = _fuente()
    assert 'reales != filas_esperadas' in f
    assert "'RESTAURABLE' if not mal" in f


def test_deja_evidencia_con_veredicto():
    f = _fuente()
    assert 'ensayo-restauracion-' in f
    assert 'descuadres' in f
