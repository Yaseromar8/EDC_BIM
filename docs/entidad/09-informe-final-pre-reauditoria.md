# INFORME FINAL PRE-REAUDITORÍA

**Fecha:** 13-ago-2026
**Baseline:** `05-auditoria-estado-actual-2026-08-12.md` (12-ago-2026), congelado y sin modificar.
**Alcance:** ECD Vision — backend Flask + PostgreSQL (Cloud SQL) + Google Cloud Storage,
frontales visor y portal, desplegado en Render.
**Autoría:** trabajo técnico ejecutado por el asistente bajo mandato del propietario.
Este informe **no** es una certificación ni una declaración de conformidad.

---

## 1. Estado ejecutivo

Qué cambió desde el 12/08/2026:

| | 12-ago (baseline) | 13-ago (hoy) |
|---|---|---|
| Credencial de la base | publicada en 2 repositorios públicos y **vigente** | rotada; la publicada **rechazada por el servidor**, con evidencia |
| Esquema | 237 sentencias DDL en caliente, 8 en caminos HTTP | interruptor `DDL_EN_CALIENTE` + `bootstrap_esquema.py`; arranque local **0,0 s / 0 DDL** |
| Registro de actividad | mutable; 552 UPDATE y 2 DELETE ya ocurridos | encadenado por huellas: alterarlo **se detecta** |
| Integridad de ficheros | sin huella de contenido | `sha256` por versión, sellada en las dos vías de subida |
| Segundo factor | no existía | TOTP completo, con códigos de recuperación y pantalla de acceso |
| Aislamiento entre obras | guardias sueltas | 21 guardias + hueco real de subida cerrado + **prueba permanente** sobre 222 rutas |
| Guiones con credenciales | 7 ficheros con host y contraseña de producción, versionados | retirados y vetados |
| Conciliación con el almacén | un guion que **borraba** lo que no estaba en 2 de 8 columnas | conciliador que mira las dos direcciones y **no borra** |
| Pruebas | 371 | **482** |

Cifras: **37 commits** desde el estado desplegado el 9-ago, 149 ficheros tocados.
**31 de esos commits están en producción** desde el 13-ago 13:50 UTC; los **6 últimos no**.

Lo que **no** cambió, y hay que decirlo primero: la aplicación sigue conectándose a la base
como dueña de las 87 tablas, la entidad sigue sin poder administrar lo suyo sin el proveedor,
y **no hay copia de los ficheros**.

---

## 2. Hallazgos originales

| ID | Hallazgo baseline | Estado final | Evidencia | Riesgo residual |
|---|---|---|---|---|
| **C1** | Credencial dueña de la base publicada y vigente | **MITIGADO** | rotación 13-ago 11:48 UTC; la contraseña publicada, leída literalmente del fichero publicado, fue **rechazada** por el servidor a las 11:51:31 UTC. `evidencias/revocacion-postgres-20260813-1151.txt` (guarda solo huella truncada, nunca el valor). Guiones de separación `ecd_app`/`ecd_migrator` escritos, con su inverso, y **canario en producción 14/14** dentro de una transacción revertida | **Alto.** La credencial nueva sigue siendo la de un rol dueño de 87 tablas y miembro de `cloudsqlsuperuser`. La separación **no se ha ejecutado**: depende de decisión y ventana del propietario |
| **C2** | Lo corregido no está en producción | **MITIGADO** | 31 commits desplegados 13-ago 13:50 UTC (`9e7fb24` → `9f207ce`); humo verde en `/api/health`, `/api/companies`, `/api/job_titles`; `/api/docs/list` sin sesión → 401. `evidencias/despliegue-20260813-1350.txt` | **Medio.** Falta el acuse del panel de Render (pestaña *Events*) y hay **6 commits nuevos sin desplegar** |
| **C3** | El registro de auditoría es mutable y ya fue alterado | **MITIGADO** | `auditoria_encadenada.py`: cada fila lleva la huella de la anterior. Prueba negativa: reescribir el autor da `huella no coincide`; borrar una fila da `eslabón roto`. Causa raíz medida: 7 puntos de inserción y **0 de modificación** en la aplicación — los 552 UPDATE vinieron de guiones de mantenimiento con la credencial de superusuario (ver N15) | **Alto.** **Detecta, no impide.** Impedirlo exige C1. Las 552 modificaciones anteriores quedan fuera de la cadena y **no se pueden reconstruir** |
| **C4** | No existe administrador de entidad; el proveedor tiene privilegio total | **ABIERTO** | sin cambios: `users.role` es global, no hay concepto de entidad | **Alto.** Es una decisión de modelo institucional, no una tarea técnica: ver §12 |
| **C5** | El proveedor abre los documentos por fuera de la aplicación | **ABIERTO** | la clave de servicio `gcp_sa.json` sigue existiendo y sigue teniendo acceso al bucket | **Alto.** Mitigación parcial: el entorno de desarrollo ya **no** puede usarla (N18). En producción el proveedor sigue pudiendo |
| **C6** | No se puede demostrar que un fichero es el que se aprobó | **MITIGADO** | `integridad.py` + `file_versions.sha256` + `huella_en`; sellado en subida directa y troceada; la promoción de versión arrastra la huella; nunca se sobrescribe una huella existente | **Medio.** **Las versiones anteriores al cambio no tienen huella** y el repaso hacia atrás no se ha ejecutado |
| **C7** | No hay copia de los ficheros; la mayoría de los bytes no los conoce nadie | **ABIERTO** | 721 objetos / 3,95 GB sin correspondencia. Hecho: `conciliacion_almacen.py` cruza las 8 columnas que apuntan a objetos, en las dos direcciones, sin borrar | **Crítico.** **No hay copia del bucket.** Un borrado accidental o malicioso es definitivo |
| **C8** | El aislamiento entre obras depende de guardias a mano | **MITIGADO** | 21 guardias corregidos, 9 prefijos vigilados, fuga de bytes cerrada; `complete_upload` aceptaba subir a **una obra ajena** y ahora comprueba acceso; barrido de las 222 rutas convertido en **prueba permanente** con 15 excepciones escritas una a una | **Alto.** `ENFORCE_PROJECT_AUTHZ` sigue **apagado** en producción: el control central registra pero no bloquea |
| **C9** | Sin segundo factor sobre la cuenta que puede destruir el expediente | **MITIGADO** | TOTP RFC 6238 verificado contra los **5 vectores oficiales**; ciclo alta/canje/baja; 8 códigos de recuperación de un solo uso, hasheados; pantalla en el acceso y panel en el portal; 37 pruebas | **Alto.** **Nadie lo tiene activado todavía** y `EXIGIR_2FA_ESTRICTO` está apagado. Un control que nadie usa no protege |

---

## 3. Hallazgos nuevos encontrados durante el saneamiento

| ID | Hallazgo | Estado | Nota |
|---|---|---|---|
| **N1** | `render.yaml` no gobierna el despliegue: declara otro servicio y otros comandos | CERRADO *(documentado)* | servicio real `visor-ecd-backend`, build `yarn`, start `yarn start` |
| **N2** | Alembic **nunca** se ejecuta en producción | ABIERTO | el esquema lo construía únicamente el DDL en caliente |
| **N3** | `SESSION_PEPPER` y `APP_SECRET` no existen en producción | ABIERTO | la pimienta efectiva es la constante pública `'sin-pimienta'` |
| **N4** | CORS abierto (`*`) en producción | ABIERTO | falta `CORS_ORIGINS` |
| **N5** | El entorno local podía escribir en el bucket de producción | CERRADO *(tras un cierre falso)* | ver N18: el primer cierre fue mío y era incorrecto |
| **N6** | DDL en caliente en 237 sentencias, 8 en caminos HTTP | MITIGADO | interruptor + bootstrap; falta encenderlo en producción |
| **N7** | `CREATE TABLE sessions` en **cada login** | MITIGADO | condicionado al interruptor |
| **N8** | Cloud SQL aplica política de contraseñas por SQL | CERRADO | incorporado al guion |
| **N9** | Las 34 secuencias son dependientes: su propiedad viaja con la tabla | CERRADO | guion corregido |
| **N10** | PostgreSQL 16+ exige ser miembro del rol destino para ceder propiedad | CERRADO | guion corregido |
| **N11** | El schema `public` es de `pg_database_owner` | CERRADO | orden correcto demostrado 14/14 |
| **N12** | La cuarentena de nomenclatura mentía sobre 51 de 52 documentos | CERRADO | recalculado en producción |
| **N13** | El recolector de fotos huérfanas no borraba nada **y lo apuntaba igual** | CERRADO | el registro afirmaba borrados que nunca ocurrieron |
| **N14** | `fix_documents.py` reintroducía los 18 guardias flojos | CERRADO | borrado y vetado |
| **N15** | 7 guiones de mantenimiento con host y contraseña de **producción** dentro, 2 capaces de borrar filas | CERRADO | son el camino por el que se pudo alterar la auditoría sin pasar por la aplicación |
| **N16** | La IP pública de la base viajaba en la documentación | CERRADO | enmascarada |
| **N17** | `reconcile_storage.py` **borraba** del bucket todo lo que no estuviera en 2 de las 8 columnas | CERRADO | con `--force` habría borrado **todas las fotografías de obra** |
| **N18** | `routes/ai.py` ponía la clave de servicio en `GOOGLE_APPLICATION_CREDENTIALS`, variable de **todo el proceso** | CERRADO | anulaba el aislamiento del entorno local; **invalidaba mi cierre de N5** |

Los cuatro últimos (N15, N17, N18 y el segundo defecto de N13) tienen algo en común y conviene
decirlo: **no eran fallos de la aplicación, eran herramientas alrededor de ella**. Guiones con
credenciales, recolectores que borraban de más, módulos que repartían permisos al resto del
proceso. Una auditoría que solo mire las rutas HTTP no los encuentra.

---

## 4. Cambios arquitectónicos realizados

Solo lo que está implementado y probado:

1. **El esquema deja de construirse solo.** `esquema_congelado.py` (interruptor `DDL_EN_CALIENTE`,
   decorador `@solo_con_ddl`, contexto `permitir_ddl()`) + `bootstrap_esquema.py`, que levanta las
   87 tablas de una base vacía en 3,1 s con 0 fallos. Por defecto el interruptor queda **encendido**,
   para no cambiar nada donde no se ha probado.
2. **Cadena de integridad en la auditoría.** `auditoria_encadenada.py`, con cerrojo consultivo para
   que dos escrituras simultáneas no rompan la cadena, y `verificar()` que devuelve
   revisadas / sin sellar / roturas.
3. **Huella de contenido por versión.** `integridad.py`, con sellado también desde el almacén para
   las subidas troceadas, donde el backend nunca ve los bytes.
4. **Segundo factor.** `segundo_factor.py` (TOTP sin dependencia nueva) + cuatro endpoints + UI.
5. **Conciliación base↔almacén.** `conciliacion_almacen.py`, que se **niega a correr** si aparece
   una columna nueva que apunta a objetos y no está declarada.
6. **Separación de identidades, preparada.** `sql/01..04` — 124 `ALTER … OWNER` explícitos, sin
   `REASSIGN OWNED` (se llevaría las 37 funciones de pgcrypto), con guion inverso para cada uno.
7. **Separación de entornos.** El desarrollo local no puede escribir en la base ni en el bucket de
   producción. Comprobado **importando la aplicación entera**, no con un guion suelto.

No se ha añadido ninguna función comercial durante este trabajo.

---

## 5. Seguridad — estado real

**Lo que hay:** contraseñas con `scrypt`; sesiones hasheadas con pimienta; límite de intentos;
enlaces firmados con propósito y caducidad separados por sal; política de contraseñas; segundo
factor; 251 endpoints con política declarada; registro de eventos de acceso.

**Lo que falta, y es lo que decide:**

- `APP_SECRET` y `SESSION_PEPPER` **no existen en producción**. Sin ellos la pimienta efectiva es una
  constante pública. Esto no lo arregla el código: es una variable de entorno que hay que poner.
- `CORS_ORIGINS` **no existe en producción**: CORS abierto.
- `ENFORCE_PROJECT_AUTHZ` **apagado**: el control central de obra observa y no bloquea.
- El segundo factor **no lo tiene activado nadie**.
- La aplicación se conecta a la base como **dueña de todas las tablas**.

Con ese cuadro, la frase honesta es: *la superficie de ataque de la aplicación se ha reducido mucho;
la de la infraestructura, casi nada.*

---

## 6. Trazabilidad e integridad — estado real

- Cada entrada nueva del registro de actividad va encadenada. **Alterar el pasado se detecta.**
- Cada versión nueva de fichero lleva su `sha256`. **Se puede demostrar que un PDF es el que se aprobó**
  — desde el 13-ago, no antes.
- Estados del ECD unificados (WIP/SHARED/PUBLISHED/ARCHIVED) con puerta única de transición y
  auditoría por documento; código de idoneidad, revisión formal y fecha de aprobación.
- **Lo que no se puede:** reconstruir las 552 modificaciones anteriores, ni saber quién borró
  `auth_events` 6 y 7. No había auditoría de la base en ese momento y **no es recuperable**.

---

## 7. Continuidad y recuperación — estado real

- **Base de datos:** `copia_de_seguridad.py` y `restaurar.py`, con el procedimiento escrito para
  correrlo en frío. Hoy se ha corregido el paso 2 del procedimiento, que había quedado obsoleto al
  congelar el DDL: ya no basta con arrancar el backend, hay que ejecutar `bootstrap_esquema.py`.
  Seguir el guion antiguo habría dejado la restauración a medias **sin decir nada**.
- **Ficheros:** **no hay copia.** Ni versionado del bucket, ni réplica. Es el riesgo más grave que
  queda abierto y no se puede cerrar desde el código.
- **Secretos:** una restauración sin `APP_SECRET` y `SESSION_PEPPER` arranca pero no sirve. Está
  escrito en el procedimiento.
- **Copias de Cloud SQL:** no verificadas (requiere consola).

---

## 8. Soberanía y multi-entidad — estado real

Sin cambios respecto al baseline, y conviene no adornarlo:

- No existe el concepto de **entidad**. `users.role` es global.
- El administrador del proveedor puede hacer todo en todas las obras.
- La entidad **no puede** revocarle el acceso, ni auditarlo por su cuenta, ni exportar su expediente
  sin el proveedor — salvo por `indice_expediente.py`, que sí permite sacar en una tabla todo lo
  entregado y salir del ECD.
- La clave de servicio de Google da acceso al bucket por fuera de la aplicación.

Esto no es un fallo que se arregle con una tarde de código: es un **modelo de titularidad**. Ver §12.

---

## 9. ECD / gestión de información — estado real

- Vocabulario de estados unificado y con puerta única de transición.
- Nomenclatura calibrada contra la obra real (antes mandaba 2.828 de 2.831 documentos a cuarentena)
  y con recálculo al cambiar la convención.
- Idoneidad, revisión formal y fecha de aprobación por documento.
- Triaje de seguridad ISO 19650-5 y sensibilidad por documento.
- Flujos de revisión, transmittals, entregas apuntando a la **versión** y no al documento.
- Índice de expediente exportable.

Es la parte más madura del sistema. También es la que menos sirve si la infraestructura cede.

---

## 10. Producción

| | |
|---|---|
| Servicio | `visor-ecd-backend` (Render), repo `Yaseromar8/EDC_BIM`, rama `main`, raíz `backend` |
| Build / start | `yarn` / `yarn start` → gunicorn 1 worker, 4 hilos |
| Commit desplegado | **`9f207ce`**, 13-ago-2026 13:50 UTC (31 commits desde `9e7fb24` del 9-ago) |
| Commit local | `256dfbe` — **6 commits por delante de producción** |
| Verificación post-despliegue | `/api/health` 200 · `/api/companies` 200 con datos reales · `/api/job_titles` 200 · `/api/docs/list` sin sesión → 401 · login falso → 401 |
| Pendiente de confirmar | que el panel de Render muestre `9f207ce` como *Live* |
| Variables ausentes | `APP_SECRET`, `SESSION_PEPPER`, `CORS_ORIGINS`, `DDL_EN_CALIENTE`, `ENFORCE_PROJECT_AUTHZ`, `AUTH_POLICY_MODE` |
| Correo | sin `RESEND_API_KEY`: **no se envían correos** (invitaciones y restablecimientos no llegan) |

Las seis variables nuevas se eligieron para que **su ausencia signifique “compórtate como hoy”**.
Por eso el despliegue no cambió el comportamiento, y por eso tampoco mejoró nada todavía.

---

## 11. Evidencias

- **482 pruebas** en verde (`pytest`, ~105 s). Eran 371 el 12-ago.
- **Pruebas negativas concretas**, no de cortesía:
  - reescribir un autor en el registro → `huella no coincide`; borrar una fila → `eslabón roto`;
  - la contraseña publicada → rechazada por el servidor;
  - la contraseña correcta **sin** segundo factor → no da sesión y **no** se anota `login_ok`;
  - un código de recuperación usado dos veces → la segunda falla;
  - tener la sesión abierta **no** basta para quitarse el segundo factor;
  - un token de otro propósito no sirve de desafío del segundo factor;
  - tras importar la aplicación entera, el acceso al almacén de producción falla con
    `DefaultCredentialsError`;
  - las fotografías de obra **no** salen como huérfanas en la conciliación.
- **Vectores oficiales RFC 6238** (5/5) para TOTP: garantiza que un autenticador real genera el
  mismo código.
- **Canario en producción**: 14/14 operaciones representativas (tabla, secuencia, función,
  privilegios) dentro de una transacción **revertida**, sin dejar rastro. Descubrió 4 defectos
  propios de Cloud SQL que un guion “correcto” en papel no habría superado.
- **Bootstrap**: 87 tablas desde base vacía, 0 fallos, 3,1 s.
- **Arranque local con DDL congelado**: 0,0 s, 0 sentencias DDL, 255 rutas, 251 endpoints con
  política.
- **Los dos frontales compilan** (vite build).
- Ficheros: `evidencias/revocacion-postgres-20260813-1151.txt`,
  `evidencias/pre-despliegue-20260813-1332.txt`, `evidencias/despliegue-20260813-1350.txt`.

---

## 12. Pendientes externos

**Del propietario, en el panel de Render** (5 minutos, cierra N3, N4 y parte de C8):

1. `APP_SECRET` y `SESSION_PEPPER` — valores largos y aleatorios, generados fuera de esta
   conversación y **no compartidos por chat**. Ojo: cambiar `SESSION_PEPPER` invalida las sesiones
   abiertas; se hace cuando no haya nadie trabajando.
2. `CORS_ORIGINS` — la lista de los dominios propios.
3. `DDL_EN_CALIENTE=false` — después de haber ejecutado el bootstrap contra la base de producción.
4. `ENFORCE_PROJECT_AUTHZ=true` — **después** de comprobar en el registro que no hay peticiones
   legítimas cayendo en el modo sombra.
5. Confirmar en *Events* que sirve `9f207ce`, y desplegar los 6 commits nuevos.

**Del propietario, decisión + ventana** (cierra C1):

6. Ejecutar la separación `ecd_app` / `ecd_migrator`. Los guiones están escritos, con su inverso, y
   el canario pasó 14/14 en producción. Es una operación irreversible sobre la base y **no la ejecuto
   sin autorización explícita**.

**Del proveedor de nube — consola de Google** (cierra C7 y parte de C5):

7. **Versionado y copia del bucket.** Es el pendiente más grave del informe.
8. Revisar IAM del bucket y del proyecto; limitar la cuenta de servicio a lo mínimo.
9. Activar registros de acceso a datos de Cloud Storage.
10. Comprobar copias automáticas de Cloud SQL, redes autorizadas y cifrado en reposo.
11. Retención de registros de Render y Cloud Logging.

**Decisión empresarial / de modelo** (bloquea C4):

12. **¿Cómo se reparte el poder entre entidad y proveedor?** Hay al menos tres caminos —
    administrador de entidad dentro del mismo sistema; instancia por entidad; entrega llave en mano
    con el proveedor fuera. Cada uno cambia el esquema, el precio y el contrato. **No es una decisión
    que deba tomar yo**, y por eso C4 sigue abierto: no lo he construido a ciegas.

**Terceros:**

13. Pentest externo y auditoría independiente. Nada de este informe los sustituye.
14. Revisión legal del aviso de privacidad y del contrato (Ley 29733), especialmente por el **GPS en
    el EXIF de las fotos**: 6 de 6 muestreadas lo llevan dentro del JPEG.

---

## 13. Riesgo residual conocido

Sin adornos, ordenado por lo que más duele:

1. **No hay copia de los ficheros.** Si el bucket se borra, el expediente desaparece. Todo lo demás
   de este informe es secundario frente a esto.
2. **La aplicación es dueña de la base.** Quien comprometa la aplicación puede alterar el esquema y
   el pasado. La cadena de auditoría lo *detecta*; no lo *impide*.
3. **El proveedor lo puede todo.** Sin administrador de entidad, la separación entre quien opera y
   quien es dueño del expediente es una promesa, no un control.
4. **Producción sigue sin los secretos.** Mientras `APP_SECRET` y `SESSION_PEPPER` no existan allí,
   parte de lo construido no protege nada en el sitio donde importa.
5. **El segundo factor no lo usa nadie.** Está listo; hasta que alguien lo active, C9 sigue siendo
   riesgo real.
6. **Lo anterior al 13-ago no tiene huella.** Documentos aprobados antes de hoy no se pueden
   demostrar por contenido.
7. **552 modificaciones del registro son irrecuperables**, y quién borró `auth_events` 6 y 7 no se
   sabrá nunca.
8. **6 commits sin desplegar**, incluidos el segundo factor y el cierre del hueco de subida.
9. **El GPS viaja dentro de las fotos.** Es dato personal y hoy sale del sistema con la foto.
10. **Los secretos siguen en el historial de git.** Rotados, sí; presentes, también. Limpiar el
    historial es una operación con consecuencias (reescribe todos los commits) y no la he hecho por
    mi cuenta.

---

## 14. Declaración final

**¿Está el proyecto listo para una nueva auditoría independiente?**

# NO

Y el motivo no es que falte trabajo técnico que yo pueda hacer. Es este:

> Un auditor que mire **producción** hoy encontrará, con razón, CORS abierto, la pimienta de
> sesiones en su valor público, el control de obra en modo observación, ningún segundo factor
> activo y ninguna copia de los ficheros. Nada de eso se arregla desde el código: son cinco
> variables de entorno, una operación autorizada sobre la base y una configuración en la consola
> de Google.

Los bloqueos que quedan dependen **exclusivamente de decisiones y accesos del propietario y del
proveedor de nube**, enumerados uno a uno en §12. Cuando los puntos 1–7 de esa lista estén hechos,
la respuesta pasa a **SÍ** para todo salvo C4, que seguirá abierto hasta que se decida el modelo de
titularidad.

Lo que sí puedo afirmar, con la evidencia de §11 detrás:

> **La aplicación está técnicamente en condiciones mucho mejores que el 12-ago-2026, y lo que
> queda abierto está identificado, medido y escrito — no oculto.**

No me autodeclaro certificado, ni conforme a ninguna ISO, ni conforme a Plan BIM Perú. La auditoría
posterior debe hacerse desde cero y no dar por buena ninguna conclusión de este documento.
