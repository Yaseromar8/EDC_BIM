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

## Fuentes

- Procore, flujo de Punch List: https://support.procore.com/faq/what-is-the-punch-list-work-flow
- Autodesk Build, observadores de una incidencia: https://help.autodesk.com/cloudhelp/ENU/Build-Issues/files/create-issues/Issues_Watchers.html
- Autodesk, petición de varios asignados: https://forums.autodesk.com/t5/bim-360-ideas/bim-360-docs-issues-assign-multiple-users/idc-p/10910011/highlight/true
- Autodesk, petición de asignar marcas: https://forums.autodesk.com/t5/bim-360-ideas/bim-360-docs-markup-assignment-amp-status/idi-p/9334045
- Bluebeam, respuestas y estados en las marcas: https://novedge.com/blogs/design-news/bluebeam-tip-resolve-markups-with-revu-reply-threads-and-status-controls
- Bluebeam, buenas prácticas en Studio Sessions: https://novedge.com/blogs/design-news/bluebeam-tip-best-practices-for-bluebeam-studio-sessions
