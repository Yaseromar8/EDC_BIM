# -*- coding: utf-8 -*-
"""Quien puede que con un RFI, y en que orden.

Lo que depende de PostgreSQL --la bandeja, la concurrencia de la numeracion, la
conciliacion-- se demuestra en `herramientas/ensayo_de_rfi.py`.
"""
import flujo_de_rfi as flujo

AUTOR = {'id': 1, 'email': 'autor@obra.pe', 'name': 'Autor', 'role': 'editor'}
RESP = {'id': 2, 'email': 'resp@obra.pe', 'name': 'Responsable', 'role': 'editor'}
OTRO = {'id': 3, 'email': 'otro@obra.pe', 'name': 'Otro', 'role': 'editor'}
ADMIN = {'id': 4, 'email': 'admin@obra.pe', 'name': 'Admin', 'role': 'admin'}

RFI = {'created_by': 'autor@obra.pe', 'responsable_id': 2, 'estado': 'En revisión'}


# ── Las tres reglas ───────────────────────────────────────────────────────

def test_pasar_la_pelota_lo_pueden_tres_y_solo_tres():
    """El autor, quien la tiene, o un administrador.

    Son las tres posiciones que existen en el flujo real de un RFI. Un miembro
    cualquiera de la obra NO puede quitarle un RFI a otro en silencio -- que es
    lo que pasaba antes, cuando `PATCH` solo comprobaba la obra.
    """
    assert flujo.puede_pasar_la_pelota(AUTOR, RFI) is True
    assert flujo.puede_pasar_la_pelota(RESP, RFI) is True
    assert flujo.puede_pasar_la_pelota(ADMIN, RFI) is True
    assert flujo.puede_pasar_la_pelota(OTRO, RFI) is False


def test_el_veredicto_lo_dicta_SOLO_quien_tiene_el_rfi():
    """Ni el autor ni un administrador.

    Un veredicto que puede dictar quien pregunto no prueba nada. Un
    administrador que necesite intervenir se asigna el RFI primero, y eso queda
    en el historial.
    """
    assert flujo.puede_dictar_veredicto(RESP, RFI) is True
    assert flujo.puede_dictar_veredicto(AUTOR, RFI) is False
    assert flujo.puede_dictar_veredicto(ADMIN, RFI) is False
    assert flujo.puede_dictar_veredicto(OTRO, RFI) is False


def test_cierra_quien_pregunto_o_un_administrador():
    assert flujo.puede_cerrar(AUTOR, RFI) is True
    assert flujo.puede_cerrar(ADMIN, RFI) is True
    assert flujo.puede_cerrar(RESP, RFI) is False


def test_el_responsable_se_compara_por_IDENTIDAD_nunca_por_texto():
    """El texto `responsable` no decide nunca. Si decidiera, dos personas con el
    mismo nombre podrian responder el mismo RFI."""
    rfi = {'created_by': 'x', 'responsable_id': 2, 'responsable': 'Otro'}
    assert flujo.es_el_responsable({'id': 2, 'name': 'Cualquiera'}, rfi) is True
    assert flujo.es_el_responsable({'id': 9, 'name': 'Otro'}, rfi) is False


def test_el_autor_se_reconoce_por_correo_o_por_nombre():
    """`created_by` guarda uno u otro segun quien lo creo."""
    assert flujo.es_el_autor({'email': 'autor@obra.pe'}, RFI) is True
    assert flujo.es_el_autor({'name': 'autor@obra.pe'}, RFI) is True
    assert flujo.es_el_autor({'email': 'x@y.z', 'name': 'X'}, RFI) is False


# ── Legacy ────────────────────────────────────────────────────────────────

def test_un_rfi_NUEVO_sin_asignar_NO_es_legacy():
    """El defecto que encontro el ensayo.

    `es_legacy` miraba solo la ausencia de `responsable_id`, y un RFI recien
    creado tampoco lo tiene: su primera asignacion se registraba como
    «adopción» en vez de como asignación. Legacy es el que arrastra un NOMBRE
    escrito a mano y ningun usuario detras.
    """
    nuevo = {'responsable_id': None, 'responsable': None, 'estado': 'Emitido'}
    assert flujo.es_legacy(nuevo) is False
    assert flujo.necesita_adopcion(nuevo) is False


def test_un_rfi_del_registro_anterior_SI_es_legacy():
    viejo = {'responsable_id': None, 'responsable': 'Ing. Valeria Barrenechea',
             'estado': 'En revisión'}
    assert flujo.es_legacy(viejo) is True
    assert flujo.necesita_adopcion(viejo) is True


def test_un_legacy_CERRADO_no_pide_adopcion():
    """Es archivo: se conserva exactamente y no se le aplican reglas nuevas."""
    cerrado = {'responsable_id': None, 'responsable': 'Ing. Valeria Barrenechea',
               'estado': 'Cerrado'}
    assert flujo.es_legacy(cerrado) is True
    assert flujo.necesita_adopcion(cerrado) is False


def test_adoptar_lo_puede_el_autor_o_un_administrador():
    """El «responsable actual» no: todavia no existe como identidad, que es
    justamente lo que falta."""
    viejo = {'created_by': 'autor@obra.pe', 'responsable_id': None,
             'responsable': 'Ing. Valeria', 'estado': 'En revisión'}
    assert flujo.puede_adoptar(AUTOR, viejo) is True
    assert flujo.puede_adoptar(ADMIN, viejo) is True
    assert flujo.puede_adoptar(OTRO, viejo) is False


# ── Estados ───────────────────────────────────────────────────────────────

def test_los_caminos_permitidos_y_los_que_no():
    assert flujo.transicion_valida('Emitido', 'En revisión')[0] is True
    assert flujo.transicion_valida('En revisión', 'Respondido')[0] is True
    assert flujo.transicion_valida('Respondido', 'Cerrado')[0] is True
    # Devolver una respuesta que no sirve: sin este camino, un RFI mal
    # respondido solo se podria cerrar, que es peor.
    assert flujo.transicion_valida('Respondido', 'En revisión')[0] is True
    # Y los que no:
    assert flujo.transicion_valida('Emitido', 'Cerrado')[0] is False
    assert flujo.transicion_valida('En revisión', 'Cerrado')[0] is False


def test_cerrado_es_cerrado():
    for destino in ('Emitido', 'En revisión', 'Respondido'):
        assert flujo.transicion_valida('Cerrado', destino)[0] is False


def test_no_se_inventan_estados():
    """Los cuatro que la interfaz ya ofrece y que usan los 25 registros reales.
    Ni uno mas porque ACC o Procore lo tengan."""
    assert flujo.ESTADOS == ('Emitido', 'En revisión', 'Respondido', 'Cerrado')
    assert flujo.transicion_valida('En revisión', 'Draft')[0] is False


def test_responder_exige_veredicto():
    """Hoy hay DOS RFI con `fecha_respuesta` puesta y ninguna respuesta: cada
    campo se escribia por su cuenta."""
    assert flujo.exige_veredicto('Respondido') is True
    assert flujo.exige_veredicto('Cerrado') is False


# ── Numeracion ────────────────────────────────────────────────────────────

class _Cur:
    def __init__(self, ultimo):
        self.ultimo, self.sql = ultimo, ''

    def execute(self, sql, params=None):
        self.sql = sql

    def fetchone(self):
        return (self.ultimo,)


def test_el_siguiente_numero_sale_del_SUFIJO_no_de_contar():
    """Contar filas recicla numeros al borrar uno, y ordena RFI-9 despues de
    RFI-10. El sufijo es lo que la numeracion significa."""
    assert flujo.siguiente_codigo(_Cur(25), 'obra_1') == 'RFI-026'
    assert flujo.siguiente_codigo(_Cur(0), 'obra_1') == 'RFI-001'
    assert flujo.siguiente_codigo(_Cur(999), 'obra_1') == 'RFI-1000'


def test_la_numeracion_se_agrupa_por_OBRA_no_por_alcance():
    """`model_urn` es un ALCANCE: la obra '1' tiene ocho alias registrados.
    Agrupar por alcance dejaria convivir dos RFI-013 en la misma obra."""
    cur = _Cur(3)
    flujo.siguiente_codigo(cur, 'obra_1')
    assert 'project_id' in cur.sql and 'model_urn' not in cur.sql


# ── Historial ─────────────────────────────────────────────────────────────

def test_toda_entrada_del_historial_dice_quien_y_cuando():
    e = flujo.entrada('responded', 'quien@obra.pe', veredicto='Aceptado')
    assert e['event'] == 'responded' and e['by'] == 'quien@obra.pe'
    assert e['at'] and e['veredicto'] == 'Aceptado'
    # Los valores vacios no ensucian el registro.
    assert 'de' not in flujo.entrada('x', 'y', de=None)
