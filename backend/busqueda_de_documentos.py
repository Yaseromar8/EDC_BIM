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

# Sin permiso explicito en ninguna carpeta de la cadena, manda el rol global.
# Es el mismo mapa de `folder_permissions.py`: se importa de alli para que no
# puedan divergir dos definiciones de quien ve que.
from folder_permissions import GLOBAL_ROLE_TO_PERMISSION, PERMISSION_LEVELS

# Ver es el minimo para aparecer en una busqueda. Quien no llega a esto no
# descubre que el documento existe.
_MINIMO = PERMISSION_LEVELS['viewer']

# Un limite duro. Una busqueda no es una exportacion del expediente.
TOPE = 200


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
# 1. `cand`    los FILE de la obra que casan con el texto.
# 2. `cadena`  la cadena de ancestros de cada candidato, con su nivel.
# 3. `subida`  de esa cadena, en UNA pasada: el MAXIMO nivel explicito
#              (herencia aditiva) y la ruta de carpetas de la raiz hacia abajo.
#
# `is_deleted = FALSE` en las tres: un documento en la papelera no se encuentra,
# y una carpeta borrada no aporta ruta.
# El mapa nivel->entero se interpola como un CASE de enteros, NO como jsonb.
# La primera version resolvia `%(niveles)s::jsonb ->> ...` por fila y la
# busqueda paso de 68 ms a 3.845 ms con 5.000 documentos. Se interpola porque
# `PERMISSION_LEVELS` es una constante del codigo, no entrada del usuario.
_CASE_NIVEL = ('CASE fp.permission_level '
               + ' '.join("WHEN '%s' THEN %d" % (k, v)
                          for k, v in sorted(PERMISSION_LEVELS.items()))
               + ' ELSE -1 END')

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
subida AS (
    -- UNA SOLA PASADA sobre la cadena: de ella salen el permiso heredado y la
    -- ruta. Estaban en dos CTE separadas y el planificador unia la del permiso
    -- con un BUCLE ANIDADO -- 12,5 MILLONES de comparaciones descartadas para
    -- 5.000 documentos, 2.8 s en vez de 30 ms. Lo enseño `EXPLAIN ANALYZE`, no
    -- una corazonada.
    --
    -- El permiso es el MAXIMO de la cadena, no el mas cercano: es la MISMA
    -- regla que `_get_effective_permission_impl`, cuya herencia es ADITIVA. La
    -- primera version tomaba el mas cercano, que es otra regla distinta, y con
    -- eso la busqueda escondia documentos que el usuario SI podia abrir desde
    -- Archivos. Dos modelos de permisos en el mismo producto es exactamente lo
    -- que este fichero dice querer evitar.
    --
    -- `folder_permissions` tiene UNIQUE(folder_node_id, user_id), asi que el
    -- LEFT JOIN no duplica ninguna carpeta y `string_agg` sigue siendo la ruta.
    SELECT ca.hoja,
           string_agg(f.name, ' / ' ORDER BY ca.nivel DESC) AS carpetas,
           MAX({niveles}) AS nivel
      FROM cadena ca
      JOIN file_nodes f ON f.id = ca.nodo AND f.is_deleted = FALSE
 LEFT JOIN folder_permissions fp
        ON fp.folder_node_id = ca.nodo AND fp.user_id = %(uid)s
     GROUP BY ca.hoja
)
SELECT c.id::text, c.name, c.mime_type, c.status, c.updated_at,
       c.gcs_urn, c.version_number, c.current_version_id::text,
       c.tags, c.metadata, c.parent_id::text,
       COALESCE(s.carpetas, '') AS ruta,
       GREATEST(COALESCE(s.nivel, -1), %(nivel_global)s) AS nivel,
       v.version_number AS version_vigente, v.id::text AS version_vigente_id
  FROM cand c
  LEFT JOIN subida s ON s.hoja = c.id
  LEFT JOIN file_versions v ON v.id = c.current_version_id
 -- El rol global es un SUELO, no un techo: es el «Paso 3» del resolutor.
 WHERE GREATEST(COALESCE(s.nivel, -1), %(nivel_global)s) >= %(minimo)s
 ORDER BY c.updated_at DESC NULLS LAST, c.name
 LIMIT %(tope)s
""".replace('{niveles}', _CASE_NIVEL)


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
    uid = (usuario or {}).get('id')
    try:
        uid = int(uid)
    except (TypeError, ValueError):
        # Una sesion sin identidad numerica no tiene permisos propios: solo el
        # que le da su rol global.
        uid = -1

    # Un administrador global ve toda la obra: es lo que ya decide
    # `_get_effective_permission_impl` en su paso 0, y aqui no puede decir otra
    # cosa.
    fallback = 'admin' if rol == 'admin' else GLOBAL_ROLE_TO_PERMISSION.get(rol, 'none')

    cur.execute(_BUSCAR, {
        'obra': str(obra), 'q': _patron(texto), 'uid': uid,
        'nivel_global': PERMISSION_LEVELS.get(fallback, -1),
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
