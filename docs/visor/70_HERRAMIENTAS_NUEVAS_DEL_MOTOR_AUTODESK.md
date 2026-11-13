# 70 · Por qué ACC enseña herramientas que nuestro visor no: regla y sección (13-nov-2026)

El dueño: «He visto que el visor de ACC tiene nuevas funcionalidades en su visor, pero veo que el mío sigue en otra
versión. ¿A qué se debe?». Mostró la barra de la regla de ACC y su panel «Herramientas de sección».

**Estado (13-nov-2026):** el dueño lo probó en local y decidió publicarlo: la regla y la sección nuevas van
**encendidas para todos**, y se retira nuestra herramienta de corte propia. Lo que se hizo está en §8; las secciones
1 a 7 son la investigación previa, tal como se escribió.

---

## 1 · Respuesta corta

Nuestro visor **no está en una versión vieja**: carga siempre la última 7 pública del motor de Autodesk, que hoy es
la **7.131.1** (comprobado contra el servidor de Autodesk; la 8 todavía no existe en público).

Lo que pasa es que **esas herramientas ya vienen dentro del motor, pero apagadas**. Autodesk las marca como
funciones experimentales y las enciende en su propio producto. Se encienden con una línea, antes de arrancar el
visor. En la versión 8 del motor vendrán encendidas para todos.

Me corrijo respecto a lo que dije antes de probarlo: afirmé que el panel de sección era exclusivo de ACC. No lo es.

## 2 · Qué hay apagado, y qué trae cada cosa

Leído en el fichero del motor y comprobado encendiéndolo (§3):

| Función experimental del motor | Qué enciende | Estado por defecto |
|---|---|---|
| Medición con láser | El botón **Láser** en la barra de la regla | Apagada |
| Medición de pendiente | El botón **Pendiente** en la barra de la regla | Apagada |
| Borrar todas las mediciones | Borrar todo de una vez | Apagada |
| Sección nueva | El panel **«Herramientas de sección»**: pestañas Plano y Box, «Añadir plano» (varios planos a la vez), «Borrar todo», y las opciones Mostrar marco, Mostrar gizmo, Rotar gizmo, Mostrar sombreados y Alinear norte real | Apagada |

Y lo que el motor **ya da hoy**, sin encender nada, en un modelo 3D: Distancia, Ángulo, Coordenada de punto,
Superficie, Distancia más corta y Calibrar.

## 3 · Capturas de la prueba

Una página de prueba con el mismo motor que carga el visor y un modelo sencillo dibujado en el momento (una losa,
columnas, una viga y un muro). Sin credenciales y sin ningún modelo de la obra.

| | Captura |
|---|---|
| La regla, como la da el motor hoy | `evidencias/herramientas-acc-13nov/1-regla-hoy.png` |
| La regla, con lo experimental encendido: aparecen Láser y Pendiente | `evidencias/herramientas-acc-13nov/2-regla-con-lo-nuevo.png` |
| La sección, como la da el motor hoy: X, Y, Z y caja | `evidencias/herramientas-acc-13nov/3-seccion-hoy.png` |
| La sección, con lo experimental encendido: el mismo panel que ACC, con dos planos puestos | `evidencias/herramientas-acc-13nov/4-seccion-con-lo-nuevo.png` |

## 4 · Qué costaría tenerlo en nuestro visor

**La regla (láser, pendiente, borrar todo): poco riesgo.** Es encender tres funciones antes de arrancar el motor.
Los demás botones no cambian.

**La sección nueva: hay que estudiarlo antes.** Al encenderla, el motor deja de cargar la sección de siempre y carga
la nueva en su lugar. En nuestro visor hay nueve ficheros que se apoyan en la de siempre:

- **Las vistas guardadas** (capturar y restaurar): guardan los planos de corte. Con la sección nueva el motor los
  escribe con otra forma. Es un contrato cerrado: hay que comprobar que una vista guardada hoy se restaura igual.
- **Nuestra herramienta de corte** (`SectionCutTool.jsx`): llama a la sección de siempre por su nombre.
- **El holograma de movimiento de tierras** (`ghostEarthworks.js`): lee el plano de corte de la sección de siempre.
- Los filtros y `Viewer.jsx`, que tiene cambios tuyos sin publicar.

No se puede encender a ciegas: hay que probarlo con un modelo real y con vistas guardadas reales.

**Dos advertencias que valen para las dos:**

- Autodesk llama a estas funciones «internas»: no las documenta ni promete mantenerlas iguales. Dentro del código
  dice que en la versión 8 quedan encendidas para siempre, así que el riesgo es de aquí a entonces.
- Como cargamos «la 7 más reciente», el motor cambia solo cuando Autodesk publica. Lo que hoy funciona al encender
  una función experimental puede cambiar en la siguiente versión sin avisar.

## 5 · Lo que no se ha comprobado

- **Nuestro visor de verdad, con un modelo de la obra.** La prueba usa el motor suelto. Nuestro visor carga
  extensiones propias y esconde botones; puede comportarse distinto.
- **Qué ves tú hoy al pulsar la regla.** Según el motor deberías ver ya seis herramientas (todas menos el láser y la
  pendiente). Si ves menos, hay algo nuestro que las esconde y hay que buscarlo.
- La regla y la sección nuevas en una **tableta**.
- Cómo se comporta el láser en un modelo real (en la prueba solo se vio que el botón aparece).

## 6 · Lo que propongo

1. **Regla:** encender láser, pendiente y «borrar todo» en local, probar con un modelo real de la obra y enseñártelo.
2. **Sección:** antes de encender nada, un estudio corto de cómo quedan las vistas guardadas, nuestra herramienta de
   corte y el holograma con la sección nueva. Con eso se decide si se adopta, o si se espera a la versión 8.

## 7 · La lista completa de funciones internas del motor (7.131.1)

Sacada del fichero del motor el 13-nov-2026. «Fija en la 8» quiere decir que el propio motor avisa de que en la
versión 8 deja de ser un interruptor y queda siempre encendida. De las que digo «leído» miré dónde las usa el motor;
de las demás solo sé lo que dice su nombre.

### Las que se ven y pueden interesar

| Función | Qué hace | Por defecto | Cómo lo sé |
|---|---|---|---|
| `EnableLaserMeasurement` | Botón Láser en la regla | Apagada · fija en la 8 | Probado |
| `EnableSlopeMeasurement` | Botón Pendiente en la regla | Apagada | Probado |
| `EnableDeleteAllMeasurements` | Borrar todas las mediciones de una vez | Apagada · fija en la 8 | Probado |
| `EnableSmartSection` | El panel «Herramientas de sección» | Apagada · fija en la 8 | Probado |
| `EnableGrids` | Una opción «Grids» en Ajustes: dibuja los **ejes y niveles** que trae el modelo de Revit | Apagada · fija en la 8 | Leído |
| `EnablePointCloud` | Abrir **nubes de puntos** de escáner (ficheros RCS de ReCap) | Apagada | Leído |
| `EnableRcsOpfsCache` | Guarda la nube de puntos en el navegador para no bajarla cada vez; añade un ajuste de tamaño máximo | Apagada · fija en la 8 | Leído |
| `EnableNotificationManager` | Avisos en pantalla del propio visor: error al cargar un modelo, tarjeta gráfica lenta | Apagada · fija en la 8 | Leído |
| `ShowExperimentalFeatures` | Una pestaña «Experimental» en los Ajustes del visor | Apagada · fija en la 8 | Leído |
| `EnableGPUMemorySetting` | Cambia cómo se ofrece el ajuste «Memoria máxima de GPU» | Apagada · fija en la 8 | Leído |
| `EnableHyperModelingEdit` | Editar la colocación de láminas 2D dentro del modelo 3D | Apagada | Solo el nombre |
| `EnableManualAlignmentAdjustments` | Ajustar a mano la alineación entre modelos | Apagada | Solo el nombre |

### Las de rendimiento y dibujo (no añaden botones)

| Función | Qué parece | Por defecto |
|---|---|---|
| `WebGPUBackend` | Dibujar con WebGPU, la tecnología gráfica nueva del navegador | **Encendida** · fija en la 8 |
| `LargeModelExperience` | El modo para modelos grandes | **Encendida** · fija en la 8 |
| `Unorm16GeometryQuantization` | Geometría más compacta en memoria | **Encendida** · fija en la 8 |
| `EnforceLargeModelExperience` | Forzar el modo de modelos grandes siempre | Apagada · fija en la 8 |
| `EnableCameraOffset` | Más precisión con coordenadas muy grandes (modelos lejos del origen) | Apagada · fija en la 8 |
| `EnableWboitRendering` | Otra forma de dibujar las transparencias | Apagada · fija en la 8 |
| `CopyOverlayDepth` | Detalle interno de cómo se dibujan las capas superpuestas | Apagada · fija en la 8 |
| `EnableGPUDrivenRendering` | Dejar más trabajo de dibujo a la tarjeta gráfica | Apagada |
| `EnableMaterialXRendering` | Materiales en formato MaterialX | Apagada |
| `SlowGpuDetection` | Detectar una tarjeta gráfica lenta | Apagada |
| `OutOfCoreGpuMemoryManagement`, `WebGLUBOs` | Gestión de memoria gráfica | Sin valor propio en el fichero |

### Las internas de datos

`SceneAPI` (la forma nueva de construir escenas; apagada, fija en la 8), `PropertyDbCache`, `PropertyHash64`,
`SkipSparseAttributeDefinitions`, `VsCdn` y `DSEndpoints`: lectura de propiedades y direcciones de los servidores de
Autodesk. No son funciones para quien usa el visor.

### Ya retiradas

`EnableFpsTargetSetting`, `LargeModelExperienceMobile`, `AlignmentServiceUpAxisUnit`, `WebGPUPrism`,
`ModelRelativeSheetAlignment`, `EnableSpotMeasurement` y `LargeModelExperienceOptOut` figuran como retiradas: el
motor ya no las atiende. La coordenada de punto, por ejemplo, ya viene encendida para todos.

## 8 · Lo que se publicó (13-nov-2026)

### Las cuatro preguntas

| | |
|---|---|
| **¿Qué problema resuelve?** | ACC enseñaba una regla con láser y un panel de sección con varios planos que nuestro visor no tenía, aunque el motor es el mismo. |
| **¿Qué cambió?** | El visor arranca el motor con esas funciones encendidas: láser, pendiente y «borrar todas» en la regla, y el panel «Herramientas de sección». Nuestra herramienta de corte propia desaparece de la barra inferior. |
| **¿Cómo se comprobó?** | En el visor real en local, con un frente de cuatro modelos, y con pruebas (abajo). El dueño lo usó y confirmó las flechas del corte. |
| **¿Cómo se vuelve atrás?** | Sin publicar nada: abrir el visor con `?motor=no` apaga las funciones nuevas en ese navegador. Para todos: revertir el commit (devuelve también nuestra herramienta de corte). |

### Decisiones del dueño

- «Por ahora solo lo que ya probamos»: regla y sección. Ejes y niveles, nubes de puntos y lo demás de §7 quedan
  sin encender.
- «Como ya tendremos lo de secciones, eliminemos el corte que habíamos construido antes, el nuestro»: se retira
  `SectionCutTool` (los cortes Transversal, Longitudinal y Planta respecto al eje de la obra).

### Lo que se pierde al retirar nuestra herramienta

Nuestra herramienta cortaba **respecto al eje de la obra**: transversal, longitudinal o en planta siguiendo el
elemento, con un clic. La sección del motor corta por el plano que se le da (una cara, o un plano que luego se mueve
y se gira con las flechas). Se llega a los mismos cortes, pero a mano. Si se echa de menos, el fichero está en el
historial y se puede recuperar.

No se toca el corte de las secciones de obra civil (el que usa el panel Civil con la progresiva): ese es otra cosa
y sigue igual.

### El defecto que apareció al probarlo, y su arreglo

El dueño: «cuando hago clic en una cara, no aparecen las flechas de corte para subir o bajar».

Nuestra selección por clic (la que elige el elemento que se toca) tiene prioridad sobre las herramientas del motor
y ya cedía el clic a la sección de siempre, pero a la nueva no la conocía por su nombre. Se quedaba con el clic y
seleccionaba el elemento de debajo; y la sección nueva suelta el plano activo en cuanto cambia la selección. Las
flechas no llegaban a salir.

Arreglo: una línea en `Viewer.jsx`, que añade `Autodesk.SmartSection` a las herramientas a las que se cede el clic.
Mientras el panel de sección está abierto, un clic no selecciona elementos (ACC hace lo mismo); al cerrarlo, vuelve a
seleccionar. Confirmado por el dueño en su local.

### Las vistas guardadas

Era el riesgo que se señaló en §4. Comprobado en el visor real en local, con la sección nueva encendida:

- al guardar, el motor sigue entregando los planos de corte con el mismo nombre y la misma forma que antes
  (`cutplanes`), así que una vista guardada los conserva;
- restaurar lo que guarda una vista vuelve a poner el plano, con el panel abierto o cerrado;
- una vista guardada con la sección de siempre tiene esa misma forma, así que se restaura igual.

El motor añade además una clave nueva con el estado de la herramienta (`autodesk.viewer:section-1.0.0`). No está en
la lista de lo que guardamos, así que se ignora, como cualquier clave no decidida. Lo que no viaja en una vista son
las opciones del panel (marco, gizmo): al restaurar quedan como las tenga cada persona.

No se comprobó guardando una vista de verdad en el servidor: se comprobó lo que el motor entrega y lo que hace al
restaurarlo.

### La salida de emergencia

Son funciones que Autodesk no documenta, y cargamos «la 7 más reciente». Si una versión futura las rompe:

| Dirección | Efecto en ese navegador (se recuerda) |
|---|---|
| `…/?motor=no` | El motor como venía: regla y sección de siempre |
| `…/?motor=regla` | Solo la regla nueva; la sección, la de siempre |
| `…/?motor=todo` | Lo de todos |

Además, si al motor le falta alguna función, el visor arranca sin ella en vez de fallar.

### Pruebas

| Qué | Resultado |
|---|---|
| `frontend-react/pruebas/funcionesDelMotor.prueba.mjs` (nuevo) | 12 de 12 |
| Visor real en local, frente «Drenaje Urbano» con 4 modelos | Las cuatro funciones encendidas sin pedir nada; la regla con ocho herramientas; el panel de sección; sin nuestra herramienta en la barra; sin errores del visor en consola |
| `?motor=no` en el mismo visor | Vuelve la sección de siempre y desaparece el láser |
| Los demás bancos del visor, la compilación y la suite del servidor | Sobre el árbol exacto del commit, en su mensaje |

**No comprobado:** en producción; en tableta; guardar y restaurar una vista con corte de extremo a extremo; el
holograma de movimiento de tierras con la sección nueva (lee los planos del motor, que sí incluyen los nuevos, pero
no se miró en pantalla).
