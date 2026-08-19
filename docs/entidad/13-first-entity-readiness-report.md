# FIRST ENTITY READINESS REPORT

**Fecha:** 19-ago-2026 · **Alcance:** portal documental (ECD) en instancia dedicada
**Pregunta:** ¿podemos entregar este ECD hoy a una entidad pública para un piloto
real sin exponerla a riesgos críticos conocidos?

**Cómo se produjo este informe:** levantando una instancia con la configuración
exacta de la guía de despliegue (perfil portal, `ENFORCE_PROJECT_AUTHZ=true`,
`AUTH_POLICY_MODE=estricto`, `DDL_EN_CALIENTE=false`, postura completa) y
recorriéndola como una municipalidad ficticia. **Cuatro bloqueantes aparecieron
ejecutando, con 781 pruebas en verde.** Ninguno se habría visto leyendo código.

---

## 1 · Revalidación del «mínimo para ofrecer»

Clasificación: **PL** probado y listo · **CFG** listo pero requiere configuración
al crear la entidad · **BLOQ** pendiente bloqueante · **NB** pendiente no bloqueante.

| # | elemento | estado | evidencia / qué falta |
|---|---|---|---|
| 1 | Perfil portal | **PL** | instancia arrancada: `[perfil] despliegue: portal`, 151 rutas frente a 270. `/api/lob`, `/api/compare`, `/api/inventory` → **404** medido. 4 candados, uno por comportamiento |
| 2 | Instancia dedicada por entidad | **CFG** | guía `11-…` verificada contra el código. La base y el bucket los crea el propietario: el usuario de aplicación **no tiene** `CREATEDB` ni `CREATE SCHEMA` — comprobado, y es la separación de identidades funcionando |
| 3 | Administrador institucional | **PL** | **era BLOQ hasta hoy.** Vivía dentro de la función gobernada por el interruptor de DDL: con `DDL_EN_CALIENTE=false` la instancia nacía con `faltan: 0` y **no podía entrar nadie**. Ahora `asegurar_administrador_inicial()` va fuera del interruptor; login del admin de la entidad verificado, rol `admin` |
| 4 | Gestión de usuarios y roles | **PL** | alta por invitación (HTTP 201 con enlace), cambio de rol desde la pantalla, último administrador protegido (probado), retirada de usuario. **Sin depender del proveedor** |
| 5 | Exportación completa del expediente | **PL** | índice xlsx descargado: **6.241 bytes**, HTTP 200. URLs de descarga masiva: HTTP 200. Candado que exige las dos puertas en el portal |
| 6 | Backup de base | **PL** | ejecutado hoy: **86 tablas, 78.034 filas, todas cuadran**. Comprobación interna en verde |
| 7 | Versionado/copia de archivos (bucket) | **BLOQ** | **el bucket NO tiene versionado ni copia.** C7 del baseline, abierto. La base se recupera; los **bytes de los documentos, no** |
| 8 | Restauración real | **CFG** | ciclo pérdida→recuperación→cotejo **medido y exacto** sobre datos ficticios: 15 documentos, huella `8a78968…` antes y después. Ensayo en seco del restaurador real: 86 tablas legibles. El ensayo *completo* (base virgen) exige la contraseña de `postgres` → acción del propietario |
| 9 | `APP_SECRET` | **CFG** | `Generate` en el panel. Verificado: sin él la clave de firma se deriva de la credencial de la base (N65) |
| 10 | `SESSION_PEPPER` | **CFG** | `Generate`. Ambas en el **mismo guardado**: definir una sola cambia la pimienta igual |
| 11 | CORS | **CFG** | medido por origen: los propios reconocidos, el ajeno **sin cabecera** |
| 12 | Autorización estricta | **PL** | instancia con `ENFORCE=true` y `estricto` desde el arranque. Anónimo → 401 en documentos y postura; token inventado → 401 |
| 13 | `APS_CLIENT_SECRET` | **CFG** | rotado y verificado contra Autodesk (N19). Decisión pendiente: credencial propia por entidad o común declarada en contrato |
| 14 | 2FA administrativo | **CFG** | flujo reparado y vivo (N64); la rotación ya no mata los códigos en silencio (N67). **Activarlo es paso 3 de la guía**, manual |
| 15 | IAM | **NB** | cuenta de servicio acotada **al bucket de la entidad** (guía, paso 2). Restricción adicional por IAM condicional: pendiente, declarada |
| 16 | Acceso técnico del proveedor | **PL** (declarado) | escrito en la plantilla contractual §4, sin negarlo: es quien opera |
| 17 | Integridad/versionado/aprobación | **PL** | huella SHA-256 por versión; historial consultado; trazabilidad HTTP 200; cadena de auditoría encadenada (C3) |
| 18 | Flujo documental ECD | **PL** | árbol con las cinco carpetas del ciclo, 4 carpetas y documentos legibles; **13 asientos** de actividad; puerta única de estados con código de idoneidad |
| 19 | Portabilidad y salida | **PL** | punto 5 + cláusula §6 del anexo: exportar en cualquier momento, entrega y borrado al terminar |

**Resumen:** 11 PL · 7 CFG · **1 BLOQ** · 1 NB.

---

## 2 · Simulacro de primera entidad — qué se recorrió

Municipalidad Distrital de San Marcos (ficticia), instancia en perfil portal.

| tramo | resultado |
|---|---|
| aprovisionar instancia | **PASA** — `configuracion: {completa: true, faltan: 0, puntos: 7}` |
| crear administrador institucional | **PASA** — creado desde `ADMIN_EMAIL` |
| login | **PASA** — rol `admin` |
| activar seguridad requerida | **CFG** — 2FA es paso manual de la guía |
| crear usuarios / asignar roles | **PASA** — invitación 201, cambio de rol, auto-degradación bloqueada |
| crear obra / cargar información | **PARCIAL** — obra y árbol sí; **subir bytes NO se probó**: escribiría en el bucket real |
| abrir PDF | **PARCIAL** — ver §6 |
| versionar / revisar / aprobar-emitir | **PASA** — historial, trazabilidad y puerta de estados |
| descargar | **PASA** — índice xlsx real descargado |
| registrar actividad | **PASA** — 13 asientos |
| exportar expediente | **PASA** — índice + URLs masivas |
| backup | **PASA** — 86 tablas / 78.034 filas |
| pérdida controlada → restauración → cotejo | **PASA** — recuperación **exacta** por huella |
| revocar usuario → confirmar sin acceso | **PASA** — cierre de sesión invalida el token (401) |

---

## 3 · Escenarios adversarios

| escenario | resultado |
|---|---|
| contraseña incorrecta | 401 |
| token inventado | 401 |
| documento por id sin sesión | 401 |
| enlace de lectura falso/caducado | **403 diciendo la causa** («enlace caducado»), no un genérico |
| sesión tras cerrar sesión | 401 |
| rutas del visor en perfil portal | **404** |
| publicar sin código de idoneidad | la puerta de estados exige el código |
| origen atacante redirige una invitación | **NO** — cae en `APP_URL`, no en el dominio del atacante |
| usuario de otro ámbito | cubierto por `ENFORCE` + guardias; probado en la batería de aislamiento |
| pérdida de base | recuperación exacta medida |
| **pérdida de fichero del bucket** | **NO RECUPERABLE** — ver bloqueante |
| reinicio/redespliegue | la instancia rearranca con postura completa |
| secretos incorrectos | secreto corto avisa en el arranque; postura lo cuenta como ausente |

---

## 4 · ANTES DEL PRIMER CLIENTE vs ROADMAP POST-PILOTO

### ANTES (afectan seguridad, pérdida, integridad, acceso, continuidad)

1. **Versionado y copia del bucket** (C7) — *el único bloqueante real*. Sin esto,
   un borrado accidental o un fallo del almacén pierde los documentos **para
   siempre**: la copia de base guarda las fichas, no los bytes. Es configuración
   de Google Cloud, no código: **activar Object Versioning** en el bucket de la
   entidad y una regla de retención. Acción del propietario, minutos.
2. **Plan de infraestructura de pago** — una entidad no puede vivir en un plan que
   se duerme y que ya murió por memoria (N70).
3. **Ensayo de restauración ejecutado en la instancia de la entidad**, con la
   contraseña de `postgres` — acción del propietario.
4. **2FA activado en la cuenta del administrador** de la entidad (paso 3 de la guía).

### ROADMAP POST-PILOTO (no ponen en riesgo a la entidad)

- IAM condicional sobre el bucket (hoy acotado por credencial dedicada).
- Espacio `global` (N72): en una instancia nueva **no existe**; es deuda de la
  instancia actual.
- Prueba automática que abra un PDF real (ver §6).
- Scroll continuo en el lector, panel de marcas, comparación de revisiones.
- Automatizar el despliegue a partir de la tercera entidad.
- Encender `ENFORCE` en la instancia **actual** del propietario (la de la entidad
  nace con él).

---

## 5 · Aprovisionamiento: valores personales

Barrido en cuatro ángulos + escéptico. **Descartado lo peor:** no existe ninguna
puerta trasera por correo — ni una comparación de email que conceda privilegios en
todo el repositorio; los roles salen de `users.role`. Los envíos de correo van a
destinatario dinámico, sin copia oculta.

Corregido hoy: el correo personal del desarrollador **dentro del JavaScript** del
portal; la postura que **no exigía** `ADMIN_EMAIL` (una municipalidad podía dar
«postura completa» con el desarrollador de administrador); las variables de correo
ausentes de la guía (sin ellas, los restablecimientos de la entidad **sólo
llegarían al buzón del desarrollador**).

---

## 6 · Lo que NO pude probar, y por qué

- **Subida y descarga de bytes reales**: escribiría en el bucket de producción.
  Queda para la verificación en la instancia de la entidad (paso 4 de la guía).
- **Ensayo de restauración completo**: exige `CREATEDB`. Que me pare es la buena
  noticia — es la separación de identidades funcionando.
- **El lector de PDF, visualmente**: y aquí hay que ser claro. Ayer **rompí el
  lector y lo desplegué sin mirarlo**; lo vio el propietario en producción, con
  una hoja en blanco. La causa fue una variable declarada dos veces. **No existe
  ninguna prueba que abra un PDF de verdad**: 781 en verde y el visor no dibujaba
  nada. Corregido, pero la lección va al roadmap como pendiente declarado.

---

## A. Lo que está realmente listo

Perfil portal con perímetro medido; administrador institucional; usuarios y roles
sin depender del proveedor; exportación del expediente; copia de base con
verificación; pérdida y recuperación con cotejo exacto; autorización estricta y
por obra; integridad por huella; trazabilidad; flujo ECD completo con puerta única
de estados.

## B. Lo que se configura al crear cada entidad

Base y bucket propios; `APP_SECRET` y `SESSION_PEPPER` (mismo guardado);
`CORS_ORIGINS` y `APP_URL`; `ADMIN_EMAIL`/`ADMIN_NAME`/`ADMIN_PASSWORD`;
`MAIL_FROM` y `RESEND_API_KEY`; credencial APS; plan de pago; 2FA del
administrador; ensayo de restauración en esa instancia.

## C. Bloqueantes antes de un piloto

**Uno: el bucket sin versionado ni copia (C7).** Todo lo demás de la lista
«ANTES» es configuración de despliegue, no impedimento.

## D. Mejoras durante/después del piloto

IAM condicional; prueba de PDF real; scroll continuo y panel de marcas;
automatización del despliegue; `ENFORCE` en la instancia actual.

## E. Riesgos residuales conocidos

- El proveedor puede acceder técnicamente al bucket de la instancia (declarado).
- La credencial APS puede ser compartida si no se crea una por entidad.
- Sin `RESEND_API_KEY` propia, el correo queda en modo degradado.
- El APK de campo antiguo pierde una pantalla bajo modo estricto (no aplica a un
  piloto de portal documental).

## F. Acceso que conserva el proveedor

Administración de la infraestructura; credencial **limitada al bucket de esa
entidad**; acceso a la base como operador. Dentro de la aplicación **todo queda
registrado, incluidos los administradores**. Fuera de la aplicación, el acceso
directo al bucket es técnicamente posible y **está declarado en el contrato**, no
negado.

## G. Qué es propiedad y control de la entidad

Todo su expediente: documentos, versiones, huellas, estados, códigos de
idoneidad, revisiones, transmittals, plan de entrega y **el registro de
actividad** — la trazabilidad es parte del expediente, no del proveedor.

## H. Procedimiento de salida

Exportación en cualquier momento desde el portal (índice + zip). Al terminar:
entrega de copia completa de base y bucket en formato estándar, y borrado en la
infraestructura del proveedor con constancia escrita (§6.2 del anexo).

## I. Evidencias de backup/restauración

Copia: 86 tablas, 78.034 filas, comprobación interna correcta.
Ensayo en seco del restaurador real sobre esa copia: 86 tablas legibles.
Pérdida controlada y recuperación: 15 documentos, huella `8a7896806878866c`
idéntica antes y después. **Pendiente: el ensayo completo en la instancia de la
entidad.**

## J. Evidencias de seguridad y permisos

`faltan: 0` de 7 puntos al nacer; anónimo 401 en documentos y postura; token
inventado 401; enlace caducado 403 con causa; sesión cerrada 401; rutas del visor
404; origen atacante no redirige invitaciones; último administrador no degradable;
782 pruebas.

---

## Las ocho respuestas

**1. ¿Hay algún riesgo crítico conocido que pueda perjudicar a una primera
entidad?** **Sí, uno: el bucket sin versionado ni copia.** Los demás están
cerrados o declarados.

**2. ¿Puede una entidad perder irreversiblemente su expediente?** **Los datos, no;
los ficheros, sí.** La base se recupera —medido—. Los bytes de los documentos
viven en un bucket sin versionado: un borrado accidental no se deshace. Es el
bloqueante, y se cierra activando el versionado del bucket.

**3. ¿Puede alguien acceder a información que no le corresponde?** No por las vías
probadas: anónimo, token falso, enlace caducado, sesión cerrada y rutas fuera de
perfil quedan cerrados, y la instancia es mono-entidad, así que el aislamiento es
físico. **Salvedad declarada:** el proveedor conserva acceso técnico.

**4. ¿La entidad puede administrar sus usuarios sin depender del proveedor?**
**Sí** — invitar, cambiar roles y retirar, desde la pantalla, con el último
administrador protegido.

**5. ¿Puede recuperar y llevarse su información si termina el servicio?** **Sí** —
índice y documentos desde el portal, en cualquier momento, más la entrega
contractual al terminar.

**6. ¿Está documentado exactamente qué acceso conserva el proveedor?** **Sí**, en
la plantilla contractual §4, declarándolo en vez de negarlo.

**7. ¿Qué mejoras pueden hacerse después sin poner al cliente en riesgo?** IAM
condicional, prueba de PDF real, scroll continuo y marcas, automatización del
despliegue, y encender `ENFORCE` en la instancia actual del propietario.

**8. GO / NO-GO**

### NO-GO — por una sola cosa, y se resuelve en minutos

No es el código: **es el bucket sin versionado**. Ofrecer hoy un ECD donde un
borrado accidental pierde los planos para siempre no cumple la condición que el
propietario mismo puso: *sin perjudicarlos*.

**Se convierte en GO al activar Object Versioning en el bucket de la entidad y
verificar una recuperación de fichero.** Junto con el plan de pago, el ensayo de
restauración en esa instancia y el 2FA del administrador, el piloto es
defendible.

---

## OWNER ACTION PACK

| # | acción | dónde | por qué | evidencia que deja |
|---|---|---|---|---|
| 1 | **Activar Object Versioning** en el bucket de la entidad + regla de retención (p. ej. 90 días) | Google Cloud Storage | **Cierra el único bloqueante.** Sin esto un borrado pierde documentos para siempre | captura de la configuración |
| 2 | **Borrar un fichero de prueba y recuperarlo** desde la versión anterior | GCS | una copia que no se ha restaurado no es una copia | el fichero recuperado |
| 3 | **Ensayo de restauración** en la instancia: `python herramientas/ensayo_de_restauracion.py` (pide la contraseña de `postgres` por teclado; no se escribe en ningún sitio) | tu máquina o el Shell del plan de pago | el tramo que no puedo hacer: el usuario de aplicación no puede crear bases | fichero de evidencia con veredicto |
| 4 | **Plan de pago** de la instancia (2 GB para la actual; Starter basta para una de portal) | Render | sin esto no hay continuidad que ofrecer | `/api/health` en frío < 1 s |
| 5 | **Activar 2FA** en la cuenta del administrador y guardar los códigos | portal de la entidad | es la cuenta que puede destruir el expediente | pantalla de seguridad |
