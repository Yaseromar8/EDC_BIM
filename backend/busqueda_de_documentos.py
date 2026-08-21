# -*- coding: utf-8 -*-
"""Encontrar un documento de la obra sin saber en que carpeta esta.

POR QUE POSTGRESQL Y NADA MAS
-----------------------------
El expediente vive en `file_nodes`. Un indice externo seria una SEGUNDA VERDAD
sobre que documentos existen y quien puede verlos -- y la segunda verdad sobre
permisos es la que acaba enseñando de mas. Aqui se busca sobre la tabla, con el
permiso resuelto DENTRO de la consulta.

EL PERMISO SE RESUELVE EN SQL, NO POR RESULTADO
-----------------------------------------------
`get_effective_permission` sube por el arbol carpeta a carpeta haciendo una
consulta por salto. Llamarla por cada resultado seria lento, pero sobre todo
seria FRAGIL: el filtro viviria FUERA de la consulta, y quien escriba la
siguiente pantalla podria olvidarlo. Es la misma leccion que ya se aplico en
`encargos._MI_TRABAJO`, donde la pertenencia es un JOIN y no una comprobacion
posterior.

Aqui la cadena de ancestros se recorre UNA vez, en una CTE recursiva, y de ella
salen las dos cosas que hacen falta: el nivel de permiso HEREDADO --el MAXIMO
de la cadena, que es como resuelve `_get_effective_permission_impl`-- y la ruta
que se enseña al usuario.

LO QUE UN USUARIO SIN PERMISO NO PUEDE DESCUBRIR
-----------------------------------------------
Ni el nombre, ni la ruta, ni los metadatos, NI QUE EXISTA. El documento
sencillamente no esta en el resultado, y el total no lo cuenta: un contador que
dijera «12 resultados» enseñando 3 ya seria una filtracion.

QUE SE BUSCA
------------
`name` (que es donde vive el codigo documental), `tags` y `metadata`. Son las
columnas que YA existen; no se añade ninguna.
"""
import logging
import re

logger = logging.getLogger(__name__)

# LA REGLA NO SE REESCRIBE AQUI: se importa de donde vive.
#
# `permiso_documental` es la unica verdad sobre quien puede acceder a un
# documento. Esta consulta la traduce a SQL para poder filtrar miles de filas de
# una vez -- pero traduce la MISMA regla, con los MISMOS sujetos y la MISMA
# precedencia, y el ensayo compara las dos respuestas en cada caso.
#
# Ya se pago el precio de no hacerlo: la primera version de esta busqueda tomaba
# el permiso mas cercano cuando el producto sumaba, y escondia documentos que el
# usuario si podia abrir. La segunda sumaba cuando el producto ya decidia por el
# mas cercano. Dos veces la misma leccion.
import permiso_documental as _pd
from folder_permissions import GLOBAL_ROLE_TO_PERMISSION, PERMISSION_LEVELS

# Ver es el minimo para aparecer en una busqueda. Quien no llega a esto no
# descubre que el documento existe.
_MINIMO = PERMISSION_LEVELS['viewer']

# Un limite duro. Una busqueda no es una exportacion del expediente.
TOPE = 200

# El mapa nivel->entero y la precedencia de sujetos, como CASE de enteros. Se
# interpolan porque son constantes del codigo, no entrada del usuario -- y
# resolverlos como jsonb por fila costo 3.845 ms con 5.000 documentos.
_CASE_NIVEL = ('CASE fp.permission_level '
               + ' '.join("WHEN '%s' THEN %d" % (k, v)
                          for k, v in sorted(PERMISSION_LEVELS.items()))
               + ' ELSE -1 END')
_CASE_PRECEDENCIA = ('CASE fp.sujeto_tipo '
                     + ' '.join("WHEN '%s' THEN %d" % (t, i)
                                for i, t in enumerate(_pd.PRECEDENCIA))
                     + ' ELSE 99 END')


def _patron(texto):
    """`%texto%` con los comodines de LIKE escapados.

    Sin esto, buscar `100%` o `plano_01` significaria otra cosa: `_` casa con
    cualquier caracter y `%` con cualquier cadena. El usuario escribe texto, no
    un patron.
    """
    limpio = re.sub(r'([%_\\])', r'\\\1', (texto or '').strip())
    return '%' + limpio + '%'


# La consulta entera, en un solo sitio.
#
# 1. `cand`     los FILE de la obra que casan con el texto.
# 2. `cadena`   la cadena de ancestros de cada candidato, con su nivel.
# 3. `reglas`   las reglas de esa cadena que ALCANZAN a este principal, por
#               cualquiera de sus tres sujetos.
# 4. `elegida`  CLOSEST-WINS: el nivel MAS CERCANO decide, y dentro de el manda
#               el sujeto mas especifico (USER > COMPANY > FUNCTION).
# 5. `ruta`     los nombres de los ancestros, de la raiz hacia abajo.
#
# `is_deleted = FALSE` en todas: un documento en la papelera no se encuentra, y
# una carpeta borrada no aporta ruta.
_BUSCAR = """
WITH RECURSIVE cand AS (
    SELECT n.id, n.parent_id, n.name, n.mime_type, n.status, n.updated_at,
           n.gcs_urn, n.version_number, n.current_version_id, n.tags, n.metadata
      FROM file_nodes n
     WHERE n.model_urn = %(obra)s
       AND n.is_deleted = FALSE
       AND n.node_type = 'FILE'
       AND ( n.name ILIKE %(q)s ESCAPE '\\'
          OR array_to_string(COALESCE(n.tags, '{}'), ' ') ILIKE %(q)s ESCAPE '\\'
          OR COALESCE(n.metadata, '{}'::jsonb)::text ILIKE %(q)s ESCAPE '\\' )
),
cadena AS (
    SELECT c.id AS hoja, c.parent_id AS nodo, 1 AS nivel
      FROM cand c
     WHERE c.parent_id IS NOT NULL
    UNION ALL
    SELECT ca.hoja, f.parent_id, ca.nivel + 1
      FROM cadena ca
      JOIN file_nodes f ON f.id = ca.nodo AND f.is_deleted = FALSE
     WHERE f.parent_id IS NOT NULL AND ca.nivel < 40
),
reglas AS (
    SELECT ca.hoja, ca.nivel, {precedencia} AS prec, {niveles} AS nivel_regla
      FROM cadena ca
      JOIN folder_permissions fp ON fp.folder_node_id = ca.nodo
       AND ( (fp.sujeto_tipo = 'USER'                 AND fp.sujeto_id = %(s_user)s)
          OR (fp.sujeto_tipo = 'COMPANY'              AND fp.sujeto_id = %(s_company)s)
          OR (fp.sujeto_tipo = 'CONTRACTUAL_FUNCTION' AND fp.sujeto_id = %(s_funcion)s) )
),
elegida AS (
    -- CLOSEST-WINS: `nivel ASC` toma la carpeta mas cercana; `prec ASC`, el
    -- sujeto mas especifico DENTRO de esa carpeta. No se acumula con las de
    -- arriba: eso era la herencia aditiva, y es lo que impedia reservar una
    -- carpeta a alguien que tuviera permiso mas arriba.
    SELECT DISTINCT ON (hoja) hoja, nivel_regla
      FROM reglas
     ORDER BY hoja, nivel ASC, prec ASC
),
ruta AS (
    SELECT ca.hoja,
           string_agg(f.name, ' / ' ORDER BY ca.nivel DESC) AS carpetas
      FROM cadena ca
      JOIN file_nodes f ON f.id = ca.nodo AND f.is_deleted = FALSE
     GROUP BY ca.hoja
)
SELECT c.id::text, c.name, c.mime_type, c.status, c.updated_at,
       c.gcs_urn, c.version_number, c.current_version_id::text,
       c.tags, c.metadata, c.parent_id::text,
       COALESCE(r.carpetas, '') AS ruta,
       COALESCE(e.nivel_regla, %(nivel_defecto)s) AS nivel,
       v.version_number AS version_vigente, v.id::text AS version_vigente_id
  FROM cand c
  LEFT JOIN elegida e ON e.hoja = c.id
  LEFT JOIN ruta r ON r.hoja = c.id
  LEFT JOIN file_versions v ON v.id = c.current_version_id
 -- El perfil global es el VALOR POR DEFECTO cuando no hay ninguna regla en toda
 -- la cadena. Ya no es un suelo que se imponga sobre lo que se haya decidido.
 WHERE COALESCE(e.nivel_regla, %(nivel_defecto)s) >= %(minimo)s
 ORDER BY c.updated_at DESC NULLS LAST, c.name
 LIMIT %(tope)s
""".replace('{niveles}', _CASE_NIVEL).replace('{precedencia}', _CASE_PRECEDENCIA)


def buscar(cur, obra, texto, usuario, tope=50):
    """Documentos de ESTA obra que casan con `texto` y que ESTE usuario ve.

    Devuelve una lista de diccionarios listos para `useDocPreview`.
    """
    texto = (texto or '').strip()
    if len(texto) < 2:
        # Con un solo caracter la busqueda devuelve media obra y no ayuda a
        # nadie. Se dice, en vez de devolver ruido.
        return []

    rol = (usuario or {}).get('role') or 'viewer'

    # Un administrador global ve toda la obra: es el paso 0 de
    # `permiso_documental.permiso_efectivo`, y aqui no puede decir otra cosa.
    if rol == 'admin':
        defecto = PERMISSION_LEVELS['admin']
    else:
        defecto = PERMISSION_LEVELS.get(
            GLOBAL_ROLE_TO_PERMISSION.get(rol, 'none'), -1)

    # LOS TRES SUJETOS, resueltos por la misma funcion que usa el guardia. Si
    # alguno no aplica se manda un valor imposible, para que ninguna regla case
    # por accidente con una cadena vacia.
    sujetos = _pd.sujetos_de(cur, usuario, obra)
    if _pd.USER not in sujetos and rol != 'admin':
        return []

    cur.execute(_BUSCAR, {
        'obra': str(obra), 'q': _patron(texto),
        's_user': sujetos.get(_pd.USER) or _pd.SIN_SUJETO,
        's_company': sujetos.get(_pd.COMPANY) or _pd.SIN_SUJETO,
        's_funcion': sujetos.get(_pd.FUNCTION) or _pd.SIN_SUJETO,
        'nivel_defecto': defecto,
        'minimo': _MINIMO,
        'tope': min(int(tope or 50), TOPE),
    })

    salida = []
    for r in cur.fetchall():
        (nid, nombre, mime, estado, actualizado, gcs, vnum, cur_vid, tags,
         meta, padre, ruta, nivel, v_vigente, v_vigente_id) = r
        salida.append({
            'node_id': nid,
            'name': nombre,
            'carpeta_id': padre,
            # La ruta que se enseña: dónde vive el documento.
            'ruta': ruta,
            'mime_type': mime,
            'status': estado,
            'updated_at': actualizado.isoformat() if actualizado else None,
            'tags': list(tags or []),
            'metadata': meta or {},
            # LA VERSION VIGENTE. Un documento nuevo apunta a su version con
            # `current_version_id`; uno LEGACY no tiene ninguna, y entonces la
            # vigente es el propio nodo -- que es como se ha abierto siempre.
            'version_id': cur_vid,
            'version_number': v_vigente if v_vigente is not None else vnum,
            'es_legacy': cur_vid is None,
            'nivel_permiso': nivel,
        })
    return salida
