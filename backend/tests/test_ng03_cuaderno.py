# -*- coding: utf-8 -*-
"""NG-03 · CUADERNO DE OBRA — lo que tiene que seguir siendo cierto.

Lo que se defiende (doc 96 + correcciones del propietario del 27-ago-2026):
tres objetos con identidad propia; el Project Admin NO aprueba (autoridad
contractual, no administrativa); el destinatario de una instrucción es un
SUJETO concreto con snapshot, nunca una función desnuda; la fecha del parte
es la OPERATIVA declarada, jamás derivada del reloj UTC; y nada se edita —
se rectifica, referenciando.
"""
import datetime
import inspect
import io
import os
import re

import cuaderno_de_obra as cdo

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _fichero(*partes):
    return io.open(os.path.join(RAIZ, *partes), encoding='utf-8').read()


def _ruta():
    return _fichero('routes', 'cuaderno.py')


def _cuerpo(nombre, fuente=None):
    return (fuente or _ruta()).split('def %s(' % nombre)[1].split(chr(10) + 'def ')[0]


def _sin_comentarios(fuente):
    """SIN comentarios ni docstrings de una linea: si no, la prueba se cumple
    con la frase que explica la regla en vez de con la regla (leccion repetida
    tres veces en el programa)."""
    lineas = []
    for l in fuente.splitlines():
        limpia = l.split('#')[0]
        lineas.append(limpia)
    return chr(10).join(lineas)


def _sql25():
    return _fichero('sql', '25_ng03_cuaderno.sql')


# ══ 1 · PROJECT ADMIN NO ES APROBADOR CONTRACTUAL ══════════════════════════

def test_aprueban_las_funciones_declaradas_y_nadie_mas():
    assert cdo.puede_aprobar_asiento('SUPERVISION', es_el_autor=False)
    assert cdo.puede_aprobar_asiento('ENTIDAD', es_el_autor=False)  # contingencia DECLARADA
    assert not cdo.puede_aprobar_asiento('CONTRATISTA', es_el_autor=False)
    assert not cdo.puede_aprobar_asiento('OTRO', es_el_autor=False)
    assert not cdo.puede_aprobar_asiento('PROYECTISTA', es_el_autor=False)
    assert not cdo.puede_aprobar_asiento(None, es_el_autor=False)


def test_la_FIRMA_de_la_funcion_es_la_regla_no_acepta_admin():
    """La correccion del propietario, encarnada: `puede_aprobar_asiento` ni
    siquiera tiene un parametro por el que colar el privilegio administrativo."""
    params = set(inspect.signature(cdo.puede_aprobar_asiento).parameters)
    assert params == {'funcion_del_actor', 'es_el_autor'}
    assert not any('admin' in p for p in params)


def test_el_autor_no_se_aprueba_ni_con_funcion_aprobadora():
    assert not cdo.puede_aprobar_asiento('SUPERVISION', es_el_autor=True)


def test_la_ruta_de_aprobacion_NO_consulta_al_admin():
    """En el cuerpo que decide la aprobacion no aparece `es_admin_de_obra` --
    ni para conceder ni para «completar». La decision es de la semantica."""
    cuerpo = _sin_comentarios(_cuerpo('_resolver_aprobacion'))
    assert 'es_admin_de_obra' not in cuerpo
    assert 'puede_aprobar_asiento' in cuerpo


def test_sin_aprobador_contractual_se_BLOQUEA_con_su_codigo():
    cuerpo = _cuerpo('_resolver_aprobacion')
    assert 'SIN_APROBADOR_CONTRACTUAL' in cuerpo
    assert 'APROBADOR_NO_CONTRACTUAL' in cuerpo
    assert 'AUTOR_NO_SE_APRUEBA' in cuerpo


def test_emitir_es_de_las_funciones_emisoras_no_del_admin():
    assert cdo.puede_emitir_instruccion('SUPERVISION')
    assert cdo.puede_emitir_instruccion('ENTIDAD')
    assert not cdo.puede_emitir_instruccion('CONTRATISTA')
    assert not cdo.puede_emitir_instruccion(None)
    cuerpo = _sin_comentarios(_cuerpo('emitir_instruccion'))
    assert 'SIN_AUTORIDAD_DE_EMISION' in cuerpo
    # el unico es_admin_de_obra admisible en emitir es el de la VISIBILIDAD de
    # la foto citada (regla 404 de NG-02), nunca el de la autoridad de emision
    antes_de_autoridad = cuerpo.split('SIN_AUTORIDAD_DE_EMISION')[0]
    assert 'es_admin_de_obra' not in antes_de_autoridad


def test_quien_captura_NO_gana_autoridad_por_crear():
    """E07: el asiento de un colaborador (o de quien no ejerce funcion) nace
    EN_APROBACION. Fail-closed: None tambien pasa por aprobacion."""
    assert cdo.estado_inicial_de_asiento('SUPERVISION') == cdo.REGISTRADO
    assert cdo.estado_inicial_de_asiento('ENTIDAD') == cdo.REGISTRADO
    assert cdo.estado_inicial_de_asiento('PROYECTISTA') == cdo.REGISTRADO
    assert cdo.estado_inicial_de_asiento('CONTRATISTA') == cdo.EN_APROBACION
    assert cdo.estado_inicial_de_asiento('OTRO') == cdo.EN_APROBACION
    assert cdo.estado_inicial_de_asiento(None) == cdo.EN_APROBACION


def test_la_autoridad_de_emision_TAMBIEN_vive_en_la_base():
    """`ck_instrucciones_emisor_funcion` casa con FUNCIONES_EMISORAS: ni un
    script con el rol de la app cuela una instruccion sin autoridad."""
    sql = _sql25()
    m = re.search(r"ck_instrucciones_emisor_funcion\s*\n?\s*CHECK \(emisor_funcion IN \(([^)]+)\)\)", sql)
    assert m
    en_base = {x.strip().strip("'") for x in m.group(1).split(',')}
    assert en_base == set(cdo.FUNCIONES_EMISORAS_DE_INSTRUCCION)


# ══ 2 · EL DESTINATARIO ES UN SUJETO CONTRACTUAL, NUNCA UNA FUNCION ════════

def test_una_funcion_desnuda_NO_es_destinatario():
    d, mal = cdo.destinatario_valido({'tipo': 'funcion', 'funcion': 'CONTRATISTA'})
    assert d is None and mal == 'DESTINATARIO_INVALIDO'
    d, mal = cdo.destinatario_valido({'tipo': 'persona'})
    assert d is None and mal == 'DESTINATARIO_SIN_IDENTIDAD'
    d, _ = cdo.destinatario_valido({'tipo': 'persona', 'usuario_id': 7})
    assert d == {'tipo': 'persona', 'usuario_id': 7}
    d, _ = cdo.destinatario_valido({'tipo': 'empresa', 'empresa_id': 3})
    assert d == {'tipo': 'empresa', 'empresa_id': 3}


def test_el_BIC_se_resuelve_contra_el_sujeto_no_contra_la_funcion():
    """Persona: su identidad. Empresa: pertenecer HOY a esa empresa. Compartir
    funcion con el destinatario NO convierte a nadie en destinatario."""
    persona = {'tipo': 'persona', 'usuario_id': 7, 'funcion': 'CONTRATISTA'}
    assert cdo.es_del_destinatario({'id': 7}, persona)
    assert not cdo.es_del_destinatario({'id': 8}, persona)
    empresa = {'tipo': 'empresa', 'empresa_id': 3, 'funcion': 'CONTRATISTA'}
    assert cdo.es_del_destinatario({'id': 99}, empresa, company_id_del_usuario=3)
    assert not cdo.es_del_destinatario({'id': 99}, empresa, company_id_del_usuario=4)
    # misma funcion, otra empresa: NO
    assert not cdo.es_del_destinatario({'id': 99}, empresa, company_id_del_usuario=None)


def test_encargos_conoce_el_destino_empresa_y_lo_valida():
    import encargos as enc
    assert 'destino_empresa' in inspect.signature(enc.abrir).parameters
    fuente = _sin_comentarios(inspect.getsource(enc.abrir))
    assert 'project_companies' in fuente, 'la empresa tiene que PARTICIPAR en la obra'
    assert 'destino_empresa' in enc._MI_TRABAJO
    # y la bandeja sigue exigiendo membresia: el JOIN es la invariante
    assert 'JOIN project_users pu' in enc._MI_TRABAJO


def test_el_snapshot_del_destinatario_se_congela_al_emitir():
    cuerpo = _cuerpo('emitir_instruccion')
    assert 'destino.update' in cuerpo
    assert "'funcion'" in cuerpo or 'funcion' in cuerpo
    # y la persona tiene que ser MIEMBRO; la empresa, PARTICIPANTE
    assert 'DESTINATARIO_NO_MIEMBRO' in cuerpo
    assert 'DESTINATARIO_NO_PARTICIPA' in cuerpo


# ══ 3 · LA FECHA OPERATIVA DECLARADA (regla congelada) ═════════════════════

def test_la_fecha_es_declarada_y_valida():
    hoy = datetime.date(2026, 8, 27)
    f, _ = cdo.fecha_operativa_valida('2026-08-27', hoy=hoy)
    assert f == hoy
    f, _ = cdo.fecha_operativa_valida('2026-08-01', hoy=hoy)   # el pasado se admite
    assert f
    f, mal = cdo.fecha_operativa_valida('2026-08-28', hoy=hoy)  # holgura UTC-5
    assert f
    f, mal = cdo.fecha_operativa_valida('2026-09-15', hoy=hoy)
    assert f is None and mal == 'FECHA_FUTURA'
    for basura in (None, '', 'ayer', '27/08/2026', '2026-13-40'):
        f, mal = cdo.fecha_operativa_valida(basura, hoy=hoy)
        assert f is None and mal == 'FECHA_INVALIDA', basura


def test_el_parte_NO_deriva_su_fecha_del_reloj_del_servidor():
    """Ni la ruta ni el manejador de campo tienen un `CURRENT_DATE`/`now()` que
    supla la fecha: sin fecha declarada, el acto se rechaza."""
    for cuerpo in (_sin_comentarios(_cuerpo('abrir_parte')),
                   _sin_comentarios(_cuerpo('_parte_create',
                                            _fichero('routes', 'sync.py')))):
        assert 'fecha_operativa_valida' in cuerpo
        assert 'CURRENT_DATE' not in cuerpo
        assert 'date.today' not in cuerpo


def test_la_identidad_del_parte_vive_en_la_base():
    sql = _sql25()
    assert 'uq_partes_obra_fecha' in sql
    assert 'UNIQUE (project_id, fecha_operativa)' in sql
    assert 'fecha_operativa DATE' in re.sub(r'\s+', ' ', sql)


# ══ 4 · INMUTABILIDAD: SE RECTIFICA, NO SE EDITA ═══════════════════════════

def test_no_existe_ruta_de_edicion_ni_de_borrado():
    fuente = _ruta()
    assert "methods=['PATCH']" not in fuente
    assert "methods=['DELETE']" not in fuente
    # la unica escritura de instrucciones tras emitir son sus TRANSICIONES
    assert 'UPDATE doc_instrucciones SET asunto' not in fuente
    assert 'UPDATE doc_instrucciones SET contenido' not in fuente
    assert 'UPDATE doc_asientos SET texto' not in fuente


def test_la_rectificacion_es_un_acto_nuevo_y_la_vieja_queda_visible():
    cuerpo = _cuerpo('emitir_instruccion')
    assert 'rectifica_a' in cuerpo
    assert 'RECTIFICADA' in cuerpo
    assert 'NO_RECTIFICABLE' in cuerpo
    # cerrada no se rectifica: se emite otra
    assert cdo.CERRADA not in cdo.RECTIFICABLES
    assert cdo.RECTIFICADA not in cdo.RECTIFICABLES


def test_las_transiciones_de_instruccion_son_una_lista_cerrada():
    assert cdo.TRANSICIONES_INSTRUCCION[cdo.EMITIDA] == (cdo.ACUSADA, cdo.RECTIFICADA)
    assert cdo.TRANSICIONES_INSTRUCCION[cdo.CERRADA] == ()
    assert cdo.TRANSICIONES_INSTRUCCION[cdo.RECTIFICADA] == ()
    assert set(cdo.TRANSICIONES_INSTRUCCION) == set(cdo.ESTADOS_INSTRUCCION)


def test_el_acuse_solo_CRECE():
    cuerpo = _sin_comentarios(_cuerpo('acusar_instruccion'))
    assert "list(d['acuses']) +" in cuerpo, 'patron transmittal: se anade, jamas se pisa'


def test_sin_DELETE_para_el_rol_de_la_app_y_esta_vez_DE_VERDAD():
    """Defecto real cazado por el ensayo de la 25: los privilegios POR DEFECTO
    del migrador conceden arwd (DELETE incluido) a ecd_app sobre cada tabla
    que crea, asi que «no conceder DELETE» no recortaba nada. El recorte tiene
    que ser un REVOKE explicito -- aqui y en la evidencia de NG-02, que lo
    declaraba sin tenerlo."""
    sql = _sql25()
    for tabla in ('doc_partes', 'doc_asientos', 'doc_instrucciones',
                  'doc_obra_ubicacion', 'doc_fotos', 'doc_albumes'):
        assert re.search(r'REVOKE DELETE, TRUNCATE ON %s\s+FROM ecd_app' % tabla, sql), tabla
    for tabla in ('doc_partes', 'doc_asientos', 'doc_instrucciones'):
        assert re.search(r'GRANT SELECT, INSERT, UPDATE ON %s\s+TO ecd_app' % tabla, sql)
    assert 'doc_album_fotos' not in sql.split('REVOKE')[1], (
        'deshacer una agrupacion no destruye evidencia: ese DELETE se queda')
    assert 'SEQUENCE doc_partes_id_seq' in sql
    assert 'SEQUENCE doc_asientos_id_seq' in sql
    assert 'SEQUENCE doc_instrucciones_id_seq' in sql


def test_el_devuelto_exige_motivo_y_queda_inmutable():
    cuerpo = _cuerpo('_resolver_aprobacion')
    assert 'SIN_MOTIVO' in cuerpo
    sql = _sql25()
    assert 'ck_asientos_devuelto_con_motivo' in sql
    assert "estado <> 'DEVUELTO' OR motivo_devolucion IS NOT NULL" in sql


# ══ 5 · EL CATALOGO DE TIPOS, CASADO EN TRES SITIOS ════════════════════════

def test_el_catalogo_de_tipos_casa_CODIGO_con_BASE():
    sql = _sql25()
    m = re.search(r"ck_asientos_tipo\s*\n?\s*CHECK \(tipo IN \(([^)]+)\)\)",
                  re.sub(r'\s+', ' ', sql))
    assert m
    en_base = {x.strip().strip("'") for x in m.group(1).split(',')}
    assert en_base == set(cdo.TIPOS_DE_ASIENTO)


def test_el_catalogo_de_tipos_casa_CODIGO_con_PANTALLA():
    """El cliente no pregunta el catalogo por la red (leccion F4): lo lleva en
    el codigo. Este tripwire impide que las dos listas diverjan."""
    modulo = io.open(os.path.join(os.path.dirname(RAIZ), 'frontend-docs', 'src',
                                  'components', 'CuadernoModule.jsx'),
                     encoding='utf-8').read()
    bloque = modulo.split('TIPOS_DE_ASIENTO = [')[1].split('];')[0]
    en_pantalla = set(re.findall(r"\['([a-z]+)'", bloque))
    assert en_pantalla == set(cdo.TIPOS_DE_ASIENTO)


def test_validar_asiento_exige_lo_que_cada_tipo_significa():
    ok, mal = cdo.validar_asiento('inventado', 'x', {}, {})
    assert not ok and mal == 'TIPO_DESCONOCIDO'
    ok, mal = cdo.validar_asiento('foto', 'x', {}, {})
    assert not ok and mal == 'SIN_REFERENCIA', 'una foto se CITA; sin cita es una nota'
    ok, _ = cdo.validar_asiento('foto', '', {}, {'foto_id': 5})
    assert ok
    ok, mal = cdo.validar_asiento('rectificacion', 'corrijo', {}, {})
    assert not ok and mal == 'SIN_REFERENCIA'
    ok, mal = cdo.validar_asiento('nota', '', {}, {})
    assert not ok and mal == 'ASIENTO_VACIO'
    ok, _ = cdo.validar_asiento('nota', 'algo que decir', {}, {})
    assert ok


def test_el_clima_sin_procedencia_NO_consta():
    ok, mal = cdo.validar_asiento('clima', 'llovio', {}, {})
    assert not ok and mal == 'CLIMA_SIN_PROCEDENCIA'
    ok, _ = cdo.validar_asiento('clima', '', {'origen': 'manual',
                                              'dato': {'cielo': 'lluvia'}}, {})
    assert ok
    ok, _ = cdo.validar_asiento('clima', '', {'origen': 'proveedor',
                                              'dato': {}}, {})
    assert ok
    assert set(cdo.ORIGENES_DE_CLIMA) == {'proveedor', 'manual'}


def test_el_clima_usa_las_coordenadas_DE_LA_OBRA_no_del_dispositivo():
    cuerpo = _sin_comentarios(_cuerpo('clima'))
    assert 'doc_obra_ubicacion' in cuerpo
    assert 'SIN_UBICACION_DE_OBRA' in cuerpo
    # y conserva la respuesta CRUDA junto al dato legible
    assert 'dato_recibido' in cuerpo
    assert 'consultado_en' in cuerpo


def test_una_cita_no_cruza_obras_y_la_foto_invisible_no_existe():
    cuerpo = _cuerpo('_referencias_validas')
    assert 'FOTO_NO_EXISTE' in cuerpo
    assert 'puede_ver' in cuerpo, 'citar una foto N2 ajena confirmaria que existe'
    assert cuerpo.count('project_id = %s') >= 4, 'cada cita se valida contra ESTA obra'


# ══ 6 · EL MOTOR DE CAMPO ══════════════════════════════════════════════════

def test_PARTE_y_ASIENTO_entran_por_el_motor_y_solo_con_CREATE():
    import sincronizacion_de_campo as sync
    assert sync.PARTE in sync.OBJETOS and sync.ASIENTO in sync.OBJETOS
    assert sync.ACTOS_DE[sync.PARTE] == (sync.CREATE,)
    assert sync.ACTOS_DE[sync.ASIENTO] == (sync.CREATE,)
    assert (sync.PARTE, sync.CREATE) not in sync.CON_EFECTO_EXTERNO
    assert (sync.ASIENTO, sync.CREATE) not in sync.CON_EFECTO_EXTERNO


def test_aprobar_cerrar_y_emitir_NO_se_sincronizan_a_proposito():
    """Decision semantica del doc 96 §H, no un hueco: los actos formales exigen
    conexion, como la firma."""
    s = _fichero('routes', 'sync.py')
    despacho = s.split('DESPACHO = {')[1].split('}')[0]
    for prohibido in ('aprobar', 'devolver', 'cerrar', 'emitir', 'ACUSA'):
        assert prohibido not in despacho
    assert '(sync.PARTE, sync.CREATE): _parte_create' in s
    assert '(sync.ASIENTO, sync.CREATE): _asiento_create' in s
    assert "sync.PARTE: 'cuaderno'" in s and "sync.ASIENTO: 'cuaderno'" in s


def test_el_manejador_de_campo_exige_LO_MISMO_que_la_ruta_en_linea():
    """Las dos puertas comparten semantica: mismo validador, misma regla de
    estado inicial, mismo candado del parte cerrado."""
    s = _fichero('routes', 'sync.py')
    cuerpo = _sin_comentarios(s.split('def _asiento_create(')[1].split(chr(10) + 'def ')[0])
    assert 'validar_asiento' in cuerpo
    assert 'estado_inicial_de_asiento' in cuerpo
    assert 'FOR UPDATE' in cuerpo
    assert 'PARTE_CERRADO' in cuerpo
    assert 'es_admin_de_obra' not in cuerpo


def test_el_parte_de_campo_es_idempotente_por_identidad():
    s = _fichero('routes', 'sync.py')
    cuerpo = s.split('def _parte_create(')[1].split(chr(10) + 'def ')[0]
    assert 'ya_existia' in cuerpo, (
        'dos moviles sin cobertura el mismo dia no pueden parir dos jornadas')


def test_la_lista_cerrada_del_motor_crecio_JUNTO_a_la_base():
    import sincronizacion_de_campo as sync
    sql = _sql25()
    m = re.search(r"ck_sync_objeto\s*\n?\s*CHECK \(object_type IN \(([^)]+)\)\)", sql)
    assert m
    assert {x.strip().strip("'") for x in m.group(1).split(',')} == set(sync.OBJETOS)


# ══ 7 · BIC ════════════════════════════════════════════════════════════════

def test_encargos_conoce_los_tres_tipos_en_las_tres_listas():
    import encargos as enc
    for t in ('PARTE', 'ASIENTO', 'INSTRUCCION'):
        assert t in enc.TIPOS
        assert t in enc._ORIGEN
        assert t in dict(enc._CHECKS)['ck_encargos_tipo']
    sql = _sql25()
    assert 'DROP CONSTRAINT IF EXISTS ck_encargos_tipo' in sql
    assert sql.index('DROP CONSTRAINT IF EXISTS ck_encargos_tipo') < \
        sql.index('ADD CONSTRAINT ck_encargos_tipo')


def test_la_deuda_del_asiento_es_de_la_FUNCION_no_del_admin():
    import encargos as enc
    uid, funcion, asunto = enc.deudor_de_asiento(None, (5, 217, 'avance',
                                                        'EN_APROBACION', 9))
    assert uid is None and funcion == 'SUPERVISION'
    assert '217' in asunto
    uid, funcion, _ = enc.deudor_de_asiento(None, (5, 217, 'avance', 'DEVUELTO', 9))
    assert uid == 9 and funcion is None
    uid, funcion, _ = enc.deudor_de_asiento(None, (5, 217, 'avance', 'APROBADO', 9))
    assert uid is None and funcion is None


def test_la_deuda_de_la_instruccion_sigue_al_SUJETO_del_snapshot():
    import encargos as enc
    persona = {'tipo': 'persona', 'usuario_id': 7}
    empresa = {'tipo': 'empresa', 'empresa_id': 3}
    uid, eid, a = enc.deudor_de_instruccion(None, (1, 'IN-001', 'x', 'EMITIDA', 5, persona))
    assert uid == 7 and eid is None and a.startswith('Acusar')
    uid, eid, a = enc.deudor_de_instruccion(None, (1, 'IN-001', 'x', 'ACUSADA', 5, empresa))
    assert uid is None and eid == 3 and a.startswith('Atender')
    uid, eid, a = enc.deudor_de_instruccion(None, (1, 'IN-001', 'x', 'ATENDIDA', 5, empresa))
    assert uid == 5 and eid is None, 'atendida: la verifica su EMISOR'
    uid, eid, _ = enc.deudor_de_instruccion(None, (1, 'IN-001', 'x', 'CERRADA', 5, persona))
    assert uid is None and eid is None


def test_el_parte_de_ayer_abierto_es_deuda_y_el_de_hoy_no():
    import encargos as enc
    hoy = datetime.date(2026, 8, 27)
    uid, a, _ = enc.deudor_de_parte(None, (1, datetime.date(2026, 8, 26),
                                           'ABIERTO', 4), hoy=hoy)
    assert uid == 4 and 'Cerrar' in a
    uid, _, _ = enc.deudor_de_parte(None, (1, hoy, 'ABIERTO', 4), hoy=hoy)
    assert uid is None, 'la jornada en curso no debe nada'
    uid, _, _ = enc.deudor_de_parte(None, (1, datetime.date(2026, 8, 26),
                                           'CERRADO', 4), hoy=hoy)
    assert uid is None


def test_sin_aprobador_en_la_obra_la_deuda_se_VE_como_bloqueada():
    import encargos as enc
    fuente = inspect.getsource(enc._faltantes)
    assert 'SIN_APROBADOR_CONTRACTUAL' in fuente
    assert 'FUNCIONES_APROBADORAS_DE_ASIENTO' in fuente


# ══ 8 · HERRAMIENTA Y NUMERACION ═══════════════════════════════════════════

def test_cuaderno_es_una_herramienta_del_catalogo():
    import herramientas_de_obra as hdo
    assert 'cuaderno' in hdo.CODIGOS
    assert hdo.herramienta_de_ruta('/api/cuaderno/partes') == 'cuaderno'
    assert hdo.herramienta_de_ruta('/api/cuaderno/instrucciones/3/acusar') == 'cuaderno'
    sql = _sql25()
    assert "INSERT INTO project_tools" in sql and "'cuaderno'" in sql
    assert 'NOT EXISTS' in sql


def test_la_instruccion_numera_con_la_mecanica_comun():
    import flujo_de_registro as reg
    assert 'doc_instrucciones' in reg._TABLAS
    assert cdo.SEM_INSTRUCCION.tabla == 'doc_instrucciones'
    assert cdo.SEM_INSTRUCCION.prefijo == 'IN'


def test_el_correlativo_del_asiento_es_MAX_no_COUNT():
    fuente = _sin_comentarios(inspect.getsource(cdo.siguiente_numero_de_asiento))
    assert 'MAX(numero)' in fuente
    assert 'COUNT' not in fuente.upper().replace('MAX', '')


def test_el_esquema_ata_el_asiento_a_su_obra_y_su_parte():
    sql = _sql25()
    assert 'uq_asientos_obra_numero' in sql
    assert 'UNIQUE (project_id, numero)' in sql
    assert 'fk_asientos_parte' in sql
    autor = sql.split('fk_asientos_autor')[1].split('EXCEPTION')[0]
    assert 'ON DELETE RESTRICT' in autor


# ══ 9 · EL CLIENTE ═════════════════════════════════════════════════════════

def _portal(*partes):
    return io.open(os.path.join(os.path.dirname(RAIZ), 'frontend-docs', *partes),
                   encoding='utf-8').read()


def test_el_cuaderno_esta_ENGANCHADO_en_el_portal():
    f = _portal('src', 'pages', 'FilesPage.jsx')
    assert "import('../components/CuadernoModule')" in f
    assert '<CuadernoModule' in f
    assert "cuaderno: 'cuaderno'" in f, 'la capa 16 tambien gobierna la pestana'


def test_sin_red_el_parte_y_el_asiento_ENCOLAN_por_el_motor():
    m = _portal('src', 'components', 'CuadernoModule.jsx')
    assert "object_type: 'PARTE'" in m
    assert "object_type: 'ASIENTO'" in m
    assert 'campo.capturar(' in m
    assert 'EN ESTE DISPOSITIVO' in m, 'se dice DONDE queda lo guardado'
    assert 'depende_de' in m, 'el asiento de un parte local espera a su parte'


def test_los_actos_formales_DICEN_que_exigen_conexion():
    m = _portal('src', 'components', 'CuadernoModule.jsx')
    assert 'exigeConexion' in m
    assert 'exige conexión' in m
    for acto in ("exigeConexion('Cerrar la jornada')",
                 "exigeConexion('Emitir una instrucción')"):
        assert acto in m, acto


def test_la_precarga_calienta_el_cuaderno():
    s = _portal('src', 'offline', 'precarga.js')
    assert "import('../components/CuadernoModule')" in s
    assert '/api/cuaderno/partes' in s
