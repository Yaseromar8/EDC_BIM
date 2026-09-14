# -*- coding: utf-8 -*-
"""GAP 06 · PLANTILLAS DE FLUJO DE REVISION — el molde, no el proceso.

LA SEPARACION QUE GOBIERNA ESTE OBJETO ENTERO
----------------------------------------------

    PLANTILLA  ──aplicar──▶  REVISION (instancia)

    y NUNCA:

    PLANTILLA  ──gobierna──▶  REVISION ya iniciada

Una revision iniciada conserva SU PROPIO flujo. Cambiar la plantilla despues no
toca ni una revision en curso ni una cerrada. Si la gobernara en vivo, editar
una plantilla reescribiria retroactivamente procesos ya firmados -- que en obra
publica significa cambiar quien tenia que aprobar algo DESPUES de que se
aprobara.

ESTO NO ES UN MOTOR DE REVISION NUEVO
--------------------------------------
`doc_reviews.steps` YA es un snapshot: cada revision guarda sus pasos en su
propia fila y `flujo_de_revision` los resuelve. Lo que faltaba no era el
snapshot: era DE DONDE SALEN esos pasos. Esta plantilla los produce y desaparece.

La expansion ocurre DENTRO del alta de revisiones (`POST /api/reviews`), no en
una ruta paralela. Un segundo camino de alta acabaria saltandose la comprobacion
de independencia, la de documentos o la de idoneidad -- y nadie se enteraria
hasta que hiciera falta.

EL SUJETO DE UN PASO: PERSONA o FUNCION
----------------------------------------
Doc 82 §4.6 recoge que en Forma el sujeto designado puede ser una persona, su
ROL o su EMPRESA. Aqui se admiten dos formas, y la eleccion no es cosmetica:

    user_id    UNA PERSONA.   Solo en plantillas de OBRA: una persona concreta
                              no significa nada en otra obra.
    funcion    UNA FUNCION contractual (`directorio_de_obra.FUNCIONES`). Se
                              RESUELVE al aplicar, contra los miembros de esa
                              obra. Es lo que hace que una plantilla de ENTIDAD
                              sirva en veinte obras distintas.

Resolver al aplicar --y no al crear-- es lo que permite que la plantilla sea
reutilizable sin convertirse en una fuente de autoridad: quien acaba en el paso
es siempre alguien que YA es miembro de esa obra con esa funcion.

LO QUE NO SE ADOPTA, Y SE DECLARA
----------------------------------
    PASOS EN PARALELO.  El motor es estrictamente secuencial: `current_step`
    avanza de uno en uno. Adoptar paralelo no es un campo mas, es otro motor --
    haria falta un estado por rama, una regla de confluencia y una redefinicion
    de «a quien le toca». El benchmark lo lista como «secuencial/paralelo SI SE
    ADOPTA»; aqui NO se adopta, y la plantilla no finge ofrecerlo.
"""

import collections
import copy

import directorio_de_obra as dir_obra

# ── ALCANCE ────────────────────────────────────────────────────────────────
OBRA = 'OBRA'
ENTIDAD = 'ENTIDAD'
ALCANCES = (OBRA, ENTIDAD)

# ── TIPO DE DECISION DE UN PASO. Lista CERRADA ─────────────────────────────
#
# Es la distincion que Forma hace entre `reviewers` y `approvers`: no todos los
# que miran deciden. Se guarda en el paso y viaja al snapshot, para que la
# revision sepa que se le pidio a cada uno aunque la plantilla cambie.
REVISA = 'REVISA'      # comenta y da paso; no dicta el veredicto
APRUEBA = 'APRUEBA'    # su firma vale como aprobacion

DECISIONES = (
    (REVISA, 'Revisa'),
    (APRUEBA, 'Aprueba'),
)
CODIGOS_DECISION = tuple(c for c, _ in DECISIONES)

FUNCIONES = dir_obra.FUNCIONES

Resuelto = collections.namedtuple('Resuelto', ('pasos', 'error', 'code', 'opciones'))


def etiqueta_decision(codigo):
    for c, e in DECISIONES:
        if c == codigo:
            return e
    return codigo or ''


# ── VALIDAR EL MOLDE ───────────────────────────────────────────────────────

def validar_pasos(pasos, alcance, contrato=None):
    """None si el molde es utilizable; un mensaje si no.

    Se valida AL CREAR LA PLANTILLA. Descubrir que el paso 3 no designa a nadie
    cuando ya se ha aplicado a nueve obras es tarde.

    EL CONTRATO VIGENTE TAMBIEN SE VALIDA AQUI (REVIEWS-R01)
    --------------------------------------------------------
    Bajo `AUTORIDAD_TERMINAL` un flujo cuyo ultimo paso solo REVISA no puede
    cerrarse nunca. Se rechaza al GUARDAR, no al aplicar: una plantilla que no
    puede producir una revision valida no es una plantilla, es una trampa.

    `modificar` llama a esta misma funcion, asi que editar una plantilla PRE
    produce configuracion nueva y tiene que satisfacer el contrato vigente para
    poder guardarse. Las plantillas historicas NO se reescriben: quedan intactas
    y listadas mientras nadie las edite.

    `contrato=None` significa «el vigente». Se puede pasar explicito para poder
    probar los dos sin tocar la constante.
    """
    if not isinstance(pasos, list) or not pasos:
        return 'Una plantilla sin pasos no describe ningún flujo.'
    if len(pasos) > 6:
        # Forma llega a seis (`One Step Approval` … `Six Step Approval`). Mas
        # que un limite tecnico es un limite de sentido: un flujo de ocho pasos
        # no lo termina nadie.
        return 'Un flujo de más de seis pasos no lo termina nadie. Divídelo.'

    for i, paso in enumerate(pasos):
        n = i + 1
        if not isinstance(paso, dict):
            return 'El paso %d no es un paso.' % n
        if not (paso.get('etiqueta') or '').strip():
            return 'El paso %d necesita un nombre: es lo que verá quien revise.' % n
        if paso.get('decision') not in CODIGOS_DECISION:
            return ('El paso %d no dice qué se le pide: revisar o aprobar.' % n)

        tiene_persona = bool(paso.get('user_id'))
        tiene_funcion = bool(paso.get('funcion'))
        if not tiene_persona and not tiene_funcion:
            return ('El paso %d no designa a nadie. Un paso sin sujeto es un '
                    'flujo que se para ahí.' % n)
        if tiene_persona and tiene_funcion:
            return ('El paso %d designa a una persona Y una función a la vez: '
                    'al aplicar no se sabría cuál manda.' % n)
        if tiene_persona:
            # E1.3 · un id que no es un numero se guardaba y reventaba despues, al
            # aplicar la plantilla, en un `int()` sin comprobar.
            try:
                if isinstance(paso['user_id'], bool) or int(paso['user_id']) <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return 'El paso %d designa a una persona que no es válida.' % n
        if tiene_funcion and paso['funcion'] not in FUNCIONES:
            return ('El paso %d designa una función que no existe: %s.'
                    % (n, ', '.join(FUNCIONES)))
        if tiene_persona and alcance == ENTIDAD:
            return ('El paso %d designa a una persona concreta, y esta plantilla '
                    'es de la entidad: esa persona no significa nada en otra '
                    'obra. Designa una función.' % n)

        # EL PLAZO, CON LA MISMA REGLA QUE EL ALTA (E1.3). Aqui se admitia 0 y el
        # alta lo rechaza --«mayor que cero»--, asi que se guardaba un flujo que
        # despues no abria ninguna revision. Vacio sigue siendo «sin plazo».
        dias = paso.get('dias')
        if dias not in (None, ''):
            try:
                if isinstance(dias, bool) or int(dias) < 1:
                    raise ValueError
            except (TypeError, ValueError, OverflowError):
                return ('El plazo del paso %d tiene que ser un número entero de días, '
                        'de 1 en adelante, o quedar vacío si no tiene plazo.' % n)

    # ── ¿PUEDE ESTE FLUJO CERRARSE? ────────────────────────────────────────
    # Se pregunta con la MISMA funcion que usa el motor al aprobar. Si el molde
    # y el motor respondieran cada uno a su manera, se podria guardar una
    # plantilla que despues no se puede terminar -- la clase de defecto que ya
    # nos costo la migracion 24: codigo y regla divergiendo sin que nada los
    # casara.
    import flujo_de_revision as flujo
    if contrato is None:
        contrato = flujo.CONTRATO_VIGENTE
    if contrato == flujo.AUTORIDAD_TERMINAL and not flujo.cierra_positivamente(
            contrato, pasos, len(pasos) - 1):
        return ('El último paso de este flujo sólo revisa, así que la revisión '
                'no podría cerrarse nunca. El último paso tiene que ser de '
                'aprobación.')
    return None


# ── APLICAR EL MOLDE ───────────────────────────────────────────────────────

def resolver(cur, plantilla, obra, elecciones=None):
    """Convierte los pasos de la plantilla en los `steps` de UNA revision.

    Devuelve un `Resuelto`. Si un paso designa una funcion con VARIOS candidatos
    NO se elige por su cuenta: se devuelven las opciones para que quien aplica
    decida. Elegir «el primero» seria repartir responsabilidad contractual por
    orden alfabetico.

    Lo que sale de aqui es una COPIA independiente. A partir de ese momento la
    plantilla no tiene nada que ver con esa revision.

    `opciones` (E1.3) son los pasos por funcion con VARIAS personas posibles, y
    quienes son, ESTEN YA ELEGIDOS O NO: la pantalla necesita la lista tambien
    despues de elegir, para dejar cambiar la eleccion. Si falta elegir alguno, el
    resultado es ELIGE_REVISOR; si no, los pasos, con esas mismas opciones.

    Una eleccion que no es un numero, o unas elecciones que no son un
    diccionario, son ELECCION_INVALIDA: antes reventaban en un `int()` y salian
    como un error tecnico.
    """
    if elecciones is not None and not isinstance(elecciones, dict):
        return Resuelto(None, 'La elección de personas no es válida.',
                        'ELECCION_INVALIDA', {})
    elecciones = {str(k): v for k, v in (elecciones or {}).items()}
    pasos, opciones, sin_elegir = [], {}, []

    for i, molde in enumerate(plantilla.get('pasos') or []):
        paso = copy.deepcopy(molde)
        uid = paso.pop('user_id', None)
        funcion = paso.pop('funcion', None)

        if funcion:
            elegido = elecciones.get(str(i))
            candidatos = miembros_con_funcion(cur, obra, funcion)
            if len(candidatos) > 1:
                opciones[str(i)] = candidatos
            if elegido not in (None, ''):
                try:
                    elegido = None if isinstance(elegido, bool) else int(elegido)
                except (TypeError, ValueError):
                    elegido = None
                if elegido is None or elegido not in [c['id'] for c in candidatos]:
                    return Resuelto(None,
                                    'La persona elegida para el paso %d no tiene la '
                                    'función %s en esta obra.' % (i + 1, funcion),
                                    'ELECCION_INVALIDA', {})
                uid = elegido
            elif not candidatos:
                return Resuelto(None,
                                'El paso %d pide la función %s y en esta obra no hay '
                                'nadie con esa función. Añade el participante o usa '
                                'otra plantilla.' % (i + 1, funcion),
                                'SIN_CANDIDATO', {})
            elif len(candidatos) == 1:
                uid = candidatos[0]['id']
            else:
                sin_elegir.append(i + 1)
                continue

        try:
            uid = None if isinstance(uid, bool) else int(uid)
        except (TypeError, ValueError):
            uid = None
        if not uid:
            return Resuelto(None,
                            'El paso %d designa a una persona que no es válida. Hay que '
                            'editar el flujo.' % (i + 1), 'REVISOR_INVALIDO', {})
        cur.execute('SELECT id, name, email FROM users WHERE id = %s AND is_active',
                    (uid,))
        fila = cur.fetchone()
        if not fila:
            return Resuelto(None,
                            'La persona del paso %d ya no tiene una cuenta activa. Hay '
                            'que editar el flujo o usar otro.' % (i + 1),
                            'REVISOR_INACTIVO', {})
        cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s',
                    (str(obra), fila[0]))
        if not cur.fetchone():
            return Resuelto(None,
                            '%s, del paso %d, ya no es participante de esta obra. '
                            'Añádelo en Administración → Participantes o edita el '
                            'flujo.' % (fila[1] or fila[2] or 'La persona', i + 1),
                            'REVISOR_NO_MIEMBRO', {})

        # `email` y `name` viajan como INSTANTANEA, igual que en un paso escrito
        # a mano: dicen a quien se le pidio y con que nombre. La identidad es
        # `user_id` y solo `user_id`.
        paso['user_id'] = fila[0]
        paso['name'] = fila[1]
        paso['email'] = fila[2]
        # De donde salio este paso. Es TRAZA, nunca autoridad: nadie lo consulta
        # para decidir quien puede firmar.
        paso['de_funcion'] = funcion or None
        pasos.append(paso)

    if sin_elegir:
        return Resuelto(None,
                        'Este flujo tiene pasos con varias personas posibles: elige '
                        'quién hace el paso %s.' % ', '.join(str(n) for n in sin_elegir),
                        'ELIGE_REVISOR', opciones)
    return Resuelto(pasos, None, None, opciones)


def miembros_con_funcion(cur, obra, funcion):
    """Los miembros de la obra cuya EMPRESA tiene esa función contractual.

    Se lee de `project_companies`, que es donde ya vive la función: no se crea
    una segunda tabla de funciones ni una segunda fuente de autoridad.
    """
    cur.execute("""
        SELECT u.id, u.name, u.email, c.name
          FROM project_users pu
          JOIN users u ON u.id = pu.user_id AND u.is_active
     LEFT JOIN companies c ON c.id = u.company_id
          JOIN project_companies pc
            ON pc.project_id = pu.project_id AND pc.company_id = u.company_id
         WHERE pu.project_id = %s AND pc.funcion = %s
         ORDER BY u.name NULLS LAST, u.email
    """, (str(obra), funcion))
    return [{'id': r[0], 'name': r[1], 'email': r[2], 'empresa': r[3]}
            for r in cur.fetchall()]


def motivo_no_utilizable(cur, plantilla, obra):
    """Por que esta plantilla NO puede abrir hoy una revision en esta obra; None si puede.

    E1.3 · SE DICE ANTES DE ELEGIRLA. Un flujo viejo cuyo ultimo paso solo revisa,
    con un plazo de 0 dias o con alguien que ya no esta en la obra aparecia en el
    selector como cualquier otro, y fallaba al pulsar «Iniciar revisión».

    Se pregunta con las MISMAS funciones que el alta: `validar_pasos` con el
    contrato vigente y `resolver` contra los miembros de ESTA obra. Tener que
    elegir persona no la hace inutilizable: se elige al aplicarla. Lo que depende
    de quien crea la revision y de sus documentos --independencia, acceso a los
    documentos, versiones-- no se puede saber aqui: lo dice la vista previa del
    alta.

    Solo lee. No cambia ni la plantilla ni ninguna revision.
    """
    if not plantilla.get('activa', True):
        return 'Está deshabilitada: no abre revisiones nuevas.'
    mal = validar_pasos(plantilla.get('pasos'), plantilla.get('alcance'))
    if mal:
        return mal
    res = resolver(cur, plantilla, obra)
    if res.error and res.code != 'ELIGE_REVISOR':
        return res.error
    return None


def procedencia(plantilla):
    """Lo que la revision guarda sobre DE DONDE salio su flujo.

    Es documentación del origen, no un vínculo vivo: la revisión no vuelve a
    mirar la plantilla nunca más. Se guarda tambien el NOMBRE y la VERSION
    porque la plantilla puede renombrarse o cambiar, y entonces «plantilla 4»
    dejaria de decir nada sobre lo que se aplico aquel dia.
    """
    return {
        'plantilla_id': plantilla.get('id'),
        'plantilla_nombre': plantilla.get('nombre'),
        'plantilla_version': plantilla.get('version'),
    }
