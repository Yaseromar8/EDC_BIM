# -*- coding: utf-8 -*-
"""GAP 11 · CORE · ISSUE — una condición detectada que exige corrección Y verificación.

POR QUE ESTE OBJETO EXISTE, Y POR QUE NO LO ES EL RED LINE
-----------------------------------------------------------
La semántica quedó congelada por el propietario el 25-ago-2026, tras la
auditoría del doc 86:

    RED LINE  = modificación / croquis de cambio del proyecto
    ISSUE     = condición detectada que requiere corrección + verificación

    RED LINE ≠ ISSUE

El Red Line NUNCA vuelve a usarse como contenedor genérico de defectos. Se
intentó una vez —el escalado de los protocolos (GAP 03) creaba Red Lines— y era
un error semántico: el Red Line acepta o rechaza *una modificación del
proyecto*, no constata un defecto. Los 33 Red Lines históricos son croquis
firmados (`…-RL-SKT-…`), y contaminar ese registro habría sido irreparable.

LO QUE DISTINGUE A UN ISSUE DE TODO LO DEMAS DEL PRODUCTO
----------------------------------------------------------
Los otros registros formales terminan cuando alguien DICTA UN VEREDICTO. Un
issue termina cuando alguien VERIFICA QUE SE CORRIGIÓ. Son tres actos, y el
objeto tiene que poder distinguirlos o no prueba nada:

    DEFECTO DETECTADO      alguien constata que algo está mal
            ≠
    CORRECCIÓN EJECUTADA   el responsable declara que lo arregló
            ≠
    APROBACIÓN DEL CIERRE  OTRO verifica y lo da por bueno

LA REGLA QUE GOBIERNA EL OBJETO ENTERO
---------------------------------------
    QUIEN CORRIGE NO VERIFICA SU PROPIA CORRECCIÓN.

Sin eso, «verificado» significa «el responsable dice que ya está», que es lo
mismo que no verificar. Es la misma familia de invariante que la independencia
autor/revisor de las revisiones y que «nadie dicta el veredicto de su propio
submittal»: el producto entero se apoya en que un acto de conformidad tenga dos
partes distintas.

LA EXCEPCIÓN, PORQUE EN OBRA A VECES HACE FALTA
------------------------------------------------
Se admite autoverificación, pero **declarada, con motivo y auditada**: la marca
`autoverificacion` la pone un ADMINISTRADOR DE OBRA sobre un issue concreto,
nunca el propio responsable, y queda en el historial. Una excepción que se puede
leer es gobierno; una que se concede en silencio es un agujero.

QUE ES «CORE» AQUI, Y QUE SIGUE SIENDO GAP 11 GRANDE
------------------------------------------------------
Esto es EL NÚCLEO que GAP 04 necesita, no el gap entero. Fuera, a propósito:

    campos personalizados por tipo      ┐
    causa raíz y su analítica           │  siguen en
    estados propios por obra (45 solo   ├─ GAP 11 · ISSUES DE PRIMERA CLASE
      apaga los opcionales de ACC)      │
    tipos configurables por admin       │  y NO se declaran COMPLETE hoy
    taxonomías y automatizaciones       ┘

Los tipos de aquí son una LISTA CERRADA precisamente porque configurarlos es lo
que pertenece al gap grande.
"""

import collections
import unicodedata

import flujo_de_registro as reg

# ── TIPOS. Lista CERRADA — configurarlos es GAP 11 grande ──────────────────
PUNCH = 'PUNCH'                    # observación de cierre / recepción
NO_CONFORMIDAD = 'NO_CONFORMIDAD'  # punto no conforme de un protocolo
CALIDAD = 'CALIDAD'                # defecto de calidad detectado en ejecución
SEGURIDAD = 'SEGURIDAD'            # condición insegura
OBSERVACION = 'OBSERVACION'        # observación sobre un documento, nacida de una marca (37)

TIPOS = (
    (PUNCH,          'Punch / observación de cierre'),
    (NO_CONFORMIDAD, 'No conformidad de protocolo'),
    (CALIDAD,        'Calidad'),
    (SEGURIDAD,      'Seguridad'),
    (OBSERVACION,    'Observación de documento'),
)
CODIGOS_TIPO = tuple(c for c, _ in TIPOS)

# Los que EXIGEN responsable desde el nacimiento. Un punch o una no conformidad
# sin nadie a quien reclamarle es un defecto que nadie va a corregir; una
# observación de calidad o seguridad puede levantarse antes de saber de quién es.
EXIGEN_RESPONSABLE = (PUNCH, NO_CONFORMIDAD, OBSERVACION)

# Los que EXIGEN verificador DESIGNADO al nacer. En un PUNCH las tres personas
# son distintas por naturaleza --registra quien recorre, corrige el contratista,
# aprueba la supervision-- y dejar el verificador sin designar obligaria a
# elegirlo despues, que es como el detector acababa heredando el cierre.
# Una OBSERVACIÓN de documento nace de una marca: la verifica quien la marcó
# (sabe qué pidió), y se ESCRIBE al nacer, como en la no conformidad de protocolo.
EXIGEN_VERIFICADOR = (PUNCH, OBSERVACION)

# Los que nacen ANCLADOS a un plano. Un punch se levanta recorriendo la obra
# con la lámina en la mano: sin decir dónde, no se puede ir a corregirlo.
EXIGEN_UBICACION = (PUNCH,)


def etiqueta_tipo(codigo):
    for c, e in TIPOS:
        if c == codigo:
            return e
    return codigo or ''


# ── EL CICLO ───────────────────────────────────────────────────────────────
# Los códigos guardados NO cambian (hay historial escrito con ellos); lo que se ve
# son las ETIQUETAS, las de los issues de ACC (docs/archivos/18 §3). ACC: Draft,
# Open, In progress, In dispute, In review, Not approved, Closed, Void.
BORRADOR = 'Borrador'      # (45) lo guarda quien la levanta; nadie más la ve ni le debe nada
ABIERTO = 'Abierto'        # detectado, con responsable; falta corregir
EN_CURSO = 'En curso'      # (45) el responsable dice que ya la está corrigiendo
EN_DISPUTA = 'En disputa'  # (45) el responsable dice que no procede; decide quien la levantó
CORREGIDO = 'Corregido'    # el responsable declara que lo arregló (Ready to Close)
VERIFICADO = 'Verificado'  # OTRO comprobó la corrección. Cerrado
REABIERTO = 'Reabierto'    # el verificador la rechazó; vuelve al responsable
ANULADO = 'Anulado'        # se levantó por error; nunca fue un defecto

ESTADOS = (BORRADOR, ABIERTO, EN_CURSO, EN_DISPUTA, CORREGIDO, VERIFICADO, REABIERTO, ANULADO)

ETIQUETAS = {
    BORRADOR: 'Borrador', ABIERTO: 'Abierta', EN_CURSO: 'En curso', EN_DISPUTA: 'En disputa',
    CORREGIDO: 'En revisión', REABIERTO: 'No aprobada', VERIFICADO: 'Cerrada', ANULADO: 'Anulada',
}

# Los que el administrador de cada obra puede apagar, como en ACC. Sin fila en
# `issue_estados_de_obra` (45) están todos encendidos.
OPCIONALES = (BORRADOR, EN_CURSO, EN_DISPUTA)

TRANSICIONES = {
    BORRADOR:   (ABIERTO, ANULADO),                          # enviar o descartar
    ABIERTO:    (EN_CURSO, CORREGIDO, EN_DISPUTA, ANULADO),
    EN_CURSO:   (CORREGIDO, EN_DISPUTA, ANULADO),
    EN_DISPUTA: (ABIERTO, ANULADO),                          # quien la levantó la reafirma o la anula
    CORREGIDO:  (VERIFICADO, REABIERTO),
    REABIERTO:  (EN_CURSO, CORREGIDO, EN_DISPUTA, ANULADO),
    VERIFICADO: (),          # cerrado. Un defecto nuevo es un issue nuevo
    ANULADO:    (),
}

# Los estados en los que el issue TODAVÍA PESA sobre alguien.
VIVOS = (ABIERTO, EN_CURSO, EN_DISPUTA, CORREGIDO, REABIERTO)
# Los que todavía no se cerraron: los vivos y el borrador. Una marca en uno de
# ellos no se puede retirar.
SIN_CERRAR = (BORRADOR,) + VIVOS

# UN BORRADOR DESCARTADO (2-nov-2026, decisión del dueño): para todos, como si se hubiera borrado. NO se borra la fila:
# la aplicación no tiene DELETE sobre doc_issues desde el barrido de privilegios de la migración 26, y esa protección se
# queda. Pasa a «Anulado» con el evento `discarded` en su historial, y toda lectura lo deja fuera con esta condición.
EVENTO_DESCARTADA = 'discarded'
SQL_NO_DESCARTADA = "NOT (history @> '[{\"event\": \"discarded\"}]'::jsonb)"


def es_descartada(history):
    return any(isinstance(h, dict) and h.get('event') == EVENTO_DESCARTADA for h in (history or []))
# Donde el responsable tiene la pelota: corregir, empezar o decir que no procede.
EN_MANOS_DEL_RESPONSABLE = (ABIERTO, EN_CURSO, REABIERTO)


def esta_cerrado(estado):
    return estado in (VERIFICADO, ANULADO)


def etiqueta_estado(codigo):
    return ETIQUETAS.get(codigo, codigo or '')


def config_de_obra(cur, obra):
    """Lo que la obra decide de sus incidencias (45): estados opcionales, subtipos por tipo, causas raíz y campos
    propios. Sin fila: todos los opcionales encendidos y ninguna lista."""
    cur.execute('SELECT opcionales, subtipos, causas, campos FROM issue_config_de_obra WHERE project_id = %s', (obra,))
    r = cur.fetchone()
    if not r:
        return {'opcionales': list(OPCIONALES), 'subtipos': {}, 'causas': [], 'campos': []}
    return {'opcionales': list(r[0] or []), 'subtipos': r[1] or {}, 'causas': list(r[2] or []),
            'campos': list(r[3] or [])}


def opcionales_de_obra(cur, obra):
    """Los estados opcionales que usa la obra (45). Sin fila: todos, que es lo de partida."""
    return config_de_obra(cur, obra)['opcionales']


# ── LOS CAMPOS PROPIOS DE LA OBRA (45) ────────────────────────────────────
# Como los «custom attributes» de ACC: los define el administrador de la obra y
# viven en `campos` (jsonb) de cada incidencia. Cuatro clases, ni una más: lo
# que una obra necesita apuntar cabe en ellas, y cada una se valida aquí.
TIPOS_DE_CAMPO = ('texto', 'numero', 'fecha', 'lista')


def definiciones_validas(definiciones):
    """(lista normalizada, None) o (None, motivo). La define el administrador."""
    if not isinstance(definiciones, list) or len(definiciones) > 30:
        return None, 'Como mucho 30 campos propios.'
    salida, claves = [], set()
    for d in definiciones:
        if not isinstance(d, dict):
            return None, 'Cada campo es {clave, etiqueta, tipo}.'
        etiqueta = str(d.get('etiqueta') or '').strip()[:80]
        # La clave, sin tildes ni signos: es lo que se guarda en `campos` y no cambia si se retoca la etiqueta.
        sin_tildes = unicodedata.normalize('NFKD', etiqueta.lower()).encode('ascii', 'ignore').decode()
        clave = str(d.get('clave') or '').strip()[:40] or \
            '_'.join(''.join(c if c.isalnum() else ' ' for c in sin_tildes).split())[:40]
        tipo = d.get('tipo')
        if not etiqueta or not clave or tipo not in TIPOS_DE_CAMPO:
            return None, 'Cada campo necesita un nombre y una clase (%s).' % ', '.join(TIPOS_DE_CAMPO)
        if clave in claves:
            return None, 'Dos campos con el mismo nombre: «%s».' % etiqueta
        claves.add(clave)
        opciones = [str(o).strip()[:80] for o in (d.get('opciones') or []) if str(o).strip()][:50]
        if tipo == 'lista' and not opciones:
            return None, 'El campo «%s» es una lista: dale sus opciones.' % etiqueta
        # A qué TIPOS de incidencia se aplica, como los atributos de ACC: vacío = a todos.
        tipos = [t for t in (d.get('tipos') or []) if t in CODIGOS_TIPO]
        if len(tipos) != len(d.get('tipos') or []):
            return None, 'El campo «%s» se aplica a un tipo que no existe.' % etiqueta
        salida.append({'clave': clave, 'etiqueta': etiqueta, 'tipo': tipo, 'obligatorio': bool(d.get('obligatorio')),
                       **({'opciones': opciones} if tipo == 'lista' else {}), **({'tipos': tipos} if tipos else {})})
    return salida, None


def campos_del_tipo(definiciones, tipo):
    """Los campos propios que se aplican a ese tipo de incidencia (sin `tipos`, a todos)."""
    return [d for d in definiciones or [] if not d.get('tipos') or tipo in d['tipos']]


def valores_validos(definiciones, valores, exigir_obligatorios=True, tipo=None):
    """(valores normalizados, None) o (None, motivo). Solo entran las claves definidas por la obra (y, con `tipo`,
    las que se aplican a ese tipo)."""
    from datetime import date
    valores = valores if isinstance(valores, dict) else {}
    salida = {}
    for d in (campos_del_tipo(definiciones, tipo) if tipo else definiciones or []):
        v = valores.get(d['clave'])
        if v is None or (isinstance(v, str) and not v.strip()):
            if exigir_obligatorios and d.get('obligatorio'):
                return None, 'Falta «%s».' % d['etiqueta']
            continue
        if d['tipo'] == 'numero':
            try:
                v = float(v)
            except (TypeError, ValueError):
                return None, '«%s» tiene que ser un número.' % d['etiqueta']
        elif d['tipo'] == 'fecha':
            try:
                v = date.fromisoformat(str(v)[:10]).isoformat()
            except ValueError:
                return None, '«%s» tiene que ser una fecha.' % d['etiqueta']
        elif d['tipo'] == 'lista':
            if v not in d.get('opciones', []):
                return None, '«%s» no está entre sus opciones.' % d['etiqueta']
        else:
            v = str(v).strip()[:500]
        salida[d['clave']] = v
    return salida, None


def opcional_apagado(estado, encendidos):
    """¿Esta obra apagó ese estado? `encendidos` = los opcionales que usa (None: todos)."""
    return estado in OPCIONALES and encendidos is not None and estado not in encendidos


# ── LAS TRES IDENTIDADES ───────────────────────────────────────────────────

def es_del_responsable(usuario, issue, empresa_del_usuario=None):
    """¿Esta persona ES el responsable? La persona designada o, si se asignó a una
    EMPRESA (45), cualquiera de esa empresa —que además es de la obra: lo
    garantiza quien pasa `empresa_del_usuario`—."""
    issue = issue or {}
    uid = (usuario or {}).get('id')
    if not uid:
        return False
    if issue.get('responsable_id'):
        return uid == issue.get('responsable_id')
    empresa = issue.get('responsable_empresa')
    return bool(empresa) and empresa_del_usuario is not None and int(empresa) == int(empresa_del_usuario)


def puede_corregir(usuario, issue, empresa_del_usuario=None):
    """Corrige el RESPONSABLE, y nadie más.

    Ni el administrador: un administrador que pudiera declarar corregido lo
    ajeno estaría firmando por otro que algo se arregló, sin haberlo hecho.
    Asignada a una empresa, corrige cualquiera de ella (como en ACC).
    """
    return es_del_responsable(usuario, issue, empresa_del_usuario)


def puede_verificar(usuario, issue, es_admin_de_obra=False, empresa_del_usuario=None):
    """Verifica EL VERIFICADOR DESIGNADO. Devuelve (puede, motivo_si_no).

    LA INVARIANTE DEL OBJETO. Sin ella «verificado» significa «el responsable
    dice que ya está», que es lo mismo que no verificar.

    EL DETECTOR NO HEREDA AUTORIDAD DE CIERRE
    ------------------------------------------
    La primera versión concedía la verificación a `autor_id`. Parecía razonable
    porque en una NO CONFORMIDAD de protocolo las dos personas coinciden: el
    inspector que la detecta es quien comprueba que se levantó. Pero en un PUNCH
    de recepción NO coinciden —registra quien recorre la obra, corrige el
    contratista, aprueba la SUPERVISIÓN— y ahí el detector se convertía en
    autoridad de cierre por inferencia, sin que nadie lo hubiera decidido.

    Ahora el verificador es un PAPEL DESIGNADO Y PERSISTIDO (`verificador_id`).
    Cuando detector y verificador son la misma persona, es porque alguien lo
    escribió así, no porque el código lo dedujera.
    """
    issue = issue or {}
    uid = (usuario or {}).get('id')
    if not uid:
        return False, 'sesión sin identidad'

    # LA EXCEPCIÓN, PRIMERO Y APARTE. Existe precisamente para que el CORRECTOR
    # pueda verificar lo suyo cuando un administrador lo ha autorizado por
    # escrito. Comprobarla al final la dejaba inservible.
    # Asignada a una EMPRESA, nadie de esa empresa verifica lo suyo (45).
    if es_del_responsable(usuario, issue, empresa_del_usuario):
        if issue.get('autoverificacion'):
            return True, ''
        return False, ('quien corrige no verifica su propia corrección; hace falta '
                       'una autorización explícita de autoverificación')

    designado = issue.get('verificador_id')
    if designado:
        if uid == designado:
            return True, ''
        return False, ('la verificación le corresponde al verificador designado '
                       'de este issue')

    # Sin verificador designado, solo un administrador de la obra. NO el
    # detector: dejarle cerrar sería volver a promoverlo en silencio.
    if es_admin_de_obra:
        return True, ''
    return False, ('este issue no tiene verificador designado; hasta que se le '
                   'asigne uno, solo un administrador de la obra puede verificarlo')


# ── EVIDENCIA ──────────────────────────────────────────────────────────────

def falta_evidencia_de_correccion(issue):
    """¿Se está declarando corregido sin enseñar nada?

    Un «ya está arreglado» sin prueba obliga al verificador a ir a mirar, y
    cuando la obra ya avanzó encima puede ser imposible. La evidencia es lo que
    hace que la verificación se pueda hacer desde el expediente.
    """
    return not ((issue or {}).get('evidencia_correccion') or [])


# ── LA SEMANTICA, declarada como DATO ──────────────────────────────────────
SEMANTICA = collections.namedtuple('Semantica', reg.Semantica._fields)(
    clave='ISSUE',
    tabla='doc_issues',
    prefijo='ISS',
    singular='issue',
    estados=ESTADOS,
    transiciones=TRANSICIONES,

    # - la pelota la mueve quien detectó o el ADMIN: reasignar el responsable de
    #   un defecto es un acto de obra, no del que lo tiene que arreglar.
    # - el VEREDICTO —verificar— no lo dicta ninguna posición del registro: lo
    #   decide `puede_verificar`, que es lo único que sabe de la separación
    #   corrector/verificador. Por eso esta tupla está VACÍA, igual que en el
    #   submittal y en el protocolo.
    quien_pasa_la_pelota=(reg.AUTOR, reg.ADMIN),
    quien_dicta_veredicto=(),
    quien_cierra=(reg.AUTOR, reg.ADMIN),
    quien_adopta=(reg.RESPONSABLE,),

    restriccion_unica=None,
    asunto_encargo='Corregir %s: %s',

    msg_no_reasigna='Solo quien detectó el defecto o un administrador de la obra pueden reasignarlo.',
    msg_no_adopta='Solo el responsable puede declarar que corrigió.',
    msg_no_veredicto='La verificación la hace quien no corrigió.',
    msg_no_cierra='Solo quien detectó el defecto o un administrador de la obra pueden anularlo.',
    msg_falta_veredicto='Un issue no se cierra sin verificar la corrección.',
    msg_cerrado='Este issue ya está cerrado. Un defecto nuevo es un issue nuevo.',
    msg_necesita_adopcion='Este issue espera a que su responsable corrija.',
    msg_bloqueado_fuera='Este issue pertenece a otra obra.',
)
