# -*- coding: utf-8 -*-
"""LAS NUBES DE UNA INCIDENCIA: quién alimenta cada una, y si quedó levantada (3-nov-2026).

Diseño y normas: docs/archivos/23_APORTES_POR_NUBE.md y 24_INVESTIGACION_REVISION_DE_PLANOS_NORMAS.md (tabla D1–D13).
Este módulo no toca la base: decide. Las rutas (`routes/issues.py`, `/<id>/nubes`) leen, le preguntan y escriben.

LOS PAPELES SON DE LA INCIDENCIA, NO CARGOS (D1; Plan BIM Perú: «son funciones, no cargos»):
  · revisor    — quien la levantó (`autor_id`) o figura en «Verifica» (`verificador_id`): dice si cada nube de
                 observación quedó levantada en la versión nueva;
  · encargado  — el «Asignada a» (`responsable_id`, o alguien de `responsable_empresa`): el dueño de la incidencia;
                 asigna las nubes, acepta o devuelve lo entregado y crea las nubes de encargo de su equipo;
  · aportante  — a quien se asignó ESA nube (persona, o alguien de su empresa): entrega lo pedido. Quien revisa
                 la incidencia no lo es nunca, ni por su empresa: pide y verifica, no entrega;
  · admin      — el administrador de la obra: coordina (asigna, acepta, devuelve, verifica), pero NO entrega por
                 otro: entrega solo a quien se le asignó la nube (4-nov-2026, el dueño: «solo sube el que es asignado»).

DOS CLASES DE NUBE:
  · observación — la dibuja el revisor: lo que hay que corregir. La verifica el revisor, sobre la versión nueva.
  · encargo     — la crea el encargado para repartir trabajo a su equipo (cadista, modelador). Es TRABAJO EN PROCESO
                  de ese equipo: la ven el encargado, quien la tiene asignada, su empresa, el admin y QUIEN REVISA
                  (el dueño, 3-nov-2026: «el revisor principal debe ver todo»; corrige la D6, que se la ocultaba).
                  No se verifica por separado: el revisor juzga la observación.

CADA NUBE TIENE SU NÚMERO (47): lo pone la base al crear su fila y no cambia (el disparador `tg_issue_nubes_numero`).
Las filas se crean al dar de alta la incidencia: no hay nubes «virtuales». Con la incidencia cerrada, nadie debe nada
en sus nubes (`deudor`).

QUIEN ENTREGA NO SE ACEPTA (4-nov-2026, el dueño: «el encargado no puede aceptar una entrega suya»; separación de
funciones, como ACC y Procore): quien entregó una ronda no la acepta ni la devuelve. Si el encargado se asignó la nube a
sí mismo o a su empresa y entregó él, la acepta otro de su empresa o el administrador.

LA VIDA DE UNA NUBE (rondas en la MISMA nube, D7):
  sin_asignar ─asignar→ pedida ─entregar→ entregada ─aceptar→ aceptada
                          ▲                  └─devolver (con motivo)→ devuelta ─entregar→ entregada …
  y, cuando la incidencia está «Corregida» (hay versión nueva), una de observación se VERIFICA:
  … → levantada | no_levantada (con motivo). Una no levantada puede volver a asignarse: es otra ronda.
"""

import re

import flujo_de_issue as _iss

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
# Los estados en los que ALGUIEN debe algo en la nube: el aportante (pedida, devuelta) o el encargado (entregada).
ESTADOS_CON_DEUDOR = ESTADOS_QUE_DEBE_EL_APORTANTE + (ENTREGADA,)

# Estado de la incidencia en el que hay versión corregida que verificar (flujo_de_issue.CORREGIDO).
CORREGIDO = 'Corregido'

TOPE_TEXTO = 2000

# Solo una marca de este tipo es una nube de la incidencia; las demás (flechas, textos…) la acompañan sin estado.
TIPO_DE_NUBE = 'cloud'
TOPE_ENTREGAS = 20

# acto → (estados de origen, estado de destino, papeles que pueden, solo de esta clase)
ACTOS = {
    'asignar':  ((SIN_ASIGNAR, PEDIDA, DEVUELTA, NO_LEVANTADA, ACEPTADA), PEDIDA, ('encargado', 'admin'), None),
    'entregar': ((PEDIDA, DEVUELTA), ENTREGADA, ('aportante',), None),
    'aceptar':  ((ENTREGADA,), ACEPTADA, ('encargado', 'admin'), None),
    'devolver': ((ENTREGADA,), DEVUELTA, ('encargado', 'admin'), None),
    'verificar': ((SIN_ASIGNAR, PEDIDA, ENTREGADA, DEVUELTA, ACEPTADA, NO_LEVANTADA), None,
                  ('revisor', 'admin'), 'observacion'),
}


class Motivo(str):
    """Por qué no se puede: el texto para la persona y su TIPO para el código HTTP (no se deduce del texto)."""
    def __new__(cls, tipo, texto):
        m = super().__new__(cls, texto)
        m.tipo = tipo
        return m


# El código HTTP de cada tipo de negativa: acto inexistente, papel que no toca, clase de nube o estado que no lo admite.
HTTP_DE_LA_NEGATIVA = {'acto': 400, 'papel': 403, 'clase': 409, 'estado': 409}


def es_revisor(uid, issue):
    """Quien revisa la incidencia: quien la levantó o figura en «Verifica». Pide y verifica; no aporta."""
    return bool(uid) and uid in (issue.get('autor_id'), issue.get('verificador_id'))


def papeles(usuario, issue, nube=None, admin=False, empresa_del_usuario=None):
    """Los papeles de esta persona en esta incidencia (y en esta nube, si se da)."""
    uid = (usuario or {}).get('id')
    p = set()
    if admin:
        p.add('admin')
    if es_revisor(uid, issue):
        p.add('revisor')
    if uid and (uid == issue.get('responsable_id') or
                (issue.get('responsable_empresa') and empresa_del_usuario
                 and empresa_del_usuario == issue.get('responsable_empresa'))):
        p.add('encargado')
    if nube and uid and 'revisor' not in p and (uid == nube.get('destino_usuario') or
                         (nube.get('destino_empresa') and empresa_del_usuario
                          and empresa_del_usuario == nube.get('destino_empresa'))):
        p.add('aportante')
    return p


def entrego(nube, uid):
    """¿Esta persona entregó la ronda en curso de la nube?"""
    rondas = nube.get('rondas') or []
    return bool(uid) and bool(rondas) and rondas[-1].get('entregado_por_id') == uid


def puede(acto, nube, issue, sus_papeles, quien=None):
    """(True, None) o (False, por qué). `quien`: el id de quien actúa (para que quien entregó no acepte ni devuelva
    su propia entrega). No mira permisos de carpeta: eso lo hace la ruta antes."""
    if acto not in ACTOS:
        return False, Motivo('acto', 'acto desconocido')
    origen, _destino, quienes, clase = ACTOS[acto]
    if clase and nube.get('clase') != clase:
        return False, Motivo('clase', 'solo una nube de observación se verifica: las de encargo las acepta el encargado')
    if not (set(quienes) & set(sus_papeles)):
        return False, Motivo('papel', {
            'asignar': 'solo el encargado del plano asigna las nubes',
            'entregar': 'solo a quien se le asignó la nube puede entregar en ella',
            'aceptar': 'solo el encargado del plano acepta lo entregado',
            'devolver': 'solo el encargado del plano devuelve lo entregado',
            'verificar': 'solo quien revisa la incidencia dice si la nube quedó levantada',
        }[acto])
    if nube.get('estado', SIN_ASIGNAR) not in origen:
        return False, Motivo('estado', 'la nube está «%s»' % ETIQUETAS.get(nube.get('estado'), nube.get('estado')))
    if acto in ('aceptar', 'devolver') and entrego(nube, quien):
        return False, Motivo('papel', 'quien entregó no acepta ni devuelve su propia entrega: lo hace otro encargado '
                                      'o el administrador')
    if acto == 'verificar' and issue.get('estado') != CORREGIDO:
        return False, Motivo('estado', 'aún no hay versión corregida que verificar')
    return True, None


def destino(acto, resultado=None):
    """El estado al que lleva el acto. `verificar` depende de lo que se decida."""
    if acto == 'verificar':
        return LEVANTADA if resultado == LEVANTADA else NO_LEVANTADA
    return ACTOS[acto][1]


def puede_crear_encargo(sus_papeles):
    return bool({'encargado', 'admin'} & set(sus_papeles))


def como_se_anade(sus_papeles):
    """Cómo entra una nube SUELTA en la incidencia según el papel de quien la añade: (clase, asigna) o None.
    Quien revisa (o el administrador) la añade como nube de OBSERVACIÓN; el encargado, como nube de ENCARGO para su
    equipo (D6). `asigna`: si además puede asignarla en el mismo acto (el encargado o el administrador). La usan la ruta
    que la añade y la hoja que ofrece a qué incidencias puede ir: la pantalla no decide."""
    sus = set(sus_papeles)
    if {'revisor', 'admin'} & sus:
        clase = 'observacion'
    elif 'encargado' in sus:
        clase = 'encargo'
    else:
        return None
    return clase, bool({'encargado', 'admin'} & sus)


def visible(nube, sus_papeles, empresa_del_usuario=None):
    """Quién ve una nube. Las de observación, todo el que ve la incidencia. Las de encargo (trabajo en proceso del
    equipo del encargado), el equipo y quien revisa: «el revisor principal debe ver todo» (el dueño, 3-nov-2026)."""
    if nube.get('clase') != 'encargo':
        return True
    if {'encargado', 'aportante', 'admin', 'revisor'} & set(sus_papeles):
        return True
    equipo = nube.get('empresa_equipo')
    return bool(equipo and empresa_del_usuario and equipo == empresa_del_usuario)


def por_verificar(nube, issue):
    """Derivado, no guardado: con la incidencia «Corregida», toda observación aún no levantada espera al revisor."""
    return (nube.get('clase') == 'observacion' and issue.get('estado') == CORREGIDO
            and nube.get('estado') != LEVANTADA)


def incidencia_viva(issue):
    """Abierta y enviada: ni cerrada (verificada, anulada) ni borrador. Solo en una viva se le debe algo a alguien."""
    estado = (issue or {}).get('estado')
    return not _iss.esta_cerrado(estado) and estado != _iss.BORRADOR


def deudor(nube, issue=None):
    """(usuario, empresa) a quien le toca actuar AHORA en la nube, o (None, None): el aportante mientras le toque
    entregar; ENTREGADA, el encargado de la incidencia (si se da `issue`), que ya puede corregir con lo aportado y
    aceptarlo o devolverlo (4-nov-2026, el dueño: «que le alerte al dueño del plano»). Con la incidencia cerrada o en
    borrador (si se da `issue` con su `estado`), nadie: así el cierre cierra también lo que se debía en sus nubes."""
    if issue and 'estado' in issue and not incidencia_viva(issue):
        return None, None
    if nube.get('estado') == ENTREGADA and issue:
        if issue.get('responsable_id'):
            return issue['responsable_id'], None
        return None, issue.get('responsable_empresa') or None
    if nube.get('estado') not in ESTADOS_QUE_DEBE_EL_APORTANTE:
        return None, None
    if nube.get('destino_usuario'):
        return nube['destino_usuario'], None
    return None, nube.get('destino_empresa')


def por_entregar(nube, issue):
    """¿Le falta entregar a alguien en esta nube? Lo que la leyenda del plano y el panel cuentan «por entregar»: pedida
    o devuelta, en una incidencia viva (cerrada o anulada, ya no se le debe nada a nadie)."""
    return nube.get('estado') in ESTADOS_QUE_DEBE_EL_APORTANTE and incidencia_viva(issue)


def plazo(nube, issue):
    """Para cuándo: el de la nube si lo tiene; si no, el de la incidencia («basta con la fecha del issue principal»)."""
    return nube.get('vence_en') or (issue or {}).get('vence_en')


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
                    WHERE m.file_node_id = %s
                      AND (n.destino_usuario IS NOT NULL OR n.destino_empresa IS NOT NULL)
                    GROUP BY n.destino_usuario, n.destino_empresa
                    ORDER BY primera""", (str(nodo),))
    colores = {}
    for u, e, _primera in cur.fetchall():
        clave = clave_de_destino({'destino_usuario': u, 'destino_empresa': e})
        colores.setdefault(clave, len(colores))
    return colores


# LA CARPETA DE LA INCIDENCIA (D4, doc 24): lo que se aporta a sus nubes se sube a «INCIDENCIAS/<código>/» de la obra.
CARPETA_DE_INCIDENCIAS = 'INCIDENCIAS'
_CARPETA = re.compile(r'^INCIDENCIAS/([A-Z]{2,8}-\d{1,6})/?$')


def codigo_de_la_carpeta(carpeta):
    """'ISS-002' si `carpeta` es exactamente la carpeta de una incidencia («INCIDENCIAS/ISS-002/»); si no, None."""
    m = _CARPETA.match(str(carpeta or '').strip())
    return m.group(1) if m else None


def puede_subir_a_su_carpeta(cur, usuario, empresa_del_usuario, obra, carpeta):
    """D4: para aportar basta con VER el plano; lo subido va a la carpeta de la incidencia, que es un contenedor nuevo y
    no una edición del plano. Así que a esa carpeta, y solo a ella, sube quien participa en la incidencia abierta:
    quien la revisa, el encargado, y quien tiene una nube suya por entregar (o su empresa). Lo demás, como siempre.
    Los papeles son los de `papeles()`: la misma regla que el resto de la incidencia."""
    codigo = codigo_de_la_carpeta(carpeta)
    uid = (usuario or {}).get('id')
    if not codigo or not uid or not obra:
        return False
    cur.execute("""SELECT id, estado, autor_id, verificador_id, responsable_id, responsable_empresa
                     FROM doc_issues WHERE model_urn = %s AND codigo = %s""", (str(obra), codigo))
    f = cur.fetchone()
    issue = f and {'estado': f[1], 'autor_id': f[2], 'verificador_id': f[3], 'responsable_id': f[4],
                   'responsable_empresa': f[5]}
    if not issue or not incidencia_viva(issue):
        return False
    if {'revisor', 'encargado'} & papeles(usuario, issue, None, False, empresa_del_usuario):
        return True
    cur.execute("""SELECT 1 FROM doc_issue_nubes
                    WHERE issue_id = %s AND estado = ANY(%s)
                      AND (destino_usuario = %s OR (destino_empresa IS NOT NULL AND destino_empresa = %s))
                    LIMIT 1""", (f[0], list(ESTADOS_QUE_DEBE_EL_APORTANTE), uid, empresa_del_usuario))
    return cur.fetchone() is not None


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
