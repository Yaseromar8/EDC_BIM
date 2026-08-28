# -*- coding: utf-8 -*-
"""NG-04 · Avance físico — la suite que vigila la semántica y sus tripwires.

Sigue el patrón de NG-03: la firma es la regla (inspect), los catálogos se
casan por TEXTO contra la migración y la pantalla, y el PRIVILEGE SWEEP
(gate O) queda vigilado para que nadie lo deshaga sin que un test grite.
"""
import inspect
import io
import os
import re

import pytest

import avance_fisico as af

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _sql26():
    return io.open(os.path.join(AQUI, 'sql', '26_ng04_avance.sql'),
                   encoding='utf-8').read()


def _pantalla():
    ruta = os.path.join(os.path.dirname(AQUI), 'frontend-docs', 'src',
                        'components', 'AvanceModule.jsx')
    return io.open(ruta, encoding='utf-8').read()


# ══ 1 · LA FIRMA ES LA REGLA ══════════════════════════════════════════════

def test_la_FIRMA_de_la_funcion_es_la_regla_y_no_acepta_cargos_de_plataforma():
    firma = inspect.signature(af.puede_aprobar_avance)
    assert list(firma.parameters) == ['funcion_del_actor', 'es_el_autor']
    fuente = inspect.getsource(af.puede_aprobar_avance)
    assert 'admin' not in fuente.lower()


def test_solo_las_funciones_validadoras_aprueban():
    assert af.puede_aprobar_avance('SUPERVISION', es_el_autor=False)
    assert af.puede_aprobar_avance('ENTIDAD', es_el_autor=False)
    assert not af.puede_aprobar_avance('CONTRATISTA', es_el_autor=False)
    assert not af.puede_aprobar_avance('PROYECTISTA', es_el_autor=False)
    assert not af.puede_aprobar_avance(None, es_el_autor=False)


def test_el_autor_jamas_se_aprueba_a_si_mismo():
    assert not af.puede_aprobar_avance('SUPERVISION', es_el_autor=True)
    assert not af.puede_aprobar_avance('ENTIDAD', es_el_autor=True)


# ══ 2 · BIC CONTRACTUAL CONCRETO (corrección 2) ═══════════════════════════

def _p(uid, cid, funcion='SUPERVISION'):
    return {'user_id': uid, 'company_id': cid, 'funcion': funcion,
            'nombre': 'u%s' % uid}


def test_cero_candidatos_es_SIN_APROBADOR_CONTRACTUAL():
    destino, codigo = af.resolver_aprobador_contractual([], [])
    assert destino is None and codigo == af.SIN_APROBADOR_CONTRACTUAL


def test_un_candidato_se_asigna_como_persona_con_funcion_snapshoteada():
    destino, codigo = af.resolver_aprobador_contractual([_p(27, 4)], [])
    assert codigo is None
    assert destino == {'tipo': 'persona', 'user_id': 27, 'company_id': 4,
                       'funcion': 'SUPERVISION'}


def test_varios_de_la_misma_empresa_resuelven_a_la_EMPRESA_concreta():
    destino, codigo = af.resolver_aprobador_contractual(
        [_p(27, 4), _p(31, 4)], [])
    assert codigo is None
    assert destino == {'tipo': 'empresa', 'company_id': 4,
                       'funcion': 'SUPERVISION'}


def test_varias_empresas_es_AMBIGUO_y_no_se_adivina():
    destino, codigo = af.resolver_aprobador_contractual(
        [_p(27, 4), _p(31, 9)], [])
    assert destino is None and codigo == af.APROBADOR_CONTRACTUAL_AMBIGUO


def test_la_ambiguedad_de_supervision_NO_cae_a_la_contingencia():
    destino, codigo = af.resolver_aprobador_contractual(
        [_p(27, 4), _p(31, 9)], [_p(50, 7, 'ENTIDAD')])
    assert destino is None and codigo == af.APROBADOR_CONTRACTUAL_AMBIGUO


def test_la_contingencia_ENTIDAD_solo_entra_con_supervision_vacia():
    destino, codigo = af.resolver_aprobador_contractual(
        [], [_p(50, 7, 'ENTIDAD')])
    assert codigo is None
    assert destino['tipo'] == 'persona' and destino['funcion'] == 'ENTIDAD'


# ══ 3 · SNAPSHOT DE AUTORIDAD DEL OBJETIVO (corrección 1) ═════════════════

def test_el_snapshot_tiene_las_claves_congeladas():
    s = af.snapshot_del_objetivo('lob_cost_items', 'ds1·02.01', 'm3',
                                 1200, 'dataset:ds1·v3·abc')
    assert tuple(sorted(s)) == tuple(sorted(af.CLAVES_DEL_SNAPSHOT_DE_OBJETIVO))
    assert s['objetivo_cantidad'] == 1200.0


def test_sin_objetivo_el_snapshot_es_nulo_no_inventado():
    s = af.snapshot_del_objetivo(None, None, None, None, None)
    assert all(v is None for v in s.values())


def test_fuente_desconocida_y_cantidad_no_positiva_se_rechazan():
    with pytest.raises(ValueError):
        af.snapshot_del_objetivo('presupuesto_maestro', 'x', 'm3', 10, 'h')
    with pytest.raises(ValueError):
        af.snapshot_del_objetivo('lob_cost_items', 'x', 'm3', 0, 'h')


def test_porcentaje_historico_y_actual_son_preguntas_distintas():
    # histórico: contra el objetivo sellado al aprobar (1000);
    # actual: contra el plan vigente (1250, tras cambiar el metrado).
    assert af.porcentaje(500, 1000) == 50.0
    assert af.porcentaje(500, 1250) == 40.0
    assert af.porcentaje(500, None) is None
    assert af.porcentaje(500, 0) is None


def test_la_huella_lleva_dataset_version_y_fingerprint():
    h = af.huella_de_dataset('ds1', 3, 'abcdef1234567890XX')
    assert h.startswith('dataset:ds1·v3·')
    assert 'XX' not in h  # recortada a 16


# ══ 4 · MAGNITUD SIEMPRE POSITIVA, SIGNO EN EL TIPO (corrección 3) ════════

def test_el_tipo_lleva_el_signo():
    assert af.efecto_de('AVANCE') == 1.0
    assert af.efecto_de('AJUSTE_POSITIVO') == 1.0
    assert af.efecto_de('AJUSTE_NEGATIVO') == -1.0
    with pytest.raises(ValueError):
        af.efecto_de('RETROCESO')


def test_solo_lo_aprobado_suma():
    avances = [
        {'estado': 'APROBADO', 'tipo': 'AVANCE', 'cantidad': 100},
        {'estado': 'REPORTADO', 'tipo': 'AVANCE', 'cantidad': 999},
        {'estado': 'DEVUELTO', 'tipo': 'AVANCE', 'cantidad': 999},
        {'estado': 'APROBADO', 'tipo': 'AJUSTE_NEGATIVO', 'cantidad': 20},
    ]
    assert af.acumulado_de(avances) == 80.0


# ══ 5 · CONFLICTOS: detectar ≠ prohibir ≠ aceptar en silencio ═════════════

def _ap(cant, ini=None, fin=None, fecha='2026-08-20', tipo='AVANCE'):
    return {'estado': 'APROBADO', 'tipo': tipo, 'cantidad': cant,
            'progresiva_inicio': ini, 'progresiva_fin': fin,
            'fecha_operativa': fecha}


def test_exceso_sobre_objetivo_se_detecta():
    nuevo = _ap(300, fecha='2026-08-21')
    assert 'EXCESO_SOBRE_OBJETIVO' in af.detectar_conflictos(
        nuevo, [_ap(800)], objetivo=1000)
    assert af.detectar_conflictos(nuevo, [_ap(600)], objetivo=1000) == []


def test_solape_de_progresivas_se_marca_no_se_prohibe():
    nuevo = _ap(50, 620, 640, fecha='2026-08-21')
    codigos = af.detectar_conflictos(nuevo, [_ap(50, 630, 660)], objetivo=None)
    assert codigos == ['SOLAPE_CON_APROBADO']
    assert af.detectar_conflictos(
        nuevo, [_ap(50, 640, 660)], objetivo=None) == []


def test_posible_duplicado_misma_referencia_cantidad_y_fecha():
    nuevo = _ap(50, 620, 640)
    assert 'POSIBLE_DUPLICADO' in af.detectar_conflictos(
        nuevo, [_ap(50, 700, 720)], objetivo=None)


def test_aprobar_con_conflicto_exige_confirmacion_trazable_por_codigo():
    detectados = ['EXCESO_SOBRE_OBJETIVO', 'SOLAPE_CON_APROBADO']
    sin_motivo = [{'codigo': 'EXCESO_SOBRE_OBJETIVO', 'motivo': ' ',
                   'actor_id': 27, 'ts': 't'}]
    assert af.confirmaciones_completas(detectados, sin_motivo) == detectados
    completas = [
        {'codigo': 'EXCESO_SOBRE_OBJETIVO', 'motivo': 'capa extra pactada',
         'actor_id': 27, 'ts': '2026-08-28T10:00:00Z'},
        {'codigo': 'SOLAPE_CON_APROBADO', 'motivo': 'segunda capa',
         'actor_id': 27, 'ts': '2026-08-28T10:00:00Z'},
    ]
    assert af.confirmaciones_completas(detectados, completas) == []


# ══ 6 · FECHAS ACTUAL ═════════════════════════════════════════════════════

def test_actual_start_es_la_primera_ejecucion_aprobada():
    avances = [_ap(10, fecha='2026-08-22'), _ap(10, fecha='2026-08-19'),
               {'estado': 'REPORTADO', 'tipo': 'AVANCE', 'cantidad': 1,
                'fecha_operativa': '2026-08-01'}]
    assert af.actual_start_de(avances) == '2026-08-19'


def test_actual_finish_SOLO_por_declaracion_explicita_aprobada():
    sin_declarar = [_ap(10), _ap(990)]
    assert af.actual_finish_de(sin_declarar) is None
    con_declaracion = sin_declarar + [dict(_ap(1, fecha='2026-08-25'),
                                           termina_actividad=True)]
    assert af.actual_finish_de(con_declaracion) == '2026-08-25'
    assert af.estado_derivado('2026-08-19', None) == 'en_ejecucion'
    assert af.estado_derivado('2026-08-19', '2026-08-25') == 'terminada'
    assert af.estado_derivado(None, None) == 'sin_iniciar'


def test_la_fecha_operativa_es_LA_MISMA_regla_del_cuaderno():
    import cuaderno_de_obra
    assert af.fecha_operativa_valida is cuaderno_de_obra.fecha_operativa_valida


# ══ 7 · CATÁLOGOS CASADOS: CÓDIGO ↔ BASE ↔ PANTALLA ══════════════════════

def test_estados_y_tipos_casan_con_la_BASE():
    sql = _sql26()
    assert "estado IN ('%s')" % "','".join(af.ESTADOS_DE_AVANCE) in sql
    assert "tipo IN ('%s')" % "','".join(af.TIPOS_DE_AVANCE) in sql


def test_estados_y_tipos_casan_con_la_PANTALLA():
    pantalla = _pantalla()
    for tipo in af.TIPOS_DE_AVANCE:
        assert "'%s'" % tipo in pantalla, tipo
    for estado in af.ESTADOS_DE_AVANCE:
        assert "'%s'" % estado in pantalla, estado


def test_los_checks_del_contrato_estan_en_la_base():
    sql = _sql26()
    for ck in ('ck_avance_cantidad_positiva', 'ck_avance_autor_no_se_aprueba',
               'ck_avance_aprobado_con_firma', 'ck_avance_devuelto_con_motivo',
               'ck_avance_ajuste_referencia', 'ck_avance_destino',
               'ck_avance_proyeccion_solo_aprobado',
               'ck_avance_aprobado_con_snapshot', 'ck_avance_progresivas'):
        assert ck in sql, ck
    assert "'AVANCE'" in sql.split('ck_encargos_tipo')[2]


# ══ 8 · PRIVILEGE SWEEP (gate O) — vigilado para siempre ═════════════════

def test_las_tablas_futuras_nacen_sin_DELETE():
    sql = _sql26()
    assert re.search(r'ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN '
                     r'SCHEMA public\s+REVOKE DELETE, TRUNCATE ON TABLES '
                     r'FROM ecd_app', sql)


def test_el_sweep_revoca_donde_el_codigo_no_borra():
    sql = _sql26()
    revokes = re.findall(r'REVOKE DELETE, TRUNCATE ON ([a-z_0-9]+)\s+FROM '
                         r'ecd_app', sql)
    assert len(revokes) >= 57 + 2  # el barrido + las dos tablas nuevas
    for tabla in ('lob_cost_items', 'sync_operaciones', 'triaje_seguridad',
                  'daily_reports', 'photo_evidences', 'avance_campo',
                  'avance_fotos'):
        assert tabla in revokes, tabla


def test_el_sweep_respeta_la_lista_blanca_de_borrados_reales():
    sql = _sql26()
    revokes = re.findall(r'REVOKE DELETE, TRUNCATE ON ([a-z_0-9]+)\s+FROM '
                         r'ecd_app', sql)
    for tabla in ('encargos', 'users', 'file_nodes', 'document_shares',
                  'doc_album_fotos', 'project_users', 'sessions'):
        assert tabla not in revokes, (
            '%s tiene borrados reales en el codigo: revocarlo rompe' % tabla)


def test_lo_nuevo_concede_solo_lo_que_promete():
    sql = _sql26()
    assert re.search(r'GRANT SELECT, INSERT, UPDATE ON avance_campo\s+TO '
                     r'ecd_app', sql)
    assert re.search(r'GRANT SELECT, INSERT ON avance_fotos\s+TO ecd_app', sql)
