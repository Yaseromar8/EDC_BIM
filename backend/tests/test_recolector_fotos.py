# -*- coding: utf-8 -*-
"""El recolector de fotos huerfanas del panel de seguimiento.

BASELINE 0 · N13. Tenia dos defectos que se tapaban entre si:

  1. llamaba `soft_delete_node(model_urn, ruta)` cuando la firma es
     `(node_id, model_urn)`, y ademas pasaba una ruta donde iba un id. El UPDATE
     no encontraba nada y no borraba nada.
  2. aun asi escribia 'delete_orphan_photo' en el registro de actividad. El
     expediente afirmaba borrados que nunca ocurrieron.

El segundo era el grave: un registro de auditoria que miente no sirve para
auditar. Arreglar el primero, en cambio, ENCIENDE un borrado que hoy no ocurre,
y por eso queda tras un interruptor apagado y con tope.
"""
import os

import pytest

os.environ.setdefault('AUTH_POLICY_MODE', 'sombra')
from routes.tracking import huerfanas_a_purgar  # noqa: E402

TRES = {'obra/fotos/a.jpg', 'obra/fotos/b.jpg', 'obra/fotos/c.jpg'}


def test_apagado_por_defecto_no_se_purga_nada():
    """El comportamiento REAL de hoy es que no se borra nada. Arreglar el fallo
    sin este interruptor lo cambiaria en silencio."""
    purgar, motivo = huerfanas_a_purgar(TRES, trae_fotos=True, purga_activa=False)
    assert purgar == []
    assert 'purga apagada' in motivo


def test_encendido_se_purgan_las_que_son():
    purgar, motivo = huerfanas_a_purgar(TRES, trae_fotos=True, purga_activa=True)
    assert purgar == sorted(TRES)
    assert motivo is None


def test_una_sincronizacion_sin_fotos_no_borra_la_obra_entera():
    """Si el cliente manda el bloque sin 'fotos' -- un fallo de red a mitad --
    TODAS las fotografias parecen huerfanas. Eso no es una intencion."""
    purgar, motivo = huerfanas_a_purgar(TRES, trae_fotos=False, purga_activa=True)
    assert purgar == []
    assert 'no trae' in motivo


def test_una_purga_masiva_se_frena_en_el_tope():
    muchas = {f'obra/fotos/{i}.jpg' for i in range(40)}
    purgar, motivo = huerfanas_a_purgar(muchas, trae_fotos=True, purga_activa=True, tope=25)
    assert purgar == []
    assert 'supera el tope' in motivo


def test_las_subidas_en_curso_y_lo_externo_se_dejan_en_paz():
    mezcla = {'obra/fotos/a.jpg', 'Subiendo... foto.jpg',
              'https://otro-sitio/imagen.jpg', ''}
    purgar, _ = huerfanas_a_purgar(mezcla, trae_fotos=True, purga_activa=True)
    assert purgar == ['obra/fotos/a.jpg']


def test_sin_huerfanas_no_hay_ni_mensaje():
    """Un recolector que imprime cuando no hay nada que hacer se vuelve ruido y
    se deja de leer, que es como el fallo original sobrevivio meses."""
    assert huerfanas_a_purgar(set(), trae_fotos=True, purga_activa=True) == ([], None)


def test_solo_se_anota_en_auditoria_lo_que_de_verdad_se_borro():
    """Regresion sobre el defecto grave: el log_activity tiene que colgar del
    resultado de soft_delete_node, no ejecutarse pase lo que pase."""
    import io
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'tracking.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    bloque = fuente[fuente.index('a_purgar, motivo = huerfanas_a_purgar'):]
    bloque = bloque[:bloque.index('except Exception as gc_err')]
    assert 'if soft_delete_node(' in bloque, 'el borrado tiene que condicionar la anotacion'
    i_delete = bloque.index('if soft_delete_node(')
    i_log = bloque.index('log_activity(')
    assert i_delete < i_log, 'se anota antes de comprobar que se borro'


def test_el_orden_de_los_argumentos_es_el_de_la_firma():
    """El fallo original era exactamente este: (model_urn, ruta) en vez de
    (node_id, model_urn)."""
    import inspect
    import io
    from file_system_db import soft_delete_node
    firma = list(inspect.signature(soft_delete_node).parameters)
    assert firma[:2] == ['node_id', 'model_urn']

    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'tracking.py')
    # Sin las lineas de comentario: el comentario que documenta el fallo cita la
    # llamada mala a proposito, y buscarla en crudo daria un falso positivo.
    codigo = ' '.join(l for l in io.open(ruta, encoding='utf-8').read().splitlines()
                      if not l.lstrip().startswith('#'))
    assert 'soft_delete_node(node_id, model_urn' in codigo
    assert 'soft_delete_node(model_urn' not in codigo
