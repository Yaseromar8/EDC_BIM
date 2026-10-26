# 28 · Planilla más razonadora, sin IA (25-oct-2026)

SOLO ANÁLISIS. Pregunta del propietario: «¿hay forma de hacerlo más inteligente, razonador?».

Regla que se mantiene: **nada de IA** (docs/visor/26). «Razonar» aquí significa tres cosas:
1. **más reglas fijas** que cruzan los datos que ya tenemos;
2. **cada conclusión con su porqué** en números;
3. **lo que el usuario confirma se recuerda** y se vuelve regla de la obra.

Nada se escribe en el modelo ni en los totales sin un clic humano.

## Hoy razona así (doc 24 §9-12, doc 27)

Lee el Excel → deduce dónde están los códigos → ubica cada código (exacto / sub-partida / fuera) →
mandan la descripción y la unidad oficiales → mide con la geometría de Revit → estado y capítulo.
**Solo mira códigos.** No compara a un elemento con sus parecidos, no aprende de lo que corriges y no
contrasta la unidad con la geometría.

## Lo que lo haría más razonador, en orden de valor

### R1 · Consenso por tipo: detecta errores de parametrización
Los elementos del **mismo tipo de Revit** (familia + tipo) casi siempre llevan la misma partida. Si el 95 %
de «Muro básico · Concreto 25 cm» tiene `05.15.04.01` y 12 tienen otra cosa, esos 12 son **sospechosos**.

La Planilla lo dice así: *«12 de 240 elementos del tipo X tienen 05.15.04.02; los otros 228, 05.15.04.01»*,
y se pueden aislar para revisarlos. Lo mismo con los elementos de ese tipo que no tienen partida: *«el 98 %
de su tipo tiene 05.15.04.01»*.

Es la revisión que hoy hace el coordinador a ojo. Regla fija: mayoría de al menos 90 % y al menos 10
elementos del tipo.

### R2 · Sugerencias cuando falta el código (por descripción, confirmables)
Si un elemento trae la descripción y no el código, se busca en el itemizado por las **palabras**:
- sin tildes, mayúsculas ni palabras vacías;
- con números y diámetros exactos.

La sugerencia trae su cifra: *«“TUBERIA HDPE DN 1500” coincide en 6 de 7 palabras con 06.02.01.03.05»*.
No se asigna sola. Tú confirmas y queda como regla.

### R3 · La memoria de la obra: lo confirmado se recuerda
Se guardan, junto al itemizado de la obra y con versiones, las decisiones que tomas:
- «este parámetro es el código» (cuando salió «por confirmar»);
- «esta unidad distinta está bien»;
- «esta descripción del modelo es el ítem X» (R2);
- «este tipo va a esta partida».

La próxima vez se aplican primero, y se enseña *«regla confirmada por Ana el 25-oct»*. Es el
«aprender del usuario» sin aprendizaje automático: memoria explícita, que se ve y se puede borrar.

### R4 · La unidad contra la geometría
Para cada partida, ¿la unidad oficial tiene sentido con lo que es el elemento?
- **m³ sin Volumen** en el modelo → no se puede medir y se dice por qué.
- **«und» en elementos lineales largos** (tuberías de 40 m) → *«¿no debería ir en m?»*.
- **kg en algo que no es barra** → aviso.

Las reglas van en una tabla escrita (categoría de Revit → unidades esperables) que se enseña y se puede
cambiar por obra.

### R5 · Contraste con el metrado del expediente (doc 25, P6)
Si el Excel trae el metrado contractual: *«modelo 1.240 m³ frente a expediente 1.180 m³ (+5 %)»*, y las
partidas que se salen más de un umbral se marcan.

### R6 · Qué cambió entre versiones (doc 25, P4)
*«La partida 05.15.04.01 subió 38 m³ porque entraron 6 losas nuevas y 2 cambiaron de espesor»*, con esos
elementos en el 3D.

## Recomendación

1. **R1 + R4.** Solo leen datos que ya hay, no necesitan guardar nada nuevo y encuentran **errores
   reales** de parametrización.
2. **R2 + R3** juntos: la sugerencia y la memoria que la vuelve regla. R3 necesita guardar las decisiones,
   que es una ampliación de la migración 40 o una tabla hermana, con tu OK.
3. **R5 y R6** cuando decidas la 4.ª columna y la comparación de versiones.

## Lo que NO se hace

- Asignar partidas solas.
- Corregir el modelo.
- Dar un total que no se pueda rastrear elemento a elemento.
- Usar «parecidos» sin enseñar la cifra.
