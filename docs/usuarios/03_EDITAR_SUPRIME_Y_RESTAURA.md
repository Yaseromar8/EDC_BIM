# «Editar» suprime y restaura · listo en local

14-sep-2026. Pedido: «cuando en Configuración de permisos esté en Editar, ese usuario también pueda eliminar o restaurar. Después de eso hacemos commit de ambos».

**Estado:** probado en local: servidor, PostgreSQL y la app real del banco. **Commiteado** con tu autorización («VAMOS»), en dos commits junto con la corrección de la raíz de los enlaces (`docs/archivos/02_ENLACES_INFORME_DE_CIERRE.md`, §10). **Sin push ni despliegue** (§5).

## En corto

- **Con «Editar» en una carpeta ya se puede:**
  - **suprimir**, es decir, mandar a la papelera, uno o varios;
  - **restaurar** desde la papelera.

  Antes hacía falta «Administrar».
- **Salvaguarda para carpetas:** suprimir o restaurar una carpeta arrastra todo lo que tiene dentro. Si dentro hay una subcarpeta donde esa persona no tiene «Editar» («Restringido», «Ver»…), no se deja. Sale este aviso: «No puedes suprimir «A»: dentro hay carpetas en las que no tienes permiso de Editar.». La subcarpeta no se nombra.
- **No cambia:**
  - «Eliminar definitivamente» sigue siendo solo del administrador de la plataforma;
  - «Administrar» sigue haciendo falta para publicar o archivar y para la configuración de permisos;
  - «Ver», «Ver y descargar» y «Comentar» no suprimen ni restauran.

## 1 · Qué cambia

| Acción | Antes | Ahora |
|---|---|---|
| Suprimir, de uno en uno o varios a la vez | «Administrar» | «Editar» |
| Restaurar desde la papelera | «Administrar» | «Editar» |
| Suprimir o restaurar una carpeta que tiene dentro una subcarpeta donde no llegas a «Editar» | Con «Administrar» se hacía y arrastraba lo de dentro | No se deja, tampoco con «Administrar» en la carpeta. Solo quien administra la obra |
| Eliminar definitivamente | Administrador de la plataforma | Igual |
| Publicar o archivar documentos, configurar permisos | «Administrar» | Igual |

**Dónde se ve:**
- **Botón derecho** sobre un documento o una carpeta: «Suprimir» activo con «Editar».
- **Barra de la selección:** «Suprimir» activo.
- **Papelera:** «Restaurar».
- **Configuración de permisos:** la descripción de cada nivel.
  - «Editar»: «Ver, descargar, marcar, subir/editar, suprimir y restaurar archivos».
  - «Administrar»: «Todo lo de Editar, más publicar o archivar documentos y configurar permisos».

## 2 · Pruebas

| Prueba | Resultado |
|---|---|
| Batería completa del servidor, sin `.env` | 1896 correctas y 1 fallo que ya existía (`test_capacidades_con_puerta`). 13 pruebas nuevas |
| Ensayo nuevo contra PostgreSQL, con el control por obra encendido (`ensayo_de_editar_suprime_y_restaura.py`) | 19 de 19, sin errores en el registro |
| Pruebas del portal | 7 bancos en verde; `capacidadesDeSeleccion` 21/21, con las reglas nuevas y el mismo nivel que pide el servidor |
| ESLint de lo tocado | sin problemas |
| App real del banco, con una persona con «Editar» | ver abajo |

**El ensayo** (personas ficticias con reglas de carpeta reales):
- **Con «Editar»:** Editora suprime un documento, lo ve en la papelera y lo restaura.
- **Sin «Editar»:**
  - Lectora («Ver») no suprime ni restaura, y el aviso dice que hace falta Editar;
  - en una carpeta sin «Editar», nada.
- **En lote:** de dos documentos, suprime el que puede y dice «1 sin permiso».
- **Carpeta:**
  - Editora suprime `A/Sub` con su documento y la restaura entera;
  - Editora2, con «Restringido» en `A/Privada`, no puede suprimir `A`, ni de uno en uno ni en lote, y no se toca nada;
  - sí puede suprimir y restaurar un documento de `A`;
  - si el administrador suprime `A`, Editora2 no la puede restaurar y Editora sí.
- **Eliminar definitivamente:** Editora no puede.
- **Registro de actividad:** quedan las supresiones y restauraciones de Editora a su nombre.

**En la pantalla del banco** (persona «ENL Colega», con «Editar»):
- botón derecho sobre `PL-001.pdf`: «Suprimir» activo;
- confirmar: el documento sale de la tabla, y en la base queda en la papelera con el registro «delete» a su nombre;
- en «Papelera» aparece con «Restaurar»; al pulsarlo sale el aviso «Restaurado», vuelve a su carpeta y queda el registro «restore».

## 3 · Observación, sin tocar

La papelera enseña a cada miembro de la obra todo lo suprimido, también lo de carpetas que no ve. Ya era así antes de este cambio. Restaurar sí exige permiso. Si quieres que la papelera muestre solo lo que cada uno puede ver, va en otra entrega.

## 4 · Ficheros

- **Servidor:**
  - `permiso_documental.py`: nueva regla `subcarpetas_sin_nivel`;
  - `routes/documents.py`: suprimir, suprimir en lote y restaurar;
  - nuevos: `tests/test_editar_suprime_y_restaura.py` y `herramientas/ensayo_de_editar_suprime_y_restaura.py`.
- **Portal:** `utils/capacidadesDeSeleccion.js`, `components/AddPermissionModal.jsx` y `pruebas/capacidadesDeSeleccion.prueba.mjs`.
- **Documentos:** este informe y una nota en `02_PLANOS_CAD_Y_EDITAR_EN_CARPETA.md`.

## 5 · Para producción (autorización tuya en cada paso)

1. **Commit: hecho** («VAMOS»), en dos commits: la corrección de la raíz de los enlaces y este cambio.
2. **Push** desde tu terminal.
3. **Manual Deploy del backend** `visor-ecd-backend-va`: este cambio sí toca el servidor. Después compruebo `/api/health`.
4. **Manual Deploy del portal**, que lleva los dos cambios. Lo compruebo por contenido.
