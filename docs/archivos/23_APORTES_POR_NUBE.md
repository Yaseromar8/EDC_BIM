# Aportes por nube: un dueño de la incidencia y quien alimenta cada nube — 3-nov-2026

> **La idea del dueño.** «En el issue debe ir el encargado principal del plano, el que puede pasar de estado. Y en las
> nubes, etiquetar a un usuario responsable: esa imagen 3D se le asigna a un usuario BIM, y así a quien corresponda,
> según un color… cuando el área BIM genere el 3D, que comunique que ya lo tiene y lo suba para que el usuario principal
> lo modifique… investigar de qué forma se pueden subir capturas de fotos HD, referencias o documentos que ayuden a
> subsanar.»
>
> **Estado:** investigación y propuesta. No se ha construido nada.

## 0 · Lo que decidió el dueño (3-nov-2026, segunda vuelta)

> «La jerarquía estándar sería así: un coordinador BIM, líder BIM, especialista BIM, etc. son los que colocan la
> incidencia y las nubes. Luego viene una persona encargada del plano (el que arma) y luego vienen los que alimentan.
> La edición se hace en Civil, CAD o Revit, y lo que se revisa son los PDF: no podríamos pegar directamente y decir que
> ya está. Sería más como adjuntar a la incidencia o enlazar la información que requiere. La idea es que todo dé vueltas
> en nuestro ECD, nada de WhatsApp ni correo: todo aquí, trazable con fecha y hora. El color, que sea por persona pero
> por plano: para la revisión de un plano serán como máximo 10 personas. El aporte también se debería poder pedir a
> una empresa o subcontratista, contratista, supervisión o ANIN.»

| Papel | Quién | En la incidencia de hoy |
|---|---|---|
| **Revisor** | Coordinador, líder o especialista BIM | Levanta la incidencia y dibuja las nubes; al final **verifica** (el «Verifica» de hoy) |
| **Encargado del plano** | Quien arma el plano | El **«Asignada a»**: el único que cambia el estado, pide aportes, los incorpora en su CAD o Revit y sube la versión nueva |
| **Aportantes** | Personas o **empresas** (contratista, subcontratista, supervisión, entidad / ANIN, proyectista) | Lo nuevo: alimentan cada nube con lo que se les pide |

Lo que eso cambia de la propuesta:

- **Un aporte no corrige el plano.** El plano se corrige en el CAD y se sube como versión nueva. El aporte **adjunta o
  enlaza** la información que el encargado necesita: capturas, fotos, un modelo, un cálculo, un documento del ECD. Pegar
  con Ctrl+V es solo **una forma de adjuntar** una captura.
- **Todo pasa en el ECD.** Pedido, entrega, aceptación y devolución quedan con autor, fecha y hora. El correo solo
  **avisa** con un enlace al aporte: no se contesta por correo. No hay nada que hacer por WhatsApp.
- **Color por PERSONA, dentro de cada plano**, no por área. A cada persona o empresa que participa en la revisión de ese
  plano se le da un color, en el orden en que entra, y lo conserva en todas las incidencias de ese plano. Hasta 10, de la
  lista cerrada de la paleta:

  | Orden | Color |
  |---|---|
  | 1 | #507294 azul |
  | 2 | #b93535 rojo |
  | 3 | #64744e verde |
  | 4 | #9e5943 terracota |
  | 5 | #734500 marrón |
  | 6 | #6a9bcc azul claro |
  | 7 | #788c5d verde claro |
  | 8 | #52524d gris |
  | 9 | #141413 Dark |
  | 10 | #d97757 naranja, solo si se llega a 10 |

  Las iniciales siempre acompañan al color, para no depender solo de él.
- **El aporte también va a una empresa.** Ya existe para la incidencia (`responsable_empresa`) y las funciones de obra
  son ENTIDAD (ANIN), SUPERVISION, CONTRATISTA, PROYECTISTA y OTRO. Falta **SUBCONTRATISTA** como función propia: es
  ampliar esa lista cerrada (una migración pequeña).

Siguen abiertas, con lo recomendado:

- el aportante ve la incidencia entera, pero solo puede entregar en su nube;
- «Declarar corregida» con aportes sin incorporar solo **avisa**.

Maqueta: `docs/ux/maquetas/aportes_v1.html`.

## 0 bis · Tercera vuelta del dueño: TODO VA EN LA NUBE (3-nov-2026)

> «El aporte debe ser en la nube que le corresponde. No sabremos si estará levantada o no hasta tener otra versión,
> ¿cómo manejaríamos eso? Si se adjunta una imagen o dato donde aún falta algo, se le devolvería sin necesidad de
> hacer otra nube. En el issue debería haber 3 pestañas: lo que le corresponde al issue, lo que corresponde a cada nube
> y el historial. Si hago clic a la nube, se abre en esa pestaña. La idea es reutilizar el panel del issue. En cada
> nube, la opción de asignar a la persona o empresa. El adjunto de información debe ser en cada nube, y todo enlazado
> desde Docs, o poder subir pero que de alguna forma se guarde en Docs.»

Maqueta: `docs/ux/maquetas/aportes_v2.html`; la v1 queda como referencia.

**El panel de la incidencia de siempre, con tres pestañas.**

- **Incidencia:** quién levantó y verifica, el encargado del plano, los observadores, la descripción, el plazo, el
  estado y un resumen de cómo van las nubes.
- **Nubes:** una ficha por nube, con:
  - **a quién se asigna**, una persona o una empresa;
  - qué se pide y para cuándo;
  - sus **rondas** de entrega y devolución;
  - lo adjuntado en cada ronda;
  - su verificación en la versión nueva.
- **Historial:** todo, con fecha y hora.

Pulsar una nube en el plano abre la pestaña **Nubes** con esa ficha desplegada, y la nube queda resaltada en la hoja.

**Las rondas: devolver sin crear otra nube.** Si lo entregado no basta, el encargado pulsa **«Devolver…»** y escribe qué
falta. La nube abre la **ronda 2** para el mismo aportante y conserva lo de la ronda 1. Así, una nube cuenta su propia
historia: entregó, se le devolvió porque faltaba la planta, volvió a entregar y se aceptó.

**Levantada o no: se sabe con la versión nueva, nube por nube.**

1. El encargado **acepta** la información de la nube. La nube queda **«Aceptada · para la V3»**.
2. Corrige en su CAD o Revit y **sube la V3**. Todas las nubes de la incidencia pasan a **«Por verificar en la V3»**.
3. El revisor abre cada nube con **Comparar versiones** (V2 ↔ V3) encuadrado en la zona de esa nube. El comparador ya
   detecta los cambios en una zona.
4. El revisor marca cada nube como **Levantada** o **No levantada**, con un motivo. Una no levantada vuelve al encargado,
   que puede volver a pedir el aporte: es una nueva ronda de la misma nube.
5. La incidencia queda **Verificada** cuando todas sus nubes están levantadas.

| Estados de una nube | Quién la mueve |
|---|---|
| Sin asignar · Pedida · Entregada (ronda n) · Devuelta · Aceptada | aportante y encargado |
| Por verificar en la Vn · Levantada · No levantada | al subir la versión, y el revisor |

**Todo lo adjuntado vive en Docs.**

- **Enlazar de Docs:** cualquier documento del ECD, en su versión: un plano, un modelo .rvt, un cálculo.
- **Subir a Docs:** lo que se sube desde la nube (fotos HD, capturas, archivos) se guarda como **documento de Docs** en
  una carpeta de la incidencia, por ejemplo `Incidencias/ISS-002/`. Tiene versión, permisos y huella como cualquier otro
  documento, y la nube lo enlaza. Es lo mismo que ya hacen las fotos de las marcas en `MULTIMEDIA/`.
- **Desde View:** la captura 3D se guarda también en Docs, junto con la cámara para volver a esa vista.

Nada se adjunta «fuera» del ECD.

## 1 · Es una práctica conocida, y profesional

| Producto | Cómo lo resuelve | Qué nos sirve |
|---|---|---|
| **Procore, Punch List** | Dos papeles distintos: el **Punch Item Manager**, que lleva el ítem de principio a fin, y los **Assignees**. Cada assignee marca *su* parte «Ready for Review». El ítem pasa a «Ready for Review» solo cuando **todos** lo han hecho. El manager acepta o devuelve cada respuesta y un **Final Approver** cierra. | Es exactamente la idea: **un dueño y varios aportes**, cada uno con su estado. |
| **Autodesk Build (ACC), Issues** | **Un solo asignado** por incidencia, más *watchers* que solo miran y comentan. Pedir varios asignados es una petición antigua de los usuarios, sin resolver. Las marcas de Docs **no se pueden asignar** (otra petición abierta). | Lo que proponemos **va más allá de ACC**. |
| **Bluebeam, Studio Sessions** | Cada marca tiene su hilo de respuestas y su **estado**, con autor y hora. «**Color by Author**» colorea las marcas según quién las hizo. Se exporta un informe con respuestas y capturas. | El **color identifica de quién es** una marca, y cada marca lleva su propia conversación. |

**ISO 19650-2** lo llama así: la parte designada principal **reparte** el trabajo entre **equipos de trabajo** con una
**matriz de responsabilidades** (5.4.2) y recibe lo que cada uno produce para integrarlo (5.6). El «usuario principal»
es la parte que integra; el área BIM es un equipo de trabajo que aporta.

## 2 · La propuesta para ALEPHIA

### 2.1 · Dos papeles

| Papel | Quién | Qué puede hacer |
|---|---|---|
| **Dueño de la incidencia** | El «Asignada a» de hoy: el encargado principal del plano | Es **el único que cambia el estado** de la incidencia: En curso, Corregida… Pide los aportes, los acepta o los devuelve, y corrige el plano. |
| **Aportante** de una nube | Una **persona o un área** (BIM, Estructuras, Topografía…) | Ve **su** nube, entrega lo que se le pidió y avisa. No cambia el estado de la incidencia. |

«Verifica» sigue igual: quien levantó la incidencia comprueba la corrección al final.

### 2.2 · El aporte, en cada nube

El dueño elige una nube de la incidencia y pulsa **«Pedir aporte»**:

- **a quién:** una persona, o un área;
- **qué se pide**, por ejemplo: «Imagen 3D del detalle de la junta, vista isométrica»;
- **para cuándo.**

Cada aporte pasa por cuatro estados, con dueño cada uno:

```
Pedido ──(el aportante entrega)──► Entregado ──(el dueño lo incorpora)──► Incorporado
                                       └──(el dueño lo devuelve, con motivo)──► Devuelto ──► Entregado…
```

- **Al aportante** le aparece en «Mi trabajo»: «Aportar a ISS-002 · Imagen 3D del detalle · vence el 6 nov.». Al pulsar,
  se abre el plano en **esa nube**, con su panel de aporte.
- **Al entregar,** al dueño le llega el aviso, en «Mi trabajo» y por correo.
- **Si el dueño intenta «Declarar corregida»** con aportes sin incorporar, se le avisa. Procore no deja pasar a «Ready for
  Review» hasta que todos han respondido.

### 2.3 · El color: por ÁREA, no por persona

Un color por persona no escala: en una obra hay decenas, y la paleta tiene seis colores de marca aprobados. Además, el
dueño ya dijo que el color en los controles le parece «de dibujo animado». Lo profesional es **un color por área o
disciplina**, que es como se lee un plano coordinado, **y las iniciales de la persona** en la etiqueta de la nube.

Propuesta con los seis colores de marca que ya tiene el lector:

| Área | Color |
|---|---|
| BIM / modelado | #507294 azul |
| Estructuras | #b93535 rojo |
| Sanitarias / hidráulica | #64744e verde |
| Topografía | #734500 marrón |
| Arquitectura | #9e5943 terracota |
| General / otras | #141413 Dark |

- La **nube toma el color de su área** al pedir el aporte.
- Su **etiqueta** dice el área y las iniciales: «BIM · JR».
- Una **leyenda** en el plano y un **filtro** por área permiten ver solo lo que le toca a cada una.
- Las áreas salen de la lista cerrada de disciplinas que ya existe (ARQ, EST, SAN, ELE, MEC, CIV, VIA, TOP, GEN), **más
  BIM**. Cada obra dice qué personas forman cada área.

### 2.4 · Cómo se entrega: capturas HD, referencias y documentos

Cinco caminos en el panel del aporte. Todos quedan en el aporte, con autor y hora.

| # | Camino | Para qué | Estado |
|---|---|---|---|
| 1 | **Subir fotos o imágenes** a su tamaño original (JPG, PNG, WEBP, HEIC) | Capturas exportadas de Revit, Navisworks o Civil 3D; fotos de obra | Existe en los adjuntos de la incidencia: falta llevarlo a la nube |
| 2 | **Pegar con Ctrl+V** una captura de pantalla | El camino más rápido: Win+Shift+S en Revit, Ctrl+V en el aporte | Nuevo. El navegador lo permite (`paste` con imagen) |
| 3 | **«Enviar al aporte» desde ALEPHIA View**: captura HD de la vista 3D (hasta 4K) **y la cámara guardada** | Lo nuevo y propio: el dueño abre **la misma vista 3D** en un clic, no solo una foto | El visor ya sabe capturar (`getScreenShot`); falta el puente |
| 4 | **Referencia a un documento del ECD**: un plano, un informe, una especificación | Sustentar sin duplicar archivos | Existe en las marcas («Referencia»): se reutiliza |
| 5 | **Una versión nueva de un documento**, por ejemplo la lámina de detalle 3D | Cuando el aporte es un entregable propio | Existe la subida de versiones: falta enlazarla al aporte |

Sobre la calidad «HD»:

- Se guarda **el original, sin recomprimir**.
- Para mirar se usa una miniatura; el original se abre a pantalla completa con zoom.
- Tope por archivo: el de subidas de la obra. Una captura 4K pesa de 2 a 8 MB.

## 3 · Qué hay y qué falta

**Ya existe:**
- la incidencia con su único dueño, quien verifica y los observadores;
- las nubes ligadas a la incidencia (las «marcas» de su ficha);
- los adjuntos, las referencias y las fotos;
- «Mi trabajo» y los avisos por encargos;
- los seis colores de marca;
- la lista cerrada de disciplinas;
- la captura del visor 3D.

**Falta:**
- **El aporte como objeto propio**, con estado, a quién va, plazo e historial. Necesita una migración aditiva: una tabla
  `doc_issue_aportes` con la incidencia, la nube, el destino (persona o área), lo pedido, el plazo, el estado, las
  entregas y el historial. Y un encargo de tipo `APORTE` para «Mi trabajo».
- **Las áreas de la obra**: qué personas forman BIM, Estructuras… Por obra, sin migración si se guarda en la
  configuración de la obra. Si no, una pequeña.
- **Las pantallas:**
  - «Pedir aporte» en el menú de la nube;
  - el panel del aporte, para entregar, aceptar o devolver;
  - la nube coloreada por área, con su etiqueta;
  - la leyenda y el filtro por área.
- **El puente desde View**, «Enviar al aporte».

## 4 · En qué orden

| Fase | Qué | Migración |
|---|---|---|
| 1 | El aporte: pedir, entregar (subir, pegar, referencia), aceptar o devolver; «Mi trabajo» y avisos; el aviso al declarar corregida | sí, aditiva |
| 2 | Áreas por obra y su color en la nube, con leyenda y filtro | probablemente no |
| 3 | «Enviar al aporte» desde View, con la cámara guardada | no |
| 4 | Informe de la incidencia con sus aportes y capturas (PDF), como el de Bluebeam | no |

## 5 · Lo que tiene que decidir el dueño

1. **¿Color por área (recomendado) o por persona?**
2. **¿Quién arma las áreas de cada obra?** ¿El administrador de la obra, eligiendo personas por disciplina?
3. **¿El aportante ve la incidencia entera, o solo su nube y lo que se le pidió?** Recomendado: la incidencia entera, en
   lectura. Así entiende el contexto, y solo puede entregar en su nube.
4. **«Declarar corregida» con aportes sin incorporar: ¿solo avisar (recomendado) o impedirlo?**
5. **¿Un aporte puede pedirse a una empresa** (por ejemplo, la supervisión), como ya se asigna una incidencia?

## 6 · Parte 2 construida: el panel y la nota de la nube (3-nov-2026)

En local, sin commit todavía. Encima de la parte 1 (`1adc9b38`, datos y servidor, sin empujar).

### 6.1 · Correcciones del dueño viendo el banco

1. **Una flecha no es una nube** («¿por qué la flecha debería tener “Abierta”?»). Solo una marca de tipo nube
   (`kind = 'cloud'`, `nubes_de_issue.TIPO_DE_NUBE`) es nube de la incidencia: se asigna, lleva estado y cuenta para
   cerrar. Flechas, textos y recuadros acompañan a la incidencia sin estado. En la hoja, el rótulo «ISS-001 · Abierta»
   va solo en la nube; si una incidencia no tiene ninguna nube en esa hoja, sus marcas lo siguen llevando para no
   perderla. En la barra de una flecha, el distintivo dice solo «ISS-001». Un recuadro tampoco se reparte como encargo
   (400).
2. **Se asigna desde la nube misma, en su nota de comentarios** («como ya tenemos una opción para dejar comentario,
   debería ser ahí mismo»). El botón de la nota pasa a «Comentar o asignar» para el encargado. Arriba de los
   comentarios: «Asignar a una persona o empresa…»; al pulsarlo, un desplegable (personas y empresas de la obra), «Qué
   se le pide» (propone el comentario que estés escribiendo, o el último) y la fecha. Ya asignada: «Asignada a
   **Mario** · Pedida · vence 20 nov.», con lo pedido debajo y «Cambiar».
3. **El panel solo enseña lo que importa.** Sin formulario de asignar, sin resumen de conteos, sin notas de relleno.

### 6.2 · El panel de la incidencia: tres pestañas

`design/incidencias/PanelDeIncidencia.jsx` (el panel de siempre, el de todas las herramientas):

| Pestaña | Qué tiene |
|---|---|
| **Incidencia** | Lo de siempre: detalles, descripción, fotos y documentos, comentarios y la caja de comentar. |
| **Nubes (N)** | `NubesDeIncidencia.jsx`. Solo aparece si la incidencia tiene nubes (o encargos internos). Cada nube es una fila: número y franja con el color de quien aporta, lo pedido, sus iniciales y el estado. Abierta: las rondas (lo entregado, quién, cuándo; si se devolvió, quién y por qué) y SOLO el botón que le toca a quien mira. |
| **Historial (N)** | El historial que antes iba bajo los comentarios, con los pasos de cada nube: «Luis asignó la nube 1», «Mario entregó en la nube 1», «Luis devolvió la nube 1: faltaba algo (ronda 2)», «Ana dio la nube 2 como levantada». |

Pulsar una nube en el plano y abrir su incidencia (el distintivo de la barra) lleva el panel a **Nubes**, con esa nube
abierta. Si el revisor intenta cerrar con nubes sin dar por levantadas (409 `NUBES_SIN_LEVANTAR`), el panel salta a
**Nubes**.

Botones por papel, los que el servidor dice (`actos`):

- **Quien aporta**: «Entregar» → subir a Docs (queda en MULTIMEDIA de la obra), «Enlazar de Docs» y una nota opcional.
- **Encargado**: «Aceptar» o «Devolver (falta algo)», con motivo obligatorio; devolver abre la ronda siguiente en la
  misma nube.
- **Revisor**, con la incidencia «Corregida»: «Levantada» o «No levantada» (motivo obligatorio). Queda escrita la
  versión sobre la que se decidió.

El color es por persona en cada plano: diez tonos sobrios (`reglas.js → COLORES_DE_PERSONA`), en el orden en que
aparece cada persona o empresa. Las nubes de encargo llevan la franja discontinua.

### 6.3 · Probado

- **Ensayo contra PostgreSQL real** (`ensayo_nubes.py`, banco 5196, como `ecd_app`): **33/33**. Se añadieron tres casos
  por la regla nueva: Ana dibuja una segunda nube; la flecha de la incidencia no es nube; un recuadro no se reparte
  como encargo (400).
- **En el navegador, como cada persona** (banco del plano):
  - Luis asigna la nube desde su nota → «Asignada a Mario · Pedida».
  - Mario ve una sola nube (la flecha no cuenta), con su inicial y «Entregar», y entrega una nota → «Entregado: le
    llega al encargado del plano».
  - Luis la devuelve con motivo → ronda 2 en la misma nube.
  - El historial cuenta los cuatro pasos.
- **No probado en el navegador:**
  - «Enlazar de Docs», porque el banco no tiene el buscador de documentos (el selector es el de siempre; la entrega con
    documento sí está en el ensayo).
  - La verificación del revisor en pantalla (sí en el ensayo).

### 6.4 · El color de cada persona en la hoja

El servidor numera a cada persona o empresa EN EL PLANO, en el orden en que recibió su primera nube
(`nubes_de_issue.colores_del_plano`), y manda ese número a la hoja (`nube.color` en cada marca de la lista del plano) y
al panel (`color` en cada nube). Así, una persona tiene el mismo color en todas las incidencias del plano. En la hoja,
el rótulo de la nube asignada lleva las iniciales de quien aporta sobre su color («ISS-001 · Abierta [M]»); al pasar
el ratón, «Nube asignada a Mario · Pedida». El trazo de la nube no se toca: lo dibujó quien revisa. Las nubes de
encargo no salen en la hoja. Ensayo 35/35 (dos casos más: la hoja y el panel dan el mismo color; la flecha no lleva
nube).

**Decidido por el dueño (3-nov-2026): «el revisor principal debe ver todo».** Quien revisa la incidencia (quien la
levantó o la verifica):

- ve todas sus nubes, también las de encargo que el encargado reparte a su equipo. Corrige la D6, que se las ocultaba
  como trabajo en proceso. Las ve en el panel y en la hoja.
- no aporta: no se le asigna una nube (400) y, aunque la nube vaya a su empresa, no le sale «Entregar». Pide y
  verifica, igual que quien corrige no verifica su propia corrección.

Ensayo 38/38, con tres casos más: no se asigna a quien revisa; con la nube asignada a su empresa, ella no entrega; y ve
las nubes de encargo (y el equipo también).

### 6.5 · La leyenda del plano

Arriba a la izquierda del lector, en su marco (no en la hoja: no se mueve ni se corta al mover el plano). Plegada:
«Nubes» y las iniciales de color de cada persona o empresa con nubes asignadas en el plano. Abierta: su nombre y cuántas
le faltan por entregar (o cuántas tiene). Solo aparece si hay alguna nube asignada.

### 6.6 · El encargado reparte con nubes de encargo

En la barra de una nube SUYA que aún no es de ninguna incidencia, quien es encargado de alguna incidencia abierta del
plano ve «Encargo para mi equipo». La nota bajo la nube pregunta de qué incidencia (si hay una sola, ya viene
elegida) y «Crear encargo». Al crearla:

- la nube se publica, para que su equipo y quien revisa la vean en el plano;
- la hoja la rotula con su incidencia y con BORDE DISCONTINUO (se distingue de las del revisor);
- la nota se queda abierta en «Asignar a…», para dársela al cadista o modelador. La acepta el encargado.

El servidor no deja convertir en encargo la nube de otro (403). Arreglo de paso: al volver a pedir las marcas tras un
acto, la marca elegida ya no se suelta sola (solo al cambiar de documento o versión). Ensayo 41/41.

### 6.7 · Cerrar el ciclo de la nube (3-nov-2026)

1. **Comparar en esta nube.** Quien revisa, con la incidencia «Corregida», tiene en cada nube por verificar
   «Comparar en esta nube»: abre «Comparar versiones» entre la versión en que se dibujó la nube y la vigente,
   encuadrado en ella y con su caja en trazo discontinuo. Luego decide «Levantada» o «No levantada». La nube viaja
   con su geometría (puntos del PDF); el lector la convierte a la hoja comparada. Si la nube es de la vigente (aún no
   hay versión nueva), lo dice y no abre nada.
2. **La carpeta de la incidencia (D4).** Lo que se sube al entregar va a `INCIDENCIAS/<código>/` de la obra, no a
   MULTIMEDIA. Ahí, y solo ahí, sube quien participa en la incidencia abierta aunque no tenga «Editar»: quien la
   revisa, el encargado y quien tiene una nube suya por entregar (o su empresa). Una subcarpeta, otra incidencia,
   otra obra o MULTIMEDIA siguen con la regla de siempre. Entregada la nube, quien aportó deja de poder subir.
3. **«Mi trabajo» lleva a la nube.** El aviso «Aportar en ISS-002» se pulsa y abre el plano con la incidencia en la
   pestaña Nubes, en ESA nube (`&nube=<marca>` en la dirección). Arreglo de la parte 1: con solo nubes en la lista
   (ninguna incidencia), «Mi trabajo» no las completaba con su plano.

Probado: ensayo de la carpeta, «Mi trabajo» y la geometría contra la base desechable, 12/12; la regla de la ruta
real de subida con los mismos usuarios; «Comparar en esta nube» en el banco de comparar (encuadre y caja). No probado
en pantalla: el botón dentro del lector con dos versiones reales (ningún banco tiene el lector con dos versiones) y la
subida real de un fichero (el banco no tiene el almacén).

### 6.8 · Tras verlo en producción (4-nov-2026)

El dueño: «es muy confuso tener que ir hasta el mensaje», «el título de la incidencia quita espacio», «al hacer clic a
la nube no se abre el panel», «al alejarme la nube se hace más negrita», «no veo el color en cada nube por usuario»,
«todo debe ser intuitivo, simplista pero profesional; no hay que explicarlo todo».

- **Asignar, directo en la barra de la nube**: un botón propio (una persona; ya asignada, sus iniciales en su color)
  con su nota: sin asignar, el formulario directamente; asignada, a quién y «Cambiar». Los comentarios, solo comentarios.
- **La nube se pinta del color de quien aporta** (su estilo guardado no cambia; sin asignar, el de quien la dibujó).
- **Sin «ISS-002 · Abierta» sobre cada nube**: solo las iniciales en su color. En la barra, el código con el punto de su
  estado.
- **Pulsar la nube abre también su panel**, en la pestaña Nubes y en ella; la barra se aparta para no quedar debajo.
- **Al alejar, el trazo y los festones encogen con la hoja** (el festón tenía 2,5 px de mínimo y se amontonaba).
- **Sin textos de ayuda** en la pestaña Nubes ni en las notas.
- Las nubes salen **en el orden en que se levantaron**: los números ya no cambian al asignar una.

### 6.9 · Segunda vuelta en producción (4-nov-2026, tarde)

El dueño: «no veo dónde asignar», «se sigue viendo grande cuando me alejo», «hay nombres asignados que están ocultos»,
«hago clic a la nube y me pierdo», «iconos de mejor relieve», «que el pin no lleve número y sea propio», «el Escape o el
clic fuera deben soltar lo elegido», «si hago clic al issue no me lleva a su información», «aparece una manito».

- **Una nube dibujada después también se asigna** desde su barra («Asignar»): elige su incidencia (si el plano tiene
  una, ya viene puesta). Quien revisa la **añade** (nube de observación) y la asigna su encargado; el encargado la añade
  como nube de encargo y la asigna en el acto. Servidor: `acto: 'crear'` decide la clase por el papel (`_crear_encargo`).
- **La hoja numera como el panel**: cada nube lleva en la hoja el número de su fila en la pestaña Nubes (y, asignada,
  las iniciales); sin asignar, en gris. `nubes_de_issue.numeros_de_nubes` es el orden único de los dos sitios.
- **El rótulo va dentro de la nube** cuando encima no cabe (antes se cortaba en el borde de la hoja).
- ~~La barra y su nota encogen al alejar, hasta el 75 %.~~ Retirado en la fase 3 (doc 25): la barra no baja de su
  tamaño (botones de 24 px como mínimo, WCAG 2.5.8, como ACC y Procore); lo que encoge al alejar es lo dibujado.
- **Iconos con más trazo** (1,9) y texto más oscuro en la barra.
- **Pin propio**: un hito (rombo con su punto), sin número.
- **Clic en el pin → pestaña «Incidencia»**, aunque el panel estuviera en «Nubes»; clic en una nube → «Nubes».
- **Escape suelta la nube aunque el foco esté en el panel** (el panel paraba las teclas); en un campo de texto, no.
- **Flecha, no mano**, en «Seleccionar y mover»; la mano solo mientras se arrastra. La hoja ya no se tiñe de azul con
  un doble clic o Ctrl+A (`user-select: none` en el lienzo, salvo campos de texto).
- **Entrega solo quien tiene la nube asignada**, también en el servidor: el administrador ya no entrega por otro
  (`ACTOS['entregar']` = solo `aportante`; el dueño: «solo sube el que es asignado»).
- **Entregada, le llega al encargado** («dueño del plano»: el «Asignada a» de la incidencia, o su empresa): un pendiente
  «Entregado en ISS-…: lo pedido» en «Mi trabajo», con su correo (`encargos.avisar`), que se cierra al aceptar o
  devolver. `nubes_de_issue.deudor(nube, issue)` dice a quién le toca: aportante mientras debe entregar; encargado
  cuando está entregada. La conciliación de encargos lo entiende igual.
- **Una entrega para cualquier pedido** (el dueño: «hay casos con fotos o documentos y otros donde solo se trata de
  mover un cuadro o borrar una descripción… profesional, estándar y escalable»): como la respuesta de ACC o el «listo
  para revisar» de Procore, quien aporta **responde qué hizo** («Qué se hizo») y, si hace falta, **adjunta** (a
  INCIDENCIAS/<código>/ o enlazado de Docs). Basta una de las dos; quien pidió acepta o devuelve. Sin tipos de pedido
  ni migración: el servidor ya aceptaba notas y documentos.

Probado en el banco: `ensayo_nubes.py` 51/51 (además: «ni Eva, administradora, entrega por Mario (403)», «entregada,
le llega a Luis», «…y Luis lo ve en «Mi trabajo»», «aceptada, a Luis ya no le queda nada en esa nube»); en el navegador,
Mario entrega solo con texto y a Luis le queda abierto «Entregado en ISS-001: …». Antes de estas tres:
`ensayo_nubes.py` 47/47 (incluye «la hoja y el panel dan el mismo número a cada nube», «Ana añade
una nube suya: entra como observación», «asignarla es del encargado (403)» y «la nube añadida también cuenta: no se
cierra sin levantarla (409)»); en el navegador del banco, pin → Incidencia tras estar en Nubes, Escape con el foco en el
panel y clic fuera (barra superior y mesa) sueltan la nube; cursor `default` y `user-select: none` medidos.

### 6.10 · Lo que sigue

1. Más adelante: «Enviar desde View» (una vista 3D guardada a la nube) y exportar a BCF.

## Fuentes

- Procore, flujo de Punch List: https://support.procore.com/faq/what-is-the-punch-list-work-flow
- Autodesk Build, observadores de una incidencia: https://help.autodesk.com/cloudhelp/ENU/Build-Issues/files/create-issues/Issues_Watchers.html
- Autodesk, petición de varios asignados: https://forums.autodesk.com/t5/bim-360-ideas/bim-360-docs-issues-assign-multiple-users/idc-p/10910011/highlight/true
- Autodesk, petición de asignar marcas: https://forums.autodesk.com/t5/bim-360-ideas/bim-360-docs-markup-assignment-amp-status/idi-p/9334045
- Bluebeam, respuestas y estados en las marcas: https://novedge.com/blogs/design-news/bluebeam-tip-resolve-markups-with-revu-reply-threads-and-status-controls
- Bluebeam, buenas prácticas en Studio Sessions: https://novedge.com/blogs/design-news/bluebeam-tip-best-practices-for-bluebeam-studio-sessions
