"""Los permisos por carpeta, antes de abrir el portal a no-administradores.

POR QUÉ ESTOS TESTS, Y POR QUÉ AHORA
------------------------------------
El motor de permisos por carpeta está bien hecho: seis niveles, herencia aditiva
hacia arriba y deny-by-default de verdad. Pero el portal está cerrado a quien no
sea administrador, y eso tapaba tres agujeros que nadie podía ver, porque el
administrador global corta antes de llegar a ellos (folder_permissions.py:99).

El día que se quite ese portón, los tres se abren de golpe. Por eso se cierran
ANTES, y con pruebas: quitar el `if` del router son cinco minutos, y no debe ser
lo que decida si esto es seguro.

LOS TRES
--------
1. Un nivel que no existe puntuaba 0, y 0 es 'viewer'. Seis rutas de subida
   pedían 'create_upload', que nunca estuvo en la tabla de niveles: subir
   ficheros y crear carpetas exigían lo mismo que mirarlos.
2. Tres handlers no comprobaban nada: la descripción de un documento y los
   atributos personalizados se podían leer y reescribir en cualquier obra con
   solo mandar el node_id.
3. El borrado en lote se autorizaba mirando items[0]. Con permiso en UNA carpeta
   se arrastraban documentos de cualquier otra metiéndolos en la misma petición
   —y encima el borrado de uno en uno exige un nivel más alto, así que la vía
   masiva era la más laxa de las dos.
"""
import importlib

import pytest
from flask import Flask, g, jsonify

import folder_permissions as fp


OBRA = 'urn:obra:PQT8'
AJENA = 'urn:obra:OTRA'
MIA = 'nodo-de-mi-carpeta'
SUYA = 'nodo-de-la-carpeta-de-al-lado'


# ── 1. Un nivel que no existe deniega ───────────────────────────────────────

@pytest.fixture
def guardia(monkeypatch):
    """check_folder_permission con un nivel efectivo que decidimos nosotros."""
    def montar(nivel_efectivo):
        monkeypatch.setattr(fp, 'get_effective_permission',
                            lambda uid, nid, urn: nivel_efectivo)
        return lambda exigido: fp.check_folder_permission(
            {'id': 7, 'role': 'user'}, MIA, OBRA, exigido, 'hacer algo')
    return montar


@pytest.fixture(autouse=True)
def _contexto_flask():
    app = Flask(__name__)
    with app.app_context():
        yield


def test_un_nivel_inventado_deniega_en_vez_de_colar_como_viewer(guardia):
    """'create_upload' no existe. Antes valía 0 y dejaba subir a cualquiera que
    tuviera permiso de mirar."""
    comprobar = guardia('viewer')
    resp = comprobar('create_upload')
    assert resp is not None and resp[1] == 403


def test_ni_siquiera_un_administrador_de_carpeta_pasa_por_un_nivel_inventado(guardia):
    """Si el nombre está mal escrito, el fallo tiene que verse SIEMPRE, no solo
    cuando lo prueba alguien con pocos permisos."""
    comprobar = guardia('admin')
    assert comprobar('create_upload') is not None


def test_los_seis_niveles_de_verdad_siguen_funcionando(guardia):
    comprobar = guardia('edit')
    assert comprobar('viewer') is None
    assert comprobar('view_download') is None
    assert comprobar('edit') is None
    assert comprobar('admin') is not None       # edit(3) < admin(4)


def test_subir_exige_editar_y_no_solo_mirar(guardia):
    """Es el efecto práctico del agujero: 'Ver' no puede subir."""
    comprobar = guardia('view_download')
    assert comprobar('edit') is not None


def test_quien_tiene_editar_si_puede_subir(guardia):
    assert guardia('edit')('edit') is None


def test_la_tabla_de_niveles_no_conoce_create_upload():
    """Si alguien lo añade, que se entere por aquí y no por un incidente."""
    assert 'create_upload' not in fp.PERMISSION_LEVELS
    assert list(fp.PERMISSION_LEVELS) == [
        'none', 'viewer', 'view_download', 'view_markup', 'edit', 'admin']


# ── 2 y 3. Los handlers, contra el servidor de verdad ───────────────────────

@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv('APP_SECRET', 'secreto-de-prueba')
    monkeypatch.setenv('AUTH_POLICY_MODE', 'sombra')
    import routes.documents as rd
    import routes.attributes as ra
    importlib.reload(rd)
    importlib.reload(ra)

    borrados = {'ids': None}
    escrito = {'descripcion': None, 'atributos': []}
    # nodo -> (obra, nivel que tiene el usuario sobre el)
    nodos = {MIA: (OBRA, 'admin'), SUYA: (OBRA, 'viewer'),
             'de-otra-obra': (AJENA, 'admin')}

    class Cursor:
        def __init__(self):
            self._u, self._all = None, []

        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            if s.startswith('SELECT MODEL_URN FROM FILE_NODES'):
                v = nodos.get(params[0])
                self._u = (v[0],) if v else None
            elif 'IS_DELETED = TRUE' in s:
                borrados['ids'] = list(params[0])
            elif s.startswith('UPDATE FILE_NODES SET DESCRIPTION') or 'DESCRIPTION = %S' in s:
                escrito['descripcion'] = params
            elif s.startswith('INSERT INTO CUSTOM_ATTR_VALUES'):
                escrito['atributos'].append(params)
            elif s.startswith('SELECT ATTR_ID, VALUE'):
                self._all = [(1, 'ARQ')]
            else:
                self._u = None

        def fetchone(self): return self._u
        def fetchall(self): return self._all

    class Conn:
        def cursor(self): return Cursor()
        def commit(self): pass
        def rollback(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False

    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(ra, 'get_db_connection', lambda: Conn())
    monkeypatch.setattr(db, 'log_activity', lambda *a, **k: None)
    monkeypatch.setattr(rd, 'verify_project_access', lambda u, urn: urn == OBRA)

    def _permiso(user, node_id, model_urn, nivel, accion):
        tengo = nodos.get(str(node_id), (None, 'none'))[1]
        if fp.PERMISSION_LEVELS.get(tengo, -1) < fp.PERMISSION_LEVELS.get(nivel, 0):
            return jsonify({"success": False, "error": "Acceso denegado"}), 403
        return None
    monkeypatch.setattr(rd, 'check_folder_permission', _permiso)
    monkeypatch.setattr(fp, 'check_folder_permission', _permiso)

    app = Flask(__name__)
    app.register_blueprint(rd.documents_bp)
    app.register_blueprint(ra.attributes_bp)

    @app.before_request
    def _s():
        g.current_user = {'id': 7, 'role': 'user', 'email': 'luis@obra.pe', 'name': 'Luis'}

    return app.test_client(), borrados, escrito


def _borrar(cli, ids):
    return cli.post('/api/docs/batch', json={'action': 'DELETE', 'items': ids,
                                             'model_urn': OBRA})


def test_el_borrado_en_lote_no_arrastra_lo_que_no_es_tuyo(api):
    """Poner delante uno de tu carpeta no puede llevarse los de al lado."""
    cli, borrados, _e = api
    r = _borrar(cli, [MIA, SUYA])
    assert r.status_code == 200
    assert borrados['ids'] == [MIA]


def test_y_te_dice_cuantos_se_quedaron_fuera(api):
    """Callarlo haría creer que se borró todo."""
    cli, _b, _e = api
    assert _borrar(cli, [MIA, SUYA]).get_json()['sin_permiso'] == 1


def test_si_no_puedes_borrar_ninguno_se_dice_y_no_se_toca_nada(api):
    cli, borrados, _e = api
    r = _borrar(cli, [SUYA])
    assert r.status_code == 403
    assert borrados['ids'] is None


def test_borrar_lo_tuyo_sigue_funcionando(api):
    cli, borrados, _e = api
    assert _borrar(cli, [MIA]).status_code == 200
    assert borrados['ids'] == [MIA]


def test_la_descripcion_de_otra_obra_no_se_toca(api):
    cli, _b, escrito = api
    r = cli.post('/api/docs/description',
                 json={'node_id': 'de-otra-obra', 'description': 'mío ahora',
                       'model_urn': AJENA})
    assert r.status_code == 403
    assert escrito['descripcion'] is None


def test_la_descripcion_de_una_carpeta_donde_solo_miras_no_se_toca(api):
    cli, _b, escrito = api
    r = cli.post('/api/docs/description',
                 json={'node_id': SUYA, 'description': 'cambiado', 'model_urn': OBRA})
    assert r.status_code == 403


def test_los_atributos_de_otra_obra_ni_se_leen_ni_se_escriben(api):
    cli, _b, escrito = api
    assert cli.get('/api/attrs/values?node_id=de-otra-obra').status_code == 403
    assert cli.put('/api/attrs/values',
                   json={'node_id': 'de-otra-obra', 'values': {'1': 'x'}}).status_code == 403
    assert escrito['atributos'] == []


def test_los_atributos_se_leen_con_ver_pero_se_escriben_con_editar(api):
    """Mirar un atributo no es lo mismo que cambiarlo."""
    cli, _b, _e = api
    assert cli.get(f'/api/attrs/values?node_id={SUYA}').status_code == 200
    assert cli.put('/api/attrs/values',
                   json={'node_id': SUYA, 'values': {'1': 'x'}}).status_code == 403


def test_un_documento_que_no_existe_da_404(api):
    cli, _b, _e = api
    assert cli.get('/api/attrs/values?node_id=no-existe').status_code == 404
