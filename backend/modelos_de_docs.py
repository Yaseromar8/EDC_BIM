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

  · UNA VERSIÓN QUE SE VE POR AUTODESK DOCS SE VINCULA POR AUTODESK DOCS (13-nov-2026). Una carpeta de Docs puede
    tener el «puente ACC» (acc_emergency_bridge.py): sus CAD se copian a Autodesk Docs y es Autodesk quien los
    prepara; Docs guarda en la versión el enlace (`acc_link`: proyecto, pieza, versión y URN de ACC). Esa versión
    no tiene traducción propia, y lanzarla sería prepararla dos veces. Se vincula con lo que ES para el visor: un
    modelo de ACC (`source = 'DOCS'`, su `itemId` es el linaje de ACC), con los datos del enlace, que pone el
    servidor. Así no se abre ningún contrato cerrado: la identidad del inventario y de las vistas guardadas sale
    del URN de ACC como con cualquier modelo de ACC, y «Buscar actualizaciones» pregunta a Autodesk, donde el
    puente deja cada versión nueva que se sube a Docs.

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


def comprobacion_de_version(modelo, vigente_id, vigente_numero, existe=True, visible=True):
    """Lo que «Buscar actualizaciones» dice de un modelo de Docs (la misma forma que con ACC)."""
    base = {'model_id': modelo.get('id'), 'name': modelo.get('name'), 'urn': modelo.get('urn'),
            'current_version': modelo.get('versionNumber'), 'source': FUENTE}
    if not existe:
        return {**base, 'has_update': False, 'reason': 'not_in_docs'}
    if not visible:
        # Quien no ve el documento en Docs no se entera de sus versiones.
        return {**base, 'has_update': False, 'reason': 'forbidden'}
    hay = bool(vigente_id) and str(vigente_id) != str(modelo.get('versionId') or '')
    return {**base, 'has_update': hay, 'latest_version': vigente_numero if hay else modelo.get('versionNumber')}


# ── POR AUTODESK DOCS: la versión se ve por el puente de su carpeta (o por un vínculo manual) ──────────────────

FUENTE_ACC = 'DOCS'                                   # Docs de AUTODESK: así llama `model_config` a un modelo de ACC
_LINAJE_ACC = re.compile(r'^urn:adsk\.[a-z0-9]+:dm\.lineage:[A-Za-z0-9_-]+$')
_VERSION_ACC = re.compile(r'^urn:adsk\.[a-z0-9]+:fs\.file:vf\.[A-Za-z0-9_-]+\?version=(\d+)$')
_URN_DE_VISOR = re.compile(r'^[A-Za-z0-9_-]{16,}$')


def numero_de_version_acc(version_id):
    """El número de una versión de ACC (`…?version=3` → 3), o None."""
    m = _VERSION_ACC.match(str(version_id or ''))
    return int(m.group(1)) if m else None


def enlace_acc_completo(enlace):
    """¿Trae el enlace todo lo que hace falta para vincular por ACC, con la forma de ACC?"""
    e = enlace if isinstance(enlace, dict) else {}
    return bool(e.get('project_id')
                and _LINAJE_ACC.match(str(e.get('item_id') or ''))
                and _VERSION_ACC.match(str(e.get('version_id') or ''))
                and _URN_DE_VISOR.match(str(e.get('viewer_urn') or '')))


def comprobar_por_acc(nodo, obra_del_frente, obra_del_documento, enlace, modelos_del_frente):
    """Que el documento, que se ve por Autodesk Docs, se puede vincular al frente. Lanza `Negativa`.

    Las mismas preguntas que `comprobar` (existe, formato, misma obra, no dos veces), y en lugar de «¿está
    traducido?», «¿está completo su enlace con ACC?». Duplicado: la misma pieza de ACC, entrara por esta pestaña o
    por la de Autodesk Docs."""
    if not nodo:
        raise Negativa('NO_ENCONTRADO', 'Ese documento ya no está en Docs.', 404)
    if not admite(nodo.get('name')):
        raise Negativa('FORMATO', 'El visor federa modelos RVT, DWG, DXF, NWD, NWC e IFC.')
    if not obra_del_frente or str(obra_del_frente) != str(obra_del_documento):
        raise Negativa('OTRA_OBRA', 'Ese documento es de otra obra.', 403)
    if not enlace_acc_completo(enlace):
        raise Negativa('ENLACE_ACC_INCOMPLETO',
                       'El enlace de este documento con Autodesk Docs está incompleto. Ábrelo en Docs para revisarlo.',
                       409)
    repetido = next((m for m in modelos_del_frente or []
                     if m.get('itemId') == enlace['item_id'] or m.get('urn') == enlace['viewer_urn']), None)
    if repetido:
        raise Negativa('DUPLICADO', '«%s» ya está vinculado a este frente.' % (repetido.get('name') or nodo.get('name')),
                       409)
    return enlace['item_id']


def ficha_por_acc(nodo, enlace, frente, vista_guid=None, vista_nombre=None, ahora=None, model_id=None):
    """La fila de `model_config` de un modelo de Docs que se ve por Autodesk Docs: la de un modelo de ACC."""
    f = {
        'id': model_id,
        'name': nodo.get('name'),
        'urn': enlace['viewer_urn'],
        'source': FUENTE_ACC,
        'region': 'US',
        'projectId': enlace['project_id'],
        'itemId': enlace['item_id'],
        'versionId': enlace['version_id'],
        'versionNumber': enlace.get('version_number') or numero_de_version_acc(enlace['version_id']),
        'lastModifiedTime': ahora,
        'added_at': ahora,
        'appProjectId': frente,
    }
    if vista_guid:
        f['defaultViewGuid'] = vista_guid
    if vista_nombre:
        f['defaultViewName'] = vista_nombre
    return f


def espera_del_puente(estado):
    """Qué decirle a quien quiere vincular una versión cuyo puente con Autodesk Docs aún no terminó. `estado`: el del
    trabajo del puente ({status, error, paused}) o None."""
    e = estado if isinstance(estado, dict) else {}
    if e.get('paused'):
        return 'El puente con Autodesk Docs está en pausa: esta versión todavía no se puede vincular.'
    if e.get('status') == 'error':
        return ('Autodesk Docs no pudo preparar esta versión%s Revísala en Docs.'
                % ((': %s.' % str(e['error']).rstrip('.')) if e.get('error') else '.'))
    return 'Autodesk Docs aún está preparando esta versión. Vuelve a intentarlo en unos minutos.'
