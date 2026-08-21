# RFI — ALCANCE CORREGIDO

**21-ago-2026** · Resuelve los cuatro puntos sobre el diagnóstico [30](30-rfi-diagnostico-y-alcance.md)
**No se ha implementado nada. El módulo sigue sin montar.**

---

# 1 · D7 — documentos formales

## Me equivoqué, y a mejor. Corrijo el diagnóstico.

Dije que los adjuntos vivían **fuera** del gestor documental. **Es falso.** Lo
avisé como inconcluyente en los datos y aun así lo clasifiqué como defecto — que
es exactamente el error de juzgar por la forma que llevo toda la revisión
corrigiendo.

El código lo desmiente:

```js
// IssueModule.jsx:581 — `fileNode` viene de navegar el árbol del CDE
const newAdjunto = { id: fileNode.id, name: fileNode.name, gcs_urn: fileNode.gcs_urn };
```

`adjuntos[].id` **es `file_nodes.id`** — un UUID, como se ve en los datos
(`c7840a6a-5945-4a97-b0bd-…`). El módulo ya tiene su navegador de carpetas
(`fetchDocsNodes`, migas de pan) y el usuario **elige un documento que ya está en
el expediente**. No hay subida suelta ni objeto huérfano.

Mi comprobación contra datos —«26 adjuntos, 0 coincidencias»— era **engañosa**:
la base local tiene **1 solo `file_node`** en esa obra. No demostraba nada.

## Lo que SÍ falta, y es el mismo defecto que ya pagamos en Reviews

**El adjunto referencia el NODO, no la VERSIÓN.**

O sea: «el PDF de respuesta del RFI-014» apunta a *lo que haya hoy en ese
fichero*. Basta con que alguien suba una revisión para que el expediente enseñe
otra cosa bajo el mismo RFI, con su número y su veredicto puestos.

Es palabra por palabra lo que se corrigió en las entregas — y la corrección **ya
está construida y esperando**:

| pieza | estado |
|---|---|
| `useDocPreview` abre la **versión** y cae a «versión actual» en los legacy | **hecho** (Codex lo extrajo a un hook) |
| `/api/docs/signed-url` acepta `version_id` | **hecho** |
| `doc_reviews.items` ya guarda `{node_id, version_id, name}` | **hecho** — es el patrón |
| `IssueModule` construye la URL **a mano** y no usa el hook | pendiente |

## Solución mínima — el mismo patrón congelado, sin tabla ni migración

`adjuntos` sigue siendo la misma columna JSONB y admite **dos formas**, igual que
`steps` admite pasos nuevos y legacy:

```jsonc
// NUEVO
{"node_id": "…", "version_id": "…", "version_number": 3,
 "name": "500125-SCL-OT-GEN-RFI-014_respuesta.pdf", "rol": "respuesta"}

// LEGACY — intacto, no se migra ni se reinterpreta
{"id": "…", "name": "…", "gcs_urn": "…"}
```

- **`version_id`**: la versión viva en el momento de adjuntar. Es lo que congela
  el documento formal.
- **`rol`**: `consulta` o `respuesta`. Un RFI formal tiene dos documentos y hoy
  solo se distinguen por cómo alguien nombró el fichero (`…_respuesta.pdf`).
  Una clave, y el registro deja de depender de una convención de nombres.
- **`IssueModule` pasa a usar `useDocPreview`**, que ya sabe abrir las dos formas.
- **El backend valida el adjunto**: que el `node_id` sea de esta obra y que quien
  adjunta tenga permiso sobre él — lo mismo que hace Reviews con
  `_puede_con_estos_documentos`. Hoy no se comprueba nada.

**Los 26 adjuntos históricos no se tocan ni se convierten.** Siguen abriendo la
versión viva, como hoy, y el lector lo dice: «versión actual».

**Es pequeño y aditivo. No hace falta detenerse.**

---

# 2 · Ball-in-Court — quién puede pasar la pelota

Tiene razón en el matiz: «sin puertas de administrador» **no** es «cualquier
miembro de la obra».

## La regla mínima

> **Puede cambiar el `responsable_id` de un RFI: su AUTOR, su RESPONSABLE ACTUAL,
> o un ADMINISTRADOR. Nadie más.**

Y el destinatario tiene que ser **miembro de la obra**, como en todo el motor.

## Por qué esos tres y no otros

Porque son exactamente las tres posiciones que existen en el flujo real de un RFI,
y ninguna necesita permisos nuevos:

| quién | por qué le corresponde |
|---|---|
| **El autor** | Preguntó él. Dirige su consulta a quien debe responder, y la recupera cuando le respondan para revisar y cerrar |
| **El responsable actual** | Tiene la pelota. «Esto no es mío, es del proyectista» **es** el flujo, no una excepción |
| **Un administrador** | Para desatascar. Es la misma válvula que en el resto del sistema |

**Un miembro cualquiera de la obra NO puede** quitarle un RFI a otro en silencio.
Ésa es la diferencia con hoy, donde `PATCH` solo comprueba la obra.

Se apoya únicamente en lo que ya existe: `created_by`, `responsable_id`,
`users.role` y la membresía. **Ningún sistema de permisos nuevo.**

Y es auditable por construcción: cada cambio deja
`ball_in_court_changed {de, a, por, cuando}` en el historial.

---

# 3 · RFI legacy — cerrado y activo no son lo mismo

## Los números

De los 25: **19 cerrados o respondidos** y **6 «En revisión»** — abiertos, con
responsable solo como texto.

## RFI legacy CERRADO → se conserva exactamente

No se adopta, no se convierte, no se le aplican reglas nuevas. Es archivo. Su
`responsable` de texto, su veredicto y sus fechas quedan como están.

## RFI legacy ACTIVO → adopción explícita antes de seguir

Tiene razón: conservar el defecto «cualquiera dicta el veredicto» en un RFI que
todavía está vivo sería trasladar el agujero al producto nuevo.

**Mecanismo: la ADOPCIÓN.** Un RFI abierto sin `responsable_id`:

- **Puede** ser adoptado: alguien autorizado (§2: autor o administrador —el
  responsable actual no existe todavía como identidad) le asigna un
  `responsable_id` **eligiéndolo del directorio de la obra**.
- **No puede** recibir veredicto ni cierre hasta entonces. La ruta lo dice con su
  motivo: *«este RFI viene del registro anterior y todavía no tiene responsable
  del sistema; asígnalo antes de responderlo»*.
- Todo lo demás sigue funcionando: se puede leer, adjuntar y consultar.

La adopción deja `adopted {responsable_texto_original, responsable_id, por,
cuando}` en el historial.

**El texto histórico no se toca ni se interpreta.** Nadie decide que «Ing.
Valeria Barrenechea» es tal usuario: **una persona lo elige, y queda dicho quién
lo eligió.** El texto original se conserva al lado, para que el registro siga
diciendo lo que decía el documento.

---

# 4 · Numeración — tenía razón, y se puede demostrar

## `UNIQUE(model_urn, codigo)` era incorrecto

`model_urn` es un **alcance**, no la obra. Medido ahora mismo sobre la obra `1`:

```
alias registrados de la obra 1 : 8
model_urn usados hoy por RFI   : 1  ('proyectos/PQT8_TALARA')
```

Ocho alias de la misma obra. Basta con que un RFI se cree bajo otro de ellos
—`1`, `1_CANAL`, `b.a7ce4d60-…`— para tener **dos RFI-013 en la misma obra**, y la
restricción no lo impediría porque el `model_urn` sería distinto.

## Lo correcto, según el diseño ya congelado

```sql
UNIQUE (project_id, codigo)
```

`project_id` es la identidad canónica ([21](21-vocabulario-y-clave-de-referencias.md)),
y aquí cumple la regla: lleva clave ajena real a `projects(id)`.

**Y `project_id` pasa a ser obligatorio al crear.** Si el alcance no resuelve, la
creación falla — no se crea un RFI que nadie sabe de qué obra es. (Sin eso, un
`project_id` nulo escaparía a la restricción única: en SQL, dos NULL no chocan.)

**Los 25 históricos entran sin tocar nada:** 0 sin `project_id`, y 25 códigos
distintos bajo la obra `1`.

## El siguiente número, tratado como número

```sql
SELECT COALESCE(MAX(NULLIF(substring(codigo from '[0-9]+$'), '')::int), 0) + 1
  FROM doc_rfis WHERE project_id = %s
```

- Toma el **sufijo numérico**, no cuenta filas. Un borrado deja de reciclar
  números, y `RFI-9` ya no se ordena después de `RFI-10`.
- Los códigos que no encajen en el patrón se ignoran en el cálculo en vez de
  reventar.

## Y la concurrencia no acaba en un 500 opaco

Ni motor de secuencias ni tabla de contadores. El `INSERT` se reintenta hasta
tres veces ante violación de unicidad, recalculando el número. Si aun así no
puede, devuelve **409 con un mensaje que dice qué pasó**, no un 500.

> Determinista, sin infraestructura: si dos personas crean un RFI a la vez, uno
> obtiene el 026 y el otro el 027. Nunca dos 026, y nunca un error incomprensible.

---

# 5 · El alcance, ya corregido

### Esquema — 4 columnas, 2 restricciones, 0 tablas

```sql
doc_rfis
  responsable_id  INTEGER REFERENCES users(id)   -- a quién le toca AHORA
  vence_en        TIMESTAMP                       -- el plazo, en el objeto
  historial       JSONB DEFAULT '[]'              -- quién, qué, cuándo
  cerrado_por     VARCHAR(255)
+ UNIQUE (project_id, codigo)
+ CHECK  (estado IN ('Emitido','En revisión','Respondido','Cerrado'))
```

`responsable` (texto) **intacto**. `respuesta` (veredicto) **intacto**, se
renombra solo en pantalla a «Veredicto».

### Comportamiento

| # | |
|---|---|
| 1 | Numeración por sufijo numérico dentro de `project_id`, con reintento y **409**, nunca 500 |
| 2 | **Ball-in-court**: autor · responsable actual · administrador. Destinatario miembro de la obra |
| 3 | **Solo el `responsable_id` actual dicta el veredicto.** Cierra el autor o un administrador |
| 4 | **Adopción** obligatoria para un legacy activo antes de responder o cerrar |
| 5 | Transiciones gobernadas: `Respondido` exige veredicto y fecha; `Cerrado` exige haber pasado por `Respondido` |
| 6 | **Historial** en cada transición |
| 7 | **Notificación** al asignar, con `avisar()` |
| 8 | **BLOQUEADO** cuando el responsable deja la obra — se desatasca reasignando, sin puertas |
| 9 | **Adjuntos con `version_id` y `rol`**, validados contra la obra y el permiso de carpeta |
| 10 | La interfaz manda `responsable_id` **del directorio de la obra**, no de `localStorage` |

### Reutilización de `encargos`

Total y sin tabla nueva. `abrir` · `cerrar_los_de` · `avisar` · `mi_trabajo` ·
`recordatorios` ya funcionan con `objeto_tipo='RFI'`. Y con `responsable_id` en
el objeto, **`conciliar_encargos` pasa a detectar también lo que FALTA** —
cerrando la limitación que dejé documentada.

### Pruebas de aceptación

A las once del diagnóstico se añaden cuatro, una por decisión:

12. Un miembro cualquiera de la obra **no** puede cambiar el responsable; el
    autor y el responsable actual **sí**
13. Un legacy **activo** no admite veredicto hasta ser **adoptado**; un legacy
    **cerrado** queda intacto y no pide adopción
14. Dos RFI creados bajo **alcances distintos de la misma obra** no pueden
    compartir código; y una colisión da **409**, no 500
15. Un adjunto nuevo guarda `version_id`; subir una versión nueva **no cambia** lo
    que el RFI enseña; un adjunto legacy sigue abriendo la versión viva

### Qué deliberadamente NO se construye

Fusionar con Issue · respuesta en texto enriquecido · lista de distribución ·
referencia a elemento del modelo · progresiva/frente · declaración de impacto ·
Cost Management · migrar los 26 adjuntos históricos · convertir el texto
`responsable` en usuario · permisos nuevos · Issues · Transmittals · Submittals.

**Y el módulo no se monta** hasta que todo lo anterior pase las pruebas.

### Tamaño

| | |
|---|---|
| Columnas · restricciones · tablas · módulos | **4 · 2 · 0 · 0** |
| Ficheros | `routes/rfis.py`, `encargos.py`, `IssueModule.jsx` |
| Datos históricos | **no se tocan** |

---

**No he implementado nada. Espero su visto bueno para ejecutar este alcance.**
