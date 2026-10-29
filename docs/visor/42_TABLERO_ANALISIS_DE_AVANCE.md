# 42 · Tablero: qué está ejecutado, qué está proyectado y dónde puede haber problemas — MEDICIÓN Y PROPUESTA

29-oct-2026. Solo análisis, sin código. El dueño: «supongamos que quiero hacer un análisis de qué está ejecutado y
qué no, o qué está proyectado, o dónde podría haber problemas».

Medido en el banco (`localhost:5181`), con la sesión del dueño, en **Frente Drenaje Urbano** (5 modelos, 8.378
elementos). Solo lectura sobre el inventario en memoria; la pestaña se cerró al terminar. «Hoy» = 29-oct-2026.

## 1 · Qué datos de avance trae el modelo

| Parámetro (Revit) | Con dato | Valores |
|---|---:|---|
| `04_27_DSI_EjecutadoAcumulado` | 8.378 (100 %) | Sí 5.427 · No 2.951 |
| `04_25_DSI_EjecutadoActual` | 8.378 (100 %) | Sí 5.681 · No 2.697 |
| `04_26_DSI_LiberacionCalidad` | 8.378 (100 %) | Sí 232 · No 8.146 |
| `04_22_DSI_Restriccion` | 8.378 (100 %) | Sí 314 · No 8.064 |
| `EJECUTADO` (otro parámetro) | 8.305 | Sí 171 · No 8.134 |
| `04_17_DSI_InicioProgramado` / `04_19_DSI_FinProgramado` (y sus variantes 1 y 2) | **479 elementos (6 %)** | fechas `aaaammdd` |
| `04_09_DSI_MesEjecutado` | 102 | «MES ANTERIOR» 92, meses sueltos |
| `04_10_DSI_MetradoContractual` | 8.378 | **todo 0,000** |
| `04_23_DSI_Sector` | 250 (3 %) | «Sector 01»…«Sector 04», y también «Sector 3» |
| `04_29_DSI_CodigoPlaneamiento1/2/3` | 3.794 | códigos `PQ08_xxxxx` (actividades del cronograma) |

## 2 · Lo que dicen al cruzarlos (reglas fijas, sin IA)

**Ejecutado**

1. **5.427 elementos ejecutados (65 %)** según el acumulado; 2.951 sin ejecutar.
2. **De lo ejecutado, solo 227 tienen liberación de calidad (4 %).** **5.200 están ejecutados sin liberar.** Para
   valorizar, este es el hallazgo más grande.
3. **De lo ejecutado, 3.665 cuentan para el metrado del itemizado**:
   - 3.219 con partida;
   - 446 con sub-partida.

   El resto se ejecutó pero **no entra en la valorización** tal como está modelado:
   - 1.140 con partida fuera del itemizado;
   - **622 sin partida**.

**Incoherencias que habría que corregir en el modelo**

4. **254 elementos** tienen «ejecutado actual = Sí» y «ejecutado acumulado = No». Lo del periodo debería estar dentro
   del acumulado.
5. **5 elementos liberados sin estar ejecutados.**
6. **Dos parámetros dicen cosas distintas sobre lo mismo**: `EJECUTADO` marca 171, y `04_27` marca 5.427. No
   coinciden en 5.198 elementos. La obra tiene que decidir cuál vale.
7. **Restricción**: 314 elementos la tienen, y **307 de ellos ya están ejecutados**. O la restricción no se quitó al
   resolverse, o se ejecutó con restricción. Hay que revisarlo.

**Proyectado**

8. **Solo 479 elementos (6 %) tienen fecha programada en el modelo.** La programación no vive en el modelo.
   - Hay **3.794 elementos con código de actividad** (`PQ08_…`), que es el puente hacia el cronograma.
9. **30 elementos con la fecha de fin ya pasada y sin ejecutar**:
   - 15 debían terminar en mayo de 2026;
   - 8 en junio de 2026;
   - 4 en abril de 2026;
   - 1 en mayo de 2025;
   - 2 tienen una fecha inválida («0»).
10. **189 elementos tienen fecha de fin sin fecha de inicio.**

**Otros**

11. **El metrado contractual del modelo está a cero en todos los elementos.** La comparación con el expediente tiene
    que hacerse con el itemizado de la Planilla, no con ese parámetro.
12. **El sector está en solo el 3 %** de los elementos, y escrito de dos formas («Sector 3» y «Sector 03»). Hoy no sirve
    para agrupar el avance por sector.

## 3 · Cómo se vería en el Tablero: plantilla «Avance de obra»

Una plantilla que se arma con un clic. Son criterios de la obra, guardados con el tablero y no fijos en el código.
Usa lo que ya hay: Chart.js, tarjetas S/M/L y colores de la paleta (doc 41).

| Tarjeta | Tipo | Responde |
|---|---|---|
| Ejecutado acumulado | Cifra con barra (5.427 de 8.378) | ¿Cuánto llevamos? |
| Ejecutado sin liberar | Cifra en rojo (5.200) | ¿Qué falta liberar para valorizar? |
| Avance por capítulo del itemizado | Barras apiladas: ejecutado y liberado / ejecutado sin liberar / sin ejecutar | ¿Dónde va bien y dónde no? |
| Ejecutado que no entra en la valorización | Barras: fuera del itemizado 1.140 · sin partida 622 | ¿Qué se hizo y no se cobra? |
| Vencido sin ejecutar | Tabla por mes de fin programado (30) | ¿Qué está atrasado? |
| **Problemas de datos** | Lista con su regla y su número: 254 · 5 · 5.198 · 307 · 189 · 2 | ¿Qué hay que corregir en Revit antes de confiar en el avance? |

Cada barra o fila aísla sus elementos en el 3D. Cada problema dice su regla, por ejemplo: «ejecutado actual = Sí y
acumulado = No: lo del periodo debe estar en el acumulado».

**Lo que necesita y hoy no hay** (para el doc 40):
- el **estado combinado** de cada elemento: «ejecutado y liberado / ejecutado sin liberar / sin ejecutar / con
  restricción». Sería un campo derivado, como «Estado frente al itemizado»;
- las **cantidades** (no solo elementos), para hablar de m³ ejecutados y no de piezas. Esas cantidades las tiene la
  Planilla: es la fuente «Partidas» del doc 40.

## 4 · Decisiones del dueño

1. **¿Qué parámetro vale como «ejecutado»?** ¿`04_27_DSI_EjecutadoAcumulado` o `EJECUTADO`? Hoy dicen cosas distintas.
2. **¿Lo ejecutado sin liberación de calidad se valoriza?** De eso depende si «ejecutado» significa «ejecutado» o
   «liberado».
3. **¿El cronograma sale del modelo o del programa de obra?** En el modelo solo el 6 % tiene fechas. El puente serían
   los códigos `PQ08_…`, que es lo que lee PREDICT.
4. ¿Armo la plantilla «Avance de obra» del §3 en local, sobre el rediseño del doc 41?
