# CHECKPOINT FINAL ANTES DE ABRIR LA CONTROLLED WINDOW

**Fecha:** 21 de agosto de 2026 · **Nada se ejecuta con este documento.**
La fecha y la orden de abrir la ventana son del propietario.

---

## LAS SIETE CONFIRMACIONES

### 1 · El alcance de la ventana sigue congelado ✅

El alcance es el del **doc 53 §4** (14 pasos), sin una línea añadida desde su
aceptación. Verificado en git: desde el cierre del paquete, **todos los commits
son documentales** — `git diff` de `backend/` y `frontend-docs/` entre el
tablero maestro y HEAD: **vacío**. El código que la ventana despliega es el que
el gate midió.

### 2 · Identity & Access UX NO entra en la ventana ✅

Cerrado **como diseño** (docs 55–61) con cero código producido — verificado,
no supuesto (punto 1). Toda su implementación (G1–G7, `invitacion_gen`,
`activated_at`, invariante de sesión, pantallas P1–P6) es **POST-window**, por
decisión explícita repetida en las adendas 57 §4, 59, 60 y 61. El tablero
maestro (capa 12) queda actualizado exactamente así: **Diseño CERRADO ·
Implementación POST-WINDOW · Estado global PARCIAL**. Las capas 8, 13, 14, 15 y
16 siguen **DEFER**, sin cambios.

### 3 · El runbook vigente sigue siendo el último aprobado ✅

**Doc 53** (paquete final pre-window) gobierna; debajo de él, REV.02 (doc 49)
con D1/D2 cerrados (doc 50) y las cuatro adiciones de E1–E4 ya incorporadas a
su secuencia (verificación de los 3 objetos de `es_admin`; `ENFORCE_PROJECT_AUTHZ=true`
+ `APP_URL` en el cutover; smoke de permiso de carpeta; re-verificación del
panel al abrir). Ningún documento posterior lo modifica.

### 4 · E1–E5 siguen siendo la base del gate ✅

`READY FOR CONTROLLED WINDOW` (doc 52, aceptado), con sus dos ALERT vivos y
conocidos: **conceder permisos de carpeta roto en producción desde el 20-ago**
(lo cierra la ventana; su smoke es obligatorio) y **enforce en log-only** (se
enciende en el cutover). Nada posterior alteró una sola evidencia.

### 5 · Ninguna dependencia nueva por cerrar Identity & Access UX ✅

Revisado elemento a elemento: `activated_at`, `invitacion_gen`, G5a/G5b, G7, el
invariante de sesión y el `UPDATE sessions` de la migración — **todos operan
sobre el árbol que la ventana ya habrá desplegado, ninguno exige nada de la
ventana ni la ventana exige nada de ellos**. La única migración de la fase (G7)
tiene su propia ventana de esquema posterior, con su propio ensayo.

### 6 · Las condiciones de STOP siguen vigentes ✅

La tabla del doc 53 §5, íntegra — incluida la que no se negocia: ante un fallo,
**nunca devolver `DB_USER` a `postgres`**.

### 7 · El siguiente acto es abrir la ventana, no seguir diseñando ✅

No queda ningún frente de diseño abierto: el tablero maestro tiene 9 capas
implementadas, 2 parciales con su camino escrito, 5 DEFER con su trigger. Lo
único entre hoy y el estado objetivo es **ejecutar** — y eso empieza por las
precondiciones del doc 53 §3 (copia fresca + restauración, contraseñas listas,
árbol confirmado, panel re-verificado, obra de prueba, una hora sin prisa).

---

## IMPACTO SOBRE CONTROLLED WINDOW: **NO**

Tu expectativa se confirma, y con la verificación hecha en vez de asumida:

- **Por qué NO:** todo lo concluido en Identity & Access UX es *diseño sobre el
  estado posterior a la ventana*. `activated_at` e `invitacion_gen` viven en la
  migración G7 (post-window); G5a/G5b son código de la fase; el invariante de
  sesión entra con ese mismo paquete. La fase **no produjo ni un commit de
  código** — el payload de la ventana es bit a bit el que el gate midió, hoy
  **38 commits** esperando viajar en ella.
- **El único roce examinado y descartado:** la nota 61 revoca sesiones *en la
  transacción de G7* — podría tentarse adelantarlo a la ventana «ya que
  estamos». **No se hace**: pertenece a la migración que crea `activated_at`,
  sin la cual la revocación no tiene criterio. La ventana no crece.

## DOS NOTAS OPERATIVAS — fuera del gate, para que no se pierdan

1. **`project_ref` vacío en producción** (hallado en el diagnóstico de «cero
   proyectos», ajeno a Identity UX): **no está en la ventana congelada y no se
   añade**. Es un acto operativo posterior — `sembrar_referencias.py`, que se
   niega a adivinar con los nombres duplicados — ejecutable tras la ventana como
   `ecd_app`, con calma.
2. **Pendiente de tu confirmación**: si al cerrar sesión y volver a entrar
   reaparecieron tus proyectos (la hipótesis de la sesión caducada quedó
   diagnosticada pero no confirmada por ti). No condiciona el gate; conviene
   saberlo antes de abrir la ventana.

---

**Siguiente acto, cuando tú lo decidas:** abrir la CONTROLLED WINDOW por el
doc 53 — empezando por su precondición 1, la copia fresca del día.

**STOP.**
