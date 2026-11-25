# -*- coding: utf-8 -*-
"""La valorización del mes guardada para toda la obra (sql/52, routes/planilla.py, docs/visor/71 §8), sin base.

Con PostgreSQL de verdad, sesiones y guardias: herramientas/ensayo_de_valorizacion.py (22/22 el 25-nov-2026).
Aquí: qué se acepta como Excel, que las tres rutas existen con su guardia de obra, y que la migración no deja a la
aplicación borrar ni reescribir una valorización guardada.
"""
import base64
import io
import os
import zipfile

import pytest

import routes.planilla as rp

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def xlsx():
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w') as z:
        z.writestr('xl/workbook.xml', '<workbook/>')
    return b.getvalue()


def b64(d):
    return base64.b64encode(d).decode('ascii')


def test_un_excel_se_acepta_con_su_nombre_sin_ruta_y_su_huella():
    nombre, datos, huella = rp.validar_valorizacion('C:\\obra\\VAL13_PARTIDA.xlsx', b64(xlsx()))
    assert nombre == 'VAL13_PARTIDA.xlsx' and datos.startswith(b'PK') and len(huella) == 64


def test_un_xls_antiguo_tambien():
    ole = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1' + b'\x00' * 32
    assert rp.validar_valorizacion('val.xls', b64(ole))[0] == 'val.xls'


@pytest.mark.parametrize('archivo, contenido, motivo', [
    ('val.pdf', None, 'tiene que ser un Excel'),
    ('', None, 'tiene que ser un Excel'),
    ('val.xlsx', '###', 'no llegó bien'),
    ('val.xlsx', '', 'vacío'),
    ('val.xlsx', b64(b'%PDF-1.7'), 'no es un Excel aunque lo diga'),
])
def test_lo_que_no_es_un_excel_se_rechaza_diciendo_por_que(archivo, contenido, motivo):
    with pytest.raises(rp.ValorizacionInvalida) as e:
        rp.validar_valorizacion(archivo, b64(xlsx()) if contenido is None else contenido)
    assert motivo in str(e.value)


def test_mas_de_8_mb_no_se_guarda(monkeypatch):
    monkeypatch.setattr(rp, 'LIMITE_VALORIZACION', 10)
    with pytest.raises(rp.ValorizacionInvalida) as e:
        rp.validar_valorizacion('val.xlsx', b64(xlsx()))
    assert '8 MB' in str(e.value)


def test_las_tres_rutas_existen_y_cada_una_pasa_por_la_guardia_de_la_obra():
    fuente = open(os.path.join(AQUI, 'routes', 'planilla.py'), encoding='utf-8').read()
    for fn in ('leer_valorizacion', 'guardar_valorizacion', 'quitar_valorizacion'):
        cuerpo = fuente[fuente.index('def %s(' % fn):]
        cuerpo = cuerpo[:cuerpo.find('\n@planilla_bp.route') if '\n@planilla_bp.route' in cuerpo else len(cuerpo)]
        assert 'guardia_de_obra(' in cuerpo and '_obra_canonica(' in cuerpo, fn
        if fn != 'leer_valorizacion':
            assert cuerpo.index('_es_admin(cur, obra)') < cuerpo.index('pg_advisory_xact_lock'), fn
    assert fuente.count("@planilla_bp.route('/api/planilla/valorizacion'") == 3


def test_la_migracion_no_deja_borrar_ni_reescribir_y_lo_comprueba():
    sql = open(os.path.join(AQUI, 'sql', '52_planilla_valorizaciones.sql'), encoding='utf-8').read()
    assert sql.index('REVOKE ALL ON planilla_valorizaciones FROM ecd_app') < sql.index('GRANT SELECT, INSERT ON planilla_valorizaciones')
    assert 'GRANT UPDATE (vigente, retirado_por, retirado_en)' in sql
    assert "has_table_privilege('ecd_app', 'planilla_valorizaciones', 'DELETE')" in sql
    assert "current_user <> 'ecd_migrator'" in sql
    rollback = open(os.path.join(AQUI, 'sql', '52_planilla_valorizaciones_rollback.sql'), encoding='utf-8').read()
    assert 'EXISTS (SELECT 1 FROM planilla_valorizaciones)' in rollback
