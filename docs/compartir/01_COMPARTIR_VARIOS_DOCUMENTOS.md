# Compartir varios documentos con un solo enlace · recomendación

14-sep-2026. Lo que pediste: «que los conjuntos también puedan compartirse mediante link, o que al seleccionar varios archivos y hacer clic derecho también se active Compartir. Recomiéndame algo profesional.»

Solo análisis. No he tocado nada.

## Hoy

- Solo se comparte **un documento por enlace**. Con varios seleccionados, «Compartir» sale apagado: «Sólo se puede con un elemento a la vez».
- **Los conjuntos no se pueden compartir ni exportar.**
- **Los transmittals** mandan un correo con la lista de documentos y sus versiones, **sin enlace**. Quien no tiene cuenta no los puede abrir.

## Recomendación: un «paquete compartido»

Un solo mecanismo con dos entradas:
- **Varios archivos seleccionados** → botón derecho → «Compartir».
- **Un conjunto** → «Compartir conjunto».

Las dos crean **un enlace a un paquete**, con estas reglas:
- **Versiones exactas.** Guarda las versiones del momento de compartir: si mañana suben otra versión, el enlace sigue mostrando la que compartiste.
- **Caducidad y revocación.** Caduca a los 1, 7, 30 o 90 días, y se puede revocar.
- **Solo lectura.** Quien lo abre ve la lista y abre cada documento: PDF e imágenes en el navegador, CAD si ya está traducido, y el resto como descarga.
- **Control de seguridad.** Cada documento pasa el control que ya existe para compartir, el triaje. Si uno no puede salir, no se crea el enlace y se dice cuál.
- **Sin borradores.** Lo que está en Trabajo en curso (WIP) no sale por enlace.
- **Registro.** Queda anotado quién lo creó, quién lo revocó y cada apertura.

Compartir un solo documento pasaría a ser un paquete de uno: un solo motor, no dos.

**Por qué este y no otro:**

| Opción | Problema |
|---|---|
| Un enlace por archivo | 10 archivos son 10 enlaces que revocar, y cada uno sirve la versión actual, no la compartida |
| Compartir el conjunto «vivo» | Si alguien añade o quita documentos del conjunto, cambia lo que ya enviaste |
| Meterlo en el transmittal | El transmittal es la entrega formal, con acuse. Mezclarlo con enlaces públicos ensucia ese registro |

El transmittal sigue siendo la entrega formal. El paquete es para «mira esto».

## Fallos del compartir actual, para cerrar a la vez

- **Versión:** el enlace de un documento sirve **la versión actual**, no la que se compartió (`routes/documents.py:2614-2647`).
- **Revocar:** no comprueba que el enlace sea de esa obra. Basta con conocer su id (`routes/documents.py:2723`).
- **Autor:** quién compartió lo manda el navegador, no la sesión (`routes/documents.py:2307`).
- **Registro:** revocar no deja registro.

## Esfuerzo y orden

- **Qué incluye:** base de datos (el paquete con sus versiones), rutas, página pública con la lista, entradas en el menú y en Conjuntos, y pruebas.
- **Tamaño:** medio.
- **Orden:** recomiendo hacerlo **después de Revisiones**, que es lo que tu equipo usa desde hoy.

**Decisión tuya:** ¿te sirve el paquete compartido así? ¿Lo pongo en cola después de Revisiones?
