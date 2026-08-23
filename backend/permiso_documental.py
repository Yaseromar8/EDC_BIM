# -*- coding: utf-8 -*-
"""LA UNICA VERDAD sobre quien puede acceder a un documento.

EL PROBLEMA QUE CIERRA
----------------------
Hasta el 21-ago-2026 el permiso de carpeta gobernaba DESCUBRIR --navegacion y
busqueda-- pero no OBTENER. Medido con una sonda, no leido:

    permiso efectivo del auxiliar sobre el documento reservado : 'none'
    BUSQUEDA                 -> 0 resultados      (no lo descubre)
    SIGNED-URL por node_id   -> pasa la puerta    (le entregan el fichero)
    SIGNED-URL, NO MIEMBRO   -> 403               (la puerta de OBRA si corta)

`_acceso_al_recurso` decidia por PERTENENCIA A LA OBRA. Cualquier miembro que
conociera un `node_id` obtenia el documento. Un permiso de carpeta que solo
esconde no es un permiso: es un indice ordenado.

CONOCER UN IDENTIFICADOR NO AUMENTA EL ACCESO
---------------------------------------------
`node_id`, `version_id` y `gcs_urn` son tres formas de nombrar lo mismo. Las
tres se resuelven al RECURSO CANONICO --el `file_node`-- y sobre el se aplica la
MISMA decision. `gcs_urn` es almacenamiento, no autoridad: que alguien sepa
donde estan los bytes no dice nada sobre si puede leerlos.

LA REGLA: CLOSEST-WINS CON SUJETOS
----------------------------------
Se sube desde la carpeta del recurso. EL PRIMER NIVEL con alguna regla aplicable
DECIDE, y dentro de ese nivel manda la mas especifica:

        USER  >  COMPANY  >  CONTRACTUAL_FUNCTION

`none` es una decision explicita y NIEGA. El perfil global del usuario es el
VALOR POR DEFECTO cuando no hay ninguna regla en toda la cadena -- ya no un
SUELO que se impone sobre lo que se haya dicho.

POR QUE CLOSEST-WINS Y NO `deny` EXPLICITO APARTE
--------------------------------------------------
Porque `none` en el nivel mas cercano YA es la negativa, y tiene una ventaja que
un `deny` global no tiene: **se lee mirando una sola carpeta**. Un `deny` que
gana desde cualquier altura obliga a recorrer el arbol entero para explicar por
que alguien no ve algo -- que es la queja clasica de las plataformas que lo
hacen asi.

POR QUE EL SUJETO PUEDE SER UNA EMPRESA O UNA FUNCION
------------------------------------------------------
Porque asi se reparte una obra publica: «esta carpeta es de la Supervision», no
«esta carpeta es de Ana, Luis y Marta». La funcion NO se guarda: se DERIVA de
`project_companies`, igual que en el resto del producto, para que no exista
ninguna columna que pueda contradecirla.

QUE **NO** ES ESTE MODULO
--------------------------
No es un framework de autorizacion. No hay politicas, ni roles compuestos, ni
plantillas. Es una funcion que responde
`principal + obra + recurso + accion -> permitido/denegado`
y un resolutor de permiso efectivo. Nada mas.
"""
import logging

from folder_permissions import GLOBAL_ROLE_TO_PERMISSION, PERMISSION_LEVELS

logger = logging.getLogger(__name__)

# Los tres sujetos a los que se puede dirigir una regla, EN ORDEN DE
# ESPECIFICIDAD. El orden de esta tupla ES la precedencia: no hay una segunda
# lista en otro sitio que pueda contradecirla.
USER = 'USER'
COMPANY = 'COMPANY'
FUNCTION = 'CONTRACTUAL_FUNCTION'
PRECEDENCIA = (USER, COMPANY, FUNCTION)

# Marcador para «este principal NO tiene este sujeto». Tiene que ser un literal
# VALIDO --`\x00` no lo es: PostgreSQL rechaza el NUL, y reventaba con quien no
# tuviera empresa-- y a la vez imposible como id de usuario, id de empresa o
# codigo de funcion contractual.
SIN_SUJETO = '::sin-sujeto::'

# Cuantos saltos hacia arriba se aceptan. Un arbol de carpetas sano no llega ni
# de lejos; el tope existe para que un ciclo no cuelgue la peticion.
_MAX_SALTOS = 40


def _nivel(nombre):
    return PERMISSION_LEVELS.get(nombre, -1)


# ── Resolucion del recurso canonico ───────────────────────────────────────

def nodo_canonico(cur, node_id=None, version_id=None, gcs_urn=None):
    """Los tres identificadores llevan al MISMO sitio: el `file_node`.

    Devuelve `(node_id, model_urn)` o `(None, None)` si el objeto no es un
    documento del arbol --una foto de campo, un adjunto de punto de control--,
    en cuyo caso decide quien ya decidia: `acceso_a_blobs`.

    ORDEN A PROPOSITO: primero `version_id`, luego `node_id`, luego `gcs_urn`.
    Una version identifica su documento sin ambiguedad; un `gcs_urn` es el
    ultimo recurso, y solo se acepta si alguna fila del arbol lo reclama.
    """
    if version_id:
        cur.execute("""SELECT n.id::text, n.model_urn
                         FROM file_versions v
                         JOIN file_nodes n ON n.id = v.file_node_id
                        WHERE v.id::text = %s""", (str(version_id),))
        fila = cur.fetchone()
        if fila:
            return fila[0], fila[1]
        # Una version que no existe no se da por buena.
        return None, None

    if node_id:
        cur.execute("SELECT id::text, model_urn FROM file_nodes WHERE id::text = %s",
                    (str(node_id),))
        fila = cur.fetchone()
        if fila:
            return fila[0], fila[1]

    if gcs_urn:
        # El objeto puede ser la version VIGENTE (esta en `file_nodes`) o una
        # HISTORICA (su clave salio de `file_nodes` al subirse la siguiente y
        # solo vive en `file_versions`). Se preguntan las dos.
        cur.execute("SELECT id::text, model_urn FROM file_nodes "
                    " WHERE gcs_urn = %s AND is_deleted = FALSE LIMIT 1", (str(gcs_urn),))
        fila = cur.fetchone()
        if fila:
            return fila[0], fila[1]
        cur.execute("""SELECT n.id::text, n.model_urn
                         FROM file_versions v
                         JOIN file_nodes n ON n.id = v.file_node_id
                        WHERE v.gcs_urn = %s LIMIT 1""", (str(gcs_urn),))
        fila = cur.fetchone()
        if fila:
            return fila[0], fila[1]

    return None, None


# ── El sujeto: quien es este principal en ESTA obra ───────────────────────

def sujetos_de(cur, usuario, model_urn):
    """Las tres identidades con las que una regla puede alcanzar a esta persona.

    Devuelve `{USER: '12', COMPANY: '4', CONTRACTUAL_FUNCTION: 'SUPERVISION'}`,
    omitiendo las que no apliquen. La funcion se DERIVA de la empresa y de la
    obra; no hay ninguna columna que la declare.
    """
    fuera = {}
    uid = (usuario or {}).get('id')
    try:
        fuera[USER] = str(int(uid))
    except (TypeError, ValueError):
        return fuera            # sin identidad numerica no hay sujeto alguno

    cur.execute("SELECT company_id FROM users WHERE id = %s", (int(uid),))
    fila = cur.fetchone()
    empresa = fila[0] if fila else None
    if empresa:
        fuera[COMPANY] = str(empresa)
        # `project_companies` guarda el `projects.id` CANONICO; aqui llega el
        # `model_urn` de las carpetas, que es OTRO identificador (en la obra de
        # prueba: 'proyectos/ZZ_...' vs 'b.proj_zz_...'). Sin resolverlo, la
        # consulta no casaba nunca y una regla de FUNCION no alcanzaba a NADIE
        # por el camino de documentos -- se escribia bien y no se aplicaba.
        # Encontrado en la EXP de capa 9 con conflicto real, no en las suites:
        # los dobles usaban el mismo id para las dos cosas. Mismo patron que
        # ya practica `es_admin_de_obra`: resolver, y fail-closed si no se
        # puede (no aparecer la funcion CONCEDE menos, nunca mas).
        from db import resolve_project_id
        obra = resolve_project_id(str(model_urn)) or str(model_urn)
        cur.execute("""SELECT funcion FROM project_companies
                        WHERE project_id = %s AND company_id = %s""",
                    (str(obra), int(empresa)))
        f = cur.fetchone()
        if f and f[0]:
            fuera[FUNCTION] = f[0]
    return fuera


# ── El resolutor ──────────────────────────────────────────────────────────

def permiso_efectivo(cur, usuario, model_urn, node_id, con_motivo=False):
    """El nivel de permiso de este principal sobre este recurso. CLOSEST-WINS.

    Devuelve el nombre del nivel (`none`, `viewer`, …). Con `con_motivo=True`
    devuelve `(nivel, motivo)`, para que la interfaz pueda explicar POR QUE --
    un permiso que no se puede explicar se acaba concediendo «por si acaso».

    EL MOTIVO ES UN DICCIONARIO, no una frase: la interfaz tiene que poder
    señalar la CARPETA GANADORA y el SUJETO GANADOR, no solo repetir un texto.

        {'regla': 'sujeto' | 'admin_de_obra' | 'defecto' | 'sin_identidad'
                            | 'recurso_inexistente',
         'carpeta_id': …,          la carpeta cuya regla decidió (None si no aplica)
         'sujeto_tipo': …,         USER | COMPANY | CONTRACTUAL_FUNCTION
         'sujeto_id': …,           el id/código con el que la regla le alcanza
         'saltos': n,              0 = la carpeta del propio recurso
         'desplazados': […],       las reglas del MISMO nivel que perdieron por
                                   precedencia (USER > COMPANY > FUNCTION)
         'desplazados_lejanos': […]  las de carpetas SUPERIORES que le alcanzaban
                                   y perdieron por DISTANCIA -- lo que hace
                                   visible closest-wins
         'texto': '…'}             una frase, para quien solo quiera leerla

    Esto NO cambia la resolución: son los mismos datos que el bucle ya tenía
    en la mano cuando decidía. Explicar y decidir siguen siendo una sola
    pasada, para que no puedan contradecirse.
    """
    usuario = usuario or {}
    # POLITICA ADMINISTRATIVA EXPLICITA, no un bypass accidental.
    #
    # Un administrador DE ESTA OBRA atraviesa sus permisos de carpeta, igual que
    # el Project Admin de ACC («Manage en todas las carpetas») y el `Admin` de
    # Documents de Procore. Y NO atraviesa los de ninguna otra: antes bastaba
    # `role == 'admin'` y con eso un administrador que no era miembro obtenia
    # `admin` sobre el contrato de una obra ajena.
    #
    # Lo que NO concede esta autoridad: dictar veredictos. Eso lo deciden las
    # posiciones del flujo, y ahi el administrador nunca responde por otro.
    from administracion_de_obra import es_admin_de_obra as _adm
    if _adm(cur, usuario, model_urn):
        return (('admin', {'regla': 'admin_de_obra', 'carpeta_id': None,
                           'sujeto_tipo': None, 'sujeto_id': None, 'saltos': None,
                           'desplazados': [], 'desplazados_lejanos': [],
                           'texto': 'administra esta obra: atraviesa los permisos '
                                    'de carpeta, y solo los de esta obra'})
                if con_motivo else 'admin')

    sujetos = sujetos_de(cur, usuario, model_urn)
    if USER not in sujetos:
        return (('none', {'regla': 'sin_identidad', 'carpeta_id': None,
                          'sujeto_tipo': None, 'sujeto_id': None, 'saltos': None,
                          'desplazados': [], 'desplazados_lejanos': [],
                          'texto': 'sesión sin identidad'})
                if con_motivo else 'none')

    # Se parte de la CARPETA del recurso. Un fichero no lleva permisos propios:
    # los lleva la carpeta que lo contiene, y de ahi hacia arriba.
    cur.execute("SELECT id, parent_id, node_type FROM file_nodes "
                " WHERE id::text = %s AND model_urn = %s", (str(node_id), str(model_urn)))
    fila = cur.fetchone()
    if not fila:
        return (('none', {'regla': 'recurso_inexistente', 'carpeta_id': None,
                          'sujeto_tipo': None, 'sujeto_id': None, 'saltos': None,
                          'desplazados': [], 'desplazados_lejanos': [],
                          'texto': 'el recurso no existe en esta obra'})
                if con_motivo else 'none')
    actual = fila[1] if fila[2] == 'FILE' else fila[0]

    # `ganador` se fija UNA sola vez, en la primera carpeta con regla. Cuando
    # se pide explicacion el recorrido NO se corta ahi: sigue subiendo para
    # recoger lo que quedo desplazado por distancia. Como el ganador ya esta
    # decidido, seguir mirando no puede cambiarlo -- explicar y decidir siguen
    # siendo la misma pasada.
    visto, saltos = set(), 0
    ganador = None
    desplazados_lejanos = []
    while actual is not None and saltos < _MAX_SALTOS:
        if actual in visto:
            break
        visto.add(actual)
        saltos += 1

        # TODAS las reglas de ESTE nivel que alcanzan a este principal.
        cur.execute("""SELECT sujeto_tipo, permission_level
                         FROM folder_permissions
                        WHERE folder_node_id = %s
                          AND ( (sujeto_tipo = %s AND sujeto_id = %s)
                             OR (sujeto_tipo = %s AND sujeto_id = %s)
                             OR (sujeto_tipo = %s AND sujeto_id = %s) )""",
                    (actual,
                     USER, sujetos.get(USER) or SIN_SUJETO,
                     COMPANY, sujetos.get(COMPANY) or SIN_SUJETO,
                     FUNCTION, sujetos.get(FUNCTION) or SIN_SUJETO))
        reglas = {t: n for t, n in cur.fetchall()}
        if reglas:
            # EL PRIMER NIVEL CON REGLA DECIDE, y dentro de el manda la mas
            # especifica. No se acumula con los de arriba: eso era la herencia
            # aditiva, y es justo lo que impedia reservar una carpeta.
            for tipo in PRECEDENCIA:
                if tipo in reglas:
                    if not con_motivo:
                        return reglas[tipo]
                    if ganador is None:
                        # Las del MISMO nivel que perdieron por precedencia. Es
                        # el dato que convierte «tienes viewer» en «tienes
                        # viewer PORQUE tu regla personal desplaza a la de tu
                        # empresa, aqui mismo».
                        desplazados = [{'sujeto_tipo': t, 'nivel': reglas[t]}
                                       for t in PRECEDENCIA
                                       if t in reglas and t != tipo]
                        ganador = (reglas[tipo], {
                            'regla': 'sujeto',
                            'carpeta_id': str(actual),
                            'sujeto_tipo': tipo,
                            'sujeto_id': sujetos.get(tipo),
                            'saltos': saltos - 1,
                            'desplazados': desplazados,
                            'desplazados_lejanos': desplazados_lejanos,
                            'texto': ('regla de %s en %s' % (
                                tipo, 'esta misma carpeta' if saltos == 1
                                else 'una carpeta superior')),
                        })
                    else:
                        # Ya hay ganador: esta carpeta esta MAS ARRIBA y su
                        # regla no se aplica. Se anota la que habria ganado
                        # aqui -- es la que el administrador cree que manda
                        # cuando ve «Editar» en la carpeta padre.
                        desplazados_lejanos.append({
                            'carpeta_id': str(actual),
                            'sujeto_tipo': tipo,
                            'nivel': reglas[tipo],
                            'saltos': saltos - 1,
                        })
                    break

        cur.execute("SELECT parent_id FROM file_nodes WHERE id = %s", (actual,))
        s = cur.fetchone()
        actual = s[0] if s else None

    # NINGUNA regla en toda la cadena: manda el perfil global, como DEFECTO.
    if ganador is not None:
        # El recorrido termino de relatar. `desplazados_lejanos` es la misma
        # lista que el motivo ya lleva dentro, asi que sale completa.
        return ganador

    por_defecto = GLOBAL_ROLE_TO_PERMISSION.get(usuario.get('role') or 'viewer', 'none')
    if con_motivo:
        return por_defecto, {
            'regla': 'defecto', 'carpeta_id': None,
            'sujeto_tipo': None, 'sujeto_id': None, 'saltos': saltos,
            'desplazados': [], 'desplazados_lejanos': [],
            'texto': ('ninguna regla le alcanza en toda la cadena de carpetas: '
                      'manda su perfil del sistema (%s)'
                      % (usuario.get('role') or 'viewer')),
        }
    return por_defecto


# ── EL GUARDIA UNICO ──────────────────────────────────────────────────────

def guardia(cur, usuario, model_urn, accion, minimo='viewer',
            node_id=None, version_id=None, gcs_urn=None):
    """`principal + obra + recurso + accion -> permitido/denegado`.

    Devuelve `None` si se puede seguir, o `(cuerpo, codigo)` listo para
    devolver. `None` tambien cuando el objeto NO es un documento del arbol: eso
    no lo decide este modulo y se deja a quien ya lo decidia.

    Es la MISMA funcion para navegar, buscar, previsualizar, descargar, firmar
    una URL, servir el proxy o exportar. Una sola decision, un solo sitio.
    """
    from flask import jsonify

    nodo, obra = nodo_canonico(cur, node_id=node_id, version_id=version_id,
                               gcs_urn=gcs_urn)
    if not nodo:
        return None                  # no es un documento del arbol

    # La obra la manda el RECURSO, no la peticion. Si alguien pide un documento
    # de otra obra diciendo que es de la suya, decide el dueno real.
    nivel = permiso_efectivo(cur, usuario, obra, nodo)
    if _nivel(nivel) >= _nivel(minimo):
        return None

    # No se dice si el documento existe o si falta permiso: son la misma
    # respuesta a proposito. Distinguirlas convertiria el 403 en un buscador.
    return jsonify({
        'success': False,
        'error': 'No tienes permiso para %s.' % accion,
        'code': 'SIN_PERMISO_DOCUMENTAL'}), 403
