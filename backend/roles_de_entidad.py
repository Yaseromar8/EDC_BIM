# -*- coding: utf-8 -*-
"""CAPA 15 · ACCOUNT ROLES — delegación acotada al nivel de la entidad.

EL PROBLEMA: SOLO HABÍA DOS POSIBILIDADES
------------------------------------------
    user                 no administra nada de la entidad
    Entity Admin         lo administra TODO: usuarios, obras, empresas,
                         catálogos, configuración… y además atraviesa el
                         expediente de todas las obras.

Entre esas dos no había nada. Quien solo tenía que dar de alta gente
acababa siendo Entity Admin, es decir, custodio de la instancia entera —y
el PASO 14 existió precisamente porque eso se había ido de las manos.

LO QUE ESTA CAPA AÑADE
-----------------------
Facultades de cuenta, nombradas y acotadas:

    gestionar_usuarios     invitar, reactivar, cambiar perfil del sistema
    gestionar_obras        crear y archivar obras
    gestionar_empresas     el catálogo de empresas y cargos de la entidad
    gestionar_perfiles     los perfiles de acceso (capa 13)

Se conceden sueltas. Tener «gestionar_usuarios» NO convierte a nadie en
Entity Admin, y NO da un solo documento en ninguna obra.

LAS TRES SEPARACIONES QUE ESTO NO PUEDE ROMPER
-----------------------------------------------
    ACCOUNT ROLE  ≠  PROJECT ADMIN
        Una facultad de cuenta no administra NINGUNA obra concreta. Quien
        gestiona usuarios de la entidad no puede tocar los permisos de
        PQT8 si no es administrador de PQT8.

    ACCOUNT ROLE  ≠  MEMBER TOOL ACCESS
        No abre ninguna herramienta en ninguna obra. Para entrar a RFI hay
        que ser miembro y tener acceso (capas 03 y 08), sin excepción.

    ACCOUNT ROLE  ≠  RESOURCE PERMISSION
        No concede ni un documento. `permiso_documental` no sabe que esta
        capa existe, y así debe seguir.

EL ENTITY ADMIN NO DESAPARECE
------------------------------
Sigue siendo el custodio: tiene todas las facultades por definición y es
quien las reparte. Esta capa no lo diluye — le da la posibilidad de delegar
un trozo sin entregar la llave entera, que es justo lo que faltaba.

QUIÉN PUEDE REPARTIR: solo el Entity Admin. Si un delegado pudiera
concederse facultades a sí mismo o dárselas a otros, la delegación acotada
se convertiría en una escalada silenciosa hacia el poder total.
"""

from app_logging import get_logger

logger = get_logger('roles_entidad')

# Catálogo CERRADO de facultades. Cada una nombra un acto de ENTIDAD; ninguna
# nombra un acto de obra, de herramienta ni de documento — esa es la línea.
FACULTADES = (
    {'codigo': 'gestionar_usuarios', 'etiqueta': 'Gestionar usuarios',
     'descripcion': 'Invitar, reactivar y cambiar el perfil del sistema de las '
                    'personas de la entidad. No da acceso a ninguna obra.'},
    {'codigo': 'gestionar_obras', 'etiqueta': 'Gestionar obras',
     'descripcion': 'Crear y archivar obras. No convierte en administrador de '
                    'ninguna de ellas ni da acceso a sus documentos.'},
    {'codigo': 'gestionar_empresas', 'etiqueta': 'Gestionar empresas y cargos',
     'descripcion': 'El catálogo de la entidad: empresas y cargos.'},
    {'codigo': 'gestionar_perfiles', 'etiqueta': 'Gestionar perfiles de acceso',
     'descripcion': 'Crear y editar los perfiles reutilizables (capa 13). '
                    'Aplicarlos sigue siendo un acto de cada obra.'},
)

CODIGOS = tuple(f['codigo'] for f in FACULTADES)
_POR_CODIGO = {f['codigo']: f for f in FACULTADES}


def es_entity_admin(usuario):
    return bool(usuario) and (usuario or {}).get('role') == 'admin'


def facultades_de(cur, usuario):
    """Las facultades EFECTIVAS de esta persona en la entidad.

    El Entity Admin las tiene TODAS por definición, no por filas: es el
    custodio, y hacer que dependiera de filas permitiría dejar la entidad sin
    quien la administre borrando registros.
    """
    usuario = usuario or {}
    if es_entity_admin(usuario):
        return set(CODIGOS)
    uid = usuario.get('id')
    try:
        uid = int(uid)
    except (TypeError, ValueError):
        return set()
    try:
        cur.execute("SELECT facultad FROM roles_de_entidad WHERE user_id = %s", (uid,))
        return {r[0] for r in cur.fetchall() if r[0] in _POR_CODIGO}
    except Exception as e:
        # FAIL-CLOSED: esto ES autorización. Si no se puede leer, no hay
        # facultad — al contrario que las capas 16 y 08, que deciden
        # disponibilidad y se abren ante un fallo de infraestructura.
        logger.error('[roles-entidad] no se pudo leer (fail-closed): %s', str(e)[:120])
        return set()


def puede(cur, usuario, facultad):
    return facultad in facultades_de(cur, usuario)


def guardia(cur, usuario, facultad, accion='esta operación'):
    """Negativa lista para devolver, o None si puede.

    Devuelve el mismo formato que las demás guardias del producto para que
    las rutas no tengan que inventarse su mensaje.
    """
    from flask import jsonify
    if puede(cur, usuario, facultad):
        return None
    etiqueta = _POR_CODIGO.get(facultad, {}).get('etiqueta', facultad)
    return jsonify({
        'error': 'No tienes la facultad «%s» en esta entidad para %s.'
                 % (etiqueta, accion),
        'code': 'SIN_FACULTAD_DE_ENTIDAD',
        'facultad': facultad}), 403


def fijar(cur, user_id, facultad, concedida, quien):
    """Concede o retira UNA facultad. Devuelve el estado resultante."""
    if facultad not in _POR_CODIGO:
        raise ValueError('Facultad desconocida: %s' % facultad)
    if concedida:
        cur.execute("""INSERT INTO roles_de_entidad (user_id, facultad, concedida_por)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (user_id, facultad) DO NOTHING""",
                    (int(user_id), facultad, quien))
    else:
        cur.execute("DELETE FROM roles_de_entidad WHERE user_id = %s AND facultad = %s",
                    (int(user_id), facultad))
    return bool(concedida)


def catalogo_publico():
    return [dict(f) for f in FACULTADES]
