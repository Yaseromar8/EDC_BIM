# 29 · El minicerebro de la Planilla · diseño (25-oct-2026)

SOLO DISEÑO, sin código. Pedido del propietario: «¿se podría hacer un minicerebro? Diseñar».
Reúne en una sola pieza lo investigado en los docs 24-28.

**Qué es:** un **razonador de reglas con memoria y explicación**, la técnica de los «sistemas
expertos». **No es IA ni aprendizaje automático**: no adivina, no inventa cifras y no aprende
solo. Cada conclusión sale de reglas escritas aplicadas a los datos de la obra, lleva su porqué
en números, y lo que el usuario confirma se guarda como regla de la obra.

---

## 1 · Las cuatro partes

```
   HECHOS                REGLAS                 MEMORIA DE LA OBRA
  (lo que hay)        (cómo se razona)         (lo que tú confirmaste)
      │                     │                          │
      └──────────────┬──────┴──────────────────────────┘
                     ▼
                  MOTOR  ── por capas, cada una usa lo que concluyeron las anteriores
                     │
                     ▼
               CONCLUSIONES  (cada una con su porqué, sus elementos y sus acciones)
                     │
     ┌───────────────┼──────────────────────┬──────────────────────┐
     ▼               ▼                      ▼                      ▼
  Planilla      Campos derivados      Panel «Revisión»          Excel
 (partidas,     (Filters: filtrar,    (hallazgos, preguntas,   (con hoja de
  cobertura)     colorear, vistas)     memoria)                 «por qué»)
```

### 1.1 · Hechos: lo que hay, sin interpretar
- Los **elementos** extraídos (Postgres → inventario en memoria), con su tipo de Revit (familia + tipo), su
  categoría y su geometría nativa (longitud, área, volumen, barras).
- El **itemizado vigente** de la obra (sql/40), con su versión.
- Las **versiones anteriores** del inventario (`occurrences` por versión, doc 25 §2), para comparar.
- Opcional: el **metrado del expediente** (4.ª columna, doc 25 P6).

### 1.2 · Reglas: cómo se razona, escritas como datos
Cada regla es una ficha:

| Campo | Ejemplo (R1, consenso por tipo) |
|---|---|
| `id` y versión | `consenso-tipo` v1 |
| capa | 3 · coherencia |
| qué mira | elementos del mismo tipo de Revit con partida |
| condición | una partida reúne ≥ 90 % del tipo y el tipo tiene ≥ 10 elementos |
| conclusión | los que tienen otra partida son **sospechosos**; los que no tienen, **sugerencia** |
| porqué (plantilla) | «{n} de {total} elementos del tipo {tipo} tienen {partida}; estos {m} tienen {otra}» |
| umbrales | 90 % y 10, **cambiables por obra** y enseñados en pantalla |
| severidad | aviso |

Las reglas se ordenan en **capas**. Cada capa solo usa los hechos y lo que concluyeron las capas
anteriores, así el razonamiento es una cadena que se puede seguir:

| Capa | Reglas | Pregunta que responde |
|---|---|---|
| 1 · Lectura | columnas del Excel; qué parámetro es código, descripción o unidad (doc 24) | ¿dónde están las partidas en este modelo? |
| 2 · Ubicación | exacto / sub-partida / fuera; mandan los oficiales | ¿qué partida tiene cada elemento? |
| 3 · Coherencia | **R1** consenso por tipo; **R4** unidad frente a geometría; código y descripción que no casan (⚠) | ¿qué parece estar mal? |
| 4 · Sugerencia | **R2** por descripción cuando falta el código | ¿qué le falta y qué podría ser? |
| 5 · Contraste | **R5** frente al expediente; **R6** frente a la versión anterior | ¿cuadra?, ¿qué cambió y por qué? |

### 1.3 · Memoria de la obra: lo confirmado manda
Las decisiones del usuario, guardadas por obra y versionadas:
- «este parámetro es el código» (cuando salió «por confirmar»);
- «esta unidad distinta está bien»;
- «esta descripción del modelo es el ítem X»;
- «este tipo va a esta partida»;
- «este hallazgo no es error: no volver a preguntar».

**La memoria va antes que las reglas.** Cada decisión dice quién y cuándo, y se puede **deshacer**. Es el
«aprender del usuario» del doc 24 §8, hecho explícito: se ve, se audita y se borra.

### 1.4 · Conclusiones: lo que el cerebro dice
Cada conclusión es una ficha con:
- **tipo**:
  - *dato* (p. ej. la partida de un elemento);
  - *hallazgo* (algo que parece estar mal);
  - *sugerencia* (algo que podría ser);
  - *pregunta* (algo que solo tú puedes decidir);
- **frase con cifras** («12 de 240…»), nunca un porcentaje de «confianza» inventado;
- **por qué**: la cadena de reglas y hechos que llevó ahí, desplegable;
- **impacto**: elementos y cantidad afectada (para ordenar por lo que más pesa en el metrado);
- **acciones**: *Ver en 3D* (aislamiento momentáneo), *Confirmar*, *Descartar*. Las dos últimas pasan a la
  memoria.

---

## 2 · El motor

- **Por capas y en orden.** Sin bucles ni reglas que se contradigan en silencio. Si dos reglas chocan,
  gana la memoria, y si no hay memoria, sale una **pregunta**.
- **Incremental.** Recalcula solo si cambia algo de lo que depende:
  - revisión del inventario;
  - huella del itemizado;
  - versión de la memoria;
  - versión de las reglas.

  Si no cambió nada, se reutiliza lo anterior.
- **Tiempo:**
  - la capa 1 hoy cuesta ~1,3 s en el peor caso medido (14.000 × 330), y las capas 2-3 son lineales
    (decenas de ms medidos);
  - objetivo: **< 2 s** en total para una obra grande;
  - si se nota en el modelo real, el motor pasa **a segundo plano** sin congelar la pantalla.
- **Puro y probado.** Funciones sin pantalla ni red, con un banco por capa y casos reales anonimizados del
  Canal y Drenaje.
- **Portable.** Como son funciones puras, el mismo motor puede correr en el servidor cuando haga falta:
  varias obras, cortes congelados, informes nocturnos.

---

## 3 · Dónde se ve

### 3.1 · Panel «Revisión» en la Planilla (tercera vista, junto a Elementos y Partidas)

```
 Revisión · PQT8 Canal · itemizado v2 · 13.866 elementos            [reglas ⚙]
 ─────────────────────────────────────────────────────────────────────────────
 HALLAZGOS (7)                                         ordenados por impacto
  ⚠ 12 de 240 «Muro básico · Concreto 25 cm» tienen 05.15.04.02;
     los otros 228, 05.15.04.01 · 84 m³          [Ver en 3D] [Confirmar] [Descartar]
     › por qué
  ⚠ 31 tuberías en «und» miden más de 6 m: ¿no van en m? · 06.02.01.03.05   [...]
 PREGUNTAS (3)
  ? La línea 2 sale «por confirmar»: ¿«Datos::CodigoDePartida2» es el código?  [Sí] [No]
  ? «TUBERIA HDPE DN 1500» coincide en 6 de 7 palabras con 06.02.01.03.05      [Es esa] [No]
 MEMORIA DE LA OBRA (5 decisiones)
  ✓ «und» en buzones está bien · Ana, 25-oct                                  [deshacer]
```

### 3.2 · En el resto del visor
- **Campos derivados nuevos para Filters**: «Planilla › Revisión» (sin hallazgos / con aviso / pendiente).
  Colorear el modelo por eso es ver de un vistazo dónde está mal parametrizado.
- **Excel**: una hoja «Por qué» con cada hallazgo, su regla y sus elementos.

---

## 4 · Dónde se guarda

- **Nada nuevo** para las fases sin memoria: hechos y reglas ya están; las conclusiones se calculan.
- **Migración 41 · `planilla_memoria`** (aditiva, con su rollback, como la 40). Una fila por decisión:
  - obra, tipo de decisión, a qué se refiere y valor;
  - versión del itemizado en que se tomó;
  - quién, cuándo, y si se retiró.

  Seguridad como la 40: guardia de obra; confirmar y deshacer, por defecto solo el administrador de la
  obra (tú decides si también los editores).
- **Las reglas y sus umbrales**: primero en el código, como fichas con versión. Después, si se quiere
  cambiarlas por obra, en la misma memoria («en esta obra, consenso ≥ 85 %»).

---

## 5 · Fases

| Fase | Qué | Guarda algo | Necesita |
|---|---|---|---|
| **C1** | Motor por capas + registro de reglas + **R1** y **R4** + panel Revisión (solo hallazgos y Ver en 3D) | no | — |
| **C2** | **Memoria** (migración 41) + preguntas (por confirmar, unidad distinta) + Confirmar / Descartar / Deshacer + **R2** | sí | tu OK a la migración |
| **C3** | **R5** (expediente) y **R6** (versiones); motor en segundo plano si hace falta; campo «Planilla › Revisión» en Filters | no | decisión de la 4.ª columna |
| **C4** | Umbrales por obra; llevar la memoria de una obra a otra como plantilla | sí | — |

**C1 ya da valor solo**: encuentra errores reales de parametrización con datos que ya hay, sin guardar
nada.

---

## 6 · Límites, dichos

- No entiende el proyecto: solo ve lo que está en los datos. Un tipo entero mal parametrizado no lo
  detecta R1 (no hay mayoría contra la que comparar); para eso está R5, el contraste con el expediente.
- Una sugerencia por palabras puede equivocarse: por eso siempre enseña la cifra y nunca se aplica sola.
- La memoria es tan buena como lo que se confirma: por eso dice quién y cuándo, y se deshace.

## 7 · Decisiones del propietario

1. ¿Este diseño, con el nombre que prefieras («Revisión», «Cerebro de la obra»…)?
2. ¿Empezamos por C1?
3. Para C2: ¿quién puede confirmar, solo administradores o también editores?
