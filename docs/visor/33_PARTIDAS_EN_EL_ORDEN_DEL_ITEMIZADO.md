# 33 · Partidas en el orden del itemizado («como plantilla») — ANÁLISIS

26-oct-2026 · Solo análisis, sin código. Pedido del dueño: que al subir el Excel, la vista Partidas
respete su orden, como una plantilla, para ver de un vistazo qué tiene dato y qué no.

---

## 1 · Qué hace hoy y qué se pide

**Hoy.** Partidas enseña solo las partidas que **existen en el modelo**, ordenadas por código y agrupadas
por capítulo (el código sin su último tramo). Lo que está en el itemizado y no en el modelo solo
aparece contado en «qué falta».

**Se pide.** Usar el itemizado como **plantilla**: todas sus filas, en su orden, con sus títulos. Cada
partida lleva la cantidad del modelo si la tiene, y queda vacía si no. Así se ve el panorama completo:
qué está modelado y qué no.

## 2 · Medido con datos reales (Canal local, Presupuesto_Rv00 v1)

| Dato | Valor |
|---|---|
| Filas del itemizado | 1.498 |
| Títulos (sin unidad) | 200 |
| Partidas (con unidad) | 1.298 |
| Partidas con dato en el modelo de Canal | **92** (7 %) |
| Partidas del modelo fuera del itemizado | 34 |
| Sub-partidas del modelo (un nivel más) | 8 |
| Niveles de código | 1 a 5 (7 · 71 · 123 · 580 · 717 filas) |
| Tiempo de cruzar todo | 142 ms |

La conclusión importante: **en un frente, la mayor parte del itemizado de la obra estará vacía**. En
Canal, 1.206 de 1.298 partidas no tienen elementos, porque son de Drenaje o no se modelan. Una plantilla
que enseñe 1.498 filas abiertas sería ilegible. Por eso el diseño tiene que plegar lo vacío (§3).

## 3 · Cómo sería

```
Código          Partida                                         Und  Cantidad       Elem.  Sin medida
▾ 04            COMPONENTE 03 - …                        12 de 180 con dato
  ▾ 04.02       CANAL …                                   5 de 14 con dato
      04.02.01  EXCAVACIÓN …                               m³   1.240,50 m³      312      0
      04.02.02  RELLENO …                                  m³   —  (sin elementos)
      04.02.03  SOLADO …                                   m³   192,18 m³ ·crit. 150      0
        ↳ 04.02.03.08  (sub-partida del modelo)            m³   12,00 m³          8      0
  ▸ 04.03       …                                         0 de 22 con dato   (plegado)
▸ 06            DRENAJE URBANO                            0 de 640 con dato   (plegado)
── Fuera del itemizado (34) ─────────────────────────────────────────────────────────────
      06.05.99  …                                          m    …
```

- **Orden** = el del Excel, fila por fila. No se reordena por código: es la plantilla del usuario.
- **Títulos** = las filas sin unidad. Su nivel sale del número de tramos del código (01 · 01.01 ·
  01.01.01). Es el formato habitual de los presupuestos (S10 y similares), y no depende de la obra.
- **Un título no suma cantidades**, porque mezclaría m, m³ y kg. Enseña **«x de y con dato»**: es
  justo el panorama que se busca.
- **Los títulos sin ningún dato salen plegados**. Así un frente ve primero lo suyo, sin perder el resto.
- **Partida sin elementos**: fila en gris con «—». Sigue ahí, que es el punto.
- **Sub-partidas del modelo**: debajo de su ítem, sangradas.
- **Partidas del modelo fuera del itemizado**: un bloque final propio. No se pierden ni se mezclan.
- Siguen igual: clic para aislar en 3D, «medir con…», «·crit.», cobertura y «qué falta».
- Un interruptor **«solo con dato»** deja la vista compacta de hoy.

### Exportar: el mismo Excel, con el metrado del modelo

La exportación saldría en el mismo orden y con la misma forma del itemizado subido: Ítem, Descripción,
Und, **Metrado del modelo**, Elementos, Sin medida y Origen. El usuario recupera *su* plantilla con la
columna del modelo rellena, lista para comparar con su presupuesto. Es probablemente lo más útil del
cambio.

## 4 · ¿Factible, integral y escalable?

| Pregunta | Respuesta |
|---|---|
| ¿Factible? | Sí. El orden ya se guarda: el itemizado vive en Postgres como lista ordenada (migración 40) y la validación conserva el orden. **No hace falta migración ni tocar el backend.** |
| ¿Integral? | Sí. Vale para cualquier itemizado con códigos, de cualquier obra y país. La jerarquía sale de los tramos del código y de qué filas tienen unidad, no de nombres. Los códigos ya se comparan sin ceros a la izquierda (`969ba79e`). |
| ¿Escalable? | Sí. Cruzar es O(filas): 142 ms con 1.498 filas. Para dibujar, los títulos vacíos plegados mantienen pocas filas abiertas. Un itemizado de 50.000 filas (el máximo aceptado) pediría virtualizar la lista; hoy no hace falta. |
| ¿Riesgo? | Bajo. No cambia datos, cantidades ni criterios: solo cómo se ordena y agrupa lo que ya se calcula. |

**Un caso que hay que cuidar:** un itemizado cuyo Excel no tenga títulos (solo partidas). Entonces el
nivel sale solo de los tramos del código, y si tampoco hay tramos, es una lista plana en el orden del
Excel. Funciona igual, con menos estructura.

## 5 · Qué se tocaría

| Pieza | Cambio |
|---|---|
| `lib/planillaPlantilla.js` (nuevo, puro, con banco) | `plantillaDelItemizado(items, partidas, indice)` → filas en orden: títulos con nivel y «x de y», partidas con su agregado o vacías, sub-partidas debajo, y el bloque «fuera». |
| `TablaDePartidas.jsx` | Dibujar la plantilla, plegar por títulos y el interruptor «solo con dato». |
| `planillaPartidas.hojasDePartidas` | El Excel en el orden del itemizado. |

## 6 · Lo que decides tú

1. ¿La plantilla es la vista **por defecto** cuando hay itemizado, con «solo con dato» para volver a
   la compacta? Recomendado: **sí**.
2. ¿Los títulos sin dato salen **plegados**? Recomendado: **sí**.
3. ¿El Excel exportado sale **en la forma del itemizado**? Recomendado: **sí**.

## 7 · Hecho (26-oct-2026, en local, sin commit)

Decisiones del dueño: **una sola plantilla**, la pone el administrador (como hasta ahora: cargar otra
versión o quitarla cuantas veces quiera); **todo empieza desplegado**, como un Excel; la fila vacía
**solo se ve vacía** (poner el dato de Civil, Excel o a mano será otro paso); exportar en forma de
plantilla, **por decidir**; la auditoría de metrados, **después**.

- `lib/planillaPlantilla.js` (20/20): plantilla en el orden del Excel, nivel por tramos, títulos con
  «x de y con dato» por el orden, el mismo ítem con o sin ceros sumado una vez, sub-partidas debajo y
  bloque «fuera» (la tabla no lo enseña: confundía; está en «qué falta»); qué se ve (todo / plegado a mano / «solo con dato» / buscador, que también encuentra
  las partidas vacías). 50.000 filas en 186 ms.
- `TablaDePartidas.jsx`: dibuja la plantilla y solo las filas en pantalla. Una partida sin elementos se
  ve en gris, «sin elementos» (o «en sub-partidas ↓»). Cabecera «x de y partidas del itemizado con
  dato», casilla «solo con dato» y «desplegar todo».
- Probado con la tabla real sobre Canal local (13.866 elementos, 1.498 filas del itemizado): 92 de 1.298
  con dato, 34 fuera; 33 filas dibujadas de 1.541; desplazarse, «solo con dato» (173 filas), buscar
  «solado» y plegar «01», bien.
