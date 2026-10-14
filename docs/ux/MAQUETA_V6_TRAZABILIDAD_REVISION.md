# Maqueta v6 · consulta del documento y trazabilidad — revisión, 14-oct-2026

> El propietario: «me refería a la consulta de documento y toda su trazabilidad. ¿Puedes revisar la maqueta v6?»
>
> Maqueta: `docs/ux/maquetas/interior_v6_profundidad.html` (banco `http://localhost:5180/maqueta-v6.html`).
> Antecedente: `docs/ux/MAQUETA_V5_ANALISIS.md` §2.7. Solo análisis: no se tocó la app ni el backend.

## 1 · Qué muestra hoy la v6

Dos niveles de consulta, los dos sobre el mismo documento:

| Nivel | Cómo se abre | Qué enseña |
|---|---|---|
| **Panel «Lectura»** (a la derecha de la tabla) | Clic en una fila | Acciones (Abrir, Descargar, Ficha, Enviar a revisión) · **recorrido ISO 19650 con fechas** · **código leído** campo a campo · **«Todo lo conectado»** |
| **Ficha del documento** (pantalla completa) | «Ficha» o el nombre | Miga de pan · ‹ › entre documentos · Exportar · pestañas **Lectura · Versiones · Historial de cambios · Descargas · Relacionados**, con el recorrido y el código siempre visibles a la derecha |

**Lo bueno, que se queda:**
- La idea en dos niveles: un vistazo y, si hace falta, la ficha completa.
- El recorrido con fechas.
- El historial en forma «quién · cambio · de → a».
- Las versiones con su comentario.
- Pasar al siguiente documento sin volver a la lista.

## 2 · Lo que la v6 promete y el sistema no tiene (no se puede mostrar así)

| En la v6 | Realidad | Qué hacer |
|---|---|---|
| Relacionados → **«En el modelo»** (12 elementos en el IFC) | No existe vínculo entre un plano y elementos del modelo | **Quitarlo** de la v1 |
| Relacionados → **«Fotos de campo»** (4 fotos entre PK…) | Las fotos no se atan a documentos | **Quitarlo** de la v1 |
| Pestaña **«Descargas»** | El sistema registra que **se entregó el acceso**, no que la descarga terminara | Llamarla **«Accesos»** |
| **Historial de cambios** | `activity_log` se consulta **por nombre**: al renombrar un archivo se pierde lo anterior | La ruta nueva debe filtrar **por id del documento** |
| **Comentario de la versión** | No se guarda hoy | Opcional: columna nueva, con migración |

## 3 · Lo que el sistema SÍ tiene y la v6 no enseña (lo más valioso)

Esto es justo lo que da **trazabilidad de verdad**, y la v6 no lo aprovecha:

1. **Huella SHA-256 de cada versión** (`file_system_db.py`: se guarda al subir y, si falta, se calcula leyendo
   el objeto). Permite decir «esta es exactamente la V3 que se emitió, byte a byte». Ninguna de las
   plataformas de referencia lo pone a la vista.
2. **Registro de actividad encadenado** (`auditoria_encadenada.py`). Cada evento lleva la huella del anterior;
   si alguien altera o borra uno, la cadena se rompe y se ve **dónde**.
   - **Honestidad obligatoria** (lo dice el propio módulo): da **detectabilidad**, no inmutabilidad.
   - Se puede mostrar «registro íntegro desde…», pero **nunca «inmutable»**.
3. **Emisiones con su idoneidad y revisión** (`estados_ecd.py`). Son las fechas reales del recorrido.
4. **Enlaces dentro de Revisiones, Transmittals, RFI y Red Line** (JSONB con el id del documento). Son los
   «Relacionados» reales.

## 4 · Propuesta: cómo debería ser la consulta (v7 de la ficha)

Con nuestra identidad (paleta oficial e iconos de obra), y solo con lo que es real:

| Pestaña | Contenido | Fuente |
|---|---|---|
| **Resumen** | Vista previa, datos generales, recorrido con fechas, código leído | Emisiones y nomenclatura |
| **Versiones** | Versión, revisión, fecha, autor, **huella SHA-256** (abreviada, copiable) y «Abrir esta versión» | `versions` |
| **Trazabilidad** | Una sola **línea de tiempo** que junta estado, idoneidad, versión, revisiones, envíos, RFI y accesos, cada evento con **quién, cuándo y por qué** (enlace a la RV/TR/RFI que lo causó). Al pie: **«Registro íntegro»** (cadena verificada) o el punto exacto donde se rompe | `activity_log` por id + emisiones + JSONB |
| **Accesos** | Quién recibió acceso a qué versión y desde dónde | `registro_de_descargas.py` |
| **Relacionados** | Revisiones, Transmittals, RFI y Red Line (solo lo real) | JSONB |

Y una acción que encaja con la obra pública peruana:
- **«Constancia de trazabilidad (PDF)»**: la ficha impresa con el recorrido, las huellas y el estado de la cadena.
- Sirve para adjuntarla a un expediente, a un informe de supervisión o a lo que pida el SNPMGI o la Contraloría
  (ver `docs/ECD_INVESTIGACION_INTEGRAL.md`).

**Fallos de la propia maqueta a corregir:**
- en la cabecera de la ficha, «Exportar» queda montado sobre el botón «›» y se corta;
- toda la maqueta está en Navy, la paleta anterior.

## 5 · Trabajo detrás (para cuando se apruebe)

| Pieza | Backend | Migración |
|---|---|---|
| Recorrido con fechas | Ruta GET de emisiones por documento | No |
| Historial por id | Ruta GET de `activity_log` por id del nodo; antes, comprobar en qué acciones viaja el id en `details` | No |
| Accesos | Ruta GET sobre el registro de accesos | No |
| Relacionados | Ruta GET que busque el id en los JSONB (índice GIN si crece) | No |
| Estado de la cadena | Ruta GET que verifique el tramo del documento | No |
| Comentario de versión | Columna nueva | **Sí** (opcional) |

## 6 · Decisiones del propietario

1. ¿Se quitan «En el modelo» y «Fotos de campo» hasta que exista el vínculo? (Recomendado: sí.)
2. ¿Juntamos historial, revisiones y envíos en **una sola línea de tiempo «Trazabilidad»**, o se quedan en
   pestañas separadas como en la v6?
3. ¿Se muestra la **huella SHA-256** y el estado de la **cadena** («registro íntegro»)?
4. ¿Hacemos la **Constancia de trazabilidad en PDF**?
5. ¿Hago la **v7 de la ficha** con la nueva identidad para verla antes de tocar la app?
