# 51 · Itemizado y criterios de medida POR FRENTE

30-oct-2026. Hecho en local, sin commit. Lo pidió el dueño:

> Tengo dos frentes, canal y drenaje urbano, y subiré en cada uno lo que le corresponde. […] Lo más profesional posible, pero teniendo cuidado sin romper nada.

## El problema (comprobado en producción)

- **La tabla admite una sola versión vigente por obra.** `planilla_itemizados` (migración 40) y `planilla_criterios_medida` (41) tienen el índice «una vigente por `project_id`».
- **El frente se pierde en el servidor.** El visor manda el frente abierto (`1_CANAL`, `1_DRENAJE`), pero el servidor lo reducía a la obra (`1`).
- **Subir el presupuesto en un frente reemplazaba el del otro.** Hoy PQT8_TALARA tiene vigente `Presupuesto_Rv00_DRENAJE_URBANO.xlsx` v1, y los dos frentes leen ese.

## La solución

| Pieza | Qué cambia |
|---|---|
| `backend/sql/42_planilla_por_frente.sql` (+ rollback) | Añade la columna `frente` (por defecto `''`) a las dos tablas. «Una vigente» pasa a ser **por obra y frente**. Es aditiva y repetible: crea el índice nuevo antes de quitar el viejo y no toca datos. |
| `backend/routes/planilla.py` | Resuelve el frente desde `'<obra>_<FRENTE>'`. |
| `backend/esquema_base.py` | Una base nueva nace con la columna y el índice nuevo. |
| `frontend-react/src/lib/almacenDeObra.js` | Guarda `frente`, `heredado` y `porFrente` desde la respuesta. |
| `frontend-react/src/components/TablaDePartidas.jsx` | Dice de quién es el itemizado: «del frente CANAL» o «de la obra». Si el frente aún no tiene el suyo, lo avisa y ofrece «Cargar el del frente CANAL…». El de la obra no se puede quitar desde un frente. |

**Detalle de las rutas:**
- El frente tiene que estar registrado en `project_frentes` para esa obra. Si no, responde 404 `FRONT_UNKNOWN`.
- Al leer:
  - si el frente tiene el suyo, devuelve ese;
  - si no, devuelve el de la obra (`frente = ''`) con `heredado: true`.
- Guardar o quitar en un frente solo toca ese frente.
- El número de versión sigue siendo único por obra.

### Reglas

- **Lo que ya existe no se reasigna.** El itemizado de la obra queda como general, con `frente` vacío.
- **Un frente sin itemizado propio usa el de la obra** hasta que suba el suyo.
- **Los criterios de medida («medir con…») van por frente**, porque dependen de las partidas de ese itemizado.
- **Sin la 42, el backend nuevo funciona como antes:**
  - lee el de la obra (`por_frente: false`);
  - guarda y quita el de la obra entera;
  - **se niega** con 503 `MIGRATION_MISSING` (42) a guardar o quitar en un frente, para no pisar el de la obra creyendo que guarda el de un frente.

## Pruebas (todas ejecutadas)

| Prueba | Resultado |
|---|---|
| `python -m pytest -q backend/tests/test_planilla_itemizado.py backend/tests/test_planilla_criterios_medida.py` | **63/63**. Hay pruebas nuevas por frente: frentes independientes, uso del de la obra, quitar sin tocar la obra, frente ajeno, base sin la 42 y migración ≡ esquema base. La tabla de juguete es ahora compartida: `tests/planilla_base_de_juguete.py`, con y sin la columna. |
| `python -m pytest -q` (suite entera) | **2425 pasan, 1 falla**: `test_reconstruccion_desde_cero`, la falla histórica de siempre (por `cad_review_*`, `grupos_de_documentos` y `vinculos_de_sustento`). No toca la Planilla. |
| Ensayo contra **PostgreSQL 18 real y desechable**: clúster nuevo en el scratchpad, 127.0.0.1:55432, base `ecd_ensayo`, roles `ecd_migrator` y `ecd_app`; las rutas reales con la conexión real | **29/29**, en tres fases. **A:** la base sin la 42, como producción hoy. **B:** se aplica la 42 con datos ya guardados. **C:** el rollback se niega con datos de frente; sin ellos vuelve, y la 42 se repite sin daño. La base real impide dos vigentes en el mismo frente. |
| `node frontend-react/pruebas/itemizadoDeObra.prueba.mjs` | **28/28**, con 3 nuevas de frente, heredado y servidor sin la 42 |
| `criteriosDeMedida` 77/77 · `planillaItemizado` 40/40 · `planillaPartidas` 44/44 · `planillaPlantilla` 20/20 · `planillaCobertura` 16/16 · `planillaPerfil` 25/25 | sin cambios, en verde |
| Banco del visor, en Chrome con la sesión del dueño, Frente Canal | Contra el servidor publicado (sin la 42) se ve como hoy. Simulando la respuesta nueva (`heredado`) dice «El frente CANAL aún no tiene itemizado propio: usa el de la obra…» y ofrece «Cargar el del frente CANAL…». En el banco, guardar en la Planilla estaba bloqueado. |

## Publicación (cuando el dueño lo acuerde)

1. **Migración 42** como `ecd_migrator` (la aplica el dueño):

   ```
   psql … -U ecd_migrator -f backend/sql/42_planilla_por_frente.sql
   ```

   Comprobar que existen `uq_planilla_itemizado_vigente_frente` y `uq_planilla_criterios_medida_vigente_frente`, y que ya no existen los índices viejos.
2. **Backend** `visor-ecd-backend-va`, con Manual Deploy.
3. **Visor** `visor-ecd-frontend`, con Manual Deploy.
4. **El dueño sube en cada frente su presupuesto**, desde la Planilla: Canal → Componente 4; Drenaje → Componente 11.2.

**Si el backend llega antes que la migración**, no se rompe nada: se lee como hoy y solo se niega a guardar por frente.

**Si la migración llega antes que el backend**, el backend viejo sigue funcionando, porque la columna tiene valor por defecto. Ojo: al guardar, el backend viejo retira el vigente **de todos los frentes de la obra**. Por eso conviene desplegar el backend justo después de la migración y no subir itemizados entre medias.

**Rollback normal: revertir el código.** El rollback SQL solo procede si no hay filas de frente.
