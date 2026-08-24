# 79 · CONCILIACIÓN FINAL — EXTERNAL PILOT GATE

**Fecha:** 24-ago-2026 · **Método:** conciliación contra lo ya registrado
(docs 65–78), no investigación nueva. Solo se re-verificaron en vivo los
datos que no deben afirmarse de memoria: MFA de ambos custodios, última
copia, y la clasificación literal de los residuales (doc 68).

## LA TABLA DEL GATE

| Requisito | Estado | Evidencia | Clase | Acción restante |
|---|---|---|---|---|
| Controlled Window / estabilización | ✅ | Ventana ejecutada 7/7 (doc 65); GO expreso del propietario, opción C (doc 76) | — | Ninguna |
| Segundo custodio / recuperación administrativa | ✅ | id 19 = Entity Admin (23-ago 16:22, verificado en base); break-glass `recuperar_custodia.py` probado (doc 69); **2 Entity Admins activos** | — | Ninguna |
| MFA administrativo | ✅ | Re-verificado hoy: **ambos custodios** `totp=True` con **8 códigos de recuperación** cada uno; canje 2FA probado E2E (matriz doc 71 §9) | — | Opcional: encender `EXIGIR_2FA_ESTRICTO` en Render — la condición de diseño («después de enrolar a los admins») ya se cumple |
| Backup + restore / DR | ✅ | Copias verificadas con manifiesto; `ensayo_de_restauracion` ejecutado; última copia **22-ago 16:37** | — | Recomendada: copia fresca justo antes de invitar al externo (paso 0 del runbook) |
| Aislamiento entre proyectos | ✅ | `ensayo_de_segunda_obra` 16/16; `project_ref` sembrado (PROJECT_FORBIDDEN semántico); **hoy en vivo**: la cuenta piloto ve UNA obra | — | Ninguna |
| Auditoría | ✅ | `activity_log` con hash encadenado (`test_auditoria_encadenada`); `auth_events` para toda puerta; los actos de estos días, todos con asiento | — | Ninguna |
| Identity & Access | ✅ | CAPA 12 COMPLETE (doc 72): G7 one-shot + generaciones + invariante sesión⇒activada; matriz E2E 10/10 (doc 71) | — | Ninguna |
| Project Membership | ✅ | CAPA 03 COMPLETE: P5 operable desde la obra, verificado en producción; retirar ≠ identidad | — | Ninguna |
| Resource Permission | ✅ | CAPA 09 COMPLETE (doc 75): 3 sujetos, closest-wins explicado por el inspector, EXP con conflicto real | — | Ninguna |
| Gobierno Entity Admin / Project Admin | ✅ | Adjudicación PASO 14 cerrada; `guardia_administrativa` por obra; `ULTIMO_ADMIN_DE_OBRA`; reactivar ≠ restaurar demostrado con caso real (doc 76 anexo) | — | Ninguna |
| Correo real de invitación | ⬜ | `RESEND_API_KEY` no configurada; G1 degrada a enlace copiable **a propósito** | **NO BLOCKER** (el enlace es camino válido) | **Configurarla en Render** si el externo debe recibir correo — 2 min, del propietario |
| Residencia de datos (`us-east4`) | ⚠ | Doc 68 #13: «PRE-PILOT BLOCKER *(contractual, no técnico)* — se decide **antes de firmar**» | **RIESGO ACEPTADO PARA ESTE PILOTO** — el piloto opción C usa una obra limpia sin documentos contractuales y no firma nada; la cláusula sigue **abierta para la firma real** | Decidir residencia antes del primer contrato con una entidad |
| Failure-domain de almacenamiento (buckets misma región) | ⚠ | Doc 68 #12: «RIESGO ACEPTADO (documentado)» — la copia protege de borrados, no de desastre regional | **RIESGO ACEPTADO** (clasificación previa, sin cambio) | Ninguna para el piloto |
| Obra/cuenta QA y decisión C | ✅ | `PILOTO EXTERNO 2026` creada con perímetro sembrado; ZZ = QA interna (id 22 = cuenta QA de miembro); ciclo de invitación ejecutado y verificado (doc 77 cierre) | — | Ninguna |
| Defectos silenciosos pre-externo | ✅ | 9 cazados y cerrados en 48 h (función-sin-alcance, catálogo sin fuero, diálogos suprimidos, invitación ignorada, fallo-como-vacío…), cada uno con contrato | — | Ninguna |

## VEREDICTO

```
EXTERNAL PILOT GATE → GO

BLOCKERS (técnicos u operativos) = 0

RIESGOS ACEPTADOS = [
  residencia us-east4        — solo para ESTE piloto (obra limpia, sin
                               documentos contractuales); sigue siendo
                               decisión previa a la PRIMERA FIRMA real,
  buckets en misma región    — clasificación previa del doc 68, sin cambio,
  clave del piloto en el     — cuenta desechable, decisión expresa del
  historial de sesión          propietario; jamás reutilizar,
]

POST-PILOT / DEFER = [
  MEMBER TOOL ACCESS · PERMISSION PROFILES · PROJECT TEMPLATES ·
  ACCOUNT ROLES · TOOL ACTIVATION      (sin trigger, como está mandado),
  P1/P2 pulido fino · horas en zona local · vista P2 dedicada,
  PREDICT como servicio desplegado,
  reset de la clave postgres en Cloud Console (backlog),
  custodio TERCERO humano distinto del propietario,
]
```

## LA SECUENCIA SIGUIENTE (sin más implementación)

```
configurar correo real (RESEND_API_KEY)
→ identificar primer participante externo
→ ejecutar runbook doc 77
→ observar primera incorporación real
```

## FORMULACIÓN OFICIAL DEL ESTADO

> **Arquitectura reforzada + capas activas ACC/Procore completas + listo
> para piloto externo controlado, sujeto al cierre del External Pilot
> Gate.**

No se afirma «escalable demostrado»: eso lo dirá el piloto, no nosotros.
