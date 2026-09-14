# Rol del usuario y Configuración de permisos · por qué no podía entrar, subir ni abrir

13-sep-2026. Dos pantallas del portal, en PQT8_TALARA:
- **Rol:** en «Usuarios del sistema», la columna «Rol», con Ver, Usar, Editar o Administrador.
- **Configuración de permisos:** botón derecho sobre una carpeta → «Configuración de permisos» → «Conceder acceso», con Ver, Ver y descargar, Comentar, Editar o Administrar.

Las preguntas del propietario:
1. Una persona con rol «Usar» (o «Ver») y «Administrar» en la carpeta «06_INF. DE ESTUDIO DE HIDRAULICA», desde otra PC, a veces no podía subir ni abrir.
2. «Le di Administrar en Configuración de permisos y seguía bloqueado. Solo cuando le pongo Editar o Administrador en la columna Rol se activa. ¿Por qué? ¿Hay conflicto?»

Solo diagnóstico. No he cambiado código, ni producción, ni la configuración de Render. Las dos reproducciones (§2 y §5.1) son locales.

## En corto

1. **Sí: hoy, con rol «Ver», la persona no llega a la carpeta aunque le des «Administrar» en Configuración de permisos. Es un defecto.** Lo que configuraste funciona dentro de la carpeta. Pero no le abre las carpetas de arriba, por ejemplo 02_SHA_Compartido, y esas las decide el Rol.
2. **Por eso con el rol «Editar» parece que se activa — DEFECTO, reproducido.**
   - En tu obra, la raíz tiene 01_WIP_Trabajo_En_Curso, 02_SHA_Compartido, 03_PUB_Publicado_Para_Construccion… La carpeta «06_INF…» está dentro de alguna de ellas.
   - Esas carpetas de arriba no tienen Configuración de permisos para esa persona, así que las decide su Rol.
   - Con rol «Usar» o «Ver» salen en gris y no se abren: no tiene camino hasta «06_INF…».
   - Con rol «Editar» se abren, pero porque ese rol le da **editar en todas las carpetas de la obra sin Configuración de permisos**. No activa lo que configuraste: le abre todo lo demás.
   - Con rol «Administrador» pasa lo mismo, en grande: pasa a ser administrador de la entidad.
3. **No podía subir por otro defecto del portal.** El servidor sí le dejaba. Pero el botón «Cargar archivos» solo aparece a quien **administra la obra**, tenga el rol que tenga.
4. **Si lo que no abría eran planos CAD** (DWG, RVT, NWD, IFC…), **es un tercer defecto, ya reproducido.** El visor web de planos solo abre al administrador de la entidad.

## 1 · Tres cosas distintas

| | Dónde se pone | Qué alcanza |
|---|---|---|
| **Rol** | Usuarios del sistema → columna «Rol» | Toda la entidad, en todas las obras |
| **Configuración de permisos** | Archivos → botón derecho sobre la carpeta → Configuración de permisos → Conceder acceso | Esa carpeta y todo lo que cuelga de ella, para una persona, una empresa o una función contractual |
| **Administrar la obra** | Participantes → casilla «administra esta obra» | Todo dentro de esa obra: carpetas, participantes y permisos. **No es lo mismo** que «Administrar» en una carpeta |

**Qué hace hoy cada Rol**, medido en el código:

| Rol | En las carpetas sin Configuración de permisos | Además |
|---|---|---|
| Ver | nada | — |
| Usar | nada | — |
| Editar | Editar y subir | Importar el plan de entregas MIDP/TIDP (`backend/routes/plan_entregas.py:59`) |
| Administrador | todo | Es el administrador de la entidad: todas las obras, los usuarios y la configuración |

Hoy «Ver» y «Usar» hacen exactamente lo mismo: ningún sitio del código los distingue (`backend/folder_permissions.py:31-36`).

**Cómo se decide qué puede hacer una persona en una carpeta o en un documento** (`backend/permiso_documental.py:269-369`):
1. Quien administra la obra, o la entidad, puede todo.
2. Si no, se mira la Configuración de permisos de esa carpeta; para un documento, la de la carpeta que lo contiene. Si ahí no hay nada para esa persona, se mira la carpeta de arriba, y así hasta la raíz. **La primera carpeta con algo configurado para ella decide.**
3. En esa carpeta gana lo más concreto: persona, luego empresa, luego función. «Restringido» deniega.
4. Si no hay nada configurado en toda la cadena hacia arriba, manda el Rol (tabla de arriba).

Solo se mira hacia arriba, nunca hacia abajo. Lo que configures en una subcarpeta no dice nada de las carpetas que la contienen.

## 2 · Por qué con el rol «Editar» se activa — DEFECTO, reproducido

**Lo que pasa, paso a paso**, con una obra como la tuya:

```
RAÍZ
 ├─ 01_OTRA_CARPETA                        sin Configuración de permisos
 ├─ 02_ESTUDIOS                            sin Configuración de permisos
 │    └─ 06_INF. DE ESTUDIO DE HIDRAULICA  Persona → Administrar
 └─ 07_EN_LA_RAIZ                          Persona → Administrar
```

1. La lista de una carpeta enseña todas sus subcarpetas y marca cada una según lo que la persona puede hacer en ella (`backend/file_system_db.py:205-232`).
2. «02_ESTUDIOS» no tiene Configuración de permisos, y su cadena hacia arriba tampoco. Decide el Rol: con «Usar» o «Ver», nada.
3. En la lista, una carpeta sin acceso sale en gris y el doble clic no hace nada (`frontend-docs/src/MatrixTable.jsx:263-267`).
4. Resultado: la persona ve «02_ESTUDIOS» en gris y no puede llegar a «06», aunque en «06» sea administradora.

**Reproducción en el banco local:**
- Rutas reales, con el control por obra encendido.
- La Configuración de permisos se concede con la misma llamada que usa la pantalla «Conceder acceso».
- La misma persona, miembro de la obra, mira la obra con cuatro roles.
- **Resultado: 56/56 comprobaciones como predice el código.**

| Qué ve la persona | Rol Ver o Usar | Rol Editar | Rol Ver + administra la obra |
|---|---|---|---|
| En la raíz, «02_ESTUDIOS» (camino hacia 06) | **gris, no abre** | abre | abre |
| En la raíz, «01_OTRA_CARPETA» (nada que ver con 06) | gris | **abre, y puede editar** | abre |
| Dentro de 02, «06_INF…» (lo que configuraste) | abre | abre | abre |
| Dentro de 06: subcarpetas y archivos | se ven y abren | igual | igual |
| Subir en 06, según el servidor | deja | deja | deja |
| Subir en «01_OTRA_CARPETA», según el servidor | no deja | **deja** | deja |
| Botón «Cargar archivos» | oculto | oculto | visible |
| Carpeta configurada directamente en la raíz («07») | abre | abre | abre |

Lo que dice la tabla:
- **Tu Configuración de permisos funcionaba.** Dentro de 06, con rol «Usar», todo se veía y se abría, y el servidor dejaba subir.
- **Lo que estaba bloqueado era el camino.** Si la carpeta estuviera directamente en la raíz, como «07», no habría pasado.
- **El rol «Editar» no arregla eso: lo tapa.** Le da editar en «01_OTRA_CARPETA» y en cualquier carpeta de la obra sin Configuración de permisos. **No lo uses para esto.**

**Dos detalles más:**
- El árbol de la izquierda no mira el gris. Según el código, desde ahí sí puede entrar en «02_ESTUDIOS» y bajar hasta «06» (`frontend-docs/src/components/FolderNode.jsx:184`). No lo he probado en pantalla.
- Cambiar el Rol cierra las sesiones de esa persona, y al volver a entrar se carga todo de nuevo (`backend/routes/auth.py:1326-1328`). Conceder en Configuración de permisos no las cierra: si tenía el portal abierto, que recargue.

**Mientras no se corrija:**
- Que entre por el árbol de la izquierda hasta la carpeta.
- O, en la carpeta de arriba, dale «Ver» en Configuración de permisos y «Restringido» en las subcarpetas que no deba ver. Ojo: con «Ver» arriba también ve los archivos sueltos de esa carpeta.
- «Comprobar el permiso de una persona» sobre la carpeta de arriba te dirá justo esto: no hay nada configurado para ella y manda su Rol.

## 3 · El servidor sí le dejaba

Con «Administrar» en Configuración de permisos y rol «Usar» o «Ver»:

| Acción | Qué exige el servidor | ¿Le deja? |
|---|---|---|
| Abrir | Ser participante de la obra y tener «Ver» (`routes/documents.py:358`, `:378`) | Sí |
| Subir | «Editar» en la carpeta de destino (`routes/uploads.py:69`) | Sí |
| Crear carpeta, renombrar, mover | «Editar» (`routes/documents.py:1066`, `:1292`, `:1401`) | Sí |
| Eliminar, ver y cambiar permisos | «Administrar» (`routes/documents.py:1249`, `:2720`, `:2758`) | Sí |

## 4 · Por qué no pudo subir — DEFECTO del portal

El portal decide con «administra esta obra», no con la Configuración de permisos de la carpeta:

| Qué | Qué le pasa a quien no administra la obra |
|---|---|
| Botones «Cargar archivos» y «Nueva carpeta» (`pages/FilesPage.jsx:1043-1052`) | No aparecen |
| Arrastrar archivos a la carpeta (`hooks/useFileExplorer.js:641-645`) | Sale «Solo un administrador de esta obra puede cargar archivos.» |
| «Desplazar», en la barra o con el botón derecho (`hooks/useFileExplorer.js:469`) | Elige el destino, confirma y no pasa nada |
| «Suprimir» en la barra, o sobre un solo elemento con el botón derecho (`hooks/useFileExplorer.js:562`, `:425`) | No pasa nada, sin aviso |
| «Añadir subcarpeta» y «Configuración de permisos» (`components/ContextMenu.jsx:76-87`) | No aparecen |

Además hay incoherencias:
- «Desplazar» y «Suprimir» se **activan** según la Configuración de permisos (`utils/capacidadesDeSeleccion.js`), pero la acción de debajo exige administrar la obra.
- «Suprimir» sobre **varios** elementos con el botón derecho sí llega al servidor, y funciona.
- «Cambiar nombre» funciona, porque no pasa por esa comprobación.

**Cambiarle el rol a «Editar» tampoco enseña esos botones.** En la reproducción del §2, «Cargar archivos» sale oculto con Ver, Usar y Editar, y visible solo con «administra esta obra».

## 5 · Por qué a veces no podía abrir

**Si el archivo aparece en la lista, ya puede abrirlo.** La lista y la apertura consultan la misma regla, y la lista quita lo que no se puede abrir (`backend/file_system_db.py:213`, `:236`). Si un archivo aparece y no abre, la causa no es su Configuración de permisos.

### 5.1 · Planos CAD en la web — DEFECTO, reproducido

1. Al abrir un DWG, RVT, NWD, IFC…, el visor llama a dos rutas, `cad/translate` y `cad/status`, y solo les pasa el id del archivo (`components/CadViewer.jsx:419`, `:460-463`).
2. El control central por obra no sabe sacar la obra de ese id en estas dos rutas (`backend/perimetro_de_obra.py:138-151`).
3. Con el control encendido, corta con 403 antes de llegar a la ruta (`backend/auth_middleware.py:874-894`). Solo se salta ese control el rol Administrador (`:867`).

| Quién | Qué ve al abrir un plano |
|---|---|
| Administrador de la entidad (tú) | El plano |
| Todos los demás, también quien administra la obra | «No se pudo determinar a qué obra pertenece esta petición.» |

El control por obra está encendido en producción desde la ventana del 22-ago (`docs/entidad/65-cierre-de-la-controlled-window.md`). No lo he vuelto a mirar en Render.

**Reproducción local:**
- Usa el control y las rutas reales, con identidades ficticias, sin base y sin red.
- **Resultado: 9/9 como se esperaba, en los dos modos de política.**

| Caso | Respuesta |
|---|---|
| Rol Editar o Ver, miembro de la obra: `translate` y `status` | 403 `PROJECT_UNRESOLVED` |
| Administrador de la entidad | Pasa |
| El mismo Editar, pasando la obra en la petición (control) | Pasa |
| El mismo Editar, con el control apagado | Pasa |

«Pasa» quiere decir que llega a la ruta, que en la prueba contesta 404 porque no hay base.

**Aviso para la corrección:** esas dos rutas tampoco comprueban la Configuración de permisos (`backend/routes/docs_cad.py:615-716`, `:779-836`).
- Hoy no hay fuga, porque el control corta a todos menos al administrador de la entidad.
- Pero si solo se arregla lo de la obra, cualquier miembro podría ver el plano de una carpeta sin acceso, sabiendo su id.
- Por eso las dos cosas se arreglan juntas.

**Qué puede hacer esa persona mientras tanto:**
- «Abrir en Civil 3D / Revit», que va por otra ruta que sí lleva la obra (`components/DocumentViewer.jsx:296`, `:427`). Necesita el Conector ALEPHIA instalado en esa PC.
- O «Descargar el archivo original», desde la misma pantalla del error (`components/CadViewer.jsx:574-585`).

### 5.2 · Otros casos

- **Word, Excel y PowerPoint** se ven con el visor de Microsoft (`components/DocumentViewer.jsx:577`). Si esa PC o su red no llegan a Microsoft, no se ven.
- **Si el archivo ni siquiera aparece**, hay tres posibilidades:
  - una Configuración de permisos más cercana, por ejemplo una subcarpeta con «Ver» o «Restringido» para él, su empresa o su función;
  - el archivo está en una carpeta a la que no llega lo que configuraste (el §2 explica por qué);
  - la visibilidad ISO estricta, si está activada: esconde lo que está en «Trabajo en curso» a quien no administra la obra (`backend/file_system_db.py:92`, `:235`). No he leído la configuración de producción.
- **En tu captura de «Conceder acceso», esa carpeta decía «0 reglas en esta carpeta».** Si la captura es de después de conceder, lo que configuraste quedó en otra carpeta.
- **Para salir de dudas:** abajo del panel de Configuración de permisos está «Comprobar el permiso de una persona». Dice qué puede hacer esa persona y qué configuración gana.

## 6 · Qué propongo

**C · Que la Configuración de permisos abra el camino** (servidor y portal):
- una carpeta sin acceso que lleva a otra donde la persona sí tiene acceso se puede abrir **solo como camino**;
- dentro se ven las subcarpetas que llevan hasta allí, pero no sus archivos ni el resto;
- así nadie tiene que tocar el Rol para llegar a su carpeta.

**A · Que los planos CAD abran a todo el que tenga acceso** (servidor, cambio pequeño):
- el control central saca la obra del propio archivo en `cad/translate` y `cad/status`, como ya hace con versiones y trazabilidad;
- las dos rutas exigen «Ver» sobre el documento, con la misma regla que abrir un PDF;
- una prueba lo deja fijado.

**B · Que el portal siga la Configuración de permisos** (portal):
- «Cargar archivos», «Nueva carpeta» y arrastrar, con «Editar» en la carpeta abierta;
- mover y renombrar con «Editar»; eliminar y gestionar permisos con «Administrar»;
- si falta permiso, se dice; nunca un clic que no hace nada;
- «Publicar al visor» sigue siendo solo de quien administra la obra, porque gasta créditos de Autodesk.

Las tres van con pruebas y banco local antes de nada. Commit, push y despliegue, solo con tu autorización.

**Mientras no se corrija:**
- Para llegar a la carpeta: por el árbol de la izquierda (§2).
- Para subir: márcale «administra esta obra» en Participantes. Ojo: le da todo en esa obra.
- Para planos CAD en la web ni eso basta: «Abrir en Civil 3D / Revit» o descargar.
- **No uses el rol «Editar» como atajo**: abre todas las carpetas de la obra sin Configuración de permisos.

**Decisión tuya:** ¿hago C, A y B? Recomiendo **C y A primero**: las dos impiden llegar a lo que ya concediste.

## 7 · Qué cambia exactamente la corrección C

Con la persona del caso: rol «Ver» y «Administrar» en una carpeta dentro de 02_SHA_Compartido.

| | Qué le pasa en 02_SHA_Compartido | ¿Llega a su carpeta? | ¿Ve cosas que no le diste? |
|---|---|---|---|
| **Hoy** | La carpeta sale en gris: no puede entrar | No | No |
| **Truco de hoy:** «Ver» en 02_SHA_Compartido | Entra y ve todo lo que hay dentro | Sí | **Sí: todo 02_SHA_Compartido, sin poder cambiarlo** |
| **Con la corrección C** | Entra, pero dentro solo puede abrir la carpeta que lleva a la suya. No ve archivos, y las demás subcarpetas siguen en gris | Sí | No |

Lo único que cambia: las carpetas del camino hasta la suya dejan de salir en gris para esa persona. No se le da ningún permiso nuevo.

## 8 · Por qué hay dos sitios para dar permisos

**Es herencia de cómo creció el sistema, no una decisión de producto.**

1. **Al principio el acceso se decidía con el Rol**, global para toda la instancia: el mismo en todas las obras y carpetas, sin roles por obra (`docs/entidad/18-cierre-de-seis-puntos-foundation-v2.md:383-386`, `:512`).
2. **La Configuración de permisos por carpeta estaba montada encima del Rol.** Se sumaban las carpetas y el Rol hacía de mínimo (`docs/entidad/40-modelo-de-acceso-objetivo-frontend-docs.md:204-207`). Con rol «Editar», ninguna carpeta se podía cerrar para esa persona. Casi no se usaba: cuando se añadieron empresas y funciones, había una sola regla en toda la instancia (`backend/folder_permissions.py:74-75`).
3. **El 21-ago se cambió la regla.** Lo configurado en la carpeta pasó a mandar. El Rol dejó de ser un mínimo y quedó como valor por defecto donde no hay nada configurado (`docs/entidad/40-modelo-de-acceso-objetivo-frontend-docs.md:242-258`, `docs/entidad/41-cierre-de-foundation-de-acceso.md:48-51`).

Resultado: hoy los dos sitios deciden sobre carpetas y se pisan. Por eso confunde.

**Lo que propongo (D, decisión tuya):**
- **Rol:** solo dice si la persona es Administrador de la entidad o un usuario normal. Deja de dar acceso a carpetas.
- **Configuración de permisos:** el único sitio para las carpetas.
- **Participantes, «administra esta obra»:** quién administra cada obra.
- «Ver» y «Usar» no hacen falta como dos opciones: hoy hacen lo mismo.

**Antes de hacerlo:** quien hoy entra en carpetas solo gracias al rol «Editar» dejaría de entrar. Primero hay que darle ese acceso en Configuración de permisos. Por eso D va después de C, con la lista de usuarios delante.

## Evidencia

Los dos scripts están en el scratchpad de la sesión y ninguno se commitea:

| Script | Qué prueba | Resultado |
|---|---|---|
| `permisos/ensayo_perfil_vs_carpeta.py` | El §2, en el banco 127.0.0.1:55461 con base de ensayo y `ecd_app` | 56/56 |
| `permisos/repro_cad_perimetro.py` | El §5.1, sin base ni red | 9/9, en los dos modos de política |

`ensayo_perfil_vs_carpeta.py` borra lo que crea al terminar. Solo quedan las filas del registro de accesos, que `ecd_app` no puede borrar.
