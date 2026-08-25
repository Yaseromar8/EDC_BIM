# 80 · VEREDICTO FINAL — EL MODELO ACC/PROCORE, MATERIALIZADO

**Fecha:** 24-ago-2026 · **Suite:** 1077 · **Producción:** `2a3413e`
**Método:** matriz reconstruida DESDE CERO. Ninguna capa hereda su
`COMPLETE`: cada una se verifica contra evidencia nombrada, y donde la
evidencia es de hoy se dice de hoy.

## LA MATRIZ, CAPA POR CAPA

| # | Capa | ARQ | OP | EXP | Evidencia de la EXP |
|---|---|---|---|---|---|
| 01 | Identity / Principal | ✅ | ✅ | ✅ | G7 completo; matriz E2E 10/10 (doc 71); activación real de la cuenta piloto por el camino público, one-shot verificado (doc 77) |
| 02 | Account / Entity | ✅ | ✅ | ✅ | agujero de escritura del catálogo demostrado y cerrado (403×3 como `user`); vista de entidad con contexto real (doc 78) |
| 03 | Project Membership | ✅ | ✅ | ✅ | P5 operable desde la obra; el piloto ve UNA obra; retirar ≠ identidad, con caso real (doc 76 anexo) |
| 04 | Company | ✅ | ✅ | ✅ | empresa asignada y revertida por interfaz, verificada en base; borrado con desglose de referencias |
| 05 | Contractual Function | ✅ | ✅ | ✅ | derivada del par (empresa, obra); reforzada al corregir que sus reglas de permiso no aplicaban (`31acf1f`) |
| 06 | Entity Admin | ✅ | ✅ | ✅ | adjudicación cerrada (PASO 14); segundo custodio nombrado y verificado: rol, asiento y sesiones revocadas (doc 76) |
| 07 | Project Admin | ✅ | ✅ | ✅ | `ensayo_de_administracion` ejecutado; `ULTIMO_ADMIN_DE_OBRA`; autoridad que no viaja a otra obra |
| 08 | **Member Tool Access** | ✅ | ✅ | ✅ | **hoy**: el caso del enunciado en producción — Docs ✅ Reviews ✅ RFI ✅ Red Lines ❌ Transmittals ✅; expediente abierto y herramienta cerrada a la vez |
| 09 | Resource Permission | ✅ | ✅ | ✅ | closest-wins con conflicto real explicado por el inspector: carpeta ganadora, sujeto ganador, desplazados (doc 75) |
| 10 | Workflow Authorization | ✅ | ✅ | ✅ | independencia autor/revisor probada en ambas direcciones (doc 65) |
| 11 | Responsibility / BIC | ✅ | ✅ | ✅ | `encargos` con identidad estricta; drills 31/31 y 28/28 |
| 12 | Identity & Access UX | ✅ | ✅ | ✅ | la escalera completa en la ficha, en producción, con 2FA y último acceso vivos (doc 72) |
| 13 | **Permission Profiles** | ✅ | ✅ | ✅ | **hoy**: aplicar → efecto real; **editar el perfil por completo y la persona no cambia**; borrarlo conserva sus accesos |
| 14 | **Project Templates** | ✅ | ✅ | ✅ | **hoy**: capturar → obra nueva → aplicar → carpetas idénticas, **0 nodos compartidos**, y **0** en las nueve familias de historia (incluidos miembros) |
| 15 | **Account Roles** | ✅ | ✅ | ✅ | **hoy**: delegación acotada; las tres separaciones a la vez sobre la misma persona (403 en obra ajena, 403 en herramienta retirada, y seguía gestionando empresas) |
| 16 | **Tool Activation** | ✅ | ✅ | ✅ | **hoy**: el Entity Admin apagó RFI **y quedó fuera él mismo** (403 HERRAMIENTA_NO_ACTIVA), con su interruptor accesible y el expediente intacto |

```
MODELO DERIVADO DE LA INVESTIGACIÓN ACC/PROCORE

16 / 16 CAPAS MATERIALIZADAS

ARQUITECTURA       100 %
OPERACIÓN          100 %
EXPERIENCIA        100 %
```

## LOS INVARIANTES, VIVOS Y PROBADOS

La cadena completa, cada eslabón con su propia pregunta y su propia tabla:

```
IDENTITY          users                     ¿quién es?
MEMBERSHIP        project_users             ¿pertenece a esta obra?
COMPANY           users.company_id          ¿de qué empresa es?
CONTRACTUAL FN    project_companies.funcion ¿en qué calidad participa su empresa?
ADMINISTRATION    project_users.es_admin    ¿administra esta obra?
TOOL ACTIVATION   project_tools             ¿existe la herramienta aquí?
TOOL ACCESS       member_tool_access        ¿entra este miembro a ella?
RESOURCE PERM.    folder_permissions        ¿qué recurso toca dentro?
WORKFLOW AUTH.    posiciones del flujo      ¿qué acto contractual ejecuta?
RESPONSIBILITY    encargos                  ¿de quién es la pelota ahora?
ACCOUNT ROLE      roles_de_entidad          ¿qué administra de la ENTIDAD?
PERMISSION PROF.  perfiles_de_acceso        configuración reutilizable
PROJECT TEMPLATE  plantillas_de_obra        configuración reproducible
```

Y las tres separaciones que más se confunden, cada una con prueba propia:

- **CONTRACTUAL FUNCTION ≠ PERMISSION PROFILE** — la función es un hecho del
  contrato; el perfil, una preferencia repetible. Dos personas de la misma
  función pueden llevar perfiles distintos.
- **PERMISSION ≠ RESPONSIBILITY** — poder tocar un documento no es tener la
  pelota; `encargos` no mira permisos y los permisos no miran encargos.
- **APP AUTHORIZATION ≠ INFRASTRUCTURE PRIVILEGE** — `ecd_app` (runtime),
  `ecd_migrator` (DDL) y `postgres` (excepcional) siguen separados: las
  cuatro migraciones de este programa se ejecutaron como `ecd_migrator`.

## DIFERENCIAS DELIBERADAS CON ACC/PROCORE

No clonamos: derivamos. Estas divergencias son decisiones, no carencias.

**1 · Documentos no se apaga.** En ACC un proyecto puede desactivar Docs.
Aquí el expediente es el substrato del que cuelgan revisiones, transmittals
y auditoría: apagarlo no sería configurar una obra, sería dejarla inservible
fingiendo que es una opción.

**2 · Un perfil aplica; no gobierna.** ACC/Procore tienden a plantillas que
siguen mandando. Aquí el perfil escribe la configuración y sale de escena:
editar un perfil NO cambia a quien ya lo llevaba. Se evita así una segunda
fuente de verdad que obligaría a arbitrar entre plantilla y excepción — y
ese arbitraje acaba resolviéndose distinto en cada pantalla.

**3 · Las plantillas no copian miembros.** Es la función que todo el mundo
espera y la que convierte una plantilla en un agujero: crear una obra
concedería acceso a personas que nadie invitó a ESA obra. La estructura se
hereda; la gente se incorpora.

**4 · Permisos CLOSEST-WINS, no aditivos.** ACC acumula (grant-only). Aquí
la carpeta más cercana decide, y `none` es una denegación explícita. Sin eso
no existe «reservar una carpeta», que es un requisito real de obra pública.

**5 · La función contractual NO concede permisos.** En Procore el rol
contractual arrastra accesos. Aquí describe en qué calidad participa una
empresa y nada más — aunque SÍ puede ser el sujeto de una regla de permiso,
que es una concesión explícita y visible, no un efecto secundario.

**6 · Fail-open acotado en 16 y 08; fail-closed en todo lo demás.**
Disponibilidad y autorización no son lo mismo: si no se puede leer qué
herramientas tiene una obra, la obra sigue funcionando (cerrarla la dejaría
inservible por un fallo de infraestructura); si no se puede leer una
facultad o un permiso, no hay facultad ni permiso.

**7 · La administración de obra atraviesa permisos, pero NO activación.**
Un Project Admin alcanza el expediente de su obra (como en ACC) y gobierna
qué herramientas están restringidas — pero una herramienta APAGADA no
existe para nadie, tampoco para él. Se enciende, no se atraviesa.

## DEFECTOS QUE ESTE PROGRAMA DESTAPÓ

Todos encontrados por EXP o por los propios tripwires, ninguno visible como
error para un usuario:

1. Reglas de FUNCIÓN que no alcanzaban a nadie (id sin resolver) — `31acf1f`
2. Catálogo de entidad escribible por cualquier sesión — `c493933`
3. Capturar plantilla leía obras ajenas con solo la facultad de entidad
4. `except` sin rollback que envenenaba la transacción entera — `2a3413e`
5. Comentario suelto que hacía parecer sin guardia a una ruta ajena
6. Dos capacidades sin pantalla («existe en el backend» no es implementado)

## LA FORMULACIÓN QUE CORRESPONDE

> **Arquitectura reforzada + 16/16 capas del modelo ACC/Procore
> materializadas con ARQ·OP·EXP + listo para piloto externo controlado.**

Lo que el piloto dirá y nosotros no podemos decir todavía: cómo se comporta
con gente real dentro.
