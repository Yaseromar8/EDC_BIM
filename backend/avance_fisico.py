# -*- coding: utf-8 -*-
"""NG-04 · Avance físico desde campo — la semántica, separada del transporte.

Tres conceptos que NO se mezclan (doc 98 §A):
  - REPORTE (`avance_campo`)  — lo declarado: magnitud física con evidencia.
  - AVANCE RECONOCIDO         — el mismo objeto APROBADO por autoridad
                                contractual válida. Solo lo reconocido SUMA.
  - PROYECCIÓN                — cálculo derivado y re-ejecutable que consume
                                únicamente lo aprobado.

Las reglas de quién puede qué viven AQUÍ para que las rutas no las repitan
ni puedan contradecirlas — el patrón de `cuaderno_de_obra` y `flujo_de_rfi`.
"""

from cuaderno_de_obra import fecha_operativa_valida  # noqa: F401 — la MISMA
# regla congelada de NG-03: la fecha del acto es la fecha operativa DECLARADA
# de la obra, pasado sí, futuro lejano no. Importarla es la garantía de que
# cuaderno y avance jamás discrepen en qué día "cuenta".


# ── Listas cerradas (casadas con la base y la pantalla por tripwire) ──────

ESTADOS_DE_AVANCE = ('REPORTADO', 'APROBADO', 'DEVUELTO')

# Corrección 3 del dueño: nada de un `delta` con signo variable conviviendo
# con `cantidad > 0`. El TIPO lleva la dirección; la cantidad es SIEMPRE una
# magnitud positiva.
TIPOS_DE_AVANCE = ('AVANCE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')

FUNCIONES_VALIDADORAS_DE_AVANCE = ('SUPERVISION', 'ENTIDAD')

# Detectar ≠ prohibir, detectar ≠ aceptar silenciosamente (doc 98 §K).
CODIGOS_DE_CONFLICTO = ('EXCESO_SOBRE_OBJETIVO', 'SOLAPE_CON_APROBADO',
                        'POSIBLE_DUPLICADO')

# Bloqueos de autoridad (corrección 2): jamás una función desnuda.
SIN_APROBADOR_CONTRACTUAL = 'SIN_APROBADOR_CONTRACTUAL'
APROBADOR_CONTRACTUAL_AMBIGUO = 'APROBADOR_CONTRACTUAL_AMBIGUO'

CLAVES_DEL_SNAPSHOT_DE_OBJETIVO = (
    'objetivo_fuente', 'objetivo_id', 'objetivo_unidad',
    'objetivo_cantidad', 'objetivo_huella',
)

FUENTES_DE_OBJETIVO = ('lob_cost_items', 'civil_solids', 'elementos')


# ── La firma es la regla ──────────────────────────────────────────────────

def puede_aprobar_avance(funcion_del_actor, es_el_autor):
    """SOLO una función validadora, y nunca el propio autor.

    La firma de esta función ES la regla: no existe parámetro por el que un
    cargo de plataforma pueda colarse. Quien necesite intervenir tiene que
    ejercer una función contractual declarada en la obra.
    """
    if es_el_autor:
        return False
    return funcion_del_actor in FUNCIONES_VALIDADORAS_DE_AVANCE


def resolver_aprobador_contractual(candidatos_supervision, candidatos_entidad):
    """Corrección 2: el BIC apunta a un SUJETO CONCRETO, jamás a una función.

    Cada candidato: {'user_id', 'company_id', 'funcion', 'nombre'} — personas
    de la obra que HOY ejercen la función. La resolución:

      0 candidatos            → (None, SIN_APROBADOR_CONTRACTUAL)
      1 persona               → esa persona, con su función snapshoteada
      >1 de LA MISMA empresa  → la EMPRESA concreta es el sujeto (la función
                                la ejerce la empresa supervisora; cualquiera
                                de los suyos firma por ella)
      >1 de varias empresas   → (None, APROBADOR_CONTRACTUAL_AMBIGUO): la
                                ambigüedad se declara, no se adivina

    ENTIDAD es contingencia DECLARADA: solo se consulta cuando SUPERVISION
    está vacía, y sigue exactamente la misma regla.
    """
    for grupo in (candidatos_supervision, candidatos_entidad):
        grupo = list(grupo or [])
        if not grupo:
            continue
        if len(grupo) == 1:
            unico = grupo[0]
            return ({'tipo': 'persona', 'user_id': unico['user_id'],
                     'company_id': unico.get('company_id'),
                     'funcion': unico['funcion']}, None)
        empresas = {c.get('company_id') for c in grupo}
        if len(empresas) == 1 and None not in empresas:
            return ({'tipo': 'empresa', 'company_id': empresas.pop(),
                     'funcion': grupo[0]['funcion']}, None)
        return (None, APROBADOR_CONTRACTUAL_AMBIGUO)
    return (None, SIN_APROBADOR_CONTRACTUAL)


# ── Corrección 1: el snapshot de autoridad del objetivo ───────────────────

def snapshot_del_objetivo(fuente, objetivo_id, unidad, cantidad, huella):
    """La base contra la que un avance fue RECONOCIDO, sellada al aprobar.

    El histórico no puede cambiar semánticamente porque después cambie el
    metrado: el porcentaje HISTÓRICO se deriva de este snapshot; el ACTUAL,
    del plan vigente. Dos preguntas distintas, cero duplicación de derivados.
    """
    if fuente is None:
        return dict.fromkeys(CLAVES_DEL_SNAPSHOT_DE_OBJETIVO)
    if fuente not in FUENTES_DE_OBJETIVO:
        raise ValueError('fuente de objetivo desconocida: %r' % (fuente,))
    if cantidad is None or float(cantidad) <= 0:
        raise ValueError('un objetivo sin cantidad positiva no es autoridad')
    return {'objetivo_fuente': fuente, 'objetivo_id': str(objetivo_id),
            'objetivo_unidad': unidad, 'objetivo_cantidad': float(cantidad),
            'objetivo_huella': huella}


def huella_de_dataset(dataset_id, version, source_fingerprint):
    """Versión/revisión/huella de la fuente, legible y comparable."""
    return 'dataset:%s·v%s·%s' % (dataset_id, version or 0,
                                  (source_fingerprint or 'sin-huella')[:16])


def porcentaje(cantidad_acumulada, objetivo):
    """% = Σ aprobado / objetivo. Sin denominador no se inventa un %."""
    if objetivo is None or float(objetivo) <= 0:
        return None
    return round(100.0 * float(cantidad_acumulada) / float(objetivo), 2)


# ── Magnitudes y acumulado ────────────────────────────────────────────────

def efecto_de(tipo):
    """La dirección la pone el TIPO; la cantidad es siempre positiva."""
    if tipo not in TIPOS_DE_AVANCE:
        raise ValueError('tipo de avance desconocido: %r' % (tipo,))
    return -1.0 if tipo == 'AJUSTE_NEGATIVO' else 1.0


def acumulado_de(avances):
    """Σ efecto·cantidad de los APROBADOS. Lo demás no suma: es testimonio."""
    total = 0.0
    for a in avances:
        if a.get('estado') != 'APROBADO':
            continue
        total += efecto_de(a['tipo']) * float(a['cantidad'])
    return round(total, 6)


# ── Conflictos: detectar, mostrar, y aprobar SOLO con confirmación ────────

def detectar_conflictos(nuevo, aprobados_previos, objetivo):
    """Los códigos que la aprobación tendrá que confirmar uno a uno.

    - EXCESO_SOBRE_OBJETIVO: aprobar esto dejaría Σ > objetivo.
    - SOLAPE_CON_APROBADO: progresivas que pisan un aprobado de la misma
      referencia (capas sucesivas EXISTEN: por eso se marca, no se prohíbe).
    - POSIBLE_DUPLICADO: misma referencia + misma cantidad + misma fecha en
      otro acto. Dos capas iguales el mismo día son reales; decide quien
      aprueba.
    """
    codigos = []
    if objetivo is not None and float(objetivo) > 0:
        seria = acumulado_de(aprobados_previos) + \
            efecto_de(nuevo['tipo']) * float(nuevo['cantidad'])
        if seria > float(objetivo) + 1e-9:
            codigos.append('EXCESO_SOBRE_OBJETIVO')
    ni, nf = nuevo.get('progresiva_inicio'), nuevo.get('progresiva_fin')
    for previo in aprobados_previos:
        if previo.get('estado') != 'APROBADO':
            continue
        pi, pf = previo.get('progresiva_inicio'), previo.get('progresiva_fin')
        if None not in (ni, nf, pi, pf) and ni < pf and pi < nf:
            if 'SOLAPE_CON_APROBADO' not in codigos:
                codigos.append('SOLAPE_CON_APROBADO')
        if (str(previo.get('fecha_operativa')) == str(nuevo.get('fecha_operativa'))
                and float(previo.get('cantidad', -1)) == float(nuevo.get('cantidad', -2))
                and previo.get('tipo') == nuevo.get('tipo')):
            if 'POSIBLE_DUPLICADO' not in codigos:
                codigos.append('POSIBLE_DUPLICADO')
    return codigos


def confirmaciones_completas(codigos_detectados, confirmaciones):
    """Corrección 3: aprobar con conflicto exige rastro por CADA código.

    Cada confirmación: {'codigo', 'motivo', 'actor_id', 'ts'}. Devuelve la
    lista de códigos SIN confirmar (vacía = puede aprobarse).
    """
    validas = set()
    for c in confirmaciones or []:
        if c.get('codigo') and (c.get('motivo') or '').strip() \
                and c.get('actor_id') and c.get('ts'):
            validas.add(c['codigo'])
    return [c for c in codigos_detectados or [] if c not in validas]


# ── Fechas ACTUAL (proyección) ────────────────────────────────────────────

def actual_start_de(avances_aprobados):
    """La PRIMERA ejecución aprobada aplicable — nunca una inferencia."""
    fechas = [a['fecha_operativa'] for a in avances_aprobados
              if a.get('estado') == 'APROBADO' and a.get('fecha_operativa')]
    return min(fechas) if fechas else None


def actual_finish_de(avances_aprobados):
    """ÚNICAMENTE la declaración explícita de terminación, aprobada.

    Ni «llegó al 100 %» ni «no hay más reportes» terminan una actividad: la
    termina alguien DICIENDO que terminó, y una autoridad aprobándolo.
    """
    fechas = [a['fecha_operativa'] for a in avances_aprobados
              if a.get('estado') == 'APROBADO' and a.get('termina_actividad')
              and a.get('fecha_operativa')]
    return max(fechas) if fechas else None


def estado_derivado(actual_start, actual_finish):
    if actual_finish:
        return 'terminada'
    if actual_start:
        return 'en_ejecucion'
    return 'sin_iniciar'
