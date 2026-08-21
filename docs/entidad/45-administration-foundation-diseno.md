# DISEÑO DE IMPLEMENTACIÓN — ADMINISTRATION FOUNDATION

**21-ago-2026** · Aterriza [44-arquitectura-docs-rev02.md](44-arquitectura-docs-rev02.md)
sobre el repositorio real. **No se implementó nada.**

---

# A · ESTADO ACTUAL — el árbol real de autorización administrativa

```
users.role = 'admin'          ← UNA sola palabra
   │
   ├── atraviesa el PERÍMETRO DE OBRA        (perimetro_de_obra.py ×3)
   ├── atraviesa el PERMISO DOCUMENTAL       (permiso_documental.py, paso 0)
   ├── atraviesa la NAVEGACIÓN               (file_system_db.py, is_admin)
   ├── atraviesa la ENTREGA DE BYTES         (acceso_a_blobs.py, documents.py)
   ├── administra USUARIOS de la instancia   (auth.py: crear, borrar, rol)
   ├── administra OBRAS                      (projects.py: crear, archivar, restaurar)
   ├── administra el DIRECTORIO de cualquier obra   (directorio.py)
   ├── administra PERMISOS de cualquier obra        (documents.py folder-permissions)
   └── es POSICIÓN de workflow               (flujo_de_registro.ADMIN;
                                              reviews: rescate y actuación)
```

**Demostrado con sonda, no leído** — un `admin` que **no** es miembro de la
obra y **sin ninguna concesión** de carpeta:

```
LECTURA DOCUMENTAL                       ADMINISTRACIÓN DE LA OBRA
  200  /api/docs/list                      200  GET  …/participantes
  200  /api/docs/global-search             200  GET  …/miembros
  200  /api/docs/indice-expediente         200  POST …/participantes (cambió la
  200  /api/activity                            función contractual a ENTIDAD)
  (signed-url: autoriza; 500 es GCS)
                                         OBJETOS CONTRACTUALES
permiso_efectivo(admin, contrato)          200  POST /api/rfis
  = 'admin'                                     → EMITIÓ UN RFI EN OBRA AJENA
```

> **Hoy `admin` no es un rol: es una llave maestra.** Lee el expediente entero,
> reescribe el directorio y **emite objetos contractuales** en obras de las que
> no es miembro.

---

# B · INVENTARIO DE BYPASS — cada punto donde `admin` atraviesa una frontera

**56 usos** en backend (excluidos tests y herramientas). Los que **atraviesan
fronteras**:

| # | sitio | qué salta | frontera |
|---|---|---|---|
| B1 | `perimetro_de_obra.py:213` (`guardia_de_obra`) | `project_users` | **obra** |
| B2 | `perimetro_de_obra.py:266` (guardia de blob) | `project_users` | **obra** |
| B3 | `perimetro_de_obra.py:300` (`guardia_de_recurso`) | `project_users` | **obra** |
| B4 | `permiso_documental.py:178` (paso 0) | `folder_permissions` | **carpeta** |
| B5 | `folder_permissions.py:232` (impl retirada, aún llamable) | `folder_permissions` | **carpeta** |
| B6 | `file_system_db.py:60,150` (`is_admin` en listado) | permisos + filtro ISO de WIP | **carpeta** |
| B7 | `acceso_a_blobs.py:189` | pertenencia, con registro | **obra** |
| B8 | `routes/documents.py:307` (`_acceso_al_recurso`) | pertenencia (anota el acceso) | **obra** |
| B9 | `routes/documents.py:828,3038` (papelera, listado) | pertenencia/permiso | **obra** |
| B10 | `auth_middleware.py` (autorización central por proyecto) | `project_users` | **obra** |
| B11 | `routes/transmittals.py:400` (acusar por otro) | posición de flujo | **workflow** |
| B12 | `routes/reviews.py:403` — **hallazgo**: `puede_actuar … or role=='admin'` | **la identidad del revisor** | **workflow** |
| B13 | `routes/reviews.py:556` (sustituir revisor bloqueado) | — (es su función) | workflow |
| B14 | `bloqueo_de_edicion.py:92,138` (romper candado de edición) | candado ajeno | obra |
| B15 | `estados_ecd.py` / `politica.py` (transiciones que exigen autoridad) | — | workflow |

**El B12 merece subrayarse**: un admin puede **aprobar o rechazar el paso de una
revisión asignado a otra persona** — no solo sustituir al revisor bloqueado
(B13, que es el rescate legítimo y controlado). Es más autoridad de la que las
propias reglas de Reviews declaran, y contradice el patrón de RFI/Red Line,
donde el admin **no** puede dictar el veredicto.

Y en `frontend-docs`: `isAdmin = user.role === 'admin'` en 2 páginas, propagado
a **19 componentes**. La interfaz tiene **un solo interruptor** para las tres
figuras.

---

# C · CLASIFICACIÓN — qué responsabilidad ejerce cada uso

## `PLATFORM / SYSTEM` — opera la infraestructura desde la app

| uso | veredicto |
|---|---|
| `server.py` (rutas de esquema/diagnóstico) | legítimo global |
| `routes/audit.py` (verificación de cadena) | legítimo global |
| `routes/auth.py`: crear/borrar usuarios, **cambiar roles** | **ambiguo**: es de instancia, pero lo ejerce la entidad. Ver §D |

## `ENTITY / ACCOUNT` — el custodio del cliente

| uso | veredicto |
|---|---|
| `projects.py`: crear hub, **crear obra, archivar, restaurar, modificar** | legítimo de entidad |
| `auth.py`: invitar usuarios de la entidad | legítimo de entidad |
| Ver TODAS las obras (`projects.py:270`) | legítimo de entidad **mientras 1 instancia = 1 cliente** |

## `PROJECT` — administra UNA obra… pero hoy las administra todas

| uso | qué debería exigir |
|---|---|
| `directorio.py` (participantes, empresas, funciones) | **admin de ESA obra** |
| `documents.py` folder-permissions (conceder/quitar) | **admin de ESA obra** |
| `file_system_db` / `permiso_documental` (ver todo el árbol) | **admin de ESA obra** |
| Papelera, restaurar, purgar | **admin de ESA obra** |
| `bloqueo_de_edicion` (romper candado) | **admin de ESA obra** |
| B1–B10 en general | **membresía + admin de obra**, no llave global |

## `WORKFLOW ADMIN` — posición dentro de un flujo

| uso | veredicto |
|---|---|
| `flujo_de_registro.ADMIN` (pasar pelota, cerrar, adoptar) | correcto **como posición**; el significado de "admin" debe pasar a ser **de la obra** |
| Reviews: sustituir revisor **bloqueado** (B13) | correcto |
| **Reviews: actuar por el revisor (B12)** | **exceso** — no declarado en las reglas |
| Transmittals: acusar por otro (B11) | discutible pero declarado y anotado (`via: admin`) |

---

# D · MODELO OBJETIVO MÍNIMO

## Las cuatro opciones comparadas

| opción | qué es | veredicto |
|---|---|---|
| **1 · Conservar `users.role`** para una capa | `role='admin'` pasa a significar **solo** ENTITY ADMIN | **SÍ** — es la pieza que ya existe |
| **2 · Admin por proyecto en `project_users`** | una columna `es_admin BOOLEAN` en la membresía | **SÍ** — es la pieza que falta, y la más pequeña posible |
| **3 · ¿Entity Admin necesita relación nueva?** | tabla `entity_admins` o similar | **NO** mientras `1 instancia = 1 cliente`: sería una tabla con las mismas filas que `role='admin'` |
| **4 · ¿System Operator como rol de la app?** | un `role='operator'` | **NO** — ver §E: el operador real no entra por la aplicación |

## El modelo, en tres líneas

```
ENTITY ADMIN   = users.role = 'admin'        (lo que ya existe, re-significado)
PROJECT ADMIN  = project_users.es_admin      (columna nueva en la membresía)
SYSTEM OPERATOR = NO es un rol de la app     (es quien tiene credenciales; §E)
```

**Por qué `project_users.es_admin` y no una tabla:** la regla fundamental de §4
del encargo —*un Project Admin debe ser miembro*— queda **estructuralmente
garantizada**: no puede existir un admin de obra sin fila de membresía, porque
**es** la fila de membresía. Borrar la membresía borra la administración. Y no
toca función contractual, empresa, encargos ni históricos, porque no viven ahí.

**La decisión de política que esto exige** (y que hay que tomar, no esconder):

> **¿El Project Admin atraviesa los permisos de carpeta de SU obra?**

Propuesta **[N]**: **sí, dentro de su obra** — como el Project Admin de ACC
(«Manage en todas las carpetas») y el `Admin` de Documents de Procore. Es la
política explícita que pedía la prueba H3: el Project Admin ve los documentos de
su obra **porque la política administrativa lo define así**, no por accidente. Y
el **Entity Admin conserva el alcance global** mientras haya un solo cliente.

Con una excepción que mantener: **ninguno de los dos dicta veredictos** de
RFI/Red Line — eso ya es así y no cambia.

---

# E · SYSTEM OPERATOR — `APP AUTHORIZATION` ≠ `INFRASTRUCTURE PRIVILEGE`

**Separación honesta, sin resolver IAM ahora:**

| | quién lo frena |
|---|---|
| **APP AUTHORIZATION** — lo que este diseño toca | `users.role`, `project_users.es_admin`, guardias, flujos |
| **INFRASTRUCTURE PRIVILEGE** — lo que este diseño **NO** toca | Quien tenga credenciales de **PostgreSQL** lee y reescribe cualquier tabla sin pasar por Flask. Quien tenga **GCS** descarga cualquier blob. Quien tenga **Render** cambia el código que aplica las reglas. Quien tenga los **backups** tiene el expediente entero |

> **Ningún cambio en `users.role` aísla frente al operador de infraestructura,
> y este diseño no lo presenta como tal.** Lo que sí consigue: que el operador
> **no necesite** un usuario `admin` de la aplicación para operar — hoy lo
> tiene porque es la misma persona, no porque el trabajo lo exija. Quitárselo
> deja **rastro** (la cadena de auditoría ya detecta reescrituras y los accesos
> de admin ya se anotan) y deja **intención**: entrar por fuera es entrar por
> fuera, no «usar mi cuenta».

Lo único que este diseño exige del lado de infraestructura: **conservar la
separación `ecd_migrator`/`ecd_app` como objetivo** (hoy producción corre con
un solo usuario — deuda ya declarada y gritada en cada arranque).

---

# F · CAMBIOS CONCRETOS *(sin escribir código)*

## F1 · Esquema

| qué | detalle |
|---|---|
| `project_users` + columna | `es_admin BOOLEAN NOT NULL DEFAULT FALSE` |
| Manifiesto | +1 columna, +1 restricción NOT NULL |
| Migración de datos | **ninguna automática** — §G |

## F2 · Backend — una función nueva, no un framework

`perimetro_de_obra.py` (o módulo propio pequeño):

```
es_admin_de_obra(cur, usuario, obra) -> bool
    role == 'admin'  (ENTITY: alcance global mientras 1 instancia = 1 cliente)
    OR project_users.es_admin para (obra, usuario)
```

| fichero | cambio |
|---|---|
| `perimetro_de_obra.py` ×3 | `role=='admin'` → `es_admin_de_obra(…)` *(para ENTITY no cambia nada)* |
| `permiso_documental.py:178` | paso 0 → `es_admin_de_obra` de la obra del recurso |
| `file_system_db.py` | `is_admin` → por obra |
| `acceso_a_blobs.py:189`, `documents.py:307` | ídem (el acceso ya se anota; se conserva) |
| `routes/directorio.py` ×4 | «solo un administrador» → **de esta obra** |
| `documents.py` folder-permissions, papelera, bloqueo | ídem |
| `flujo_de_registro.es_admin` | recibe contexto de obra → `ADMIN` como posición pasa a significar **admin de esa obra** (los cuatro flujos cambian en un solo sitio, como se diseñó) |
| `routes/reviews.py:403` | **B12**: retirar el `or role=='admin'` de *actuar por el revisor* — el rescate (B13) se queda |
| `routes/projects.py`, `auth.py` | **sin cambios** — son ENTITY |

## F3 · `frontend-docs`

| dónde | cambio |
|---|---|
| Sesión/contexto | `isAdmin` (entity) + `esAdminDeObra` (por obra, del backend — p.ej. en `/api/projects/<id>/miembros` o el objeto obra) |
| `FilesPage` y 19 componentes | los usos de **administración de obra** (Participantes, permisos, papelera, config) → `esAdminDeObra`; los de instancia (Usuarios del sistema) → `isAdmin` |
| `ParticipantesModule` | columna/acción «administrador de la obra» (conceder/retirar `es_admin`) — **la única UI nueva** |

## F4 · UI de permisos por COMPANY / FUNCTION *(auditoría §6 del encargo)*

**Estado**: el backend resuelve los tres sujetos (probado 31/31); la pantalla de
permisos (`/api/docs/folder-permissions` + su panel) solo maneja personas.

**Coste**: bajo y **aditivo**. El POST acepta `sujeto_tipo`/`sujeto_id`; la
pantalla necesita un selector de tipo y, según el tipo, el selector ya
existente de miembros / empresas de la obra (`/participantes`) / las cinco
funciones.

**Dos ambigüedades reales a resolver en el diseño de la pantalla, no en el motor:**

1. **UX** — al listar «quién tiene acceso», una fila `COMPANY: CONSTRUCTORA`
   alcanza a personas **futuras** de esa empresa. La pantalla debe decirlo
   («y quien entre después»), o el administrador creerá que concedió a los
   presentes.
2. **Seguridad/percepción** — con `USER > COMPANY > FUNCTION`, conceder `none`
   a una empresa **no corta** a quien tenga una concesión USER más específica
   en el mismo nivel. Correcto por diseño, pero la pantalla debe mostrar el
   **permiso efectivo resultante** por persona (el motor ya lo calcula con
   `con_motivo=True`), o se creerán reservas que no existen.

## F5 · Member Tool Access — punto de inserción futuro *(NO implementar)*

**Dónde se insertaría**: en `auth_middleware.py`, junto a la autorización por
proyecto que ya existe (B10) — que ya resuelve la obra y el usuario por
petición. Mapa de prefijos → herramienta:

```
/api/docs/*, /api/pdf/*        → Documents
/api/reviews/*                 → Reviews
/api/rfis/*                    → RFI
/api/redlines/*                → Red Lines
/api/transmittals/*            → Transmittals   (READ = solo GET)
```

Una tabla `(project_id, user_id, tool, nivel)` **vacía = todo permitido** (el
comportamiento actual), consultada después de la membresía y antes del permiso
de recurso: exactamente `membership ↓ tool access ↓ resource permission`.

**Prueba de que será aditivo**: no toca `users`, ni `file_nodes`, ni
`folder_permissions`, ni `encargos`; los flujos no cambian (quien no llega a la
herramienta no llega a sus rutas); y el middleware ya intercepta por prefijo
para la obra, así que el punto de corte existe. Con la tabla vacía, ningún
comportamiento cambia — se puede desplegar apagado.

---

# G · MIGRACIÓN — sin inferir quién debe ser qué

**Datos reales**: 3 usuarios con `role='admin'` (el propietario, la
administradora municipal y una cuenta técnica).

1. `project_users.es_admin` nace **FALSE para todos**. **Nadie infiere** quién
   debe ser admin de qué obra: lo decide el Entity Admin desde Participantes.
2. Los tres `admin` actuales **siguen siendo Entity Admins** con el alcance de
   hoy. **Cero pérdida de acceso en el despliegue.**
3. La separación efectiva ocurre cuando el propietario **decida** rebajar
   cuentas a `editor` + `es_admin` en sus obras. Es un acto administrativo suyo,
   documentado, no una migración.
4. Los históricos no se tocan: `historial`, `cerrado_por`, acuses y encargos
   guardan texto/identidad de quien actuó, no su rol.

---

# H · PRUEBAS NECESARIAS

`ensayo_de_administracion.py`, contra PostgreSQL, con dos obras:

1. **Project Admin de A no administra B**: directorio 403, permisos 403,
   papelera 403, y `es_admin_de_obra(B) = false`.
2. **Sí administra su directorio**: participantes, empresa de un miembro,
   función contractual, conceder/quitar permisos de carpeta, `es_admin` de
   otros.
3. **Documentos**: con la política de §D, el Project Admin alcanza documentos
   **de su obra**; en B no descubre **ni que existen** (las 6 puertas). Y si la
   política se decidiera al revés, esta prueba es la que cambia — por eso existe.
4. **Miembro normal no administra**: 403 en todo lo administrativo de su propia
   obra.
5. **La función contractual no concede administración**: un ENTIDAD/SUPERVISION
   sin `es_admin` recibe 403 — función ≠ permiso ≠ administración.
6. **Nombrar/retirar un Project Admin no reescribe nada**: huellas byte a byte
   de Reviews/RFI/RedLine/Transmittals antes y después; encargos idempotentes.
7. **Workflows**: el Project Admin de A rescata una Review bloqueada de A y
   **no** una de B; **sigue sin poder dictar veredictos**; y B12 cerrado — no
   actúa por el revisor.
8. **Entity Admin**: conserva alcance global (mientras 1 instancia = 1 cliente).
9. **`frontend-docs`**: Participantes muestra la administración por obra; un
   miembro normal no ve los controles.
10. **Invariantes**: SHA-256, versiones, permisos existentes, 0 diferencias.

Más: suite completa y batería de ensayos existente (los guardianes de
`ensayo_del_expediente` y `ensayo_de_acceso_documental` deben seguir en verde
sin tocarlos — si alguno cambia, es una regresión de contrato, no una prueba
desactualizada).

---

# I · DECISIÓN FINAL

> ### ¿Cuál es el cambio mínimo ANTES DEL PILOTO EXTERNO?
>
> **Una columna, una función y un hallazgo cerrado:**
> `project_users.es_admin` + `es_admin_de_obra()` aplicada en los puntos B1–B10
> y en la posición `ADMIN` de los flujos, **más el cierre de B12** (un admin no
> actúa por el revisor). `users.role='admin'` pasa a significar **Entity Admin**
> sin cambiar ninguna fila.

| cambio | clasificación |
|---|---|
| `project_users.es_admin` + `es_admin_de_obra()` (F1–F2) | **MUST AHORA** *(antes del piloto)* |
| Cierre de **B12** — admin no actúa por el revisor | **MUST AHORA** — es un exceso no declarado, y tocarlo luego reescribiría historia operativa |
| `frontend-docs`: `esAdminDeObra` + UI de nombrar admin de obra (F3) | **MUST AHORA** — sin UI, la columna es letra muerta |
| Ensayo de administración (H) | **MUST AHORA** |
| UI de permisos por COMPANY/FUNCTION (F4) | **SHOULD** — motor probado; la pantalla con las dos ambigüedades resueltas |
| Mostrar «permiso efectivo por persona» en esa pantalla | **SHOULD** — es lo que evita las falsas reservas |
| Member Tool Access (F5) | **DEFER** — disparador: primer participante externo de acceso limitado. Punto de inserción documentado y demostrado aditivo |
| Entity Admin como relación propia | **DEFER** — disparador: segundo cliente en la instancia |
| System Operator como rol de la app | **NO** — es privilegio de infraestructura, no autorización de aplicación (§E) |
| Permission Profiles / Templates / Account Membership / Tool Activation | **DEFER** — disparadores ya escritos en REV.02 |

---

**STOP. No se implementó nada.** No se tocó Account Membership, Account Roles,
Permission Profiles, Project Templates, Tool Activation, Member Tool Access,
SSO/SCIM, grupos, `frontend-react` ni 3D/4D/LOB. `admin` sigue como estaba.
