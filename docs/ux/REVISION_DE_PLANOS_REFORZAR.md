# Reforzar el estuche del lector para revisar a quien sube los planos — INVESTIGACIÓN Y PROPUESTA (29-oct-2026)

Solo análisis, sin código. El dueño, con la captura del estuche (Mover · Medir · Área · Contar · Nube · Flecha · Texto
· color · Foto · Sello · Borrar marca): «quiero reforzar estas herramientas para poder revisar a las personas que suben
estos planos. ¿Cómo podríamos mejorar?».

Regla: **integral, no puntual**. Todo lo que sigue vale para cualquier obra y disciplina, y lo que es criterio de la
obra lo configura la obra.

## 1 · Lo que ya existe (leído en el código; casi todo en local, sin publicar)

| Pieza | Dónde | Estado |
|---|---|---|
| Estuche: medir, área, contar, nube, flecha, texto, foto y sello | `PDFViewer.jsx`, `PdfToolsOverlay.jsx` | Publicado en parte; foto, referencias y sello en local |
| **Observación desde una marca**, con responsable, plazo, actos (crear → declarar corregida → verificar, reabrir o anular), comentarios que solo se añaden y aviso en «Mi trabajo» | `ObservacionDeMarca.jsx`, `routes/pdf_tools.py`, migración **37** | En local; **la 37 sin aplicar** |
| Marcas por versión | migración **36** | **Sin aplicar** |
| Comparar dos versiones: superposición (A en rojo, B en azul) y lado a lado | `PdfCompareView.jsx` | En local con cambios |
| Foto como documento, referencias, «Citado en», sello como nota | `MarcaConEnlace.jsx` | En local |
| Cajetín, vigencia y sustento de metrados por ítem (estándar LDA) | `CajetinDelDocumento.jsx`, docs/ux/LECTOR_ALEPHIA_ESTANDAR.md | En local |
| Decidir una revisión desde el lector | docs/ux/C2_DECIDIR_DESDE_EL_LECTOR.md | Hecho |
| Contrato de **rondas** de revisión | docs/reviews/E3_CONTRATO_RONDAS.md | Escrito, esperando R1–R14 |

**Lo que falta no son más formas de dibujar.** Falta lo que un revisor usa todos los días para **revisar el trabajo de
otro**:
- verlo todo junto;
- llevarlo por rondas;
- comprobar la corrección en la versión nueva;
- revisar siempre con el mismo criterio;
- entregar el resultado.

## 2 · Qué hacen los referentes (leído)

| Referente | Lo que aporta al revisor |
|---|---|
| **Bluebeam, lista de marcas** (ayuda oficial, leída) | Una tabla con una fila por marca: columnas que se muestran, ocultan y reordenan, **columnas propias**, **estados propios**, filtro por autor y estado, orden por cualquier columna y por página, y un **resumen exportable** (CSV, XML o PDF) con las columnas, el filtro y el orden que elijas |
| **Bluebeam, comparar documentos frente a superponer** (ayuda oficial, leída) | **Comparar** crea un PDF nuevo con **nubes naranjas en cada diferencia**, que pasan a la lista de marcas para seguirlas. **Superponer** pone cada versión en una capa de color. Se alinean por página, automático, tres puntos o **una sola zona**. Se recomienda combinarlos: nubes encima de la superposición |
| **Autodesk Docs, revisiones** (ayuda oficial, leída) | **Las marcas del revisor son privadas hasta que las publica**. Sellos (aprobado, borrador, rechazado) que no crean versión. Comparar versiones dentro de la revisión. Comentarios por archivo. El aprobador decide el estado de cada archivo, y puede **llevar las marcas publicadas** al archivo aprobado. Informe exportable a Excel con todos los comentarios |
| **Autodesk Docs** (comunidad) | Las marcas **pasan de una versión a la siguiente** hasta que se archivan (*slip sheet*); las incidencias son lo formal, con responsable y plazo |
| **Práctica peruana** (informes de levantamiento de observaciones: Peru LNG / MINEM, MTC, municipalidades, TdR con plazos) | Las observaciones van en **rondas ligadas a un informe oficial** (n.° y fecha). Cada **observación conserva su número** de ronda en ronda, con su respuesta, dónde se corrigió y si quedó **absuelta, parcialmente absuelta o no absuelta**. El consultor tiene un **plazo** desde la recepción, y la supervisión verifica que se levante todo |

## 3 · Propuesta: seis refuerzos, en orden

### R1 · Panel «Observaciones» y la matriz exportable

- **En el lector**, un panel con **todas las marcas y observaciones del documento** (y, desde la obra, de todos los
  documentos). Columnas:
  - número, hoja, miniatura de la zona;
  - tipo o disciplina, autor, responsable;
  - estado, plazo, días que quedan o «vencida»;
  - ronda.
- **Filtros y orden** por cualquiera de ellas. Clic en una fila = ir a la marca. **Siguiente y anterior** observación
  con el teclado.
- **Matriz de observaciones exportable** (Excel y PDF), que es lo que se entrega en la obra pública peruana. Por fila:
  - n.°, lámina o documento y versión, **recorte de la zona**;
  - observación, responsable, plazo;
  - **respuesta**, **documento corregido**, **estado** (absuelta, parcial o no absuelta) y **conformidad**.
  - **Las columnas las elige la cuenta**: plantilla de la matriz por cuenta, sin criterio en el código.
- La matriz sale **con huella** (cadena sellada), como todo lo emitido.

### R2 · Rondas de revisión

- Las observaciones de una entrega se agrupan en una **ronda**, con su **n.° de informe o carta**, fecha y **plazo**
  (días hábiles o calendario: ya existen los días hábiles).
- Al **emitir la ronda**, sus marcas pasan de **borrador privado del revisor** a publicadas, como en Autodesk Docs.
  Así el autor no ve la revisión a medias, que es también la regla tipo Aconex del doc 47.
- La **ronda siguiente** hereda las observaciones **no absueltas** con **el mismo número**, que es la trazabilidad que
  pide la práctica peruana.
- Contadores: abiertas, absueltas, parciales y nuevas por ronda.
- Encaja con el contrato de rondas de Revisiones (E3), que espera las decisiones R1–R14.

### R3 · Verificar la corrección en la versión nueva

- Cuando llega la versión nueva, las marcas con observación **se llevan a la nueva versión en la misma posición**
  (*slip sheet*), con aviso si la hoja cambió de tamaño.
- **Vista de verificación de una observación**: la **zona** de la versión anterior y la misma zona de la nueva, lado a
  lado, con la **diferencia solo de esa zona** (comparar por zona, como Bluebeam). Ahí mismo: **Verificar y cerrar** o
  **Reabrir con motivo**.
- Así el revisor no busca a ojo qué cambió: va de observación en observación y decide.

### R4 · Comparar con nubes automáticas

- En la comparación de versiones que ya existe, **detectar las zonas que cambiaron** y proponerlas como nubes.
- El revisor **acepta** las que importan (pasan a ser marcas, y pueden pasar a observación) y **descarta** el resto.
- Un resumen: «la versión 3 cambia 7 zonas en 2 hojas».
- Se detecta por **diferencia de píxeles** entre las dos hojas ya dibujadas, con una regla a la vista (tamaño mínimo
  de zona y tolerancia). Sin IA.

### R5 · Estuche y lista de verificación de la cuenta

- **Marcas tipo** definidas por la cuenta o la obra (como el *Tool Chest* de Bluebeam): «Observación de estructuras»
  con su color, disciplina y frase base. El revisor elige la marca tipo y no tiene que configurar nada.
- **Frases frecuentes** de la obra: «No coincide con el metrado», «Falta cota», «Detalle incompleto»…
- **Lista de verificación por tipo de documento** (plano de estructuras, memoria, metrado): el revisor marca cada
  punto como cumple, no cumple o no aplica. **Cada «no cumple» abre una observación** ya llena.
- La lista **la sube la cuenta**, como el itemizado; ninguna lista va en el código.

### R6 · Medir para revisar metrados

- **Medir, Área y Contar** ya existen. Falta **compararlo con lo declarado**: el revisor mide sobre el plano y el
  lector le dice **la diferencia** con el metrado de esa partida (sustento LDA o Planilla), en cantidad y en %.
- Con un clic, la diferencia pasa a observación, con la medición como evidencia.
- Enlaza con la auditoría de metrados (doc 39).

## 4 · Lo que no se hace

- No se añaden más formas de dibujar. Las que hay bastan; el valor está en gestionar la revisión.
- El sello sigue siendo una nota: **la aprobación va por Revisiones**. Es una decisión tuya del 16-oct.
- Sin IA en la detección de cambios ni en las frases: reglas explicadas y lo que configura la cuenta.

## 5 · Antes de construir

1. **Aplicar las migraciones 36 y 37** (marcas por versión y observación de documento), primero en local y después en
   producción como `ecd_migrator`, cuando tú lo decidas. R1–R3 se apoyan en ellas.
2. Probar en el banco lo que ya está en local (observación desde una marca, foto, referencias, sello, comparar). No se
   construye encima de algo que nadie ha visto funcionar.

## 6 · Decisiones del dueño

1. ¿El orden **R1 → R6**? Mi recomendación: empezar por **R1 (panel y matriz)** y **R2 (rondas)**, que es lo que se
   entrega en obra pública.
2. La **matriz**: ¿con qué columnas por defecto? Propuesta: las de la práctica peruana (§2), y que cada cuenta pueda
   cambiarlas.
3. ¿Las marcas del revisor son **privadas hasta emitir la ronda**, como en Autodesk Docs?
4. ¿Aplicamos primero las migraciones 36 y 37 y probamos lo que ya está en local?

## Fuentes

- Bluebeam:
  - [lista de marcas](https://support.bluebeam.com/revu/how-to/track-and-manage-markups-using-markups-list.html) (leída)
  - [comparar documentos frente a superponer páginas](https://support.bluebeam.com/revu/features/compare-documents-vs-overlay-pages.html) (leída)
  - [columnas propias](https://support.bluebeam.com/online-help/revu21/Content/RevuHelp/Menus/Window/Panels/Markups/Custom-Columns--MT.htm)
  - [ordenar y resumir](https://support.bluebeam.com/online-help/revu20/Content/RevuHelp/Menus/Window/Panels/Markups/Organizing-and-Summarizing-Results.htm)
- Autodesk Docs:
  - [revisar y aprobar](https://help.autodesk.com/view/DOCS/ENU/?guid=Reviews_Review_and_Approve) (leída)
  - [revisiones en la versión para gobierno](https://help.autodesk.com/view/DOCSGV/ENU/?guid=Review_Approve_Documents_Docs_Gov)
  - [marcas frente a incidencias (comunidad)](https://forums.autodesk.com/t5/bim-360-support-forum/difference-between-markups-and-issues/td-p/7758821)
- Práctica peruana:
  - [Peru LNG / TEMA, levantamiento de observaciones, segunda ronda](https://perulng.com/wp-content/uploads/2024/02/Segunda-ronda-de-observaciones-1.pdf) (leído en parte)
  - [MTC, informe técnico con observaciones absueltas](https://cdn.www.gob.pe/uploads/document/file/3318102/ITL%20N%C2%B0098-2022-MTC-16.02.RGC.WAYQ.pdf.pdf?v=1656461660)
  - [Municipalidad de Miraflores (Arequipa), levantamiento de observaciones](https://www.munimiraflores-arequipa.gob.pe/wp-content/uploads/2019/04/Levantamiento-de-Observaciones-1.pdf)
  - [TdR con plazos de revisión y levantamiento (FZS Perú)](https://peru.fzs.org/wp-content/uploads/2025/05/tdr-expediente-te%CC%81cnico-pvc-inaroato_construccio%CC%81n.pdf)
- ALEPHIA:
  - docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md
  - docs/ux/ACC_LECTOR_MARCAS_FOTO_REFERENCIA.md
  - docs/ux/LECTOR_ALEPHIA_ESTANDAR.md
  - docs/reviews/E3_CONTRATO_RONDAS.md
