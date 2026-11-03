# Revisión de planos con incidencias, nubes y aportes: qué dicen las normas — 3-nov-2026

> **Pedido del dueño.** «Después de todo lo discutido, lo ideal sería una nueva investigación para poder ya tomar
> decisiones. Debe ser de acuerdo a las normas peruanas y a las ISO.»
>
> **Qué recoge.** Todo lo discutido el 3-nov (docs/archivos/21, 23 y las maquetas `aportes_v1` y `aportes_v2`),
> contrastado con las normas. Termina en una **tabla de decisiones** (§4).

## 1 · El marco que aplica

| Norma | Qué es | Por qué importa aquí |
|---|---|---|
| **NTP-ISO 19650-1:2021** y **NTP-ISO 19650-2:2021** | Normas técnicas peruanas de INACAL, adopción idéntica de ISO 19650-1 y -2: conceptos y principios, y fase de ejecución | Son la versión **peruana** de la ISO: se puede citar como norma nacional |
| **Guía Nacional BIM** (MEF, RD 0003-2023-EF/63.01) | Gestión de la información en inversiones con BIM, obligatoria en el Estado desde ago-2026 | Los **seis requisitos mínimos del ECD**, los estados por metadato y los códigos de idoneidad |
| **Plan BIM Perú, roles BIM** (MEF) | Líder, Gestor, Coordinador, Supervisor y Modelador BIM | Quién revisa, quién coordina y quién produce |
| **Ley 32069** y su **Reglamento** (DS 009-2025-EF) | Contrataciones públicas | Los actores (entidad, supervisión, contratista, proyectista), los plazos legales y el ECD citado en el art. 154.5 |
| **Ley de Gobierno Digital** (DL 1412, Reglamento DS 029-2021-PCM) y **Ley 27269** de firmas y certificados digitales, con FIRMA PERÚ | Documento y expediente electrónicos; firma digital | Qué vale como **registro** |
| **Ley 29733** de protección de datos personales | Nombres y horas de las personas en los historiales | Los historiales guardan datos de personas: finalidad y conservación |
| **BCF 3.0** (buildingSMART, openBIM) | El formato abierto de las «incidencias» BIM: temas, comentarios, puntos de vista, documentos, temas relacionados | Para que la incidencia **llegue a Revit, Navisworks o Tekla** sin copiar a mano |
| **WCAG 2.2, criterio 1.4.1** | Accesibilidad: el color no puede ser el único medio de información | El color por persona necesita **signo e iniciales** |

## 2 · Lo que dicen, punto por punto

### 2.1 · Los papeles: funciones, no cargos

El Plan BIM Perú define cinco **roles BIM**:

- **Líder BIM**: la estrategia de la organización.
- **Gestor BIM**: «responsable del proceso de gestión de la información», que establece los requisitos.
- **Coordinador BIM**: «coordina la ejecución de los modelos» y asegura el cumplimiento.
- **Supervisor BIM**: «realiza revisiones periódicas a la información producida y verifica que se realice según los
  requisitos, en colaboración con el Coordinador BIM, y **antes de su entrega al Gestor BIM**».
- **Modelador BIM**: desarrolla los modelos.

Y añade algo decisivo: **«Son funciones… una persona asumirá uno o varios roles BIM; o un rol BIM será asumido por una
o varias personas. No representan cargos.»**

La ISO 19650 tiene la misma lógica con otros nombres. La **parte que designa** (la entidad) encarga a una **parte
designada principal** (el contratista o proyectista principal), que reparte el trabajo entre **equipos de trabajo**
(sus especialistas, cadistas y modeladores, y sus subcontratistas).

**Consecuencia.** Los papeles de la incidencia (**revisor, encargado del plano, aportante y quien verifica**) deben ser
**lo que alguien es en esa incidencia**, no un cargo ni un permiso fijo. Encaja con la propuesta:

| En la incidencia | Plan BIM Perú | ISO 19650 |
|---|---|---|
| **Revisor**: levanta la incidencia y las nubes, y verifica | Supervisor BIM o Coordinador BIM | Quien revisa, autoriza o acepta (parte designada principal o parte que designa) |
| **Encargado del plano**: corrige y sube la versión | Coordinador o especialista del equipo que produce | Responsable de la tarea en el equipo de trabajo |
| **Aportante**: alimenta una nube | Modelador BIM, otros especialistas, otras empresas | Miembros del equipo de trabajo u otras partes designadas |
| **Verifica / acepta** | Supervisor BIM; el Gestor BIM al recibir el entregable | Revisión y autorización (5.7.1–5.7.2); aceptación (5.7.3–5.7.4) |

### 2.2 · Los permisos: revisar no es editar

La ISO 19650 organiza el ECD por **estados**, que la Guía Nacional BIM pide guardar como metadato:

- **Trabajo en proceso** (WIP): lo ve **solo su equipo**.
- **Compartido**: S1 coordinación, S3 revisión y comentarios, S4 aprobación.
- **Publicado.**
- **Archivado.**

Quien revisa trabaja sobre **lo compartido**, y **no modifica** el contenedor de otro equipo: lo observa. El equipo
que produce lo corrige en su WIP y comparte una revisión nueva.

**Consecuencia.** Para levantar incidencias y nubes basta el nivel **«Ver, descargar y marcar»**, que ya tenemos y que
existe para eso. Exigir «Editar» para observar daría a la supervisión poder de **reemplazar archivos del contratista**,
justo lo que la ISO separa. El encargado sí necesita **«Editar y subir»**, porque sube la versión corregida.

**Hallazgo en el código.** Hoy, para dibujar marcas en el lector PDF solo se exige ser miembro de la obra
(`guardia_de_recurso` en `routes/pdf_tools.py`). No se comprueba el nivel «marcar» de la carpeta, como sí hace el lector
CAD (`routes/cad_review.py`, `view_markup`). Hay que alinearlo.

### 2.3 · Las nubes del encargado: el WIP es del equipo

Aquí la norma **corrige una recomendación anterior**. El 3-nov propuse que el revisor viera, en solo lectura, las nubes
de encargo que el encargado reparte a sus cadistas. Pero la ISO dice que el **trabajo en proceso lo ve solo el equipo
que lo produce**. Una orden interna, como «Luis, hazme el corte A-A», es WIP de ese equipo.

**Consecuencia, recomendación corregida.**

- Las **nubes de encargo** las ven el encargado y las personas de **su misma empresa** asignadas a ellas.
- El revisor ve solo que la observación está «en curso» y cuántas tareas internas tiene, **sin su contenido**.
- Cuando el encargado sube la versión corregida, eso es lo **compartido**, y es lo que el revisor juzga.

### 2.4 · Devolver y aceptar, con motivo y por rondas

ISO 19650-2 tiene dos niveles de revisión:

- dentro del equipo: comprobar la calidad (5.6.3), y revisar y aprobar para compartir (5.6.4);
- hacia arriba: revisar y autorizar (5.7.1–5.7.2), y aceptar (5.7.3–5.7.4).

Cuando lo entregado no cumple, se rechaza para que se corrija y se vuelva a entregar.

**Consecuencia.**

- Las **rondas** de una nube (Entregada → Devuelta con motivo → Entregada otra vez → Aceptada) son ese ciclo, a la escala
  de un aporte.
- El **motivo** es obligatorio al devolver: es lo que hace útil el registro.
- **Nada se borra:** cada ronda queda con autor, fecha y hora.

### 2.5 · ¿Levantada o no? Se decide con la revisión nueva, en el ECD

Con la ISO y la Guía, una corrección **no existe** hasta que hay una **revisión nueva del contenedor** que pasa por el
ECD:

- se comparte (S3, para revisión) con su código de revisión (P02 o C02) y queda registrada;
- **sobre esa revisión** se decide si cada observación se levantó.

**Consecuencia.**

1. Al subir la versión nueva, cada nube de observación pasa a **«Por verificar en la Vn»**.
2. El revisor decide **nube por nube**: **Levantada** o **No levantada**, con su motivo, mirando la zona con Comparar
   versiones.
3. La incidencia queda **Verificada** cuando todas sus nubes están levantadas.
4. Si alguna no se levantó, la incidencia vuelve al encargado (es el estado «No aprobada» que ya existe). La nube abre
   una ronda nueva **sin crear otra nube**.

### 2.6 · Adjuntos: todo es un contenedor del ECD

La Guía Nacional BIM exige seis cosas para cada contenedor:

- identificador único;
- valores acordados;
- estado, revisión y clasificación;
- poder cambiar de estado;
- **usuario y fecha de cada cambio**;
- acceso controlado.

Una foto suelta enviada por WhatsApp o por correo no cumple ninguna.

**Consecuencia.**

- Lo que se adjunta a una nube **es un documento de Docs**: subido a la carpeta de la incidencia, o enlazado de Docs con
  su versión.
- Así tiene identificador, versión, permisos, huella y fecha, como cualquier documento.
- El correo **solo avisa**, con un enlace. No se responde por correo.

### 2.7 · El registro: que valga

- **Ley de Gobierno Digital.** El procedimiento puede llevarse por medios electrónicos y debe constar en un **expediente
  electrónico**.
- **Ley 27269 y FIRMA PERÚ.** Dan presunción legal a la **firma digital**.
- **Registro de archivos (AGN).** Los registros de obra se conservan: no se borran.

**Consecuencia.**

- El historial de la incidencia y de sus nubes es de **solo añadir**: con autor, fecha y hora del servidor, y encadenado
  como ya hace la auditoría (`auditoria_encadenada`).
- Para los **actos formales** (verificar y cerrar una observación del expediente, o aceptar un entregable), la **firma
  digital** con FIRMA PERÚ puede venir después.
- **Ley 29733.** Los nombres y las horas son datos personales tratados para ejecutar el contrato. No hace falta un
  consentimiento aparte, pero sí decir para qué se guardan y cuánto tiempo.

### 2.8 · Empresas como aportantes

En la ISO, las organizaciones son **partes designadas**: el aporte puede ir a una empresa, no solo a una persona. La Ley
32069 nombra los actores de la obra pública: **entidad** (ANIN), **supervisión**, **contratista** y **proyectista**. En
la práctica también hay **subcontratistas**, de los que el contratista sigue respondiendo ante la entidad. El artículo
exacto de la Ley 32069 sobre subcontratación está por confirmar.

**Consecuencia.**

- Un aporte puede pedirse a una empresa con su función: ENTIDAD, SUPERVISION, CONTRATISTA, **SUBCONTRATISTA** o
  PROYECTISTA.
- Le llega a cualquiera de esa empresa en la obra, y entrega quien la represente, con su nombre.
- SUBCONTRATISTA no existe hoy como función: hay que añadirla a la lista cerrada (es una migración pequeña).

### 2.9 · Color por persona, nunca solo color

**WCAG 1.4.1** prohíbe que el color sea el único medio de información. Uno de cada doce hombres tiene alguna forma de
daltonismo.

**Consecuencia.** El color por persona en cada plano (hasta 10, de la paleta) va **siempre con las iniciales** en la
etiqueta de la nube. El tipo de cambio va con su **signo**.

### 2.10 · Plazos: observación técnica ≠ consulta legal

El Reglamento de la Ley 32069 fija plazos para actos formales. Por ejemplo, la **consulta** del art. 190: 5 días para la
supervisión y 10 para el proyectista. Una observación técnica de revisión de planos **no es** una consulta de obra.

**Consecuencia.**

- El plazo de una nube lo fija **quien la pide**.
- Si la observación es en realidad una **consulta de obra**, debe ir por su camino formal: el cuaderno o la RFI, con su
  plazo legal.
- La incidencia puede enlazarla, pero **no sustituirla**.

### 2.11 · Interoperabilidad: BCF

Los equipos que producen trabajan en Revit, Civil 3D, Navisworks y Tekla. El estándar abierto para llevarles las
incidencias es **BCF 3.0** de buildingSMART. Un *topic* lleva:

- título, estado, asignado y fecha límite;
- comentarios;
- **puntos de vista**: cámara y captura;
- **referencias a documentos**;
- **temas relacionados**.

**Consecuencia, para más adelante.** Exportar la incidencia a BCF:

| ALEPHIA | BCF |
|---|---|
| la incidencia | un *topic* |
| cada nube | un punto de vista con su captura |
| la vista 3D enviada desde View | un punto de vista con cámara |
| los adjuntos | *document references* |
| las nubes de encargo | *related topics* |

Así el modelador ve la observación **dentro de Revit**.

## 3 · Lo que cambia respecto a lo propuesto el 3-nov

| Punto | Antes | Ahora, con la norma |
|---|---|---|
| Quién ve las nubes de encargo | El revisor, en solo lectura | **Solo el equipo del encargado** (su empresa). El revisor ve el conteo, no el contenido |
| Nivel para levantar incidencias y nubes | Se pensó en «Editar» | **«Ver, descargar y marcar»** (revisar no es editar); «Editar y subir» para el encargado |
| Verificación | «Levantada» al subir la versión nueva | Igual, pero sobre una revisión **compartida para revisión (S3)**, con su código |
| Registro | Historial con fecha y hora | De **solo añadir**, encadenado; firma digital para actos formales, más adelante |

## 4 · Tabla de decisiones

| # | Decisión | Recomendación | Base |
|---|---|---|---|
| D1 | ¿Los papeles son por cargo o por incidencia? | **Por incidencia**: revisor, encargado, aportante y quien verifica | Plan BIM Perú: «son funciones, no cargos» |
| D2 | Nivel para levantar incidencias y nubes | **Ver, descargar y marcar** | ISO 19650: el revisor observa, no modifica |
| D3 | Nivel para ser encargado del plano | **Editar y subir** en la carpeta del plano | Sube la revisión nueva |
| D4 | Nivel para aportar | **Ver** el plano; lo subido va a la carpeta de la incidencia | Lo que se aporta es un contenedor nuevo, no una edición del plano |
| D5 | Quién verifica y cierra | Quien figura en «Verifica» (el revisor) y el **Administrar** de la obra | ISO 5.7; Supervisor BIM |
| D6 | Nubes de encargo, ¿quién las ve? | **El equipo del encargado**; el revisor, solo el conteo | ISO: el WIP es del equipo |
| D7 | Devolver | **Con motivo obligatorio**, en rondas de la misma nube | ISO 5.6.4 y 5.7 |
| D8 | Levantada o no | **Nube por nube**, sobre la revisión nueva compartida (S3), con Comparar versiones | ISO y Guía: la corrección es una revisión nueva del contenedor |
| D9 | Adjuntos | **Siempre documentos de Docs**: subidos a la carpeta de la incidencia o enlazados | Los 6 requisitos del ECD de la Guía |
| D10 | Aportes a empresas | Sí, con las funciones de obra más **SUBCONTRATISTA** (migración pequeña) | Partes designadas (ISO); actores de la Ley 32069 |
| D11 | Color | **Por persona en cada plano** (hasta 10), siempre con iniciales y signo | WCAG 1.4.1 |
| D12 | Registro | Historial **de solo añadir** y encadenado; firma digital para actos formales, más adelante | Gobierno Digital; Ley 27269; AGN |
| D13 | Plazos | Los pone quien pide; la consulta de obra va por el cuaderno o la RFI con su plazo legal | Reglamento Ley 32069, art. 190 |
| D14 | BCF | **Más adelante**: exportar la incidencia a BCF 3.0 | buildingSMART, openBIM |

Con D1 a D13 decididas se puede construir la primera parte:

- la base y el servidor: nubes con clase (observación o encargo), asignación, rondas, verificación y los permisos de la
  tabla;
- la migración: aportes y la función SUBCONTRATISTA.

## Fuentes

- Plan BIM Perú, «¿Qué sabemos sobre los roles BIM?» (MEF): https://www.mef.gob.pe/planbimperu/docs/recursos/info_rolesBIM.pdf
- Guía Nacional BIM, anexo de la RD 0003-2023-EF/63.01: https://www.mef.gob.pe/contenidos/inv_publica/anexos/anexo_RD003_2023EF6301.pdf
- Capacitación MEF sobre roles BIM (2024): https://www.mef.gob.pe/contenidos/inv_publica/docs/capacitaciones/2024/Capacitacion_2024_07_02.pdf
- INACAL aprueba NTP-ISO 19650-1 y -2 (Andina): https://andina.pe/ingles/noticia-inacal-aprueba-normas-tecnicas-para-aplicacion-de-tecnologia-bim-853121.aspx
- ISO 19650-2:2018, índice (iTeh): https://standards.iteh.ai/catalog/standards/iso/a163be64-04f6-48f1-9c38-2350621a9bb6/iso-19650-2-2018
- Guía de ISO 19650 (Catenda): https://catenda.com/wp-content/uploads/2025/04/Guidebook-ISO-19-650.pdf
- BCF 3.0 (buildingSMART): https://www.buildingsmart.org/?p=28407 · novedades: https://github.imc.re/buildingSMART/BCF-XML/wiki/What's-new-in-BCF-3.0 · API: https://github.com/buildingSMART/BCF-API
- Ley de Gobierno Digital, DL 1412: https://busquedas.elperuano.pe/normaslegales/decreto-legislativo-que-aprueba-la-ley-de-gobierno-digital-decreto-legislativo-n-1412-1691026-1/
- Directiva 002-2024-PCM-SGTD, firma digital en entidades públicas: https://portal.ingemmet.gob.pe/documents/59082/1380545/Directiva%20que%20regula%20el%20Uso%20de%20la%20Firma%20Digital%20en%20las%20Entidades%20P%C3%BAblicas%20-%20002-2024-PCM-SGTD.pdf
- Ley 32069 y su Reglamento: ver `docs/ECD_REALIDAD_PERUANA.md` (leído entero el 13-oct-2026)
- Procore, flujo de Punch List: https://support.procore.com/faq/what-is-the-punch-list-work-flow

## 5 · Construido: primera parte, base y servidor (3-nov-2026, en local)

El dueño respondió «vamos», con lo recomendado en D1–D13.

- **Migración 46** (`backend/sql/46_nubes_de_issue.sql`, con su rollback), aditiva:
  - la tabla `doc_issue_nubes`: la app puede leer, insertar y actualizar, **no borrar**;
  - el tipo `NUBE` en `encargos`;
  - la función `SUBCONTRATISTA` en `project_companies`.
  - El manifiesto congelado ya declara las dos listas ampliadas: **se aplica ANTES de desplegar el backend**, o el
    backend no arranca.
- **`backend/nubes_de_issue.py`**: papeles por incidencia (D1), actos y transiciones, rondas (D7), «por verificar»
  derivado de la incidencia corregida (D8), visibilidad de las nubes de encargo (D6) y la pelota.
- **`GET/POST /api/issues/<id>/nubes`**: una sola ruta (el techo del perfil portal pasa a 315). Los actos son crear
  (encargo), asignar (persona o empresa), entregar (documentos de Docs y notas, nada externo, D9), aceptar, devolver
  (con motivo) y verificar (levantada o no levantada, con la versión).
- **«Mi trabajo»**: el aportante recibe un encargo `NUBE` («Aportar en ISS-002: …»), que lleva a la incidencia y a su
  plano. La conciliación lo entiende.
- **Cerrar la incidencia** exige todas sus nubes de observación levantadas, también las que nadie tocó. Pero solo si la
  incidencia usa las nubes: las de antes se siguen cerrando como hoy, hasta que el panel tenga la pestaña Nubes.
- **Marcar y levantar una observación del plano** exigen «Ver, descargar y marcar» en la carpeta (D2). La obra sale del
  nodo, no del cuerpo de la petición.
  - **Cambia lo de hoy:** quien tenga solo «Ver» o «Ver y descargar» deja de poder marcar.
  - El administrador de la obra atraviesa los permisos de carpeta, como siempre.

**Pruebas:**

- La suite da 2606 pasan y 1 falla; el fallo ya existía y no tiene que ver (`test_reconstruccion_desde_cero`).
- `tests/test_nubes_de_issue.py`, 14/14:
  - papeles;
  - cada acto con su dueño;
  - rondas;
  - verificar solo con la versión corregida y solo el revisor;
  - el revisor no ve el WIP;
  - la pelota;
  - entregas solo de Docs;
  - el nivel de marcar con la obra del nodo;
  - la conciliación de `NUBE`;
  - Mi trabajo;
  - la función SUBCONTRATISTA en código, migración y manifiesto.
- **Banco con PostgreSQL real, la migración aplicada como `ecd_migrator` y la app como `ecd_app`: 30/30**
  (`scratchpad/ensayo_nubes.py`). El recorrido:
  1. Ana (revisora, «marcar») levanta una observación con 2 nubes.
  2. Luis (encargado, «Editar») asigna una a Mario; Ana no puede asignar.
  3. Mario tiene su encargo, entrega una foto de Docs y una nota; un enlace externo se rechaza.
  4. Luis devuelve sin motivo (no se puede); devuelve con motivo y se abre la ronda 2 en la misma nube.
  5. Mario vuelve a entregar y Luis acepta.
  6. Verificar antes de la versión corregida da 409.
  7. Luis declara corregida.
  8. Ana marca la nube 1 levantada; el encargado no puede verificar.
  9. Cerrar con la nube 2 sin tocar da 409. Esto lo destapó el banco: la primera versión solo contaba las nubes con
     fila y la incidencia se cerraba.
  10. Ana marca la nube 2 levantada.
  11. Luis crea una nube de encargo colgando de la 1; Ana no la ve, solo el conteo.
  12. La incidencia se cierra.
  13. `ecd_app` no puede borrar nubes.
  14. El historial de la incidencia lo cuenta.
- Mario («Ver») no puede marcar ni levantar observaciones: 403.

**Falta, en este orden:**

1. **La parte 2: el panel.** Pestañas Incidencia · Nubes · Historial; al pulsar una nube se abre su ficha; asignar,
   entregar (subir a Docs o enlazar de Docs), aceptar, devolver y verificar.
2. **La hoja**: color por persona, encargos discontinuos y leyenda.
3. **La verificación** con Comparar versiones encuadrado en la nube.
4. **Desde View.**
