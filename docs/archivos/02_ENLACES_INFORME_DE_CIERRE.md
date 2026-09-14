# Archivos · enlaces por obra, carpeta y documento · informe de cierre

14-sep-2026. Base: `88b300f` (E1.3, publicado y sin desplegar). Pedido: tu «ARCHIVOS · DEEP LINKS — CONTRATO FINAL BASADO EN ACC». Diagnóstico previo: `01_ENLACES_POR_CARPETA_Y_DOCUMENTO.md`.

**Estado:** probado en local: servidor, PostgreSQL y la app real del banco. Revisado por ti («DEEP LINKS ARCHIVOS CODE/TEST GREEN LOCAL = PASS») y **commiteado** con tu autorización sobre `88b300f`. **Push hecho** por ti (`9dd13e8` en GitHub), tras comprobar Auto-Deploy «Off» en los 4 servicios. **Sin despliegue** (§9).

## En corto

- **La dirección cambia como en ACC:** obra → carpeta → subcarpeta → documento, siempre con identificadores.
- **Atrás, Adelante y F5** devuelven la misma carpeta y el mismo documento.
- **«Copiar enlace»** en el botón derecho de carpetas y documentos. En un documento copia obra + carpeta + documento, es decir, la versión vigente.
- **Un enlace no da acceso.** El servidor comprueba obra, elemento y permiso cada vez. Si no se puede abrir, siempre el mismo aviso: «No tienes acceso a ese elemento o ya no existe.»
- **Si el documento se movió,** se abre donde está hoy y la dirección se corrige sin añadir un paso en Atrás.
- **El enlace sobrevive al inicio de sesión.**

## 1 · El formato

| Qué | Dirección |
|---|---|
| Obra | `/?obra=<obra>` |
| Carpeta | `/?obra=<obra>&carpeta=<id>` |
| Documento, en su versión vigente | `/?obra=<obra>&carpeta=<id>&documento=<id>` |
| Una versión fija | `…&documento=<id>&version=<id>` |
| Revisión (sin cambios) | `/?obra=<obra>&revision=<número>` |

- **`obra`** es el identificador de la obra, el mismo que ya usan las revisiones.
- **`carpeta`, `documento` y `version`** son identificadores, nunca nombres.
- **La carpeta raíz** («Archivos de proyecto») no lleva `carpeta`: su enlace es el de la obra. Un documento de la raíz queda así: `?obra=…&documento=…`.

## 2 · Qué verás

| Acción | Dirección | En Atrás |
|---|---|---|
| Elegir una obra | `?obra=` | un paso (vuelve a la lista de obras) |
| Entrar en una carpeta o subcarpeta | añade `carpeta=` | un paso por carpeta |
| Abrir un documento (tabla o cuadrícula) | añade `documento=` | un paso (Atrás lo cierra) |
| Cerrar el documento | vuelve la dirección de su carpeta | sin paso nuevo |
| Pasar al siguiente dentro del lector | cambia `documento=` | sin paso nuevo |
| Elegir otra versión en el lector | pone o quita `version=` | sin paso nuevo |
| Ir a Planos, Revisiones u otra sección | queda `?obra=` | sin paso nuevo |
| Volver a Archivos | vuelve la carpeta que estabas viendo | sin paso nuevo |
| F5 | la misma carpeta, documento y versión | — |

## 3 · Seguridad

- **Orden de las comprobaciones en el servidor:** usuario → obra → elemento → permiso. Con versión, además: versión → documento, antes de devolver ningún dato.
- **Ruta nueva, de solo lectura:** `GET /api/docs/ubicacion`. Devuelve dónde está hoy la carpeta o el documento: la cadena de carpetas y el identificador de su carpeta. No devuelve el documento; el documento lo abre el listado de su carpeta, el de siempre.
- **La carpeta del enlace no decide nada si hay documento:** se abre la carpeta donde está hoy. Nunca se abre un documento dentro de otra carpeta porque la dirección lo diga.
- **Una sola respuesta neutra** (404, el mismo texto, sin nombres ni ubicación) para todos estos casos:
  - no existe;
  - es de otra obra;
  - está en la papelera;
  - sin permiso;
  - versión de otro documento;
  - identificador mal formado;
  - una carpeta pedida como documento, o al revés.
- **Quien no es de la obra** se queda en el 403 del perímetro, como hoy.
- **Con el modo ISO estricto,** el enlace esconde lo mismo que el listado.
- **La clave de almacenamiento de una versión** solo va a quien puede descargar: la misma regla que el historial de versiones.

## 4 · La demostración en la app real del banco

Identidades ficticias. El servidor del banco pone la identidad en cada petición y el navegador solo guarda la marca de usuario del banco: el mismo método que en E1. No se tecleó ninguna contraseña.

**El recorrido pedido** (obra `zz_enl_ui_obra_105336`; persona «ENL Colega»):

| Paso | Dirección (resumida) | Pasos en el historial | Qué se ve |
|---|---|---|---|
| Lista de obras | `/` | 1 | la lista |
| 1 · Elegir la obra | `?obra=zz_enl_ui_obra_105336` | 2 | la raíz de la obra |
| 2 · Carpeta A (01_WIP) | `…&carpeta=d596…` | 3 | la tabla con Planos |
| F5 en la carpeta A | igual | 3 | «Archivos de proyecto / 01_WIP» y su tabla |
| 3 · Carpeta B (Planos) | `…&carpeta=8501…` | 4 | PL-001.pdf V2 y PL-002.pdf V1 |
| 4 · Abrir PL-001.pdf | `…&carpeta=8501…&documento=ea87…` | 5 | el lector: «V2 · PL-001.pdf» |
| 5 · Atrás | `…&carpeta=8501…` | 5 | el lector cerrado y la tabla |
| 6 · Adelante | `…&documento=ea87…` | 5 | el lector otra vez |
| 7 · F5 | igual | 5 | el mismo documento, en Planos |
| 8 · Copiar la URL y abrirla en otra pestaña | igual | — | PL-001 en Planos |
| En esa pestaña, «Cerrar documento» (llegó por enlace) | `…&carpeta=8501…` | 2 | se queda en Planos: no sale de ALEPHIA |
| En la primera, «Cerrar documento» (se abrió allí) | `…&carpeta=8501…` | 5 | vuelve al paso de la carpeta |
| «Copiar enlace» sobre PL-002.pdf | copia `…/?obra=…&carpeta=8501…&documento=7f79…` | igual | el aviso «Enlace copiado» |
| Ir a Planos (menú) y volver a Archivos | `?obra=…`, y después `…&carpeta=d596…` | 3 | sin pasos nuevos |

**Los cinco casos:**

| Caso | Qué pasó |
|---|---|
| **Documento movido** | Se copió el enlace de PL-002 en Planos y se movió PL-002 a 02_SHA_Compartido, por la ruta de siempre. El enlace viejo abre PL-002 y la dirección pasa a `carpeta=6e25…` (02_SHA). El historial va de 9 a 10: solo el paso de pegar el enlace. Atrás vuelve a la página anterior, no a la dirección vieja |
| **Sin permiso** | «ENL Sin» tiene «Restringido» en 01_WIP. El enlace de PL-001 y el de la carpeta Planos dan el aviso neutro, la dirección se queda en `?obra=` y no se abre nada. No aparece ningún nombre: la única palabra «Planos» de la pantalla es el botón del menú lateral |
| **Documento de otra obra** | AJENO.pdf pedido dentro de esta obra: aviso neutro, sin el nombre, dirección `?obra=` |
| **Versión de otro documento** | La versión 1 de PL-002 pedida con PL-001: aviso neutro, nada abierto. La versión 1 de PL-001 sí abre «V1 · PL-001.pdf» y la dirección conserva `version=` |
| **Login intermedio** | Sin sesión, el enlace de PL-001 muestra la pantalla de acceso y guarda el enlace. Se perdió la dirección a propósito (`/`). Tras iniciar sesión se abre PL-001 en Planos y la dirección vuelve completa |

**Incidencias del banco, no del producto:**
- el panel del navegador era pequeño y, con tamaño emulado, los clics cerca de los bordes no llegaban;
- se repitieron a tamaño real con el menú lateral plegado, y con un registro de clics se comprobó que llegaban al botón.

## 5 · Pruebas

| Prueba | Resultado |
|---|---|
| Batería completa del servidor, sin `.env` | 1883 correctas y 1 fallo que ya existía (`test_capacidades_con_puerta`). 19 pruebas nuevas |
| Ensayo nuevo contra PostgreSQL, con el control por obra encendido (`ensayo_de_enlaces_de_archivos.py`) | 34 de 34, sin líneas de error en el registro |
| Regresiones de Revisiones contra PostgreSQL | gemelas 24/24 · versión y visibilidad 67/67 · detalle 25/25 · ciclo 50/50 · administrador participante 16/16 · flujos creados 36/36 |
| Pruebas del portal | 7 bancos en verde; `enlacesDeArchivos` 16/16 (nuevo) y `revisiones` 19/19, sin cambios |
| ESLint de los ficheros tocados | ningún error nuevo; los 5 que salen ya están en HEAD |
| Construcción del banco, sin `.env` | correcta |

**El ensayo comprueba:**
- una carpeta anidada y la raíz;
- un documento cuyo enlace dice otra carpeta;
- el listado y el enlace dicen lo mismo;
- versión con y sin clave, idéntica al historial;
- mover y renombrar;
- once negativas con el mismo cuerpo y sin nombres;
- el perímetro, el modo ISO estricto y que nada se escribe.

**Encontrado y corregido en el ensayo:** cada enlace que no se abría quedaba en el registro del servidor como «ERROR [db] Error de Base de Datos: sin permiso», un error falso en producción. Ahora la negativa se recoge antes y no ensucia el registro.

## 6 · Qué no cambia

- **Enlaces de revisión** `?obra=…&revision=…`: igual, con su inicio de sesión y su Atrás/Adelante. `conRevision` y sus pruebas, sin tocar.
- **Sin tocar:** Compartir público, papelera, búsqueda, `viewableGuid` y `frontend-react`.
  - La papelera no tiene enlace: dentro de ella la dirección no cambia.
- **Sin migraciones.**
- **`FilesPage.jsx`:** tres bloques propios (abrir, cerrar y versión, menú). Los tres bloques ajenos de la barra de iconos quedan intactos (comprobado contra su copia de antes).

## 7 · Límites y no probado

- **Un documento abierto desde la búsqueda o desde la ventana de subida** se abre, pero la dirección no añade `documento`: la búsqueda quedaba fuera del contrato. Su carpeta sí entra en la dirección.
- **Atrás desde la raíz de la obra hasta la lista de obras o la portada:** hecho y cubierto por el banco de reglas, pero no recorrido en pantalla.
- **Si el portal se desplegara antes que el backend,** los enlaces con carpeta o documento darían el aviso neutro y abrirían la raíz de la obra. No se rompe nada, pero por eso el backend va primero.
- **Producción:** no validada; nada desplegado.

## 8 · Ficheros

- **Servidor:**
  - nuevo `enlaces_de_archivos.py`;
  - la ruta en `routes/documents.py`;
  - nuevos `tests/test_enlaces_de_archivos.py` y `herramientas/ensayo_de_enlaces_de_archivos.py`.
- **Portal:**
  - nuevo `utils/enlacesDeArchivos.js`;
  - `App_Refactor.jsx`, `hooks/useFileExplorer.js`, `components/ContextMenu.jsx` y `pages/FilesPage.jsx` (sus tres bloques);
  - nuevo `pruebas/enlacesDeArchivos.prueba.mjs`.
- **Documentos:** este informe, la nota de estado en `01_ENLACES_POR_CARPETA_Y_DOCUMENTO.md` y `AI_WORKSTATE.md`.

## 9 · Para ponerlo en producción (autorización tuya en cada paso)

1. **Commit: hecho** con tu autorización, sin trailer:
   - los ficheros de §8;
   - lo pendiente del último handoff (`AI_WORKSTATE.md` y el informe de E1.3);
   - de `FilesPage.jsx`, solo sus tres bloques.
2. **Push: hecho** por ti desde tu terminal (a mí me lo bloqueó el permiso de Claude Code), tras comprobar Auto-Deploy «Off» en los 4 servicios. Después, producción seguía en `88b300f` y el portal sin la ruta nueva.
3. **Manual Deploy del backend** `visor-ecd-backend-va`, con `/api/health` y «Booting worker». Lleva la ruta nueva; E1.3 (`88b300f`) ya está desplegado.
4. **Manual Deploy del portal**, verificado por contenido: `/api/docs/ubicacion` y «Copiar enlace».

## 10 · Corrección tras el despliegue (14-sep)

**Lo que viste en producción:** tras F5 en una carpeta (`…/GEOTECNICA/PDF`), el árbol de la izquierda se quedaba en «Archivos de proyecto» sin carpetas debajo, aunque la tabla y las migas estaban bien. Pulsar la raíz no lo arreglaba.

**Causa:** el explorador tomaba el identificador de la raíz de la **primera** carpeta que listaba. Entrando por un enlace o con F5, la primera es la del enlace, así que el árbol usaba la carpeta PDF como raíz. Antes de los enlaces la primera carpeta siempre era la raíz y no se notaba.

**Riesgo que tenía:** «Desplazar» usa ese mismo identificador para «Archivos de proyecto». Tras un F5 dentro de una carpeta, mover algo a la raíz lo habría llevado a la carpeta del enlace.

**Arreglo, solo en el portal:** el identificador de la raíz solo se toma de un listado de la raíz. Si se entra por un enlace, se pide aparte una vez.

**Probado en el banco:**
- F5 en `01_WIP / Planos`: el árbol muestra la raíz con 01_WIP y 02_SHA_Compartido y abre el camino hasta Planos, marcada.
- El registro del servidor muestra que el árbol pide la raíz real, y que ninguna carpeta del enlace se usa como raíz.
- Pruebas del portal: 7 bancos en verde (`enlacesDeArchivos` 17/17, con una prueba nueva). ESLint sin problemas.

**Para producción:** commiteado con tu autorización («VAMOS»). Va en el mismo push que «Editar» suprime y restaura, así que el despliegue es backend primero y portal después.

## Cierre

```
CORRECCIONES PREVIAS = de paso, un enlace que no se abre ya no se registra en el servidor
  como error de base de datos.
FUNCIONES NUEVAS YA UTILIZABLES = ninguna en producción todavía. En local: enlaces por obra,
  carpeta, documento y versión; Atrás, Adelante y F5; «Copiar enlace»; el enlace sobrevive al
  login; un documento movido se abre donde está. Lo serán tras los dos Manual Deploy.
FUNCIONES DEL OBJETIVO TODAVÍA PENDIENTES = «Copiar enlace a esta versión» (la acción explícita
  que dejaste para después); `documento` en la dirección al abrir desde la búsqueda; la vista
  dentro de un modelo (viewableGuid); enlaces a la papelera.
```
