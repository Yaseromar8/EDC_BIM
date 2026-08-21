# CIERRE DE FOUNDATION DE ACCESO — `frontend-docs`

**21-ago-2026** · Cierra el hallazgo de RESOURCE de la
[auditoría de acceso](40-modelo-de-acceso-objetivo-frontend-docs.md).

---

# 0 · Comprobación previa: ¿rompe algo histórico?

Antes de implementar, se calculó el permiso efectivo de **cada usuario activo ×
cada carpeta real** con la regla actual y con la propuesta:

```
Concesiones en toda la instancia : 1  (y apunta a una carpeta que YA NO EXISTE)
Pares comparados                 : 17 usuarios × 6 carpetas = 102
IGUALES 102      CAMBIAN 0      no resolubles 0
```

> **Ningún acceso real cambia.** No hay flujo histórico que la nueva semántica
> rompa, porque hoy el acceso lo decide el perfil global en el 100 % de los
> casos. **Sin bloqueo: se implementa.**

---

# 1 · `folder_permissions` con sujetos

| | |
|---|---|
| **Columnas** | `sujeto_tipo` (`USER` / `COMPANY` / `CONTRACTUAL_FUNCTION`) y `sujeto_id`, ambas **NOT NULL** |
| **Clave del sujeto** | `users.id` · `companies.id` · el código de `FUNCIONES`, que es una **lista cerrada con CHECK** en `project_companies`. **Ningún nombre** |
| **Unicidad** | `UNIQUE (folder_node_id, sujeto_tipo, sujeto_id)` |
| **Concesiones actuales** | Marcadas `USER` con su propio `user_id`. **No se reinterpretan**: nadie decide que una concesión a una persona «en realidad» iba a su empresa |
| **`user_id`** | Deja de ser obligatorio —una regla de empresa no tiene usuario— pero se conserva con su clave ajena, y las reglas `USER` la siguen usando |

### Y una regla sin sujeto **revienta**, no se ignora

`sujeto_id NOT NULL` no es cosmética: un `INSERT` al estilo antiguo crearía una
concesión que **el resolutor no encuentra jamás**, y quien la creó creería haber
dado acceso. Con la restricción falla al escribirla.

**Cazó tres de mis propios `INSERT`** en los ensayos durante esta sesión. Sin
ella, habría dejado pruebas que se engañan solas.

---

# 2 · Semántica: `CLOSEST-WINS` con precedencia de sujeto

> Se sube desde la carpeta del recurso. **El primer nivel con alguna regla
> aplicable decide.** Dentro de ese nivel: **`USER` > `COMPANY` >
> `CONTRACTUAL_FUNCTION`**. `none` **niega**. El perfil global es el **valor por
> defecto** cuando no hay ninguna regla en toda la cadena — **ya no un suelo**.

Vive en **`permiso_documental.py`**, y el orden de `PRECEDENCIA` **es** la
precedencia: no hay una segunda lista en otro sitio que pueda contradecirla.

### Dos piezas del modelo antiguo que había que retirar, y por qué

1. **`_get_effective_permission_impl` tenía su propia resolución** (máximo
   aditivo + suelo). Ahora **delega**. La anterior se conserva sin llamar, como
   referencia de lo que hacía el producto.
2. **`set_folder_permission` rechazaba conceder menos que lo heredado**
   —«Inherited permissions must expand»—. Era la cara de **escritura** del
   modelo aditivo. Mantenerla habría dejado el modelo nuevo **sin la única
   acción que lo justifica**: reservar una carpeta se dice poniendo `none` a
   quien tiene `edit` más arriba.

---

# 3 · Un único Resource Guard

```python
permiso_documental.guardia(cur, usuario, obra, accion, minimo,
                           node_id=…, version_id=…, gcs_urn=…)
    -> None (permitido)  |  (cuerpo, 403)
```

**Los tres identificadores se resuelven al mismo recurso canónico** —el
`file_node`— y sobre él se aplica la misma decisión. **`gcs_urn` es
almacenamiento, no autoridad.** Una versión histórica se resuelve por
`file_versions`; **no se reescribió ninguna ruta del bucket**.

Si el objeto **no** es un documento del árbol —una foto de campo, un adjunto de
punto de control— devuelve `None` y decide quien ya decidía. Para esos objetos
es lo correcto: no están en el árbol de carpetas.

### Rutas auditadas y su estado

| ruta | antes | ahora |
|---|---|---|
| `/api/docs/view` | pertenencia a la obra | **guardia documental** |
| `/api/docs/signed-url` | pertenencia | **guardia** (+ `version_id` explícito) |
| `/api/docs/proxy` | pertenencia | **guardia** |
| `/api/docs/asset-tokens` | pertenencia | **guardia** (usa `_acceso_al_recurso`) |
| `/api/docs/media` | **ninguna** | **guardia** — revelaba nombre, descripción y metadata |
| `/api/docs/indice-expediente` | solo pertenencia | **filtrado fila a fila** |
| `/api/docs/list` (navegación) | filtraba **solo carpetas** | **carpetas y ficheros** |
| Búsqueda global | regla propia | **la misma** |
| `/api/docs/versions`, `download_folder_urls` | `check_folder_permission` | igual, y ahora resuelve con la regla nueva |
| Sharing | `edit` + sensibilidad ISO 19650-5 | **sin cambios** |
| Reviews · RFI · Red Line | sus umbrales | **sin cambios** |
| `/api/docs/shared/<id>` | público por diseño | **sin cambios** — el enlace *es* la autoridad, y emitirlo exige `edit` |

### Dos defectos que aparecieron al auditar

- **`/api/docs/media` no tenía ninguna puerta de carpeta.**
- **La navegación filtraba subcarpetas pero NO ficheros**: todo documento de una
  carpeta visible salía listado con `has_access = True`. El listado prometía lo
  que las otras cinco puertas negaban.

Y el guardia es **fail-closed**: si no se puede decidir, no se entrega (503).

---

# 4 · Reglas ACTION — sin cambios

Sharing sigue exigiendo `edit`. Reviews, RFI y Red Line conservan sus umbrales y
su gobierno. Lo único que cambió es **de dónde sacan la verdad documental**
cuando tocan un archivo: ahora todos preguntan lo mismo.

---

# 5 · Transmittals — identidad estricta

Al **emitir**, cada destinatario con correo conocido recibe su `user_id`. Si no
es usuario del sistema, se guarda tal cual: **no se inventa un id**.

`_es_destinatario` usa **identidad estricta cuando la hay**, y el respaldo por
texto **sólo** para emisiones legacy. **Los históricos no se convierten.**

```
EMISIÓN NUEVA (con user_id)
  la destinataria real (id 10)       -> True
  su homónima (id 77, MISMO nombre)  -> False     ← antes: True
  alguien con su correo, sin id      -> False
EMISIÓN LEGACY (sin user_id) — el respaldo por texto se conserva
  por correo -> True     por nombre -> True
```

---

# 6 · Pruebas

**`ensayo_de_acceso_documental.py` — 31 / 31.** Lo que demuestra:

| | |
|---|---|
| **Las seis puertas** | `navegación == búsqueda == preview == descarga == signed-url == proxy` para el mismo principal y el mismo recurso, en los cuatro casos probados |
| **`none` niega** | El `edit` de la raíz llega a DRENAJE; el `none` de DIRECCIÓN **lo corta** |
| **`COMPANY`** | El auxiliar accede **por su empresa**, no por su persona — y las seis puertas se lo conceden |
| **`CONTRACTUAL_FUNCTION`** | El supervisor accede **por su función**; el auxiliar no |
| **Precedencia** | Con sólo FUNCTION toma esa; al añadir COMPANY, COMPANY gana; al añadir USER, USER gana **aunque diga `none`** — y las seis puertas le niegan el mismo documento |
| **Global como defecto** | Un `editor` con regla `viewer` **se queda en `viewer`** |
| **Identificadores** | `node_id` → **403** · `version_id` → **403** · `gcs_urn` legacy → **403 antes de tocar GCS**, con `SIN_PERMISO_DOCUMENTAL` |
| **Versiones históricas** | La v1 de un documento permitido se entrega; **ninguna** del reservado. **6 versiones y sus SHA-256 intactos** |
| **Dos obras** | Decir que un documento de B es de A **no lo convierte en suyo**: decide el dueño real |
| **Exportación** | El índice **no lista** el reservado a quien no lo ve; la administradora sí |
| **Sharing** | El auxiliar con `view_download` **no puede compartir**: sigue exigiendo `edit` |

*La navegación se mide por `/api/docs/list`, la ruta real — no por el resolutor.
Medir el resolutor habría sido medir mi propia función; la primera versión de
esta prueba lo hacía, y por eso no vio que el listado mostraba lo que las demás
puertas negaban.*

## Batería completa

| | |
|---|---|
| **Suite** | **881 pasan · 0 fallan** |
| **Acceso documental** *(nuevo)* | **31 / 31** |
| Expediente completo | **86 / 86** |
| Búsqueda · Participantes · Red Line | **23/23** · **33/33** · **58/58** |
| Desacople · RFI · Revisiones · Encargos · Dos obras | **22/22** · **49/49** · **50/50** · **31/31** · **16/16** |
| **Invariantes vs. cierre V1** | **0 diferencias** |
| Build `frontend-docs` | correcto |
| **Instancia virgen** | **95 tablas · 871 columnas · 509 restricciones · 183 índices — completa** |

**Manifiesto regenerado**: +2 columnas, +1 CHECK, +2 índices, y
`not null user_id` → `not null sujeto_id` + `not null sujeto_tipo`.

### Dos ensayos afirmaban la limitación que esto elimina

`ensayo_del_expediente` comprobaba que *«un `none` no corta la herencia a un
editor»* y que *«el rol global es un suelo»*. **Ahora comprueban lo contrario**,
a propósito: si alguien volviera al modelo aditivo, saltarían.

---

# 7 · Lo que NO se construyó

Account Membership · Account Roles · Tool Activation · Tool Access · Permission
Templates · ningún framework de autorización · ninguna tabla nueva ·
`frontend-react` · 3D/4D/LOB.

**2 columnas · 1 módulo de 240 líneas · 7 rutas conectadas a la misma decisión ·
2 reglas del modelo antiguo retiradas.**

---

# 8 · Deuda declarada

1. **`encargos._acuso` compara al que acusó por correo o por NOMBRE.** Es la
   misma clase de defecto que se acaba de cerrar en `_es_destinatario`, pero en
   la **proyección** (Mi Trabajo), no en el acto contractual. Fuera del alcance
   pedido; conviene cerrarlo cuando se toque `encargos`.
2. **La navegación resuelve el permiso por hijo.** Con carpetas de cientos de
   ficheros son cientos de resoluciones. No se midió bajo carga real: si duele,
   la consulta de la búsqueda ya demuestra cómo hacerlo en una sola pasada.
3. **No hay interfaz para conceder por `COMPANY` o `FUNCTION`.** El modelo lo
   soporta y el backend lo aplica; la pantalla de permisos sigue siendo por
   persona. Es aditivo y no bloquea.
4. **La fila huérfana de `pdf_markups`** (`file_node_id = 123`) sigue bloqueando
   esa migración en la base local. En instancia virgen el tipo ya es `uuid`.

---

# VEREDICTO

## `FRONTEND-DOCS LISTO PARA CONGELAR`

La frontera fundamental está cerrada: **el permiso de carpeta ya no gobierna
sólo el descubrimiento.** Las seis puertas responden lo mismo para el mismo
principal y el mismo recurso, y **conocer un `node_id`, un `version_id` o un
`gcs_urn` no aumenta el acceso**.

Sin flujo histórico roto —comprobado sobre los 102 pares reales antes de tocar
nada—, sin versiones ni huellas alteradas, y con el expediente completo pasando
86/86.

---

**STOP.** No se tocó `frontend-react`, 3D, 4D ni LOB.
