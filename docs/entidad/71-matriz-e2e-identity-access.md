# 71 · MATRIZ E2E FORMAL — IDENTITY & ACCESS UX (§8 del diseño, doc 55)

**Fecha:** 22-ago-2026 · **Suite oficial:** `backend/tests/` — 937 passed, DB-free
**Regla de la matriz:** cada punto del §8 se cierra con PRUEBAS QUE EXISTEN Y SE
EJECUTAN (la suite corre completa en cada verificación local y el ensayo citado
se ejecutó contra producción real), no con afirmaciones. Donde el diseño dijo
«se re-ejecuta, no se re-escribe», la evidencia es la ejecución registrada.

Convenciones: `S` = test de la suite (se ejecuta en cada corrida) ·
`E` = ensayo/drill contra producción (ejecución registrada en el doc citado).

| # | E2E del §8 | Prueba existente | Tipo | Veredicto |
|---|---|---|---|---|
| 1 | Ciclo de invitación completo | invitar→avisa: `test_g1…::test_invitar_envia_el_correo_y_dice_la_verdad` · pendiente listado: chip PENDIENTE probado en interfaz real (doc 65, PASO 12) y `pendiente := activated_at IS NULL` en `/api/users` · activar con token→entra: `test_entradas…::test_invitacion_activa_si_se_reclama` (sesión incluida) · caducado: `test_enlaces_firmados::test_token_caducado_se_rechaza` · otro correo: `test_entradas…::test_un_token_de_otro_correo_no_reclama` · generación vieja: `…::test_un_token_de_otra_generacion_no_reclama` | S + E | **PASS** |
| 2 | Autorregistro sin token → negado | `test_entradas…::test_sin_invitacion_no_hay_autorregistro` (correo fuera del padrón → 403, sin escribir) | S | **PASS** |
| 3 | Contraseña débil rechazada por el SERVIDOR | por la ruta de activación: `test_entradas…::test_password_debil_la_rechaza_el_servidor` (400 `PASSWORD_DEBIL`, muere antes de la base) · política unitaria: `test_password_policy` (6 tests: mínimos, correo propio, nombre, tildes) · por la ruta de reset: `test_reset_password::test_password_debil_se_rechaza` | S | **PASS** |
| 4 | Recuperación: un solo uso · sin enumeración | un solo uso (huella del hash vigente): `test_entradas…::test_reset_ya_canjeado_no_sirve_dos_veces` y `…::test_reset_sin_huella_muere` · sin enumeración: `test_reset_password::test_respuesta_identica_exista_o_no_la_cuenta` · pendiente no recibe reset: `…::test_invitacion_pendiente_no_recibe_reset` · desactivada no escribe: `test_entradas…::test_reset_de_cuenta_desactivada_no_escribe` | S | **PASS** |
| 5 | Suspensión: login bloqueado · sesión viva revocada · 2FA verify rechaza · último admin protegido | contraseña: `test_entradas…::test_login_no_deja_entrar_a_un_desactivado` (contraseña CORRECTA → 401 genérico) · Google: `…::test_google_no_deja_entrar_a_un_desactivado` · sesión revocada al retirar: `test_ciclo_de_vida_usuario::test_retirar_acceso_desactiva_en_vez_de_borrar` (assert `5 in revocadas`) · defensa en profundidad si la revocación fallara: `test_invariante_sesion_activada` (la consulta exige `COALESCE(u.is_active, TRUE)`) · 2FA verify: `test_segundo_factor_endpoints::test_desactivada_entre_la_password_y_el_canje_no_abre` · último admin: `test_ciclo_de_vida_usuario::test_no_se_puede_dejar_la_plataforma_sin_admin` | S | **PASS** |
| 6 | Reactivación (G2): vuelve a entrar · membresías intactas | `test_reemision_y_reactivacion::test_reactivar_devuelve_el_acceso` (el único UPDATE es `users.is_active` — no toca `project_users`: las membresías ni se leen) · la guardia de naturaleza: `…::test_reactivar_es_inaplicable_a_una_invitacion_revocada` (409 `INVITACION_REVOCADA`) · G7 (doc 58): reactivar exige `activated_at IS NOT NULL` | S | **PASS** |
| 7 | Cambio de rol: sesiones revocadas · último admin protegido | `test_ciclo_de_vida_usuario::test_cambiar_rol_revoca_las_sesiones` · `…::test_ultimo_admin_no_puede_degradarse` · `…::test_al_unico_admin_activo_no_se_le_degrada` (desactivados no cuentan) | S | **PASS** |
| 8 | Project Admin: nombrar/retirar · `ULTIMO_ADMIN_DE_OBRA` · autoridad no viaja | `herramientas/ensayo_de_administracion.py` — el diseño manda re-ejecutar, no re-escribir; ejecutado contra producción en la ventana (doc 65): nombrar/retirar por `mi-administracion`, `ULTIMO_ADMIN_DE_OBRA` al retirar al último, y 403 al ejercer autoridad en otra obra (`PROJECT_FORBIDDEN`, positivo tras sembrar `project_ref`) | E | **PASS** |
| 9 | Login con 2FA de punta a punta · con código de recuperación | `test_segundo_factor_endpoints` (23 tests: la contraseña correcta NO da sesión sino desafío; canje con código → sesión; código de recuperación UNA vez; desafío ajeno/caducado muere) · y en producción real: el propietario enroló y entra con 2FA desde la ventana (doc 65) | S + E | **PASS** |
| 10 | El «rol gigante» no existe (contrato de UI) | `test_contrato_rol_y_funcion` (4 tests): ningún `<select>` del portal mezcla vocabulario de perfil y de función · Participantes no edita el perfil (etiqueta, no control) · la ficha P4 es solo lectura · autocontrol: los dos selectores reales siguen visibles al contrato | S | **PASS** |

## Veredicto

**10/10 PASS.** Los puntos 2, 3 (ruta), 5 (contraseña y 2FA-verify), y 10
no tenían prueba — el código ya cumplía, pero «cumplir sin prueba» no cierra un
E2E: se escribieron hoy (`+7` tests) reutilizando los dobles existentes, sin
tocar producto salvo lo que G7 mandaba. El punto 8 queda cerrado por ensayo
ejecutado, que es exactamente lo que el §8 pide para él.

Lo que esta matriz NO cubre (fuera del §8, declarado): G4b (listado de
sesiones propias) está FUERA DEL CIERRE por orden del propietario; MEMBER
TOOL ACCESS sigue DEFER.
