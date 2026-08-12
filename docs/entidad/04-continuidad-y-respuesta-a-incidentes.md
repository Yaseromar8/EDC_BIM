# Continuidad del servicio y respuesta a incidentes

**Documento 04 · Version 1.0 - borrador**

| | |
|---|---|
| Plataforma | Entorno Comun de Datos (ECD) — portal documental, visor 3D y modulos de obra |
| Version del documento | **1.0 - borrador** |
| Fecha de emision | [PENDIENTE: fecha] |
| Fecha de la ultima revision | [PENDIENTE: fecha] |
| Proxima revision comprometida | [PENDIENTE: periodicidad de revision a comprometer con la Entidad] |
| Razon social del proveedor | [PENDIENTE: razon social] |
| RUC | [PENDIENTE: RUC] |
| Domicilio fiscal | [PENDIENTE: domicilio fiscal] |
| Responsable de continuidad | [PENDIENTE: nombre, cargo, correo, telefono] |
| Suplente designado | **No existe.** Ver seccion 10. |
| Entidad destinataria | [PENDIENTE: nombre de la Entidad] |
| Contraparte tecnica de la Entidad | [PENDIENTE: nombre, cargo, correo, telefono] |

---

## 0. Como leer este documento

Este documento describe **lo que la plataforma hace hoy**, no lo que esta previsto hacer.
Se ha redactado para ser leido por un area de Tecnologias de la Informacion y por un area
legal, y esta escrito con un criterio deliberado: **es preferible declarar una carencia a
presentar una capacidad que no existe.**

Por ello se usan tres marcas:

- **[PENDIENTE: ...]** — dato que no se pudo verificar tecnicamente, o que solo el
  propietario o la Entidad pueden completar. No es un dato omitido: es un dato que **falta**.
- **No disponible actualmente** — capacidad que la plataforma **no tiene hoy**. No se
  ofrece, no se compromete y no debe asumirse.
- **Verificado** — comprobado directamente sobre el sistema en produccion en consulta de
  solo lectura del 12 de agosto de 2026.

Las secciones 4 (escenarios), 6 (restauracion) y 8 (incidentes) contienen procedimientos
**ejecutables por una sola persona**, porque hoy hay una sola persona. La seccion 10
explica por que eso es, en si mismo, el riesgo mas serio del servicio.

**Advertencia de alcance.** Varias medidas descritas en las secciones 5, 7 y 11 estan
redactadas como *acciones requeridas* y **no como capacidades vigentes**. Estan
identificadas como tales. Ninguna de ellas debe interpretarse como un compromiso adquirido
mientras no figure en el contrato.

---

## 1. Que hay que proteger

Antes de un plan de continuidad hace falta saber que se pierde si algo se cae. Esto es el
inventario real, verificado el 12 de agosto de 2026.

| Activo | Donde vive | Volumen | Copia de seguridad hoy |
|---|---|---|---|
| Base de datos (todo el modelo: usuarios, permisos, fichas de documentos, actividad, inventario 3D) | Cloud SQL for PostgreSQL 18.2, region **us-east4** (Virginia, EE. UU.) | 82 tablas, ~83,137 filas, **236 MB** | Guion manual, **sin periodicidad y sin copia conservada hoy** (seccion 5) |
| Ficheros: planos PDF, fotografias, modelos RVT y DWG | Google Cloud Storage, bucket `yaser-pqt08-talara`, clase NEARLINE | **6,093 objetos, 6.39 GB** | **Ninguna. No disponible actualmente.** |
| Backend (API) | Render, Inc., region **oregon** (EE. UU.), gunicorn 4 workers, Python 3.10.12 | — | Codigo en GitHub; configuracion solo en Render |
| Tres portales web | Render | — | [PENDIENTE: confirmar en el panel de Render la region de cada uno de los tres frontends] |
| Modelos 3D/CAD traducidos para el visor | Bucket OSS de **Autodesk**, `policyKey: persistent`, `region: us` | 2 RVT (232 MB) y 2 DWG (460 MB) | Copia permanente en Autodesk; el original tambien esta en el bucket de Google |
| Claves de firma `APP_SECRET` y `SESSION_PEPPER` | **Solo dentro de Render** (`generateValue: true` en `render.yaml`) | 2 valores | **Ninguna. No estan en ninguna copia.** |
| Codigo fuente | GitHub (Microsoft), repositorio `EDC_BIM` | — | Distribuido entre copias locales y GitHub |

**Consecuencia directa que el area legal debe leer con atencion:** la copia de la base de
datos guarda **la ficha** de cada documento (nombre, version, estado, idoneidad, quien lo
subio y cuando), pero **no los bytes** del PDF ni de la fotografia. Si se perdiera el
bucket de Google, la plataforma quedaria con un indice perfecto de documentos que ya no
existen.

Ningun dato reside en el Peru. El detalle de ubicaciones y transferencias internacionales
se trata en el documento correspondiente de esta serie.

---

## 2. Objetivos de recuperacion (RPO / RTO)

| Concepto | Estado |
|---|---|
| RPO — cuanta informacion se acepta perder | **No declarado.** [PENDIENTE: fijarlo y pactarlo con la Entidad.] |
| RTO — en cuanto tiempo se restablece el servicio | **No declarado.** [PENDIENTE: fijarlo y pactarlo con la Entidad.] |
| Acuerdo de nivel de servicio (SLA) de disponibilidad | **No disponible actualmente.** No existe compromiso de disponibilidad. |
| Monitoreo y alertas de caida | **No disponible actualmente.** No hay sistema que avise. La deteccion es humana. |

Se declara sin rodeos: **hoy el RPO real de los ficheros es total**. Al no existir copia
del bucket, la perdida del bucket es la perdida definitiva de los 6.39 GB. Para la base de
datos, el RPO real es **el tiempo transcurrido desde la ultima copia manual**, y hoy **no
consta ninguna copia conservada** (seccion 5).

Los tiempos objetivo que figuran en la seccion 4 estan marcados como *propuestos*: son una
base de discusion tecnica, **no un compromiso contractual**, mientras no se incorporen al
contrato con la Entidad.

---

## 3. Roles y comunicaciones

Hoy existe un solo rol operativo, ocupado por una sola persona.

| Rol | Quien | Responsabilidad |
|---|---|---|
| Responsable de continuidad y de incidentes | [PENDIENTE: nombre y datos de contacto] | Detecta, decide, ejecuta la restauracion, comunica |
| Responsable suplente | **No existe.** Ver seccion 10 | — |
| Contraparte tecnica de la Entidad | [PENDIENTE: nombre, correo, telefono] | Recibe el aviso, valida el restablecimiento del servicio |
| Area legal / oficial de proteccion de datos de la Entidad | [PENDIENTE: nombre, correo] | Recibe la notificacion cuando el incidente afecta datos personales |
| Encargado de proteccion de datos del proveedor | **No designado.** [PENDIENTE: designacion.] | — |

**Canal de aviso primario:** [PENDIENTE: correo institucional y telefono acordados con la Entidad].
**Canal de aviso alterno:** [PENDIENTE].

Nota tecnica pertinente para las comunicaciones automaticas: los correos de la plataforma
(invitacion y recuperacion de contrasena) salen hoy desde `onboarding@resend.dev`, un
remitente compartido de pruebas del proveedor Resend. **No hay dominio de correo propio.**
Un aviso formal de incidente **no debe enviarse por esa via**; debe usarse el canal
acordado con la Entidad.

---

## 4. Que puede fallar y que se hace en cada caso

Los tiempos son **objetivos propuestos**, medidos desde que el responsable toma
conocimiento del hecho. No hay hoy monitoreo automatico, de modo que el reloj empieza a
correr cuando una persona se da cuenta o cuando la Entidad reporta.

### 4.1 Cuadro resumen

| # | Falla | Probabilidad segun lo ocurrido | Impacto | Aviso a la Entidad (propuesto) | Restablecimiento objetivo (propuesto) |
|---|---|---|---|---|---|
| A | Cloud SQL caido o base corrompida | No ha ocurrido | Servicio detenido por completo | 1 hora | [PENDIENTE: no cronometrado] |
| B | Bucket de Google inaccesible o perdido | **Ya ocurrio** (facturacion en mora) | Documentos y fotos no se abren; si es perdida, es definitiva | 1 hora | Si es bloqueo: horas. Si es perdida: **no recuperable** |
| C | Render caido | No registrado | Portal y API inaccesibles | 2 horas | Depende del proveedor |
| D | Cuenta de Google suspendida o en mora | **Ya ocurrio** | Base y ficheros inaccesibles a la vez | 1 hora | Horas tras regularizar el pago |
| E | Licencia del visor Autodesk vencida | Se renueva anualmente **según manifestación del proveedor**, no verificado contra contrato | El visor 3D deja de funcionar; los documentos siguen | 24 horas antes, si se conoce la fecha | [PENDIENTE: fecha de vencimiento] |
| F | Fuga o perdida de `APP_SECRET` / `SESSION_PEPPER` | No ocurrido | Todos los enlaces y todas las sesiones dejan de valer | 2 horas | Horas |
| G | Responsable no localizable | Riesgo permanente | **Nadie puede restaurar nada** | — | **Indeterminado** |
| H | Incidente de seguridad (acceso o accion indebida) | **Ya ocurrio** (07-ago-2026) | Variable | Ver seccion 8 | Ver seccion 8 |

### 4.2 Falla A — Cloud SQL caido o base de datos corrompida

**Como se detecta hoy:** el portal deja de responder o devuelve error; lo reporta un
usuario o la Entidad. No hay alerta automatica.

**Que se hace, en orden:**

1. Comprobar `/api/health` del backend y el estado de la instancia en la consola de Google
   Cloud SQL. Distinguir entre **instancia caida** (esperar o reiniciar) y **datos
   dañados** (restaurar).
2. Si es una caida del servicio de Google: no hay accion tecnica del proveedor mas alla de
   esperar; se avisa a la Entidad con el estado publicado por Google y se registra la hora.
3. Si hay perdida o corrupcion de datos: ejecutar el procedimiento completo de la
   **seccion 6**.
4. Si existe recuperacion a un punto en el tiempo (PITR) en Cloud SQL, es la via preferida
   por ser mas reciente que cualquier copia manual.
   **[PENDIENTE: comprobar en la consola de Google si la instancia tiene copias automaticas
   y PITR activadas, y con que retencion. Vienen activadas por defecto, pero *por defecto*
   no es *comprobado*, y mientras no se compruebe este plan no puede apoyarse en ellas.]**

**Quien avisa a quien:** el responsable de continuidad avisa a la contraparte tecnica de la
Entidad dentro de 1 hora, con: hora de inicio, alcance, si hay o no perdida de datos, y
hora estimada de restablecimiento.

### 4.3 Falla B — Bucket de Google Cloud Storage inaccesible o perdido

Este escenario tiene dos formas muy distintas y conviene no confundirlas.

**B1 — Bloqueo (el bucket existe pero no responde).** Es lo que **ya ocurrio**: consta en
`docs/copias-y-restauracion.md` que la facturacion en mora dejo el almacenamiento
inaccesible. La plataforma sigue en pie, los usuarios navegan el arbol de documentos, pero
al abrir un PDF o una foto el fichero no llega.

1. Verificar el estado de facturacion del proyecto `correos-gmail-425301` y regularizarlo.
2. Verificar que la cuenta de servicio `visor-backend@correos-gmail-425301.iam.gserviceaccount.com`
   conserva sus permisos.
3. Avisar a la Entidad indicando expresamente que **los datos no se han perdido**, solo el
   acceso, para que no se active una respuesta desproporcionada.

**B2 — Perdida de objetos.** Aqui hay que ser tajante: **no existe copia de seguridad de
los ficheros**. Los 6,093 objetos y 6.39 GB — los planos, las 2,756 fotografias, los
modelos RVT y DWG — no estan respaldados en ningun otro sitio. Si los objetos se pierden,
**no hay procedimiento de recuperacion**. Lo unico que sobrevive es la ficha de cada
documento en la base de datos.

Mitigaciones parciales que existen hoy, y que no equivalen a una copia:

- Los modelos 3D y CAD tienen una copia permanente en el bucket OSS de **Autodesk**
  (`policyKey: persistent`). Son 4 ficheros de los 2,824. No cubre planos ni fotografias.
- **[PENDIENTE: comprobar si el bucket tiene versionado de objetos, reglas de ciclo de vida
  o politica de retencion. No se pudo leer: la cuenta de servicio no tiene el permiso
  `storage.buckets.get` y la consulta devuelve HTTP 403. Si el versionado estuviera
  activo, un borrado accidental seria reversible; mientras no se compruebe, hay que asumir
  que no lo es.]**

**Accion requerida antes de operar con una entidad publica** (no es una capacidad vigente):
implantar copia de los objetos del bucket hacia un proveedor o cuenta distinta, y probar su
restauracion.

### 4.4 Falla C — Render caido

El backend y los tres portales corren en Render, region oregon.

1. Consultar el estado del proveedor y el panel del servicio `visor-aps-backend`.
2. Si es un fallo de despliegue propio (y no del proveedor), volver al despliegue anterior
   desde el panel de Render.
3. Avisar a la Entidad dentro de 2 horas.

**Riesgo especifico documentado:** el arranque del backend ejecuta
`alembic upgrade head` antes de levantar gunicorn. Un fallo de migracion deja el servicio
sin arrancar. Historicamente el backend ya murio al redesplegar por esta clase de motivo.
**Ningun redespliegue debe hacerse en horario de uso de la Entidad sin aviso previo.**

**[PENDIENTE: acordar con la Entidad una ventana de mantenimiento y un procedimiento de
aviso previo de cambios.]**

### 4.5 Falla D — Cuenta de Google suspendida, en mora o perdida

Es el escenario mas grave despues de la falla G, porque **la base de datos y los ficheros
estan en el mismo proyecto de Google**, y ese proyecto presenta indicios verificables de
ser una cuenta personal:

- Identificador del proyecto: `correos-gmail-425301` — el sufijo numerico es el que Google
  añade a los proyectos creados desde una cuenta Gmail particular.
- Cuenta de servicio: `visor-backend@correos-gmail-425301.iam.gserviceaccount.com`.
- Bucket: `yaser-pqt08-talara`, con el nombre de pila del propietario.
- Precedente real: la facturacion en mora ya dejo el almacenamiento inaccesible una vez.

**Que se hace:** regularizar el pago es la unica accion disponible, y por eso el control
efectivo es **preventivo**: mantener metodo de pago vigente y alerta de facturacion.

**Accion requerida antes de operar con una entidad publica** (no es una capacidad vigente):
migrar el proyecto a una organizacion de Google Cloud con cuenta de facturacion a nombre
de la persona juridica proveedora, de modo que la continuidad del servicio no dependa de
una tarjeta personal.

**[PENDIENTE: confirmar si la cuenta de facturacion asociada es personal o de una empresa,
y si el proyecto pertenece a una organizacion de Google Cloud o a un usuario suelto.]**

### 4.6 Falla E — Licencia del visor Autodesk vencida

El visor 3D se sirve desde Autodesk Platform Services. Si la licencia vence:

- **Deja de funcionar:** la visualizacion 3D de modelos RVT y DWG.
- **Sigue funcionando:** el portal documental, las carpetas, los permisos, las versiones,
  las revisiones, los transmittals y las fotografias. Es decir, el ECD como repositorio
  documental no se detiene.
- Los ficheros originales de los modelos siguen en el bucket de Google; lo que se pierde es
  la traduccion para el visor.

**[PENDIENTE: verificar contra el contrato vigente la modalidad exacta de licenciamiento —el
proveedor manifiesta que se renueva anualmente, pero no se ha leido el contrato—, su fecha de
vencimiento y sus condiciones de renovacion. Mientras no se conozca, no puede fijarse un aviso
previo ni comprometerse la continuidad del visor 3D ante la Entidad.]**

### 4.7 Falla F — Perdida o fuga de `APP_SECRET` o `SESSION_PEPPER`

Ambas claves existen **unicamente dentro de Render** (`generateValue: true`) y no figuran
en ninguna copia de seguridad.

| Clave | Que pasa si se pierde | Que pasa si se filtra |
|---|---|---|
| `APP_SECRET` | Dejan de valer todos los enlaces firmados: fotos, PDF, invitaciones, recuperacion de contrasena | Un tercero podria falsificar esos enlaces |
| `SESSION_PEPPER` | Dejan de valer todas las sesiones; todos vuelven a iniciar sesion | Un volcado de la base pasaria a permitir recalcular huellas de sesion |

**Trampa documentada, y conviene citarla porque es silenciosa:** si `APP_SECRET` no esta
definida, la clave se deriva de la configuracion de la base de datos. Al restaurar en otro
servidor **cambia sola y sin aviso**, y todos los enlaces emitidos dejan de valer sin que
nadie entienda por que.

**Que se hace ante sospecha de fuga:** rotar la clave en Render, aceptando que se invalidan
todas las sesiones (los usuarios vuelven a entrar) y todos los enlaces firmados vigentes;
comunicar a la Entidad que se producira ese corte y por que.

**Accion requerida** (no es una capacidad vigente): extraer hoy ambos valores de Render y
custodiarlos en un gestor de contrasenas, **fuera del repositorio y fuera del mismo lugar
donde se guarde la copia de datos**.

### 4.8 Falla G — El responsable no esta localizable

Se trata en la seccion 10, porque no es una falla tecnica sino la debilidad estructural del
servicio.

---

## 5. Estado real de las copias de seguridad

### 5.1 Lo que existe

| Elemento | Estado |
|---|---|
| Guion de copia | `backend/copia_de_seguridad.py` — **existe y funciona** |
| Guion de restauracion | `backend/restaurar.py` — **existe y funciona** |
| Procedimiento escrito | `docs/copias-y-restauracion.md` — **existe** |
| Prueba de restauracion completa | **Realizada el 09-ago-2026**: base vacia → esquema → restauracion → comprobacion. **78 tablas y 83,563 filas identicas** |
| Tamano de la copia | ~7 MB comprimidos |

**Nota sobre el recuento de tablas y de filas (idéntica en los cuatro documentos de este expediente):**
la prueba del 09-ago-2026 restauró 78 tablas sobre las 81 que había en producción ese día. Dos se
excluyen a propósito del respaldo por contener datos transitorios (`upload_sessions` y
`gemelo_ingestion_status`, constante `PRESCINDIBLES` de `backend/copia_de_seguridad.py`). [PENDIENTE:
identificar y declarar la diferencia restante entre las tablas existentes y las restauradas.] Al
12-ago-2026 la base tiene 82 tablas. **Además, aquella prueba restauró 83,563 filas y al 12-ago-2026 la
base registra aproximadamente 83,137: hoy hay menos filas y más tablas que hace tres días.** No se
ofrece explicación porque no se ha verificado ninguna. [PENDIENTE: explicar la variación de filas entre
el 09 y el 12-ago-2026.]

El guion de copia recorre todas las tablas leyendolas de `information_schema`, **salvo dos que
se excluyen a proposito por contener datos transitorios** (`upload_sessions` y
`gemelo_ingestion_status`); una tabla nueva se incorpora sola. Guarda los contadores de los
identificadores automaticos, escribe un manifiesto con el recuento por tabla y **vuelve a leer
el fichero generado para comprobar que cuadra**. Si no cuadra, termina con error.

### 5.2 Lo que no existe, dicho sin rodeos

1. **No hay periodicidad.** La copia se lanza a mano. No existe tarea programada:
   `render.yaml` no declara ningun servicio de tipo cron, y el unico flujo de GitHub
   Actions (`.github/workflows/ci.yml`) solo ejecuta pruebas y compilacion.
2. **No consta ninguna copia conservada.** Se busco y no se hallo: no existe
   `D:\VISOR_APS_TL\copias`, no existe `D:\copias`, y una busqueda de ficheros
   `*.copia.gz` en la unidad D: no devolvio resultados.
3. **No hay copia de los ficheros.** Ver 4.3.
4. **No hay copia de los secretos.** Ver 4.7.
5. **No hay copia programada en un segundo proveedor.** El destino por defecto es una
   carpeta local del operador, que hoy esta vacia; y si la copia se alojara dentro del mismo
   proyecto de Google que los datos, no protegeria del caso que ya ocurrio (facturacion en
   mora).
6. **[PENDIENTE: comprobar en la consola de Google si Cloud SQL tiene copias automaticas y
   PITR, y con que retencion.]**

### 5.3 Lo que se ejecuta hoy, y lo que haria falta comprometer

**Comando de copia (manual, hoy):**

```bash
python backend/copia_de_seguridad.py --destino <carpeta_de_destino>
```

Conserva por defecto las ultimas 30 copias (`--retener 30`).

**Accion requerida antes de operar con una entidad publica** (no es una capacidad vigente):

- Programar la copia de la base para que corra sola, con periodicidad y retencion
  declaradas y pactadas.
- Implantar copia de los objetos del bucket.
- Depositar copia y secretos **fuera del proyecto de Google** que aloja los datos.

**[PENDIENTE: periodicidad, retencion y ubicacion de destino a comprometer con la Entidad.]**

---

## 6. Procedimiento de restauracion, paso a paso

Este procedimiento **esta probado de punta a punta contra la base real** (09-ago-2026) y
puede ejecutarlo una sola persona. Restaura **la base de datos**. No restaura ficheros:
para eso haria falta una copia de ficheros, que no existe.

### Paso 0 — Antes de tocar nada

1. Anotar la hora y que se observo. Todo lo que se haga despues altera el estado.
2. Determinar si realmente hace falta restaurar. **Archivar o eliminar en la plataforma es
   borrado logico**: el incidente del 07-ago-2026 se resolvio sin restaurar nada, porque
   los datos seguian ahi. Restaurar una copia sobre datos que estaban intactos habria
   destruido informacion posterior.
3. Avisar a la Entidad de que el servicio entra en mantenimiento (seccion 3).

### Paso 1 — Base vacia

Crear una base de datos vacia en Cloud SQL (o donde corresponda).

### Paso 2 — El esquema lo crea la aplicacion

Apuntar el backend a esa base y arrancarlo **una vez**. Comprobar en el registro que
informa `0 fallos`.

> Este paso existe por una razon concreta. Hasta el 09-ago-2026 la plataforma **no se podia
> reconstruir**: habia 81 tablas en produccion y el codigo solo sabia crear 34. Faltaban,
> entre otras, `projects`, `users`, `hubs`, `project_users`, `folder_permissions` y
> `sessions` — es decir, quienes son los usuarios, que obras existen y quien puede ver que.
> Estaba corregido en `backend/esquema_base.py`. **Si se anade una tabla nueva al sistema,
> hay que anadirla tambien ahi, o se vuelve a tener una plataforma irreproducible.**

### Paso 3 — Cargar los datos

```bash
python backend/restaurar.py <ruta_de_la_copia>.copia.gz --base <base_destino> --confirmar
```

Comportamiento verificado del guion:

- **Sin `--confirmar` no escribe nada**: muestra lo que haria.
- **Se niega a escribir sobre la base de produccion** salvo que se le pase
  `--sobre-produccion`.
- Carga **por nombre de columna, no por posicion**. Produccion crecio con
  `ALTER TABLE ADD COLUMN`, que anade al final; ese orden no coincide con el del
  `CREATE TABLE` del codigo, y cargar por posicion llegaba a meter una fecha en una columna
  de tipo JSON.
- Retira las claves ajenas durante la carga y las devuelve al terminar. Si alguna no vuelve
  a entrar, los datos no son consistentes y lo informa.

### Paso 4 — Los secretos (sin esto, la base arranca y no sirve)

Reponer en el entorno del servicio:

- `APP_SECRET` — si no se repone el valor original, todos los enlaces firmados emitidos
  (fotos, PDF, invitaciones, recuperacion de contrasena) dejan de valer, y ademas la clave
  **cambia sola y en silencio** al derivarse de la configuracion de la base.
- `SESSION_PEPPER` — si no se repone, ninguna sesion existente vale.
- Credenciales de Google (`backend/gcp_sa.json`), `APS_CLIENT_ID` / `APS_CLIENT_SECRET`,
  `RESEND_API_KEY`.

### Paso 5 — Los ficheros

Los planos, las fotografias y los modelos **no estan en esta copia**: viven en Google Cloud
Storage y **no tienen respaldo**. Si el bucket esta intacto, la plataforma restaurada los
volvera a servir con normalidad, porque las fichas apuntan a los mismos objetos. Si el
bucket no esta intacto, **no hay paso 5**.

### Paso 6 — Comprobacion

1. Contrastar el recuento por tabla contra el manifiesto de la copia.
2. Iniciar sesion, abrir un documento, abrir una fotografia y abrir un modelo en el visor.
3. Comprobar que un enlace firmado recien emitido funciona (valida que `APP_SECRET` es la
   correcta).
4. Anotar hora de fin y comunicar a la Entidad el restablecimiento.

**[PENDIENTE: el ensayo del 09-ago-2026 no se cronometro. Mientras no se mida la duracion
de una restauracion completa, no puede comprometerse un RTO ante la Entidad.]**

---

## 7. Ensayos: cada cuanto se prueba, y registro

Una copia que nunca se ha restaurado no es una copia. Los tres fallos serios que se
encontraron en agosto de 2026 — las 47 tablas que nadie creaba, el orden de las columnas y
los contadores que abortaban la transaccion entera — **no se veian leyendo el codigo**.
Aparecieron al ejecutar la restauracion de verdad.

### 7.1 Periodicidad

| Ensayo | Periodicidad comprometida | Estado |
|---|---|---|
| Restauracion completa de la base en una base limpia | [PENDIENTE: periodicidad a comprometer] | Ejecutado una vez |
| Restauracion de ficheros del bucket | — | **No se puede ensayar: no existe copia de ficheros** |
| Reposicion de secretos en un entorno nuevo | [PENDIENTE] | No ensayado por separado |
| Simulacro de indisponibilidad del responsable | [PENDIENTE] | **Nunca ejecutado** |

### 7.2 Registro de ensayos

| Fecha | Tipo de ensayo | Resultado | Duracion | Quien lo ejecuto | Observaciones |
|---|---|---|---|---|---|
| 09-ago-2026 | Restauracion completa de la base contra la base real: base vacia → esquema → restauracion → comprobacion | **Correcto. 78 tablas, 83,563 filas identicas** (ver la nota sobre el recuento de tablas en 5.1) | [PENDIENTE: no se cronometro] | [PENDIENTE: nombre] | Descubrio que hasta ese dia la plataforma no se podia reconstruir; corregido en `backend/esquema_base.py` |
| [PENDIENTE: fecha] | | | | | |
| [PENDIENTE: fecha] | | | | | |

**Fecha del ultimo ensayo realizado: 09 de agosto de 2026.**
**Fecha del proximo ensayo comprometido: [PENDIENTE: fecha].**

---

## 8. Procedimiento ante un incidente de seguridad

### 8.1 Que se considera incidente

Acceso, uso, alteracion, divulgacion o perdida de informacion sin autorizacion; y tambien
la accion autorizada por el sistema pero **no legitima**, que es exactamente lo que ocurrio
el 07-ago-2026.

### 8.2 Deteccion — lo que hay y lo que falta

**Lo que hay hoy:**

| Fuente | Que registra | Limite real |
|---|---|---|
| `auth_events` (32 filas) | Correo, `user_id`, **direccion IP**, **navegador/dispositivo**, evento y fecha | **Solo desde el 07-ago-2026.** Antes de esa fecha **no hay registro de accesos** |
| `activity_log` (1,034 filas) | Subidas, creacion de carpetas, borrados (160 definitivos), renombrados, movimientos, restauraciones, revisiones, transmittals | Del 22-mar-2026 al 11-ago-2026. Guarda el nombre o el correo **en texto**, no el identificador de usuario. La clave `ip` figura solo en 17 filas |
| `backend/registro_de_descargas.py` | Accion `acceso_a_documento` (17 filas) | Ver el matiz del parrafo siguiente |

Sobre el registro de acceso a documentos hay que repetir su limite tal cual lo declara la
propia herramienta: como el fichero se entrega mediante URL firmada y los bytes viajan
despues directamente desde Google, **no se puede afirmar "esta persona completo la
descarga", solo "a esta persona se le entrego el acceso a este documento, a esta hora y por
esta via"**. Se anota una sola linea por persona, documento y ventana de 5 minutos.

**Lo que no hay:**

- **No disponible actualmente:** alerta automatica. Nadie recibe un aviso cuando ocurre
  algo anomalo. La deteccion de hoy es que una persona lo note o que la Entidad lo reporte.
- **No disponible actualmente:** retencion definida de registros, ni envio a un sistema
  externo. **Los registros viven en la misma base que los datos**, de modo que quien
  pudiera alterar los datos podria alterar tambien el rastro.

### 8.3 Contencion — las cuatro palancas disponibles

| Palanca | Efecto | Tiempo |
|---|---|---|
| Revocar sesiones | Expulsa a los usuarios afectados | Hasta **15 segundos** en propagarse a todos los procesos (`SESSION_CACHE_TTL=15`) |
| Rotar `SESSION_PEPPER` en Render | Invalida **todas** las sesiones a la vez | Inmediato tras el redespliegue |
| Rotar `APP_SECRET` en Render | Invalida **todos** los enlaces firmados vigentes | Inmediato tras el redespliegue |
| Rotar los codigos de invitacion de las obras | Cierra la via de incorporacion no autorizada | Inmediato |

Dato util para dimensionar la exposicion: **las sesiones duran 7 dias** y **no hay cierre
por inactividad**; los 7 dias corren desde el inicio de sesion, se use o no la plataforma.

### 8.4 Notificacion — a quien y en que plazo

| Destinatario | Cuando | Plazo propuesto |
|---|---|---|
| Contraparte tecnica de la Entidad | Siempre que se confirme un incidente | 24 horas desde la confirmacion |
| Area legal / proteccion de datos de la Entidad | Cuando el incidente afecte datos personales | 24 horas desde la confirmacion |
| Autoridad competente en proteccion de datos personales | Cuando corresponda conforme a la Ley N.° 29733 y su reglamento | **[PENDIENTE: el plazo exacto, la via y el supuesto que obliga a notificar deben ser confirmados por el area legal conforme a la norma vigente. Este documento no fija un plazo legal que no se ha verificado.]** |
| Titulares de los datos afectados | Cuando corresponda | [PENDIENTE: criterio a definir con el area legal] |

Contenido minimo del aviso: que ocurrio, cuando, que informacion pudo verse afectada, que
se hizo para contenerlo, que queda pendiente y cuando se dara el siguiente parte.

**[PENDIENTE: no existe hoy un procedimiento documentado de respuesta a incidentes firmado
ni un compromiso de notificacion contractual. Este documento es el primer borrador de ese
procedimiento.]**

### 8.5 Investigacion

1. Fijar la ventana temporal exacta del hecho.
2. Cruzar `activity_log` (que se hizo) con `auth_events` (quien tenia sesion, desde que IP
   y con que navegador). **Advertencia: `auth_events` solo cubre desde el 07-ago-2026.**
3. Listar las sesiones vivas en el momento del hecho.
4. Preservar la evidencia antes de limpiar. En el incidente de agosto se dejo a proposito
   el rastro fisico por esta razon.
5. Redactar el parte final indicando expresamente **que se pudo determinar y que no**.

---

## 9. Caso trabajado: el incidente del 07 de agosto de 2026

Se incluye completo, con lo que salio bien y lo que no, porque un plan de continuidad sin
un caso real es una declaracion de intenciones.

### 9.1 Que paso

El **07 de agosto de 2026 a las 17:33 UTC** se creo en la plataforma una obra llamada
"obra pirata". **Cinco segundos despues**, la obra real `PQT8_TALARA` (identificador `1`)
fue renombrada a "renombrada" y archivada. El propietario confirmo que no fue el.

### 9.2 Por que fue posible

La comprobacion de rol `@requiere_rol('admin')` era **puramente declarativa** mientras
`AUTH_POLICY_MODE` valia `sombra` (`backend/politica.py:47` y `backend/auth_middleware.py:484`):
la politica evaluaba y anotaba a quien habria bloqueado, pero dejaba pasar. En la practica,
**cualquier sesion valida podia crear, renombrar y archivar obras**: **no hacia falta ser
administrador**. A esto se sumo que la auditoria de entonces solo registraba entradas y
salidas, **no cambios sobre obras**. Ambas cosas se corrigieron el mismo dia en el commit
`0891e78`, con `_solo_admin()` dentro de la vista y `_auditar()`.

### 9.3 Que se hizo

| Accion | Resultado |
|---|---|
| Verificar el estado de los datos **antes** de tocar nada | Datos **intactos**: archivar es borrado logico. Se contaron 16,614 elementos de inventario, 384 documentos, 8 vistas y los frentes `1_CANAL` (238 nodos) y `1_DRENAJE` (146) |
| Restaurar la obra | Devuelta a `PQT8_TALARA`, estado `active`. **No hizo falta restaurar ninguna copia** |
| Contener | **62 sesiones revocadas.** [PENDIENTE: la revocación alcanzó a 62 sesiones existentes ese día, pero la tabla de sesiones registra hoy 27 filas (26 activas). Antes de entregar el documento debe explicarse por qué el recuento actual no refleja aquellas 62 revocaciones.] |
| Cerrar la via de entrada | Codigos de invitacion de las dos obras rotados |
| Corregir la causa | Comprobaciones de administrador efectivas dentro de cada vista (`_solo_admin` en `projects.py`), commit `0891e78` |
| Preservar evidencia | La obra "obra pirata" se dejo a proposito: es el unico rastro fisico que queda |

**Nota sobre obras y frentes (idéntica en los cuatro documentos de este expediente):** una obra puede
organizarse en varios ámbitos de trabajo o *frentes*, y por eso el recuento por ámbito y el recuento por
obra no coinciden. `1_CANAL` y `1_DRENAJE` son **frentes de la obra PQT8_TALARA (obra `1`)**, no obras
distintas ni proyectos de prueba: comprobado el 12-ago-2026 contra la base de producción con
`db.resolve_project_id()`, donde `proyectos/PQT8_TALARA`, `1_CANAL` y `1_DRENAJE` resuelven los tres a la
obra `1`. Entre los dos frentes suman **284 ficheros y 241 MB de contenido real de esa obra**.

### 9.4 Que no se pudo hacer, y por que

**No se pudo determinar quien fue.** Esa es la leccion del caso, y la razon por la que
figura en este documento.

- **El registro no cubria la accion.** La auditoria de entonces registraba entradas y
  salidas, **no cambios sobre obras**. Se sabia que la obra fue archivada; no quien la
  archivo.
- **El universo de sospechosos era demasiado amplio.** Habia **15 sesiones activas
  pertenecientes a cuentas con rol de administrador** en ese momento, algunas de varios
  dias, ademas de una unica sesion de rol `user` abierta ese dia. **[PENDIENTE: precisar
  cuantas cuentas de administrador existian el 07-ago-2026; hoy existe una sola.]**
- **El propio diseno filtraba credenciales.** El token de sesion viajaba **dentro de los
  enlaces permanentes de fotografias que se comparten**. Cualquiera que recibiera uno de
  esos enlaces recibia tambien, sin saberlo, una llave. *(Corregido con posterioridad al
  incidente; ver 9.5, punto 4.)*
- **No habia historico previo.** `auth_events` empieza precisamente el 07-ago-2026: no
  habia con que reconstruir el comportamiento anterior.

Quedaron **dos hipotesis abiertas y ninguna descartable**: el unico usuario de rol `user`
con sesion abierta ese dia, o un token de administrador filtrado por la via de los enlaces
de fotografias.

### 9.5 Que habria hecho falta para saber quien fue

Esta es la parte utilizable del caso. Ninguna de estas cuatro medidas existia el 7 de
agosto; ninguna es exotica.

1. **Registrar la accion, no solo la sesion.** Cada creacion, renombrado, archivado o
   borrado de obra debe dejar constancia de **quien** (identificador de usuario, no nombre
   en texto), **desde que IP**, **con que navegador** y **cual era el valor anterior**.
2. **Registro inmutable y separado.** Hoy los registros viven en la misma base que los
   datos y sin retencion definida. Un registro que puede ser alterado por quien se
   investiga no sirve como evidencia.
3. **Que la autorizacion bloquee, y no solo anote.** El incidente ocurrio porque la
   comprobacion de rol era declarativa mientras la politica estaba en modo sombra.
   **Corregido el mismo dia** (commit `0891e78`) y **comprobado el 12-ago-2026: las diez
   rutas que declaran `@requiere_rol` tienen hoy guardia efectivo dentro de la propia vista,
   o delegan en una funcion que lo tiene. No queda ninguna comprobacion de rol en modo
   declarativo.** Lo que si sigue sin bloquear es el control transversal de separacion entre
   obras y la politica de acceso por defecto (seccion 11, puntos 1 y 2).
4. **No transportar credenciales dentro de enlaces compartibles. Corregido:** el token de
   sesion que viajaba dentro de los enlaces de fotografias se sustituyo por permisos de
   lectura por fichero, de 24 horas (`/api/docs/asset-tokens`), que comprueban el acceso uno
   por uno. Se deja constancia porque fue una de las dos hipotesis del incidente.

### 9.6 Estado del caso

**Cerrado sin autor determinado.** Datos restaurados, causa tecnica corregida, contencion
aplicada. **[PENDIENTE: confirmar que la contrasena de administrador fue cambiada tras el
incidente; es la unica forma de descartar la hipotesis del token filtrado.]**

---

## 10. Riesgo de dependencia de una sola persona

Es el riesgo mas serio de este servicio y se declara en primer plano.

### 10.1 La situacion, verificada

Una sola persona concentra el control total, por **cuatro caminos independientes**:

1. Es el **unico administrador** de la aplicacion (usuario id 2; ultimo acceso 12-ago-2026).
2. Posee las **credenciales del usuario `postgres` de Cloud SQL**: acceso directo y
   completo a las 82 tablas, **saltandose por completo la aplicacion y sus permisos**.
3. Posee la **clave de la cuenta de servicio de Google** (`gcp_sa.json`), que da acceso a
   los 6,093 objetos del bucket.
4. Es **propietario del repositorio en GitHub y de la cuenta de Render**, donde viven
   `APP_SECRET` y `SESSION_PEPPER`, que no existen en ningun otro sitio.

**No hay separacion de funciones**: la misma persona administra la aplicacion, la base de
datos, la nube y el codigo. No hay segundo administrador ni control de cuatro ojos para
acciones destructivas.

### 10.2 Que pasa hoy si esa persona no contesta

| Situacion | Consecuencia real |
|---|---|
| No contesta durante horas | Ninguna incidencia puede atenderse. No hay nadie mas que pueda entrar |
| No contesta durante dias | Si vence la facturacion de Google, el servicio se detiene y **nadie puede pagarla** |
| Ausencia definitiva | `APP_SECRET` y `SESSION_PEPPER` **se pierden con el acceso a Render**. Aunque se recuperase la base y el bucket, **la plataforma no vuelve a funcionar como estaba**: los enlaces firmados y las sesiones dejan de valer y no hay forma de reconstruir las claves |

Dicho de la forma que interesa a la Entidad: **hoy la continuidad del servicio depende de
que una persona conteste el telefono.**

### 10.3 Que hace falta para mitigarlo

Ninguna de estas medidas existe hoy. Son acciones requeridas, no capacidades vigentes.

| # | Medida | Que resuelve |
|---|---|---|
| 1 | **Segundo administrador designado**, con cuenta nominal propia (nunca compartida) y rol `admin` en la aplicacion | Que exista alguien que pueda actuar |
| 2 | **Custodia de secretos en un gestor de contrasenas** con al menos dos personas autorizadas: `APP_SECRET`, `SESSION_PEPPER`, credenciales de Cloud SQL, `gcp_sa.json`, `APS_CLIENT_ID` / `APS_CLIENT_SECRET`, `RESEND_API_KEY`, accesos a Render y GitHub | Que las claves sobrevivan a la persona |
| 3 | **Titularidad institucional de las cuentas**: proyecto de Google en una organizacion con facturacion a nombre de la persona juridica; cuentas de Render y GitHub a nombre de la organizacion | Que el servicio no dependa de una cuenta y una tarjeta personales |
| 4 | **Procedimiento de escalamiento con plazos**: a quien se llama, en cuanto tiempo se considera "no localizable" y quien asume | Que la ausencia tenga respuesta prevista |
| 5 | **Control de cuatro ojos para acciones destructivas** (archivar o eliminar obras, borrado definitivo, rotacion de secretos) | Que un solo clic no baste para el dano que ya ocurrio una vez |
| 6 | **Simulacro anual de indisponibilidad del responsable**: que otra persona ejecute la restauracion completa sin su ayuda | Que el plan se demuestre, no se declare |

**[PENDIENTE: designacion del segundo administrador — nombre, cargo, alcance de sus
accesos y fecha de alta.]**
**[PENDIENTE: gestor de contrasenas elegido y personas autorizadas a la custodia.]**
**[PENDIENTE: umbral de "responsable no localizable" y ruta de escalamiento acordada con la
Entidad.]**

---

## 11. Condiciones que hoy afectan la continuidad y deben resolverse antes de operar con la Entidad

Se listan porque un plan de continuidad que las omitiera seria incompleto. Son condiciones
**vigentes hoy**.

| # | Condicion | Por que afecta a la continuidad |
|---|---|---|
| 1 | **La separacion entre obras no se aplica de forma transversal.** `ENFORCE_PROJECT_AUTHZ` vale `false` por defecto (`backend/auth_middleware.py`) y no esta definida en `render.yaml`. En ese modo el sistema **solo registra** a quien bloquearia, y **deja pasar** | El control transversal de separación entre obras está en modo registro: anota a quién bloquearía y deja pasar. Los módulos documentales (documentos, subidas, transmittals, revisiones, sets, atributos) aplican además su propia comprobación de pertenencia a la obra, que sí bloquea. **No la aplican** los módulos de RFI, redlines, pines de campo, vistas guardadas, inventario 3D y obra civil: en ellos, hoy, una sesión válida alcanza datos de obras a las que el usuario no está asignado. Debe activarse el control transversal antes de atender a más de una entidad. [PENDIENTE: confirmar en el panel de Render si la variable fue definida ahi manualmente] |
| 2 | **La politica de acceso por defecto esta en modo sombra.** `AUTH_POLICY_MODE` vale `sombra` por defecto (`backend/politica.py`) | Evalua y anota, pero no decide; sigue mandando la logica antigua por prefijo de ruta. Es la misma clase de configuracion que hizo posible el incidente del 07-ago-2026, **si bien las comprobaciones de rol ya no dependen de ella** (ver 9.5, punto 3). [PENDIENTE: confirmar en el panel de Render si fue puesto en `estricto`] |
| 3 | **No hay copia de los ficheros** | Ver 4.3. Una perdida del bucket es definitiva |
| 4 | **No hay copia conservada de la base** | Ver 5.2 |
| 5 | **No hay segundo factor de autenticacion** | Un usuario o contrasena comprometidos bastan para entrar |
| 6 | **El limite de peticiones es por proceso.** Sin `REDIS_URL` definida, el contador vive en la memoria de cada worker; con 4 workers, el limite efectivo contra fuerza bruta en el login se multiplica por 4 | Debilita la resistencia de `/api/auth/login` |
| 7 | **La conexion a la base negocia TLS pero no lo exige** (`backend/db.py` no fija `sslmode`; psycopg2 usa `prefer`). Ademas, la base tiene **IP publica** | [PENDIENTE: fijar `sslmode=require` o `verify-full` y revisar las redes autorizadas de Cloud SQL] |
| 8 | **Credenciales de Autodesk recuperables del historial de Git.** El primer commit (`8fb37b5`) incluye un `.env` con `APS_CLIENT_ID` y `APS_CLIENT_SECRET`; el fichero se dejo de rastrear despues (`fd9d4dd`) pero el contenido sigue en la historia. Acota el dano: ese `.env` no contenia credenciales de la base, y `gcp_sa.json` nunca se subio | [PENDIENTE: confirmar si el repositorio es privado y si esas credenciales se rotaron. Si no se han rotado, deben rotarse antes de presentar el servicio] |
| 9 | **No hay analisis antivirus ni antimalware** sobre los ficheros que se suben | Un fichero infectado subido por un usuario se distribuye a los demas |
| 10 | **No hay entorno de pruebas separado del de produccion.** Obras de prueba y duplicados conviven con la obra real en la misma base | Cualquier prueba se hace sobre los datos de la Entidad |
| 11 | **No hay contrato de encargo de tratamiento ni acuerdo de proteccion de datos (DPA)** con Google, Render, Autodesk ni Resend, pese a que los cuatro tratan datos, y ningun dato reside en el Peru | Es lo primero que pedira el area legal de la Entidad |
| 12 | **No hay ninguna certificacion** (ni ISO 27001, ni ISO 9001, ni SOC 2, ni ninguna otra) ni proceso de certificacion iniciado | Se declara para que no se asuma lo contrario |

---

## 12. Resumen de pendientes de este documento

| # | Pendiente | Quien lo cierra |
|---|---|---|
| 1 | Fecha de emision, revision y periodicidad de revision | Propietario / Entidad |
| 2 | Razon social, RUC, domicilio fiscal, contactos | Propietario |
| 3 | Contactos y canales de aviso de la Entidad | Entidad |
| 4 | RPO y RTO, y acuerdo de nivel de servicio | Propietario / Entidad |
| 5 | Copias automaticas y PITR de Cloud SQL: comprobarlo en la consola de Google | Propietario |
| 6 | Versionado, ciclo de vida y retencion del bucket: no se pudo leer (HTTP 403 por falta de `storage.buckets.get`) | Propietario |
| 7 | Region del bucket y region de los tres portales en Render | Propietario |
| 8 | Fecha de vencimiento y condicion de renovacion de la licencia Autodesk | Propietario |
| 9 | Titularidad de la cuenta de facturacion de Google y pertenencia del proyecto a una organizacion | Propietario |
| 10 | `ENFORCE_PROJECT_AUTHZ` y `AUTH_POLICY_MODE`: confirmar su valor real en el panel de Render | Propietario |
| 11 | Repositorio privado o publico, y rotacion de las credenciales de Autodesk | Propietario |
| 12 | Cambio de la contrasena de administrador tras el incidente del 07-ago-2026 | Propietario |
| 13 | Designacion de segundo administrador y custodia de secretos | Propietario |
| 14 | Umbral y ruta de escalamiento por responsable no localizable | Propietario / Entidad |
| 15 | Periodicidad, retencion y destino de las copias, a comprometer | Propietario / Entidad |
| 16 | Duracion cronometrada de una restauracion completa | Propietario |
| 17 | Fecha del proximo ensayo de restauracion | Propietario |
| 18 | Plazo, via y supuesto de notificacion a la autoridad conforme a la Ley N.° 29733 y su reglamento | Area legal |
| 19 | Ventana de mantenimiento y procedimiento de aviso previo de cambios | Propietario / Entidad |
| 20 | DPA y clausulas de transferencia internacional con Google, Render, Autodesk y Resend | Area legal |
| 21 | Diferencia restante entre las tablas existentes y las 78 restauradas en la prueba del 09-ago-2026 (ver la nota de 5.1) | Propietario |
| 22 | Por que la tabla de sesiones no refleja las 62 revocaciones del 07-ago-2026 | Propietario |
| 23 | Cuantas cuentas con rol de administrador existian el 07-ago-2026 | Propietario |
| 24 | Variacion de filas entre el 09 y el 12-ago-2026: 83,563 restauradas frente a ~83,137 hoy (ver la nota de 5.1) | Propietario |

---

## 13. Referencias internas

| Documento | Ruta |
|---|---|
| Copias de seguridad y restauracion | `docs/copias-y-restauracion.md` |
| Activar la autorizacion por obra | `docs/activar-autorizacion-por-obra.md` |
| Activar la politica de acceso | `docs/activar-politica-de-acceso.md` |
| Guion de copia | `backend/copia_de_seguridad.py` |
| Guion de restauracion | `backend/restaurar.py` |
| Esquema base (creacion de tablas al arrancar) | `backend/esquema_base.py` |
| Configuracion de despliegue | `render.yaml` |

---

**Fin del documento 04 — Version 1.0 - borrador.**
Este borrador no ha sido revisado por un area legal. No debe entregarse a una entidad
publica como documento definitivo hasta que se cierren, como minimo, los pendientes 4, 10,
11, 13, 18 y 20 del cuadro anterior.
