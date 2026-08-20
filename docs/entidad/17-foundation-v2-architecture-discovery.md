# FOUNDATION V2 — ARCHITECTURE DISCOVERY REPORT

**20-ago-2026** · Sobre el commit candidato `01b51c7`
**Nada de esto se ha implementado.** Es diagnóstico.

> ⚠ **DOS CORRECCIONES.** Ver [18 — Cierre de seis puntos](18-cierre-de-seis-puntos-foundation-v2.md).
> 1. **§1 es inexacto.** `resolve_project_id()` **sí** traduce `proyectos/PQT8_TALARA` → `1`, y hay
>    4 filas de membresía para `'1'`. No serían 403 los 14 usuarios. El problema real es otro:
>    `dataset_id` y `global` **no resuelven**, y bajo ENFORCE el guardián es fail-closed → 403 en
>    todo `/api/lob`. Y solo 5 de 14 no administradores tienen membresía alguna.
> 2. **§14 es inexacto.** Las cinco rutas de IA **sí** tienen guardia (`routes/ai.py:293, 354, 526,
>    674, 841`) y `guardia_del_documento` es fail-closed. B4 sigue necesitando cambios, pero otros.
>
> Además: son **siete** vocabularios de alcance, no cuatro; y el diseño `project_alias(alias TEXT
> PRIMARY KEY)` de §17 **queda retirado** — colisiona (ver 18 §3).

---

## 1 · Executive conclusion

### ¿Debemos implementar Foundation v2 antes del primer cliente? → **PARCIAL**

Y no por las razones de la hipótesis. **La capa `Account` no es lo urgente.** Ya
existe algo equivalente (`hubs`) y añadirla después es barato.

Lo urgente es una sola cosa, y no está en la lista de la hipótesis:

> **`model_urn` no es un identificador. Es una cadena de alcance en la que hoy
> conviven cuatro vocabularios distintos, y los documentos reales del expediente
> están anclados a un valor que no corresponde a ninguna obra registrada.**

Evidencia, consultada contra la base:

| `model_urn` observado | qué es | ¿existe en `projects`? |
|---|---|---|
| `proyectos/PQT8_TALARA` | ruta-slug. Lo usan `file_nodes`, `doc_rfis`, `doc_redlines`, `transmittals` | **NO** |
| `p_talara_pruebas` | `projects.id` de la obra de pruebas | sí |
| `b.proj_pqt8_interferencias_4852` | `projects.id` estilo ACC. Lo usa `project_users` | sí |
| `1_DRENAJE`, `1_INFRAWORKS`, `global` | urn de modelo / frente / sin obra. Lo usa `tracking_pins` | no aplica |

**Consecuencia medida:** `_user_in_project()` (`auth_middleware.py:380`) busca
`project_users.project_id = <model_urn>`. Para `proyectos/PQT8_TALARA` **no hay
ninguna fila**. Con `ENFORCE_PROJECT_AUTHZ=true`, los **14 usuarios no
administradores** de esa base recibirían **403 sobre el expediente real**.

Eso explica, sin necesidad de suponer, por qué `ENFORCE` sigue apagado en
producción. No fue un olvido: encenderlo hoy rompe el acceso.

**Por qué es irreversible y lo demás no:** ese identificador está en **36 tablas**
y, además, **incrustado en la ruta física de cada objeto del bucket**
(`multi-tenant/{model_urn}/{ts}_{uuid8}_{fichero}`, `routes/documents.py:1019`).
Cada entidad y cada documento que entre multiplica el coste de arreglarlo. Todo
lo demás de la hipótesis —Account, Tools, Templates, Graph, Placement— se puede
añadir después **sin tocar un solo byte histórico**.

**Recomendación: opción B.** Ver §26.

---

## 2 · Current architecture

```
                         NAVEGADOR
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
   frontend-docs (portal)              frontend-react (visor 3D)
        │  VITE_BACKEND_URL                       │
        └────────────────────┬────────────────────┘
                             ▼
                    Flask  (server.py)
                             │
      ┌──────────────────────┼──────────────────────┐
      │                      │                      │
 before_request        blueprints (27)      @app.route (~23)
 ├─ perfil recorta     routes/*.py          declaradas sobre la app;
 │  el perimetro                            se registran SIEMPRE salvo
 ├─ sesion                                  `_ruta_del_visor`
 └─ authz por obra
      │
      ▼
  DEPLOY_PROFILE = portal (151 rutas) | completo (258 rutas)
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
   PostgreSQL                              Google Cloud Storage
   91 tablas · 6 claves ajenas             multi-tenant/{model_urn}/...
```

### Cómo se autoriza, hoy

`auth_middleware.py`, un `before_request` que corre antes de enrutar:

1. Resuelve la sesión (token con pimienta; la base no guarda tokens usables).
2. **Si el rol NO es `admin`** (`auth_middleware.py:813`), deduce la obra con
   `_request_project_id()` — cuatro fuentes: query, `view_args`, cuerpo JSON y
   multipart (`auth_middleware.py:437`) — y comprueba pertenencia.
3. **Si el rol es `admin`, se salta el bloque entero.** Un administrador ve todas
   las obras de su instancia. Verificado: administrador → otra obra 200; no
   administrador → **403**.

### Cómo se aísla

| capa | mecanismo | naturaleza |
|---|---|---|
| entre entidades | **instancia dedicada**: base, bucket y servicio propios | física |
| perímetro de producto | `DEPLOY_PROFILE` | física (rutas que no existen) |
| entre obras | `ENFORCE_PROJECT_AUTHZ` + `project_users` | **lógica, y por cadena de texto** |
| carpetas | `folder_permissions` | lógica |
| estados | `CHECK` en `file_nodes` | **base de datos** |

---

## 3 · Current domain model

### Lo que hay (medido)

- **91 tablas** · **86 PK** · 26 UNIQUE · **6 claves ajenas** · 2 CHECK
- **36** tablas con `model_urn` · **24** con `project_id` · **1** con `hub_id` ·
  **0** con `account_id`
- **42** tablas sin ninguna columna de frontera de obra

### Las seis únicas claves ajenas del esquema

```
file_nodes         → file_nodes(id)        carpeta dentro de carpeta
file_versions      → file_nodes(id)        versión de un documento
document_shares    → file_nodes(id)        enlace compartido
doc_set_items      → doc_sets(id)          elemento de un conjunto
custom_attr_values → custom_attr_defs(id)  valor de un atributo
totp_recuperacion  → users(id)             códigos de recuperación
```

**`projects` no es referenciada por nadie. `hubs` tampoco.**

Y hay una divergencia entre lo declarado y lo real: `ensure_users_tables()`
(`routes/auth.py`) declara `project_users.project_id TEXT REFERENCES projects(id)
ON DELETE CASCADE`, pero en la base —**incluso en una instancia recién
construida**, según el manifiesto congelado— esa tabla solo tiene
`PRIMARY KEY (project_id, user_id)`. **La clave ajena nunca llega a existir.**

### Los dominios reales

| dominio | tablas | frontera |
|---|---|---|
| Identidad | `users`, `sessions`, `companies`, `job_titles`, `auth_events`, `otp_codes`, `totp_recuperacion`, `app_tokens`, `handoff_tickets` | **global** |
| Cuenta (proto) | `hubs`, `projects.hub_id` | `hubs.id` |
| Obra | `projects`, `project_users`, `project_frentes` | `projects.id` |
| Documental | `file_nodes`, `file_versions`, `document_shares`, `doc_sets`, `folder_permissions`, `emisiones` | `model_urn` + FK |
| Flujo | `doc_reviews`, `doc_rfis`, `doc_redlines`, `transmittals`, `plan_entregas` | `model_urn` |
| Configuración por obra | `nomenclatura_config`, `idoneidad_catalogo`, `sensibilidad_catalogo`, `project_settings` | `model_urn` |
| Campo | `tracking_pins`, `photo_evidences`, `geo_control_points`, `daily_reports` | mixta |
| Visor / 4D | `inventory_assets`, `lob_*` (24 tablas), `civil_*` | `model_urn`/`scope_urn`/`dataset_id` |
| IA | `ai_brain.*`, `ia_documentos_preparados` | **gcs_urn** |
| Auditoría | `activity_log` | `model_urn` |

---

## 4 · Target domain model

Después de inspeccionar, **la hipótesis es correcta en la forma y equivocada en
la prioridad**. El objetivo:

```
IDENTITY (global)          users, sessions, credenciales
    │
    └── ACCOUNT            hoy: hubs.  Renombrar y tipar. NO urgente.
          │                type = PERSONAL | ORGANIZATION
          │
          └── PROJECT      projects.id  ← LA FRONTERA QUE HAY QUE ARREGLAR
                │
                ├── PROJECT CONFIGURATION   ya existe (nomenclatura, idoneidad,
                │                            sensibilidad, project_settings)
                ├── TOOL ACTIVATION          no existe
                └── PROJECT RECORDS          documentos, RFIs, emisiones…
                        │
                        └── CONTENT          bytes + SHA-256, ya separado
```

### Dónde la hipótesis se equivoca, y hay que rechazarla

**Rechazo 1 — «Account primero».** `hubs` ya cumple ese papel: tiene `id`,
`name`, `region`, `logo_url`, `is_active`, y `projects.hub_id` cuelga de él.
Convertirlo en `Account` con `type` es un `ALTER TABLE` y un renombrado. **Lo que
no se arregla con un ALTER es el identificador de obra.** Poner el Account antes
que eso es construir el segundo piso sobre unos cimientos que ya sabemos torcidos.

**Rechazo 2 — «Project Object Graph» ahora.** No aporta hoy. Las relaciones
tipadas que existen (`lob_element_links` 31.894 filas, `doc_set_items`,
`element_docs`) funcionan y no hay ningún consumidor que necesite recorrer un
grafo genérico. Un registro `PROJECT_RELATION` sin consumidor es complejidad con
coste de mantenimiento y cero beneficio medible. **DEFER**, y cuando llegue,
introducirlo **junto a** las tablas tipadas, no en su lugar.

**Rechazo 3 — «Control Plane» ahora.** Con una a cinco entidades, el plano de
control **es la guía de despliegue más una hoja de cálculo**. Construir un plano
de control antes de tener clientes es diseñar para un problema que no se ha
tenido. **DEFER.**

**Rechazo 4 — microservicios.** El acoplamiento medido entre módulos es
**mínimo**: solo 3 ficheros de `routes/` importan otro de `routes/`. Un monolito
modular es la respuesta correcta y ya está casi ahí. **REJECT.**

**Rechazo 5 — diseñar `Location` desde cero.** Ya existe, y para obra lineal:
`lob_linear_zones` (`station_start`, `station_end`, `zone_type`, `parent_code`),
`lob_locations` (`alignment_id`, progresivas), `project_frentes`. Es **mejor** de
lo que saldría de una plantilla edificio→piso→habitación. Lo que falta es
**promoverlo** de módulo LOB a concepto de proyecto. **REFACTOR, no REPLACE.**

---

## 5 · Account model

**Existe ya, se llama `hubs`, y tiene datos**: `b.mdc_default_legacy`
(«Proyectos Generales») y `b.mdc_hub_pirata_24038` («hub pirata»).

Lo que falta para ser un Account de verdad:

| falta | coste |
|---|---|
| `type` = `PERSONAL` \| `ORGANIZATION` | una columna |
| Membresía de Account (hoy solo hay membresía de proyecto) | una tabla |
| Roles de Account distintos de los de proyecto | una tabla |
| Clave ajena real `projects.hub_id → hubs.id` | una restricción |

**Sobre Personal vs Organization:** pueden compartir motor. Un Account personal
es una organización con un miembro y sin directorio. La excepción peligrosa sería
tratar «personal» como *ausencia* de Account —entonces habría dos caminos de
código para todo—. **Un usuario personal debe tener su Account, aunque sea de
uno.**

**Sobre el nombre:** `hubs` es vocabulario de Autodesk y aquí confunde. En obra
pública peruana el contenedor natural es la **entidad** (municipalidad, gobierno
regional) o la **empresa**. Recomiendo `account` en el modelo y **«Entidad»** en
la interfaz.

---

## 6 · Project model

### Project Core — existe, pero con dos identidades

`projects` tiene `id`, `name`, `hub_id`, `status`, `region`, `invite_code`,
`model_urn`. **Que `projects` tenga a la vez `id` y `model_urn` es el síntoma
del problema.** En los datos: unas filas los tienen iguales, otras distintos, y
una tiene `model_urn = NULL`.

### Project Configuration — **existe y funciona**, aunque no se llame así

`nomenclatura_config` (1 fila), `idoneidad_catalogo` (13), `sensibilidad_catalogo`,
`project_settings`, todos por `model_urn`. **Es ya una configuración por obra
independiente de cualquier plantilla viva** — justo lo que §9 de la hipótesis
pide. **KEEP.**

### Tool activation — **no existe**

No hay ninguna tabla ni bandera que active o desactive una herramienta por obra.
Lo más parecido es `DEPLOY_PROFILE`, que es otra cosa (§8).

### Project Records — existen y están bien delimitados

---

## 7 · Authorization model

### Hoy

```
sesión → ¿rol == 'admin'? ──sí──► TODO permitido en la instancia
              │no
              ▼
   _request_project_id()  (4 fuentes, mejor esfuerzo)
              │
              ▼
   _user_in_project()  →  project_users
              │
              ▼
   folder_permissions (por carpeta, con herencia hacia arriba)
```

**Lo bueno, y no es poco:** ya no es `if role == 'admin'` como único fundamento.
Hay membresía por obra, permisos por carpeta con herencia, política declarada por
blueprint (`politica.py`, 151 endpoints en modo estricto), y guardias por
endpoint. La detección de obras en conflicto en una misma petición devuelve
**403**, verificado.

**Lo malo, por orden de gravedad:**

1. **La membresía compara cadenas de vocabularios distintos** (§1). Es el fallo
   de raíz.
2. **`admin` es global y ambiguo.** No distingue administrador de la instancia,
   de la entidad y de la obra. Con una entidad no se nota; con un contratista
   invitado, sí.
3. **`_request_project_id()` es mejor esfuerzo.** Su propio comentario admite que
   deduce de cuatro sitios, y `resolve_project_id` (`db.py:1087`) documenta que
   *«el día que entrara la segunda [obra], la mitad del sistema cambiaría de
   comportamiento a la vez»*.

### Recomendado

`PRINCIPAL + ACCOUNT + PROJECT + TOOL + RESOURCE + ACTION` es el modelo correcto,
**pero no hace falta implementarlo entero ahora**. Lo que sí hace falta ahora es
que `PROJECT` sea un identificador y no una cadena adivinada.

**FGA/ReBAC/RLS:** no ahora. RLS de PostgreSQL sería tentador, pero con
instancia dedicada por entidad el aislamiento fuerte ya es físico. Cuando
aparezca el modelo *pooled* (§11) volverá a ser la pregunta correcta.

---

## 8 · Document model

**Ésta es la parte mejor construida del sistema.** Está más cerca del patrón
objetivo de lo que la hipótesis supone:

```
file_nodes        identidad documental (UUID estable, nombre, estado, obra)
    │
    └── file_versions
            id, file_node_id, version_number     ← identidad de la versión
            sha256, huella_en                    ← contenido
            gcs_urn                              ← ALMACENAMIENTO
            codigo_idoneidad, codigo_revision, emitida_en, emitida_por
```

| pregunta de §11 de la hipótesis | respuesta |
|---|---|
| ¿Identidad separada de bytes? | **Sí.** `id`/`file_node_id`/`version_number` no dependen del almacenamiento |
| ¿Qué IDs son estables? | `file_nodes.id` y `file_versions.id`, UUID |
| ¿Qué depende del almacenamiento? | solo `gcs_urn` |
| ¿El path del bucket forma parte de la identidad? | **No de la identidad — pero sí lleva el `model_urn` dentro** |

**El único problema es ese:** `multi-tenant/{model_urn}/{ts}_{uuid8}_{fichero}`
(`routes/documents.py:1019`). Si mañana se canoniza el identificador de obra, las
rutas históricas quedan con el valor viejo.

Y una línea más arriba está la confusión escrita en el propio código:

```python
# routes/documents.py:1018-1019
# Formato: multi-tenant/{project_id}/{timestamp}_{uuid8}_{filename}
gcs_uuid = f"multi-tenant/{model_urn}/{int(time.time())}_{uuid.uuid4().hex[:8]}_{filename}"
```

El comentario dice `project_id`. El código escribe `model_urn`. **Quien lo
programó creía que eran lo mismo** — y en una instalación con una sola obra
activa, se comportan como si lo fueran.

**Y eso NO es un problema, si se acepta una regla:** la ruta es **opaca**. Nadie
debe derivar la obra de la ruta; la obra está en la fila. Verificado: el código
lee `gcs_urn` de la base y nunca lo interpreta. **KEEP el modelo, y no reescribir
ni una ruta histórica.**

---

## 9 · Project Object Graph

**No aporta valor hoy. DEFER.** Ver Rechazo 2 (§4).

Lo que sí conviene hacer **ahora y gratis**: cuando se creen relaciones nuevas,
que lleven siempre `(project_id, tipo_origen, id_origen, tipo_destino, id_destino)`.
Así el día que exista un grafo, los datos ya están en forma.

---

## 10 · Templates and standards

**El riesgo que teme §9 de la hipótesis ya está evitado**, por accidente feliz:
no hay plantillas vivas. Cada obra tiene su propia configuración
(`idoneidad_catalogo` por `model_urn`), copiada, no referenciada.

Al introducir `PROJECT_TEMPLATE` hay que **conservar esa propiedad**: la plantilla
se usa para **sembrar**, y el proyecto guarda su copia. Basta con no añadir nunca
una clave ajena de la configuración de obra hacia la plantilla.

**Registrar `template_id` + `template_version` en el proyecto** es útil para
saber de dónde salió — pero como **procedencia, nunca como fuente viva**.

---

## 11 · Deployment / placement model

**Hoy solo existe DEDICATED**, y funciona: la instancia de ensayo se levantó y
verificó entera.

**Qué código conoce la infraestructura:** 48 ocurrencias de `DB_HOST`/
`GCS_BUCKET_NAME` en 8+ ficheros (`gcs_manager.py`, `file_system_db.py`,
`integridad.py`, `routes/ai.py`, `routes/digital_twin.py`, `routes/lob4d.py`,
`conciliacion_almacen.py`, `apply_cors.py`). **Todas leen del entorno, ninguna
tiene el valor escrito.** Eso significa que la costura para un `PlacementResolver`
ya existe: hoy la resuelve el proceso al arrancar.

**Para pooled sí haría falta** resolver por petición, y entonces habría que
revisar `get_storage_client()` (cliente único por proceso, `gcs_manager.py:26`) y
el pool de conexiones. **DEFER hasta que exista un cliente que lo pida.**

**Sobre BRIDGE:** varias entidades en una misma instancia de PostgreSQL
**complica la recuperación independiente** — un `PITR` es de la instancia, no de
una base. Si se ofrece BRIDGE, hay que decir en el contrato que la recuperación
puntual afecta a todos los inquilinos de esa instancia. **Recomiendo no
ofrecerlo hasta tener el modelo de recuperación resuelto.**

---

## 12 · Control Plane

**DEFER.** Ver Rechazo 3 (§4).

Lo mínimo que sí conviene desde el primer cliente, y que ya existe:
`/api/health` con `configuracion`, `version` y `rama`. Con eso se puede saber
qué versión corre cada entidad. **Suficiente hasta la quinta.**

Cuando llegue: el plano de datos **no debe depender del de control en cada
petición**. Lo que necesitaría en caché local: entitlements y placement. Nada
más.

---

## 13 · Release and schema strategy

**Lo que existe, y es más de lo que parece:**

- `bootstrap_esquema.py` con verificación por manifiesto de **objetos**
  (tablas, columnas, restricciones, índices, funciones, extensiones) y **código
  de salida 1** si falta algo → un despliegue con esquema incompleto **no
  arranca**.
- Válvula `ESQUEMA_ESTRICTO=false`, documentada y ruidosa.
- `/api/health` reporta versión y rama.

**Lo que falta:**

- Anillos (`INTERNAL → CANARY → EARLY → GENERAL`). Hoy hay un despliegue y ya.
- **Expand/contract.** El bootstrap es idempotente y aditivo (`ADD COLUMN IF NOT
  EXISTS`), lo cual **ya es expand**. Lo que no existe es la fase *contract*
  deliberada ni la compatibilidad temporal declarada `App N ↔ Schema N+1`.

**Riesgo actual real:** bajo mientras haya una instancia. Con diez entidades en
versiones distintas, alto. **SHOULD, no MUST.**

---

## 14 · AI isolation

**Aquí hay una frontera rota, y es la segunda cosa más seria del informe.**

`ia_documentos_preparados` tiene como clave primaria **`gcs_urn`**, no un
identificador de documento ni de obra. Y `_download_pdf(full_path, bucket_name)`
(`routes/ai.py:208`) recibe una ruta y descarga.

Es exactamente lo que §27 de la hipótesis quiere evitar: **una operación que
empieza por un identificador de recurso y pierde el contexto de obra**.

Hoy está contenido por dos cosas: la IA **no existe en perfil portal** (404
verificado en las tres rutas) y todo usa el mismo `GCS_BUCKET_NAME`. **En cuanto
la IA se ofrezca a una entidad, esa frontera hay que cerrarla.**

Lo positivo: las credenciales de IA ya están separadas del proceso
(`routes/ai.py:34-58`, con el motivo escrito: antes contaminaban
`GOOGLE_APPLICATION_CREDENTIALS` de todo el backend).

---

## 15 · Mobile / offline readiness

El APK usa Capacitor y la rama nativa apunta al backend por URL fija
(`helpers.js`, `LoginScreen.jsx`). **No hay almacén local ni bandeja de salida.**

**Lo que importa para el futuro ya está bien:** las IDs del dominio son **UUID**
(`file_nodes.id`, `file_versions.id`), no secuencias. Un cliente offline puede
generar identificadores sin coordinarse. **No hay deuda estructural**; falta
todo lo demás, y puede esperar.

---

## 16 · Interoperability readiness

| frontera | estado |
|---|---|
| Autodesk / ACC | acoplamiento **contenido**: las rutas APS están agrupadas y ya se apagan por perfil (`_ruta_del_visor`) |
| IFC / BCF / OpenCDE | no existe. El modelo de estados + códigos de idoneidad + emisiones **encaja bien** con OpenCDE |
| Exportación verificable | **existe**: índice xlsx + descarga masiva + SHA-256 por versión |

**El único acoplamiento propietario preocupante** es la traducción de modelos vía
Model Derivative. Está aislado en el perfil visor. **No es deuda del portal.**

---

## 17 · Migration strategy

Solo en papel. La migración que importa es **una**: canonizar el identificador de
obra.

```
FASE 0  Inventario
        SELECT DISTINCT model_urn FROM <las 36 tablas>
        Clasificar cada valor: obra real | modelo | frente | 'global' | huérfano

FASE 1  EXPAND — sin tocar nada de lo viejo
        projects: garantizar una fila por cada valor de obra real
        nueva tabla  project_alias(alias TEXT PK, project_id TEXT, origen)
        poblarla con TODOS los valores observados

FASE 2  RESOLVER EN EL BORDE
        _request_project_id() y resolve_project_id() consultan project_alias
        y devuelven SIEMPRE projects.id canónico
        → la autorización empieza a funcionar sin haber tocado un solo dato

FASE 3  MIGRATE (opcional, y probablemente innecesaria)
        Reescribir model_urn a canónico tabla por tabla
        NO ES NECESARIO si la fase 2 resuelve. Y no reescribir es más seguro.

FASE 4  CONTRACT
        Clave ajena real project_users.project_id → projects.id
        Y projects.hub_id → hubs.id
```

**La clave está en la fase 2: se arregla el comportamiento sin migrar datos.**
`project_alias` es una tabla nueva de traducción; ningún documento se reescribe,
ningún `gcs_urn` cambia, ninguna huella se recalcula.

---

## 18 · Data preservation strategy

Cómo se garantiza `same document / same version / same SHA256 / same audit`:

1. **Ningún `UPDATE` sobre `file_versions.sha256` ni `gcs_urn`.** La migración
   propuesta **no toca esas tablas**.
2. **Cotejo antes y después** con la herramienta que ya existe y ya se ejerció:
   `copia_de_seguridad.py` + `ensayo_de_restauracion.py` compara tabla por tabla
   y fila por fila. El ensayo del 20-ago dio **83.410 de 83.410**.
3. **Prueba guardiana nueva** (cuando se implemente): que la suma de
   `sha256` de `file_versions` sea idéntica antes y después.
4. **`activity_log` es de solo anexar.** La migración no escribe en él.

---

## 19 · Blast radius — cuantificado

Para **la migración recomendada** (canonizar el identificador, fases 0-2 y 4):

| dimensión | cantidad | detalle |
|---|---|---|
| Tablas leídas | **36** | las que tienen `model_urn` |
| Tablas **modificadas** | **1 nueva** (`project_alias`) + 2 restricciones | ninguna existente se reescribe |
| Funciones a cambiar | **2** | `_request_project_id()`, `resolve_project_id()` |
| Rutas afectadas | **0 en su firma** | siguen aceptando lo mismo; cambia la resolución interna |
| Componentes frontend | **0** | siguen mandando el mismo `model_urn` |
| Pruebas a añadir | ~8 | resolución de alias, membresía, aislamiento multi-obra |
| Pruebas existentes en riesgo | ~15 | las de authz y perímetro |
| Migraciones | 1 | crear tabla y poblarla desde lo observado |
| Documentación | 3 | guía, expediente, matriz |

**Para Foundation v2 completa** (Account tipado + Tools + Templates + Graph +
Placement + Control Plane): **28+ tablas nuevas**, ~40 rutas, los dos frontales,
y toda la batería de autorización. **VERY LARGE.**

---

## 20 · GO evidence invalidated

| evidencia | ¿sigue válida tras la migración recomendada? |
|---|---|
| Arranque Linux, bootstrap, gunicorn, perfil | **Sí** |
| Bytes: subida, SHA-256, descarga, versión, recuperación | **Sí** — no se toca el almacenamiento |
| Lector PDF visual | **Sí** |
| 2FA 14/14 | **Sí** |
| Restauración 83.410/83.410 | **Sí**, pero **hay que repetirla** tras crear la tabla |
| Continuidad del bucket | **Sí** |
| **Aislamiento entre obras (403)** | **HAY QUE REPETIRLA** — es justo lo que cambia |
| **Batería del gate, 26 de 26** | **Repetir la sección C** (autorización) |
| Aprovisionamiento desde cero | **Sí** |

**Reauditar: autorización, aislamiento y restauración.** Lo demás se conserva.

---

## 21 · MUST / SHOULD / DEFER

### A — MUST BEFORE FIRST CLIENT

| # | qué | por qué es irreversible |
|---|---|---|
| **A1** | **Canonizar el identificador de obra** (fases 0-2) | Está en 36 tablas y en la ruta de cada objeto. Cada entidad y cada documento multiplican el coste |
| **A2** | **Encender `ENFORCE_PROJECT_AUTHZ` y verificarlo** en la instancia de la entidad | Sin A1 no se puede. Con A1, es obligatorio: hoy la autorización por obra **observa, no bloquea** |

**Y nada más.** He intentado meter más cosas en esta lista y ninguna sobrevive a
la pregunta *«¿introducirlo después obliga a migrar datos o reescribir bytes?»*.

### B — SHOULD NOW

| # | qué | por qué |
|---|---|---|
| B1 | Clave ajena real `project_users → projects` y `projects.hub_id → hubs` | barato hoy, doloroso con datos sucios |
| B2 | Tipar `hubs` como Account (`type`, membresía) | prepara el terreno sin migrar nada |
| B3 | Separar el rol `admin` en instancia / entidad / obra | con una entidad no se nota; con un contratista invitado, sí |
| B4 | Cerrar la frontera de la IA (`ia_documentos_preparados` con obra) | antes de ofrecer IA a una entidad |
| B5 | `projects.status` con los cinco estados | hoy solo `active`/`archived` |

### C — SAFE TO DEFER

Tool activation · Project Templates · Project Object Graph · Location/WBS
promovidos · Control Plane · Placement resolver · anillos de despliegue ·
expand/contract formal · offline · billing · colaboración entre Accounts ·
observabilidad por Account · métricas de consumo.

---

## 22 · Implementation phases (propuesta, no ejecución)

```
FASE 1  A1 + A2          canonizar identificador y encender autorización
        └─ reauditar aislamiento y restauración

FASE 2  B1 + B2 + B3     integridad referencial y capa Account tipada
        └─ sin migración de datos

FASE 3  B4 + B5          frontera de IA y ciclo de vida
        (solo si se ofrece IA a la entidad)

FASE 4  C                cuando haya un cliente que lo pida, no antes
```

---

## 23 · Estimated effort

| trabajo | tamaño | por qué |
|---|---|---|
| **A1 · Canonizar identificador** | **MEDIUM** | 1 tabla nueva, 2 funciones, ~8 pruebas nuevas y ~15 a revisar. No migra datos. Lo caro no es escribirlo: es **el inventario** de los valores reales y decidir a qué obra pertenece cada uno |
| A2 · Encender y verificar ENFORCE | **SMALL** | una variable, y repetir la batería de aislamiento |
| B1 · Claves ajenas | **SMALL** | dos restricciones, si los datos están limpios tras A1 |
| B2 · Account tipado | **MEDIUM** | 2 tablas, ~6 rutas, pantalla de administración |
| B3 · Separar roles | **MEDIUM** | toca autorización, que es lo más delicado del sistema |
| B4 · Frontera IA | **MEDIUM** | 1 tabla reindexada, ~10 puntos de llamada |
| B5 · Ciclo de vida | **SMALL** | una columna y las transiciones |
| **Foundation v2 completa** | **VERY LARGE** | ~28 tablas, ~40 rutas, dos frontales, autorización entera |

**Dominios:** 12 identificados. **Tablas hoy:** 91. **Rutas:** 151 (portal) /
258 (completo). **Pruebas:** 801.

---

## 24 · Risks of doing it now

1. **Se toca la autorización, que es lo más delicado.** Toda la evidencia de
   aislamiento habría que rehacerla.
2. **El inventario puede destapar datos ambiguos**: valores de `model_urn` que
   no se sabe a qué obra pertenecen. Eso hay que decidirlo a mano, y es trabajo
   de ingeniería civil, no de programación.
3. **Retrasa el piloto.** El producto ya tiene un GO.
4. **Tentación de alcance.** Empezar por A1 y acabar construyendo Account, Tools
   y Templates. El riesgo real no es técnico: es de disciplina.

## 25 · Risks of postponing it

1. **`ENFORCE` no se puede encender**, y por tanto la autorización por obra
   **sigue observando en vez de bloqueando**. Con una entidad y un administrador
   se nota poco. **Con un contratista y una supervisión en la misma obra, es un
   agujero.**
2. **Cada documento que entra hace la migración más cara.** Producción ya tiene
   3.051 documentos y 2.853 versiones.
3. **La segunda obra de la primera entidad ya expone el problema.** El comentario
   de `resolve_project_id` lo dice: con una sola obra activa todo se resuelve por
   accidente.
4. **Un piloto con varios participantes externos no es defendible** sin A1: lo
   que separa a un contratista de los documentos de otro sería una comparación de
   cadenas que hoy no casa.

---

## 26 · Final recommendation

# B · IMPLEMENT ONLY THE IRREVERSIBLE FOUNDATIONS NOW

Y «lo irreversible» es **más pequeño de lo que la hipótesis supone**: dos cosas,
no veintiséis.

**Por qué no A (Foundation v2 completa):** la mayor parte del modelo objetivo se
puede añadir después sin migrar datos ni reescribir bytes. `Account` ya existe
como `hubs`. La configuración por obra ya está separada de cualquier plantilla.
El modelo documental **ya separa identidad de contenido**. El acoplamiento entre
módulos es mínimo. Construirlo todo ahora retrasa el piloto meses para resolver
problemas que aún no se tienen.

**Por qué no C (mantener la arquitectura actual):** porque hay un defecto de
raíz que **no es cosmético y empeora con el tiempo**. El identificador de obra no
identifica; la autorización por obra no puede encenderse; y eso no es una
carencia de funcionalidad, es una frontera de seguridad que hoy observa en vez de
bloquear. Con una entidad y un solo administrador nadie lo nota. Con la primera
supervisión externa, sí.

**Lo que recomiendo hacer antes del primer cliente real: A1 y A2. Nada más.**

Y una consecuencia honesta que hay que aceptar: **hacerlo invalida parte de la
evidencia del GO** —autorización, aislamiento y restauración— y esas tres hay que
repetirlas. El resto se conserva.

---

**Fin del diagnóstico. No se ha implementado nada.**
