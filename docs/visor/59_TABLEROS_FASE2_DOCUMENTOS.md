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
