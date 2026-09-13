# -*- coding: utf-8 -*-
"""Que version se somete a revision, y quien ve cada revision.

GUARDIAS DE FUENTE, NO DE COMPORTAMIENTO
----------------------------------------
El comportamiento se midio contra PostgreSQL con la aplicacion real, en un banco
aislado: altas sin version, con version nula, inexistente o de otro documento;
revisiones AUTORIDAD_TERMINAL mal formadas guardadas antes de la correccion; y el
listado pedido por miembros con y sin permiso documental.

Aqui se fija el SITIO y el ORDEN de cada comprobacion, para que una edicion
futura no las mueva detras de una mutacion ni las desenganche en silencio.
"""
import io
import os


def _leer(rel):
    raiz = os.path.join(os.path.dirname(__file__), '..')
    return io.open(os.path.join(raiz, rel), encoding='utf-8').read()


def _entre(fuente, desde, hasta):
    return fuente[fuente.index(desde):fuente.index(hasta)]


def test_el_alta_fija_la_version_antes_de_crear_nada():
    """Si la version no se sostiene, no nace la revision, ni su encargo, ni su aviso."""
    cuerpo = _entre(_leer('routes/reviews.py'), 'def create_review', 'def act_on_review')
    puerta = cuerpo.index('_documentos_con_version_fijada(')
    assert puerta < cuerpo.index('INSERT INTO doc_reviews')
    assert puerta < cuerpo.index('_empieza_el_turno(')
    assert puerta < cuerpo.index('registrar_actividad(')


def test_una_version_ausente_no_se_rellena_con_la_vigente():
    """Fijar la version es cosa de quien manda a revisar, no de elegirla despues."""
    validacion = _entre(_leer('routes/reviews.py'),
                        'def _versiones_fijadas', 'def _asociacion_invalida')
    assert 'current_version_id' not in validacion


def test_los_mensajes_nombran_posiciones_no_documentos():
    """Una version ajena no puede sacar por el mensaje el nombre de su documento."""
    mensajes = _entre(_leer('routes/reviews.py'),
                      'def _documentos_con_version_fijada', 'def _puede_ver_la_revision')
    assert "get('name')" not in mensajes and "['name']" not in mensajes


def test_una_AT_mal_formada_se_para_antes_de_la_primera_mutacion():
    """Mismo sitio que la puerta del contrato: despues de ella y antes de cerrar el
    encargo del paso o de construir la entrada del historial."""
    cuerpo = _entre(_leer('routes/reviews.py'), 'def act_on_review', 'def reasignar_revisor')
    puerta = cuerpo.index('_versiones_fijadas(')
    assert cuerpo.index('acto_permitido(') < puerta
    assert puerta < cuerpo.index('cerrar_los_de(')
    assert puerta < cuerpo.index('entry = {')


def test_la_excepcion_sin_version_es_solo_de_PRE():
    """Faltar `version_id` ya no basta para saltarse la guarda del cierre."""
    cuerpo = _entre(_leer('routes/reviews.py'), 'def act_on_review', 'def reasignar_revisor')
    guarda = cuerpo[cuerpo.index("esperada = it.get('version_id')"):cuerpo.index('if cambiados:')]
    assert "rev['contrato'] == flujo.PRE" in guarda
    assert '_asociacion_invalida(' in guarda


def test_el_listado_pregunta_la_regla_documental_de_siempre():
    """Ni una segunda tabla de permisos ni una excepcion por estar asignado."""
    fuente = _leer('routes/reviews.py')
    listado = _entre(fuente, 'def list_reviews', 'def _revision_independiente')
    assert '_puede_ver_la_revision(' in listado
    assert 'contexto_de_permisos(' in listado
    envoltorio = _entre(fuente, 'def _puede_ver_la_revision', 'def _participantes_con_acceso')
    assert 'flujo.puede_consultar_la_revision(' in envoltorio
    # La regla vive en el dominio del flujo: la comparten el listado, /act, las
    # asignaciones, el bloqueo, la bandeja y el correo.
    regla = _entre(_leer('flujo_de_revision.py'),
                   'def puede_consultar_la_revision', 'def asunto_sin_acceso')
    assert 'permiso_efectivo(' in regla
    assert 'folder_permissions WHERE' not in regla and 'FROM folder_permissions' not in regla
    assert 'steps' not in regla and 'user_id' not in regla
