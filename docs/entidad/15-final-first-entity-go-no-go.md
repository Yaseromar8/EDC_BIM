# FINAL FIRST ENTITY GO/NO-GO

**20-ago-2026** · Pasada limpia, desde cero, sobre una **instancia de ensayo
equivalente a una primera entidad**. No se reutiliza ningún veredicto anterior.

**La pregunta:** ¿podemos ofrecer hoy este ECD a una primera entidad pública y
aprovisionarle una instancia dedicada sin exponerla a riesgos críticos conocidos?

---

## La instancia de ensayo

«Municipalidad Distrital de San Marcos», ficticia. Construida siguiendo la guía
paso a paso, **sin un solo dato real**:

| | |
|---|---|
| Sistema | **Ubuntu 26.04** en WSL2 — el mismo Linux que Render, no Windows |
| Base | PostgreSQL 18, creada **vacía**, usuario `ecd_app_muniensayo` **sin superusuario y sin CREATEDB**, dueño de su base |
| Arranque | **`npm install` + `npm start`**, el comando real de producción |
| Perfil | `portal` · `ENFORCE=true` · `AUTH_POLICY_MODE=estricto` · `DDL_EN_CALIENTE=false` · `ECD_CANDADO_ESTADOS=true` · `STRICT_ISO_VISIBILITY=true` |
| Bucket | `ecd-muniensayo-docs`, creado para esto, **sin espacio de nombres jerárquico** |
| Documentos | PDF reales de obra pública, subidos a ese bucket. Ninguno del expediente productivo |

---

## A · Arranque Linux real — **PASA**

`npm install` instaló las 74 dependencias sobre Python 3.14 (Render usa 3.11:
**diferencia declarada**, ver §Salvedades). `npm start` ejecutó la cadena entera:

```
bootstrap → tablas 92/92 · columnas 832/832 · restricciones 464/464
            índices 169/169 · funciones 24/24 · extensiones 2/2 · 0 fallos
gunicorn  → Listening at http://0.0.0.0:3400, worker gthread
perfil    → portal
política  → 151 endpoints, modo estricto   (en `completo` son 258)
autorización por obra → ENFORCE   (no "log-only")
administrador → creado desde ADMIN_EMAIL: "Administradora Municipal"
salud     → completa: true, faltan: 0, puntos: 7
login     → 200, rol admin
```

## B · Bytes reales — **PASA**

Contra el bucket de ensayo, ciclo completo:

```
subir PDF        → HTTP 200
SHA-256 guardado → 8d11bfe857230a993d134461960bf70f223aded47dcfdfeca621dd33f629f52d
                   idéntico al del fichero de origen
descargar        → misma huella, byte a byte
nueva versión    → historial 1 → 2, huellas y tamaños distintos
borrar del bucket→ desaparece del listado
soft delete      → lo conserva
recuperar        → 8d11bfe857230a993d134461960bf70f223aded47dcfdfeca621dd33f629f52d
```

**Volvió idéntico, no parecido.**

## C · Lector PDF, visto por una persona — **PASA**

Abierto en el navegador del propietario, sobre la instancia de ensayo:

| documento | resultado |
|---|---|
| Artículo, 9 páginas | abre y se lee |
| **Plano A0**, 2,5 MB, 84.000 órdenes de dibujo | se ve entero y legible: planta con curvas de nivel, perfil longitudinal, tablas de progresivas, cuadro de curvas, sección típica, cajetín. **A 800 % de zoom el texto sigue nítido** |
| **Informe de 828 páginas**, 73 MB | abre, navega, **298 resultados** de búsqueda con resaltado, **miniaturas renderizando incluso en la página 250+**, tablas de 40×20 números legibles |

**Búsqueda:** funciona. Encontró `DRENAJE` y `TALARA` en el plano y `AUTORIDAD`
298 veces en el informe.

---

## Defectos encontrados en esta pasada

Los tres primeros **solo eran visibles mirando la pantalla**. Ninguna prueba de
API podía verlos, porque por API cada llamada funcionaba por separado.

### 1 · BLOQUEANTE — el portal no mostraba ninguna obra · **CORREGIDO**

`/api/hubs` estaba en el recorte de perímetro del perfil portal. Pero esa ruta
existe **dos veces**: contra Autodesk (`server.py`) y contra la base local
(`routes/projects.py`), que es de donde el portal saca las municipalidades. El
recorte corta por prefijo y no puede distinguirlas.

Y la pantalla de proyectos las pide en serie: el 404 lanzaba, y la función
abortaba **antes** de pedir `/api/projects`. Un funcionario entraba, veía **«No
hay proyectos»** y no llegaba a ningún documento.

Las rutas de Autodesk se apagan ahora **por perfil**, no por cadena. Verificado:
la lista de obras se pinta y las de Autodesk siguen dando 404.

### 2 · BLOQUEANTE — no se abría ningún PDF · **CORREGIDO**

El bucket no tenía CORS. El portal no sirve los documentos a través del backend:
firma una URL y **el navegador** va directo a `storage.googleapis.com`. Sin CORS
el navegador lo bloquea y el lector muestra su pantalla de error.

`apply_cors.py` existía, pero **la guía no lo mencionaba en ningún sitio**. Ahora
es paso obligatorio del aprovisionamiento.

### 3 · El portal mandaba usuarios y credenciales al proveedor · **CORREGIDO**

Encontrado auditando el aprovisionamiento desde cero:

- **`LoginScreen.jsx`** caía a `https://visor-ecd-backend.onrender.com` si
  faltaba `VITE_BACKEND_URL`. Una instancia mal construida habría enviado las
  **credenciales** de sus usuarios a un tercero. El CORS del otro extremo lo
  frena, pero eso es una red, no un diseño.
- **La ficha «Visor 3D»** emitía un ticket SSO de la entidad y llevaba el
  navegador al visor del proveedor **con el ticket en la URL**.

Ambas caen ahora a origen propio. Medido sobre el paquete construido: el visor
del proveedor pasa de estar presente a **0 ocurrencias**.

### 4 · Una clave privada a un commit, por un sufijo · **CORREGIDO**

`.gitignore` listaba las credenciales por nombre exacto. La credencial de ensayo
(`gcp_sa_ensayo.json`) no casaba, en un repositorio donde esta sesión venía
haciendo `git add -A backend/`. Ahora se ignoran por patrón. Comprobado que no
hay ninguna en la historia.

### 5 · `apply_cors.py` declaraba `origin: ["*"]` · **CORREGIDO**

Cualquier web podía hacer peticiones de navegador contra el bucket de una
municipalidad. Ahora sale de `CORS_ORIGINS`, y sin esa variable el guion se
niega a correr en vez de abrir el bucket.

---

## Las doce respuestas

### 1 · ¿Hay algún riesgo crítico conocido abierto?

**No, para una instancia nueva.** Los dos bloqueantes encontrados hoy están
corregidos y verificados en la instancia de ensayo.

Quedan riesgos **declarados, no ocultos**: el proveedor conserva acceso técnico
al bucket (§4), y los datos residen donde diga el contrato.

### 2 · ¿Puede perderse de forma irreversible información de la entidad?

**No, con las tres capas puestas.** Base: restauración probada, 83.410 de 83.410
filas. Bytes: soft delete 90 días + copia independiente diaria en bucket aparte
con permisos separados + recuperación con cotejo de hash, todo ejercido.

**Condición:** esas capas hay que configurarlas en cada instancia. Están en el
pack de aprovisionamiento (§11).

### 3 · ¿Puede otra entidad acceder a sus datos?

**No.** Cada entidad tiene su propia base, su propio bucket y su propio servicio:
el aislamiento es **físico**, no lógico.

Dentro de una instancia, probado con un usuario no administrador: su obra 200,
**la ajena 403**, y dos obras en conflicto en la misma petición **403**. El
administrador de la entidad sí ve todas las obras de su instancia — es su ECD.

### 4 · ¿Puede el proveedor acceder por fuera del portal y bajo qué controles?

**Sí, y se declara.** Administra la infraestructura y tiene la credencial del
bucket de esa entidad. Controles: la credencial está **acotada a ese bucket**
(no a nivel de proyecto — se corrigió hoy en la instancia del propietario), y
dentro de la aplicación **todo queda registrado, incluidos los administradores**.
Fuera de la aplicación, el acceso directo es técnicamente posible y va escrito
en el contrato (§4 de la plantilla), no negado.

### 5 · ¿Funciona realmente el aprovisionamiento desde cero?

**Sí, ejecutado hoy de principio a fin.** Base vacía → usuario sin privilegios →
bootstrap → arranque → administrador institucional → login. Y la auditoría de
dependencias ocultas encontró dos fugas hacia el despliegue del propietario, ya
corregidas. `PROJECT_ID` de Google está en el código de IA, pero **la IA no
existe en perfil portal** (404 comprobado).

### 6 · ¿Funcionó el arranque Linux real?

**Sí.** `npm install` + `npm start` sobre Ubuntu. Ver §A.

### 7 · ¿Funcionó upload/download/versionado/recuperación con hashes?

**Sí, con huellas idénticas.** Ver §B.

### 8 · ¿Funcionó visualmente el lector PDF?

**Sí, verificado por una persona.** Plano A0 al 800 % nítido, informe de 828
páginas con búsqueda y miniaturas. Ver §C.

### 9 · ¿Funcionó el 2FA desde una instancia limpia?

**Sí: 14 de 14.** Alta, QR, código incorrecto rechazado, activación, 8 códigos de
recuperación, login exigiendo segundo factor, **reutilización del mismo código
rechazada**, recuperación de un solo uso, y desactivación acreditada. El secreto
se guarda **cifrado**: una copia de la base ya no sirve para generar códigos.

### 10 · ¿Funcionó una restauración real?

**Sí.** Con la copia real de producción: 87 tablas, **83.410 de 83.410 filas**,
cotejadas fila a fila. `VEREDICTO: RESTAURABLE`.

### 11 · ¿Qué queda obligatoriamente para cada nueva entidad?

1. Base y usuario sin superusuario ni CREATEDB, dueño de su base
2. Bucket **sin** espacio de nombres jerárquico, acceso público impedido
3. **`python apply_cors.py`** — sin esto no se abre ni un PDF
4. Soft delete a 90 días · versionado · segundo bucket + transferencia diaria con **«Cuándo borrar: Nunca»**
5. Cuenta de servicio con permiso **solo sobre su bucket**
6. Las variables obligatorias de la guía §3.1, incluidas `VITE_BACKEND_URL` en el portal
7. **Plan de infraestructura de pago** (ver §12)
8. Activar el 2FA del administrador y **después** `EXIGIR_2FA_ESTRICTO=true`
9. Verificar: `bootstrap --verificar` en verde, borrar y recuperar un fichero cotejando hash, y ensayo de restauración

### 12 · ¿Qué queda para POST-PILOTO?

- **El botón del 2FA está escondido**: solo se ve antes de entrar en Documentos. Debería estar en el menú de la cuenta.
- **`/api/docs/versions` no devuelve la huella** aunque sí se guarda.
- **Buscar dentro de planos de CAD no funciona** porque no llevan texto — hay que decírselo a la entidad, no es del lector.
- Espacio `global`, IAM condicional, automatizar el despliegue.
- **De la instancia del propietario, no de una entidad:** conexión como `postgres`, `ENFORCE` apagado, orígenes localhost en CORS, cuenta por defecto de Compute Engine con alcance sobre los dos buckets.

---

## Salvedades honestas

- **Python 3.14** en el ensayo, **3.11** en Render. Las 74 dependencias
  instalaron en ambas; la diferencia queda declarada.
- **La creación del servicio en Render** no se probó: se probó el comando que
  ejecuta. Crear el servicio es la consola de Render.
- El ensayo de restauración corrió en un clúster local desechable, no en una
  instancia clonada de Cloud SQL. Prueba que los datos vuelven; no prueba
  particularidades de Cloud SQL.

---

# VEREDICTO

## GO — condicionado al plan de infraestructura

El producto y el procedimiento están listos. Todo lo que hacía NO-GO en las dos
puertas anteriores está cerrado, y cerrado **ejerciéndolo**: no queda en este
informe ninguna afirmación que no venga de haber ejecutado algo y mirado la
salida.

**La condición, que es comercial y no técnica:** la instancia de la entidad
**no puede vivir en un plan gratuito** que se duerme y que ya murió por memoria.
Esa contratación es requisito de la oferta, no del código.

Con el plan contratado y el pack de aprovisionamiento (§11) ejecutado, este ECD
se puede ofrecer a una primera entidad pública sin exponerla a riesgos críticos
conocidos.
