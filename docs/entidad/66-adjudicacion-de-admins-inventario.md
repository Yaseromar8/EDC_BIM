# PASO 14 · ADJUDICACIÓN DE ADMINS — INVENTARIO PARA DECISIÓN

**Medido en producción el 22-ago-2026. No se ha cambiado ninguna cuenta.** Cada
ficha termina en `DECISIÓN DEL PROPIETARIO: [vacío]`.

---

# LAS DOS PREGUNTAS, SEPARADAS

Según el organigrama congelado, **`ENTITY ADMIN ≠ PROJECT ADMIN`**: son dos
figuras distintas y se deciden por separado.

### A · ¿QUIÉN DEBE SER ENTITY ADMIN? — **DECIDIDO (22-ago-2026)**

```
AHORA
  único Entity Admin ....... id 2 · omarsanchezh8@gmail.com
  segundo custodio ......... NO por ahora
  recuperación de emergencia PREPARADA Y PROBADA EN DIAGNÓSTICO -> doc 69

PRE-PILOT
  segundo Entity Admin ..... OBLIGATORIO antes del piloto externo
  candidato ................ Fabián (id 17), sin adjudicar
  condiciones .............. cuenta reclamada y activa · 2FA activo · identidad
                             humana conocida · necesidad real de custodia DE
                             ENTIDAD · aceptación explícita del propietario

ESTADO: DECIDIDO   (opción D: «C ahora + B antes del piloto externo»)
```

*Contexto original de la decisión:*

Custodia la **instancia**: crea y archiva obras, administra el padrón de
usuarios, el catálogo de la entidad y el triaje de seguridad. Alcance global
mientras `1 instancia = 1 entidad`.

**Hoy: una sola cuenta (id 2).** Es un **punto único**: si se pierde, la entidad
queda sin custodio y recuperarla exigiría intervención directa en base de datos.
Opciones — (a) statu quo aceptando el riesgo con la copia diaria como respaldo,
(b) un segundo Entity Admin de confianza, (c) documentar un procedimiento de
emergencia y aceptarlo formalmente.

### B · ¿QUIÉN DEBE ADMINISTRAR PQT8_TALARA? — **REVOCADA Y RESUELTA POR EL BARRIDO FINAL (22-ago-2026)**

```
DECISIÓN VIGENTE: el propietario administra la obra real VÍA ENTITY ADMIN.
La adjudicación a Fabián (con condición de 2FA) quedó REVOCADA en el barrido
final: las cuentas de terceros reales salen del padrón porque no pueden
participar en pruebas en tiempo real. La obra 1 queda con 0 miembros; solo
la alcanza el Entity Admin. Cuando el proyecto incorpore participantes
reales, esta pregunta se reabre con el flujo de Identity & Access mejorado.
```

*Decisión anterior (revocada), conservada como historia:*


```
ADJUDICADO
  Project Admin de la obra 1 ... Fabián Serrano · id 17
  CONDICIÓN PREVIA ............. 2FA ACTIVO antes del nombramiento

ESTADO: DECIDIDO · EJECUCIÓN RETENIDA POR LA CONDICIÓN
  comprobación previa ejecutada 22-ago: 4 de 5 controles en regla;
  se detiene en «2FA activo» (medido: totp_activo=false, 0 códigos)

SEPARACIÓN PRESERVADA
  id 2  · Omar    Entity Admin SI · Project Admin de la obra 1: innecesario
                  (ya la alcanza por ámbito de entidad)
  id 17 · Fabián  Entity Admin NO · Project Admin de la obra 1: SI, tras 2FA
                  -> ningún privilegio de entidad, ni ahora ni por esto
  id 19           cuenta de PRUEBA: no será autoridad de la obra real
```

**La condición de 2FA es POLÍTICA DE SEGURIDAD ADOPTADA por el propietario para
administradores de obra real — no una exigencia del modelo ACC/Procore**, que no
dice nada del segundo factor. Se comprueba en
`herramientas/nombrar_admin_de_obra.py`, que se niega a escribir si falta.

*Contexto original de la decisión:*

Administra **una obra**: su directorio, sus permisos documentales, sus rescates
de flujo. Vive en `project_users.es_admin` — es la fila de membresía, así que
retirar de la obra retira la administración en el mismo acto.

**Hoy: NADIE.** La obra real tiene 4 miembros y los 4 con `es_admin = false`;
toda su administración recae en el Entity Admin por alcance global. Opciones —
(a) statu quo (tú administras vía Entity), (b) nombrar a un miembro Project
Admin, (c) nombrar a dos, para que ninguno sea el único.

*La respuesta a B no condiciona la de A, ni al revés.*

---

# PRINCIPIO DE RETIRADA — fijado por el propietario (22-ago-2026)

```
sin actividad probatoria  ->  se puede PURGAR      (la fila no prueba nada)
con actividad probatoria  ->  NUNCA se purga: se DESACTIVA
                              la identidad y sus actos se conservan
```

Es la diferencia entre la cuenta 21 (purgada: cero actos) y la 22 (jamás
purgable: sus actos son la evidencia de la ventana). La desactivación existe
para proteger el rastro de quien HIZO algo; donde no hay rastro, no protege nada.

---

# FICHAS · 7 identidades (todas las que existen)

## id 2 · Yaser Omar — `omarsanchezh8@gmail.com`

| | |
|---|---|
| ESTADO | Activa · reclamada (alta 22-feb-2026) |
| ROLE / ENTITY ADMIN | `admin` · **SÍ** (la única) |
| MEMBRESÍAS | Ninguna (el alcance global no la necesita) |
| PROJECT ADMIN | — |
| EMPRESA · FUNCIÓN | Sin empresa · sin función contractual |
| **2FA** | **ACTIVO** — la única cuenta con segundo factor |
| ÚLTIMO USO | Hoy · 258 asientos con su correo (+457 antiguos como «Yaser Omar») |
| POR QUÉ EXISTE | Es el propietario y constructor de la instancia |
| RIESGO | **Punto único de administración de la entidad** (ver pregunta A) |
| RECOMENDACIÓN TÉCNICA | Conservar. Decidir sucesión. No darle Project Admin de nada: ya lo alcanza todo, y duplicarlo enturbia el rastro |
| **DECISIÓN DEL PROPIETARIO** | ✅ **CONSERVADA — único Entity Admin** (Decisión A, opción D): recuperación de emergencia cerrada (doc 69); segundo custodio obligatorio antes del piloto externo |

## id 17 · Fabian Serrano — `fabian230209@gmail.com`

| | |
|---|---|
| ESTADO | Activa · reclamada (13-may-2026) |
| ROLE / ENTITY ADMIN | `user` · No |
| MEMBRESÍAS | **obra `1` (PQT8_TALARA)** + `PQT8_INTERFERENCIAS` |
| PROJECT ADMIN | No |
| EMPRESA · FUNCIÓN | **INTERFERENCIAS** · SUPERVISIÓN (declarada en la obra de prueba) |
| 2FA | No |
| ÚLTIMO USO | **22-ago** — la única persona además del propietario con uso sostenido |
| POR QUÉ EXISTE | Colaborador real del proyecto |
| RIESGO | Ninguno nuevo. El riesgo es *no* decidir: la obra real sigue sin administrador propio |
| RECOMENDACIÓN TÉCNICA | **Único candidato con historial** para Project Admin de la obra `1`. Es decisión de confianza, no técnica. Si se nombra: pedirle 2FA antes |
| **DECISIÓN DEL PROPIETARIO** | ✅ **DESACTIVADA · BARRIDO FINAL (22-ago-2026, ejecutada)** — tercero real que no puede participar en pruebas en tiempo real. Retiradas sus 2 membresías, su permiso de carpeta (concesión de acceso, no acto histórico) y sus 4 sesiones; `is_active=false`. **Identidad y asientos CONSERVADOS** (uso real desde mayo → jamás purgable). La candidatura a Project Admin queda **revocada** con la Decisión B. Reactivable con un clic si algún día vuelve |

## id 18 · Walter Correa — `walterdavidcorreamorocho79@gmail.com`

| | |
|---|---|
| ESTADO | Activa pero **INVITACIÓN PENDIENTE** (24-jul-2026, jamás reclamada) |
| ROLE / ENTITY ADMIN | `user` · No · PROJECT ADMIN: No |
| MEMBRESÍAS | obra `1` (asignada sin haber entrado nunca) |
| EMPRESA · FUNCIÓN | **SINOHYDRO** · sin función declarada |
| ÚLTIMO USO | **Nunca inició sesión** |
| POR QUÉ EXISTE | Se le invitó a la obra real hace un mes |
| RIESGO | Bajo: su enlace de 14 días **ya caducó** y, tras el cierre G5a, una cuenta retirada tampoco sería reclamable. Es ruido en el padrón, no una puerta |
| RECOMENDACIÓN TÉCNICA | Decidir si sigue en el proyecto: **sí → «Copiar enlace»** (reemisión, ya existe el botón); **no → «Retirar acceso»** (desactiva, conserva rastro) |
| **DECISIÓN DEL PROPIETARIO** | ✅ **PURGADA · BARRIDO FINAL (22-ago-2026, ejecutada)** — supersede el estado PENDIENTE: el propietario decide que los terceros salen del padrón. Preflight: 0 sesiones, 0 actos, 0 referencias (solo su membresía nunca usada). Purga humana explícita con asiento previo; el correo queda libre para una invitación futura real |

## id 19 · yaser omar 02 — `yaseromarsanchez8@gmail.com`

| | |
|---|---|
| ESTADO | Activa · reclamada (24-jul-2026) — **segunda cuenta del propietario** |
| ROLE / ENTITY ADMIN | `user` · No · PROJECT ADMIN: No |
| MEMBRESÍAS | obra `1` + **obra de prueba** (añadida hoy para la evidencia de Reviews) |
| EMPRESA · FUNCIÓN | Sin empresa · sin función |
| ÚLTIMO USO | Hoy — **revisor de RV-002**, destinataria de TR-001 |
| POR QUÉ EXISTE | Sujeto de pruebas del propietario; hoy fue la mitad independiente de la evidencia de capa 10 |
| RIESGO | Confunde el padrón ante un tercero: dos cuentas de la misma persona. Y **es miembro de la obra real** sin ser una persona distinta |
| RECOMENDACIÓN TÉCNICA | Declararla cuenta de pruebas (renombrar cuando exista edición de perfil) **o** retirarla de la obra `1` dejándola solo en la de prueba. No nombrarla admin |
| **DECISIÓN DEL PROPIETARIO** | ✅ **RETIRADA DE LA OBRA 1, CONSERVADA EN LA DE PRUEBA · CUENTA 3/7 (22-ago-2026, ejecutada)** — `RETIRAR MEMBRESÍA ≠ RETIRAR IDENTIDAD`: la cuenta sigue activa y sus actos (RV-002, TR-001) atribuibles. Verificado en vivo con su propia sesión: obra real 200→**403 PROJECT_FORBIDDEN** al instante, obra de prueba 200, listado solo la de prueba. Queda como **CUENTA QA / EVIDENCIA**, alcance = obra de prueba exclusivamente; destino final junto con la 22 y la obra al cierre de estabilización. Asiento `membresia_retirada` en auth_events |

## id 20 · Zhang Wenqing — `zhangwenqing@powerchina.cn`

| | |
|---|---|
| ESTADO | Activa pero **INVITACIÓN PENDIENTE** (6-ago-2026, jamás reclamada) |
| ROLE / ENTITY ADMIN | `user` · No · PROJECT ADMIN: No |
| MEMBRESÍAS | obra `1` |
| EMPRESA · FUNCIÓN | **S&P** · sin función declarada |
| ÚLTIMO USO | **Nunca inició sesión** |
| POR QUÉ EXISTE | Contratista externo real — **la primera identidad genuinamente de tercero** de la plataforma |
| RIESGO | Ninguno técnico. El riesgo es de calendario: cuando llegue el piloto externo, esta invitación caducada será la primera fricción, y su alta es la primera prueba real de Identity & Access UX |
| RECOMENDACIÓN TÉCNICA | Decidir el **momento**. Mientras tanto, dejarla como está. Cuando toque: reemitir enlace y acompañar el alta; declarar su función contractual en la obra |
| **DECISIÓN DEL PROPIETARIO** | ✅ **PURGADA · BARRIDO FINAL (22-ago-2026, ejecutada)** — preflight: 0 en todo. Su incorporación real, si llega, será una **invitación nueva** con el flujo de Identity & Access mejorado — mejor primera experiencia que revivir un enlace muerto de agosto |

## id 21 · (Invitado pendiente) — `yaser.sanchez.h@uni.pe`

| | |
|---|---|
| ESTADO | **RETIRADA** (`is_active=false`, 22-ago) y pendiente |
| ROLE / ENTITY ADMIN | `user` · No · PROJECT ADMIN: No · **Sin membresías** |
| EMPRESA · FUNCIÓN | — |
| ÚLTIMO USO | Nunca |
| POR QUÉ EXISTE | Residuo de la ventana: su enlace se cerró sin copiar y no había forma de reemitirlo (defecto que se corrigió después, `556820a`) |
| RIESGO | Ninguno: tras G5a no es reclamable ni por enlace ni por Google |
| RECOMENDACIÓN TÉCNICA | **Purgar** («Eliminar invitación»): nunca fue reclamada, no hay rastro que conservar, y limpia el padrón |
| **DECISIÓN DEL PROPIETARIO** | ✅ **PURGADA (22-ago-2026) · CUENTA 1/7** — preflight sobre las 9 FK reales de `users` + 8 referencias por texto: todo cero. Los 4 `auth_events` sobreviven (`auth_events` no tiene FK a `users`) y registran acciones *sobre* la cuenta, no *de* ella. Ejecutada como purga humana explícita, con el asiento `usuario_borrado` escrito ANTES del DELETE para que sobreviviera a la fila. Verificado: 0 filas, correo libre, 0 huérfanos, integridad intacta |

## id 22 · YASER HUAMANI — `omarsanchezh8+prueba1@gmail.com`

| | |
|---|---|
| ESTADO | Activa · reclamada (22-ago) |
| ROLE / ENTITY ADMIN | `user` · No |
| MEMBRESÍAS | **obra de prueba [PROJECT ADMIN]** — y de nada más |
| EMPRESA · FUNCIÓN | **SINOHYDRO** · sin función declarada |
| ÚLTIMO USO | Hoy — autor de RV-002 |
| POR QUÉ EXISTE | Usuario de prueba nº 1: aportó **toda** la evidencia EXP de la ventana (409/404/400/200, RFI-001, RL-001, TR-001, RV-002) |
| RIESGO | Ninguno: su autoridad muere con la obra de prueba, y no toca el expediente real |
| RECOMENDACIÓN TÉCNICA | **Conservar mientras dure la estabilización.** Su retirada va atada a la decisión sobre la obra de prueba, post-estabilización |
| **DECISIÓN DEL PROPIETARIO** | ✅ **CONSERVAR TEMPORALMENTE · CUENTA 2/7** — activa, miembro y Project Admin **solo** de la obra de prueba, sin Entity Admin ni acceso a PQT8_TALARA. No se toca empresa, función, membresías ni privilegios durante la estabilización salvo que lo exija una prueba congelada. **REVISIÓN: al cerrar Production Stabilization**, junto con la obra de prueba (A: entorno permanente de QA · B: archivar y retirar · C: otro tratamiento justificado). **No decidido todavía si será cuenta permanente de QA.** Si algún día se retira: **NUNCA purgar** — tiene actividad probatoria material |

---

**No hay más identidades.** Las que aparecen en el rastro antiguo («Admin»,
«ADMIN», «Antigravity Diagnostic», «cli-omar», 315 asientos sin autor) son texto
histórico de `activity_log` anterior a la identidad numérica: no son cuentas
vivas y, por la regla de los históricos, **no se reconstruyen ni se reatribuyen**.

---

# ADJUDICACIÓN CERRADA — RESULTADO FINAL (22-ago-2026)

```
PADRÓN: 4 cuentas, todas bajo control del propietario
  id 2  · omarsanchezh8@gmail.com          Entity Admin · 2FA · activa
  id 17 · fabian230209@gmail.com           DESACTIVADA (identidad conservada)
  id 19 · yaseromarsanchez8@gmail.com      QA/evidencia · obra de prueba
  id 22 · omarsanchezh8+prueba1@gmail.com  QA/evidencia · admin de la obra de prueba

OBRAS
  PQT8_TALARA ......... 0 miembros — la administra el Entity Admin
  obra de prueba ...... 19 (miembro) + 22 (admin)

PURGADAS: 21 (uni.pe) · 18 (Walter) · 20 (Zhang) — cero actividad las tres
ENTITY ADMIN: id 2, único; emergencia cerrada; 2º custodio = gate pre-piloto
PROJECT ADMIN OBRA REAL: nadie — Decisión B revocada; se reabre cuando el
  proyecto incorpore participantes reales, con Identity & Access mejorado
```

Verificado tras el barrido: 0 huérfanos en las 4 tablas con FK · integridad
intacta (26 RFIs · 34 RL · 2 transmittals · 2854 versiones) · salud ok 6/6.
Cada acto con su asiento en `auth_events`, escrito ANTES de ejecutar.

---

# NOTA DE ESTADO — fijada por el propietario al aceptar el cierre (22-ago-2026)

```
PQT8_TALARA con 0 miembros
  = estado TRANSITORIO de estabilización
  ≠ diseño objetivo ACC/Procore
```

Cuando se incorporen participantes reales, **no se resolverá dando más alcance
al Entity Admin**. Se usará la cadena definida, en su orden:

```
IDENTITY → PROJECT MEMBERSHIP → COMPANY → CONTRACTUAL FUNCTION
        → PROJECT ADMIN si corresponde → RESOURCE PERMISSION
```

Las siete adjudicaciones quedan **CONGELADAS**: no se reabren salvo nueva
evidencia. Toda incorporación futura (Walter, Zhang u otros) será **invitación
nueva**, nunca reactivación de vínculos antiguos.
