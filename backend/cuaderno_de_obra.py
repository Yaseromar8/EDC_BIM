# -*- coding: utf-8 -*-
"""NG-03 · CUADERNO DE OBRA — la semántica. Las rutas viven en routes/cuaderno.

TRES OBJETOS, NO UNO (doc 96)
-----------------------------
    PARTE        la JORNADA. Identidad (obra, fecha_operativa) -- la fecha es
                 la DECLARADA del día de obra, jamás derivada del reloj UTC del
                 servidor: a las 7 pm de Lima, UTC ya vive en mañana.
    ASIENTO      un registro tipado dentro de un parte. Correlativo POR OBRA,
                 continuo entre días. REGISTRADO = inmutable: se corrige con
                 OTRO asiento (tipo `rectificacion`) que lo referencia.
    INSTRUCCIÓN  un ACTO FORMAL. Emitida = inmutable; la corrección es una
                 RECTIFICACIÓN: instrucción nueva con `rectifica_a`, la vieja
                 queda RECTIFICADA visible. Puede existir sin jornada abierta.

LA CORRECCIÓN DEL PROPIETARIO QUE ESTE MÓDULO ENCARNA (27-ago-2026)
--------------------------------------------------------------------
PROJECT ADMIN NO ES APROBADOR CONTRACTUAL. Administrar la obra no es autoridad
de supervisión. Por eso `puede_aprobar_asiento` NI SIQUIERA ACEPTA un
parámetro de admin: la firma de la función es la regla. Aprueba una FUNCIÓN
CONTRACTUAL declarada en `FUNCIONES_APROBADORAS_DE_ASIENTO`; si en la obra no
hay nadie con ella, el acto se bloquea con `SIN_APROBADOR_CONTRACTUAL` -- no
hay fallback administrativo.

Y EL DESTINATARIO DE UNA INSTRUCCIÓN NUNCA ES UNA FUNCIÓN DESNUDA: es una
persona concreta o una empresa concreta de la obra, con snapshot de
empresa+función al emitir. El BIC se resuelve contra ESE sujeto, no contra
quien hoy comparta función.
"""
import collections
import datetime
import re

# ── LAS FUNCIONES CONTRACTUALES QUE PUEDEN, DECLARADAS COMO DATO ───────────
#
# El espejo de FUNCIONES_EMISORAS de planos: la autoridad se lee de una tupla,
# no se reconstruye de ifs dispersos. Vienen de directorio_de_obra.FUNCIONES.

# Quien aprueba o devuelve el asiento de un colaborador. SUPERVISION es el
# aprobador; ENTIDAD es la CONTINGENCIA, autorizada porque está DECLARADA
# aquí -- nunca por privilegio administrativo (corrección del propietario).
FUNCIONES_APROBADORAS_DE_ASIENTO = ('SUPERVISION', 'ENTIDAD')

# Quien emite instrucciones de obra (doc 96 §L, aprobado).
FUNCIONES_EMISORAS_DE_INSTRUCCION = ('SUPERVISION', 'ENTIDAD')

# Cuyos asientos son cuaderno firme al registrarse, sin aprobación de otro.
FUNCIONES_CON_AUTORIDAD_PROPIA = ('SUPERVISION', 'ENTIDAD', 'PROYECTISTA')


def requiere_aprobacion(funcion):
    """¿El asiento de alguien con esta función pasa por aprobación (E07)?

    CONTRATISTA y OTRO sí. Y también `None` -- quien no ejerce ninguna función
    declarada en la obra (sin empresa, o su empresa fuera del directorio) no
    escribe cuaderno firme por su cuenta: fail-closed, no fail-open.
    """
    return funcion not in FUNCIONES_CON_AUTORIDAD_PROPIA


def puede_aprobar_asiento(funcion_del_actor, es_el_autor):
    """¿Puede este actor aprobar o devolver un asiento ajeno?

    LA FIRMA ES LA REGLA: no recibe `es_admin` a propósito. El Project Admin
    no aprueba asientos -- aprobar es autoridad CONTRACTUAL y la administración
    no la confiere (corrección del propietario, doc 96). Y el autor jamás se
    aprueba a sí mismo, ni siquiera con función aprobadora: la misma
    prohibición autor≠aprobador de doc_reviews.
    """
    if es_el_autor:
        return False
    return funcion_del_actor in FUNCIONES_APROBADORAS_DE_ASIENTO


def puede_emitir_instruccion(funcion_del_actor):
    return funcion_del_actor in FUNCIONES_EMISORAS_DE_INSTRUCCION


# ── ESTADOS. Listas CERRADAS, casadas con los CHECK de la migración 25 ─────

ABIERTO = 'ABIERTO'
CERRADO = 'CERRADO'
ESTADOS_PARTE = (ABIERTO, CERRADO)

REGISTRADO = 'REGISTRADO'
EN_APROBACION = 'EN_APROBACION'
APROBADO = 'APROBADO'
DEVUELTO = 'DEVUELTO'
ESTADOS_ASIENTO = (REGISTRADO, EN_APROBACION, APROBADO, DEVUELTO)

EMITIDA = 'EMITIDA'
ACUSADA = 'ACUSADA'
ATENDIDA = 'ATENDIDA'
CERRADA = 'CERRADA'
RECTIFICADA = 'RECTIFICADA'
ESTADOS_INSTRUCCION = (EMITIDA, ACUSADA, ATENDIDA, CERRADA, RECTIFICADA)

# Desde dónde se puede rectificar: desde cualquier estado VIVO. Una CERRADA ya
# cumplió su ciclo; corregirla sería reabrir historia -- se emite otra nueva.
RECTIFICABLES = (EMITIDA, ACUSADA, ATENDIDA)

TRANSICIONES_INSTRUCCION = {
    EMITIDA: (ACUSADA, RECTIFICADA),
    ACUSADA: (ATENDIDA, RECTIFICADA),
    ATENDIDA: (CERRADA, RECTIFICADA),
    CERRADA: (),
    RECTIFICADA: (),
}


def estado_inicial_de_asiento(funcion_del_autor):
    """REGISTRADO con autoridad propia; EN_APROBACION si el autor colabora."""
    return EN_APROBACION if requiere_aprobacion(funcion_del_autor) else REGISTRADO


# ── EL CATÁLOGO DE TIPOS DE ASIENTO (doc 96 §F). Lista CERRADA ─────────────
#
# No hay tabla «secciones»: el parte ES fecha + colección de asientos tipados,
# y la pantalla agrupa por tipo. El CHECK de la base y el catálogo del cliente
# se casan con este por tripwire (lección N2: las listas crecen JUNTAS).
TIPOS_DE_ASIENTO = (
    'avance',         # trabajos ejecutados: progresiva, frente, partida
    'personal',       # lista {empresa, categoria, cantidad}
    'equipos',        # lista {equipo, cantidad, horas}
    'materiales',     # lista {material, cantidad, unidad, movimiento}
    'clima',          # §F.1: procedencia obligatoria
    'seguridad',      # texto + issue opcional
    'calidad',        # texto + acta/issue opcional
    'restriccion',    # paralizaciones: horas_afectadas
    'visita',         # {quien, entidad, motivo}
    'foto',           # CITA a doc_fotos -- jamás copia
    'instruccion',    # CITA a doc_instrucciones
    'rectificacion',  # corrige a OTRO asiento, referenciándolo
    'nota',           # texto libre
)

# Referencia OBLIGATORIA por tipo: la clave que tiene que venir en
# `referencias`. Citar es el sentido de estos tipos; sin la cita son una nota.
REFERENCIA_OBLIGATORIA = {
    'foto': 'foto_id',
    'instruccion': 'instruccion_id',
    'rectificacion': 'asiento_id',
}

# ── CLIMA (E08 · doc 96 §F.1): el dato con su procedencia completa ─────────

ORIGEN_PROVEEDOR = 'proveedor'
ORIGEN_MANUAL = 'manual'
ORIGENES_DE_CLIMA = (ORIGEN_PROVEEDOR, ORIGEN_MANUAL)


def validar_asiento(tipo, texto, contenido, referencias):
    """(None, code) si el asiento no es registrable; (True, None) si lo es."""
    if tipo not in TIPOS_DE_ASIENTO:
        return None, 'TIPO_DESCONOCIDO'
    ref = REFERENCIA_OBLIGATORIA.get(tipo)
    if ref and not (referencias or {}).get(ref):
        return None, 'SIN_REFERENCIA'
    if tipo == 'clima':
        origen = (contenido or {}).get('origen')
        if origen not in ORIGENES_DE_CLIMA:
            # Un clima sin procedencia declarada no consta: el dato del
            # cuaderno vale por saber DE DÓNDE salió (doc 96 §F.1).
            return None, 'CLIMA_SIN_PROCEDENCIA'
    if not (texto or '').strip() and not contenido and not referencias:
        return None, 'ASIENTO_VACIO'
    return True, None


# ── LA FECHA OPERATIVA (regla congelada por el propietario) ────────────────

_FECHA = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def fecha_operativa_valida(texto, hoy=None):
    """(date, None) o (None, code). La fecha del parte es la DECLARADA.

    No se deriva de created_at UTC -- regla congelada: a las 7 pm de Lima el
    servidor ya vive en mañana. El cliente la declara; aquí solo se comprueba
    que sea una fecha y que no esté en el futuro (con un día de holgura,
    porque el servidor compara en UTC y la obra vive en UTC-5). El pasado se
    admite: abrir tarde el parte de ayer es un hecho real, y el historial
    dirá cuándo se abrió de verdad.
    """
    if not texto or not _FECHA.match(str(texto).strip()):
        return None, 'FECHA_INVALIDA'
    try:
        fecha = datetime.date.fromisoformat(str(texto).strip())
    except ValueError:
        return None, 'FECHA_INVALIDA'
    tope = (hoy or datetime.datetime.now(datetime.timezone.utc).date()) \
        + datetime.timedelta(days=1)
    if fecha > tope:
        return None, 'FECHA_FUTURA'
    return fecha, None


# ── EL DESTINATARIO DE UNA INSTRUCCIÓN (corrección del propietario) ────────

DESTINATARIO_PERSONA = 'persona'
DESTINATARIO_EMPRESA = 'empresa'


def destinatario_valido(d):
    """(snapshot, None) o (None, code). NUNCA una función desnuda.

    El sujeto es una PERSONA concreta o una EMPRESA concreta de la obra; el
    snapshot de empresa+función se completa en la ruta con lo que el
    directorio diga EN ESE MOMENTO, y queda congelado en la instrucción.
    """
    d = d or {}
    tipo = d.get('tipo')
    if tipo == DESTINATARIO_PERSONA:
        try:
            uid = int(d.get('usuario_id'))
        except (TypeError, ValueError):
            return None, 'DESTINATARIO_SIN_IDENTIDAD'
        return {'tipo': DESTINATARIO_PERSONA, 'usuario_id': uid}, None
    if tipo == DESTINATARIO_EMPRESA:
        try:
            eid = int(d.get('empresa_id'))
        except (TypeError, ValueError):
            return None, 'DESTINATARIO_SIN_IDENTIDAD'
        return {'tipo': DESTINATARIO_EMPRESA, 'empresa_id': eid}, None
    # 'funcion' NO es un tipo de destinatario, deliberadamente.
    return None, 'DESTINATARIO_INVALIDO'


def es_del_destinatario(usuario, destinatario, company_id_del_usuario=None):
    """¿Este usuario ES el sujeto contractual de la instrucción?

    Persona: su identidad. Empresa: pertenecer HOY a esa empresa (y a la obra,
    que lo garantiza el guardia de la ruta). Jamás «tener la misma función».
    """
    d = destinatario or {}
    if d.get('tipo') == DESTINATARIO_PERSONA:
        try:
            return int((usuario or {}).get('id') or 0) == int(d.get('usuario_id'))
        except (TypeError, ValueError):
            return False
    if d.get('tipo') == DESTINATARIO_EMPRESA:
        try:
            return (company_id_del_usuario is not None
                    and int(company_id_del_usuario) == int(d.get('empresa_id')))
        except (TypeError, ValueError):
            return False
    return False


# ── NUMERACIÓN ─────────────────────────────────────────────────────────────

# La instrucción numera con la mecánica común (flujo_de_registro), como todo
# registro formal. Solo necesita tabla y prefijo.
SemMin = collections.namedtuple('SemMin', ('tabla', 'prefijo'))
SEM_INSTRUCCION = SemMin('doc_instrucciones', 'IN')


def siguiente_numero_de_asiento(cur, project_id):
    """El correlativo POR OBRA, continuo entre días. El máximo más uno, nunca
    contar filas: contar reciclaría números (misma lección que los códigos)."""
    cur.execute('SELECT COALESCE(MAX(numero), 0) FROM doc_asientos '
                ' WHERE project_id = %s', (str(project_id),))
    return int((cur.fetchone() or [0])[0] or 0) + 1
