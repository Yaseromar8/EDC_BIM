# 39 · Auditoría de metrados: qué revisar antes de confiar en una cantidad — INVESTIGACIÓN Y MEDICIÓN

28-oct-2026. Solo investigación y medición, sin código en el producto. El dueño pidió investigaciones para mejorar
Docs y View; la auditoría de metrados le interesaba «para los revisores» (doc 33). Sin IA: solo reglas explicadas
sobre los datos del modelo.

## 1 · Qué hacen los referentes

| Producto | Qué revisa | Cómo |
|---|---|---|
| **Solibri** | Piezas duplicadas o escondidas | Dos piezas son duplicadas si sus cajas están una dentro de la otra y su volumen difiere menos del 10 %, o si su intersección es casi todo su volumen. Es un error crítico; se queda una y se descarta la otra. Se filtra por disciplina, nivel o tipo. |
| **ACC / Autodesk Docs** | Qué cambió entre dos versiones | Lista de cambios en tres grupos: añadidos, quitados y modificados (forma, posición o propiedades). Se exporta a CSV. La API Model Properties da el detalle por elemento; el total por cantidad lo suma uno. |
| **Navisworks Quantification** | Qué cómputos cambiaron | Al actualizar el modelo, avisa de cada dato de cómputo cambiado y de qué tipo fue el cambio, para aprobarlo o no. |

Lo común: **(1) piezas que se cuentan dos veces** y **(2) qué cantidad se movió entre versiones y por qué**.

## 2 · Medido en los modelos del dueño

Banco local `localhost:5181`, con su sesión, **Frente Drenaje Urbano**: 5 modelos, 8.446 elementos. Solo lectura; la
pestaña se cerró al terminar.

### 2.1 · Duplicados (regla tipo Solibri, simplificada: misma categoría y misma caja ±5 mm)

| Dónde | Grupos | Piezas de más | ¿Llevan partida en las dos? |
|---|---:|---:|---|
| Entre `…-EXCAVACIONES` y `…-ENCOFRADOS` | 1.634 | ~1.697 | **No** (0 de 30 revisados): muros auxiliares sin código ni tipo. No suman en la Planilla. |
| Entre tres modelos (`Masa 1`) | 1 | 2 | No |
| **Dentro de un mismo modelo** | **59** | **59** | **4 sí** |

Los **4 que sí cuentan dos veces** en la Planilla:

| Modelo | Piezas | Partida | Qué es |
|---|---|---|---|
| ST-011242 | Barra de armadura 3114881 y 3114882 (Ø5/8") | 06.01.03.03 | Dos barras iguales, ids seguidos |
| ST-011242 | Barra de armadura 3097841 y 3097843 (Ø1/2") | 06.01.03.03 | Ídem |
| HD-011259 | Barra de armadura 6908685 y 6908686 (Ø1/2") | 06.05.01.03.03 | Ídem |
| HD-011264-EXCAVACIONES | Suelo 6218152 (14,59 m², 2,918 m³) y 6763314 (17,47 m², 3,493 m³) | 06.09.02.05.01 | Dos pavimentos en la misma caja: uno tapa al otro |

Es el mismo patrón que los **codos duplicados de Interferencias** del 26-oct (8 codos en 4 parejas de ids seguidos).
Las otras 55 parejas del mismo modelo no tienen partida en las dos piezas: no afectan al metrado, pero son ruido del
modelo.

### 2.2 · Lo que ya mide la Planilla y se reutiliza

- Partida **sin medida** («medir con…»).
- Código **fuera del itemizado**.
- Unidad distinta a la del itemizado.
- Cantidad **escrita a mano distinta de la nativa** (columna «manual»). Ejemplo del banco de pruebas: losa con nativo
  1,416 y manual 1,522 m³.

### 2.3 · Lo que aporta el doc 38: la geometría contra el parámetro

En suelos, Revit da «Volumen» = Área × Grosor nominal, y el sólido dibujado puede ser otro: 17 de 563 suelos se
desvían más del 5 %. Para un revisor es una alerta útil: **«el volumen declarado no coincide con lo dibujado»**.

### 2.4 · Comparar versiones con datos propios

El inventario ya guarda los elementos **por versión**: `inventory_identity_b1.snapshots` (una por versión publicada)
y `occurrences` (elementos con sus propiedades, por versión). Se puede comparar sin la API de Autodesk:
añadidos / quitados / con cantidad cambiada, **por partida**.

**Falta comprobar en producción** cuántas versiones anteriores hay guardadas por modelo. Si solo queda la última,
la comparación empieza a funcionar desde la siguiente publicación.

## 3 · Propuesta: un panel «Auditoría» en la Planilla (sin hacer)

Seis reglas, todas explicables y sin IA. Cada hallazgo se puede **aislar en el 3D** y **marcar como revisado**.

| # | Regla | De dónde sale | Severidad |
|---|---|---|---|
| A1 | **Duplicado**: misma categoría, misma caja (±5 mm) y volumen ±10 %, en el mismo modelo, con partida en ambas | Geometría del visor (§2.1) | Alta: cuenta dos veces |
| A2 | **Partida sin medida** | Ya existe | Alta |
| A3 | **Código fuera del itemizado / unidad distinta** | Ya existe | Media |
| A4 | **Manual ≠ nativo** más de un X % (lo fija la obra) | Ya existe el dato | Media |
| A5 | **Declarado ≠ dibujado** más de un X % (volumen de la geometría, doc 38) | Geometría del visor | Media |
| A6 | **Cambios desde la versión anterior**: por partida, cuánto subió o bajó y qué elementos lo explican | Inventario por versión (§2.4) | Informativa: el revisor aprueba o pregunta |

Detalles:
- El umbral de A4 y A5 lo pone la obra, como los criterios: nada fijo en el código.
- A1 se calcula en el visor con los modelos cargados, en menos de un segundo para 8.446 elementos.
- **Revisado** con el nombre del revisor y la versión del modelo. Si la versión cambia, vuelve a «por revisar». Encaja
  con las observaciones del ECD (doc 34): un hallazgo puede convertirse en observación para el modelador.

## 4 · Por qué es nuestro y no una copia

- Solibri revisa el modelo; ACC compara versiones; Navisworks compara cómputos. Ninguno lo hace **sobre el itemizado
  de la obra**, partida por partida, con la medida nativa mandando y el criterio de la obra a la vista.
- Para obra pública peruana, el revisor no necesita «el modelo está bien», sino **«este metrado de esta partida es
  confiable para valorizar, y esto es lo que cambió desde la última versión»**.

## 5 · Decisiones del dueño

1. ¿Panel **«Auditoría»** en la Planilla con las reglas A1–A6? ¿Con todas, o en qué orden?
2. A1 (duplicados): ¿solo los que tienen partida en las dos piezas (los que cuentan dos veces), o también el ruido sin
   partida?
3. ¿El **«revisado»** se guarda en el servidor (con nombre y versión), o basta con verlo al momento?
4. Comprobar en producción cuántas **versiones** de inventario se guardan (§2.4), para saber si A6 funciona ya.

## Fuentes

- Solibri: [General Intersection Rule (duplicados)](https://help.solibri.com/hc/en-us/articles/1500004738042)
- Solibri: [Model Checker v8](https://www.solibri.com/articles/solibri-model-checker-v8-brings-bim-model-quality-into-focus-with-its-powerful-rules-based-checking-and-auditing-tool)
- Autodesk: [Comparing Versions of a Revit Design](https://help.autodesk.com/cloudhelp/ENU/BIM-360Team/files/GUID-EF7ABDC0-1BE9-47AD-AC1C-998247093778.htm)
- Arkance: [Compare 3D models in BIM 360 Docs](https://ukcommunity.arkance.world/hc/en-us/articles/21546834569874-Compare-3D-models-in-BIM360-Docs-October-Update)
- APS: [Find model difference with the Model Properties API](https://aps.autodesk.com/blog/find-model-difference-model-properties-api) y [ejemplo en GitHub](https://github.com/autodesk-platform-services/aps-model.properties-versions.difference)
- Autodesk Navisworks: [Analyze changes](https://help.autodesk.com/cloudhelp/2020/ENU/Navisworks/files/GUID-C72C0B43-D464-484C-B83C-341257CF0B29.htm)
- AUGI: [Navisworks Takes Off](https://augi.com/articles/detail/navisworks-takes-off)
