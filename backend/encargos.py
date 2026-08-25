# -*- coding: utf-8 -*-
"""Que debe hacer quien, y cuando. La proyeccion operativa del trabajo pendiente.

EL PROBLEMA QUE RESUELVE
------------------------
Todo en este producto esta organizado por OBRA y por CARPETA. Nada estaba
organizado por *quien debe hacer que*. Medido antes de escribir esto: de los
cuatro modulos de colaboracion -- `reviews`, `rfis`, `redlines`, `transmittals` --
NINGUNO tenia un solo endpoint capaz de responder «¿que esta esperando por mi?».
Todos listaban por `model_urn`.

Un usuario entraba y veia carpetas. En ACC y en Procore entra y ve lo que debe.

LAS DOS INVARIANTES, Y COMO SE GARANTIZAN
-----------------------------------------

**1. UN ENCARGO NUNCA AMPLIA ACCESO.**

Que una tarea se dirija a alguien -- por nombre o por funcion contractual -- no le
da acceso a nada. `mi_trabajo()` parte SIEMPRE de la membresia: su consulta hace
`JOIN project_users`, y ese JOIN es la garantia. Esta dentro de la consulta y no
en una comprobacion posterior, precisamente para que no se pueda olvidar al
escribir la siguiente pantalla.

Un encargo a «SUPERVISION» alcanza unicamente a personas cuya empresa ejerce esa
funcion en ESA obra Y que ya son miembros de ella
(`directorio_de_obra.usuarios_de_la_funcion`). Y el encargo solo trae el asunto y
el vinculo: abrir el objeto vuelve a pasar por los guardias de siempre
(`perimetro_de_obra`, `folder_permissions`). Este modulo no concede nada.

**2. `encargos` NO ES UNA SEGUNDA FUENTE DE VERDAD.**

Review, RFI, Redline y Transmittal son duenos de su estado y de su responsable de
dominio. Esta tabla es una PROYECCION: se abre y se cierra unicamente como
consecuencia de una transicion del objeto de origen.

Por eso **no existe** --y no debe existir-- ninguna ruta para crear, editar,
reasignar o cerrar un encargo por separado. La unica ruta de este modulo es
`GET /api/mi-trabajo`, que solo lee. Si algun dia aparece la tentacion de tener
un `PATCH /api/encargos/<id>`, la respuesta no es anadirlo: es que el modelo esta
mal, porque significaria que el encargo sabe algo que su objeto no sabe.

Hay una prueba guardiana que lo ata:
`test_no_existe_ninguna_ruta_que_escriba_encargos`.
"""
import logging

logger = logging.getLogger(__name__)

TIPOS = ('REVIEW', 'RFI', 'REDLINE', 'TRANSMITTAL', 'SUBMITTAL', 'PROTOCOLO')

# De donde sale cada objeto: (tabla, columna de alcance). El id se compara
# siempre en texto, porque unos son SERIAL y otros UUID.
_ORIGEN = {
    'REVIEW':      ('doc_reviews', 'model_urn'),
    'RFI':         ('doc_rfis', 'model_urn'),
    'REDLINE':     ('doc_redlines', 'model_urn'),
    'TRANSMITTAL': ('transmittals', 'model_urn'),
    'SUBMITTAL':   ('doc_submittals', 'model_urn'),
    'PROTOCOLO':   ('doc_actas', 'model_urn'),
}

_TABLA = """
CREATE TABLE IF NOT EXISTS encargos (
    id              BIGSERIAL PRIMARY KEY,
    project_id      TEXT    NOT NULL,
    objeto_tipo     TEXT    NOT NULL,
    objeto_id       TEXT    NOT NULL,
    destino_usuario INTEGER,
    destino_funcion TEXT,
    asunto          TEXT    NOT NULL,
    estado          TEXT    NOT NULL DEFAULT 'abierto',
    vence_en        TIMESTAMP,
    creado_por      TEXT,
    creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cerrado_en      TIMESTAMP,
    cerrado_por     TEXT,
    avisado_en      TIMESTAMP,
    recordado_en    TIMESTAMP
)
"""

_CLAVES = (
    ('fk_encargos_project', 'project_id', 'projects', 'id', 'CASCADE'),
    ('fk_encargos_usuario', 'destino_usuario', 'users', 'id', 'CASCADE'),
)

_CHECKS = (
    ('ck_encargos_tipo',
     "CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL','PROTOCOLO'))"),
    ('ck_encargos_estado',
     "CHECK (estado IN ('abierto','cerrado'))"),
    # Un encargo sin destinatario no es un encargo.
    ('ck_encargos_destino',
     'CHECK (destino_usuario IS NOT NULL OR destino_funcion IS NOT NULL)'),
)

# Un mismo objeto no puede tener DOS encargos abiertos para el mismo destino.
# Sin esto, reintentar una transicion duplicaria la deuda de alguien.
_UNICO = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_encargos_abierto_unico
    ON encargos(project_id, objeto_tipo, objeto_id,
                COALESCE(destino_usuario, -1), COALESCE(destino_funcion, ''))
 WHERE estado = 'abierto'
"""

_INDICES = (
    "CREATE INDEX IF NOT EXISTS idx_encargos_usuario ON encargos(destino_usuario) WHERE estado='abierto'",
    "CREATE INDEX IF NOT EXISTS idx_encargos_objeto ON encargos(objeto_tipo, objeto_id)",
    "CREATE INDEX IF NOT EXISTS idx_encargos_proyecto ON encargos(project_id) WHERE estado='abierto'",
)


def ensure_encargos():
    """Crea `encargos`. Idempotente. Punto de entrada del bootstrap."""
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute(_TABLA)
            # Para tablas creadas antes de que existiera la memoria de recordatorios.
            cur.execute('ALTER TABLE encargos ADD COLUMN IF NOT EXISTS '
                        'recordado_en TIMESTAMP')
            for sql in _INDICES:
                cur.execute(sql)
            cur.execute(_UNICO)
            conn.commit()
            for nombre, col, ref, col_ref, accion in _CLAVES:
                cur.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", (nombre,))
                if cur.fetchone():
                    continue
                try:
                    cur.execute('ALTER TABLE encargos ADD CONSTRAINT %s FOREIGN KEY (%s) '
                                'REFERENCES %s(%s) ON DELETE %s'
                                % (nombre, col, ref, col_ref, accion))
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning('[encargos] %s no se pudo crear: %s', nombre, e)
            for nombre, cuerpo in _CHECKS:
                cur.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", (nombre,))
                if cur.fetchone():
                    continue
                try:
                    cur.execute('ALTER TABLE encargos ADD CONSTRAINT %s %s' % (nombre, cuerpo))
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning('[encargos] %s no se pudo crear: %s', nombre, e)
            print('[DB] Tabla encargos verificada/creada.')
    except Exception as e:
        print('Error creando encargos: %s' % e)


# ── Escritura: SOLO desde las transiciones del objeto de origen ────────────

def _obra_del_objeto(cur, objeto_tipo, objeto_id):
    """A que obra pertenece de verdad este objeto. None si no existe.

    No se fia del `project_id` que traiga quien llama: lo mira en la fila del
    objeto y lo traduce con el resolutor. Asi un encargo no puede quedar
    apuntando a un objeto de OTRA obra ni a uno que no existe -- que es una de
    las invariantes que hay que demostrar.
    """
    if objeto_tipo not in _ORIGEN:
        return None
    tabla, col_alcance = _ORIGEN[objeto_tipo]
    try:
        cur.execute('SELECT %s FROM %s WHERE id::text = %%s' % (col_alcance, tabla),
                    (str(objeto_id),))
    except Exception:
        return None
    fila = cur.fetchone()
    if not fila:
        return None
    from db import resolve_project_id
    return resolve_project_id(fila[0])


def abrir(cur, objeto_tipo, objeto_id, asunto, destino_usuario=None,
          destino_funcion=None, vence_en=None, creado_por=None):
    """Abre un encargo. Devuelve su id, o None si no procede.

    Valida ANTES de escribir:
      - el tipo es conocido;
      - hay un destinatario;
      - el objeto EXISTE y su obra se puede determinar;
      - si el destino es una persona, esa persona ES MIEMBRO de esa obra.

    Esa ultima comprobacion es la invariante 1 en el momento de crear: no se
    puede abrir un encargo a alguien que no esta en la obra, ni siquiera por
    error de quien llama.
    """
    if objeto_tipo not in TIPOS:
        logger.warning('[encargos] tipo desconocido: %s', objeto_tipo)
        return None
    if not destino_usuario and not destino_funcion:
        return None
    if destino_funcion:
        from directorio_de_obra import FUNCIONES
        if destino_funcion not in FUNCIONES:
            logger.warning('[encargos] funcion desconocida: %s', destino_funcion)
            return None

    obra = _obra_del_objeto(cur, objeto_tipo, objeto_id)
    if not obra:
        logger.warning('[encargos] %s %s no existe o su obra no se puede '
                       'determinar: no se abre encargo', objeto_tipo, objeto_id)
        return None

    if destino_usuario:
        cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                    (obra, int(destino_usuario)))
        if not cur.fetchone():
            logger.warning('[encargos] el usuario %s no es miembro de la obra %s: '
                           'NO se abre el encargo (un encargo no da acceso)',
                           destino_usuario, obra)
            return None

    cur.execute("""
        INSERT INTO encargos (project_id, objeto_tipo, objeto_id, destino_usuario,
                              destino_funcion, asunto, vence_en, creado_por)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING
        RETURNING id
    """, (obra, objeto_tipo, str(objeto_id), destino_usuario, destino_funcion,
          (asunto or '')[:400], vence_en, creado_por))
    fila = cur.fetchone()
    return fila[0] if fila else None


def cerrar_los_de(cur, objeto_tipo, objeto_id, cerrado_por=None, destino_usuario=None):
    """Cierra los encargos abiertos de un objeto. Devuelve cuantos cerro.

    Con `destino_usuario` cierra solo el de esa persona (el caso del acuse de un
    transmittal: acusa uno, los demas siguen debiendo).
    """
    sql = ("UPDATE encargos SET estado='cerrado', cerrado_en=CURRENT_TIMESTAMP, "
           "       cerrado_por=%s "
           " WHERE objeto_tipo=%s AND objeto_id=%s AND estado='abierto'")
    params = [cerrado_por, objeto_tipo, str(objeto_id)]
    if destino_usuario:
        sql += ' AND destino_usuario = %s'
        params.append(int(destino_usuario))
    cur.execute(sql, params)
    return cur.rowcount


def avisar(cur, encargo_id, enlace=None, es_recordatorio=False):
    """Avisa por correo a quien le toca. Nunca revienta la operacion de origen.

    Un fallo de correo no puede tumbar la aprobacion de una revision ni la
    creacion de un RFI: el encargo ya esta abierto y aparecera en «Mi Trabajo»
    aunque el correo no salga. Por eso todo va dentro de un try y solo se anota.

    Los destinatarios se resuelven con las MISMAS reglas que la bandeja
    (`usuarios_de_la_funcion` filtra por membresia), asi que un aviso no puede
    llegarle a alguien a quien la bandeja no le mostraria el encargo.

    `es_recordatorio` decide QUE marca se sella. Son dos columnas y no una a
    proposito: `avisado_en` dice cuando se anuncio el encargo --una sola vez, al
    empezar el turno-- y `recordado_en` cuando se insistio por ultima vez. Con
    una sola columna, cada recordatorio borraria la fecha del anuncio y ya no se
    podria saber cuanto llevaba alguien debiendo algo.
    """
    try:
        cur.execute("""SELECT project_id, asunto, destino_usuario, destino_funcion,
                              objeto_tipo, vence_en
                         FROM encargos WHERE id = %s AND estado = 'abierto'""",
                    (encargo_id,))
        fila = cur.fetchone()
        if not fila:
            return 0
        obra, asunto, uid, funcion, tipo, vence = fila

        correos = []
        if uid:
            cur.execute('SELECT email FROM users WHERE id = %s AND is_active', (uid,))
            f = cur.fetchone()
            if f and f[0]:
                correos.append(f[0])
        elif funcion:
            from directorio_de_obra import usuarios_de_la_funcion
            correos = [e for _i, e, _n in usuarios_de_la_funcion(cur, obra, funcion) if e]
        if not correos:
            return 0

        import mailer
        cuerpo = asunto
        if vence:
            # «dias calendario», dicho asi de claro: no hay calendario de
            # feriados, de modo que un plazo de 3 dias vence en 3 dias
            # naturales aunque caigan en fin de semana.
            cuerpo += '\n\nVence el %s (dias calendario).' % vence.strftime('%d/%m/%Y')
        enviados = 0
        for correo in correos:
            try:
                ok, _detalle = mailer.enviar(
                    correo,
                    'Recordatorio: sigue pendiente' if es_recordatorio
                    else 'Tienes trabajo pendiente en la obra',
                    'Sigue esperando por ti' if es_recordatorio else 'Te toca a ti',
                    cuerpo, enlace=enlace, texto_boton='Ver mi trabajo')
                enviados += 1 if ok else 0
            except Exception as e:
                logger.warning('[encargos] no se pudo avisar a %s: %s', correo, e)
        if enviados:
            columna = 'recordado_en' if es_recordatorio else 'avisado_en'
            cur.execute('UPDATE encargos SET %s = CURRENT_TIMESTAMP WHERE id = %%s'
                        % columna, (encargo_id,))
        return enviados
    except Exception as e:
        logger.warning('[encargos] aviso del encargo %s fallido: %s', encargo_id, e)
        return 0


def usuario_por_email(cur, email):
    """El id de usuario de un correo. None si no existe o esta inactivo."""
    if not email:
        return None
    cur.execute('SELECT id FROM users WHERE lower(email) = lower(%s) AND is_active',
                (str(email).strip(),))
    fila = cur.fetchone()
    return fila[0] if fila else None


# ── Lectura ────────────────────────────────────────────────────────────────

# La consulta de «Mi Trabajo». El `JOIN project_users` NO es un filtro mas: es la
# invariante 1 escrita en SQL. Sin el, un encargo dirigido a una funcion
# alcanzaria a cualquiera de esa empresa, perteneciera o no a la obra.
_MI_TRABAJO = """
SELECT e.id, e.project_id, p.name, e.objeto_tipo, e.objeto_id, e.asunto,
       e.vence_en, e.creado_en, e.creado_por, e.destino_funcion
  FROM encargos e
  JOIN project_users pu ON pu.project_id = e.project_id AND pu.user_id = %(uid)s
  LEFT JOIN projects p ON p.id = e.project_id
 WHERE e.estado = 'abierto'
   AND (
        e.destino_usuario = %(uid)s
        OR (
            e.destino_funcion IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM project_companies pc
                  JOIN users u ON u.company_id = pc.company_id
                 WHERE pc.project_id = e.project_id
                   AND pc.funcion   = e.destino_funcion
                   AND u.id = %(uid)s
            )
       )
   )
 ORDER BY e.vence_en NULLS LAST, e.creado_en
"""


def mi_trabajo(cur, user_id, project_id=None):
    """Lo que esta esperando por esta persona. Solo abierto, solo autorizado."""
    sql = _MI_TRABAJO
    params = {'uid': int(user_id)}
    if project_id:
        sql = sql.replace("WHERE e.estado = 'abierto'",
                          "WHERE e.estado = 'abierto' AND e.project_id = %(pid)s")
        params['pid'] = str(project_id)
    cur.execute(sql, params)
    columnas = ('id', 'project_id', 'project_name', 'objeto_tipo', 'objeto_id',
                'asunto', 'vence_en', 'creado_en', 'creado_por', 'destino_funcion')
    salida = []
    for fila in cur.fetchall():
        d = dict(zip(columnas, fila))
        for k in ('vence_en', 'creado_en'):
            if d.get(k):
                d[k] = d[k].isoformat()
        salida.append(d)
    return salida


# ── Conciliacion ───────────────────────────────────────────────────────────

# Los motivos por los que un encargo sobra. Son CONSTANTES y no cadenas sueltas
# porque `huerfanos()` filtra por ellas: la primera version comparaba el prefijo
# del texto ('el objeto...'), y 'el objeto ya esta resuelto' empieza igual que
# 'el objeto no existe', asi que la divergencia de ESTADO se colaba como si
# fuera un huerfano. Lo encontro el ensayo. Un filtro por la forma del texto no
# distingue significados.
SIN_OBJETO = 'el objeto no existe'
OTRA_OBRA = 'el objeto pertenece a otra obra'
YA_RESUELTO = 'el objeto ya esta resuelto'
_DE_EXISTENCIA = (SIN_OBJETO, OTRA_OBRA)


def huerfanos(cur):
    """Encargos abiertos que apuntan a un objeto inexistente o de otra obra.

    Es un SUBCONJUNTO estricto de `divergencias()`: mira EXISTENCIA, no estado.
    Se conserva porque responde a una pregunta distinta y mas grave -- un
    encargo huerfano apunta a algo que nadie puede abrir.
    """
    return [(e, t, o, m) for e, t, o, m, _d in divergencias(cur)['sobrantes']
            if m in _DE_EXISTENCIA or m.startswith(OTRA_OBRA)]


# ── Conciliacion: ¿la proyeccion coincide con el estado real? ──────────────
#
# POR QUE HACE FALTA
# ------------------
# Se acepto --y con razon-- que un fallo de la proyeccion nunca impida una
# transicion contractual del objeto: un acuse, una respuesta o una aprobacion
# tienen que sobrevivir aunque `encargos` falle. Pero eso abre exactamente un
# caso: RFI = RESPONDIDO con su encargo = ABIERTO. Alguien seguiria viendo en su
# bandeja una deuda que ya salda.
#
# `huerfanos()` NO detectaba eso: solo miraba si el objeto existia.
#
# COMO SE MIRA, Y EN LAS DOS DIRECCIONES
# --------------------------------------
# Igual que `conciliacion_almacen.py` hace con el bucket:
#   - SOBRANTES: hay encargo abierto y el objeto dice que ya no se debe.
#   - FALTANTES: el objeto dice que alguien debe algo y no hay encargo.
# Y si aparece un `objeto_tipo` que este modulo no sabe interpretar, la
# conciliacion SE NIEGA A CORRER en vez de darlo por saldado. Cerrar por no
# entender seria peor que no conciliar.

# Estados que significan «ya no le toca a nadie». Una sola definicion: las rutas
# de RFI y Redline la usan tambien, y dos listas que se separan producen
# divergencias que nadie sabe explicar.
ESTADOS_DE_CIERRE = ('cerrado', 'respondido', 'closed', 'answered')


class TipoNoInterpretable(Exception):
    """Hay encargos de un tipo que este modulo no sabe cotejar."""


def _acuso(acuses, email, nombre, user_id=None):
    """¿Esta persona ya acuso recibo de esta emision?

    IDENTIDAD ESTRICTA CUANDO LA HAY. Un acuse emitido por el producto actual
    lleva `por_id`; ahi la respuesta es una comparacion de identidades y NO hay
    respaldo por nombre ni por correo. Cotejar nombres dejaba que el acuse de un
    HOMONIMO cerrara el encargo de otra persona -- y un encargo cerrado por
    error desaparece de la bandeja de quien todavia lo debe, que es la peor
    forma de perderlo: sin ruido.

    El respaldo por texto se conserva SOLO para los acuses LEGACY, que no tienen
    `por_id`. No se convierten: adivinar a quien se referia un nombre escrito
    hace meses seria inferir sobre el expediente.

    Es la misma correccion que ya se hizo en `_es_destinatario`, del otro lado
    del mismo objeto.
    """
    correo = (email or '').strip().lower()
    nom = (nombre or '').strip().lower()
    try:
        user_id = int(user_id) if user_id is not None else None
    except (TypeError, ValueError):
        user_id = None

    for a in (acuses or []):
        a = a or {}
        # REGISTRO ADMINISTRATIVO DE RECEPCION: salda al DESTINATARIO, no a
        # quien lo registro. Es un acto distinto del acuse y por eso se lee
        # distinto -- pero salda igual, que es de lo que se trataba.
        if a.get('destinatario_id') is not None:
            try:
                if user_id is not None and int(a['destinatario_id']) == user_id:
                    return True
            except (TypeError, ValueError):
                pass
            continue
        if a.get('por_id') is not None:
            # Acuse CON identidad: solo decide la identidad.
            try:
                if user_id is not None and int(a['por_id']) == user_id:
                    return True
            except (TypeError, ValueError):
                pass
            continue

        # -- Respaldo SOLO para acuses legacy, sin `por_id` --
        por = str(a.get('por') or '').strip().lower()
        if por and (por == correo or por == nom):
            return True
    return False


def deudor_de_protocolo(cur, fila):
    """A QUIEN le toca un acta AHORA. (uid, asunto, vence).

    UNA SOLA FUNCION PARA LAS DOS MITADES, igual que en el submittal y por la
    misma razon: dos criterios «parecidos» hacen OSCILAR la conciliacion.

    `fila` = (id, codigo, titulo, estado, autor_id, vence_en)

    UN BORRADOR AQUI SI ES DEUDA, y en el submittal NO. La diferencia es real,
    no una incoherencia: el borrador de un submittal es preparacion sin reloj
    --nadie espera--, mientras que un acta a medias es una INSPECCION EMPEZADA
    que esta bloqueando una actividad. Un encofrado sin liberar detiene el
    vaciado, y eso tiene que aparecer en «lo que me toca».

        Borrador   el AUTOR: fue a campo y no termino de comprobar
        los demas  nadie: el acta ya tiene veredicto
    """
    sid, codigo, titulo, estado, autor_id, vence = fila
    if (estado or '').strip() != 'Borrador' or not autor_id:
        return None, '', None
    return (autor_id,
            'Completar y firmar %s: %s' % (codigo or 'PL', titulo or ''),
            vence)


_SQL_ACTAS_VIVAS = """
    SELECT id, codigo, titulo, estado, autor_id, vence_en, project_id
      FROM doc_actas WHERE estado = 'Borrador'
"""


def deudor_de_submittal(cur, fila):
    """A QUIEN le toca un submittal AHORA, y por que. (uid, asunto, vence).

    UNA SOLA FUNCION PARA LAS DOS MITADES DE LA CONCILIACION. `_sigue_debiendose`
    y `_faltantes` la llaman las dos, y por eso no pueden discrepar. Escribir dos
    criterios «parecidos» es exactamente lo que hizo OSCILAR la conciliacion del
    RFI en su dia --se reabria lo que la otra mitad declaraba sobrante-- y ese
    error no se repite aqui.

    `fila` = (id, codigo, titulo, estado, responsable_id, steps, current_step,
              paso_vence_en, vence_en)

    LA PELOTA, ESTADO POR ESTADO:
        Borrador     NADIE. Es el banco de trabajo del contratista, no una deuda.
                     Llenar la bandeja de alguien con sus propios borradores
                     convierte «lo que me toca» en ruido, y una bandeja con
                     ruido deja de mirarse.
        Enviado      el MANAGER: tiene que distribuirlo a revision.
        En revision  el REVISOR DEL PASO ACTUAL, resuelto por `flujo_de_revision`
                     --el mismo modulo que usa el manejador-- y no por su cuenta.
        Respondido   el MANAGER: tiene que cerrarlo y distribuir el veredicto.
        Cerrado      nadie.
        Anulado      nadie.
    """
    (sid, codigo, titulo, estado, responsable_id,
     steps, paso, paso_vence, vence) = fila
    estado = (estado or '').strip()

    if estado == 'Enviado':
        if not responsable_id:
            return None, '', None
        return (responsable_id,
                'Distribuir a revision %s: %s' % (codigo or 'SUB', titulo or ''),
                vence)

    if estado == 'En revision':
        import flujo_de_revision as _flujo
        try:
            uid, _motivo = _flujo.revisor_del_paso(cur, (steps or [])[paso or 0])
        except IndexError:
            return None, '', None
        if not uid:
            return None, '', None
        return (uid,
                'Revisar %s: %s (paso %d)' % (codigo or 'SUB', titulo or '',
                                              (paso or 0) + 1),
                paso_vence)

    if estado == 'Respondido':
        if not responsable_id:
            return None, '', None
        return (responsable_id,
                'Cerrar y distribuir %s: %s' % (codigo or 'SUB', titulo or ''),
                vence)

    return None, '', None


_SQL_SUBMITTALS_VIVOS = """
    SELECT id, codigo, titulo, estado, responsable_id, steps, current_step,
           paso_vence_en, vence_en, project_id
      FROM doc_submittals
     WHERE estado IN ('Enviado','En revision','Respondido')
"""


def _sigue_debiendose(cur, tipo, objeto_id, destino_usuario):
    """¿El OBJETO dice que esto se sigue debiendo? None si no se puede saber.

    El objeto es la fuente de verdad. Esta funcion no opina: le pregunta.
    """
    if tipo in ('RFI', 'REDLINE'):
        tabla = 'doc_rfis' if tipo == 'RFI' else 'doc_redlines'
        cur.execute('SELECT estado, respuesta FROM %s WHERE id::text = %%s' % tabla,
                    (str(objeto_id),))
        fila = cur.fetchone()
        if not fila:
            return None
        estado = (fila[0] or '').strip().lower()
        respuesta = (fila[1] or '').strip()
        return not (estado in ESTADOS_DE_CIERRE or respuesta)

    if tipo == 'REVIEW':
        cur.execute('SELECT status, current_step, steps FROM doc_reviews WHERE id::text = %s',
                    (str(objeto_id),))
        fila = cur.fetchone()
        if not fila:
            return None
        status, paso, steps = fila
        if status != 'pending':
            return False
        # Y ademas tiene que ser el revisor del paso ACTUAL: si la revision
        # avanzo y el encargo del paso anterior quedo abierto, esa persona ya no
        # la debe. Se resuelve por la MISMA via que usa el manejador de
        # revisiones -- `flujo_de_revision` --, para que la revision y su
        # proyeccion no puedan discrepar sobre a quien le toca.
        if destino_usuario is None:
            return True
        try:
            import flujo_de_revision as _flujo
            uid, _motivo = _flujo.revisor_del_paso(cur, (steps or [])[paso or 0])
        except Exception:
            return True
        return uid == destino_usuario

    if tipo == 'SUBMITTAL':
        cur.execute("""SELECT id, codigo, titulo, estado, responsable_id, steps,
                              current_step, paso_vence_en, vence_en
                         FROM doc_submittals WHERE id::text = %s""",
                    (str(objeto_id),))
        fila = cur.fetchone()
        if not fila:
            return None
        uid, _asunto, _vence = deudor_de_submittal(cur, fila)
        if uid is None:
            return False
        if destino_usuario is None:
            return True
        # Y ademas tiene que ser QUIEN LO DEBE HOY: si el submittal avanzo de
        # paso y el encargo del revisor anterior quedo abierto, esa persona ya
        # no lo debe. Mismo razonamiento que en REVIEW.
        return uid == destino_usuario

    if tipo == 'PROTOCOLO':
        cur.execute("""SELECT id, codigo, titulo, estado, autor_id, vence_en
                         FROM doc_actas WHERE id::text = %s""", (str(objeto_id),))
        fila = cur.fetchone()
        if not fila:
            return None
        uid, _a, _v = deudor_de_protocolo(cur, fila)
        if uid is None:
            return False
        return True if destino_usuario is None else uid == destino_usuario

    if tipo == 'TRANSMITTAL':
        cur.execute('SELECT acuses FROM transmittals WHERE id::text = %s', (str(objeto_id),))
        fila = cur.fetchone()
        if not fila:
            return None
        if destino_usuario is None:
            return True
        cur.execute('SELECT email, name FROM users WHERE id = %s', (destino_usuario,))
        u = cur.fetchone()
        if not u:
            return True
        # Se pasa el ID: si el acuse lo lleva, decide el, y el nombre no cuenta.
        return not _acuso(fila[0], u[0], u[1], destino_usuario)

    return None


def _faltantes(cur):
    """Lo que el objeto dice que se debe y no tiene encargo abierto.

    QUE SE PUEDE COMPROBAR DE CADA TIPO, Y POR QUE
    ----------------------------------------------
    REVIEW y TRANSMITTAL: las dos direcciones. Sus destinatarios llevan identidad.

    RFI: las dos direcciones DESDE QUE TIENE `responsable_id`. Antes solo se
    podia detectar que SOBRARA un encargo --el objeto ya estaba respondido--,
    porque su responsable era texto libre y del objeto no se deducia a que
    usuario abrirselo. Los RFI LEGACY, que siguen sin `responsable_id`, siguen
    sin poder comprobarse en esa direccion: es la consecuencia aceptada de no
    convertir el texto historico en un usuario.

    REDLINE: las dos direcciones DESDE QUE TIENE `responsable_id`, igual que el
    RFI y por la misma razon. Los 33 Red Lines HEREDADOS siguen sin el --su
    responsable es texto libre-- pero estan TODOS cerrados, asi que no deben
    nada y no aparecen por ninguna de las dos vias.
    """
    faltan, bloqueadas = [], []
    import flujo_de_revision as _flujo

    # Revisiones vivas: el revisor del paso actual deberia tener su encargo.
    cur.execute("SELECT id, model_urn, title, current_step, steps, status, paso_vence_en "
                "  FROM doc_reviews WHERE status = 'pending'")
    for rid, urn, titulo, paso, steps, status, vence in cur.fetchall():
        rev = {'model_urn': urn, 'steps': steps, 'current_step': paso, 'status': status}
        estado, motivo = _flujo.estado_del_flujo(cur, rev)
        if estado == 'BLOQUEADA':
            # NO es una divergencia reparable: es un asunto que necesita a una
            # persona. Intentar repararla llamaria a `abrir()`, que se negaria
            # --un encargo no da acceso--, y la conciliacion no convergeria
            # nunca imprimiendo un mensaje que no dice cual es el problema.
            bloqueadas.append(('REVIEW', str(rid), titulo, motivo))
            continue
        uid, _m = _flujo.revisor_del_paso(cur, (steps or [])[paso or 0])
        if not uid:
            continue
        cur.execute("SELECT 1 FROM encargos WHERE objeto_tipo='REVIEW' AND objeto_id=%s "
                    "   AND destino_usuario=%s AND estado='abierto'", (str(rid), uid))
        if not cur.fetchone():
            # El plazo se recupera DEL REVIEW, que es su fuente de verdad. Si
            # viniera vacio, reconstruir el encargo perderia el vencimiento --
            # y con el, el recordatorio y el aviso de vencido en la bandeja.
            faltan.append(('REVIEW', str(rid), uid,
                           'Revisar: %s (paso %d)' % (titulo, (paso or 0) + 1), vence))

    # RFI vivos con responsable ESTRUCTURADO.
    #
    # Esto ANTES NO SE PODIA. El responsable de un RFI era texto libre --'Ing.
    # Valeria Barrenechea'-- y del objeto no se deducia a que usuario abrirle el
    # encargo: solo se detectaba que SOBRARA uno, nunca que faltara. Con
    # `responsable_id` en el objeto, la proyeccion se vuelve reconstruible.
    try:
        # EL MISMO CRITERIO QUE `_sigue_debiendose`, y no otro parecido.
        #
        # La primera version filtraba solo `estado <> 'Cerrado'`, asi que un RFI
        # RESPONDIDO se contaba como «falta su encargo», la conciliacion lo
        # reabria, y acto seguido `_sigue_debiendose` lo declaraba sobrante: dos
        # mitades con criterios distintos hacen que la conciliacion OSCILE en vez
        # de converger. Lo encontro el ensayo.
        cur.execute("SELECT id::text, codigo, titulo, responsable_id, project_id, "
                    "       vence_en, estado FROM doc_rfis "
                    "  WHERE responsable_id IS NOT NULL "
                    "    AND lower(coalesce(estado,'')) NOT IN %s "
                    "    AND coalesce(respuesta,'') = ''", (ESTADOS_DE_CIERRE,))
        for rid, codigo, titulo, uid, obra, vence, estado in cur.fetchall():
            # Si el responsable ya no esta en la obra, el RFI esta BLOQUEADO:
            # no es una divergencia reparable --`abrir()` se negaria-- sino un
            # asunto que necesita a una persona.
            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                        (str(obra), uid))
            if not cur.fetchone():
                bloqueadas.append(('RFI', str(rid), codigo or '',
                                   'su responsable ya no pertenece a la obra'))
                continue
            cur.execute("SELECT 1 FROM encargos WHERE objeto_tipo='RFI' AND objeto_id=%s "
                        "   AND destino_usuario=%s AND estado='abierto'", (str(rid), uid))
            if not cur.fetchone():
                faltan.append(('RFI', str(rid), uid,
                               'Responder %s: %s' % (codigo or 'RFI', titulo or ''),
                               vence))
    except Exception:
        cur.connection.rollback()

    # Red Lines vivos con responsable ESTRUCTURADO.
    #
    # MISMA MECANICA QUE EL RFI, y a proposito el MISMO CRITERIO --
    # `ESTADOS_DE_CIERRE` y `respuesta` vacia-- y no otro parecido: dos mitades
    # con criterios distintos hacen que la conciliacion OSCILE en vez de
    # converger, y eso ya se pago una vez en este mismo fichero.
    #
    # Lo que NO se comparte es el SIGNIFICADO: aqui el encargo dice «Revisar»,
    # porque lo que se pide no es contestar una consulta sino pronunciarse
    # sobre una modificacion del proyecto.
    try:
        import flujo_de_redline as _rl
        cur.execute("SELECT id::text, codigo, titulo, responsable_id, project_id, "
                    "       vence_en, estado FROM doc_redlines "
                    "  WHERE responsable_id IS NOT NULL "
                    "    AND lower(coalesce(estado,'')) NOT IN %s "
                    "    AND coalesce(respuesta,'') = ''", (ESTADOS_DE_CIERRE,))
        for rid, codigo, titulo, uid, obra, vence, estado in cur.fetchall():
            # Si el responsable ya no esta en la obra, el Red Line esta
            # BLOQUEADO: no es una divergencia reparable --`abrir()` se
            # negaria, porque un encargo no da acceso-- sino un asunto que
            # necesita a una persona.
            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                        (str(obra), uid))
            if not cur.fetchone():
                bloqueadas.append(('REDLINE', str(rid), codigo or '',
                                   'su responsable ya no pertenece a la obra'))
                continue
            cur.execute("SELECT 1 FROM encargos WHERE objeto_tipo='REDLINE' AND objeto_id=%s "
                        "   AND destino_usuario=%s AND estado='abierto'", (str(rid), uid))
            if not cur.fetchone():
                faltan.append(('REDLINE', str(rid), uid,
                               _rl.SEMANTICA.asunto_encargo % (codigo or 'RL', titulo or ''),
                               vence))
    except Exception:
        cur.connection.rollback()

    # Submittals vivos: quien los deba HOY deberia tener su encargo.
    #
    # Las dos direcciones desde el primer dia, porque este registro nacio con
    # identidad estructurada (`autor_id`, `responsable_id`, pasos con `user_id`)
    # y no arrastra el texto libre que dejo al RFI a medias.
    try:
        cur.execute(_SQL_SUBMITTALS_VIVOS)
        for fila in cur.fetchall():
            obra = fila[9]
            uid, asunto, vence = deudor_de_submittal(cur, fila[:9])
            if not uid:
                bloqueadas.append(('SUBMITTAL', str(fila[0]), fila[1] or '',
                                   'no se puede determinar a quien le toca'))
                continue
            # Si quien lo debe ya no esta en la obra, el submittal esta
            # BLOQUEADO: no es una divergencia reparable --`abrir()` se negaria,
            # porque un encargo no da acceso-- sino un asunto que necesita a una
            # persona. Mismo criterio que el RFI y el Red Line.
            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                        (str(obra), uid))
            if not cur.fetchone():
                bloqueadas.append(('SUBMITTAL', str(fila[0]), fila[1] or '',
                                   'quien lo debe ya no pertenece a la obra'))
                continue
            cur.execute("SELECT 1 FROM encargos WHERE objeto_tipo='SUBMITTAL' AND objeto_id=%s "
                        "   AND destino_usuario=%s AND estado='abierto'", (str(fila[0]), uid))
            if not cur.fetchone():
                faltan.append(('SUBMITTAL', str(fila[0]), uid, asunto, vence))
    except Exception:
        cur.connection.rollback()

    # Actas a medias: quien las levanto las debe.
    try:
        cur.execute(_SQL_ACTAS_VIVAS)
        for fila in cur.fetchall():
            obra = fila[6]
            uid, asunto, vence = deudor_de_protocolo(cur, fila[:6])
            if not uid:
                continue
            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                        (str(obra), uid))
            if not cur.fetchone():
                bloqueadas.append(('PROTOCOLO', str(fila[0]), fila[1] or '',
                                   'quien la levanto ya no pertenece a la obra'))
                continue
            cur.execute("SELECT 1 FROM encargos WHERE objeto_tipo='PROTOCOLO' AND objeto_id=%s "
                        "   AND destino_usuario=%s AND estado='abierto'", (str(fila[0]), uid))
            if not cur.fetchone():
                faltan.append(('PROTOCOLO', str(fila[0]), uid, asunto, vence))
    except Exception:
        cur.connection.rollback()

    # Emisiones sin acusar: cada destinatario que sea usuario y miembro.
    cur.execute('SELECT id, number, subject, recipients, acuses FROM transmittals')
    for tid, num, asunto, recipients, acuses in cur.fetchall():
        for r in (recipients or []):
            correo = r.get('email') if isinstance(r, dict) else r
            nombre = r.get('name') if isinstance(r, dict) else None
            # EL `user_id` DEL DESTINATARIO MANDA, si la emision lo lleva. Las
            # emisiones nuevas lo guardan; buscar por correo cuando ya se sabe
            # quien es seria volver a resolver una identidad ya resuelta -- y
            # dos cuentas pueden compartir correo si alguna vez se permite.
            uid = None
            if isinstance(r, dict) and r.get('user_id'):
                try:
                    uid = int(r['user_id'])
                except (TypeError, ValueError):
                    uid = None
            if uid is None:
                uid = usuario_por_email(cur, correo)      # emision legacy
            if not uid or _acuso(acuses, correo, nombre, uid):
                continue
            cur.execute("SELECT 1 FROM encargos WHERE objeto_tipo='TRANSMITTAL' AND objeto_id=%s "
                        "   AND destino_usuario=%s AND estado='abierto'", (str(tid), uid))
            if not cur.fetchone():
                faltan.append(('TRANSMITTAL', str(tid), uid,
                               'Acusar recibo de TR-%03d: %s' % (num or 0, asunto or ''),
                               None))
    return faltan, bloqueadas


def divergencias(cur):
    """¿Coincide la proyeccion con el estado real de sus objetos?

    Devuelve {'sobrantes': [...], 'faltantes': [...]}. Solo LEE.
    Lanza `TipoNoInterpretable` si hay encargos de un tipo desconocido.
    """
    cur.execute("SELECT DISTINCT objeto_tipo FROM encargos WHERE estado = 'abierto'")
    desconocidos = sorted({t for (t,) in cur.fetchall() if t not in TIPOS})
    if desconocidos:
        raise TipoNoInterpretable(
            'hay encargos abiertos de tipos que no se saben cotejar (%s): la '
            'conciliacion no corre, porque cerrar por no entender seria peor que '
            'no conciliar' % ', '.join(desconocidos))

    sobrantes = []
    cur.execute("SELECT id, project_id, objeto_tipo, objeto_id, destino_usuario "
                "  FROM encargos WHERE estado = 'abierto' ORDER BY id")
    for eid, pid, tipo, oid, uid in cur.fetchall():
        obra = _obra_del_objeto(cur, tipo, oid)
        if obra is None:
            sobrantes.append((eid, tipo, oid, SIN_OBJETO, uid))
            continue
        if obra != pid:
            sobrantes.append((eid, tipo, oid,
                              '%s (%s, no %s)' % (OTRA_OBRA, obra, pid), uid))
            continue
        debe = _sigue_debiendose(cur, tipo, oid, uid)
        if debe is False:
            sobrantes.append((eid, tipo, oid, YA_RESUELTO, uid))
    faltantes, bloqueadas = _faltantes(cur)
    return {'sobrantes': sobrantes, 'faltantes': faltantes, 'bloqueadas': bloqueadas}


def conciliar(cur, aplicar=False, actor='conciliacion'):
    """Repara la divergencia. Idempotente: correrla dos veces no cambia nada.

    Cerrar un encargo sobrante y abrir uno que falta NO pierde informacion: el
    objeto sigue siendo la fuente de verdad y esto solo ajusta su reflejo. Por
    eso aqui SI se puede reparar, a diferencia de la conciliacion del almacen,
    donde borrar bytes es irreversible.

    Con `aplicar=False` solo informa. Devuelve (cerrados, abiertos, informe).
    """
    d = divergencias(cur)
    cerrados = abiertos = 0
    if aplicar:
        for eid, _t, _o, _motivo, _u in d['sobrantes']:
            cur.execute("UPDATE encargos SET estado='cerrado', "
                        "       cerrado_en=CURRENT_TIMESTAMP, cerrado_por=%s "
                        " WHERE id=%s AND estado='abierto'", (actor, eid))
            cerrados += cur.rowcount
        for tipo, oid, uid, asunto, vence in d['faltantes']:
            # Pasa por `abrir()`, que vuelve a comprobar pertenencia: la
            # conciliacion no puede colar un encargo que la via normal negaria.
            # Y con `vence_en`: reconstruir el encargo sin su plazo lo dejaria
            # sin recordatorio y sin aviso de vencido, que es media reparacion.
            if abrir(cur, tipo, oid, asunto, destino_usuario=uid,
                     vence_en=vence, creado_por=actor):
                abiertos += 1
    return cerrados, abiertos, d
