"""Plazos en dias LABORABLES (como ACC, 16-oct-2026).

Un paso puede contar sus dias como naturales (por omision: todas las
revisiones anteriores siguen igual) o como laborables, de lunes a viernes en
hora de Peru. Sin feriados: eso seria un calendario, no un campo.
"""
import datetime

import flujo_de_revision as flujo
import plantillas_de_revision as plt

UTC = datetime.timezone.utc


def _vence(dias, inicio, tipo='laborables'):
    return flujo.vencimiento({'dias': dias, 'dias_tipo': tipo}, inicio)


def test_un_dia_laborable_desde_el_viernes_vence_el_lunes():
    viernes = datetime.datetime(2026, 10, 16, 15, 0, tzinfo=UTC)   # 10:00 en Lima
    assert _vence(1, viernes) == datetime.datetime(2026, 10, 19, 15, 0, tzinfo=UTC)


def test_cinco_laborables_son_una_semana():
    lunes = datetime.datetime(2026, 10, 12, 14, 0, tzinfo=UTC)
    assert _vence(5, lunes).date() == datetime.date(2026, 10, 19)
    assert _vence(10, lunes).date() == datetime.date(2026, 10, 26)


def test_si_empieza_en_fin_de_semana_cuenta_desde_el_lunes():
    sabado = datetime.datetime(2026, 10, 17, 15, 0, tzinfo=UTC)
    assert _vence(1, sabado).date() == datetime.date(2026, 10, 19)
    domingo = datetime.datetime(2026, 10, 18, 15, 0, tzinfo=UTC)
    assert _vence(1, domingo).date() == datetime.date(2026, 10, 19)


def test_el_dia_se_mira_en_hora_de_peru_no_en_utc():
    """El sabado 02:00 UTC es todavia viernes 21:00 en Lima: el dia de arranque
    es el viernes y un dia laborable cae el lunes, no el martes."""
    viernes_noche_en_lima = datetime.datetime(2026, 10, 17, 2, 0, tzinfo=UTC)
    vence = _vence(1, viernes_noche_en_lima)
    assert (vence - datetime.timedelta(hours=5)).date() == datetime.date(2026, 10, 19)   # lunes en Lima
    assert vence == datetime.datetime(2026, 10, 20, 2, 0, tzinfo=UTC)                   # lunes 21:00


def test_naturales_sigue_igual_que_siempre():
    viernes = datetime.datetime(2026, 10, 16, 15, 0, tzinfo=UTC)
    esperado = viernes + datetime.timedelta(days=3)
    assert flujo.vencimiento({'dias': 3}, viernes) == esperado
    assert _vence(3, viernes, 'naturales') == esperado
    assert _vence(3, viernes, '') == esperado


def test_sin_dias_no_hay_plazo_tampoco_en_laborables():
    for dias in (None, '', 0, -2, 'pronto'):
        assert flujo.vencimiento({'dias': dias, 'dias_tipo': 'laborables'}) is None


def test_la_plantilla_solo_admite_naturales_o_laborables():
    def paso(tipo):
        return [{'etiqueta': 'Aprobar', 'decision': 'APRUEBA', 'user_id': 3,
                 'dias': 5, 'dias_tipo': tipo}]
    for bueno in (None, '', 'naturales', 'laborables'):
        assert plt.validar_pasos(paso(bueno), plt.OBRA) is None, bueno
    for malo in ('habiles', 'LABORABLES', 7, True):
        assert plt.validar_pasos(paso(malo), plt.OBRA), malo


def test_el_alta_de_la_revision_valida_el_tipo_de_dias():
    import io
    import os
    fuente = io.open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                  'routes', 'reviews.py'), encoding='utf-8').read()
    assert 'tipo_de_dias_valido' in fuente
