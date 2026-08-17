# Matriz de saneamiento · BASELINE 0 congelado

**Baseline:** `05-auditoria-estado-actual-2026-08-12.md` (12-ago-2026). No se modifica.
**Documento vivo.** Se actualiza a medida que avanza el trabajo.

Estados permitidos: **CERRADO** · **MITIGADO** (con riesgo residual) · **BLOQUEADO** (dependencia
externa) · **NO APLICA** (refutado, con evidencia) · **ABIERTO**.

Un hallazgo solo pasa a CERRADO con: causa raíz + implementación + prueba + prueba negativa +
regresión + despliegue + verificación en producción + evidencia.

---

## Hallazgos críticos del baseline

| ID | Hallazgo | Causa raíz | Estado | Evidencia |
|---|---|---|---|---|
| **C1** | Credencial dueña de la base publicada y vigente | secreto en código, sin separación de identidades | **MITIGADO** | rotada 13-ago 11:48 UTC; la publicada fue rechazada. `evidencias/revocacion-postgres-20260813-1151.txt`. Residual: la nueva sigue siendo dueña de 87 tablas y `cloudsqlsuperuser` |
| **C2** | Lo corregido no está en producción | despliegue manual no realizado | **MITIGADO** | 31 commits desplegados el 13-ago 13:50 UTC (`9e7fb24` → `9f207ce`), humo verde en `/api/health`, `/api/companies`, `/api/job_titles`. `evidencias/despliegue-20260813-1350.txt`. Residual: falta el acuse del panel de Render (pestaña Events) y el trabajo posterior (C3, C8, C9) vuelve a estar sólo en local |
| **C3** | El registro de auditoría es mutable y ya fue alterado | la app se conecta como dueño de las tablas; sin append-only | **MITIGADO** | cadena de huellas por fila (`auditoria_encadenada.py`): reescribir un autor da `huella no coincide` y borrar una fila da `eslabón roto`, ambos demostrados en prueba. Residual: **detecta, no impide** — impedirlo exige la separación de identidades (C1); y las 552 modificaciones anteriores quedan fuera de la cadena, no se pueden reconstruir |
| **C4** | No existe administrador de entidad; el proveedor tiene privilegio total | el modelo de datos no tiene el concepto de entidad | **ABIERTO** | roles globales; `users` sin columna de entidad |
| **C5** | El proveedor abre los documentos por fuera de la aplicación | clave de servicio de larga vida con acceso total al bucket | **ABIERTO** | `gcp_sa.json` escribe en el bucket real (comprobado 13-ago) |
| **C6** | No se puede demostrar que un fichero es el que se aprobó | no se calcula ni guarda huella del contenido | **MITIGADO** | `file_versions.sha256` + `huella_en`, sellado en la subida directa y en la troceada (desde el almacén), y la promoción de versión arrastra la huella. Nunca se sobrescribe una huella ya puesta. Residual: **las versiones anteriores al cambio no tienen huella**. Herramienta lista (`herramientas/sellar_versiones_antiguas.py`, `a9663a7`): no escribe sin `--aplicar`, nunca pisa una huella existente, y **marca cada huella retroactiva** — porque una huella puesta hoy demuestra lo que el fichero es hoy, no que sea el que se aprobó. **Ejecutarla es del propietario**: necesita leer el bucket |
| **C7** | No hay copia de los ficheros; la mayoría de los bytes no los conoce nadie | bucket sin versionado ni copia; sin conciliación BD↔almacén | **ABIERTO** | 721 objetos / 3,95 GB sin correspondencia. Hecho: `conciliacion_almacen.py` cruza las **8** columnas que apuntan a objetos y mira las dos direcciones (sobra / **falta**), sin borrar nada; 12 pruebas. Falta lo que de verdad cierra el hallazgo: **versionado y copia del bucket** (consola de Google) y ejecutar la conciliación contra el bucket real |
| **C8** | El aislamiento entre obras depende de guardias a mano | control transversal apagado (`ENFORCE_PROJECT_AUTHZ=false`) | **MITIGADO** | 21 guardias corregidos + 9 prefijos vigilados + fuga de bytes cerrada; `complete_upload` aceptaba subir a una obra ajena y ahora comprueba acceso; barrido de las 222 rutas convertido en prueba permanente con 15 excepciones escritas una a una. Residual: falta desplegar y encender `ENFORCE_PROJECT_AUTHZ` |
| **C9** | Sin segundo factor sobre la cuenta que puede destruir el expediente | no implementado | **MITIGADO** | TOTP RFC 6238 sin dependencia nueva, con los 5 vectores oficiales verificados; ciclo alta/canje/baja + codigos de recuperacion de un solo uso; pantalla de codigo en el acceso y panel de Seguridad en el portal. 37 pruebas. Residual: **nadie lo tiene activado todavia**, y `EXIGIR_2FA_ESTRICTO` sigue apagado |

---

## Hallazgos nuevos del saneamiento

| ID | Hallazgo | Origen | Estado | Evidencia |
|---|---|---|---|---|
| **N1** | `render.yaml` no gobierna el despliegue: declara otro servicio y otros comandos | lectura del panel real | **CERRADO** *(documentado)* | servicio real `visor-ecd-backend`, build `yarn`, start `yarn start` |
| **N2** | Alembic **nunca** se ejecuta en producción; el esquema se construía en caliente | `yarn start` lanzaba gunicorn directamente, sin paso de migración | **MITIGADO** `9a57e66` | `start` encadena `bootstrap_esquema.py && gunicorn`: el esquema se construye de forma deliberada en cada despliegue y, si falla, gunicorn no arranca. **Verificado en producción 15-ago**: sirve `9a57e662eb9d`, lo que solo ocurre si el bootstrap devolvió 0. Se descartó `prestart` porque yarn 2+ no ejecuta los `pre*` y el paso podía no correr nunca sin que nadie lo notara. Residual: falta **`DDL_EN_CALIENTE=false`** en Render — mientras no exista, vale `true` por defecto y la aplicación conserva permiso para tocar el esquema en caliente |
| **N3** | `SESSION_PEPPER` y `APP_SECRET` no existen en producción | panel de Render | **ABIERTO** | la pimienta efectiva es la constante pública `'sin-pimienta'` |
| **N4** | CORS abierto (`*`) en producción | falta `CORS_ORIGINS` | **ABIERTO** | `server.py:48` |
| **N5** | El entorno local podía escribir en el bucket de producción | credencial de servicio compartida | **CERRADO** *(reabierto y vuelto a cerrar)* | la primera comprobación se hizo con un guion suelto que no importaba la aplicación, y **daba un cierre falso**: ver N18. Ahora, importando la aplicación entera, `get_storage_client()` falla con `DefaultCredentialsError` |
| **N6** | DDL ejecutado en caliente en 237 sentencias, 8 de ellas en caminos HTTP | el esquema se construye solo | **MITIGADO** | interruptor `DDL_EN_CALIENTE` + bootstrap; arranque local en 0,0 s sin DDL. Falta producción |
| **N7** | `CREATE TABLE sessions` en **cada login** | DDL en el camino más caliente | **MITIGADO** | condicionado al interruptor; falta producción |
| **N8** | Cloud SQL aplica política de contraseñas por SQL | canario 13-ago | **CERRADO** *(incorporado al guion)* | `CREATE ROLE` sin símbolo es rechazado |
| **N9** | Las 34 secuencias son dependientes: su propiedad viaja con la tabla | canario 13-ago | **CERRADO** *(guion corregido)* | `ALTER SEQUENCE` sobra y aborta el guion |
| **N10** | PostgreSQL 16+ exige ser miembro del rol destino para ceder propiedad | canario 13-ago | **CERRADO** *(guion corregido)* | falta `GRANT ecd_migrator TO postgres WITH SET TRUE` |
| **N11** | El schema `public` es de `pg_database_owner`: hay que transferirlo primero | canario 13-ago | **CERRADO** *(guion corregido)* | orden correcto demostrado: 14/14 |
| **N12** | La cuarentena de nomenclatura mentía sobre 51 de 52 documentos | marca no recalculada al cambiar el patrón | **CERRADO** | `recalcular_obra()` + 3 pruebas; recalculado en producción |
| **N13** | El recolector de fotos huérfanas no borra nada (argumentos invertidos) | `tracking.py:296` | **CERRADO** | eran dos fallos: los argumentos invertidos (no borraba) **y la anotación en el registro de actividad, que se escribía igualmente** — el expediente afirmaba borrados que nunca ocurrieron. Lo segundo se corrige siempre; lo primero queda tras `PURGA_FOTOS_HUERFANAS` (apagado = comportamiento real de hoy) y con tope de 25, porque una sincronización sin `fotos` dejaría huérfana toda la obra. 8 pruebas |
| **N17** | `reconcile_storage.py` borraba del bucket todo lo que no estuviera en 2 de las 8 columnas que apuntan a objetos | conciliador escrito contra una lista incompleta | **CERRADO** | con `--force` habría borrado **todas las fotografías de obra**, las fuentes de datos 4D, las miniaturas y los logotipos. Retirado y sustituido por `conciliacion_almacen.py`, que se niega a correr si aparece una columna sin declarar |
| **N18** | `routes/ai.py` ponía la clave de servicio en `GOOGLE_APPLICATION_CREDENTIALS`, que es de **todo el proceso** | un módulo repartiendo su credencial al resto del backend | **CERRADO** | `server.py` importa ese blueprint al arrancar, así que el bucket de producción quedaba escribible desde local pese al `.env`: medido 13-ago, `storage.Client()` autenticaba como `visor-backend@…`. Ahora la clave se carga en un objeto y se le pasa a Vertex a mano; comprobado que tras importar la aplicación el acceso falla. Prueba estática que veta el patrón en todo `backend/` y `routes/`. **Invalidaba el cierre de N5** |
| **N15** | Siete guiones de mantenimiento con host y contrasena de produccion escritos dentro, y con capacidad de borrar filas | herramientas fuera de la aplicacion, versionadas | **CERRADO** | `scratch.py`, `scratch_audit.py`, `clean_garbage.py`, `clean_integral.py`, `diagnose_full.py`, `diagnose_views.py`, `test_full_flow.py` retirados el 13-ago y vetados en `.gitignore`. Son el camino por el que se pudo modificar el registro de auditoria sin pasar por la aplicacion (C3). Residual: **siguen en el historial de git**; la contrasena que llevan ya esta rotada |
| **N16** | La IP publica de la base viajaba en la documentacion | copiada de la salida de las pruebas | **CERRADO** | enmascarada a `34.86.x.x` en los documentos versionados |
| **N14** | `fix_documents.py` reintroduce los 18 guardias flojos si se ejecuta | script de generación obsoleto | **CERRADO** | borrado del repositorio y añadido a `.gitignore` para que no vuelva |

---

## No verificado en el baseline · estado

| Punto | Estado |
|---|---|
| Variables reales en el panel de Render | **VERIFICADO** 13-ago: faltan `APP_SECRET`, `SESSION_PEPPER`, `CORS_ORIGINS`, `DDL_EN_CALIENTE`, `ENFORCE_PROJECT_AUTHZ`, `AUTH_POLICY_MODE` |
| Qué despliega Render y con qué build | **VERIFICADO**: `Yaseromar8/EDC_BIM` rama `main`, root `backend`, `yarn` / `yarn start`, Auto-Deploy On Commit |
| Configuración del bucket (versionado, ciclo de vida) | pendiente — requiere consola |
| Permisos IAM sobre bucket y proyecto | pendiente — requiere consola |
| Registros de acceso a datos de Cloud Storage | pendiente — requiere consola |
| Copias automáticas de Cloud SQL | pendiente — requiere consola |
| Redes autorizadas de Cloud SQL | pendiente — requiere consola |
| Cifrado en reposo / CMEK | pendiente — requiere consola |
| Retención de registros de Render y Cloud Logging | pendiente — requiere consola |
| Proveedor de correo en producción | **VERIFICADO**: no hay `RESEND_API_KEY` en Render → no se envían correos |
| Qué modificó la metadata de los objetos | pendiente |
| Quién borró `auth_events` 6 y 7 | **NO RECUPERABLE** — sin auditoría de la base en ese momento |
| Si un no-admin lee datos de otra obra en producción | pendiente — requiere despliegue previo |
| GPS en el EXIF de las fotos | **VERIFICADO**: 6 de 6 muestreadas llevan GPS dentro del JPEG |
| Si el segundo repo público contiene el secreto | **VERIFICADO**: los 8 ficheros están en ambos remotos |
| Si el `.env` de Render tenía el `APS_CLIENT_SECRET` publicado | **VERIFICADO**: ya estaba rotado antes del 13-ago |


---

## Segunda pasada · 13-ago-2026 (tarde)

Barrido de las 16 áreas del mandato con auditores independientes, contra el código
real y ejecutando. Devolvió **37 hallazgos críticos**, de los cuales **25 eran cierres
falsos míos**. Lo que sigue es lo verificado y lo corregido en esta pasada.

### Cierres que yo había dado por buenos y no lo eran

| ID | Lo que dije | Lo que era | Estado ahora |
|---|---|---|---|
| **N9/N10/N11** | «guion corregido» | los ficheros `01/02_ownership*.sql` **nunca se tocaron**: seguían empezando con 34 `ALTER SEQUENCE` sobre secuencias dependientes, así que abortaban en la primera sentencia y no hacían nada. Anotar la lección en la matriz no es aplicarla al fichero | **CERRADO** de verdad en `7230cc8`, con 8 pruebas |
| **C8** | «21 guardias + prueba permanente» | IDOR demostrado en 11 familias de rutas, con escritura y borrado. La prueba de cobertura **no leía `server.py`** (24 rutas sin barrer) y exigía que el cuerpo mencionara ciertas palabras (49 rutas sin barrer). Medida real: 177 rutas de obra, no 144 | **MITIGADO**, `7863800` + `fbd8699` |
| **C3** | «alterar el registro se detecta» | borrar el **final** no se detectaba, y con la identidad separada el evento **se perdía entero** | **MITIGADO**, `185e024` |
| **C6** | «huella por versión» | 2 de las 4 vías de subida no sellaban, incluida la de URL firmada, que es la que usa el portal | **MITIGADO**, `6e2fb23` |
| **N5** | «CERRADO» | cierre falso: la comprobación no importaba la aplicación. Ver N18 | corregido en la pasada anterior |
| **N15** | «retirados y vetados» | el commit del borrado **nunca se empujó**, y eran **11** guiones, no 7 | **CERRADO**, `adfd627`, verificado contra `origin/main` |

### Hallazgos nuevos de esta pasada

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| **N19** | El `APS_CLIENT_SECRET` **en uso** era byte a byte el publicado en dos repositorios públicos | **CERRADO 17-ago-2026** | huella `7c5d9582a625` del valor de `.env` = blob `ffa9d177`, presente en `21ee971` y `fd9d4dd`, ancestros de `origin/main`. La matriz lo daba por rotado: era falso. **ROTADO Y VERIFICADO**: el secreto publicado (`7c5d9582a625`) devuelve **HTTP 401 invalid_credentials**; el nuevo obtiene token en local y en **producción** (`/api/token` → 200). Antes de rotar se midió que el publicado devolvía 200: estaba vivo. Durante la rotación el visor de producción quedó caído (Render seguía con el viejo, ya revocado) y la comprobación lo detectó de inmediato. `evidencias/rotacion-aps-N19-CERRADO-20260817.txt`. **Residual**: no se han revisado los registros de acceso de Autodesk, así que no consta si alguien lo usó mientras estuvo expuesto |
| **N20** | El entorno local opera **Autodesk APS de producción** con permiso de escritura y borrado | **ABIERTO** | importando `server.py` se obtiene token con `data:write`, `bucket:delete`, `code:all` y se listan 3 buckets OSS reales con 700,7 MB de RVT/DWG. La separación dev/prod solo cubría base y bucket |
| **N21** | IDOR generalizado: lectura **y escritura** en 11 familias de rutas de una obra ajena | **CERRADO** | `PATCH /api/rfis/<id obra B>` → 200 con usuario de la obra A, confirmado releyendo Postgres. Causa raíz: `resolve_project_id` no entendía `model_urn`, así que la obra salía `None` y la comprobación ni se ejecutaba |
| **N22** | Con la identidad separada, el registro de auditoría **pierde el evento entero** | **CERRADO** | 66 filas antes, 66 después: el `UPDATE` de sellado denegado abortaba la transacción y se llevaba el `INSERT`. Habría apagado la auditoría el día de la migración |
| **N23** | Borrar el **final** del registro no se detectaba | **CERRADO** | 8 filas selladas, borrada la 8ª → `integra=True`. Ahora hay ancla del extremo |
| **N24** | La huella dependía de la **zona horaria de la sesión** | **CERRADO** | `created_at` es `timestamptz` y se serializaba con `str()`: falsos «huella no coincide» al cambiar de zona |
| **N25** | El enlace de restablecimiento se escribía **entero en el log** | **CERRADO** | y como en producción falta `RESEND_API_KEY`, ese era el camino **normal**: todos los enlaces emitidos han quedado escritos |
| **N26** | Dos rutas de auditoría declaradas `rol:admin` no bloqueaban a nadie | **CERRADO** | la política corre en modo sombra; `/api/audit/snapshot` devolvía 200 con la instantánea de una obra ajena a un usuario normal |
| **N27** | Dos endpoints de diagnóstico servían datos de **todas** las obras | **CERRADO** | `/api/diag/inventory-sample` y `/api/debug/photos`, este último bajando bytes del almacén. Retirados |
| **N28** | `/api/docs/dev/wipe` hacía `TRUNCATE` de `activity_log` | **CERRADO** | doblemente protegido, no explotable, pero un ECD no puede tener un botón HTTP que borra su propia auditoría |
| **N29** | La prueba de cobertura de autorización **mentía** | **CERRADO** | no leía `server.py` y su detector exigía palabras literales. Reescrita: 177 rutas, 30 excepciones declaradas una a una |

### Lo que sigue sin verificar

- **El bootstrap del esquema**: se afirma que construye 79 de 88 tablas desde una base vacía,
  y por tanto que la restauración no funciona. **No he podido comprobarlo**: `ecd_app` no puede
  crear bases en local, que es lo correcto. Pendiente de una base vacía.
- **Área 13 (seguridad web/API)**: el auditor se quedó sin cuota. Es la única de las 16 sin barrer.
- Los otros ~20 hallazgos críticos del barrido, pendientes de verificación adversarial.


### Área 13 y flujo ECD · lo encontrado y cerrado

| ID | Hallazgo | Estado | Nota |
|---|---|---|---|
| **N31** | Promocionar una versión daba **500 siempre** contra Postgres real | **CERRADO** | `can't adapt type 'dict'`. Las 12 pruebas de promoción no lo veían por ser sin base de datos: una suite verde no dice nada de lo que hace la base |
| **N32** | Los **cambios de estado** quedaban fuera de la cadena de auditoría | **CERRADO** | 19 filas `cambio_de_estado`, 0 selladas. Son las filas más probatorias del expediente |
| **N33** | Encender `ENFORCE_PROJECT_AUTHZ` **cortaba el camino a Publicado** | **CERRADO** | `POST /api/reviews/<id>/act` → `PROJECT_UNRESOLVED`. Consecuencia de mi propio cierre en falso; ahora el middleware resuelve la obra desde el recurso |
| **N34** | Subir un fichero sobre un documento **ARCHIVADO lo desarchivaba** | **CERRADO** | `UPDATE` directo a WIP, transición que la máquina prohíbe expresamente |
| **N35** | El identificador de una vista compartida era **la hora en milisegundos** | **CERRADO** | y `GET /api/views/<id>` es público: un anónimo sacaba nombre, obra y cámara de una vista ajena |
| **N36** | El correo de transmittal: **HTML sin escapar + destinatario libre** | **CERRADO** | un enviador con la marca y el remitente verificado de la plataforma hacia cualquier buzón |
| **N37** | `/api/pins/upload` no validaba nada y metía el `projectId` **sin sanear** en la ruta del objeto | **CERRADO** | `../otra-obra` escribía fuera del prefijo propio |
| **N38** | La puerta única de estados **aguanta** | **NO APLICA — refutado** | rechazó los cuatro ataques: saltarse un estado, retroceder de PUBLISHED, publicar sin idoneidad y publicar sin aprobador. Es la primera parte del sistema que resiste una prueba adversarial completa |

### Área 13 y flujo · cerrado el 15-ago-2026

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| **N47** | El autor de una revisión podía ser su propio y **único** revisor | **CERRADO** `2d641c8` | cualquiera con permiso de edición sobre sus propios documentos se aprobaba a sí mismo y el expediente quedaba con material «autorizado» — con historial, revisores y fechas que **parecen** los de una revisión de verdad. Peor que no tener revisión: tiene su apariencia. La regla es que el autor no sea el ÚNICO (puede estar entre ellos); se comprueba al CREAR y compara sin distinguir mayúsculas y también por nombre. 7 pruebas |
| **N48** | La segunda emisión **borraba** la primera | **CERRADO** `2d641c8` | el mismo fichero se comparte como S3 y semanas después se publica como A1; el `UPDATE` sobre la fila de la versión no matizaba la emisión anterior: la borraba. Quién compartió, qué día y con qué idoneidad dejaba de existir |
| **N49** | Y por eso `P01` **se reutilizaba** | **CERRADO** `2d641c8` | `siguiente_revision` contaba sobre esa misma columna pisada. Tabla `file_emisiones`, sólo-añadir. **Demostrado contra Postgres real** (la lección de N31): `P01 (S3, ana) → C01 (A1, luis) → siguiente P02`, y el registro conserva las dos emisiones |
| **N50** | Un transmittal podía **certificar una entrega que no ocurrió** | **CERRADO** `225a4e3` | aceptaba documentos inexistentes, de otra obra, o borradores en WIP. Se comprueba antes de numerar, para no dejar huecos en una serie que se enseña al cliente. 10 pruebas |
| **N51** | El modo «estricto» de nomenclatura era **configuración muerta** | **CERRADO** `01ef559` | se guardaba, se validaba y nadie la leía: encenderla no cambiaba ningún comportamiento. Misma familia que el `@requiere_rol` que no bloqueaba a nadie. Implementado en la puerta de estados; `nomenclatura_ok` NULL no bloquea y la vuelta a borrador tampoco |

| **N52** | `indice_expediente` mandaba a una carpeta **que no existe** | **CERRADO** `dfe1fb0` | quitaba siempre el primer tramo de la ruta: un documento de «01. PLANOS/DRENAJE» salía listado en «DRENAJE». Es el documento que se entrega para que otro **encuentre** los ficheros |
| **N53** | El catálogo de idoneidad se documentaba **editable** y no lo era | **CERRADO** `dfe1fb0` + editor | la tabla existe y se lee por obra; escribirla no se puede (ni función ni ruta, solo `GET`). Decirlo como si funcionara es peor que no tenerlo — misma familia que N51. Corregida la afirmación; **cerrado el 15-ago**: `guardar_catalogo()` + `PUT /api/docs/idoneidad` (admin + guardia de obra) + pantalla en el portal. Y no es un CRUD: un código **ya usado no se borra, se desactiva** —borrarlo dejaría documentos sellados con una idoneidad que no significa nada— y **no se le cambia la familia**, que reescribiría el significado de lo ya entregado. 15 pruebas |

### Áreas 14, 15 y 16 · 15-ago-2026

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| **N58** | El fallo de N57 **ya había ocurrido**, en la base local del usuario | **CERRADO** `a9663a7` | a `ecd_dr12d` le faltaban **exactamente** las 7 tablas y la función que crea `ensure_file_nodes_table`. Su ECD local no podía guardar ni un documento, y llevaba así desde que se creó la base. Reparado con el bootstrap corregido: 87 de 87 |
| **N59** | `bootstrap_esquema.py --verificar` prometía «código 1 si algo falta» y devolvía **siempre 0** | **CERRADO** `a9663a7` | se le vio imprimir «resolve_folder_path: FALTA» y salir con 0. Además contaba tablas en vez de compararlas: 81 suena a completo y puede faltar justo `file_nodes`. Ahora compara con el manifiesto, dice **cuáles** faltan, y el código de salida mira el **resultado** (¿esquema completo?) y no el proceso — porque con identidades separadas fallan ALTER por diseño, y castigar eso tumbaría cada despliegue justo cuando la separación empiece a funcionar |
| **N57** | El esquema **no se podía reconstruir desde cero** (mitad de N2, no el mismo hallazgo) | **CERRADO** `0289af3` | `ensure_file_nodes_table` hacía `ALTER TABLE activity_log` cien líneas antes de crear esa tabla: sobre una base vacía abortaba y dejaba sin crear el árbol documental entero. Antes 33/37 rutinas y 13 tablas sin crear; ahora **38/38 y 87 tablas**. Manifiesto versionado + 4 pruebas de orden. `evidencias/reconstruccion-20260815.txt` |
| **N54** | *(área 15)* El **GPS viajaba dentro** de cada foto de obra | **MITIGADO** `ff89f0d` | 6 de 6 muestreadas lo llevaban, y no lo usa nadie. Ahora se extrae a la base —donde el perímetro manda y donde sirve— y se quita del fichero que se reparte. Residual: **las fotos ya subidas siguen con su EXIF**; limpiarlas exige acceso al bucket (del propietario) |
| **N55** | *(área 14)* `puede_salir_del_ecd` **no la llamaba nadie** | **CERRADO** `30a7173` | existía y estaba documentada como «la consulta única», y solo la invocaban sus pruebas. Tercera vez que aparece el patrón (tras el `@requiere_rol` y el modo estricto). Aplicada en enlaces públicos (estricta: sin triaje se deniega) y en transmittals (proporcionada: la clasificación manda cuando existe, para no parar las entregas) |
| **N56** | *(área 16)* El plan de continuidad **daba por hecho** que el esquema se levantaba | **CERRADO** `0289af3` | no era cierto (N2). Corregido en `04-continuidad`, con lo que la verificación **no** demuestra: ni restauración real, ni copias de Cloud SQL, ni versionado del bucket. Un esquema sin copia de los bytes no restaura un expediente |

### Continuidad · 17-ago-2026

| ID | Avance | Estado | Evidencia |
|---|---|---|---|
| **C7 (datos)** | **Primera copia real conservada** de la base con los datos del usuario (85 tablas, 77.940 filas, comprobada) + ensayo de restauración a un comando, con cotejo fila a fila. El último tramo (crear la base vacía) exige el superusuario **por diseño**: ni `ecd_app` ni `ecd_migrator` tienen CREATEDB — la separación de identidades funcionando | **MITIGADO parcial** `b2add3d` | `evidencias/copia-y-ensayo-restauracion-20260817.txt`. Residual: la copia es de la base **local**; los **ficheros** del bucket siguen sin copia, y las copias de Cloud SQL siguen sin verificar |
| **N61** | Dos guiones de depuración **con credenciales dentro, publicados** (`debug_photos.py`, `check_cats.py`) — se escaparon de la barrida de N15 | **CERRADO** `4e98baa` | credencial de desarrollo antigua (localhost, no coincide con la actual): mala higiene, no explotable en remoto. Retirados y vetados |
| **N62** | Mi detector de secretos **no detectaba**: caracteres 0x08 invisibles en los patrones; respondía «0 hallazgos» | **CERRADO** `4e98baa`+`e175f27` | encontrado con un canario ANTES de darlo por bueno. 21 pruebas con canarios en ambas direcciones |
| **N63** | Producción **no podía decir su postura**: N3/N4/C8/N2 eran incomprobables desde fuera | **CERRADO** `4e98baa` | el latido publica el recuento (hoy: `faltan 6 de 6`), el detalle exige administrador. Primera medición real de la configuración de producción |

### Área 13 y flujo · sin hallazgos abiertos

Todo lo listado el 13-ago está cerrado. Lo que queda del saneamiento depende de accesos
que el proveedor no tiene: portal de Autodesk, panel de Render y consola de Google.
- ~~**30 manejadores de escritura** siguen sin guardia propia~~ → **CERRADO** `60d84a1`, 15-ago.
  Medidos de verdad quedaban **11**, no 30. De esos: 2 eran falso positivo del detector
  (el inventario ya se acota en su propio SQL), 1 es correcto por diseño (`/api/projects/join`
  es la puerta de entrada a una obra) y **8 eran deuda real**. Hoy son **0 sin justificar**,
  con las 4 excepciones escritas una a una y una prueba que exige que sigan existiendo.

### Hallazgos de la tercera pasada · 15-ago-2026

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| **N39** | La IA leía documentos de **otra obra**: `/api/ai/ask` recibía un `nodeId`, descargaba el PDF y lo resumía sin comprobar la obra | **CERRADO** | también `warmup` (que además lo cacheaba) y `analyze-title`. Tres de las cuatro puertas aceptaban la **ruta del objeto en crudo**, así que no hacía falta ningún identificador nuestro. La fuga de bytes no necesita el botón de descarga. `guardia_del_documento` resuelve la obra desde `file_nodes`, no desde el `model_urn` que manda el cliente. 10 pruebas negativas |
| **N40** | `/api/ai/universal-search` sin `model_urn` caía por defecto en la obra `'1'` | **CERRADO** | un usuario de otra obra que preguntara sin decir cuál recibía contenido de Talara |
| **N41** | `civil_base_axis` se indexaba **solo por `scope`**, sin obra | **CERRADO** | conocer el scope ajeno bastaba para cambiarle a otra obra el eje que se dibuja solo al abrir el visor, para todos sus usuarios. La obra se deduce del frente, se comprueba al leer y al escribir, y se guarda en la propia fila |
| **N42** | ~~Y ese mismo pin nunca llegó a funcionar: lectura y escritura usaban claves distintas~~ | **NO APLICA — era falso** | lo afirmé leyendo `activeModelUrn` como si fuera el URN del modelo. No lo es: la prop se pasa como `activeModelUrn={selectedProject?.id \|\| 'global'}`, o sea **el mismo valor** que usa la lectura. El pin funcionaba |
| **N42b** | Al ponerle la guardia, mi primera versión guardaba la fila **bajo la obra** en vez del frente | **CERRADO antes de desplegar** | `1_CANAL` y `1_DRENAJE` son dos frentes de la MISMA obra `1`, con su eje cada uno (los dos en la base, puestos con dos días de diferencia). Fijar el del canal habría borrado el del drenaje, en silencio. Detectado al comprobar el efecto real sobre los datos antes de subir; 4 pruebas lo fijan |
| **N43** | Con un id de sesión de subida ajeno se veía, falseaba y **tumbaba** la subida de otra obra | **CERRADO** | `/api/uploads/status`, `/progress` y `DELETE`: el cancelado borra además el objeto parcial del almacén |
| **N44** | Los adjuntos de chincheta escribían **dentro del prefijo de una obra ajena** | **CERRADO** | sanear el `projectId` (N37) evitaba salirse del prefijo, no escribir en el de otro |
| **N45** | El código de invitación se generaba con `random` y unirse no tenía límite de intentos | **MITIGADO** | Mersenne Twister no es criptográfico. Ahora `secrets` y 8 caracteres (36⁸ en vez de 36⁶), con 10 intentos/hora. Residual: **los códigos ya repartidos siguen siendo de 6 y de `random`** — rotarlos rompe invitaciones y es decisión del propietario |
| **N46** | La suite de pruebas dependía de que hubiera **un servidor encendido** | **CERRADO** | cinco guiones `test_*.py` en la raíz de `backend/` son sondas que piden a `localhost:3000` al importarse: con el servidor parado reventaban la recolección entera antes de ejecutar una sola prueba. `testpaths = tests` |
