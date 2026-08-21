# SEMÁNTICA CONGELADA Y CONSISTENCIA EVENTUAL DEL ENCARGO

**20-ago-2026** · Cierra dos puntos del informe [24](24-informe-del-motor-de-encargo.md)

---

# 1 · La semántica, congelada

## Su interpretación es correcta. La confirmo y la fijo.

| concepto | fuente de verdad | qué es |
|---|---|---|
| **Responsable contractual** | **el objeto** — `doc_rfis.responsable`, `doc_redlines.responsable`, `doc_reviews.steps`, `transmittals.recipients` | Lo que se escribió y quedó en el expediente. Texto tal como se redactó: `'Ing. Valeria Barrenechea'` |
| **Estado del objeto** | **el objeto** — `estado`, `respuesta`, `status`, `acuses` | Si está respondido, aprobado o acusado |
| **Responsabilidad operativa actual** | **`encargos`** — `destino_usuario` / `destino_funcion` | A quién le toca **ahora**, en términos de una identidad del sistema |
| **Acceso** | **`project_users` + `folder_permissions`** | Ninguna de las dos anteriores lo concede |

### Y sí: no se exige que sean el mismo dato

**Un texto histórico y una identidad estructurada no son el mismo dato, y
forzarlos a serlo sería un error.** Tres razones concretas, no teóricas:

1. **El texto es del expediente.** `'Ing. Valeria Barrenechea'` se escribió como
   se escribió. Reinterpretarlo hoy como un `user_id` sería reescribir lo que
   dijo un documento.
2. **La persona cambia; el registro no.** Si esa ingeniera deja la obra, la
   responsabilidad operativa pasa a otro. El RFI **debe seguir diciendo** que en
   su día se le dirigió a ella.
3. **No todo destinatario es un usuario.** Un transmittal puede ir a un correo
   externo. Se le avisa igual, pero no tiene bandeja: no hay a quién abrirle un
   encargo, y eso no invalida la emisión.

### La consecuencia que hay que aceptar con el ojo abierto

De un RFI o un Redline se puede detectar que **sobra** un encargo —el objeto ya
está respondido— pero **no que falte**. Del texto libre no se deduce a qué usuario
habría que abrírselo.

No es un descuido: es el precio directo de la decisión de arriba, y está escrito
en el código (`encargos._faltantes`) para que nadie lo lea como un olvido. Para
Review y Transmittal **sí** se puede en las dos direcciones, porque sus
destinatarios llevan correo.

### La regla operativa que se deriva

> Reasignar es una operación **sobre el objeto**, y el encargo la sigue. Nunca al
> revés. Por eso no hay ninguna ruta que escriba un encargo.

---

# 2 · Consistencia eventual: el hueco existía, y ya no

## Tenía razón: `huerfanos()` no lo detectaba

Miraba **existencia** —¿existe el objeto? ¿es de esta obra?— y nunca **estado**.
El caso que usted describe:

```
RFI = RESPONDIDO        encargo = ABIERTO
```

pasaba entero por debajo. Alguien seguiría viendo en su bandeja una deuda que ya
saldó.

## Lo construido: mínimo, y siguiendo un patrón que ya existía

Ni demonio, ni cola, ni planificador. El proyecto **ya tenía** exactamente este
patrón para el almacén (`conciliacion_almacen.py`), y se sigue su forma:

1. **Fuentes declaradas**, y si aparece un tipo que no se sabe cotejar, **se
   niega a correr** en vez de darlo por saldado. *Cerrar por no entender sería
   peor que no conciliar.*
2. **Las dos direcciones**: lo que sobra y lo que falta.
3. Por defecto **solo informa**.

**Añadido a `encargos.py`:**

| función | qué responde |
|---|---|
| `_sigue_debiendose(cur, tipo, id, usuario)` | Le pregunta **al objeto**, que es la fuente de verdad. No opina |
| `divergencias(cur)` | `{'sobrantes': […], 'faltantes': […]}`. Solo lee |
| `conciliar(cur, aplicar=False)` | Repara. **Idempotente** |
| `huerfanos(cur)` | Se conserva como **subconjunto estricto** de existencia |

**Y `herramientas/conciliar_encargos.py`**, que responde la pregunta de forma
determinista:

```bash
python herramientas/conciliar_encargos.py
```

### Por qué aquí sí se puede reparar, y en el almacén no

Borrar bytes es irreversible. Cerrar un encargo sobrante **no pierde nada**: el
objeto sigue siendo la fuente de verdad y esto solo ajusta su reflejo. Aun así,
reparar exige `--aplicar`.

Y la reparación de un *faltante* pasa por `abrir()`, que vuelve a comprobar
pertenencia: **la conciliación no puede colar un encargo que la vía normal
negaría.** La invariante 1 no tiene puerta trasera.

## Un fallo mío que encontró el ensayo

Al reescribir `huerfanos()` como subconjunto, lo filtré por **el prefijo del
texto** del motivo. Y `'el objeto ya esta resuelto'` empieza igual que
`'el objeto no existe'`: la divergencia de **estado** se colaba contándose como
huérfano.

Es, otra vez, juzgar por la forma en lugar de por el significado. Los motivos son
ahora **constantes** (`SIN_OBJETO`, `OTRA_OBRA`, `YA_RESUELTO`) y hay una prueba
que exige que sigan siendo distinguibles.

## El ensayo de los cinco pasos

`herramientas/ensayo_de_encargos.py` §8, contra PostgreSQL:

```
OK  Carlos ve el encargo del RFI-009
OK  el RFI queda RESPONDIDO (la transición contractual sobrevive)   ← 1
OK  y el encargo se queda ABIERTO: la divergencia existe de verdad  ← 2
OK  la conciliación DETECTA la divergencia de estado                ← 3
OK  y `huerfanos()` NO la ve — por eso hacía falta `divergencias()`
OK  la conciliación cierra 1 encargo sobrante                       ← 4
OK  Carlos deja de ver en su bandeja algo que ya saldó              ← 5
OK  correrla otra vez no cambia nada (es idempotente)
OK  y no queda ninguna divergencia
OK  la base RECHAZA un tipo de encargo desconocido (ck_encargos_tipo)
```

El fallo de la proyección se reproduce escribiendo el objeto directamente —que es
exactamente lo que queda cuando `cerrar_los_de` revienta y su `try` lo absorbe.

**Sobre el último paso:** un tipo desconocido **no puede llegar a existir**,
porque lo impide `ck_encargos_tipo` en la base. El guardia en Python
(`TipoNoInterpretable`) es la segunda línea, para una base antigua sin esa
restricción, y se prueba sin base de datos.

## Y encontró una divergencia real

Ejecutada contra la base de desarrollo, sin preparar nada:

```
FALTAN (1) — el objeto dice que se debe y no hay encargo:
  TRANSMITTAL  objeto 1   usuario 2   Acusar recibo de TR-001: REVISO02
```

Es un transmittal **anterior a que existiera el bloque**, cuyo destinatario nunca
tuvo encargo. La detección en dirección inversa funciona sobre datos que no se
fabricaron para la prueba.

---

## Pruebas

**831 pasan · 0 fallan** (antes de este cierre: 826).
Ensayo del motor de encargo: **31 / 31** (antes 21).

---

**STOP.** No he avanzado a Reviews maduras ni a ninguna otra pieza.
