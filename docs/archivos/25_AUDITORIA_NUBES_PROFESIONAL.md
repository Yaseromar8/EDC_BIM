# 25 · Auditoría de las nubes: qué es modelo y qué es parche (4-nov-2026)

Pedido del dueño: «analiza todo lo que actualizamos últimamente. Necesitamos que lo que hicimos sea profesional,
estándar y escalable. Nada de parches.»

**Alcance.** Los 14 commits de las nubes, de `1adc9b38` a `11d072a4` (rama `publicar-4nov-c`): unas 2.500 líneas
entre servidor, lector de planos y panel de la incidencia.

**Método.**
- Dos revisiones independientes del código de la rama, una del servidor y otra de la pantalla, sin ver la opinión de la
  otra.
- Cada hallazgo grave lo comprobé después en el código. Lo marco **[comprobado]**.
- El resto sale de leer el código y no se ha reproducido en el navegador.

## 1 · Veredicto

**El núcleo del servidor es un modelo, no un parche.** `nubes_de_issue.py` separa la decisión (papeles, tabla de actos,
`puede`, `deudor`) de la base. Las transiciones están declaradas, la base impone sus listas cerradas, la migración 46 es
aditiva y el flujo traslada bien el de Procore (el asignado entrega, el responsable acepta o devuelve, el revisor
verifica).

**Hay seis defectos de integridad en el servidor que un producto profesional no puede llevar** (§2). Ninguno se ve en
el banco con una persona a la vez; todos aparecen con uso real.

**La pantalla se fue construyendo a golpe de corrección visual, y ahí sí hay parches** (§3): reglas que el cliente
vuelve a decidir, tres copias de los datos de la nube que no se avisan entre sí, y eventos que se esquivan unos a otros.
Varios de esos parches son míos, de las dos últimas rondas, y los señalo como tales.

## 2 · Servidor: integridad

| # | Grav. | Qué pasa | Escenario real |
|---|---|---|---|
| S1 | **Alta** [comprobado] | Anular o cerrar una incidencia no cierra los pendientes de sus nubes. `_cerrar_pelota` solo cierra los de la incidencia, y el barrido de encargos los **reabre** porque no mira si la incidencia está cerrada. | Se anula ISS-002 con una nube «Pedida»: a Mario le queda «Aportar en ISS-002» en «Mi trabajo» para siempre. Si actúa, recibe 409 «cerrada». |
| S2 | **Alta** [comprobado] | No hay bloqueo de concurrencia. La nube se lee sin `FOR UPDATE` y `_guardar_nube` reescribe a ciegas `rondas` e `history`, sin comprobar que el estado no haya cambiado (lo mismo con el historial de la incidencia). | Dos personas de la empresa destino entregan a la vez: la segunda borra la entrega de la primera. Aceptar y devolver a la vez: gana el último, pero ya salieron los dos correos. |
| S3 | **Alta** [comprobado] | La visibilidad de las nubes de encargo está en dos sitios que discrepan. El panel las filtra (`visible()`); la hoja (`_con_nube`) pinta a cualquiera su estado, destinatario y color, y `_crear_encargo` publica la marca. | Alguien de otra empresa lee en la hoja «Pedida · Juan» de un encargo interno que el panel le oculta. |
| S4 | **Alta** [comprobado] | El número de la nube es **posicional** y se calcula en tres sitios: `_nubes_de`, `numeros_de_nubes` y el cliente (`findIndex + 1` sobre una lista ya filtrada). | Para quien no ve los encargos, la hoja dice «3» y el panel «2». Si se borra una marca, cambian los números siguientes, también los del historial ya escrito. Procore da a cada ítem un número propio y fijo. |
| S5 | Media-alta [comprobado] | Consultas que no escalan. `m.file_node_id::text = %s` y `n.id::text = %s` anulan los índices; no hay índice sobre `doc_issue_nubes(markup_id)` ni sobre `estado`; el barrido de encargos hace una consulta por nube (N+1). | Con miles de marcas en la obra, cada vez que se abre un plano se recorre `pdf_markups` entera. |
| S6 | Media [comprobado] | Regla con excepción: al verificar, las nubes solo se exigen levantadas **si alguien ya tocó una** (`usa_nubes`). | Una incidencia con nubes que nadie asignó se cierra sin verificarlas. |

**Menores del servidor:**
- **Reglas repetidas a mano.** El barrido repite la lista de estados en vez de usar `deudor()`. El plazo sale de dos
  sitios con criterios distintos. `puede_subir_a_su_carpeta` es una cuarta versión de los papeles.
- **Permiso por nombre de carpeta.** Que se pueda subir a `INCIDENCIAS/<código>/` se deduce del nombre de la ruta
  (D4): es un permiso por convención, no del modelo de permisos.
- **Un mismo dato guardado dos veces.** El destinatario y lo pedido viven en las columnas y otra vez en `rondas[-1]`.
  Una marca puede ser nube de dos incidencias (`UNIQUE(issue_id, markup_id)` en vez de `UNIQUE(markup_id)`).
- **Errores y correo.** Los fallos al abrir o cerrar encargos se tragan con `except Exception`. El correo sale antes
  del `commit`: si algo falla después, llega un correo de un acto que no quedó guardado.
- **Separación de funciones.** Si el encargado se asigna la nube a sí mismo, entrega y acepta su propia entrega.
- **Detalles.**
  - El código HTTP se deduce del texto del mensaje.
  - `vence_en` no se valida.
  - La autoría de una marca se compara por **nombre**, no por id.
  - Los tests solo cubren funciones puras; ninguno toca la ruta, la concurrencia ni el cierre.

## 3 · Pantalla: dónde hay parches

| # | Grav. | Qué pasa | Escenario real |
|---|---|---|---|
| P1 | **Alta** | La misma nube vive en **tres estados del cliente** que no se avisan: la hoja (`markups`), la barra (`useNubeDeLaMarca`) y el panel (`nubes`). | Se asigna en la barra y el panel sigue diciendo «Sin asignar»; se acepta en el panel y la leyenda sigue contando «1 por entregar». |
| P2 | **Alta** | **El cliente vuelve a decidir reglas del servidor.** `incidenciasParaEncargo` reimplementa los papeles (y deja fuera al administrador), `Formulario` supone el papel `encargado`, `debeEntregar` vuelve a filtrar un acto que ya filtra el servidor, la leyenda decide qué está «por entregar», hay un segundo algoritmo de color y `esAutor` compara nombres. *Parte de esto lo añadí yo en `11d072a4`.* | Cada regla nueva hay que escribirla dos veces, y cuando difieren, la pantalla ofrece lo que el servidor luego rechaza. |
| P3 | **Alta** | **Añadir y asignar una nube suelta son dos peticiones.** *Mío, `11d072a4`.* | Si falla la segunda, la nube queda dentro de la incidencia y sin asignar, con solo un aviso. |
| P4 | Media | La selección del lector se reparte entre **efectos que se cierran unos a otros**, cada uno con su excepción. | Con la nube de ISS-A elegida, un clic en el pin de ISS-B deja la barra de A abierta junto al panel de B. |
| P5 | Media | **Eventos esquivados en vez de gestionados.** *Mío, `11d072a4`: la captura de Escape y el contador `vez`.* | Una sola pulsación de Escape puede soltar la nube, cambiar la herramienta y cerrar un menú a la vez. |
| P6 | Media | **Componentes acoplados por el DOM.** La barra mide el carril y el panel con `querySelector` y vuelve a medir a los 400 ms «porque el panel llega después». La leyenda busca su contenedor durante el render. | En una pantalla lenta, la barra queda debajo del panel. |
| P7 | Media | **Geometría a ojo.** *Mío, `11d072a4`: el ancho del rótulo y la barra que encoge al 75 %.* | Un nombre ancho se sale de su rótulo. Al 75 %, los botones quedan en 22,5 px, bajo el mínimo de 24 px (WCAG 2.5.8). |
| P8 | Media [comprobado] | **Los botones de la barra de la nube no muestran tooltip.** Llevan `data-tip`, pero `design/ui/tooltips.js` solo lee `title`. Los `<title>` del SVG (rótulos, pines) siguen saliendo con el aviso nativo del navegador. | Al pasar el ratón por «Asignar», «Comentar» y los demás no aparece nada. |
| P9 | Media | **Accesibilidad.** Nubes y pines no se eligen con el teclado; la barra no recibe el foco; las notas no devuelven el foco; las pestañas no tienen `tabpanel`. | Inalcanzable sin ratón. |

**Menores de la pantalla:**
- **Componentes demasiado grandes.** `PdfToolsOverlay` tiene 1.210 líneas, con funciones inmediatas dentro del JSX.
- **Función copiada.** `iniciales` está repetida en cuatro ficheros.
- **Colores sin tokens.** Hay hexadecimales sueltos en lugar de tokens de `alephia.tokens.css`.

**Lo que está bien en la pantalla:**
- El panel solo muestra los actos que da el servidor, y el servidor valida cada uno con 403/409.
- El color por persona y el número los calcula el servidor (lo que falla es que el cliente los recalcula en otra parte).
- El aviso `alephia:comparar-nube` desacopla el panel del lector.
- El cambio de tooltips (manda el de dentro, ancho máximo con tokens) es correcto.

## 4 · El arreglo de fondo, por fases

Cada fase se cierra con su prueba y se publica por separado. Nada de esto cambia lo que el dueño ya decidió: colores,
lista sin fechas, asignar desde la barra, entrega como respuesta.

### Fase 1 · Integridad del servidor (S1–S6). Lleva la migración 47.

1. **El cierre de una incidencia cierra sus nubes.**
   - Al anular o cerrar, sus nubes pasan a un estado terminal y se cierran sus pendientes, en la misma transacción.
   - `deudor()` recibe el estado de la incidencia (cerrada = nadie debe nada).
   - El barrido filtra las incidencias cerradas.
2. **Concurrencia.**
   - Cada acto bloquea su nube (`SELECT … FOR UPDATE`) y guarda solo si el estado y la ronda son los que leyó (`UPDATE …
     WHERE estado = %s AND ronda = %s`, comprobando las filas afectadas).
   - Si no coinciden, responde 409 «la nube cambió, vuelve a cargar».
   - El historial se añade (`history || %s::jsonb`), no se reescribe.
   - El correo sale **después** del `commit`.
3. **Una sola proyección de visibilidad**, que usan la hoja y el panel.
4. **Número propio y estable** (migración 47, la aplica el dueño como `ecd_migrator`):
   - una columna `numero` que se asigna al crear la fila, con `UNIQUE(issue_id, numero)`;
   - las filas se crean al levantar la incidencia, y desaparecen las nubes «virtuales» y la excepción `usa_nubes` (S6);
   - las incidencias existentes se rellenan en la migración, con el orden de hoy.
   - **Antes de la 47**, comprobar en producción que ninguna marca sea nube de dos incidencias, para poder pasar a
     `UNIQUE(markup_id)`.
5. **Índices y tipos nativos.**
   - Índices sobre `doc_issue_nubes(markup_id)` y sobre `estado` para los pendientes.
   - Comparaciones sin `::text`.
   - El barrido, con una sola consulta en vez de una por nube.
6. **Las reglas en un solo sitio.**
   - El barrido usa `deudor()`; un único plazo.
   - Códigos de error enumerados; `vence_en` validado.
   - Autoría por id.
   - Tests de la ruta: cierre, carrera y visibilidad.

### Fase 2 · El cliente solo pinta (P1–P3, P8)

7. **El servidor da todo lo que la pantalla necesita.**
   - Por nube: `numero`, `actos`, la acción principal y si cuenta como pendiente.
   - Por marca suelta: a qué incidencias puede unirse y qué puede hacer quien mira.
   - Se borran del cliente `incidenciasParaEncargo`, `debeEntregar`, la cuenta de la leyenda, el segundo color y `esAutor`.
8. **«Añadir y asignar» es un solo acto del servidor**, en una transacción.
9. **Una sola fuente de las nubes del plano** (un contexto con caché por incidencia, que se invalida tras cada acto). La
   hoja, la barra, el panel y la leyenda leen de ella: lo que cambia en un sitio se ve en todos.
10. **Un solo sistema de tooltips.** `tooltips.js` atiende `data-tip` y los rótulos del SVG; se quitan los `<title>`
    nativos.

### Fase 3 · Interacción estándar (P4–P7, P9)

11. **Una máquina de selección del lector** (un reducer): ninguna · marca · nube con su incidencia · incidencia · alta
    con pin. La barra y el panel salen de ella. Sustituye a `esNubeConPanel`, `cargadoDe`, `vez` y los contadores `n`.
12. **Capas descartables**, el patrón de los sistemas de diseño: Escape y el clic fuera cierran solo la capa de arriba.
    Sustituye a `AISLADO`, la captura de Escape y el `setTimeout(0)`.
13. **Posicionamiento.**
    - El lector reserva el hueco del panel en su maquetación.
    - La barra se coloca con medición real (`ResizeObserver`) en vez de `querySelector` y esperas.
    - Los rótulos se miden en vez de estimarse.
14. **Accesibilidad.**
    - Nubes y pines elegibles con el teclado; foco gestionado en la barra y las notas; pestañas completas.
    - La barra **no encoge** por debajo de su tamaño (lo que encoge al alejar es lo que está sobre la hoja: trazo y
      rótulos), como ACC y Procore.
15. **Orden.**
    - `PdfToolsOverlay` partido en piezas (`RotuloDeNube`, `LeyendaDeNubes`, `useSeleccionDelLector`).
    - `iniciales` en un solo módulo.
    - Una paleta de personas en los tokens.

## 4 bis · Fase 1 hecha (4-nov-2026, en local)

**Qué quedó**

| # | Antes | Ahora |
|---|---|---|
| S1 | Al cerrar o anular la incidencia, los pendientes de sus nubes quedaban abiertos y la conciliación los reabría. | `deudor()` no da a nadie con la incidencia cerrada. Verificar, anular y reasignar sincronizan los pendientes de sus nubes en la misma transacción. La conciliación usa la misma regla. |
| S2 | Sin bloqueo: dos actos a la vez se pisaban. | Toda ruta que escribe lee la incidencia con `FOR UPDATE`. El historial se añade en la base (`history \|\| evento`). El correo de los pendientes de nube sale después del commit. |
| S3 | La hoja enseñaba lo que el panel ocultaba. | La hoja usa la misma regla que el panel (`papeles` + `visible`). Una nube de encargo que alguien no ve tampoco sale en su hoja, ni su marca. |
| S4 | Número posicional, calculado en tres sitios. | Columna `numero` que pone la base (disparador) y que la app no puede reescribir. Las filas nacen con la incidencia (en las tres altas) y desaparecen las nubes virtuales. |
| S5 | `::text`, sin índices, N+1. | Comparaciones sin conversión. Índices por marca y por estados con deudor. La conciliación de nubes hace tres consultas, no una por nube. |
| S6 | Excepción `usa_nubes`. | Una sola regla: toda nube de observación levantada antes de cerrar. |
| — | El código HTTP salía del texto del error; el plazo, de dos sitios; «el revisor no aporta», en dos sitios; la carpeta de la incidencia, con su propia versión de los papeles; `vence_en` sin validar. | Negativas con tipo (`Motivo`) y su código; `plazo()`, `es_revisor()` y `papeles()` únicos; fecha validada (400). |

**Piezas nuevas**
- `backend/almacen_de_nubes.py`: lo único que lee y escribe `doc_issue_nubes`.
- Migración `47_nubes_numero_estable.sql`, con su rollback.
- `encargos.cerrar_uno`.

**Probado**
- Suite del backend: 2614 pasan. Se excluye `test_reconstruccion_desde_cero::test_el_bootstrap_cubre_las_tablas…`,
  que falla igual en origin/main limpio.
- Tres pruebas que simulaban la base respuesta a respuesta se ajustaron a las dos consultas nuevas del alta, y ahora
  comprueban además que la nube nace con su fila. El de comentar comprueba que el historial se añade y no se reescribe.
- Migración 47 aplicada dos veces a la base desechable como `ecd_migrator`:
  - ninguna nube sin número y ningún número repetido;
  - disparador e índices creados;
  - la app no puede actualizar `numero`;
  - los números de antes se conservan.
- Ensayo de la fase 1 contra PostgreSQL y las rutas reales: **22/22**.
  - Las nubes nacen con fila y número, y asignar no renumera.
  - La hoja y el panel dan el mismo número.
  - La nube de encargo, oculta a quien no la ve, en la hoja y en el panel.
  - **Dos entregas a la vez:** con la incidencia bloqueada desde fuera, las dos esperan; al soltarla, una entra y la
    otra recibe 409; no se pierde ninguna entrega y el historial cuenta una.
  - El correo sale con el encargo ya guardado (lo ve otra conexión).
  - Reasignar pasa lo entregado al encargado nuevo sin volver a avisar lo que no cambió.
  - Anular cierra todos los pendientes de sus nubes, y la conciliación no los reabre.
  - Un plazo que no es fecha da 400.
- Ensayo de nubes de antes: 51/51. Ensayo de la carpeta de la incidencia: 12/12.

**Cambios que el dueño notará**
1. Las incidencias corregidas de antes de la 46 también piden verificar nube por nube: la 47 les crea sus filas.
2. Quien no es del equipo deja de ver en la hoja las nubes de encargo de otro equipo.
3. El administrador ya no entrega por otro, y al entregar se avisa al encargado (viene de `11d072a4`).

**Publicar** (sin cambios en el portal: el visor publicado sigue funcionando con este backend)
1. Migración 47 como `ecd_migrator`.
2. Desplegar el backend.
3. **Volver a aplicar la 47.** Es repetible: crea las filas de las incidencias que el backend anterior dio de alta
   entre medias.

**Queda para después**
- La autoría de la marca, todavía por nombre: va con la fase 2, cuando la pantalla deje de comprobarla.
- El permiso de la carpeta de la incidencia, todavía por nombre de ruta: decisión 5.
- Las tablas hijas de rondas.
- Llevar el ensayo de la fase 1 de la base desechable a `backend/herramientas/`: hoy corre contra el banco.

## 5 · Lo que tiene que decidir el dueño

1. **El commit `11d072a4` (aún sin push).**
   - Arregla defectos que vio en producción: el administrador ya no entrega por otro, se avisa al encargado, el pin lleva
     a su información y la hoja ya no se tiñe de azul.
   - Pero añade tres de los parches señalados: P3, P5 y P7.
   - Recomendación: **no publicarlo así**, sino rehacer esas tres piezas dentro de las fases 2 y 3 y publicar la fase 1
     primero.
2. **Migración 47** (número estable, índices, unicidad de la marca), que aplica él.
3. **La barra al alejar.** El estándar es que la barra mantenga su tamaño. Si se encoge, se pierde el mínimo de
   accesibilidad. Que confirme que lo que le molestaba era lo dibujado sobre la hoja.
4. **Separación de funciones.** ¿Puede el encargado asignarse una nube a sí mismo y aceptar su propia entrega? En ACC y
   Procore quien aprueba no es quien entrega. Recomendación: no.
5. **La carpeta de la incidencia.** Permiso explícito creado con la incidencia, en lugar del permiso por nombre de
   carpeta.
