# CERTIFICACIÓN INTERNA DE CIERRE — `frontend-docs` V1

**21-ago-2026** · Cierre técnico **interno**. No es una certificación ISO ni de
tercero externo, y no debe presentarse como tal.

---

# ETAPA A — BARRIDO FINAL DEL PRODUCTO

## Lo que se revisó, y con qué resultado

| | resultado |
|---|---|
| **Botones muertos** | Ninguno. Sin `onClick` inertes, sin `href="#"`, sin `alert()` sustituyendo funciones |
| **Enlaces muertos** | Ninguno. **Las 60 rutas** que la interfaz llama existen en el backend, comprobado una por una |
| **Vistas sin montar** | Ninguna: los 16 elementos de la barra lateral tienen su vista |
| **`PdfCompareView`** | **Ya estaba montado** vía `VersionPanel`. La deuda anterior está cerrada |
| **Vocabulario de estados** | Consistente — lo ata `test_ningun_modulo_se_inventa_el_color_de_un_estado` |

## Lo que se retiró

**«Informes» era un cascarón** que decía *«Próximamente disponible»* y no tenía
nada detrás. **Retirado de la navegación.** Lo que el producto sí sabe hacer —el
índice del expediente, la actividad, el estado de las entregas— ya vive en sus
pantallas. Una entrada de menú que promete un módulo inexistente es peor que su
ausencia.

## Tres defectos reales encontrados y corregidos

### A.1 · «Mi Trabajo» no habría funcionado en producción

`MiTrabajo` y el traspaso al visor desde el Hub llamaban al API **sin el prefijo
`API`**. El backend **no sirve el frontend** —son orígenes distintos—, así que
esas dos llamadas iban al sitio estático y no al backend. **En desarrollo colaba
por el proxy de Vite, que es justo lo que hacía que no se viera.** Dos líneas.

### A.2 · `pdf_markups.file_node_id` era INTEGER y `file_nodes.id` es UUID

**Crear un markup sobre cualquier documento real devolvía 500.** La herramienta
estaba en el visor de PDF, el usuario la veía, y el backend la rechazaba
siempre — el caso exacto de «la UI ofrece lo que el backend siempre niega».

Migración **guardada**: convierte sólo si **todas** las filas convierten; si
alguna no, no toca nada y **dice cuál y por qué**. En la base local hay **una
fila huérfana con `file_node_id = 123`** que no apunta a ningún documento y
nunca pudo mostrarse: **bloquea la migración ahí, y no la borro yo.** Es su
decisión. Verificado sobre instancia limpia: `POST` → **200**, `GET` → devuelve
la anotación.

### A.3 · La búsqueda había inventado su propio modelo de permisos

Lo encontró el recorrido, no el barrido. Se detalla en B.2 porque es el hallazgo
de fondo de esta etapa.

## Dejado como está, y por qué

- **Código muerto**: `ActionToolbar`, `DocumentTable`, `SidebarTree` (284 líneas)
  no los importa nadie; los sustituyó `MatrixTable`. No prometen nada al usuario
  —son inalcanzables— pero son un riesgo de mantenimiento: alguien podría
  arreglar un fallo en la tabla que no se usa.
- **`PartidasModule`** (1.026 líneas) es un módulo real, huérfano. Es Project
  Controls, **fuera de V1 por decisión ya tomada**. No se monta.
- **«Usuarios del sistema»** ya se renombró en F4: listaba usuarios de la
  instancia bajo el nombre «Miembros», dentro de una obra.

---

# ETAPA B — ENSAYO DEL EXPEDIENTE COMPLETO

**`ensayo_del_expediente.py` — 86 de 86.** Una organización de cuatro personas
—administradora, supervisión, contratista y un auxiliar con acceso limitado—
opera una obra de principio a fin, con una segunda obra al lado.

| | qué demuestra |
|---|---|
| **1 · Participantes** | Tres empresas con su función contractual. **El auxiliar es CONTRATISTA igual que el residente y su perfil del sistema es otro** — función ≠ permiso. Y ser CONTRATISTA no le deja tocar el directorio |
| **2 · Estructura y permisos** | La herencia llega de la raíz a DRENAJE. El auxiliar tiene lo suyo y **no alcanza DIRECCIÓN** |
| **3 · Documentos** | v1, v2, v3 con **tres SHA-256 distintos**; la vigente es la v3; **la v1 sigue con su huella intacta** |
| **4 · Búsqueda** | Encuentra sin saber la carpeta, con ruta y versión vigente. El auxiliar **no descubre** el contrato de DIRECCIÓN — ni nombre, ni ruta, ni que exista |
| **5 · Markups** | Creado **desde la ruta del visor**, ligado al documento y a la página correctos, y no aparece en la otra obra |
| **6 · Review** | Dos pasos con plazo, Mi Trabajo por paso, **BLOQUEADA** al salir el revisor, **sustitución controlada** que conserva de quién venía, y consta contra la **versión exacta revisada** |
| **7 · RFI** | RFI-001, ball-in-court con la versión exacta de la consulta, **quien pregunta no dicta su propio veredicto**, pasa de mano dos veces, cierra el autor. **6 eventos en el historial** |
| **8 · Red Line** | Croquis emitido, rechazado, **devuelto retirando el veredicto**, vuelto a la bandeja, aceptado y cerrado. **Congelado contra la v3** |
| **9 · Transmittal** | Dos destinatarios, **acuse individual**, y al subir una **v4 la emisión sigue apuntando a la v3** mientras el documento vivo ya es v4 |
| **10 · Sharing** | Enlace creado, revocado, y **la revocación no borra el registro**: queda constancia |
| **11 · Auditoría** | Ver abajo |
| **12 · Exportación** | Índice con documentos vigentes, cada uno con su huella, y **las cuatro versiones disponibles** |
| **13 · Archivado** | Obra archivada, **expediente sigue consultable**, y RFI, Red Lines y versiones **byte a byte iguales** |
| **14 · Aislamiento** | **Nada de A aparece en B** en documentos, participantes, RFI, Red Lines, Reviews, Transmittals ni Mi Trabajo |

## B.1 · Append-only, demostrado por dos vías independientes

No es una promesa del código:

1. **Privilegios.** El rol de ejecución tiene sobre `activity_log`
   **`INSERT, SELECT` y nada más**. Intentar un `UPDATE` de verdad → *permission
   denied*. Append-only **por privilegios, no por disciplina**.
2. **Cadena de hash.** Aunque alguien con privilegios lo reescribiera, **se ve**:
   `auditoria_encadenada.verificar` recorre la cadena y señala la fila alterada.

## B.2 · El hallazgo de fondo: dos modelos de permisos

El recorrido descubrió que **la búsqueda que entregué en F3 aplicaba una regla
distinta a la del resto del producto**:

- **Producto** (`_get_effective_permission_impl`): herencia **ADITIVA** — el
  **máximo** de la cadena, y el rol global como **suelo**.
- **Mi búsqueda**: el permiso explícito **más cercano** hacia arriba.

Consecuencia: la búsqueda **escondía documentos que el usuario sí podía abrir
desde Archivos** — no una fuga, pero sí dos verdades sobre quién ve qué, que es
exactamente lo que el propio módulo decía querer evitar.

**Corregido: la búsqueda usa ahora la misma regla, y el ensayo lo comprueba
comparándola contra el resolutor en cada caso, en vez de contra una expectativa
mía.**

Al alinearla, el rendimiento se hundió de 68 ms a **2.833 ms**. `EXPLAIN ANALYZE`
—no una corazonada— mostró un **bucle anidado descartando 12,5 millones de
filas**. Fundidas las dos CTE en una sola pasada sobre la cadena de ancestros:
**66 ms**, con la regla correcta.

### Y una LIMITACIÓN CONOCIDA que sale de ahí

> **Un `none` explícito NO corta la herencia a un `editor`.** El modelo sólo
> SUMA permisos, y el rol global actúa de suelo: un `editor` alcanza toda la
> obra aunque se le deniegue una carpeta.

Restringir una carpeta funciona con `viewer`/`user` —ciegos por defecto, modo
paranoico ISO 19650— **pero no con `editor`**. Cambiarlo es **cambiar el modelo
de permisos**, no un arreglo pequeño: **me detengo y lo reporto**, como pidió.
No bloquea el cierre —la separación entre obras, que es la garantía dura, es
independiente y está probada— pero **debe conocerse antes de prometer
confidencialidad por carpeta frente a un editor**.

## B.3 · Recuperación ante desastre — ya ensayada, y sigue siendo criterio

No se repite, y se incorpora como evidencia:

- `ensayo-restauracion-produccion-20260820.md` — copia **real de producción**
  (15,4 MB), restaurada en un clúster desechable. **87 tablas, 83.410 filas,
  0 descuadres. Veredicto: RESTAURABLE.**
- `borrado-y-recuperacion-20260820.md` · `copia-independiente-20260820.md` ·
  tres ensayos de restauración fechados entre el 17 y el 20-ago-2026.

---

# INVARIANTES DE CIERRE

| | |
|---|---|
| Versiones históricas intactas | **SÍ** — v1/v2/v3 con sus SHA-256 tras todo el recorrido |
| SHA-256 intactos | **SÍ** |
| Permisos intactos | **SÍ** — 6 concesiones, sin alterar |
| Ningún objeto contractual reescrito | **SÍ** — huella idéntica antes y después de archivar |
| `encargos` conciliables e idempotentes | **SÍ** — la segunda pasada no mueve nada |
| Ninguna referencia legacy convertida por inferencia | **SÍ** |
| Dependencia funcional con `frontend-react` | **NINGUNA** |
| Build de `frontend-docs` | **limpio** |
| Consola del navegador | **limpia** en las pantallas verificadas |
| **Invariantes vs. cierre de F3** | **0 diferencias** |

## Pruebas

| | |
|---|---|
| **Suite completa** | **881 pasan · 0 fallan** |
| **Expediente completo** *(nuevo)* | **86 / 86** |
| Búsqueda · Participantes · Red Line | **23/23** · **33/33** · **58/58** |
| Desacople · RFI · Revisiones · Encargos · Dos obras | **22/22** · **49/49** · **50/50** · **31/31** · **16/16** |

### Alcance honesto de «consola limpia»

Verifiqué sin errores las pantallas de **Participantes** y **Búsqueda** en el
navegador, montadas con sus respuestas reales. **No recorrí la aplicación
completa con sesión iniciada**: el backend no sirve el frontend y montar el
entorno con credenciales excede lo que puedo hacer sin ellas. Lo digo porque
«consola limpia en el recorrido principal» no es lo mismo que «en las dos
pantallas nuevas».

---

# VEREDICTO

### 1 · ¿Puede una organización operar documentalmente una obra de principio a fin?
# `SÍ`
Demostrado en las 14 etapas del recorrido, con cuatro papeles distintos.

### 2 · ¿Puede hacerlo sin `frontend-react`?
# `SÍ`
Ninguna de las 60 rutas que usa `frontend-docs` pertenece al visor. Los módulos
del visor (`PartidasModule`, 3D, 4D, LOB) están fuera y no se montan.

### 3 · ¿Puede demostrar ante un tercero qué versión fue revisada, aprobada, respondida, transmitida y finalmente entregada?
# `SÍ`
La Review consta contra la **v3 exacta**; el RFI adjunta la **v3** de la
consulta; el Red Line queda **congelado contra la v3**; el Transmittal **sigue
apuntando a la v3 después de subirse la v4**. Y las cuatro versiones, con sus
SHA-256, siguen disponibles.

### 4 · ¿Respeta aislamiento, permisos y trazabilidad?
# `SÍ`, con la limitación de B.2 declarada
**Aislamiento**: nada de A aparece en B, en ninguno de los ocho dominios.
**Permisos**: se respetan, y ahora **una sola regla** en todo el producto — pero
**un `none` explícito no restringe a un `editor`**.
**Trazabilidad**: append-only por privilegios **y** por cadena de hash.

### 5 · ¿Es recuperable ante desastre según los ensayos ya realizados?
# `SÍ`
Copia real de producción restaurada: 87 tablas, 83.410 filas, 0 descuadres.

### 6 · ¿Existe alguna dependencia que impida congelar `frontend-docs` V1?

**Ninguna que lo impida.** Tres cosas que deben conocerse:

1. **La limitación de permisos de B.2.** No bloquea el cierre; sí debe conocerse
   antes de prometer confidencialidad por carpeta frente a un `editor`.
2. **Una fila huérfana bloquea la migración de markups en la base local**
   (`file_node_id = 123`, no apunta a ningún documento). Hasta decidir qué hacer
   con ella, crear markups seguirá fallando **ahí**. En instancia limpia
   funciona. **No la borro: es su decisión.**
3. **`frontend-docs/dist/assets` está bloqueado** por un proceso del sistema
   —antivirus o sincronización—. El build es correcto sobre otra carpeta; para
   compilar en su sitio hay que liberarla. Es del entorno, no del producto.

---

# `FRONTEND-DOCS V1 CERRADO`

Con la limitación de permisos del punto B.2 **declarada, no oculta**, y las tres
observaciones del punto 6 anotadas.

---

**STOP ABSOLUTO.** No se tocó `frontend-react`, 3D, 4D, LOB, Project Controls ni
Field. No se construyeron Issues. No se añadió ningún módulo.
