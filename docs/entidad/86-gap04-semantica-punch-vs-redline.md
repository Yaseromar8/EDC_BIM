# 86 · GAP 04 · SEMÁNTICA — Punch vs Red Line

**Fecha:** 25-ago-2026 · **Naturaleza:** análisis semántico. **No se programó nada.**
**Contra:** la definición histórica de Red Line (docs 22, 23, `flujo_de_redline.py`)
y el benchmark de Punch/Observations (doc 82 §4.3).

---

# 1 · AUDITORÍA DEL RED LINE — lo que PROMETIMOS que era

No lo que hace el código hoy: lo que quedó **declarado**.

| eje | definición histórica |
|---|---|
| **Propósito** | **REGISTRO DE LOS CROQUIS DE MODIFICACIÓN DEL PROYECTO**: qué se cambió respecto a lo proyectado, en qué croquis numerado y firmado consta, y si la modificación quedó aceptada |
| **Origen** | Los 33 registros reales: `RL_0004_…-RL-**SKT**-P08-0004…pdf` — **SKT = sketch**. Títulos como `Reubicar_BP-04_Y_CAMBIO_DE_COTA_BP-01`, `REFUERZO_EN_ABERTURAS` |
| **Estados** | `Emitido · En revisión · Respondido · Cerrado`. **Los 33 históricos: `Cerrado` 33, y nada más** — nacen y mueren cerrados |
| **Autoridad** | Posiciones del flujo: `AUTOR · RESPONSABLE · ADMIN`. El veredicto lo dicta el RESPONSABLE |
| **Responsable** | `responsable_id` estructurado (desde el rediseño); los 33 heredados lo tienen en texto |
| **Cierre** | El veredicto **acepta o rechaza LA MODIFICACIÓN DEL PROYECTO**. El sufijo `_RL_OK` marca los aprobados. **Cerrado es terminal**: no se reabre |
| **Adjuntos** | El croquis firmado. **Es el objeto, no la prueba** |
| **Vínculo a plano** | Ninguno estructurado hasta GAP 02. El croquis *es* el documento |
| **Relación con modificación** | **ES la modificación.** Su razón de ser |
| **Relación con RFI** | Misma FAMILIA (registro numerado con veredicto) y **semántica distinta**: el RFI acepta o rechaza *la respuesta a una consulta*; el Red Line, *la modificación del proyecto*. Declaradas aparte a propósito, y `ensayo_de_desacople` lo vigila |
| **Relación con no conformidades** | **NINGUNA.** Textual: *«NO es una observación, ni un defecto, ni un markup gráfico»* |

## 1.1 · La decisión que ya se tomó, y que hay que respetar

> *«Se evaluó expresamente si `doc_redlines` debía evolucionar hacia un Issue
> documental y la respuesta fue NO: convertirlo habría destruido un registro real
> de 33 documentos formales. **El Issue como objeto propio queda DIFERIDO** —no
> inexistente, ni sustituido por otra cosa.»*

Y el doc 23, aceptado el 20-ago-2026, ya dibujó la arquitectura correcta:

```
                MOTOR DE ENCARGO            ← lo único que se comparte
      (responsable · plazo · ball-in-court · aviso · cierre)
                        │
   REVIEW    RFI    ISSUE/OBSERVACIÓN    TRANSMITTAL    SUBMITTAL
```

con esta línea, que es la que decide todo lo de abajo:

| objeto | lo que NO comparte con los demás |
|---|---|
| **Issue / Observación** | **Ubicación** (elemento del modelo, plano, progresiva), **tipo**, y **cierre por verificación** |

**«Cierre por verificación» es exactamente el `Ready to Close` + `Final Approver`
del Punch.** La arquitectura ya lo había previsto; solo estaba diferida.

---

# 2 · CONTRATO MÍNIMO DE PUNCH, desde el benchmark (doc 82 §4.3)

| capacidad | Procore [D] |
|---|---|
| Ubicación | ligado a **planos y fotos**, y a `Locations` |
| Plano / revisión | los ítems se clavan en una posición del plano |
| Descripción · tipo | Observations: `quality · safety · commissioning · warranty · work to complete` |
| Responsable | `assignees` |
| Fecha límite | due date **con aviso automático de vencido** |
| Estado | `Draft · Open · In Dispute · Ready to Close · Closed` |
| Evidencia fotográfica | adjuntos y fotos |
| Respuesta del responsable | responde y completa desde móvil |
| **Ready to Close** | el responsable **declara** que corrigió |
| **Aprobación final** | **`Final Approvers`** autorizan el cierre |
| Historial | «real-time history of all actions» |
| BIC | implícito en el assignee |
| Exportabilidad | PDF/CSV del punch log |

## 2.1 · Las tres cosas que el Punch separa y el Red Line no

```
DEFECTO DETECTADO      alguien constata que algo está mal
        ≠
CORRECCIÓN EJECUTADA   el responsable dice que lo arregló   ← Ready to Close
        ≠
APROBACIÓN DEL CIERRE  otro verifica y lo da por bueno      ← Final Approver
```

En el Red Line **estas tres son una sola**: el responsable dicta el veredicto y
el registro queda cerrado. No hay un tercero que verifique.

---

# 3 · MATRIZ SEMÁNTICA

| | **RED LINE** | **PUNCH** |
|---|:-:|:-:|
| nace durante ejecución | **SÍ** | no |
| nace en cierre / recepción | no | **SÍ** |
| exige ubicación | no *(el croquis la lleva dentro)* | **SÍ** |
| exige plano | el croquis **es** el documento | **SÍ**, y una revisión concreta |
| tiene responsable | SÍ | SÍ |
| tiene plazo | SÍ | SÍ |
| requiere evidencia de corrección | **no** | **SÍ** |
| tiene Ready to Close | **no** | **SÍ** |
| tiene Final Approver | **no** | **SÍ** |
| puede reabrirse | **no** *(Cerrado es terminal)* | **SÍ** *(rechazo → reabierto)* |
| modifica diseño | **SÍ — es su razón de ser** | no |
| constata defecto | **no — declarado expresamente** | **SÍ** |
| autoriza recepción | no | **SÍ** |

**Coinciden en 2 de 13.** Y las dos que coinciden —responsable y plazo— son
justamente lo que el **motor de encargo** ya comparte con todos los objetos del
producto. No son parecido semántico: son infraestructura común.

---

# 4 · VEREDICTO

```
╔════════════════════════════════════════════════════════════════════════╗
║  C · AMBOS DEBERÍAN APOYARSE EN UN ISSUE COMÚN                         ║
║      y eso activa anticipadamente GAP 11                               ║
╚════════════════════════════════════════════════════════════════════════╝
```

**Por qué NO es A** (Punch como especialización de Red Line): el Red Line está
declarado como *modificación del proyecto* y expresamente *no* como defecto.
Meter el punch dentro sería reabrir una decisión ya tomada y contaminar 33
registros formales cuya historia está congelada.

**Por qué NO es B** (Punch como objeto propio y ya): porque dejaría **tres
objetos con el mismo ciclo de vida y ninguno compartido**:

```
no conformidad de protocolo   detectada en ejecución  → corregir → verificar
punch de recepción            detectada en cierre     → corregir → verificar
observación de calidad        detectada en cualquier  → corregir → verificar
                                        momento
```

Construir el Punch aparte resolvería GAP 04 y dejaría los otros dos sin sitio —
y en la siguiente pasada habría que unificarlos con datos ya escritos, que es la
migración que este proyecto lleva evitando desde el principio.

**Por qué SÍ es C:** el criterio que fijaste es *«ciclo de vida distinto →
separar; misma semántica profesional → reutilizar»*. Las tres cosas de arriba
tienen **el mismo ciclo de vida** —detectar, corregir, verificar— y el Red Line
tiene **otro**. La línea de corte no pasa entre Punch y Red Line: pasa entre
**modificar el proyecto** y **constatar un defecto**.

Es además la arquitectura que el doc 23 ya declaró y difirió, y lo que hace el
fabricante: en Forma, Punch y Observations **viven dentro de Issues** con tipos
y categorías configurables.

---

# 5 · DEPENDENCIA NUEVA

```
DEPENDENCIA NUEVA:
GAP 04 requiere adelantar PARCIALMENTE GAP 11
```

**Lo que hace falta de GAP 11 para poder hacer GAP 04** — el mínimo, no el gap
entero:

| pieza | ¿hace falta ahora? |
|---|---|
| Objeto `ISSUE` con identidad y numeración propias | **SÍ** |
| `tipo` de lista cerrada (`punch`, `no conformidad`, `calidad`, `seguridad`) | **SÍ** |
| Ubicación: anclaje a plano+revisión (GAP 02) y progresiva | **SÍ** |
| Ciclo `Abierto → Corregido → Verificado / Reabierto` con evidencia | **SÍ** |
| Responsable + plazo + BIC (motor de encargo) | **SÍ** — ya existe |
| **Campos personalizados por tipo** | no |
| **Causa raíz y su analítica** | no |
| **Estados configurables por obra** | no |

Los tres últimos son lo que hace a GAP 11 *grande*, y **siguen diferidos**.

## 5.1 · Y un defecto mío que esto destapa

**GAP 03 escala las no conformidades a `REDLINE`**, y el Red Line está declarado
como *modificación del proyecto*, no como defecto. Lo elegí por reutilizar el
objeto de observación que creí que teníamos; la auditoría de este documento
demuestra que ese objeto **no era el Red Line**.

No lo toco ahora —GAP 03 está cerrado y funciona—, pero **queda anotado como
deuda semántica**: cuando exista el `ISSUE`, el escalado del protocolo debe
apuntar ahí, y los Red Lines que la EXP creó (RL-001…RL-006, todos de prueba en
la obra piloto) se migran o se anulan. No hay ningún Red Line **real** afectado:
los 33 históricos están cerrados y ninguno vino de un protocolo.

---

# 6 · LO QUE NO HAGO

- **No construyo un «Issue genérico» escondido dentro de Punch.** Es
  exactamente lo que pediste evitar, y sería la misma trampa que meter el punch
  dentro del Red Line, solo que al revés.
- **No implemento GAP 04 hasta que decidas** si se adelanta GAP 11 parcial.
- **No toco la lógica condicional de ítems** (delta conocido de GAP 03): GAP 04
  no la necesita.

**Me detengo aquí y espero tu decisión**, que es lo que corresponde según el
punto 4 de tu encargo.

---

*Análisis semántico. Sin código, sin esquema, sin producción.*
