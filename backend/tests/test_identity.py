"""Pilar Identidad: resolver de frente -> obra canonica. DB-free (inyecta el cache)."""
import time
import db


def _inject(by_id=None, by_name=None, default=None):
    """Inyecta el mapa de resolucion en el cache para evitar la BD."""
    db._project_resolver_cache['map'] = {
        'by_id': by_id or {},
        'by_name': by_name or {},
        'default': default,
    }
    db._project_resolver_cache['ts'] = time.time()


def test_resuelve_por_prefijo():
    _inject(by_id={'1': '1'}, default='1')
    assert db.resolve_project_id('1_CANAL') == '1'
    assert db.resolve_project_id('1_DRENAJE') == '1'
    assert db.resolve_project_id('1_INFRAWORKS') == '1'


def test_global_y_none_usan_default():
    _inject(by_id={'1': '1'}, default='1')
    assert db.resolve_project_id('global') == '1'
    assert db.resolve_project_id(None) == '1'


def test_resuelve_por_nombre_con_ruta():
    _inject(by_id={'1': '1'}, by_name={'PQT8_TALARA': '1'}, default=None)
    assert db.resolve_project_id('proyectos/PQT8_TALARA') == '1'


def test_desconocido_cae_al_default():
    _inject(by_id={'1': '1'}, default=None)
    assert db.resolve_project_id('ZZZ_DESCONOCIDO') is None
