# Permisos por Carpeta Estilo ACC — Plan de Implementación

## Objetivo
Replicar el sistema de permisos granulares de Autodesk Construction Cloud donde cada carpeta tiene su propia lista de usuarios con niveles de acceso diferenciados, incluyendo el panel visual de configuración.

## Estado Actual vs Objetivo

| Característica | Hoy | Objetivo |
|---|---|---|
| Nivel de control | Rol global por usuario | Permisos por carpeta |
| UI de configuración | No existe | Menú contextual → Panel lateral |
| Herencia | No aplica | Hijo hereda permisos del padre |
| Niveles | 3 (viewer/editor/admin) | 6 (igual que ACC) |

## Niveles de Permiso ACC a Implementar

| Nivel | Código | Capacidades |
|---|---|---|
| Ver | `view_only` | Ver listado de archivos |
| Ver + Descargar | `view_download` | Ver + descargar archivos |
| Crear | `create` | + publicar marcas de revisión + cargar |
| Crear + Cargar | `create_upload` | + subir archivos nuevos |
| Editar | `edit` | + renombrar, mover, cambiar estados |
| Administrar | `admin` | Control total incluida eliminación |

---

## Propuestas de Cambios

### Componente 1: Base de Datos (PostgreSQL)

#### [NEW] Tabla `folder_permissions`

```sql
CREATE TABLE IF NOT EXISTS folder_permissions (
    id SERIAL PRIMARY KEY,
    folder_node_id INTEGER NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_level VARCHAR(20) NOT NULL DEFAULT 'view_only',
    granted_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(folder_node_id, user_id)
);

CREATE INDEX idx_folder_perm_folder ON folder_permissions(folder_node_id);
CREATE INDEX idx_folder_perm_user ON folder_permissions(user_id);
```

> [!IMPORTANT]
> La restricción `UNIQUE(folder_node_id, user_id)` garantiza que un usuario no pueda tener dos niveles de permiso distintos en la misma carpeta. Cualquier actualización usa `ON CONFLICT DO UPDATE`.

---

### Componente 2: Backend — Lógica de Permisos

#### [NEW] `backend/folder_permissions.py`

Archivo nuevo (~120 líneas) con 3 funciones:

**`get_effective_permission(user_id, node_id, model_urn)`**
- Busca permiso directo en `folder_permissions` para el `node_id`.
- Si no existe, camina hacia arriba por el árbol (`parent_id`) buscando en cada padre.
- Si no encuentra nada en ningún nivel, retorna el rol global de la tabla `users` como fallback.
- Resultado: el nivel más específico que aplique.

**`set_folder_permission(folder_node_id, user_id, level, granted_by)`**
- INSERT o UPDATE (usando `ON CONFLICT`) en `folder_permissions`.
- Valida que `level` sea uno de los 6 niveles válidos.
- Solo un `admin` de esa carpeta puede otorgar permisos.

**`list_folder_permissions(folder_node_id)`**
- Lista todos los usuarios con permisos explícitos en esa carpeta.
- JOIN con `users` para retornar nombre, email, nivel, y quién lo otorgó.

---

#### [MODIFY] [documents.py](file:///d:/VISOR_APS_TL/backend/routes/documents.py)

**Cambios en los endpoints existentes:**

Actualmente cada endpoint tiene:
```python
# Paso 1: verify_project_access (Tenant Isolation)
# Paso 2: check_role (RBAC global)
```

Se reemplazará el Paso 2 con:
```python
# Paso 2: check_folder_permission(user, node_id, 'edit')
# → Esto consulta folder_permissions con herencia
# → Si no hay permisos por carpeta, cae al RBAC global como fallback
```

**Endpoints afectados:**
- `create_folder` → requiere nivel `create_upload` en el **padre**
- `upload_document` → requiere nivel `create_upload` en la carpeta destino
- `upload-url` / `upload-confirm` → requiere nivel `create_upload`
- `rename_document` → requiere nivel `edit`
- `move_document` → requiere nivel `edit` en origen Y `create_upload` en destino
- `delete_document` → requiere nivel `admin`
- `batch_update` (SET_STATUS a PUBLISHED) → requiere nivel `admin`
- `list_documents` → requiere nivel `view_only` (mínimo)
- `search_documents` → requiere nivel `view_only`

**2 Endpoints nuevos** (al final del archivo):

```python
@documents_bp.route('/api/docs/folder-permissions', methods=['GET'])
def get_folder_permissions():
    """Lista los permisos de una carpeta específica."""
    # Requiere: admin en esa carpeta
    
@documents_bp.route('/api/docs/folder-permissions', methods=['POST'])  
def set_folder_permission():
    """Añade o modifica un permiso de usuario en una carpeta."""
    # Body: { folder_id, user_email, permission_level, model_urn }
    # Requiere: admin en esa carpeta

@documents_bp.route('/api/docs/folder-permissions/<int:perm_id>', methods=['DELETE'])
def remove_folder_permission(perm_id):
    """Elimina un permiso específico."""
    # Requiere: admin en esa carpeta
```

---

### Componente 3: Frontend — Menú Contextual

#### [MODIFY] [App.jsx](file:///d:/VISOR_APS_TL/frontend-docs/src/App.jsx) — Líneas 2637-2669

**Agregar opción "Configuración de permisos"** al menú contextual existente.

Actualmente el menú tiene (líneas 2637-2668):
- Añadir subcarpeta (solo carpetas)
- Cambiar nombre
- Compartir
- Desplazar
- ─── separador ───
- Suprimir

**Después del cambio:**
- Añadir subcarpeta (solo carpetas)
- Cambiar nombre
- Compartir
- Desplazar
- **Configuración de permisos** ← NUEVO (solo carpetas, solo admin)
- ─── separador ───
- Suprimir

Al hacer clic, abre un panel lateral (`showPermissionsPanel = true`, `permissionsFolderId = folder.id`).

---

### Componente 4: Frontend — Panel Lateral de Permisos

#### [NEW] `frontend-docs/src/components/FolderPermissionsPanel.jsx`

Componente nuevo (~200 líneas) que replica la UI de ACC:

**Sección Header:**
- Título: "Permisos · 📁 {nombre_carpeta}"
- Contadores: usuarios individuales, grupos, empresas
- Botón "× Cerrar"

**Sección Toolbar:**
- Botón "+ Añadir" (azul, abre modal)
- Botón "Exportar"
- Campo de búsqueda "Buscar nombre o correo elect."

**Sección Tabla:**
| Columna | Contenido |
|---|---|
| Nombre | Icono de usuario + nombre completo |
| Permisos | Badge visual con barras de nivel (como ACC) |
| Tipo | Individual o Grupo |

**Props:** `folderId`, `folderName`, `modelUrn`, `onClose`

**Llamadas API:** 
- `GET /api/docs/folder-permissions?folder_id=X` al montar
- `DELETE /api/docs/folder-permissions/{id}` al eliminar

---

### Componente 5: Frontend — Modal "Añadir"

#### [NEW] `frontend-docs/src/components/AddPermissionModal.jsx`

Componente nuevo (~130 líneas) que replica el formulario de ACC:

**Campos:**
- **Añadir**: Input de texto con autocompletado de usuarios (busca en `/api/auth/users`)
- **Permisos**: Dropdown con los 6 niveles, cada uno mostrando:
  - Barras visuales de nivel (como ACC)
  - Nombre del nivel
  - Descripción de capacidades

**Botones:** "Cancelar" | "Añadir"

**Al confirmar:** `POST /api/docs/folder-permissions` con `{ folder_id, user_email, permission_level }`

---

### Componente 6: CSS

#### [MODIFY] [index.css](file:///d:/VISOR_APS_TL/frontend-docs/src/index.css)

Agregar estilos para:
- `.permissions-panel` — Panel lateral derecho (ancho 380px, slide-in animation)
- `.perm-badge` — Barras visuales de nivel de permiso (4 barras como ACC)
- `.perm-level-dropdown` — Estilos del dropdown selector de niveles
- `.add-permission-modal` — Modal de añadir usuario

---

## Orden de Ejecución

| Fase | Tarea | Archivos |
|---|---|---|
| 1 | Crear tabla SQL `folder_permissions` | PostgreSQL |
| 2 | Crear `backend/folder_permissions.py` | Nuevo |
| 3 | Agregar 3 endpoints a `documents.py` | Modificar |
| 4 | Refactorizar `check_role` → `check_folder_permission` en endpoints | Modificar |
| 5 | Crear `FolderPermissionsPanel.jsx` | Nuevo |
| 6 | Crear `AddPermissionModal.jsx` | Nuevo |
| 7 | Agregar opción al menú contextual en `App.jsx` | Modificar |
| 8 | Agregar estilos CSS en `index.css` | Modificar |

---

## Open Questions

> [!WARNING]
> **¿Herencia estricta o flexible?** En ACC, las carpetas hijas heredan los permisos del padre automáticamente. Si alguien tiene `admin` en `01-Sector 01`, automáticamente tiene `admin` en todas las subcarpetas. ¿Queremos permitir que una subcarpeta *restrinja* más que su padre? (ACC no lo permite, pero algunos sistemas sí).

> [!IMPORTANT]
> **¿Migrar el RBAC global?** El sistema actual de `check_role` (viewer/editor/admin global) funciona bien. ¿Lo eliminamos y reemplazamos 100% con permisos por carpeta? ¿O lo dejamos como fallback para cuando una carpeta no tenga permisos explícitos configurados?

## Verificación

### Test Manual
1. Click derecho en carpeta → aparece "Configuración de permisos"
2. Se abre panel lateral con lista vacía
3. Click "Añadir" → Modal con campo de email + dropdown
4. Seleccionar usuario + nivel "Ver" → Guardar
5. Ese usuario intenta subir un archivo → Error 403
6. Cambiar su nivel a "Editar" → Puede subir
7. Verificar que subcarpetas heredan el permiso del padre
