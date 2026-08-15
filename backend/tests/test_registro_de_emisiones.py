# -*- coding: utf-8 -*-
"""Cada vez que un contenedor sale, queda constancia. Y el numero no se repite.

AREA 13 · flujo ECD. Un mismo fichero se emite varias veces: se comparte como S3
para revision y semanas despues se publica como A1. La emision se grababa
haciendo UPDATE sobre la fila de la version -- idoneidad, revision, quien y
cuando, encima de lo que hubiera -- asi que la segunda emision no matizaba a la
primera: la BORRABA. Quien compartio, que dia y con que idoneidad dejaba de
existir en el expediente.

Y de rebote se rompia la numeracion. `siguiente_revision` cuenta los codigos ya
usados leyendo `file_versions.codigo_revision`, que solo conserva el ultimo: los
pisados se volvian invisibles y el numero se reutilizaba. Un P01 que sale dos
veces con contenidos distintos deja de identificar nada -- y en una reclamacion
es exactamente el dato que se mira.

Las dos mitades del mismo fallo se arreglan con lo mismo: un registro de
emisiones al que solo se añade.
"""
import io
import os

import idoneidad as idn
from tests.test_idoneidad import CursorFalso

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── La numeracion, que es la parte visible ────────────────────────────────

def test_no_se_reutiliza_un_codigo_que_la_version_ya_no_recuerda():
    """El caso exacto: se compartio P01, se volvio a WIP y se comparte otra vez.
    La columna de la version quedo pisada, asi que solo el registro sabe que P01
    ya salio. Sin mirarlo, esto devolveria P01 por segunda vez."""
    cur = CursorFalso(revisiones_usadas=[], emisiones=['P01'])
    assert idn.siguiente_revision(cur, 'nodo-1', 'SHARED') == 'P02'


def test_se_mira_tambien_el_historial_anterior_al_registro():
    """Las emisiones de antes de que existiera la tabla solo estan en las
    columnas. Ignorarlas haria que el primer documento emitido tras el cambio
    volviera a P01."""
    cur = CursorFalso(revisiones_usadas=['P01', 'P02'], emisiones=[])
    assert idn.siguiente_revision(cur, 'nodo-1', 'SHARED') == 'P03'


def test_se_toma_el_mayor_de_las_dos_fuentes():
    cur = CursorFalso(revisiones_usadas=['P01'], emisiones=['P01', 'P02', 'P03'])
    assert idn.siguiente_revision(cur, 'nodo-1', 'SHARED') == 'P04'


def test_sin_registro_todavia_no_revienta():
    """Una base que aun no tiene la tabla tiene que poder seguir emitiendo."""
    cur = CursorFalso(revisiones_usadas=['C01'], hay_registro_de_emisiones=False)
    assert idn.siguiente_revision(cur, 'nodo-1', 'PUBLISHED') == 'C02'


def test_las_dos_series_siguen_separadas():
    """Compartir numera P, publicar numera C. Una emision contractual no puede
    consumir un numero preliminar ni al reves."""
    cur = CursorFalso(emisiones=['P01', 'P02', 'C01'])
    assert idn.siguiente_revision(cur, 'nodo-1', 'SHARED') == 'P03'
    assert idn.siguiente_revision(cur, 'nodo-1', 'PUBLISHED') == 'C02'


# ── El registro, que es la parte que sostiene el expediente ───────────────

def _fuente_estados():
    return io.open(os.path.join(BACKEND, 'estados_ecd.py'), encoding='utf-8').read()


def test_el_registro_solo_se_anade_nunca_se_actualiza():
    """Si a este registro se le pudiera hacer UPDATE seria un estado, no una
    memoria, y volveriamos al mismo sitio."""
    fuente = _fuente_estados()
    assert 'UPDATE file_emisiones' not in fuente
    assert 'DELETE FROM file_emisiones' not in fuente
    assert 'INSERT INTO file_emisiones' in fuente


def test_la_emision_se_anota_ANTES_de_sellar_la_version():
    """Si se anotara despues, un fallo a mitad dejaria el sello puesto y la
    emision sin constancia: justo el estado que no se puede reconstruir."""
    fuente = _fuente_estados()
    cuerpo = fuente[fuente.index('def _sellar_emision'):]
    cuerpo = cuerpo[:cuerpo.index('return {')]
    assert cuerpo.index('_insertar_emision') < cuerpo.index('UPDATE file_versions')


def test_no_se_emite_en_silencio_si_no_se_puede_anotar():
    """Dejar pasar la emision sin registro reconstruiria el agujero entero."""
    fuente = _fuente_estados()
    cuerpo = fuente[fuente.index('def _sellar_emision'):]
    cuerpo = cuerpo[:cuerpo.index('return {')]
    assert 'raise' in cuerpo


def test_la_emision_guarda_de_que_obra_y_de_que_version_es():
    """Una emision sin version no dice QUE se emitio, y sin obra no se puede
    acotar por perimetro."""
    fuente = _fuente_estados()
    assert 'file_version_id' in fuente
    assert 'model_urn' in fuente[fuente.index('CREATE TABLE IF NOT EXISTS file_emisiones'):
                                 fuente.index('CREATE TABLE IF NOT EXISTS file_emisiones') + 700]


def test_la_tabla_se_crea_en_el_arranque_y_no_en_caliente():
    """El sitio del DDL es el bootstrap. La creacion al vuelo es una red de
    seguridad para bases que vienen de antes, no el camino normal."""
    boot = io.open(os.path.join(BACKEND, 'bootstrap_esquema.py'), encoding='utf-8').read()
    assert "('emisiones', _tabla_emisiones)" in boot
    assert 'asegurar_tabla_emisiones' in boot
