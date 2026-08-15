# -*- coding: utf-8 -*-
"""Nadie se aprueba sus propios documentos.

AREA 13 · flujo ECD. La revision es el camino a PUBLICADO, que es el estado con
el que se construye. Hasta ahora `create_review` no miraba quien iba en los
pasos: cualquiera con permiso de edicion sobre sus propios documentos se ponia a
si mismo de unico revisor, se aprobaba, y el expediente quedaba con material
«autorizado» -- con historial, revisores y fechas de aprobacion que parecen los
de una revision de verdad.

Eso es peor que no tener revision: tiene su apariencia. Una supervision que mire
el historial vera una aprobacion firmada y fechada, y no hay nada en el dato que
diga que el que firmo es el que lo hizo.

LA REGLA, Y POR QUE ESTA
------------------------
El autor no puede ser el UNICO revisor. Puede estar entre ellos: en un equipo
pequeño el autor conoce el documento y su firma vale. Prohibirle aparecer seria
mas estricto de lo que pide ISO 19650-2 y bloquearia a un equipo de dos sin
ganar nada. Lo que no puede es cerrar el circulo el solo.
"""
import importlib

import pytest
from flask import Flask, g


@pytest.fixture
def revisiones(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.reviews as rv
    importlib.reload(rv)
    app = Flask(__name__)

    @app.before_request
    def _s():
        g.current_user = {}

    return app, rv


AUTOR = {'email': 'Yaser@obra.test', 'name': 'Yaser Omar'}


def _negado(app, rv, user, steps):
    with app.test_request_context('/'):
        g.current_user = user
        return rv._revision_independiente(user, steps)


def test_ponerse_a_uno_mismo_de_unico_revisor_se_rechaza(revisiones):
    app, rv = revisiones
    r = _negado(app, rv, AUTOR, [{'email': 'yaser@obra.test', 'name': 'Yaser Omar'}])
    assert r is not None
    cuerpo, codigo = r
    assert codigo == 400
    assert cuerpo.get_json()['code'] == 'REVISION_SIN_INDEPENDENCIA'


def test_el_correo_se_compara_sin_distinguir_mayusculas(revisiones):
    """'Yaser@obra.test' y 'yaser@obra.test' son la misma persona. Comparar en
    crudo dejaba pasar el caso con solo cambiar una letra."""
    app, rv = revisiones
    assert _negado(app, rv, AUTOR, [{'email': 'YASER@OBRA.TEST'}]) is not None


def test_tampoco_vale_repetirse_en_varios_pasos(revisiones):
    """Tres pasos, el mismo firmante: sigue siendo una firma delante del espejo."""
    app, rv = revisiones
    pasos = [{'email': 'yaser@obra.test'}] * 3
    assert _negado(app, rv, AUTOR, pasos) is not None


def test_con_un_revisor_ajeno_se_puede_seguir(revisiones):
    app, rv = revisiones
    assert _negado(app, rv, AUTOR, [{'email': 'otro@obra.test'}]) is None


def test_el_autor_puede_estar_entre_los_revisores(revisiones):
    """La regla es que no sea el UNICO, no que no aparezca: en un equipo pequeño
    el autor conoce el documento y su firma vale."""
    app, rv = revisiones
    pasos = [{'email': 'yaser@obra.test'}, {'email': 'otro@obra.test'}]
    assert _negado(app, rv, AUTOR, pasos) is None


def test_tambien_se_compara_por_nombre_cuando_no_hay_correo(revisiones):
    """Los pasos se pueden asignar por nombre: act_on_review acepta las dos
    formas, asi que la comprobacion tiene que mirar las dos o se esquiva
    poniendo el nombre en vez del correo."""
    app, rv = revisiones
    assert _negado(app, rv, AUTOR, [{'name': 'Yaser Omar'}]) is not None
    assert _negado(app, rv, AUTOR, [{'name': 'Otra Persona'}]) is None


def test_la_comprobacion_esta_puesta_en_la_creacion():
    """Una regla que existe y no se llama no protege de nada. Y va al CREAR:
    enterarse cuando ya han firmado tres revisores es tarde."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'reviews.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def create_review'):fuente.index('def act_on_review')]
    assert '_revision_independiente(u, steps)' in cuerpo
    # Antes del INSERT, no despues.
    assert (cuerpo.index('_revision_independiente')
            < cuerpo.index('INSERT INTO doc_reviews'))


def test_la_negativa_dice_COMO_desbloquearlo():
    """Medido sobre la base real: la obra INTERFERENCIAS tiene UN solo miembro,
    asi que con esta regla su unico usuario no puede crear ninguna revision.

    La regla se queda -- una revision sin ojo ajeno no revisa nada -- pero un
    «no puedes» sin salida deja a alguien pulsando el boton otra vez sin
    entender que le piden. Aqui la salida existe (invitar a alguien a la obra) y
    tiene que estar escrita en el propio error, no en la cabeza de quien lo
    programo.

    Es la misma leccion que los enlaces publicos, que deje bloqueados sin
    pantalla para desbloquearlos.
    """
    import importlib
    from flask import Flask, g
    import routes.reviews as rv
    importlib.reload(rv)
    app = Flask(__name__)
    with app.test_request_context('/'):
        g.current_user = AUTOR
        cuerpo, _codigo = rv._revision_independiente(AUTOR, [{'email': 'yaser@obra.test'}])
    texto = cuerpo.get_json()['error']
    assert 'invita' in texto.lower()
    assert 'Miembros' in texto
