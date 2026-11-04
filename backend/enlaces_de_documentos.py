# -*- coding: utf-8 -*-
"""ENLACES DE DOCUMENTOS (5-nov-2026, docs/archivos/27, migración 48).

Un documento VIVE en una carpeta; otras lo ENLAZAN. La carpeta que lo enlaza lo enseña en su lista con la marca ⤷ y,
al abrirlo, se abre el original: su versión vigente, sus marcas, sus incidencias, sus revisiones. No se copia nada.
El dueño: «tengo un único archivo que sirve a varias calles; subirlo a cada calle sería un trabajo en vano».

Las reglas, y por qué:
  · Enlazar pide «Ver» en el original y «Editar» en cada carpeta destino: es escribir en el destino, como subir.
  · El enlace NO concede nada: quien no ve el original no ve la fila ⤷, aunque vea la carpeta. Lo filtra el listado
    con el permiso del original (`filas_del_listado` devuelve las candidatas; `file_system_db.list_contents` les aplica
    la misma regla que a los documentos propios de la carpeta).
  · Una carpeta no tiene dos filas con el mismo nombre: ni dos enlaces al mismo documento (eso es «ya estaba») ni un
    enlace con el nombre de un documento suyo o de otro enlace.
  · No se enlaza en su propia carpeta, ni en una carpeta de otra obra.
  · Todo o nada: si un enlace no se puede crear, no se crea ninguno.
  · El original en la papelera: sus enlaces siguen guardados y no se enseñan; al restaurarlo, vuelven. Purgado (o
    purgada la carpeta), se van con él (ON DELETE CASCADE).
  · Si el original se mueve a una carpeta que lo enlazaba, ahí sale una vez: el original, no el enlace.

Este módulo decide y escribe con el cursor que le dan; la ruta (`routes/documents.py`) comprueba sesión, obra y
permisos, hace el commit y deja la actividad.
"""

TOPE_DOCUMENTOS = 50
TOPE_CARPETAS = 50


class Negativa(Exception):
    """Por qué no se puede: un código, el texto para la persona y su código HTTP."""
    def __init__(self, codigo, texto, http=400):
        super().__init__(texto)
        self.codigo, self.texto, self.http = codigo, texto, http


def hay_tabla(cur):
    """¿Está aplicada la migración 48? Sin ella las carpetas se listan igual, sin enlaces."""
    cur.execute("SELECT to_regclass('public.doc_enlaces')")
    fila = cur.fetchone()
    return bool(fila and fila[0])


def _nodos(cur, model_urn, ids):
    """{id: (tipo, nombre, padre)} de esos nodos vivos de ESTA obra."""
    cur.execute("""SELECT id::text, node_type, name, parent_id::text FROM file_nodes
                    WHERE id = ANY(%s::uuid[]) AND model_urn = %s AND is_deleted = FALSE""", (list(ids), model_urn))
    return {r[0]: (r[1], r[2], r[3]) for r in cur.fetchall()}


def crear(cur, model_urn, documentos, carpetas, creado_por, puede_ver, puede_editar_en):
    """Enlaza cada documento en cada carpeta. Devuelve {'creados', 'ya_estaban'}. Lanza `Negativa`.

    `puede_ver(id)`: si quien enlaza ve ese documento. `puede_editar_en(id)`: si puede escribir en esa carpeta."""
    documentos = list(dict.fromkeys(str(d) for d in documentos))
    carpetas = list(dict.fromkeys(str(c) for c in carpetas))
    if not documentos or not carpetas:
        raise Negativa('FALTAN', 'Elige el documento y al menos una carpeta.')
    if len(documentos) > TOPE_DOCUMENTOS or len(carpetas) > TOPE_CARPETAS:
        raise Negativa('DEMASIADOS', 'Como mucho %d documentos y %d carpetas a la vez.' % (TOPE_DOCUMENTOS,
                                                                                         TOPE_CARPETAS))
    if not hay_tabla(cur):
        raise Negativa('SIN_MIGRACION', 'Los enlaces aún no están disponibles en esta obra.', 503)
    nodos = _nodos(cur, model_urn, documentos + carpetas)
    for d in documentos:
        if nodos.get(d, (None,))[0] != 'FILE':
            raise Negativa('NO_ES_DOCUMENTO', 'Solo se enlazan documentos de esta obra.', 404)
    for c in carpetas:
        if nodos.get(c, (None,))[0] != 'FOLDER':
            raise Negativa('NO_ES_CARPETA', 'Alguna carpeta no existe en esta obra.', 404)
    for d in documentos:
        if not puede_ver(d):
            raise Negativa('SIN_PERMISO', 'No puedes ver «%s».' % nodos[d][1], 403)
    for c in carpetas:
        if not puede_editar_en(c):
            raise Negativa('SIN_PERMISO', 'No tienes permiso para enlazar en «%s».' % nodos[c][1], 403)
        for d in documentos:
            if nodos[d][2] == c:
                raise Negativa('EN_SU_CARPETA', '«%s» ya está en «%s»: es su carpeta.' % (nodos[d][1], nodos[c][1]))

    # Lo que ya hay en cada carpeta: sus documentos y sus enlaces, por nombre.
    cur.execute("""SELECT parent_id::text, lower(name), id::text FROM file_nodes
                    WHERE parent_id = ANY(%s::uuid[]) AND model_urn = %s AND node_type = 'FILE'
                      AND is_deleted = FALSE""", (carpetas, model_urn))
    ocupado = {(c, n): i for c, n, i in cur.fetchall()}
    cur.execute("""SELECT e.carpeta_id::text, lower(f.name), f.id::text FROM doc_enlaces e
                     JOIN file_nodes f ON f.id = e.documento_id AND f.is_deleted = FALSE
                    WHERE e.carpeta_id = ANY(%s::uuid[])""", (carpetas,))
    enlazados = {(c, n): i for c, n, i in cur.fetchall()}

    creados = ya = 0
    for c in carpetas:
        for d in documentos:
            clave = (c, nodos[d][1].lower())
            if enlazados.get(clave) == d:
                ya += 1
                continue
            if clave in ocupado or clave in enlazados:
                raise Negativa('NOMBRE_OCUPADO', 'Ya hay un «%s» en «%s».' % (nodos[d][1], nodos[c][1]), 409)
            cur.execute("""INSERT INTO doc_enlaces (model_urn, documento_id, carpeta_id, creado_por)
                           VALUES (%s, %s, %s, %s)""", (model_urn, d, c, creado_por))
            enlazados[clave] = d
            creados += 1
    return {'creados': creados, 'ya_estaban': ya}


# Las columnas de un documento tal como las lee `file_system_db.list_contents`, en su orden, y después las del enlace.
COLUMNAS_DEL_DOCUMENTO = """fn.id, fn.name, fn.node_type, fn.size_bytes, fn.version_number, fn.updated_at, fn.gcs_urn,
       fn.status, fn.tags, fn.metadata, fn.description, fn.mime_type, fn.created_at,
       COALESCE(fn.updated_by, fn.created_by, 'Sistema') AS u_by,
       NULL AS permission_level, FALSE AS has_children,
       fn.codigo_idoneidad, fn.codigo_revision, fn.nomenclatura_ok,
       fn.bloqueado_por, fn.bloqueado_en, fn.current_version_id"""


def filas_del_listado(cur, model_urn, carpeta_id):
    """Los documentos que ESTA carpeta enlaza, vivos y de esta obra: [(fila_como_list_contents, enlace)].

    `enlace` = {'id', 'desde': {'id', 'ruta': [nombres]}}. SIN filtrar por permiso: lo filtra quien lista, con la
    misma regla que a los documentos propios. Uno que ya vive en esta carpeta no sale como enlace."""
    if not carpeta_id or not hay_tabla(cur):
        return []
    cur.execute("""SELECT """ + COLUMNAS_DEL_DOCUMENTO + """, e.id::text, fn.parent_id::text
                     FROM doc_enlaces e
                     JOIN file_nodes fn ON fn.id = e.documento_id
                    WHERE e.carpeta_id = %s AND e.model_urn = %s AND fn.model_urn = %s
                      AND fn.is_deleted = FALSE AND fn.node_type = 'FILE'
                      AND fn.parent_id IS DISTINCT FROM e.carpeta_id
                    ORDER BY fn.name""", (str(carpeta_id), model_urn, model_urn))
    filas = cur.fetchall()
    rutas = rutas_de(cur, {f[-1] for f in filas if f[-1]})
    return [(tuple(f[:-2]), {'id': f[-2], 'desde': {'id': f[-1], 'ruta': rutas.get(f[-1], [])}}) for f in filas]


def rutas_de(cur, carpetas):
    """{carpeta: [nombres de arriba abajo, sin la raíz de la obra, incluida ella]} en UNA consulta."""
    carpetas = [str(c) for c in carpetas if c]
    if not carpetas:
        return {}
    cur.execute("""WITH RECURSIVE sube(origen, id, parent_id, name, folder_type, n) AS (
                       SELECT id, id, parent_id, name, folder_type, 0 FROM file_nodes WHERE id = ANY(%s::uuid[])
                       UNION ALL
                       SELECT s.origen, p.id, p.parent_id, p.name, p.folder_type, s.n + 1
                         FROM file_nodes p JOIN sube s ON p.id = s.parent_id WHERE s.n < 64)
                   SELECT origen::text, name FROM sube
                    WHERE folder_type IS DISTINCT FROM 'PROJECT_ROOT'
                    ORDER BY origen, n DESC""", (carpetas,))
    rutas = {}
    for origen, nombre in cur.fetchall():
        rutas.setdefault(origen, []).append(nombre)
    return rutas


def de_un_arbol(cur, carpeta_id):
    """Los documentos enlazados en esta carpeta y en todas las de dentro (vivas), para «Descargar carpeta»:
    [(id, nombre, gcs_urn, ruta de la carpeta que lo enlaza desde `carpeta_id`, incluida)]. Sin filtrar por permiso."""
    cur.execute("""WITH RECURSIVE arbol AS (
                       SELECT id, CAST(name AS TEXT) AS ruta FROM file_nodes
                        WHERE id = %s AND is_deleted = FALSE AND node_type = 'FOLDER'
                       UNION ALL
                       SELECT f.id, CAST(a.ruta || '/' || f.name AS TEXT) FROM file_nodes f JOIN arbol a ON f.parent_id = a.id
                        WHERE f.is_deleted = FALSE AND f.node_type = 'FOLDER')
                   SELECT d.id::text, d.name, d.gcs_urn, a.ruta
                     FROM arbol a
                     JOIN doc_enlaces e ON e.carpeta_id = a.id
                     JOIN file_nodes d ON d.id = e.documento_id AND d.is_deleted = FALSE AND d.node_type = 'FILE'
                    WHERE d.parent_id IS DISTINCT FROM e.carpeta_id""", (str(carpeta_id),))
    return cur.fetchall()


def enlazado_en(cur, model_urn, documento_id):
    """Dónde está enlazado este documento: [{'enlace', 'carpeta': {'id', 'ruta'}}], carpetas vivas, por ruta."""
    if not hay_tabla(cur):
        return []
    cur.execute("""SELECT e.id::text, e.carpeta_id::text FROM doc_enlaces e
                     JOIN file_nodes c ON c.id = e.carpeta_id AND c.is_deleted = FALSE
                    WHERE e.documento_id = %s AND e.model_urn = %s""", (str(documento_id), model_urn))
    filas = cur.fetchall()
    rutas = rutas_de(cur, {c for _, c in filas})
    salida = [{'enlace': e, 'carpeta': {'id': c, 'ruta': rutas.get(c, [])}} for e, c in filas]
    return sorted(salida, key=lambda x: [n.lower() for n in x['carpeta']['ruta']])


def cuantos_por_documento(cur, documentos):
    """{documento: nº de carpetas vivas que lo enlazan}, para el aviso «Enlazado en N» de la lista. Una consulta."""
    documentos = [str(d) for d in documentos if d]
    if not documentos or not hay_tabla(cur):
        return {}
    cur.execute("""SELECT e.documento_id::text, count(*) FROM doc_enlaces e
                     JOIN file_nodes c ON c.id = e.carpeta_id AND c.is_deleted = FALSE
                    WHERE e.documento_id = ANY(%s::uuid[])
                    GROUP BY e.documento_id""", (documentos,))
    return {d: n for d, n in cur.fetchall()}


def leer(cur, enlace_id):
    """(obra, documento, carpeta) de un enlace, o None."""
    if not hay_tabla(cur):
        return None
    cur.execute("""SELECT model_urn, documento_id::text, carpeta_id::text FROM doc_enlaces WHERE id = %s""",
                (str(enlace_id),))
    return cur.fetchone()


def quitar(cur, enlace_id):
    """Quita el enlace. El original no se toca. Devuelve si había algo que quitar."""
    cur.execute('DELETE FROM doc_enlaces WHERE id = %s', (str(enlace_id),))
    return cur.rowcount > 0
