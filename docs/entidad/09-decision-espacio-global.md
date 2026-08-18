# Decisión: qué hacemos con el espacio `global` (N72)

**Fecha:** 17-ago-2026 · **Estado:** pendiente de decisión del propietario
**Bloquea:** encender `ENFORCE_PROJECT_AUTHZ`, y con ello cerrar **C8**.

---

## El problema, en una frase

`resolve_project_id('global')` devuelve la obra por defecto **sólo si hay exactamente
una obra activa**. Con dos o más devuelve nada — y entonces todo lo que viva en ese
espacio deja de resolver a la vez.

Hoy el sistema funciona **por accidente**: tienes una obra activa. El día que actives
la segunda, decenas de rutas cambian de comportamiento el mismo día, sin que nadie
haya tocado una línea de código.

## Qué es `global` de verdad

No es un espacio compartido por diseño. Es el **namespace anterior a que existieran
varias obras**: donde quedó lo que se creó cuando el producto sólo servía a una, más
el valor que los frontales mandan cuando no hay proyecto seleccionado.

El propio `db.py` ya lo dice: *«es deuda: hay datos reales de obra viviendo en
`'global'` y habría que migrarlos a su obra»*.

## Lo que YA está cerrado (medido, no supuesto)

El módulo 4D/LOB —que es de donde sale la mayor parte de esas filas— **ya no puede
escribir en `global`**. `normalize_scope` lo rechaza con un error explícito, y las
cinco rutas de escritura pasan por él vía `_scope_context`. Verificado con barrido
sobre el árbol de sintaxis, no leyendo por encima.

> Aviso sobre mi propia medida: mi primer barrido dijo que **ninguna** de las cinco
> normalizaba. Era falso — buscaba el nombre literal dentro de cada función y la
> llamada es indirecta. Lo corregí antes de escribir esto.

Es decir: **la deuda ya no crece por ahí**. Lo que hay es histórico.

## Cuánto hay

Los números de producción los da `backend/herramientas/inventario_del_espacio_global.py`
(sólo lee, sólo cuenta, nunca imprime contenido). **Todavía no se ha ejecutado contra
producción**: no tengo acceso a esa base.

Medido contra la base **local** —que no es producción y sirve sólo de orientación—,
el reparto es muy concentrado:

| tabla | filas en `global` |
|---|---|
| `lob_activities` | 2.189 |
| `lob_partidas` | 1.505 |
| `lob_avance` | 719 |
| `lob_frentes` | 23 |
| `tracking_pins` | 3 |
| `lob_config` | 1 |

Casi todo es planificación 4D. Y aparte, **4.124 filas de `inventory_assets` sin obra
declarada** (`project_id` vacío), que es un problema hermano pero distinto.

---

## Las tres opciones

### A · Migrar lo de `global` a su obra

Se reasignan esas filas a la obra que les corresponde y `global` deja de existir como
valor de obra.

- **A favor:** el control por obra pasa a cubrirlas de verdad. Es el único camino que
  las mete bajo `ENFORCE`.
- **En contra:** hay que saber a qué obra va cada una, y eso **no siempre se puede
  deducir**. Con una sola obra activa parece trivial —«todo es de Talara»— pero eso es
  exactamente el razonamiento que hace daño: si alguna fila es de otra obra o de
  ninguna, queda atribuida en firme a la equivocada.
- **Reversibilidad:** baja. Un `UPDATE` masivo sin columna de origen no se deshace.
  Si se hace, hay que guardar antes el estado anterior.
- **Precedente en el repositorio:** `backfill_obra.documentos()` **se niega** a hacer
  esto mismo con los documentos, y explica por qué: en `file_nodes` el `model_urn` no
  guarda el id de la obra sino el scope del frente. *Un dato sin obra es preferible a
  un dato en la obra equivocada.*

### B · Declarar `global` un espacio legítimo, con reglas propias

Se acepta que existe, se documenta qué significa, y el control por obra lo trata
explícitamente: por ejemplo, sólo lo ve quien pertenece a alguna obra, y nunca sale
por enlace público.

- **A favor:** no se toca ni una fila. Cero riesgo de atribución errónea. Se puede
  hacer hoy.
- **En contra:** es una excepción permanente en el control de acceso, y las
  excepciones permanentes son donde se esconde el siguiente fallo. Además no resuelve
  el problema de fondo: esos datos siguen sin obra.
- **Reversibilidad:** total.

### C · Congelar `global` y migrar sólo lo que se pueda demostrar

Ni migración masiva ni excepción permanente:

1. `global` deja de aceptarse como valor de obra en escrituras nuevas — en LOB ya es
   así; se extiende al resto.
2. Las filas históricas se migran **sólo cuando se puede demostrar** a qué obra
   pertenecen (por ejemplo, una actividad LOB cuyo frente sí identifica la obra).
3. Lo que no se pueda demostrar **se queda y se declara**, con su recuento, como
   riesgo residual escrito.

- **A favor:** cierra la entrada sin inventar atribuciones. Es lo que el repositorio
  ya hace en los dos sitios donde se ha enfrentado a esto.
- **En contra:** deja un residuo, y ese residuo hay que declararlo en la auditoría en
  vez de esconderlo.
- **Reversibilidad:** alta si la migración guarda el valor anterior.

---

## Mi recomendación

**C.** Por tres razones medidas, no por gusto:

1. La entrada **ya está cerrada** donde más filas había (LOB). Extenderla al resto es
   barato y no rompe nada.
2. La migración masiva de A choca con el mismo muro que ya paró a `backfill_obra`: en
   varias de esas tablas el campo no guarda lo que su nombre sugiere.
3. B sola no basta: dejaría 4.000 filas fuera del control por obra **de forma
   permanente**, y eso es justo lo que un auditor va a mirar.

## Lo que necesito de ti para ejecutarla

1. **Ejecuta el inventario contra producción** (sólo lee, sólo cuenta):

```bash
cd backend && python herramientas/inventario_del_espacio_global.py
```

Con las variables `DB_*` de producción en el entorno. Pégame la salida: son
recuentos, no llevan ningún dato.

2. **Dime si hay una segunda obra prevista a corto plazo.** Si la hay, esto pasa de
   deuda a urgencia: el día que se active, lo que hoy resuelve por accidente deja de
   resolver.

---

## Lo que NO dice este documento

- No dice cuántas filas hay en producción: eso lo dirá el inventario.
- No dice que `global` sea inseguro hoy: dice que **no está bajo el control por obra**,
  que es distinto y comprobable.
- No propone tocar `inventory_assets`. Sus 4.124 filas sin obra son un problema
  hermano y merecen su propia decisión.
