# B5 — campaña HOST y receta de release (NO EJECUTADA)

Estado: preparado para ejecución humana posterior a aprobación del checkpoint.
No equivale a HOST GREEN ni autoriza push, DDL o deploy. Referencia:
[B5_RESULTADOS.md](B5_RESULTADOS.md).

## HOST: seis casos, sólo lo que Node no demuestra

Precondición: entorno legítimo con frontend y backend del **mismo commit B5**,
migration 31 verificada, usuario autorizado, frente de prueba y modelos APS
accesibles; inventario cualificado completo, sin cuarentena pendiente.
Elegir dos Sources, preferiblemente con externalId compartido, dos propiedades
homónimas y una combinación de valores **existentes** sin intersección.
No escribir datos de obra para hacer una prueba; usar frente de ensayo.
Registrar commit de health + bundle, usuario/rol sin tokens, modelos/versiones,
fecha, resultado, captura/video corto y revisión de `window.__filterResult`.

| Caso / acción | Oracle observable → PASS | Evidencia |
|---|---|---|
| 1. Abrir frente con dos Sources; esperar carga; abrir/cerrar Inventory y popout | Sin filtros ≠ pending. Misma revisión/membresía; cada elemento pertenece a su Source. LMV dibuja ambos modelos al terminar | Captura escena + Inventory + revisión; URN/linaje de cada Source |
| 2. Aislar/ocultar manualmente un subconjunto; aplicar filtro con matches, luego combinación válida cero, luego clear | Cero explícito, no show-all accidental; puede quedar contexto fantasma LMV, pero ningún match elegible. Clear restaura aislamiento/ocultos previos sin cambiar cámara | Video y conteos/identidades; comparar antes/después de clear |
| 3. Alternar A→B→A rápidamente; activar dos colores superpuestos, cambiar uno y OFF; probar writer externo | Sólo intención vigente queda aplicada; swatch/leyenda coincide con tinte GPU; prioridad multi-color declarada; ningún color antiguo reaparece. Writer externo se anuncia, no se sobreescribe sin reclamar | Video continuo y revisiones de filter-result/filter-progress/viewer-colors-applied (sin datos sensibles) |
| 4. Buscar propiedad/valor fuera del primer bloque; DnD con search activo; Subir/Bajar; Cancelar/Escape y Confirmar | Search antes del límite; selección fuera de página permanece; reorder por identidad al limpiar búsqueda. Cancelar/Escape no aplica. Confirmar aplica conjunto exacto y advierte al quitar selección activa | Video con lista antes/después + selección/counts constantes |
| 5. Inventory cerrado→abierto→popout; editar una fila y bulk cualificado en ensayo, cerrar/reabrir | Misma membresía/revisión con panel cerrado; edit/bulk recalcula sin perder intención; homónimo de otra Source intacto; popout vivo y ninguna selección vieja actúa | Captura antes/después + HTTP status y payload sólo de identidades sintéticas |
| 6. Guardar una V2 nueva con filtros/Sources/dos colores; cambiar escena, restaurar; probar V2-zero, luego edición manual y cambio de frente/reload | Restore completo o degradación explícita justificada, jamás falso completo; un único frame final coherente. Tras zero se conservan predicados. Ni miembros/colores del frente anterior ni referencias al modelo retirado | ID de vista de ensayo, parte de restore, video/frame y comparación de revisión |

Cada caso se marca PASS/FAIL con el oracle indicado; si falta dato/modelo,
NOT EXECUTED / ENVIRONMENT, nunca PASS. Un fallo identifica gesto, Source,
estado anterior y resultado esperado. No hacer 50 casos ni repetir bancos Node.
Retirar los listeners de observación al terminar. Aceptación HOST la declara
el propietario después de esta campaña, no este documento.

## Release coordinado — orden, no autorización

**Commit backend = commit frontend = e1a16016c192bb8674fb576294771138e29d2df6**,
checkpoint funcional B5 verificado en checkout limpio. Si se elige un descendiente sólo
documental, usar el mismo SHA en ambos servicios y verificar su ascendencia.
Producción registrada sigue en `3e413cd`; no se consultó ni modificó aquí.
Auto-Deploy registrado OFF; no cambiarlo. Push y cada deploy requieren permiso
explícito por acto.

1. **Backup/verificación y mantenimiento.** Registrar SHA/health/bundle previos,
   esquema y grants actuales, copia nueva y restauración verificada en desechable.
   Conservar copias inmutables. Bloquear escrituras/extracciones durante el corte:
   al aplicar 31 se revocan escrituras legacy y el backend viejo no puede operar
   normalmente. No mantener una ventana de clientes viejos escribiendo.
2. **Migration 31, manual como ecd_migrator.** Roles ya provisionados, 29/30
   presentes. Aplicar únicamente `backend/sql/31_inventory_identity.sql`;
   verificar catálogo y grants mediante verificador canónico/bootstrap 31.
   No ejecutar rollback SQL, backfill o promoción humana automáticamente.
   No devolver DDL/admin a ecd_app. Una operación que lo necesite es STOP.
3. **Backend compatible del SHA B5 aprobado**, ejecutado como ecd_app,
   DDL_EN_CALIENTE=false. Verificar inicio sin DDL y search_path canónico.
   Reextracción cualificada completa de Sources es una operación posterior
   separadamente autorizada. Mientras falte: 409 INVENTORY_REEXTRACTION_REQUIRED.
   Metadata humana legacy: 409 LEGACY_USER_DATA_PENDING → preservar, bloquear
   apertura del frente afectado y pedir resolución autorizada; no inventar dueño.
4. **Health + smoke backend.** Health debe identificar exactamente ese SHA y
   postura completa. En frente de prueba: GET full/lite, una edición cualificada,
   rechazo ajeno y vista V2; fuera del ensayo no efectuar mutaciones sin permiso.
5. **Frontend del mismo SHA**, build normal, verificar bundle servido y esperar/
   comprobar invalidación Cloudflare de index.html (~5 min histórico).
   No subir sólo frontend contra backend 3e413cd. No copiar WIP ni .env local.
6. **Campaña HOST anterior**, aceptación explícita; sólo entonces retirar
   mantenimiento y admitir escrituras. Cualquier FAIL detiene la aceptación.

**La compatibilidad del esquema no implica datos listos.** La migración no
reconstruye versiones APS perdidas ni asigna metadata humana a Sources.
Un 409 es bloqueo visible correcto, no éxito parcial que debamos ocultar.

## Rollback: conservar la estrategia B1 y sus límites reales

Referencia histórica de diseño (protegida/no adoptada): B1_IDENTITY_ROLLOUT,
sección Corte y reversión. Implementación efectiva ahora es SQL31 + backend,
no el antiguo candidato.

- **Antes de admitir escrituras exclusivas cualificadas:** congelar accesos,
  volver ambos servicios a la pareja anterior verificada; conservar tablas
  canónicas. **Revertir código solo NO restablece escrituras legacy**: SQL31
  revoca INSERT/UPDATE/DELETE/TRUNCATE en public.inventory_assets y
  public.asset_user_data. El operador autorizado debe contrastar/restituir
  exclusivamente los grants DML previos registrados, como ecd_migrator, nunca
  dar DDL/admin a ecd_app. No ejecutar 03 a ciegas. Verificar smoke antes de abrir.
- **Después de admitir escrituras cualificadas:** NO volver a la tabla legacy
  UNIQUE(frente,externalId): no representa dos Sources con el mismo externalId.
  Congelar escrituras, preservar ambas familias y copias, mantener un backend
  compatible en mantenimiento y pedir recuperación/mapeo autorizado.
  Preferir corrección hacia delante. No hay rollback automático sin pérdida.
- `31_inventory_identity_rollback.sql` sólo admite namespace **vacío**, y se
  niega si hay datos; no es el rollback normal, no usar DROP CASCADE ni borrar
  datos para hacerlo pasar. No se ejecutó.
- Si la copia histórica, los grants previos o la procedencia humana no son
  verificables: STOP operativo. Este B5 no autoriza resolverlos en producción.
