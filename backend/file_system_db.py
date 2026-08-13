from esquema_congelado import solo_con_ddl
import os
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from db import get_db_connection

# --- ISO 19650 Naming Standard Constants ---
# [PROJECT]-[ORIGINATOR]-[VOLUME]-[LEVEL]-[TYPE]-[ROLE]-[NUMBER]
ISO_19650_REGEX = r"^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[0-9]{4,6}$"
gcs_executor = ThreadPoolExecutor(max_workers=4)

def resolve_path_to_node_id(path, model_urn, created_by=None, auto_create=True):
    """
    [ENTERPRISE REFACTOR]
    Convierte un path del tipo 'folder1/folder2/' en el node_id correspondiente.
    Utiliza la función PL/pgSQL 'resolve_folder_path' que procesa el loop internamente 
    en la Base de Datos para evitar el problema de roundtrips (N+1 Queries).
    """
    if not path or not model_urn:
        return None

    # Normalización básica para evitar errores de tipo
    p_path = path.strip('/')
    m_urn = model_urn.strip('/')

    if not p_path or p_path == m_urn:
        return None

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT resolve_folder_path(%s, %s, %s, %s)",
            (p_path, model_urn, created_by, auto_create)
        )
        row = cursor.fetchone()
        conn.commit()
        return row[0] if row else None


def list_contents(parent_id, model_urn, base_path="", user=None):
    """
    Devuelve inventario estructurado con metadata de auditoría (updated_by e iniciales).
    Aplica filtro ISO 19650 Invisibility Mode para carpetas sin acceso.
    Optimizado: permisos resueltos en una sola consulta SQL (batch JOIN).
    """
    def get_initials(name):
        if not name: return "??"
        parts = name.split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[1][0]).upper()
        return name[:2].upper()

    folders = []
    files = []
    
    # Determinar datos del usuario una sola vez
    u_id = user.get('id') if user else None
    u_role = user.get('role', 'viewer') if user else None
    is_admin = (u_role == 'admin') if u_role else False

    # Modo ISO 19650 estricto (opt-in por entorno): los no-admin solo ven
    # documentos Compartido/Publicado. Los WIP son borradores internos del
    # equipo que produce y no deben exponerse hasta ser revisados/aprobados.
    #
    # CUIDADO AL ENCENDERLO. Medido sobre la base real: 3.035 de 3.036 documentos
    # estan en Trabajo en curso, porque hasta ahora NADA los sacaba de ahi (la
    # maquina de estados era inalcanzable) y porque la convencion de nombres que
    # se exige no es la de esta obra. Encenderlo hoy deja el portal practicamente
    # vacio para todo el que no sea admin. Primero hay que mover documentos a
    # Compartido de verdad.
    import os as _os
    import estados_ecd as _ecd
    strict_iso = _os.getenv('STRICT_ISO_VISIBILITY', 'false').lower() in ('true', '1', 'yes')
    iso_visible = {_ecd.SHARED, _ecd.PUBLISHED, _ecd.ARCHIVED}
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # ── QUERY OPTIMIZADA: JOIN con folder_permissions en una sola consulta ──
        # Si el usuario no es admin y tiene ID, hacemos LEFT JOIN para traer permisos.
        # Si es admin o no hay user, no necesitamos JOIN (admin = acceso total).
        if u_id and not is_admin:
            query = """
                SELECT fn.id, fn.name, fn.node_type, fn.size_bytes, fn.version_number, 
                       fn.updated_at, fn.gcs_urn, fn.status, fn.tags, fn.metadata, 
                       fn.description, fn.mime_type, fn.created_at,
                       COALESCE(fn.updated_by, fn.created_by, 'Sistema') as u_by,
                       fp.permission_level,
                       EXISTS(SELECT 1 FROM file_nodes c WHERE c.model_urn = fn.model_urn AND c.parent_id = fn.id AND c.is_deleted = FALSE) AS has_children,
                       fn.codigo_idoneidad, fn.codigo_revision, fn.nomenclatura_ok,
                       fn.bloqueado_por, fn.bloqueado_en, fn.current_version_id
                FROM file_nodes fn
                LEFT JOIN folder_permissions fp 
                    ON fn.id = fp.folder_node_id AND fp.user_id = %s
                WHERE fn.model_urn = %s AND {parent_cond} AND fn.is_deleted = FALSE
                ORDER BY fn.node_type DESC, fn.name ASC
            """
            if parent_id is None:
                cursor.execute(query.format(parent_cond="fn.parent_id IS NULL"), (u_id, model_urn))
            else:
                cursor.execute(query.format(parent_cond="fn.parent_id = %s"), (u_id, model_urn, parent_id))
        else:
            query = """
                SELECT id, name, node_type, size_bytes, version_number, updated_at, gcs_urn, 
                       status, tags, metadata, description, mime_type, created_at, 
                       COALESCE(updated_by, created_by, 'Sistema') as u_by,
                       NULL as permission_level,
                       EXISTS(SELECT 1 FROM file_nodes c WHERE c.model_urn = file_nodes.model_urn AND c.parent_id = file_nodes.id AND c.is_deleted = FALSE) AS has_children,
                       codigo_idoneidad, codigo_revision, nomenclatura_ok,
                       bloqueado_por, bloqueado_en, current_version_id
                FROM file_nodes
                WHERE model_urn = %s AND {parent_cond} AND is_deleted = FALSE
                ORDER BY node_type DESC, name ASC
            """
            if parent_id is None:
                cursor.execute(query.format(parent_cond="parent_id IS NULL"), (model_urn,))
            else:
                cursor.execute(query.format(parent_cond="parent_id = %s"), (model_urn, parent_id))
        
        rows = cursor.fetchall()

        # Nivel HEREDADO desde la carpeta padre (herencia aditiva): un hijo tiene al
        # menos el nivel efectivo del padre. Antes la visibilidad miraba solo el
        # permiso DIRECTO de cada carpeta, asi que las subcarpetas de una carpeta
        # concedida salian grises aunque el usuario SI tuviera acceso heredado
        # (las acciones ya lo respetaban). Esto alinea visibilidad con acciones.
        parent_eff = 'none'
        if u_id and not is_admin:
            try:
                from folder_permissions import get_effective_permission
                parent_eff = get_effective_permission(u_id, parent_id, model_urn)
            except Exception as _pe:
                parent_eff = 'none'

        for row in rows:
            (r_id, r_name, r_type, r_size, r_version, r_updated, r_gcs, r_status, r_tags,
             r_metadata, r_description, r_mime, r_created, r_u_by, r_perm, r_has_children,
             r_idoneidad, r_revision, r_nomenclatura,
             r_bloqueado_por, r_bloqueado_en, r_version_id) = row
            bp = base_path if base_path.endswith('/') else (base_path + '/' if base_path else '')
            full_name = f"{bp}{r_name}" + ("/" if r_type == 'FOLDER' else "")
            
            audit_data = {
                "name": r_u_by,
                "initials": get_initials(r_u_by)
            }

            # ── Resolver permisos en base al resultado del JOIN ──
            if is_admin:
                perm_level = 'admin'
                has_access = True
            elif u_id and r_type == 'FOLDER':
                # Nivel efectivo = max(permiso directo, heredado del padre).
                from folder_permissions import PERMISSION_LEVELS as _PL
                direct = r_perm or 'none'
                eff = direct if _PL.get(direct, -1) >= _PL.get(parent_eff, -1) else parent_eff
                perm_level = eff
                has_access = eff != 'none'  # Fail-closed solo si NO hay ni directo ni heredado
            else:
                perm_level = 'view_only'
                has_access = True

            item = {
                "id": r_id,
                "name": r_name,
                "fullName": full_name,
                "updated": r_updated.isoformat() if r_updated else None,
                "created_at": r_created.isoformat() if r_created else None,
                "updated_by": audit_data,
                "description": r_description,
                "permission_level": perm_level,
                "has_access": has_access
            }

            if r_type == 'FOLDER':
                item["has_children"] = bool(r_has_children)
                folders.append(item)
            else:
                # ISO estricto: ocultar WIP (y estados nulos) a los no-admin
                iso_blocked = strict_iso and not is_admin and _ecd.normalizar(r_status) not in iso_visible
                if has_access and not iso_blocked:  # Los archivos sin acceso/bloqueados se excluyen
                    item.update({
                        "size": r_size,
                        "version": r_version,
                        # El NUMERO de version ("3") no identifica nada: manana
                        # puede haber otra 3 si alguien promociona. version_id
                        # SI apunta a un contenido concreto, y es lo que tienen
                        # que guardar revisiones, transmittals y conjuntos para
                        # que «V3 congelada» deje de ser una etiqueta bonita.
                        "version_id": str(r_version_id) if r_version_id else None,
                        "status": r_status,
                        # La REVISION es la emision formal (P01, C01...); la
                        # version es el contador de subidas. Y la IDONEIDAD dice
                        # para que esta autorizado el documento, que es lo que
                        # el estado por si solo no cuenta.
                        "codigo_revision": r_revision,
                        "codigo_idoneidad": r_idoneidad,
                        "nomenclatura_ok": r_nomenclatura,
                        # Quien lo tiene reservado para editar, si alguien lo tiene.
                        "bloqueado_por": r_bloqueado_por,
                        "bloqueado_en": r_bloqueado_en.isoformat() if r_bloqueado_en else None,
                        "tags": r_tags or [],
                        "metadata": r_metadata or {},
                        "custom_attributes": r_metadata or {},
                        "mime_type": r_mime,
                        "gcs_urn": r_gcs
                    })
                    files.append(item)
                
    return {"folders": folders, "files": files}

# ── IN-MEMORY ROOT NODE CACHE (permanent) ────────────────────────────
# Root node IDs never change → cache permanently. Eliminates ~600ms roundtrip.
_root_cache = {}  # model_urn -> root_id


@solo_con_ddl
def ensure_project_root_node(model_urn):
    """
    Asegura que exista un nodo raíz real ('Archivos de proyecto') para el proyecto dado.
    Si no existe, lo crea y re-asigna como padre de las carpetas huérfanas (parent_id=NULL).
    Retorna el UUID del nodo raíz. Usa caché in-memory permanente.
    """
    if not model_urn or model_urn == 'global':
        return None
    
    # 0. Check in-memory cache first (0ms)
    cached = _root_cache.get(model_urn)
    if cached:
        return cached
    
    ROOT_NAME = 'Archivos de proyecto'
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Buscar nodo raíz existente (determinista: SIEMPRE la más antigua,
        #    para que create y list resuelvan la MISMA raíz aunque existan
        #    duplicados legacy pendientes de sanear)
        cursor.execute("""
            SELECT id FROM file_nodes
            WHERE model_urn = %s AND folder_type = 'PROJECT_ROOT' AND is_deleted = FALSE
            ORDER BY created_at ASC, id ASC
            LIMIT 1
        """, (model_urn,))
        row = cursor.fetchone()

        if row:
            _root_cache[model_urn] = row[0]
            return row[0]

        # 2. No existe → Crear nodo raíz. ON CONFLICT (índice único parcial
        #    uq_file_nodes_project_root) mata la carrera de doble-creación:
        #    si otro request la creó en paralelo, re-seleccionamos la suya.
        cursor.execute("""
            INSERT INTO file_nodes (model_urn, parent_id, node_type, name, folder_type, created_by)
            VALUES (%s, NULL, 'FOLDER', %s, 'PROJECT_ROOT', 'SYSTEM')
            ON CONFLICT DO NOTHING
            RETURNING id
        """, (model_urn, ROOT_NAME))
        ins = cursor.fetchone()
        if not ins:
            conn.commit()
            cursor.execute("""
                SELECT id FROM file_nodes
                WHERE model_urn = %s AND folder_type = 'PROJECT_ROOT' AND is_deleted = FALSE
                ORDER BY created_at ASC, id ASC LIMIT 1
            """, (model_urn,))
            row2 = cursor.fetchone()
            if row2:
                _root_cache[model_urn] = row2[0]
                return row2[0]
            return None
        root_id = ins[0]
        
        # 3. Re-parent: mover carpetas huérfanas (parent_id=NULL) bajo el nuevo root
        cursor.execute("""
            UPDATE file_nodes 
            SET parent_id = %s
            WHERE model_urn = %s AND parent_id IS NULL AND id != %s AND is_deleted = FALSE
        """, (root_id, model_urn, root_id))
        moved = cursor.rowcount
        
        conn.commit()
        print(f"[DB] Nodo raíz creado para {model_urn}: {root_id} ({moved} carpetas re-asignadas)")
        _root_cache[model_urn] = root_id
        return root_id

def _registrar_vuelta_a_borrador(cursor, model_urn, node_id, nombre, anterior, version, autor,
                                 motivo=None):
    """Deja constancia de que cambiar el contenido de un documento retiro una aprobacion.

    Sin esta linea, un documento publicado aparecia de pronto en borrador y no
    habia forma de saber que lo movio ni cuando. Es justo la pregunta que hace un
    auditor cuando algo que estaba publicado ya no lo esta.

    `motivo` se puede dar hecho porque hay DOS formas de cambiar el contenido de un
    documento: subir una version nueva y promocionar una antigua. La segunda tambien
    retira la aprobacion, y el auditor merece leer cual de las dos fue.
    """
    import json as _json
    import estados_ecd as ecd
    try:
        cursor.execute(
            "INSERT INTO activity_log "
            "(model_urn, action, entity_type, entity_id, entity_name, performed_by, details) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (model_urn, 'cambio_de_estado', 'file', str(node_id), nombre, autor,
             _json.dumps({
                 'estado_anterior': anterior,
                 'estado_nuevo': ecd.WIP,
                 'anterior_etiqueta': ecd.ETIQUETAS.get(anterior, anterior),
                 'nuevo_etiqueta': ecd.ETIQUETAS[ecd.WIP],
                 'motivo': motivo or f'se subio la version {version}: lo aprobado fue la anterior',
             })),
        )
    except Exception as e:  # pragma: no cover - defensivo
        print(f"[ESTADO] no se pudo registrar la vuelta a borrador de {nombre}: {e}")


def create_file_record(model_urn, parent_id, filename, size_bytes, gcs_uuid, mime_type=None,
                       created_by=None, sha256=None):
    """Inserta/Actualiza el Ítem y crea una nueva Versión histórica con Holding Area (Estilo APS)"""
    import re
    
    import estados_ecd as ecd

    # El fichero NACE en el estado inicial del ciclo de vida. Antes se le escribia
    # 'ACTIVE', un valor que la maquina de estados no conoce, asi que el documento
    # quedaba fuera del ciclo desde el primer segundo y ya no podia moverse.
    #
    # Que el nombre cumpla o no la convencion es OTRA cosa, y va en su propia
    # marca: mezclarlas convertia el area de retencion en una trampa sin salida.
    #
    # La convencion es DE LA OBRA y no se le aplica a las fotos de campo: juzgar
    # una foto de una zanja con la nomenclatura de un plano fue lo que metio 2.676
    # imagenes en cuarentena y dejo el area de retencion sin servir para nada.
    # Ver backend/nomenclatura.py.
    from nomenclatura import evaluar_para

    with get_db_connection() as conn:
        cursor = conn.cursor()
        conforme = evaluar_para(cursor, model_urn, filename)

        # 1. Buscar si el Ítem ya existe en la ubicación
        cursor.execute(
            "SELECT id, version_number, status FROM file_nodes WHERE model_urn = %s AND parent_id IS NOT DISTINCT FROM %s AND name = %s AND node_type = 'FILE' AND is_deleted = FALSE",
            (model_urn, parent_id, filename)
        )
        existing = cursor.fetchone()

        if existing:
            f_id, f_v, estado_previo = existing
            # Subir una version nueva sobre un documento que otro tiene reservado
            # es justo la forma de perder trabajo que la reserva evita.
            from bloqueo_de_edicion import comprobar_libre
            comprobar_libre(cursor, f_id, {'email': created_by},
                            'subir una versión nueva')
            new_v = f_v + 1
            # Una version nueva vuelve a ser trabajo en curso: lo que se reviso y
            # se aprobo fue la version anterior, no esta. Y como aqui se pierde la
            # aprobacion de un documento que estaba compartido o publicado, queda
            # constancia de por que.
            anterior = ecd.normalizar(estado_previo)
            if anterior != ecd.WIP:
                _registrar_vuelta_a_borrador(cursor, model_urn, f_id, filename,
                                             anterior, new_v, created_by)
            # Y se le CAEN la idoneidad y la revision. Son de la EMISION, no del
            # documento: lo que se autorizo como «A1, apto para construccion» fue
            # la version anterior. Si se quedaran pegadas, un fichero recien
            # subido, sin revisar y sin aprobar, seguiria listandose como apto
            # para construir -- exactamente el dano que esto viene a evitar.
            cursor.execute("""
                UPDATE file_nodes
                SET gcs_urn = %s, version_number = %s, size_bytes = %s, mime_type = %s,
                    updated_at = CURRENT_TIMESTAMP, updated_by = %s, status = %s,
                    nomenclatura_ok = %s,
                    codigo_idoneidad = NULL, codigo_revision = NULL
                WHERE id = %s
            """, (gcs_uuid, new_v, size_bytes, mime_type, created_by, ecd.WIP,
                  conforme, f_id))
        else:
            # Crear nuevo Ítem raíz
            cursor.execute("""
                INSERT INTO file_nodes (model_urn, parent_id, node_type, name, size_bytes, gcs_urn, mime_type, created_by, version_number, status, nomenclatura_ok)
                VALUES (%s, %s, 'FILE', %s, %s, %s, %s, %s, 1, %s, %s)
                RETURNING id
            """, (model_urn, parent_id, filename, size_bytes, gcs_uuid, mime_type,
                  created_by, ecd.WIP, conforme))
            f_id = cursor.fetchone()[0]
            new_v = 1
            
        # 2. Registrar la Versión HISTÓRICA en la tabla de versiones
        # La huella del contenido va AQUI, en la version, no en el documento: lo
        # que se aprueba es una emision concreta, y sin atarla a su contenido no
        # se puede sostener despues que el fichero es el que se autorizo.
        cursor.execute("""
            INSERT INTO file_versions (file_node_id, version_number, gcs_urn, size_bytes,
                                       mime_type, created_by, sha256, huella_en)
            VALUES (%s, %s, %s, %s, %s, %s, %s,
                    CASE WHEN %s IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
            RETURNING id
        """, (f_id, new_v, gcs_uuid, size_bytes, mime_type, created_by, sha256, sha256))
        v_id = cursor.fetchone()[0]
        
        # 3. Vincular el Ítem principal a su registro de versión actual
        cursor.execute("UPDATE file_nodes SET current_version_id = %s WHERE id = %s", (v_id, f_id))
        
        conn.commit()

    # 4. Si quien llamo no traia la huella, se calcula leyendo el objeto.
    #
    # POR QUE AQUI Y NO EN CADA RUTA
    # Habia cuatro vias por las que nace una version y solo DOS sellaban:
    # la subida directa (que ve los bytes) y la troceada (que los lee de vuelta).
    # No sellaban ni /api/docs/upload-confirm -- la de URL firmada, que es la que
    # usa el portal -- ni la importacion de WhatsApp. Es decir: la via mas usada
    # creaba versiones sin huella, y C6 quedaba cojo justo donde mas se usa.
    # Poniendolo en las dos rutas que faltaban se arregla hoy y se vuelve a
    # romper con la quinta via. Aqui no: pase por donde pase, la version acaba
    # sellada o queda contada como sin sellar, que es lo honesto.
    if not sha256 and gcs_uuid:
        try:
            import os as _os
            if _os.getenv('GCS_BUCKET_NAME'):
                import integridad
                # En segundo plano: leer de vuelta un plano de 272 MB no puede
                # bloquear la respuesta de una subida.
                gcs_executor.submit(integridad.sellar_desde_almacen, v_id, gcs_uuid)
        except Exception as _e:
            print(f"[file_system_db] no se pudo lanzar el sellado de {v_id}: {_e}")

    return f_id, new_v

def find_node_by_gcs_urn(model_urn, gcs_urn):
    """
    Busca un nodo por su identificador fisico en GCS. 
    Util para mapear resultados de RAG (que vienen como gs://bucket/path) a IDs de nuestra tabla.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, metadata, updated_at
            FROM file_nodes 
            WHERE model_urn = %s AND gcs_urn = %s AND is_deleted = FALSE
            LIMIT 1
        """, (model_urn, gcs_urn))
        return cursor.fetchone()

def soft_delete_node(node_id, model_urn, performed_by=None, reason=None):
    """
    Soft-delete recursivo (Carpeta y descendientes).
    Maneja auditoría de tiempo y estado.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        target_id = node_id
        
        if not target_id:
            return False

        # CTE Recursivo para marcar todo el subárbol
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            UPDATE file_nodes
            SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP, updated_by = %s
            WHERE id IN (SELECT id FROM subtree)
        """, (target_id, performed_by))
        conn.commit()
        return True

def get_file_gcs_urn(model_urn, node_path):
    """Devuelve el URN de GCS real para generar el signed URL"""
    # node_path es algo como "fotos/Mi_Plano.pdf"
    parts = [p for p in node_path.split('/') if p]
    if not parts: return None
    
    filename = parts.pop()
    parent_id = resolve_path_to_node_id('/'.join(parts), model_urn) if parts else None
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if parent_id:
            cursor.execute("SELECT gcs_urn FROM file_nodes WHERE model_urn = %s AND parent_id = %s AND name = %s AND node_type = 'FILE' AND is_deleted = FALSE", (model_urn, parent_id, filename))
        else:
            cursor.execute("SELECT gcs_urn FROM file_nodes WHERE model_urn = %s AND parent_id IS NULL AND name = %s AND node_type = 'FILE' AND is_deleted = FALSE", (model_urn, filename))
            
        row = cursor.fetchone()
        return row[0] if row else None

def get_node_full_path(node_id):
    """
    Reconstruye el path visual (breadcrumb) de un nodo subiendo por los parent_id.
    Retorna algo como: '03_DOCUMENTOS / 02_MEMORIA_DESCRIPTIVA / archivo.pdf'
    """
    if node_id is None:
        return "Raíz"
        
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # CTE recursivo para subir en la jerarquia
        cursor.execute("""
            WITH RECURSIVE breadcrumbs AS (
                SELECT id, name, parent_id, 0 as level
                FROM file_nodes
                WHERE id = %s
                
                UNION ALL
                
                SELECT fn.id, fn.name, fn.parent_id, bc.level + 1
                FROM file_nodes fn
                INNER JOIN breadcrumbs bc ON fn.id = bc.parent_id
            )
            SELECT name FROM breadcrumbs ORDER BY level DESC;
        """, (node_id,))
        
        rows = cursor.fetchall()
        if not rows:
            return "Carpeta Desconocida"
            
        return " / ".join([r[0] for r in rows])

def find_nodes_by_description_match(query, model_urn, limit=8, priority_folders=[]):
    """
    Busca nodos que coincidan con el query en su descripción.
    Util para el motor de IA y el buscador global.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        search_pattern = f"%{query}%"
        
        # Primero buscamos en carpetas prioritarias si se proveen
        if priority_folders:
            # Esta es una version simplificada, se podria mejorar con joins
            cursor.execute("""
                SELECT id, name, description 
                FROM file_nodes 
                WHERE model_urn = %s AND is_deleted = FALSE 
                  AND (description ILIKE %s OR name ILIKE %s)
                ORDER BY updated_at DESC LIMIT %s
            """, (model_urn, search_pattern, search_pattern, limit))
        else:
            cursor.execute("""
                SELECT id, name, description 
                FROM file_nodes 
                WHERE model_urn = %s AND is_deleted = FALSE 
                  AND (description ILIKE %s OR name ILIKE %s)
                ORDER BY updated_at DESC LIMIT %s
            """, (model_urn, search_pattern, search_pattern, limit))
        
        return cursor.fetchall()

def search_nodes(model_urn, query, limit=100):
    """
    Búsqueda global exhaustiva para el Frontend optimizada para evitar N+1 queries.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        search_pattern = f"%{query}%"
        cursor.execute("""
            WITH RECURSIVE found_files AS (
                SELECT id, name, node_type, size_bytes, version_number, updated_at, description, gcs_urn, status, mime_type
                FROM file_nodes
                WHERE model_urn = %s AND is_deleted = FALSE 
                  AND (name ILIKE %s OR description ILIKE %s)
                ORDER BY updated_at DESC
                LIMIT %s
            ),
            paths AS (
                SELECT f.id as base_id, fn.id, fn.parent_id, fn.name, 0 as level
                FROM found_files f
                JOIN file_nodes fn ON fn.id = f.id
                
                UNION ALL
                
                SELECT p.base_id, fn.id, fn.parent_id, fn.name, p.level + 1
                FROM file_nodes fn
                INNER JOIN paths p ON fn.id = p.parent_id
            ),
            assembled_paths AS (
                SELECT base_id, string_agg(name, ' / ' ORDER BY level DESC) as full_path
                FROM paths
                GROUP BY base_id
            )
            SELECT f.id, f.name, f.node_type, f.size_bytes, f.version_number, f.updated_at, f.description, f.gcs_urn, f.status, f.mime_type, ap.full_path
            FROM found_files f
            LEFT JOIN assembled_paths ap ON f.id = ap.base_id
            ORDER BY f.updated_at DESC
        """, (model_urn, search_pattern, search_pattern, limit))
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            r_id, r_name, r_type, r_size, r_version, r_updated, r_desc, r_gcs, r_status, r_mime, r_full_path = row
            results.append({
                "id": str(r_id),
                "name": r_name,
                "node_type": r_type,
                "fullName": r_full_path, 
                "size": r_size,
                "version": f"V{r_version}",
                "updated": r_updated.isoformat() if r_updated else None,
                "description": r_desc,
                "mime_type": r_mime,
                "status": r_status,
                "gcs_urn": r_gcs
            })
        return results

def list_deleted_contents(model_urn):
    """
    Lista todos los nodos marcados como eliminados (is_deleted = TRUE) en un proyecto.
    Optimizado con CTE recursivo para evitar consultas N+1 en las rutas.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            WITH RECURSIVE deleted_files AS (
                SELECT id, name, node_type, size_bytes, version_number, updated_at, description, gcs_urn, mime_type, created_by
                FROM file_nodes
                WHERE model_urn = %s AND is_deleted = TRUE
            ),
            paths AS (
                SELECT f.id as base_id, fn.id, fn.parent_id, fn.name, 0 as level
                FROM deleted_files f
                JOIN file_nodes fn ON fn.id = f.id
                
                UNION ALL
                
                SELECT p.base_id, fn.id, fn.parent_id, fn.name, p.level + 1
                FROM file_nodes fn
                INNER JOIN paths p ON fn.id = p.parent_id
            ),
            assembled_paths AS (
                SELECT base_id, string_agg(name, ' / ' ORDER BY level DESC) as full_path
                FROM paths
                GROUP BY base_id
            )
            SELECT f.id, f.name, f.node_type, f.size_bytes, f.version_number, f.updated_at, f.description, f.gcs_urn, f.mime_type, f.created_by, ap.full_path
            FROM deleted_files f
            LEFT JOIN assembled_paths ap ON f.id = ap.base_id
            ORDER BY f.updated_at DESC
        """, (model_urn,))
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            r_id, r_name, r_type, r_size, r_version, r_updated, r_desc, r_gcs, r_mime, r_created_by, r_full_path = row
            results.append({
                "id": str(r_id),
                "name": r_name,
                "node_type": r_type,
                "fullName": r_full_path, 
                "size": r_size,
                "version": f"V{r_version}",
                "updated": r_updated.isoformat() if r_updated else None,
                "description": r_desc,
                "mime_type": r_mime,
                "gcs_urn": r_gcs,
                "updated_by": r_created_by
            })
        return results

def restore_node(model_urn, node_id):
    """
    Restaura un nodo y sus hijos, marcándolos como is_deleted = FALSE.
    Si ya existe un nodo con el mismo nombre en el mismo padre, lanza excepción.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Obtener datos del nodo a restaurar (incluyendo el model_urn real de la DB)
        cursor.execute("SELECT name, parent_id, node_type, model_urn FROM file_nodes WHERE id = %s", (node_id,))
        node = cursor.fetchone()
        if not node: return False
        
        name, parent_id, node_type, model_urn = node
        
        # Verificar conflicto de nombres en el destino
        if parent_id:
            cursor.execute("""
                SELECT id FROM file_nodes 
                WHERE model_urn = %s AND parent_id = %s AND name = %s AND node_type = %s AND is_deleted = FALSE
            """, (model_urn, parent_id, name, node_type))
        else:
            cursor.execute("""
                SELECT id FROM file_nodes 
                WHERE model_urn = %s AND parent_id IS NULL AND name = %s AND node_type = %s AND is_deleted = FALSE
            """, (model_urn, name, node_type))
            
        if cursor.fetchone():
            raise Exception(f"Ya existe un elemento activo llamado '{name}' en la ubicación original.")
            
        # Recursive restore for the subtree
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            UPDATE file_nodes
            SET is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT id FROM subtree)
        """, (node_id,))

        # Restaurar también la cadena de ancestros si está borrada;
        # si no, el elemento restaurado queda colgando de una carpeta
        # eliminada y es invisible en el árbol (huérfano).
        cursor.execute("""
            WITH RECURSIVE ancestors AS (
                SELECT parent_id FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.parent_id FROM file_nodes fn
                INNER JOIN ancestors a ON fn.id = a.parent_id
            )
            UPDATE file_nodes
            SET is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT parent_id FROM ancestors WHERE parent_id IS NOT NULL)
              AND is_deleted = TRUE
        """, (node_id,))
        conn.commit()
        return True

def permanent_delete_node_internal(model_urn, node_id):
    """
    Borra físicamente de GCS y elimina el registro de BD.
    Si es carpeta, borra todo su contenido recursivamente.
    """
    from gcs_manager import delete_gcs_blob
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Obtener lista de todos los descendientes (incluyendo el actual)
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id, gcs_urn, name, node_type FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id, fn.gcs_urn, fn.name, fn.node_type FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            SELECT id, gcs_urn FROM subtree
        """, (node_id,))

        to_delete = cursor.fetchall()

        # 1b. Blobs de TODAS las versiones históricas del subárbol
        #     (cada versión tiene su propio archivo en GCS; sin esto quedaban huérfanos para siempre)
        cursor.execute("""
            WITH RECURSIVE subtree AS (
                SELECT id FROM file_nodes WHERE id = %s
                UNION ALL
                SELECT fn.id FROM file_nodes fn
                INNER JOIN subtree st ON fn.parent_id = st.id
            )
            SELECT DISTINCT v.gcs_urn FROM file_versions v
            WHERE v.file_node_id IN (SELECT id FROM subtree) AND v.gcs_urn IS NOT NULL
        """, (node_id,))
        version_urns = {r[0] for r in cursor.fetchall()}

        # 2. Borrar de GCS PRIMERO (evitar blobs huérfanos)
        all_urns = version_urns | {u for _, u in to_delete if u}
        gcs_errors = []
        for gcs_urn in all_urns:
            try:
                delete_gcs_blob(gcs_urn)
            except Exception as e:
                gcs_errors.append((gcs_urn, str(e)))
                print(f"[WARNING] GCS delete failed for {gcs_urn}: {e}")

        # 3. Borrar de BD (ON DELETE CASCADE eliminará hijos automáticamente)
        cursor.execute("DELETE FROM file_nodes WHERE id = %s", (node_id,))
        conn.commit()

        if gcs_errors:
            print(f"[WARNING] {len(gcs_errors)} blobs could not be deleted from GCS. BD records already removed.")
        
        return True

def get_file_versions(model_urn, file_node_id):
    """
    Obtiene el historial completo de versiones de un Ítem (FileNode).
    Basado en el modelo HPFIV de Autodesk.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT v.id, v.version_number, v.size_bytes, v.created_at, v.created_by, v.metadata, v.gcs_urn
                FROM file_versions v
                JOIN file_nodes n ON v.file_node_id = n.id
                WHERE n.model_urn = %s AND n.id = %s
                ORDER BY v.version_number DESC
            """, (model_urn, file_node_id))
            
            versions = []
            for r_id, r_num, r_size, r_at, r_by, r_meta, r_gcs in cursor.fetchall():
                versions.append({
                    "id": str(r_id),
                    "version_number": r_num,
                    "size": r_size,
                    "updated": r_at.isoformat() if r_at else None,
                    "updated_by": r_by,
                    "metadata": r_meta or {},
                    "gcs_urn": r_gcs
                })
            return versions
    except Exception as e:
        print(f"Error fetching versions for {file_node_id}: {e}")
        return []

def promote_version(model_urn, node_id, version_id, performed_by=None):
    """Promociona una version antigua a 'Actual' (estilo ACC): crea una version
    NUEVA cuyo contenido es el de la version elegida.

    EL FALLO QUE ESTO ARREGLA
    -------------------------
    Esta funcion cambiaba los bytes del documento y no tocaba nada mas. Un plano
    PUBLICADO con «A1 / C01» grabado seguia diciendo PUBLICADO y «A1 / C01»
    cuando su contenido ya era otro. Es exactamente el dano que create_file_record
    evita al subir una version (ver su comentario): un fichero sin revisar
    listandose como apto para construir.

    Y envenenaba de rebote a los tres modulos de Entregas, que apuntan al
    documento y no a la version: el transmittal seguia diciendo «V3», el conjunto
    seguia diciendo «V3 congelada», y la revision aprobada apuntaba a un contenido
    que habia cambiado sin enterarse.

    Promocionar es cambiar el contenido. Por tanto hace lo mismo que subir:
      · respeta la reserva de edicion de otro,
      · devuelve el documento a WIP,
      · le quita la idoneidad y la revision, que son de la EMISION y no del fichero,
      · y deja constancia de por que se retiro la aprobacion.

    Ademas: el `model_urn` que llega es el que manda el cliente. La obra se
    resuelve por el ID del documento, y si no coinciden no se promociona nada.
    """
    import estados_ecd as ecd
    from bloqueo_de_edicion import comprobar_libre

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. El documento, y la obra de VERDAD (la suya, no la que diga el cliente).
        cursor.execute("""
            SELECT version_number, status, name, model_urn
            FROM file_nodes
            WHERE id = %s AND COALESCE(is_deleted, false) = false
        """, (node_id,))
        nodo = cursor.fetchone()
        if not nodo:
            return False
        current_v_num, estado_previo, nombre, obra_real = nodo
        if model_urn and model_urn != 'global' and obra_real != model_urn:
            print(f"[PROMOVER] {node_id} es de {obra_real}, no de {model_urn}: no se toca")
            return False

        # 2. Reservado por otro = no se le cambia el contenido por debajo.
        comprobar_libre(cursor, node_id, {'email': performed_by},
                        'promocionar una versión anterior')

        # 3. Datos de la version a promocionar. Tiene que ser de ESTE documento.
        cursor.execute("""
            SELECT gcs_urn, size_bytes, mime_type, metadata, version_number, sha256
            FROM file_versions
            WHERE id = %s AND file_node_id = %s
        """, (version_id, node_id))
        source_v = cursor.fetchone()
        if not source_v:
            return False
        gcs_urn, size, mime, meta, v_origen, sha_origen = source_v

        new_v_num = current_v_num + 1

        # 4. Crear el nuevo registro de version.
        cursor.execute("""
            INSERT INTO file_versions (file_node_id, version_number, gcs_urn, size_bytes,
                                       mime_type, created_by, metadata, sha256, huella_en)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                    CASE WHEN %s IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
            RETURNING id
        """, (node_id, new_v_num, gcs_urn, size, mime, performed_by, meta, sha_origen, sha_origen))
        new_v_id = cursor.fetchone()[0]

        # 5. Si venia aprobado, queda dicho que esta promocion retiro la aprobacion.
        anterior = ecd.normalizar(estado_previo)
        if anterior != ecd.WIP:
            _registrar_vuelta_a_borrador(
                cursor, obra_real, node_id, nombre, anterior, new_v_num, performed_by,
                motivo=(f'se promociono la versión {v_origen} como {new_v_num}: '
                        f'lo aprobado fue otro contenido'))

        # 6. El item principal: contenido nuevo, y con el el estado y el sello caen.
        cursor.execute("""
            UPDATE file_nodes
            SET version_number = %s, gcs_urn = %s, size_bytes = %s, current_version_id = %s,
                updated_at = CURRENT_TIMESTAMP, updated_by = %s,
                status = %s, codigo_idoneidad = NULL, codigo_revision = NULL
            WHERE id = %s
        """, (new_v_num, gcs_urn, size, new_v_id, performed_by, ecd.WIP, node_id))

        conn.commit()
        return True
def update_node_description(model_urn, node_id, description):
    """
    Actualiza el campo descripción de un nodo (archivo o carpeta).
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE file_nodes SET description = %s WHERE id = %s AND model_urn = %s",
            (description, node_id, model_urn)
        )
        conn.commit()
    return True


def rename_node(model_urn, node_id, new_name):
    """
    Renombra un nodo (archivo o carpeta) por su ID.
    Valida que no exista otro nodo con el mismo nombre en el mismo padre.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Obtener datos actuales del nodo
        cursor.execute(
            "SELECT parent_id, node_type, name FROM file_nodes WHERE id = %s AND model_urn = %s AND is_deleted = FALSE",
            (node_id, model_urn)
        )
        node = cursor.fetchone()
        if not node:
            raise Exception(f"Nodo {node_id} no encontrado en proyecto {model_urn}")
        
        parent_id, node_type, old_name = node
        
        if old_name == new_name:
            return True  # No change needed
        
        # 2. Verificar que no exista conflicto de nombres en el mismo padre
        if parent_id:
            cursor.execute("""
                SELECT id FROM file_nodes 
                WHERE model_urn = %s AND parent_id = %s AND name = %s AND node_type = %s AND is_deleted = FALSE AND id != %s
            """, (model_urn, parent_id, new_name, node_type, node_id))
        else:
            cursor.execute("""
                SELECT id FROM file_nodes 
                WHERE model_urn = %s AND parent_id IS NULL AND name = %s AND node_type = %s AND is_deleted = FALSE AND id != %s
            """, (model_urn, new_name, node_type, node_id))
        
        if cursor.fetchone():
            raise Exception(f"Ya existe un elemento llamado '{new_name}' en esta ubicación")
        
        # 3. Actualizar el nombre
        cursor.execute(
            "UPDATE file_nodes SET name = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s AND model_urn = %s",
            (new_name, node_id, model_urn)
        )
        conn.commit()
    
    print(f"[RENAME] Node {node_id}: '{old_name}' → '{new_name}'")
    return True
