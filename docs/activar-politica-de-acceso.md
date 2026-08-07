# Activar la política de acceso (deny-by-default)

Procedimiento para pasar de **sombra** a **estricto** sin dejar al equipo fuera.

## Qué cambia

El middleware decidía por **prefijo de path**. Eso falla en silencio: `'/api/projects'`
sin barra final tapaba también `POST /api/projects/<id>/users`, `POST /api/projects/join`
y `PUT/DELETE /api/projects/<id>`. Un prefijo es una afirmación sobre todas las rutas
que empiecen igual — incluidas las que nadie ha escrito todavía.

Ahora cada endpoint declara su política (`backend/politica.py`), con un valor por
defecto por blueprint y decoradores solo en las excepciones.

## Los dos modos

| `AUTH_POLICY_MODE` | Qué hace |
|---|---|
| `sombra` (por defecto) | Evalúa la política nueva y **registra** lo que bloquearía, pero manda la lógica antigua. Comportamiento idéntico al de hoy. |
| `estricto` | La política decide. |

## Procedimiento

**1. Desplegar en sombra.** No hay que hacer nada: es el valor por defecto. Confirmar
en el arranque que aparece `Política de acceso aplicada a N endpoints. Modo: sombra.`

**2. Dejarlo correr 48-72 horas de uso real**, cubriendo al menos una jornada de campo
con la APK y una sesión de trabajo en el portal de documentos.

> **Este paso tiene fecha de caducidad.** Si a las 72 h nadie ha leído los logs, se
> activa igual o se revierte, pero no se deja indefinidamente. El modo log-only de
> `ENFORCE_PROJECT_AUTHZ` lleva meses encendido y sus avisos no los ha leído nadie:
> un modo transitorio sin fecha se convierte en el estado permanente.

**3. Leer los logs de Render** y buscar estas tres marcas:

- `[politica SOMBRA cerraria]` — la política cerraría algo que hoy pasa. **Es lo que
  hay que revisar una por una.** Si el usuario es `anonimo` y la ruta escribe datos,
  perfecto: eso es justo lo que se quiere cerrar. Si el usuario es real y legítimo,
  falta clasificar bien esa ruta.
- `[politica SOMBRA abriria]` — la política abriría algo hoy cerrado. Debería estar
  vacío; si aparece, es un error de clasificación y hay que corregirlo **antes** de
  activar.
- `[SIN VERIFICAR]` (nivel CRITICAL) — una ruta respondió sin que nadie comprobara su
  política. Es el tripwire; no debería aparecer nunca.

**4. Activar.** En Render, `AUTH_POLICY_MODE=estricto`. Redesplegar.

**5. Comprobar en caliente** que siguen vivos los tres flujos que no tienen sesión:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://visor-ecd-backend.onrender.com/api/health
```

Debe dar `200`. Igual con `/api/token` (lo necesita el visor de Autodesk en las vistas
compartidas). Y abrir un enlace `?shareView=<uuid>` en una ventana privada: el modelo
tiene que cargar sin pedir login.

**Para revertir**: quitar la variable o ponerla en `sombra`. Vuelve al comportamiento
anterior sin tocar código.

## Cómo clasificar una ruta nueva

El defecto de su blueprint ya la cubre (casi siempre `SESION`). Solo hace falta
decorarla si es una excepción:

```python
from politica import publico, publico_en_lectura, requiere_sesion, requiere_rol

@app.route('/api/algo')
@publico(motivo='por qué esto puede verlo cualquiera sin sesión')
def algo(): ...
```

El `motivo` es obligatorio en lo público y hay un test que falla sin él: abrir una ruta
debe costar una frase. Si añades un blueprint nuevo, decláralo en
`POLITICAS_POR_BLUEPRINT`; si no, sus rutas caen a exigir sesión y el arranque avisa.
