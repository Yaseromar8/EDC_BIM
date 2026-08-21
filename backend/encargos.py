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

TIPOS = ('REVIEW', 'RFI', 'REDLINE', 'TRANSMITTAL')

# De donde sale cada objeto: (tabla, columna de alcance). El id se compara
# siempre en texto, porque unos son SERIAL y otros UUID.
_ORIGEN = {
    'REVIEW':      ('doc_reviews', 'model_urn'),
    'RFI':         ('doc_rfis', 'model_urn'),
    'REDLINE':     ('doc_redlines', 'model_urn'),
    'TRANSMITTAL': ('transmittals', 'model_urn'),
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
    avisado_en      TIMESTAMP
)
"""

_CLAVES = (
    ('fk_encargos_project', 'project_id', 'projects', 'id', 'CASCADE'),
    ('fk_encargos_usuario', 'destino_usuario', 'users', 'id', 'CASCADE'),
)

_CHECKS = (
    ('ck_encargos_tipo',
     "CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL'))"),
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


def avisar(cur, encargo_id, enlace=None):
    """Avisa por correo a quien le toca. Nunca revienta la operacion de origen.

    Un fallo de correo no puede tumbar la aprobacion de una revision ni la
    creacion de un RFI: el encargo ya esta abierto y aparecera en «Mi Trabajo»
    aunque el correo no salga. Por eso todo va dentro de un try y solo se anota.

    Los destinatarios se resuelven con las MISMAS reglas que la bandeja
    (`usuarios_de_la_funcion` filtra por membresia), asi que un aviso no puede
    llegarle a alguien a quien la bandeja no le mostraria el encargo.
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
            cuerpo += '\n\nVence: %s' % vence.strftime('%d/%m/%Y')
        enviados = 0
        for correo in correos:
            try:
                ok, _detalle = mailer.enviar(
                    correo, 'Tienes trabajo pendiente en la obra',
                    'Te toca a ti', cuerpo, enlace=enlace, texto_boton='Ver mi trabajo')
                enviados += 1 if ok else 0
            except Exception as e:
                logger.warning('[encargos] no se pudo avisar a %s: %s', correo, e)
        if enviados:
            cur.execute('UPDATE encargos SET avisado_en = CURRENT_TIMESTAMP WHERE id = %s',
                        (encargo_id,))
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

def huerfanos(cur):
    """Encargos abiertos que apuntan a un objeto inexistente o de otra obra.

    Solo INFORMA. No borra: un encargo huerfano es un sintoma, y borrarlo en
    silencio taparia la causa. `abrir()` valida en el momento de crear, asi que
    esto no deberia encontrar nada; existe para demostrarlo, no para arreglarlo.
    """
    malos = []
    cur.execute("SELECT id, project_id, objeto_tipo, objeto_id FROM encargos "
                " WHERE estado = 'abierto'")
    for eid, pid, tipo, oid in cur.fetchall():
        obra = _obra_del_objeto(cur, tipo, oid)
        if obra is None:
            malos.append((eid, tipo, oid, 'el objeto no existe'))
        elif obra != pid:
            malos.append((eid, tipo, oid, 'el objeto es de la obra %s, no de %s' % (obra, pid)))
    return malos
