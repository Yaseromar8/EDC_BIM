# MAPA DE CIERRE DE FRONTEND-DOCS

**21-ago-2026** · Sobre `49dc271` (RFI cerrado)
**Diagnóstico. No se ha implementado nada.**

---

## 0 · La respuesta a la pregunta principal

> **¿Puede una organización gestionar documentalmente una obra de principio a
> fin dentro de `frontend-docs`, sin depender de `frontend-react`?**

**Casi, y por poco.** El expediente entra, se versiona, se revisa, se aprueba, se
transmite, se comparte, se audita, se exporta y se archiva **sin tocar
`frontend-react` ni una vez**. Lo que impide decir «sí» a secas son **cuatro
huecos**, tres de ellos ya diagnosticados y uno nuevo que encontró esta
inspección:

1. **El RFI no es visible** — su backend quedó profesional ayer; su interfaz no
   está montada (decisión deliberada, pendiente de ejecutar).
2. **Las Observaciones (redlines) no recibieron el tratamiento del RFI** —
   siguen con responsable de `localStorage` y veredicto sin gobierno. Son el
   «Issue documental» del producto, y hoy son el eslabón débil.
3. **No existe búsqueda global de documentos.** Solo se busca *dentro de la
   carpeta abierta*. Y hay un detalle revelador: el middleware declara la
   excepción `'/api/docs/global-search'` con su motivo escrito… **para una ruta
   que no existe en ningún blueprint**. Se planificó y nunca se construyó.
4. **No hay pantalla de participantes por empresa y función contractual.** El
   backend existe (`project_companies`, `/api/projects/<id>/participantes`);
   ninguna interfaz lo usa. «Emitir a la Supervisión» funciona por API y no se
   puede hacer desde la pantalla.

**Y la respuesta a la última pregunta: NO hace falta tocar 3D, 4D ni LOB para
cerrar nada de esto.** Ni una sola de las cuatro piezas los roza.

---

## 1 · Estado actual global

### Lo que está montado y funcionando, medido en el código

`FilesPage` sirve **13 modos**: Archivos · Actividad · Idoneidad · Miembros ·
Multimedia · Plan de Entregas · Observaciones (RedLines) · Informes · Revisiones ·
Conjuntos · Ajustes · Transmittals · Triaje. Más la portada (`HubPage`) con
**Mi Trabajo**, la selección de obras, y los paneles de compartir, permisos,
versiones, papelera, exportación del expediente, archivado de obra y 2FA.

El backend que lo sostiene: 48 rutas de documentos, estados ISO 19650 con
idoneidad y nomenclatura por obra, huella SHA-256 con inmutabilidad en SQL,
motor de encargos con conciliación, Reviews y RFI profesionales, transmittals
con acuse, exportación con índice, y auditoría de solo anexar. **876 pruebas.**

### Dos piezas muertas encontradas

- El modo **«Informes» es un cascarón**: un recuadro punteado que dice *«Los
  informes generados aparecerán aquí»*. Nada detrás.
- **`PdfCompareView` existe y no está montado en ningún sitio.** Comparador de
  PDF escrito y sin botón.

## 2 · Porcentaje aproximado de cierre

**≈ 85 %** del CDE documental, contando por capacidades (abajo): 16 cerradas,
1 en cierre, 4 que faltan, y el resto fuera del camino crítico. El 15 % restante
es pequeño en código — la mitad ya tiene el patrón construido y probado.

---

## 3 · Clasificación, capacidad por capacidad

### 🟢 CERRADO — funciona profesionalmente

| capacidad | evidencia |
|---|---|
| **Carpetas y estructura** | Árbol, mover, crear, papelera con restauración |
| **Subida de documentos** | Hasta 2 GB, reanudable, con triaje de seguridad y cuarentena |
| **Versiones** | `VersionPanel`, versión vigente por `current_version_id`, SHA-256 por versión con inmutabilidad **en SQL** |
| **Versión vigente/oficial** | Estados ISO (WIP/SHARED/PUBLISHED/ARCHIVED) + código de idoneidad + revisión — es el mecanismo ACC de «apto para» |
| **Metadata y estados** | Atributos personalizados, nomenclatura validada por obra, catálogo de idoneidad editable |
| **Permisos** | Por carpeta con herencia + membresía por obra + roles; pantalla de Miembros con rol editable; **aislamiento entre obras probado 16/16** |
| **Preview** | PDF con visor propio y **markups** (`PdfToolsOverlay` dentro de `PDFViewer`); vista rápida; multimedia |
| **Descarga** | Individual firmada por versión + masiva por carpeta |
| **Compartir controlado** | Enlaces con gestión y **revocación** (`SharesManager`) |
| **Historial y auditoría** | Modo Actividad + `activity_log` encadenado de solo anexar |
| **Reviews** | Cerrado en [29](29-cierre-definitivo-de-reviews.md): plazos, identidad, bloqueo con salida, 50/50 |
| **Encargos / Mi Trabajo** | Portada con bandeja transversal; proyección reconstruible; recordatorios idempotentes |
| **Transmittals** | Emisión formal con destinatarios, correo, acuse individual y encargos por destinatario |
| **Exportación / entrega** | `indice-expediente` + descarga masiva + `ExportarExpedientePanel`; copia y restauración **ensayadas** |
| **Archivado de obra** | `ArchivarObraPanel` con la máquina de estados |
| **Notificaciones (correo)** | Invitaciones, transmittals, asignaciones y recordatorios — todo por `mailer`, honesto sobre lo que no es automático |

### 🟡 EN CIERRE

| | qué falta exactamente |
|---|---|
| **RFI** | Solo la interfaz: montar el módulo, `responsable_id` desde el directorio (no `localStorage`), `useDocPreview`, «Veredicto», plazo. El backend quedó 46/46 ayer |

### 🔴 FALTA PARA CERRAR `frontend-docs`

| # | capacidad | por qué bloquea | tamaño |
|---|---|---|---|
| **F1** | **Observaciones (redlines) profesionales** | Es el «Issue documental» del criterio de cierre — *«generar y cerrar Issues/observaciones»* — y hoy cualquiera dicta su resolución y su responsable vive en el navegador. **El patrón entero ya existe**: es aplicar a `doc_redlines` lo mismo que se acaba de hacer a `doc_rfis` (mismo `IssueModule`, misma tabla gemela) | pequeño |
| **F2** | **Interfaz de RFI** (la fila de arriba) | Sin ella, el flujo RFI profesional no es usable | pequeño |
| **F3** | **Búsqueda global de documentos** | Con 3.000+ documentos reales, buscar solo dentro de la carpeta abierta no es un CDE. Es **la única pieza de backend genuinamente nueva** (la ruta no existe) | medio |
| **F4** | **Pantalla de participantes** (empresa × función contractual) | «Gestionar participantes» del criterio. API completa esperando; sin UI, la función contractual no se puede declarar ni consultar | pequeño |

### 🔵 PUEDE ESPERAR — no bloquea el cierre

Comparador de PDF (**ya escrito**, solo falta montarlo) · certificado imprimible
de transmittal · modo «Informes» (hoy cascarón: **o se llena o se quita el
botón**, un cascarón resta credibilidad) · filtros avanzados por metadata ·
notificaciones dentro de la aplicación · vista previa CAD pulida (`CadViewer`
existe; el PDF es el formato contractual) · renombrar «Respuesta»→«Veredicto» en
tablas viejas · migrar redlines históricas a tipo Issue.

### 🟣 `frontend-react` — fuera del camino crítico, y limpio

Visor 3D · vínculos a elementos BIM · Model Coordination · pins 3D · 4D · LOB ·
progresivas · frentes · avance físico · metrados · planificación física ·
Project Controls.

**Verificado, no asumido:** el único punto de contacto en `frontend-docs` es el
botón «publicar al visor» (`/api/modelos/publicar-desde-ecd`), que en perfil
portal responde 404 **a propósito y con prueba** (`FUERA_DEL_PERFIL` en
`test_perfil_portal.py`). Ninguna de las cuatro piezas F1–F4 necesita nada de
esta lista.

### ⚪ ENTERPRISE / FUTURO

Account tipado · plantillas globales · SSO/SCIM · facturación · plano de
control · *pooled* multi-tenant · API pública. Ya justificado en
[19](19-nucleo-minimo-profesional.md) y [22](22-product-roadmap-ecd-vs-acc-procore.md).

---

## 4 · Orden exacto recomendado

```
1. F2 · Interfaz de RFI            termina lo que quedó a un botón de distancia
2. F1 · Observaciones = mismo      el patrón está caliente: flujo_de_rfi se
        patrón sobre doc_redlines  generaliza o se gemela, y el MISMO IssueModule
                                   sirve a los dos (ya es un componente con cfg)
3. F4 · Pantalla de participantes  una pantalla sobre una API terminada
4. F3 · Búsqueda global            la única pieza nueva de backend; al final
                                   porque no condiciona a las otras tres
5. Barrido de piezas muertas       montar PdfCompareView o aplazarlo con fecha;
                                   quitar o llenar «Informes»
6. ENSAYO DEL EXPEDIENTE COMPLETO  un recorrido end-to-end contra PostgreSQL:
                                   obra nueva → participantes → carpetas → subir →
                                   versionar → revisar → aprobar → RFI → observación
                                   → transmitir → acusar → exportar → verificar
                                   huellas → archivar. Ese ensayo ES el certificado
                                   de cierre.
```

1–4 comparten una propiedad: **ninguna toca datos históricos y ninguna añade
tablas.** F1 reutiliza las columnas gemelas; F3 es una ruta de lectura.

## 5 · Dependencias accidentales con `frontend-react` — ninguna real

La única histórica (`/api/hubs` del visor pisando la del portal) ya se pagó y
quedó atada con prueba. `MODELOS`/`CadViewer` son mejoras de vista previa, no
dependencias: el expediente contractual es PDF.

---

## 6 · Su criterio de cierre — suficiente, con dos propiedades más

Su criterio:

> *Una organización puede administrar, revisar, aprobar, transmitir, recuperar y
> auditar toda la información documental de una obra dentro del sistema,
> sabiendo cuál es la versión correcta, quién debe actuar, qué ocurrió y qué
> quedó finalmente entregado.*

Es correcto y casi completo. Le añadiría **dos propiedades que ya cumplimos** —
conviene exigirlas por escrito para que nunca se pierdan:

1. **«…demostrable ante un tercero»** — que lo entregado se pueda *verificar*
   (huella SHA-256 por versión, auditoría de solo anexar, exportación con
   índice). Es la diferencia entre «lo tengo» y «lo puedo probar», y en obra
   pública es la que importa.
2. **«…y recuperable ante un desastre»** — copia y restauración *ensayadas*, no
   declaradas. Ya se ejercitó (83.410/83.410); debe ser parte del criterio, no
   un extra.

Con esas dos líneas, el criterio queda cerrado. Y con él, la definición
operativa:

> **`frontend-docs` está CERRADO cuando el ensayo del expediente completo
> (paso 6) pasa entero contra PostgreSQL, con las invariantes intactas y sin
> tocar `frontend-react`.**

---

## 7 · Respuesta final

**¿Es necesario tocar ahora 3D, 4D o LOB para lograr el cierre? NO.**
Ninguna de las cuatro piezas que faltan los necesita, el único punto de
contacto está apagado por perfil y probado, y todo lo espacial queda íntegro
esperando su turno en `frontend-react`.

---

**STOP. No he implementado nada, no he tocado `frontend-react` ni 4D/LOB.**
