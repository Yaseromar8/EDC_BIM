# -*- coding: utf-8 -*-
"""GAP 05 · LA ESPECIFICACION COMO OBJETO — contra qué se aprueba un material.

LA PREGUNTA QUE ESTE OBJETO RESPONDE
-------------------------------------
    ¿QUÉ EXIGE EL PROYECTO PARA ESTO, Y EN QUÉ REVISIÓN LO EXIGE?

Hoy las especificaciones son PDF sueltos dentro del expediente. Eso basta para
guardarlas y no basta para lo único que de verdad se les pide en obra: que un
submittal diga **contra qué** se está aprobando un material, y que ese «contra
qué» siga siendo citable cuando la especificación se revise.

LO QUE EL BENCHMARK CONGELADO (docs/82 §4.5) PIDE
--------------------------------------------------
Los dos fabricantes tienen: **divisiones y secciones**, **OCR al subir**, **sets
con revisiones**, y en Procore **generar submittals desde la sección**. Eso
último es la razón por la que este gap está detrás de GAP 01 y no delante: sin
submittals, una especificación estructurada no habilita nada.

POR QUE NO ES UN SEGUNDO ALMACEN
---------------------------------
Igual que los planos: cada revisión APUNTA a un `file_version` que ya vive en el
expediente, con su carpeta, su permiso y su SHA-256. La especificación no se
copia a ningún sitio.

LA MECANICA NO VIVE AQUI
-------------------------
Numerar la serie, superar la vigente e insertar la nueva es lo mismo que hace un
plano, y vive en `revisiones_de_documento`. Aquí queda solo lo que es PROPIO de
una especificación: la división a la que pertenece, cómo se lee su encabezado, y
qué submittal genera.

LO QUE NO ESTA, A PROPOSITO
----------------------------
    · Comparación de revisiones palabra por palabra. Se ve el antes y el
      después como documentos; no se marca el cambio. Es trabajo de otro gap.
    · Extracción automática de la tabla de contenidos para crear todas las
      secciones de golpe. El OCR sugiere UNA sección por documento.
"""

import collections
import logging
import re

import revisiones_de_documento as rev

logger = logging.getLogger('especificaciones')

# La mecánica de revisión, tal cual. Se reexporta para que las rutas de
# especificaciones no tengan que conocer dos módulos.
SECCION = rev.SECCION
VIGENTE = rev.VIGENTE
SUPERADA = rev.SUPERADA
ANULADA = rev.ANULADA
ESTADOS_REVISION = rev.ESTADOS
siguiente_revision = rev.siguiente_revision


# ── LAS DIVISIONES ─────────────────────────────────────────────────────────
#
# NO son una lista cerrada del código, y esa es una decisión.
#
# Los dos fabricantes usan MasterFormat (divisiones 00 a 48), que es el estándar
# norteamericano. En obra pública peruana la estructura que manda es la del
# PRESUPUESTO --partidas 01, 02, 03…-- porque es contra ella contra la que se
# valoriza. Imponer MasterFormat obligaría a la entidad a mantener dos
# estructuras paralelas para el mismo proyecto.
#
# Así que las divisiones son DATOS DE LA OBRA: el contrato fija la estructura, no
# la plataforma. Lo que sí damos es el catálogo estándar SUGERIDO, para que
# crearlas sea un clic y no un dictado.
Division = collections.namedtuple('Division', ('numero', 'titulo'))

CATALOGO_SUGERIDO = (
    Division('00', 'Condiciones de contratación'),
    Division('01', 'Requisitos generales'),
    Division('02', 'Trabajos preliminares y demoliciones'),
    Division('03', 'Concreto'),
    Division('04', 'Albañilería'),
    Division('05', 'Metales'),
    Division('06', 'Madera y plásticos'),
    Division('07', 'Protección térmica y humedad'),
    Division('08', 'Puertas y ventanas'),
    Division('09', 'Acabados'),
    Division('10', 'Especialidades'),
    Division('11', 'Equipamiento'),
    Division('12', 'Mobiliario'),
    Division('13', 'Construcciones especiales'),
    Division('14', 'Sistemas de transporte'),
    Division('21', 'Protección contra incendios'),
    Division('22', 'Instalaciones sanitarias'),
    Division('23', 'Climatización y ventilación'),
    Division('26', 'Instalaciones eléctricas'),
    Division('27', 'Comunicaciones'),
    Division('28', 'Seguridad electrónica'),
    Division('31', 'Movimiento de tierras'),
    Division('32', 'Obras exteriores'),
    Division('33', 'Redes exteriores'),
    Division('34', 'Transporte'),
    Division('35', 'Obras hidráulicas y marítimas'),
)


def normalizar_division(numero):
    """'3' y '03' son la misma división. '3.1' no es una división: es una sección."""
    n = re.sub(r'[^0-9]', '', str(numero or ''))
    if not n:
        return ''
    return n.zfill(2)[:2]


def titulo_sugerido(numero):
    n = normalizar_division(numero)
    for d in CATALOGO_SUGERIDO:
        if d.numero == n:
            return d.titulo
    return None


# ── EL NUMERO DE SECCION ───────────────────────────────────────────────────
#
# Dos convenciones conviven, y las dos son legítimas:
#
#     MasterFormat   03 30 00      (tres pares, separados por espacio)
#     Partida        03.02.01      (niveles separados por punto)
#
# No se impone una. Se normaliza cada una EN SU PROPIA FORMA, para que
# '03 30 00', '033000' y '03-30-00' sean la misma sección, sin convertir una
# convención en la otra -- convertirlas sería inventarle al contrato una
# codificación que no usa.

_MASTERFORMAT = re.compile(r'^(\d{2})[\s\-]?(\d{2})[\s\-]?(\d{2})$')
_PARTIDA = re.compile(r'^(\d{1,2})(?:\.(\d{1,2}))+$')


def normalizar_seccion(numero):
    crudo = re.sub(r'\s+', ' ', str(numero or '').strip())
    if not crudo:
        return ''
    compacto = crudo.replace(' ', '').replace('-', '')
    m = _MASTERFORMAT.match(compacto)
    if m and '.' not in crudo:
        return '%s %s %s' % m.groups()
    if _PARTIDA.match(crudo):
        return '.'.join(p.zfill(2) for p in crudo.split('.'))
    return crudo.upper()


def division_de(numero_seccion):
    """La división a la que pertenece una sección, deducida de su número.

    Es una SUGERENCIA. Quien crea la sección elige la división; esto solo evita
    tener que teclearla cuando el número ya la dice.
    """
    n = normalizar_seccion(numero_seccion)
    m = re.match(r'^(\d{2})', n)
    return m.group(1) if m else None


# ── LECTURA DEL ENCABEZADO ─────────────────────────────────────────────────
#
# El equivalente al cajetín del plano, pero una especificación no tiene cajetín:
# tiene un ENCABEZADO en la primera página. Se busca ahí, no en todo el
# documento -- una especificación de 40 páginas menciona docenas de números que
# se parecen a una sección.

_SECCION_EN_TEXTO = re.compile(
    r'(?:SECCI[OÓ]N|SECTION|PARTIDA|[EÍI]TEM)\s*[:\-]?\s*'
    r'(\d{2}[\s\-]?\d{2}[\s\-]?\d{2}|\d{1,2}(?:\.\d{1,2})+)', re.I)
_SECCION_SUELTA = re.compile(r'\b(\d{2}\s\d{2}\s\d{2})\b')
_REVISION = re.compile(r'\b(?:REV|REVISI[OÓ]N|REV\.)\s*[:\-]?\s*([A-Z]|\d{1,2})\b', re.I)


def leer_encabezado(pdf_bytes, pagina=0):
    """Extrae número de sección, revisión y título probables. Todo opcional.

    DEVUELVE SUGERENCIAS, NUNCA VERDAD. Quien crea la sección confirma o
    corrige. Y si el PDF es un escaneo sin capa de texto, lo dice
    (`tiene_texto: False`) en vez de devolver campos vacíos que parecen un
    documento mal rellenado.
    """
    sugerencia = {'numero': None, 'revision': None, 'titulo': None,
                  'division': None, 'tiene_texto': False}
    try:
        import fitz
    except ImportError:
        logger.warning('[specs] PyMuPDF no disponible: sin lectura de encabezado')
        return sugerencia

    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        if doc.page_count == 0:
            return sugerencia
        pag = doc[min(pagina, doc.page_count - 1)]
        r = pag.rect
        # El tercio superior: donde vive el encabezado de una especificación.
        arriba = fitz.Rect(r.x0, r.y0, r.x1, r.y0 + r.height * 0.34)
        texto_arriba = pag.get_text('text', clip=arriba) or ''
        texto_todo = pag.get_text('text') or ''
        doc.close()
    except Exception as e:
        logger.warning('[specs] no se pudo leer el PDF: %s', str(e)[:120])
        return sugerencia

    sugerencia['tiene_texto'] = bool(texto_todo.strip())
    if not sugerencia['tiene_texto']:
        return sugerencia

    for fuente in (texto_arriba, texto_todo):
        if not sugerencia['numero']:
            m = _SECCION_EN_TEXTO.search(fuente) or _SECCION_SUELTA.search(fuente)
            if m:
                sugerencia['numero'] = normalizar_seccion(m.group(1))
        if not sugerencia['revision']:
            m = _REVISION.search(fuente)
            if m:
                sugerencia['revision'] = m.group(1).upper()

    if sugerencia['numero']:
        sugerencia['division'] = division_de(sugerencia['numero'])

    # El título: la línea más larga del encabezado que no sea el propio número
    # ni una fecha. Heurística declarada; por eso es sugerencia y no dato.
    lineas = [l.strip() for l in texto_arriba.splitlines() if len(l.strip()) > 6]
    num = (sugerencia['numero'] or '').replace(' ', '')
    lineas = [l for l in lineas
              if l.replace(' ', '').upper() != num
              and not re.match(r'^[\d/\-\.\s]+$', l)]
    if lineas:
        sugerencia['titulo'] = max(lineas, key=len)[:200]

    return sugerencia


# ── LO QUE ESTE GAP EXISTE PARA HABILITAR ──────────────────────────────────

def submittal_desde_seccion(seccion, revision=None):
    """Los campos con los que nace un submittal generado desde la sección.

    NO crea nada: devuelve el dato. La creación pasa por el manejador de
    submittals de GAP 01, con sus permisos y su flujo -- un submittal que
    naciera por un camino paralelo se saltaría el veredicto y la BIC, y esa es
    justamente la parte que hace que un submittal valga algo.

    La referencia apunta a la SECCION, no a la revisión: un submittal se somete
    contra «03 30 00 Concreto», y cuando esa sección se revise el submittal
    tiene que seguir apuntando a la exigencia, no a un soporte superado. Cuál
    era la revisión vigente ese día se reconstruye por fecha.
    """
    titulo = 'Sometimiento contra %s' % (seccion.get('numero') or 'la especificación')
    if seccion.get('titulo'):
        titulo = '%s — %s' % (titulo, seccion['titulo'])
    return {
        'spec_section_id': seccion.get('id'),
        'spec_seccion': seccion.get('numero'),
        'spec_titulo': seccion.get('titulo'),
        'titulo': titulo[:180],
        'descripcion': ('Generado desde la especificación %s%s.'
                        % (seccion.get('numero') or '',
                           (', revisión %s' % revision) if revision else '')),
    }
