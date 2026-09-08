# HOST DEFECT — POPOUT SCALE

Estado: **CODE/TEST GREEN**. Follow-up local sobre `82ae5d9f6e8945dc293e3075bb7d7570d72a5392`.
B1–B5 permanecen CLOSED. No se ejecutó H1–H6 ni se modificaron los servicios HOST,
PostgreSQL, APS, Viewer o producción. Esto NO declara HOST GREEN.

## Problema y solución

El propietario confirmó H1 FAIL: 1_CANAL, 5 Sources y 13.783 matches reales;
el popout anterior materializaba todas las filas/celdas/listeners y bloqueaba
el renderer (>8 minutos, ~11,2 GB). Inventory acoplado y servicios seguían sanos.

Único archivo funcional modificado: `frontend-react/src/lib/inventoryFilterPopout.js`.

- Ventana vertical de filas de 28 px, overscan 8, viewport con máximo físico
  2.400 px; como máximo **103 filas de datos**, dos espaciadores y una cabecera.
  No hay render-all diferido ni dependencia nueva de producto.
- Scroll/resize coalescidos por requestAnimationFrame. Cada desplazamiento
  sólo materializa la ventana; primera, media y última región son alcanzables.
  Celdas de una línea, ancho estable y tooltip con el texto completo.
- `filterInventoryRows` y `refineInventorySelection` existentes siguen
  consumiendo el mismo FilterResult. Las referencias e índices locales son
  exclusivamente de presentación, no otra autoridad de matching.
- Revisión/objeto vigente comprobados antes de dibujar, hacer click o resaltar.
  A→B cancela el frame pendiente y reemplaza las referencias. Una revisión vieja
  no recupera A. Pending/error eliminan filas anteriores; no-filter y cero real
  se anuncian de forma distinta.
- Identidad canónica `scope_id + source_lineage + external_id` intacta.
  El click delegado obtiene Source/URN + dbId del match autoritativo.
  Highlight fuera de ventana desplaza hasta el elemento correcto, incluso
  cuando dos Sources comparten dbId.
- **9 listeners propios constantes:** 4 del host, 2 de la ventana, scroll,
  click delegado de tbody y botón de acoplar. **0 listeners por fila**.
  Dispose/cierre elimina los nueve y cancela el frame; reopen no acumula.
  Cambio/reset de scope vacía datos e índices y retira esa ventana hasta reabrirla.

Coste: DOM O(columnas × ventana); reconstrucción de referencias O(filas) al
cambiar el resultado/aislamiento. El conjunto lógico no se trunca. No se
virtualizan columnas: el límite medido de escala es 50k × 80 columnas, no una
promesa de tamaño ilimitado, impresión completa o Ctrl+F sobre filas no montadas.

## Fitness y mutante permanentes

`filtersCore.popoutScale.prueba.mjs`: 13.783 y 50.000 filas, cinco Sources,
identidad canónica, 40 columnas; límite DOM, comienzo/medio/final, resize, scroll,
revision, A→B y A tardío, fila seleccionada fuera de ventana, Source/dbId,
pending/zero/no-filter, cierre, tres reaperturas y retiro de scope: PASS.

`filtersCore.popoutScaleMutants.prueba.mjs`: control sano PASS; mutación de los
límites de ventana a [0, rows.length) **KILLED 1/1** por el MISMO oracle
`BOUNDED_DOM: render-all is forbidden`. No modifica archivos de producto.
No se usa tiempo como criterio de aprobación.

`filtersCore.popoutBrowser.prueba.mjs`: Edge headless **152.0.4191.66**, contexto
nuevo, HTTP efímero exclusivamente localhost y datos sintéticos; sin perfil,
sesión, APS, backend o datos humanos. Usa el módulo de producción y el cálculo
B3 real. Comprueba geometría de filas de 28 px, regiones visibles, scroll rápido,
resize hasta 2.400 px reales CSS, eventos DOM con bubbling, cierre nativo y
reapertura. Ambos tamaños PASS.

Los tres bancos históricos que usaban DOM mínimos (popout, b3Adversarial,
b5Stress) comparten ahora `filtersRuntime/popoutDom.mjs`, con bubbling,
parent/contains, rAF cancelable y removeEventListener. Se conservaron sus
datasets y expected; no se modificó B3/B5 de producto.

## Medición del navegador — última ejecución

80 columnas por fila en ambos datasets. Los tiempos incluyen apertura/render y
dos frames, pero no el cálculo previo B3. Son observaciones, no thresholds.

| Métrica | 13.783 filas | 50.000 filas |
|---|---:|---:|
| Filas DOM iniciales | 36 | 36 |
| Elementos DOM iniciales | 3.012 | 3.012 |
| Nodos conectados iniciales, incluidos texto/documento | 5.979 | 5.979 |
| Máximo filas en resize/scroll | 103 | 103 |
| Máximo elementos DOM | 8.441 | 8.441 |
| Máximo nodos conectados, incluidos texto/documento | 16.768 | 16.768 |
| Listeners propios / por fila | 9 / 0 | 9 / 0 |
| Apertura inicial | 146,5 ms | 168,2 ms |
| Scroll inicio / mitad / final | 37,1 / 34,7 / 24,2 ms | 37,3 / 41,3 / 25,6 ms |
| Reemplazo A→B | 56,5 ms | 84,9 ms |
| Dispose de handlers/DOM | 0,1 ms | 0,1 ms |
| Reapertura | 142,9 ms | 178,1 ms |

El máximo se mantiene idéntico al aumentar las filas lógicas. Se contabiliza
DOM conectado, no memoria total del renderer. No se midió heap/RSS ni GPU del
HOST real. El banco Node adicional midió 2.102 nodos del doble con 40 columnas;
no confundir sus tiempos ni nodos simplificados con el navegador.

## Regresiones ejecutadas

Comando por banco: `node frontend-react/pruebas/<nombre>.prueba.mjs`.

| Banco | Resultado |
|---|---|
| filtersCore.popout | PASS, 16 aserciones históricas |
| filtersCore.popoutScale | PASS, ambos tamaños |
| filtersCore.popoutScaleMutants | control PASS, 1/1 muerto |
| filtersCore.popoutBrowser | PASS, ambos tamaños, navegador real |
| filtersCore.runtime | 17/17 |
| filtersCore.runtimeMutants | 4/4 muertos |
| filtersCore.b3Adversarial | 7/7 |
| filtersCore.adversarialMutants | 3/3 muertos |
| filtersCore.b4 | 13/13 |
| filtersCore.interacciones | 8 PASS; 0 KNOWN_FAIL/UNEXPECTED_FAIL/UNEXPECTED_PASS |
| filtersCore.interaccionesIntegradas | exit 0 |
| filtersCore.b5Lifecycle / filtersCore.b5Stress | ambos exit 0 |
| inventoryIdentity | exit 0 |
| savedViewV2 / capturarVistaV2 | ambos exit 0 |
| restaurarVistaV2 | **150/150** |
| filtersCore.savedViewsBoundary | 6/6 |

Incidencias del procedimiento, corregidas sin alterar oracles:
el primer servidor de fitness no permitía importar `aps/utils/model.js`
(404); se añadió esa ruta exacta al allowlist local. Un comando intentó un
nombre inexistente `filtersCore.b3AdversarialMutants` (MODULE_NOT_FOUND);
se corrigió a `filtersCore.adversarialMutants`. No fueron defectos del producto.

Build aislado: checkout limpio de 82ae5d9 más el único archivo funcional del
follow-up, en `C:/Users/ASUS/AppData/Local/Temp/popout-scale-73e2d846`.
`npm ci --offline --no-audit --no-fund`: 772 paquetes; `npm run build`:
**exit 0, 516 módulos, 14,11 s**. Sin .env, ViewerFacade, public/predict ni WIP.
SHA256 del módulo compilado y del módulo del worktree idénticos:
`59BB1FC9BA2A2E237F13BD83E2DE195EC1DEA73A2817DD9E953F39C79FD35C29`.
Avisos no nuevos: claves `volver` duplicadas de LoginScreen, mezcla de imports
estáticos/dinámicos, bundle grande y dependencias deprecated. No se cambian aquí.

Reproducción navegador: requiere Playwright disponible para pruebas (no añadido
a dependencies). Opcionalmente definir rutas no secretas
`POPOUT_PLAYWRIGHT_MODULE` y `POPOUT_BROWSER_EXECUTABLE`; ejecutar el banco.
Esas variables sólo se fijaron en el proceso PowerShell de prueba, no en .env,
configuración persistente ni servicios. Navegador/servidor de fitness cerrados.

## Handoff

Commit funcional: localizar con
`git log -1 --format=%H -- frontend-react/src/lib/inventoryFilterPopout.js`.
Ese follow-up local es el nuevo candidato HOST; no se ha desplegado ni servido
en el entorno real, que conserva 82ae5d9 y sus cinco snapshots.

Siguiente acción: entregar el candidato a Claude/propietario para preparar el
ensayo con frontend/backend del mismo SHA y retomar HOST por autorización.
No repetir reextracción ni migraciones; no certificar H1 ni HOST GREEN desde
esta prueba sintética.

WIP ajeno preservado: ViewerFacade (48 líneas de Viewer.jsx y sus untracked),
LOB4DExtension, ViewerLabelsBar, predictBim, identidad 4D/5D, public/predict,
backups y demás históricos. Tooling/docs de entorno y HOST_RESULTADOS
preexistentes permanecen fuera del commit. AI_WORKSTATE se stagea selectivamente
sin adoptar sus hunks históricos de preparación de entorno.
