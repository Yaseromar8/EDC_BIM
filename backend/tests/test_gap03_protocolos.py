# -*- coding: utf-8 -*-
"""GAP 03 · PROTOCOLOS E INSPECCIONES.

LO QUE ESTE FICHERO PROTEGE, EN UNA FRASE: que una firma de conformidad no
pueda decir lo contrario de lo que dicen los puntos comprobados.

De ahi sale la invariante dura, que se comprueba en tres sitios distintos
a proposito -- semantica, manejador y base:

    UN ACTA CON UN ITEM NO CONFORME NO PUEDE CERRARSE COMO LIBERADA
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _sql():
    return io.open(os.path.join(RAIZ, 'sql', '15_gap03_protocolos.sql'),
                   encoding='utf-8').read()


def _rutas():
    return io.open(os.path.join(RAIZ, 'routes', 'protocolos.py'), encoding='utf-8').read()


# ── LA INVARIANTE, EN LOS TRES SITIOS ──────────────────────────────────────

def test_un_no_conforme_impide_liberar():
    """LA REGLA QUE GOBIERNA TODO EL GAP."""
    import flujo_de_protocolo as pro
    v, motivo = pro.veredicto_que_corresponde([
        {'tipo': 'conformidad', 'resultado': 'Conforme'},
        {'tipo': 'conformidad', 'resultado': 'No conforme'}])
    assert v == pro.NO_LIBERADO
    assert 'NO CONFORMES' in motivo


def test_un_acta_a_medias_tampoco_libera():
    """Firmar con puntos sin comprobar es firmar en blanco."""
    import flujo_de_protocolo as pro
    v, motivo = pro.veredicto_que_corresponde([
        {'tipo': 'conformidad', 'resultado': 'Conforme'},
        {'tipo': 'conformidad', 'resultado': 'Pendiente'}])
    assert v == pro.NO_LIBERADO
    assert 'sin comprobar' in motivo


def test_un_acta_sin_puntos_no_libera_nada():
    """Liberar contra una lista vacia es firmar que se comprobo algo que nadie
    definio."""
    import flujo_de_protocolo as pro
    v, motivo = pro.veredicto_que_corresponde([])
    assert v == pro.NO_LIBERADO
    assert 'ni un punto' in motivo


def test_todo_conforme_o_no_aplica_SI_libera():
    import flujo_de_protocolo as pro
    v, motivo = pro.veredicto_que_corresponde([
        {'tipo': 'conformidad', 'resultado': 'Conforme'},
        {'tipo': 'conformidad', 'resultado': 'No aplica'}])
    assert v == pro.LIBERADO and motivo == ''


def test_la_base_TAMBIEN_lo_impide():
    """Una regla que solo vive en Python la salta cualquier script -- y esta es
    justo la que hace que la firma pruebe algo."""
    sql = _sql()
    assert 'ck_actas_liberada_sin_no_conformes' in sql
    assert 'items @>' in sql and '"resultado":"No conforme"' in sql


def test_el_manejador_CALCULA_el_veredicto_y_no_lo_lee_del_cuerpo():
    """Si lo aceptara de fuera, una interfaz mal hecha --o alguien con curl--
    declararia liberada un acta con un punto en rojo dentro."""
    cuerpo = _rutas().split('def firmar')[1].split('\ndef ')[0]
    assert 'veredicto_que_corresponde' in cuerpo
    assert "data.get('estado')" not in cuerpo
    assert "data.get('veredicto')" not in cuerpo


def test_ninguna_posicion_dicta_el_veredicto_de_un_acta():
    """Todavia mas duro que en el submittal: alli decide un revisor humano;
    aqui la decision ya esta tomada por lo comprobado."""
    import flujo_de_protocolo as pro
    assert pro.SEMANTICA.quien_dicta_veredicto == ()


# ── UN VEREDICTO NEGATIVO TIENE QUE DECIR POR QUE ──────────────────────────

def test_no_liberado_exige_motivo():
    sql = _sql()
    assert 'ck_actas_no_liberado_con_motivo' in sql
    assert "estado <> 'No liberado' OR coalesce(motivo_veredicto,'') <> ''" in sql


# ── LO NO CONFORME NO SE QUEDA DENTRO ──────────────────────────────────────

def test_un_no_conforme_escala_a_ISSUE_y_no_a_RED_LINE():
    """CORRECCION SEMANTICA DEL 25-ago-2026 (doc 86).

    La primera version escalaba a Red Line, y era un error: el Red Line es la
    MODIFICACION DEL PROYECTO --un croquis firmado-- y su veredicto acepta o
    rechaza esa modificacion. Un punto no conforme no es una modificacion: es
    una condicion que hay que CORREGIR y VERIFICAR.

        RED LINE != ISSUE   (congelado por el propietario)
    """
    fuente = _rutas()
    assert 'import flujo_de_issue as iss' in fuente
    assert 'INSERT INTO doc_issues' in fuente
    assert 'iss.NO_CONFORMIDAD' in fuente
    # Y ya NO crea Red Lines.
    assert 'INSERT INTO doc_redlines' not in fuente, (
        'el Red Line no vuelve a usarse como contenedor generico de defectos')
    # Ni se inventa una tabla de defectos paralela.
    assert 'CREATE TABLE' not in fuente

def test_lo_ya_escalado_no_se_duplica():
    import flujo_de_protocolo as pro
    items = [{'resultado': 'No conforme', 'redline_id': '9'},
             {'resultado': 'No conforme'},
             {'resultado': 'Conforme'}]
    assert [n for n, _ in pro.items_a_escalar(items)] == [1]


def test_un_fallo_al_escalar_NO_tumba_la_firma_NI_SE_PIERDE():
    """El acta ya dice que hay un no conforme. Perder la firma por no poder
    crear un Red Line seria cambiar un problema pequeno por uno grande.

    PERO LA RESPONSABILIDAD TAMPOCO SE PIERDE: el fallo se escribe en el propio
    item, se audita, y aparece en la deuda operativa. Las seis condiciones
    completas viven en `test_gap03_generalizable_y_escalado.py`; aqui solo se
    fija que este manejador no volvio a la version que se lo tragaba.
    """
    cuerpo = _rutas().split('def _escalar')[1].split('\ndef ')[0]
    assert 'except Exception' in cuerpo
    assert 'logger.error' in cuerpo, 'un escalado fallido no es un aviso, es un error'
    assert "'escalado': 'ERROR'" in cuerpo, 'la deuda se escribe en el acta'
    assert 'ESCALATION_FAILED' in cuerpo, 'y se audita'


# ── LO QUE UN ITEM PUEDE EXIGIR ────────────────────────────────────────────

def test_un_no_conforme_sin_su_foto_no_se_firma():
    """Sin la foto, una no conformidad es la palabra de uno contra la de otro
    dentro de un ano."""
    import flujo_de_protocolo as pro
    faltan = pro.exigencias_incumplidas([
        {'resultado': 'No conforme', 'exige_si_no_conforme': ['foto'], 'fotos': []},
        {'resultado': 'No conforme', 'exige_si_no_conforme': ['foto'],
         'fotos': ['a.jpg']},
        {'resultado': 'Conforme', 'exige_si_no_conforme': ['foto'], 'fotos': []}])
    assert faltan == [(0, 'foto')], 'solo el no conforme SIN foto'


def test_la_exigencia_solo_aplica_al_no_conforme():
    """Pedir foto de todo lo que esta bien convierte el protocolo en un tramite
    que nadie completa."""
    import flujo_de_protocolo as pro
    assert pro.exigencias_incumplidas([
        {'resultado': 'Conforme', 'exige_si_no_conforme': ['foto', 'observacion']}]) == []


def test_el_manejador_no_firma_si_falta_evidencia():
    cuerpo = _rutas().split('def firmar')[1].split('\ndef ')[0]
    assert 'exigencias_incumplidas' in cuerpo
    assert 'FALTA_EVIDENCIA' in cuerpo


# ── LA PLANTILLA SE COPIA, NO SE REFERENCIA ────────────────────────────────

def test_el_acta_COPIA_los_puntos_de_la_plantilla():
    """Si solo la referenciara y la plantilla cambiara despues, un acta firmada
    diria haber comprobado puntos que en su dia no existian -- falsificar el
    pasado con buena intencion."""
    sql = _sql()
    assert 'protocolo_nombre' in sql and 'protocolo_version' in sql
    cuerpo = _rutas().split('def levantar_acta')[1].split('\ndef ')[0]
    assert "items.append({**i" in cuerpo, 'los puntos se copian al acta'


def test_borrar_la_plantilla_no_deja_el_acta_ilegible():
    """SET NULL y no RESTRICT: el acta ya guardo nombre y version, asi que no
    depende de la plantilla para seguir leyendose."""
    bloque = _sql().split('fk_actas_protocolo')[1].split('EXCEPTION')[0]
    assert 'ON DELETE SET NULL' in bloque


def test_el_autor_no_se_puede_borrar_dejando_la_firma_sin_firmante():
    bloque = _sql().split('fk_actas_autor')[1].split('EXCEPTION')[0]
    assert 'ON DELETE RESTRICT' in bloque


def test_un_tipo_de_punto_desconocido_no_se_acepta_en_silencio():
    """Se pintaria mal, se exportaria mal, y nadie lo notaria hasta que un acta
    con ese punto fuera a discutirse."""
    import routes.protocolos as rp
    secciones, malos = rp._normalizar_secciones(
        [{'nombre': 'A', 'items': [{'texto': 'x', 'tipo': 'holograma'},
                                   {'texto': 'y', 'tipo': 'conformidad'}]}])
    assert malos == ['holograma']
    assert len(secciones[0]['items']) == 1


def test_una_plantilla_desactivada_no_levanta_actas_nuevas():
    cuerpo = _rutas().split('def levantar_acta')[1].split('\ndef ')[0]
    assert 'PROTOCOLO_INACTIVO' in cuerpo


def test_una_plantilla_de_otra_obra_no_se_usa():
    cuerpo = _rutas().split('def levantar_acta')[1].split('\ndef ')[0]
    assert 'OTRA_OBRA' in cuerpo


# ── LA FIRMA ───────────────────────────────────────────────────────────────

def test_la_firma_es_una_identidad_y_no_un_nombre():
    """Un acta firmada por «Ing. Perez» en un proyecto con dos Perez no prueba
    quien firmo, y este documento existe para probarlo."""
    cuerpo = _rutas().split('def firmar')[1].split('\ndef ')[0]
    assert "'user_id': _usuario().get('id')" in cuerpo


def test_solo_quien_levanta_el_acta_la_firma():
    cuerpo = _rutas().split('def firmar')[1].split('\ndef ')[0]
    assert "_usuario().get('id') != a['autor_id']" in cuerpo
    assert 'NO_AUTOR' in cuerpo


def test_un_acta_firmada_no_se_edita():
    """Cambiar un resultado despues de la firma haria que la firma dijera algo
    distinto de lo que se firmo."""
    cuerpo = _rutas().split('def guardar_items')[1].split('\ndef ')[0]
    assert 'NO_EDITABLE' in cuerpo


def test_un_acta_no_liberada_no_se_reabre():
    """Se levanta con OTRA acta. Reabrir la misma borraria que hubo un rechazo."""
    import flujo_de_protocolo as pro
    assert pro.TRANSICIONES[pro.NO_LIBERADO] == ()
    assert pro.TRANSICIONES[pro.LIBERADO] == ()


# ── LA PELOTA ──────────────────────────────────────────────────────────────

def test_un_acta_a_medias_SI_es_deuda_de_quien_la_levanto():
    """Y un borrador de submittal NO lo es. La diferencia es real: un acta a
    medias esta bloqueando una actividad, un submittal en borrador no."""
    import encargos as enc
    uid, asunto, _ = enc.deudor_de_protocolo(
        None, (1, 'PL-001', 'Encofrado eje 4', 'Borrador', 7, None))
    assert uid == 7 and 'Completar y firmar' in asunto


def test_un_acta_con_veredicto_no_la_debe_nadie():
    import encargos as enc
    for estado in ('Liberado', 'No liberado', 'Anulada', 'Firmada'):
        uid, _, _ = enc.deudor_de_protocolo(None, (1, 'PL-001', 'x', estado, 7, None))
        assert uid is None, estado


def test_las_dos_mitades_llaman_a_la_MISMA_funcion():
    fuente = io.open(os.path.join(RAIZ, 'encargos.py'), encoding='utf-8').read()
    sigue = fuente.split("if tipo == 'PROTOCOLO':")[1].split('if tipo ==')[0]
    faltan = fuente.split('# Actas a medias')[1].split('# Emisiones')[0]
    assert 'deudor_de_protocolo' in sigue
    assert 'deudor_de_protocolo' in faltan


def test_el_tipo_esta_en_las_tres_listas():
    import encargos as enc
    assert 'PROTOCOLO' in enc.TIPOS
    assert enc._ORIGEN['PROTOCOLO'] == ('doc_actas', 'model_urn')
    assert 'PROTOCOLO' in dict(enc._CHECKS)['ck_encargos_tipo']


def test_el_manifiesto_congelado_conoce_el_tipo():
    """La leccion de la migracion 13: modificar un objeto que el manifiesto
    declara y no actualizarlo TUMBA EL ARRANQUE."""
    import re
    import encargos as enc
    manifiesto = io.open(os.path.join(RAIZ, 'esquema_objetos.txt'), encoding='utf-8').read()
    linea = next(l for l in manifiesto.splitlines()
                 if l.startswith('restriccion\tencargos check ((objeto_tipo'))
    assert set(re.findall(r"'([a-z]+)'::text", linea)) == {t.lower() for t in enc.TIPOS}


# ── LAS GUARDIAS Y LA HERRAMIENTA ──────────────────────────────────────────

def test_toda_ruta_sobre_un_acta_pasa_por_la_guardia():
    import re
    fuente = _rutas()
    manejadores = re.findall(
        r"@protocolos_bp\.route\('([^']*)'[^)]*\)\s*\ndef (\w+)\(([^)]*)\):(.*?)(?=\n@|\Z)",
        fuente, re.S)
    sin = [n for _r, n, args, cuerpo in manejadores
           if 'aid' in args and 'guardia_de_recurso' not in cuerpo]
    assert not sin, 'rutas sobre un acta sin guardia: %s' % sin


def test_la_tabla_esta_declarada_en_RECURSOS():
    import perimetro_de_obra as per
    assert per.RECURSOS['doc_actas'] == ('id', 'model_urn')


def test_la_herramienta_existe_y_gobierna_su_ruta():
    import herramientas_de_obra as hdo
    assert 'protocolos' in hdo.CODIGOS
    assert hdo.herramienta_de_ruta('/api/protocolos/actas/3/firmar') == 'protocolos'


def test_un_acta_se_puede_clavar_en_un_plano():
    """GAP 02 dio la capacidad; aqui solo se admite el tipo. Un acta se levanta
    EN UN SITIO, y ese sitio suele estar en un plano."""
    sql = _sql()
    assert "ck_anclaje_tipo" in sql
    assert "'PROTOCOLO'" in sql.split('plano_anclajes')[1]
