# 18 · Observación del plano entero y estados de ACC en las incidencias

2-nov-2026. En local, sin commit. Necesita la **migración 45** (estados, empresa responsable, observadores, adjuntos,
clasificación y configuración por obra), que aplica el dueño como `ecd_migrator` antes de
desplegar el backend.

## 1 · Lo que pidió el dueño

> «En un plano puedo tener varias marcas, y no quisiera agarrar cada nube y asignar al usuario, sino ya todo el
> plano completo… falta el botón del issue para asignar ese plano a un usuario con su respectivo estado y fecha.»

> «Con estados de revisión me refería al issue: los issues de ACC tienen estados de revisión.» Profesional y escalable.

## 2 · Observación del plano entero

- **En el lector:** botón «Observaciones del plano» en el rail, con el número de las que siguen sin cerrar.
- **El panel lateral** (el mismo sitio que el de una marca) tiene tres vistas:
  - **Lista:** las sin cerrar y las cerradas. Cada fila lleva estado, código, título, responsable, fecha, versión y
    número de marcas.
  - **Nueva:** título, detalle, responsable, fecha límite y las marcas de la versión que se mira.
    - Entran por defecto las que no están ya en otra observación abierta.
    - Sin marcas elegidas, la observación es del **plano entero**.
    - Botones «Crear observación» y «Guardar borrador».
  - **Detalle:** el mismo que el de la observación de una marca (`DetalleDeObservacion`): estado, a quién le toca,
    actos, comentarios e historial, y enlaces a sus marcas.
- **Es la misma incidencia** que la de una marca: `doc_issues`, tipo `OBSERVACION`, con origen `PLANO` y la versión
  y las marcas en `evidencia`. Las 13 + 5 pruebas son de `test_observacion_del_plano.py`.
- **La verifica quien la levanta.** El responsable la recibe en «Mi trabajo». Las marcas propias que aún eran
  borrador se publican al enviarla.
- **Una marca dentro de una observación abierta** (o de un borrador) no se retira, y su panel enseña esa
  observación con la nota «del plano entero».
- **Rutas:** `GET|POST /api/pdf/planos/<plano>/observacion`, con `?id=` para el detalle de una.

## 3 · Estados de ACC (migración 45)

| Lo que se ve | ACC | Código guardado | Quién lo mueve |
|---|---|---|---|
| Borrador | Draft | `Borrador` (nuevo) | Quien la levanta: «Enviar» o «Descartar». Nadie más la ve |
| Abierta | Open | `Abierto` | Al enviarla le llega al responsable |
| En curso | In progress | `En curso` (nuevo) | El responsable: «Empezar a corregir» |
| En disputa | In dispute | `En disputa` (nuevo) | El responsable: «No procede», con motivo. La pelota pasa a quien la levantó, que la **reafirma** (vuelve a Abierta) o la **anula** |
| En revisión | In review | `Corregido` | El responsable: «Declarar corregida», con evidencia |
| No aprobada | Not approved | `Reabierto` | El verificador la rechaza, con motivo |
| Cerrada | Closed | `Verificado` | El verificador la aprueba |
| Anulada | Void | `Anulado` | Quien la levantó (o un administrador), con motivo |

- **Los códigos de antes no cambian:** hay historial escrito con ellos. Solo cambia lo que se lee.
- **Las transiciones siguen siendo datos** (`flujo_de_issue.TRANSICIONES`).
  - Verificar sigue siendo el único camino a «Cerrada».
  - «En disputa» no se corrige ni se cierra sola.
- **Opcionales por obra, como el administrador de ACC:** Borrador, En curso y En disputa.
  - Se configuran en «Issues y punch» → «Estados»; solo el administrador.
  - Se guardan en `issue_estados_de_obra`. Sin fila, los usa todos.
  - Apagar uno no mueve las incidencias que ya están en él: solo deja de ofrecerse entrar.
- **«Pendiente» de ACC se dejó fuera,** porque Autodesk no lo define.
- **Dónde se ve:** en Docs, la lista de incidencias, el kanban de los tableros, la observación de una marca y la del
  plano usan un solo catálogo, `utils/estadosDeIssue.js`, con etiquetas y colores de la lista D-24. View no usa
  incidencias.

## 4 · Lo que faltaba para ser profesional y escalable (2-nov-2026, misma 45)

El dueño pidió hacer lo que faltaba frente a ACC. Va todo en la **misma migración 45**, que aún no está aplicada en
producción.

| Qué | Cómo | Quién |
|---|---|---|
| **Asignar a una empresa** | `responsable_empresa`: una persona **o** una empresa de la obra, nunca las dos (CHECK). El encargo va a la empresa (`destino_empresa`) y lo ve en «Mi trabajo» cualquiera de ella; la conciliación de encargos lo entiende y lo repara | Corrige cualquiera de esa empresa; **nadie de ella verifica** |
| **Reasignar** | `POST /api/issues/<id>/editar` con la persona o la empresa nueva. La pelota se va con ella | Quien la levantó o un administrador, mientras le toca al responsable |
| **Observadores** | `observadores`: reciben un correo en cada paso (empezar, no procede, corregida, verificada, comentario…), menos de lo que hace cada uno | La lista la lleva quien la levantó o un administrador; cualquiera de la obra se apunta con «Seguir» |
| **Adjuntos** | Fotos (se suben a `MULTIMEDIA/`, como las de las marcas) y documentos de Docs **de la misma obra**; como mucho 30 | Adjuntan quien la levantó, el responsable, quien verifica o un administrador; quita solo quien lo puso |
| **Subtipo y causa raíz** | Listas que define cada obra (subtipos por tipo de incidencia) | Clasifican los mismos. Cerrada, solo se apunta la causa raíz |
| **Campos propios** | Texto, número, fecha o lista; obligatorios o no; para todos los tipos o para uno, como los atributos de ACC | Los define el administrador |
| **Informe** | Excel y PDF de la lista, con sus filtros, y de las observaciones de un plano; se arma en el navegador | Cualquiera |
| **Configuración de la obra** | `GET/PUT /api/issues/configuracion` (tabla `issue_config_de_obra`): estados opcionales, subtipos, causas raíz y campos | Leer, cualquiera de la obra; cambiar, el administrador |

**Además:**
- La búsqueda de las observaciones del plano al abrir una hoja ya no recorre las de todos los planos: se limita a ese
  plano y usa el índice `idx_issues_origen`.
- El panel del plano se abre aunque la hoja siga dibujándose.

**Lo que el ensayo con PostgreSQL real destapó y quedó arreglado:**
- La clave de un campo como «Metrado (m²)» salía con dos guiones bajos seguidos. Ahora es `metrado_m2`.
- Un campo obligatorio añadido después bloqueaba apuntar la causa raíz de incidencias anteriores. Ahora los
  obligatorios se exigen al levantarla y al cambiar los campos.
- Los campos valían para todos los tipos: un «Metrado» de Calidad se le exigía a una observación de plano. Ahora cada
  campo puede limitarse a un tipo.

## 5 · Pruebas

| Qué | Resultado |
|---|---|
| Suite del backend (`python -m pytest -q`) | 2564 pasan, 1 falla: `test_reconstruccion_desde_cero`, la que ya fallaba antes (el bootstrap no crea las tablas de tableros), sin relación |
| `test_estados_de_issue.py` | 40/40 |
| `test_observacion_del_plano.py` | 18/18 |
| `node pruebas/estadosDeIssue.prueba.mjs` | 7/7 |
| `node pruebas/marcasConEnlace.prueba.mjs` | 11/11 |
| Build de Docs | compila |
| **Ensayo contra PostgreSQL real** (base desechable `ecd_ensayo_issues`, rutas como `ecd_app`) | **67/67** |
| **Banco local con la pantalla real** (`probar-plano.html`, PDF de muestra, servidor del banco en 5196) | ver abajo |

El ensayo contra PostgreSQL real recorre:
1. Sin la 45 y con la 45; la 45 se repite sin error.
2. El ciclo entero con borrador, En curso, En disputa, reafirmar, No aprobada y Cerrada, y sus encargos.
3. Los opcionales de la obra.
4. Asignar a una empresa, y la conciliación de su encargo (también reabrirlo si falta).
5. Observadores avisados, adjuntos de la obra (y uno de otra obra rechazado), subtipos, causas y campos con sus
   reglas, y reasignar.
6. La observación del plano asignada a una empresa.
7. La vuelta atrás se niega con datos de la 45 y vuelve sin ellos.

En el banco local, con la pantalla:
1. Ana creó una observación del plano asignada a **Contratista SAC**, con Eva de observadora.
2. Mario, de la contratista, vio «Empezar a corregir», «Declarar corregida», «No procede» y los adjuntos.
3. Al pulsar «Empezar», el panel pasó a «En curso · Corrigiendo: Contratista SAC» y a Eva le salió el aviso.
4. Como Eva (administradora): «Exportar» y «Configuración» en «Issues y punch».

**Sin verificar:**
- El correo real: en el banco el envío está sustituido y se apunta en el registro.
- La descarga del Excel y del PDF en el banco: el panel del navegador estaba oculto.
- Un plano real de producción, que aún no tiene la 45.

## 6 · Para publicar (cuando el dueño lo decida)

1. **La migración 45**, como `ecd_migrator`, en Cloud SQL Studio.
2. **Push** y Manual Deploy del **backend** (`visor-ecd-backend-va`).
3. **El portal** (`visor-ecd-portal`).
