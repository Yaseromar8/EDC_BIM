# Evidencia — copia independiente de los bytes · 20-ago-2026

Cierra las acciones 3 y 4 del OWNER ACTION PACK, y con ellas los criterios de
continuidad 1, 2 y 4 que fijó el propietario.

---

## El bucket de la copia

| | |
|---|---|
| Nombre | `yaser-pqt08-talara-copia` |
| Ubicación | `us-east4` (la misma que el original: transferencia sin coste de salida) |
| Clase | **Nearline** (~mitad de precio; esta copia casi nunca se lee) |
| Acceso público | **No público** |
| Soft delete | **90 días** |
| Espacio de nombres jerárquico | **No** — a propósito, para no repetir lo del original |

## La transferencia programada

| | |
|---|---|
| Servicio | Storage Transfer Service, `yaser-pqt08-talara` → `yaser-pqt08-talara-copia` |
| Frecuencia | diaria |
| **Cuándo borrar** | **Nunca** |
| Primera ejecución | 20-ago-2026, ~11:36 |

**«Cuándo borrar: Nunca» es lo único que separa una copia de un espejo.** Con
cualquier otro valor, borrar en el original borraría en la copia — y entonces no
protege del borrado por error, lo repite. Verificado por el propietario en la
página del trabajo.

## Lo que se ve dentro de la copia

Carpetas `multi-tenant/`, `multimedia-whatsapp/` y `proyectos/`, con objetos
fechados en la primera ejecución. `multi-tenant/` es el prefijo bajo el que la
aplicación escribe los documentos del expediente
(`multi-tenant/{obra}/{timestamp}_{uuid}_{fichero}`, `documents.py:1019`).

---

## Qué protege esto, y qué NO

| riesgo | ¿cubierto? |
|---|---|
| Borrado accidental de un documento | sí — soft delete 90 días en el original |
| Sobrescritura accidental | sí — el soft delete cubre ambas |
| Pérdida del bucket entero | **sí, ahora** — es lo que añade la copia |
| Credencial de la aplicación comprometida | **depende** — ver abajo |
| Caída de la región `us-east4` | **no.** Ambos buckets están en la misma región. Es una decisión consciente: la copia protege de borrados y de perder el bucket, no de un desastre regional |
| Los ficheros de hace más de 24 h que se borren y se vacíen del soft delete antes de la siguiente transferencia | ventana teórica; con soft delete a 90 días no ocurre |

## PENDIENTE DE COMPROBAR — y decide si «permisos separados» se cumple

La credencial que usa la aplicación **no debe alcanzar el bucket de la copia**.
Si lo alcanza, un compromiso de esa credencial se lleva las dos cosas y la copia
no es independiente: es una segunda carpeta.

Depende de cómo se concedió el permiso en su día:

- **A nivel de bucket** (lo que manda la guía) → la cuenta de servicio de la
  aplicación no tiene nada sobre el bucket nuevo. **Cumple.**
- **A nivel de proyecto** → hereda acceso al bucket nuevo automáticamente.
  **No cumple**, y hay que acotarla.

Se comprueba en `yaser-pqt08-talara-copia` → pestaña **Permisos**: si la cuenta
de servicio de la aplicación aparece ahí, o si tiene un rol de Storage a nivel de
proyecto, hay que quitarlo y concederlo solo sobre el bucket de origen.
