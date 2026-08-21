# -*- coding: utf-8 -*-
"""Las claves ajenas que el codigo declara y la base nunca tuvo.

POR QUE FALTABAN
----------------
`project_users` se define DOS veces, y gana la que no las lleva:

  esquema_base.py:106   CREATE TABLE IF NOT EXISTS project_users (...)   <- sin FK
  routes/auth.py:136    CREATE TABLE IF NOT EXISTS project_users (
                            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, ...)

La primera corre antes -- las definiciones base se extrajeron de la produccion
real, donde la tabla se habia creado a mano sin referencias. Cuando le toca a la
segunda, la tabla YA EXISTE, y `IF NOT EXISTS` la convierte en un no-op. La clave
ajena esta escrita en el repositorio, se lee al revisar el codigo, y no existe en
ninguna base: ni en produccion ni en una instancia recien construida.

QUE PASA SIN ELLAS
------------------
Resurreccion de membresias. Borrar una obra deja filas en `project_users`
apuntando a un id que ya no existe. Y los ids se acunan asi:

    routes/projects.py:343   f"b.proj_{slug}_{int(time.time()) % 100000}"

Ese sufijo DA LA VUELTA CADA 27,7 HORAS (100000 s). Dos obras con el mismo
nombre creadas con esa separacion producen el mismo id. Cuando eso ocurre, la
membresia huerfana de la obra borrada REVIVE sobre la obra nueva: alguien que
pertenecia a una obra cerrada aparece como miembro de otra distinta, sin que
nadie lo haya anadido y sin que ningun registro lo explique.

POR QUE `NOT VALID` Y NO A SECAS
--------------------------------
Anadir una clave ajena normal EXAMINA todas las filas existentes y falla si hay
una sola huerfana. En una base con anos de uso eso convierte un despliegue en una
caida -- y la unica salida rapida seria BORRAR las filas que estorban, que es
justo lo que no se puede hacer con informacion de un cliente.

`ADD CONSTRAINT ... NOT VALID` no examina lo que ya hay, pero SI obliga a las
filas nuevas y SI aplica `ON DELETE CASCADE` de ahi en adelante. Es decir: el
agujero se cierra para el futuro sin tocar el pasado. Despues se intenta
`VALIDATE CONSTRAINT`, que es lo que examina lo viejo: si los datos estan
limpios, la restriccion queda plenamente validada; si no, se queda en NOT VALID
y se DICE, con nombres y numeros, que filas lo impiden.

Ninguna rama borra ni modifica una sola fila.
"""
import logging

logger = logging.getLogger(__name__)

# (tabla, nombre, columna, tabla_referida, columna_referida, accion_al_borrar)
#
# Sobre las acciones:
#   CASCADE  en las membresias: si la obra o el usuario desaparecen, la
#            pertenencia no significa nada y no debe sobrevivirles.
#   RESTRICT en projects.hub_id: borrar una CARTERA no puede borrar las OBRAS que
#            contiene. Si alguien lo intenta, que falle y se vea.
_CLAVES = (
    ('project_users', 'fk_project_users_project', 'project_id', 'projects', 'id', 'CASCADE'),
    ('project_users', 'fk_project_users_user', 'user_id', 'users', 'id', 'CASCADE'),
    ('projects', 'fk_projects_hub', 'hub_id', 'hubs', 'id', 'RESTRICT'),
)


def _existe(cur, nombre):
    cur.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", (nombre,))
    return cur.fetchone() is not None


def _validada(cur, nombre):
    cur.execute("SELECT convalidated FROM pg_constraint WHERE conname = %s", (nombre,))
    fila = cur.fetchone()
    return bool(fila and fila[0])


def huerfanas(cur, tabla, columna, referida, col_referida):
    """Cuantas filas apuntan a algo que no existe. Solo cuenta; no toca nada."""
    cur.execute(
        'SELECT count(*) FROM %s t WHERE t.%s IS NOT NULL '
        '  AND NOT EXISTS (SELECT 1 FROM %s r WHERE r.%s = t.%s)'
        % (tabla, columna, referida, col_referida, columna))
    return cur.fetchone()[0]


def asegurar_claves_ajenas(conn=None):
    """Crea las claves ajenas que falten. Idempotente y no destructiva.

    Devuelve la lista de (nombre, estado) donde estado es 'validada',
    'sin_validar' o 'ya_estaba'.
    """
    from db import get_db_connection

    resultados = []
    propia = conn is None
    if propia:
        ctx = get_db_connection()
        conn = ctx.__enter__()
    try:
        for tabla, nombre, col, referida, col_ref, accion in _CLAVES:
            cur = conn.cursor()
            try:
                if _existe(cur, nombre):
                    estado = 'ya_estaba' if _validada(cur, nombre) else 'sin_validar'
                    resultados.append((nombre, estado))
                    continue

                # 1. Se crea SIN examinar lo existente: cierra el futuro, no toca el pasado.
                cur.execute(
                    'ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) '
                    'REFERENCES %s(%s) ON DELETE %s NOT VALID'
                    % (tabla, nombre, col, referida, col_ref, accion))
                conn.commit()

                # 2. Y ahora si se examina lo viejo, en una transaccion aparte:
                #    si falla, la restriccion del paso 1 se queda puesta.
                sueltas = huerfanas(cur, tabla, col, referida, col_ref)
                if sueltas:
                    conn.commit()
                    logger.warning(
                        '[integridad] %s queda SIN VALIDAR: %d filas de %s.%s '
                        'apuntan a un %s.%s que no existe. Las filas NO se han '
                        'tocado. La restriccion ya obliga a las nuevas.',
                        nombre, sueltas, tabla, col, referida, col_ref)
                    resultados.append((nombre, 'sin_validar'))
                    continue

                cur.execute('ALTER TABLE %s VALIDATE CONSTRAINT %s' % (tabla, nombre))
                conn.commit()
                resultados.append((nombre, 'validada'))
            except Exception as e:
                conn.rollback()
                logger.warning('[integridad] %s no se pudo crear: %s', nombre, e)
                resultados.append((nombre, 'error'))
    finally:
        if propia:
            ctx.__exit__(None, None, None)
    return resultados


def ensure_claves_ajenas():
    """Punto de entrada del bootstrap."""
    try:
        for nombre, estado in asegurar_claves_ajenas():
            print('[DB] clave ajena %-28s %s' % (nombre, estado))
    except Exception as e:
        print('Error asegurando claves ajenas: %s' % e)
