# -*- coding: utf-8 -*-
"""CAPA 9 · El motor de permisos, y por qué decide lo que decide.

El resolutor (`permiso_documental.permiso_efectivo`) no tenía una sola prueba
directa: se ejercitaba de refilón desde las rutas. Y es la pieza que decide
quién ve qué en el expediente de una obra pública.

Aquí quedan fijadas las dos reglas del modelo — que NO se tocan, se fijan —

    CLOSEST-WINS      la carpeta más cercana con una regla decide, y las de
                      arriba ya no cuentan (no se acumula: eso era la herencia
                      aditiva, y es lo que impedía reservar una carpeta);
    PRECEDENCIA       dentro de la misma carpeta: USER > COMPANY > FUNCTION;
    `none`            es una DENEGACIÓN explícita, no «sin regla».

…y la explicación que la interfaz necesita para poder auditarlas: qué carpeta
ganó, qué sujeto ganó, y qué reglas quedaron desplazadas.

El árbol de estas pruebas:

    raiz
     └── obra
          └── contrato      (donde viven casi todas las reglas)
               └── privado
                    └── acta.pdf   (FILE: no lleva permisos propios)
"""
import importlib

import pytest

ARBOL = {
    'raiz':      (None, 'FOLDER'),
    'obra':      ('raiz', 'FOLDER'),
    'contrato':  ('obra', 'FOLDER'),
    'privado':   ('contrato', 'FOLDER'),
    'acta.pdf':  ('privado', 'FILE'),
}

# La obra tiene DOS identificadores, como en produccion: las carpetas viven
# bajo el model_urn y project_companies bajo el projects.id canonico.
OBRA = 'proyectos/OBRA_DE_PRUEBA'
CANONICA = 'b.proj_prueba'


@pytest.fixture
def motor(monkeypatch):
    import permiso_documental as pd
    importlib.reload(pd)
    # La autoridad administrativa se prueba aparte: aquí interesa el resolutor.
    monkeypatch.setattr(pd, '_MAX_SALTOS', 40)

    estado = {
        'reglas': {},        # {carpeta: {sujeto_tipo: nivel}}
        'empresa': 4,        # company_id de la persona (None = sin empresa)
        'funcion': 'CONTRATISTA',   # función de esa empresa EN ESTA OBRA
        'es_admin_de_obra': False,
    }

    class Cursor:
        def __init__(self): self.ultimo = ('', ()); self._filas = []
        def execute(self, sql, params=None):
            s = ' '.join(sql.split()).upper()
            p = params or ()
            self.ultimo = (s, p)
            self._filas = []
            if 'SELECT COMPANY_ID FROM USERS' in s:
                self._filas = [(estado['empresa'],)] if estado['empresa'] else [(None,)]
            elif 'FROM PROJECT_COMPANIES' in s:
                # Como la tabla real: guarda el projects.id CANONICO. Si la
                # consulta llega con el model_urn sin resolver, NO casa -- que
                # es exactamente el defecto que la EXP encontro en produccion.
                if str(p[0]) == CANONICA and estado['funcion']:
                    self._filas = [(estado['funcion'],)]
            elif 'SELECT ID, PARENT_ID, NODE_TYPE FROM FILE_NODES' in s:
                nodo = str(p[0])
                if nodo in ARBOL and str(p[1]) == OBRA:
                    self._filas = [(nodo, ARBOL[nodo][0], ARBOL[nodo][1])]
            elif 'SELECT PARENT_ID FROM FILE_NODES' in s:
                nodo = str(p[0])
                self._filas = [(ARBOL[nodo][0],)] if nodo in ARBOL else []
            elif 'FROM FOLDER_PERMISSIONS' in s:
                carpeta = str(p[0])
                # El WHERE real casa (sujeto_tipo, sujeto_id) contra los tres
                # sujetos del principal. El doble hace lo mismo, comparando el
                # VALOR: así una regla dirigida a OTRA empresa o a OTRA función
                # se puede escribir en la prueba -- y NO alcanza, que es lo que
                # hay que poder comprobar.
                mios = {p[1]: p[2], p[3]: p[4], p[5]: p[6]}
                self._filas = []
                for clave, nivel in estado['reglas'].get(carpeta, {}).items():
                    tipo, valor = clave if isinstance(clave, tuple) else (clave, None)
                    diana = mios.get(tipo)
                    if diana in (None, pd.SIN_SUJETO):
                        continue          # el principal no tiene ese sujeto
                    if valor is not None and str(valor) != str(diana):
                        continue          # la regla apunta a OTRO de ese tipo
                    self._filas.append((tipo, nivel))
        def fetchone(self):
            return self._filas[0] if self._filas else None
        def fetchall(self):
            return list(self._filas)

    monkeypatch.setattr('administracion_de_obra.es_admin_de_obra',
                        lambda cur, u, obra: estado['es_admin_de_obra'])
    import db
    monkeypatch.setattr(db, 'resolve_project_id',
                        lambda x: CANONICA if x in (OBRA, CANONICA) else None)

    return pd, Cursor(), estado


PERSONA = {'id': 7, 'name': 'Ana', 'email': 'ana@obra.pe', 'role': 'user'}


def _resolver(pd, cur, nodo='acta.pdf', persona=PERSONA):
    return pd.permiso_efectivo(cur, persona, OBRA, nodo, con_motivo=True)


# ── CLOSEST-WINS ─────────────────────────────────────────────────────────────

def test_la_carpeta_mas_cercana_gana_aunque_conceda_menos(motor):
    """La operación que justifica el modelo entero: reservar una carpeta.

    Con herencia aditiva, `edit` arriba hacía imposible restringir abajo. Aquí
    `viewer` en la carpeta cercana MANDA sobre `edit` en la lejana."""
    pd, cur, e = motor
    e['reglas'] = {'obra': {pd.USER: 'edit'}, 'privado': {pd.USER: 'viewer'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'viewer'
    assert motivo['carpeta_id'] == 'privado'
    assert motivo['saltos'] == 0, 'la carpeta del propio recurso es el salto 0'


def test_none_es_una_denegacion_explicita(motor):
    """`none` no es «sin regla»: es «aquí no entras», y gana a un `admin`
    concedido más arriba. Sin esto no existe una carpeta reservada."""
    pd, cur, e = motor
    e['reglas'] = {'obra': {pd.USER: 'admin'}, 'privado': {pd.USER: 'none'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'none'
    assert motivo['regla'] == 'sujeto' and motivo['carpeta_id'] == 'privado'


def test_un_fichero_hereda_de_su_carpeta(motor):
    """Un FILE no lleva reglas propias: las lleva la carpeta que lo contiene."""
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'view_download'}}
    nivel, motivo = _resolver(pd, cur, nodo='acta.pdf')
    assert nivel == 'view_download'
    assert motivo['carpeta_id'] == 'privado'


def test_sube_hasta_encontrar_la_primera_regla(motor):
    pd, cur, e = motor
    e['reglas'] = {'obra': {pd.COMPANY: 'edit'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'edit'
    assert motivo['carpeta_id'] == 'obra'
    assert motivo['saltos'] == 2, 'privado(0) → contrato(1) → obra(2)'


# ── PRECEDENCIA: USER > COMPANY > FUNCTION ───────────────────────────────────

def test_la_persona_desplaza_a_su_empresa_en_la_misma_carpeta(motor):
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'viewer', pd.COMPANY: 'admin'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'viewer'
    assert motivo['sujeto_tipo'] == pd.USER
    # Y la interfaz puede DECIR qué quedó desplazado, que es lo que convierte
    # «tienes viewer» en una explicación.
    assert motivo['desplazados'] == [{'sujeto_tipo': pd.COMPANY, 'nivel': 'admin'}]


def test_la_empresa_desplaza_a_la_funcion(motor):
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.COMPANY: 'view_download', pd.FUNCTION: 'admin'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'view_download'
    assert motivo['sujeto_tipo'] == pd.COMPANY
    assert motivo['desplazados'] == [{'sujeto_tipo': pd.FUNCTION, 'nivel': 'admin'}]


def test_la_precedencia_no_cruza_carpetas(motor):
    """LA CONFUSIÓN QUE ESTA PRUEBA IMPIDE: la precedencia se aplica DENTRO de
    una carpeta. Una regla de USER lejana NO desplaza a una de FUNCTION
    cercana — primero decide la distancia, después la especificidad."""
    pd, cur, e = motor
    e['reglas'] = {'obra': {pd.USER: 'admin'}, 'privado': {pd.FUNCTION: 'viewer'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'viewer'
    assert motivo['sujeto_tipo'] == pd.FUNCTION and motivo['carpeta_id'] == 'privado'


def test_alcanza_por_funcion_a_quien_no_tiene_regla_propia(motor):
    """El caso del punto 8: una regla de FUNCIÓN alcanza a cualquiera cuya
    empresa ejerza esa función — incluidos los que lleguen después."""
    pd, cur, e = motor
    e['reglas'] = {'contrato': {pd.FUNCTION: 'view_markup'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'view_markup'
    assert motivo['sujeto_tipo'] == pd.FUNCTION


# ── Sin regla, y sin identidad ───────────────────────────────────────────────

def test_sin_ninguna_regla_manda_el_perfil_del_sistema(motor):
    pd, cur, e = motor
    e['reglas'] = {}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'none', 'un `user` sin regla está ciego (ISO 19650)'
    assert motivo['regla'] == 'defecto'
    assert 'perfil del sistema' in motivo['texto']


def test_una_regla_de_empresa_no_alcanza_a_quien_no_la_tiene(motor):
    """NEGATIVA: sin empresa, una regla de COMPANY no le llega — y tampoco
    hereda la función, que se deriva de la empresa."""
    pd, cur, e = motor
    e['empresa'] = None
    e['funcion'] = None
    e['reglas'] = {'privado': {pd.COMPANY: 'admin', pd.FUNCTION: 'admin'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'none'
    assert motivo['regla'] == 'defecto'


def test_una_regla_de_otra_funcion_no_alcanza(motor):
    """NEGATIVA: su empresa participa como CONTRATISTA. Una regla dirigida a
    SUPERVISION no la alcanza — y sin regla que le llegue, queda el defecto."""
    pd, cur, e = motor
    e['funcion'] = 'CONTRATISTA'
    e['reglas'] = {'privado': {(pd.FUNCTION, 'SUPERVISION'): 'admin'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'none'
    assert motivo['regla'] == 'defecto'

    # Y la MISMA regla, dirigida a su función, sí alcanza.
    e['reglas'] = {'privado': {(pd.FUNCTION, 'CONTRATISTA'): 'admin'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'admin' and motivo['sujeto_tipo'] == pd.FUNCTION


def test_una_regla_de_otra_empresa_no_alcanza(motor):
    """NEGATIVA: pertenece a la empresa 4; una regla de la empresa 9 no le
    llega, aunque esté en la carpeta más cercana."""
    pd, cur, e = motor
    e['empresa'] = 4
    e['reglas'] = {'privado': {(pd.COMPANY, '9'): 'admin'},
                   'obra': {(pd.COMPANY, '4'): 'viewer'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'viewer', 'la regla cercana no era suya: decide la de arriba'
    assert motivo['carpeta_id'] == 'obra'


def test_una_regla_de_otra_persona_no_alcanza(motor):
    """NEGATIVA: la regla de USER es de otra persona (id 99)."""
    pd, cur, e = motor
    e['reglas'] = {'privado': {(pd.USER, '99'): 'admin'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'none' and motivo['regla'] == 'defecto'


def test_el_recurso_de_otra_obra_no_existe_aqui(motor):
    """NEGATIVA: el árbol se consulta SIEMPRE con el model_urn. Un nodo de otra
    obra no resuelve, y el fallo es cerrado."""
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'admin'}}
    nivel, motivo = pd.permiso_efectivo(cur, PERSONA, 'b.proj_OTRA', 'privado',
                                        con_motivo=True)
    assert nivel == 'none'
    assert motivo['regla'] == 'recurso_inexistente'


def test_una_sesion_sin_identidad_no_alcanza_nada(motor):
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'admin'}}
    nivel, motivo = pd.permiso_efectivo(cur, {'role': 'admin'}, OBRA, 'privado',
                                        con_motivo=True)
    assert nivel == 'none'
    assert motivo['regla'] == 'sin_identidad'


# ── La autoridad administrativa ──────────────────────────────────────────────

def test_el_administrador_de_obra_atraviesa_y_se_dice(motor):
    """Atraviesa los permisos de SU obra — política explícita, no un bypass
    accidental — y la explicación lo declara en vez de fingir una regla."""
    pd, cur, e = motor
    e['es_admin_de_obra'] = True
    e['reglas'] = {'privado': {pd.USER: 'none'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'admin'
    assert motivo['regla'] == 'admin_de_obra'
    assert motivo['carpeta_id'] is None, 'no ganó ninguna carpeta: ganó su cargo'


# ── El contrato de la explicación ────────────────────────────────────────────

def test_explicar_y_decidir_son_la_misma_pasada(motor):
    """Si la explicación se calculara aparte podría contradecir a la decisión.
    Aquí se comprueba que el nivel es el MISMO con y sin motivo, en todos los
    caminos del resolutor."""
    pd, cur, e = motor
    casos = [
        {},
        {'privado': {pd.USER: 'none'}},
        {'obra': {pd.COMPANY: 'edit'}},
        {'contrato': {pd.FUNCTION: 'viewer'}},
        {'privado': {pd.USER: 'viewer', pd.COMPANY: 'admin'}},
    ]
    for reglas in casos:
        e['reglas'] = reglas
        solo = pd.permiso_efectivo(cur, PERSONA, OBRA, 'acta.pdf')
        con, _motivo = _resolver(pd, cur)
        assert solo == con, 'la explicación cambió la decisión con %r' % (reglas,)


def test_el_motivo_siempre_trae_las_claves_que_la_pantalla_pinta(motor):
    pd, cur, e = motor
    claves = {'regla', 'carpeta_id', 'sujeto_tipo', 'sujeto_id', 'saltos',
              'desplazados', 'texto'}
    for reglas, persona in [({}, PERSONA),
                            ({'privado': {pd.USER: 'edit'}}, PERSONA),
                            ({}, {'role': 'admin'})]:
        e['reglas'] = reglas
        _n, motivo = pd.permiso_efectivo(cur, persona, OBRA, 'acta.pdf',
                                         con_motivo=True)
        assert claves <= set(motivo), 'faltan claves en %r' % (motivo,)


def test_la_funcion_alcanza_aunque_la_carpeta_viva_bajo_otro_identificador(motor):
    """EL DEFECTO DE LA EXP (22-ago): `sujetos_de` consultaba
    project_companies con el model_urn de las carpetas sin resolverlo al
    projects.id canonico. La consulta no casaba nunca: una regla de FUNCION se
    escribia bien y NO ALCANZABA A NADIE por el camino de documentos. Los
    dobles no lo vieron porque usaban el mismo id para las dos cosas; este
    fixture ya no lo permite."""
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.FUNCTION: 'view_markup'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'view_markup', (
        'la regla de funcion no alcanzo: sujetos_de no resolvio el id canonico')
    assert motivo['sujeto_tipo'] == pd.FUNCTION


# ── Lo que perdió POR DISTANCIA (hace visible closest-wins) ──────────────────
#
# El caso que un administrador no entiende sin ayuda: ve «Editar» concedido a
# su empresa en la carpeta del proyecto, y la persona tiene «Ver y descargar».
# La regla de arriba no se aplica — y hasta que el inspector no lo dijo, la
# reacción natural era volver a conceder, esta vez de más.

def test_relata_la_regla_de_arriba_que_no_se_aplica(motor):
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'view_download'},
                   'obra': {pd.COMPANY: 'edit'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'view_download'
    assert motivo['carpeta_id'] == 'privado'
    # …y cuenta que arriba había una regla de empresa que quedó desplazada.
    assert motivo['desplazados_lejanos'] == [
        {'carpeta_id': 'obra', 'sujeto_tipo': pd.COMPANY, 'nivel': 'edit', 'saltos': 2}]


def test_relata_varias_carpetas_desplazadas_en_orden(motor):
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'viewer'},
                   'contrato': {pd.COMPANY: 'view_markup'},
                   'obra': {pd.FUNCTION: 'admin'}}
    nivel, motivo = _resolver(pd, cur)
    assert nivel == 'viewer'
    assert [d['carpeta_id'] for d in motivo['desplazados_lejanos']] == ['contrato', 'obra']
    assert [d['nivel'] for d in motivo['desplazados_lejanos']] == ['view_markup', 'admin']


def test_en_cada_carpeta_desplazada_se_relata_la_que_habria_ganado(motor):
    """Si una carpeta superior tiene dos reglas que le alcanzan, la que se
    cuenta es la que HABRÍA ganado allí (por precedencia), no las dos: es la
    que el administrador cree que manda."""
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'viewer'},
                   'obra': {pd.USER: 'admin', pd.COMPANY: 'edit'}}
    _nivel, motivo = _resolver(pd, cur)
    assert motivo['desplazados_lejanos'] == [
        {'carpeta_id': 'obra', 'sujeto_tipo': pd.USER, 'nivel': 'admin', 'saltos': 2}]


def test_sin_nada_por_encima_la_lista_va_vacia(motor):
    pd, cur, e = motor
    e['reglas'] = {'privado': {pd.USER: 'edit'}}
    _nivel, motivo = _resolver(pd, cur)
    assert motivo['desplazados_lejanos'] == []


def test_relatar_no_cambia_la_decision_con_reglas_por_encima(motor):
    """EL CONTRATO QUE PROTEGE EL MOTOR: seguir recorriendo la cadena para
    explicar no puede alterar el nivel. Se compara con y sin motivo."""
    pd, cur, e = motor
    for reglas in [
        {'privado': {pd.USER: 'viewer'}, 'obra': {pd.COMPANY: 'admin'}},
        {'privado': {pd.USER: 'none'}, 'contrato': {pd.USER: 'admin'}},
        {'contrato': {pd.FUNCTION: 'viewer'}, 'obra': {pd.USER: 'admin'}},
        {'privado': {pd.COMPANY: 'edit'}, 'contrato': {pd.USER: 'none'},
         'obra': {pd.FUNCTION: 'admin'}},
    ]:
        e['reglas'] = reglas
        solo = pd.permiso_efectivo(cur, PERSONA, OBRA, 'acta.pdf')
        con, _m = _resolver(pd, cur)
        assert solo == con, 'relatar cambió la decisión con %r' % (reglas,)


def test_una_regla_de_arriba_que_no_le_alcanza_no_se_relata(motor):
    """NEGATIVA: arriba hay una regla, pero es de OTRA empresa. No le desplaza
    nada porque nunca le habría alcanzado."""
    pd, cur, e = motor
    e['empresa'] = 4
    e['reglas'] = {'privado': {(pd.USER, '7'): 'viewer'},
                   'obra': {(pd.COMPANY, '99'): 'admin'}}
    _nivel, motivo = _resolver(pd, cur)
    assert motivo['desplazados_lejanos'] == []
