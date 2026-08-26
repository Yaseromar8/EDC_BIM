# 90 · GAP 07 · QUÉ SIGNIFICA *OFFLINE*, Y CÓMO SE VA A CONSTRUIR

**Fecha:** 25-ago-2026 · **Benchmark:** `docs/82 §4.8` (congelado)
**Estado:** definición y arquitectura. **Todavía no hay código.**

---

## 1 · LO QUE **NO** CUENTA COMO OFFLINE

El propietario lo fijó antes de empezar, y es la parte más importante de este
documento:

```
    responsive UI      ✅        no es trabajo offline
    instalación PWA    ✅        no es trabajo offline
    caché de assets    ✅        no es trabajo offline
```

Las tres juntas producen una aplicación que **abre** sin cobertura y no **sirve**
para nada: enseña la cáscara y un error de red. En obra lineal —que es donde
este producto se usa— eso es exactamente igual de inútil que no abrir.

**GAP 07 no se declarará COMPLETE por tener un service worker.**

---

## 2 · LO QUE SÍ CUENTA: EL CICLO DE CAMPO

Un ciclo real, de punta a punta, con la red cayéndose en medio:

```
CON CONEXIÓN
    sincroniza la obra: lo que hace falta para trabajar en ella

SIN CONEXIÓN
    abre información previamente disponible
    crea o modifica un objeto permitido
    adjunta evidencia local (foto)
    conserva identidad + marca de tiempo local
    queda PENDIENTE DE SINCRONIZACIÓN, y se ve que lo está

VUELVE LA CONEXIÓN
    sincroniza
    el servidor VUELVE A VALIDAR la autoridad
    genera los ids canónicos
    el historial y la auditoría quedan correctos
    NO DUPLICA ACTOS
```

La última línea es la que decide si esto es un producto o un juguete.

---

## 3 · POR DÓNDE SE EMPIEZA, Y POR QUÉ

**No se construye un «modo offline universal» de golpe.** Se demuestra la
arquitectura sobre **dos actos de campo de alto valor**, y después se extiende.

| acto | por qué estos dos |
|---|---|
| **PROTOCOLO / INSPECCIÓN** (GAP 03) | Se levanta caminando la obra, con el acta en la mano. Es el caso de uso que hoy se resuelve en papel y se transcribe después — el trabajo que este gap existe para recuperar. |
| **ISSUE / PUNCH** (GAP 04/11) | Se levanta recorriendo, con foto. Es el otro acto que hoy sale de la obra en una libreta. |

Los dos ya tienen lo que hace falta para que la sincronización signifique algo:

```
    asignación · BIC · evidencia · identidad · estados · auditoría
```

Un objeto sin esas seis cosas sincronizaría datos, no **actos**. Y lo que este
producto guarda son actos.

**Fuera de la primera entrega, a propósito:** subir documentos al expediente,
emitir revisiones de plano y aprobar revisiones. Los tres cambian qué vale para
todos, y hacerlos a ciegas —sin ver lo que otros hicieron mientras no había
red— es peor que no poder hacerlos.

---

## 4 · LAS OCHO DECISIONES, RESUELTAS ANTES DE PROGRAMAR

### 4.1 · `local_id` ↔ `server_id`

El objeto nace en el móvil con un **UUIDv4 generado en el dispositivo**, no con
un número correlativo. Un correlativo local produce colisiones en cuanto dos
personas trabajan sin red a la vez.

```
    local_id     uuid del dispositivo      nace offline, NO cambia nunca
    server_id    id canónico + código      lo asigna el servidor al sincronizar
```

El `local_id` **se conserva después de sincronizar**, en el propio objeto: es la
llave de idempotencia y la que permite decir «esto que ves aquí es lo que
levantaste tú aquella mañana». Borrarlo al asignar el `server_id` haría
imposible detectar un reenvío.

**El código correlativo (`ISS-011`, `PL-009`) lo asigna SIEMPRE el servidor.**
En el móvil se enseña «pendiente», no un número inventado que después cambiaría
—y que la gente ya habría anotado en su libreta—.

### 4.2 · Estado de sincronización

Cuatro estados, en el objeto local:

```
    LOCAL          creado sin red; nadie más lo ha visto
    ENVIANDO       en vuelo
    SINCRONIZADO   el servidor lo aceptó y devolvió su id canónico
    RECHAZADO      el servidor lo rechazó; NO se reintenta solo
```

`RECHAZADO` no es un error de red: es una respuesta. Se distingue de un fallo de
transporte porque un fallo se reintenta y un rechazo no.

**Se ve en la pantalla, siempre.** Un acto que el usuario cree hecho y que está
solo en su teléfono es la peor forma de perderlo.

### 4.3 · Reintento idempotente

Cada acto viaja con su `local_id` y el servidor mantiene una **llave de
idempotencia** `(project_id, local_id)`:

```
    primera vez   → se crea, se devuelve el id canónico
    reenvío       → NO se crea nada; se devuelve el MISMO id canónico
```

Es la misma disciplina que ya usa el escalado de protocolos de GAP 03 —
reintento idempotente con la deuda visible— y por eso no es una idea nueva en
este producto: es la que ya funcionó.

El caso que esto ataca: el móvil envía, el servidor crea, la respuesta se pierde
en el túnel. Sin llave de idempotencia, el reintento crea un segundo issue
idéntico y en obra aparecen dos punch para el mismo defecto.

### 4.4 · Conflicto

**Crear no entra en conflicto. Modificar, sí.** Y se resuelven distinto:

```
    CREAR       un acta nueva, un issue nuevo: no pisa nada. Se acepta.
    MODIFICAR   el objeto pudo cambiar en el servidor mientras no había red.
```

Para modificar se envía la **versión que se tenía** (`version_vista`). Si el
servidor está en otra:

```
    409 CONFLICTO_DE_SINCRONIZACION
    + el estado actual del servidor
    + lo que el usuario intentó
```

**No se hace merge automático y no gana el último.** Un acta que dice «conforme»
y otra que dice «no conforme» sobre el mismo punto no se promedian: decide una
persona, viendo las dos. «El último gana» aquí significa que el orden de
recuperación de la cobertura decide el resultado de una inspección.

### 4.5 · Acto rechazado al reconectar

El objeto pasa a `RECHAZADO` y **se conserva íntegro en el dispositivo** con el
motivo del servidor. No se borra: es trabajo que alguien hizo.

La pantalla lo enseña con lo que se puede hacer:

```
    corregir y reenviar        (si el motivo es corregible: falta evidencia)
    descartar, con confirmación (si ya no aplica)
```

Nunca se descarta solo. Un acto que desaparece con un mensaje de error es
indistinguible de un acto que nunca existió.

### 4.6 · Revocación de acceso mientras se estaba offline

**El servidor vuelve a validar la autoridad al sincronizar, no confía en que la
tenía al crear.** Es la regla que sostiene todo lo demás.

Si a alguien lo sacaron de la obra el martes y sincroniza el jueves lo que
levantó el miércoles:

```
    403 ACCESO_REVOCADO
    el acto NO entra
    el acto NO se borra del dispositivo
    queda un rastro auditable de que se intentó
```

Ese rastro importa: puede ser una persona de buena fe que perdió el acceso por
fin de contrato, y su trabajo tiene que poder recuperarlo alguien con autoridad.

### 4.7 · Ficheros y fotos pendientes

Los binarios **no viajan en el mismo envío que el acto**. Dos colas:

```
    1. el ACTO      json pequeño, sincroniza rápido y primero
    2. la EVIDENCIA blobs grandes, cada uno con su reintento
```

El acto entra referenciando sus evidencias por `local_id`; cada foto sube
después y se ata. Mientras falte alguna, el acto está `SINCRONIZADO` **con
evidencia pendiente**, y se dice con esas palabras.

Ir todo junto significaría que una foto de 8 MB en un cerro sin cobertura
bloquea un acta que pesa 2 KB.

Se **reutiliza `services/uploadQueue.js`**, que ya guarda fotos en IndexedDB y
reanuda al recargar la página. No se escribe una segunda cola.

### 4.8 · Pérdida o cierre de sesión

Lo pendiente **sobrevive al cierre de sesión** y está cifrado en reposo por
usuario. Al volver a entrar:

```
    misma persona  → recupera su cola y sigue
    otra persona   → NO ve nada de la anterior
```

Y si el token caducó estando sin red, la cola **espera**: no se descarta, no se
reintenta contra un 401 en bucle. Al reautenticarse, sincroniza.

Borrar la cola al cerrar sesión sería la forma más rápida de perder una jornada
de campo — y la gente cierra sesión sin pensar.

---

## 5 · DÓNDE SE APOYA, Y QUÉ HAY QUE CONSTRUIR

**Ya existe y se reutiliza:**

| pieza | qué aporta |
|---|---|
| `services/uploadQueue.js` | cola de fotos en IndexedDB, reanuda al recargar |
| `public/site.webmanifest` | la aplicación ya se declara instalable |
| GAP 03 · escalado con SAVEPOINT | el patrón de reintento idempotente con deuda visible |
| `encargos` / BIC | la proyección de a quién le toca, ya calculada por el servidor |
| las guardias de las tres capas | validar de nuevo al sincronizar es llamarlas otra vez |

**Hay que construir:**

1. Un **service worker** que sirva la cáscara y las pantallas de los dos actos.
2. Un **almacén local** por obra: lo mínimo para trabajar — plantillas de
   protocolo, miembros, planos vigentes, catálogos.
3. La **cola de actos** en IndexedDB, hermana de la de fotos.
4. En el servidor: la **llave de idempotencia** `(project_id, local_id)` y el
   control de versión para modificar.
5. La **pantalla de lo pendiente**: qué hay sin sincronizar, en qué estado, y qué
   hacer con lo rechazado.

---

## 6 · CÓMO SE VA A DEMOSTRAR

La EXP tiene que cortar la red de verdad, no simularla con una bandera. Se hará
con el navegador en modo sin conexión, sobre el portal desplegado:

```
    1. con red     · abrir la obra, sincronizar
    2. SIN RED     · levantar un acta y un punch, con foto
    3. SIN RED     · cerrar y reabrir la aplicación → siguen ahí
    4. con red     · sincronizar
    5.             · comprobar en la BASE: ids canónicos, historial, sin duplicados
    6.             · reenviar lo mismo → NO se duplica
    7.             · revocar el acceso y sincronizar algo viejo → 403, no se pierde
```

**GAP 07 no será COMPLETE sin los siete pasos.**

---

## 7 · LO QUE ESTE DOCUMENTO NO DECIDE

- **Qué más se sincroniza después.** Primero se demuestra el motor sobre dos
  actos; extenderlo es trabajo posterior y con su propia decisión.
- **Trabajo offline en el visor 3D.** Es otro producto y otro peso.
- **Resolución asistida de conflictos.** La primera entrega los detecta, los
  enseña y deja decidir a una persona. Ayudar a decidir es otro gap.
