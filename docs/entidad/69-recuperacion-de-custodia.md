# PROCEDIMIENTO DE RECUPERACIÓN DE CUSTODIA — DECISIÓN A, RAMA «C AHORA»

**Estado: PREPARADO Y PROBADO EN DIAGNÓSTICO contra producción (22-ago-2026).**

Cierra la condición de la decisión A del PASO 14: un solo Entity Admin, pero con
salida verificable.

---

# 1 · LO QUE SE CORRIGE DE LA EVALUACIÓN INICIAL

Al plantear la decisión A dije que la recuperación *«depende de credencial de
base de datos que hoy tampoco tienes a mano»*. **Medido, es más favorable:**

| | |
|---|---|
| **No hace falta el superusuario `postgres`** | La recuperación corre con `ecd_app`, y se comprobó que tiene lo justo: `UPDATE` sobre `users`, `SELECT` sobre `totp_recuperacion`, `DELETE` sobre `sessions`. Ningún permiso de DDL |
| **Esa credencial SÍ está a mano** | Es la de `DB_PASS` del servicio en Render |
| **Y hay una capa anterior** | La cuenta tiene **8 códigos de recuperación de 2FA sin usar** |

La clave perdida de `postgres` (residual #9) **no bloquea la recuperación de la
custodia**. Sigue haciendo falta para los lotes del migrador (sql/06), que es
otro asunto.

# 2 · LOS TRES NIVELES, EN ORDEN

### Nivel 1 — Solo se perdió el teléfono → **códigos de recuperación**
En la pantalla del segundo factor, escribir **uno de los 8 códigos** en lugar del
código de 6 cifras. Son de un solo uso. No hace falta ninguna herramienta.

> **Condición de este nivel:** que los códigos estén guardados fuera de la
> plataforma (gestor de contraseñas, papel en sitio seguro). Se emitieron al
> activar el 2FA el 20-ago-2026. **Si no se guardaron, este nivel no existe** y
> se pasa directo al 2 — conviene comprobarlo hoy, no el día del incidente.

### Nivel 2 — Contraseña olvidada, con correo accesible → **el flujo normal**
«¿Olvidaste tu contraseña?» → enlace de un solo uso (cerrado el 22-ago: la huella
del hash lo mata al canjearse) → contraseña nueva → todas las demás sesiones se
cierran solas.

### Nivel 3 — **Romper el cristal**: `herramientas/recuperar_custodia.py`
Cuando lo anterior no está disponible. Requiere la credencial `ecd_app` y acceso
a un terminal con el repositorio.

```bash
# 1. Mirar sin tocar (siempre primero)
python herramientas/recuperar_custodia.py --diagnostico

# 2. Reponer la contraseña (se teclea; nunca por argumento ni entorno)
python herramientas/recuperar_custodia.py

# 3. Si además se perdió el segundo factor y sus códigos
python herramientas/recuperar_custodia.py --retirar-2fa

# 4. Si la cuenta estaba desactivada por error
python herramientas/recuperar_custodia.py --retirar-2fa --reactivar
```

Con `ADMIN_EMAIL` y las variables de conexión en el entorno (`DB_HOST`,
`DB_PORT`, `DB_NAME`, `DB_USER=ecd_app`, `DB_PASS`).

**Qué hace y qué no:** repone la contraseña, opcionalmente retira el 2FA y
reactiva la cuenta, **revoca todas las sesiones** y deja asiento
`recuperacion_de_custodia` en `auth_events`. **No crea administradores, no cambia
el rol de nadie y no toca ninguna cuenta que no sea `ADMIN_EMAIL`** — nombrar un
custodio nuevo es decisión del propietario, no de un guion de emergencia.

**Después:** volver a activar el segundo factor desde Seguridad. El propio guion
lo recuerda al terminar.

# 3 · PRUEBA REALIZADA

`--diagnostico` contra producción, 22-ago-2026. Leyó el estado real de la cuenta
custodia (`id 2 · rol=admin · activa · 2FA activo · 8 códigos sin usar · 13
sesiones vivas`) **sin cambiar nada**.

**Lo que NO se ha probado, y se dice:** la ejecución en caliente (reponer
contraseña de verdad). Probarla exigiría cambiar la contraseña real del
propietario, que es precisamente lo que no se hace por ensayar. La ruta de
escritura es la misma que el guion `set_admin_password.py` ya usaba y las
mismas sentencias que la aplicación ejecuta a diario.

# 4 · GATE PRE-PILOTO REGISTRADO — SEGUNDO ENTITY ADMIN

**Obligatorio antes de que entren usuarios externos reales.** No es adjudicación
automática: se designa cumpliendo previamente **todas** estas condiciones:

```
cuenta reclamada y activa
2FA activo
identidad humana conocida
necesidad real de custodia DE ENTIDAD
aceptación explícita del propietario
```

**Candidato actual: Fabián Serrano (id 17)** — por ser la única cuenta ajena al
propietario con uso sostenido. **Candidato, no adjudicado.** Hoy le faltaría el
2FA, y sobre todo la cuarta condición: administrar PQT8_TALARA **no** es
necesitar custodia de la entidad.

> **Principio fijado por el propietario:** `ENTITY ADMIN ≠ PROJECT ADMIN`. Ser
> candidato a administrar una obra no convierte a nadie en custodio de la
> instancia, ni al revés.
