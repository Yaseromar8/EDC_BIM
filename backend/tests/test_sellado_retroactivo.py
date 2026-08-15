# -*- coding: utf-8 -*-
"""Una huella puesta hoy no puede hacerse pasar por evidencia de ayer.

RESIDUAL DE C6. Desde `6e2fb23` toda subida sella su SHA-256 al entrar; las
versiones anteriores no tienen huella. Rellenarlas parece obviamente bueno y
tiene una trampa que hay que dejar cerrada por escrito:

    una huella calculada HOY demuestra lo que el fichero es HOY.

Si alguien lo cambio el mes pasado, sellarlo ahora deja el expediente cuadrando
justo donde no lo esta. La herramienta no recupera la cadena de custodia del
pasado -- eso no se puede -- solo cierra la puerta hacia delante.

Por eso cada huella retroactiva se marca. Sin la marca, dentro de un año nadie
sabria cuales significan algo, y una auditoria las trataria todas igual: la
herramienta se convertiria en tranquilidad falsa, que es peor que el hueco.
"""
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERRAMIENTA = os.path.join(BACKEND, 'herramientas', 'sellar_versiones_antiguas.py')


def _fuente():
    return io.open(HERRAMIENTA, encoding='utf-8').read()


def test_las_huellas_retroactivas_quedan_marcadas():
    """Es lo que separa «vale desde hoy» de «esto es evidencia»."""
    f = _fuente()
    assert 'huella_retroactiva' in f
    assert 'huella_retroactiva = TRUE' in f


def test_nunca_se_pisa_una_huella_ya_puesta():
    """Una huella existente puede ser la evidencial. Sobrescribirla seria
    destruir justo lo que se viene a proteger."""
    f = _fuente()
    actualiza = f[f.index('UPDATE file_versions'):]
    actualiza = actualiza[:actualiza.index('"""', 10) + 3]
    assert 'sha256 IS NULL' in actualiza, (
        'el UPDATE tiene que exigir que no hubiera huella antes')


def test_por_defecto_no_escribe():
    """Una herramienta que toca el expediente no puede escribir por mirarla."""
    f = _fuente()
    assert "'--aplicar', action='store_true'" in f
    assert 'if not a.aplicar:' in f


def test_esta_escrito_que_esto_no_demuestra_el_pasado():
    """Si el documento no lo dice, alguien va a usar estas huellas como prueba
    de que el fichero es el que se aprobo. Y no lo son."""
    f = _fuente().lower()
    assert 'no demuestra que el fichero sea el que se aprobo' in f
    assert 'no dice nada del pasado' in f or 'no dice nada de si el fichero' in f


def test_lee_a_trozos_y_no_de_golpe():
    """Hay RVT de cientos de MB; cargarlos enteros tumbaria el proceso."""
    f = _fuente()
    assert 'f.read(1024 * 1024)' in f


def test_distingue_el_objeto_que_falta_del_fallo_propio():
    """Un objeto que la base declara y el almacen no tiene es el hallazgo C7.
    Contarlo como fallo de esta herramienta mandaria a buscar donde no es."""
    f = _fuente()
    assert 'C7' in f and 'ilegibles' in f
