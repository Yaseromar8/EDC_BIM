# 84 · CONCILIACIÓN DE CIERRE · GAP 01 y GAP 02

**Fecha:** 25-ago-2026 · **Suite:** 1142 · **Contra:** doc 82 §4.1 y §4.5
**Propósito:** que el `ARQ/OP/EXP ✅` del flujo principal no oculte una
subcapacidad del benchmark todavía pendiente.

**Sin re-investigar.** El benchmark es el del doc 82, congelado el 24-ago-2026.

---

# 1 · GAP 01 · SUBMITTALS

| capacidad del benchmark | IMPL | PROB | EXP | DEFER | AUSENTE |
|---|:-:|:-:|:-:|---|---|
| **Roles** — contratista responsable · manager · revisores | ✅ | ✅ | ✅ | | |
| **Estados** — Borrador→Enviado→En revisión→Respondido→Cerrado (+Anulado) | ✅ | ✅ | ✅ | | |
| **Revisores** — cadena con paso actual, identidad estricta | ✅ | ✅ | ✅ | | |
| **BIC** — la pelota viaja en cada tramo | ✅ | ✅ | ✅ | | |
| **Plazos** — por paso, días naturales | ✅ | ✅ | 🟡 *(no probado con plazo vencido)* | | |
| Plazos en **días hábiles** | | | | | ⚪ *divergencia declarada* |
| Plazos **desde el cronograma** | | | | GAP de cronograma | |
| **Adjuntos** — de lo sometido | ✅ | ✅ | ✅ | | |
| **Adjuntos devueltos por el revisor** | ✅ **HOY** | ✅ | ⏳ | | |
| **Versionado de adjuntos** | | | | GAP 05/expediente | |
| **Privacidad por registro** (Procore *Mark as Private*) | | | | | ⚪ *divergencia declarada* |
| **Permisos** — 4 niveles del fabricante | ✅ *otro diseño* | ✅ | ✅ | | |
| **Cierre y distribución** | ✅ | ✅ | ✅ | | |
| **Revisión** tras rechazo — fila nueva, el rechazo sobrevive | ✅ | ✅ | ✅ | | |
| **Flujo secuencial** | ✅ | ✅ | ✅ | | |
| **Flujo paralelo** (Procore) | | | | | ⚪ *no adoptado* |
| **Spec sections** — guardar | ✅ | ✅ | ✅ | | |
| **Spec sections** — **filtrar y agrupar** | ✅ **HOY** | ✅ | ⏳ | | |
| **Packages** — guardar | ✅ | ✅ | ✅ | | |
| **Packages** — **filtrar y agrupar** | ✅ **HOY** | ✅ | ⏳ | | |
| **Plantillas de flujo de submittal** | | | | **GAP 06** | |
| **Generar submittals desde la especificación** | | | | **GAP 05** | |
| **Móvil** | | | | **GAP 07** | |

## 1.1 · Lo que la conciliación encontró, y se corrigió hoy

**a · Spec sections y packages se guardaban pero no se podían filtrar.**
Tener el dato no es tener la capacidad: en una obra con doscientos submittals
la pregunta que se hace es *«enséñame los de la sección 05 52 13»*, no
*«enséñamelos todos»*. Ahora `GET /api/submittals` filtra por `spec_seccion`,
`paquete` y `estado`, y devuelve **las agrupaciones que existen** —no una lista
inventada— para que la pantalla no ofrezca filtros que nunca devuelven nada.

**b · El revisor no podía devolver documentos.** Los adjuntos se congelan al
enviar, y eso es deliberado —el veredicto tiene que recaer sobre exactamente lo
que se leyó—. Pero el revisor **devuelve** algo: el documento marcado, el sello,
la observación escrita. Ahora `responder` acepta `adjuntos`, que se **añaden**
marcados con `de_revision`, `paso` y `por`. **Nunca sustituyen lo sometido**, o
el veredicto dejaría de recaer sobre lo que se leyó.

## 1.2 · Las dos divergencias deliberadas, con su motivo

**Privacidad por registro.** Procore permite marcar un submittal como privado.
Aquí **no**, y no por olvido: añadir un indicador de privacidad por fila
introduciría una **regla de acceso nueva fuera de las capas declaradas**
(16 · 08 · 09) — una segunda fuente de verdad sobre quién ve qué, que habría
que mantener sincronizada con las otras y acabaría discrepando. La respuesta de
ALEPHIA es más gruesa y tiene una sola verdad: quien no deba ver submittals no
recibe la herramienta (capa 08). Se registra como **equivalencia parcial por
otro diseño**, no como paridad: es más gruesa, y decirlo es parte del trabajo.

**Días naturales, no hábiles.** Un calendario de feriados es un módulo, no un
campo: en obra pública peruana los feriados son nacionales, regionales y a veces
del propio contrato. Media implementación —feriados nacionales solamente—
daría fechas equivocadas con apariencia de exactas.

---

# 2 · GAP 02 · PLANOS COMO OBJETO

| capacidad del benchmark | IMPL | PROB | EXP | DEFER | AUSENTE |
|---|:-:|:-:|:-:|---|---|
| **Identificación de plano** — identidad propia, no fichero | ✅ | ✅ | ✅ | | |
| **Número** — normalizado, único por obra | ✅ | ✅ | ✅ | | |
| **Título y disciplina** — lista cerrada | ✅ | ✅ | ✅ | | |
| **Revisión** — serie que continúa la convención del plano | ✅ | ✅ | ✅ | | |
| **Vigencia** — una sola, garantizada por la base | ✅ | ✅ | ✅ | | |
| **Superar ≠ borrar** — con fecha y con quién la sustituyó | ✅ | ✅ | ✅ | | |
| **Sets** — el acto de emitir, backend | ✅ | ✅ | 🟡 | | |
| **Sets** — **en pantalla** | ✅ **HOY** | — | ⏳ | | |
| **OCR / cajetín** — extracción de texto real | ✅ | ✅ | ✅ *(defecto hallado y cerrado)* | | |
| **Historial** — las revisiones son la historia | ✅ | ✅ | ✅ | | |
| **Anclajes** — un registro clavado en un punto | ✅ | ✅ | ✅ | | |
| **El ancla no salta al superar** | ✅ | ✅ | ✅ | | |
| **Relación con observaciones** (RFI · Red Line · Submittal · Review) | ✅ | ✅ | ✅ | | |
| **Markups sobre el plano** | ✅ *(ya existía)* | ✅ | ✅ | | |
| **Markup personal vs publicado** | ✅ **HOY** | ✅ | ⏳ | | |
| **Comparar revisiones** | | | | pasada de visor | |
| **Enlaces entre láminas** | | | | | ⚪ *no adoptado* |
| **Medición sobre el plano** | ✅ *(`pdf_calibrations`)* | — | — | | |
| **Móvil / offline** | | | | **GAP 07** | |

## 2.1 · El hallazgo grave de esta conciliación

> ### El markup personal/publicado tenía COLUMNAS y no tenía CAPACIDAD.

La migración 14 añadió `publicado`, `publicado_en` y `publicado_por` a
`pdf_markups`. **Ninguna ruta las usaba.** El listado devolvía todo a todos y
no existía forma de publicar nada: la capacidad estaba muerta, y en el commit
de GAP 02 la di por hecha.

Es exactamente el caso que la regla del proyecto llama **«existe en el backend
no cuenta como implementado»** — y habría pasado por buena, porque el
ARQ/OP/EXP del flujo principal iba en verde. Es la razón por la que esta
conciliación existe.

**Corregido:**
- El listado devuelve **lo publicado MÁS lo propio sin publicar**, y el filtro
  va **en el SQL**: traer lo ajeno sin publicar y descartarlo en Python ya
  sería haberlo enviado por la red.
- `POST /api/pdf/markups/<id>/publicar` — un **acto**, y solo de su autor.
  Publicar es firmar que esa marca ya es para todos, y esa firma es de quien la
  hizo: **un administrador tampoco publica por él**.
- Despublicar sí se permite: retirar una marca propia que ya no aplica es lo
  contrario de reescribir la historia — sigue siendo suya y sigue existiendo.

## 2.2 · Los sets existían solo en el backend

Tablas, rutas y `set_id` en cada revisión, pero **ninguna pantalla los
mostraba**. Un dato que no se puede consultar no es una capacidad: es una
columna. Ahora la pantalla de Planos tiene el panel **«EMISIONES · qué se
entregó y cuándo»** con el número de láminas de cada entrega.

---

# 3 · LO QUE NO SE CONVIERTE EN DEFECTO

Asignado explícitamente a otro gap por el propio doc 82 §8 — **no es deuda de
GAP 01/02**:

| capacidad | gap |
|---|---|
| Especificaciones como objeto · generar submittals desde ellas | **GAP 05** |
| Plantillas de flujo de revisión reutilizables | **GAP 06** |
| Móvil con trabajo offline | **GAP 07** |
| Plazos calculados desde el cronograma | gap de cronograma, sin abrir |
| Comparar revisiones de plano | pasada de visor, sin abrir |

---

# 4 · VEREDICTO

```
GAP 01 · SUBMITTALS          ✅ CERRADO
GAP 02 · PLANOS COMO OBJETO  ✅ CERRADO
```

Con dos precisiones que no se esconden:

1. **Las seis correcciones de hoy** (filtros de spec/paquete, adjuntos del
   revisor, markup personal/publicado, sets en pantalla) tienen ARQ ✅ y OP ✅
   con 6 pruebas nuevas, y su **EXP viaja con el próximo despliegue del
   backend**. No se declaran probadas en producción hasta entonces.
2. **Tres capacidades del benchmark quedan declaradas como divergencia**, no
   como deuda: privacidad por registro, días hábiles y flujo paralelo. Las tres
   con motivo escrito arriba, y las tres reversibles si aparece una necesidad
   real.

**Defectos que esta conciliación destapó: 3.** Ninguno lo habría encontrado el
flujo principal, porque los tres estaban *debajo* de un camino que funcionaba.

**SIGUIENTE: GAP 03 · FORMULARIOS E INSPECCIONES.**

---

*Sin re-investigación. Sin porcentajes nuevos: la cobertura se recalcula al
cerrar el bloque 01–07, no gap a gap.*
