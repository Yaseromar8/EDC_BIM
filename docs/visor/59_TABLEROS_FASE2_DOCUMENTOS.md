# 59 · Tableros de Docs, fase 2: documentos en el tablero

31-oct-2026. El dueño: «vamos a fase dos, con cuidado y profesionalismo». Lo que pidió al principio: «poder cargar y
jalar planos, CAD, Revit, como ACC».

## 1 · Qué hace ACC (doc 54 §7–§8)

- Paleta izquierda **Data Management**: «Visualizados recientemente» y un selector del proyecto con selección
  múltiple (el suyo, antiguo y en inglés).
- La **tarjeta** de un documento (`docs-pdf`, `docs-autocad`, `docs-rvt`…) guarda la **versión** y el **documento**
  (linaje), la página, el nombre, el número de versión y la fecha; carga la imagen por calidades (borrosa → nítida).
- Al elegirla, **barra contextual**: candado · V1 ▾ · abrir · ◀ 3/4 ▶ · pantalla completa · ⋮.
- Encima se anotan nubes, flechas y notas.

## 2 · Lo que ya tenemos y se reutiliza (sin rutas nuevas)

| Necesidad | Lo que existe |
|---|---|
| Elegir documentos de la obra | `/api/docs/list` (carpetas) y `/api/docs/search` (buscar), con los permisos de Docs |
| «Recientes» | `/api/docs/search?vista=…` (vistas de obra): se añade la vista **«Actualizados recientemente»** |
| Imagen nítida de un PDF | `/api/docs/vista-previa/url` (2.000 px por versión, con la puerta del PDF) |
| Miniatura de imagen o PDF | `/api/docs/miniaturas/urls` |
| Abrir el documento | el enlace directo de Archivos (`?obra=…&carpeta=…&documento=…&version=…`) en otra pestaña |

**«Vistos por mí»** (lo de ACC) necesita registrar cada apertura, que hoy no se registra: decisión aparte. Mientras,
«Actualizados recientemente» de la obra, que es honesto con el nombre.

## 3 · Alcance de la fase 2, por pasos

**2A · Documentos PDF e imágenes (ahora):**
1. Botón **«Documentos»** en la paleta izquierda: panel con «Actualizados recientemente», explorar carpetas y buscar,
   **selección múltiple**, «Añadir al tablero».
2. **Tarjeta**: imagen nítida de la versión elegida, nombre, versión; tamaño libre conservando la proporción.
3. **Fija a su versión**: si en Docs hay una versión más nueva, la tarjeta lo dice («Hay una versión nueva · V2») y
   se actualiza solo si alguien lo pide.
4. **Doble clic** o «Abrir»: el documento en su versión, en otra pestaña (el tablero no se pierde).
5. Sin permiso sobre el documento: la tarjeta dice «Sin acceso», sin nombre ni imagen.
6. Se busca por el nombre (Buscar del tablero) y entra en la miniatura del tablero.

**2B · DWG y RVT (después):** tarjeta con su tipo y versión que abre el visor; la imagen sale de la vista previa de
Autodesk (necesita una ruta para la miniatura del modelo: se decidirá con el techo de rutas del portal).

**2C · PDF de varias hojas (después):** ◀ página ▶ en la barra de la tarjeta.

## 4 · Cómo se construye

- **Lienzo común** (`design/lienzo`): tipos de elemento **registrables** (el lienzo no sabe qué es un documento; Docs
  le da la pieza que lo dibuja y los botones de su barra), cambio de tamaño por las esquinas conservando la
  proporción, e `insertar(elementos)` para colocarlos en el centro de la vista como un paso de deshacer.
- **Docs**: `TarjetaDocumento` y `PanelDocumentos`.
- Todo en local, con banco y ratón real, antes de pasar al siguiente paso.

## 5 · 2A hecho (31-oct-2026), en local

| Pieza | Dónde |
|---|---|
| Vista «recientes» (no entra en la barra de Archivos ni en los recuentos; permiso solo de los 200 candidatos más recientes; devuelve 30) | `backend/vistas_de_obra.py` (`RECIENTES`, `ACEPTADAS`), `backend/routes/documents.py` (acepta `vista=recientes`) |
| Tipos registrables, esquina con proporción, `insertar()` | `design/lienzo/Lienzo.jsx`, `PiezasLienzo.jsx` (`extra` en la barra), `MenusLienzo.jsx` (etiqueta del tipo en Buscar), `miniatura.js` (hoja blanca con borde) |
| Tarjeta, su barra y el registro | `frontend-docs/src/components/tableros/TarjetaDocumento.jsx`, `tipoDocumento.js`, `documentos.js` |
| Panel «Documentos» | `frontend-docs/src/components/tableros/PanelDocumentos.jsx` |
| Cableado | `frontend-docs/src/components/TablerosModule.jsx` |

**Colocación.** Lo añadido va al centro de la vista; si ahí hay algo, al sitio libre más cercano **pegado** a lo que
estorba (a su derecha o debajo), sin pisar nada; si queda fuera de la vista, la cámara va hasta ello sin acercar.
Lo encontró la segunda captura del banco (el segundo lote caía encima del primero) y la prueba no lo medía: ahora sí.

**Evidencia** (banco: rutas reales de Tableros contra PostgreSQL desechable + rutas de Docs simuladas con 9
documentos, uno sin permiso; Chrome sin ventana, ratón y teclado reales):

| Suite | Resultado |
|---|---|
| Documentos: panel, recientes (8, el reservado no sale), DWG/RVT visibles pero no elegibles, añadir 3, explorar + buscar, sin vista previa, **sin solapes**, **a la vista**, guardado con versión, miniatura, doble clic → enlace de Archivos con su versión, «Abrir», esquina con proporción, V2 → «V1 · hay V2» → «Actualizar a V2» → guardada, sin acceso sin nombre | 21/21, tres veces seguidas |
| Fase 1 otra vez (el Lienzo cambió): dos personas con fusión · barra · menú/organizar/atajos · lista de Docs | 18/18 · 18/18 · 26/26 · 10/10 |
| Bancos node `fusionTablero` · `miniaturaTablero` | 10/10 · 6/6 |
| Backend `pytest -q` | 2470 pasan, 1 falla: `test_reconstruccion_desde_cero` (la conocida del manifiesto, anterior a esto) |

La prueba de documentos fallaba a veces al reabrir el tablero desde la lista (el clic caía mientras la lista se
repintaba): la prueba reintenta la apertura; no es un defecto de la tarjeta.

**Límites conocidos (decisión del dueño):**
1. El **nombre** del documento se guarda en el tablero (lo necesitan Buscar, la miniatura y pegar). Quien no tiene
   permiso sobre esa carpeta ve «Documento sin acceso», sin nombre ni imagen, pero el nombre viaja en los datos del
   tablero. Cerrarlo del todo exige que el servidor lo quite al leer y lo conserve al guardar: se puede hacer si lo
   pide.
2. Con el tablero abierto, una versión nueva subida en ese rato se avisa al reabrirlo (no en vivo).

**Falta:** 2B (DWG y RVT) y 2C (varias hojas).

## 6 · Medido en ACC con cuatro DWG de PQT8 (31-oct-2026, noche)

El dueño añadió cuatro láminas DWG a su panel de PQT8; se observó sin cambiar nada (solo elegir y mover la cámara).

- **Cómo se añaden:** igual que lo nuestro. «Añadir archivo» abre una ventana con el árbol de carpetas y casillas →
  «Open». «Visualizados recientemente» siguió vacío después de añadirlas: no hay arrastre desde una lista.
- **La tarjeta es la lámina sola:** sin cabecera ni nombre, con la proporción de la hoja (sin bandas grises) y una
  sombra suave. Las cuatro quedan en fila, casi tocándose, a un tamaño grande (≈ 3.400 unidades de ancho).
- **«Mostrar como»** (icono de diseño en su barra): «Fijar vista»; «Mostrar sombra» (encendido); **«Mostrar
  metadatos» (apagado por defecto)** con casillas para el icono, el nombre, la versión y la última actualización.
- **Barra de un DWG:** candado · **V1 ▾** (lista de versiones con su fecha: «V1 · 31 oct 2026, 09:48») · «Abrir en
  AutoCAD Web» · «Extraer modelo 3D» · un botón de IA · ◐ · «Mostrar como» · ⧉ · **◀ 4/6 ▶** (las presentaciones
  del DWG) · pantalla completa · ⋮.
- **⋮:** Reordenar, Cortar, Copiar, Duplicar, Pegar, Eliminar, Seleccionar todo, Copiar como, Exportar como, Imprimir.

**Diferencias con lo nuestro (2A):** nuestra tarjeta lleva siempre cabecera y un tamaño fijo con bandas; solo
ofrecemos «Actualizar a V2» en vez de elegir cualquier versión; sin pantalla completa; sin DWG ni varias hojas.
La IA y «Extraer modelo 3D» no se copian (regla del dueño: nada de IA).

### 6.1 · Jalar desde «Visualizados recientemente» (otro panel del dueño, mismo día)

En PQT8 la lista estaba vacía; en el panel de otro proyecto del dueño sí trae archivos, y **desde ahí se jalan**:

- **La lista:** una tarjeta por archivo con su icono (PDF, DWG en rojo, Excel…), el **nombre completo en dos
  líneas** y «Última actualización: 12 oct 2026, 15:57». Son los últimos que **la persona abrió** en Archivos, de
  cualquier tipo; al final, **«Cargar más»**.
- **El gesto:** se coge una tarjeta de la lista; la original se queda en su sitio (realzada) y **una copia
  translúcida de la misma tarjeta sigue al ratón**. Al soltar sobre el tablero, la lámina aparece **donde se soltó**,
  a su proporción, **ya elegida**, y el panel se cierra.
- **Barra de un PDF:** candado · V1 ▾ · IA · ◐ · «Mostrar como» · ⊕ (gris) · pantalla completa · ⋮ (sin «Abrir»).

**Lo nuestro:** no se arrastra (se marca y «Añadir»), y la lista es «Actualizados recientemente» de la obra, no lo
que abrió cada uno. **«Visualizados» no necesita registrar nada nuevo:** cada apertura ya queda en `activity_log`
como `acceso_a_documento` (persona, documento, versión, vía; `registro_de_descargas.py`, con freno por ventana).
Basta leer de ahí los últimos documentos distintos de esa persona en la obra, sin las vías «DENEGADO», y pasarlos
por los permisos de hoy.

## 7 · 2A.1 hecho (31-oct-2026, noche): jalar como ACC, lámina sola, cualquier documento

El dueño: «vamos, eso debe ser para CAD, PDF, Civil y cualquier documento».

| Qué | Cómo |
|---|---|
| **Panel «Documentos»** como el de ACC | «Añadir documentos de Archivos», botón «+ Añadir documento» y **«Visualizados recientemente»**: tarjetas con icono, nombre en dos líneas y «Última actualización: 31 oct 2026, 09:10»; 20 por página y «Cargar más». Escape lo cierra |
| **Visualizados = lo que abrió ESTA persona** | `vistas_de_obra.VISTOS` (`/api/docs/search?vista=vistos&pagina=N`, sin ruta nueva): de `activity_log` `acceso_a_documento`, con la misma identidad que el registro, sin los DENEGADOS, 180 días, 200 candidatos, y por los permisos de hoy |
| **Abrir un DWG/RVT en el visor CAD ya deja rastro** | `routes/docs_cad.cad_status` anota el acceso tras la guardia (vía «visor CAD»), con el freno del registro. Antes, ni la supervisión ni «Visualizados» veían los planos de Autodesk |
| **Jalar** | Copia translúcida que sigue al ratón; al soltar, centrada **donde se soltó**, elegida, y el panel se cierra. Soltada en el propio panel o fuera del tablero: nada. Un clic o Intro: al centro de la vista. A poco zoom, la tarjeta entra a tamaño de pantalla (no de 18 px) |
| **«+ Añadir documento»** | Ventana grande: «Actualizados recientemente» y «Archivos de proyecto» a la izquierda, ruta, buscar, tabla con casillas (Nombre · Versión · Actualizado · Ubicación), «Cancelar» y «Añadir al tablero (N)». **Cualquier tipo** |
| **La lámina sola** | Sin cabecera, con sombra suave; al cargar, **toma la proporción real de la hoja** (`ajustar` del Lienzo: no es un paso de deshacer; Ctrl+Z quita la tarjeta de una vez y Ctrl+Y la devuelve ya proporcionada). «Hay V2» en la esquina si hay versión nueva |
| **PDF sin vista previa** | Lo dibuja **el navegador** con pdf.js (página 1 a 2.000 px), de uno en uno, con «Preparando la vista previa…» y su barra de avance, como el «Preparando 1 páginas…» de ACC. El servidor sigue sin dibujar al abrir (decisión del 14-oct) |
| **DWG, RVT, Excel, Word…** | **Ficha**: icono, nombre, «V1 · Última actualización…», «Doble clic para abrirlo». La imagen de los CAD es el paso siguiente (§8) |
| **Barra** | **V1 ▾** con el historial y su fecha («V2 · 30 oct 2026, 09:48»), «Abrir», **«Mostrar como»** (Mostrar sombra, Mostrar metadatos con Icono · Nombre · Versión · Última actualización; la franja va encima de la lámina, sin taparla) y **pantalla completa** (Escape vuelve) |

**Evidencia** (banco: rutas reales de Tableros contra PostgreSQL desechable, rutas de Docs simuladas con 32
documentos, un PDF real sin vista previa que tarda 1,5 s en llegar, un DWG, un RVT, un Excel y uno sin permiso;
Chrome sin ventana, ratón y teclado reales):

| Suite | Resultado |
|---|---|
| `prueba_documentos2.py`: panel, 20 + «Cargar más» = 31, el reservado no sale, copia translúcida al jalar, cae donde se suelta (±3 px), elegida, lámina sola, proporción 2000×1414, Ctrl+Z/Ctrl+Y, soltar en el panel no añade, DWG y Excel como ficha, clic al centro, PDF sin vista previa → «Preparando…» → dibujado en el navegador y vertical, ventana con casillas y RVT elegible, guardado con `ar` y `fecha`, «Hay V2», V1 ▾ con fechas, V2 elegida, metadatos y sus casillas, Escape, pantalla completa, doble clic al enlace de Archivos, esquina con proporción, sin acceso | **38/38** |
| Fase 1 otra vez (el Lienzo cambió) | 18/18 · 18/18 · 26/26 · 10/10 |
| Node `fusionTablero` · `miniaturaTablero` | 10/10 · 6/6 |
| Backend `pytest -q` (+2 de «vistos», +3 de la apertura en el visor CAD) | 2475 pasan, 1 falla: `test_reconstruccion_desde_cero` (la conocida) |

Errores de la PRUEBA encontrados y corregidos (no del producto): clics en tarjetas fuera de la zona visible de la
lista; un «clic en el vacío» que caía encima del menú abierto y apagaba «Mostrar metadatos» (la comprobación de
«quitar Versión» pasaba por casualidad: ahora exige que el resto de la franja siga); y la ventana quedaba debajo del
editor (z-index 1500 < 9000), esto sí del producto, corregido.

**Abrir un tablero también anota el acceso** a cada lámina que enseña (la vista previa pasa por la misma puerta que
abrir el PDF): es verdad —se entregó la imagen— y por eso aparecen en «Visualizados». El freno del registro evita
repeticiones.

## 8 · Siguiente: la imagen de los CAD (2B)

La traducción de un DWG ya dibuja cada presentación como PDF con el motor de AutoCAD (`1bd162c8`, `vistas_pdf`).
La tarjeta del DWG usará esas hojas: la imagen de la presentación elegida (preparada en el servidor como la vista
previa de un PDF, o dibujada en el navegador) y **◀ 4/6 ▶** en su barra para pasar de una a otra, como ACC. Para el
RVT, sus láminas 2D si las tiene y, si no, la vista 3D que da Autodesk.

