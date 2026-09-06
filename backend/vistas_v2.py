# -*- coding: utf-8 -*-
"""Que documento v2 SE PUEDE GUARDAR. La autoridad, en el servidor.

EL INVARIANTE
-------------
    Un documento v2 NO se persiste si todavia contiene identidad transitoria o
    sin resolver de v1.

No es una preferencia de formato: es la diferencia entre una vista que se puede
volver a abrir dentro de un ano y una que se rompe en silencio la proxima vez
que alguien suba una version del modelo.

POR QUE. EL URN DE APS LLEVA LA VERSION DENTRO
----------------------------------------------
Decodificando lo que hay en `model_config`:

    urn (base64)  ->  urn:adsk.wipprod:fs.file:vf.ub2xfj...?version=50
    item_id       ->  urn:adsk.wipprod:dm.lineage:ub2xfj...

Actualizar un modelo cambia el URN; el linaje no. Guardar un URN como identidad
es guardar «la version 50», y el dia que llegue la 51 el LMV lo descarta SIN
DECIR NADA: `restoreObjectSet` hace `if (l && !(s = this.getVisibleModel(l)))
continue`. La vista se abre, no da error, y le falta la mitad.

QUE SE RECHAZA, Y POR QUE CADA COSA
-----------------------------------
    hiddenModelUrnsV1        el nombre lo dice: es el campo de TRANSITO que
                             produce el normalizador v1->v2. Un documento que
                             todavia lo lleva no ha terminado de convertirse.
    models[].lineage nulo    un modelo sin linaje no se puede volver a encontrar
    urn de version           donde el contrato pide identidad estable
    mapa indexado por URN    `sourceColor.custom` va por urn (TandemFilterPanel:
                             `normUrn(m.urn)`), y las claves de `valueColors` son
                             `propId::valor`, de modo que las de
                             `Standard::Sources` LLEVAN UN URN DENTRO. Persistir
                             cualquiera de las dos es persistir la version.
    meta.migradoDeV1         la marca que pone el normalizador. Mientras este,
                             el documento es una lectura de una v1, no una v2.
    schemaVersion != 2       si no dice que es v2, no entra por la puerta de v2

NO SE LIMPIA NADA AUTOMATICAMENTE
---------------------------------
Tentacion evidente: borrar el campo sobrante y guardar. Seria el backend
decidiendo, sin que nadie lo vea, que parte de la vista de alguien se tira. Si
llega mal, se devuelve 422 con la lista exacta de que campo y por que, y no se
escribe una fila. Quien envia decide que hacer con eso.

EL FRONTEND TAMBIEN VALIDARA. ESTE ES EL QUE MANDA
--------------------------------------------------
Una comprobacion en el navegador es una comodidad para quien usa la aplicacion.
La autoridad esta aqui, donde no la puede saltar una peticion escrita a mano.

`Standard::Sources`: SU ESPACIO DE IDENTIDAD ES EL LINAJE
---------------------------------------------------------
Es el unico propId cuyos valores no son valores de una columna, sino MODELOS.
En runtime la seleccion viaja con el URN vigente, porque asi la produce el
producto y asi la consume el motor de facetas. Persistida, va por linaje:

    runtime      Standard::Sources = [urnVigente]
    al GUARDAR   urn    -> linaje
    persistido   Standard::Sources = [linaje]
    al RESTAURAR linaje -> urnVigente

El shape de `filters.selections` no cambia; lo que cambia es el espacio de
identidad de ESTA clave, y solo de esta. Una v1 cuyo URN de fuente ya no
resuelve pierde ESA seleccion --degradada y anotada-- en vez de arrastrar el
URN dentro de un documento v2.
"""

import base64
import json
import re

SCHEMA_VERSION = 2

# ── Limites. Existen para que el LISTADO siga siendo ligero ────────────────
# La miniatura viaja en el listado, asi que su tamano no es un detalle: una
# galeria de 14 vistas con miniaturas de medio mega pesaria mas que el listado
# completo que esta etapa acaba de quitar de en medio.
LIM_NOMBRE = 200
LIM_DESCRIPCION = 2000
LIM_MINIATURA_BYTES = 48 * 1024
LIM_ESTADO_BYTES = 2 * 1024 * 1024

# El propId que selecciona MODELOS, no valores de una columna. El contrato v2 le
# da un espacio de identidad propio --el linaje-- y por eso se nombra aparte.
PROP_SOURCES = 'Standard::Sources'

RE_LINAJE = re.compile(r'^urn:adsk\.[a-z0-9]+:dm\.lineage:[A-Za-z0-9_\-]+$')
_RE_TROZO_B64 = re.compile(r'[A-Za-z0-9_\-+/]{32,}={0,2}')
_HUELLAS_DE_VERSION = ('fs.file:vf.', '?version=')

# Prefijos de datos aceptados en una miniatura. Nada de SVG: lleva script.
MINIATURA_PREFIJOS = ('data:image/png;base64,', 'data:image/jpeg;base64,',
                      'data:image/webp;base64,')


def es_linaje(valor):
    """¿Es un identificador de LINAJE de APS (el que sobrevive al versionado)?"""
    return isinstance(valor, str) and bool(RE_LINAJE.match(valor.strip()))


def contiene_urn_de_version(texto):
    """¿Hay dentro de este texto un URN que lleve la version pegada?

    Mira las dos formas en que aparece de verdad:
      · en claro     `...fs.file:vf.xxx?version=50`
      · en base64    que es como APS lo entrega y como se guarda en la base

    Se buscan TROZOS de base64 en cualquier posicion, no solo al principio,
    porque las claves de `valueColors` son `propId::valor` y el URN va de
    valor: la clave entera no es base64, pero su cola si.
    """
    if not isinstance(texto, str) or not texto:
        return False
    if any(h in texto for h in _HUELLAS_DE_VERSION):
        return True
    for trozo in _RE_TROZO_B64.findall(texto):
        relleno = trozo + '=' * (-len(trozo) % 4)
        try:
            claro = base64.urlsafe_b64decode(relleno).decode('utf-8', 'ignore')
        except Exception:
            continue
        if any(h in claro for h in _HUELLAS_DE_VERSION):
            return True
    return False


def _mal(problemas, campo, motivo, detalle=''):
    problemas.append({'campo': campo, 'motivo': motivo, 'detalle': detalle})


def _claves_con_urn(nodo, ruta, problemas, profundidad=0):
    """Recorre el documento buscando MAPAS INDEXADOS POR URN.

    La regla es sobre las CLAVES, no sobre los valores: una clave es un indice,
    y un indice que lleva la version dentro deja de encontrar su fila en cuanto
    el modelo sube de version.
    """
    if profundidad > 12:
        return
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            if contiene_urn_de_version(k):
                _mal(problemas, '%s.%s' % (ruta, k[:60]), 'MAPA_INDEXADO_POR_URN',
                     'la clave lleva un URN con version; el indice debe ser el linaje')
            _claves_con_urn(v, '%s.%s' % (ruta, k[:40]), problemas, profundidad + 1)
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo[:500]):
            _claves_con_urn(v, '%s[%d]' % (ruta, i), problemas, profundidad + 1)


def validar_v2_persistible(state):
    """¿Se puede escribir este documento como v2?

    Devuelve `(ok, problemas)`. `problemas` es una lista de
    `{'campo', 'motivo', 'detalle'}` -- no un texto -- para que quien recibe el
    422 pueda decir QUE modelo falla, y no solo que algo falla.

    La usan POST y PUT. Las reglas viven aqui y solo aqui.
    """
    problemas = []

    if not isinstance(state, dict):
        _mal(problemas, 'state', 'NO_ES_OBJETO',
             'se esperaba un objeto JSON, llego %s' % type(state).__name__)
        return False, problemas

    # ── 1 · Se declara v2 ──────────────────────────────────────────────────
    version = state.get('schemaVersion')
    if version != SCHEMA_VERSION:
        _mal(problemas, 'state.schemaVersion', 'SCHEMA_VERSION',
             'debe ser exactamente %d, llego %r' % (SCHEMA_VERSION, version))

    # ── 2 · Tamano ─────────────────────────────────────────────────────────
    try:
        bytes_estado = len(json.dumps(state).encode('utf-8'))
    except (TypeError, ValueError) as e:
        _mal(problemas, 'state', 'NO_SERIALIZABLE', str(e)[:160])
        return False, problemas
    if bytes_estado > LIM_ESTADO_BYTES:
        _mal(problemas, 'state', 'DEMASIADO_GRANDE',
             '%d bytes; el limite es %d' % (bytes_estado, LIM_ESTADO_BYTES))

    # ── 3 · Modelos: cada uno con su linaje ────────────────────────────────
    modelos = state.get('models')
    if not isinstance(modelos, list) or not modelos:
        _mal(problemas, 'state.models', 'MODELOS_AUSENTES',
             'un documento v2 nombra los modelos a los que pertenece')
    else:
        for i, m in enumerate(modelos):
            campo = 'state.models[%d]' % i
            if not isinstance(m, dict):
                _mal(problemas, campo, 'MODELO_NO_ES_OBJETO', type(m).__name__)
                continue
            linaje = m.get('lineage')
            if linaje is None or linaje == '':
                _mal(problemas, campo + '.lineage', 'LINAJE_AUSENTE',
                     'identidad de v1 sin resolver: este modelo no se podra '
                     'reencontrar cuando cambie de version')
            elif not es_linaje(linaje):
                motivo = ('IDENTIDAD_DE_VERSION' if contiene_urn_de_version(linaje)
                          else 'LINAJE_NO_ES_LINAJE')
                _mal(problemas, campo + '.lineage', motivo,
                     'se esperaba urn:adsk.<hub>:dm.lineage:<id>')
            # Resuelto EN TIEMPO DE RESTAURACION por `aplicarRebind`. Guardarlo
            # seria guardar una version como si fuera un dato del documento.
            if m.get('urnActual'):
                _mal(problemas, campo + '.urnActual', 'IDENTIDAD_DE_VERSION',
                     'campo derivado del rebind; no se persiste')

    # ── 4 · Transito v1 ────────────────────────────────────────────────────
    filtros = state.get('filters')
    if isinstance(filtros, dict):
        if 'hiddenModelUrnsV1' in filtros:
            _mal(problemas, 'state.filters.hiddenModelUrnsV1', 'TRANSITO_V1',
                 'campo de conversion v1->v2; hay que resolverlo a '
                 '`hiddenModelLineages` y quitarlo antes de guardar')
        ocultos = filtros.get('hiddenModelLineages')
        if ocultos is not None:
            if not isinstance(ocultos, list):
                _mal(problemas, 'state.filters.hiddenModelLineages', 'TIPO',
                     'se esperaba una lista de linajes')
            else:
                for i, v in enumerate(ocultos):
                    if not es_linaje(v):
                        motivo = ('IDENTIDAD_DE_VERSION' if contiene_urn_de_version(v)
                                  else 'LINAJE_NO_ES_LINAJE')
                        _mal(problemas, 'state.filters.hiddenModelLineages[%d]' % i,
                             motivo, 'se esperaba un linaje')

    # `Standard::Sources` selecciona MODELOS, no valores de una columna, y su
    # espacio de identidad persistido es el LINAJE. En runtime la seleccion viaja
    # con el URN vigente --asi la produce el producto-- pero al guardar se
    # traduce, y al restaurar se vuelve a traducir. Sin esta regla, una vista con
    # modelos filtrados dejaba de encontrarlos en cuanto uno subia de version:
    # es el mismo fallo que el `seedUrn` del objectSet, en otro sitio.
    if isinstance(filtros, dict):
        selecciones = filtros.get('selections')
        fuentes = selecciones.get(PROP_SOURCES) if isinstance(selecciones, dict) else None
        if fuentes is not None:
            campo = "state.filters.selections['%s']" % PROP_SOURCES
            if not isinstance(fuentes, list):
                _mal(problemas, campo, 'TIPO', 'se esperaba una lista de linajes')
            else:
                for i, v in enumerate(fuentes):
                    if not es_linaje(v):
                        motivo = ('IDENTIDAD_DE_VERSION' if contiene_urn_de_version(v)
                                  else 'LINAJE_NO_ES_LINAJE')
                        _mal(problemas, '%s[%d]' % (campo, i), motivo,
                             'la seleccion de modelos se persiste por linaje: el URN '
                             'lleva la version dentro')

    meta = state.get('meta')
    if isinstance(meta, dict) and meta.get('migradoDeV1'):
        _mal(problemas, 'state.meta.migradoDeV1', 'TRANSITO_V1',
             'marca del normalizador: mientras este, el documento es la lectura '
             'de una v1, no una v2 propia')

    # ── 5 · Ningun mapa indexado por URN, en ninguna profundidad ───────────
    _claves_con_urn(state, 'state', problemas)

    return (not problemas), problemas


# El nombre con el que se pidio en la especificacion. Es un alias, no una
# segunda implementacion: las reglas viven en un solo sitio.
validarSavedViewV2Persistible = validar_v2_persistible


def validar_metadatos(nombre=None, descripcion=None, miniatura=None, obligatorio_nombre=True):
    """Nombre, descripcion y miniatura. Aparte del invariante, a proposito.

    Son dos preguntas distintas --«¿este documento se puede volver a abrir?» y
    «¿esta etiqueta cabe?»-- y mezclarlas haria que un nombre demasiado largo
    se leyera como un problema de identidad.
    """
    problemas = []
    if nombre is not None:
        if not isinstance(nombre, str) or not nombre.strip():
            _mal(problemas, 'name', 'NOMBRE_VACIO', 'una vista sin nombre no se puede elegir')
        elif len(nombre) > LIM_NOMBRE:
            _mal(problemas, 'name', 'DEMASIADO_LARGO', '%d caracteres; el limite es %d'
                 % (len(nombre), LIM_NOMBRE))
    elif obligatorio_nombre:
        _mal(problemas, 'name', 'NOMBRE_AUSENTE', 'falta el nombre')

    if descripcion is not None and descripcion != '':
        if not isinstance(descripcion, str):
            _mal(problemas, 'description', 'TIPO', 'se esperaba texto')
        elif len(descripcion) > LIM_DESCRIPCION:
            _mal(problemas, 'description', 'DEMASIADO_LARGO', '%d caracteres; el limite es %d'
                 % (len(descripcion), LIM_DESCRIPCION))

    if miniatura is not None and miniatura != '':
        if not isinstance(miniatura, str):
            _mal(problemas, 'thumbnail', 'TIPO', 'se esperaba un data URI')
        elif not miniatura.startswith(MINIATURA_PREFIJOS):
            _mal(problemas, 'thumbnail', 'FORMATO',
                 'solo data URI png, jpeg o webp (svg no: lleva script)')
        elif len(miniatura.encode('utf-8')) > LIM_MINIATURA_BYTES:
            _mal(problemas, 'thumbnail', 'DEMASIADO_GRANDE',
                 '%d bytes; el limite es %d, y existe porque la miniatura viaja '
                 'en el LISTADO' % (len(miniatura.encode('utf-8')), LIM_MINIATURA_BYTES))

    return (not problemas), problemas


def cuerpo_de_rechazo(problemas, mensaje='El documento no se puede guardar como v2.'):
    """El cuerpo del 422. Estructurado: quien lo recibe tiene que poder actuar."""
    return {
        'error': mensaje,
        'code': 'V2_NO_PERSISTIBLE',
        'problemas': problemas,
    }
