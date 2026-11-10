# -*- coding: utf-8 -*-
"""MODELOS DE ALEPHIA DOCS EN EL VISOR (10-nov-2026, docs/archivos/29, fases F2 y F3).

Un RVT, DWG, DXF, NWD/NWC o IFC que vive en Docs se federa en el visor como uno de ACC. El dueño: «hagamos algo
profesional para también conectar Docs y poder vincular nuestros modelos de Docs».

Las reglas, y por qué:
  · EL LINAJE ES EL DOCUMENTO: `urn:alephia:docs.lineage:<id del documento>`, estable entre versiones (la regla D-01
    de docs/AI_DECISIONS.md, igual que con ACC). Va en `item_id` de `model_config`, que es la columna que ya significa
    linaje: en ACC `itemId` ES el linaje del documento. Así las vistas guardadas, que leen `lineage || item_id ||
    itemId`, lo encuentran sin cambiar nada.
  · `source = 'ALEPHIA'` lo distingue de ACC ('DOCS', Docs de Autodesk) y de lo subido desde el equipo ('LOCAL'): las
    rutas que preguntan a Autodesk por un `itemId` de ACC no lo tocan.
  · El URN es el de la versión VIGENTE ya traducida por Docs (`/api/docs/cad/translate`): lo da el servidor, nunca el
    navegador. Sin traducir no se vincula: se dice y se prepara.
  · Solo documentos de LA MISMA OBRA que el frente, que quien vincula puede ver, de los formatos que el visor federa,
    y no dos veces el mismo documento en un frente.
  · Versión nueva en Docs: «Buscar actualizaciones» la ve (la vigente es otra que la cargada) y «Actualizar» la trae
    cuando ya está traducida. No se actualiza solo: el visor y el inventario no se desfasan.

Sin Flask ni base de datos: lo que hace falta se inyecta, para probarlo (tests/test_modelos_de_docs.py).
"""
import re

FUENTE = 'ALEPHIA'
PREFIJO_LINAJE = 'urn:alephia:docs.lineage:'
FORMATOS = ('.rvt', '.dwg', '.dxf', '.nwd', '.nwc', '.ifc')
_UUID = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
# En minúsculas, una sola forma: `linaje_de` la normaliza. La misma que acepta vistas_v2.RE_LINAJE.
RE_LINAJE = re.compile(r'^urn:alephia:docs\.lineage:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


class Negativa(Exception):
    """Por qué no se puede: un código, el texto para la persona y su código HTTP."""
    def __init__(self, codigo, texto, http=400, **extra):
        super().__init__(texto)
        self.codigo, self.texto, self.http, self.extra = codigo, texto, http, extra


def linaje_de(documento_id):
    """El linaje de un documento de Docs."""
    documento_id = str(documento_id or '')
    if not _UUID.match(documento_id):
        raise Negativa('DOCUMENTO_INVALIDO', 'Documento no válido.')
    return PREFIJO_LINAJE + documento_id.lower()


def es_linaje_de_docs(valor):
    return isinstance(valor, str) and bool(RE_LINAJE.match(valor))


def documento_del_linaje(linaje):
    """El id del documento de un linaje de Docs, o None si no lo es."""
    return linaje[len(PREFIJO_LINAJE):] if es_linaje_de_docs(linaje) else None


def es_de_docs(modelo):
    """¿Es un modelo de ALEPHIA Docs? Por su fuente Y su linaje: las dos cosas, para no confundirlo con uno de ACC."""
    return (modelo or {}).get('source') == FUENTE and es_linaje_de_docs((modelo or {}).get('itemId'))


def admite(nombre):
    return bool(nombre) and str(nombre).lower().endswith(FORMATOS)


def comprobar(nodo, obra_del_frente, obra_del_documento, urn_vigente, modelos_del_frente):
    """Que el documento se puede vincular al frente. Lanza `Negativa`.

    `nodo`: el documento como lo carga Docs ({id, name, meta: {cad: {status, urn}}}). `urn_vigente`: el URN que le
    corresponde a su versión vigente (determinista). `modelos_del_frente`: los que ya tiene."""
    if not nodo:
        raise Negativa('NO_ENCONTRADO', 'Ese documento ya no está en Docs.', 404)
    if not admite(nodo.get('name')):
        raise Negativa('FORMATO', 'El visor federa modelos RVT, DWG, DXF, NWD, NWC e IFC.')
    if not obra_del_frente or str(obra_del_frente) != str(obra_del_documento):
        raise Negativa('OTRA_OBRA', 'Ese documento es de otra obra.', 403)
    linaje = linaje_de(nodo['id'])
    if any(m.get('itemId') == linaje for m in modelos_del_frente or []):
        raise Negativa('DUPLICADO', '«%s» ya está vinculado a este frente.' % nodo.get('name'), 409)
    cad = (nodo.get('meta') or {}).get('cad') or {}
    if cad.get('status') != 'success' or cad.get('urn') != urn_vigente:
        raise Negativa('SIN_TRADUCIR', 'Su versión vigente aún no está preparada para el visor.', 409,
                       estado=cad.get('status') or 'sin_empezar')
    return linaje


def ficha(nodo, version_numero, frente, urn, vista_guid=None, vista_nombre=None, ahora=None, model_id=None):
    """La fila de `model_config` de un modelo de Docs."""
    f = {
        'id': model_id,
        'name': nodo.get('name'),
        'urn': urn,
        'source': FUENTE,
        'region': 'US',
        'projectId': None,                 # no es de ACC: nadie le pregunta a Autodesk por él
        'itemId': linaje_de(nodo['id']),
        'versionId': str(nodo.get('v_id') or nodo.get('version_id') or '') or None,
        'versionNumber': version_numero,
        'lastModifiedTime': ahora,
        'added_at': ahora,
        'appProjectId': frente,
    }
    if vista_guid:
        f['defaultViewGuid'] = vista_guid
    if vista_nombre:
        f['defaultViewName'] = vista_nombre
    return f


def comprobacion_de_version(modelo, vigente_id, vigente_numero, existe=True):
    """Lo que «Buscar actualizaciones» dice de un modelo de Docs (la misma forma que con ACC)."""
    base = {'model_id': modelo.get('id'), 'name': modelo.get('name'),
            'current_version': modelo.get('versionNumber')}
    if not existe:
        return {**base, 'has_update': False, 'reason': 'not_in_docs'}
    hay = bool(vigente_id) and str(vigente_id) != str(modelo.get('versionId') or '')
    return {**base, 'has_update': hay, 'latest_version': vigente_numero if hay else modelo.get('versionNumber'),
            'source': FUENTE}
