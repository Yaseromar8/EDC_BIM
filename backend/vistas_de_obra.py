# -*- coding: utf-8 -*-
"""VISTAS DE OBRA — preguntas a toda la obra, no a una carpeta (A2-2, 14-oct-2026).

Patrón estándar del sector (Procore, ACC): un panel de vistas a la izquierda de la
lista. Lo propio de ALEPHIA es QUÉ preguntas trae de serie: las que entienden ISO
19650 y el plan de entregas (MIDP/TIDP), sin que nadie tenga que configurarlas.
Ver docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md.

No es una ruta nueva: lo sirve `GET /api/docs/search?vista=…` (el portal está en
su techo de rutas, test_perfil_portal).

TRES REGLAS
-----------
1. Solo se afirma lo que el sistema SABE. Un compromiso del plan sin documento
   vinculado no es «no entregado», es «nadie lo ha cotejado» (ver el comentario de
   VENCIDO en plan_de_entrega.py). Por eso «Plazo del plan vencido» trae documentos
   que existen y van tarde, y cuenta APARTE los compromisos vencidos sin documento.
2. Cada fila pasa por el permiso de carpeta (`permiso_documental`), la misma
   decisión que el listado. Una vista no descubre lo que la carpeta esconde.
3. Cada fila tiene la MISMA forma que una de `/api/docs/list`, para que la tabla
   de Archivos la pinte sin cambios.
"""
import datetime
import os

import estados_ecd as _ecd

# El orden es el del panel, por COLECCIONES como en Procore (visto en sus vídeos,
# docs/ux/PROCORE_REVISION_PROPIA_14-oct-2026.md §7): En revisión · Publicados · Plan de
# entregas. Las etiquetas viven en el portal (utils/vistasDeArchivos.js): aquí solo las
# claves, que son el contrato.
EN_REVISION = 'en_revision'
ME_TOCA = 'me_toca_revisar'
MI_EMPRESA = 'asignados_mi_empresa'
PUBLICADOS = 'publicados'
PUBLICADOS_SIN_ENTREGA = 'publicados_sin_entrega'
PLAZO_VENCIDO = 'plazo_vencido'
VENCE_PRONTO = 'vence_pronto'
CLAVES = (EN_REVISION, ME_TOCA, MI_EMPRESA, PUBLICADOS, PUBLICADOS_SIN_ENTREGA,
          PLAZO_VENCIDO, VENCE_PRONTO)

DIAS_PRONTO = 7
LIMITE = 500

# Las carpetas de la obra con su ruta legible desde la raíz («Archivos de proyecto»
# no forma parte de la ruta). Solo carpetas vivas: lo que cuelga de una carpeta
# suprimida está, a efectos de la persona, en la papelera.
_SQL_DOCUMENTOS = """
WITH RECURSIVE carpetas AS (
    SELECT id,
           CASE WHEN folder_type = 'PROJECT_ROOT' THEN ''::text ELSE name::text END AS ruta
      FROM file_nodes
     WHERE model_urn = %(urn)s AND parent_id IS NULL
       AND node_type = 'FOLDER' AND is_deleted = FALSE
    UNION ALL
    SELECT fn.id,
           CASE WHEN c.ruta = '' THEN fn.name::text ELSE c.ruta || '/' || fn.name END
      FROM file_nodes fn
      JOIN carpetas c ON fn.parent_id = c.id
     WHERE fn.model_urn = %(urn)s AND fn.node_type = 'FOLDER' AND fn.is_deleted = FALSE
)
SELECT f.id, f.name, f.size_bytes, f.version_number, f.updated_at, f.status,
       f.description, f.mime_type, f.created_at,
       COALESCE(f.updated_by, f.created_by, 'Sistema'),
       f.codigo_idoneidad, f.codigo_revision, f.nomenclatura_ok,
       f.bloqueado_por, f.bloqueado_en, f.current_version_id,
       f.parent_id, c.ruta,
       {plan_cols}
  FROM file_nodes f
  JOIN carpetas c ON c.id = f.parent_id
  {plan_join}
 WHERE f.model_urn = %(urn)s AND f.node_type = 'FILE' AND f.is_deleted = FALSE
 ORDER BY f.name
"""
_PLAN_COLS = "pe.tipo, pe.hito, pe.fecha_comprometida"
_PLAN_JOIN = """LEFT JOIN LATERAL (
        SELECT tipo, hito, fecha_comprometida FROM plan_entregas
         WHERE model_urn = f.model_urn AND file_node_id = f.id
         ORDER BY fecha_comprometida NULLS LAST LIMIT 1) pe ON TRUE"""
_SIN_PLAN_COLS = "NULL, NULL, NULL"


def _hay_plan(cur, urn):
    """(existe la tabla, la obra tiene compromisos)."""
    cur.execute("SELECT to_regclass('public.plan_entregas')")
    fila = cur.fetchone()
    if not fila or not fila[0]:
        return False, False
    cur.execute("SELECT EXISTS(SELECT 1 FROM plan_entregas WHERE model_urn = %s)", (urn,))
    fila = cur.fetchone()
    return True, bool(fila and fila[0])


def _iniciales(nombre):
    partes = (nombre or '').split()
    if len(partes) >= 2:
        return (partes[0][0] + partes[1][0]).upper()
    return (nombre or '??')[:2].upper()


def a_fila(r, hoy):
    """Una fila de la consulta → un documento con la forma de /api/docs/list."""
    (fid, nombre, tam, version, actualizado, estado, descripcion, mime, creado, por,
     idoneidad, revision, nomenclatura, bloq_por, bloq_en, version_id,
     padre, ruta, plan_tipo, plan_hito, plan_fecha) = r
    doc = {
        'id': str(fid), 'type': 'file', 'name': nombre,
        'fullName': (ruta + '/' if ruta else '') + (nombre or ''),
        'ubicacion': ruta or '',
        'parent_id': str(padre) if padre else None,
        'updated': actualizado.isoformat() if actualizado else None,
        'created_at': creado.isoformat() if creado else None,
        'updated_by': {'name': por, 'initials': _iniciales(por)},
        'description': descripcion,
        'size': tam, 'version': version,
        'version_id': str(version_id) if version_id else None,
        'status': estado,
        'codigo_revision': revision, 'codigo_idoneidad': idoneidad,
        'nomenclatura_ok': nomenclatura,
        'bloqueado_por': bloq_por,
        'bloqueado_en': bloq_en.isoformat() if bloq_en else None,
        'mime_type': mime,
    }
    if plan_tipo is not None:
        import plan_de_entrega as _plan
        e = _plan._estado_de(plan_fecha, fid, estado, hoy=hoy)
        doc['entrega'] = {'plan': plan_tipo, 'hito': plan_hito,
                          'fecha': plan_fecha.isoformat() if plan_fecha else None,
                          'estado': e, 'etiqueta': _plan.ETIQUETAS.get(e, e)}
        doc['_fecha_plan'] = plan_fecha
    return doc


def vistas_de(doc, hoy, me_toca, obra_con_plan, mi_empresa=frozenset()):
    """Las claves de vista en las que cae un documento. Pura: se prueba sin base."""
    claves = set()
    estado = _ecd.normalizar(doc.get('status'))
    publicado = estado == _ecd.PUBLISHED
    if doc['id'] in me_toca:
        claves.add(ME_TOCA)
    if doc['id'] in mi_empresa:
        claves.add(MI_EMPRESA)
    if estado == _ecd.SHARED:
        claves.add(EN_REVISION)
    if publicado:
        claves.add(PUBLICADOS)
    fecha = doc.get('_fecha_plan')
    if doc.get('entrega'):
        if not publicado and fecha:
            if fecha < hoy:
                claves.add(PLAZO_VENCIDO)
            elif fecha <= hoy + datetime.timedelta(days=DIAS_PRONTO):
                claves.add(VENCE_PRONTO)
    elif publicado and obra_con_plan:
        claves.add(PUBLICADOS_SIN_ENTREGA)
    return claves


def documentos_que_me_tocan(cur, usuario, urn):
    """Ids de los documentos de las revisiones de esta obra cuyo paso me espera.

    Sale de los mismos encargos que «Mi trabajo»: si allí no está, aquí tampoco.
    """
    uid = (usuario or {}).get('id')
    if not uid:
        return set()
    import encargos as _enc
    revisiones = [str(p.get('objeto_id')) for p in _enc.mi_trabajo(cur, uid, None)
                  if str(p.get('objeto_tipo') or '').upper() == 'REVIEW' and p.get('objeto_id')]
    revisiones = [r for r in revisiones if r.isdigit()]
    if not revisiones:
        return set()
    cur.execute("SELECT items FROM doc_reviews WHERE id = ANY(%s) AND model_urn = %s "
                "   AND status = 'pending'", ([int(r) for r in revisiones], urn))
    ids = set()
    for (items,) in cur.fetchall():
        for it in (items or []):
            nodo = it.get('node_id') if isinstance(it, dict) else it
            if nodo:
                ids.add(str(nodo))
    return ids


# Los encargos de revisión abiertos que esperan a MI EMPRESA: dirigidos a la empresa, a
# una persona de la empresa o a una función contractual que la empresa tiene en la obra.
# Es «Asignados a mi empresa» de Procore, con las tres formas de destino que ya usa
# encargos.mi_trabajo; aquí sin exigir que el destinatario sea yo.
_SQL_MI_EMPRESA = """
SELECT r.items
  FROM encargos e
  JOIN doc_reviews r ON r.id::text = e.objeto_id
 WHERE e.objeto_tipo = 'REVIEW' AND e.estado = 'abierto'
   AND r.model_urn = %(urn)s AND r.status = 'pending'
   AND (
        e.destino_empresa = %(emp)s
     OR e.destino_usuario IN (SELECT id FROM users WHERE company_id = %(emp)s)
     OR (e.destino_funcion IS NOT NULL AND EXISTS (
            SELECT 1 FROM project_companies pc
             WHERE pc.project_id = e.project_id AND pc.funcion = e.destino_funcion
               AND pc.company_id = %(emp)s))
   )
"""


def documentos_de_mi_empresa(cur, usuario, urn):
    """Ids de los documentos de las revisiones de esta obra que esperan a mi empresa."""
    uid = (usuario or {}).get('id')
    if not uid:
        return set()
    cur.execute("SELECT company_id FROM users WHERE id = %s", (int(uid),))
    fila = cur.fetchone()
    if not fila or not fila[0]:
        return set()                     # sin empresa no hay «mi empresa»
    cur.execute(_SQL_MI_EMPRESA, {'urn': urn, 'emp': int(fila[0])})
    ids = set()
    for (items,) in cur.fetchall():
        for it in (items or []):
            nodo = it.get('node_id') if isinstance(it, dict) else it
            if nodo:
                ids.add(str(nodo))
    return ids


def _aparte(cur, nombre, leer):
    """Una consulta auxiliar en su SAVEPOINT: en PostgreSQL un fallo aborta la
    transacción entera, y sin esto una revisión rara dejaría sin datos todas las vistas."""
    try:
        cur.execute('SAVEPOINT vistas_aparte')
        r = leer()
        cur.execute('RELEASE SAVEPOINT vistas_aparte')
        return r
    except Exception as e:
        print(f'[vistas] {nombre} sin resolver: {e}')
        try:
            cur.execute('ROLLBACK TO SAVEPOINT vistas_aparte')
        except Exception:
            pass
        return set()


def filtrar_visibles(cur, usuario, urn, docs, permiso=None):
    """Solo lo que esta persona puede ver, con la MISMA regla que el listado.

    El permiso se resuelve por CARPETA (un fichero no lleva permisos propios) y una
    sola vez por carpeta. `permiso(carpeta_id) -> nivel` se inyecta en las pruebas.
    """
    usuario = usuario or {}
    if permiso is None:
        import permiso_documental as _pd
        try:
            ctx = _pd.contexto_de_permisos(cur, usuario, urn)
        except Exception:
            return []                                   # FAIL-CLOSED
        if ctx.get('es_admin'):
            return list(docs)

        def permiso(carpeta):
            try:
                return _pd.permiso_efectivo(cur, usuario, urn, carpeta, contexto=ctx)
            except Exception:
                return 'none'
    estricto = os.getenv('STRICT_ISO_VISIBILITY', 'false').lower() in ('true', '1', 'yes')
    visibles_iso = {_ecd.SHARED, _ecd.PUBLISHED, _ecd.ARCHIVED}
    cache, salida = {}, []
    for d in docs:
        carpeta = d.get('parent_id')
        if carpeta not in cache:
            cache[carpeta] = bool(carpeta) and permiso(carpeta) not in (None, 'none')
        if not cache[carpeta]:
            continue
        es_carpeta = str(d.get('type') or '').upper() == 'FOLDER'
        if estricto and not es_carpeta and _ecd.normalizar(d.get('status')) not in visibles_iso:
            continue
        salida.append(d)
    return salida


# ── Vistas propias de toda la obra: los filtros de Archivos, aplicados aquí ──
#
# Una vista guardada por una persona («Estructuras publicadas») son los mismos
# filtros que pone en Archivos -- texto, estado, tipo, disciplina y entrega --
# pero sobre toda la obra. Se aplican en el servidor para no mandar al navegador
# los miles de documentos de una obra solo para quedarse con veinte.
TODOS = 'todos'
FILTROS = ('q', 'estado', 'tipo', 'disciplina', 'entrega')


def piezas_del_codigo(nombre):
    """Tipo y disciplina del código ISO 19650 del nombre, o None.

    LA MISMA REGLA que el portal (frontend-docs/src/utils/codigoDelNombre.js): el
    nombre sin extensión, siete piezas separadas por guiones, todas con algo.
    """
    base = str(nombre or '').strip()
    if '.' in base:
        base = base.rsplit('.', 1)[0]
    partes = base.split('-')
    if len(partes) != 7 or not all(p.strip() for p in partes):
        return None
    return {'tipo': partes[4].strip(), 'disciplina': partes[5].strip()}


def cumple(doc, filtros):
    """¿Pasa el documento los filtros de una vista propia? Pura."""
    f = filtros or {}
    texto = str(f.get('q') or '').strip().lower()
    if texto and texto not in str(doc.get('name') or '').lower():
        return False
    if f.get('estado') and _ecd.normalizar(doc.get('status')) != _ecd.normalizar(f['estado']):
        return False
    if f.get('tipo') or f.get('disciplina'):
        p = piezas_del_codigo(doc.get('name'))
        if f.get('tipo') and (not p or p['tipo'] != f['tipo']):
            return False
        if f.get('disciplina') and (not p or p['disciplina'] != f['disciplina']):
            return False
    if f.get('entrega'):
        e = (doc.get('entrega') or {}).get('estado') or 'fuera'
        if e != f['entrega']:
            return False
    return True


def _documentos(cur, usuario, urn, hoy, elegir=None):
    tabla, obra_con_plan = _hay_plan(cur, urn)
    sql = _SQL_DOCUMENTOS.format(plan_cols=_PLAN_COLS if tabla else _SIN_PLAN_COLS,
                                 plan_join=_PLAN_JOIN if tabla else '')
    cur.execute(sql, {'urn': urn})
    docs = [a_fila(r, hoy) for r in cur.fetchall()]
    me_toca = _aparte(cur, 'me toca revisar', lambda: documentos_que_me_tocan(cur, usuario, urn))
    mi_empresa = _aparte(cur, 'asignados a mi empresa', lambda: documentos_de_mi_empresa(cur, usuario, urn))
    for d in docs:
        d['_vistas'] = vistas_de(d, hoy, me_toca, obra_con_plan, mi_empresa)
    # Solo se resuelve el permiso de lo que se va a enseñar o contar.
    candidatos = [d for d in docs if (elegir(d) if elegir else d['_vistas'])]
    return filtrar_visibles(cur, usuario, urn, candidatos), tabla, obra_con_plan


def _vencidos_sin_documento(cur, urn, hoy):
    cur.execute("SELECT count(*) FROM plan_entregas WHERE model_urn = %s "
                "   AND file_node_id IS NULL AND fecha_comprometida < %s", (urn, hoy))
    fila = cur.fetchone()
    return int(fila[0]) if fila and fila[0] else 0


def _limpia(d):
    return {k: v for k, v in d.items() if not k.startswith('_')}


def recuentos(cur, usuario, urn, hoy=None):
    hoy = hoy or datetime.date.today()
    docs, tabla, obra_con_plan = _documentos(cur, usuario, urn, hoy)
    cuenta = {c: 0 for c in CLAVES}
    for d in docs:
        for c in d['_vistas']:
            cuenta[c] += 1
    return {'recuentos': cuenta, 'hay_plan': obra_con_plan,
            'vencidos_sin_documento': _vencidos_sin_documento(cur, urn, hoy) if tabla else 0}


def documentos(cur, usuario, urn, clave, hoy=None, limite=LIMITE, filtros=None):
    """Los documentos de una vista: (filas, total, extra).

    `clave` es una vista de serie, o TODOS con `filtros` (una vista propia).
    """
    if clave not in CLAVES and clave != TODOS:
        raise ValueError(clave)
    hoy = hoy or datetime.date.today()
    elegir = (lambda d: cumple(d, filtros)) if clave == TODOS else (lambda d: clave in d['_vistas'])
    docs, tabla, obra_con_plan = _documentos(cur, usuario, urn, hoy, elegir)
    filas = [_limpia(d) for d in docs]
    extra = {'hay_plan': obra_con_plan}
    if clave == PLAZO_VENCIDO and tabla:
        extra['vencidos_sin_documento'] = _vencidos_sin_documento(cur, urn, hoy)
    return filas[:limite], len(filas), extra
