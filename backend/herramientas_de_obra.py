# -*- coding: utf-8 -*-
"""CAPA 16 · TOOL ACTIVATION — qué herramientas EXISTEN en una obra.

LA PREGUNTA QUE RESPONDE ESTA CAPA, Y SOLO ESA
----------------------------------------------
    ¿ESTA HERRAMIENTA ESTÁ HABILITADA EN ESTA OBRA?

No pregunta quién eres. No mira tu membresía, ni tu empresa, ni tu función
contractual, ni tus permisos de carpeta, ni tu perfil del sistema. Una
herramienta apagada está apagada PARA LA OBRA ENTERA:

    TOOL OFF  →  nadie del proyecto puede usarla,
                 no importa qué acceso personal tenga.

Eso incluye al Entity Admin. Un administrador que necesita la herramienta la
ENCIENDE (acto explícito y auditado) y entonces la usa; no la atraviesa por
ser quien es. Si pudiera atravesarla, «apagada» no significaría nada y la
capa sería decorativa.

DÓNDE SE APLICA: en el middleware, en el MISMO punto donde ya se resuelve la
obra de la petición y se comprueba la membresía. Una sola compuerta, no una
comprobación repetida en cada ruta — que es como se olvidan la mitad.

LO QUE ESTA CAPA NO ES (las separaciones congeladas)
----------------------------------------------------
    TOOL ACTIVATION        disponibilidad de la herramienta EN LA OBRA   ← esto
    MEMBER TOOL ACCESS     si ESTE MIEMBRO entra a esa herramienta       (capa 08)
    RESOURCE PERMISSION    qué recurso puede tocar dentro                (capa 09)
    WORKFLOW AUTHORIZATION qué acto contractual puede ejecutar           (capa 10)

El orden es de fuera hacia dentro y no se puede saltar: una carpeta con
permiso `edit` no da acceso a una herramienta apagada, y una herramienta
encendida no concede ni un solo documento.

EL DEFECTO: DECLARADO, NO IMPLÍCITO
------------------------------------
La ausencia de fila significa «el valor del catálogo», no «apagada». Si
significara apagada, desplegar esta capa dejaría todas las obras vivas sin
herramientas de golpe; y si significara «encendida» sin más, el catálogo no
tendría autoridad. Con el defecto en el catálogo hay UNA fuente de verdad, y
la migración siembra filas explícitas para las obras que ya existen: el
estado se ve, no se adivina.

DOCUMENTOS NO SE APAGA — diferencia deliberada con ACC
-------------------------------------------------------
En ACC se puede desactivar Docs en un proyecto. Aquí el expediente ES el
producto: la navegación, la auditoría, las revisiones y los transmittals
cuelgan de él. Apagarlo no sería configurar una obra, sería dejarla
inservible fingiendo que es una opción. Se documenta como diferencia
deliberada en vez de ofrecer un interruptor que nadie debería usar.
"""

from app_logging import get_logger

logger = get_logger('herramientas')

# ── EL CATÁLOGO. Lista CERRADA, como las funciones contractuales ───────────
#
# `prefijos` son las rutas cuyo acceso gobierna la herramienta. Salen de los
# `url_prefix` REALES de server.py, no de memoria: si un blueprint cambia de
# sitio, esta lista tiene que cambiar con él (y `test_capa16_tool_activation`
# lo comprueba contra las rutas registradas).
CATALOGO = (
    {'codigo': 'rfi', 'etiqueta': 'RFI',
     'prefijos': ('/api/rfis',), 'por_defecto': True,
     'descripcion': 'Consultas formales entre las partes, con su ciclo y su acuse.'},
    {'codigo': 'redlines', 'etiqueta': 'Red Lines',
     'prefijos': ('/api/redlines',), 'por_defecto': True,
     'descripcion': 'Observaciones marcadas sobre el documento y su levantamiento.'},
    {'codigo': 'reviews', 'etiqueta': 'Revisiones',
     'prefijos': ('/api/reviews',), 'por_defecto': True,
     'descripcion': 'Flujo de revisión y aprobación con independencia autor/revisor.'},
    {'codigo': 'transmittals', 'etiqueta': 'Transmittals',
     'prefijos': ('/api/transmittals',), 'por_defecto': True,
     'descripcion': 'Emisión formal de documentos con acuse de recibo.'},
    {'codigo': 'submittals', 'etiqueta': 'Submittals',
     'prefijos': ('/api/submittals',), 'por_defecto': True,
     'descripcion': 'Aprobación de materiales, equipos y planos de taller contra la especificación.'},
    {'codigo': 'planos', 'etiqueta': 'Planos',
     'prefijos': ('/api/planos',), 'por_defecto': True,
     'descripcion': 'Láminas con número, revisiones y cuál es la vigente en obra.'},
    {'codigo': 'especificaciones', 'etiqueta': 'Especificaciones',
     'prefijos': ('/api/specs',), 'por_defecto': True,
     'descripcion': 'Qué exige el proyecto, por división y sección, y en qué revisión.'},
    {'codigo': 'protocolos', 'etiqueta': 'Protocolos',
     'prefijos': ('/api/protocolos',), 'por_defecto': True,
     'descripcion': 'Liberaciones e inspecciones: qué se comprobó, quién firmó y si libera.'},
    {'codigo': 'issues', 'etiqueta': 'Issues y punch',
     'prefijos': ('/api/issues',), 'por_defecto': True,
     'descripcion': 'Defectos detectados: quién corrige, quién verifica y cuándo se cierra.'},
    {'codigo': 'plan_entregas', 'etiqueta': 'Plan de entrega',
     'prefijos': ('/api/plan',), 'por_defecto': True,
     'descripcion': 'MIDP/TIDP: qué se entrega, cuándo y quién responde.'},
    {'codigo': 'conjuntos', 'etiqueta': 'Conjuntos',
     'prefijos': ('/api/sets',), 'por_defecto': True,
     'descripcion': 'Agrupaciones de documentos para emitir o revisar juntos.'},
    {'codigo': 'fotos', 'etiqueta': 'Fotos de campo',
     'prefijos': ('/api/pins', '/api/project-pins'), 'por_defecto': True,
     'descripcion': 'Evidencia fotográfica georreferenciada de la obra.'},
    {'codigo': 'cuaderno', 'etiqueta': 'Cuaderno de obra',
     'prefijos': ('/api/cuaderno',), 'por_defecto': True,
     'descripcion': 'Parte diario con asientos tipados, aprobación e '
                    'instrucciones de obra con acuse.'},
    {'codigo': 'visor', 'etiqueta': 'Visor 3D',
     'prefijos': ('/api/modelos', '/api/lob', '/api/civil'), 'por_defecto': True,
     'descripcion': 'Modelos publicados al visor y sus vistas 4D/civil.'},
)

CODIGOS = tuple(h['codigo'] for h in CATALOGO)
_POR_CODIGO = {h['codigo']: h for h in CATALOGO}

# Índice inverso prefijo → herramienta, construido UNA vez.
_PREFIJOS = tuple(
    (p, h['codigo']) for h in CATALOGO for p in h['prefijos']
)


def herramienta_de_ruta(path):
    """Qué herramienta gobierna esta ruta. None si la ruta no es de ninguna.

    Las rutas que NO pertenecen a ninguna herramienta (el expediente, la
    administración, la identidad) no pasan por esta capa: no hay nada que
    activar ni desactivar en ellas.
    """
    for prefijo, codigo in _PREFIJOS:
        if path == prefijo or path.startswith(prefijo + '/') or path.startswith(prefijo + '?'):
            return codigo
    return None


def estado_de_obra(cur, obra):
    """{codigo: bool} para TODAS las herramientas del catálogo.

    Lo que la base no dice, lo dice el catálogo: la ausencia de fila es el
    valor por defecto declarado, nunca un vacío que cada llamador interprete
    a su manera.
    """
    estado = {h['codigo']: h['por_defecto'] for h in CATALOGO}
    try:
        cur.execute("SELECT herramienta, activa FROM project_tools "
                    " WHERE project_id = %s", (str(obra),))
        for codigo, activa in cur.fetchall():
            if codigo in estado:
                estado[codigo] = bool(activa)
    except Exception as e:
        # FAIL-OPEN DELIBERADO, Y SOLO AQUÍ: si la tabla no existe todavía
        # (base sin migrar) o la consulta falla, las obras siguen funcionando
        # con el catálogo. Esta capa decide DISPONIBILIDAD, no autorización:
        # cerrarla ante un error dejaría una obra entera sin herramientas por
        # un fallo de infraestructura. La autorización (membresía, permisos)
        # sigue siendo fail-closed en su propio sitio, que es lo que protege.
        logger.warning('[herramientas] no se pudo leer project_tools: %s', str(e)[:120])
    return estado


def esta_activa(cur, obra, codigo):
    """¿Está encendida esta herramienta en esta obra?"""
    if codigo not in _POR_CODIGO:
        return True                     # no es una herramienta gobernada
    return estado_de_obra(cur, obra).get(codigo, True)


def etiqueta(codigo):
    h = _POR_CODIGO.get(codigo)
    return h['etiqueta'] if h else codigo


def catalogo_publico():
    """El catálogo tal como lo necesita una interfaz."""
    return [{'codigo': h['codigo'], 'etiqueta': h['etiqueta'],
             'descripcion': h['descripcion'], 'por_defecto': h['por_defecto']}
            for h in CATALOGO]
