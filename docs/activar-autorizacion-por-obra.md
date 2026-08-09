# Activar la autorización por obra (`ENFORCE_PROJECT_AUTHZ`)

Es lo que hace que un usuario de una obra **no vea la otra**. Hoy está apagada:
cualquier persona con sesión ve los datos de todas tus obras.

Es también el **último requisito** para poder abrir el registro libre. Sin esto, un
desconocido que se cree una cuenta lee el inventario, los documentos y los modelos de
todas las obras.

## Antes de empezar: dos cosas que no se pueden saltar

**1. Corre el simulacro.** No escribe nada y responde con tus datos reales a quién
dejaría fuera:

```bash
python backend/simular_authz.py
```

Te dice, persona a persona, qué obras vería; quién se quedaría **sin ver nada** (el
fallo que se descubre un lunes con el equipo en campo); y cuántos datos quedan sin obra
asignada. Termina con un veredicto.

**2. Corre el backfill si el simulacro lo pide.** Hay elementos de inventario sin obra
asignada: al activar, **desaparecen** para todo el que no sea admin.

```bash
python backend/backfill_obra.py
```

En seco por defecto. Léelo, y si cuadra:

```bash
python backend/backfill_obra.py --aplicar
```

## Los dos modos

| `ENFORCE_PROJECT_AUTHZ` | Qué hace |
|---|---|
| sin definir / `false` | **Log-only.** Registra a quién bloquearía, pero deja pasar. |
| `true` | Bloquea de verdad: 403 al pedir datos de una obra que no es tuya. |

## Procedimiento

**1. Deja correr el modo log-only 48-72 horas** de uso real, cubriendo una jornada de
campo con la APK y una sesión en el portal.

> Este periodo tiene **fecha de caducidad**. Esta misma variable lleva meses en log-only
> acumulando avisos que nadie ha leído: un modo transitorio sin fecha se convierte en el
> estado permanente.

**2. Busca en los logs de Render estas dos marcas:**

- `[authz log-only] BLOQUEARIA: user=… obra=… GET /api/…` — lo que se cerraría. Revísalo
  uno a uno. Si el usuario es legítimo y la obra es suya, **falta una membresía**:
  asígnasela desde el panel antes de activar.
- `[authz HUECO] proyecto indeterminable…` — una ruta que maneja datos de obra pero de
  la que no se puede deducir cuál. Bajo `true` esas **se colarían igual**. Cada línea es
  una ruta a la que hay que añadirle el identificador de obra.

**3. Activa.** En Render, `ENFORCE_PROJECT_AUTHZ=true`. Redesplegar.

**4. Comprueba en caliente**, con una cuenta que no sea admin: que ve su obra, que el
modelo carga, que las fotos salen, y que no aparece la otra obra.

**Para revertir**: quita la variable o ponla en `false`. Vuelve al comportamiento
anterior sin tocar código.

## Lo que esto NO cierra

La comprobación vive en el middleware y decide con la obra que **deduce de la petición**.
Hay rutas que operan por id de recurso (`PATCH /api/partidas/<id>`, `DELETE
/api/pins/<id>`) donde el filtro tiene que estar **en el SQL**, y ya está puesto en las
que se detectaron. Si añades una ruta nueva que opere por id, ponle su filtro: el
middleware no puede protegerla por ti.

Y el namespace `'global'`: `verify_project_access` lo deja pasar sin mirar. Mientras siga
habiendo datos reales de obra ahí dentro, son visibles para cualquiera con sesión.

## Orden recomendado del conjunto

1. `AUTH_POLICY_MODE=estricto` — ver [activar-politica-de-acceso.md](activar-politica-de-acceso.md)
2. Backfill + `ENFORCE_PROJECT_AUTHZ=true` — este documento
3. `ALLOW_OPEN_REGISTRATION=true` — solo después de los dos anteriores

**Nunca los dos primeros en el mismo despliegue.** Son dos interruptores que cierran
cosas distintas; si algo se rompe, con los dos a la vez no sabrás cuál fue.
