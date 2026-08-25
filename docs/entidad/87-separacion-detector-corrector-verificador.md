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

## 6 · EL INCIDENTE DE DESPLIEGUE, PORQUE ENSEÑA ALGO

El backend se desplegó **antes** de que corriera la migración 17 —que quedó
bloqueada tres veces por el clasificador de permisos—. Medido contra el servicio
en vivo con esa combinación:

| ruta | resultado |
|---|---|
| `GET /api/issues/catalogo` | 200 — no toca la base |
| `GET /api/issues?model_urn=…` | **500** |

`doc_issues` tenía 28 columnas y `_COLS` leía una que no existía. La migración la
ejecutó el propietario a mano y el servicio volvió a 200 sin reiniciar: es solo
esquema.

**La regla que queda escrita:** cuando una migración añade una columna que el
código nuevo *lee*, la migración va **antes** del despliegue. Al revés no es un
despliegue degradado — es un 500 en toda la superficie del objeto.

---

## 7 · EXP — TRES PERSONAS REALES, CONTRA PRODUCCIÓN

Reparto, elegido para que las negativas signifiquen algo:

```
    DETECTOR   id 24  qa.manager   y ADEMÁS ADMINISTRADOR DE OBRA
    CORRIGE    id 23  piloto1
    VERIFICA   id 25  qa.revisor   NO es administrador
```

Que el detector sea además admin es el caso más duro: si `detector_id` heredara
autoridad de cierre por algún resquicio, con ese usuario se vería. Y que el
verificador **no** sea admin obliga a que su permiso venga de la designación y no
del cargo.

### 7.1 · Las negativas al nacer

| acto | resultado |
|---|---|
| punch sin verificador | 409 `SIN_VERIFICADOR` |
| punch con verificador = responsable | 409 `VERIFICADOR_ES_RESPONSABLE` |
| punch sin lámina | 409 `SIN_UBICACION` |
| verificador de fuera de la obra | 409 `VERIFICADOR_NO_MIEMBRO` |

### 7.2 · El ciclo, con la pelota cambiando de manos

`ISS-007` nace `detectó=24 · corrige=23 · verifica=25`, y la pelota va a 23.
Tras corregir: 23 se queda con **0** encargos y 25 recibe *«Verificar la
corrección de ISS-007»*. Tras cerrar: los tres a 0.

### 7.3 · Quién cierra — la prueba de fuego

| quién intenta verificar | resultado |
|---|---|
| quien corrigió (23) | **403** `NO_PUEDE_VERIFICAR` |
| **el detector (24), que además es ADMIN DE OBRA** | **403** `NO_PUEDE_VERIFICAR` |
| alguien de fuera de la obra | 403 `PROJECT_FORBIDDEN` |
| rechazar sin motivo | 400 `SIN_MOTIVO` |
| el verificador designado (25) | **200** |
| reverificar lo ya cerrado | 409 `TRANSICION_INVALIDA` |

La segunda fila es el resultado que se buscaba: **el detector no cierra ni siendo
administrador de la obra.** Antes de esta pasada, cerraba por las dos vías.

Rechazo → la pelota vuelve a 23 con *«Volver a corregir»*. Historial final:

```
    detected    qa.manager     corrected  piloto1
    reopened    qa.revisor     corrected  piloto1     verified  qa.revisor
```

### 7.4 · Perímetro

Quien no está en la obra recibe **403** en las cinco: listar, ver, levantar,
cerrar y autorizar la excepción.

### 7.5 · Sin verificador designado — los dos caminos

`ISS-008` (CALIDAD, sin designar): al corregirse **la pelota no se adjudica
sola** —0 encargos para todos—. Quien corrigió: 403. Un tercero no admin: 403.
El administrador de obra: 200. La deuda queda visible, no adjudicada.

### 7.6 · La excepción, escrita

`ISS-009`: el responsable intentando concedérsela a sí mismo → 403. Un no admin →
403. El admin sin motivo → 400. Con motivo → 200, y entonces el responsable se
autoverifica. Lo que queda en el expediente:

```
    self_verification_allowed   qa.manager   «Frente aislado sin supervisión
                                              hasta el lunes; se acepta que el
                                              propio ejecutor certifique…»
    verified                    piloto1
```

Quién la autorizó, con qué motivo y quién se autoverificó: las tres cosas
legibles.

### 7.7 · Regresión acotada de GAP 03

Acta `PL-008` con un punto no conforme → `No liberado` → **`ISS-010`,
tipo `NO_CONFORMIDAD`, origen `PROTOCOLO`**, `detectó=25 · corrige=23 ·
verifica=25`, `redline_id = None`. Ciclo completo: el inspector no puede
corregir (403), la contrata corrige, la contrata no puede cerrar (403), el
inspector verifica. El acta sigue diciendo `No conforme`: cerrar el issue no
reescribe lo que se comprobó aquel día.

**Cero Red Lines nuevos**, medido en la base y no por la API —el contador vía API
devolvía `None`, y comparar `None` con `None` no prueba nada—:

```
    total de Red Lines .................. 40, igual que antes
    Red Line más reciente de toda la base  25-ago 16:10:27   (los 6 de QA, cerrados)
    la regresión corrió a las ........... 19:43 – 19:46
```

### 7.8 · Invariantes medidas sobre los 10 issues

```
    corregidos sin verificador (deuda visible) ......... 0
    cerrados por quien corrigió SIN autorización ....... 0
    cerrados por el detector no designado .............. 0
```

---

## 8 · ESTADO

| pieza | estado |
|---|---|
| Arquitectura de las tres identidades | ✅ |
| Backend (semántica, permisos, BIC, auditoría) | ✅ |
| Pantalla `PunchModule` | ✅ |
| Suite completa | ✅ 1230 en verde |
| Migración 17 en producción | ✅ backfill 6/6, 0 choques, restricción activa |
| EXP Issue Core | ✅ |
| EXP Punch | ✅ |
| EXP autoverificación | ✅ |
| Regresión acotada de GAP 03 | ✅ |

### Veredicto

**GAP 11 · ISSUE CORE — ARQ ✅ · OP ✅ · EXP ✅**
**GAP 04 · PUNCH — COMPLETE**

**GAP 11 completo — sigue ⏳**, como se acordó: campos personalizados, causa
raíz, estados y tipos configurables, taxonomías y automatización genérica siguen
fuera a propósito.
