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

## COMPROBADO — y NO cumple «permisos separados»

Medido en la consola el 20-ago-2026, pestaña **Permisos** del bucket de la copia:

```
visor-backend@correos-gmail-425301.iam.gserviceaccount.com
Rol:      Administrador de objetos de Storage
Herencia: PLATAFORMA BIM-TALARA        <- del PROYECTO, no del bucket
```

`visor-backend` es la cuenta de servicio de la aplicación. El permiso se
concedió **a nivel de proyecto**, así que lo hereda sobre CUALQUIER bucket,
incluido el de la copia recién creado. Puede leer, escribir y **borrar** ahí.

**Consecuencia:** si esa credencial se ve comprometida, se lleva el original y
la copia. La copia protege de perder el bucket y de un borrado accidental; NO
protege de un compromiso de la credencial de la aplicación, que era la mitad del
criterio.

### Y hay más permiso amplio del que conviene

En el mismo listado:

- `1009984221602-compute@developer.gserviceaccount.com` (la cuenta por defecto de
  Compute Engine) tiene **Administrador de almacenamiento** heredado del
  proyecto — un rol aún más fuerte: incluye borrar buckets enteros.
- **Editores del proyecto** figuran como propietarios de buckets y objetos.

No son urgentes como el anterior, pero cualquiera de ellos alcanza también la
copia. Van a la lista de después del piloto.

### Cómo se cierra, y en este orden

El orden importa: primero se concede lo nuevo, se comprueba que nada se rompe, y
solo entonces se retira lo viejo. Al revés deja al servicio sin acceso a su
propio bucket.

1. En **`yaser-pqt08-talara`** (el original) → Permisos → Otorgar acceso a
   `visor-backend@…` con **Administrador de objetos de Storage**, esta vez **a
   nivel de bucket**.
2. Comprobar que el portal sigue subiendo y descargando documentos.
3. En **IAM del proyecto** → quitar a `visor-backend` el rol de Storage a nivel
   de proyecto.
4. Volver a Permisos del bucket de la copia: `visor-backend` ya no debe aparecer.

**Cuidado antes del paso 3:** la misma cuenta se usa para la IA (el log dice
`[AI] Credenciales cargadas solo para IA desde gcp_sa.json`). Si algo de Vertex
AI escribe en otro bucket, quitarle el permiso de proyecto lo dejaría sin
acceso. Hay que mirarlo antes, no después.

---

## (Comprobación original, ya resuelta)

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
