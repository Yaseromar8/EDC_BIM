# PDF pesado · P1 · cómo obtener las evidencias que faltan, con el menor riesgo

17-sep-2026. Encargo del propietario tras aceptar el checkpoint local `979c2d7`: **diagnosticar**, antes de
cualquier push o despliegue, cómo conseguir `REAL GCS E2E`, `RENDER COST` y la medición de `004122` usando la
infraestructura que existe hoy.

**Esto es sólo diagnóstico.** No se ha tocado código ni infraestructura. No se ha desplegado nada.

## 1 · Lo que hay hoy, verificado (no supuesto)

Medido hoy contra los propios servicios, leyendo `/api/health`, que es la única forma fiable de saber qué commit
corre:

| Lo que ve el usuario | Sirve la API | Commit vivo | Fecha del commit |
|---|---|---|---|
| `alephia.com.pe` (portal y Hub) | `visor-ecd-backend-va` (Virginia) | `28fa7a3da605` | 16-sep |
| `visor-ecd-portal.onrender.com` | el mismo de Virginia | `28fa7a3da605` | 16-sep |
| `visor.alephia.com.pe/api/*` (la reescritura del sitio estático del visor) | `visor-ecd-backend` (Oregón) | `cdf783754574` | 11-sep |
| El visor 3D en el navegador (su código) | **`visor-ecd-backend-va` (Virginia)**, por URL absoluta | `28fa7a3da605` | 16-sep |
| La app nativa (APK/Capacitor) y el conector | `visor-ecd-backend` (Oregón), por URL absoluta | `cdf783754574` | 11-sep |

**Corrección (17-sep, tras revisarlo):** en la primera versión de este informe decía que el visor 3D sale por
Oregón. **No es así.** El visor en el navegador lleva horneada `VITE_BACKEND_URL = https://visor-ecd-backend-va.onrender.com`
(comprobado en su bundle vivo, `index-Ca1gi2yB.js`) y llama a **Virginia** directamente; sólo elige Oregón cuando corre
como app nativa (`Capacitor.isNativePlatform()`). Lo que medí —`visor.alephia.com.pe/api/health` → Oregón— es la
**reescritura `/api/*` del sitio estático del visor**, que se quedó apuntando a Oregón y que el código del visor no
usa. Coincide con tu registro de la mudanza del 12-sep: **Oregón se dejó encendido a propósito, como vuelta atrás y
porque la APK y el conector apuntan a él**; con las mismas variables que Virginia, es decir, **la misma base y el
mismo bucket de producción**. `deploy/render.yaml` (registro del 4-sep) sigue describiendo el reparto anterior a la
mudanza.

Otros hechos, del repositorio y ya registrados por ti:

- **Cuatro servicios**, todos siguiendo `main` con **Auto-Deploy OFF**: un push no publica nada; todo entra por
  *Manual Deploy* y lo haces tú.
- **No hay staging, ni servicios `cron`/`worker`, ni PR previews declaradas.** El plan de staging quedó escrito y
  descartado a propósito (`docs/entidad/07-plan-staging-separacion-identidades.md`, ruta B).
- **Las llaves de Google viven sólo en Render.** El propio repositorio lo dice donde duele:
  `backend/scripts/miniaturas_pdf.py` aborta en la máquina del propietario con «las llaves del almacén viven en el
  servidor» y remite al botón que corre en el servidor. Sin esas llaves, **en local no hay forma de tocar el bucket**.
- **Un solo bucket de producción** (`yaser-pqt08-talara`), con borrado reversible de 90 días y **versionado
  desactivado**. El «bucket copia» es una foto congelada del 20-ago, no una réplica. No hay bucket de pruebas
  configurado: `GCS_BUCKET_NAME` es el único interruptor que aislaría el almacenamiento sin tocar código.
- **Una sola base** (Cloud SQL, instancia única), con copias diarias y PITR de 7 días.
- **Precedente de coste de desplegar el backend:** dos Manual Deploy dejaron el servicio sin responder **25 min
  (13-sep)** y **~64 min (15-sep)**, y hubo que reiniciarlo a mano. Instancia única, sin redundancia.

### Lo que NO se puede afirmar desde aquí, y sólo tú puedes mirar en el panel

1. Si el plan de Render de esos servicios permite **Shell (SSH)** o **Jobs** de una sola pasada.
2. ~~Si Oregón comparte la base con Virginia~~ — **respondido por tu propio registro de la mudanza (12-sep): mismas
   22 variables, así que misma base y mismo bucket de producción.** Confirmarlo en el panel es opcional.
3. El destino real de la reescritura `/api/*` de cada sitio estático (medido por fuera arriba, pero el valor vive
   en el panel).
4. Si hay algún **APK/Capacitor en uso**: el código empaquetado apunta a Oregón por URL absoluta, así que retirarlo
   rompería ese camino.

## 2 · Qué hace falta demostrar, y dónde se puede

| Evidencia | ¿Se puede sin desplegar? |
|---|---|
| Bajar el PDF real del bucket, generar `__thumb2000.jpg` y **subirlo** | Sí, **si** se ejecuta en el servidor (allí están las llaves) |
| Recuperarlo **por la ruta autorizada** y comprobar que es el de esa versión | **No**: la ruta nueva sólo existe en `979c2d7`, que no está desplegado |
| `RENDER COST` (tiempo, CPU, memoria, cola de dos hilos, no bloquear al único worker) | Sí, **si** se ejecuta en una instancia de Render |
| `004122` (clic → preview legible, peso, llegada del vector, fallback) | Sí, **en local**, sin tocar nada |

Un matiz importante para la opción de «ejecutar lo que ya está desplegado»: el código vivo tiene
`get_or_create_thumbnail(urn, max_px)` **sin** el parámetro de calidad, así que generaría el JPEG a **q72** en vez de
q85 — pesa un 10–15 % menos y es algo menos nítido. **Los tiempos, la memoria y el flujo son los mismos**, que es lo
que mide `RENDER COST`. La imagen exacta del candidato (q85) sólo sale con el código nuevo.

## 3 · Las alternativas

### A · Una ejecución puntual en el servidor, con el código que YA está desplegado

Sobre un documento de la **obra de prueba** que ya existe (`ZZ_PRUEBA_VENTANA_2026-08`), no sobre un plano real.

```
RIESGO              bajo-medio: consume 2-4 s de CPU del único worker mientras genera
QUÉ SERVICIO TOCA   el backend que elijas: Virginia (el de producción) u Oregón (vuelta atrás, APK y conector)
AFECTA USUARIOS     brevemente, sí: CPU compartida. Mitigable fuera de horario y con un solo documento
REQUIERE PUSH       no
REQUIERE DEPLOY     no
ROLLBACK            borrar el objeto generado (queda en borrado reversible 90 días). Nada que revertir en código
EVIDENCIA           descarga real del bucket + generación + subida real + recuperación por URL firmada,
                    y RENDER COST completo (tiempo, CPU, memoria, cola) en la instancia real.
                    NO cubre la ruta autorizada nueva, y el JPEG sale a q72
```

Depende de que el panel permita **Shell o Job**. Si se hace en Virginia, los números son representativos (misma
región que el bucket); en Oregón habría penalización por cruzar de región y se tocaría a la APK y al conector.

### B · Un servicio temporal en Render, desde una rama con P1

```
RIESGO              medio: es una copia de la aplicación; comparte base (lecturas y filas de auditoría de
                    acceso) y, si no se aísla, bucket
QUÉ SERVICIO TOCA   uno NUEVO, sin dominio propio; los cuatro existentes quedan intactos
AFECTA USUARIOS     no directamente; sólo carga adicional sobre la base
REQUIERE PUSH       sí, de una RAMA (no `main`). Con Auto-Deploy OFF en los cuatro servicios, ese push no publica nada
REQUIERE DEPLOY     sí, pero del servicio nuevo
ROLLBACK            suspender o eliminar el servicio; borrar los objetos de prueba
EVIDENCIA           TODO: ruta autorizada con su puerta, correspondencia con la versión pedida, coste en Render,
                    cola de dos hilos y comportamiento con peticiones simultáneas
```

Aislamiento recomendado si se elige: apuntar su `GCS_BUCKET_NAME` a otro bucket, y usar la obra de prueba.

### C · Despliegue controlado del backend de Virginia (producción)

```
RIESGO              alto para lo que se gana: dos precedentes de 25 y ~64 minutos sin servicio tras un Manual
                    Deploy del backend, instancia única y sin redundancia
QUÉ SERVICIO TOCA   el backend que sirve el portal a los usuarios
AFECTA USUARIOS     sí
REQUIERE PUSH       sí, a `main`
REQUIERE DEPLOY     sí
ROLLBACK            Manual Deploy del commit anterior; el runbook avisa de que el rollback no es un clic y exige
                    verificación posterior
EVIDENCIA           todo, ya en el entorno definitivo
```

Es el despliegue de verdad, no una forma de medir. Debería ocurrir **después** de tener las evidencias.

### D · Usar Oregón como banco

```
RIESGO              alto y mal repartido: Oregón usa la MISMA base y el MISMO bucket de producción, y atiende a la
                    APK y al conector
QUÉ SERVICIO TOCA   la vuelta atrás de producción, la APK y el conector
AFECTA USUARIOS     sí, los de la APK y el conector; y actualizarlo arrastraría seis días de cambios (11→17 sep), no sólo P1
REQUIERE PUSH       sí            REQUIERE DEPLOY  sí
ROLLBACK            volver a desplegar `cdf7837`
EVIDENCIA           la misma que B, pero sobre un servicio con datos de producción y usuarios nativos
```

Además está expresamente prohibido en el estado registrado («no desplegar ni reactivar Oregón») y la decisión de
actualizarlo o retirarlo (D9) sigue abierta. **Descartada** salvo que tomes esa decisión aparte.

### E · El entorno local HOST

```
RIESGO              ninguno            AFECTA USUARIOS  no        PUSH/DEPLOY  no
EVIDENCIA           ninguna de las que faltan: en local no hay llaves de Google (no hay GCS real) ni hardware de
                    Render (no hay coste real). Sólo repetiría lo ya medido
```

## 4 · El riesgo que hay que evitar sí o sí

Escribir `<gcs_urn>__thumb2000.jpg` **junto a un plano real** tiene una consecuencia seria: la comprobación de
existencia es sólo un `exists()` y el generador **nunca sobrescribe**, así que ese objeto se serviría como «la
lámina legible» de ese plano a los usuarios reales, de forma permanente, y con la caché del navegador de 24 h por
delante. Por eso toda prueba debe hacerse sobre **la obra de prueba** o sobre un `gcs_urn` inventado bajo un prefijo
propio, nunca sobre un documento de obra.

## 5 · Recomendación

1. **`004122` primero, hoy mismo y sin riesgo** (alternativa E para esta evidencia concreta): sólo necesito el
   fichero en local —déjalo en tu carpeta de descargas o bájalo del portal— y lo mido en el banco con el mismo
   contrato que `004120`.
2. **`REAL GCS E2E` (generación y subida) y `RENDER COST` con la alternativa A**, sobre la obra de prueba, en el
   backend de **Virginia** y fuera de horario. Antes hay que confirmar en el panel si hay Shell o Jobs. Si no los
   hay, la alternativa A no existe y esa evidencia pasa a la B.
3. **La parte de «recuperarlo por la ruta autorizada»** sólo se puede demostrar con la **B** (servicio temporal) o
   ya en producción con la **C**. Recomiendo **B antes que C**: la ruta es justamente la que lleva la puerta de
   permisos, y verla funcionar contra datos reales antes de exponerla a usuarios es exactamente lo que evita la
   sorpresa.
4. **Sólo después, C**, como despliegue de verdad y con la ventana que tú decidas, sabiendo que el propio despliegue
   del backend tiene precedente de dejar el servicio caído decenas de minutos.

**Para P1 sólo queda una pregunta:** si el plan de Render permite **Shell o Jobs en Virginia**. Con eso se decide
entre A (sin desplegar) y B. Lo de la APK no afecta a P1: sólo importaría el día que se decida retirar Oregón
(decisión D9, fuera de este frente), y la de la base ya la responde tu registro del 12-sep.

`ESTADO` · `REAL GCS E2E = NOT TESTED` · `RENDER COST = NOT MEASURED` · `004122 = NOT MEASURED` ·
`PRODUCTION READY = NO` · sin push, sin despliegue y sin cambios de código ni de infraestructura.
