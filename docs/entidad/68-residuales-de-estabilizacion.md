# RESIDUALES DE ESTABILIZACIÓN — REGISTRO CLASIFICADO

**22-ago-2026.** Un residual solo cambia de estado con evidencia. No se cierra
nada por «no ha fallado», ni se asciende nada a blocker por antigüedad.

Estados: `CERRADO` · `RIESGO ACEPTADO` · `POST-STABILIZATION` ·
`PRE-PILOT BLOCKER` · `POST-PILOT` · `DECISIÓN DEL PROPIETARIO`.

---

| # | Residual | Estado | Evidencia / razón |
|---|---|---|---|
| 1 | **Guardado destructivo de Accesos** | **CERRADO** | Reescrito por diferencia (`a4ddfab`); 5 pruebas; **verificado en producción**: al añadir al 19, el 22 conservó `es_admin=t` y su `assigned_at` original |
| 2 | **7 endpoints sin política declarada** | **CERRADO** | `administracion` y `plan_entregas` declarados `_SESION` en `POLITICAS_POR_BLUEPRINT`; ya caían ahí por el lado seguro, ahora es decisión escrita |
| 3 | **`project_ref` vacío / obras legadas** | **CERRADO** | Sembrado (27 filas · 10 obras · 10 alcances). Probado ida y vuelta: el cruce de obras pasó de `403 PROJECT_UNRESOLVED` a **`403 PROJECT_FORBIDDEN`** — el resolver traduce, la membresía deniega |
| 4 | **Obra nueva irresoluble 5 min (caché)** | **CERRADO** | `invalidar_resolver_de_obras()` al crear y restaurar |
| 5 | **2 tests rotos en la suite** | **CERRADO** | Uno era **defecto real del producto** (`_puede_descargar` abría conexión antes de comprobar Entity Admin); el otro importaba `conftest` por nombre. **912/912** |
| 6 | **Exclusión de `ai_brain` del backup** | **CERRADO (declarada)** | Escrita donde se ejecuta (`copia_de_seguridad.py`), no solo en un doc |
| 7 | **`feedback_buffer` sin copia** | **RIESGO ACEPTADO** | Derivado regenerable de IA; no es expediente contractual. Se reevalúa si algún día guarda algo irrecuperable — condición escrita en el propio código |
| 8 | **`doc_redlines.project_id NOT NULL`** | **DECISIÓN DEL PROPIETARIO** | [sql/06](../../backend/sql/06_lote_migrador_estabilizacion.sql) preparado e idempotente; 0 nulos medidos. **Requiere credencial del migrador** (ver #9). No es blocker: la app funciona sin ello; es una regla que faltaba |
| 9 | **Clave de `postgres` perdida** | **DECISIÓN DEL PROPIETARIO** | Reset en Google Cloud Console. Sin ella no se ejecuta ningún lote del migrador (#8). **No afecta al runtime**: la app corre como `ecd_app` y así debe seguir |
| 10 | **Las 4461 filas `global`** | **POST-STABILIZATION** | Auditado ([doc 67](67-auditoria-global-4461.md)): 99,4 % es 4D **duplicado exacto** de `1_CANAL`/`1_DRENAJE`; el resto tiene copia fuera. Inalcanzable por perímetro (403 medido); sin crecer desde el 4-jul. Se revisa con el frente 4D estabilizado |
| 11 | **`verify_project_access` deja pasar `global`** | **POST-STABILIZATION** | El comentario del código aún dice «dato compartido» — ya no es verdad. Hoy es inalcanzable porque `guardia_de_obra` corre antes (medido). Limpiarlo es higiene, y toca Resource Permission |
| 12 | **C7 · buckets en la misma región** | **RIESGO ACEPTADO** (documentado) | `bucket-proteccion-20260820`: decisión consciente — la copia protege de borrados y de perder el bucket, **no** de un desastre regional |
| 13 | **Residencia de datos en `us-east4`** | **PRE-PILOT BLOCKER** *(contractual, no técnico)* | Para una entidad pública peruana, dónde residen los documentos es cláusula de contrato. Se decide **antes de firmar**, no después |
| 14 | **MFA solo en la cuenta administrativa** | **PRE-PILOT BLOCKER** | Solo id 2 tiene 2FA. Antes del piloto, toda cuenta con autoridad debe tenerlo (entra en el gate externo del doc 53 §4.D) |
| 15 | **Sucesión del Entity Admin** | **DECISIÓN DEL PROPIETARIO** | Punto único hoy ([doc 66](66-adjudicacion-de-admins-inventario.md), pregunta A) |
| 16 | **La obra real sin Project Admin** | **DECISIÓN DEL PROPIETARIO** | 4 miembros, ninguno admin ([doc 66](66-adjudicacion-de-admins-inventario.md), pregunta B) |
| 17 | **Deploy durante suspensión de Render** | **RIESGO ACEPTADO** | Marcado `NO DEMOSTRADO` desde la ventana. No volvió a ser relevante: los 8 despliegues de hoy fueron normales |
| 18 | **Acuse admin-vía sin interfaz** | **POST-STABILIZATION** | El 400 sale del botón real, pero el 200 solo por API. Pertenece a Identity & Access / flujos, retenido por orden |
| 19 | **Obra de prueba y sus artefactos** | **POST-STABILIZATION** | Se conservan como evidencia de la ventana. Su retirada se decide al cerrar estabilización |
| 20 | **`lob_config` (1 fila) y 3 `tracking_pins` bajo `global`** | **DECISIÓN DEL PROPIETARIO** | Clase C del doc 67: solo quien estuvo en obra sabe a qué frente pertenecen |

---

**Recuento:** 6 cerrados · 3 riesgos aceptados (documentados) · 5
post-stabilization · **2 blockers pre-piloto** (ambos externos al código:
residencia de datos y MFA) · 5 decisiones del propietario.

**Ningún blocker pre-piloto es de software.** Lo que falta para el piloto no es
código: es una cláusula de contrato, un segundo factor en las cuentas y las
decisiones del PASO 14.
