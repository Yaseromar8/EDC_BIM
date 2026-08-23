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

**Ejecución:** el nombramiento (rol `user` → `admin`) lo ejecuta el
propietario en la pantalla «Usuarios del sistema» — el asistente preparó
la pantalla y verificó condiciones, y el clasificador de seguridad bloqueó
—correctamente— que la escalación de privilegios se ejecutara por script.
El acto queda en manos de quien debe hacerlo.

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
MUST HAVE 1 · Segundo custodio      DECIDIDO — pendiente SOLO el clic del
                                    nombramiento por el propietario
MUST HAVE 2 · GO estabilización     ✅ CERRADO (opción C registrada)
MUST HAVE 3 · Primera invitación    ÚNICO ACTO RESTANTE: crear la obra del
                                    piloto (opción C) e invitar a la
                                    persona real cuando el propietario la
                                    designe
```

Con el clic del nombramiento hecho, el EXTERNAL PILOT GATE queda abierto a
falta únicamente de **nombre y correo del primer invitado externo**.
