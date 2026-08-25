# 87 · DETECTOR ≠ RESPONSABLE DE CORREGIR ≠ VERIFICADOR

**Fecha:** 25-ago-2026
**Origen:** revisión arquitectónica pedida por el propietario antes de cerrar la
pantalla de GAP 04 y ejecutar sus EXP.
**Alcance:** ISSUE CORE (adelanto parcial de GAP 11) y su acoplamiento con el
escalado de GAP 03.

---

## 1 · LO QUE SE PIDIÓ COMPROBAR

> «Si `verificador_id` ya existe como identidad independiente, demuéstralo y
> continúa. Si NO existe, corrígelo ahora. (…) `detector_id` conserva quién
> encontró/registró el defecto; no debe convertirse implícitamente en autoridad
> de cierre. (…) Usa una regla explícita y persistida; no una inferencia
> invisible.»

Y, explícitamente, **no** congelar como universal la regla
«CORREGIDO → BIC a quien detectó».

---

## 2 · VEREDICTO DE LA AUDITORÍA: **NO EXISTÍA**

`verificador_id` no aparecía en ningún sitio. Comprobado sobre las cuatro piezas
del objeto — `flujo_de_issue.py`, `routes/issues.py`, `sql/16_gap11core_issues.sql`
y `encargos.py` — con **0 ocurrencias**.

Lo que había eran **dos identidades y media**:

| columna | qué guardaba | qué es |
|---|---|---|
| `autor_id` | quien **detecta** | papel |
| `responsable_id` | quien **corrige** | papel |
| `verificado_por` | quien verificó | **registro de un hecho, no un papel** |

`verificado_por` se rellena *después* de firmar. No puede gobernar a quién le
toca *antes*, porque antes está vacío.

### El defecto concreto que eso producía

Sin un verificador designado, el manejador tenía que elegir a alguien — y eligió
al detector, en dos sitios a la vez:

1. **La pelota.** `deudor_de_issue` mandaba el estado `Corregido` a `autor_id`.
2. **La autoridad.** `puede_verificar` decía
   `if (uid == issue.get('autor_id')) or es_admin_de_obra:`

Es decir: **quien encuentra el defecto quedaba convertido en quien autoriza su
cierre**, por inferencia y sin que nadie lo hubiera decidido.

### Por qué no se había visto

Porque los seis issues existentes son **no conformidades de protocolo**, y en
ese tipo las dos personas SÍ coinciden: el inspector que la detecta es quien
comprueba que se levantó. La inferencia acertaba por casualidad.

En un **punch de recepción** no coinciden por naturaleza:

```
    registra   quien recorre la obra
    corrige    el contratista
    aprueba    la SUPERVISIÓN
```

Tres papeles, dos columnas: el tercero se inventaba.

---

## 3 · LA CORRECCIÓN

### 3.1 · La identidad, en la base — `sql/17_issue_verificador.sql`

```sql
ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS verificador_id INTEGER;
-- FK a users(id) ON DELETE RESTRICT
-- CHECK ck_issues_verificador_designado_distinto:
--   verificador_id IS NULL OR responsable_id IS NULL
--   OR verificador_id <> responsable_id OR autoverificacion
-- índice parcial sobre los estados vivos
```

`verificado_por` **se conserva y no cambia de significado**: es el HECHO —quién
firmó—. `verificador_id` es el PAPEL —a quién le toca—. Normalmente coinciden;
cuando no, el hecho manda sobre la designación y **las dos cosas quedan
registradas** (la pantalla lo dice en el detalle).

La restricción de identidad distinta antes solo se comprobaba **al verificar**.
Ahora se comprueba **al nacer**: el choque aparecía al final, cuando ya no hay a
quién reasignar sin tocar el registro.

### 3.2 · La autoridad — `flujo_de_issue.puede_verificar`

| quién pide verificar | resultado |
|---|---|
| el responsable, sin autoverificación | **DENY** — quien corrige no verifica su propia corrección |
| el responsable, con autoverificación autorizada | ALLOW |
| el verificador designado | ALLOW |
| el detector, **no** designado | **DENY** |
| un tercero cualquiera | DENY |
| un admin de obra, **sin** verificador designado | ALLOW |
| un admin de obra, **con** verificador designado distinto | DENY |

El detector ya no aparece en esta tabla como tal. Cierra si —y solo si— además
es el verificador designado.

### 3.3 · La pelota — `encargos.deudor_de_issue`

```
    Abierto     el RESPONSABLE
    Reabierto   el RESPONSABLE
    Corregido   el VERIFICADOR DESIGNADO
    Verificado  nadie
    Anulado     nadie
```

**Sin verificador designado no se inventa uno**: devuelve `None`, el issue queda
sin deuda y aparece en un aviso de la pantalla. Es preferible **una deuda
visible a una responsabilidad adjudicada sola**.

La tabla del docstring seguía diciendo «Corregido → quien detectó» y contradecía
a su propio código: corregida, porque ese bloque es lo que la gente lee como
contrato.

### 3.4 · La regla de GAP 03, **declarada y no inferida**

En `routes/protocolos.py::_escalar`:

```python
verificador = a['autor_id']            # el inspector que la detectó
if a['responsable_id'] and verificador == a['responsable_id']:
    verificador = None                 # los issues nacen SIN verificador
    logger.warning(...)
```

Para una no conformidad de protocolo, detector y verificador **sí** coinciden, y
es correcto — pero se escribe. Una coincidencia declarada es una decisión; una
inferida es un acoplamiento esperando a romperse en el siguiente tipo. Y si el
inspector fuera además el responsable, **no se designa a nadie**: crear el
conflicto que la restricción existe para impedir habría sido peor.

Esto es exactamente lo que el propietario pidió no congelar como universal: la
regla vale **para NO_CONFORMIDAD**, está escrita en el sitio que la aplica, y
`PUNCH` exige lo contrario (`EXIGEN_VERIFICADOR = (PUNCH,)`).

### 3.5 · Una sola versión de la regla

`_fila` expone `a_quien_le_toca`, calculado **por la misma función que reparte
los encargos**. La pantalla lo lee; no lo deduce. Si lo dedujera habría dos
versiones —la que manda los avisos y la que dibuja la lista— y divergirían en el
primer estado nuevo.

---

## 4 · LA PANTALLA — `PunchModule.jsx`

**No** se llama `IssueModule`: ese nombre ya es el componente genérico de RFI y
Red Line. Reutilizarlo habría vuelto a mezclar en el árbol de ficheros lo que se
acababa de separar (`RED LINE ≠ ISSUE`).

Lo que la pantalla hace visible:

- **Las tres identidades, siempre** —en la lista y en el detalle— con marca de a
  quién le toca. Una pantalla que enseñara solo «responsable» dejaría creer que
  hay dos papeles donde hay tres.
- **«Sin designar» en rojo** cuando el issue está `Corregido` sin verificador:
  la pelota se ha caído y eso no puede leerse como un hueco decorativo.
- **Por qué no puedes**, cuando no puedes: un botón ausente sin explicación se
  lee como un fallo de la pantalla, no como una separación de papeles.
- **Lo que cada tipo exige** lo dice el catálogo del servidor
  (`exige_responsable`, `exige_verificador`, `exige_ubicacion`), no una lista
  escrita en el cliente. Un tipo nuevo ya sabría pedir lo suyo.
- **Sin «cambiar estado»**: cada acto es su propia llamada con su propia
  autoridad, igual que en el backend. Ofrecer un selector de estado habría sido
  dibujar una puerta que no está.

---

## 5 · TECHO DE RUTAS — lo que se exigió comprobar

> «Verifica que el test falle si `portal` vuelve a importar familias de: viewer,
> 4D, IA — aunque el total esté por debajo de 260.»

Añadida `test_el_guardia_POR_FAMILIA_dispara_aunque_el_total_este_bajo_el_techo`:
simula una fuga de **6 rutas** —muy por debajo del techo— con una de cada
familia excluida dentro, y comprueba que el guardia por familia las ve y las
nombra.

El número sigue siendo una alarma gruesa. La protección es la familia.

---

## 6 · ESTADO Y LO QUE FALTA

| pieza | estado |
|---|---|
| Arquitectura de las tres identidades | ✅ |
| Backend (semántica, permisos, BIC, auditoría) | ✅ |
| Pantalla `PunchModule` | ✅ compila (21,8 kB) |
| Suite completa | ✅ **1230 en verde** |
| Migración 17 · **ensayo** | ✅ contra producción en transacción revertida: backfill 6/6, 0 choques, la restricción muerde, idempotente, producción intacta |
| Migración 17 · **pase real** | ⛔ **PENDIENTE** |
| Backend desplegado | ⛔ **NO RESPONDE** |
| EXP Issue Core · EXP Punch | ⏳ bloqueadas por lo anterior |
| Regresión acotada de GAP 03 | ⏳ bloqueada por lo anterior |

### El orden importa

La migración 17 tiene que correr **antes** del despliegue del backend: el código
nuevo lee `verificador_id`, y producción todavía no tiene esa columna. Al revés,
el servicio arrancaría contra un esquema que no le sirve.

### Veredicto

**GAP 11 · ISSUE CORE — ARQ ✅ · OP ✅ · EXP ⏳**
**GAP 04 · PUNCH — ⏳** (no COMPLETE: sin EXP no hay estado real)
**GAP 11 completo — sigue ⏳**, como se acordó: campos personalizados, causa
raíz, estados y tipos configurables, taxonomías y automatización siguen fuera.
