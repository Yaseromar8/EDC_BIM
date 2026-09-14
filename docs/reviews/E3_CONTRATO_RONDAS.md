# Revisiones · contrato nuevo «RONDAS» · borrador para aprobar

14-sep-2026. **Solo contrato: no hay código.** Es el paso 3 del programa (`00_PROGRAMA_Y_DECISIONES.md`): el contrato nuevo, completo y congelado antes de programar E3 y E4.

**Fuentes**, sin repetir la auditoría:
- el contrato de ACC medido el 12-sep-2026 en PQT8 (informe «ACC REVIEWS · FINAL OBSERVED CONTRACT» y los de rondas, retroceso, nulo y archivo de ese día);
- la comparación con ALEPHIA de esa misma noche;
- tu lista del 14-sep, punto por punto (§1);
- tus decisiones D1 a D9 del 13-sep.

«RONDAS» es un **nombre provisional**. Es el valor que llevaría la revisión en su columna `contrato`, junto a `PRE` y `AUTORIDAD_TERMINAL`.

---

## En corto

**Tu ciclo de trabajo con el contrato nuevo**, dentro de UNA sola revisión:

1. Tu equipo sube los archivos y crea la revisión. Quien la crea es el **iniciador**.
2. Los **revisores**, si los hay, comentan y la **envían** al siguiente.
3. Tú, **aprobador**, abres la revisión. Si hay que corregir algo, pulsas **«Devolver al iniciador»** y escribes qué hay que corregir.
4. La revisión pasa a **Ronda 2 · Esperando al iniciador**. Tu equipo sube la versión corregida con «Subir nueva versión».
5. El iniciador pulsa **«Actualizar a la última versión»** y **«Reenviar»**. La revisión vuelve a empezar por el primer paso, **con la misma identidad**: el mismo RV-015, con la Ronda 1 consultable.
6. Tú decides **archivo por archivo**: Aprobado o Rechazado. Rechazar pide comentario.
7. Pulsas **«Completar revisión»**. La revisión queda **CERRADA**, aunque haya archivos rechazados.
8. Los aprobados se **emiten** (Compartido o Publicado). Si alguno no se puede emitir, queda «Aprobado · pendiente de emitir» y se reintenta.

**La diferencia que más importa:**

| | Devolver al iniciador | Rechazar un archivo |
|---|---|---|
| Qué es | Control de flujo: «corrígelo y vuelve a mandármelo» | Tu decisión final sobre esa versión |
| Quién | Cualquier paso que lo tenga permitido | Solo el aprobador |
| Qué pasa | Ronda nueva en la misma revisión | Al completar, la revisión se cierra con ese archivo rechazado |
| ¿Hay vuelta atrás? | Sí: el iniciador reenvía | No: una revisión cerrada no se reabre |

Tu frase «los rechazaré, ellos volverán a subir y volveré a aprobar» es, en este contrato, **«Devolver al iniciador»**. «Rechazar» es para cuando das el archivo por terminado en negativo. Así lo hace ACC.

---

## 1 · Tu lista de ACC, punto por punto

| # | Lo que medimos en ACC | En RONDAS | Dónde |
|---|---|---|---|
| 1 | Iniciador → Revisor(es) → un único Aprobador final | Igual. Puede haber cero revisores. | §2 |
| 2 | En las 9 plantillas el aprobador era siempre el último paso; ningún aprobador intermedio | Igual, y exigido: pasos REVISA y un solo APRUEBA, al final. El tipo de paso no se elige. | §2, §9 |
| 3 | El revisor no aprueba ni rechaza documentos: reclama su tarea y la envía; si está permitido, devuelve al iniciador | Igual, sin «reclamar»: cada paso es de una sola persona (§14). Enviar, volver al paso anterior y devolver al iniciador. | §4.1, §4.4, §4.5 |
| 4 | El aprobador decide por archivo y versión; la decisión es distinta de completar su tarea | Igual: «Decidir» por archivo y «Completar revisión». | §4.2, §4.3 |
| 5 | Al terminar el aprobador, la Review queda cerrada aunque haya rechazados; cerrada = proceso terminado | Igual. CERRADA, con resultado Aprobada, Rechazada o Mixta. | §3 |
| 6 | Devolver al iniciador crea una ronda nueva en la misma Review; el iniciador actualiza la versión y reenvía | Igual. La ronda sube al devolver, no al reenviar. | §4.5 a §4.7, §5 |
| 7 | Volver al paso anterior: misma ronda, ejecución nueva del paso anterior, puede reasignarse | Igual, con las guardas de ALEPHIA sobre quien entra. | §4.4 |
| 8 | La Review queda atada a una versión; subir V2 no la mueve | Igual. Avanzar de versión es explícito y solo esperando al iniciador. | §6 |
| 9 | La plantilla queda en foto al crear; cambiarla no toca revisiones existentes | Igual, como hoy, también en rondas posteriores. | §9 |
| 10 | Anular termina el proceso sin decisión documental | Igual, con motivo obligatorio (D5). | §4.9 |
| 11 | Archivar es una operación aparte del estado | Igual, pero reversible por un administrador (D4). | §4.10 |
| 12 | Las notificaciones iban separadas de la acción principal | Igual: tarea siempre y correo opcional, después de guardar (D7). | §10 |
| 13 | Exportación por Review y agregada | Igual, y además con el historial de pasos, que ACC no trae. | §13 |

---

## 2 · Papeles

| Papel | Quién es | Puede |
|---|---|---|
| **Iniciador** | Quien crea la revisión. Queda guardado por su usuario (`iniciador_id`), no por su nombre. | Crear. Mientras la revisión le espera: actualizar versiones y reenviar. Anular (D5). |
| **Revisor** (paso REVISA) | La persona de ese paso | Comentar archivos, enviar, volver al paso anterior, devolver al iniciador (si el paso lo permite) |
| **Aprobador** (paso APRUEBA) | La persona del último paso. Hay **exactamente uno**. | Lo mismo que un revisor, más decidir por archivo y completar la revisión |
| **Administrador de la obra** | Rol de obra, como hoy | Anular (D5), archivar y desarchivar (D4), sustituir a quien bloquea la revisión (§11), reintentar emisiones (decisión R7). **No decide por nadie** (B12). |

**Reglas del flujo** (invariante, se comprueba al guardar una plantilla, al crear y al actuar):
- de 1 a 6 pasos, además del iniciador (ACC llega a «Six Step Approval»);
- todos REVISA salvo el último, que es APRUEBA;
- cada paso designa una persona o una función. La función se resuelve a una persona al crear: con varias posibles, se elige (E1.3).

---

## 3 · Estados de la revisión

| Lo que ves | Qué significa | ACC |
|---|---|---|
| **ABIERTA · Paso N: persona** | Le toca a la persona del paso N | `open` |
| **ABIERTA · Esperando al iniciador** | Se devolvió; nadie más puede actuar hasta que el iniciador reenvíe | `restarting`, que persiste |
| **CERRADA · Aprobada / Rechazada / Mixta** | El proceso terminó; el resultado son las decisiones por archivo | `closed` |
| **ANULADA** | Terminó sin decisión documental | `void` |
| Marca **ARCHIVADA** | Se oculta de la lista por defecto; no cambia el estado | flag `archived` |

- **Resultado de una CERRADA:** Aprobada si todos los archivos quedaron aprobados, Rechazada si todos rechazados, Mixta si hay de los dos.
- **No existe reabrir.** Ni en ACC ni aquí.
- **BLOQUEADA** se sigue calculando al mirar la revisión, como hoy, sin guardarse. Aplica cuando quien tiene el turno ya no puede actuar: el revisor del paso, o el iniciador mientras la revisión le espera.

**En la base:**

| Columna | Valores |
|---|---|
| `status` | `pending` (ABIERTA), `closed`, `void` |
| `turno` (nueva) | `PASO` o `INICIADOR`, solo mientras está `pending` |
| `approved` / `rejected` | se quedan exclusivamente para PRE y AUTORIDAD_TERMINAL (D6) |

---

## 4 · Las acciones

Reglas comunes a todas:
- Una acción **nunca escribe a medias**. Todas las comprobaciones van antes de la primera escritura. El estado, la tarea, el evento del historial y el testigo del registro de actividad van en la **misma transacción** (§11).
- Si otra persona actuó antes, responde **409** y la pantalla vuelve a cargar, como hoy.
- Quien actúa tiene que poder **consultar todos los documentos** de la revisión, como hoy.

### 4.1 · Enviar (revisor)

- **Quién:** la persona del paso actual, si es REVISA.
- **Pide:** nada. Comentario opcional.
- **Efecto:** el paso termina y empieza el siguiente, con su plazo y su tarea. Los comentarios de ese paso quedan bloqueados.
- **No toca:** los documentos ni las decisiones.
- **ACC:** submit sin valor de decisión.

### 4.2 · Decidir un archivo (aprobador)

- **Quién:** la persona del último paso, con el turno.
- **Pide:** Aprobado o Rechazado por archivo. **Rechazado exige comentario** (D2; en ACC es opcional).
- **Efecto:** se guarda como **borrador**. Se puede cambiar hasta completar. No cambia la revisión.
- **Guarda propuesta** (decisión R6): no se puede marcar Aprobado un archivo cuya versión fijada ya no es la vigente. Hay que devolverlo al iniciador para que la actualice, o rechazarlo.
- **ACC:** decisión por URN versionado, separada del envío.

### 4.3 · Completar revisión (aprobador)

- **Pide:** una decisión para **todos** los archivos. Hasta entonces el botón está apagado, como en ACC.
- **Efecto, en una transacción:**
  - las decisiones pasan de borrador a firmes;
  - `status = closed`, con resultado, `cerrada_en` y `cerrada_por`, también si hay rechazados;
  - se cierran las tareas.
- **Después, fuera de esa transacción:** se emite cada archivo aprobado (§7).
- **Luego:** sin siguiente acción, sin ronda nueva, sin retorno.

### 4.4 · Volver al paso anterior

- **Quién:** la persona del paso actual, revisor o aprobador. No hace falta decidir nada antes.
- **Requiere:** que haya un paso anterior. Desde el primer paso no existe: lo que hay es devolver al iniciador.
- **Pide:**
  - motivo (decisión R2; en ACC las notas son opcionales);
  - opcionalmente, **otra persona** para ese paso y **otro plazo** (D8).
- **Guardas para la persona nueva:** las de hoy. Participante activo de la obra, que pueda consultar todos los documentos, y la revisión sigue teniendo al menos un revisor distinto del iniciador.
- **Efecto:**
  - **misma ronda**;
  - el paso abandonado queda «devuelto al paso anterior» en el historial;
  - empieza una **ejecución nueva** del paso anterior, con su tarea;
  - las decisiones en borrador del aprobador se descartan; los comentarios se conservan.
- **Plazo** (decisión R3): propongo que la ejecución nueva cuente sus días desde ese momento. En ACC se conserva el vencimiento original, que puede estar ya pasado.

### 4.5 · Devolver al iniciador

- **Quién:** la persona del paso actual, revisor o aprobador, **solo si ese paso lo tiene permitido** (casilla por paso, D8).
- **Pide:** motivo, qué hay que corregir (decisión R2; en ACC es opcional). Comentarios por archivo opcionales.
- **Efecto:**
  - la **ronda sube en ese momento**: es la Ronda 2 aunque el iniciador todavía no haya reenviado;
  - `turno = INICIADOR`, sin paso actual y sin plazo;
  - se cierra la tarea del paso y se abre una tarea al iniciador: «Corregir y reenviar»;
  - las decisiones en borrador se descartan (decisión R4) y los comentarios se conservan en la ronda anterior;
  - **no es un rechazo documental**: no toca ningún archivo;
  - **no reasigna a nadie**: la ronda nueva usa las mismas personas (ACC igual).

### 4.6 · Actualizar la versión (iniciador, esperando)

- **Quién:** el iniciador, solo con `turno = INICIADOR`.
- **Qué hace:** un archivo, o todos con «Actualizar todo», pasa a su **versión vigente**. No se elige versión y no se puede volver a una anterior. ACC igual.
- **No guarda nada** hasta reenviar. En ACC «Actualizar todo» es una lectura y la versión se fija en el envío.
- **Aviso, como ACC:** los comentarios de la versión anterior no pasan a la nueva; siguen visibles en su ronda.

### 4.7 · Reenviar (iniciador)

- **Pide:** notas opcionales. Se vuelven a comprobar las versiones fijadas y el acceso de las personas del flujo, como en el alta.
- **Efecto:**
  - los archivos y sus versiones quedan **congelados para la ronda**;
  - `turno = PASO` y empieza el **primer paso**, con su plazo y su tarea (ACC igual).
- **Añadir o quitar archivos en la ronda nueva** (decisión R5): propongo no hacerlo en esta versión. ACC lo ofrece, pero no se probó qué hace.

### 4.8 · Comentar un archivo

- **Quién:** quien tiene el turno. Comenta sobre la versión de la ronda en curso.
- **Efecto:** el comentario se guarda con su ronda, paso y versión. Se bloquea cuando termina ese paso. No se edita ni se borra.
- **Marcas sobre el plano:** fuera (§14).

### 4.9 · Anular (E2, D5)

- **Quién:** el iniciador o un administrador. **Motivo obligatorio.** En ACC no se pide motivo.
- **Cuándo:** con la revisión ABIERTA, en cualquier turno.
- **Efecto:**
  - `status = void`, con fecha y autor;
  - se cierran las tareas;
  - ninguna decisión documental;
  - historial intacto;
  - no se reabre.

### 4.10 · Archivar y desarchivar (E2, D4)

- **Quién:** un administrador. **Motivo obligatorio** en los dos sentidos.
- **Efecto:** marca aparte, con autor y fecha; no cambia el estado. La revisión sale de la lista por defecto y sigue abierta desde el filtro «Archivadas».
- **Diferencia deliberada:** en ACC es irreversible; aquí es reversible (D4).
- **Archivar una ABIERTA** (decisión R12): ACC no lo probó. Propongo permitirlo solo a revisiones CERRADAS o ANULADAS.

### 4.11 · Reintentar la emisión

Ver §7.

---

## 5 · Rondas

- **Número:** empieza en 1 al crear y sube en cada «Devolver al iniciador». La revisión conserva su id y su código RV-NNN.
- **Cada ronda guarda:**
  - cuándo se abrió, quién la devolvió, desde qué paso y por qué;
  - cuándo se reenvió;
  - cómo terminó: devuelta, cerrada o anulada.
- **Foto de documentos por ronda:** archivo y versión congelados al reenviar (en la Ronda 1, al crear), con los comentarios de esa ronda.
- **Decisiones:** solo existen en la ronda que termina cerrada. Una ronda devuelta no deja decisiones.
- **Consulta:** pestañas «Ronda 2 | Ronda 1» en el detalle, como en ACC. Una ronda anterior se ve entera, solo lectura.

---

## 6 · Documentos y versiones

- **Al crear:** cada archivo fija su versión. Ya es así desde el lote del 12-sep.
- **Subir una versión nueva no mueve la revisión.** El detalle marca «hay versión nueva», como ahora y como el punto naranja de ACC. En ALEPHIA, además, subir una versión devuelve el documento a WIP; eso no cambia.
- **Solo se avanza de versión** esperando al iniciador (§4.6).
- **La decisión es sobre la versión fijada** en la ronda que cierra.
- **El rechazo se ve en el documento.** Hoy un rechazo no deja rastro en el archivo (hueco P1 de la comparación). En RONDAS, el panel de versiones del archivo dirá «V1 · rechazada en RV-015, ronda 2», leyendo las decisiones de la revisión. No se escribe nada nuevo en la versión.

---

## 7 · Cerrar no es emitir (D3)

**Hoy**, bajo AUTORIDAD_TERMINAL, aprobar el último paso cierra y emite todos los documentos a la vez: o todos o ninguno. Si uno falla, la revisión no se cierra.

**En RONDAS:**

1. **Completar** cierra la revisión y confirma. Eso ya no se deshace.
2. **Cada archivo aprobado se emite por separado**, en su propia transacción, por la misma puerta de hoy (`estados_ecd`). Se comprueban todas las guardas actuales: versión vigente, autoridad sobre la carpeta (Editar para Compartido, Administrar para Publicado), reserva de edición, idoneidad, nomenclatura y camino ISO.
3. **Cada archivo queda con su estado de emisión:**

| Estado | Cuándo |
|---|---|
| **EMITIDO** | Pasó a Compartido o Publicado, con su sello y su auditoría de siempre |
| **APROBADO · PENDIENTE DE EMITIR** | Una guarda lo impidió. Se guarda el motivo en palabras. |
| **NO APLICA** | Rechazado |

4. **Reintentar:** botón «Emitir» sobre los pendientes. Vuelve a pasar todas las guardas. Quién puede pulsarlo es la decisión R7.
5. **Si la versión dejó de ser la vigente** después de completar, el archivo queda pendiente con ese motivo. No se emite lo que nadie revisó.

La revisión CERRADA muestra cuántos quedan pendientes de emitir. La lista tendrá el filtro «Pendientes de emitir».

---

## 8 · Qué puede hacer cada uno, por estado

| Estado \ persona | Iniciador | Persona del paso actual | Aprobador (sin turno) | Administrador |
|---|---|---|---|---|
| ABIERTA · paso N | Anular | Comentar · Enviar o Decidir+Completar · Volver al paso anterior · Devolver al iniciador (si el paso lo permite) | — | Anular · Sustituir si está BLOQUEADA |
| ABIERTA · esperando al iniciador | Actualizar versiones · Reenviar · Anular | — | — | Anular · Sustituir al iniciador si está BLOQUEADA (R8) |
| CERRADA | — | — | Reintentar emisión (R7) | Reintentar emisión (R7) · Archivar |
| ANULADA | — | — | — | Archivar |
| ARCHIVADA | — | — | — | Desarchivar |

Exportar lo puede hacer quien puede ver la revisión, en cualquier estado.

---

## 9 · Plantillas y alta

- **Foto al crear:** como hoy. La revisión guarda su copia de los pasos y su procedencia (id, nombre y versión de la plantilla). Cambiar la plantilla no toca revisiones existentes, tampoco en rondas posteriores. ACC igual.
- **Casilla nueva por paso: «Puede devolver al iniciador».** Vale en revisores y en el aprobador, como en ACC. Viaja en la foto.
  - **Valor por defecto** (decisión R11): propongo marcada en todos los pasos, porque tu ciclo diario la necesita.
- **Tipo de paso no elegible:** con RONDAS, la pantalla no ofrece REVISA/APRUEBA; los pasos intermedios revisan y el último aprueba. ACC igual.
- **Plantillas que no cumplen RONDAS** (por ejemplo, con un APRUEBA intermedio): se conservan y aparecen como **«no utilizable», con el motivo**. Es el mecanismo de E1.3. No se reescriben solas.
- **Alta a mano:** mismas reglas. La casilla también está en cada paso.
- **Iniciadores permitidos por plantilla:** no. Inicia quien puede editar los documentos, como hoy (§14).

---

## 10 · Tareas y avisos (D7)

**Tareas en Mi Trabajo, siempre, dentro de la transacción de la acción:**

| Momento | Tarea |
|---|---|
| Empieza un paso | «Revisar: título (paso N · ronda R)» a su persona |
| Devolver al iniciador | «Corregir y reenviar: título (ronda R)» al iniciador |
| Emisión pendiente | Sin tarea automática: la CERRADA lo dice (decisión R7) |

La conciliación de tareas aprende el turno del iniciador. Hoy solo sabe preguntar por el revisor del paso.

**Correo:**
- Cada acción lleva la casilla **«Avisar por correo»**, marcada por defecto.
- Se envía **después de confirmar**, fuera de la transacción.
- Si falla, la acción ya está hecha y el fallo queda anotado.
- Destinatarios:
  - la persona del paso que empieza;
  - el iniciador cuando se le devuelve;
  - el iniciador al cerrar, con el resultado (decisión R9).
- **Hoy**, en PRE y AUTORIDAD_TERMINAL, el correo se manda dentro de la transacción. RONDAS no hereda eso. Cambiarlo también en las revisiones actuales es la decisión R10.

---

## 11 · Historial y trazabilidad

**Hoy**, `history` es un JSON que `ecd_app` puede reescribir, y los actos van al registro de actividad después del commit y sin garantía. Es el hueco P1 de la comparación.

**En RONDAS** (decisión R13):
- **Tabla de eventos de solo inserción.** Una fila por evento, con ronda, paso, ejecución, actor por `user_id`, fecha con zona y detalle. Se retira a `ecd_app` el permiso de UPDATE, DELETE y TRUNCATE, igual que en `activity_log`.
- **Testigo en el registro de actividad**, en la misma transacción que la acción, como ya hace el alta desde R01.
- **Eventos:** creada · paso iniciado · enviado · decisión guardada · completada y cerrada · vuelta al paso anterior · devuelta al iniciador · versión actualizada · reenviada · emisión hecha · emisión pendiente · persona sustituida · anulada · archivada · desarchivada · aviso enviado o fallido.
- **Qué contesta el historial:**
  - quién hizo cada paso en cada ronda y cuánto tardó;
  - por qué se devolvió;
  - qué versión se revisó en cada ronda;
  - quién decidió cada archivo y con qué comentario;
  - qué se emitió y qué quedó pendiente.

ACC no guarda la decisión en el historial de pasos. Aquí sí.

**Límite, dicho como en R01:** esto da inmutabilidad frente a la aplicación, no frente a un administrador de la base.

---

## 12 · Permisos y guardas

**Se conservan todas las de hoy:**
- persona designada activa y participante de la obra;
- independencia: al menos un revisor distinto del iniciador;
- acceso documental de cada persona del flujo, al asignar y al actuar;
- el administrador no actúa por otro (B12);
- autoridad de carpeta para emitir;
- versión fijada.

ACC no valida el acceso documental al asignar. ALEPHIA sí, y se queda así.

**BLOQUEADA en RONDAS:**
- con turno de paso, como hoy: la persona del paso ya no puede actuar;
- esperando al iniciador: el iniciador salió de la obra, se desactivó su cuenta o perdió «Editar» sobre los documentos.

**Salidas:**
- sustituir a la persona del paso: la vía estrecha de hoy (administrador, solo bloqueada, con motivo);
- sustituir al iniciador con las mismas reglas (decisión R8);
- anular.

---

## 13 · Exportación (E5)

**Por revisión**, en Excel y PDF:
- cabecera: código, título, iniciador, flujo y su procedencia, estado, resultado, fechas;
- una fila por archivo y ronda: versión, decisión, comentario y estado de emisión;
- **historial de pasos por ronda**, que ACC no exporta.

**Agregada:** el Excel de la lista actual, con sus filtros, una fila por revisión y archivo. Las archivadas quedan fuera salvo que se pidan, como en ACC.

La forma (en el navegador o como trabajo del servidor) se decide en E5.

---

## 14 · Lo que no se adopta, y por qué

| Capacidad de ACC | En RONDAS | Motivo |
|---|---|---|
| Reclamar la tarea, varios candidatos, cuórum | No | Una persona por paso. La responsabilidad es inequívoca, y en ACC no se probó con dos candidatos. |
| Omitir el paso · Revisión de los delegados | No | Se ofrecen en ACC pero no se ejecutaron. Sustituir bloqueadas cubre el rescate. |
| Pasos en paralelo | No | El motor es secuencial, igual que hoy. |
| Iniciadores restringidos por plantilla | No | En ACC no se sostuvo ni para un administrador (causa no probada). |
| Marcas de revisión sobre el plano | No, en esta versión | Es trabajo de visor. Red Line sigue siendo su propio objeto. |
| Archivo irreversible | No | Tu D4: reversible por un administrador, con motivo. |
| Anular sin motivo · rechazar sin comentario | No | Tus D5 y D2. |
| Añadir o quitar archivos en ronda nueva | No, en esta versión (R5) | En ACC no se probó qué hace. |

---

## 15 · Lo que NO cambia (D6)

- Las revisiones **PRE** y **AUTORIDAD_TERMINAL** existentes, abiertas o cerradas, terminan con sus reglas: `/act` con aprobar y rechazar, rechazo terminal, cierre que emite todo junto. No reciben rondas, retroceso, devolución ni decisión por archivo.
- **Anular, archivar y exportar sí se les aplican**, porque son ortogonales (D6).
- `/act` sobre una revisión RONDAS responde 409 «esta revisión usa rondas», sin tocar nada.
- El contrato de cada revisión sigue siendo **inmutable**. El disparador de R01 no se toca.
- Todo lo de E1, E1.1, E1.2 y E1.3 se mantiene: enlace, detalle, filtros, avisos de documentos en otra revisión, fechas con zona y selector de personas por función.

---

## 16 · Modelo de datos (propuesta)

**En `doc_reviews`**, columnas nuevas al final, nulas en PRE y AUTORIDAD_TERMINAL:

| Columna | Qué guarda |
|---|---|
| `ronda` | ronda en curso, desde 1 |
| `turno` | `PASO` o `INICIADOR` |
| `iniciador_id` | usuario iniciador |
| `resultado` | `APROBADA`, `RECHAZADA` o `MIXTA`, al cerrar |
| `cerrada_por_id` | quien completó |
| de E2 | `anulada_en`, `anulada_por_id`, `motivo_anulacion`, `archivada`, `archivada_en`, `archivada_por_id`, `motivo_archivo` |

- **Paso actual esperando al iniciador:** `current_step` pasa a NULL. Un lector antiguo que no conozca el turno falla en voz alta en vez de dar por activo el paso 1.
- **Lectores que tienen que aprender el turno**, inventariados en el código: `_me_toca`, `estado_del_flujo`, `_pasos_para_mostrar`, `_acciones_para`, `act_on_review`, `reasignar_revisor`, `encargos._sigue_debiendose`, `encargos._faltantes`, el filtro del listado y la fila de la lista del portal.

**Restricciones nuevas:**
- lista de contratos: `PRE`, `AUTORIDAD_TERMINAL` y `RONDAS`, casada con el código por la prueba de R01;
- RONDAS exige `ronda >= 1` e `iniciador_id`;
- `turno` en su lista;
- `status` en su lista: `pending`, `approved`, `rejected`, `closed`, `void`. Hoy no tiene ninguna.

**Permisos:** un `ADD COLUMN` sobre `doc_reviews` no queda actualizable por `ecd_app` (R01-RES-07). La migración concede UPDATE solo en las columnas que la aplicación escribe.

**Tablas nuevas:**

| Tabla | Una fila por | Contenido |
|---|---|---|
| `doc_review_rondas` | revisión y ronda | apertura (quién, desde qué paso, motivo), reenvío, cómo terminó |
| `doc_review_documentos` | revisión, ronda y archivo | versión congelada y nombre en ese momento; decisión, comentario, quién y cuándo, borrador o firme; emisión, motivo, cuándo y quién |
| `doc_review_comentarios` | comentario | ronda, paso, ejecución, archivo, versión, autor, texto, fecha. Solo inserción. |
| `doc_review_eventos` | evento | §11. Solo inserción. |

**Restricciones de `doc_review_documentos`:**
- la decisión en su lista, y RECHAZADO con comentario no vacío;
- la emisión en su lista;
- EMITIDO solo si la decisión es APROBADO y firme.

**Clave foránea a `file_versions`:** si la purga de la papelera lo permite, se comprueba en la fase A. Si no, se valida al escribir.

`items` sigue siendo la foto de la ronda en curso, para que el listado y las comprobaciones de acceso de hoy sigan valiendo. Sin añadir ni quitar archivos (R5), los documentos son los mismos en todas las rondas.

---

## 17 · API (propuesta)

**Mutaciones**, cada una con `FOR UPDATE`, guardas antes de escribir, transacción única y correo después:

```
POST /api/reviews/<id>/enviar                         revisor · {comentario?, avisar?}
PUT  /api/reviews/<id>/documentos/<nodo>/decision     aprobador · {decision, comentario}
POST /api/reviews/<id>/completar                      aprobador · {avisar?}
POST /api/reviews/<id>/volver-al-paso-anterior        paso actual · {motivo, user_id?, dias?, avisar?}
POST /api/reviews/<id>/devolver-al-iniciador          paso actual · {motivo, avisar?}
POST /api/reviews/<id>/actualizar-versiones           iniciador · {nodos?: todos si falta}
POST /api/reviews/<id>/reenviar                       iniciador · {notas?, avisar?}
POST /api/reviews/<id>/comentarios                    turno · {node_id, texto}
POST /api/reviews/<id>/emitir                         R7 · {node_id?}
POST /api/reviews/<id>/sustituir-iniciador            administrador, bloqueada · {user_id, motivo}
POST /api/reviews/<id>/anular                         E2 · iniciador o administrador · {motivo}
POST /api/reviews/<id>/archivar  |  /desarchivar      E2 · administrador · {motivo}
GET  /api/reviews/<id>/exportar?formato=              E5
GET  /api/reviews/exportar?model_urn=&filtro=         E5
```

- **Lectura:** el detalle añade `ronda`, `turno`, `rondas[]`, `documentos[]` con decisión y emisión, `resultado` y `acciones` con los verbos nuevos. `acciones` sigue siendo presentación: cada ruta vuelve a comprobarlo todo.
- **Listado:** «Me toca» incluye al iniciador cuando la revisión le espera. Filtros nuevos: «Esperando al iniciador» y «Pendientes de emitir»; con E2, «Anuladas» y «Archivadas».

---

## 18 · Pantalla (E4)

**Detalle:**
- chip de estado y resultado;
- pestañas por ronda;
- tabla de archivos: versión de la ronda, aviso de versión nueva, comentarios;
- para el aprobador, columna «Decisión *» y «Completar revisión» apagado hasta decidirlo todo;
- botones con la etiqueta según los destinos, como ACC: «Volver al paso anterior», «Devolver al iniciador», o «Devolver ⌄» con los dos;
- diálogos con motivo, persona y plazo (en el retroceso) y la casilla de correo;
- esperando al iniciador: «Actualizar a la última versión», «Actualizar todo» y «Reenviar»;
- historial por ronda;
- tras cerrar, columna de emisión con «Emitir» en los pendientes.

**Otras pantallas:**
- **Alta y editor de flujos:** casilla «Puede devolver al iniciador» por paso; sin elegir tipo de paso.
- **Mi Trabajo:** la tarea del iniciador abre la revisión.
- **Lista:** chips «Esperando al iniciador», «Cerrada · 2 aprobados · 1 rechazado» y «Pendiente de emitir».
- **Archivos:** en el panel de versiones, «En revisión en RV-015» y «V1 · rechazada en RV-015, ronda 2».

---

## 19 · Cómo se pone en marcha

Por fases, como R01. Cada paso con tu autorización.

| Fase | Qué | Efecto en producción |
|---|---|---|
| **A** | Migración: columnas, tablas, restricciones, permisos por columna y retirada de UPDATE/DELETE en las tablas de solo inserción | Inerte: ninguna consulta usa `SELECT *` y `_row_to_dict` lee por posición (demostrado en la fase A de R01) |
| **B · E3** | Motor, rutas, tareas, emisión, eventos, pruebas y ensayo contra PostgreSQL | `CONTRATO_VIGENTE` sigue en AUTORIDAD_TERMINAL: no nace ninguna RONDAS. En el ensayo se crean forzando la constante, como en R01. |
| **C · E4** | Pantallas completas | Nada visible: no hay revisiones RONDAS |
| **Auditoría** | Tu recorrido en el banco con la aceptación de §20, y la auditoría del diff | — |
| **D** | Una línea: `CONTRATO_VIGENTE = RONDAS`. Backend primero, portal después. | Las revisiones nuevas nacen RONDAS; las existentes siguen con sus reglas |

**Punto de no retorno:** en cuanto nazca la primera revisión RONDAS en producción. Desde ahí el rollback solo puede ir a una versión que entienda RONDAS (la de la fase C). Anterior, prohibido, igual que en R01.

**E2** (anular y archivar) es ortogonal y puede ir antes, como dice el programa.

---

## 20 · Aceptación

**El recorrido de tu programa, desde la interfaz, con dos cuentas que no sean administradoras:**

1. Crear una revisión con 3 archivos y un flujo de revisor más aprobador, con devolución permitida.
2. El revisor comenta un archivo y envía.
3. El aprobador devuelve al iniciador con motivo → Ronda 2 · Esperando al iniciador → tarea del iniciador en Mi Trabajo.
4. Subir V2 de un archivo: la revisión sigue en V1 con el aviso de versión nueva.
5. Actualizar ese archivo a V2 y reenviar → empieza el revisor en Ronda 2.
6. Consultar la Ronda 1: V1, comentarios y motivo de la devolución.
7. El aprobador decide: 2 aprobados y 1 rechazado con comentario, y completa → CERRADA · Mixta.
8. Se emiten solo los 2 aprobados.
9. Uno sin autoridad de carpeta queda «pendiente de emitir» con su motivo → se da la autoridad → «Emitir» → emitido.
10. Exportar la revisión y la lista.

**Casos separados:**
- volver al paso anterior, cambiando persona y plazo;
- anular esperando al iniciador;
- archivar y desarchivar;
- rechazar todo: CERRADA · Rechazada, sin emisión;
- una PRE y una AUTORIDAD_TERMINAL existentes que terminan exactamente igual que hoy.

**Negativos:** cada uno responde con un mensaje claro y deja todo sin tocar (el ensayo compara la fila byte a byte, como en E1.2):
- el revisor intenta decidir;
- se completa sin decidir todo;
- se rechaza sin comentario;
- se devuelve desde un paso sin permiso;
- se vuelve atrás desde el paso 1;
- se actualiza la versión sin esperar al iniciador;
- se reenvía por otra persona;
- se actúa sobre una CERRADA o una ANULADA;
- `/act` sobre una RONDAS;
- una persona sin acceso documental entra en un retroceso;
- el retroceso dejaría al iniciador como único revisor.

**Pruebas:**
- **pytest de reglas puras** (`flujo_de_revision`), de rutas con dobles y de estructura: guardas antes de la primera escritura y transacción única;
- **prueba que casa** la lista de contratos del código con la de la base;
- **ensayo contra PostgreSQL con ENFORCE**, con usuarios ficticios: todo el recorrido, los negativos y la conciliación de tareas convergiendo;
- **regresión** de los ensayos de R01, E1, E1.1 y E1.2;
- **npm**: bancos de las reglas de pantalla;
- **pantalla**: el recorrido en la app real del banco.

---

## 21 · Decisiones que necesito de ti

| # | Pregunta | Mi recomendación |
|---|---|---|
| R1 | ¿Nombre del contrato? | «RONDAS» |
| R2 | ¿Motivo obligatorio al devolver al iniciador y al volver al paso anterior? En ACC es opcional. | Obligatorio en los dos: quien recibe tiene que saber qué corregir |
| R3 | Plazo de la ejecución nueva tras volver al paso anterior | Días del paso contados desde ese momento, editable. ACC conserva el vencimiento original. |
| R4 | Decisiones en borrador del aprobador si devuelve o vuelve atrás | Se descartan; los comentarios se conservan |
| R5 | ¿Añadir o quitar archivos en una ronda nueva? | No en esta versión: solo actualizar versiones |
| R6 | ¿Se puede aprobar una versión que ya no es la vigente? | No: devolver al iniciador para actualizarla, o rechazar |
| R7 | ¿Quién reintenta una emisión pendiente? | El aprobador o un administrador de la obra, con las guardas de siempre |
| R8 | Si el iniciador sale de la obra esperando la revisión | Un administrador lo sustituye, con motivo (o anula) |
| R9 | ¿Avisar al iniciador al cerrar, con el resultado? | Sí |
| R10 | ¿Sacar también de la transacción el correo de las revisiones PRE y AUTORIDAD_TERMINAL? | Sí, como corrección aparte y pequeña, no dentro de RONDAS |
| R11 | «Puede devolver al iniciador» en un paso nuevo | Marcada por defecto |
| R12 | ¿Archivar una revisión abierta? | No: solo cerradas o anuladas |
| R13 | ¿Historial en tabla de solo inserción, con testigo en el registro de actividad por cada acción? | Sí |
| R14 | ¿Congelas este contrato con estas respuestas para empezar E3? | Sí, cuando respondas R1 a R13 |

---

## 22 · Fuentes

- **ACC**, medido el 12-sep-2026 con una sola cuenta de administrador de proyecto: estados (§3), revisor (§4), aprobador (§5), decisión por versión (§6), retroceso (§7), rondas (§8), versiones (§9), foto de plantilla (§10), nulo (§11), archivo (§12), asignación y permisos (§13), historial (§14), notificaciones (§15), exportación (§16) y lo no probado (§17).
- **No probado en ACC**, y aquí no se da por supuesto: segundo actor, cuórum, omitir, delegar, decisiones mixtas, reasignar en retroceso, archivos en ronda 2, versión nueva con paso activo, permisos de no administradores, entrega de correo.
- **ALEPHIA hoy:** `backend/flujo_de_revision.py`, `backend/routes/reviews.py`, `backend/plantillas_de_revision.py`, `backend/routes/plantillas_revision.py`, `backend/encargos.py`, `backend/estados_ecd.py`, migraciones 19, 27 y 28.
- **Programa y decisiones:** `docs/reviews/00_PROGRAMA_Y_DECISIONES.md`.
- **Diagnóstico de hoy:** `docs/reviews/E1_3_FLUJOS_CREADOS_Y_RECHAZO.md`.
