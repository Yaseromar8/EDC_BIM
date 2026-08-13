# Auditoría del estado actual del ECD
**12 de agosto de 2026 · documento interno, no para el cliente**

Auditoría técnica y de preparación institucional sobre el estado REAL del sistema.
Ocho lentes independientes sobre el código, la base de producción y la
infraestructura; cada hallazgo crítico pasó después por un revisor cuyo único
encargo era refutarlo.

## Verificado a mano después del informe

Tres afirmaciones del informe se comprobaron directamente por su gravedad. Se deja
constancia porque dos de ellas estaban peor planteadas de lo que la realidad
sostiene, y una es exacta.

**CORREGIDO — `/api/docs/dev/wipe` está desactivado.** El endpoint existe y hace
`TRUNCATE` de `file_nodes` y de `activity_log`, pero tiene dos cerrojos: la variable
de entorno `ALLOW_DEV_WIPE`, que no está puesta en ninguna configuración, y rol de
administrador comprobado dentro de la vista. No es un riesgo vivo. Sigue siendo un
hallazgo legítimo que exista en producción código capaz de borrar el registro de
auditoría.

**CORREGIDO — la clave de servicio no está filtrada.** `backend/gcp_sa.json` existe
en el equipo del desarrollador, está en `.gitignore` y `git log --all` no devuelve
ningún commit que la contenga: nunca se subió. Lo que sí es cierto es que esa clave
abre el bucket completo sin pasar por la aplicación y sin dejar registro.

**CONFIRMADO — el registro de auditoría ha sido modificado y no hay nada que lo
impida.** Consulta propia sobre `pg_stat_user_tables` en producción:
`activity_log` con 1.755 filas insertadas y **552 actualizadas** sobre una tabla que
el código sólo inserta; `auth_events` con 36 insertadas y **2 borradas**, y los id 6
y 7 ausentes de la secuencia. La aplicación se conecta como `postgres`, dueño de las
tablas. Cero políticas RLS y cero disparadores de protección.

Esas modificaciones son con toda probabilidad tareas de mantenimiento del propio
equipo, no una manipulación con mala fe. **Y ese es exactamente el problema: hoy no
existe forma de distinguir una cosa de la otra.** Es la pregunta que hace un auditor,
y hoy no tiene respuesta.

**CONFIRMADO — producción va 26 commits por detrás** (`origin/main` = 9e7fb24, del 9
de agosto). Todo lo corregido los días 9 al 12 no está desplegado.

---

## ESTADO GENERAL

**Preparación como ECD: 30/100**
La maquinaria ISO 19650 está escrita y probada (estados, idoneidad, nomenclatura, revisiones, transmittals, conjuntos), pero en la base real hay 2.823 documentos en WIP y 1 en SHARED, cero emisiones (`file_versions.emitida_en` = 0 filas), la tabla `idoneidad_catalogo` no existe en producción y ninguno de esos módulos está en la rama desplegada; no sube más porque es capacidad demostrable, no práctica documentada.

**Seguridad técnica: 25/100**
Hay fundamentos correctos y verificados (SQL parametrizado, scrypt, tokens de sesión guardados como huella HMAC, cabeceras HSTS/nosniff/X-Frame-Options en vivo, límites de intento en login), pero la contraseña del rol dueño de las 84 tablas es descargable hoy desde un repositorio público, no hay segundo factor, la autorización por obra corre en modo registro (`ENFORCE_PROJECT_AUTHZ` por defecto `false`, auth_middleware.py:352) y 113 de 224 rutas no tienen guardia propia.

**Trazabilidad: 22/100**
Existe auditoría aplicativa poblada (1.034 filas en `activity_log`, 32 en `auth_events`) y el autor ya se toma de la sesión, pero el registro es reescribible por la misma credencial que usa la aplicación, no tiene disparadores ni RLS (0 y 0 en la base), ya presenta señales duras de manipulación (`auth_events` con n_tup_del=2 y los id 6 y 7 ausentes; `activity_log` con n_tup_upd=552 sobre una tabla que el código sólo inserta) y en producción no existe ni una línea de "quién descargó qué".

**Continuidad: 28/100**
El PITR de Cloud SQL es real y está activo ahora mismo (archive_mode=always, archive_timeout=300, 49.608 WAL archivados), pero el bucket de 6,39 GB no tiene copia ni versionado, el guion de copia propio nunca ha dejado un artefacto en disco (búsqueda recursiva en D: sin resultados) y el 62% de los bytes almacenados no aparece en ninguna tabla, así que ni siquiera se sabría qué restaurar.

**Soberanía de datos: 15/100**
El expediente vive en un bucket llamado `yaser-pqt08-talara` dentro de un proyecto GCP derivado de una cuenta Gmail personal, con una clave de servicio en el portátil del desarrollador que abre todos los documentos sin pasar por la aplicación, sin ningún nivel de "entidad" en el modelo de datos y con `APP_SECRET`/`SESSION_PEPPER` existiendo sólo dentro de la cuenta de Render de una persona.

**Preparación institucional: 25/100**
La documentación para la entidad (docs/entidad/01 a 04) es honesta y declara sus propias carencias (RPO/RTO "no declarado", soporte de una sola persona sin suplente, objetos huérfanos), pero no hay administrador de la entidad, ni separación de funciones, ni revisión antes de desplegar, ni exportación del registro, ni un solo documento publicado del que enseñar su expediente completo.

## BRECHAS CRÍTICAS

**1. La credencial dueña de toda la base está publicada y sigue vigente**
- **Problema:** la contraseña del rol `postgres`, propietario de las 84 tablas, está incrustada en 7 ficheros rastreados por git y presentes en la rama desplegada de un repositorio público.
- **Evidencia encontrada:** `git grep -l -F <valor>` sobre `origin/main` devuelve `backend/clean_garbage.py`, `backend/clean_integral.py`, `backend/diagnose_full.py`, `backend/diagnose_views.py`, `backend/scratch.py`, `backend/scratch_audit.py`, `backend/test_full_flow.py`; el valor coincide byte a byte con `DB_PASS` del `.env` en uso (longitud 14). `DB_HOST` es una IP pública y viaja en los mismos ficheros. El dueño ha decidido por ahora no rotarla.
- **Riesgo:** lectura, modificación, `ALTER` y `DROP` de las 84 tablas de todas las obras sin tocar la aplicación y sin dejar rastro (`log_statement=none`, `cloudsql.enable_pgaudit=off`).
- **Consecuencia práctica:** el expediente de la entidad y su registro de auditoría pueden ser alterados o destruidos por cualquiera que lea el repositorio. Es observación automática y bloqueante en cualquier revisión de seguridad de la información.

**2. Lo corregido no está en producción**
- **Problema:** el sistema en vivo corre código anterior a todas las correcciones de seguridad.
- **Evidencia encontrada:** `git rev-list --count origin/main..main` = **26**; `origin/main` = 9e7fb24 (2026-08-09), local = 0cec363 (2026-08-12). `git cat-file -e origin/main:<f>` falla para `backend/acceso_a_blobs.py`, `sensibilidad.py`, `indice_expediente.py`, `registro_de_descargas.py`, `estados_ecd.py` e `idoneidad.py`. En el código desplegado persiste el fallo abierto: `git show origin/main:backend/routes/documents.py` línea 273 `if obra_real is None: return None   # el fichero no esta en el arbol: no hay obra que proteger`, con la consulta previa mirando sólo `file_nodes`.
- **Riesgo:** todo lo que se enseñe desde el repositorio describe un sistema distinto del que la entidad usaría; producción no registra ninguna entrega de documento y arrastra el fail-open.
- **Consecuencia práctica:** un auditor que compruebe el servicio en vez del código encuentra las guardias ausentes. Toda afirmación de "ya corregido" es falsa hasta el despliegue.

**3. El registro de auditoría no es prueba: es mutable y ya fue alterado**
- **Problema:** no hay inmutabilidad, ni separación de funciones, ni copia fuera del alcance de quien administra.
- **Evidencia encontrada:** en la base de producción, 0 políticas RLS (`pg_policies`), 0 disparadores no internos sobre `activity_log`, `auth_events`, `file_nodes` y `users`; la aplicación se conecta como `postgres`, dueño de esas tablas, con UPDATE/DELETE/TRUNCATE. `pg_stat_user_tables`: `auth_events` n_tup_ins=34, n_tup_del=2 (faltan exactamente los id 6 y 7, sin ninguna FK que explique cascada y sin ninguna sentencia en el repo que borre de esa tabla); `activity_log` n_tup_ins=1755, n_tup_upd=**552** sobre una tabla que el código vivo sólo inserta, con origen documentado en el commit 5343126 que retiró scripts con `UPDATE activity_log SET model_urn = ...`. Además `POST /api/docs/dev/wipe` (documents.py:1063-1064) ejecuta `TRUNCATE TABLE file_nodes CASCADE` y `TRUNCATE TABLE activity_log CASCADE` en la misma llamada, dejando como único rastro un `print`.
- **Riesgo:** no existe diferencia observable entre un registro intacto y uno manipulado.
- **Consecuencia práctica:** el registro no resiste la pregunta "quién pudo haberlo alterado". Un expediente de obra pública cuya integridad depende de la buena fe de una persona no es defendible ante Contraloría.

**4. No existe administrador de la entidad; el proveedor tiene privilegio total y no vigilado**
- **Problema:** el único administrador del sistema es el dueño del producto, y su alcance son todos los datos de todos los clientes.
- **Evidencia encontrada:** roles globales en `routes/auth.py:694` (user/editor/viewer/admin); `users` sin columna de entidad ni tenant y `project_users` sin columna de rol (esquema leído en Cloud SQL); tres capas independientes saltan la comprobación de obra para el admin: `auth_middleware.py:626`, `routes/documents.py:81`, `folder_permissions.py:99-102`. En producción: 1 admin y 4 `user`, 5 filas en `project_users`, 1 sola fila en `folder_permissions`. `hub_id` no interviene en ninguna decisión de permiso.
- **Riesgo:** el proveedor lee, cambia y borra todo por diseño; la entidad no puede nombrar a su propio administrador ni acotar al proveedor.
- **Consecuencia práctica:** la entidad no puede sostener ante OCI que ella es la custodia de su expediente digital; cualquier fuga es indistinguible de una acción legítima del proveedor.

**5. El proveedor puede abrir los documentos por fuera de la aplicación**
- **Problema:** una clave de servicio de larga vida abre el bucket completo sin sesión, sin permisos y sin registro.
- **Evidencia encontrada:** `backend/gcp_sa.json` (2.413 bytes, cuenta `visor-backend@correos-gmail-425301.iam.gserviceaccount.com`); con ella se listaron objetos del bucket de producción y se descargó íntegro un objeto de 288.262 bytes. `testIamPermissions` sobre el bucket: objects.list/get/create/update/**delete** concedidos. `blob.kms_key_name = None` en los objetos muestreados; cero líneas de KMS/CMEK en `backend/`. El proyecto GCP es `correos-gmail-425301`, derivado de una cuenta Gmail personal. La clave nunca estuvo en git (correctamente ignorada), así que la exposición es la copia local, no el repositorio.
- **Riesgo:** lectura, copia o borrado irreversible de cualquier documento de cualquier obra sin una sola línea en el registro de la plataforma.
- **Consecuencia práctica:** revocar el JSON no resolvería el requisito: el proyecto es del proveedor y puede emitir otra clave. El control sólo existiría si la entidad fuera titular del proyecto y del bucket.

**6. No se puede demostrar que un fichero es el que se aprobó**
- **Problema:** faltan las dos patas: huella de contenido y acto de aprobación ligado a una versión.
- **Evidencia encontrada:** consulta a `information_schema`: 0 columnas con hash/checksum/sha/md5 en `file_nodes` (26 columnas) ni en `file_versions` (13). En la base: `emitida_en` 0 filas, `codigo_idoneidad` 0, `codigo_revision` 0; la única revisión aprobada tiene items sin `version_id`, `cerrada_en` NULL y su primer evento con `"at": null`. El proyecto sí calcula SHA-256 para otro módulo (`lob4d_engine.py:28-43`, 6 de 6 filas de `lob_dataset_sources` con sha256).
- **Riesgo:** ante controversia contractual sólo cabe la palabra del operador de la plataforma.
- **Consecuencia práctica:** lo máximo sostenible hoy es "este objeto se subió el día X y sus bytes no han sido sustituidos" (por coincidencia entre `file_versions.created_at` y la `generation` de GCS, 40 de 40 casos), que no es lo que pide una supervisión.

**7. No hay copia de los ficheros, y la mayoría de los bytes no los conoce nadie**
- **Problema:** el almacén de 6,39 GB no tiene copia ni versionado, y el 62% de su volumen es invisible para la plataforma.
- **Evidencia encontrada:** inventario completo del bucket (6.093 objetos, 6,39 GB) cruzado contra las 63.212 cadenas distintas de todas las columnas de texto/json de las 84 tablas: **721 objetos con contenido, 3,95 GB, no aparecen en ninguna columna**, incluidos entregables con nomenclatura real de obra de 1.294,6 MB, 178,7 MB y 175,1 MB. El camino de copia propio (`backend/copia_de_seguridad.py`) no ha dejado artefacto: no existe la carpeta `copias/` ni ningún `ecd_*.copia.gz` en todo D:. `render.yaml` (41 líneas) no declara cron y no hay planificador en el código.
- **Riesgo:** pérdida irreversible de planos, modelos y fotografía de campo; y aunque hubiera copia, esos 3,95 GB no saldrían en ningún índice ni manifiesto.
- **Consecuencia práctica:** el RPO real de los ficheros es total, y una entrega del expediente sería incompleta sin que nadie pueda saber cuánto falta.

**8. El aislamiento entre obras depende de guardias escritas a mano, y la mayoría de rutas no las tiene**
- **Problema:** el control general está en modo registro y 113 rutas no comprueban pertenencia.
- **Evidencia encontrada:** `ENFORCE_PROJECT_AUTHZ` por defecto `false` (auth_middleware.py:352) y `AUTH_POLICY_MODE` por defecto `sombra` (politica.py:47); ninguna de las dos está declarada en `render.yaml`. 113 de 224 rutas en 25 módulos no llaman ni una vez a `verify_project_access` / `check_folder_permission` / `_require_admin` (digital_twin 17, compare 8, pins 7, geo_control 6, partidas 6, tracking 5, rfis 3, inventory 3...); ejemplo literal `rfis.py:8` es `GET /<path:model_urn>` con `SELECT ... WHERE model_urn = %s` sin comprobar nada. Además `db.resolve_project_id()` devuelve None para 'global', 'proyectos/1' y un tercer ámbito, y con None el middleware ni siquiera evalúa membresía, esté encendido o apagado.
- **Riesgo:** con una sesión válida de cualquier obra se leen RFIs, redlines, inventario de modelo (20.221 filas), pines, presupuesto, partidas y puntos geodésicos de otras obras. Los PDF y planos sí están protegidos por `verify_project_access`, que es fail-closed de verdad.
- **Consecuencia práctica:** activar el interruptor pendiente no basta; hay que escribir guardia en cada módulo y arreglar la resolución de ámbito.

**9. Sin segundo factor sobre la cuenta que puede destruir el expediente**
- **Problema:** el único factor es la contraseña, sobre la única cuenta con privilegio total.
- **Evidencia encontrada:** búsqueda ampliada (mfa|2fa|otp|totp|authenticator|challenge) en `backend/`, `frontend-docs/src` y `frontend-react/src`: el único resultado es el `CREATE TABLE otp_codes` de `esquema_base.py:622`, que ningún módulo lee ni escribe. Sesiones de 7 días (`auth_middleware.py:142`) en `localStorage` (`frontend-docs/src/utils/apiFetch.js:32`); 26 sesiones activas, 23 del único admin; la tabla `sessions` no guarda IP ni user-agent.
- **Riesgo:** aislado sería importante (hay scrypt, límites de intento y tokens en huella); combinado con el bucket sin copia y con `permanent-delete` (160 usos ya registrados) es crítico.
- **Consecuencia práctica:** una sola contraseña robada por phishing produce pérdida total e irrecuperable del expediente, sin detección posible.

## BRECHAS IMPORTANTES

**Secreto de cliente de Autodesk publicado y no rotado.** `.env` estuvo versionado de 8fb37b5 a fd9d4dd; `APS_CLIENT_ID` y `APS_CLIENT_SECRET` del `.env` actual son byte a byte los publicados. Riesgo: emisión de tokens contra la aplicación APS de la organización y consumo de la licencia anual. Consecuencia: coste y acceso a lo que esa aplicación tenga autorizado en ACC.

**Enlaces de descarga de 24 horas, portadores y no revocables.** `gcs_manager.py:131` (`expiration_minutes=60*24`); comprobado que un GET anónimo a esa URL devuelve 200 y el fichero. `documents.py:776-781` lo reconoce por escrito. Consecuencia: un permiso reenviable por WhatsApp que no vuelve a pasar por la plataforma y no deja rastro.

**La vía de subida principal no valida nada.** `/api/docs/upload-url` (documents.py:1341) firma un PUT con el contentType que declara el cliente y `/api/docs/upload-confirm` (documents.py:1378-1420) se cree `gcs_urn`, `size_bytes` y `mime_type` sin comprobar que el objeto exista, pese a su propio docstring. `file_validator.py` sólo se usa en la vía multipart antigua. Consecuencia: ficheros arbitrarios en el ECD y cuota de almacenamiento esquivable declarando tamaño 0.

**XSS almacenado en pines del visor.** `tracking.py:391-402` guarda `val` sin sanear y `frontend-react/src/aps/extensions/IconMarkupExtension.js:100` lo inyecta con `innerHTML`; `POST /api/project-pins` (tracking.py:265) no tiene guardia de obra y el token vive en `localStorage`. Consecuencia: robo de sesión de 7 días de quien abra el modelo.

**Ambiente único: desarrollo y producción comparten base.** Una sola base aplicativa (`postgres`, 236 MB, 84 tablas); la app en vivo escribe ahí (`users.last_login_at` de hoy) y a la vez se conectan portátiles por Internet. Peor: la columna `file_nodes.sensibilidad` existe en producción y sólo la crea `sensibilidad.py:85`, fichero que no está desplegado. Consecuencia: arrancar el backend en local altera el esquema de producción.

**Sin revisión antes de desplegar.** Sin `CODEOWNERS`, sin protección de rama, un solo autor, `render.yaml` sin `autoDeploy` ni `branch`. Consecuencia: un push llega a producción sin segunda firma; incompatible con la segregación de funciones que revisa OCI.

**CORS abierto en el servicio vivo.** `curl` con `Origin: https://sitio-malicioso.example` devuelve ese mismo origen en `Access-Control-Allow-Origin`; `render.yaml` declara `CORS_ORIGINS` pero para un servicio (`visor-aps-backend`) que no es el que corre (`visor-ecd-backend`). Impacto acotado porque la auth es Bearer y no hay `Allow-Credentials`, pero el perímetro declarado no es el real.

**Enumeración anónima de la cartera.** `/api/hubs` está en `PUBLIC_GET_PREFIXES` (auth_middleware.py:91-92); comprobado contra producción: HTTP 200 con el catálogo de cuentas Autodesk ACC, incluido el nombre "CONSORCIO S&P". `routes/projects.py:301` y `:398` tampoco exigen sesión. Consecuencia: mapa del sistema y `model_urn` (la clave de ámbito) accesibles sin cuenta.

**Tickets de traspaso con token en claro.** `auth_middleware.py:181-183` guarda `session_token` sin transformar en `handoff_tickets` (2 filas hoy), justo lo que el hasheo de `sessions` evita. Consecuencia: un volcado entrega sesiones utilizables por esa vía.

**Permiso de carpeta que no limita la lectura.** `file_system_db.py:159-161` fija siempre `perm_level='view_only'` y `has_access=True` para ficheros; `/api/docs/proxy` sólo comprueba membresía de obra. Consecuencia: el permiso restringe acciones, no confidencialidad frente a un miembro de la obra.

**Módulos de mantenimiento sin guardia efectiva.** `audit`, `diagnostics` y `photo_diag` están marcados `_ADMIN` sólo en `politica.py:208`, que en modo sombra no bloquea; `routes/audit.py:230-268` devuelve modelos, pines y evidencias de cualquier obra cambiando el parámetro `project`.

**Enlace de restablecimiento reutilizable.** El correo promete un solo uso (`routes/auth.py:412`) pero `enlaces_firmados.py:79-93` sólo valida firma y antigüedad y `reset_password` no lo invalida. La técnica correcta ya existe en la casa (`auth_middleware.py:243-263`).

**Concesión de accesos sin auditar.** `routes/auth.py:948-981` borra y reinserta toda la membresía de una obra sin registrar; `folder_permissions.py:229-239` y `:274-279` tampoco. `pg_stat`: 17 concesiones insertadas, 16 borradas, 1 viva. Consecuencia: no se puede reconstruir quién tuvo acceso a una obra en una fecha dada.

**Catálogos del padrón sin control de rol.** `DELETE /api/companies/<id>` (auth.py:879) y `/api/job_titles/<id>` (:914) sin comprobación de rol, con FK `ON DELETE SET NULL`. Consecuencia: cualquier sesión deja en blanco la empresa de todos los usuarios afectados.

**Espacio 'global' sin pertenencia.** `documents.py:69-70` devuelve True sin mirar nada; 8 fotografías reales de campo viven ahí y son descargables por cualquier cuenta. Varios endpoints usan 'global' por defecto cuando falta el parámetro.

**Límite de fuerza bruta multiplicado por 4.** Límites bien puestos (auth.py:282-284) pero almacén en memoria sin `REDIS_URL` y 4 workers de gunicorn. Consecuencia: ~32 intentos por minuto y cuenta; revocación de sesión con hasta 15 s de retardo.

**Piezas terminadas sin botón.** `/api/docs/indice-expediente`, `/api/docs/trazabilidad`, la configuración de nomenclatura y los tres endpoints de sensibilidad no tienen ni un llamador en `frontend-docs/src`; la pestaña "Informes" es un recuadro punteado (`FilesPage.jsx:348-355`) y la barra de almacenamiento está cableada al 15% (`FilesPage.jsx:409`). Consecuencia: para el cliente esas funciones no existen, y se le muestra una cifra inventada.

**Defecto con efecto sobre datos.** `tracking.py:296` llama `soft_delete_node(model_urn, orphan_path)` contra la firma `(node_id, model_urn, ...)` de `file_system_db.py:420`: la limpieza no limpia y devuelve True igualmente.

## CAPACIDADES YA RESUELTAS

- **SQL parametrizado sin excepción.** Revisado uno a uno cada f-string dentro de `execute()`: `compare.py:166-198`, `dashboards.py:162`, `partidas.py:157-172` (lista blanca) y `:135` (`cursor.mogrify`), `server.py:1256`, `file_system_db.py:99/116`. No hay un punto donde entrada de usuario llegue a SQL como cadena.
- **Tokens de sesión guardados como huella.** `auth_middleware.py:112-135` (HMAC-SHA256 con pimienta de entorno, leído hoy en el fichero); las filas de `sessions` miden 64 caracteres. `hash_de_token` está también en `origin/main`, es decir desplegado.
- **Contraseñas con scrypt.** `scrypt:32768:8:1` en las 3 cuentas con clave (consulta a `users`); login rechaza hash vacío (`routes/auth.py:308`).
- **`verify_project_access` es fail-closed de verdad.** `routes/documents.py:71-72`, `:84-85`, `:118-119` devuelven False sin identidad, sin user_id y ante error de base. No depende de `ENFORCE_PROJECT_AUTHZ`.
- **Los decoradores declarativos ya no son la única defensa.** Las 9 rutas con `@requiere_rol` tienen guardia efectiva dentro de la vista (`_require_admin` en `auth.py:72-89`, `_solo_admin` en `projects.py:51-60`, comprobación en línea en `documents.py:2081-2084` y `:856-859`). El arreglo del incidente del 07-ago (0891e78) **sí** está en `origin/main`.
- **Cabeceras de seguridad y TLS de borde, verificados contra producción.** 301 a https y `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` (`server.py:52-66`).
- **El bucket no está expuesto públicamente.** GET anónimo a un objeto: 403 AccessDenied; listado anónimo 401/403. El respaldo a `blob.public_url` (`gcs_manager.py:250`) devuelve 403: produce un enlace roto, no una fuga.
- **`gcp_sa.json` nunca se commiteó.** `git log --all -- backend/gcp_sa.json` vacío; cubierto dos veces en `.gitignore`.
- **PITR de Cloud SQL activo y comprobado dentro del motor.** `archive_mode='always'`, `archive_timeout='300'`, `pg_stat_archiver` con 49.608 WAL archivados y último 2026-08-13 00:18 UTC.
- **Restauración bien construida y de formato abierto.** `backend/restaurar.py` carga por nombre de columna, retira y repone claves ajenas y repone secuencias con savepoints; salida gzip con CSV por tabla más manifiesto JSON, legible sin la plataforma. Prueba documentada el 09-ago (78 tablas, 83.563 filas).
- **Consistencia interna del historial documental, limpia.** En producción: 0 nodos FILE sin fila de versión, 0 sin `current_version_id`, 0 desajustes entre `file_nodes.gcs_urn` y el de su versión vigente, 0 números de versión duplicados; 30 de 30 objetos muestreados presentes en el bucket con el tamaño declarado.
- **Subir una versión no sobrescribe la anterior y renombrar no toca el blob.** Claves con marca de tiempo y uuid (`documents.py:987`, `uploads.py:136`); `file_system_db.py:891-935` sólo hace UPDATE del nombre. Verificado que la V1 de un RFI sigue en el bucket con su propia generación.
- **Nomenclatura por obra calibrada y funcionando.** `nomenclatura_config` de `proyectos/PQT8_TALARA` con patrón propio y 18 extensiones exentas: 51 de 53 conformes, y las 2.756 fotos correctamente fuera de evaluación (NULL, no False).
- **El vocabulario de estados sí se migró en producción.** La base sólo contiene 'WIP' y 'SHARED': ni un 'ACTIVE', 'DRAFT', 'NON_CONFORMING', 'REVIEW' o 'APPROVED'.
- **El autor de las acciones sale de la sesión.** `documents.py:158-168` (`_autor_verificado`) y `estados_ecd.py:125-136`. La suplantación en el registro está cerrada para las acciones nuevas.
- **Desactivar a un usuario revoca acceso de verdad.** `auth.py:764` (`revoke_all_sessions`) más `COALESCE(u.is_active,TRUE)` en la validación de sesión (`auth_middleware.py:274-277`).
- **Enumeración de usuarios y CSRF: no expuestos.** Mismo mensaje para credencial mala y cuenta desactivada (`auth.py:311-315`), `forgot-password` idéntico exista o no la cuenta (`auth.py:375-380`); autenticación por cabecera Bearer, no por cookie.
- **`DEMO_TOKEN` apagado por defecto** (`auth_middleware.py:21`) y no declarado en `render.yaml`.
- **La documentación para la entidad no infla.** `docs/entidad/01` a `04` declaran RPO y RTO "no declarado", que el RPO real de los ficheros es total, que no hay suplente designado y que existen objetos huérfanos.
- **El cálculo de SHA-256 ya existe en la casa.** `lob4d_engine.py:28-43`; 6 de 6 filas de `lob_dataset_sources` con sha256 en la base. Aplicarlo a documentos es reutilizar, no desarrollar.

## NO VERIFICADO

- **Valores reales de las variables de entorno en el panel de Render:** `ENFORCE_PROJECT_AUTHZ`, `AUTH_POLICY_MODE`, `ALLOW_DEV_WIPE`, `ALLOW_DEMO_TOKEN`, `REDIS_URL`, `CORS_ORIGINS`, `STRICT_ISO_VISIBILITY`, `RESEND_API_KEY`. `render.yaml` no declara ninguna; todo lo afirmado sobre "modo sombra" se apoya en el defecto del código. Mientras no se compruebe, `/api/docs/dev/wipe` debe considerarse potencialmente activo.
- **Que Render despliegue exactamente `origin/main` de este repositorio, y con qué build corre el portal.** Se deduce de `render.yaml` y del estado del repositorio; no hay acceso al panel. Además `render.yaml` nombra un servicio (`visor-aps-backend`) que no es el vivo (`visor-ecd-backend`), así que ese fichero no gobierna el servicio real.
- **Configuración del bucket `yaser-pqt08-talara`:** versionado, soft-delete, reglas de ciclo de vida, retención, prevención de acceso público, acceso uniforme y clave KMS por defecto. `get_bucket()` devuelve 403 (`storage.buckets.get` no concedido); `list_buckets()` también 403.
- **Quién más tiene permisos IAM sobre el bucket y sobre el proyecto `correos-gmail-425301`.** Mismo 403. Desde dentro del sistema nadie puede producir la lista de quién puede leer los documentos, que es justo lo que pediría una auditoría.
- **Si los registros de acceso a datos de Cloud Storage están activados.** Por defecto en GCP están apagados para lectura de objetos; no consultable con las credenciales disponibles. Si están apagados, el acceso con la clave de servicio no deja rastro en ningún sitio.
- **Copias automáticas de Cloud SQL: existencia, ventana y retención.** `sqladmin.instances().list()` devuelve 403 y `gcloud` no está instalado. Sólo se verificó el archivado WAL, que es condición necesaria del PITR pero no prueba la retención.
- **Redes autorizadas exactas de Cloud SQL (0.0.0.0/0 frente a lista blanca).** La conexión externa comprobada sale de esta misma máquina, así que es prueba circular. La apertura a Internet queda sin demostrar; el propio repositorio lo marca pendiente en `docs/entidad/01-ficha-tecnica-y-de-datos.md:222-224`.
- **Cifrado en reposo de Cloud SQL y si usa CMEK.** No consultable; sólo se verificó el TLS de la conexión con `pg_stat_ssl`.
- **Retención, propiedad y acceso de los registros de Render y de Cloud Logging.** `app_logging.py` escribe a stdout sin sink externo; todo el rastro de un `dev/wipe` viviría sólo ahí.
- **Si el proveedor de correo está configurado en producción.** Si no lo está, `backend/mailer.py:43-46` escribe el enlace de restablecimiento completo en el log del servidor.
- **Qué modificó la metadata de los objetos del bucket en mayo y agosto de 2026** (metageneration 2-4 con la generación intacta). Sin registros de acceso a datos no es atribuible.
- **Quién borró las filas 6 y 7 de `auth_events`, cuándo y qué contenían**, y cuántos de los 552 UPDATE sobre `activity_log` corresponden a los scripts documentados. Esa imposibilidad **es** el hallazgo, no una limitación de esta revisión.
- **Si un usuario no administrador puede efectivamente leer datos de otra obra en producción.** Sólo se dispone de la sesión del único admin, que por diseño hace bypass; no se crearon usuarios ni sesiones (regla de sólo lectura). La afirmación se sostiene en evidencia de código, no en una prueba ejecutada.
- **Presencia de GPS en el EXIF de las 2.756 fotos.** Confirmado que no hay columna de GPS en la base y que son 2.756 imágenes vivas; el dato del EXIF viene de un muestreo previo de 6 ficheros, no repetido aquí.
- **Si el segundo repositorio público (VISOR_ECD) contiene el secreto en algún punto de su historial.** Su HEAD no lo sirve; no se rastreó commit a commit.
- **Si el `.env` que usa Render contiene el mismo `APS_CLIENT_SECRET` publicado.** Sólo se verificó que el `.env` de trabajo local es idéntico al commiteado.

## MATRIZ

| Área | Requisito | Estado | Evidencia real | Riesgo | Prioridad |
|---|---|---|---|---|---|
| 1. Arquitectura e infraestructura | Servicios identificados y perímetro TLS correcto | CUMPLE | curl a `/api/health` de los 3 servicios (200); HSTS/nosniff/X-Frame/Referrer en `server.py:52-66`; 301 a https | Bajo | Después |
| 1. Arquitectura e infraestructura | Recursos cloud bajo identidad institucional, sin claves de larga vida | NO CUMPLE | `GCP_PROJECT_ID=correos-gmail-425301` (derivado de Gmail personal); `gcs_manager.py:5-26` vía `gcp_sa.json` | Dependencia de una cuenta personal para todo el almacenamiento | Antes de ofrecer |
| 1. Arquitectura e infraestructura | La IaC refleja la configuración real | NO CUMPLE | `render.yaml:3` nombra `visor-aps-backend`; el servicio vivo se identifica `visor-ecd-backend`; CORS abierto comprobado por curl | El repositorio no es fuente de verdad reproducible | Antes del piloto |
| 2. Ambientes y despliegue | Separación desarrollo / producción | NO CUMPLE | Una sola base aplicativa (236 MB, 84 tablas); `file_nodes.sensibilidad` existe en producción y sólo la crea `sensibilidad.py:85`, no desplegado | Un arranque local altera el esquema de producción | Antes del piloto |
| 2. Ambientes y despliegue | Revisión y control antes de producción | NO CUMPLE | Sin `CODEOWNERS` ni protección de rama; un solo autor; `render.yaml` sin `autoDeploy`/`branch` | Push directo a producción sin segunda firma | Antes del piloto |
| 2. Ambientes y despliegue | Lo corregido está desplegado | NO CUMPLE | `git rev-list --count origin/main..main` = 26; 6 módulos de seguridad ausentes en `origin/main`; fail-open vivo en `origin/main:documents.py:273` | Producción no tiene las correcciones que se presentan como hechas | Antes de ofrecer |
| 3. Identidad y autenticación | Contraseñas y sesiones bien tratadas | CUMPLE | scrypt:32768:8:1 en las 3 cuentas con clave; HMAC-SHA256 con pimienta en `auth_middleware.py:112-135` | Bajo | Después |
| 3. Identidad y autenticación | Segundo factor para cuentas con privilegio | NO CUMPLE | Cero resultados de mfa/2fa/otp/totp fuera del `CREATE TABLE otp_codes` de `esquema_base.py:622`; 23 sesiones de 7 días del único admin | Una contraseña robada = destrucción irrecuperable | Antes de ofrecer |
| 3. Identidad y autenticación | Enlace de restablecimiento de un solo uso | NO CUMPLE | `auth.py:412` lo promete; `enlaces_firmados.py:79-93` y `auth.py:427-470` no lo invalidan | Toma de cuenta dentro de la hora de vigencia | Antes del piloto |
| 4. Autorización y aislamiento | Administrador de la entidad distinto del proveedor | NO CUMPLE | `auth.py:694` roles globales; `project_users` sin columna de rol; bypass admin en `auth_middleware.py:626`, `documents.py:81`, `folder_permissions.py:99` | El proveedor es dueño de todos los datos de todos los clientes | Antes de ofrecer |
| 4. Autorización y aislamiento | La autorización por obra bloquea, no sólo registra | NO CUMPLE | `auth_middleware.py:352` (`false`), `politica.py:47` (`sombra`), ninguna declarada en `render.yaml`; 113 de 224 rutas sin guardia propia | Lectura de datos de obras ajenas por 113 rutas | Antes de ofrecer |
| 4. Autorización y aislamiento | Aislamiento de los bytes documentales | PARCIAL | `verify_project_access` fail-closed (`documents.py:71,84,118`) y `acceso_a_blobs.py` en disco; pero `origin/main:documents.py:273` sigue fail-open | Versiones históricas y adjuntos fuera de `file_nodes` alcanzables en producción | Antes de ofrecer |
| 4. Autorización y aislamiento | Aislamiento defendido en la capa de datos | NO CUMPLE | `pg_policies` = 0; ninguna tabla con RLS; 59 de 84 tablas sin columna de ámbito; `model_urn` es texto sin FK | Un fallo de la app no encuentra ninguna barrera debajo | Durante el piloto |
| 4. Autorización y aislamiento | Sin enumeración anónima de la cartera | NO CUMPLE | `/api/hubs` en `PUBLIC_GET_PREFIXES` (auth_middleware.py:91-92); comprobado 200 con cuentas ACC; `projects.py:301`, `:398` sin sesión | Mapa del sistema y `model_urn` accesibles sin cuenta | Antes de ofrecer |
| 5. Cifrado y claves | Cifrado en tránsito hacia la base | PARCIAL | `pg_stat_ssl`: TLSv1.3 hoy; pero `db.py:22-40` sin `sslmode` (psycopg2 cae a `prefer`, sin validar certificado) | Depende de la cortesía del servidor, no de política del cliente | Antes del piloto |
| 5. Cifrado y claves | Cifrado gestionado por el cliente (CMEK/KMS) | NO CUMPLE | `blob.kms_key_name = None` en los objetos muestreados; cero resultados de kms/cmek en `backend/` | Google posee las claves; sin separación de custodia | Antes del piloto |
| 5. Cifrado y claves | Secretos de producción fuera de repositorios accesibles | NO CUMPLE | 7 ficheros de `origin/main` con la contraseña viva del rol dueño (verificado por `git grep -F`); `APS_CLIENT_SECRET` idéntico al publicado | Control total de la base y de la licencia APS | Antes de ofrecer |
| 5. Cifrado y claves | Enlaces de descarga cortos, revocables y trazables | NO CUMPLE | `gcs_manager.py:131` 24 h; GET anónimo devuelve 200 y el fichero; `documents.py:776-781` lo reconoce | Permiso portable de 24 h fuera de la plataforma | Antes del piloto |
| 6. Trazabilidad y auditoría | Registro inmutable o alteración detectable | NO CUMPLE | 0 políticas RLS, 0 disparadores no internos; `postgres` dueño con UPDATE/DELETE/TRUNCATE sobre `activity_log` y `auth_events` | El registro no es prueba | Antes de ofrecer |
| 6. Trazabilidad y auditoría | El registro no ha sido alterado | NO CUMPLE | `pg_stat_user_tables`: `auth_events` n_tup_del=2 (faltan id 6 y 7, sin FK que lo explique); `activity_log` n_tup_upd=552 sobre tabla que sólo se inserta | Historial ya modificado sin constancia | Antes de ofrecer |
| 6. Trazabilidad y auditoría | Registro de quién accede o descarga cada documento | NO CUMPLE | `registro_de_descargas.py` no existe en `origin/main`; 17 filas de `acceso_a_documento`, todas de pruebas locales | Ninguna respuesta a "quién se llevó este plano" | Antes de ofrecer |
| 6. Trazabilidad y auditoría | Cada línea identifica a la persona y al documento | NO CUMPLE | `activity_log`: 1.034 filas, 315 sin autor, 709 sin `entity_id`; `performed_by` texto libre sin FK | No repudio inexistente para un tercio del registro | Antes del piloto |
| 6. Trazabilidad y auditoría | La entidad puede consultar y llevarse su registro | PARCIAL | `/api/activity` con tope 200 (`documents.py:1685-1706`), `/api/auth/events` tope 500; sin exportación ni firma | Requerimientos de OCI sólo atendibles por consulta SQL del proveedor | Antes del piloto |
| 7. Integridad y versionado | Huella criptográfica de cada documento y versión | NO CUMPLE | 0 columnas hash/checksum/sha/md5 en `file_nodes` (26) y `file_versions` (13), leído de `information_schema` | Modificación de contenido indetectable | Antes de ofrecer |
| 7. Integridad y versionado | Acto de aprobación fechado y ligado a una versión | NO CUMPLE | `emitida_en` 0 filas, `codigo_idoneidad` 0, `codigo_revision` 0; la única revisión aprobada sin `version_id` ni fecha | No se puede demostrar "esto es lo que se aprobó el día X" | Antes de ofrecer |
| 7. Integridad y versionado | Consistencia interna del historial | CUMPLE | 0 nodos sin versión, 0 sin `current_version_id`, 0 desajustes de `gcs_urn` ni de numeración; 30/30 objetos presentes con tamaño correcto | Bajo | Después |
| 7. Integridad y versionado | Lo registrado es lo realmente almacenado | NO CUMPLE | `documents.py:1378-1420` acepta `gcs_urn`, `size_bytes` y `mime_type` del cliente sin comprobar existencia ni pasar por `file_validator` | Ficheros arbitrarios y cuota esquivable | Antes del piloto |
| 8. Gestión de información ISO 19650 | Información en estados utilizables, no sólo WIP | NO CUMPLE | Consulta a producción: WIP 2.823, SHARED 1, PUBLISHED 0, ARCHIVED 0; `emitida_en` 0 | El ciclo de vida es capacidad, no práctica | Antes de ofrecer |
| 8. Gestión de información ISO 19650 | Módulo de idoneidad operativo | NO CUMPLE | `idoneidad_catalogo` no existe en producción (se crea de forma perezosa en `idoneidad.py:63-74`) | El camino completo no se ha ejecutado nunca fuera de las pruebas | Antes de ofrecer |
| 8. Gestión de información ISO 19650 | Índice del expediente accesible para el cliente | NO CUMPLE | `documents.py:2676` e `indice_expediente.py` correctos, pero cero llamadores en `frontend-docs/src`; "Informes" es un placeholder (`FilesPage.jsx:348-355`) | La entidad no puede sacar la relación de lo entregado | Antes de ofrecer |
| 8. Gestión de información ISO 19650 | Nomenclatura configurable y calibrada por obra | PARCIAL | Motor y configuración reales (51/53 conformes, 2.756 fotos exentas); pero `PUT /api/docs/nomenclatura` sin llamador en el portal | Sólo configurable por API | Durante el piloto |
| 8. Gestión de información ISO 19650 | Separación de roles autor / revisor / aprobador | NO CUMPLE | `MatrixTable.jsx:46,68` sólo abre el cambio de estado a admin; 1 admin y 4 `user`; 1 sola fila en `folder_permissions` | Una persona mueve todo el ciclo | Antes del piloto |
| 9. Seguridad de la información (19650-5) | La clasificación bloquea la salida del ECD | NO CUMPLE | `puede_salir_del_ecd` (`sensibilidad.py:195`) sólo aparece en su módulo y en su test; `triaje_seguridad` 0 filas; `sensibilidad` NULL en todos los nodos | Un documento crítico sale igual que uno público | Antes de ofrecer |
| 9. Seguridad de la información (19650-5) | Los datos no salen a terceros sin control | NO CUMPLE | `docs_cad.py:128-171` sube modelos a Autodesk con `policyKey: 'persistent'` (`:100`), sin consultar sensibilidad | Copia legible e indefinida fuera del país | Antes de ofrecer |
| 10. Continuidad y copias | Recuperación a un punto en el tiempo de la base | CUMPLE | `pg_settings` archive_mode=always, archive_timeout=300; `pg_stat_archiver` 49.608 WAL, último 2026-08-13 00:18 UTC | Bajo | Después |
| 10. Continuidad y copias | Copia de los ficheros con periodicidad y retención | NO CUMPLE | Bucket 6,39 GB sin copia ni versionado; sin artefacto de `copia_de_seguridad.py` en todo D:; sin cron en `render.yaml` ni planificador en el código | RPO de los ficheros: total | Antes de ofrecer |
| 10. Continuidad y copias | Copia separada de lo que copia | NO CUMPLE | No existe copia; todo en el proyecto `correos-gmail-425301`; `docs/copias-y-restauracion.md` lo declara pendiente | Un solo evento de cuenta alcanza base, ficheros y copias | Antes de ofrecer |
| 10. Continuidad y copias | Restauración probada | PARCIAL | `docs/copias-y-restauracion.md` prueba del 09-ago (78 tablas, 83.563 filas) del camino propio, cuyo fichero de copia no existe hoy; el PITR no consta probado | Se probó el camino sin copia y no el camino con copia | Antes del piloto |
| 11. Soberanía y portabilidad | El proveedor no puede abrir unilateralmente los documentos | NO CUMPLE | `gcp_sa.json` vivo (token acuñado el 12-ago); listado y descarga íntegra de un objeto sin sesión; `objects.delete` concedido | Lectura y borrado sin rastro en la plataforma | Antes de ofrecer |
| 11. Soberanía y portabilidad | El almacén contiene sólo información atribuible a una obra | NO CUMPLE | 721 objetos / 3,95 GB (62% de los bytes) sin correspondencia en ninguna columna de las 84 tablas; 837 objetos en la raíz con UUID desnudo | Volumen invisible: ni indexable ni entregable ni borrable | Antes de ofrecer |
| 11. Soberanía y portabilidad | Existe una frontera entre entidades (multi-tenant real) | NO CUMPLE | `hub_id` no aparece en `auth_middleware.py`, `politica.py` ni `folder_permissions.py`; 9 obras en el mismo hub; `users` sin columna de entidad | "Municipalidad" es una etiqueta visual, no un límite | Antes del piloto |
| 11. Soberanía y portabilidad | La entidad puede recuperar sus llaves y operar sin el proveedor | NO CUMPLE | `APP_SECRET` y `SESSION_PEPPER` con `generateValue: true` en `render.yaml`; `docs/entidad/04` §10.1: una persona concentra los cuatro caminos, "Suplente designado: No existe" | Sin esas llaves la plataforma no es operable por la entidad | Antes de ofrecer |
| 11. Soberanía y portabilidad | Salida del expediente completa y con metadatos ISO | PARCIAL | Formato correcto (xlsx sin fórmulas), pero filtra por un solo `model_urn` y PQT8_TALARA vive en tres ámbitos (53+182+102); por defecto devuelve 1 fila | La entidad se llevaría un índice prácticamente vacío | Antes del piloto |
| 12. Datos personales y superficie de ataque | Inventario y control técnico de datos personales | PARCIAL | Barrido de las 84 tablas: sin DNI, teléfono, dirección, firma ni GPS; sí 5 personas en `users`, 32 eventos con IP y user-agent, 2.756 imágenes de campo entregadas con su EXIF íntegro | El grueso del dato personal está dentro de los ficheros, no en columnas | Antes del piloto |
| 12. Datos personales y superficie de ataque | Sin inyección SQL | CUMPLE | Revisión uno a uno de los f-string en `execute()`: `compare.py:166-198`, `dashboards.py:162`, `partidas.py:135,157-172`, `server.py:1256`, `file_system_db.py:99/116` | Bajo | Después |
| 12. Datos personales y superficie de ataque | El contenido de un usuario no se ejecuta en el navegador de otro | NO CUMPLE | `tracking.py:391,402` guardan `val` sin sanear; `IconMarkupExtension.js:100` lo inyecta con `innerHTML`; token en `localStorage` | Robo de sesión de 7 días | Antes del piloto |
| 12. Datos personales y superficie de ataque | Restricción de orígenes (CORS) en producción | NO CUMPLE | Petición con `Origin` ajeno devuelve ese mismo origen en `Access-Control-Allow-Origin`; `CORS_ORIGINS` declarada para un servicio que no es el vivo | Impacto acotado (Bearer, sin `Allow-Credentials`), perímetro real distinto del declarado | Antes del piloto |

## LAS CINCO PREGUNTAS

**1. ¿Ofrecerías HOY este ECD a una municipalidad para un piloto controlado?**
**No.** No por la madurez funcional, que para un piloto sería suficiente, sino por tres hechos que no admiten matiz: la contraseña del rol dueño de las 84 tablas es descargable hoy desde un repositorio público y sigue vigente; los 6,39 GB de ficheros no tienen copia ni versionado, con `permanent-delete` ya usado 160 veces; y el sistema que la municipalidad usaría está 26 commits por detrás del que se le enseñaría. Con cuatro cambios acotados (rotar esa credencial y purgar los 7 ficheros, desplegar `origin/main` al día, activar versionado y copia del bucket, y poner MFA sobre la cuenta admin) la respuesta pasaría a sí para un piloto sin información sensible y con la clasificación 19650-5 declarada como no operativa.

**2. ¿Ofrecerías HOY este ECD como repositorio oficial institucional de información crítica?**
**No, y no está cerca.** Un repositorio oficial exige tres cosas que hoy no existen en ninguna forma: que el registro de auditoría sea prueba (no lo es: es reescribible por la credencial de la aplicación y hay evidencia dura de que ya se reescribió y se borraron dos filas), que se pueda demostrar que un fichero es el que se aprobó (no hay hash ni acto de aprobación fechado: 0 emisiones sobre 2.830 versiones), y que la entidad sea custodia de sus datos (el bucket vive en un proyecto derivado de una cuenta Gmail personal, con una clave de servicio que abre todo sin pasar por la aplicación). Además el expediente real todavía no está dentro: `backend/cotejar_midp.py:6-9` registra que de 282 planos aprobados del MIDP, cero estaban en el ECD.

**3. Las 5 brechas de mayor riesgo PARA LA ENTIDAD**
1. **Credencial de base pública y vigente** — cualquiera puede leer, alterar o destruir el expediente y su auditoría sin vulnerar la aplicación.
2. **Auditoría no inmutable y ya alterada** — nada de lo registrado sirve como evidencia ante OCI o Contraloría, porque no resiste "quién pudo haberlo modificado".
3. **Sin copia ni versionado de los ficheros, con borrado permanente irreversible y sin MFA** — un error o una contraseña robada producen pérdida definitiva de planos y evidencia de campo.
4. **El proveedor es administrador total y puede abrir los documentos por fuera de la plataforma** — la entidad no puede afirmar que controla quién accede a su expediente técnico.
5. **Sin huella de integridad ni aprobación ligada a versión** — ante una controversia contractual no hay forma de probar qué se entregó, cuándo y con qué idoneidad.

**4. Las 5 mejoras que más confianza dan con el menor cambio arquitectónico**
1. **Rotar la contraseña de Postgres, borrar los 7 scripts del repositorio y crear un rol de aplicación distinto del dueño de las tablas, sin permiso de UPDATE/DELETE sobre `activity_log` y `auth_events`.** Es configuración y un `GRANT`; convierte dos críticos en manejables.
2. **Calcular y guardar SHA-256 en cada subida.** El código ya existe y funciona (`lob4d_engine.py:28-43`); es añadir una columna a `file_versions` y llamar a lo que ya hay. Habilita todo el discurso de integridad.
3. **Activar versionado y una copia programada del bucket, y desplegar `origin/main` al día.** Ninguna decisión de diseño: una casilla en GCP, un cron y un push.
4. **Bajar las URLs firmadas de 24 h a minutos y registrar toda emisión, incluida `download_folder_urls`.** Un parámetro (`gcs_manager.py:131`) y una llamada a `registrar()` en la ruta que hoy es la única que no la hace.
5. **Añadir la columna `rol` a `project_users` y un segundo factor sobre las cuentas admin.** Es el mínimo que permite existir a un "administrador de la entidad" y cierra el escenario de la credencial robada; el nivel `admin` de `folder_permissions` demuestra que la plataforma ya sabe acotar por obra.

**5. ¿Qué preguntas importantes todavía NO podríamos responder con evidencia?**
- **¿Quién puede leer los documentos de esta obra?** No se puede producir esa lista: la política IAM del bucket y del proyecto no es legible ni siquiera desde dentro del sistema (403 en `storage.buckets.get` y en `list_buckets`).
- **¿Quién descargó este plano y cuándo?** En producción no existe una sola línea que lo diga; las 17 que hay son ejecuciones locales del propio dueño.
- **¿Quién borró las filas 6 y 7 del registro de accesos, y quién ejecutó los 552 UPDATE sobre el registro de actividad?** No hay ningún dato que lo responda, ni en la base ni en el código.
- **¿Este PDF es exactamente el que se aprobó el día X?** No hay hash registrado ni acto de aprobación ligado a una versión.
- **¿Qué son los 3,95 GB que no aparecen en ninguna tabla, de qué obra son y quién puede verlos?** El 62% de los bytes almacenados no tiene dueño conocido.
- **¿Qué revisión exacta corre producción y qué variables tiene puestas?** Sin acceso al panel de Render no se puede afirmar si `ENFORCE_PROJECT_AUTHZ`, `AUTH_POLICY_MODE` o `ALLOW_DEV_WIPE` están puestas, y `render.yaml` no gobierna el servicio vivo.
- **¿Existen copias automáticas de Cloud SQL, con qué ventana y qué retención, y quién puede borrarlas?** Sólo consta el archivado WAL desde dentro del motor.
- **¿Deja rastro en Google el acceso hecho con la clave de servicio?** Depende de si los registros de acceso a datos están activados, y eso no es consultable con las credenciales disponibles; por defecto en GCP están apagados.
- **¿Desde qué redes acepta conexiones la base?** La única conexión externa comprobada sale de esta misma máquina, así que la lista de redes autorizadas queda sin verificar.
- **¿Puede un usuario no administrador leer datos de otra obra en el sistema en marcha?** La conclusión se apoya en lectura de código y consultas a la base, no en una prueba ejecutada: sólo se dispone de la sesión del único admin, que por diseño hace bypass.