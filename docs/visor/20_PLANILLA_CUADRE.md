# Planilla · comprobar cantidades: selección que suma y «Cuadre»

23-oct-2026. Pedido del propietario: corroborar longitudes del presupuesto (tuberías HDPE DN 600 / 1000 /
1500 / 1600) de forma fácil, por filtro **y** por elección, respetando la unidad; y la selección con Shift
no funciona.

## 1 · Lo que hay hoy (medido en el código y en el banco)

- **Shift / Ctrl no existen.** Clic en una fila = un elemento en 3D; la casilla marca de una en una. Nunca se
  programó selección de un tramo de filas ni suelta.
- **Nada suma lo elegido.** El pie suma lo **filtrado**; las casillas solo sirven para la edición en bloque.
- **Las demás herramientas:** Excel enseña en su barra de estado la suma, el promedio y el recuento de lo
  seleccionado; Tandem (medido, doc 18) tiene totales de pie y de grupo, pero no suma la selección; Revit
  necesita armar una tabla de planificación para cada pregunta.

## 2 · Prueba con los datos reales (Drenaje, 65 tubos, solo lectura)

Agrupando las tuberías `000_SYP_Tuberia_HDPE_Drenaje` por `Mecánica › Diámetro` y sumando `Cotas › Longitud`:

| Partida del presupuesto | Presupuesto | Modelo | Diferencia |
|---|---|---|---|
| Prueba hidráulica HDPE DN 1000 | 353,06 m | 348,60 m · 5 tramos | −4,46 m · −1,3 % |
| Prueba hidráulica HDPE DN 1500 | 114,50 m | 112,55 m · 2 tramos | −1,95 m · −1,7 % |
| Prueba hidráulica HDPE DN 600 | 117,70 m | 120,09 m · 3 tramos | +2,39 m · +2,0 % |
| Instalación / prueba HDPE DN 1600 | 30,70 m | 28,99 m · 1 tramo | −1,71 m · −5,6 % |

Hallazgo: hay tubos de **601 mm (75,55 m)** y **801 mm (55,41 m)**: diámetros que no existen en catálogo,
probablemente usados para distinguir algo en el modelo. Es justo lo que un cuadre tiene que hacer visible.
(La longitud de Revit es la del eje del tramo entre accesorios; el presupuesto puede medir entre ejes de
buzones: la diferencia de 1–2 % es de ese orden. No se ha investigado más: se informa.)

## 3 · Propuesta (sin IA, reglas fijas y verificables; para cualquier obra)

### A · Selección que suma (lo básico, como la barra de Excel, pero por unidad)
- **Clic** = un elemento · **Mayús + clic** = el tramo de filas · **Ctrl + clic** = añadir / quitar uno.
  También por casillas, y lo que se selecciona en el 3D (Ctrl en el visor) entra igual.
- **Barra de selección** fija sobre el pie: «7 elementos · Σ Longitud 461,15 m · Σ Volumen …», en vivo, por
  columna y **por unidad** (nunca suma m con m²); clic en un total → copiarlo.
- Los elegidos se resaltan en 3D y la cámara los encuadra (ya existe el encuadre en la zona visible).

### B · «Cuadre» (lo nuestro: comparar contra el valor esperado)
- Botón **Cuadrar** en la barra de selección o en el pie: escribes o **pegas** el valor esperado con su
  unidad («353,06 m»), o la línea entera del Excel del presupuesto («PRUEBA HIDRAULICA … DN 1000 MM … m
  353.06»). Se lee número y unidad con regla fija; se compara con la suma de la columna de esa unidad.
- Resultado: **modelo · esperado · diferencia · %**, con semáforo por tolerancia (por defecto ±1 % verde,
  ±3 % ámbar, más rojo; ajustable).
- **Cuadre por grupos:** agrupado por una columna (p. ej. Diámetro), se pegan varias líneas del presupuesto
  y cada una se empareja con su grupo por el número que lleva («DN 1000» ↔ 1000 mm) — emparejamiento por
  regla, visible y corregible a mano; nada se decide solo.
- Paso siguiente (con migración, solo si se autoriza): **guardar el cuadre** (fecha, quién, criterio,
  elementos, resultado) para que la valorización de cada mes tenga su comprobación trazable.

## 4 · Orden propuesto

1. A completo (Shift/Ctrl, barra de selección por unidad, 3D) — solo pantalla.
2. B simple: cuadre de un valor pegado contra la selección o lo filtrado — solo pantalla.
3. B por grupos (pegar varias líneas).
4. Guardar cuadres (migración, con autorización).

## 5 · Decisión y lo hecho (23-oct-2026, en local)

El propietario aprueba **A** y descarta **B** («todo el parametrizado se hace en Revit»). En su lugar pide un
**buscador**: pegar un valor que él parametrizó y quedarse solo con esos elementos, sumados, aunque lo
pegado traiga una coma, una tilde o un espacio de más.

Hallazgo: `Datos › 03_05_DSI_CodigoDePartida` (949 elementos, 65 valores) lleva el código o la
**descripción completa de la partida**, la misma del Excel del presupuesto.

- **Buscador** (`lib/inventoryBuscar.js`, 18/18): forma compacta (sin tildes, mayúsculas ni signos);
  primero valor completo, si nada coincide «contiene» (≥ 3 caracteres); dice en qué parámetro encontró y
  permite limitarse a uno; varias líneas = cualquiera; de una fila de Excel, la descripción. Índice de
  Drenaje ~0,25 s, búsqueda ~20 ms. Consta en la hoja «Criterios» del Excel.
  Probado en el banco pegando la descripción DN 1000 con «,,», doble espacio, minúsculas y tilde:
  5 de 8.378 filas, valor completo en 03_05_DSI_CodigoDePartida, **Σ 348,6 m**.
- **A · selección que suma:** Mayús + clic = tramo, Ctrl + clic = añadir / quitar (también Mayús en las
  casillas), en 3D en una sola selección y sin mover la cámara; fila **Σ selección** sobre el pie con el
  mismo cálculo y unidad, clic = copiar el número. Medido: 1 → Mayús hasta la 4.ª (4 filas, 4 en 3D,
  291,97 m) → Ctrl quita la 2.ª (3) → Ctrl añade la 5.ª (4, 297,71 m).

Pendiente visto al probar: al seleccionar aparece la barra de edición en bloque y la tabla salta hacia
abajo. (Lo de sumar diámetros quedó resuelto en §6.)

## 6 · Modo búsqueda: parecidos que se confirman, buscar en lo seleccionado y qué sumar

Pedido del propietario: si lo pegado coincide **o se parece** y él lo confirma, debe aparecer; poder elegir
qué sumar (longitud, volumen, área…) con esas columnas delante solo mientras busca; y que funcione sobre lo
**seleccionado** (elige los tubos DN 1000, pega la descripción, confirma y obtiene solo esos).

- **Parecidos** (`Buscador.parecidos`, sin IA): los **números** de lo pegado tienen que estar todos (DN 1000
  nunca es DN 1500) y el parecido es la proporción de palabras en común (Dice), sin palabras vacías. Si
  nada coincide se abren solos; cada uno con «parámetro · n elementos · %» y una casilla para confirmar.
  Con los datos reales, cada línea de «PRUEBA HIDRAULICA … DN 1000 / 1500 / 600 MM A ZANJA TAPADA» propone una
  sola descripción, la correcta («INSTALACION … DN … MM, INC. PRUEBA HIDRAULICA»), al 67 %. Un número suelto
  («1000ø», Cotas › Tamaño) ya no aparece (salía al 100 %: corregido, 30/30).
- **Buscar en: todo / lo seleccionado (n)**: si al empezar a buscar hay 2 o más elegidos, se busca en ellos;
  la selección se congela (pulsar un resultado no la cambia). Medido: 2 tubos DN 1000 elegidos con Mayús →
  pegar la línea del Excel → «lo seleccionado (2)», parecido con 2 elementos → confirmar → **2 elementos,
  Σ Longitud 158,04 m** (107,15 + 50,89).
- **Modo búsqueda en la tabla:** delante van Name, el parámetro donde se encontró y las medidas elegidas;
  fila «Sumar» con las medidas numéricas con unidad de lo encontrado (las de más cobertura activas) y su
  suma en el propio botón. Al borrar la búsqueda, la tabla vuelve a sus columnas (comprobado).
- **Cálculo por defecto corregido:** diámetros, espesores, tamaños, anchos, velocidades, presiones, flujos
  y pérdidas de carga se **promedian** (antes «Σ 5.000 mm» de diámetro); longitud, área y volumen se siguen
  sumando (75/75).

