# -*- coding: utf-8 -*-
"""LA MECANICA DE REVISAR UN DOCUMENTO, una sola vez para todos los que revisan.

POR QUE EXISTE ESTE MODULO
---------------------------
GAP 02 le dio identidad y revisiones al PLANO. GAP 05 se la da a la
ESPECIFICACION. Y son el mismo mecanismo:

    una IDENTIDAD estable          (el número de plano / el número de sección)
    varias REVISIONES sobre ella   (A, B, C… o 00, 01, 02…)
    UNA SOLA VIGENTE               garantizada por un índice único parcial
    la nueva SUPERA a la anterior  en la misma transacción, o ninguna de las dos

Escribir eso dos veces era la opción obvia y la equivocada. Este producto ya
pagó ese error en el frontend --`IssueModule` nació de fusionar 1.387 líneas
idénticas entre RFI y Red Line-- y la lección fue la misma que aquí: lo que
diverge no son las dos copias el día que se escriben, es la tercera vez que
alguien arregla un fallo en una y no en la otra.

QUE ES COMPARTIDO Y QUE NO
---------------------------
Compartida, la MECANICA: numerar la serie, superar la vigente, insertar la
nueva. Propia de cada objeto, la SEMANTICA: un plano tiene disciplina y se
ancla en un punto; una sección de especificación pertenece a una división y
genera submittals. Esa parte NO vive aquí y no debe acabar viviendo aquí.

Es el mismo reparto que `flujo_de_registro` hace con RFI, Red Line, submittal,
protocolo e issue: mecánica compartida, semántica declarada como dato.
"""

import collections
import re

# Las tablas admitidas, CERRADAS. El nombre de una tabla se interpola en el SQL
# --no se puede parametrizar-- así que la lista de las que valen tiene que ser
# una constante del código y nunca algo que llegue de una petición.
Revisable = collections.namedtuple('Revisable', (
    'tabla_identidad',      # 'doc_planos'   | 'doc_spec_secciones'
    'tabla_revisiones',     # 'doc_plano_revisiones' | 'doc_spec_revisiones'
    'columna_padre',        # 'plano_id'     | 'seccion_id'
    'singular',             # cómo se nombra en los mensajes al usuario
))

PLANO = Revisable('doc_planos', 'doc_plano_revisiones', 'plano_id', 'plano')
SECCION = Revisable('doc_spec_secciones', 'doc_spec_revisiones', 'seccion_id',
                    'sección de especificación')

REVISABLES = (PLANO, SECCION)
_TABLAS_ADMITIDAS = {r.tabla_revisiones for r in REVISABLES}

# ── ESTADO DE UNA REVISION. Lista cerrada ──────────────────────────────────
VIGENTE = 'Vigente'
SUPERADA = 'Superada'
ANULADA = 'Anulada'          # se emitió por error; nunca fue válida
ESTADOS = (VIGENTE, SUPERADA, ANULADA)


def normalizar_identidad(numero):
    """El número es una IDENTIDAD: se normaliza para que 'pl-est-104',
    'PL-EST-104 ' y 'PL EST 104' no sean tres documentos distintos."""
    if not numero:
        return ''
    return re.sub(r'[\s_]+', '-', str(numero).strip().upper()).strip('-')


def siguiente_revision(codigos_existentes):
    """La siguiente revisión de la serie, respetando la que ya se use.

    Dos convenciones conviven en obra pública: letras (A, B, C…) y números
    (00, 01, 02…). No se impone una: se continúa LA QUE EL DOCUMENTO YA USA,
    porque la convención la fija el contrato, no la plataforma.

    Devuelve None cuando la serie no encaja en ninguna convención conocida. Eso
    NO es un fallo: es la respuesta correcta. Adivinar aquí produciría una
    revisión con un código que nadie reconoce en obra.
    """
    codigos = [str(c).strip().upper() for c in (codigos_existentes or []) if c]
    if not codigos:
        return 'A'
    numericos = [c for c in codigos if c.isdigit()]
    if numericos and len(numericos) == len(codigos):
        return '%02d' % (max(int(c) for c in numericos) + 1)
    letras = [c for c in codigos if len(c) == 1 and c.isalpha()]
    if letras:
        ultima = max(letras)
        if ultima != 'Z':
            return chr(ord(ultima) + 1)
    return None


def codigos_de(cur, revisable, padre_id):
    cur.execute('SELECT codigo_revision FROM %s WHERE %s = %%s'
                % (revisable.tabla_revisiones, revisable.columna_padre), (padre_id,))
    return [r[0] for r in cur.fetchall()]


def emitir(cur, revisable, padre_id, file_node_id, file_version_id=None,
           codigo=None, set_id=None, motivo=None, emitida_por=None):
    """Emite una revisión y SUPERA la anterior, en la misma transacción.

    LAS DOS COSAS JUNTAS O NINGUNA. Si se escribiera la nueva vigente antes de
    superar la anterior habría un instante con DOS vigentes; y si el proceso
    muriera ahí, ese instante sería permanente. El índice único parcial lo
    impide además desde la base, así que un error de orden falla ruidosamente
    en vez de corromper el expediente.

    Devuelve (rid, codigo, anterior_id) o levanta ValueError con un motivo
    legible. NO hace commit: quien llama decide la frontera de la transacción,
    porque a veces esto va dentro de un acto mayor.
    """
    if revisable.tabla_revisiones not in _TABLAS_ADMITIDAS:
        raise ValueError('tabla de revisiones no admitida')

    existentes = codigos_de(cur, revisable, padre_id)
    codigo = (codigo or '').strip().upper() or siguiente_revision(existentes)
    if not codigo:
        raise ValueError(
            'No se pudo deducir la siguiente revisión: la serie no sigue ninguna '
            'convención conocida. Indícala a mano.')
    if codigo in [c.upper() for c in existentes if c]:
        raise ValueError('La revisión %s ya existe en este %s.'
                         % (codigo, revisable.singular))

    # 1) superar la vigente   2) insertar la nueva. En este orden.
    cur.execute('UPDATE %s SET estado=%%s, superada_en=CURRENT_TIMESTAMP '
                ' WHERE %s = %%s AND estado = %%s RETURNING id'
                % (revisable.tabla_revisiones, revisable.columna_padre),
                (SUPERADA, padre_id, VIGENTE))
    anterior = cur.fetchone()

    cur.execute('INSERT INTO %s (%s, codigo_revision, set_id, file_node_id, '
                '                file_version_id, estado, emitida_por, motivo) '
                ' VALUES (%%s,%%s,%%s,%%s,%%s,%%s,%%s,%%s) RETURNING id'
                % (revisable.tabla_revisiones, revisable.columna_padre),
                (padre_id, codigo, set_id, file_node_id, file_version_id,
                 VIGENTE, emitida_por, (motivo or '').strip() or None))
    rid = cur.fetchone()[0]

    if anterior:
        cur.execute('UPDATE %s SET superada_por_id=%%s WHERE id=%%s'
                    % revisable.tabla_revisiones, (rid, anterior[0]))
    return rid, codigo, (anterior[0] if anterior else None)


# ── QUIEN PUEDE EMITIR UNA REVISION ────────────────────────────────────────
#
# EL HALLAZGO QUE ESTA FUNCION VIENE A CERRAR (25-ago-2026)
# ---------------------------------------------------------
# Emitir una revision no era un acto autorizado: bastaba con SER MIEMBRO DE LA
# OBRA. `guardia_de_recurso` comprueba de que obra es el recurso --aislamiento
# entre obras-- y ahi se acababa el control. Cualquier miembro podia declarar
# que lamina vale en obra y dejar la anterior superada.
#
# Y no es un acto cualquiera. Emitir una revision:
#
#     crea la revision  ->  cambia cual es la VIGENTE  ->  marca SUPERADA la anterior
#
# Es decir, decide contra que documento se construye. Un contratista podia
# cambiarlo, y el plano superado desaparecia de la vista sin que nadie lo
# hubiera aprobado.
#
# LAS TRES CAPAS SE CONSERVAN SEPARADAS, que es lo que el propietario exigio:
#
#     AISLAMIENTO DE OBRA     ¿este recurso es de una obra a la que perteneces?
#                             lo resuelve `guardia_de_recurso`, ANTES de llegar aqui.
#     PERMISO DE RECURSO      ¿puedes publicar ESTE documento?
#                             lo resuelve `check_folder_permission` con nivel `edit`.
#     AUTORIZACION DE FLUJO   ¿te corresponde DECIDIR que vale en obra?
#                             administrador de obra, o funcion contractual emisora.
#
# NINGUNA DE LAS TRES SOBRA, y por eso son tres y no una:
#
#   · Solo con permiso de recurso, un contratista con `edit` sobre su carpeta
#     de trabajo podria declarar vigente lo que quisiera.
#   · Solo con autorizacion de flujo, un administrador publicaria a ciegas un
#     documento que ni siquiera puede abrir.
#
# NO SE HA INVENTADO NINGUN PERMISO NUEVO. `check_folder_permission`, la
# escalera de seis niveles y `funcion_de` ya existian; lo que faltaba era
# usarlos aqui.

# QUIEN EMITE DOCUMENTACION DE PROYECTO, por funcion contractual.
#
# En obra publica la lamina la produce el PROYECTISTA y la emite para
# construccion la ENTIDAD. La SUPERVISION revisa y el CONTRATISTA construye
# contra lo emitido -- ninguno de los dos decide que version vale, y dejar que
# lo decidieran invertiria la cadena contractual.
#
# Es una lista CERRADA a proposito. El dia que un contrato exija otra reparticion,
# eso es una decision de producto que se toma y se escribe, no un campo que
# alguien rellena en una pantalla.
FUNCIONES_EMISORAS = ('ENTIDAD', 'PROYECTISTA')


def autoridad_para_emitir(cur, usuario, obra, model_urn, file_node_id, revisable):
    """None si puede emitir; (respuesta, codigo) si no.

    Se llama DESPUES de `guardia_de_recurso`, que ya resolvio el aislamiento
    entre obras. Aqui van las otras dos capas, en este orden: primero si puede
    con el documento, despues si le corresponde decidir.
    """
    from flask import jsonify
    from folder_permissions import check_folder_permission
    from administracion_de_obra import es_admin_de_obra
    import directorio_de_obra as dir_obra

    # ── CAPA 2 · PERMISO DE RECURSO ────────────────────────────────────────
    negado = check_folder_permission(
        usuario, file_node_id, model_urn, 'edit',
        'emitir una revisión de %s con este documento' % revisable.singular)
    if negado:
        return negado

    # ── CAPA 3 · AUTORIZACION DE FLUJO ─────────────────────────────────────
    if es_admin_de_obra(cur, usuario, obra):
        return None
    funcion = dir_obra.funcion_de(cur, obra, usuario.get('id'))
    if funcion in FUNCIONES_EMISORAS:
        return None
    return jsonify({
        'error': 'Emitir una revisión decide qué documento vale en obra y deja '
                 'superado el anterior. Puede hacerlo un administrador de la obra '
                 'o quien ejerce una función emisora (%s). Tu función en esta obra '
                 'es %s.' % (' o '.join(FUNCIONES_EMISORAS), funcion or 'ninguna'),
        'code': 'SIN_AUTORIDAD_DE_EMISION',
        'funcion': funcion,
    }), 403
