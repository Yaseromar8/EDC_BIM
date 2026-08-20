# Evidencia — protección del bucket primario · 20-ago-2026

**Bucket:** `yaser-pqt08-talara`
**Ubicación:** `us-east4` (Virginia del Norte, EE. UU.)
**Clase:** Managed with Autoclass · **Acceso público:** No público
**Espacio de nombres jerárquico:** Habilitado

---

## ACCIÓN 1 — Soft delete a 90 días · **HECHA**

| campo | valor |
|---|---|
| Política de eliminación no definitiva | **90 días** |
| Fecha de entrada en vigencia | 20-ago-2026, 11:07:47 GMT-5 |

Verificado en consola por el propietario (captura). Antes estaba en el valor por
defecto de Google: 7 días.

**Qué cubre**, según la documentación oficial de Cloud Storage: **borrados y
sobrescrituras**. Y es el **único** control que permite recuperar objetos de un
bucket borrado entero — el versionado no lo hace.

---

## ACCIÓN 2 — Object Versioning · **NO APLICABLE A ESTE BUCKET**

El control de versiones de objetos **no está soportado en buckets con espacio de
nombres jerárquico**. Aparece explícitamente en la lista de capacidades no
soportadas de la documentación oficial de HNS, junto con Bucket Lock, Object
Retention Lock, Object holds, ACLs por objeto y replicación entre buckets.

La consola lo muestra desactivado y no permite activarlo. **No es un error de
configuración: es una limitación de la plataforma.**

### Qué significa, sin adornos

- La sobrescritura **sí** queda cubierta, por el soft delete de 90 días.
- Lo que se pierde frente a un bucket sin HNS es la comodidad: las versiones no
  vigentes serían **legibles y listables**; los objetos en soft delete se guardan
  fuera de línea y hay que **restaurarlos** para poder leerlos.
- **Bucket Lock tampoco está disponible** aquí. Da igual: se había descartado a
  propósito por ser irreversible y chocar con la cláusula de salida.

### Consecuencia para el plan

La **copia independiente** (acciones 3 y 4) pasa a ser **más importante**, no
menos: es ahora la única protección frente a la pérdida del bucket entero o a una
credencial comprometida que borre con intención y espere 90 días.

---

## Para el bucket de la entidad: NO habilitar HNS

Al crear `ecd-<entidad>-docs` (paso 2 de la guía de despliegue), **dejar el
espacio de nombres jerárquico DESACTIVADO**.

La aplicación no lo necesita: escribe objetos con nombre plano
(`multi-tenant/{obra}/{timestamp}_{uuid}_{fichero}`, `documents.py:1019`) y nunca
renombra carpetas en el bucket. Renunciar a HNS no cuesta nada y devuelve el
versionado, que sí es útil.

---

## Pendiente de decidir (no urgente, pero va al contrato)

Los datos están en **`us-east4`, Estados Unidos**. Para una entidad pública
peruana, dónde residen los documentos del expediente es una cláusula
contractual, no un detalle técnico. Hay que decidirlo con la entidad antes de
firmar, no después.
