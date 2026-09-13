# ALEPHIA REVIEWS · Programa funcional y decisiones aprobadas

Aprobado por el propietario el 13-sep-2026. Base del código: `5967760` (desplegado en Virginia y en el portal).

## Objetivo

Incorporar a ALEPHIA las capacidades de revisión observadas en ACC, con una experiencia de uso equivalente en los flujos estudiados. Las correcciones del 12-sep (versión fijada, lista filtrada por acceso, acceso documental para actuar y asignar, avisos neutros, vista previa) son un lote previo, no la entrega final.

Fuentes, sin repetir benchmark:
- el contrato observado de ACC (auditoría del 12-sep-2026);
- la comparación con ALEPHIA de ese mismo día.

## Decisiones

| # | Decisión | Estado |
|---|---|---|
| D1 | En el contrato nuevo, REVISA no tiene rechazo terminal: envía o da conformidad y usa los mecanismos de corrección que correspondan. | Aceptada |
| D2 | Un único APRUEBA, siempre terminal. Decisión Aprobado/Rechazado por archivo. Rechazar un archivo exige comentario. | Aceptada |
| D3 | Cerrar la revisión y emitir documentos son operaciones distintas. Una revisión cerrada no se reabre ni revierte sus decisiones si falla una emisión. Un archivo puede quedar `APROBADO · PENDIENTE DE EMITIR`, y la emisión se puede reintentar respetando todas las guardas actuales. | Aceptada con invariante |
| D4 | Archivar es reversible por un administrador, siempre con motivo y trazabilidad. | Aceptada |
| D5 | Anular: el iniciador o un administrador, con motivo obligatorio, sin decisión documental y sin reapertura. | Aceptada |
| D6 | Las revisiones PRE y AUTORIDAD_TERMINAL existentes conservan su semántica: no reciben rondas, retroceso, devolución ni decisión por archivo. Anular, archivar y exportar sí se aplican a ambas, como capacidades ortogonales. El ciclo tipo ACC completo es exclusivo del contrato nuevo y de las revisiones creadas bajo él. No se reinterpretan revisiones firmadas ni abiertas de contratos anteriores. | Modificada |
| D7 | La tarea en Mi Trabajo se crea siempre. El correo es opcional por acción, marcado por defecto, y se envía después de guardar, fuera de la transacción. | Aceptada |
| D8 | Dos verbos distintos, no una capacidad única «permite devolver»: **Volver al paso anterior** (misma ronda; requiere paso anterior; puede elegir nuevo responsable y plazo del destino con las guardas existentes) y **Devolver al iniciador** (nueva ronda; control configurable por paso; no es rechazo documental). | Modificada |
| D9 | Oregón se resuelve como operación de infraestructura aparte. No bloquea E1 ni forma parte del contrato funcional. | Fuera del diseño de Reviews |

## Orden de trabajo

1. **E1 · Detalle, navegación y semántica.** Contrato: `E1_CONTRATO_DE_ACEPTACION.md`.
2. **E2 · Anular y archivar**, de extremo a extremo, después de E1.
3. **Contrato nuevo completo**, con nombre provisional y semántica congelada antes de crear una sola revisión bajo él. Incluye desde el principio:
   - exactamente un APRUEBA terminal;
   - REVISA sin rechazo terminal;
   - volver al paso anterior dentro de la misma ronda;
   - devolver al iniciador, que incrementa la ronda;
   - foto de documentos y versiones por ronda;
   - comentarios por archivo y versión;
   - decisión Aprobado/Rechazado por archivo, con resultados mixtos;
   - cierre del proceso separado de la emisión, con estado de emisión por archivo;
   - historial de rondas.
4. **E3 y E4**: dos subentregas técnicas de ese contrato. No se activa en producción ni se crean revisiones reales bajo él hasta que ambas estén completas, probadas y auditadas.
5. **E5 · Exportación**, la última.

## Aceptación final del programa

Desde la interfaz:

crear una revisión con varios archivos → revisar y comentar → devolver al iniciador → nueva ronda → actualizar explícitamente una versión → reenviar → consultar la ronda anterior → decidir Aprobado/Rechazado por archivo → cerrar → emitir solo los aprobados → ver cuáles quedaron pendientes de emisión → exportar.

En casos separados: volver al paso anterior, anular, archivar y desarchivar.

## Formato de cierre de cada entrega

```
CORRECCIONES PREVIAS = ...
FUNCIONES NUEVAS YA UTILIZABLES = ...
FUNCIONES DEL OBJETIVO TODAVÍA PENDIENTES = ...
```

No se declara «Reviews terminado» mientras siga pendiente el recorrido acordado.
