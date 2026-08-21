# RFI — DIAGNÓSTICO DEL FLUJO ACTUAL Y ALCANCE MÍNIMO PROFESIONAL

**21-ago-2026** · Tercera pieza de la Generación 1
**No se ha tocado código.**

---

## 0 · La conclusión, primero

El RFI de este producto **no es un módulo a medio construir: es un REGISTRO de
documentos formales**, y eso está bien.

Los datos lo dicen sin ambigüedad. `respuesta` no contiene ninguna respuesta:
contiene un **veredicto** — `Aceptado` (13), `Rechazado` (6), vacío (6), con nueve
caracteres como máximo. La pregunta y la respuesta reales viven en PDF firmados:

```
adjuntos → 500125-SP-OT-GEN-RFI-003.pdf
           500125-SCL-OT-GEN-RFI-014_respuesta.pdf
```

Así funciona un RFI en obra pública peruana: es un documento numerado, firmado y
transmitido formalmente, y se responde con otro documento firmado. **Añadirle un
campo de respuesta en texto enriquecido porque ACC lo tiene sería copiar la forma
y perder el fondo.**

Lo que le falta no es contenido. Es **responsabilidad y rastro**.

Y hay un hecho que condiciona todo lo demás:

> **El módulo de RFI no está montado.** `RfiModule.jsx` existe y su propio
> comentario lo dice: *«Actualmente NO está montado en la barra lateral —se
> retiró a pedido»*. En `FilesPage.jsx` solo se carga `RedLineModule`.
> **Hoy el RFI no es accesible desde el portal.**

---

## 1 · Qué existe realmente

### 1.1 · Esquema

```
id               uuid          PK, gen_random_uuid()
model_urn        varchar(255)  NOT NULL          project_id  text
codigo           varchar(50)   NOT NULL          titulo      varchar(255)
estado           varchar(50)   def 'Emitido'     responsable varchar(255)
fecha            timestamptz   def now()         adjuntos    jsonb def '[]'
created_by       varchar(255)  created_at/updated_at
respuesta        varchar(50)   fecha_respuesta   timestamptz
```

Restricciones: **solo la clave primaria y tres NOT NULL.** Ningún `CHECK` sobre
`estado`, **ninguna restricción única sobre `(model_urn, codigo)`**, ninguna clave
ajena, ninguna columna de historial.

### 1.2 · Rutas — tres

| ruta | guardia |
|---|---|
| `GET /api/rfis/<model_urn>` | ninguno propio; lo cubre el middleware (`/api/rfis` está en `_PROJECT_SCOPED_PREFIXES`) |
| `POST /api/rfis` | **ninguno propio**; también central |
| `PATCH /api/rfis/<id>` | `guardia_de_recurso('doc_rfis', rfi_id)` ✔ |

### 1.3 · Los 25 RFI reales

| | |
|---|---|
| Códigos | `RFI-001`…`RFI-025`, **25 de 25 distintos** |
| Estados en uso | `Cerrado` 18 · `En revisión` 6 · `Respondido` 1 · **`Emitido` 0** (es el valor por defecto) |
| Responsable | **el mismo en los 25**: `Ing. Valeria Barrenechea` |
| `respuesta` | `Aceptado` 13 · `Rechazado` 6 · vacío 6. **Longitud máxima usada: 9** |
| Adjuntos | 26 en total; casi todos 1, uno tiene 3 |
| Obra | una sola: `proyectos/PQT8_TALARA` → resuelve a `1` |
| **Encargos de tipo RFI** | **0** |

### 1.4 · Un acierto que conviene no romper

`fecha` y `created_at` **difieren en los 25**: `fecha` va de nov-2025 a abr-2026 y
`created_at` de abr a may-2026. Es decir, `fecha` guarda **la fecha contractual
del documento** y `created_at` cuándo se cargó en el sistema.

Eso está bien y hay que conservarlo. Un registro que no distingue esas dos fechas
no sirve para responder a una supervisión.

---

## 2 · Defectos reales

### 🔴 D1 · Cualquiera con acceso a la obra puede dictar el veredicto y cerrar el RFI

```python
# routes/rfis.py:140
allowed_fields = ['titulo', 'estado', 'responsable', 'fecha', 'adjuntos',
                  'respuesta', 'fecha_respuesta']
```

`PATCH` comprueba **la obra** (`guardia_de_recurso`) y **nada más**. No hay
distinción entre quien pregunta y quien responde: el propio autor puede marcar su
RFI como `Aceptado` y cerrarlo.

En un objeto contractual eso no es una carencia de funcionalidad: **es que el
registro no prueba nada.**

### 🔴 D2 · `responsable` es texto libre de una lista guardada en el navegador

```js
// IssueModule.jsx:80
const saved = localStorage.getItem(cfg.storageKey);   // 'rfi_responsables'
```

No es un directorio: es un **autocompletar personal**. Otra persona, en otro
ordenador, ve otra lista. Por eso los 25 tienen el mismo valor: lo tecleó una vez
alguien, en su navegador.

Consecuencia directa: **no se puede saber a quién le toca**, y por eso hay **cero
encargos de tipo RFI** aunque la conexión al motor ya esté escrita — espera un
`responsable_id` que la interfaz nunca manda.

### 🔴 D3 · La numeración se calcula contando

```python
# routes/rfis.py:90
SELECT COUNT(*) FROM doc_rfis WHERE model_urn = %s
codigo = f"RFI-{(count + 1):03d}"
```

Sin restricción única sobre `(model_urn, codigo)`. Dos creaciones simultáneas
producen **el mismo número**. En un objeto cuya identidad contractual **es** su
número, eso es grave: dos RFI-013 no se distinguen en un expediente.

### 🟠 D4 · El estado y los campos de respuesta no están acoplados

- **2 RFI tienen `fecha_respuesta` sin ninguna respuesta.**
- 3 de los 6 «En revisión» tienen `fecha_respuesta` puesta.

Cada campo se escribe por separado y nada comprueba que el conjunto tenga
sentido.

### 🟠 D5 · Cero historial

No existe. `updated_at` se pisa en cada cambio. **No se puede saber quién cambió
el responsable, quién dictó el veredicto ni cuándo** — solo el estado final.

### 🟠 D6 · Cero notificación

`mailer.enviar()` existe y funciona; RFI no lo llama. Nadie se entera de que le
toca un RFI, igual que pasaba con las Reviews antes de cerrarlas.

### 🟠 D7 · Los adjuntos viven fuera del gestor documental

`adjuntos` es un JSON con `{id, name, gcs_urn}` — una **ruta suelta**, no una
referencia a `file_nodes`. Los documentos formales del RFI quedan por tanto sin
versión, sin estado ISO, sin código de idoneidad, **sin SHA-256**, sin permisos
de carpeta, y **fuera del índice y de la exportación del expediente**.

> **Salvedad honesta:** lo comprobé estructuralmente en el código. La comprobación
> contra datos fue inconcluyente: la base local tiene **1 solo `file_node`** en esa
> obra, así que que los 26 adjuntos no casen no demuestra nada por sí mismo. Hay
> que repetirlo contra producción.

Es el defecto de mayor calado del RFI, y **es una pieza propia**, no un detalle
de este alcance.

---

## 3 · Los ocho puntos que pidió revisar

### 3.1 · Ball-in-court — y por qué **no** copio el mecanismo de Reviews

Su instinto era correcto: **son semánticas distintas.**

| | Review | RFI |
|---|---|---|
| El responsable de un paso | lo **fija el flujo** al crearse | **se mueve** como parte del flujo normal |
| Cambiarlo | es un **rescate** de un proceso atascado | es **el mecanismo**: pregunto → respondes → reviso → cierro |
| Puertas | admin · solo BLOQUEADA · motivo | **ninguna de esas** |

En una Review, sustituir es la excepción. En un RFI, **pasar la pelota es la
operación ordinaria**. Encerrarla tras «solo administrador y solo si está
bloqueada» convertiría el flujo normal en un trámite.

Lo que **sí** se conserva de Reviews: que quede rastro de cada cambio, y que el
nuevo responsable sea miembro de la obra.

**Convivencia del dato contractual con la identidad operativa**, siguiendo la
semántica ya congelada:

```
responsable      (texto)  → lo que dice el documento. NO se toca, NO se reinterpreta.
responsable_id   (nuevo)  → a quién le toca AHORA, como identidad del sistema.
encargo                   → la proyección de eso en «Mi Trabajo».
```

**Y hay una razón concreta para que `responsable_id` viva en el RFI y no solo en
el encargo:** hoy `conciliar_encargos` **no puede detectar que FALTE** un encargo
de RFI, precisamente porque del objeto no se deduce a qué usuario abrírselo. Lo
documenté como consecuencia aceptada. Con `responsable_id` en el objeto, esa
limitación desaparece y la conciliación queda completa. **La proyección se vuelve
reconstruible, que es la propiedad que importa.**

### 3.2 · Plazo

Misma lección que Reviews, ya pagada: **el plazo vive en el objeto**
(`doc_rfis.vence_en`), no en la proyección. Empieza **cuando se asigna**, no
cuando se crea el RFI —un RFI emitido y sin asignar no le corre a nadie—. «Mi
Trabajo» ya lo ordena por vencimiento y ya pinta «vencido hace N d» en rojo.
`recordatorios.py` ya funciona y ya no repite. **Días calendario.**

### 3.3 · Respuesta oficial

**No están mezcladas: es que la formal no existe como campo.** `respuesta` es el
**veredicto** y el contenido está en el PDF adjunto.

Mínimo:
- **Quién puede emitirla:** el `responsable_id` actual. Hoy puede cualquiera (D1).
- **Qué queda congelado al cerrar:** el veredicto, su fecha, quién lo dictó y la
  lista de adjuntos en ese momento.
- **No añadir** un campo de respuesta en texto. Sería copiar ACC contra la forma
  real de trabajar de este cliente.

Y en la interfaz debería llamarse **«Veredicto»**, no «Respuesta». Es gratis y
quita una confusión que hoy engaña a quien lee la tabla.

### 3.4 · Estados

Los cuatro que ofrece la interfaz —`Emitido` → `En revisión` → `Respondido` →
`Cerrado`— **son un ciclo coherente y suficiente**. No hace falta inventar
ninguno.

Lo que falta no son estados: es que **las transiciones estén gobernadas**. Hoy
`estado` es texto libre sin `CHECK` y se puede saltar de cualquiera a cualquiera.

### 3.5 · Referencias — qué puede soportar la arquitectura hoy

| referencia | ¿ahora? | por qué |
|---|---|---|
| **Documento / versión** | **Sí, y hace falta** (D7) | `file_nodes`/`file_versions` existen. Es lo que convierte el adjunto en parte del expediente |
| **Elemento del modelo** | **Esperar** | `element_docs` existe y podría servir, pero ningún RFI real lo pide todavía |
| **Issue** | **Esperar** | Issues no existe aún como objeto. Cuando exista, el RFI lo **referencia** — no se fusiona |
| **Progresiva / frente** | **Esperar, pero es nuestro diferencial** | `lob_linear_zones` y `project_frentes` ya existen. «RFI en el PK 634+20» es algo que ACC no sabe decir. Va con la Generación 2 |

### 3.6 · Impacto

**Sí: el RFI debe poder DECLARAR un impacto potencial. No: no construimos Cost
Management.**

Un RFI de obra pregunta por algo que suele mover plazo o metrado. Que el RFI lo
declare —`impacto_plazo_dias`, `impacto_metrado`— es un dato del RFI, no
contabilidad. Después Project Controls lo consume.

Pero **no en este alcance**: sin un solo RFI que hoy lo registre, sería un campo
sin usuario. **Lo que sí decido ahora es no cerrarle la puerta**: el historial y
el esquema quedan de forma que añadirlo después sea una columna aditiva.

### 3.7 · Trazabilidad

Hoy: **nada**. Mínimo, en `historial` JSONB, la misma forma que Reviews:

`created` · `assigned` · `ball_in_court_changed` · `responded` · `closed` —
cada una con quién, cuándo y, en el cambio de responsable, de quién a quién.

### 3.8 · Casos excepcionales

| caso | qué debe pasar |
|---|---|
| **El responsable deja la obra** | El RFI queda **BLOQUEADO** y se dice, como en Reviews. Pero **desatascarlo es la operación ordinaria** de reasignar: sin puertas especiales |
| **RFI histórico con responsable solo texto** | Sigue funcionando **exactamente igual**. `responsable_id` nace nulo, no hay encargo, no hay plazo. **No se convierte el texto en un usuario**: sería adivinar sobre el expediente |
| **Usuario en dos obras** | Ya resuelto por el motor: la bandeja parte de `JOIN project_users` |
| **RFI ya cerrado** | No se reasigna ni se responde. Cerrado es cerrado |
| **Cambio de responsable durante el flujo** | **Es lo normal.** Se registra, se cierra el encargo anterior y se abre el nuevo con su plazo |

---

## 4 · Clasificación

### ✅ YA ESTÁ
Numeración por obra con formato · `fecha` contractual separada de `created_at` ·
cuatro estados coherentes · adjuntos con el documento formal · aislamiento por
obra (middleware + `guardia_de_recurso` en PATCH) · `project_id` poblado y
resoluble · **y todo el motor transversal esperando**: `encargos`, Mi Trabajo,
mailer, plazos, recordatorios y conciliación.

### 🔴 DEFECTO REAL
D1 cualquiera dicta el veredicto · D2 responsable en `localStorage` · D3
numeración por conteo sin unicidad · D4 estado y respuesta desacoplados · D5 sin
historial · D6 sin notificación · D7 adjuntos fuera del gestor documental ·
**D8 el módulo no está montado**.

### 🟡 FALTA PARA SER PROFESIONAL
Ball-in-court con identidad · plazo en el objeto · quién puede emitir el veredicto
· historial · notificación · transiciones gobernadas.

### ⏳ DEBE ESPERAR
Referencia a elemento del modelo · progresiva/frente (Generación 2) · vínculo a
Issue (no existe) · declaración de impacto · respuesta en texto enriquecido ·
**y la incorporación de los adjuntos al gestor documental, que es una pieza
propia**.

---

## 5 · Alcance mínimo propuesto

### Una decisión suya, antes de nada

**¿Se vuelve a montar el módulo de RFI?** Se retiró a pedido. Si la respuesta es
no, este alcance no se ejecuta y los 25 registros quedan como archivo. **No
invierto en un módulo que no se va a usar.**

Lo que sigue asume que sí.

### Cambios de esquema — cuatro columnas, ninguna tabla

```sql
doc_rfis
  responsable_id  INTEGER  REFERENCES users(id)   -- a quién le toca AHORA
  vence_en        TIMESTAMP                        -- el plazo, en el objeto
  historial       JSONB    DEFAULT '[]'            -- quién, qué, cuándo
  cerrado_por     VARCHAR(255)                     -- quién dictó el cierre
+ UNIQUE (model_urn, codigo)                       -- dos RFI-013 no pueden existir
```

`responsable` (texto) **no se toca**. Es el dato contractual.

### Cambios de comportamiento

1. **Numeración por `MAX(codigo)`, no por `COUNT(*)`**, con la restricción única
   detrás. Si aun así colisiona, falla ruidosamente en vez de duplicar.
2. **Ball-in-court ordinario**: `PATCH` con `responsable_id` cierra el encargo
   anterior, abre el nuevo con su plazo, avisa y lo anota. **Sin puertas de
   administrador**, a diferencia de Reviews.
3. **Solo el `responsable_id` actual dicta el veredicto**; solo el autor o un
   administrador cierra. Los RFI **legacy sin `responsable_id`** conservan el
   comportamiento de hoy — si no, 25 registros quedarían intocables.
4. **Transiciones gobernadas**: `CHECK` sobre los cuatro estados y el camino
   permitido. `Respondido` exige veredicto y fecha; `Cerrado` exige haber pasado
   por `Respondido`.
5. **Historial** en cada transición.
6. **Notificación** al asignar, reusando `avisar()`.
7. **BLOQUEADO** cuando el `responsable_id` deja la obra, con el mismo cálculo que
   Reviews — reutilizando `flujo_de_revision.estado_del_flujo` o su equivalente.
8. **Interfaz**: enviar `responsable_id` desde el directorio de la obra —**no
   desde `localStorage`**— y llamar «Veredicto» a lo que hoy dice «Respuesta».

### Reutilización de `encargos`

**Total, y sin tabla nueva.** `abrir` / `cerrar_los_de` / `avisar` /
`mi_trabajo` / `recordatorios` ya funcionan con `objeto_tipo='RFI'` — el tipo ya
está en el `CHECK`. Y con `responsable_id` en el objeto, `conciliar_encargos`
**pasa a poder detectar también lo que falta**, cerrando la limitación que dejé
documentada.

### Compatibilidad con los 25 históricos

| | |
|---|---|
| `responsable_id` | nace **nulo**. No hay encargo, no hay plazo, no hay notificación |
| El texto `responsable` | **intacto**. No se convierte |
| Veredicto y fechas | **intactos** |
| Quién puede responder | los legacy conservan el comportamiento actual |
| `UNIQUE (model_urn, codigo)` | los 25 códigos ya son distintos: entra sin tocar nada |
| `CHECK` de estados | los tres en uso están dentro. **A verificar contra producción antes de aplicarlo** |

### Pruebas de aceptación

Sin base de datos: transiciones válidas e inválidas · numeración · quién puede
dictar veredicto · un RFI legacy sin `responsable_id` se comporta como hoy.

Contra PostgreSQL, ampliando el patrón de los ensayos:

1. Se crea un RFI → sin responsable, **no** aparece en la bandeja de nadie
2. Se asigna → el responsable lo ve **con plazo**; nadie más
3. Otro usuario **no** puede dictar el veredicto
4. El responsable lo hace → `Respondido`, veredicto y fecha congelados
5. Se cierra → el encargo se cierra; queda quién y cuándo
6. **Pasar la pelota** a otro → el anterior deja de deberlo, el nuevo lo ve, y el
   historial dice de quién a quién
7. El responsable **sale de la obra** → BLOQUEADO, y se desatasca reasignando
8. Un RFI **legacy** sigue funcionando igual y sin plazo
9. **Dos RFI no pueden compartir código**
10. La conciliación **detecta un encargo de RFI que falta** — lo que hoy no puede
11. Invariantes: ni documentos, ni versiones, ni SHA-256, ni permisos

### Qué deliberadamente NO construir

Fusionar con Issue · campo de respuesta en texto enriquecido · lista de
distribución · referencias a elemento del modelo o progresiva · declaración de
impacto · **la incorporación de los adjuntos al gestor documental** (D7: es la
pieza siguiente, no ésta) · reasignación con puertas de administrador ·
notificaciones dentro de la aplicación · plantillas · y cualquier cosa de Issues
o Transmittals.

### Tamaño

| | |
|---|---|
| Columnas nuevas | **4** · Restricciones nuevas: **2** · Tablas: **0** · Módulos: **0** |
| Ficheros | `routes/rfis.py`, `encargos.py` (conciliación), `IssueModule.jsx` |
| Datos históricos | **no se tocan** |

---

**No he implementado nada. Espero su revisión — y, antes que nada, su decisión
sobre si el módulo de RFI se vuelve a montar.**
