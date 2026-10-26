# 27 · Filters y Planilla: quién hace qué (24-oct-2026)

SOLO ANÁLISIS. Pregunta del propietario: «también tenemos Filters, ¿o tendrían funciones
distintas? Ordenémonos».

## 1 · Lo que hace cada uno hoy (leído en el código)

| | **Filters** (panel lateral, CLOSED) | **Planilla** (panel inferior) |
|---|---|---|
| Sobre qué trabaja | **todo el modelo**: facetas por propiedad, Sources, ocultos | **las filas que Filters deja pasar** (`filterInventoryRows`) |
| Acotar | facetas (O dentro de una propiedad, Y entre propiedades) | filtros de la tabla, buscador, «solo con metrado», «filtrar selección» |
| 3D: visibilidad | **aísla de forma duradera** (es el estado del visor) | **aísla de forma temporal** una partida o un estado, y al volver deja lo que tenía Filters (`lib/aislamientoTemporal.js`) |
| 3D: color | **color por valor** de una propiedad; color por Source | **color por estado frente al itemizado o por capítulo** (nuevo, P2) |
| Se guarda | sí, en las vistas guardadas | las columnas sí; lo demás no (el itemizado tampoco) |
| Responde | «¿qué parte del modelo estoy mirando?» | «¿cuánto hay, de qué partida y qué falta?» |

El orden ya existe y es un **embudo**: Filters elige → la Planilla cuenta y mide sobre eso.

## 2 · Dónde se pisan

1. **Color.** Los dos pintan el 3D. Solo puede mandar uno a la vez: hoy gana el último y
   Filters lo dice en su línea de estado. La Planilla no lo dice.
2. **Acotar filas.** Siete maneras en cinco sitios (doc 21 §1.2). Filters y los filtros de la
   tabla hacen lo mismo («propiedad · valor»), pero **uno mueve el 3D y el otro no**, y no se
   ve a simple vista.
3. **Aislar.** No se pisan: la Planilla aísla un momento y devuelve lo que tenía Filters
   (medido: lo oculto antes sigue oculto después).

## 3 · Regla propuesta (una frase para cada uno)

- **Filters decide QUÉ se mira.** Es el estado del visor, se guarda en las vistas, y lo que
  aísla o pinta se queda.
- **La Planilla responde CUÁNTO y QUÉ FALTA** sobre lo que Filters deja pasar. Lo que hace en
  el 3D es **momentáneo, para enseñar una respuesta**, y siempre se deshace: nunca cambia
  Filters.

## 4 · Dos formas de llevarlo a la práctica

**A · Sin tocar Filters** (se puede ya, solo en la Planilla):
- Cuando la Planilla pinta o aísla, lo dice en su línea con un «quitar»: «El 3D lo está
  pintando la Planilla (por estado) · quitar».
- Los filtros de la tabla se llaman «**Filtrar la tabla**», y la línea de la Planilla dice
  que no mueven el 3D.
- Una sola línea que enseña todo lo que acota la tabla (doc 21, puntos 6-7).

**B · El color, solo en Filters** (más ordenado; necesita reabrir Filters con tu
autorización):
- La Planilla **publica** sus campos deducidos («estado frente al itemizado», «capítulo»,
  «partida») como propiedades.
- **Filters** los ofrece como cualquier otra faceta: filtrar, aislar y **colorear** desde un
  solo sitio, y se guardan en las vistas.
- La Planilla deja de pintar. Solo conserva el aislamiento momentáneo del clic.

**Recomendación (corregida, ver §6):** la B, bien hecha. La A solo pone avisos sobre dos sistemas que siguen pintando el mismo 3D.

## 5 · Decisión del propietario

1. ¿Te sirve la regla del §3?
2. ¿Vamos con el orden del §6.4, empezando por la migración del itemizado?

---

## 6 · La solución profesional y escalable (pedido del propietario: «debe ser profesional y escalable»)

La A era un parche: avisos y etiquetas sobre dos sistemas que siguen pintando el mismo 3D. La
solución de fondo es la B, bien hecha: **un dato derivado es una propiedad más**, y **un solo
dueño del 3D duradero (Filters)**. Así lo hacen las herramientas serias:
- en Tandem todo es un parámetro, calculado o no;
- en Power BI, una columna calculada se usa en cualquier filtro o gráfico;
- en Navisworks y BIMcollab se filtra y se colorea desde un único sitio.

### 6.1 · Lo que ya existe y lo hace posible (leído en el código)

- **Registro de propiedades**: al cargar el inventario, App publica la lista de propiedades
  (`viewer-schema-extracted`). Ya añade campos que no vienen de Revit, como `Standard::Revit Category`
  y `Avance de Obra::Status`, y Filters los ofrece en su ⚙ como cualquier otro.
- **Revisión del inventario** (`markInventoryRevision`): quien cambia los datos lo declara, y el motor
  de Filters vuelve a calcular con eso. No hay que tocar el motor (CLOSED).

### 6.2 · El diseño

1. **El itemizado de la obra se guarda en Postgres** (P3; migración aditiva con su rollback, con
   versiones). Se carga al abrir la obra, no al abrir la Planilla. Solo se guarda el itemizado: los
   datos del modelo **no se duplican**.
2. **Capa de campos derivados** (`lib/camposDerivados.js`, nueva). Es un registro, y cada campo tiene:
   - nombre y grupo («Planilla»);
   - la **regla escrita**, la misma que se enseña en «cómo se leyó»;
   - de qué depende (el itemizado, versión N);
   - una función pura que lo calcula por fila.

   Se aplica al cargar o refrescar el inventario y al cambiar el itemizado. Escribe los campos en las
   filas, los registra en el esquema y marca la revisión. Los tres primeros:
   - **Planilla › Estado frente al itemizado** (con partida / sub-partida / fuera / sin partida);
   - **Planilla › Capítulo** (código y nombre oficial);
   - **Planilla › Partida** (código del itemizado).
3. **Filters los usa sin cambiar su motor**: filtrar, aislar, **colorear** y **guardar en una vista**,
   y combinarlos con cualquier otra propiedad («capítulo 05 Y paño 3»). Los colores salen de la regla de
   colores de Filters, que se guarda con la vista.
4. **La Planilla deja de pintar.**
   - Se retira su «Colorear 3D» (P2, hecho hoy en local): pasa a ser un enlace que abre Filters con ese
     campo.
   - Conserva lo suyo: contar, medir, «qué falta» y el aislamiento momentáneo del clic, que ya devuelve
     lo que tenía Filters.
5. **Escala**:
   - todo campo derivado futuro entra por el mismo registro, por ejemplo «sin medida nativa», «avance» o
     «metrado del expediente»;
   - el cálculo es lineal (30 ms con 20.000 elementos, medido);
   - si hace falta en el servidor (varias obras, cortes congelados), la misma regla se porta a Python
     porque es una función pura.

### 6.3 · Riesgos, dichos

- Una vista guardada con un filtro por «Capítulo» necesita que el itemizado esté cargado al abrirla:
  por eso el paso 1 va primero. Sin itemizado, el campo sale vacío y Filters lo dice. Hay que probarlo
  con los bancos de Saved Views (CLOSED, sin tocar su código).
- Si el itemizado cambia de versión, las vistas que filtraban por un código que ya no existe muestran
  0. Es correcto, y la versión del itemizado se enseña.

### 6.4 · Orden

1. Migración del itemizado + API + carga con la obra (necesita tu OK; la aplicas tú como
   `ecd_migrator`).
2. Capa de campos derivados, con sus pruebas.
3. Comprobar Filters y Saved Views con los campos nuevos, en sus bancos y en el 5173.
4. Retirar el color propio de la Planilla y dejar el enlace a Filters.

---

## 7 · Hecho (25-oct-2026, en local, sin commit)

Los cuatro pasos del §6.4, con cuidado en cada costura.

### 7.1 · Paso 1 · El itemizado de la obra, guardado y con versiones

**Backend:**
- **`sql/40_planilla_itemizados.sql` + rollback**:
  - aditiva; una fila por versión y una sola vigente por obra (índice único parcial);
  - guarda de rol `ecd_migrator`;
  - sin `DROP` en la ida.
- **`esquema_base.py`**: la misma tabla y el mismo índice para una base nueva. Una prueba compara las
  columnas de las dos.
- **`planilla_itemizado.py`** (puro): valida y normaliza.
  - Código obligatorio y límites de largo.
  - Un **código repetido se rechaza** diciendo cuál.
  - Del archivo se guarda solo el nombre.
  - Huella sha256 de la lista.
- **`routes/planilla.py`** (solo en el perfil del visor; el portal no la sirve):
  - `GET` vigente + historial;
  - `POST` versión nueva (la misma lista no crea otra);
  - `DELETE` quitar (no borra: queda en el historial).

  Seguridad:
  - la obra se resuelve en el servidor;
  - `guardia_de_obra` en las tres rutas;
  - **solo el administrador de la obra** cambia;
  - un bloqueo por obra para que dos cargas a la vez no se pisen;
  - cuerpo de 8 MB como máximo;
  - sin la migración, 503 `MIGRATION_MISSING`.
- Registrado en `politica.py` y añadido a las familias del visor que el perfil portal NO debe servir
  (`test_perfil_portal`).

**Visor:**
- **`lib/itemizadoDeObra.js`** (puro, 18/18): un almacén que carga, guarda y quita. Una respuesta tardía
  de otra obra se descarta, y siempre se usa lo que quedó guardado.
- **`utils/itemizadoDeObraVisor.js`**: la instancia única. App la carga al abrir la obra.
- **La Planilla**:
  - enseña «itemizado de la obra «archivo» · v2 · N ítems», quién y cuándo;
  - cargar otra versión o quitar, solo si administras la obra;
  - quitar pide confirmación.

**No se reutilizaron** `doc_partidas` (pantalla de Docs sin montar, sin versiones) ni
`presupuesto_maestro` (importación atada a un Excel del repositorio, lectura sin guardia).
Unificarlos es una decisión aparte.

### 7.2 · Paso 2 · Campos derivados

- **`lib/camposDerivados.js`** (puro, 16/16): **Planilla › Estado frente al itemizado** y **Planilla ›
  Capítulo**, cada uno con su regla escrita.
  - Se escriben en las filas del inventario en memoria y se quitan sin itemizado: nunca queda un valor de
    otro itemizado.
  - No se guardan en la base.
- **`utils/camposDerivadosVisor.js`**: se aplican en `tagInventory` (el único sitio que publica el
  inventario), **antes** de `inventory-ready`. Así una vista guardada que filtra por ellos los encuentra.
  - Si el itemizado llega tarde o cambia, se recalcula, se marca la revisión y Filters vuelve a calcular.
  - App los añade a la lista de propiedades de Filters.
  - Un itemizado solo se aplica al inventario de su frente.
- **«Partida» no entra todavía**: un elemento puede tener varias, y una faceta de Filters es de un valor
  por elemento. Hace falta decidir cómo se muestra.
- **Rendimiento, de paso**: deducir los roles costaba 3 s con 14.000 elementos × 330 parámetros (datos
  simulados con el itemizado real de PQ-08).
  - `perfilarCampos` ahora recuerda la forma de cada valor distinto y recorre las filas una sola vez.
  - Con eso pasa de 2,5 s a 0,7 s, y la deducción entera a ~1,2 s en ese peor caso, todo denso.
  - **Mismo resultado comprobado**: perfiles y roles idénticos a la versión publicada (`857061ed`), en
    datos densos y dispersos, con y sin itemizado.
- La vista Partidas **reutiliza** esa deducción, hecha sobre todo el inventario. Antes deducía otra vez,
  y sobre lo que dejaba pasar Filters.

### 7.3 · Pasos 3 y 4 · Filters dueño del color; la Planilla deja de pintar

- Se **retiró** el «Colorear 3D» propio de la Planilla (P2 del doc 25):
  - `lib/coloreoTemporal.js` y su prueba, borrados (eran de hoy, sin commit);
  - la escucha en el visor;
  - el evento;
  - los grupos de color de `planillaCobertura`.
- En su lugar, **«Colorear en Filters: por estado · por capítulo»** abre Filters con el campo derivado
  ARRIBA, desplegado y coloreado.
  - Por estado usa los mismos colores con sentido (verde, azul, rojo, naranja), y solo si el usuario no
    puso los suyos.
  - El color se pide cuando la lista de Filters ya incluye el campo, para no adelantarse a su cálculo.
  - Se hace por las puertas públicas de Filters (`theme-property-bucket`, colores por valor): su motor no
    se ha tocado.
- La Planilla conserva lo suyo: contar, medir, «qué falta» y el aislamiento momentáneo del clic.

### 7.4 · Verificado y pendiente

**Verificado:**
- backend `test_planilla_itemizado` 28/28;
- cobertura de autorización, política y perfil portal en verde;
- suite entera: 2.371 pasan y falla 1, la de reconstrucción, que ya fallaba antes;
- visor: 24 bancos en verde, entre ellos `restaurarVistaV2` 150/150, `savedViewV2` 111/111 y filtersCore;
- build OK.

**Pendiente:**
- **La prueba en el visor**: necesita la **migración 40 en tu base local** (y la 29/30 que ya faltaba) y
  el backend :3000.
- **Regenerar `esquema_manifiesto.txt`** con una reconstrucción real sobre base desechable.
- Comprobar en el 5173 que una vista guardada con un filtro por «Capítulo» se restaura bien.
