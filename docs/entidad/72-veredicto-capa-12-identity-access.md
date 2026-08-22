# 72 · VEREDICTO DE CAPA — 12 · IDENTITY & ACCESS UX

**Fecha:** 22-ago-2026 · **Backend verificado:** `91e7d3c` (latido, config 6/6)
**Criterio del propietario:** COMPLETE ⇔ ARQ ✅ ∧ OP ✅ ∧ EXP ✅ para el alcance
acordado; la evidencia EXP sale de la interfaz real, nunca de scripts que
escondan defectos de UX.

## Alcance acordado (fijado por el propietario en la orden de cierre)

Dentro: G1–G7 · P1/P3/P4/P6 · P2 **funcional** · matriz E2E §8 · estado de
primera clase. Fuera, DECLARADO: **G4b** (fuera del cierre actual, orden
expresa) · **pantalla P2 dedicada** (mejora, no requisito) · **MEMBER TOOL
ACCESS** (DEFER sin trigger real) · **P5** (es el frente SIGUIENTE, no parte
de este cierre — la orden manda continuar con él tras declarar COMPLETE).

## ARQ ✅

Diseño completo y consistente en docs 55–61: máquina de estados de identidad
(PENDIENTE/ACTIVADA/SUSPENDIDA/REVOCADA sobre `activated_at`×`is_active`),
generación de invitación por igualdad de enteros (sin relojes, sin estado en
el token), reclamo one-shot B.2, G5b (Google = activación), autoridad de
revocación (revocar invitación = desactivar SIEMPRE; purga solo como acto
humano fuera de pantalla), invariante de perímetro §3.a (sesión válida ⇒
activada), y las separaciones ACC/Procore: perfil del sistema ≠ función
contractual · Entity Admin ≠ Project Admin · membresía ≠ identidad.

## OP ✅

- **G7 migrado en producción** como `ecd_migrator` (sql/07): backfill por
  evidencia positiva, **0 AMBIGUAS**, 4/4 cuentas activadas. Sin usar
  `postgres` — el modelo de tres roles se respetó (y sql/06 cerró de paso el
  residual #8).
- **Código vivo** (`1662f45`): reclamo one-shot con generación; el rol fuera
  del token; reinvitar = re-invitación (gen++, resucita a la REVOCADA);
  reactivar solo para cuentas (409 `INVITACION_REVOCADA`); G5b con
  `login_ok` en toda entrada Google; invariante §3.a en `validate_session`;
  `pendiente := activated_at IS NULL` en padrón y ficha.
- **Suite: 937 passed** (DB-free) — incluida la **matriz E2E del §8: 10/10
  PASS** (doc 71, +8 tests escritos para los puntos que «cumplían sin
  prueba») y el contrato del «rol gigante» sobre el fuente del portal.
- Defecto real encontrado y cerrado de paso: el login Google devolvía el
  `password_hash` al cliente por índices corridos.

## EXP ✅ — interfaz real, producción, sesiones reales

| Evidencia | Resultado |
|---|---|
| Padrón (pestaña Usuarios) como Entity Admin (id 2, sesión con 2FA del propietario) | 4 cuentas del PASO 14, nombres clicables |
| **Ficha P4 de id 19** (captura) | Escalera completa: persona + chip 2FA · perfil/empresa/cargo · alta · último acceso alimentado por `login_ok` de HOY · SUS OBRAS (1) con función/administra/desde · pie de solo lectura |
| **Ficha P4 de id 17** (captura) | Chip **DESACTIVADA** · historia conservada (empresa, alta 13-may, último acceso) · SUS OBRAS (0) — membresías retiradas ≠ identidad retirada, exactamente el asiento del PASO 14 |
| Ficha como `user` real (sesión id 19) | **403 `ROL_INSUFICIENTE`** |
| Anónimos | ficha 401 · autorregistro 403 · reinvitar 401 · cerrar-otras 401 |
| Invariante §3.a en vivo | sesión activada sigue válida tras el deploy (`/api/auth/me` 200) |
| Rastro de id 17 leído en base | `login_ok` 15:59 UTC **anterior** a `usuario_desactivado` 19:06 UTC — sin anomalía de perímetro |
| Portal | autodesplegado con ficha y Reinvitar/Reactivar por naturaleza |

## Mejora menor anotada (no blocker)

`formatDate` muestra los timestamps en UTC sin declarar zona (la ficha dice
«03:59 p.m.» para 15:59 UTC). Consistente en todo el portal; corregirlo es
una pasada global de presentación, no de identidad.

## VEREDICTO

```
CAPA 12 · IDENTITY & ACCESS UX  →  COMPLETE  (ARQ ✅ · OP ✅ · EXP ✅)
```

Bloqueos reales del propietario: **ninguno**. DEFER vigentes: G4b · pantalla
P2 dedicada · MEMBER TOOL ACCESS. Siguiente frente, por orden ya dada:
**P5 · PROJECT MEMBERSHIP UX** — hacer operable desde Participantes la
cadena PERSONA → EMPRESA → FUNCIÓN CONTRACTUAL → MEMBRESÍA → ¿PROJECT
ADMIN?, sin ensanchar jamás Entity Admin.
