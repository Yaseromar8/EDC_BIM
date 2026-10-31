"""Abrir un plano en el visor CAD deja constancia, como abrir un PDF (31-oct-2026, docs/visor/59 §6.1).

Sin esto, «Visualizados recientemente» del tablero nunca traía un DWG ni un RVT, y la supervisión no podía ver
quién había abierto un plano de Autodesk. Se anota DESPUÉS de la guardia: lo denegado no cuenta como abierto.
"""
from flask import Flask, g, jsonify

import registro_de_descargas
import routes.docs_cad as cad


def _consultar(monkeypatch, negativa=False):
    anotados = []
    monkeypatch.setattr(cad, '_cargar', lambda node_id, version_id=None: {'id': node_id, 'model_urn': 'obra', 'meta': {}})
    monkeypatch.setattr(cad, '_guardia_del_plano', lambda _n: (jsonify({'success': False}), 403) if negativa else None)
    monkeypatch.setattr(cad, 'get_internal_token', lambda: (None, 'sin credenciales en la prueba'))
    monkeypatch.setattr(registro_de_descargas, 'registrar',
                        lambda user, ambito, via, gcs_urn=None, node_id=None, **k: anotados.append((user, via, node_id)))
    app = Flask(__name__)
    with app.test_request_context('/api/docs/cad/status?node_id=n-1'):
        g.current_user = {'id': 7, 'email': 'ana@obra.pe'}
        cad.cad_status()
    return anotados


def test_abrir_un_plano_en_el_visor_cad_queda_anotado(monkeypatch):
    assert _consultar(monkeypatch) == [({'id': 7, 'email': 'ana@obra.pe'}, 'visor CAD', 'n-1')]


def test_lo_denegado_no_se_anota_como_abierto(monkeypatch):
    assert _consultar(monkeypatch, negativa=True) == []


def test_si_el_registro_falla_el_plano_se_abre_igual(monkeypatch):
    def revienta(*a, **k):
        raise RuntimeError('tabla caída')
    monkeypatch.setattr(cad, '_cargar', lambda node_id, version_id=None: {'id': node_id, 'model_urn': 'obra', 'meta': {}})
    monkeypatch.setattr(cad, '_guardia_del_plano', lambda _n: None)
    monkeypatch.setattr(cad, 'get_internal_token', lambda: (None, 'sin credenciales en la prueba'))
    monkeypatch.setattr(registro_de_descargas, 'registrar', revienta)
    with Flask(__name__).test_request_context('/api/docs/cad/status?node_id=n-1'):
        g.current_user = {'id': 7}
        r = cad.cad_status()
    assert (r[1] if isinstance(r, tuple) else 200) == 502   # sigue su camino (aquí, sin credenciales de Autodesk)
