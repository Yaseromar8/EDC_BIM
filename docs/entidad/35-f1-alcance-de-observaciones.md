# F1 — ALCANCE MÍNIMO DE OBSERVACIONES / ISSUE DOCUMENTAL

**21-ago-2026** · Segunda pieza del [mapa de cierre](33-mapa-de-cierre-de-frontend-docs.md)
**Diagnóstico. No se ha implementado nada.**

---

# 0 · La respuesta, primero: **B**, y no por poco

> **`doc_redlines` NO debe evolucionar hacia «Observación/Issue». Ya es otra
> cosa, es legítima, y está en uso.**

Me guié por el comportamiento, como pidió, y los datos son inequívocos:

```
adjuntos:  RL_0003_INGRESO_DE_TUBERIAS_SECUNDARIAS_A_BUZON_BP-01.pdf
           RL_0004_500125-SCL-CNS-RL-SKT-P08-0004_RL_BP-01_a_BP-04.pdf
                                        ↑↑↑
                                    SKT = SKETCH

títulos:   REFUERZO_EN_ABERTURAS
           Reubicar_BP-04_Y_CAMBIO_DE_COTA_BP-01
           ACABADO_DE_TAPAS_DE_BUZONES_EN_INTERSECCIONES
```

Esto no es «encontré un defecto, corrígelo». Es **«se modifica el proyecto:
reubicar el buzón BP-04 y actualizar cotas»**, documentado en un **croquis
numerado y firmado** (`RL_0003`, `RL_0010-RL_0012`), con sufijo `_RL_OK` cuando
queda aprobado.

**`doc_redlines` es un REGISTRO DE CROQUIS DE MODIFICACIÓN.** Es hermano del
RFI: misma familia —registro de documentos formales con veredicto—, distinto
contenido. El RFI **pregunta**; el RedLine **propone una corrección al proyecto**.

**Convertirlo en un módulo de observaciones destruiría un registro real.**

---

## 1 · Definición exacta del objeto

| | |
|---|---|
| **Qué es** | El registro de los croquis de modificación (*red line sketches*) de la obra: qué se cambió respecto al proyecto, con qué documento, y si quedó aceptado |
| **Qué NO es** | Un hilo de observaciones. Un tablero de defectos. Un markup gráfico |
| **Su artefacto** | Un PDF numerado `RL_####`, firmado, adjunto desde el CDE |
| **Su veredicto** | `Aceptado` / `Rechazado` = **la modificación se aprueba o no** |

---

## 2 · Relación con Markups / Redlines gráficos

**Ya están separados, y bien.** No se tocan en ninguna línea de código:

| | `pdf_markups` | `doc_redlines` |
|---|---|---|
| Qué guarda | `page`, `kind`, `geometry`, `style`, `text_content` | `codigo`, `titulo`, `estado`, `respuesta`, `adjuntos` |
| Atado a | `file_node_id` — un documento | la obra, con su croquis adjunto |
| Dónde vive | **dentro del visor PDF** (`PdfToolsOverlay`), como herramienta | pantalla propia en la barra lateral |
| Se mencionan | `redlines.py` **no** nombra markups · `pdf_tools.py` **no** nombra redlines | |

### Sobre el nombre de la pantalla — **al revés de lo que sugería la hipótesis**

**«Red Line» es el nombre correcto y no hay que cambiarlo.** Es literalmente lo
que contiene: croquis de red line. Llamarla «Observaciones» introduciría la
confusión que se quería evitar.

Y no hay colisión en la interfaz: el markup gráfico **no es un módulo** — es una
herramienta dentro del visor, sin nombre propio en la barra lateral.

---

## 3 · Ciclo de vida — la hipótesis no la confirman los datos

La hipótesis era *detectar → corregir → verificar → cerrar*, con vuelta atrás.

**En los 33 registros no aparece ninguna fase de corrección.**

```
estado × veredicto :  Cerrado / Aceptado  →  33 de 33
fecha → fecha_respuesta:  19-nov → 20-nov  (un día)
autores distintos: 1   ·   responsables distintos: 1
```

El ciclo real observable es: **se emite el croquis → se revisa → se acepta → se
cierra.** Que es, palabra por palabra, el ciclo del RFI.

### Una salvedad honesta sobre esta evidencia

Los 33 se **cargaron retroactivamente por una sola persona** (autor = responsable
= la misma en todos, y fechas de nov-2025 a may-2026 cargadas después). Así que
muestran **el resultado**, no el flujo vivido dentro del sistema. Es posible que
en la práctica haya una fase de corrección que nunca llegó a registrarse aquí.

**Por eso propongo el ciclo que los datos sí sostienen, y no inventar el otro.**
Si el piloto demuestra que hace falta la fase de corrección, es **un estado más**
y una transición — aditivo, no un rediseño.

### El ciclo mínimo

```
Emitido ──asignar──► En revisión ──veredicto──► Respondido ──► Cerrado
                          ▲                          │
                          └──── devolver ────────────┘
```

**No invento estados.** Son los cuatro que ya existen, ya se usan y ya tienen
`CHECK` probado en el RFI. Y `Respondido → En revisión` (devolver) ya está en el
motor: cubre exactamente el «la verificación falla, vuelve» de su hipótesis.

---

## 4 · Identidades del flujo — dos, no tres

Su expectativa era distinguir **detecta / corrige / verifica**. Para este objeto,
**dos bastan**, y añadir la tercera sería modelar una fase que no existe:

| | quién | de dónde sale |
|---|---|---|
| **Quien emite** | El que levanta el croquis | `created_by` — ya existe |
| **Quien resuelve** | El que acepta o rechaza la modificación | `responsable_id` — el mismo patrón del RFI |

**Y quien verifica es quien emitió**, igual que en el RFI cierra quien preguntó.
Su intuición era correcta; lo que no hace falta es una tercera identidad para
expresarla.

### Si quien emitió sale de la obra

**No hace falta un mecanismo nuevo.** El RFI ya resolvió exactamente este caso:

- `estado_del_flujo` calcula **BLOQUEADO** cuando el responsable deja la obra —
  no se guarda, se calcula al mirarlo.
- Se desatasca **reasignando**, que en esta familia es la operación ordinaria y
  **no lleva puertas de administrador**.
- Y para el cierre: **el administrador puede cerrar** (regla del RFI), así que
  una observación cuyo emisor se fue **nunca queda bloqueada para siempre**.

**Cero delegaciones, cero mecanismos nuevos.**

---

## 5 · Ball-in-Court y `encargos`

| fase | quién aparece en Mi Trabajo |
|---|---|
| `Emitido` sin asignar | **nadie** — no le corre a nadie |
| `En revisión` | **el responsable** (quien debe aceptar o rechazar) |
| `Respondido` | **nadie** por proyección; le toca al emisor cerrar |
| `Cerrado` | **nadie** |

`encargos` sigue siendo **solo la proyección**: se abre y se cierra desde las
transiciones del objeto, nunca al revés. Y con `responsable_id` en la
Observación, **la conciliación pasa a poder reconstruirlos** — hoy de un redline
solo detecta que *sobre* un encargo, nunca que *falte*, por la misma razón que
tenía el RFI.

---

## 6 · Gobierno

Las posiciones del propio flujo bastan. **Ningún permiso nuevo.**

| acción | quién |
|---|---|
| **Crear** | Cualquier miembro de la obra *(igual que hoy; levantar un croquis es trabajo ordinario)* |
| **Asignar / cambiar el responsable** | El **emisor**, el **responsable actual**, o un **administrador** |
| **Declarar el veredicto** (aceptar/rechazar la modificación) | **Solo el responsable actual** |
| **Devolver a revisión** | El **emisor** o un **administrador** |
| **Cerrar** | El **emisor** o un **administrador** |
| **Desatascar** | El administrador reasigna, o cierra |

Es la tabla del RFI. **No porque se copie por inercia, sino porque el objeto es
de la misma familia** — y donde la semántica difiere (§3, §4) el alcance ya se
aparta de él.

---

## 7 · Documentos y versiones

**Sí, la versión donde se detectó debe quedar congelada.** Es el mismo defecto
que ya se corrigió en RFI: hoy el adjunto apunta al **nodo**, así que basta con
que alguien suba una revisión para que el croquis `RL_0004` enseñe otra cosa.

Mismo patrón, ya construido y probado:

```jsonc
{"node_id": "…", "version_id": "…", "version_number": 3,
 "name": "RL_0004_…_SKT_….pdf", "rol": "deteccion"}
```

### Los roles — **dos, y no más**

| rol | para qué |
|---|---|
| `deteccion` | El croquis o el plano donde se marcó la modificación |
| `correccion` | El documento corregido, si lo hay |

**No invento un tercero.** Y sobre su pregunta directa:

> **Aportar una versión corregida NO debe ser obligatorio para cerrar.**

Los datos lo desaconsejan: **29 de 33 tienen un solo adjunto** — el croquis.
La corrección se refleja en la siguiente emisión del plano, que sigue su propio
camino por el CDE. Exigir un adjunto de corrección obligaría a inventar uno para
cerrar registros que hoy se cierran legítimamente sin él.

**Capacidad disponible, no obligación.**

---

## 8 · Históricos

Los 33 están **todos cerrados**. Por tanto:

- **No se convierten, no se reconstruyen actores, no se reescribe su historia.**
- **Ninguno pide adopción**: la regla `necesita_adopcion` ya exige *legacy **y**
  abierto*, y ninguno está abierto. Quedan como archivo, exactamente igual.
- Sus 29 adjuntos **no se migran**: siguen abriendo la versión viva, y el lector
  lo dice («versión actual»).
- El texto `responsable` (`'Yaser Omar'` en los 33) **no se convierte en usuario**.

**Solo las Observaciones nuevas nacen bajo el modelo profesional.**

---

## 9 · Cambios mínimos de esquema

Idénticos a los del RFI, sobre la tabla gemela:

```sql
doc_redlines
  responsable_id  INTEGER  → users(id) ON DELETE SET NULL
  vence_en        TIMESTAMP
  historial       JSONB DEFAULT '[]'
  cerrado_por     VARCHAR(255)
  project_id      TEXT NOT NULL → projects(id)
+ UNIQUE (project_id, codigo)
+ CHECK  (estado IN ('Emitido','En revisión','Respondido','Cerrado'))
```

**4 columnas · 5 restricciones · 0 tablas · 0 módulos nuevos.**

Y en código: `flujo_de_rfi.py` **se generaliza** a `flujo_de_registro.py` con las
etiquetas por parámetro, en vez de duplicarse. Dos copias de una regla de
gobierno acaban divergiendo — y ya se pagó esa lección con `_faltantes` y
`_sigue_debiendose` usando criterios distintos.

En la interfaz: `RedLineModule` enciende `usaDirectorio: true`. **El componente
ya lo soporta** desde F2.

---

## 10 · Pruebas de aceptación

El ensayo del RFI **parametrizado**, más lo propio de este objeto:

1. Se crea sin responsable → no aparece en la bandeja de nadie
2. Se asigna → el responsable lo ve con plazo (**días calendario**); nadie más
3. Un miembro cualquiera **no** puede cambiar el responsable
4. **Solo el responsable** dicta el veredicto — ni el emisor
5. Aceptado → veredicto y fecha congelados, encargo cerrado
6. **Devolver a revisión** por el emisor → vuelve a abrirse el encargo
7. Cierra el emisor; un cerrado no se reasigna ni se modifica
8. El responsable sale de la obra → **BLOQUEADO**, y se desatasca reasignando
9. **El emisor sale de la obra** → un administrador puede cerrarlo igualmente
10. Los **33 históricos** siguen intactos y **ninguno pide adopción**
11. Dos alcances de la misma obra **no comparten código `RL-`**
12. Concurrencia: creaciones simultáneas, códigos distintos, **ningún 500**
13. Adjunto nuevo fijado a `version_id` con rol `deteccion`; legacy intacto
14. **Se puede cerrar SIN adjunto de corrección**
15. La conciliación **detecta un encargo de Observación que falta**
16. Invariantes: ni documentos, ni versiones, ni SHA-256, ni permisos

---

## 11 · Qué deliberadamente NO construir

**Un módulo Issue/Observación nuevo.** Y conviene decir por qué, porque es la
decisión de fondo:

El criterio de cierre pide *«generar y cerrar Issues/observaciones
documentales»*. Una observación **sobre un documento** —«este plano está mal,
corrígelo»— **ya existe y funciona**: es una **Review rechazada con comentario**,
con su historial fechado y su vuelta al autor. Construir un segundo camino para
lo mismo añadiría una forma más de decir lo mismo, y ninguna capacidad.

Una observación **sobre la obra física** —un defecto en sitio, con foto y
ubicación— **no es documental**: es Field, Generación 2, y está fuera del camino
crítico por decisión ya tomada.

Tampoco: fase de corrección con verificador propio *(§3: los datos no la
sostienen)* · tercera identidad · delegaciones · reabrir un cerrado · plantillas
· referencia a elemento BIM *(aditiva, cuando llegue `frontend-react`)* ·
renombrar la pantalla · migrar los 33 · migrar sus adjuntos · convertir el texto
`responsable`.

---

# Recomendación final

# B · Mantener RedLines como RedLines

**No** evolucionarlas hacia Observaciones: **ya son otra cosa** —un registro de
croquis de modificación, numerado y firmado— y convertirlas destruiría un
registro real de 33 documentos.

Lo que **sí** necesitan es el **mismo tratamiento profesional que acaba de
recibir el RFI**, porque comparten familia y comparten defectos: hoy cualquier
miembro dicta su veredicto y su responsable vive en el navegador.

**Y el «Issue documental» que el criterio de cierre menciona ya existe con otro
nombre: la Review rechazada.** No hace falta construirlo.

Si acepta esta lectura, F1 deja de ser «crear Issues» y pasa a ser **«dar a
RedLines el tratamiento del RFI»**: 4 columnas, 5 restricciones, cero módulos, y
un ensayo parametrizado del que ya existe.

---

**STOP.** No he implementado nada. No he tocado `frontend-react`, 3D, 4D ni LOB.
