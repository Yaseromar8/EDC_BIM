# -*- coding: utf-8 -*-
"""CAPA 13 · PERMISSION PROFILES — configuración de acceso, reutilizable.

QUÉ ES UN PERFIL, Y QUÉ NO ES
------------------------------
Un perfil dice: «cuando incorpores a alguien así, deja esto configurado».

    PERFIL · SUPERVISIÓN DOCUMENTAL
        Reviews ✅ · RFI ✅ · Red Lines ✅ · Transmittals ✅ · Visor ❌

NO es una identidad contractual. La empresa de una persona y la FUNCIÓN
con la que esa empresa participa en la obra describen QUIÉN ES y EN QUÉ
CALIDAD viene — son hechos del contrato, no configuración. Un perfil es lo
contrario: una preferencia repetible del administrador, que existe porque
teclear lo mismo quince veces produce quince resultados distintos.

    CONTRACTUAL FUNCTION ≠ PERMISSION PROFILE

Dos personas de la misma empresa y misma función pueden llevar perfiles
distintos, y una persona puede cambiar de perfil sin que su contrato cambie.
Si un día un perfil concediera cosas «por ser de Supervisión», habríamos
reinventado el rol gigante por la puerta de atrás.

LA DECISIÓN QUE EVITA UNA SEGUNDA FUENTE DE VERDAD
---------------------------------------------------
Un perfil se APLICA; no gobierna. En el instante de aplicarlo se escriben
filas normales de `member_tool_access` (capa 08) y nada más. Después, la
autoridad efectiva sigue siendo esa tabla — no el perfil.

    aplicar perfil  →  escribe capa 08  →  la capa 08 manda

Consecuencias, todas queridas:

  · cambiar un perfil NO cambia retroactivamente a quien ya lo llevaba: sus
    accesos son suyos, no una proyección viva de una plantilla que alguien
    editó ayer. Para propagar hay que RE-APLICARLO, que es un acto con
    nombre, con autor y con fecha;
  · retocar a mano el acceso de una persona no «se deshace» solo;
  · y no existen dos sitios que respondan a la misma pregunta. Si el perfil
    fuera autoridad viva, cada consulta tendría que resolver un conflicto
    entre plantilla y excepción, y ese conflicto acaba resolviéndose distinto
    en cada pantalla.

Se recuerda QUÉ perfil se aplicó a cada persona (`perfil_aplicado`), pero es
PROCEDENCIA, no autoridad: sirve para explicar de dónde salió una
configuración y para ofrecer re-aplicar. Nadie decide un acceso leyéndolo.

ALCANCE: un perfil configura MEMBER TOOL ACCESS (capa 08). No toca permisos
de carpeta (capa 09) ni autoridad de flujo (capa 10) ni administración
(capa 07) — esas se conceden donde viven, sobre recursos y actos concretos
que una plantilla de entidad no puede conocer de antemano.
"""

from app_logging import get_logger

logger = get_logger('perfiles')


def listar(cur):
    """Los perfiles de la entidad, con cuánta gente los lleva puesto."""
    cur.execute("""
        SELECT p.id, p.nombre, p.descripcion, p.herramientas, p.creado_en,
               (SELECT count(*) FROM project_users pu
                 WHERE pu.perfil_aplicado = p.id)
          FROM perfiles_de_acceso p
         ORDER BY p.nombre
    """)
    return [{'id': r[0], 'nombre': r[1], 'descripcion': r[2],
             'herramientas': r[3] or {}, 'creado_en': str(r[4]) if r[4] else None,
             'miembros_con_este_perfil': r[5]} for r in cur.fetchall()]


def leer(cur, perfil_id):
    cur.execute("SELECT id, nombre, descripcion, herramientas "
                "  FROM perfiles_de_acceso WHERE id = %s", (perfil_id,))
    r = cur.fetchone()
    if not r:
        return None
    return {'id': r[0], 'nombre': r[1], 'descripcion': r[2], 'herramientas': r[3] or {}}


def normalizar(herramientas):
    """Deja SOLO códigos del catálogo cerrado, con valores booleanos.

    Un perfil que nombra una herramienta inexistente es una promesa que no se
    puede cumplir: se descarta al guardar, no al aplicar — descubrirlo en el
    momento de aplicar dejaría a alguien mal configurado y sin aviso.
    """
    import herramientas_de_obra as hdo
    limpio = {}
    for codigo, valor in (herramientas or {}).items():
        if codigo in hdo.CODIGOS:
            limpio[codigo] = bool(valor)
    return limpio


def aplicar(cur, perfil, obra, user_id, quien):
    """Escribe la configuración del perfil como filas de la CAPA 08.

    Devuelve {codigo: bool} con lo que queda escrito. A partir de aquí manda
    `member_tool_access`: el perfil ya hizo su trabajo y no vuelve a
    consultarse para decidir nada.
    """
    import acceso_a_herramientas as ath
    escrito = {}
    for codigo, permitido in normalizar(perfil.get('herramientas')).items():
        escrito[codigo] = ath.fijar(cur, obra, user_id, codigo, permitido,
                                    '%s · perfil «%s»' % (quien, perfil.get('nombre')))
    # PROCEDENCIA, no autoridad: de dónde salió esta configuración.
    cur.execute("UPDATE project_users SET perfil_aplicado = %s "
                " WHERE project_id = %s AND user_id = %s",
                (perfil['id'], str(obra), int(user_id)))
    return escrito


def afectados_por(cur, perfil_id):
    """Quién lleva este perfil puesto, y dónde. Para poder decir, ANTES de
    cambiarlo, a cuántas personas afectaría re-aplicarlo — y para dejar claro
    que cambiarlo NO les cambia nada por sí solo."""
    cur.execute("""
        SELECT pu.project_id, p.name, pu.user_id, u.name, u.email
          FROM project_users pu
          JOIN users u ON u.id = pu.user_id
     LEFT JOIN projects p ON p.id = pu.project_id
         WHERE pu.perfil_aplicado = %s
         ORDER BY p.name, u.name
    """, (perfil_id,))
    return [{'project_id': r[0], 'obra': r[1], 'user_id': r[2],
             'nombre': r[3], 'email': r[4]} for r in cur.fetchall()]
