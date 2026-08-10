"""Distinguir una orden al visor de una pregunta documental, sin pagar por ello.

EL GASTO QUE ESTOS TESTS FIJAN
------------------------------
El buscador universal hacía DOS llamadas a Gemini por cada pregunta: una para
clasificar la intención y otra para responder. Y la primera se descartaba si
fallaba, cayendo a 'document_query' — o sea, se pagaba una llamada para decidir
algo que ya estaba decidido por defecto.

Lo que separa "aísla la cámara 3" de "¿cuándo se aprobó este plano?" es un puñado
de verbos. Eso no necesita un modelo de lenguaje.
"""
import pytest

from routes.ai import _parece_orden_al_modelo as intencion


@pytest.mark.parametrize('frase', [
    'aisla la cámara de inspección 3',
    'Oculta las tuberías',
    'muestra el buzón 17',
    'enfoca la progresiva 0+240',
    'colorea las partidas por avance',
    'selecciona todo el canal',
    'ZOOM al tramo 4',
    've a la calle Grau',
])
def test_una_orden_al_visor_se_reconoce(frase):
    assert intencion(frase) is not None, frase


@pytest.mark.parametrize('frase', [
    '¿cuándo se aprobó este plano?',
    'qué dice el RFI 23',
    'cuántas cámaras hay en el drenaje',
    'resumen del expediente técnico',
    'quién subió la última versión',
])
def test_una_pregunta_documental_NO_se_confunde(frase):
    assert intencion(frase) is None, frase


def test_se_extrae_el_objetivo_de_la_orden():
    r = intencion('aisla la cámara de inspección 3')
    assert r['intent'] == 'model_command'
    assert 'camara de inspeccion 3' in r['target']


def test_los_acentos_y_las_enies_no_estorban():
    """En obra se escribe con tildes, y a veces sin ellas."""
    assert intencion('enseña el buzón') is not None
    assert intencion('ensena el buzon') is not None


def test_no_basta_con_que_el_verbo_aparezca_en_medio():
    """'me gustaría ocultar' no es una orden: es una frase. Solo cuenta al principio,
    que es como la gente da órdenes de verdad."""
    assert intencion('me gustaría ocultar las tuberías algún día') is None


def test_texto_vacio_no_es_una_orden():
    assert intencion('') is None
    assert intencion(None) is None
