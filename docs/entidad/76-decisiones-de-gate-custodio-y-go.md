# 76 · DECISIONES DE GATE — segundo custodio y GO de estabilización

**Fecha:** 22-ago-2026 (noche) · **Decisor:** el propietario, por orden directa.
Estas eran las dos decisiones humanas que el doc 75 dejó como MUST-HAVE del
EXTERNAL PILOT GATE. Quedan tomadas y registradas aquí.

## 1 · SEGUNDO CUSTODIO DE LA ENTIDAD

**Decisión:** el segundo Entity Admin es la cuenta
`yaseromarsanchez8@gmail.com` (**id 19**, «yaser omar 02»).

**Las 5 condiciones del PASO 14, verificadas en base antes del acto:**

| Condición | Evidencia (22-ago) |
|---|---|
| 1 · Cuenta reclamada y activa | `activada=True · activa=True · con contraseña` |
| 2 · 2FA activo | `totp_activo=True` + **8 códigos de recuperación sin usar** |
| 3 · Identidad humana conocida | es la segunda cuenta del propietario |
| 4 · Necesidad real de custodia | gate obligatorio pre-piloto (PASO 14, opción D) |
| 5 · Aceptación explícita del propietario | orden directa de esta fecha |

**Alcance declarado de la mitigación** (dicho y aceptado): al ser una
segunda cuenta de la MISMA persona, cubre la pérdida de la cuenta
principal (contraseña/2FA) — no cubre la indisponibilidad de la persona.
Un custodio tercero (Walter/Zhang u otro) queda como opción futura vía
invitación NUEVA, según lo congelado en PASO 14.

**Ejecución: HECHA el 23-ago-2026, 16:22** por el propietario en «Usuarios
del sistema». Verificado en base: `role = admin`, asiento
`rol_cambiado: user -> admin`, **0 sesiones activas** de esa cuenta (la
revocación es parte del cambio, no un efecto colateral) y **2 Entity Admins
activos** en la entidad. El clasificador de seguridad bloqueó —correctamente—
que la escalación se ejecutara por script; el acto quedó donde debía.

**El acto estuvo bloqueado dos intentos por un defecto del producto**, no por
permisos: `RolDeMiembro` pedía confirmación con `window.confirm`, que Chrome
suprime tras varios diálogos, y suprimido devuelve «cancelado» — el cambio se
abortaba EN SILENCIO y el desplegable volvía solo. Corregido en `2a4b9be`
(modal propio del producto) junto con otros tres actos que compartían la
fragilidad. Un acto de gobierno de la entidad no puede depender de un diálogo
que el navegador puede decidir no mostrar.

**Consecuencias conocidas del nombramiento** (por diseño, no sorpresas):
- El cambio de rol **revoca las sesiones** de id 19 (regla general).
- id 19 deja de aparecer como candidato/miembro incorporable (los Entity
  Admin alcanzan todas las obras sin membresía); su fila de membresía en
  la obra de prueba queda inerte.
- id 19 deja de servir como cuenta QA de perspectiva-miembro. **La QA de
  miembro pasa a id 22** (`omarsanchezh8+prueba1@gmail.com`, rol user).

## 2 · GO DE PRODUCTION STABILIZATION + OBRA DEL PILOTO

**Decisión:** **GO con OPCIÓN C**.

- `PRODUCTION STABILIZATION → CLOSED` por decisión del propietario
  (22-ago, con la evidencia del día como base: dos deploys sin incidencia,
  humo limpio, suite 998, EXP de tres capas en producción). El vencimiento
  formal de las 72 h (~25-ago) queda superado por decisión expresa.
- **Opción C**: el primer participante externo entra a una **obra
  limpia/acotada creada para el piloto** — no a PQT8_TALARA ni a la obra
  de prueba. `ZZ PRUEBA VENTANA 2026-08` sigue siendo QA interna y no se
  mezcla con externos. PQT8_TALARA recibirá externos cuando el
  comportamiento del piloto esté observado.

## 3 · ESTADO DEL GATE TRAS ESTE DOCUMENTO

```
MUST HAVE 1 · Segundo custodio      ✅ CERRADO (23-ago 16:22, verificado)
MUST HAVE 2 · GO estabilización     ✅ CERRADO (opción C registrada)
MUST HAVE 3 · Primera invitación    ÚNICO ACTO RESTANTE: crear la obra del
                                    piloto (opción C) e invitar a la
                                    persona real cuando el propietario la
                                    designe
```

Con el nombramiento hecho, **los dos MUST-HAVE de gobierno están cerrados**.
El EXTERNAL PILOT GATE queda a falta únicamente de **ejecutar la primera
invitación** (la pista está montada: doc 77) y, para un externo real, de
configurar el envío de correo (`RESEND_API_KEY`, SHOULD HAVE).
