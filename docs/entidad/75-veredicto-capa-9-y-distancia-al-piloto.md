# 75 · VEREDICTO CAPA 9 · RESOURCE PERMISSION — y la distancia real al piloto

**Fecha:** 22-ago-2026 (noche) · **Backend verificado:** `31acf1f`
**Regla:** COMPLETE ⇔ ARQ ✅ ∧ OP ✅ ∧ EXP ✅; la EXP sale de la interfaz real.

## 1 · VEREDICTO

```
CAPA 9 · RESOURCE PERMISSION

ARQ  ✅
OP   ✅
EXP  ✅

CAPA 9 → COMPLETE
```

**ARQ ✅** — El motor NO se rediseñó, se hizo visible: tres sujetos
(USER/COMPANY/CONTRACTUAL_FUNCTION), closest-wins, precedencia
USER > COMPANY > FUNCTION dentro de la carpeta, `none` = denegación
explícita. La explicación sale DE LA MISMA PASADA que decide (con el
ganador ya fijado, el recorrido continúa solo para relatar) — no existe una
segunda lógica que pueda contradecir a la primera, y un contrato lo prueba.

**OP ✅** — Suite 998. El resolutor pasó de cero pruebas directas a 25
(closest-wins, precedencia, `none`, negativas de otra-empresa/otra-función/
otra-persona, relato por distancia, fail-closed) + 16 de rutas + 7 de
contrato de pantalla. `list_folder_permissions` dejó de ESCONDER reglas (el
INNER JOIN descartaba empresa y función: un permiso invisible no se puede
retirar).

**EXP ✅** — Sesión real de Entity Admin, obra de prueba, 22-ago:

| Paso | Evidencia |
|---|---|
| Conceder a EMPRESA | modal de 3 sujetos; aparece en tabla: «INTERFERENCIAS · Todas las personas de esta empresa · Administrar» |
| Conceder a FUNCIÓN | aviso ámbar capturado: «Alcanza también a quien llegue después…» |
| Conceder a PERSONA | «Ver y descargar» en la carpeta hija |
| **Conflicto real (2 niveles, 4 reglas)** | inspector: «**Ver y descargar** · Gana la regla de **Persona** en **EXP-PRIVADO** (esta misma carpeta) · **Desplazó, en esa misma carpeta:** Función contractual = Ver, descargar y marcar — al mismo nivel, la más específica manda · **Desplazó, en carpetas superiores:** Persona = Editar y subir en **PRUEBA** — la carpeta más cercana tiene precedencia» |
| Alcanzabilidad | «Le alcanzan reglas dirigidas a: ella misma, su empresa INTERFERENCIAS, y la función Supervisión» |
| Retirada y estado limpio | verificado en base: queda EXACTAMENTE la fila previa a la EXP; carpeta de prueba a papelera; empresa de 19 revertida |

**Y la EXP hizo su trabajo de verdad**: encontró que una regla de FUNCIÓN
**no alcanzaba a nadie** por el camino de documentos (`sujetos_de`
consultaba `project_companies` con el `model_urn` sin resolver al id
canónico; los dobles de las suites usaban el mismo id para ambas cosas y no
podían verlo). Corregido con el patrón de la casa (`resolve_project_id`,
fail-closed) y un fixture que ya no permite el espejismo. Ese hallazgo es
la diferencia entre «el backend funciona» y ARQ·OP·EXP.

## 2 · RE-MEDICIÓN DEL MAPA (tras CAPA 12 ✅ · P5 ✅ · CAPA 9 ✅)

Solo se mueve lo que tiene evidencia de HOY:

```
 #  CAPA                          ARQ  OP  EXP   ESTADO
 01 Identity / Principal           ✅  ✅  ✅   COMPLETE  ⬆ G7 entero + matriz E2E 10/10 + EXP prod (doc 72)
 02 Account / Entity               ✅  ✅  🟡   PARTIAL   sin cambio: falta vista de entidad (UX)
 03 Project Membership             ✅  ✅  ✅   COMPLETE  ⬆ P5: incorporar/retirar por interfaz, verificado en prod
 04 Company                        ✅  ✅  ✅   COMPLETE  ⬆ empresa por interfaz (asignada y revertida hoy, verificada en base)
 05 Contractual Function           ✅  ✅  ✅   COMPLETE  reforzada: sus reglas de permiso ahora APLICAN (fix 31acf1f)
 06 Entity Admin                   ✅  ✅  ✅   COMPLETE  ⬆ adjudicación CERRADA (PASO 14, opción D); 2º custodio = gate humano del piloto, no capa
 07 Project Admin                  ✅  ✅  ✅   COMPLETE  ⬆ ensayo re-ejecutado + guardia_administrativa gobierna membresía y permisos
 08 Member Tool Access             ✅   —   —   DEFER     sin trigger (re-confirmado)
 09 Resource Permission            ✅  ✅  ✅   COMPLETE  ⬆ ESTE veredicto
 10 Workflow Authorization         ✅  ✅  ✅   COMPLETE  sin cambio
 11 Responsibility / BIC           ✅  ✅  ✅   COMPLETE  sin cambio
 12 Identity & Access UX           ✅  ✅  ✅   COMPLETE  ⬆ doc 72
```

**¿Qué sigue PARTIAL y por qué?** Solo la **02**: no existe una vista de
entidad consolidada (empresas de la instancia, configuración global en un
lugar). Todo lo que la compone FUNCIONA por partes (Usuarios, catálogo de
empresas, configuración); lo que falta es pantalla, no capacidad. **UX
POLISH — no blocker.**

## 3 · DISTANCIA REAL AL EXTERNAL PILOT GATE

```
MUST HAVE:
  1. SEGUNDO CUSTODIO de la entidad — gate HUMANO fijado en PASO 14
     (opción D): cuenta reclamada y activa · 2FA · identidad conocida ·
     necesidad real · aceptación del propietario. Es una decisión y una
     invitación, no desarrollo.
  2. RATIFICAR el cierre de PRODUCTION STABILIZATION (el periodo de
     observación ya corre sin vigías míos; queda tu GO) y la decisión
     obra-de-prueba/QA (recomendación C del doc 70).
  3. LA PRIMERA INVITACIÓN EXTERNA en sí: emitir, acompañar la
     activación, membresía + función + permisos de SU carpeta — todo el
     camino ya está probado; falta ejecutarlo con la persona real.

SHOULD HAVE (mejoran el estreno, no lo bloquean):
  · P1 login con identidad propia (primera impresión del externo)
  · P2 pantalla de activación dedicada (el flujo funcional ya existe)
  · Vista de entidad (capa 02)
  · Horas en zona local declarada (hoy UTC sin decirlo)
  · PREDICT desplegado como servicio (hoy vive en tu PC) — solo si el
    piloto debe verlo

DEFER (sin trigger demostrado — se quedan donde están):
  · MEMBER TOOL ACCESS          · PERMISSION PROFILES
  · PROJECT TEMPLATES           · ACCOUNT ROLES
  · TOOL ACTIVATION por proyecto

NO BLOCKER (declarados y con dueño):
  · G4b listado de sesiones propias (fuera del cierre por orden)
  · Exportar Excel de permisos (botón ya anuncia «próximamente»)
  · 4.461 filas 'global' históricas (duplicados exactos, inalcanzables
    tras el perímetro, congeladas desde el 4-jul)
  · Clave de postgres (reset en Cloud Console — backlog; ecd_migrator
    cubre migraciones y ecd_app la recuperación de custodia)
```

**Lectura ejecutiva:** entre hoy y el primer externo no queda desarrollo
estructural: quedan **dos decisiones humanas** (custodio nº 2, GO de
estabilización) **y un acto** (la invitación). El polish de P1/P2 puede
hacerse antes o después sin mover el gate.
