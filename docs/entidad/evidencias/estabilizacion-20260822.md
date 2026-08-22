# Evidencia — bloque de estabilización · 22-ago-2026 (16:20–17:40 UTC)

## Producción durante el bloque

```
/api/health          status:ok · configuración 6/6 · a4ddfab1472f (estable toda la ventana)
5xx                  ninguno · reinicios: ninguno
conexiones BD        3 de ecd_app · 0 de postgres
integridad           25 RFIs · 33 Red Lines · 1 transmittal contractual · 2854 versiones
```

Los 403 observados (`PROJECT_UNRESOLVED`, `PROJECT_FORBIDDEN`, `ROL_INSUFICIENTE`)
son pruebas negativas propias, no incidentes.

## Copia fresca posterior a los cambios

La copia anterior (`ecd_20260822_003443`) era de ANTES de la estabilización, así
que no contenía `project_ref` sembrado. Se toma una nueva:

```
ecd_20260822_163754.copia.gz   14,7 MB
autocomprobación:  90 tablas · 83.574 filas · todas cuadran
```

**Verificación independiente** — se abre el fichero y se cuentan las filas reales,
sin fiarse del informe de quien la creó:

```
tablas en la copia: 90
  activity_log     1090      file_nodes         3062
  doc_redlines       34      file_versions      2854
  doc_reviews         2      folder_permissions    2
  doc_rfis           26      project_ref          27   ← la siembra, dentro
  encargos            3      project_users         7
  transmittals        2      users                 7
desajustes cabecera vs contenido: NINGUNO
```

Cuadra con producción (25 RFIs reales + 1 de prueba = 26; 33 RL + 1 = 34).

**El ensayo de restauración NO se ejecutó**: exige la contraseña del `postgres`
local (`scram-sha-256` en `pg_hba.conf`), que el asistente no maneja. Queda como
acción menor del propietario. Lo demostrado hoy es que **la copia es completa y
legible**, no que se cargue en un clúster vivo — la distinción importa.

## Endpoints nuevos, ejercitados en producción por su camino negativo

Con sesión de miembro raso (id 19), sin escribir una sola fila:

```
POST /api/users/18/reinvitar   → 403 ROL_INSUFICIENTE
POST /api/users/21/reactivar   → 403 ROL_INSUFICIENTE
GET  /api/users                → 200 · 5 personas · SOLO campos [id, name]
```

Las dos rutas desplegadas ayer existen y niegan **antes** de escribir. Y el padrón
se recorta de verdad: ni correos, ni empresas, ni roles — la lista de phishing no
sale por ahí.

## El miembro en la obra REAL, tras sembrar `project_ref`

Sesión 19 (miembro de la obra `1`, sin administración), contra
`proyectos/PQT8_TALARA`:

```
/api/docs/list          200      /api/transmittals       200 · 1 (el contractual)
/api/rfis               200      /api/docs/idoneidad     200 · 13 códigos
/api/redlines           200      /api/projects/1/mi-administracion
                                   → es_admin_de_obra:false · es_entity_admin:false
```

Entra como miembro y **solo** como miembro. Es la contrapartida del `403
PROJECT_FORBIDDEN` de la obra ajena: el resolver traduce, la membresía decide, y
la administración no se regala.

## Las 4461 filas `global`

Auditadas en solo lectura → [doc 67](../67-auditoria-global-4461.md). Sin migrar
ni borrar nada.
