# -*- coding: utf-8 -*-
"""LAS NUBES DE UNA INCIDENCIA: quién alimenta cada una, y si quedó levantada (3-nov-2026).

Diseño y normas: docs/archivos/23_APORTES_POR_NUBE.md y 24_INVESTIGACION_REVISION_DE_PLANOS_NORMAS.md (tabla D1–D13).
Este módulo no toca la base: decide. Las rutas (`routes/issues.py`, `/<id>/nubes`) leen, le preguntan y escriben.

LOS PAPELES SON DE LA INCIDENCIA, NO CARGOS (D1; Plan BIM Perú: «son funciones, no cargos»):
  · revisor    — quien la levantó (`autor_id`) o figura en «Verifica» (`verificador_id`): dice si cada nube de
                 observación quedó levantada en la versión nueva;
  · encargado  — el «Asignada a» (`responsable_id`, o alguien de `responsable_empresa`): el dueño de la incidencia;
                 asigna las nubes, acepta o devuelve lo entregado y crea las nubes de encargo de su equipo;
  · aportante  — a quien se asignó ESA nube (persona, o alguien de su empresa): entrega lo pedido;
  · admin      — el administrador de la obra: puede todo, como corresponde a quien coordina.

DOS CLASES DE NUBE:
  · observación — la dibuja el revisor: lo que hay que corregir. La verifica el revisor, sobre la versión nueva.
  · encargo     — la crea el encargado para repartir trabajo a su equipo (cadista, modelador). Es TRABAJO EN PROCESO
                  de ese equipo (ISO 19650): solo la ven el encargado, quien la tiene asignada, su empresa y el admin
                  (D6). No se verifica por separado: el revisor juzga la observación.

LA VIDA DE UNA NUBE (rondas en la MISMA nube, D7):
  sin_asignar ─asignar→ pedida ─entregar→ entregada ─aceptar→ aceptada
                          ▲                  └─devolver (con motivo)→ devuelta ─entregar→ entregada …
  y, cuando la incidencia está «Corregida» (hay versión nueva), una de observación se VERIFICA:
  … → levantada | no_levantada (con motivo). Una no levantada puede volver a asignarse: es otra ronda.
"""

CLASES = ('observacion', 'encargo')

SIN_ASIGNAR = 'sin_asignar'
PEDIDA = 'pedida'
ENTREGADA = 'entregada'
DEVUELTA = 'devuelta'
ACEPTADA = 'aceptada'
LEVANTADA = 'levantada'
NO_LEVANTADA = 'no_levantada'
ESTADOS = (SIN_ASIGNAR, PEDIDA, ENTREGADA, DEVUELTA, ACEPTADA, LEVANTADA, NO_LEVANTADA)

ETIQUETAS = {
    SIN_ASIGNAR: 'Sin asignar', PEDIDA: 'Pedida', ENTREGADA: 'Entregada', DEVUELTA: 'Devuelta',
    ACEPTADA: 'Aceptada', LEVANTADA: 'Levantada', NO_LEVANTADA: 'No levantada',
}

# Lo que le debe a alguien una nube en ese estado: el aportante, mientras le toque entregar.
ESTADOS_QUE_DEBE_EL_APORTANTE = (PEDIDA, DEVUELTA)

# Estado de la incidencia en el que hay versión corregida que verificar (flujo_de_issue.CORREGIDO).
CORREGIDO = 'Corregido'

TOPE_TEXTO = 2000

# Solo una marca de este tipo es una nube de la incidencia; las demás (flechas, textos…) la acompañan sin estado.
TIPO_DE_NUBE = 'cloud'
TOPE_ENTREGAS = 20

# acto → (estados de origen, estado de destino, papeles que pueden, solo de esta clase)
ACTOS = {
    'asignar':  ((SIN_ASIGNAR, PEDIDA, DEVUELTA, NO_LEVANTADA, ACEPTADA), PEDIDA, ('encargado', 'admin'), None),
    'entregar': ((PEDIDA, DEVUELTA), ENTREGADA, ('aportante', 'admin'), None),
    'aceptar':  ((ENTREGADA,), ACEPTADA, ('encargado', 'admin'), None),
    'devolver': ((ENTREGADA,), DEVUELTA, ('encargado', 'admin'), None),
    'verificar': ((SIN_ASIGNAR, PEDIDA, ENTREGADA, DEVUELTA, ACEPTADA, NO_LEVANTADA), None,
                  ('revisor', 'admin'), 'observacion'),
}


def papeles(usuario, issue, nube=None, admin=False, empresa_del_usuario=None):
    """Los papeles de esta persona en esta incidencia (y en esta nube, si se da)."""
    uid = (usuario or {}).get('id')
    p = set()
    if admin:
        p.add('admin')
    if uid and uid in (issue.get('autor_id'), issue.get('verificador_id')):
        p.add('revisor')
    if uid and (uid == issue.get('responsable_id') or
                (issue.get('responsable_empresa') and empresa_del_usuario
                 and empresa_del_usuario == issue.get('responsable_empresa'))):
        p.add('encargado')
    if nube and uid and (uid == nube.get('destino_usuario') or
                         (nube.get('destino_empresa') and empresa_del_usuario
                          and empresa_del_usuario == nube.get('destino_empresa'))):
        p.add('aportante')
    return p


def puede(acto, nube, issue, sus_papeles):
    """(True, None) o (False, por qué). No mira permisos de carpeta: eso lo hace la ruta antes."""
    if acto not in ACTOS:
        return False, 'acto desconocido'
    origen, _destino, quienes, clase = ACTOS[acto]
    if clase and nube.get('clase') != clase:
        return False, 'solo una nube de observación se verifica: las de encargo las acepta el encargado'
    if not (set(quienes) & set(sus_papeles)):
        return False, {
            'asignar': 'solo el encargado del plano asigna las nubes',
            'entregar': 'solo a quien se le asignó la nube puede entregar en ella',
            'aceptar': 'solo el encargado del plano acepta lo entregado',
            'devolver': 'solo el encargado del plano devuelve lo entregado',
            'verificar': 'solo quien revisa la incidencia dice si la nube quedó levantada',
        }[acto]
    if nube.get('estado', SIN_ASIGNAR) not in origen:
        return False, 'la nube está «%s»' % ETIQUETAS.get(nube.get('estado'), nube.get('estado'))
    if acto == 'verificar' and issue.get('estado') != CORREGIDO:
        return False, 'aún no hay versión corregida que verificar'
    return True, None


def destino(acto, resultado=None):
    """El estado al que lleva el acto. `verificar` depende de lo que se decida."""
    if acto == 'verificar':
        return LEVANTADA if resultado == LEVANTADA else NO_LEVANTADA
    return ACTOS[acto][1]


def puede_crear_encargo(sus_papeles):
    return bool({'encargado', 'admin'} & set(sus_papeles))


def visible(nube, sus_papeles, empresa_del_usuario=None):
    """Una nube de encargo es trabajo en proceso del equipo del encargado (D6): no la ve el revisor."""
    if nube.get('clase') != 'encargo':
        return True
    if {'encargado', 'aportante', 'admin'} & set(sus_papeles):
        return True
    equipo = nube.get('empresa_equipo')
    return bool(equipo and empresa_del_usuario and equipo == empresa_del_usuario)


def por_verificar(nube, issue):
    """Derivado, no guardado: con la incidencia «Corregida», toda observación aún no levantada espera al revisor."""
    return (nube.get('clase') == 'observacion' and issue.get('estado') == CORREGIDO
            and nube.get('estado') != LEVANTADA)


def deudor(nube):
    """(usuario, empresa) a quien le toca entregar AHORA, o (None, None)."""
    if nube.get('estado') not in ESTADOS_QUE_DEBE_EL_APORTANTE:
        return None, None
    if nube.get('destino_usuario'):
        return nube['destino_usuario'], None
    return None, nube.get('destino_empresa')


def observaciones_sin_levantar(nubes):
    """Las de observación que aún no están levantadas: con alguna, la incidencia no se puede dar por verificada."""
    return [n for n in nubes if n.get('clase') == 'observacion' and n.get('estado') != LEVANTADA]


def marcas_de_la_incidencia(issue):
    """Las marcas (nubes) que la incidencia ya lleva: las de su evidencia y la de origen."""
    ids = []
    for e in issue.get('evidencia') or []:
        if isinstance(e, dict) and e.get('tipo') == 'marca' and str(e.get('marca') or '').isdigit():
            ids.append(int(e['marca']))
    if issue.get('origen_tipo') == 'MARCA' and str(issue.get('origen_id') or '').isdigit():
        ids.append(int(issue['origen_id']))
    vistos, salida = set(), []
    for m in ids:
        if m not in vistos:
            vistos.add(m)
            salida.append(m)
    return salida


def clave_de_destino(nube):
    """'u4' (persona) o 'e40' (empresa): a quién va la nube, para darle su color. None si no está asignada."""
    if nube.get('destino_usuario'):
        return 'u%s' % nube['destino_usuario']
    if nube.get('destino_empresa'):
        return 'e%s' % nube['destino_empresa']
    return None


def colores_del_plano(cur, nodo):
    """{'u4': 0, 'e40': 1, …}: el color de cada persona o empresa EN ESTE PLANO (el dueño: «el color por persona,
    pero por plano»), en el orden en que recibió su primera nube. Lo calcula el servidor para que la hoja y el panel
    pinten a cada uno igual aunque sus nubes sean de incidencias distintas."""
    if not nodo:
        return {}
    cur.execute("""SELECT n.destino_usuario, n.destino_empresa, min(n.id) AS primera
                     FROM doc_issue_nubes n JOIN pdf_markups m ON m.id = n.markup_id
                    WHERE m.file_node_id::text = %s
                      AND (n.destino_usuario IS NOT NULL OR n.destino_empresa IS NOT NULL)
                    GROUP BY n.destino_usuario, n.destino_empresa
                    ORDER BY primera""", (str(nodo),))
    colores = {}
    for u, e, _primera in cur.fetchall():
        clave = clave_de_destino({'destino_usuario': u, 'destino_empresa': e})
        colores.setdefault(clave, len(colores))
    return colores


def documento_de_la_incidencia(issue):
    """(node_id, version_id) del plano donde vive la incidencia, o (None, None)."""
    for e in issue.get('evidencia') or []:
        if isinstance(e, dict) and e.get('tipo') in ('plano', 'marca') and e.get('documento'):
            return str(e['documento']), e.get('version_id') or None
    return None, None


def entregas_validas(entregas):
    """Normaliza lo entregado: documentos de Docs (por id) y notas. (lista, error)."""
    if not isinstance(entregas, list) or not entregas:
        return None, 'Entrega al menos un documento o una nota.'
    if len(entregas) > TOPE_ENTREGAS:
        return None, 'Como mucho %d cosas por entrega.' % TOPE_ENTREGAS
    salida = []
    for e in entregas:
        if not isinstance(e, dict):
            return None, 'Entrega no válida.'
        if e.get('tipo') == 'documento':
            nid = str(e.get('documento') or '').strip()
            if not nid:
                return None, 'Falta el documento.'
            salida.append({'tipo': 'documento', 'documento': nid,
                           'version_id': str(e['version_id']) if e.get('version_id') else None,
                           'vista3d': bool(e.get('vista3d'))})
        elif e.get('tipo') == 'nota':
            texto = str(e.get('texto') or '').strip()
            if not texto or len(texto) > TOPE_TEXTO:
                return None, 'La nota va de 1 a %d caracteres.' % TOPE_TEXTO
            salida.append({'tipo': 'nota', 'texto': texto})
        else:
            return None, 'Solo se entregan documentos de Docs o notas.'
    return salida, None
