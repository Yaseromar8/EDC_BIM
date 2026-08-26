# -*- coding: utf-8 -*-
"""QUIEN PUEDE DECIDIR QUE DOCUMENTO VALE EN OBRA.

EL HALLAZGO (25-ago-2026)
--------------------------
Emitir una revision no era un acto autorizado: bastaba con SER MIEMBRO DE LA
OBRA. `guardia_de_recurso` resuelve el aislamiento entre obras y ahi se acababa
el control.

Y no es un acto cualquiera:

    crea la revision  ->  cambia cual es la VIGENTE  ->  marca SUPERADA la anterior

Decide contra que documento se construye. Un contratista podia cambiarlo y el
plano superado desaparecia de la vista sin que nadie lo hubiera aprobado.

LAS TRES CAPAS, SEPARADAS
--------------------------
    AISLAMIENTO DE OBRA     `guardia_de_recurso`          ¿es de tu obra?
    PERMISO DE RECURSO      `check_folder_permission`     ¿puedes con ESTE documento?
    AUTORIZACION DE FLUJO   admin de obra / funcion       ¿te toca DECIDIR?

Ninguna sobra, y por eso son tres:
  · solo con permiso de recurso, un contratista con `edit` sobre su carpeta
    declararia vigente lo que quisiera;
  · solo con autorizacion de flujo, un administrador publicaria a ciegas un
    documento que ni siquiera puede abrir.

NO SE INVENTO NINGUN PERMISO NUEVO. La escalera de seis niveles,
`check_folder_permission` y `funcion_de` ya existian: lo que faltaba era usarlos.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _fuente(nombre):
    return io.open(os.path.join(RAIZ, nombre), encoding='utf-8').read()


# ══ LA REGLA ═══════════════════════════════════════════════════════════════

def test_ser_miembro_de_la_obra_YA_NO_BASTA_para_emitir():
    """La regresion que este fichero existe para impedir."""
    cuerpo = _fuente('routes/planos.py').split('def emitir_revision')[1].split('\n@')[0]
    assert 'autoridad_para_emitir' in cuerpo, (
        'emitir una revision de plano volvio a depender solo de la pertenencia')
    cuerpo = _fuente('routes/specs.py').split('def emitir_revision')[1].split('\n@')[0]
    assert 'autoridad_para_emitir' in cuerpo, (
        'emitir una revision de especificacion no esta autorizada')


def test_crear_una_seccion_CON_documento_tambien_esta_autorizado():
    """Crear la seccion con documento emite su PRIMERA revision. Si esa via no
    estuviera autorizada, seria la puerta de atras del mismo acto."""
    cuerpo = _fuente('routes/specs.py').split('def crear(')[1].split('\n@')[0]
    assert 'autoridad_para_emitir' in cuerpo


def test_las_TRES_capas_estan_y_son_distintas():
    import revisiones_de_documento as rev
    fuente = _fuente('revisiones_de_documento.py')
    cuerpo = fuente.split('def autoridad_para_emitir')[1]
    # capa 2
    assert 'check_folder_permission' in cuerpo
    assert "'edit'" in cuerpo, 'el nivel exigido sobre el documento'
    # capa 3
    assert 'es_admin_de_obra' in cuerpo
    assert 'funcion_de' in cuerpo
    # y la capa 1 la resuelve OTRO, antes: aqui se NOMBRA en el comentario para
    # decir donde vive, pero no se LLAMA -- duplicarla aqui la volveria a abrir
    # a base de datos por cada emision sin ganar nada.
    assert 'guardia_de_recurso(' not in cuerpo
    assert hasattr(rev, 'FUNCIONES_EMISORAS')


def test_el_permiso_de_recurso_se_comprueba_ANTES_que_la_funcion():
    """Un administrador no puede publicar a ciegas un documento que no puede
    abrir: el permiso sobre el documento se mira primero, para todos."""
    cuerpo = _fuente('revisiones_de_documento.py').split('def autoridad_para_emitir')[1]
    assert cuerpo.index('check_folder_permission') < cuerpo.index('es_admin_de_obra')


def test_quien_emite_es_una_lista_CERRADA_y_razonada():
    """En obra publica la lamina la produce el PROYECTISTA y la emite la
    ENTIDAD. La SUPERVISION revisa y el CONTRATISTA construye contra lo emitido:
    ninguno de los dos decide que version vale."""
    import revisiones_de_documento as rev
    import directorio_de_obra as dir_obra
    assert rev.FUNCIONES_EMISORAS == ('ENTIDAD', 'PROYECTISTA')
    assert 'CONTRATISTA' not in rev.FUNCIONES_EMISORAS, (
        'el contratista construye contra lo emitido; si decidiera que vale, se '
        'invertiria la cadena contractual')
    assert 'SUPERVISION' not in rev.FUNCIONES_EMISORAS
    for f in rev.FUNCIONES_EMISORAS:
        assert f in dir_obra.FUNCIONES, 'una funcion que no existe en el directorio'


def test_la_negativa_DICE_por_que_y_cual_es_tu_funcion():
    """«No tienes permiso» obliga a abrir un ticket. Decir cual es tu funcion y
    cual haria falta permite resolverlo sin preguntar."""
    cuerpo = _fuente('revisiones_de_documento.py').split('def autoridad_para_emitir')[1]
    assert 'SIN_AUTORIDAD_DE_EMISION' in cuerpo
    assert "'funcion': funcion" in cuerpo
    assert 'Tu función en esta obra' in cuerpo


def test_no_se_invento_ningun_permiso_nuevo():
    """La escalera documental sigue teniendo los seis niveles de siempre."""
    import folder_permissions as fp
    assert set(fp.PERMISSION_LEVELS) == {
        'none', 'viewer', 'view_download', 'view_markup', 'edit', 'admin'}
    # Y `autoridad_para_emitir` usa uno de ellos, no uno propio.
    cuerpo = _fuente('revisiones_de_documento.py').split('def autoridad_para_emitir')[1]
    for nivel in ('viewer', 'view_download', 'view_markup', 'edit', 'admin'):
        if "'%s'" % nivel in cuerpo:
            assert nivel in fp.PERMISSION_LEVELS


# ══ LAS TRES CAPACIDADES SIGUEN SIENDO DISTINTAS ═══════════════════════════

def test_VER_no_es_EDITAR_METADATOS_no_es_EMITIR():
    """Tres actos, tres exigencias. Si las tres pidieran lo mismo, la escalera
    de permisos seria decorativa."""
    fuente = _fuente('routes/planos.py')

    # VER la lista de planos: pertenecer a la obra basta. Es metadato de obra,
    # no el documento -- abrir el PDF lo sigue gateando el expediente.
    ver = fuente.split('def listar(')[1].split('\n@')[0]
    assert 'guardia_de_obra' in ver
    assert 'autoridad_para_emitir' not in ver

    # CREAR la identidad del plano: no emite nada, no cambia ninguna vigente.
    crear = fuente.split('def crear(')[1].split('\n@')[0]
    assert 'autoridad_para_emitir' not in crear, (
        'crear la identidad de un plano no declara que documento vale: exigir '
        'aqui la autoridad de emision confundiria dos actos distintos')

    # EMITIR: las tres capas.
    emitir = fuente.split('def emitir_revision')[1].split('\n@')[0]
    assert 'guardia_de_recurso' in emitir
    assert 'autoridad_para_emitir' in emitir


# ══ EL COMPORTAMIENTO, SIN BASE DE DATOS ═══════════════════════════════════

import pytest


@pytest.fixture(autouse=True)
def _contexto_flask():
    """`jsonify` necesita una aplicacion. Las guardias de este producto
    devuelven respuestas ya formadas --es lo que evita que cada ruta se invente
    su mensaje-- y por tanto probarlas exige un contexto."""
    from flask import Flask
    app = Flask(__name__)
    with app.app_context():
        yield


class _Cur(object):
    def __init__(self, funcion=None):
        self.funcion = funcion
    def execute(self, q, args=None):
        self._q = q
    def fetchone(self):
        return (self.funcion,) if self.funcion else None


def _autoridad(monkeypatch, *, permiso_ok=True, admin=False, funcion=None):
    import revisiones_de_documento as rev
    import folder_permissions as fp
    import administracion_de_obra as adm
    import directorio_de_obra as dir_obra
    monkeypatch.setattr(fp, 'check_folder_permission',
                        lambda *a, **k: (None if permiso_ok else ('DENEGADO', 403)))
    monkeypatch.setattr(adm, 'es_admin_de_obra', lambda *a, **k: admin)
    monkeypatch.setattr(dir_obra, 'funcion_de', lambda *a, **k: funcion)
    return rev.autoridad_para_emitir(_Cur(), {'id': 7}, 'obra-1', 'urn',
                                     'nodo-1', rev.PLANO)


def test_un_miembro_ORDINARIO_no_emite(monkeypatch):
    """Aunque tenga permiso sobre el documento."""
    assert _autoridad(monkeypatch, permiso_ok=True, admin=False,
                      funcion='CONTRATISTA') is not None


def test_sin_funcion_ninguna_tampoco(monkeypatch):
    assert _autoridad(monkeypatch, permiso_ok=True, admin=False,
                      funcion=None) is not None


def test_la_SUPERVISION_revisa_pero_no_emite(monkeypatch):
    assert _autoridad(monkeypatch, permiso_ok=True, admin=False,
                      funcion='SUPERVISION') is not None


def test_el_ADMIN_DE_OBRA_emite(monkeypatch):
    assert _autoridad(monkeypatch, permiso_ok=True, admin=True,
                      funcion='CONTRATISTA') is None


def test_la_ENTIDAD_y_el_PROYECTISTA_emiten(monkeypatch):
    assert _autoridad(monkeypatch, permiso_ok=True, funcion='ENTIDAD') is None
    assert _autoridad(monkeypatch, permiso_ok=True, funcion='PROYECTISTA') is None


def test_SIN_permiso_sobre_el_documento_no_emite_NI_EL_ADMIN(monkeypatch):
    """Es la capa que impide publicar a ciegas."""
    assert _autoridad(monkeypatch, permiso_ok=False, admin=True,
                      funcion='ENTIDAD') is not None
