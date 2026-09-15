# Velocidad de apertura · lote P1: trabajo repetido

15-sep-2026. Tu autorización: «Autorizo un primer lote únicamente de trabajo redundante/evitable».

**Estado:** implementado y probado en local, y commiteado con tu autorización («HAGAMOS LOS DOS COMIT») en un commit propio, después del lector. Sin push y sin despliegue. La medición «después» en producción necesita tu despliegue.

## En corto

- **Los cinco puntos autorizados están hechos:**
  1. Un CAD ya no pide ni espera la URL firmada de la vista: nadie la leía.
  2. Una sola URL firmada por apertura: la de «Abrir en escritorio» sale del mismo almacén que la vista.
  3. `cad/translate` contesta con la traducción guardada si es la de esta versión; si no, sigue el camino de siempre.
  4. Las miniaturas miran solo los documentos pedidos, no la obra entera.
  5. De las vecinas se firman las de siempre, pero solo se descargan las pegadas de hasta 5 MB. Al cerrar el visor se corta la descarga que esté en curso.
- **Mismos bancos, antes (HEAD) y después (P1):**
  - abrir un PDF: 2 URL firmadas → 1; reabrirlo: 1 → 0;
  - primer DWG de la página, con una firma que tarda 1,5 s:
    - la traducción salía a 1,53 s y ahora a 0,32 s;
    - el visor montaba a 1,72 s y ahora a 0,51 s;
    - «Preparando vista segura…» ya no aparece;
  - carpeta mezclada: se bajaban la vecina pequeña y la pesada; ahora solo la pequeña;
  - cerrar con una vecina bajando: la descarga seguía; ahora se cancela.
- **Puertas en local: todas en verde.**
  - En la app real del banco pasan el enlace a carpeta y a documento, Atrás/Adelante, la versión fija y abrir desde Revisiones.
  - La memoria queda igual que en HEAD y no hay peticiones después de cerrar.
- **En producción:** falta medirlo tras el despliegue, con el mismo registrador y los mismos archivos.
- **Hallazgo nuevo:** el primer CAD de cada página espera unos 300 ms más, porque React retrasa la aparición del visor, que se carga en diferido.
  - Ya ocurría, pero lo tapaba la espera de la URL.
  - No lo he tocado: es de P2.
- **Lo que necesito de ti:** tu push y los Manual Deploy (portal primero, backend después, §8) para medir el «después». Los dos commits, el del lector y el de P1, ya están hechos.

## 1 · Qué cambia, punto por punto

| # | Punto autorizado | Qué hace ahora | Dónde |
|---|---|---|---|
| 1 | CAD: quitar la URL firmada si nadie la usa | Comprobado: en la rama CAD no compartida, nadie lee `securePreviewUrl`, porque el visor abre el modelo traducido por su URN. Se deja de pedir y de esperar, y ya no sale «Preparando vista segura…». La de «Abrir en escritorio» sí tiene consumidor: se conserva, en paralelo. El CAD compartido sigue recibiendo su URL para descargar el original. | `DocumentViewer.jsx` |
| 2 | Una apertura, una sola URL firmada | La pre-firma y el clic de escritorio pasan por el almacén compartido de la vista (`utils/urlFirmada.js`). Si la URL ya se pidió, o se está pidiendo, no sale otra petición. El almacén ya existía: guarda cada URL 15 min, y el servidor reutiliza la firma mientras le queden más de 2 h. | `DocumentViewer.jsx` |
| 3 | Traducción CAD: reutilizarla si ya está | Contesta con lo guardado, sin POST de bucket, GET de manifiesto ni UPDATE en la base. Solo si el estado guardado es `success` y su URN coincide con el que el servidor calcula para esta versión y este empaquetado. Versión nueva, ortofoto nueva, `force` o vista 3D de admin, o estado sin terminar: camino de siempre. Si el URN guardado no abre, el visor retira el visor fallido y pregunta una vez con `verificar`. La guardia de permisos va antes que todo. | `docs_cad.py`, `CadViewer.jsx` |
| 4 | Miniaturas sin recorrer la obra | Un listado pequeño por documento pedido, con su nombre como prefijo: tope de 20 objetos y hasta 8 a la vez. Lo que no está bajo el prefijo de la obra queda pendiente sin mirar, como antes. El sello de caché, solo para lo que se mira. | `documents.py` |
| 5 | PDF pesado: sin vecinas grandes | Se firman las vecinas de siempre (ventana de 4). Solo se descargan las pegadas de tamaño conocido y de hasta 5 MB; sin tamaño, solo se firma. Al cerrar el visor se cancela la descarga en curso. Al cambiar de lámina no, porque suele ser la que el usuario acaba de pulsar. | `utils/vecinasDelLector.js` (nuevo), `PDFViewer.jsx` |

- **Tamaño:** +217 / −78 líneas en 6 ficheros (de `PDFViewer.jsx`, solo lo de P1), más 599 líneas nuevas: la regla y tres ficheros de pruebas.

## 2 · Antes, en producción

- **Dónde y cuándo:**
  - tu Chrome («Browser 2»), con la pestaña a la vista, el 15-sep de 11:11 a 11:38;
  - sin carga masiva: la última entrada de la cuarentena era de las 10:17.
- **Método:** el de la investigación, doble clic real (CDP) y registro dentro de la página.
  - Tiempos desde el primer clic, porque la app abre ahí.
  - «Frío»: página recién cargada. «Caliente»: reabrir en la misma página.
  - La caché del navegador no se vació.
- **Hitos:**
  - **visual:** lo primero que cambia en pantalla;
  - **legible:** primer trazo del plano (PDF) o primer fotograma (CAD);
  - **final:** dibujo completo (PDF) o fotograma final (CAD).

| Archivo | Visual | Legible | Final | Peticiones al abrir |
|---|---|---|---|---|
| PDF 400 KB, frío | 0,04 s (lector) | 3,36 s | 3,58 s | 6: marcas, calibración, miniaturas, **URL firmada ×2** y versiones |
| PDF 400 KB, caliente | 0,02 s | 0,08 s | 0,11 s | 5, entre ellas la URL firmada de escritorio, que nadie usa |
| DWG 2,1 MB, frío | 0,05 s («Preparando vista segura…») | 3,52 s | 3,59 s | **URL firmada ×2**, versiones, `cad/translate` y token |
| DWG 2,1 MB, caliente | 0,01 s | 2,05 s | 2,20 s | `cad/translate`, URL firmada de escritorio, versiones y token |
| PDF 23,4 MB, frío | 0,05 s (silueta a 1,49 s) | 11,30 s | 12,82 s | 6 al abrir y, después, **6 firmas y 2 descargas de vecinas de ~23 MB** |
| PDF 23,4 MB, caliente | 0,02 s | 0,21 s | 0,47 s | 5 |

**Cronologías (segundos desde el clic):**

- **DWG frío:**
  - URL firmada de la vista, sin uso: 0,01 → 0,90;
  - `cad/translate`: 0,90 → 2,13;
  - código del visor, desde caché: 2,13 → 2,20;
  - token: 2,18 → 2,76;
  - arranque del visor, una tarea de 0,45 s: visor creado a 3,22;
  - primer fotograma: 3,52.
- **DWG caliente:** `cad/translate` 0,01 → 0,95 · token 0,95 → 1,47 · arranque de 0,38 s y visor a 1,85 · primer fotograma a 2,05.
- **PDF 400 KB frío:** URL de escritorio 0,01 → 0,73 · URL de la vista 0,01 → 1,23 · descarga desde GCS 1,28 → 3,20 · primer trazo a 3,36.
- **PDF 23,4 MB frío:**
  - descarga: 1,13 → 7,55;
  - la silueta se retira a 8,82 con el lienzo aún en blanco;
  - **vecina 004123, firma y descarga de 9,72 a 16,82, mientras el plano abierto todavía se dibujaba;**
  - primer trazo a 11,30; completo a 12,82;
  - vecina 004121, de 16,85 a 23,93;
  - 4 firmas más, hasta 26,35.
- **Cerrar con una vecina bajando** (004130, que nadie había abierto ese día): se cerró a 12,05 con la descarga de 004131 (~23 MB) en curso, y **esa descarga terminó 2,3–2,5 s después de cerrar**.

## 3 · Después, en local

- **Banco de componentes reales:**
  - `PDFViewer`, `DocumentViewer` y `CadViewer` de verdad, con un backend de mentira que anota cada petición;
  - la URL firmada tarda 300 ms, o 1,5 s en los casos CAD, para que una espera se note;
  - Autodesk es un sustituto;
  - el mismo banco se construyó dos veces: contra HEAD y contra HEAD + P1, ambos sin el lector.
- **App real del banco:**
  - App, Archivos y visores reales, contra el backend real y la base del banco local, con una persona ficticia;
  - nada sale del equipo: el almacén de Google y Autodesk están sustituidos.

| Caso | HEAD (antes) | P1 (después) |
|---|---|---|
| Abrir un PDF | 2 URL firmadas | **1** |
| Reabrir el mismo PDF | 1 | **0** |
| Versión fija (v1) | 2 URL firmadas de v1; abre v1 | **1**; abre v1 |
| Primer DWG de la página, clic real, firma de 1,5 s | «Preparando vista segura…» visible · traducción a **1,53 s** · visor a **1,72 s** · 2 URL firmadas | sin «Preparando…» · traducción a **0,32 s** · visor a **0,51 s** · 1 URL firmada |
| Segundo DWG | traducción a 0,00 s · visor a 0,20 s · 1 URL firmada | traducción a 0,00 s · visor a 0,20 s · **0** |
| Carpeta mezclada (pegadas de 2,3 MB y de 23,4 MB) | descarga **las dos** | descarga **solo la pequeña**, con las mismas 6 firmas |
| Carpeta de planos pequeños | descarga las dos pegadas | igual: las dos pegadas |
| Cerrar con una vecina bajando | la descarga **sigue** | la descarga **se cancela**; nada empieza después de cerrar |
| Traducción guardada que Autodesk ya no tiene | — | retira el visor, verifica **una** vez y monta; si tampoco abre, error y sin bucle |
| Memoria JS tras 7 ciclos de abrir y cerrar PDF y DWG, con recolección forzada | 8,16 → 11,91 MB (+640 KB por ciclo) | 8,17 → 11,91 MB (+638 KB por ciclo) |
| Peticiones en esos ciclos | 36 | **24** |
| Lector con vecinas, tras cerrar | 22,81 MB · 0 lienzos | 22,78 MB · 0 lienzos |

**App real del banco, con P1:**

- **Enlace a la carpeta:** abre Planos con sus documentos.
- **Abrir PL-001:**
  - se ve, con una sola URL firmada;
  - la dirección lleva el documento;
  - miniaturas responde bien aunque el almacén falle.
- **Atrás y Adelante:** Atrás cierra el visor y quita el documento de la dirección; Adelante lo reabre sin volver a firmar.
- **Enlace directo al documento:** lo abre con una sola URL firmada.
- **Versión fija por enlace:** abre el fichero de v1, con una URL.
- **DWG con traducción guardada** (leída por la consulta real de la base):
  - monta sin «Preparando…»;
  - `translate` responde con `origen: guardado`;
  - pide una sola URL firmada, la de escritorio.
- **Cerrar el CAD con Atrás:** no queda ningún visor.
- **DWG sin traducción guardada:** sigue el camino de siempre.
- **Revisiones** (ReviewsView real, usuario ficticio r2):
  - lista las revisiones y el detalle ofrece el documento;
  - el documento se abre y se ve;
  - una URL firmada por id y versión, y ninguna de vecinas.

**Pruebas:**

- **Backend:**
  - 23 pruebas nuevas;
  - suite completa: 1919 en verde y 1 fallo, `test_capacidades_con_puerta`, el mismo del 14-sep.
- **Frontend:** `npm test`, 10 bancos en verde, con 13 pruebas nuevas.
- **ESLint de lo tocado:** los mismos 6 errores que en HEAD; ninguno nuevo.
- **Banco del visor CAD** (`probar-cad`): 7/7.
- **Unidad separable:**
  - P1 reconstruido sobre HEAD, sin el lector, coincide exactamente con el disco en 4 ficheros;
  - `PDFViewer.jsx` lleva además el lector;
  - sobre ese árbol HEAD + P1: 9 bancos de node, 45 pruebas de backend, lint igual que HEAD y banco de componentes 16/16.

## 4 · Las puertas del lote

| Puerta | En local | En producción |
|---|---|---|
| El PDF pequeño no empeora perceptiblemente | ✓ se ve igual, con una petición menos | pendiente de medir |
| El DWG caliente mejora o no empeora | ✓ traducción sin esperas; al reabrir, ninguna URL firmada | pendiente de medir |
| Menos peticiones redundantes, demostradas | ✓ URL firmada: 2→1 en PDF y en CAD, 1→0 al reabrir; `translate` sin llamadas a Autodesk ni escritura si ya está traducido; miniaturas sin listar la obra | pendiente de medir |
| El PDF pesado no descarga vecinas grandes | ✓ carpeta mezclada | pendiente, con el 004122 |
| Versión fija, enlace, Atrás/Adelante y Revisiones | ✓ app real y Revisiones reales | tu UAT |
| Sin memoria persistente nueva ni peticiones huérfanas al cerrar | ✓ memoria igual que HEAD; la descarga de la vecina se cancela; 0 visores | pendiente de medir |

## 5 · Qué cabe esperar en producción (estimación, no medida)

- **DWG caliente** (hoy 2,05 s):
  - se va la mayor parte de los 0,94 s de `translate`;
  - quedan el token (~0,5 s) y el arranque del visor (~0,4 s);
  - del orden de **1,2–1,4 s**.
- **DWG frío** (hoy 3,52 s):
  - se van los 0,9 s de la URL de la vista y buena parte de `translate`;
  - puede sumar los ~0,3 s de §6;
  - del orden de **1,7–2,2 s**.
- **PDF 400 KB:** una petición menos al servidor. Manda la descarga (1,9 s), así que el cambio visible será pequeño.
- **PDF 23,4 MB:**
  - dejan de bajar ~46 MB que nadie pidió, y el plano abierto se dibuja sin competir con una vecina;
  - el primer trazo debería mejorar algo;
  - lo grueso sigue ahí: la descarga (~6 s) y el dibujo (~4 s), que son P2 o el punto 6 de la propuesta.
- **Servidor:** cada apertura deja de listar la obra, y cada CAD deja de hacer dos llamadas a Autodesk y una escritura. Con un solo proceso, eso alivia todas las esperas.
- **Frente a ACC:** ACC abrió el DWG en 2,7 s. Si se cumple la estimación, ALEPHIA quedaría por debajo sin P2. Solo lo dirá la medición.

## 6 · Hallazgos y límites

- **~300 ms en el primer CAD de cada página:**
  - medido con clic real: la traducción sale a 0,32 s y el visor monta a 0,51 s; en el segundo CAD, a 0,00 s y 0,20 s;
  - el código del visor carga en 20 ms: la espera es de React 19.2.4 (`FALLBACK_THROTTLE_MS = 300`), que retrasa la aparición de un componente cargado en diferido;
  - ya pasaba antes, tapado por la espera de la URL;
  - arreglarlo es precargar el visor CAD, que no está autorizado: va a P2.
- **Miniaturas de carpetas grandes:**
  - ahora es una consulta al almacén por documento pedido, 8 a la vez: con 300 miniaturas, unas 38 tandas;
  - antes era un listado de la obra entera, cuyo coste crecía con la obra;
  - no se pudo medir contra el almacén real: en local no hay credenciales, a propósito;
  - conviene mirarlo en la medición con la cuadrícula de una carpeta grande.
- **Traducción guardada que Autodesk ya no tiene:** el visor falla una vez, verifica y abre. Solo en ese caso cuesta un viaje más.
- **Medición de memoria:** es la del hilo principal; lo que pdf.js interpreta en su worker no entra.
- **Ya estaban y siguen:** `test_capacidades_con_puerta` y los 6 errores de ESLint.

## 7 · P2, solo si la medición lo pide

- **Cuándo:** si el primer CAD sigue muy por encima de ACC (2,7 s).
- **Qué propondré entonces, aparte:** un visor CAD precargado y reutilizable.
  - Cargar el código del visor cuando la carpeta tiene CAD, con lo que se van los ~300 ms.
  - Una sola instancia para todos los documentos, como ACC.
  - Medido con el tiempo de la primera apertura y con la memoria.
- **Este lote no incluye nada de P2.**

## 8 · Cómo se commiteó sin mezclar

- **Ficheros de P1:**
  - modificados:
    - `backend/routes/docs_cad.py` y `backend/routes/documents.py`;
    - `frontend-docs/src/components/DocumentViewer.jsx` y `CadViewer.jsx`;
    - `frontend-docs/src/components/PDFViewer.jsx`, solo sus bloques;
    - `frontend-docs/src/probar-cad.jsx`;
  - nuevos:
    - `frontend-docs/src/utils/vecinasDelLector.js`;
    - `frontend-docs/pruebas/vecinasDelLector.prueba.mjs` y `aperturaSinRepetir.prueba.mjs`;
    - `backend/tests/test_apertura_sin_trabajo_repetido.py`;
    - este informe y su bloque en `docs/AI_WORKSTATE.md`.
- **`PDFViewer.jsx` y `AI_WORKSTATE.md` llevan también el lector.** Se hizo en dos commits: primero el lector, con esos dos ficheros sin nada de P1, y después P1 encima.
- **Fuera de los dos commits:** el WIP ajeno de `FilesPage.jsx`, `.claude/launch.json` y `probar-primitivas.*`.
- **Mensaje:** `perf(docs): stop repeating work when opening documents`, sin línea de coautoría.
- **Orden de despliegue: el portal primero y el backend después.**
  - Portal nuevo con backend viejo: todo funciona como hoy, porque el campo `origen` no llega y la vuelta atrás no hace falta.
  - El orden contrario dejaría un rato con el portal viejo frente al backend nuevo: una traducción guardada que Autodesk ya no tuviera daría error en vez de verificarse.

## 9 · La medición «después»

- **Antes de medir:** tras tu despliegue, comprobar `/api/health` (el commit del backend) y el portal por su contenido.
- **Protocolo, el mismo del «antes»:**
  - tu Chrome («Browser 2») con la pestaña a la vista;
  - los mismos tres archivos, en el mismo orden, en frío y en caliente;
  - el mismo registrador de página, que guardo en local para esto;
  - declarar el estado de la carga masiva.
- **Huérfanas:** repetir la prueba de cerrar con una vecina bajando, con un plano de PAISAJISMO que no se haya abierto ese día.
- **Entrega:** tablas y cronologías antes/después contra las puertas de §4 y, si hace falta, P2 aparte.

## 10 · Qué no se tocó

- **Lo no autorizado:** motor PDF, visor CAD precargado o reutilizado, infraestructura y workers, mosaicos, almacenamiento y migraciones.
- **Producción:** solo se abrieron documentos para medir.
- **Bancos:**
  - clúster local del scratchpad y personas ficticias;
  - Autodesk bloqueado y almacén sustituido;
  - no se leyó ni se escribió ningún secreto.
- **Git:** dos commits locales con tu autorización, el del lector y el de P1; ni push ni despliegue.
