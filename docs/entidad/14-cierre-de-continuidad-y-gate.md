# Cierre de continuidad (C7 ampliado) y FIRST ENTITY GO/NO-GO GATE — 2ª pasada

**Fecha:** 19-ago-2026 · Continúa `13-first-entity-readiness-report.md`, aceptado como base.

El propietario endureció el criterio: *Object Versioning por sí solo no cierra C7*.
Exige siete cosas, y pidió que la retención se **derive**, no se invente.

---

## 1 · Política de retención — la propuesta, y por qué

### Primero, dos cosas que casi todo el mundo confunde

| | qué protege | plazo | cómo se resuelve |
|---|---|---|---|
| **Retención de copias** | que un borrado o una sobrescritura por error se pueda deshacer | corto, **operativo** | soft delete / versionado del bucket |
| **Conservación del expediente** | la obligación legal de conservar el expediente técnico | largo, **legal** | no borrando, más la copia de salida del contrato |

**El versionado del bucket NO cumple la conservación legal, y la conservación legal
NO se configura en Google Cloud.** El plazo legal peruano de conservación del
expediente de obra pública **no lo afirmo aquí**: no lo he verificado, y una cifra
inventada en un documento que verá una entidad pública es peor que ninguna. Va al
contrato, con el asesor legal de la entidad. Lo que sigue es solo lo operativo.

### Lo que ya trae el bucket sin tocar nada

**El *soft delete* de Cloud Storage viene ENCENDIDO por defecto, con 7 días**, en
todo bucket nuevo, y es configurable entre 7 y 90 días. El *Object Versioning*,
en cambio, viene **apagado**. Es decir: la entidad ya nace con una red contra
borrados, y sin ninguna contra sobrescrituras.

### El dato que decide cuál importa

Medido en el código: cada subida escribe un blob con nombre
`multi-tenant/{obra}/{timestamp}_{uuid8}_{fichero}` ([documents.py:1019](backend/routes/documents.py:1019)).
Lleva marca de tiempo y un identificador aleatorio, así que **la aplicación nunca
pisa un blob existente**. Una versión nueva es un objeto nuevo.

De ahí se sigue algo que cambia la recomendación del informe anterior:

- **El versionado protege contra algo que esta aplicación no hace.** Sigue
  valiendo la pena (cubre un fallo del código o a alguien con la credencial),
  pero no es el control principal.
- **El control que importa es el soft delete**, porque el borrado sí ocurre de
  verdad: `delete_gcs_blob` se llama desde [file_system_db.py:791](backend/file_system_db.py:791)
  y desde `routes/uploads.py`.

### El plazo sale del tiempo de detección, no del coste

El coste no es una restricción, y conviene decirlo con números. A **$0,020/GB/mes**
(Standard, us), incluso 100 GB de expediente son **$2,00/mes**; los objetos
borrados solo cuestan mientras dura su retención, y solo los que se borren. Es
decir: **elegir 7 días en vez de 90 no ahorra nada apreciable.** Si el coste no
manda, manda el riesgo.

Un plazo de retención cubre la ventana entre que algo se pierde y **alguien se da
cuenta**. Una municipalidad no revisa el expediente a diario: lo revisa por hitos
—valorizaciones, entregas, absolución de consultas—, con cadencia típicamente
mensual. Y hay una asimetría que importa:

- un **borrado** se nota relativamente pronto: el documento no está, alguien lo busca;
- una **sobrescritura** puede no notarse nunca hasta que alguien abre el fichero y
  ve que el contenido no es el que esperaba. Es silenciosa.

### La propuesta

| control | valor | por qué ese valor |
|---|---|---|
| **Soft delete** | **90 días** (el máximo) | cubre un trimestre entero: un borrado ocurrido justo después de una valorización se detecta en la siguiente, con margen para reaccionar. 7 días no cubren ni un ciclo. Y no cuesta más salvo que se borre de verdad |
| **Object Versioning** | **encendido** | seguro barato contra un fallo del código o un borrado con credencial. No es el control principal, por lo del nombre UUID |
| **Versiones no vigentes** | conservar **180 días**, máximo 3 por objeto | la sobrescritura silenciosa tarda más en detectarse que el borrado: dos trimestres. El tope de 3 evita crecimiento sin control |
| **Bucket Lock / retención bloqueada** | **NO** | es **irreversible** mientras dure: no se puede acortar ni quitar, y **impide borrar el bucket** hasta que todo objeto cumpla el plazo. Eso choca de frente con la cláusula de salida del contrato, que promete borrar los datos al terminar. En un piloto, la irreversibilidad juega en contra |

**Alternativa razonable** si se prefiere gastar menos aún: soft delete 30 días en
vez de 90. Cubre un ciclo de valorización pero no deja margen si la detección se
retrasa. No la recomiendo, y el ahorro es de céntimos.

---

## 2 · Copia independiente de los bytes

El criterio del propietario: *«copia independiente, con permisos separados en la
medida razonable»*. El problema real: `copia_de_seguridad.py` salva **la base**
—las fichas— pero **no los bytes**. Y el soft delete y el versionado viven
**dentro** del mismo bucket: no protegen contra perder el bucket ni contra una
credencial comprometida que borre a conciencia.

| opción | protege contra | NO protege contra | permisos separados |
|---|---|---|---|
| Soft delete + versionado (mismo bucket) | borrado y sobrescritura accidentales | pérdida del bucket, credencial comprometida | **no** |
| Segundo bucket, misma cuenta de Google, **otra** cuenta de servicio | borrado en el original, credencial de la app comprometida | pérdida de la cuenta de Google | **sí, razonable** |
| Segundo bucket en **otro proyecto** de Google | lo anterior + error de configuración del proyecto | pérdida de la cuenta | sí, más fuerte |
| **Dual-region / turbo replication** | caída de una región | **nada de lo anterior: replica también los borrados** | no |
| Copia fuera de Google | casi todo | — | sí, la más fuerte |

**Dual-region no es una copia de seguridad.** Es disponibilidad. Si alguien borra,
el borrado se replica. Conviene decirlo porque es el error más común.

**Recomendación para un piloto:** segundo bucket con **cuenta de servicio propia**,
a la que la credencial de la aplicación **no tiene acceso**, y a la inversa. Es lo
que cumple «permisos separados» sin montar tres proyectos.

**Lo que falta, y no lo he programado:** no existe hoy ninguna herramienta que
copie los bytes de un bucket a otro. `gcs_manager.descargar_a_fichero()` baja un
blob suelto, nada más. Se puede resolver **sin escribir código** con *Storage
Transfer Service* programado (ojo: **sin** marcar «borrar objetos del destino»,
que convertiría la copia en una réplica). Queda como acción del propietario.

---

## 3 · Lo que se ejecutó y lo que se midió

### El lector de PDF — la prueba visual que faltaba

Cinco ficheros **reales** del expediente, de 246 KB a 220 MB, en el componente real:

| fichero | páginas | resultado | trazo |
|---|---|---|---|
| 246 KB artículo | 9 | **DIBUJA** | 13,01 % |
| 1,4 MB plano A0 | 1 | **DIBUJA** | 12,47 % |
| 2,5 MB plano A0 (84.556 órdenes) | 1 | **DIBUJA** | 30,49 % |
| 77 MB informe | **828** | **DIBUJA** | 7,50 % |
| 220 MB ortofoto | 1 | **DIBUJA** | 29,82 % |

Cero errores de consola en los cinco. Navegación sobre las 828 páginas:
página 1 → 2 → 700, con **tres huellas de píxeles distintas**
(`fd2147`, `22fdf09d`, `6541e67e`): tres páginas realmente dibujadas.

**Dos advertencias honestas.** (a) Los tiempos medidos **no valen** como medida de
experiencia: la pestaña estaba oculta y hubo que sustituir `requestAnimationFrame`
por temporizadores, que el navegador estrangula. Son cotas superiores, no
rendimiento real. (b) Falta la captura visual con el panel del navegador a la
vista; el dibujo está medido píxel a píxel, pero **verlo con los ojos sigue
pendiente**.

Antes de esto hubo un falso positivo que casi reporto como defecto: todos los
lienzos salían en blanco. La causa era que pdf.js mueve su bucle de dibujo con
`requestAnimationFrame`, y el navegador lo **congela** en una pestaña oculta
(`visibilityState: hidden`). El lector estaba bien.

### Prueba autenticada completa — 17 de 19

Instancia en perfil portal, `ENFORCE` encendido, política estricta, DDL apagado,
postura **`completa: true, faltan: 0, puntos: 7`**.

Verificado con la llamada que hace el portal de verdad:
- publicar **sin** código de idoneidad → **HTTP 400**: *«Falta el código de
  idoneidad: hay que decir para qué queda autorizado el documento antes de
  publicarlo»*
- `SHARED → PUBLISHED` con código A1 → **200**, con emisión sellada
- salto inválido `PUBLISHED → WIP` → **HTTP 400**
- crear y renombrar carpeta, índice del expediente (xlsx real), 50 asientos de
  actividad, invitar usuario, cerrar sesión → el token deja de servir (401)

Los **2 fallos tienen una sola raíz**: no hay credencial de Google en esta máquina,
así que **subir bytes es imposible aquí**. Y de ahí se sigue lo que **NO está
probado**: que la huella SHA-256 se calcule al subir, el versionado con bytes
reales, y la descarga. La cobertura de huella en la obra de pruebas es **0 %**
porque esos documentos se crearon sin bytes.

### Infraestructura — medido

70,4 MB residentes por proceso, estable tras ejercitarlo. El arranque real es
[backend/package.json:7](backend/package.json:7): `bootstrap_esquema.py` y luego
gunicorn **`--workers 1 --threads 4`**.

| pieza | plan | $/mes |
|---|---|---|
| Backend (Web Service) | **Standard** 2 GB / 1 CPU | 25 |
| Portal (Static Site) | gratis | 0 |
| Base de datos | según proveedor | ~7–20 |
| Workspace (una vez, no por entidad) | Pro | 25 |

Standard y no Starter: en 512 MB ya murió una vez, y un expediente real mueve
ficheros de 220 MB y exportaciones completas. El margen es el producto.

---

## 4 · Hallazgos nuevos de esta pasada

### A. `bootstrap_esquema.py` dice «COMPLETO» cuando no lo está — *el más grave*

Salida literal: **`tablas del manifiesto: 88 de 88`** y **`el esquema quedó
COMPLETO`**… con **9 rutinas fallidas** y una columna que el 2FA necesita
(`totp_recuperacion.pimienta`) **ausente**. El manifiesto cuenta **tablas**, no
**columnas**.

Consecuencia real, medida: activar el segundo factor devuelve **HTTP 500**, y la
pantalla de seguridad **HTTP 500**. Quien despliega lee «COMPLETO», sigue adelante,
y el fallo aparece meses después, el día que el administrador de la municipalidad
intenta protegerse la cuenta.

En esta máquina la causa fue de propiedad de tablas (`ecd_app` no es dueño; lo es
`ecd_migrator`). En una instancia nueva el usuario de aplicación sí sería dueño y
debería funcionar — **pero «debería» es justo la palabra que este proyecto ha
aprendido a no aceptar.**

### B. `render.yaml` contradice el arranque real

`render.yaml` dice `alembic upgrade head && gunicorn --workers 4`.
`backend/package.json` dice `bootstrap_esquema.py && gunicorn --workers 1 --threads 4`.

**Ninguna de las 5 migraciones de alembic crea el esquema del segundo factor.** Si
una instancia nueva se aprovisiona desde el Blueprint (`render.yaml`) en vez de
como dice la guía, nace **sin el esquema del 2FA** y con **4 veces** el consumo de
memoria. Es un descriptor obsoleto y cargado, dentro del repositorio.

### C. `/api/docs/batch` responde éxito sin hacer nada

Con una acción que no reconoce, cae al final de la función y devuelve
**`HTTP 200 {"success": true, "processed": 1}`** sin tocar un solo documento.
El portal manda la clave correcta, así que ningún usuario lo sufre — pero una API
que dice «procesado 1» cuando no procesó nada es exactamente lo que me hizo
escribir cosas falsas en el informe anterior. No bloquea el piloto.

### D. `download_folder_urls` revienta en su propia rama de error

Con `folder_id` → **200**. Sin él → **500**, `UnboundLocalError: jsonify`, porque
un import posterior ensombrece el nombre. La salida del expediente **funciona**;
lo que está roto es el mensaje de error. No bloquea el piloto.

### E. Variables que el código lee y la guía no menciona

De 59 variables propias, **32 no están en la guía**. Las que importan:

- **`EXIGIR_2FA`** (por defecto `admin`) y **`EXIGIR_2FA_ESTRICTO`** (por defecto
  `false`): el segundo factor se **avisa** pero **no se obliga** hasta encender el
  segundo. Es el interruptor que la entidad enciende **después** de dar de alta a
  sus administradores. No está en la guía.
- **`ECD_CANDADO_ESTADOS`** (por defecto `false`): pone el `CHECK` que garantiza
  que el estado sea uno de los cuatro de ISO 19650. Está apagado por una razón
  buena —evitar que el candado cierre por delante del código desplegado— que **no
  aplica a una instancia nueva**, donde el código ya es el nuevo. Debería encenderse.
- **`STRICT_ISO_VISIBILITY`** (por defecto `false`): con él apagado, quien tenga
  permiso de carpeta ve también los documentos en **Trabajo en curso**. En la
  instancia actual está apagado por una razón medida (3.035 de 3.036 documentos
  están en WIP); en una instancia nueva, que nace vacía, se puede encender.

Sin peligro: `ALLOW_DEMO_TOKEN`, `ALLOW_OPEN_REGISTRATION` y `FLASK_DEBUG` vienen
todos apagados por defecto.

---

## 5 · FIRST ENTITY GO/NO-GO GATE — 2ª pasada

| criterio de continuidad | estado |
|---|---|
| 1. Protección/versionado/retención del bucket primario | **política propuesta y razonada; sin configurar** — no hay credencial de Google en esta máquina |
| 2. Copia independiente con permisos separados | **diseñada; no existe** |
| 3. Eliminación controlada de un archivo de prueba | **no ejecutable aquí** |
| 4. Recuperación desde versión/copia | **no ejecutable aquí** |
| 5. Comparación de hash antes/después | **hecho para la BASE** (15 documentos, huella `8a7896806878866c` idéntica); **no para los bytes** |
| 6. Ensayo real de restauración de BD | **pendiente**: exige la contraseña de `postgres` |
| 7. Evidencia documentada | **este documento** |
| Plan de infraestructura | **decidido, sin contratar** |
| 2FA del administrador | **NO VERIFICADO — falla con 500 en esta base** |
| Variables/secrets de la instancia nueva | **inventariados; 32 ausentes de la guía** |
| Prueba autenticada completa | **17 de 19; el camino de los bytes sin probar** |
| Prueba visual del lector PDF | **dibujo medido en 5 tamaños reales; falta verlo con los ojos** |

### Veredicto: **NO-GO**

No por lo mismo que la vez pasada. El bloqueante de continuidad sigue abierto
—nada de los puntos 1 a 4 se puede ejecutar sin la credencial de Google, que es
suya— pero además apareció algo peor:

**El segundo factor del administrador no está verificado, y en la única base donde
pude probarlo, falla.** Es la cuenta que puede archivar la obra entera. Y el
mecanismo que debería haber avisado —el bootstrap— dijo **«COMPLETO»**.

Ese es el patrón que este proyecto lleva meses pagando: controles que se describen
por su intención y no por su comportamiento. Un bootstrap que cuenta tablas y no
columnas es otro.

---

## OWNER ACTION PACK — para llegar a GO

| # | acción | dónde | evidencia que deja |
|---|---|---|---|
| 1 | **Soft delete a 90 días** en el bucket | Cloud Storage → Bucket → Protection | captura de la configuración |
| 2 | **Object Versioning encendido** + regla de ciclo de vida: versiones no vigentes 180 días, máximo 3 por objeto | ídem | captura de la regla |
| 3 | **NO** poner Bucket Lock | — | (decisión consciente, va al contrato) |
| 4 | **Segundo bucket** `ecd-<entidad>-copia` con **cuenta de servicio propia**, sin acceso desde la credencial de la app | Cloud Storage + IAM | las dos cuentas y sus permisos |
| 5 | **Storage Transfer Service** diario del bucket primario al de copia, **sin** «borrar objetos del destino» | Cloud Storage → Transfer | la primera transferencia completada |
| 6 | **Borrar un fichero de prueba y recuperarlo**, cotejando su hash antes y después (`gcloud storage objects describe` da el md5) | Cloud Shell o consola | los dos hashes, iguales |
| 7 | **Ensayo de restauración de BD**: `python herramientas/ensayo_de_restauracion.py` (pide la contraseña de `postgres` por teclado, no se escribe en ningún sitio) | su máquina | fichero de evidencia con veredicto |
| 8 | **Plan Standard** (2 GB) para el backend | Render | `/api/health` en frío < 1 s |
| 9 | **Activar el 2FA del administrador y comprobar que activa de verdad** — si devuelve 500, es el hallazgo A y hay que arreglarlo antes de entregar | portal de la entidad | la pantalla de seguridad diciendo «activo» |
| 10 | Decidir sobre `EXIGIR_2FA_ESTRICTO`, `ECD_CANDADO_ESTADOS` y `STRICT_ISO_VISIBILITY` para la instancia nueva | panel de Render | los valores puestos |

Los puntos 1 a 6 son suyos porque **la credencial de Google no existe en esta
máquina** (comprobado): no hay forma de que yo toque el bucket, ni por accidente.
