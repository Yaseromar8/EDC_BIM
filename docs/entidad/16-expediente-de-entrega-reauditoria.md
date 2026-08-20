# Expediente de entrega para reauditoría independiente

**ECD — Entorno Común de Datos** · candidato a piloto con primera entidad pública
**Fecha de cierre:** 20-ago-2026

---

## 0 · Cómo leer esto

Este documento **no emite ningún juicio**. Es el índice de lo que hay que
auditar y dónde está cada cosa. El veredicto que se somete a revisión está en
`15-final-first-entity-go-no-go.md` y no se repite aquí.

**Advertencia de método, y es la más importante de este expediente:** varios de
los defectos más graves encontrados en los últimos días **eran invisibles a las
pruebas de API** y solo aparecieron levantando una instancia y mirando la
pantalla. Dos de ellos dejaban el portal inservible. Quien audite esto hará bien
en no fiarse de que 801 pruebas estén en verde.

---

## 1 · Commit exacto candidato

```
01b51c74929ed2bb5f4f234cbc67370cae256921
```

- **Rama:** `main`, sincronizada con `origin/main`
- **Repositorio:** `github.com/Yaseromar8/EDC_BIM`
- **Fecha:** 2026-08-20 16:03:45 -0500
- **Batería:** 801 pruebas en verde (`cd backend && python -m pytest tests/ -q`)

> Los commits posteriores a éste que afecten solo a `docs/` (esta matriz y este
> expediente) no cambian el código auditado.

---

## 2 · Arquitectura de la instancia dedicada

**Una entidad = una instancia completa.** No hay multi-inquilino lógico: el
aislamiento es **físico**.

```
                    ENTIDAD A                          ENTIDAD B
              ┌──────────────────┐              ┌──────────────────┐
  Portal      │ Static Site      │              │ Static Site      │
  (navegador) │ frontend-docs    │              │ frontend-docs    │
              └────────┬─────────┘              └────────┬─────────┘
                       │ VITE_BACKEND_URL                │
              ┌────────▼─────────┐              ┌────────▼─────────┐
  Backend     │ Web Service      │              │ Web Service      │
              │ DEPLOY_PROFILE=  │              │ DEPLOY_PROFILE=  │
              │      portal      │              │      portal      │
              │ 151 rutas        │              │ 151 rutas        │
              └───┬──────────┬───┘              └───┬──────────┬───┘
                  │          │                      │          │
        ┌─────────▼──┐   ┌───▼──────────┐  ┌────────▼──┐   ┌───▼──────────┐
  Datos │ PostgreSQL │   │ Bucket GCS   │  │PostgreSQL │   │ Bucket GCS   │
        │ propia     │   │ propio       │  │ propia    │   │ propio       │
        └────────────┘   └───┬──────────┘  └───────────┘   └──────────────┘
                             │ transferencia diaria
                         ┌───▼──────────┐
                         │ Bucket copia │  cuenta de servicio distinta
                         └──────────────┘
```

### Lo que sostiene el aislamiento

| capa | mecanismo | verificado |
|---|---|---|
| Datos | base propia; el usuario de aplicación **no tiene** superusuario ni `CREATEDB` y es dueño solo de su base | sí, en la instancia de ensayo |
| Bytes | bucket propio; cuenta de servicio con permiso **solo sobre ese bucket** | sí |
| Perímetro | `DEPLOY_PROFILE=portal`: 151 rutas frente a 258. Las del visor **no existen** (404 con sesión válida) | sí, 6 rutas comprobadas |
| Dentro de la instancia | `ENFORCE_PROJECT_AUTHZ=true`: un no-administrador ve su obra (200) y no la ajena (**403**); dos obras en conflicto en una petición, **403** | sí |
| Origen | `CORS_ORIGINS` declara solo el portal de esa entidad | sí — bloqueó `localhost` frente a `127.0.0.1` |
| Estados | `ECD_CANDADO_ESTADOS=true`: la **base** rechaza cualquier estado fuera de ISO 19650 | sí |
| Visibilidad | `STRICT_ISO_VISIBILITY=true`: un no-administrador no ve el Trabajo en curso ajeno | sí |

### Lo que NO aísla

El proveedor administra la infraestructura y posee la credencial del bucket de
cada entidad. **Acotada a ese bucket**, pero real. Va declarada en el contrato.

---

## 3 · Guía de aprovisionamiento

**`11-guia-despliegue-instancia.md`**

Contiene: creación de base y usuario, bucket sin espacio de nombres jerárquico,
**`apply_cors.py` como paso obligatorio**, las variables clasificadas en
obligatorias / recomendadas / opcionales / solo desarrollo / legado, los tres
interruptores con su valor razonado, y nueve verificaciones que no se dan por
buenas sin medirlas.

**Decisión de modelo:** `10-decision-modelo-de-entidad.md`
**Decisión de espacio global:** `09-decision-espacio-global.md`

---

## 4 · Informes de puerta

| documento | qué contiene |
|---|---|
| **`13-first-entity-readiness-report.md`** | Primera puerta. Revalidación de 19 elementos mínimos, simulacro completo, 16 escenarios adversarios. Veredicto de entonces: NO-GO por C7 |
| **`14-cierre-de-continuidad-y-gate.md`** | Segunda puerta. Criterio de continuidad endurecido, política de retención derivada, diseño de copia independiente. Veredicto de entonces: NO-GO por 2FA sin verificar |
| **`15-final-first-entity-go-no-go.md`** | **Puerta final.** Instancia de ensayo en Linux, las tres pruebas que no se dejaron para el cliente, doce respuestas. Es el veredicto que se somete a reauditoría |

---

## 5 · Matriz de hallazgos: baseline → estado final

**`08-matriz-saneamiento.md`**

Del BASELINE 0 congelado hasta el commit candidato, en cuatro pasadas. La cuarta
(18-20 ago) cubre 23 hallazgos, **incluidos tres errores propios de la
comprobación de esquema, dos de los cuales detuvieron el despliegue de
producción**. Se registran porque ocultarlos falsearía el historial.

Auditoría de estado previa: `05-auditoria-estado-actual-2026-08-12.md`

---

## 6 · Evidencias de pruebas

En **`docs/entidad/evidencias/`**. Cada una es la salida de algo que se ejecutó:

| evidencia | qué prueba |
|---|---|
| `ensayo-restauracion-produccion-20260820.md` | Restauración con la copia **real** de producción: 87 tablas, **83.410 de 83.410 filas** cotejadas fila a fila |
| `ensayo-restauracion-20260820-1412.json` | Veredicto de esa ejecución: `RESTAURABLE` |
| `borrado-y-recuperacion-20260820.md` | Borrado y recuperación en el bucket real, con **hash idéntico antes y después** |
| `copia-independiente-20260820.md` | Bucket de copia, transferencia diaria con «Nunca borrar», y el cierre del hallazgo de permisos heredados |
| `bucket-proteccion-20260820.md` | Soft delete a 90 días, y por qué el versionado no es posible en un bucket con espacio de nombres jerárquico |
| `segundo-factor-activado-20260820.md` | 2FA activo y **probado en incógnito**, con el cifrado desplegado antes |
| `reconstruccion-20260815.txt`, `copia-y-ensayo-restauracion-20260817.txt` | Ensayos anteriores |
| `rotacion-aps-N19-CERRADO-20260817.txt`, `revocacion-postgres-*` | Rotación y revocación de credenciales |

### Evidencia del gate final que vive en el informe

Las tres pruebas de `15-...` (arranque Linux, bytes reales, lector PDF visto por
una persona) están transcritas en ese documento con sus salidas literales:
huellas SHA-256, conteos de tablas y columnas, códigos HTTP y resultados de
búsqueda.

### Cómo reproducir la batería

```bash
cd backend && python -m pytest tests/ -q
```

Pruebas guardianas que merecen lectura, porque cada una nació de un fallo real:
`test_reconstruccion_desde_cero.py`, `test_perfil_portal.py`,
`test_fuente_de_verdad_del_arranque.py`, `test_segundo_factor.py`,
`test_ensayo_de_restauracion.py`.

---

## 7 · Procedimiento de copia y restauración

### Copia

```bash
cd backend && python copia_de_seguridad.py
```

Recorre las tablas, escribe un `.copia.gz` con su manifiesto, y **comprueba lo
escrito** contando filas contra el origen. **Solo lee.**

### Restauración

```bash
cd backend && python herramientas/ensayo_de_restauracion.py
```

Crea una base nueva, construye el esquema con el bootstrap, carga la copia,
coteja **tabla por tabla** y borra la base del ensayo. Deja evidencia en JSON.

**Solo corre contra una base local**, y el guardián es deliberado: una
herramienta que hace `CREATE DATABASE` y `DROP DATABASE` no debe apuntar a la
instancia donde vive un expediente. Para ensayar en la nube, instancia clonada.

### Lo que la copia NO lleva — y hay que saberlo

Una restauración completa del ECD son **tres cosas**, no una:

1. **La base** — esta copia
2. **Los secretos** (`APP_SECRET`, `SESSION_PEPPER`, credencial de Google) —
   viven en el panel del proveedor de hosting. **A propósito**: por eso una copia
   robada ya no sirve para generar códigos 2FA
3. **Los bytes del bucket** — soft delete 90 días + copia diaria al segundo
   bucket

### Continuidad de los bytes

Soft delete **90 días** (cubre borrado y sobrescritura; único que permite
recuperar de un bucket borrado) · versionado si el bucket no tiene espacio de
nombres jerárquico · **segundo bucket** con cuenta de servicio distinta y
transferencia diaria con **«Cuándo borrar: Nunca»** — con cualquier otro valor
es un espejo, y un espejo repite el borrado en vez de protegerlo.

---

## 8 · Procedimiento de salida y exportación

**En cualquier momento, por la entidad, sin pedir nada al proveedor:**

- **Índice del expediente** (`.xlsx`) — `/api/docs/indice-expediente`
- **Descarga masiva por carpeta** — `/api/docs/download_folder_urls`
- Ambos desde **Configuración → Exportar el expediente** en el portal

**Al terminar el servicio** (`12-plantilla-anexo-datos.md` §6): entrega de copia
completa de base y bucket en formato estándar, y **borrado en la infraestructura
del proveedor con constancia escrita**.

**Qué es propiedad de la entidad:** todo su expediente — documentos, versiones,
huellas, estados, códigos de idoneidad, revisiones, transmittals, plan de
entrega **y el registro de actividad**. La trazabilidad es parte del expediente,
no del proveedor.

> **Restricción a conocer antes de firmar:** si se pone *Bucket Lock*, no se
> puede borrar el bucket hasta que todo objeto cumpla la retención — y eso
> **choca con la obligación de borrar al terminar**. Por eso se descartó.

---

## 9 · Plantilla contractual

| documento | contenido |
|---|---|
| `12-plantilla-anexo-datos.md` | Anexo de datos. §4 **acceso técnico del proveedor**, declarado y no negado. §6 salida y borrado |
| `03-condiciones-del-servicio-y-nivel-de-servicio.md` | Condiciones y nivel de servicio |
| `01-ficha-tecnica-y-de-datos.md` | Ficha técnica y de datos |
| `02-aviso-de-privacidad-y-consentimiento.md` | Privacidad y consentimiento |
| `04-continuidad-y-respuesta-a-incidentes.md` | Continuidad e incidentes |

### Puntos que la entidad debe decidir antes de firmar

1. **Localización de los datos.** Hoy `us-east4`, Estados Unidos. Para una
   entidad pública peruana es cláusula, no detalle técnico.
2. **Conservación legal del expediente.** El plazo legal peruano **no se afirma
   en ninguno de estos documentos** porque no se ha verificado. Va con el asesor
   legal de la entidad. **No se resuelve con retención de bucket**: eso es
   protección operativa, no conservación legal.
3. **Credencial de Autodesk** propia por entidad, o común declarada.

---

## 10 · Riesgos residuales

Conocidos, declarados, y **no cerrados** en el commit candidato.

| riesgo | alcance | mitigación vigente |
|---|---|---|
| **Acceso técnico del proveedor al bucket** | esa entidad | credencial acotada a su bucket; dentro de la aplicación todo queda registrado, incluidos los administradores; declarado en contrato |
| **Sin versionado si el bucket lleva espacio de nombres jerárquico** | según cómo se cree | la guía manda crearlo **sin** HNS; el soft delete cubre borrado y sobrescritura igualmente |
| **Ambos buckets en la misma región** | fallo regional | decisión consciente: la copia protege de borrados y de perder el bucket, no de un desastre regional |
| **Buscar dentro de planos de CAD no funciona** | expectativa de uso | los planos exportados de CAD **no llevan texto**, llevan trazos. No es del lector. Hay que decírselo a la entidad **antes** |
| **Python 3.11 en producción, 3.14 en el ensayo** | fidelidad de la prueba | las 74 dependencias instalaron en ambas; diferencia declarada |
| **La creación del servicio en Render no se probó** | aprovisionamiento | se probó el comando que ejecuta (`npm install` + `npm start` en Linux); crear el servicio es la consola |
| **Restauración ensayada en clúster local, no en instancia clonada** | fidelidad | prueba que los datos vuelven; no prueba particularidades de Cloud SQL |
| **Plan de infraestructura sin contratar** | **condición del GO** | el plan gratuito se duerme y ya murió por memoria. Requisito de la oferta |

---

## 11 · POST-PILOTO

Nada de esto pone en riesgo a la entidad. Se hace con el piloto en marcha.

### Producto

- **El botón del 2FA está escondido**: solo aparece antes de entrar en
  Documentos. El sitio natural es el menú de la cuenta. Un administrador
  municipal probablemente no lo encuentre — y un control que nadie usa es la
  peor forma de tenerlo.
- `/api/docs/versions` **no devuelve la huella** aunque sí se guarda.
- Separar el manifiesto de esquema **por perfil**, para que un portal no se
  detenga por objetos del visor.
- Automatizar el aprovisionamiento a partir de la tercera entidad.
- IAM condicional sobre el bucket.
- 5 endpoints de `plan_entregas` sin política de blueprint declarada (caen a
  exigir sesión, que es el defecto seguro).

### De la instancia del propietario — **no de una entidad**

Una instancia nueva creada con la guía **no hereda nada de esto**, y así se
verificó en la de ensayo. Se listan porque afectan a quien opera hoy:

- La aplicación se conecta como **`postgres`**, el superusuario: no hay
  separación de identidades real en esa instancia.
- **`ENFORCE_PROJECT_AUTHZ` apagado**: la autorización por obra observa, no
  bloquea.
- Orígenes `localhost` en el CORS de producción.
- La cuenta por defecto de Compute Engine y los Editores del proyecto alcanzan
  ambos buckets.
- El portal perderá la ficha «Visor 3D» hasta que se defina `VITE_VISOR_URL`.

---

## 12 · Qué es obligatorio para cada nueva entidad

Resumen operativo; el detalle está en la guía §5 y en `15-...` §11.

1. Base y usuario **sin superusuario ni `CREATEDB`**, dueño de su base
2. Bucket **sin** espacio de nombres jerárquico, acceso público impedido
3. **`python apply_cors.py`** — sin esto no se abre ni un PDF
4. Soft delete 90 días · versionado · segundo bucket + transferencia diaria con
   **«Cuándo borrar: Nunca»**
5. Cuenta de servicio con permiso **solo sobre su bucket**
6. Variables obligatorias de la guía §3.1, incluida `VITE_BACKEND_URL`
7. **Plan de infraestructura de pago**
8. Activar el 2FA del administrador y **después** `EXIGIR_2FA_ESTRICTO=true`
9. Verificar: `bootstrap --verificar` en verde, borrar y recuperar un fichero
   cotejando hash, y ensayo de restauración contra esa instancia
