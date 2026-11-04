# -*- coding: utf-8 -*-
"""VISTAS DE APERTURA DE UN CAD O UN PDF POR CARPETA (5-nov-2026, docs/archivos/28, migración 49).

El mismo documento, abierto desde carpetas distintas, abre en la vista que se fijó para cada una: el original en su
carpeta y cada enlace (migración 48) en la suya. El dueño: «si es un archivo enlazado en distintas carpetas, y esas
carpetas representan distintas vistas»; y «también en PDF, porque un PDF puede tener varias hojas».
  · CAD (DWG, DXF): la presentación (Model o un Layout) y la cámara del visor.
  · PDF: la página, el zoom (relativo a la hoja entera, así vale en cualquier pantalla) y el punto de la hoja que queda
    en el centro.

Las reglas, y por qué:
  · La carpeta tiene que ser la del documento o una que lo enlaza: no se fija una vista donde el documento no se ve.
  · Leer pide «Ver» en el documento. Fijar o restablecer pide además «Editar» en ESA carpeta: es decidir cómo lo ve
    todo el que entra por ella, como enlazar.
  · Lo que se guarda se valida aquí, campo a campo: la presentación (guid, nombre, viewable_id) y la cámara del visor
    con sus números (finitos) y nada más. Lo demás se descarta; no se guarda lo que manda el cliente tal cual.
  · Se guarda la versión en la que se fijó. Al abrir otra, el visor busca la presentación por su nombre; si ya no
    está, abre la vista por defecto y lo dice (eso lo decide el visor, que es quien ve las presentaciones).
  · Quitar el enlace quita su vista. Purgar el documento o la carpeta, también (ON DELETE CASCADE).

Este módulo valida y escribe con el cursor que le dan; la ruta comprueba sesión, obra y permisos.
"""
import json
import math
import re

ES_CAD = re.compile(r'\.(dwg|dxf)$', re.IGNORECASE)
ES_PDF = re.compile(r'\.pdf$', re.IGNORECASE)
TOPE_PAGINA = 100000
TOPE_ZOOM = 1000.0
TOPE_BYTES = 8192

# La cámara de Autodesk Viewer (`viewer.getState({viewport: true}).viewport`): estos campos y ningún otro.
_VECTORES = ('eye', 'target', 'up', 'worldUpVector', 'pivotPoint')
_NUMEROS = ('distanceToOrbit', 'aspectRatio', 'orthographicHeight', 'fieldOfView')
_TEXTOS = {'name': 128, 'projection': 16}
_BOOLEANOS = ('isOrthographic',)


class Negativa(Exception):
    """Por qué no se puede: un código, el texto para la persona y su código HTTP."""
    def __init__(self, codigo, texto, http=400):
        super().__init__(texto)
        self.codigo, self.texto, self.http = codigo, texto, http


def hay_tabla(cur):
    """¿Está aplicada la migración 49? Sin ella el CAD abre como siempre."""
    cur.execute("SELECT to_regclass('public.doc_vistas_de_apertura')")
    fila = cur.fetchone()
    return bool(fila and fila[0])


def _numero(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    return float(v)


def _texto(v, tope, obligatorio=False):
    # Un texto opcional vacío (la cámara del visor trae `name: ''`) es como no traerlo.
    if not obligatorio and (v is None or v == ''):
        return None
    if not isinstance(v, str) or not v.strip() or len(v) > tope:
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    return v.strip()


def tipo_de(nombre):
    """'cad', 'pdf' o None: de qué documentos hay vista de apertura."""
    if ES_CAD.search(nombre or ''):
        return 'cad'
    if ES_PDF.search(nombre or ''):
        return 'pdf'
    return None


def validar(vista, nombre):
    """La vista limpia, según el documento (`nombre`), o `Negativa`. Lo que no es de una vista se descarta."""
    if not isinstance(vista, dict):
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    if tipo_de(nombre) == 'pdf':
        return _validar_pdf(vista)
    if tipo_de(nombre) != 'cad':
        raise Negativa('NO_ADMITE_VISTA', 'La vista de apertura es para planos CAD (DWG o DXF) y PDF.')
    p = vista.get('presentacion')
    c = vista.get('camara')
    if not isinstance(p, dict) or not isinstance(c, dict):
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    presentacion = {'guid': _texto(p.get('guid'), 128, True), 'nombre': _texto(p.get('nombre'), 200, True)}
    viewable = _texto(p.get('viewable_id'), 128)
    if viewable is not None:
        presentacion['viewable_id'] = viewable
    camara = {}
    for k in _VECTORES:
        if k in c:
            if not isinstance(c[k], list) or len(c[k]) != 3:
                raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
            camara[k] = [_numero(x) for x in c[k]]
    for k in _NUMEROS:
        if k in c and c[k] is not None:
            camara[k] = _numero(c[k])
    for k, tope in _TEXTOS.items():
        texto = _texto(c.get(k), tope)
        if texto is not None:
            camara[k] = texto
    for k in _BOOLEANOS:
        if k in c:
            if not isinstance(c[k], bool):
                raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
            camara[k] = c[k]
    if 'eye' not in camara or 'target' not in camara:
        raise Negativa('VISTA_INVALIDA', 'La vista no trae el encuadre.')
    limpia = {'tipo': 'cad', 'presentacion': presentacion, 'camara': camara}
    if len(json.dumps(limpia)) > TOPE_BYTES:
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    return limpia


def _validar_pdf(vista):
    """{tipo: 'pdf', pagina, zoom, centro: [fx, fy]}: la página (desde 1), el zoom relativo a la hoja entera y el
    punto de la hoja (en fracción de su ancho y alto) que queda en el centro de la pantalla."""
    pagina = vista.get('pagina')
    if isinstance(pagina, bool) or not isinstance(pagina, int) or not 1 <= pagina <= TOPE_PAGINA:
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    zoom = _numero(vista.get('zoom'))
    if not 0 < zoom <= TOPE_ZOOM:
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    centro = vista.get('centro')
    if not isinstance(centro, list) or len(centro) != 2:
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    fx, fy = (_numero(x) for x in centro)
    if not (-1 <= fx <= 2 and -1 <= fy <= 2):
        raise Negativa('VISTA_INVALIDA', 'La vista no es válida.')
    return {'tipo': 'pdf', 'pagina': pagina, 'zoom': zoom, 'centro': [fx, fy]}


def contexto(cur, model_urn, documento_id, carpeta_id=None):
    """(nombre, carpeta, version_vigente) del documento visto DESDE esa carpeta, o `Negativa`.

    Sin carpeta, la suya. La carpeta tiene que ser la suya o una que lo enlaza (migración 48)."""
    cur.execute("""SELECT name, node_type, parent_id::text, current_version_id::text FROM file_nodes
                    WHERE id = %s AND model_urn = %s AND is_deleted = FALSE""", (str(documento_id), model_urn))
    fila = cur.fetchone()
    if not fila or fila[1] != 'FILE':
        raise Negativa('NO_ENCONTRADO', 'Documento no encontrado en esta obra.', 404)
    nombre, _tipo, padre, version = fila
    if not tipo_de(nombre):
        raise Negativa('NO_ADMITE_VISTA', 'La vista de apertura es para planos CAD (DWG o DXF) y PDF.')
    carpeta = str(carpeta_id or padre or '')
    if not carpeta:
        raise Negativa('SIN_CARPETA', 'El documento no está en ninguna carpeta.')
    if carpeta != padre:
        import enlaces_de_documentos as enl
        enlazado = False
        if enl.hay_tabla(cur):
            cur.execute("""SELECT 1 FROM doc_enlaces e JOIN file_nodes c ON c.id = e.carpeta_id AND c.is_deleted = FALSE
                            WHERE e.documento_id = %s AND e.carpeta_id = %s""", (str(documento_id), carpeta))
            enlazado = cur.fetchone() is not None
        if not enlazado:
            raise Negativa('NO_ESTA_AQUI', 'El documento no está en esa carpeta ni enlazado en ella.', 404)
    return nombre, carpeta, version


def leer(cur, documento_id, carpeta_id):
    """{vista, version_id, fijada_por, fijada_en} o None."""
    if not hay_tabla(cur):
        return None
    cur.execute("""SELECT v.vista, v.version_id::text, u.name, v.fijada_en
                     FROM doc_vistas_de_apertura v LEFT JOIN users u ON u.id = v.fijada_por
                    WHERE v.documento_id = %s AND v.carpeta_id = %s""", (str(documento_id), str(carpeta_id)))
    f = cur.fetchone()
    if not f:
        return None
    vista = f[0] if isinstance(f[0], dict) else json.loads(f[0])
    return {'vista': vista, 'version_id': f[1], 'fijada_por': f[2],
            'fijada_en': f[3].isoformat() if f[3] else None}


def fijar(cur, model_urn, documento_id, carpeta_id, vista, version_id, quien):
    """Guarda (o sustituye) la vista de apertura de ese documento en esa carpeta. `vista` ya validada."""
    if not hay_tabla(cur):
        raise Negativa('SIN_MIGRACION', 'La vista de apertura aún no está disponible en esta obra.', 503)
    cur.execute("""INSERT INTO doc_vistas_de_apertura (documento_id, carpeta_id, model_urn, vista, version_id, fijada_por)
                   VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                   ON CONFLICT (documento_id, carpeta_id) DO UPDATE
                      SET vista = EXCLUDED.vista, version_id = EXCLUDED.version_id,
                          fijada_por = EXCLUDED.fijada_por, fijada_en = now()""",
                (str(documento_id), str(carpeta_id), model_urn, json.dumps(vista), version_id, quien))


def quitar(cur, documento_id, carpeta_id):
    """Restablece la vista por defecto. Devuelve si había una fijada."""
    if not hay_tabla(cur):
        return False
    cur.execute('DELETE FROM doc_vistas_de_apertura WHERE documento_id = %s AND carpeta_id = %s',
                (str(documento_id), str(carpeta_id)))
    return cur.rowcount > 0
