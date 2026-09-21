# 15 · Paso 2: mosaicos por lámina (la parte que quita la espera de los 71,9 MB)

20-sep-2026. Continuación de `docs/archivos/14`. El paso 1 (vista previa con enfoque) quitó el «inicia opaco», pero
**no** la espera: el lector sigue necesitando el PDF entero para dibujar, y al acercar hay medio segundo de estirado.
Esto es el paso 2 (publicado el 21-sep-2026, ver §6): la lámina se prepara en el servidor como una **pirámide de teselas**, igual
que un mapa, y el navegador baja sólo lo que se ve.

## 1 · Lo medido (láminas reales, generador nuevo)

`500125-CSSP001-740-XX-DR-LS-004120.pdf` — **71,9 MB**, A1, con foto aérea:

| Nivel | Tamaño | Teselas | Peso | Generar |
|---|---|---|---|---|
| z0 (la hoja entera, vista de ajuste) | 1500×1060 | 9 | **233 KB** | 2,1 s |
| z1 (×2) | 3000×2119 | 30 | 510 KB | 4,2 s |
| z2 (×4, para leer el cajetín) | 6000×4238 | 108 | 1,5 MB | 12,0 s |
| **Total** | | **147** | **2,3 MB** | **18,4 s** |

`500125-CSSP001-740-XX-DR-HD-004120.pdf` — 2,3 MB, A1 vectorial: 147 teselas, 2,2 MB, 18,8 s.

**Lo que cambia para el que abre la lámina pesada:**

| | Hoy | Con mosaicos |
|---|---|---|
| Para ver la hoja | el PDF entero, **71,9 MB** (210 peticiones por rangos) | **233 KB** en 9 teselas |
| Nitidez al abrir | la de la vista previa | la del nivel, **dibujada a esa resolución** |
| Acercar a ×4 | 0,48 s estirando el mapa de bits y redibujar | **19 KB** de una tesela, nítido en el fotograma siguiente |
| Lo que baja ACC para lo mismo | 1,07 MB | — |

Probado en el banco (`http://localhost:5181/__mosaico/`): a tamaño de ajuste, **9 teselas, 233 KB, primera vista en
60 ms**; al saltar a ×4 sobre el cajetín, **una sola tesela más (19 KB)** y texto nítido.

## 2 · Cómo está hecho

`backend/mosaicos.py` (nuevo, sin GCS ni Flask dentro, para poder medirlo suelto):

- `plan(ancho_pt, alto_pt)` → la pirámide: 3 niveles (×1, ×2, ×4) sobre un nivel 0 de 1.500 px de lado mayor, teselas
  de 512 px.
- `teselas_de_nivel(...)` → **dibuja cada tesela por separado, con recorte** (`clip`) en vez de dibujar la hoja entera
  y cortarla: el nivel 2 de un A1 son 76 MB de píxeles en memoria, y una tesela son 0,8 MB. Render ya reinició el
  servicio por memoria el 28-ago-2026 rasterizando miniaturas; esto no vuelve a pasar por aquí.
- `generar(ruta, escribir, ...)` → la pirámide entera; `escribir(z, x, y, datos)` decide dónde va (disco en las
  pruebas, GCS en producción).
- **La costura, medida y arreglada:** el nivel 0 lleva la misma máscara de enfoque que la vista previa, y el enfoque
  mira los píxeles vecinos — que en el borde de una tesela no existen. Medido contra la hoja enfocada de una vez, la
  unión llegaba a **136** niveles de gris de diferencia (fuera de ella, 64). Dibujando cada tesela con **8 px de margen
  y recortándolo después**: **20** en esa misma unión. Los niveles altos no se enfocan (la línea ya ocupa su píxel).

Herramientas: `backend/herramientas/prueba_mosaicos.py` (genera y mide) y la página `dist-banco/__mosaico/index.html`
(prueba de rueda y arrastre; elige el nivel cuyo tamaño natural es mayor que lo que se ve, así nunca estira hacia
arriba, y deja el nivel anterior de fondo mientras llegan las teselas nuevas).

**Dos fallos de la primera página de prueba, corregidos** (el propietario: «no puedo probarlo porque el scroll se
aloca»), y los dos son lecciones para el lector de verdad:

1. **Colocación de las teselas.** Se dibujaban todas con la separación del nivel 0 (512 px) en vez de la suya
   (256 px en z1, 128 px en z2), y las del borde —que son más estrechas— se estiraban hasta 512. Resultado: la hoja
   se descuadraba al acercar. Ahora la geometría se calcula en píxeles del nivel 0: una tesela del nivel z ocupa
   `512 × (ancho_z0 / ancho_z)`, y las del borde llevan su tamaño real.
2. **La rueda.** Se usaba `deltaY` tal cual, que vale 100 px en un ratón, 3 en modo «líneas» y cualquier cosa en un
   trackpad. Ahora se normaliza por `deltaMode`, se limita a tres muescas por evento y cada muesca es un **10 %**,
   como ACC (medido el 13-sep, docs/archivos/07); el pellizco del trackpad (rueda con `ctrl`) va al 5 %. El punto
   bajo el cursor se queda quieto.

Medido tras el arreglo: ajuste → z0 con 9 teselas; 2,00× → z1 con 4 teselas a la vista; 4,00× → z2 con 4 teselas,
**4 KB más de descarga**.

## 2 bis · El gesto: lo que hace ACC, medido en su pantalla (20-sep-2026)

Con la 004120 abierta en ACC, en SU Chrome, leyendo la cámara del visor de Autodesk (ortográfica) mientras se le
mandaba rueda de verdad:

| Gesto | `deltaY` | Ancho de vista antes → después | Factor | Duración |
|---|---|---|---|---|
| 1 muesca | −133 | 52,609 → 47,503 pulg. | **×1,1075** | 0,66 s |
| 5 muescas | −667 | 58,295 → 52,637 pulg. | **×1,1075** | 0,40 s |
| 10 muescas | −1333 | 47,502 → 42,891 pulg. | **×1,1075** | 0,44 s |

**ACC da un paso fijo del 10,75 % por EVENTO de rueda, dé lo que dé el ratón, y lo anima.** Por eso su scroll rápido
no salta: son muchos eventos pequeños encadenados. (Además, ACC **ignora la rueda simulada por JavaScript**: sólo
obedece a la del ratón o la de la extensión; el zoom profundo hubo que hacerlo moviendo su cámara con su API.)

**Su nitidez:** la lámina mide 33,1 × 23,4 **pulgadas** (A1). En la vista de ajuste dibuja a 32 ppp; llevada a 10,5×
llega a **339 ppp (13,3 px/mm)** con el texto vectorial limpio, y **no tiene tope**.

**Lo nuestro, en la misma lámina y misma pantalla** (prueba armada en su pestaña, mientras el PDF aún bajaba):

| | ACC | ALEPHIA (hoy) |
|---|---|---|
| Un evento de rueda de −667 | ×1,1075, animado | **×2,6 y luego rebota** (3026 → 2622 → 2085 px) |
| Lienzo mientras se acerca | vector, se redibuja siempre | **congelado en 972 px**: hasta **0,39 px reales por píxel de pantalla** |
| Con la vista previa puesta (PDF aún bajando) | — | no redibuja: **lo que se estira es la imagen de espera** |

Eso es, medido, el «acerco y sigue no nítido».

## 2 ter · La prueba, ya con el contrato de ACC y un nivel más

- **Rueda:** un paso de **10,75 % por evento**, animado (suavizado exponencial ≈ 0,35 s) y anclado al cursor. Medido en
  la propia página: tres pasos = ×1,3584, que es exactamente 1,1075³.
- **Nivel z3 añadido** (12000×8477, 408 teselas, 4,7 MB, 50,9 s): **14,3 px/mm (363 ppp)**, por encima de los 339 ppp
  a los que llega ACC a 10,5×. La pirámide entera son **555 teselas, 6,9 MB, 71 s** por lámina.
- Medido en la página: a 8× de zoom se ven **2 teselas** y el total bajado sigue siendo **236 KB**.

## 3 · Lo que falta para que esto llegue al lector

- **B · Dónde se guardan y cómo se piden.** Las teselas SON el plano: tienen que pasar por la misma puerta que el PDF
  (`_acceso_al_recurso`), como la vista previa. Lo natural: un manifiesto por nivel que devuelva las URL firmadas de
  las teselas de ese nivel, y el navegador las baja directo del almacén.
- **C · El lector.** `PDFViewer` dibujaría las teselas del nivel que toca y dejaría pdf.js para lo que sólo él puede
  hacer: texto buscable, marcas y el detalle por encima del último nivel.
- **Una decisión tuya:** los mosaicos cuestan ~19 s de preparación y ~2,3 MB por lámina. En una lámina de 2 MB no
  compensan (ya abre rápido); en una de 72 MB son la diferencia entre 233 KB y 71,9 MB. **Propuesta: generarlos sólo
  por encima de cierto peso** (p. ej. 10 MB), en el mismo trabajo de segundo plano que ya prepara la vista previa al
  subir.

## 3 bis · En el LECTOR DE VERDAD, en el banco local (20-sep-2026)

Pedido del propietario: «primero probemos en Docs local». Hecho: la capa de teselas ya está montada en el lector del
portal y se prueba en su banco (`probar-lector.html`), con la lámina pesada de siempre (plano-P = la 004120 de
71,9 MB) y sus teselas generadas en `public/_probar/mosaico/plano-P/`.

**Cómo está hecho:**

- **Nuevo `frontend-docs/src/components/CapaMosaico.jsx`:** se cuelga encima del lienzo, ocupa su MISMA caja y coloca
  las teselas **en porcentaje** de esa caja. Así sigue al zoom y al paneo del lector **sin tocar su lógica**: el lector
  no se entera de que existe. Elige el nivel **en píxeles reales de pantalla** (`devicePixelRatio`), pide sólo las
  teselas visibles (con un margen de 0,25) y deja las del nivel anterior de fondo mientras llegan las nuevas.
- **`PDFViewer.jsx`:** dos props nuevas, `mosaicoBase` y `alEstadoMosaico`. Sin `mosaicoBase` **no se monta nada** y el
  lector se comporta exactamente como hoy — en producción todavía no se pasa.
- **`PDFViewer.css`:** `.pdf-mosaico` (encima de la imagen de espera, sin ratón: la rueda y el arrastre siguen siendo
  del lector).
- **El banco:** `?mosaico=1` cuelga la pirámide y enseña en la barra `z<nivel>/<último> · px/mm reales · teselas`.

**Medido en el banco:**

| | Con mosaico | Sin mosaico (hoy) |
|---|---|---|
| Lámina en pantalla | **9 teselas cargadas a los 256 ms** (el lienzo del lector todavía era el marcador de 300×150) | la imagen de espera hasta que baja el PDF |
| Al acercar (10 muescas) | el nivel sube solo: z0 → z1 justo cuando se pasa de su resolución natural (1,78 px/mm) | el lienzo se queda quieto en 596 px y se estira |
| A 13,6 px/mm (el zoom al que medí ACC) | **nivel z3 con factor 0,95 — un píxel de tesela por píxel real** | pdf.js redibuja tras ~0,5 s, y sólo si ya bajó el PDF |
| Sin el parámetro | — | 0 teselas, lienzo 596×421, vista previa: **igual que hoy** |

## 3 ter · «Al acercarme rápido demora 5 segundos en ponerse nítido» (20-sep-2026)

Su primera prueba en el banco. Tenía razón y eran **tres defectos de la capa nueva**, no del generador:

1. **Se pedían los niveles intermedios.** Acercando de golpe se pasa por z1 y z2 camino de z3, y cada escalón pedía
   SUS teselas: las del nivel bueno quedaban las últimas de la cola (seis conexiones por servidor). Ahora, si el nivel
   cambia, se espera a que el gesto pare (**130 ms de quietud**) y sólo se piden las del nivel final; mientras tanto se
   ve el nivel anterior, estirado. Las teselas de los niveles abandonados salen del DOM, así el navegador **cancela**
   su descarga.
2. **Se subía de nivel por un 3 %.** Con la regla «que no se estire nada», a 7,35 px/mm se pedía el nivel de 14,3 para
   ganar un 3 %: **40 teselas en vez de 10**. Ahora se admite hasta un **15 % de estirado** antes de subir (medido: el
   contraste cae menos del 6 %).
3. **El aviso de estado re-montaba el observador en cada render.** La función que le pasa el banco cambia de identidad
   en cada render y estaba en las dependencias del efecto: el observador de tamaño se desmontaba y se montaba sin
   parar. Ahora vive en una referencia.

**Medido después, con la pestaña al frente:** doce muescas seguidas y las teselas del nivel final completas **53 ms
después de soltar la rueda**.

**Aviso de método (van dos veces):** el panel de pruebas oculto FALSEA cualquier medida de gesto — Chrome deja los
temporizadores en ~1 por segundo y `requestAnimationFrame` casi no dispara (medido: 1 fotograma en 5,7 s). Toda
medición de zoom tiene que hacerse con la ventana a la vista.

## 3 quater · «¿Y si abro recién el archivo?» (20-sep-2026)

Su duda, bien puesta: en el banco el PDF es local y llega en un suspiro, así que la prueba anterior no decía nada de
la apertura en frío. Se añadió al banco `?pdf=<ms>`, que retrasa la entrega de la URL del PDF **como en producción**.

**Con `?mosaico=1&pdf=30000` (el lector se queda 30 s sin PDF):**

| | Cuándo |
|---|---|
| **Las teselas en pantalla (9, 233 KB)** | **0,20 s** |
| pdf.js dibuja | 31,7 s (cuando por fin llega la URL) |

Es decir: **la lámina se ve, nítida y con zoom, sin PDF ninguno**. El PDF sigue bajando por detrás para lo que sólo él
sirve (descargar, imprimir, buscar texto, marcas).

**Sin mosaico, mismo retraso:** a los 62 s la pantalla seguía con la silueta/imagen de espera y el lienzo en su tamaño
de marcador — exactamente lo de hoy.

Matiz honesto: en esa medición las teselas venían de la caché del navegador (233 KB reales); en su red —72 MB en unos
40 s, o sea ~1,8 MB/s— bajarlas son unas décimas más.

## 3 quinquies · «No me deja acercar con el scroll» (20-sep-2026)

Al probar la apertura en frío apareció el tope de verdad, y es del lector, no de los mosaicos: **el zoom necesitaba el
PDF**. La rueda se engancha en un efecto que empieza con `if (loading || error) return`, y la escala se calcula contra
la «base» —el tamaño de la hoja a escala 1— que hasta hoy sólo daba pdf.js. Con el PDF bajando, la rueda no hacía
nada: justo cuando los mosaicos ya tienen la lámina en pantalla.

**Arreglado:** el mosaico sabe cuánto mide la hoja, así que sirve de base. Ahora informa del tamaño **en puntos**
(`hojaPt`), el lector la usa si no hay documento, encuadra la lámina y engancha la rueda aunque `loading` siga
encendido. Cuando el PDF llega, toma el relevo sin mover nada (es la misma caja).

**Medido con el PDF retrasado 60 s:** seis muescas llevan la hoja de 252 a 406 px **con el lienzo de pdf.js todavía en
su tamaño de marcador (300×150)**. El arrastre ya funcionaba sin documento (mueve el scroll).

## 3 sexies · La primera vez DE VERDAD (`?frio=1`, 20-sep-2026)

La duda del propietario: «ese link es de un archivo ya cargado; ¿funcionará igual la primera vez, o habrá que esperar a
que cargue entero?». Para contestarla sin trampas, el banco tiene ahora `?frio=1`: cada URL —teselas y PDF— lleva una
marca única, así que el navegador **no puede sacar nada de su caché**. Con `?mosaico=1&pdf=60000&frio=1` el lector
abre en frío y sin PDF durante un minuto.

La prueba destapó **tres defectos del arranque sin PDF**, arreglados:

1. **Huevo y gallina:** sin PDF ni imagen de espera, el lienzo no tiene tamaño; la capa esperaba ese tamaño para avisar
   al lector y el lector esperaba el aviso para dárselo. Ahora la capa avisa del tamaño de la hoja **en cuanto lee su
   manifiesto**.
2. **La hoja oculta:** el lector la esconde (`sin-documento`) si no hay PDF ni imagen de espera. Con mosaico, ya no.
3. **Encuadre a destiempo:** se encuadraba antes de que el contenedor tuviera tamaño (hoja de 40×28 px en un
   contenedor de 1265×657) y luego el seguro «el usuario ya movió la vista» impedía corregirlo. Ahora, con mosaico, se
   encuadra cuando hay sitio de verdad y se centra en el acto.

**Medido después, en frío y sin PDF:**

| | |
|---|---|
| Hoja en pantalla | **0,10 s** (9 teselas de z0, **233 KB** bajados de nuevo) |
| Acercar ×9,8 con la rueda | funciona, **sin PDF** |
| Nítido tras soltar la rueda | **66 ms** (9 teselas de z1, **141 KB**) |
| Total bajado para abrir y acercar ×10 | **374 KB** (el PDF pesa 71,9 MB) |

**Lo que NO resuelve esto:** las demás láminas. Hoy sólo la 004120 tiene teselas (generadas a mano). Para que cualquier
lámina se abra así hay que prepararlas al subirla —el paso B—; si alguien abre una lámina antes de que estén listas,
se comporta como hoy hasta que lo estén.

## 5 · Paso B en local: los cientos que ya están subidos (20-sep-2026)

El propietario: «yo ya tengo archivos PDF subidos, cientos». Preparar la pirámide entera de cada uno serían horas y
miles de teselas que nadie mira, así que el diseño es **híbrido**: al subir (y en la puesta al día de lo ya subido) se
preparan sólo **z0 y z1**; los niveles profundos se dibujan **a demanda**, tesela a tesela, la primera vez que alguien
acerca esa zona, y se guardan para siempre.

**Hecho en local, sin tocar producción:**

- `backend/mosaicos.py`: `preparar()` (z0+z1 y el manifiesto con `preparados`), `tesela_a_demanda()` y `una_tesela()`,
  que es **la misma función** para el lote y para la demanda — comprobado: dan exactamente los mismos bytes.
- `backend/herramientas/servidor_mosaicos_local.py`: el almacén en una carpeta **con la misma forma que tendrá en el
  almacén real** (`<lámina>/mosaico.json`, `<lámina>/z<z>/<x>_<y>.webp`); sirve el manifiesto (preparando si hace
  falta), la tesela (dibujándola si no está) y `--ponerse-al-dia` para todas las de una carpeta, las más pesadas
  primero. En `.claude/launch.json` como «mosaicos» (puerto 5190).
- El banco del lector usa ese servidor para **todas** sus láminas con `?mosaico=1`.

**Dos arreglos de velocidad, medidos:**

1. **La hoja se interpretaba en cada tesela.** Pidiendo cada recorte a la página, MuPDF volvía a leer todo su
   contenido: 400–650 ms por tesela fuera del tamaño que fuera. Con su *display list* se interpreta una vez y cada
   tesela sólo se pinta: **80–215 ms**. Y fuera la conversión inútil a PNG de cada tesela.
2. **La demanda iba en fila.** Cada tesela eran 150–250 ms de dibujo, pero de una en una la sexta esperaba a las cinco
   anteriores (hasta 1,25 s) y un acercón en frío tardaba **2,7 s** en ponerse nítido. Ahora dibujan **4 procesos en
   paralelo**, cada uno con sus láminas abiertas: 12 teselas nuevas, **0,18–0,34 s cada una, a la vez**. (La primera
   petición tras arrancar el servidor paga el arranque de los procesos, ~2 s.)

**La puesta al día, medida con las 10 láminas del banco (z0+z1):**

| | |
|---|---|
| Lámina normal (1,4–3,7 MB) | **6–11 s**, 39 teselas, 0,3–0,9 MB |
| La de paisajismo (71,9 MB) | **16,6 s** (la foto aérea pesa en el nivel 0) |
| Media | **~10 s por lámina** → unos **300 PDF ≈ 50–60 min** de cálculo, una sola vez |

(Corrige la estimación de 30 min que se dio antes de medir con el generador real.)

**Lo que falta para producción** (necesita su decisión, porque escribe en el almacén real): el mismo `preparar()` en
el trabajo que ya prepara la vista previa al subir; una ruta que sirva manifiesto y teselas **por la misma puerta de
permisos que el PDF** (`_acceso_al_recurso`); y dónde corre la puesta al día (Render dosificado de noche, o su PC).
→ Hecho en local: ver §6. Queda sólo lo de la puesta al día, que ya no es imprescindible (§6.5).

## 6 · Paso B: el lado de producción, hecho y probado en local (20-sep-2026)

El propietario: «vamos» (preparar al subir, servir con los mismos permisos que el PDF, y el lector del portal usándolo).
Hecho y probado en local; publicado el 21-sep-2026 a petición del propietario («despleguemos este
cambio»). Se prueba en el banco del lector **por el mismo camino que iría a producción**: el lector
llama a la ruta del servidor, y el banco simula esa ruta sobre el servidor de mosaicos local.

### 6.1 · Lo que hay

**Servidor**

- `backend/mosaicos_almacen.py`: dónde viven y cuándo se hacen. Junto a cada versión del PDF,
  `<blob>__mosaico/mosaico.json` y `<blob>__mosaico/z<z>/<x>_<y>.webp`. El nombre del PDF es único por versión, así que
  una versión nueva tiene su mosaico sin migrar nada y una tesela no cambia nunca (caché inmutable).
  - `preparar(blob)`: al subir. El manifiesto se sube **el último y sólo si subieron todas las teselas**; si una falla,
    no hay manifiesto y la vez siguiente se reintenta entero.
  - `asegurar_teselas(...)`: a demanda, las de los niveles que no están preparados. Candado por lámina (PyMuPDF no dibuja
    en paralelo sobre un documento) y cupo de 2 láminas a la vez. Las teselas se suben **a la vez y fuera del candado**.
- **Una sola ruta**, `POST /api/docs/mosaico`, con **la misma puerta que el PDF** (`_acceso_al_recurso`: sesión, obra,
  documento o versión, permiso documental; sin acceso no dice ni si existe) y ligada a la versión:
  - sin `z` → el manifiesto y, en la misma respuesta, las URL firmadas de z0+z1 (el primer gesto no espera otra ida y
    vuelta). Si aún no está preparado: `pendiente`, se encola **una** vez y el lector sigue como hoy;
  - con `z` y `teselas` (como mucho 64, validadas contra la rejilla) → sus URL, dibujando antes las que falten si el
    nivel no está preparado.
- Al subir un PDF (por bloques y por Multimedia) se encola su mosaico, en la cola de dos hilos de las miniaturas.

**Portal**

- `utils/fuenteDeMosaico.js`: qué se pide, cuándo y cuántas veces, sin red (se prueba en Node). Lo esencial:
  - lo que entra mientras se pasea se junta 100 ms: una petición por gesto;
  - de un nivel preparado, todo en una petición; si el servidor tiene que dibujar, lotes de 6 del centro hacia fuera;
  - una tesela que falla se reintenta una vez y luego se deja;
  - si la lámina se está preparando, se vuelve a mirar cada 5 s durante 30 s.
- `utils/mosaicoRemoto.js`: le pone la ruta. `components/CapaMosaico.jsx`: la capa. De fondo, siempre **el mejor nivel
  de abajo que esté completo** en la vista, así que nunca queda un hueco.
- `PDFViewer.jsx`: la fuente sale del documento y la versión. `?mosaico=0` en la dirección la apaga, para comparar.

**Banco**: `probar-lector.jsx` simula la ruta sobre el servidor local (5190), con las mismas reglas que el servidor real.
`?api=<ms>` es la ida y vuelta (300 por defecto); `?dibujo=<ms>` es lo que tarda el servidor en dibujar cada tesela
profunda, de una en una por lámina, como en una CPU.

### 6.2 · Cinco defectos que se habrían publicado, encontrados y corregidos por el camino

1. **Las teselas tapaban las marcas y los resaltados de la búsqueda.** La capa va en z-index 8 y las marcas no tenían
   ninguno. Ahora van en 9. Medido: z-index 9 frente a 8, y en la captura se ven encima.
2. **La rueda dejaba de acercar al llegar la URL del PDF.** El manifiesto suele llegar antes que la URL firmada, y al
   llegar la URL el lector borraba la «base» del zoom, que había puesto el mosaico. Resultado: sin zoom hasta que pdf.js
   tuviera la hoja, que en la de 71,9 MB son decenas de segundos. **Demostrado en los dos sentidos**, con el PDF retenido
   20 s por CDP:
   - **sin el arreglo**, 12 muescas y la hoja no se movió (959 px, z0);
   - **con el arreglo**, nítida en z2 a los 0,6 s.
3. **Sin vista previa, la espera apartaba la hoja (opacidad 0) aunque hubiera teselas.** Ahora el mosaico cuenta como
   «hay algo que enseñar», igual que la vista previa.
4. **La caché de PDF en disco se habría quedado huérfana en cada reciclaje.** El nombre salía de `hash()`, que cambia en
   cada proceso, y el servidor se recicla cada ~300 peticiones: hasta 400 MB huérfanos cada vez, hasta llenar el disco.
   Ahora:
   - el nombre es estable;
   - la descarga va a un fichero aparte, así que una cortada nunca pasa por buena;
   - cada proceso empieza con la carpeta vacía.
5. **Se podía cerrar una lámina que otro hilo estaba dibujando** (al pasarse del tope de abiertas). Ahora nunca se cierra
   una en uso.

Y dos protecciones:

- **Con la hoja girada no se monta la capa**: una tesela no gira.
- **Más allá del último nivel, con el PDF ya dibujado, la capa se aparta** y manda el «detalle» nítido de pdf.js, como hoy.

### 6.3 · Lo medido

Todo en **Chrome sin ventana** (el panel del escritorio estaba tapado: 0 fotogramas por segundo, como advierte el
método), a 1600×900 y a la escala de su pantalla (1,25). Apertura en frío: URL únicas, sin caché, y el PDF sin llegar.

**En el lector**

| | |
|---|---|
| Hoja entera | **0,46–0,55 s**, 9 teselas, 1 petición |
| Acercar rápido a z2 (5,4 px/mm), z2 ya preparado | nítido **0,61 s** tras el gesto, 1 petición |
| Ídem antes de preparar z2 (a demanda, 110 ms por tesela) | centro ~0,7 s, vista entera **3,4 s** (28 teselas) |
| Acercar rápido a z3 (11,6 px/mm), primera vez, 110 ms por tesela | centro ~0,7 s, vista entera **2,3 s** (18 teselas), con z2 de fondo |
| Pasear 500 px / alejar y volver | 1 petición, **0,7–0,9 s** |
| Cambio de lámina P → A → P | sólo teselas de la lámina que toca, en ningún momento de la otra |
| Marcas, más allá del último nivel, hoja girada | marcas encima; la capa se aparta; no se monta |

**En el servidor, en su PC, sobre la lámina de 71,9 MB**

- Una tesela profunda: **dibujarla 31–36 ms**. Comprimirla en WebP con el método 4 costaba 37–38 ms; con el 2, **13 ms y
  un 3 % más de peso**. Se usa el 2.
- El camino real a demanda (`asegurar_teselas`, con un almacén simulado a 150 ms por subida): un lote de 6 cada ~0,55 s.
- **PyMuPDF 1.27.1 suelta el GIL mientras dibuja**: con un hilo dibujando, el principal despertaba cada 5–9 ms. Las demás
  peticiones de la API no se quedan congeladas.
- **Memoria de una lámina abierta para dibujar**: 90 MB la de 71,9 MB; 33 MB una corriente. Por eso como mucho 2 abiertas.

**110 ms por tesela en Render es una estimación** (el doble que en su PC, una CPU compartida). No está medido allí.

### 6.4 · Decisiones tomadas en esta vuelta (reversibles, una constante cada una)

- **Se prepara también z2 al subir** (`mosaicos.NIVELES_AL_PREPARAR = (0, 1, 2)`). Medido hoy en su PC, dos veces:

  | | z0+z1 | z0+z1+z2 |
  |---|---|---|
  | La de 71,9 MB | 3,1–3,4 s | 7,4 s |
  | Una corriente | 1,6–1,8 s | 3,9–4,3 s, 2,3–2,4 MB |
  | Las 10 del banco (puesta al día local, con escritura) | — | **46,9 s**, 4,7 s de media |

  Con eso, **300 láminas son ~24 min en su PC**, menos que lo aceptado antes para z0+z1. Las cifras anteriores de §5
  (16,6 s la pesada, ~10 s de media) **no las reproduzco hoy**: el mismo PC y el mismo código, salvo el método de WebP,
  que sólo explica un 20 %. Debieron medirse con el equipo en otras condiciones; no sé cuáles.
- **Con el manifiesto viajan sólo las URL de z0+z1** (los niveles que caben enteros en 64). Las de z2 se piden en una
  petición al llegar, sin dibujar nada.
- **Una sola ruta.** El perfil portal vigila cuántas rutas sirve (`tests/test_perfil_portal.py`). Estaba en 284 con
  techo 285, y cualquier ruta nueva lo hace saltar. **Subí el techo a 286** con el motivo escrito, como las dos veces
  anteriores; la vigilancia por familias sigue en verde. Esto lo tiene que ver el propietario.

### 6.5 · Lo que queda

- **La puesta al día ya no es imprescindible.** Una lámina antigua sin mosaico se prepara sola la primera vez que alguien
  la abre: la ruta la encola, el lector sigue como hoy y vuelve a mirar durante 30 s, y las teselas aparecen en cuanto
  están (unos segundos). La puesta al día sólo quita esa primera espera a todas. Si se quiere, falta decidir dónde corre:
  Render de noche, o su PC.
- **Commit, push y despliegue**: cuando lo diga el propietario. El backend (Manual Deploy) y el portal van juntos: el
  lector sin la ruta sigue como hoy, y la ruta sin el lector no hace nada.
- **Una prueba del backend falla y ya fallaba en HEAD**, sin relación con esto: `test_capacidades_con_puerta`. La ruta
  `/api/docs/miniaturas/preparar` no tiene cliente desde `a78c267` (29-ago).

### 6.6 · Cómo probarlo en local

Con los servidores «banco» (5180) y «mosaicos» (5190) arrancados:

- `http://localhost:5180/probar-lector.html?mosaico=1`: la lámina pesada, con mosaico.
- `…?mosaico=1&frio=1&pdf=30000`: la primera vez de verdad (sin caché, y el PDF a los 30 s).
- `…&dibujo=110`: el servidor tan lento como se estima Render para lo que dibuja a demanda (z3).
- Sin `mosaico=1`: el lector de hoy, para comparar.

## 7 · Guía de prueba en Docs local (20-sep-2026)

**Dónde:** `http://localhost:5182`. Es su Docs de siempre, con su usuario, sus obras y sus permisos contra producción,
pero con el lector nuevo. La ruta del mosaico la resuelve el puente de su PC (§6.6), que pasa por la puerta de
producción.

**Qué se corrigió, en sus palabras**

| Lo que pasaba | Qué era | Qué se hizo |
|---|---|---|
| «Inicia opaco» | La vista previa, dibujada a 2.000 px y reducida por el navegador | La hoja entra con teselas nítidas (y la vista previa, a 1.500 px con enfoque) |
| «Al acercar se ve borroso hasta que carga» | Se estiraba una imagen fija mientras pdf.js redibujaba | Teselas por nivel, como un mapa: cada acercamiento a su resolución |
| «Al acercarme rápido demora 5 s en ponerse nítido» | Se pedían todos los niveles intermedios | Solo el nivel final, al parar el gesto; el anterior de fondo |
| «No me deja acercar con el scroll» | Sin PDF, el lector no sabía cuánto mide la hoja | El mosaico se lo dice: la rueda funciona desde el primer segundo |
| (encontrado al llevarlo al portal) | Las teselas tapaban las marcas; la rueda moría al llegar el PDF; la espera escondía la hoja | Corregido y medido (§6.2) |

**Cómo tiene que funcionar**

1. **Primera vez que abre una lámina en local:** se ve como hoy mientras su PC baja el PDF y prepara las teselas. En
   5–30 s aparecen solas, nítidas. Si tarda más de 30 s, cerrar y volver a abrir.
2. **Desde la segunda vez:** la hoja entera nítida en ~0,5 s, y el cajetín legible sin esperar al PDF.
3. **Rueda rápida nada más abrir**, aunque el PDF siga bajando: acerca en el acto. Nítido ~0,6 s después de parar,
   hasta ×3,6.
4. **Muy de cerca** (más de ×3,6): la primera vez en cada zona tarda 1–2 s. Mientras tanto se ve el nivel anterior,
   algo blando, nunca un hueco en blanco. La segunda vez, al instante.
5. **Pasear acercado:** lo nuevo entra en menos de 1 s.
6. **Marcas, medidas y resaltados de la búsqueda:** encima de la hoja, como siempre.
7. **Más cerca de lo que permite ACC** (muy por encima de ×7): manda el lector de siempre, como hoy.
8. **Hoja girada:** lector de siempre, sin teselas.
9. **Cambiar de lámina:** nada de la anterior aparece en la nueva.
10. **Para comparar:** `?mosaico=0` en la dirección, y se ve el lector de hoy.

**Lo que en local es distinto de producción**

- La vista previa (la imagen de antes de las teselas) sigue siendo la de producción, la vieja: el backend no está
  desplegado. Las teselas la tapan en cuanto llegan.
- La primera vez tarda más que en producción: aquí el PDF baja a su PC. En producción se prepara en el servidor al
  subir.
- Lo muy cercano lo dibuja su PC, más rápido de lo que lo hará Render.

## 4 · Lo que no cambia

Publicado el 21-sep-2026, backend y portal juntos. Hasta que se despliega, producción sigue como antes; desplegado,
cambia lo de §6 y §7. No hay migraciones ni cambios en la base de datos: las teselas son objetos nuevos en el
almacén, junto a cada PDF.
