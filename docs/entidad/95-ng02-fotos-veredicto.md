# 95 · NG-02 · FOTOS DE CAMPO — veredicto

**Fecha:** 27-ago-2026 · **Backend:** `88b05c4` + migraciones 23/24 ·
**Suite:** 1470 en verde · **Obra de EXP:** obra pirata (sandbox) ·
**Definición previa:** doc 94, con las tres decisiones aprobadas.

---

## 1 · LO QUE SE CONSTRUYÓ

Un solo objeto (`doc_fotos`) con el MISMO esquema de nombres del GAP 07
(`evidencia/<obra>/<uuid>`): la foto de galería y la evidencia de un acto son
la misma cosa — **adjuntar es vincular** (el vínculo es el nombre del objeto;
`UNIQUE(objeto)` impide que el mismo blob sea dos fotos). Sensibilidad N0–N3
en vez de «privado» (N2/N3: autor + admins; para el resto la foto **no
existe**: 404, no 403). Álbumes que agrupan sin conceder. Marcas como capa
vectorial con coordenadas relativas — el binario jamás se toca — que nacen
PRIVADAS (ni el admin ve las ajenas) y las publica su autor. Tercera vertical
del motor de campo: `FOTO/CREATE`, caso A, idempotente por acto Y por objeto.

## 2 · EXP CONTRA PRODUCCIÓN

**Smoke en línea (9/9):** subida real (201) → miniatura cacheada (1,4 KB /
1,6 s) → marca privada (201, `publicada:false`) → publicada por su autor →
coordenadas fuera de 0..1 rechazadas (400) → PATCH a N2 con el autor viendo →
álbum + agrupar + listado por álbum con la MISMA poda de visibilidad →
**vínculo**: `ADD_EVIDENCE` al issue 19 con el objeto de la foto →
`citada_por: ["ISS-006"]` en la galería.

**Ciclo offline real (el dueño, Wi-Fi apagado):** subió
`RELLENO_POLITECNICO.png` desde la galería → «guardada EN ESTE DISPOSITIVO» →
blob persistido en IndexedDB (33 KB, `subido:false`) → volvió la red → el blob
subió por la ruta de evidencia (que **limpia el GPS** y devuelve lo limpiado
al acto) → `FOTO/CREATE` → **SINCRONIZADA, srv=154** → en la galería con
`origen: "campo sin cobertura"` en su historia. Esto cierra además el residual
declarado del doc 93 («foto por UI» del GAP 07).

**UI verificada en el panel:** pestañas Galería/Multimedia, filtro de álbum,
chips de sensibilidad, insignias `citada_por` y progresiva, miniaturas.

## 3 · LO QUE LA EXP DESTAPÓ (tres defectos reales, corregidos con tripwire)

| # | hallazgo | corrección |
|---|---|---|
| N1 | **`validate_file` LANZA y nunca devuelve `valid`** — tres rutas comprobaban `get('valid')` (siempre None): TODA subida por tracking, pins y fotos moría con 400 desde que el patrón se escribió. Explica por qué la foto de pin nunca funcionó y `photo_evidences` está vacía | los tres consumidores al contrato correcto + tripwire que casa el contrato con TODOS · `88b05c4` |
| N2 | **`ck_sync_objeto` con la lista vieja** — OBJETOS creció en el código y no en la base: el manejador aplicaba, `anotar` violaba el check, todo se revertía → REINTENTABLE. La MISMA clase que F2 | migración 24 (ensayada con rollback: el acto real que moría entró) + tripwire que casa `sync.OBJETOS` con el CHECK de las migraciones · `64d998d` |
| N3 | **la pestaña de campo desaparecía al volver la red** — la sonda corrió sin cobertura (null) y nadie re-preguntaba: la cola sincronizaba pero su pantalla ya no estaba en el menú | re-sonda en el evento `online` + tripwire · este commit |

Y uno de privacidad cerrado por diseño antes de la EXP: la ruta de evidencia
del GAP 07 subía el binario **sin limpiar el EXIF** — ahora limpia antes de
subir y lo limpiado viaja en el acto hasta `doc_fotos.exif`.

## 4 · CAMBIOS EN LAS 143 FILAS DEL BASELINE

| fila | antes | ahora | evidencia |
|---|---|---|---|
| E04 · repositorio de fotos con álbumes | 🟡 | ✅ | galería + álbumes + citada_por, EXP producción |
| E04c · foto ubicada en mapa o plano | ❌ | 🟡 | progresiva en captura y galería (EXP 0+640); anclable a lámina por API; **mapa lat-long fuera por decisión** (doc 94 §3). Residual: conducir el anclaje a lámina desde la UI |
| E04d · anotación sobre la foto | ❌ | ✅ | marca privada→publicada, coords relativas, EXP |
| E04e · foto/álbum privado | ❌ | ✅ | sensibilidad N2 EXP; álbum restringido; la negativa de tercero queda declarada NO EJECUTABLE (una sola identidad, mismo límite de fixture del programa) |

Ninguna otra fila se toca. Cobertura del núcleo común confirmado (la calcula
la página, no yo): **62,5 %** del alcance adoptado — E04d y E04e no suman ahí
porque su FABRICANTE quedó indeterminado en el benchmark: mueven el bloque de
indeterminadas (ALEPHIA tiene 3 · parcial 1 · no tiene 13), no el porcentaje.

## 5 · PARCIALES Y RESIDUALES REALES

- **E04c**: el anclaje FOTO→lámina existe por API (`_TIPOS_ANCLABLES`) sin
  conducción UI; la vista «fotos sobre el plano» pertenece a la pantalla de
  planos. DEPTH RESIDUAL.
- Negativas de tercero (N2 invisible, marca privada ajena, foto de otra obra
  en álbum): cubiertas por suite; EXP no ejecutable con una identidad.
- `photo_evidences`: legacy congelada (decisión 1), declarada, sin herencia.

## 6 · VEREDICTO

**NG-02 · FOTOS DE CAMPO — ARQ ✅ · OP ✅ · EXP ✅ → COMPLETE**, con E04c en
🟡 declarado (el mapa es no-adopción, el anclaje-UI es residual).

**Siguiente frente: NG-03 · Cuaderno de obra** — parte diario tipado con
aprobación y asientos/instrucciones (E05–E08 + C12), citando fotos: por eso
iba después de este.
