# -*- coding: utf-8 -*-
"""Quien participa en una obra, y con que funcion contractual.

POR QUE UNA TABLA NUEVA Y NO UNA COLUMNA EN `project_users`
-----------------------------------------------------------
La tentacion era anadir `project_users.role`. Habria metido en una sola columna
CINCO cosas distintas, que es exactamente el error que este proyecto acaba de
deshacer con `project_id`:

  1. EMPRESA            SINOHYDRO            -> es de la persona   (users.company_id)
  2. FUNCION CONTRACTUAL Supervision         -> es de la EMPRESA EN ESA OBRA
  3. AREA / DISCIPLINA   Calidad, BIM        -> es de la persona   (users.job_title_id)
  4. RESPONSABILIDAD     «quien aprueba esto» -> SE DERIVA de la 2
  5. PERMISO             que puede hacer      -> rol global + folder_permissions

La numero 2 es la que faltaba, y no cuelga de la persona: cuelga del par
(empresa, obra). SINOHYDRO es contratista EN ESTA OBRA y podria ser otra cosa en
la siguiente. Por eso es una tabla propia y no una columna en ningun sitio.

Y la 4 no se declara: se deriva. «Emitir a la Supervision» significa *a las
personas cuya empresa ejerce de Supervision en esta obra*. Guardar eso en una
columna seria guardar dos veces la misma verdad.

LO QUE ESTA TABLA **NO** HACE
-----------------------------
NO da acceso. Aparecer aqui no mete a nadie en la obra ni le abre una carpeta.
El acceso lo siguen decidiendo `project_users` (membresia) y `folder_permissions`,
exactamente igual que antes de que este fichero existiera. Ver `encargos.py`.

OJO CON LOS DATOS QUE YA HAY
----------------------------
`companies` contiene hoy una OBRA ('INTERFERENCIAS') y basura ('x'), y
`job_titles` no contiene cargos sino AREAS (CALIDAD, PRODUCCION, BIM...). Ninguna
de las dos se toca aqui: se anota como deuda y la limpieza es decision del
propietario, porque puede haber usuarios reales apuntando a esas filas.
"""
import logging

logger = logging.getLogger(__name__)

# Las funciones contractuales de una obra publica peruana. Deliberadamente
# pocas: cinco cubren el reparto real (entidad, quien supervisa, quien ejecuta,
# quien proyecto). Si el piloto pide mas, se anaden -- pero de una lista corta se
# sale; de una lista larga que nadie usa, no.
FUNCIONES = ('ENTIDAD', 'SUPERVISION', 'CONTRATISTA', 'PROYECTISTA', 'OTRO')

_TABLA = """
CREATE TABLE IF NOT EXISTS project_companies (
    project_id TEXT    NOT NULL,
    company_id INTEGER NOT NULL,
    funcion    TEXT    NOT NULL,
    creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creado_por TEXT,
    PRIMARY KEY (project_id, company_id)
)
"""

# `project_id` con clave ajena real, como exige el vocabulario congelado
# (docs/entidad/21): es la clave ajena, y no el nombre, lo que impide que esta
# columna acabe conteniendo un frente o un id de ACC.
_CLAVES = (
    ('fk_project_companies_project', 'project_companies', 'project_id', 'projects', 'id', 'CASCADE'),
    ('fk_project_companies_company', 'project_companies', 'company_id', 'companies', 'id', 'CASCADE'),
)

_CHECK = """
ALTER TABLE project_companies ADD CONSTRAINT ck_project_companies_funcion
    CHECK (funcion IN ('ENTIDAD','SUPERVISION','CONTRATISTA','PROYECTISTA','OTRO'))
"""

_INDICE = """
CREATE INDEX IF NOT EXISTS idx_project_companies_funcion
    ON project_companies(project_id, funcion)
"""


def ensure_directorio():
    """Crea `project_companies`. Idempotente. Punto de entrada del bootstrap."""
    from db import get_db_connection
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute(_TABLA)
            cur.execute(_INDICE)
            conn.commit()
            for nombre, tabla, col, ref, col_ref, accion in _CLAVES:
                cur.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", (nombre,))
                if cur.fetchone():
                    continue
                try:
                    cur.execute('ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) '
                                'REFERENCES %s(%s) ON DELETE %s'
                                % (tabla, nombre, col, ref, col_ref, accion))
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning('[directorio] %s no se pudo crear: %s', nombre, e)
            cur.execute("SELECT 1 FROM pg_constraint WHERE conname = 'ck_project_companies_funcion'")
            if not cur.fetchone():
                try:
                    cur.execute(_CHECK)
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning('[directorio] check de funcion no creado: %s', e)
            print('[DB] Tabla project_companies verificada/creada.')
    except Exception as e:
        print('Error creando project_companies: %s' % e)


# ── Lectura ────────────────────────────────────────────────────────────────

def participantes(cur, project_id):
    """[(company_id, nombre, funcion)] de una obra."""
    cur.execute("""SELECT pc.company_id, c.name, pc.funcion
                     FROM project_companies pc
                     JOIN companies c ON c.id = pc.company_id
                    WHERE pc.project_id = %s
                    ORDER BY pc.funcion, c.name""", (str(project_id),))
    return cur.fetchall()


def funcion_de(cur, project_id, user_id):
    """Que funcion ejerce una PERSONA en una obra. None si ninguna.

    Se deriva de su empresa: no hay ninguna columna que lo declare, y por tanto
    tampoco hay ninguna que pueda contradecirlo.
    """
    cur.execute("""SELECT pc.funcion
                     FROM users u
                     JOIN project_companies pc ON pc.company_id = u.company_id
                    WHERE u.id = %s AND pc.project_id = %s""",
                (user_id, str(project_id)))
    fila = cur.fetchone()
    return fila[0] if fila else None


def usuarios_de_la_funcion(cur, project_id, funcion):
    """Quien puede recibir un encargo dirigido a una FUNCION.

    LA INVARIANTE MAS IMPORTANTE DE ESTE FICHERO:
    ---------------------------------------------
    Solo se devuelven personas que ADEMAS son miembros de la obra. Un encargo
    dirigido a «SUPERVISION» no mete a nadie en la obra: alcanza unicamente a
    quien ya estaba dentro.

    El JOIN con `project_users` es esa garantia, y esta aqui dentro de la
    consulta -- no en una comprobacion posterior que alguien pueda olvidar al
    escribir la siguiente pantalla.
    """
    cur.execute("""SELECT u.id, u.email, u.name
                     FROM users u
                     JOIN project_companies pc
                       ON pc.company_id = u.company_id AND pc.project_id = %s
                     JOIN project_users pu
                       ON pu.project_id = %s AND pu.user_id = u.id
                    WHERE pc.funcion = %s AND u.is_active
                    ORDER BY u.id""",
                (str(project_id), str(project_id), funcion))
    return cur.fetchall()
