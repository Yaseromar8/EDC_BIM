# 93 · GAP 07 · LA EXP DE CAMPO — ejecutada, con hallazgos y veredicto

**Fecha:** 27-ago-2026 · **Backend:** `445dd77` + migraciones 20/21/22 ·
**Portal:** `145a573` (`index-B43H2AX5`) · **Obra:** obra pirata (sandbox) ·
**Identidad:** el dueño (id 2), conduciendo la interfaz real con el Wi-Fi
apagado de verdad — no una bandera.

---

## 1 · LOS SIETE PASOS DEL DOC 90

| paso | resultado |
|---|---|
| 1 · con red: abrir la obra, precargar | ✅ «la obra está en tu dispositivo; ya puedes quedarte sin cobertura», con fecha visible después («hace 11 min») |
| 2 · SIN RED: levantar punch y acta desde la UI | ✅ las dos verticales. Punch «EXP OFFLINE UI» y acta «EXP ACTA OFFLINE» con la plantilla precargada; toast «Guardado en este dispositivo» en ambas |
| 3 · SIN RED: cerrar y reabrir | ✅ la app ABRE sin servidor: shell completo servido por el service worker con la API colgada (assets 200 desde SW, `/api/*` pendientes). La cola sobrevive en IndexedDB |
| 4 · con red: sincronizar | ✅ y AUTOMÁTICO: el disparador `online` drenó la cola sin tocar «Sincronizar», las dos veces |
| 5 · comprobar la BASE | ✅ ISS-006 (id 19) y PL-002 (id 10, `protocolo_version=1` conservada), exactamente uno cada uno, historial con `origen: campo sin cobertura` |
| 6 · reenviar → no duplica | ✅ a nivel de motor: reenvío devuelve el consolidado (esc. 2) y la carrera concurrente deja UN efecto y converge al reenvío (esc. 3) |
| 7 · revocar y sincronizar → 403 sin pérdida | ⛔ NO EJECUTABLE con este fixture: una sola identidad (el dueño). El código está probado por suite (`ACCESO_REVOCADO`); la EXP exige una segunda identidad revocable |

## 2 · LOS 10 ESCENARIOS FORZADOS (motor, contra producción)

Todos en verde: veredicto de negocio (no error de servidor) · reenvío
consolidado · carrera → un solo efecto + convergencia · mismo `local_object_id`
con otro `operation_id` = otro acto, resuelto por dependencia · dependiente
BLOQUEADA con su bloqueador · estado inesperado → CONFLICTO con las dos
versiones · `SIN_VERSION_DE_PLANTILLA` · `VERSION_DE_PLANTILLA_NO_RECONSTRUIBLE`
(v999) · acta por el mismo motor con `SET_ITEMS` → «Liberado» · evidencia
idempotente (201 → 200 `ya_existia`, mismo objeto determinista).

## 3 · LO QUE LA EXP DESTAPÓ (y no habría destapado nada más)

| # | hallazgo | corrección |
|---|---|---|
| F1 | La migración 21 no estaba en producción: 6 escenarios REINTENTABLE uniformes con la ruta de evidencia pasando | el dueño la corrió (`prod2021`); el motor degradó BIEN: ningún falso éxito, nada perdido |
| F2 | `local_object_id` tipado UUID cuando el cliente manda `loc_<uuid>`; una prueba afirmaba el tipo equivocado | migración 22 (ensayada con rollback antes de aplicar) + tripwire que CASA cliente y migración · `ca3cf46` |
| F3 | La sonda de capacidad devolvía `false` al no poder preguntar → desviaba la captura a una ruta muerta = pérdida | tres estados: `true/false/null`; sin red se encola SIN preguntar · `4789a59` |
| F4 | Las pantallas de captura solo pedían a la red: selector de actas vacío offline | catálogo y plantillas caen a la PRECARGA, y la pantalla lo dice · `145a573` |
| F5 | Chunk lazy no visitado → `Failed to fetch dynamically imported module` (contenido por el error boundary) | la precarga IMPORTA los módulos de campo; el SW los guarda al pasar · `145a573` |
| F6 | En la carrera, el perdedor responde REINTENTABLE (verdad: nada durable en SU transacción) y converge al reenvío | aceptado y documentado; el invariante «un solo efecto» se cumple |

## 4 · NO EJECUTABLE, DECLARADO

- **Revocación en caliente** (paso 7): exige segunda identidad; suite ✅.
- **Cache v1 → servidor publica v2 → acta conserva v1**: no existe ruta para
  editar plantillas, así que el servidor no puede publicar una v2. La mitad
  observable sí corrió: v999 → CONFLICTO, v1 correcta → entra conservando su
  versión. Queda el unit test y la comprobación en el manejador.
- **Foto adjunta desde la UI offline**: el motor está probado (esc. 9 +
  `capturarConEvidencia` con blob persistido); la conducción por UI pertenece a
  NG-02 · Fotos, que es su gap.
- **Artefacto de entorno, no de producto**: el panel de navegador de la sesión
  borra `localStorage` al cerrarse el panel entero (la sesión se pierde); un
  navegador real o PWA instalada lo conserva. El service worker y su caché SÍ
  sobrevivieron — por eso la app abrió sin red tras el cierre.

## 5 · VEREDICTO

**GAP 07 · MOBILE / OFFLINE — ARQ ✅ · OP ✅ · EXP ✅ → COMPLETE.**

Con el listón del programa: ciclo de campo real conducido por un usuario real,
dos dominios por el mismo motor, autoridad siempre en el servidor, idempotencia
del acto demostrada contra producción, y cero duplicados medidos en la base.
Los residuales quedan en el ledger (foto UI → NG-02; revocación EXP → cuando
haya segunda identidad; v2 de plantilla → cuando exista edición de plantillas).

**Baseline:** E02 y E03 suben a ✅ con esta evidencia. Nada más se recalcula.
