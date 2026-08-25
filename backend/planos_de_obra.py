# -*- coding: utf-8 -*-
"""GAP 02 · EL PLANO COMO OBJETO — identidad sobre ficheros que ya existen.

QUE ES UN PLANO AQUI, Y QUE NO ES
----------------------------------
Un plano NO es un PDF. Un PDF es el soporte; el plano es la IDENTIDAD que
sobrevive a sus soportes:

    PL-EST-104   «Encofrado de losa, eje 4»       ← el plano. No cambia nunca.
      rev A  ->  fichero X   (superada)
      rev B  ->  fichero Y   (superada)
      rev C  ->  fichero Z   (VIGENTE)

Hoy en ALEPHIA un plano es un fichero suelto dentro del expediente, y por eso
no se puede responder la pregunta que en obra se hace cien veces al dia:

    ¿CUAL ES LA REVISION VIGENTE DE PL-EST-104, Y QUE MIRABA
    EL QUE FIRMO ESTA OBSERVACION HACE TRES MESES?

NO SE CREA UN SEGUNDO ALMACEN. ESTO ES LO IMPORTANTE
-----------------------------------------------------
Cada revision APUNTA a un `file_version` que ya vive en el expediente, con su
carpeta, su permiso, su SHA-256 y su historia. El plano no copia el fichero ni
lo mueve.

Consecuencia que vale mas que el ahorro de espacio: **el permiso de recurso se
hereda solo**. Un plano se ve si su fichero se ve — no hay una segunda regla de
acceso que mantener sincronizada con `folder_permissions`, y por tanto no hay
forma de que las dos discrepen. Capa 09 sigue siendo la unica autoridad sobre
quien alcanza que documento.

    file_nodes / file_versions   EL DOCUMENTO      (donde ya estaba)
    doc_planos                   LA IDENTIDAD      (numero y titulo)
    doc_plano_revisiones         QUE SOPORTE VALE  (y cual quedo superado)
    doc_plano_sets               EL ACTO DE EMITIR (una entrega, con fecha)

LA REVISION VIGENTE ES UNA SOLA, Y LO GARANTIZA LA BASE
--------------------------------------------------------
Dos revisiones vigentes del mismo plano es el peor estado posible: significa
que en obra hay gente construyendo contra soportes distintos y nadie lo sabe.
No se confia en que el codigo lo respete — hay un indice unico parcial.

SUPERAR NO ES BORRAR
---------------------
Una revision superada se conserva entera y sigue siendo consultable. Es lo que
permite responder «que decia el plano cuando se levanto esta observacion», que
es una pregunta de obra publica, no una curiosidad.

EL CAJETIN SE LEE, PERO NO MANDA
---------------------------------
Los dos fabricantes anuncian OCR que rellena numero y titulo. Aqui se extrae el
TEXTO del PDF (PyMuPDF), que en un plano exportado de CAD o Revit es exacto —
no es un reconocimiento probabilistico, es el texto real. Pero lo extraido se
ofrece como SUGERENCIA y lo confirma una persona: un numero de plano mal leido
se propaga a las observaciones, a los submittals y al acta de recepcion, y para
cuando se nota ya esta en un documento firmado.

Un plano ESCANEADO no tiene capa de texto: ahi la sugerencia sale vacia y se
teclea. Se dice, en vez de fingir que funciona siempre.
"""

import re

from app_logging import get_logger

logger = get_logger('planos')

# ── ESTADO DE UNA REVISION. Lista cerrada ──────────────────────────────────
VIGENTE = 'Vigente'
SUPERADA = 'Superada'
ANULADA = 'Anulada'          # se emitio por error; nunca fue valida
ESTADOS_REVISION = (VIGENTE, SUPERADA, ANULADA)

# ── DISCIPLINAS. Lista cerrada, como las funciones contractuales ───────────
#
# No es texto libre a proposito: 'EST', 'Estructuras' y 'ESTRUCT.' tecleados por
# tres personas distintas convierten el filtro por disciplina en un adorno.
DISCIPLINAS = (
    ('ARQ', 'Arquitectura'),
    ('EST', 'Estructuras'),
    ('SAN', 'Sanitarias'),
    ('ELE', 'Electricas'),
    ('MEC', 'Mecanicas'),
    ('CIV', 'Obras civiles'),
    ('VIA', 'Viales y drenaje'),
    ('TOP', 'Topografia'),
    ('GEN', 'General'),
)
CODIGOS_DISCIPLINA = tuple(c for c, _ in DISCIPLINAS)


def etiqueta_disciplina(codigo):
    for c, e in DISCIPLINAS:
        if c == codigo:
            return e
    return codigo or ''


# ── LECTURA DEL CAJETIN ────────────────────────────────────────────────────
#
# Patrones de numero de plano tal como se usan en obra publica peruana y en los
# ficheros reales de este proyecto (500125-SP-OT-GEN-RFI-003 y similares):
# bloques alfanumericos separados por guion, con al menos un bloque numerico.
_PATRON_NUMERO = re.compile(
    r'\b([A-Z0-9]{2,}(?:-[A-Z0-9]{1,}){2,})\b'
)
# Una revision suele ser una letra sola o dos digitos, junto a la palabra.
_PATRON_REVISION = re.compile(
    r'\b(?:REV|REVISION|REV\.)\s*[:\-]?\s*([A-Z]|\d{1,2})\b', re.I
)


def leer_cajetin(pdf_bytes, pagina=0):
    """Extrae numero, revision y titulo probables del cajetin. Todo opcional.

    DEVUELVE SUGERENCIAS, NUNCA VERDAD. Quien crea el plano confirma o corrige.

    El cajetin vive por convencion en el cuarto inferior derecho de la lamina.
    Se busca ahi primero y en toda la pagina despues: acertar el sitio habitual
    da un resultado mucho mas limpio que barrer el plano entero, donde cualquier
    cota con guiones se parece a un numero de plano.
    """
    sugerencia = {'numero': None, 'revision': None, 'titulo': None,
                  'tiene_texto': False}
    try:
        import fitz
    except ImportError:
        logger.warning('[planos] PyMuPDF no disponible: sin lectura de cajetin')
        return sugerencia

    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        if doc.page_count == 0:
            return sugerencia
        pag = doc[min(pagina, doc.page_count - 1)]
        r = pag.rect
        # Cuarto inferior derecho.
        cajetin = fitz.Rect(r.x0 + r.width * 0.55, r.y0 + r.height * 0.62, r.x1, r.y1)
        texto_cajetin = pag.get_text('text', clip=cajetin) or ''
        texto_todo = pag.get_text('text') or ''
        doc.close()
    except Exception as e:
        logger.warning('[planos] no se pudo leer el PDF: %s', str(e)[:120])
        return sugerencia

    sugerencia['tiene_texto'] = bool(texto_todo.strip())
    if not sugerencia['tiene_texto']:
        # Plano ESCANEADO: no hay capa de texto que leer. Se dice, no se finge.
        return sugerencia

    for fuente in (texto_cajetin, texto_todo):
        if not sugerencia['numero']:
            m = _PATRON_NUMERO.search(fuente.upper())
            if m:
                sugerencia['numero'] = m.group(1)
        if not sugerencia['revision']:
            m = _PATRON_REVISION.search(fuente)
            if m:
                sugerencia['revision'] = m.group(1).upper()

    # El titulo: la linea mas larga del cajetin que no sea el propio numero ni
    # una fecha. Heuristica declarada; por eso es sugerencia y no dato.
    lineas = [l.strip() for l in texto_cajetin.splitlines() if len(l.strip()) > 6]
    lineas = [l for l in lineas
              if l.upper() != (sugerencia['numero'] or '')
              and not re.match(r'^[\d/\-\.\s]+$', l)]
    if lineas:
        sugerencia['titulo'] = max(lineas, key=len)[:200]

    return sugerencia


# ── NUMERACION ────────────────────────────────────────────────────────────

def normalizar_numero(numero):
    """El numero de plano es una IDENTIDAD: se normaliza para que 'pl-est-104',
    'PL-EST-104 ' y 'PL EST 104' no sean tres planos distintos."""
    if not numero:
        return ''
    return re.sub(r'[\s_]+', '-', str(numero).strip().upper()).strip('-')


def siguiente_revision(codigos_existentes):
    """La siguiente revision de la serie, respetando la que ya se use.

    Dos convenciones conviven en obra publica: letras (A, B, C…) y numeros
    (00, 01, 02…). No se impone una: se continua LA QUE EL PLANO YA USA, porque
    la convencion la fija el contrato, no la plataforma.
    """
    codigos = [str(c).strip().upper() for c in (codigos_existentes or []) if c]
    if not codigos:
        return 'A'
    numericos = [c for c in codigos if c.isdigit()]
    if numericos and len(numericos) == len(codigos):
        return '%02d' % (max(int(c) for c in numericos) + 1)
    letras = [c for c in codigos if len(c) == 1 and c.isalpha()]
    if letras:
        ultima = max(letras)
        if ultima != 'Z':
            return chr(ord(ultima) + 1)
    # Serie que no encaja en ninguna convencion: no se adivina.
    return None
