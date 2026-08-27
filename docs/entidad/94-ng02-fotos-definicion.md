# 94 · NG-02 · FOTOS DE CAMPO — qué son, antes de programarlas

**Fecha:** 27-ago-2026 · **Naturaleza:** definición y auditoría. Sin código.
**Filas del baseline que gobierna:** E04 (galería/álbumes 🟡) · E04c (mapa/plano ❌)
· E04d (anotación ❌) · E04e (privacidad ❌). E04b (vínculo a registro) ya es ✅.

---

## 1 · LO QUE UNA FOTO DE CAMPO ES — y lo que no

Una foto de campo es **evidencia citable**: alguien, en un momento declarado,
vio algo en un sitio, y la foto es el testigo. Para que valga como evidencia
tiene que poder responder tres preguntas: **de qué obra es**, **dónde se tomó**
(progresiva/elemento/lámina, no solo lat-long), y **a qué acto acompaña** (un
punch, un punto de acta, un asiento — o ninguno todavía).

**Lo que NO es:** un rollo de carrete suelto. Una galería donde las fotos no se
pueden citar desde los actos es un álbum de recuerdos, no expediente. Y no es
tampoco un clon de la herramienta Photos de los fabricantes: el benchmark pide
capacidades, no su pantalla.

## 2 · LO QUE YA EXISTE, MEDIDO (nada se construye dos veces)

| pieza | estado | qué aporta a NG-02 |
|---|---|---|
| `tracking_pins` (x, y, z, `external_id`, specialty, JSONB) | vivo | ancla 3D al MODELO — y sigue al elemento entre versiones |
| `POST /api/project-pins/photo` | vivo | sube a GCS **limpiando el GPS del EXIF antes** y guardando los metadatos aparte (`privacidad_imagen`) — la decisión de privacidad ya está tomada y bien |
| `plano_anclajes` (GAP 02) | vivo | ancla 2D a la LÁMINA (revision_id + x,y por página) |
| GAP 07: `capturarConEvidencia` + `/api/sync/evidencia` + objeto determinista | vivo, EXP ✅ | captura offline del binario con idempotencia externa |
| `doc_issues.evidencia` (JSONB) | vivo, EXP ✅ | el vínculo foto→issue ya existe |
| import de WhatsApp a Multimedia | vivo | entrada masiva desde el canal real de la obra |
| `photo_evidences` | **legacy, vacía** | nada — se declara y no se hereda |

## 3 · LA DECISIÓN DE ARQUITECTURA: UN OBJETO, MUCHOS ANCLAJES

**No** una tabla por pantalla. Una sola identidad de foto (`doc_fotos`) con:

    contenido      objeto GCS (nombre determinista si nació de la cola)
    declarado      capturado_en (del dispositivo, NO autoritativo — GAP 07),
                   autor, obra
    ubicación      0..n anclajes: elemento 3D (external_id) · lámina 2D
                   (plano_anclajes) · progresiva · texto libre
    vínculos       0..n actos: issue, punto de acta, asiento — por referencia,
                   como Forms de ADSK (dos direcciones)
    privacidad     GPS fuera del fichero SIEMPRE (regla ya vigente);
                   foto/álbum privado = mismo modelo de sensibilidad ISO
                   19650-5 que ya gobierna documentos, NO un booleano nuevo
    álbum          agrupación NO exclusiva (una foto puede estar en varios);
                   el álbum no da permisos — los da la obra y la sensibilidad

**Regla que no se negocia:** la foto de un acto (evidencia de issue/acta) y la
foto de galería son **EL MISMO OBJETO**. Adjuntar a un acto = vincular, no
copiar. Si fueran dos tablas, la evidencia contractual y la galería divergirían
a la primera semana.

## 4 · LAS CUATRO FILAS, EN CONCRETO

- **E04 galería/álbumes** — pantalla sobre `doc_fotos` con filtros (obra,
  fecha declarada, autor, anclaje, álbum). MultimediaModule se conserva para
  vídeo/WhatsApp; la galería de campo es de fotos-evidencia.
- **E04c mapa/plano** — la foto SE VE donde está anclada: en el plano (por
  `plano_anclajes`) y por progresiva en el lineal. Mapa lat-long NO en esta
  fase: el GPS se limpia por privacidad y la obra es lineal — la progresiva ES
  nuestra geolocalización. (Divergencia deliberada con Procore Map View,
  declarada.)
- **E04d anotación** — marcas SOBRE la foto (flecha, círculo, texto) guardadas
  como capa vectorial aparte (JSONB), nunca quemadas en el binario: el original
  es el testigo y no se toca. Mismo criterio personal→publicado que markups.
- **E04e privacidad** — sensibilidad por foto y por álbum reutilizando el
  triaje ISO 19650-5 existente; quién ve qué sale de la obra + sensibilidad,
  no de un flag suelto.

## 5 · OFFLINE DESDE EL PRIMER DÍA

La captura de foto en campo va por `capturarConEvidencia` (GAP 07): blob
persistido en IndexedDB ≠ seleccionado, subida idempotente por objeto
determinista, y el acto `FOTO/CREATE` entra a la cola con sus anclajes en el
payload. **El motor no se toca: se le añade el tipo.**

## 6 · LO QUE PIDE DECISIÓN DEL DUEÑO ANTES DE CONSTRUIR

1. **¿`photo_evidences` se declara legacy congelada** (como los 33 Red Lines) y
   la galería nace solo de `doc_fotos`? Propuesta: sí — está vacía, no hay nada
   que migrar.
2. **Álbum con permisos propios ¿o solo sensibilidad?** Propuesta: solo
   sensibilidad (un álbum jamás concede acceso que la obra no dio).
3. **El mapa lat-long queda fuera** de esta fase (divergencia con Procore
   declarada en el baseline). ¿Conforme?

Con las tres respuestas, la cadencia de siempre: semántica → suite → migración
→ schema → backend → smoke → frontend → EXP (incluida una captura de foto
offline real, que además cierra el residual de GAP 07).
