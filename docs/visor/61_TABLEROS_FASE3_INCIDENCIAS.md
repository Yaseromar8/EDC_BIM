# 61 · Tableros, fase 3: incidencias y observaciones en el tablero

31-oct-2026. El dueño: «cerremos el tablero; recuerda que teníamos un plan». Fase 3 del plan (doc 57 §4): tarjetas y
kanban de incidencias.

## 1 · Qué hace ACC (doc 54 §7)

- Botón **Incidencias** en la paleta: un botón principal «Seleccione las incidencias que desee añadir…», «+ Crear
  incidencia» y **«Últimas incidencias»** como tarjetas (número y título, tipo, flujo, fecha o «Sin fecha límite»).
- El selector es una **tabla** (ID, título, estado con su color, tipo, vencimiento, colocación en documento y versión),
  con buscador y filtro; se añaden **«como tarjetas» o «como kanban»** (columnas por estado).

## 2 · Lo nuestro

Mismas piezas y mismas reglas que **«Issues y punch»** (`PunchModule`), no una segunda versión: `PanelIssue` (el
detalle con sus actos), `ModalLevantar` (el alta) y los colores de estado y tipo, que ahora se exportan. Sin rutas
nuevas: `/api/issues`, su catálogo, los miembros y los planos de la obra.

| | Cómo |
|---|---|
| **Panel «Incidencias»** | «Seleccionar incidencias» (principal), «+ Crear incidencia» y «Últimas incidencias» (las 20 con el último movimiento), que **se jalan** al tablero como los documentos (`Arrastrable`, común a los dos paneles) |
| **Selector** | Tabla: Nº · Título · Estado · Tipo · Responsable · Vence (vencida, en rojo); buscar por número, título o descripción; filtros de estado y tipo; elegir todas; **«Añadir como tarjetas (N)»** o **«Añadir como kanban»** |
| **Tarjeta** | Número, estado y tipo con sus colores, título, responsable, «Vence 05 nov 2026» / «Venció…» en rojo / «Sin fecha límite». Barra: «Abrir». Doble clic: su detalle |
| **Kanban** | Columnas Abierto · Reabierto · Corregido · Verificado (Anulado solo si alguna lo está), con su cuenta; cada tarjeta, doble clic al detalle |
| **Estado VIVO** | El tablero guarda solo el id (y el número y el título, en `nombre`, para Buscar). Estado, responsable y vencimiento se leen al abrir y cada minuto con la pestaña a la vista: un acto hecho en otro sitio se ve en la tarjeta y la incidencia **cambia de columna** sola |
| **Detalle y alta** | Encima del tablero (`CapaEncima`: su propio apilamiento sobre el diálogo del tablero y el foco dentro; Supr no borra la tarjeta de debajo). La incidencia creada entra al tablero como tarjeta (`onCreado` ahora la entrega; si se guardó sin conexión aún no tiene número y no entra) |

**Deliberado — no se cambia el estado arrastrando en el kanban** (ACC sí): en ALEPHIA cada cambio es un **acto con
dueño** (corregir lo hace el responsable con su evidencia; verificar, el verificador) y se hace en el detalle, con sus
reglas. Un arrastre no puede pedir evidencia ni comprobar quién es.

**Encontrado al probar (producto):** el panel Buscar del lienzo trata como **sección** todo elemento con `titulo`, así
que una incidencia o un kanban con ese campo no se encontraba por su número. Las piezas de Docs guardan su título en
`nombre` (como los documentos).

## 3 · Evidencia

Banco: rutas reales de Tableros contra PostgreSQL desechable y seis incidencias simuladas (estados distintos, una
vencida) más el alta; Chrome sin ventana con ratón y teclado reales. `prueba_incidencias.py` **21/21**: panel, seis
ordenadas por último movimiento, jalar una (con estado, tipo, título, responsable y «Venció» en rojo), el panel se
cierra, selector (seis, buscar, filtrar por estado, elegir todas), kanban con sus columnas y cuentas, **un cambio de
estado hecho en otro sitio se ve al reabrir y pasa de columna**, doble clic al detalle encima del tablero, Supr no
borra, la × cierra, «Abrir» en la barra, alta desde el tablero que entra como tarjeta, guardado solo con ids, y Buscar
la encuentra por su número. Regresión: documentos, hojas, formas, fase 1.
