# Velocidad de apertura · ACC frente a ALEPHIA

15-sep-2026. Tu pedido: «en ACC carga muy rápido, tanto sus archivos PDF como CAD. ¿Podemos investigar eso? … No quiero construir algo que aburrirá a los usuarios».

**Estado:** investigación y medición. No hay código. En ACC y en producción solo se abrieron documentos, sin cambiar nada.

## En corto

- **Mismos archivos en los dos**, medidos en tu Chrome al abrirlos desde su carpeta:
  - el PDF de 400 KB, `500125-S&P-CNS-GEN-ICE-P08-0001`;
  - el DWG de 2,1 MB, `RELLENO_POLITECNICO`;
  - en ALEPHIA, además, un plano pesado de paisajismo: `…-004122`, de 23,4 MB. En ACC no hay ninguno parecido.
- **PDF pequeño: ALEPHIA ya es más rápido.**
  - ALEPHIA: primer trazo a los 2,1 s; la silueta, a los 1,7 s.
  - ACC: 4,0 s, y 6,6 s si es el primer documento de la sesión.
- **DWG: ACC es más rápido.**
  - ACC: 2,7 s.
  - ALEPHIA: 3,3 s si el visor ya se usó en esa pestaña, y 13,0 s el primer CAD que se abre.
- **Plano pesado en ALEPHIA:** la silueta sale a los 2,4 s, pero el plano nítido no llega hasta los 10 s. Son 5 s bajándolo y 4 s dibujándolo.
- **Por qué ACC va rápido:**
  - prepara los archivos al subirlos: un DWG lo convierte en PDF vectorial, y cada página de un PDF la guarda aparte y también en mosaicos de imagen, que se ven enseguida;
  - su visor se queda cargado entre documentos y dibuja con la tarjeta gráfica.
- **Dónde perdemos nosotros:**
  - al abrir, pedimos 6 cosas al servidor, una de ellas repetida;
  - en CAD esperamos una URL que no se usa y pedimos «traducir» cada vez;
  - el primer CAD arranca el visor desde cero;
  - los PDF pesados se bajan enteros desde EE. UU. y se dibujan con el procesador.
- **Propuesta (§5):** ocho mejoras ordenadas por impacto. Las tres primeras son de horas.

## 1 · Qué se midió y cómo

- **Dónde:**
  - tu Chrome con las sesiones abiertas, en Windows y desde tu red;
  - ACC: la carpeta «EJEMPLO03CAMBIO4» de PQT8;
  - ALEPHIA, en producción: «05_Gestion_Administrativo», con los mismos dos archivos, y «02_SHA_Compartido / 02_Planos / Componente 4 / PAISAJISMO / PDF».
- **Método:** clic simulado como entrada real (CDP), con registro dentro de la página de:
  - la hora del clic;
  - cada petición de red;
  - los eventos del visor de Autodesk: modelo cargado, primer fotograma y fotograma final;
  - en nuestro lector, sus propias marcas `[lector]`.
- **Límites de la medición:**
  - una medición por caso, salvo donde se indica;
  - la pestaña tiene que estar a la vista. En segundo plano el navegador no dibuja: la primera medición de ALEPHIA dio 14,6 s por eso, y se repitió;
  - mientras medía, producción recibía una carga masiva de planos: la Sala de Cuarentena crecía desde las 09:15. Los tiempos del servidor pueden ser peores que de costumbre;
  - no se vació la caché del navegador, porque te habría cerrado las sesiones. Cada fila dice si era la primera vez o una repetición.

## 2 · Resultados

| Archivo | ACC | ALEPHIA |
|---|---|---|
| **PDF 400 KB, primera vez** | Modelo cargado a los 6,6 s; completo a los 8,7 s | Descargado a los 2,9 s. El dibujo no se pudo medir: la pestaña estaba oculta |
| **PDF 400 KB, repetido** | Primer fotograma a los 4,0 s; final a los 4,1 s | Silueta a los 1,7 s; primer trazo a los 2,1 s; completo a los 2,3 s |
| **DWG 2,1 MB, primera vez en la pestaña** | Sin medir: el visor ya estaba cargado en la sesión | Primer fotograma a los 13,0 s |
| **DWG 2,1 MB, repetido** | Primer fotograma a los 2,7 s; final a los 3,0 s | Primer fotograma a los 3,3 s; final a los 3,5 s |
| **Plano de paisajismo, 23,4 MB** | No hay un plano así en ACC | Silueta a los 2,4 s; primer trazo a los 10,0 s; completo a los 11,6 s |

## 3 · Cómo lo hace ACC (medido)

- **Un PDF.** Al abrirlo pide al CDN de Autodesk (`cdn.derivative.autodesk.com`):
  - el manifiesto del documento;
  - `page.pdf`: esa página sola, separada del PDF al subirlo;
  - `tiles_files.zip`: la página convertida en mosaicos de imagen, que se leen a trozos con 14 peticiones en paralelo. Es lo que se ve primero.
- **Un DWG.**
  - No lo abre como modelo 3D: al subirlo lo convierte en `Model.pdf`, un PDF vectorial, y lo abre con el mismo lector de PDF. Por eso un DWG le abre como un PDF.
  - El visor lo marca a la vez como SVF2 y como PDF: es la conversión de Autodesk con las vistas 2D en PDF.
- **El visor.**
  - Es el de Autodesk con su extensión de PDF, y dibuja con la tarjeta gráfica.
  - Se carga una vez por sesión. En el primer documento pasaron 4,3 s hasta que el visor existía; en los siguientes, de 1,1 a 2,6 s.
- **Sin firmar cada archivo:** abre una sesión con el CDN y descarga directamente.
- **No es instantáneo:** cada ida y vuelta a EE. UU. le cuesta de 0,2 a 0,8 s, igual que a nosotros. La diferencia está en cuántas hace y en qué baja.

## 4 · Dónde se nos va el tiempo (medido en producción)

### PDF

- **Seis peticiones al servidor en cuanto se abre**, todas a la vez, de 0,4 a 1,3 s cada una:
  - marcas y calibración: de 0,4 a 0,8 s;
  - miniaturas: de 0,7 a 1,3 s. Según el código, cada llamada lista la carpeta entera de la obra en el almacén;
  - URL firmada, **dos veces**. La segunda es la de «Abrir en el escritorio», que se pide aunque nadie la pulse (`DocumentViewer.jsx:80-94`);
  - versiones: de 0,5 a 0,9 s.
- **El plano pesado se baja entero:** 23,4 MB en 4,9 s desde el almacén de Google en EE. UU. (us-east4), repartidos en 3 peticiones en paralelo.
- **Dibujarlo lleva de 4 a 5 s**, porque pdf.js dibuja con el procesador. Mientras tanto se ve la silueta, una imagen de 420 px que sirve para reconocer el plano pero no para leerlo.
- **Enseguida se preparan los planos vecinos:** 6 URL firmadas más y la descarga de 2 vecinos de unos 23 MB, 5 s cada uno. Todo eso, justo cuando el usuario empieza a mirar el suyo.

### CAD, repetido (3,3 s hasta el primer fotograma)

| Tramo | Desde el clic |
|---|---|
| Espera de la URL firmada, que el visor CAD no usa | 0,0 → 1,0 s |
| `cad/translate`: en cada apertura crea el bucket en Autodesk, lee el manifiesto y escribe en la base | 1,0 → 2,2 s |
| Token de Autodesk | 2,2 → 2,6 s |
| Arranque del visor | 2,6 → 3,0 s |
| Manifiesto y primer fotograma | 3,0 → 3,3 s |

- **La primera vez en la pestaña (13,0 s)** hubo además 7 s sin ninguna petición de red, entre el token y la creación del visor.
  - Al repetirlo con medidores no volvió a pasar: el visor arrancó en 0,4 s.
  - Lo más probable es la primera puesta en marcha del visor, compilando lo que necesita la tarjeta gráfica. Queda por confirmar.
- **Un visor nuevo por documento:** se destruye al cerrar y se vuelve a crear al abrir el siguiente.

### Servidor

- Un solo proceso atiende todo: gunicorn con 1 worker y 8 hilos (`backend/package.json:12`).
- Se reinicia cada ~300 peticiones, y con él se vacían sus cachés.
- Comparte procesador con los trabajos de las subidas: miniaturas, huellas de integridad y traducciones CAD.

## 5 · Propuesta, por impacto

| # | Qué | Qué se gana | Esfuerzo |
|---|---|---|---|
| 1 | **CAD sin esperas inútiles.** Montar el visor sin esperar la URL firmada, y no pedir `cad/translate` si la versión ya está traducida: el URN ya está guardado en la versión | ~2 s en cada apertura de CAD (de 3,3 a 1,2–1,5 s), y menos escrituras en la base | Horas |
| 2 | **Una sola URL firmada por apertura.** «Abrir en el escritorio» usa la del lector, que ya está en el almacén compartido | Una petición menos por apertura (de 0,5 a 1,2 s de servidor) | Horas |
| 3 | **Miniaturas sin listar la obra entera.** Consultar solo los archivos que se piden | De 0,7 a 1,3 s de servidor menos por apertura; el único proceso deja de cargar con ese listado | De horas a un día |
| 4 | **Planos vecinos con cabeza.** Firmar las URL de los vecinos, que es barato, y bajar el PDF entero solo si pesa poco (por ejemplo, menos de 5 MB) o cuando el usuario se queda en el plano | Deja de bajar ~46 MB de más cada vez que se abre un plano de paisajismo | Horas |
| 5 | **Visor de CAD precalentado y reutilizado.** Cargar el visor de Autodesk en segundo plano cuando la carpeta tiene CAD, y usar la misma instancia para todos los documentos, como ACC | Adiós a los 7 s del primer CAD, y ~0,4 s menos en cada uno | Un día |
| 6 | **Vista previa legible al instante**, que es lo que dan los mosaicos de ACC. Al subir un plano, generar además una imagen grande, del orden de 2.500–3.000 px en WebP, y mostrarla hasta que llega el vector | Plano legible a los ~2,5 s en vez de a los 10 s | Unos días (servidor y subidas) |
| 7 | **DWG con vistas 2D en PDF**, como ACC. Pedir a Autodesk la conversión con las vistas 2D en PDF (opción `2dviews: pdf` de Model Derivative, a comprobar) | Poco en un DWG pequeño; en los de 50–260 MB puede ser mucho | Probar primero, 1–2 días. Obliga a volver a traducir |
| 8 | **Servidor.** Un segundo worker, o sacar del proceso que atiende los trabajos de fondo (miniaturas, huellas, traducciones) | Todas las esperas del servidor bajan cuando hay carga, como esta mañana | Decisión de infraestructura (coste en Render) |

- **Qué no recomiendo:** pasar los PDF al visor de Autodesk. En un PDF normal ya abrimos antes que ACC. Lo que duele es el plano pesado y el CAD, y eso se ataca con los puntos de arriba.
- **Por dónde empezaría:** 1, 2, 3 y 4 juntos, en una entrega. Son cambios acotados y se miden igual que hoy, antes y después. Luego, el 5 y el 6.

## 6 · Pendiente de medir antes de decidir el resto

- **Tu conexión:** 23,4 MB en 4,9 s son unos 38 Mbit/s. Si ese es el tope de tu línea, poner un CDN delante del almacén no ayudaría mucho; bajar el peso del PDF, sí.
- **Peso de los planos pesados:** cuánto bajarían recomprimiendo sus fotos al subirlos. El 004122 lleva fotografías.
- **ACC con un plano pesado:** si subes el 004122 a ACC, lo mido igual y comparamos el caso difícil.
- **Los 7 s del primer CAD:** confirmar la causa midiendo en una pestaña nueva.

## 7 · Qué no se tocó

- En ACC, nada. En ALEPHIA solo se abrieron documentos. No se cambió código.
- Las pestañas que abrí en tu Chrome están cerradas.
- El lector (`04_LECTOR_PDF_COMO_ACC_INFORME.md`) se commiteó aparte, con tu autorización, y esta investigación no cambia nada de él. De aquí salió el lote P1, que va en el commit siguiente.
