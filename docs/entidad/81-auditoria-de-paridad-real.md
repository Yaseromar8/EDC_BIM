# 81 · AUDITORÍA DE PARIDAD REAL ACC / PROCORE

**Fecha:** 24-ago-2026 · **Naturaleza:** auditoría y reconstrucción histórica.
**No se implementó nada. No se tocó código, base de datos ni producción.**

**Regla de método aplicada:** el benchmark se reconstruye **solo** desde la
investigación original (docs 22, 43, 44, 54, 63, 64). El doc 80 **no se usa
como fuente**: es el objeto auditado, no la vara de medir.

---

# 0 · LO QUE ESTA AUDITORÍA ENCONTRÓ, ANTES DEL DETALLE

La investigación original **no fue una auditoría de todas las herramientas de
ACC/Procore**. Fue una investigación de **CDE documental + autorización**, y
sus propios autores lo dejaron escrito tres veces.

Las 16 capas son **el modelo de identidad, administración y autorización**
derivado de esa investigación. Son 16 de 16 **de ese modelo** — que es un
resultado real y verificado, pero **no** es «16/16 de ACC/Procore».

---

# 1 · RECUPERACIÓN DE LA INVESTIGACIÓN ORIGINAL

## 1.1 · Las fuentes, en orden cronológico

| doc | fecha | qué es | citas de fabricante |
|---|---|---|---|
| **22** · `product-roadmap-ecd-vs-acc-procore` | 20-ago-2026 | Diagnóstico **funcional** por dominios + decisión de producto (generaciones) | **0** |
| **43** · `arquitectura-DOCS-acc-procore-ecd` | 21-ago-2026 | Investigación de **Docs / permisos**. Marcada ⚠ SUPERADA por la 44 | 12 |
| **44** · `arquitectura-docs-REV.02` | 21-ago-2026 | La investigación **vigente**. 77 `[D]` · 8 `[I]` · 10 `[N]` | **14** |
| **54** · `seguimiento-maestro` | 21-ago-2026 | La **matriz 01–16** nace aquí, con trigger por capa | 0 (remite a 43–44) |
| **63** · `mapa-maestro-de-seguimiento` | 21-ago-2026 | Las **dos vistas** separadas: organigrama · mapa de avance | 0 |
| **64** · `matriz-delta` REV.02 FINAL | 21-ago-2026 | Origen de la tríada **ARQ · OP · EXP** | 0 (remite a 43–44) |

## 1.2 · Qué cubren EXACTAMENTE las 14 fuentes de fabricante del doc 44

```
Autodesk (8)   Manage Folder Permissions
               Folder Permissions — niveles
               Roles
               Manage Project Members
               Create Project Templates
               Configure Project Templates
               Create and Manage Projects
               Account Administration

Procore (6)    What are permissions in Procore and how do they work?
               Change Permission Settings on a Folder or File — Documents
               Manage Permissions for Files and Folders — Documents
               Grant Granular Permissions in a Project Permissions Template
               Create a Project Permissions Template
               Permissions Tool
```

**Catorce de catorce** hablan de permisos, miembros, roles, plantillas,
creación de proyectos y administración de cuenta. **Ninguna** documenta el
comportamiento de RFI, Submittals, Formularios, Costos, Cronograma, Punch
List, Coordinación de modelos, Field ni Takeoff **como herramientas**.

## 1.3 · Las tres declaraciones de alcance, textuales, de la propia investigación

**a)** Doc 43, título y cierre:

> «ARQUITECTURA **DOCS** — ACC vs PROCORE vs NUESTRO ECD»
> «**STOP.** No se implementó nada. No se tocó `frontend-react`, 3D, 4D, LOB,
> Cost, Field ni Project Controls.»

**b)** Doc 54, cabecera — la distinción que el tablero «no permite perder»:

> «`frontend-docs` cerrado» ≠ «producto ACC/Procore cerrado». Lo cerrado es la
> **FOUNDATION BACKEND** del dominio documental.»

**c)** Doc 64, enunciado de la pregunta que la matriz responde:

> «¿nuestro ECD **representa correctamente** las capas profesionales que la
> investigación ACC/Procore nos enseñó? — **no si tenemos sus funciones**.»

**Esto es concluyente y responde a la pregunta 6 del encargo.** La respuesta
está por escrito desde el 21-ago-2026, tres días antes del doc 80.

---

# 2 · LOS TRES ARTEFACTOS, QUE NO SON EL MISMO

Se venían usando como si fueran uno. No lo son, y confundirlos es
exactamente el mecanismo por el que un «16/16» se leería como paridad total.

| # | artefacto | pregunta que responde | qué NO responde | dónde vive |
|---|---|---|---|---|
| **I** | **ORGANIGRAMA DE ARQUITECTURA** | ¿Cómo está **estructurado** el producto? La cadena de autorización, eslabón a eslabón | No dice qué está terminado. **No enumera herramientas** | doc 44 §7 · doc 63 §A |
| **II** | **MAPA MAESTRO DE AVANCE** | ¿Dónde estamos **de verdad**? Research → modelo → backend/experiencia → hardening → ventana → piloto | No define capas ni invariantes. **No mide funciones** | doc 63 §B–C |
| **III** | **MATRIZ 01–16** | ¿Cada capa **del modelo de autorización** existe, con qué evidencia y qué la despierta? | **No es el catálogo de producto.** No contiene Submittals, Formularios, Costos, Punch, Reuniones | doc 54 §A · doc 64 §1 · doc 80 |

El **16/16** es un resultado del artefacto **III**. Los artefactos I y II
nunca prometieron amplitud funcional; el III tampoco.

---

# 3 · LOS SEIS TIPOS DE PARIDAD

Sin porcentajes donde no hay denominador definible. Donde lo hay, se nombra.

## A · PARIDAD CONCEPTUAL — ¿nombramos y separamos las mismas cosas?

| | |
|---|---|
| **Benchmark** | ACC y Procore separan identidad · cuenta · proyecto · empresa · administración de cuenta ≠ de proyecto · acceso a producto/herramienta · permiso de recurso · rol en el registro **[D, doc 44 §1–§2]** |
| **ALEPHIA** | 16 capas nombradas + 12 invariantes de separación, cada una con su tabla y su pregunta propia |
| **Evidencia** | doc 44 §7 (organigrama de nueve capas) · doc 54 §C (principios cerrados) · suite 1077 con tripwires que fallan si una separación se rompe |
| **Estado** | ✅ **DEMOSTRADA** |
| **Gap** | Ninguno. **Cuatro puntos por encima del benchmark** (doc 64 §4.A): función contractual —no existe en ninguno de los dos—, closest-wins explicable con reserva de carpeta, Ball-in-Court como capa propia reconstruible, y System Operator fuera de la cadena documental |

## B · PARIDAD ARQUITECTÓNICA — ¿hay una pieza real por cada capa?

| | |
|---|---|
| **Benchmark** | Cada capa de ACC/Procore es un objeto administrado con pantalla y persistencia |
| **ALEPHIA** | 16 tablas/módulos con posición fija en la cadena y dependencias declaradas |
| **Evidencia** | 5 migraciones SQL (`08`–`12`) ejecutadas como `ecd_migrator` · módulos `herramientas_de_obra`, `acceso_a_herramientas`, `perfiles_de_acceso`, `roles_de_entidad`, `plantillas_de_obra` |
| **Estado** | ✅ **DEMOSTRADA** — dentro del modelo investigado |
| **Gap** | Ninguno en ese modelo. **Alcance:** el modelo investigado, no el catálogo de producto |

## C · PARIDAD OPERATIVA — ¿el backend lo hace cumplir de verdad?

| | |
|---|---|
| **Benchmark** | El fabricante aplica la regla en servidor, no en pantalla |
| **ALEPHIA** | Guardias en `auth_middleware` + por ruta; fail-closed en autorización, fail-open acotado solo en disponibilidad (16, 08) |
| **Evidencia** | suite **1077** · seis defectos silenciosos hallados por EXP/tripwire y cerrados (`31acf1f`, `c493933`, `2a3413e`, +3) · producción verificada en base tras cada EXP |
| **Estado** | ✅ **DEMOSTRADA** — dentro del modelo investigado |
| **Gap** | Ninguno medido en las 16 capas. **No cubre** las herramientas que no existen (ver E) |

## D · PARIDAD DE EXPERIENCIA — ¿se opera sin conocer la arquitectura?

| | |
|---|---|
| **Benchmark** | Un administrador de ACC/Procore configura todo esto desde pantalla, sin leer un documento de arquitectura |
| **ALEPHIA** | Escalera completa en la ficha de persona · Participantes · Herramientas de obra · Perfiles · Facultades · Plantillas |
| **Evidencia** | docs 71, 72, 75, 78 y las EXP de las capas 08/13/14/15/16 — **todas ejecutadas por el propietario en su propia sesión** |
| **Estado** | 🟡 **PARCIAL** |
| **Gap** | **Ninguna persona ajena al proyecto ha operado estas pantallas.** «Funciona cuando lo maneja quien lo diseñó» no es paridad de experiencia; es la hipótesis que el piloto externo pone a prueba. Sumado: P1/P2 de pulido aplazados por decisión |

## E · PARIDAD FUNCIONAL (AMPLITUD DE HERRAMIENTAS)

| | |
|---|---|
| **Benchmark** | ACC y Procore son suites: Docs, RFI, **Submittals**, Issues, **Formularios/Inspecciones**, **Punch List**, **Reuniones**, **Costos/Órdenes de cambio**, **Licitación**, Cronograma, Coordinación de modelos, Field/Partes diarios, Fotos, Assets, Takeoff, Informes entre obras |
| **ALEPHIA** | Docs (CDE ISO 19650 con estados, idoneidad, emisiones), RFI, Red Lines, Reviews multi-paso, Transmittals con acuse, Encargos/Mi Trabajo, Plan de entregas (MIDP/TIDP), Visor 3D + inventario, **4D de obra lineal**, Topografía/movimiento de tierras, AR |
| **Evidencia** | Inventario funcional del doc 22 §2, contrastado hoy contra el repositorio: `routes/` tiene 37 módulos; `grep` de `submittal\|punch\|checklist\|inspeccion\|orden_de_cambio` en `backend/routes/` → **0 coincidencias** |
| **Estado** | ❌ **NO DEMOSTRADA — y nunca se auditó** |
| **Gap** | Ver §7. **No existe**: Submittals, Formularios/Inspecciones, Punch List, Assets, Takeoff, Coordinación/interferencias propia, Informes entre obras. **Existe pero inmaduro**: campo (`tracking_progress` y `photo_evidences` vacíos), parte diario (esqueleto). **Decidido NO copiar** (doc 22 §8, doc 43 §8): reuniones, licitación, chat, visor propio, detección de interferencias, y la parte **financiera** de costos |

> **Denominador honesto:** la lista de herramientas de arriba es **nuestro
> inventario de decisión** (doc 22 §2 y §8), no el catálogo publicado por
> Autodesk ni por Procore. Nunca lo enumeramos desde la fuente. Por eso aquí
> **no hay porcentaje**: no existe denominador auditado.

## F · PARIDAD DE ESCALA EMPRESARIAL

| | |
|---|---|
| **Benchmark** | Multi-inquilino real, SSO/SAML, API pública y webhooks, facturación y medición, plano de control, móvil sin conexión, informes de cartera |
| **ALEPHIA** | **1 instancia = 1 entidad.** La capa 15 construida son **facultades dentro de una entidad**, no membresía de cuenta multi-cliente |
| **Evidencia** | doc 22 §7 «ESCALA FUTURA — no antes de varios clientes» · doc 54 capa 15, trigger literal: «el 2º cliente en la misma instancia» · `roles_de_entidad` = 4 facultades, no tenencia |
| **Estado** | ❌ **NO ALCANZADA — y deliberadamente aplazada** |
| **Gap** | Todo el bloque. **No es deuda oculta**: está clasificado y con trigger desde el 20-ago-2026 |

> **Matiz que la matriz podría ocultar:** la capa 15 figura como COMPLETE. Lo
> es —como delegación de facultades dentro de la entidad—. **No convierte el
> producto en multi-inquilino**, y el trigger que la investigación le escribió
> («el 2º cliente en la misma instancia») **sigue sin dispararse**.

---

# 4 · DIAGRAMA A · EL MODELO PROFUNDO ACC / PROCORE

Reconstruido **solo** desde docs 43–44 (plano de autorización, con marcas de
evidencia originales) y doc 22 (plano de producto). **Sin ALEPHIA.**

```
════════════════════════════════════════════════════════════════════════════
 PLANO 1 · CADENA DE AUTORIZACIÓN          [investigado con fuente: 14 citas]
════════════════════════════════════════════════════════════════════════════

 ACCOUNT / COMPANY  (nivel cuenta)
 │   ├─ Account Admin — administra TODOS los proyectos sin ser miembro   [D]
 │   ├─ Account Members / directorio de cuenta                           [D]
 │   ├─ Company Permissions Template            (Procore)                [D]
 │   ├─ ROLES como objeto administrado          (ACC)                    [D]
 │   │     ├─ default access level: Project member | Project admin       [D]
 │   │     ├─ fija productos por defecto                                 [D]
 │   │     └─ es además SUJETO de permiso de carpeta                     [D]
 │   ├─ PROJECT TEMPLATES  (ACC)                                         [D]
 │   │     └─ carpetas · miembros · productos · formularios · informes   [D]
 │   │        afecta a proyectos NUEVOS; no reescribe los existentes     [I]
 │   └─ delegación explícita de «crear proyectos»                        [D]
 │
 ▼
 PROJECT
 │   ├─ Project Admin — entra en TODA carpeta del proyecto               [D]
 │   ├─ Project Directory / Project Members                              [D]
 │   ├─ Project Permissions Template  (Procore)                          [D]
 │   └─ TOOL ACTIVATION — qué productos existen en este proyecto         [D]
 │
 ▼
 PRODUCT / TOOL ACCESS  (por miembro)
 │   ├─ ACC: Product Access; quitar Data Management EXPULSA del proyecto [D]
 │   └─ Procore: None | Read Only | Standard | Admin — None oculta       [D]
 │        └─ requisito previo: sin Read Only+ en Documents NO se puede
 │           conceder una carpeta                                        [D]
 ▼
 RESOURCE PERMISSION  (carpeta / fichero)
 │   ├─ ACC: VIEW · DOWNLOAD · PUBLISH · COLLABORATE · EDIT · CONTROL    [D]
 │   │     ├─ sujetos: user · role · company                             [D]
 │   │     ├─ herencia GRANT-ONLY, aditiva                               [D]
 │   │     ├─ la subcarpeta debe IGUALAR O SUPERAR al padre → no reserva [D]
 │   │     └─ conflicto: «varios roles = acceso combinado»; user/role/
 │   │        company NO documentado                                     [I]
 │   └─ Procore: público / Private + lista                               [D]
 │         ├─ privacidad del padre se propaga hacia abajo                [D]
 │         ├─ permiso del padre se propaga… Y hay que concederlo también
 │         │  en el hijo  → CONTRADICCIÓN NO RESUELTA POR EL FABRICANTE  [D]
 │         └─ atajos a lo privado: Admin de la herramienta · granular    [D]
 ▼
 GRANULAR PERMISSIONS  (Procore, tercera capa apilada)                   [D]
 ▼
 ROLE-BASED PRIVILEGES en registros concretos («Accounting Approver»)    [D]

 ── Fuera de la cadena, en ambos productos ──
 Workflow assignees / posiciones de flujo                                [D]
 Ball-in-Court (Procore; débil en ACC)                                   [D]

════════════════════════════════════════════════════════════════════════════
 PLANO 2 · SUPERFICIE DE PRODUCTO      [inventariado SIN cita de fabricante]
════════════════════════════════════════════════════════════════════════════

 DOCUMENT MANAGEMENT ─── documentos · versiones · planos · especificaciones
 COLLABORATION ───────── RFI · Submittals · Issues · Transmittals ·
                         Reviews/aprobaciones · Reuniones y actas
 QUALITY & SAFETY ────── Formularios · Inspecciones · Checklists ·
                         Punch List / observaciones de cierre
 FIELD ───────────────── Parte diario · Fotos georreferenciadas · Assets
 PROJECT CONTROLS ────── Cronograma · Costos · Órdenes de cambio ·
                         Presupuesto · Contratos · Licitación
 DESIGN / MODEL ──────── Visor · Coordinación e interferencias · Takeoff ·
                         Design Collaboration
 INSIGHT ─────────────── Informes de proyecto · Informes de CARTERA
 PLATFORM ────────────── SSO/SAML · API pública y webhooks · móvil sin
                         conexión · facturación · plano de control
```

> **La asimetría de este diagrama es el hallazgo.** El PLANO 1 se levantó con
> 14 fuentes del fabricante y 77 afirmaciones marcadas `[D]`. El PLANO 2 se
> levantó **de memoria de producto, sin una sola cita**, y solo para **decidir
> qué no copiar**. No es un benchmark auditado.

---

# 5 · DIAGRAMA B · EL MISMO ÁRBOL, CON ALEPHIA COLOCADA

**El árbol no se ha modificado para que quepamos.** Es el de arriba, con marca.

```
 ✅ existe y está verificado    🟡 existe parcial o sin probar fuera
 ❌ no existe                   ⚪ decidido deliberadamente NO adoptar

════════════════════════════════════════════════════════════════════════════
 PLANO 1 · CADENA DE AUTORIZACIÓN
════════════════════════════════════════════════════════════════════════════

 ACCOUNT / COMPANY
 │   ├─ Account Admin sin ser miembro ......................... ✅  capa 06
 │   ├─ Account Members / directorio de cuenta ................ ✅  capa 02
 │   ├─ Company Permissions Template .......................... ⚪  no aplica
 │   │       (1 instancia = 1 entidad; no hay nivel «empresa» sobre la cuenta)
 │   ├─ ROLES como objeto administrado (ACC)
 │   │     ├─ default access level ............................ ✅  capa 13
 │   │     ├─ fija productos por defecto ...................... ✅  capa 13→08
 │   │     └─ sujeto de permiso de carpeta .................... ✅  capa 05/09
 │   │           (nuestra FUNCIÓN CONTRACTUAL, derivada, no tecleada)
 │   ├─ PROJECT TEMPLATES
 │   │     ├─ carpetas ....................................... ✅  capa 14
 │   │     ├─ productos/herramientas ......................... ✅  capa 14
 │   │     ├─ MIEMBROS ...................................... ⚪  rechazado
 │   │     │        (copiar membresías = acceso sin acto con autor)
 │   │     ├─ formularios .................................... ❌  no existen
 │   │     └─ informes ...................................... ❌  no existen
 │   └─ delegación explícita de crear proyectos ............... ✅  capa 15
 │
 ▼ PROJECT
 │   ├─ Project Admin acotado a su obra ...................... ✅  capa 07
 │   ├─ Project Directory ................................... ✅  capa 03
 │   ├─ Project Permissions Template ........................ ✅  capa 13
 │   └─ TOOL ACTIVATION ..................................... ✅  capa 16
 │         └─ Documents apagable ............................. ⚪  rechazado
 ▼ PRODUCT / TOOL ACCESS por miembro ........................ ✅  capa 08
 │   ├─ quitar Docs expulsa del proyecto .................... ⚪  rechazado
 │   └─ None oculta la herramienta .......................... ✅
 ▼ RESOURCE PERMISSION
 │   ├─ seis niveles de carpeta ............................. ✅  capa 09
 │   ├─ sujetos user · company · role ....................... ✅  capa 09
 │   ├─ herencia grant-only aditiva ......................... ⚪  rechazado
 │   ├─ subcarpeta ≥ padre (no se puede reservar) ........... ⚪  rechazado
 │   ├─ regla de conflicto explicable ....................... ✅  MEJOR
 │   │        closest-wins declarado, probado y EXPLICADO en pantalla
 │   └─ contradicción de herencia de Procore ................ ⚪  no heredada
 ▼ GRANULAR PERMISSIONS (3ª capa apilada) ................... ⚪  rechazado
 ▼ ROLE-BASED PRIVILEGES en registro ........................ 🟡  parcial
          (existen posiciones de flujo AUTOR·RESPONSABLE·ADMIN, no
           privilegios por tipo de registro al estilo Procore)

 ── Fuera de la cadena ──
 Workflow assignees ......................................... ✅  capa 10
 Ball-in-Court .............................................. ✅  capa 11 · MEJOR

════════════════════════════════════════════════════════════════════════════
 PLANO 2 · SUPERFICIE DE PRODUCTO
════════════════════════════════════════════════════════════════════════════

 DOCUMENT MANAGEMENT
   documentos · versiones · estados ISO 19650 · idoneidad · emisiones .. ✅
   planos y especificaciones como objeto propio ....................... ❌
 COLLABORATION
   RFI .......... ✅   Transmittals con acuse ...... ✅
   Red Lines .... ✅   Reviews multi-paso .......... ✅
   Issues de primera clase ........................................... ⚪
        (decisión doc 23: RFI y Red Line NO se fusionan)
   Submittals ........................................................ ❌
   Reuniones y actas ................................................. ⚪
 QUALITY & SAFETY
   Formularios · Inspecciones · Checklists ........................... ❌
   Punch List / observaciones de cierre .............................. ❌
 FIELD
   Parte diario ...................................................... 🟡  esqueleto
   Fotos georreferenciadas ........................................... 🟡  tabla vacía
   Assets ............................................................ ❌
 PROJECT CONTROLS
   Cronograma ........................................................ 🟡  vía 4D
   Costos / órdenes de cambio / presupuesto / contratos .............. ❌  a reevaluar
   Licitación ........................................................ ⚪
 DESIGN / MODEL
   Visor 3D + inventario ............................................. ✅
   Coordinación e interferencias propia .............................. ⚪
   Takeoff ........................................................... ❌
 INSIGHT
   Informes de proyecto .............................................. 🟡  dashboards
   Informes de CARTERA (entre obras) ................................. ❌
 PLATFORM
   SSO/SAML · API pública · webhooks · offline · facturación ......... ❌

════════════════════════════════════════════════════════════════════════════
 LO QUE ESTÁ EN NUESTRO ÁRBOL Y NO EN EL SUYO
════════════════════════════════════════════════════════════════════════════
   4D de obra lineal con metrados y progresivas ...................... ✅
   Movimiento de tierras / topografía ................................ ✅
   AR de obra lineal ................................................. 🟡
   Función contractual derivada como sujeto de permiso ............... ✅
   Plan de entregas MIDP/TIDP ........................................ ✅
```

---

# 6 · LAS DOS FRASES

> ## El 16/16 demuestra…
>
> **…que el MODELO DE IDENTIDAD, ADMINISTRACIÓN Y AUTORIZACIÓN derivado de la
> investigación ACC/Procore está completo: sus dieciséis capas existen como
> arquitectura, se aplican en el backend y se operan desde pantalla, cada una
> con evidencia propia y sin heredar el estado de ninguna otra.**

> ## El 16/16 NO demuestra…
>
> **…que ALEPHIA tenga las herramientas de ACC/Procore, ni su amplitud
> funcional, ni su escala empresarial, ni que su experiencia resista a un
> profesional ajeno al proyecto. La matriz nunca midió eso: midió el modelo de
> autorización, que es el único plano que la investigación auditó con fuentes
> del fabricante.**

## Respuesta explícita a la pregunta 6 del encargo

**La matriz de 16 capas NO era el universo de la investigación.** Era —desde su
redacción, doc 54 del 21-ago-2026— **una matriz de control de identidad,
administración y autorización**. La amplitud funcional se investigó **aparte**,
en el doc 22, **sin citas de fabricante** y con propósito de decisión de
producto, no de comparación.

---

# 7 · VEREDICTO

```
╔════════════════════════════════════════════════════════════════════════╗
║  PARIDAD SOLO EN EL MODELO INVESTIGADO                                 ║
╚════════════════════════════════════════════════════════════════════════╝
```

**Qué queda demostrado**

- Paridad **conceptual** con ACC/Procore en identidad, administración y
  autorización — con cuatro puntos donde el modelo es superior al de ambos
  fabricantes (función contractual, closest-wins con reserva, Ball-in-Court
  como capa propia, System Operator fuera de la cadena).
- Paridad **arquitectónica** y **operativa** en las dieciséis capas de ese
  modelo, con 1077 comprobaciones y seis defectos silenciosos hallados y
  cerrados durante la propia verificación.
- Que el modelo se **opera desde pantalla**, verificado en producción.

**Qué NO queda demostrado**

- Paridad **funcional**: ALEPHIA no tiene Submittals, Formularios,
  Inspecciones, Punch List, Assets, Takeoff ni informes de cartera; campo y
  parte diario están vacíos. **Esto nunca se auditó contra el fabricante.**
- Paridad de **escala empresarial**: no hay multi-inquilino, SSO, API pública
  ni facturación. Aplazado con trigger, no resuelto.
- Paridad de **experiencia**: todas las EXP las ejecutó el propietario. Ningún
  usuario ajeno ha operado el sistema.

**Qué haría falta para poder afirmar más**

1. Un inventario del catálogo de ACC/Procore **con fuentes del fabricante**,
   equivalente al que el doc 44 hizo para permisos. Hoy no existe: sin él, la
   frase «nos falta X %» no tiene denominador.
2. El piloto externo, que es lo único que puede convertir la paridad de
   experiencia de 🟡 en ✅.
3. Decidir, herramienta por herramienta, cuáles del §7 entran y cuáles se
   marcan ⚪ definitivamente.

**La formulación que corresponde hoy**

> CDE ISO 19650 con un **modelo de identidad y autorización de nivel
> ACC/Procore, completo y verificado**, más un 4D de obra lineal que ninguno de
> los dos cubre — y con la amplitud funcional de una suite de construcción
> **todavía sin auditar y sin construir**.

---

# 8 · GAPS, ORDENADOS POR DEPENDENCIA Y RELEVANCIA

Nada de esto se implementa en esta pasada. Es la lista, no el plan.

### Bloque 0 · Sin dependencia — habilita medir

| # | gap | por qué va primero |
|---|---|---|
| **0.1** | **Inventario del catálogo ACC/Procore con fuentes de fabricante** | Sin él **ninguna** de las afirmaciones del §7 se puede cuantificar. Es la deuda de método, y es barata |
| **0.2** | **Piloto externo con un profesional ajeno** | Único convertidor posible de la paridad de experiencia. Ya está preparado (docs 77, 79) |

### Bloque 1 · Depende de que el expediente ya se mueva (Generación 1, hecha)

| # | gap | dependencia |
|---|---|---|
| **1.1** | **Submittals** | Reutiliza flujo de revisión + encargos + emisiones. **El de mayor valor contractual no construido** |
| **1.2** | **Planos y especificaciones como objeto propio** | Sobre `file_nodes`; hoy son ficheros sin semántica |
| **1.3** | **Informes de proyecto presentables** (no dashboards) | Sobre datos ya existentes |

### Bloque 2 · Depende de que la obra se mida (Generación 2, abierta)

| # | gap | dependencia |
|---|---|---|
| **2.1** | **Parte diario real** | `daily_reports` es un esqueleto |
| **2.2** | **Fotos de campo georreferenciadas** | `photo_evidences` vacía; los `tracking_pins` ya existen |
| **2.3** | **Avance desde la obra, no por importación** | `tracking_progress` vacía. Cierra el bucle del 4D |
| **2.4** | **Formularios / inspecciones / checklists** | Requiere 2.1 para tener dónde vivir |

### Bloque 3 · Depende del cierre del expediente (Generación 3)

| # | gap |
|---|---|
| **3.1** | **Punch list / observaciones de cierre** |
| **3.2** | **As-built y traspaso de activos** |

### Bloque 4 · Depende de un segundo cliente (trigger escrito, sin disparar)

| # | gap |
|---|---|
| **4.1** | **Multi-inquilino real** — hoy 1 instancia = 1 entidad |
| **4.2** | **SSO / SAML** |
| **4.3** | **Informes entre obras / cartera** |
| **4.4** | **API pública y webhooks** · **facturación** · **móvil sin conexión** |

### Fuera de lista por decisión ya tomada — no son gaps

Reuniones · licitación · chat · visor propio · detección de interferencias
propia · la parte **financiera** de costos (SIAF/INFOBRAS) · fusionar RFI con
Red Line · plantillas que copien miembros · herencia grant-only.

---

*Auditoría. Sin código, sin base de datos, sin producción. Las fuentes del
benchmark son los docs 22, 43, 44, 54, 63 y 64; el doc 80 se auditó, no se citó.*
