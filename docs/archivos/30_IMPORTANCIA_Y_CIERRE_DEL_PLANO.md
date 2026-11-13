# 30 · Importancia del plano y qué le falta para cerrarse — PROPUESTA (12-nov-2026)

Pedido del dueño (12-nov-2026): «deberíamos tener alguna forma de medir si un plano es importante o no, y qué
información requiere para cerrar: que el usuario indique, etiquetando al indicado, qué necesita para cerrar ese
plano». Entendimiento confirmado por él el mismo día.

**Solo propuesta. Nada construido, nada publicado.**

---

## 1 · Qué hay hoy que ya sirve (leído en el código)

| Lo que pides | Lo que ya existe | Dónde |
|---|---|---|
| Etiquetar a alguien para pedirle algo en un plano | Una **nube** asignada a una persona o empresa, con su pedido y su plazo. La persona entrega, y el encargado acepta o devuelve | `doc_issue_nubes` (migración 46), `backend/nubes_de_issue.py` |
| Pedir algo del plano entero, sin dibujar | Una **observación del plano entero**, con responsable y plazo | `ObservacionesDelPlano`, `routes/pdf_tools.py` |
| Saber quién debe qué | El servidor ya lo calcula nube por nube (`deudor`, `por_entregar`, `plazo`) | `backend/nubes_de_issue.py` |
| Verlo | **Solo dentro del plano**: la leyenda «Nubes» dice cuántas le faltan a cada persona. Y a cada persona le sale lo suyo en «Mi trabajo» | doc 23 §6.5 |

Lo que **no** existe:

1. **La importancia.** Ningún dato dice si un plano es crítico o puede esperar.
2. **Verlo sin abrir el plano.** En la lista de Archivos y en la revisión no se ve qué le falta a cada plano ni
   quién lo debe. Hay que abrirlos uno a uno.
3. **El «completo».** Nada dice «este plano ya tiene todo lo que necesitaba».

## 2 · La propuesta, en tres piezas

### Pieza 1 · «Qué le falta» a la vista, sin abrir el plano — sin migración

Con lo que ya se guarda, calcular para cada plano una frase y una lista:

> **Le faltan 3 de 5** · Juan Pérez: 2 entregas (vence el 20/11) · Topografía: 1 entrega · por verificar: 1

- En la **lista de Archivos**: una columna «Pendientes» con el número y, al pasar el cursor o pulsar, la lista
  con cada nombre. Se puede ordenar y filtrar por ella («solo los que tienen pendientes», «solo lo que me deben
  a mí», «solo lo que debo yo»).
- En la **revisión**: la misma frase bajo cada lámina, junto a las observaciones que se añadieron hoy.
- **«Completo»** cuando no queda nada por entregar ni por verificar. Es un cálculo, no un botón: nadie lo marca
  a mano, así no puede mentir.

Cuenta como pendiente: una nube pedida o devuelta (la debe quien aporta), una nube entregada sin aceptar (la debe
el encargado), una observación por corregir (la debe su responsable) y una por verificar (la debe quien revisa).

### Pieza 2 · «Lo que este plano necesita para cerrarse» — sin migración, o con una pequeña

Hoy, para pedir algo hay que saber que se hace con una nube o con una observación. Propongo **un solo gesto**,
con un nombre que se entienda: en el plano (y desde su fila en Archivos), **«Pedir para cerrar»**:

- qué hace falta (una línea);
- **a quién** se le pide (una persona o una empresa de la obra);
- para cuándo.

Por dentro es la observación del plano entero que ya existe —con su responsable, su plazo, su aviso en «Mi
trabajo», su entrega y su verificación—, así que no se inventa un tercer mecanismo. Si se quiere señalar un sitio
concreto de la hoja, se sigue usando la nube.

### Pieza 3 · La importancia — lleva migración

Un dato nuevo en cada plano: **su importancia**, que pone una persona.

- Tres niveles, con los nombres que tú digas. Propuesta: **Crítico**, **Normal** (por defecto) y **Puede esperar**.
- Se ve como una etiqueta discreta en la fila de Archivos, en el lector y en la revisión, y se puede ordenar y
  filtrar por ella.
- Quién la cambia y cuándo queda en el historial del plano.
- **No la calcula el sistema.** El criterio de obra lo pone quien conoce la obra, no el código. Lo que sí hace
  el sistema es **ordenar con ella**: en «Mi trabajo» y en las listas, lo que se debe en un plano crítico sale
  primero.

Juntando las tres: una lista «Planos críticos con pendientes», con quién debe qué y desde cuándo. Eso es lo que
contesta de un vistazo «¿qué está frenando la obra y quién lo tiene?».

## 3 · Lo que tienes que decidir

| | Pregunta | Mi recomendación |
|---|---|---|
| **1** | ¿Los niveles de importancia y sus nombres? | Crítico · Normal · Puede esperar. Tres bastan; con cinco nadie distingue el 2 del 3. |
| **2** | ¿Quién puede cambiar la importancia de un plano? | Quien puede editarlo y quien administra la carpeta. Quien solo lo ve, no. |
| **3** | ¿Se puede aprobar en una revisión un plano que no está «completo»? | Sí, avisando antes («le faltan 2 entregas»). Igual que hoy con las observaciones abiertas: informar, no bloquear. Si quieres que bloquee en los críticos, se añade después. |
| **4** | ¿Por dónde empiezo? | Por la pieza 1: no necesita migración, usa lo que ya está guardado en producción y es la que se nota al día siguiente. Luego la 3 y luego la 2. |

## 4 · Lo que no sé todavía

- **Cuánto pesa** calcular los pendientes para una carpeta de cientos de planos. La lista de Archivos es la
  pantalla más sensible a la velocidad (y el servidor es pequeño). Hay que medirlo antes de prometer la columna:
  si pesa, el número se pide aparte, después de pintar la lista.
- Si la importancia debe ser **del plano** (igual en todas sus versiones) o **de cada versión**. Propongo del
  plano: es el documento el que importa, no la revisión C03.
- Cómo quieres ver esto en el **visor 3D**, si es que lo quieres ahí. No lo he mirado.
