"""La vista del modelo, por nombre y resuelta por versión (F1, 20-oct-2026); sin red ni base.

Datos reales medidos en Autodesk (500125-CSSP001-000, 1_CANAL): el GUID de «NUEVA»
cambió en la v4, la v6 y la v7; «APS_SCL» solo existe en la v7.
"""
import vista_del_modelo as vm

V4 = [{'name': 'NAVISWORKS', 'guid': 'de7d400e'}, {'name': 'NUEVA', 'guid': '12c5d8cb'}]
V7 = [{'name': 'NAVISWORKS', 'guid': 'de7d400e'}, {'name': 'APS_SCL', 'guid': 'cb5e76ee'},
      {'name': 'NUEVA', 'guid': '93f908ea'}]


def test_por_nombre_encuentra_la_vista_aunque_cambie_su_guid():
    vista, como = vm.resolver_vista(V7, 'NUEVA', '12c5d8cb')       # GUID viejo de la v4
    assert como == 'nombre' and vista['guid'] == '93f908ea'


def test_el_nombre_no_distingue_mayusculas_ni_espacios():
    assert vm.resolver_vista(V7, '  aps_scl ')[0]['guid'] == 'cb5e76ee'


def test_si_la_vista_elegida_no_existe_se_dice_y_no_se_elige_otra():
    assert vm.resolver_vista(V4, 'APS_SCL') == (None, 'no_existe')


def test_dos_vistas_con_el_mismo_nombre_desempata_el_guid_guardado():
    dobles = [{'name': 'NUEVA', 'guid': 'a'}, {'name': 'NUEVA', 'guid': 'b'}]
    assert vm.resolver_vista(dobles, 'NUEVA', 'b')[0]['guid'] == 'b'
    assert vm.resolver_vista(dobles, 'NUEVA', 'zzz')[0]['guid'] == 'a'


def test_modelos_antiguos_solo_con_guid_siguen_como_antes():
    assert vm.resolver_vista(V7, None, 'de7d400e') == ({'name': 'NAVISWORKS', 'guid': 'de7d400e'}, 'guid')
    assert vm.resolver_vista(V7, None, 'otro') == (None, 'guid_desconocido')
    assert vm.resolver_vista(V7) == (None, 'sin_eleccion')


def _versiones(monkeypatch, por_urn):
    monkeypatch.setattr(vm, 'vistas_de_la_version', lambda urn, token: por_urn[urn])


def test_actualizar_lleva_la_vista_por_nombre_y_guarda_su_guid_nuevo(monkeypatch):
    _versiones(monkeypatch, {'v7': (V7, 'ok')})
    modelo = {'defaultViewName': 'NUEVA', 'defaultViewGuid': 'da2c99ea'}
    assert vm.llevar_vista_a_la_version(modelo, 'v6', 'v7', 'tok') == (True, None)
    assert modelo['defaultViewGuid'] == '93f908ea' and modelo['defaultViewName'] == 'NUEVA'


def test_actualizar_no_cambia_si_la_vista_falta_en_la_version_nueva(monkeypatch):
    _versiones(monkeypatch, {'v4': (V4, 'ok')})
    modelo = {'defaultViewName': 'APS_SCL', 'defaultViewGuid': 'cb5e76ee'}
    puede, aviso = vm.llevar_vista_a_la_version(modelo, 'v7', 'v4', 'tok')
    assert puede is False and 'APS_SCL' in aviso
    assert modelo['defaultViewGuid'] == 'cb5e76ee'                    # el modelo no se toca


def test_un_modelo_antiguo_aprende_el_nombre_de_su_version_y_lo_lleva(monkeypatch):
    _versiones(monkeypatch, {'v6': ([{'name': 'NUEVA', 'guid': 'da2c99ea'}], 'ok'), 'v7': (V7, 'ok')})
    modelo = {'defaultViewGuid': 'da2c99ea'}
    assert vm.llevar_vista_a_la_version(modelo, 'v6', 'v7', 'tok') == (True, None)
    assert modelo == {'defaultViewGuid': '93f908ea', 'defaultViewName': 'NUEVA'}


def test_si_no_se_puede_comprobar_no_se_cambia(monkeypatch):
    for estado in ('procesando', 'error'):
        _versiones(monkeypatch, {'v7': ([], estado)})
        puede, aviso = vm.llevar_vista_a_la_version({'defaultViewName': 'NUEVA'}, 'v6', 'v7', 'tok')
        assert puede is False and aviso


def test_sin_vista_elegida_todo_sigue_igual(monkeypatch):
    _versiones(monkeypatch, {})
    assert vm.llevar_vista_a_la_version({}, 'v6', 'v7', 'tok') == (True, None)


def test_el_extractor_ya_no_cae_en_silencio_a_otra_vista():
    import routes.inventory as inv
    fuente = open(inv.__file__, encoding='utf-8').read()
    assert "if como == 'no_existe':" in fuente and 'raise Exception(mensaje_de_vista_ausente' in fuente
    assert "not _misma_vista(_vista_extraida(target_urn, urn), vista_pedida)" in fuente   # no reutiliza otra vista
    assert "task_kwargs['vista_pedida']" in fuente


def test_actualizar_y_actualizar_todos_comprueban_la_vista():
    import routes.digital_twin as dt
    fuente = open(dt.__file__, encoding='utf-8').read()
    assert fuente.count('llevar_vista_a_la_version(model, model.get(') == 2
    assert "'view_missing': True" in fuente and "status='view_missing'" in fuente
    assert "default_view_name = EXCLUDED.default_view_name" in fuente


# ── Desplegar el backend antes que la migración 38 no puede dejar los frentes sin modelos ──

class _Cur:
    def __init__(self, falla_nombre, hay_columna):
        self.falla_nombre, self.hay_columna, self.sql = falla_nombre, hay_columna, []
        self._filas = []

    def execute(self, sql, params=None):
        self.sql.append((sql, params))
        if 'default_view_name' in sql and 'SELECT model_id' in sql and self.falla_nombre:
            raise Exception('column "default_view_name" does not exist')
        if 'information_schema.columns' in sql:
            self._filas = [(1,)] if self.hay_columna else []
        elif 'SELECT model_id' in sql:
            self._filas = [('m1', 'Modelo', 'urnA', 'DOCS', 'US', 'p', 'i', 'v', 7, 't', '1_CANAL', None, 'g',
                            *([] if 'NULL' in sql else ['APS_SCL']))]
            if 'NULL' in sql:
                self._filas = [self._filas[0] + (None,)]

    def fetchall(self):
        return self._filas

    def fetchone(self):
        return self._filas[0] if self._filas else None


class _Conn:
    def __init__(self, cur):
        self.cur = cur

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def cursor(self):
        return self.cur

    def commit(self):
        pass


def _db(monkeypatch, cur):
    import db
    monkeypatch.setattr(db, 'get_db_connection', lambda *a, **k: _Conn(cur))
    monkeypatch.setattr(db, 'invalidar_resolver_de_obras', lambda: None, raising=False)


def test_sin_la_migracion_38_la_configuracion_se_sigue_leyendo(monkeypatch):
    import routes.digital_twin as dt
    _db(monkeypatch, _Cur(falla_nombre=True, hay_columna=False))
    modelos = dt.get_project_config_internal()['models']
    assert len(modelos) == 1 and modelos[0]['defaultViewGuid'] == 'g' and modelos[0]['defaultViewName'] is None


def test_con_la_38_se_lee_el_nombre(monkeypatch):
    import routes.digital_twin as dt
    _db(monkeypatch, _Cur(falla_nombre=False, hay_columna=True))
    assert dt.get_project_config_internal()['models'][0]['defaultViewName'] == 'APS_SCL'


def test_guardar_con_y_sin_la_columna(monkeypatch):
    import routes.digital_twin as dt
    for hay, n in ((True, 13), (False, 12)):
        cur = _Cur(falla_nombre=False, hay_columna=hay)
        _db(monkeypatch, cur)
        dt.save_project_config_internal({'models': [{'id': 'm1', 'urn': 'u', 'appProjectId': '1_CANAL',
                                                     'defaultViewGuid': 'g', 'defaultViewName': 'NUEVA'}]})
        sql, params = [x for x in cur.sql if 'INSERT INTO model_config' in x[0]][0]
        assert len(params) == n and ('default_view_name' in sql) == hay
