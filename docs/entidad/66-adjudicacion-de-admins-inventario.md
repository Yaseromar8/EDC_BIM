# PASO 14 · ADJUDICACIÓN DE ADMINS — INVENTARIO PARA DECISIÓN

**Preparado el 22-ago-2026 durante PRODUCTION STABILIZATION. No se ha cambiado
ninguna cuenta.** Cada fila termina en `DECISIÓN DEL PROPIETARIO: [vacío]` — la
decisión es humana, cuenta por cuenta, y la ejecuta quien decide.

Contexto de autoridad hoy: **1 solo Entity Admin** (custodio de la instancia) y
**la obra real (`1` · PQT8_TALARA) sin ningún Project Admin nombrado** — toda su
administración recae en el Entity Admin. La pregunta central del paso es esa:
¿quién administra la obra real?

---

## CUENTA 2 · omarsanchezh8@gmail.com («Yaser Omar»)

| | |
|---|---|
| ESTADO ACTUAL | Activa, reclamada, **2FA activo** (única cuenta con TOTP) |
| ENTITY ADMIN | **SÍ** (la única) |
| MEMBRESÍAS | Ninguna (el Entity Admin no la necesita: alcance global) |
| PROJECT ADMIN | — |
| INVITACIÓN | Reclamada (alta 22-feb-2026) |
| USO REAL | Diario; 258 asientos como correo + 457 como «Yaser Omar» (asientos antiguos por nombre); último acceso hoy |
| RIESGO DE DEJARLA ASÍ | **Punto único de administración**: si esta cuenta se pierde, la entidad queda sin custodio (recuperarla exigiría intervención en BD). Ante un tercero, «¿quién pudo ver esto?» = esta cuenta, acotado ✓ |
| RECOMENDACIÓN TÉCNICA | Conservar como Entity Admin. Decidir **sucesión**: o un segundo Entity Admin de confianza, o el procedimiento de emergencia documentado (restaurador de BD). No nombrarla Project Admin de nada — ya lo alcanza todo |
| **DECISIÓN DEL PROPIETARIO** | [vacío] |

## CUENTA 17 · fabian230209@gmail.com («Fabian Serrano»)

| | |
|---|---|
| ESTADO ACTUAL | Activa, reclamada, sin 2FA |
| ENTITY ADMIN | No |
| MEMBRESÍAS | **obra 1 (PQT8_TALARA)** + PQT8_INTERFERENCIAS |
| PROJECT ADMIN | No (fue nombrado y retirado en 4 s durante la ventana, como prueba tuya; revertido) |
| INVITACIÓN | Reclamada (13-may-2026) |
| USO REAL | Real y reciente (último acceso 20-ago) — la única persona ajena a ti con uso sostenido |
| RIESGO DE DEJARLA ASÍ | Ninguno nuevo. Si la obra real necesita un administrador que no seas tú, es el único candidato con historial |
| RECOMENDACIÓN TÉCNICA | **Candidato natural a Project Admin de la obra 1** si quieres delegar su administración (decisión de confianza, no técnica). Si se nombra: pedirle 2FA |
| **DECISIÓN DEL PROPIETARIO** | [vacío] |

## CUENTA 18 · walterdavidcorreamorocho79@gmail.com

| | |
|---|---|
| ESTADO ACTUAL | Activa pero **PENDIENTE** (invitación del 24-jul jamás reclamada, hash vacío) |
| ENTITY ADMIN | No · PROJECT ADMIN | No |
| MEMBRESÍAS | obra 1 (asignada sin haber entrado nunca) |
| USO REAL | **Cero** — nunca inició sesión |
| RIESGO DE DEJARLA ASÍ | Bajo (tras el cierre G5a una pendiente retirada ya no es reclamable; esta sigue activa y su enlace de 14 días **ya caducó** — hoy nadie puede reclamarla sin reemisión) |
| RECOMENDACIÓN TÉCNICA | Decidir si Walter sigue siendo parte del proyecto: **si sí → reemitir enlace** (botón «Copiar enlace» ya existe); **si no → retirar** (desactivar; el rastro se conserva) |
| **DECISIÓN DEL PROPIETARIO** | [vacío] |

## CUENTA 19 · yaseromarsanchez8@gmail.com («yaser omar 02»)

| | |
|---|---|
| ESTADO ACTUAL | Activa, reclamada, sin 2FA — **tu segunda cuenta** |
| ENTITY ADMIN | No · PROJECT ADMIN | No |
| MEMBRESÍAS | obra 1 |
| USO REAL | Como sujeto de pruebas tuyas (últ. acceso 20-ago); destinataria del TR-001 de prueba |
| RIESGO DE DEJARLA ASÍ | Confunde el padrón ante un tercero (dos cuentas de la misma persona con roles distintos) |
| RECOMENDACIÓN TÉCNICA | Conservarla **declarada como cuenta de pruebas del propietario** (renombrar a algo inequívoco cuando exista edición de perfil), o retirarla si ya no la usas. No nombrarla admin de nada |
| **DECISIÓN DEL PROPIETARIO** | [vacío] |

## CUENTA 20 · zhangwenqing@powerchina.cn

| | |
|---|---|
| ESTADO ACTUAL | Activa pero **PENDIENTE** (invitación del 6-ago, jamás reclamada; enlace caducado) |
| ENTITY ADMIN | No · PROJECT ADMIN | No |
| MEMBRESÍAS | obra 1 |
| USO REAL | **Cero** — y es el contratista externo real (SINOHYDRO/PowerChina): la primera identidad genuinamente de tercero |
| RIESGO DE DEJARLA ASÍ | El del olvido: cuando llegue el piloto, esta invitación caducada será la primera fricción |
| RECOMENDACIÓN TÉCNICA | Decidir el MOMENTO de incorporar al contratista (¿pre-piloto?). Cuando toque: reemitir enlace y acompañar el alta. Mientras: dejarla como está |
| **DECISIÓN DEL PROPIETARIO** | [vacío] |

## CUENTA 21 · yaser.sanchez.h@uni.pe

| | |
|---|---|
| ESTADO ACTUAL | **RETIRADA** (desactivada el 22-ago tras perderse su enlace sin copiar) y PENDIENTE |
| USO REAL | Cero; residuo de la ventana |
| RIESGO DE DEJARLA ASÍ | Ninguno (tras G5a, una retirada no es reclamable ni entra por Google) |
| RECOMENDACIÓN TÉCNICA | **Purgar** («Eliminar invitación» — nunca fue reclamada, no hay rastro que conservar) para limpiar el padrón |
| **DECISIÓN DEL PROPIETARIO** | [vacío] |

## CUENTA 22 · omarsanchezh8+prueba1@gmail.com («YASER HUAMANI»)

| | |
|---|---|
| ESTADO ACTUAL | Activa, reclamada hoy — usuario de prueba nº 1 de la ventana |
| ENTITY ADMIN | No |
| MEMBRESÍAS | **obra de prueba [ADMIN]** — Project Admin de ZZ PRUEBA VENTANA, y de nada más |
| USO REAL | Toda la evidencia EXP de la ventana (409/404/400/200, RFI-001, RL-001, TR-001) |
| RIESGO DE DEJARLA ASÍ | Ninguno mientras exista la obra de prueba; su alcance muere con ella |
| RECOMENDACIÓN TÉCNICA | **Conservar mientras dure la estabilización** (aún debe la evidencia Reviews de capa 10). Su retirada va atada a la decisión sobre la obra de prueba, post-estabilización |
| **DECISIÓN DEL PROPIETARIO** | [vacío] |

---

## LAS DOS DECISIONES QUE ORDENAN TODO LO DEMÁS

1. **¿Quién administra la obra 1 (PQT8_TALARA)?** Hoy: nadie salvo el Entity
   Admin. Opciones: tú mismo vía Entity (statu quo, válido), o nombrar a
   Fabián (17) Project Admin.
2. **¿Sucesión del Entity Admin?** Hoy es un punto único. Opciones: segundo
   Entity Admin de confianza, o documentar el procedimiento de emergencia y
   aceptar el riesgo con la copia diaria como respaldo.

*Identidades del rastro antiguas («Admin», «ADMIN», «Antigravity Diagnostic»,
«cli-omar», 315 asientos sin autor): son texto histórico en `activity_log`
anterior a la identidad numérica. No corresponden a cuentas vivas y, por la
regla de los históricos, no se reconstruyen ni se reatribuyen.*
