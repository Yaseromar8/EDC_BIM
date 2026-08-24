# -*- coding: utf-8 -*-
"""CAPA 14 · PROJECT TEMPLATES — configuración de obra, reproducible.

LA ÚLTIMA CAPA, Y POR ESO: una plantilla solo puede copiar lo que ya existe
como configuración con nombre propio. Construirla antes que las capas 16, 08
y 13 habría obligado a inventar un formato para cosas que aún no eran nada,
y ese formato habría envejecido mal.

LA PREGUNTA QUE DECIDE TODO
----------------------------
    ¿Esto es CONFIGURACIÓN de la obra, o es su HISTORIA?

La configuración se reproduce. La historia es de UNA obra y de nadie más:
copiarla sería fabricar un pasado falso — documentos que nadie subió,
revisiones que nadie hizo, responsabilidades que nadie aceptó. Un expediente
público con historia inventada no es un expediente.

SE COPIA (configuración con nombre propio)
    · estructura de carpetas          el esqueleto documental, vacío
    · herramientas activas            capa 16
    · empresas participantes          y su función contractual en la obra
    · códigos de idoneidad            el vocabulario de estados del expediente

NO SE COPIA, NUNCA (historia, identidad y actos)
    · documentos y sus versiones      son de esa obra
    · auditoría y actividad           un registro append-only no se duplica
    · RFI, Red Lines, revisiones      actos con autor, fecha y consecuencia
    · transmittals y sus acuses       alguien firmó un recibo, y fue allí
    · responsabilidad / BIC activo    un encargo apunta a una persona real
    · miembros y sus permisos         la gente entra por invitación y
                                      membresía (capas 03 y 09), nunca por
                                      herencia de una plantilla
    · sesiones                        ni se plantea

LOS MIEMBROS, APARTE: por qué NO
---------------------------------
Es la tentación evidente («la obra nueva tiene el mismo equipo») y es
exactamente donde una plantilla se convierte en un agujero. Si copiara
membresías, crear una obra desde plantilla concedería acceso a personas que
nadie invitó a ESA obra — y el acceso dejaría de nacer de un acto con autor.
La estructura se hereda; la gente se incorpora.

LO QUE UNA PLANTILLA ES, EN UNA FRASE: un molde vacío, no una fotocopia.
"""

import json

from app_logging import get_logger

logger = get_logger('plantillas')

# Lo que una plantilla guarda. Lista CERRADA y declarada: si mañana alguien
# quiere copiar algo más, tiene que añadirlo aquí y explicar por qué es
# configuración y no historia.
PARTES = ('carpetas', 'herramientas', 'empresas', 'idoneidad')


def capturar(cur, obra):
    """Lee la CONFIGURACIÓN de una obra y la devuelve como molde.

    No toca ni una fila de historia: las consultas de aquí son la lista
    completa de lo que una plantilla puede saber.
    """
    molde = {}

    # ── Estructura de carpetas: el esqueleto, sin un solo fichero ──
    cur.execute("""SELECT n.id, n.parent_id, n.name, n.folder_type
                     FROM file_nodes n
                     JOIN projects p ON p.model_urn = n.model_urn
                    WHERE p.id = %s AND n.node_type = 'FOLDER'
                      AND NOT COALESCE(n.is_deleted, FALSE)
                    ORDER BY n.created_at""", (str(obra),))
    molde['carpetas'] = [{'id': str(r[0]), 'padre': str(r[1]) if r[1] else None,
                          'nombre': r[2], 'tipo': r[3]} for r in cur.fetchall()]

    # ── Herramientas activas (capa 16) ──
    import herramientas_de_obra as hdo
    molde['herramientas'] = hdo.estado_de_obra(cur, obra)

    # ── Empresas participantes y su función contractual ──
    cur.execute("""SELECT company_id, funcion FROM project_companies
                    WHERE project_id = %s""", (str(obra),))
    molde['empresas'] = [{'company_id': r[0], 'funcion': r[1]} for r in cur.fetchall()]

    # ── Códigos de idoneidad: el vocabulario del expediente ──
    try:
        cur.execute("""SELECT codigo, descripcion FROM idoneidad_catalogo
                        WHERE model_urn = (SELECT model_urn FROM projects WHERE id = %s)""",
                    (str(obra),))
        molde['idoneidad'] = [{'codigo': r[0], 'descripcion': r[1]} for r in cur.fetchall()]
    except Exception:
        molde['idoneidad'] = []

    return molde


def aplicar(cur, molde, obra_destino, model_urn_destino, quien):
    """Escribe la configuración del molde en una obra NUEVA.

    Devuelve un recuento de lo que se creó. Nada de lo que escribe aquí es
    historia: carpetas vacías, interruptores, participaciones y vocabulario.
    """
    import uuid
    creado = {'carpetas': 0, 'herramientas': 0, 'empresas': 0, 'idoneidad': 0}

    # ── Carpetas: se recrean con IDENTIDAD NUEVA, respetando la jerarquía.
    # Reutilizar los ids de la obra origen habría hecho que dos obras
    # compartieran nodos: el aislamiento se rompería en el acto.
    equivalencia = {}
    pendientes = list(molde.get('carpetas') or [])
    # Primero las raíces, luego las hijas de lo ya creado: un árbol puede
    # venir en cualquier orden y no se puede crear una hija antes que su padre.
    for _ronda in range(40):
        if not pendientes:
            break
        quedan = []
        for c in pendientes:
            padre_viejo = c.get('padre')
            if padre_viejo and padre_viejo not in equivalencia:
                quedan.append(c)
                continue
            nuevo = str(uuid.uuid4())
            cur.execute("""INSERT INTO file_nodes
                                (id, model_urn, parent_id, node_type, name,
                                 folder_type, created_by)
                           VALUES (%s, %s, %s, 'FOLDER', %s, %s, %s)""",
                        (nuevo, model_urn_destino,
                         equivalencia.get(padre_viejo) if padre_viejo else None,
                         c['nombre'], c.get('tipo'), quien))
            equivalencia[c['id']] = nuevo
            creado['carpetas'] += 1
        if len(quedan) == len(pendientes):
            # Referencias colgadas: se paran, no se adivinan.
            logger.warning('[plantilla] %d carpetas con padre irresoluble', len(quedan))
            break
        pendientes = quedan

    # ── Herramientas (capa 16) ──
    for codigo, activa in (molde.get('herramientas') or {}).items():
        cur.execute("""INSERT INTO project_tools
                            (project_id, herramienta, activa, cambiado_por)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (project_id, herramienta)
                       DO UPDATE SET activa = EXCLUDED.activa""",
                    (str(obra_destino), codigo, bool(activa), quien))
        creado['herramientas'] += 1

    # ── Empresas y su función ──
    for e in (molde.get('empresas') or []):
        cur.execute("""INSERT INTO project_companies
                            (project_id, company_id, funcion, creado_por)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT DO NOTHING""",
                    (str(obra_destino), e['company_id'], e['funcion'], quien))
        creado['empresas'] += 1

    # ── Vocabulario de idoneidad ──
    for i in (molde.get('idoneidad') or []):
        try:
            cur.execute("""INSERT INTO idoneidad_catalogo (model_urn, codigo, descripcion)
                           VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                        (model_urn_destino, i['codigo'], i.get('descripcion')))
            creado['idoneidad'] += 1
        except Exception:
            pass

    return creado
