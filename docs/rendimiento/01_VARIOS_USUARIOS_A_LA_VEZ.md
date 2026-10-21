# Rendimiento con varios usuarios a la vez · View y Docs

**Fecha:** 20-oct-2026 · **Pedido:** «qué podríamos hacer profesionalmente, investigar, para que nuestro visor y Docs
sean más rápidos para varios usuarios a la vez».
**Alcance:** solo investigación y medición. No se cambió código ni configuración. No se hizo prueba de carga contra
producción: con 1 CPU y 2 GB podría tumbarla.

---

## 0 · En una frase

El servidor no es lento por falta de máquina. Hace en cada petición trabajo que debería hacerse **una sola vez**, y
recibe peticiones que **no hacen falta**. Arreglando eso, la máquina actual (1 CPU, 2 GB) debería aguantar 20 usuarios
sin pagar más.

---

## 1 · Cómo está montado hoy (observado)

| Pieza | Hoy |
|---|---|
| Backend | Render Virginia (`visor-ecd-backend-va`), 1 CPU / 2 GB, gunicorn **1 proceso × 8 hilos**, `--max-requests 300` |
| Base | Cloud SQL (Postgres), pool de 2–15 conexiones; la sesión se recuerda 15 s en memoria |
| View | Sitio estático en Render detrás de Cloudflare; llama al backend **directamente** a `onrender.com` (otro dominio) |
| Docs | Sitio estático en Render detrás de Cloudflare; llama a `/api` de **su mismo dominio** (Cloudflare → Render), HTTP/2 |
| Modelos 3D | SVF2 desde Autodesk: ya es el formato rápido; no depende de nuestro servidor |

---

## 2 · Lo que se midió (con la sesión del propietario, solo lecturas)

### 2.1 · Red

| Medida | Valor |
|---|---|
| `/api/health` (no toca la base) | **~160 ms**: es el viaje Lima ↔ Virginia; ninguna optimización de código lo baja |
| Consulta pequeña con base (`/api/token`, `/api/inventory/version`) | 168–461 ms → la base añade ~10–90 ms; el resto es servidor |
| Permiso CORS (OPTIONS) de View | 265 ms; **sin `Access-Control-Max-Age`** → Chrome lo recuerda solo 5 s |

### 2.2 · Abrir el Frente Canal en View (una apertura real)

- 22 peticiones a nuestro backend en los primeros 35 s; 8 salen a la vez al abrir.
- Pequeñas: 165–650 ms cada una. Pesadas: `/api/config/project/check-updates` **2,6 s**, `/api/civil/earthworks-mesh`
  **2,3 s**, mosaicos de la ortofoto 1,4–1,7 s, `/api/civil/alignments` 1,0 s.
- `/api/inventory/version` tardó **1,65 s** dentro del lote de apertura y 0,25–0,46 s sola: se nota la cola en un
  proceso de un núcleo.
- El inventario completo NO se descargó: estaba en la caché del navegador (IndexedDB), que ya funciona bien.

### 2.3 · El inventario completo del Canal (lo que paga cada usuario sin caché o tras actualizar un modelo)

| Medida | Valor |
|---|---|
| Filas | 19.889 |
| JSON | **66,5 MB** |
| Espera hasta el primer byte | **8,4 s** |
| Descarga + lectura en el navegador | 0,34 s + 0,33 s |

Casi todo es servidor. El código (`backend/inventory_http.py:204`) arma la lista entera en memoria, la serializa y la
comprime con `gzip.compress(body)`, que por defecto usa el **nivel 9** (el más lento). Medido en local con un JSON
sintético del mismo orden:

| Compresión de 39 MB | Tiempo | Resultado |
|---|---|---|
| Nivel 9 (hoy) | **4,45 s** | 5,44 MB |
| Nivel 6 | 1,13 s | 5,83 MB |
| Nivel 1 | 0,38 s | 8,14 MB |

**Memoria de una sola petición** (sintético de 82 MB, mismo camino): pico **~416 MB** (≈ 340 MB para los 66 MB
reales). Con 2 GB y el proceso ya ocupando su parte, **3–4 personas pidiendo el inventario a la vez** (lo normal
justo después de «Actualizar modelos») bastan para un «Ran out of memory», como las caídas del 14-oct por las láminas.

### 2.4 · Docs

- Abrir una carpeta: `/api/docs/list` + `/api/docs/cad/acc-bridge/folder` en paralelo, **400–600 ms**. Aceptable.
- Búsqueda inicial `/api/docs/search` 1,1 s.
- Lo pesado de Docs (dibujar láminas) ya se sacó de la petición el 14-oct (`2e093d0`); ver la memoria de ese incidente.

### 2.5 · Peticiones de fondo por usuario (mientras tiene View abierto)

| Qué | Frecuencia | Nota |
|---|---|---|
| `/api/link/web-presence` (POST) | **cada 5 s**, también con la pestaña oculta | UPSERT + commit en Postgres sobre **una fila por obra**: 20 usuarios escriben la misma fila |
| Permiso CORS de lo anterior | cada 5 s | porque el permiso caduca a los 5 s |
| Ortofoto `refresh` | cada 60 s | |
| `check-updates` | cada 5 min | cuesta 2,6 s de servidor |
| Chip de Revit activo | estado cada 3 s + selección cada 1,2 s | solo quien lo enciende |

20 usuarios con View abierto = **~8 peticiones por segundo** solo de fondo, sin que nadie haga nada.

### 2.6 · Páginas (ficheros estáticos)

| Fichero | Peso (br) | Caché |
|---|---|---|
| View `index-*.js` | **961 KB** (3,3 MB sin comprimir) | `max-age=0, s-maxage=300` |
| View precarga `pdf-*.js` + `xlsx-*.js` en cada apertura | 226 KB | aunque no se usen |
| Docs `index-*.js` | 435 KB | `max-age=0, s-maxage=300` |
| `webxr-polyfill@latest` (jsDelivr) | 49 KB | versión sin fijar, bloquea el arranque, solo hace falta en AR |

Los `/assets/*` llevan huella en el nombre: cambian en cada despliegue y podrían guardarse un año (`immutable`). Hoy
el navegador los revalida en cada apertura (responde 304, ~200 ms por fichero) y Cloudflare vuelve a Render cada 5 min.

---

## 3 · Hallazgos, por impacto

| # | Hallazgo | Efecto con 10–20 usuarios | Arreglo |
|---|---|---|---|
| **H1** | Inventario: se arma y comprime a nivel 9 **en cada petición**, 8,4 s de CPU y ~340 MB | cola de minutos y **riesgo de caída** tras actualizar un modelo | generarlo **una vez por versión** y servirlo ya comprimido (ver P1) |
| **H2** | Presencia cada 5 s, también oculta, sobre una sola fila por obra | ~4 escrituras/s que se bloquean entre sí | 30 s, pausa con la pestaña oculta, fila por usuario |
| **H3** | View sin `Access-Control-Max-Age` | casi cada llamada se duplica (+160–260 ms) y el servidor recibe el doble | `max_age=7200` en `CORS(...)`; o que View use `/api` de su propio dominio como Docs |
| **H4** | `check-updates` (2,6 s) y `earthworks-mesh` (2,3 s) al abrir | se apilan en el único proceso | cachear por versión de modelo |
| **H5** | Assets sin caché inmutable | cada apertura revalida ~10 ficheros | cabecera `Cache-Control: public, max-age=31536000, immutable` en `/assets/*` (ajuste de Render) |
| **H6** | View precarga PDF y Excel; polyfill AR `@latest` bloqueante | +275 KB y un script externo sin versión en cada apertura | cargarlos solo cuando se usan |
| **H7** | Sin medición en producción (el navegador no ve tiempos del servidor) | no se puede vigilar p50/p95 | cabeceras `Server-Timing` y `Timing-Allow-Origin` + registro de duración por ruta |
| **H8** | Higiene: el `_redirects` de View manda `/api` a **Oregón** (viejo); varios componentes caen a Oregón por defecto | no afecta a la web hoy (usa la variable de Virginia) pero confunde y la APK va a Oregón | unificar en Virginia |

---

## 4 · Plan propuesto

### Fase 1 · Rápido, sin coste, bajo riesgo (días)

1. **P1 · Inventario «una vez por versión».** El servidor ya calcula la revisión (`inventory_version_request`). Guardar el
   JSON comprimido de esa revisión (memoria del proceso + GCS) y servir ese mismo cuerpo a todos hasta que cambie.
   Mientras tanto, bajar la compresión a nivel 1–6 ya quita ~4× de CPU. *Toca la lectura de Inventory (identidad B1,
   CLOSED): necesita su autorización.*
2. **P2 · CORS** con `max_age=7200`: una línea en `server.py`.
3. **P3 · Presencia** cada 30 s, en pausa con la pestaña oculta, y fila por usuario (arregla además que el último en
   latir pisa al usuario del plugin de Revit).
4. **P4 · Caché inmutable** para `/assets/*` en los dos sitios (ajuste en el panel de Render, lo hace el propietario).
5. **P5 · View**: no precargar PDF/Excel; polyfill AR fijado de versión y solo en AR.

**Resultado esperado de la Fase 1:**
- 20 usuarios abriendo el Canal tras una actualización dejan de ser 20 × 8 s de CPU (y ~340 MB cada uno) y pasan a ser **un armado más 19 entregas del mismo fichero**.
- El tráfico de fondo baja de ~8 a ~1 petición por segundo.
- Cada clic en View ahorra un viaje.

### Fase 2 · Profesional (semanas)

- **Inventario como fichero** al extraer: el JSON comprimido se escribe en GCS y el navegador lo baja con URL firmada,
  como hacen Tandem y ACC con su base de propiedades. El backend deja de mover 66 MB.
- **Caché por versión** de Civil (`earthworks-mesh`, `alignments`) y de `check-updates`.
- **Medición en producción** (H7): un panel con p50/p95 por ruta y memoria del proceso.
- **Prueba de carga controlada** (k6 o Locust, 20 usuarios simulados) contra una copia, nunca contra producción, para
  dar la cifra real antes/después.

### Fase 3 · Infraestructura (solo si la Fase 2 no basta; tiene coste)

- Dos instancias o autoescalado en Render; o llevar la preparación pesada (inventario, láminas) a trabajos en Cloud Run.
- Región: Render no tiene Sudamérica. Un backend en Cloud Run Santiago (`southamerica-west1`) bajaría los ~160 ms por
  viaje, pero obliga a mover también la base. **No se recomienda ahora:** el propietario no quiere pagar más y la Fase 1
  ataca la causa.

---

## 4 bis · Hecho (20-oct-2026)

### Fase 1 (commits `a637068f` backend y `e276112e` visor)

- **P1 · Inventario por revisión.**
  - Banco con la función real, 20 usuarios y 8 hilos: antes 246 s, p95 113 s, 20 consultas pesadas y pico de 1.454 MB.
  - Después: 12,8 s, 1 consulta y 259 MB.
- **P2 · CORS:** permiso previo recordado 2 h.
- **P3 · Presencia:** cada 30 s (60 s con la pestaña oculta), una fila por usuario y ventana de 150 s.
- **P5 · Carga:** Excel y jsPDF solo al usarse.
- **P6 · Reinicio de gunicorn:** cada 2000 peticiones, con dispersión 300.

### Fase 2

**Medición (H7).** `backend/medicion.py`:
- `Server-Timing: app;dur=…` en cada respuesta;
- `Timing-Allow-Origin` solo para los orígenes de CORS_ORIGINS;
- una línea `LENTO <método> <regla> -> <estado> en <ms>` en el registro para cada petición de más de 1500 ms (`MEDICION_LENTO_MS`), con la regla de la ruta, nunca identificadores.

**`check-updates` (H4).** Antes preguntaba a Autodesk modelo a modelo, en serie, y lo repetía cada usuario cada 5 min. Ahora:
- las preguntas van en paralelo, hasta 6 a la vez;
- la respuesta se comparte 2 min por obra;
- la clave incluye la versión registrada de cada modelo;
- una respuesta con errores de Autodesk no se comparte.

Medido en producción: abriendo el frente coincidía con `earthworks-mesh` en el único proceso (2,9 s y 2,85 s). `earthworks-mesh` sola tarda 0,6–0,7 s y ya tenía caché propia.

**Tailwind congelado (P7), en View y en Docs.** El CDN de pruebas (146 KB, compilador en el navegador) se cambia por el CSS exacto que generaba, en `src/tailwind-congelado.css`:
- Mismos parámetros: Tailwind 3.4.17, los mismos plugins y la misma configuración.
- Mismas clases: las del código y las de los scripts del visor de Autodesk.
- Comprobado en producción cambiando el CDN por el fichero en caliente y comparando el estilo calculado de cada elemento.

| App | Pantalla | Elementos | Diferencias |
|---|---|---|---|
| View | Visor | 979 | 0 |
| View | Filtros + Inventario | 13.334 | 0 |
| View | Configurar filtros | 13.503 | 0 |
| View | Tras pulsar Medir | 13.334 | 0 |
| Docs | Proyectos | 417 | 0 |
| Docs | Carpeta con planos | 718 | 0 |
| Docs | Lector de un plano | 915 | 0 (*) |

(*) La única diferencia es la escala de la marca animada `pdf-marca-respira`, que cambia en cada medición.

Además, el polyfill de AR queda fijado en la versión 2.0.3, en lugar de `@latest`.

**No hecho, a propósito:**
- **Inventario como fichero en GCS.** Con P1 y P6 el inventario se arma una vez por versión y solo se pierde al desplegar. Moverlo a GCS obliga a cambiar también el flujo del navegador (lectura de Inventory) para ganar poco. Se reconsidera si el registro `LENTO` muestra `/api/inventory` con frecuencia.
- **Prueba de carga real.** No hay una copia de pruebas del backend. El banco en proceso (§P1) mide la misma función; la prueba con 20 usuarios simulados queda para cuando exista esa copia. Nunca contra producción.

### Fase 3 · Preparar dos procesos sin coste (hecho, sin encender)

Auditoría del estado que el backend guarda en la memoria del proceso. Con dos procesos de gunicorn la memoria no se comparte: lo que un proceso guarda, el otro no lo ve.

| Estado | Con dos procesos | Qué se hizo |
|---|---|---|
| Extracción del inventario (`EXTRACTION_JOBS`) | ya se guardaba también en Postgres | nada |
| **Design Automation de Civil** (`UPLOAD_KEYS`, `RESULT_OBJECTS`) | **fallaba**: la clave para cerrar la subida del resultado vivía solo en memoria. Ya fallaba **hoy** si el proceso se reiniciaba a mitad del trabajo, y con `--max-requests 300` pasaba a menudo | migración **39** `da_trabajos`; el cierre se reclama de forma atómica (`UPDATE … RETURNING`) para que dos procesos no cierren dos veces; sin la tabla funciona como antes |
| Importación de WhatsApp | trabajo solo en memoria | no se toca: lee de una carpeta del propio servidor, es una herramienta local |
| `MAP_JOBS` | no se usa | nada |
| Cachés (sesión, permisos, inventario, malla, actualizaciones) | cada proceso tiene la suya; más memoria, mismo resultado | nada |
| Evitar extracciones duplicadas (`_EXTRACTING_KEYS`) | dos procesos podrían extraer a la vez el mismo modelo | nada: las escrituras ya se serializan en Postgres por obra (`pg_advisory_xact_lock`); sería trabajo perdido, no datos dañados |
| Limitador de peticiones | sin Redis, cada proceso cuenta aparte | ya documentado en `server.py`: sigue frenando la fuerza bruta |

**Memoria.** Un proceso recién arrancado ocupa unos 248 MB (medido en local). Dos serían unos 500 MB en reposo, más los picos: cada proceso construye su inventario una sola vez, unos 260 MB. Cabe en 2 GB, pero sin mucho margen.

**Sin interruptor, a propósito.** Se probó `--workers ${GUNICORN_PROCESOS:-1}`, pero la prueba `test_un_solo_worker_y_varios_hilos` protege la decisión de un solo proceso (las caídas de memoria de agosto). No se adapta la prueba: pasar a dos procesos será un cambio explícito, con su propio commit y con datos. Un interruptor en el panel apenas ahorraba nada, porque cambiar una variable en Render también reinicia el servicio.

**Antes de proponer dos procesos:**
1. migración 39 aplicada;
2. Fases 1 y 2 desplegadas;
3. una semana de registros `LENTO`;
4. mirar la memoria en el panel de Render.

### Fase 3 · Infraestructura: decisión

No se toca hasta tener una semana de datos con la Fase 1 y la Fase 2 desplegadas: `Server-Timing` desde el navegador y las líneas `LENTO` en el registro de Render. Solo si las rutas siguen lentas con 10–20 usuarios, por orden de coste:

1. **Dos procesos de gunicorn en el mismo plan.** Ahora es posible porque P1 bajó el pico de memoria del inventario. Uno atascado no bloquea al otro. Duplica las cachés en memoria.
2. **Llevar la preparación pesada a trabajos aparte en Cloud Run** (inventario, láminas).
3. **Subir de plan o acercar la región.** Render no tiene Sudamérica. Hoy el nodo de Cloudflare en Lima ya termina la conexión segura cerca del usuario (`CF-RAY …-LIM`).

## 5 · Lo que NO se hizo, a propósito

- Ninguna prueba de carga contra producción.
- Ningún cambio de código ni de configuración.
- Las cifras de compresión y memoria del inventario son de un JSON **sintético** del mismo orden (39–82 MB), no del
  inventario real; los 8,4 s y los 66,5 MB sí son medidos en producción.

## 6 · Decisiones del propietario

1. ¿Autoriza tocar la lectura del inventario (B1, CLOSED) para P1?
2. ¿Hacemos la Fase 1 completa en local, con medición antes/después, y luego se publica?
3. Cabecera inmutable de `/assets/*`: es un ajuste en el panel de Render (dos servicios), lo hace él.
