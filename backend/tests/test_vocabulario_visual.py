# -*- coding: utf-8 -*-
"""En un ECD el color significa, así que no puede definirse en cada pantalla.

Alguien aprende en la tabla de archivos que verde = publicado. Ese aprendizaje
tiene que valer en todas las pantallas: si cada módulo se inventa sus colores,
la misma cosa se ve distinta según dónde se mire y el color deja de querer decir
nada — que es peor que no usarlo.

MEDIDO EL 15-ago-2026 en el portal
----------------------------------
868 colores literales, 159 distintos. Los estados del ciclo de vida se definían
en `MatrixTable.jsx` con cuatro hexadecimales a mano, fuera del sistema de color
del portal y sin contraste medido.

Migrar los 868 de golpe sería temerario: son pantallas que no puedo mirar todas.
Lo que sí se cierra es el subconjunto donde el color ES información — los
estados del expediente y las familias de idoneidad — y se deja una prueba para
que no vuelva a abrirse por otro lado.

Contraste medido en el navegador sobre los tokens reales: las nueve fichas entre
5,41:1 y 7,68:1, todas AA o mejor.
"""
import io
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORTAL = os.path.join(RAIZ, 'frontend-docs', 'src')
VOCABULARIO = os.path.join(PORTAL, 'utils', 'estadosECD.jsx')

ESTADOS = ('WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED')


def _jsx():
    for raiz, _dirs, ficheros in os.walk(PORTAL):
        if 'node_modules' in raiz:
            continue
        for f in ficheros:
            if f.endswith(('.jsx', '.js')):
                yield os.path.join(raiz, f)


def test_el_vocabulario_visual_existe_y_no_inventa_colores():
    """No define una paleta nueva: usa las familias de tokens del portal, que
    ya traen el contraste medido."""
    fuente = io.open(VOCABULARIO, encoding='utf-8').read()
    for estado in ESTADOS:
        assert estado + ':' in fuente, f'falta {estado} en el vocabulario'
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", fuente), (
        'el vocabulario visual no puede llevar colores literales: para eso '
        'están los tokens del portal')


def test_ningun_modulo_se_inventa_el_color_de_un_estado():
    """La regla que impide que esto se vuelva a abrir. Se busca un color
    literal en la MISMA línea que el nombre de un estado, que es exactamente
    la forma del mapa que había en MatrixTable."""
    culpables = []
    for ruta in _jsx():
        if os.path.abspath(ruta) == os.path.abspath(VOCABULARIO):
            continue
        for n, linea in enumerate(io.open(ruta, encoding='utf-8', errors='ignore'), 1):
            if not re.search(r"#[0-9a-fA-F]{3,8}\b", linea):
                continue
            if any(re.search(r'\b%s\b' % e, linea) for e in ESTADOS):
                culpables.append('%s:%d' % (os.path.relpath(ruta, RAIZ), n))
    assert not culpables, (
        'estos sitios definen el color de un estado por su cuenta, así que el '
        'mismo estado se verá distinto según la pantalla: ' + ', '.join(culpables))


def test_la_tabla_de_archivos_usa_el_vocabulario_comun():
    """Es la ficha que más se ve del portal: si esa se sale, no sirve de nada
    que las demás entren."""
    fuente = io.open(os.path.join(PORTAL, 'MatrixTable.jsx'), encoding='utf-8').read()
    assert "from './utils/estadosECD'" in fuente
    assert 'ESTADOS' in fuente


def test_un_estado_desconocido_no_se_pinta_como_si_fuera_valido():
    """Fingir que un valor que no entendemos es un estado normal es como se
    cuelan los datos rotos sin que nadie los vea."""
    fuente = io.open(VOCABULARIO, encoding='utf-8').read()
    assert 'no se reconoce' in fuente or 'no reconocido' in fuente
    assert 'NEUTRO' in fuente


def test_cada_estado_explica_lo_que_significa():
    """La ficha se lee de lejos en una reunión; el matiz va en el título. «Con
    esto NO se construye» es la diferencia que importa entre compartido y
    publicado, y no cabe en una etiqueta de dos palabras."""
    fuente = io.open(VOCABULARIO, encoding='utf-8').read()
    assert fuente.count('ayuda:') >= len(ESTADOS)
    assert 'NO se construye' in fuente
