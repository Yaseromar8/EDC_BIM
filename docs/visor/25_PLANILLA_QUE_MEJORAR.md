# 25 · Planilla: qué mejorar (investigación, 24-oct-2026)

SOLO ANÁLISIS. No se ha tocado código. Parte de lo que ya está en `main` (`857061ed`):
Elementos, Partidas guiada por el itemizado, aislar como Filters y el recorrido ◀ ▶.
Regla que sigue en pie: **nada de IA**. Todo lo que se propone son reglas fijas sobre
los datos extraídos, que se explican en pantalla.

Los docs 22 (centro de consulta) y 24 (plantillas) ya cubrieron filtros, consultas
guardadas y plantillas. Este doc mira lo que faltaba: **el puente entre el modelo y el
presupuesto**, que es para lo que la Planilla sirve en una obra peruana.

---

## 1 · Cómo lo resuelven los que unen el modelo con el presupuesto

| Herramienta | Qué hace que nos sirva | Fuente |
|---|---|---|
| **Presto + Cost-it** (RIB, España/Latam) | Asocia los elementos de Revit a un cuadro de precios por código. Funciona en los dos sentidos. **Colorea los elementos según el estado del presupuesto** o la línea de medición, y **localiza en el modelo la medición** de una partida. | INESEM; foro de Autodesk; temarios de UPV y Badajoz |
| **CYPE Open BIM Quantities → Arquímedes** | Reglas de medición que pasan elementos del IFC a partidas. **Los conjuntos de reglas se guardan y se usan en otros proyectos.** Importa y exporta el presupuesto en **FIEBDC-3 (.bc3)**. | info.cype.com |
| **Autodesk Assemble** | «Acondicionar» el modelo: poner a los elementos el código que falta y devolverlo a Revit. Con dos versiones publicadas aparece **«Show changes»**: A frente a B, con la diferencia de cantidad en el 3D y en la tabla, y qué se añadió o se quitó. | Autodesk Support; Symetri |
| **Navisworks Quantification** | Catálogo de ítems y recursos con fórmulas. **Medición «virtual»** para lo que no está modelado. **Analizar cambios** cuando llega un modelo nuevo frente a lo ya medido. | Ayuda de Autodesk; AUGI |
| **ACC Takeoff** | **Instantáneas** de la medición y **comparación** de la actual con una anterior, en vista superpuesta y en la tabla. Con la API Model Properties, diferencias entre versiones: añadido, quitado y cambiado. | Blog de Autodesk Construction; APS (mayo 2022) |
| **Perú (S10, Plan BIM, tesis)** | S10 es el programa de presupuestos más usado y no encontré conector con Revit: se pasa por **Excel con códigos de partida**. Una tesis de la PUCP dice que el Reglamento Nacional de Metrados no es interoperable con BIM y propone codificar antes de llevar a 5D. Otra, de la UPeU, compara metrados BIM con los del expediente y encuentra grandes desviaciones en el expediente. | repositorio PUCP; repositorio UPeU |

Lo que se repite en todos y nosotros **no tenemos** todavía:

1. **Ver qué falta** antes de fiarse del total: los elementos sin partida y las partidas
   sin elementos, en el 3D.
2. **Colorear el modelo** por partida o por estado.
3. **Comparar versiones**: qué metrado cambió y por qué elementos.
4. **Que el trabajo se guarde y se reutilice**: nosotros perdemos el itemizado al
   recargar.
5. **Salida a la herramienta de presupuesto** con su misma estructura. En Perú eso es
   Excel ordenado como el itemizado, para S10. En España/Latam CYPE, Presto, BC3.

---

## 2 · Lo que ya tenemos y está a medias (medido en el código)

- El panel «Cómo se leyó» **cuenta** las partidas del modelo fuera del itemizado, las de
  unidad distinta y las del itemizado sin elementos. Son **solo números**: no se pueden
  abrir, recorrer ni aislar (`TablaDePartidas.jsx:60-69`, `planillaItemizado.diferencias`).
- **El itemizado vive solo en el navegador** (`InventoryDataGrid.jsx:368`): al recargar
  hay que volver a cargarlo, y otro usuario no lo ve.
- **El Excel de Partidas** (`planillaPartidas.hojasDePartidas`):
  - agrupa sin los nombres oficiales de capítulo, porque llama a `gruposDePartidas(partidas)`
    sin el itemizado;
  - no incluye las partidas del itemizado sin elementos;
  - en «Criterios» todavía dice «parámetro DSI», que ya no es el criterio. Defecto pequeño.
- **Ya guardamos cada versión del inventario.** `inventory_identity_b1.occurrences`
  conserva las propiedades por `source_urn`, es decir, por versión
  (`sql/31_inventory_identity.sql`). Para comparar versiones **no hace falta extraer de
  nuevo ni migrar**. Falta comprobar con una consulta cuántas versiones antiguas siguen
  guardadas en producción.

---

## 3 · Propuestas, en orden

Cada una dice qué es, de dónde sale y qué cuesta. Ninguna usa IA.

### P1 · «Qué falta»: cobertura del modelo frente al itemizado · solo visor, sin migración
- Una línea arriba de Partidas: **«87 % de los elementos medibles tienen partida del
  itemizado»**. Al pulsarla se abren tres listas recorribles y aislables en el 3D:
  - elementos sin partida;
  - partidas del modelo fuera del itemizado;
  - partidas del itemizado sin elementos («lo que no se modela, o falta parametrizar»).
- Las **23 de unidad distinta** (los buzones en «und»…) salen aquí con un clic, para
  revisarlas una a una.
- De dónde sale: Cost-it «localizar mediciones», Assemble «acondicionar», el control de
  calidad de las tablas de Revit.
- Es lo que da confianza al total: hoy el total puede estar incompleto sin que se note.

### P2 · Colorear el 3D por partida o por estado · solo visor, sin migración
- Dos modos:
  - **por estado**: con partida exacta, subpartida, fuera del itemizado, sin partida;
  - **por capítulo** del itemizado.
- Con leyenda, y la misma regla siempre.
- De dónde sale: Cost-it «colorear por estado del presupuesto», BIMcollab Smart Views.
- Usa los tintes que ya tiene Filters, así que no hace falta otro mecanismo de color en el visor.

### P3 · Guardar el itemizado de la obra · necesita tu decisión y una migración aditiva
- Una tabla, por ejemplo `planilla_itemizados` (obra, versión, ítems JSONB, quién y cuándo).
- Las tres acciones: **cargar, quitar y ver la versión**, con las demás versiones a mano.
- De dónde sale: Tandem y Trimble versionan; CYPE guarda los conjuntos para otros proyectos.
- Sin esto, P1, P2 y P4 hay que rehacerlas en cada recarga.

### P4 · Comparar metrados entre versiones del modelo · backend de solo lectura, sin migración
- Elegir la versión anterior. Por partida, una tabla con:
  - el metrado antes y ahora, y la diferencia **Δ**;
  - los elementos **nuevos, quitados y cambiados**.
- Esos elementos se colorean en el 3D: verde, rojo, ámbar.
- De dónde sale: Assemble «Show changes», Navisworks «Analizar cambios», instantáneas de
  ACC Takeoff.
- Es lo que pide quien valoriza: «¿por qué cambió el metrado de esta partida?».
- Antes hay que comprobar que las versiones antiguas siguen en `occurrences` (punto 2).

### P5 · Excel listo para el presupuesto · solo visor, sin migración
- **En el orden y con los capítulos del itemizado**, incluidas las partidas sin elementos
  (con 0 y su motivo), para pegarlo junto al S10 o al Excel del presupuesto.
- Se corrige de paso lo de «parámetro DSI» en Criterios.
- BC3 solo si alguna obra lo pide. En Perú lo normal es Excel.

### P6 · Metrado del expediente como 4.ª columna, opcional · necesita tu decisión
- Si el Excel trae una columna de metrado, Partidas enseña **modelo frente a expediente**
  y su desviación.
- De dónde sale: la «variance» de Assemble y ACC, y la tesis de la UPeU.
- Tú dijiste «solo ítem, descripción y unidad» para el primer experimento: por eso queda
  como opción, no como cambio.

### P7 · Recetas para lo que no tiene medida nativa · necesita tu decisión
- El encofrado modelado como muro y el peso de la armadura.
- Una **receta visible** por unidad, que confirma el usuario, del tipo «m² de encofrado =
  área de las caras laterales». No se adivina nada.
- De dónde sale: las fórmulas de Navisworks y las reglas de medición de CYPE.
- Ya estaba pendiente en el doc 23 §7-8.

### Después
- **Plantilla reutilizable entre obras**: itemizado más correspondencias confirmadas
  (doc 24 §4).
- **Medir con una obra grande**. Hasta ahora lo mayor ha sido el Canal, con 13.866
  filas.

---

## 4 · Orden recomendado

1. **P1 + P2**: ver qué falta y colorearlo. Solo visor, se prueba en local con tu
   itemizado. Lo vuelve fiable.
2. **P5**: Excel en orden del itemizado. Es pequeño y se usa enseguida.
3. **P3**: guardar el itemizado. Necesita tu OK y la migración.
4. **P4**: comparar versiones. Antes, la consulta de cuántas versiones hay guardadas.
5. **P6 / P7**: según lo que decidas.

## 5 · Decisiones que te tocan

1. ¿Empezamos por P1 + P2?
2. ¿P3 en Postgres (migración aditiva con su rollback)?
3. ¿P6: el Excel puede traer una 4.ª columna de metrado?
4. P7: ¿qué receta para el encofrado y para el peso de la armadura?
5. Siguen abiertos: «Eliminar» para todos en Vistas guardadas y ◀ ▶ sí o no.

## 6 · Qué no sé (dicho, no supuesto)

- No encontré la documentación oficial de Cost-it ni de S10. Lo de Cost-it sale de
  centros de formación y de un foro. De S10 no encontré conector con Revit, y no lo doy
  por inexistente.
- De Assemble y Navisworks, la comparación de versiones viene de distribuidores y de
  ayuda antigua (2014-2020). No sé cómo emparejan los elementos entre versiones. Nosotros
  lo haríamos por `external_id`, que ya es nuestra identidad estable.
- No he consultado la base para saber cuántas versiones antiguas guarda `occurrences`.

## Fuentes

- INESEM, «Cost-it: Revit y Presto»: https://www.inesem.es/revistadigital/diseno-y-artes-graficas/cost-it-revit-presto-bim
- Foro de Autodesk, «Revit - cost-it»: https://forums.autodesk.com/t5/revit-y-forma-foro-en-espanol/revit-cost-it/m-p/8895115
- UPV, curso Revit + Presto Cost-it: https://www.cfp.upv.es/formacion-permanente/curso/revit-presto-cost-it-enlace-modelo-bim-mediciones-presupuestos_61281.html?idioma=es
- CYPE, Open BIM Quantities: https://info.cype.com/en/blog/open-bim-quantities-bill-of-quantities-collected-from-ifc-files/
- CYPE, pestaña «Bill of quantities»: https://info.cype.com/en/product/bill-of-quantities-tab-in-cypes-bim-applications/
- Autodesk Support, «Conditioning Model Data» (Assemble): https://autodesk.com/support/technical/article/caas/tsarticles/ts/6kbcerQkrvgTKZTlKH7qhO.html
- Symetri, «Autodesk Assemble»: https://www.symetri.us/insights/blog/autodesk-assemble/
- Autodesk Help, Navisworks «Quantification workflow»: https://help.autodesk.com/cloudhelp/2020/ENU/Navisworks/files/GUID-95ED5D79-89B6-443D-83C7-61DEF40A13A8.htm
- Autodesk Help, Navisworks «Analyze changes»: https://help.autodesk.com/cloudhelp/2020/ENU/Navisworks/files/GUID-C72C0B43-D464-484C-B83C-341257CF0B29.htm
- AUGI, «Navisworks Takes Off»: https://augi.com/articles/detail/navisworks-takes-off
- Autodesk Construction Blog, «Snapshots and robust comparison capabilities»: https://www.autodesk.com/blogs/construction/have-you-tried-it-snapshots-and-robust-comparison-capabilities/
- APS, Model Properties y diferencias de versión (31-may-2022): https://aps.autodesk.com/node/2254
- PUCP, repositorio (metrados, RNM y BIM): https://repositorio.pucp.edu.pe/index/handle/123456789/202188
- UPeU, metrados BIM frente al expediente: https://repositorio.upeu.edu.pe/bitstreams/ae0622c2-1817-466d-b3c6-669aae3d63c1/download
- MEF, Guía Nacional BIM: https://www.mef.gob.pe/planbimperu/docs/recursos/info_guianacionalbim.pdf

---

## 7 · Hecho: P1 «qué falta» y P2 «colorear» (24-oct-2026, en local, sin commit)

> **25-oct · P2 sustituido.** El color propio de la Planilla se retiró: ahora lo pone Filters con los campos derivados («Colorear en Filters»), para que haya un solo dueño del color del 3D. Ver docs/visor/27 §6-7. P1 sigue igual.

**En la vista Partidas, con el itemizado cargado**, aparece una línea nueva debajo de la cabecera:

- **Cobertura del itemizado X %**: elementos con alguna línea cuyo código es un ítem del
  itemizado o sub-partida de uno, sobre los elementos de la tabla.
- Los cuatro estados, con su color y su cuenta. **Clic = aislar esos elementos** (como una
  partida); otro clic, mostrar todo:
  - ■ verde: con partida del itemizado;
  - ■ azul: con sub-partida de un ítem;
  - ■ rojo: con partida fuera del itemizado o sin código;
  - ■ naranja: sin partida (lo que falta).
- **«qué falta»** abre un panel con cuatro listas. En las tres primeras, cada línea se aísla en el 3D:
  - elementos sin partida, por categoría de Revit;
  - partidas del modelo fuera del itemizado;
  - partidas con unidad distinta (manda la del itemizado);
  - partidas del itemizado sin elementos (lo que no se modela o falta parametrizar).
- **Colorear 3D: No · Por estado · Por capítulo.** Por capítulo lleva una leyenda con el nombre oficial
  del capítulo; un elemento con líneas en dos capítulos va a «varios capítulos».

Regla de cada elemento: el MEJOR estado de sus líneas, que se leen igual que en la vista
Partidas (la línea padre no cuenta, las repetidas cuentan una vez). Sin IA.

**Piezas:**

| Pieza | Qué hace | Pruebas |
|---|---|---|
| `lib/planillaCobertura.js` | estado por elemento, cobertura, «sin partida» por categoría, capítulos, qué pintar | 20/20 (20.000 elementos en 30 ms) |
| `lib/coloreoTemporal.js` | pinta y quita; colores validados antes de tocar nada; a nivel de modelo, una invalidación | 16/16 (visor simulado) |
| `Viewer.jsx` | evento `EVENTOS.COLOREAR` → controlador; búsqueda del modelo por URN en un solo sitio | — |
| `InventoryDataGrid.jsx` | `itemsDelVisor` (claves → urn y dbIds) compartido por seleccionar y colorear | — |
| `TablaDePartidas.jsx` | línea de cobertura, panel «qué falta», selector de color | — |

**Contrato con Filters y Sources:**
- Igual que «Avance»: al pintar, Filters cede el color («las herramientas externas mandan») y **no
  recalcula**.
- Al quitar el color, `clearThemingColors` devuelve el tinte de Sources.
- El color por propiedad de Filters vuelve cuando el usuario lo pide de nuevo en Filters. Esto es
  conducta existente de Filters (CLOSED), no se ha tocado.

**Verificado:** las pruebas de arriba y las de Planilla, aislamiento, encuadre e inventory en verde;
build OK. **Falta la prueba en el visor**: el 5173 y el backend :3000 estaban apagados y los arranca el
propietario.
