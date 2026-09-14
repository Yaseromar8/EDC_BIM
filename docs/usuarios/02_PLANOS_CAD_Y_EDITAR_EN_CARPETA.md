# Planos CAD para todos y «Editar» en la carpeta · listo en local

14-sep-2026. Lo que pediste para que el equipo empiece a trabajar en el ECD:
1. Que todos los usuarios puedan ver archivos CAD o Revit.
2. Que quien tenga permiso de Editar pueda subir archivos o reemplazarlos.

**Estado:** probado en local y commiteado con tu autorización. **Falta el push y el despliegue**, cada uno con su autorización (§5).

## 1 · Qué cambia para tu equipo

| Antes | Ahora |
|---|---|
| Un DWG, RVT, NWD o IFC solo se veía en la web si eras administrador de la entidad. Los demás veían «No se pudo determinar a qué obra pertenece esta petición». | Lo ve todo el que puede abrir ese archivo: ser participante de la obra y tener al menos «Ver» en su carpeta. |
| «Cargar archivos» y «Nueva carpeta» solo aparecían a quien administra la obra. | Aparecen en las carpetas donde la persona tiene «Editar» o «Administrar». |
| Para reemplazar un archivo había que subir otro con el mismo nombre exacto. | Botón derecho sobre el archivo → **«Subir nueva versión»**. Eliges el fichero en tu PC y entra como versión nueva de ese documento, sin renombrarlo. Tiene que ser del mismo tipo: un .pdf sobre un .pdf. |
| «Añadir subcarpeta», «Cambiar nombre» y editar la descripción eran solo para quien administra la obra. | Con «Editar» en la carpeta. |
| «Desplazar» y «Suprimir» se ofrecían, pero al pulsarlos no pasaba nada si no administrabas la obra. | Funcionan según el permiso: desplazar con «Editar», suprimir con «Administrar». Si falta permiso, el menú lo dice. |

**Lo que NO cambia:**
- «Publicar al visor» sigue siendo solo de quien administra la obra, porque gasta créditos de Autodesk.
- «Configuración de permisos» sigue siendo solo de quien administra la obra.
- La columna «Rol» de Usuarios del sistema no cambia de significado. Eso quedó para después.

## 2 · Seguridad que va con esto

- **Planos:** traducir un plano o consultar su traducción exige ahora, además de ser de la obra, tener «Ver» en la carpeta del plano. Antes esas dos rutas no lo miraban. No se notaba porque solo entraba el administrador de la entidad.
- **Desplazar:** hace falta «Editar» también en la carpeta de destino. Antes solo se miraba lo que se movía.

## 3 · Pruebas en local

| Prueba | Resultado |
|---|---|
| Pruebas nuevas del servidor (planos y editar) | 14 de 14 |
| Batería completa del servidor | 1841 correctas y 1 fallo que ya existía antes de este cambio (`test_capacidades_con_puerta`) |
| Base de pruebas con las rutas reales y el control por obra encendido | 21 de 21 |
| Pruebas del portal | 6 bancos en verde, con 5 comprobaciones nuevas |
| Revisión de código del portal (eslint) | ningún aviso nuevo |
| Construcción del portal | correcta |

**Qué comprueba la base de pruebas:**
- **Planos:**
  - la persona con «Editar» abre el plano de su carpeta;
  - no abre uno de una carpeta «Restringida», ni uno de una carpeta sin regla;
  - quien no es de la obra no abre nada;
  - la administradora de la entidad sigue abriendo;
  - un plano que no existe no da pase.
- **Editar:**
  - el listado dice «Editar» en su carpeta y en sus subcarpetas, y nada arriba ni en la restringida;
  - el servidor le deja subir en su carpeta y no en otra;
  - desplazar a una carpeta sin permiso o restringida da 403; a una subcarpeta suya, funciona.

**En pantalla, en el banco.** Usuario de rol «Usar» con «Editar» en `03_Documentos`:

| Dónde | Qué ve |
|---|---|
| Raíz y `02_SHA_Compartido` | Sin «Cargar archivos» |
| `03_Documentos` | «Cargar archivos» y «Nueva carpeta» |
| Botón derecho sobre un PDF | «Subir nueva versión», «Cambiar nombre» y «Desplazar» activos. «Suprimir» apagado: «Necesitas permiso de administración en esta carpeta» |

**No probado:**
- **Subir un fichero de verdad desde la pantalla.** El banco no tiene almacenamiento de Google, y el navegador de pruebas no deja elegir ficheros. La ruta de subida es la de siempre y exige «Editar», que sí está probado arriba.
- **Ver un plano ya traducido.** El banco no tiene credenciales de Autodesk. Lo probado es que la petición pasa todas las comprobaciones y llega a Autodesk.

## 4 · Ficheros

- **Backend:**
  - `perimetro_de_obra.py`, `auth_middleware.py`, `routes/docs_cad.py` y `routes/documents.py`;
  - pruebas `test_planos_para_todos.py` y `test_editar_en_carpeta.py` (nuevas) y `test_cobertura_autorizacion.py`.
- **Portal:**
  - `utils/capacidadesDeSeleccion.js` y su prueba;
  - `hooks/useFileExplorer.js`, `components/ContextMenu.jsx`, `MatrixTable.jsx` y `pages/FilesPage.jsx`.

**Ojo con `pages/FilesPage.jsx`.** Ya tenía cambios sin commitear que no son míos: la barra lateral en modo iconos. En el commit entraron solo mis líneas, que son los dos botones, el selector de «Subir nueva versión» y la opción del menú. Esos otros cambios siguen como estaban, sin commitear.

## 5 · Para ponerlo en producción (autorización tuya en cada paso)

1. **Commit: hecho**, sin trailer, con tu «SI». Entraron también los documentos pendientes del cierre de E1.2.
2. **Push.**
3. **Manual Deploy del backend** `visor-ecd-backend-va`. Después se comprueba `/api/health` y «Booting worker» en el log. Con este paso ya se ven los planos CAD.
4. **Manual Deploy del portal** `visor-ecd-portal`. Con este paso aparecen «Cargar archivos», «Nueva carpeta» y «Subir nueva versión» a quien tiene «Editar».

El backend va primero. Mientras el portal nuevo no tenga el backend nuevo, los botones siguen escondidos como hoy; pero «Desplazar» ya se ofrecería sin la comprobación del destino.
