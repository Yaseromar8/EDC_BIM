# 78 · VEREDICTO CAPA 02 · ACCOUNT/ENTITY — y el mapa al cien

**Fecha:** 24-ago-2026 · **Backend:** `c493933` · **Suite:** 1019

## VEREDICTO

```
CAPA 02 · ACCOUNT / ENTITY

ARQ  ✅   1 instancia = 1 entidad (desde siempre); el catálogo de empresas y
          cargos es DE LA ENTIDAD y ahora tiene el fuero que le corresponde
OP   ✅   fuero de Entity Admin en las 4 escrituras · sin borrados a ciegas
          (409 con desglose) · sin duplicados · /api/entidad/empresas ·
          10 tests nuevos, suite 1019
EXP  ✅   producción: el agujero re-probado como `user` → 403×3 · lectura
          intacta (200) · pestaña «Empresas y cargos» renderizando el
          contexto real (captura del propietario: «INTERFERENCIAS · 1
          persona · ZZ PRUEBA VENTANA 2026-08 (SUPERVISION)»)

CAPA 02 → COMPLETE
```

**El hallazgo que la capa escondía**: las rutas del catálogo —las más viejas
del backend— aceptaban escrituras de cualquier sesión. Demostrado en
producción ANTES de corregir, con la cuenta piloto (rol `user`): creó una
empresa (201) y la borró (200). Y borrar arrastraba en silencio: gente «sin
empresa» → sin función contractual derivada → las reglas de permiso por
EMPRESA y FUNCIÓN dejaban de alcanzarles. El catálogo podía degradar el
control de acceso de media obra desde una cuenta rasa.

## EL MAPA, AL CIEN

```
 01 Identity / Principal      ✅      07 Project Admin             ✅
 02 Account / Entity          ✅ ⬅    08 Member Tool Access        DEFER
 03 Project Membership        ✅      09 Resource Permission       ✅
 04 Company                   ✅      10 Workflow Authorization    ✅
 05 Contractual Function      ✅      11 Responsibility / BIC      ✅
 06 Entity Admin              ✅      12 Identity & Access UX      ✅

 13–16 Permission Profiles · Project Templates · Account Roles ·
       Tool Activation                                            DEFER
```

**Toda capa activa del modelo ACC/Procore está COMPLETE con ARQ·OP·EXP.**
Los cinco DEFER siguen sin trigger demostrado, como está mandado.

## LO QUE QUEDA (nada es capa)

| Qué | Clase |
|---|---|
| `RESEND_API_KEY` en Render (correo de invitación real) | SHOULD del piloto — config, la pone el propietario |
| Invitar al primer externo REAL (runbook doc 77) | Acto del propietario |
| P1/P2 pulido fino · horas en zona local | UX POLISH aplazado |
| PREDICT como servicio desplegado | Frente aparte, cuando se ordene |
| Empresa «x» y cargo «x» en el catálogo (residuos de prueba, 0 personas) | Un clic del propietario en la pestaña nueva — ahora con guardias |
