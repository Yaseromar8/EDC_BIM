# -*- coding: utf-8 -*-
"""QUIEN ADMINISTRA QUE. Una sola resolucion, y una sola vez.

EL PROBLEMA QUE CIERRA
----------------------
Hasta el 21-ago-2026 `users.role = 'admin'` significaba TRES cosas a la vez, y
por eso era una llave maestra. Medido con sonda sobre un `admin` que NO era
miembro de la obra y SIN ninguna concesion de carpeta:

    200  /api/docs/list · global-search · indice-expediente · activity
    200  POST …/participantes   -> cambio la funcion contractual de una empresa
    200  POST /api/rfis         -> EMITIO UN RFI EN UNA OBRA AJENA
    permiso_efectivo(admin, contrato) = 'admin'

LAS TRES FIGURAS, Y DONDE VIVE CADA UNA
---------------------------------------
  ENTITY ADMIN      `users.role = 'admin'`
                    El custodio documental de la instancia del cliente. Crea y
                    archiva obras, administra los usuarios de la entidad, y
                    conserva alcance global MIENTRAS 1 instancia = 1 cliente.

  PROJECT ADMIN     `project_users.es_admin = TRUE`
                    Administra UNA obra: su directorio, sus permisos, sus
                    rescates. Su autoridad TERMINA en esa obra.

  SYSTEM OPERATOR   NO es un rol de esta aplicacion.
                    Quien tiene credenciales de PostgreSQL, GCS, Render o las
                    copias entra por fuera de Flask, y ningun valor de
                    `users.role` lo impide. Se dice en el informe en vez de
                    fingir que esto lo aisla.

POR QUE UNA COLUMNA EN `project_users` Y NO UNA TABLA
-----------------------------------------------------
Porque la regla «un Project Admin debe ser miembro de la obra» queda
ESTRUCTURALMENTE garantizada: no puede existir un administrador de obra sin
fila de membresia, porque ES la fila de membresia. Retirar a alguien de la obra
le retira la administracion en el mismo acto, sin que nadie tenga que acordarse.

Y no toca funcion contractual, empresa, encargos ni historicos: ninguno vive
ahi.

LA IDENTIDAD ES `projects.id`, NUNCA `model_urn`
-------------------------------------------------
Un `model_urn` es un ALCANCE: la obra '1' tiene OCHO alias registrados.
Resolver la administracion por alias dejaria a la misma persona siendo
administradora bajo un alias y no bajo otro. Todo lo de aqui resuelve primero
con `resolve_project_id`.
"""
import logging

from esquema_congelado import solo_con_ddl

logger = logging.getLogger(__name__)


def es_entity_admin(usuario):
    """El custodio de la instancia. Alcance global mientras 1 instancia = 1 cliente."""
    return (usuario or {}).get('role') == 'admin'


def es_admin_de_obra(cur, usuario, obra):
    """¿Esta persona administra ESTA obra?

    ENTITY ADMIN  o  `project_users.es_admin` para esa obra. Nada mas.

    `obra` puede llegar como alias: se resuelve a `projects.id` antes de
    preguntar. Sin obra resoluble se responde que NO -- fail-closed: no saber de
    que obra hablamos no puede resolverse concediendo administracion.
    """
    usuario = usuario or {}
    if es_entity_admin(usuario):
        return True

    uid = usuario.get('id')
    try:
        uid = int(uid)
    except (TypeError, ValueError):
        return False                      # sesion sin identidad numerica

    from db import resolve_project_id
    canonica = resolve_project_id(obra) if obra else None
    if not canonica:
        logger.warning('[admin] obra indeterminable: %r', obra)
        return False

    try:
        cur.execute("SELECT es_admin FROM project_users "
                    " WHERE project_id = %s AND user_id = %s", (str(canonica), uid))
        fila = cur.fetchone()
        return bool(fila and fila[0])
    except Exception as e:
        logger.error('[admin] no se pudo resolver: %s', e)
        return False                      # FAIL-CLOSED


def guardia_administrativa(cur, usuario, obra, accion='administrar esta obra'):
    """None si puede administrar; (cuerpo, 403) si no.

    Para las rutas que hasta hoy decian «solo un administrador» y querian decir
    «solo un administrador DE ESTA OBRA».
    """
    from flask import jsonify
    if es_admin_de_obra(cur, usuario, obra):
        return None
    return jsonify({
        'error': 'Solo un administrador de esta obra puede %s.' % accion,
        # `code` dice la CLASE de negativa y no cambia: es lo que ya leen las
        # rutas, la interfaz y el ensayo de Participantes. Lo NUEVO es el
        # motivo, que dice por que -- «no eres administrador DE ESTA OBRA», que
        # no es lo mismo que «no eres administrador».
        'code': 'FORBIDDEN',
        'motivo': 'NO_ES_ADMIN_DE_OBRA'}), 403


@solo_con_ddl
def asegurar_columna():
    """`project_users.es_admin`. Idempotente. Punto de entrada del bootstrap.

    RESPETA EL CONGELADO DEL DDL, COMO LAS OTRAS 43 RUTINAS DE ESQUEMA
    ------------------------------------------------------------------
    Nacio sin el decorador y eso era un defecto: `server.py` la llama en cada
    arranque, asi que con `DDL_EN_CALIENTE=false` --que es el estado objetivo en
    produccion-- la aplicacion habria seguido ejecutando `ALTER TABLE`. Medido:
    `ensure_columnas_pendientes` callaba y esta ejecutaba.

    No es solo un error de log en cada boot. Mientras estuviera sin decorar, la
    frase «DDL_EN_CALIENTE=false ⇒ la aplicacion no puede alterar su esquema»
    dejaba de ser cierta -- y esa frase es uno de los seis puntos de postura que
    el servicio publica. Un control que se describe por intencion y no por
    comportamiento no controla nada.

    Con el DDL congelado devuelve None sin tocar la base. Quien SI puede
    ejecutarla es el bootstrap, que corre dentro de `with permitir_ddl()`.

    NACE FALSE PARA TODOS, y eso es la mitad del diseño: no se infiere quien
    debia administrar que. Los `users.role='admin'` actuales siguen siendo
    Entity Admins y no pierden nada; la separacion la decide una persona, obra
    por obra, desde la pantalla de Participantes.

    Inferirlo habria sido repartir autoridad adivinando -- y sobre autoridad,
    adivinar es la peor clase de inferencia.
    """
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("ALTER TABLE project_users ADD COLUMN IF NOT EXISTS "
                        "  es_admin BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_project_users_admin "
                        "  ON project_users (project_id) WHERE es_admin")
            conn.commit()
            print('[admin] project_users.es_admin verificada.')
    except Exception as e:
        print('[admin] es_admin no verificada: %s' % e)


def inventario_de_administradores(cur):
    """Quien tiene AHORA autoridad administrativa, y de que tipo.

    Existe para el punto 7 del encargo: antes de declarar esto cerrado para un
    piloto externo hay que MIRAR la lista y decidir cuenta por cuenta. Una
    cuenta puramente tecnica que conserve Entity Admin por inercia es
    exactamente lo que esta separacion pretende evitar, y no se detecta sola.
    """
    cur.execute("""SELECT u.id, u.name, u.email, u.role, COALESCE(u.is_active, TRUE),
                          (SELECT count(*) FROM project_users pu
                            WHERE pu.user_id = u.id AND pu.es_admin) AS obras_admin,
                          (SELECT count(*) FROM project_users pu
                            WHERE pu.user_id = u.id) AS obras
                     FROM users u
                    WHERE u.role = 'admin'
                       OR EXISTS (SELECT 1 FROM project_users pu
                                   WHERE pu.user_id = u.id AND pu.es_admin)
                    ORDER BY u.role DESC, u.id""")
    return [{'id': r[0], 'nombre': r[1], 'correo': r[2], 'rol': r[3],
             'activo': r[4], 'obras_que_administra': r[5], 'obras': r[6],
             'tipo': 'ENTITY ADMIN' if r[3] == 'admin' else 'PROJECT ADMIN'}
            for r in cur.fetchall()]
