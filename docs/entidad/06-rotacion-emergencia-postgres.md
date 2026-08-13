# Rotación de emergencia de la contraseña de `postgres`

**12 de agosto de 2026 · Hallazgo 0.1 · procedimiento independiente de la migración**

## Por qué va separado

La contraseña del rol `postgres` está publicada en dos repositorios públicos de
GitHub desde el 27 de mayo de 2026 y **sigue siendo válida**. Son 77 días durante
los cuales cualquiera pudo clonarla.

La separación de identidades (`ecd_app` / `ecd_migrator`) es un cambio arquitectónico
que necesita staging, ventana y verificación. **Esta rotación no puede esperar a
eso.** Se ejecuta sola, no toca roles ni propiedad de objetos, y deja la contraseña
pública inservible en minutos.

Mientras no se ejecute, todo lo demás es decorado: quien entre por la puerta de la
base con esa credencial se salta permisos, aislamiento y registro de auditoría, y
puede además borrar el rastro.

## Lo que este procedimiento NO hace

No crea roles. No transfiere propiedad. No cambia el código. La aplicación sigue
conectando como `postgres`, exactamente igual que hoy, solo que con otra contraseña.
Es deliberado: cuantas menos cosas cambien a la vez, más fácil es saber qué falló.

## Indisponibilidad esperada

**Entre 30 segundos y 2 minutos**, que es lo que tarda Render en reiniciar el
servicio tras guardar la variable. La base no se reinicia en ningún momento.

Si se cambia la contraseña y NO se actualiza Render, el backend deja de arrancar:
falla primero `alembic upgrade head` y después el pool de conexiones. Por eso los
pasos 1 y 2 van seguidos, sin pausa entre medias.

## Procedimiento

### Antes de empezar

Ten abiertas las dos pestañas: la consola de Cloud SQL y el panel de variables de
entorno de Render. Y genera la contraseña nueva **antes**, no durante:

```bash
python -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(32)))"
```

Guárdala en tu gestor de contraseñas. **No** en un fichero del repositorio, **no** en
el `.env` que se comparte, **no** en un mensaje.

### 1. Cambiar la contraseña en Cloud SQL

Consola de Google Cloud → SQL → tu instancia → Usuarios → `postgres` → Cambiar
contraseña. Pega la nueva.

Desde ese instante la contraseña pública deja de servir. El servicio en marcha
**no se cae todavía**: las conexiones ya abiertas del pool siguen vivas.

### 2. Actualizar Render, inmediatamente después

Panel de Render → tu servicio → Environment → `DB_PASS` → pegar la nueva → guardar.
Render redespliega solo.

### 3. Actualizar tu `.env` local

Para poder seguir trabajando desde tu equipo.

### 4. Comprobar que el servicio volvió

Abre el portal y entra. Si el backend arrancó, el pool conectó y la contraseña es
correcta.

### 5. Dejar evidencia de que la vieja ya no sirve

Este es el paso que cierra el hallazgo, y no se puede omitir: sin él no hay prueba,
solo una afirmación.

```bash
python backend/verificar_credencial_revocada.py
```

Intenta conectar con la contraseña antigua y espera un rechazo de autenticación.
Escribe el resultado con fecha y hora en `docs/entidad/evidencias/`. Si la conexión
**se establece**, la rotación no surtió efecto y hay que repetir el paso 1.

## Si algo sale mal

**El backend no arranca tras el paso 2.** Casi siempre es un error de copiado en la
variable. Vuelve a pegarla con cuidado. Si persiste, fija otra contraseña nueva
desde la consola de Cloud SQL y actualiza Render: **nunca vuelvas a poner la
expuesta**, ni siquiera temporalmente.

**No puedes entrar en la consola de Cloud SQL.** Ese es el verdadero respaldo y no
depende de ninguna contraseña de base de datos, sino de tu cuenta de Google. Si
también has perdido eso, es un incidente distinto y más grave.

## Después de esto

La contraseña nueva sigue siendo la de un rol propietario de las 87 tablas y
miembro de `cloudsqlsuperuser`. **Rotar reduce la exposición, no la resuelve.** Lo
que la resuelve es la separación de identidades, que va aparte y con su propia
verificación en staging.

Cuando esa separación esté hecha, `postgres` deja de estar en la aplicación y pasa a
ser exclusivamente break-glass: una credencial guardada fuera de línea, que no usa
ningún servicio y cuyo uso debería ser un hecho notable.
