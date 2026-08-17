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
    """OWNER ecd_app: asi el bootstrap y la carga corren con los permisos reales
    de la aplicacion, que es lo que el ensayo tiene que demostrar."""
    assert 'OWNER ecd_app' in _fuente()


def test_el_cotejo_compara_fila_a_fila_contra_la_copia():
    """Restaurar sin cotejar es esperar que haya ido bien. El veredicto se gana."""
    f = _fuente()
    assert 'reales != filas_esperadas' in f
    assert "'RESTAURABLE' if not mal" in f


def test_deja_evidencia_con_veredicto():
    f = _fuente()
    assert 'ensayo-restauracion-' in f
    assert 'descuadres' in f
