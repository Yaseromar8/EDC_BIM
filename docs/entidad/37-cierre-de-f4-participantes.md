# CIERRE DE F4 — PARTICIPANTES

**21-ago-2026** · Tercera de las cuatro piezas del [mapa de cierre](33-mapa-de-cierre-de-frontend-docs.md)

> **Desde `frontend-docs` ya se ve quién participa en esta obra, a qué empresa
> pertenece y en qué calidad participa esa empresa aquí.**
> Sin Account global, sin organigrama, sin sistema de permisos nuevo.

---

## 1 · Lo que había, y lo que faltaba de verdad

El dominio estaba completo y bien separado —`project_companies`, `funcion_de`,
`usuarios_de_la_funcion`, las rutas del Directorio— y **sin ninguna pantalla**.

Pero al mirar los datos apareció algo peor que la falta de pantalla:

```
project_companies   0 filas
users con empresa   0 de 17
```

**La pantalla habría existido y no habría dicho nada.** Y no por falta de uso:
había forma de crear un usuario con empresa (`POST /api/users`) y **ninguna de
ponérsela a uno que ya existe**. La función contractual se deriva de la empresa,
así que sin empresa no hay función, y la pantalla entera sale vacía.

Por eso el único endpoint añadido —dentro del dominio del Directorio, como
autorizaba el alcance— es ése.

---

## 2 · Las cuatro cosas, separadas

| | qué es | dónde vive |
|---|---|---|
| **Persona** | un usuario concreto | `users` + `project_users` |
| **Empresa** | a qué organización pertenece. **Global** | `users.company_id` |
| **Función contractual** | ENTIDAD / SUPERVISIÓN / CONTRATISTA / PROYECTISTA / OTRO. **Del par (empresa, obra)** | `project_companies` |
| **Permiso** | lo que puede hacer | rol del sistema + `folder_permissions` |

**La función de una persona no se guarda en ninguna parte: se deriva de su
empresa.** El ensayo lo comprueba de la única forma que vale — verificando que
**no existe ninguna columna** en `project_users` que la declare, y que al cambiar
la de la empresa la de la persona cambia sola.

La pantalla lo dice donde se puede confundir, no en una ayuda que nadie abre:

> «La función es **de la empresa en esta obra**: la misma empresa puede tener
> otra función en otro proyecto. **No otorga permisos** — lo que cada persona
> puede hacer lo decide su perfil del sistema.»

---

## 3 · La pantalla

Dos bloques, y se distinguen a la vista: las empresas llevan **un cuadrado**;
las personas, **un círculo con iniciales**.

**Empresas y su función contractual** — nombre, función (desplegable si eres
administrador; etiqueta de color si no), y cuántas personas de la obra son
suyas. Debajo, añadir empresa × función, y quitarla.

**Personas de la obra** — nombre y correo, empresa (editable por un
administrador), **función derivada** (nunca editable aquí: se cambia arriba, que
es donde vive) y **perfil del sistema**, en su propia columna para que no se
confunda con la función.

### Y avisa de lo que le falta al directorio

En vez de enseñar huecos silenciosos:

- **«1 persona sin empresa.** Sin empresa no hay función contractual, porque la
  función se deriva de ella.»
- **«Sin función declarada en esta obra: MUNICIPALIDAD DE TALARA.** Hay personas
  de esas empresas aquí, pero no consta en qué calidad participan.»

*Verificado en el navegador con los cinco casos —dos empresas declaradas, una
presente sin declarar, y una persona sin empresa— y los tres avisos salen
correctos. Sin errores de consola.*

---

## 4 · «Miembros» no listaba miembros de la obra

La pantalla que había llamada **Miembros**, dentro de una obra, llamaba a
`/api/users` y enseñaba **usuarios de la instancia** — es decir, gente de otros
proyectos. Es justo la confusión que esta pieza tenía que evitar.

No se le quitó ninguna capacidad (sigue sirviendo para cambiar el rol global):
**se le puso el nombre que le corresponde**, «Usuarios del sistema», con una
línea que remite a Participantes. Dos preguntas distintas, dos pantallas.

---

## 5 · Las cinco comprobaciones que pedía el alcance

| | |
|---|---|
| **1. Aislamiento entre obras** | El residente de A recibe **403** en los participantes y en los miembros de B; en la lista de A **no aparece** quien sólo está en B |
| **2. Misma empresa, funciones distintas** | La misma empresa es **CONTRATISTA en A y PROYECTISTA en B**, a la vez |
| **3. La función no da permisos** | Se le pone la función más alta (ENTIDAD) a un `viewer`: **su rol no se mueve**, **no entra en ninguna obra nueva**, y **sigue sin poder escribir el directorio** |
| **4. No reescribe históricos** | Con un RFI, un Red Line y una Review cerrados: se **cambia** la función y se **quita** la empresa del directorio — los tres siguen **byte a byte iguales**, y nadie sale de la obra |
| **5. Los selectores resuelven** | Un no administrador obtiene los miembros de su obra **con identidad**, empresa, `company_id`, función derivada y perfil; quien no tiene empresa **no tiene función inventada** |

Y tres más que salieron solas: sólo un administrador escribe el directorio; sólo
se cambia la empresa de quien **participa en esta obra**; y un encargo dirigido a
una función **no mete a nadie en la obra** —alcanza sólo a quien ya era miembro—.

---

## 6 · Dos defectos encontrados

### 6.1 · La pantalla habría dado 500 en desarrollo local

Con `ALLOW_DEMO_TOKEN=true` —el atajo documentado para desarrollo— la sesión vale
`{'id': 'demo'}`. `funcion_de` comparaba ese texto con `users.id`, que es entero:
**PostgreSQL aborta la consulta y `/participantes` devuelve 500**. Ahora una
sesión sin identidad numérica responde «ninguna función», que es la verdad, en
vez de romper.

### 6.2 · `pytest` desde la raíz escribe en la base REAL

Lo detectó la comparación de invariantes: apareció una fila en `photo_evidences`
que yo no había creado.

**`test_tracking.py`, en la raíz del repositorio, no es una prueba: es un
script.** Su cuerpo se ejecuta al importarse, carga el `.env` real y hace un
`INSERT` con `model_urn = '1_CANAL'` —un alcance real—. Basta con lanzar `pytest`
desde la raíz para que escriba, **aunque la ejecución se aborte después**.

Fila retirada (`pin_id='test-pin-1'`, `filename='test.jpg'`, URL a localhost) e
invariantes de nuevo en **0 diferencias**. Es anterior a esta sesión y queda
señalado como tarea aparte, junto con `test_ingestor.py` (import roto) y
`backend/test_filter.py` (pide un servidor vivo). **La suite buena es
`backend/tests`.**

---

## 7 · Pruebas

| | resultado |
|---|---|
| **Suite completa** (`backend/tests`) | **876 pasan · 0 fallan** |
| **Ensayo de participantes** *(nuevo)* | **33 / 33** |
| Red Line · Desacople · RFI | **58/58** · **22/22** · **49/49** |
| Revisiones · Encargos · Dos obras | **50/50** · **31/31** · **16/16** |
| **Invariantes vs. cierre de F1** | **0 diferencias** |
| Build · fragmento propio | correcto · `ParticipantesModule-*.js` (carga perezosa) |
| **Verificación en navegador** | los 5 casos y los 3 avisos, sin errores de consola |

---

## 8 · Lo que deliberadamente NO se construyó

Account global · portfolio · directorio corporativo transversal · jerarquías ·
SSO/SCIM · invitaciones enterprise · plantillas · ningún sistema de permisos
nuevo · ninguna tabla nueva · ninguna fuente de verdad duplicada.

**1 endpoint · 1 pantalla · 2 campos añadidos a una respuesta existente.**

---

## 9 · Deuda declarada

1. **La empresa de una persona es global** y se edita desde una pantalla de obra.
   Es correcto —una persona trabaja para una empresa— pero conviene saberlo: el
   endpoint lo devuelve como `alcance: 'global'` y la pantalla lo advierte.
2. **`companies` sigue con basura de antes**: contiene una obra
   (`INTERFERENCIAS`) y una fila `'x'`. No se toca: puede haber usuarios reales
   apuntando ahí, y la limpieza es decisión del propietario.
3. **No se pueden crear empresas desde esta pantalla**: se eligen del catálogo
   (`/api/companies`). Crearlas es administración de la instancia.

---

**STOP.** No avanzo a F3. No se tocó `frontend-react`, 3D, 4D, LOB ni Issues.
