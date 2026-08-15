# -*- coding: utf-8 -*-
"""El eje base es de un FRENTE, y la autorizacion es de la OBRA.

Los dos conceptos se parecen y no son el mismo, y confundirlos cuesta datos.

En Talara conviven '1_CANAL' y '1_DRENAJE': dos frentes de la MISMA obra ('1'),
cada uno con su eje base fijado -- estan los dos en la base, puestos con dos
dias de diferencia. Al ponerle la guardia de obra a esta ruta, la primera
version paso a guardar la fila bajo la obra resuelta en vez de bajo el frente.
Eso comprobaba bien el permiso y a cambio fundia los dos frentes en uno: fijar
el eje del canal habria borrado el del drenaje, en silencio.

Lo que fija esta prueba:
  · la fila va por FRENTE, para que cada uno conserve el suyo;
  · la obra sale del frente y se comprueba SIEMPRE, para que conocer el scope
    de otra obra no baste para cambiarle el eje que se dibuja solo al abrir el
    visor a todos sus usuarios;
  · y la obra se guarda en la propia fila, para que un eje base diga de quien
    es sin tener que volver a resolver el frente.
"""
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _manejador():
    fuente = io.open(os.path.join(BACKEND, 'server.py'), encoding='utf-8').read()
    i = fuente.index("@app.route('/api/civil/base-axis'")
    j = fuente.index('@app.route', i + 10)
    return fuente[i:j]


def test_la_fila_va_por_frente_y_no_por_obra():
    """'1_CANAL' y '1_DRENAJE' resuelven los dos a la obra '1'. Si la clave
    fuera la obra, el segundo pisaria al primero."""
    cuerpo = _manejador()
    assert 'clave = scope' in cuerpo, (
        'la clave del eje base tiene que ser el frente: dos frentes de la misma '
        'obra tienen ejes distintos')
    assert 'clave = obra' not in cuerpo


def test_la_obra_se_comprueba_siempre_que_se_pueda_deducir():
    cuerpo = _manejador()
    assert cuerpo.count('guardia_de_obra(obra') == 2, (
        'hay que comprobar la obra tanto al leer como al escribir')


def test_escribir_sin_saber_la_obra_se_corta():
    """No saber de que obra es una escritura no se resuelve dandola por buena."""
    cuerpo = _manejador()
    escritura = cuerpo[cuerpo.index("if request.method == 'PUT'"):]
    escritura = escritura[:escritura.index('elif obra')]
    assert 'PROJECT_UNRESOLVED' in escritura
    assert '403' in escritura


def test_la_fila_guarda_de_que_obra_es():
    cuerpo = _manejador()
    assert re.search(r'ADD COLUMN IF NOT EXISTS model_urn', cuerpo), (
        'la tabla tiene que llevar la obra: sin ella la fila no dice de quien es')
    assert 'model_urn = EXCLUDED.model_urn' in cuerpo
