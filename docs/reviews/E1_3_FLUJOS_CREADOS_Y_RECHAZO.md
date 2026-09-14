# Revisiones · flujos creados que fallan y rechazo sin vuelta atrás

> **Actualización del 14-sep:** E1.3 está hecho y probado en local (`E1_3_INFORME_DE_CIERRE.md`). El contrato de «Volver al paso anterior» y «Devolver al iniciador» está escrito para que lo apruebes (`E3_CONTRATO_RONDAS.md`). Lo que sigue es el diagnóstico previo.

14-sep-2026. Lo que reportaste:
1. «No se puede trabajar con flujos de revisión creados: si se elige, salen problemas.»
2. «Si rechazan en la fase final no regresa al anterior: sale rechazado y no hay forma de volver a revisar en esa misma revisión. Así como lo hace ACC.»

Solo diagnóstico y plan. No he tocado Revisiones.

## En corto

- **El ciclo de hoy se puede hacer ya:** suben, revisas, rechazas, suben una versión nueva, envían una **revisión nueva** y apruebas (§3). Lo que todavía no existe es hacerlo **dentro de la misma revisión**, como en ACC.
- **Los flujos creados fallan por causas concretas** (§1), y se pueden corregir pronto.
- **«Volver al paso anterior» y «Devolver al iniciador»** (§2) es la parte grande. Ya lo aprobaste como decisión D8, pero hay que cambiar la base de datos y el contrato de Revisiones.

## 1 · Por qué fallan los flujos creados

Hay siete causas, y cada una da un mensaje distinto. **Dime cuál te salió, o mándame una captura, y empiezo por esa.**

| # | Cuándo pasa | Qué sale |
|---|---|---|
| 1 | Un paso es por **Función contractual** y en la obra hay **varias personas** con esa función | «Hay pasos con varias personas posibles: elige quién en cada uno…». La pantalla **no tiene dónde elegir**, así que ese flujo no se puede usar nunca |
| 2 | Un paso es por función y **nadie** en la obra la tiene. Para tenerla, la persona necesita empresa, y esa empresa esa función en la obra | «El paso N pide la función X y en esta obra no hay nadie con esa función. Añade el participante o usa otra plantilla.» |
| 3 | Es un flujo antiguo cuyo **último paso solo revisa** | «El último paso de este flujo sólo revisa, así que la revisión no podría cerrarse nunca…». Y el flujo sigue apareciendo en la lista |
| 4 | Un paso tiene **plazo 0 días**: el editor de flujos lo deja guardar | «El plazo del paso N tiene que ser un numero de dias mayor que cero.» |
| 5 | La persona del paso **ya no es participante** o está desactivada | «El revisor del paso N no es miembro de esta obra.» o «…ya no tiene una cuenta activa.» |
| 6 | La vista previa no comprueba todo: algunas cosas saltan solo al pulsar «Iniciar revisión» | «Una revisión necesita al menos un revisor distinto de quien la crea…» o «La persona del paso N no puede consultar todos los documentos de esta revisión…» |
| 7 | Fallos de la pantalla | Si cambias rápido de flujo, puede enseñar uno y enviar otro. Si falla la base, sale un error técnico ilegible |

**Propuesta E1.3 · flujos creados utilizables.** Es pequeña y se puede hacer ya:
- en los pasos por función con varias personas posibles, poder elegir a quién;
- el editor de flujos no deja guardar plazo 0 ni un último paso que solo revisa;
- los flujos viejos que ya lo tengan se marcan como «no utilizable», con el motivo;
- la vista previa hace TODAS las comprobaciones antes de «Iniciar revisión»;
- mensajes claros en lugar de errores técnicos, y se corrige lo del cambio rápido de flujo.

## 2 · Volver a revisar dentro de la misma revisión, como en ACC

**Hoy:**
- Rechazar, en cualquier paso, cierra la revisión como «Rechazada» para siempre.
- Si el equipo sube una versión nueva, la aprobación final se niega con «…Vuelve a mandarlo a revisión.». Hay que crear otra revisión.

**Lo que ya decidiste (D8, 13-sep):**
- **«Volver al paso anterior»:** es la misma ronda. Puede cambiar el revisor y el plazo.
- **«Devolver al iniciador»:** abre una ronda nueva de la misma revisión. El iniciador sube la versión corregida y la reenvía. Se activa paso por paso, en el flujo.
- Ninguna de las dos es un rechazo del documento.

**Qué hay que construir:**
- En la base de datos:
  - número de ronda y estado «devuelta al iniciador»;
  - quién es el iniciador: hoy solo se guarda su nombre, así que no se le puede asignar tarea;
  - una tabla con lo que se revisó en cada ronda.
- En el flujo: marcar qué pasos pueden devolver.
- En la pantalla:
  - los dos botones nuevos;
  - «Reenviar» para el iniciador, con las versiones nuevas;
  - el historial por ronda, Mi Trabajo y los avisos.

**Tu regla del programa:** el contrato nuevo tiene que estar completo y congelado antes de programarlo, y no se activa en producción hasta estar completo y auditado. **No llega para hoy.** Son varios días de trabajo con sus pruebas.

## 3 · Cómo trabajar hoy

Requiere desplegada la corrección de «Editar» (`docs/usuarios/02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md`).

1. Tu equipo sube los archivos a su carpeta.
2. Se envían a revisión, y tú revisas.
3. Si rechazas, ellos hacen botón derecho sobre el documento → «Subir nueva versión».
4. Se envía a revisión otra vez, en una revisión nueva con la versión nueva. La rechazada queda como historial.
5. Apruebas.

## 4 · Decisiones tuyas

1. ¿Hago ya E1.3, los flujos creados? Si me dices qué mensaje te salió, empiezo por ese.
2. ¿Empiezo el contrato de «Volver al paso anterior» y «Devolver al iniciador» para que lo apruebes?
3. ¿Mantienes que no se active en producción hasta estar completo y auditado?
