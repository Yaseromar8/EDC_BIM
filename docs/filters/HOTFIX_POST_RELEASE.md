# HOTFIX POST-RELEASE — UX · LATENCIA · FLUJO DE DATOS · COLOR

Sobre `PRODUCTION RC = 0864878a985b9b30ea6a8e6859eda92b9031e5b6`.
Aprobado por el propietario. Se despliega **sólo ALEPHIA View**; el backend se
queda en `0864878`, Docs no se toca, PostgreSQL no se toca, sin migraciones.

```
A · UX ............... ARREGLADO — presentación de baseline restituida
B · LATENCIA ......... ARREGLADO — 1402 ms -> 60 ms (baseline 21 ms)
C · FLUJO DE DATOS ... CERRADO por el propietario (confirmado)
D · COLOR ............ EXPECTED · y una STATE/UI INCONSISTENCY arreglada
```

---

## A · UX — presentación de baseline restituida

`TandemFilterPanel.jsx` volvió a la presentación anterior al B4. Se retiró lo que
el propietario no pidió: el buscador `Buscar Grupo::Propiedad` y su botón de
limpiar; el bloque que explicaba la prioridad de color; el botón `Limpiar
búsqueda` de valores —la × nativa del `input type=search` ya hace eso—; la línea
`Todos · sin restricción` con `Mostrar valores no disponibles (0)`; los sufijos
` · pendiente` / ` · seleccionado, 0` de cada valor; y el mensaje de lista vacía.

Se restituyó lo que el B4 se había llevado: la cuenta `(x of y)` en la cabecera
del grupo, y la caja de selección con estilo de Tandem. La casilla real sigue en
el árbol —da el estado, el `disabled` y el nombre accesible— pero invisible; el
`label` que las envuelve hace que pulsar la caja marque la casilla.

**La banda de estado sólo se dibuja cuando el resultado NO está listo** —pending
o error, con `Reintentar`—. En el caso normal el panel se ve como en baseline.
`data-filter-state` / `data-filter-revision` se conservan porque son el anclaje
del banco de pruebas y no dibujan nada.

**Sin tocar**: `Sources (x of x)`, `Standard::Sources`, `Standard::Revit
Category`, la configuración interna y el motor. Ninguna capacidad se eliminó: la
búsqueda por valor, la paginación y el coloreo por propiedad siguen enteros.

Siete oráculos de `filtersCore.b4` y `filtersCore.b4Adversarial` afirmaban la UI
retirada. Cada uno se reapuntó a la presentación de baseline **sin debilitarlo**:
limpiar la búsqueda pasa por el `onChange` del propio input; «pendiente no puede
declarar un cero resuelto» lo sostiene ahora la insignia de conteo (`—` vs `0`);
la declaración de la selección vuelve a la cuenta `(x of y)`; y la prioridad de
color se lee del **driver**, que es donde vive, en vez del texto del panel.

---

## B · LATENCIA DE CLIC — causa demostrada

Medido **en el navegador contra producción**, no en el arnés de Node (que dejaba
`status: pending` y no representa el runtime real). Datos reales: 13.770 filas,
5 modelos, 13.772 entradas de rosetta.

### El experimento

Se forzó que `structuredClone(window.rosettaToDbId)` devolviera **la misma
referencia** —exactamente el efecto del arreglo propuesto— y se cronometró el
mismo clic:

```
sin parche               1539 ms · 1540 ms
identidad preservada      893 ms ·  876 ms      -650 ms  (43%)
```

### Por qué

`lib/filterRuntimeBridge.js:24` clona la rosetta **en cada llamada**:

```js
rosetta: structuredClone(host.rosettaToDbId || {}),
```

Las filas sí se cachean tres líneas más arriba; la rosetta no. Y la caché de
facetas de `aps/utils/model.js:554-556` compara **por referencia además de por
contenido**:

```js
|| _facetCache.rosetta !== rosettaToExtIdReversed     // <- siempre distinto
|| _facetCache.rosettaFp !== rosettaFp                // <- huella exacta
```

Un objeto nuevo por llamada hace que la primera comparación falle **siempre**.
La caché nunca acierta y `_buildFacetIndex` se reconstruye en cada clic.

### Lo que NO era

Tres sospechas propias, todas descartadas por medición en el navegador:

```
bucle "known" por filas          84 ms
_safeUrn x 137.700               28 ms
matchesByModel (map+filter)      22 ms   (una pasada agrupando: 4 ms)
_rosettaFingerprint               5 ms
clone de la rosetta              15 ms
                              -------
                                134 ms de 1.471    -> ninguno es la causa
```

Los ~880 ms restantes **no** son el recorrido por fila del índice: la medición
final de abajo lo deja claro. Con la caché acertando, `calculateBucketsFromPostgres`
entero cuesta 60 ms sobre estas 13.770 filas. Ese residuo es la aplicación visual
en el visor —aislamiento, coloreo, repintado— y es trabajo propio del clic.

### Medición final · baseline / RC / hotfix

Mismo frente (`1_CANAL`), mismo dataset (13.770 filas · 5 modelos · 13.772
entradas de rosetta), mismo clic (`Standard::Revit Category = Floors`), mismo
método. Cada variante se invoca **como se invoca en su propia release**: el
baseline recibe `window.rosettaToDbId` directo (`3e413cd:Viewer.jsx:1268`), el RC
y el hotfix reciben un `structuredClone` nuevo en cada llamada
(`filterRuntimeBridge.js:24`). Un clic de calentamiento y luego 3 medidos.

```
baseline 3e413cd =   21 ms    (18 / 21 / 23)     Floors = 1336
RC 0864878       = 1402 ms    (1350 / 1402 / 1754) Floors = 1336
hotfix           =   60 ms    (56 / 60 / 65)     Floors = 1336
```

Las tres variantes devuelven **exactamente 1336 coincidencias**: es el mismo
trabajo, no una comparación entre cargas distintas.

El baseline era rápido por la misma razón que el hotfix: su caché acertaba. No
clonaba la rosetta, así que la comparación por referencia siempre daba igual. El
RC introdujo el clon por llamada y esa misma comparación pasó a fallar siempre.

Quedan 39 ms de diferencia con el baseline. Son el precio de lo que el release
compró y el baseline no hacía: clonar la rosetta para aislar el núcleo (~15 ms),
su huella de contenido (~5 ms), y el trabajo de identidad B1 —mapa de linaje,
`rowKey`, nombres de propiedad cualificados—. Mismo orden de magnitud, frente a
los 1,4 s del RC.

**`PERFORMANCE ACCEPTED`**

### Arreglo escrito — una comparación menos

`aps/utils/model.js:555`: retirar la comparación por referencia y dejar la huella
de contenido, que ya es la autoridad.

```diff
-        || _facetCache.allData !== allData || _facetCache.rosetta !== rosettaToExtIdReversed
-        || _facetCache.rosettaFp !== rosettaFp || !_facetCache.prepared) {
+        || _facetCache.allData !== allData
+        || _facetCache.rosettaFp !== rosettaFp || !_facetCache.prepared) {
```

**Por qué es seguro.** `_rosettaFingerprint` (línea 411) es contenido exacto
—`JSON.stringify` de todas las entradas, urn por urn—, escrito precisamente
porque `window.rosettaToDbId` **se muta en el mismo objeto** al indexar cada
modelo (`components/Viewer.jsx:1024-1046`). El índice construido depende sólo de
`allData` y del contenido de la rosetta, así que huella igual ⇒ índice igual.
`_facetCache.rosetta` no se lee en ningún otro sitio: sólo en esa comparación.

**Por qué NO se cachea el clon en el puente.** Sería lo primero que uno intenta,
y es incorrecto: la rosetta se muta en sitio, la identidad del objeto no cambia
al cargar un modelo nuevo, y el clon cacheado se quedaría sin las entradas del
modelo recién cargado. La huella es el único guardián válido.

---

## D · COLOR — reproducido y clasificado

**Los dos sistemas, medidos por separado y nunca mezclados.**

| | Sistema 1 · color por propiedad | Sistema 2 · color por Source |
|---|---|---|
| control | «Color por `Grupo::Propiedad`» | «Color by source» |
| estado lógico | `filterColors` — `useState({})`, `App.jsx:982` | `window.__ecdSourceColorOn` · `__ecdSourceCustomColors` · `__ecdSourceAssigned` |
| pinta | `filterVisualDriver` por dbId | `_applySourceTint` a nivel de modelo (raíz) |
| quién reaplica | el propio driver en cada recálculo | choke-point sobre `clearThemingColors` (`Viewer.jsx:955-963`) + efecto `_modelsKey` |

Método: contar fragmentos con `db2ThemingColor` **por modelo** en cada paso. Un
número, no una impresión visual.

### Sistema 1 · color por propiedad

```
1 aplicar (Drenaje Urbano, 3 modelos)   2652 = 506+1863+283   panel ON    coherente
2 cerrar y reabrir panel                2652 identico          panel ON    coherente
3 F5                                       0                   panel OFF   coherente
4 salir a la lista y RE-ENTRAR al mismo  2652 identico          panel ON    coherente
5 (1-4 se hicieron sin Vista Guardada)
6 Vista Guardada (Canal, 5 modelos)    13770 = 8766+4984+17+1+2
     guardada -> apagada (0) -> restaurada -> 13770, misma reparticion      coherente
```

### Sistema 2 · color por Source

```
1 aplicar (Canal, 5 modelos)          16192 = 11102+5045+36+4+5  on=true  assigned=5
2 cerrar y reabrir panel              16192 identico                       coherente
3 F5                                      0  on=false assigned=0           coherente
4 ocultar un modelo y apagar el color     0  assigned=0                    coherente
6 Vista Guardada: guardada -> apagada (0) -> restaurada -> 16192, misma reparticion
```

### Veredicto: `EXPECTED`. No hay persistencia de color en ningún sistema.

- Ninguno sobrevive a F5.
- Ninguno contamina al otro: `source_on` fue `false` en todos los escenarios del
  Sistema 1, y `filterColors` no pintó nada en los del Sistema 2.
- Sobrevivir a **salir a la lista de proyectos y volver al MISMO frente** es
  diseño explícito: `App.jsx:1062`, `if (newId === null) return;` —salir a la
  lista no es cambiar de frente—. Y en ese caso el panel y el visor **coinciden**:
  botón encendido, geometría teñida.
- El morado que motivó la investigación es el **material nativo** del modelo de
  drenaje: tras F5 se midió `db2ThemingColor = 0` con los dos sistemas apagados y
  la geometría seguía morada.

### Hipótesis propia descartada

`_applySourceTint` sale antes de tiempo (`if (!lmv) return;`) sin borrar la
entrada de `__ecdSourceAssigned`, así que un modelo no cargado conservaría su
tinte al volver. **No ocurre**: ocultar un modelo **no lo descarga** —se midió
`cargados_en_visor: 5` antes y después—, el modelo se encuentra siempre y la
entrada se borra. Medido: `assigned = 0`, `tint = 0`.

### Sí hay un defecto real, y NO es el color: `STATE/UI INCONSISTENCY`

En cuanto se usa «Color by source» una sola vez, la línea de estado de Filters
dice **«Control visual: sources» para siempre**, incluso con el coloreo apagado y
cero fragmentos teñidos.

Medido, estable:

```
banner  "Sin filtros activos · sin restriccion · Control visual: sources"
source_on false · source_assigned 0 · tint 0
```

**Causa, demostrada.** `lib/filterVisualDriver.js:23-29`:

```js
const owner = host.__ecdTintApplying ? 'sources' : 'external-tool';
if (foreignOwner !== owner) { foreignOwner = owner; onExternal('color', owner); }
```

Apagar el coloreo pasa por `_applySourceTint(urn, null)`, que **también** pone
`__ecdTintApplying = true` y llama a `clearThemingColors`. El `owner` calculado
vuelve a ser `'sources'`, igual al guardado: el `if` es falso, `onExternal` no se
dispara, no se emite `filter-progress`, y `filterFeedback`
(`lib/filterPresentation.js:76`) sigue pintando `phase === 'paused'`.

`foreignOwner` sólo se libera con `driver.claimColors()`, que
`lib/filterRuntimeBridge.js:52` invoca **únicamente** al encender un color por
propiedad.

**Confirmado por experimento**: con el banner atascado, encender un color por
propiedad lo devolvió a «Aplicado en el visor», y volver a apagarlo lo dejó
correcto.

**Segunda superficie, misma causa**: `App.jsx:4651` muestra «· control visual:
sources» en la línea de estado global; se midió con el mismo texto rancio.

**Alcance**: miente la línea de estado —justo la superficie que añadió el hotfix
de UX para decir si los filtros están aplicados en el visor—. No afecta al color,
ni a la pertenencia, ni al aislamiento por Source.

### Arreglo escrito — dos líneas

`lib/filterVisualDriver.js`: soltar la propiedad cuando el coloreo por Source se
apaga.

```diff
-        const owner = host.__ecdTintApplying ? 'sources' : 'external-tool';
+        const owner = host.__ecdTintApplying
+            ? (host.__ecdSourceColorOn ? 'sources' : null)
+            : 'external-tool';
```

`lib/filterRuntimeBridge.js`: sin dueño, recalcular sin declarar pausa.

```diff
-            if(kind==='visibility') controller?.request({}, {force:true});
+            if(kind==='visibility' || !owner) controller?.request({}, {force:true});
```

`foreignOwner = null` es exactamente lo que ya significa `claimColors()`, así que
el driver reanuda y publica su fase real. El orden es correcto:
`toggleSourcesColor` y `aplicarColorPorSourceDeVista` fijan
`window.__ecdSourceColorOn` **antes** de pintar o borrar.

---

## Estado de producción al terminar

```
tint 0 · sin color activo · sin filtros · 5 modelos visibles
Vistas guardadas del frente Canal: PRUEBA03 · PRUEBA02 · CANAL_JESUS_MARIA
```

Para el escenario 6 se crearon dos vistas desechables
(`ZZ_TEMP_HOTFIX_D_BORRAR`, `ZZ_TEMP_HOTFIX_D_BORRAR_2`) y **se borraron las
dos**; la lista volvió exactamente a las tres previas. Se ocultó un modelo y se
volvió a mostrar. El parche de `structuredClone` del experimento B se deshizo.

## Observaciones al margen (no son D, no se tocan aquí)

- Tras F5 la aplicación vuelve al **proyecto** pero no al **frente**: se entró en
  Drenaje Urbano y se recargó en Canal. `visor_selectedProject` guarda el
  proyecto; el frente no se guarda.
- `handleLogoClick` (`App.jsx:4087`) hace una limpieza completa y **no está
  cableado**: el `onLogoClick` que sí se usa (`App.jsx:4153`) sólo hace
  `setSelectedProject(null)`.

---

## Banco de regresión

`frontend-react/pruebas/filtersCore.hotfixPostRelease.prueba.mjs` — 6 pruebas.
Cada una **falla sin su arreglo**, comprobado revirtiendo el código y volviendo a
correr: sin el arreglo de B cae `rosetta CLONADA no reconstruye el indice`
(`'B|MUTADO' !== 'A|B'`, o sea el índice se reconstruyó); sin el de D cae `apagar
el coloreo por Source libera el control visual`. Las otras cuatro siguen en verde
en ambos estados: son las garantías que no deben perderse.

```
B  una rosetta CLONADA no reconstruye el indice          (el arreglo)
B  una rosetta MUTADA en sitio SI reconstruye el indice  (la garantia que se conserva)
B  cambiar la revision del dataset sigue invalidando
D  encender el coloreo por Source declara dueño          (la pausa real no se pierde)
D  apagar el coloreo por Source libera el control visual (el arreglo)
D  un coloreo ajeno que NO es Sources sigue pausando
```

### El banco completo, con los arreglos puestos

```
34 de 36 suites corrieron · 0 FAIL · 12/12 mutantes muertos, producto sano en PASS
filtersCore 38 contratos CONTRACT PASS · green:true · unexpectedFail 0
b5Memory (con --expose-gc): modelos retenidos 0 · filas 0 · resultados 0
eslint: 8 errores preexistentes de `no-useless-escape` en model.js:153-157 y
        354-357 — regiones que no se tocaron; ninguno nuevo
vite build: OK (12,5 s)
```

Dos suites no pueden correr aquí por prerrequisito del entorno, sin relación con
el cambio: `b5BackendPayload` espera una carga real del backend por stdin y
`popoutBrowser` necesita `playwright`. `b5Memory` sólo pedía `--expose-gc`: se
corrió aparte y salió verde.

## Invariantes canónicos

- **Pertenencia idéntica**: el arreglo de B no cambia lo que se calcula, sólo
  cuándo se reconstruye el índice. La huella de contenido sigue siendo exacta y la
  prueba del modelo tardío lo fija.
- **Separación por Source intacta**: no se tocó `matchesByModel`, ni `_safeUrn`, ni
  el aislamiento. El arreglo de D sólo cambia *quién dice ser dueño del control
  visual*, no quién pinta.
- **Identidad `scope/source/externalId`**: sin tocar. Migración 31, Inventory
  canónico, Saved Views V2 y la virtualización del popout: sin tocar.

### Verificación del cambio de UX

```
filtersCore.b4                     13 PASS · 0 FAIL
filtersCore.b4Adversarial          19 PASS · 0 FAIL
filtersCore.interacciones           8 PASS · 0 FAIL
filtersCore.b4Mutants               3/3 mutantes muertos
filtersCore.b4AdversarialMutants    2/2 mutantes muertos
vite build                          OK
```

---

## `FILTERS POST-RELEASE HOTFIX = PRODUCTION GREEN`

Desplegado **sólo a ALEPHIA View**, 10-sep-2026.

```
View     visor-ecd-frontend   74f4dff1935fb174dcfbe5e77f7ad0351712363c
         assets/index-B3tSwlc8.js · 3.138.198 bytes
         las 5 cadenas de la UI retirada dan 0 en el paquete servido
backend  visor-ecd-backend    0864878a985b9b30ea6a8e6859eda92b9031e5b6
         /api/health -> status ok · rama main · postura 7/7
Docs     sin desplegar · PostgreSQL sin tocar · sin migraciones
```

Smoke productivo del propietario: UX de baseline restituida PASS · `Floors` =
1336 con respuesta rápida PASS · «Color by source» ON→OFF con el control visual
liberado PASS.

**El primer Manual Deploy publicó el commit equivocado**: construyó
`index-DjGQhZe_.js`, el paquete de `0864878`, y el sitio quedó *live* con el
código anterior aunque el commit ya estaba en `origin/main`. Se detectó porque el
paquete servido aún contenía las cadenas que el hotfix elimina. Un «Your site is
live 🎉» no prueba qué código se publicó; el hash del bundle en el log del build,
o un grep sobre el paquete servido, sí.
