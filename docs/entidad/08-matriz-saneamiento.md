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
| **C6** | No se puede demostrar que un fichero es el que se aprobó | no se calcula ni guarda huella del contenido | **MITIGADO** | `file_versions.sha256` + `huella_en`, sellado en la subida directa y en la troceada (desde el almacén), y la promoción de versión arrastra la huella. Nunca se sobrescribe una huella ya puesta. Residual: **las versiones anteriores al cambio no tienen huella** y no se ha ejecutado el repaso hacia atrás |
| **C7** | No hay copia de los ficheros; la mayoría de los bytes no los conoce nadie | bucket sin versionado ni copia; sin conciliación BD↔almacén | **ABIERTO** | 721 objetos / 3,95 GB sin correspondencia. Hecho: `conciliacion_almacen.py` cruza las **8** columnas que apuntan a objetos y mira las dos direcciones (sobra / **falta**), sin borrar nada; 12 pruebas. Falta lo que de verdad cierra el hallazgo: **versionado y copia del bucket** (consola de Google) y ejecutar la conciliación contra el bucket real |
| **C8** | El aislamiento entre obras depende de guardias a mano | control transversal apagado (`ENFORCE_PROJECT_AUTHZ=false`) | **MITIGADO** | 21 guardias corregidos + 9 prefijos vigilados + fuga de bytes cerrada; `complete_upload` aceptaba subir a una obra ajena y ahora comprueba acceso; barrido de las 222 rutas convertido en prueba permanente con 15 excepciones escritas una a una. Residual: falta desplegar y encender `ENFORCE_PROJECT_AUTHZ` |
| **C9** | Sin segundo factor sobre la cuenta que puede destruir el expediente | no implementado | **MITIGADO** | TOTP RFC 6238 sin dependencia nueva, con los 5 vectores oficiales verificados; ciclo alta/canje/baja + codigos de recuperacion de un solo uso; pantalla de codigo en el acceso y panel de Seguridad en el portal. 37 pruebas. Residual: **nadie lo tiene activado todavia**, y `EXIGIR_2FA_ESTRICTO` sigue apagado |

---

## Hallazgos nuevos del saneamiento

| ID | Hallazgo | Origen | Estado | Evidencia |
|---|---|---|---|---|
| **N1** | `render.yaml` no gobierna el despliegue: declara otro servicio y otros comandos | lectura del panel real | **CERRADO** *(documentado)* | servicio real `visor-ecd-backend`, build `yarn`, start `yarn start` |
| **N2** | Alembic **nunca** se ejecuta en producción | `startCommand` real | **ABIERTO** | el esquema lo construye únicamente el DDL en caliente |
| **N3** | `SESSION_PEPPER` y `APP_SECRET` no existen en producción | panel de Render | **ABIERTO** | la pimienta efectiva es la constante pública `'sin-pimienta'` |
| **N4** | CORS abierto (`*`) en producción | falta `CORS_ORIGINS` | **ABIERTO** | `server.py:48` |
| **N5** | El entorno local podía escribir en el bucket de producción | credencial de servicio compartida | **CERRADO** | sin credencial en local; escritura al bucket real falla con `DefaultCredentialsError` (13-ago) |
| **N6** | DDL ejecutado en caliente en 237 sentencias, 8 de ellas en caminos HTTP | el esquema se construye solo | **MITIGADO** | interruptor `DDL_EN_CALIENTE` + bootstrap; arranque local en 0,0 s sin DDL. Falta producción |
| **N7** | `CREATE TABLE sessions` en **cada login** | DDL en el camino más caliente | **MITIGADO** | condicionado al interruptor; falta producción |
| **N8** | Cloud SQL aplica política de contraseñas por SQL | canario 13-ago | **CERRADO** *(incorporado al guion)* | `CREATE ROLE` sin símbolo es rechazado |
| **N9** | Las 34 secuencias son dependientes: su propiedad viaja con la tabla | canario 13-ago | **CERRADO** *(guion corregido)* | `ALTER SEQUENCE` sobra y aborta el guion |
| **N10** | PostgreSQL 16+ exige ser miembro del rol destino para ceder propiedad | canario 13-ago | **CERRADO** *(guion corregido)* | falta `GRANT ecd_migrator TO postgres WITH SET TRUE` |
| **N11** | El schema `public` es de `pg_database_owner`: hay que transferirlo primero | canario 13-ago | **CERRADO** *(guion corregido)* | orden correcto demostrado: 14/14 |
| **N12** | La cuarentena de nomenclatura mentía sobre 51 de 52 documentos | marca no recalculada al cambiar el patrón | **CERRADO** | `recalcular_obra()` + 3 pruebas; recalculado en producción |
| **N13** | El recolector de fotos huérfanas no borra nada (argumentos invertidos) | `tracking.py:296` | **CERRADO** | eran dos fallos: los argumentos invertidos (no borraba) **y la anotación en el registro de actividad, que se escribía igualmente** — el expediente afirmaba borrados que nunca ocurrieron. Lo segundo se corrige siempre; lo primero queda tras `PURGA_FOTOS_HUERFANAS` (apagado = comportamiento real de hoy) y con tope de 25, porque una sincronización sin `fotos` dejaría huérfana toda la obra. 8 pruebas |
| **N17** | `reconcile_storage.py` borraba del bucket todo lo que no estuviera en 2 de las 8 columnas que apuntan a objetos | conciliador escrito contra una lista incompleta | **CERRADO** | con `--force` habría borrado **todas las fotografías de obra**, las fuentes de datos 4D, las miniaturas y los logotipos. Retirado y sustituido por `conciliacion_almacen.py`, que se niega a correr si aparece una columna sin declarar |
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
