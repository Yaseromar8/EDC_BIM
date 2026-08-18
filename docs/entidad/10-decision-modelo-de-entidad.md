# Decisión: cómo se sirve a una entidad (Acción 6 / C4)

**Fecha:** 18-ago-2026 · **Estado:** recomendación lista; decide el propietario
**Regla de la Acción 6:** *no implementar directamente* — este documento compara y
recomienda. Lo único construido es lo común a ambos caminos (el perfil `portal`).

---

## La pregunta

Cuando una municipalidad use el ECD, ¿se le da **su propia instancia** (A) o entra
como inquilina en **una plataforma compartida** (B)?

## Contexto que cambia la respuesta

El objetivo declarado del propietario (17-ago): *«hagamos lo necesario para YA
ofrecer a una entidad, y mejorar después de que una entidad lo esté usando, sin
perjudicarla»*. Es decir: mínimo honesto primero, escala después.

Y un hecho medido hoy: con `DEPLOY_PROFILE=portal`, el backend arranca sirviendo
**solo el portal documental** — 151 rutas en vez de 270, 37 MB en vez de 198.
Mismo código, misma política, cero duplicación.

## A · Instancia dedicada por entidad

Un servicio Render + una base Postgres + un bucket **por entidad**, con el perfil
`portal`.

| dimensión | evaluación |
|---|---|
| **Aislamiento** | **Físico.** Los datos de la entidad no comparten ni proceso ni base ni bucket con nadie. La pregunta «¿puede otro cliente ver mis documentos?» se responde con arquitectura, no con promesas |
| **Seguridad** | C4 (no hay administrador de entidad) **casi desaparece**: en una instancia mono-entidad, el admin de la instancia ES el admin de la entidad. C8 (aislamiento entre obras) queda como control interno de la entidad, no entre clientes |
| **Costo** | Lineal por entidad (~1 servicio pequeño + 1 base). Con el perfil portal a 37 MB, la instancia mínima da de sobra |
| **Mantenimiento** | Desplegar N veces. Con 1–3 entidades es trivial (mismo repo, mismo commit); con 30 exige automatización que hoy no existe |
| **Contratación pública** | Encaja: cada entidad contrata SU servicio, sus datos identificables, su baja limpia (se apaga la instancia y se le entrega su base y su bucket) |
| **Riesgo del proveedor** | C5 sigue: la cuenta de servicio del proveedor accede al bucket. Pero el radio de exposición es UNA entidad por credencial |

## B · Plataforma multi-entidad

Una sola instancia; cada entidad es un conjunto de obras con un administrador de
entidad y aislamiento lógico.

| dimensión | evaluación |
|---|---|
| **Aislamiento** | **Lógico.** Exige construir el concepto de entidad en el modelo de datos (hoy no existe: roles globales, `users` sin entidad), rehacer la autorización sobre esa base, y probarla adversarialmente. C4 entero, más un C8 «entre entidades» nuevo |
| **Seguridad** | El fallo de una guardia expone datos **de otro cliente** — la clase de incidente que termina contratos. Hoy mismo aparecieron dos rutas leyendo datos de cualquier obra: ese patrón, en multi-entidad, es catastrófico |
| **Costo** | Sub-lineal (una infraestructura). Gana con decenas de entidades |
| **Mantenimiento** | Un despliegue. Pero cada migración toca a TODOS los clientes a la vez |
| **Contratación pública** | Más difícil: datos en infraestructura compartida, bajas complejas, peritajes que arrastran a terceros |

## Recomendación: **A — instancia dedicada por entidad**

Para la etapa actual, sin ambigüedad:

1. **Es lo único ofrecible YA.** B exige construir el modelo de entidad (C4
   completo), y eso es un proyecto, no un ajuste. A exige desplegar lo que ya
   existe con el perfil que ya existe.
2. **Cumple la condición del propietario** — «sin perjudicarlos»: un fallo en la
   plataforma del proveedor no expone datos de la entidad a nadie más, porque no
   hay nadie más en su instancia.
3. **La depuración de hoy lo confirma:** en 24 horas aparecieron el comparador
   sin guardia, el bucket abierto por nombre y el control por obra sorteable.
   Con aislamiento físico, esa clase de fallo queda contenida dentro de un
   cliente. Con aislamiento lógico, cruza clientes.

### Qué es difícil de revertir (los dos sentidos)

- **A→B (consolidar más tarde):** migrar datos de N bases a una es trabajoso
  pero mecánico, y se hace entidad por entidad, sin big bang. **Reversible con
  esfuerzo conocido.**
- **B→A (separar más tarde):** desenredar datos entrelazados de una base
  compartida, bajo presión de un incidente o una rescisión, es lo caro y lo
  arriesgado. **Éste es el camino del que cuesta volver.**

Empezar por A deja la puerta a B abierta. Empezar por B la cierra.

### Lo que A NO resuelve (y queda dicho)

- **C5**: la cuenta de servicio del proveedor sigue leyendo el bucket por fuera.
  Pendiente de IAM (Acción 4).
- **Continuidad**: cada instancia necesita su copia probada (Acción 3).
- **Infraestructura**: una entidad no puede vivir en un plan que se duerme. El
  costo del plan pagado entra en el precio al cliente.
- **Operación multi-instancia**: con la tercera entidad habrá que automatizar el
  despliegue. Deuda aceptada, no urgente.

## El mínimo honesto antes de la primera entidad

En orden, con su estado:

| # | qué | estado |
|---|---|---|
| 1 | Perfil portal desplegable | **HECHO** (`bfb95f6`, con 3 candados) |
| 2 | Instancia propia (servicio+base+bucket nuevos, perfil portal, 6 variables de postura desde el día uno) | pendiente — pasos del propietario, guiados |
| 3 | Copia y restauración probadas EN esa instancia | herramientas listas; ejecutar allí |
| 4 | Gestión de roles desde el portal | **HECHO** — selector en Miembros; confirma dar/quitar admin; enseña el error real del backend; el último admin activo no se puede degradar (probado) |
| 5 | Exportar el expediente | **HECHO** — panel en Configuración: índice xlsx (sin fórmulas, se abre sin la plataforma) + zip de documentos por URLs firmadas; con candado que exige las dos puertas |
| 6 | Plan pagado en Render para esa instancia | decisión de precio del propietario |
| 7 | Contrato: dónde viven los datos, Ley 29733, retención, salida | del propietario, con plantilla nuestra |

Lo que **no** entra en el mínimo (y por qué es honesto ofrecerlo así): ENFORCE
encendido (la instancia es mono-entidad; C8 es control interno y se enciende en
cuanto la batería autenticada pase), 2FA obligatorio (disponible, se recomienda
al admin de la entidad), IAM de C5 (se declara como está en el contrato).
