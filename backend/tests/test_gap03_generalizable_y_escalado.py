# -*- coding: utf-8 -*-
"""GAP 03 · LAS DOS COMPROBACIONES EXIGIDAS ANTES DE DECLARAR COMPLETE.

  1. EL MOTOR ES GENERALIZABLE — no es un modulo hardcodeado a concreto.
     TEMPLATE define el tipo; ACTA es su instantanea inmutable; y el mismo
     motor representa protocolos de obra distintos SIN tocar backend.

  2. NO CONFORMIDAD SIN RED LINE — la firma no se revierte, pero la
     responsabilidad tampoco se pierde en silencio.
"""
import inspect
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _rutas():
    return io.open(os.path.join(RAIZ, 'routes', 'protocolos.py'), encoding='utf-8').read()


def _escalar_fuente():
    return _rutas().split('def _escalar')[1].split('\ndef ')[0]


def _solo_codigo(texto, marca='#'):
    """El código, sin literales triples ni comentarios.

    Hace falta porque los docstrings de este proyecto EXPLICAN los defectos que
    corrigen —con su nombre y sus ejemplos—, y una prueba que los leyera
    fallaría justo por lo que hace bueno al código.
    """
    import re as _re
    sin = _re.sub(r'(?s)"""[\s\S]*?"""', '', texto)
    sin = _re.sub(r"(?s)'''[\s\S]*?'''", '', sin)
    # También los comentarios AL FINAL de línea: el esquema usa
    # `ubicacion TEXT,  -- «Losa eje 4»` para explicarse, y eso es comentario,
    # no código. Quitar solo las líneas que EMPIEZAN por la marca los dejaba.
    sin = _re.sub(r'%s.*$' % _re.escape(marca), '', sin, flags=_re.M)
    return sin


# ══ COMPROBACION 1 · GENERALIZABLE ═════════════════════════════════════════

def test_ni_una_palabra_de_concreto_en_el_motor():
    """Si el motor conociera el hormigon, seria un modulo de hormigon.

    Se miran solo las lineas de CODIGO: los comentarios pueden --y deben--
    usar ejemplos concretos para explicarse.
    """
    for fichero in ('flujo_de_protocolo.py', 'routes/protocolos.py',
                    'sql/15_gap03_protocolos.sql'):
        fuente = io.open(os.path.join(RAIZ, fichero), encoding='utf-8').read()
        marca = '--' if fichero.endswith('.sql') else '#'
        cuerpo = _solo_codigo(fuente, marca).lower()
        for palabra in ('concreto', 'hormigon', 'encofrado', 'acero', 'vaciado',
                        'slump', 'fraguado', 'losa'):
            assert palabra not in cuerpo, (
                '%s usa «%s» en codigo: el motor estaria atado a un tipo de obra'
                % (fichero, palabra))


def test_el_mismo_motor_representa_protocolos_MUY_DISTINTOS():
    """Cuatro protocolos reales de obra que no se parecen en nada, sobre el
    mismo motor, sin tocar una linea de backend."""
    import routes.protocolos as rp
    catalogo = {
        'liberacion de encofrado': [
            {'nombre': 'Geometria', 'items': [
                {'texto': 'Escuadria conforme a plano', 'tipo': 'conformidad',
                 'exige_si_no_conforme': ['foto']},
                {'texto': 'Recubrimiento (cm)', 'tipo': 'numero'}]}],
        'prueba hidraulica de tuberia': [
            {'nombre': 'Ensayo', 'items': [
                {'texto': 'Presion de prueba (bar)', 'tipo': 'numero'},
                {'texto': 'Sin fugas a los 30 min', 'tipo': 'conformidad',
                 'exige_si_no_conforme': ['foto', 'observacion']},
                {'texto': 'Fecha del ensayo', 'tipo': 'fecha'}]}],
        'inspeccion de seguridad': [
            {'nombre': 'EPP', 'items': [
                {'texto': 'Casco y barbiquejo', 'tipo': 'conformidad'},
                {'texto': 'Nivel de riesgo', 'tipo': 'opcion',
                 'opciones': ['Bajo', 'Medio', 'Alto']}]}],
        'recepcion de material en almacen': [
            {'nombre': 'Documentacion', 'items': [
                {'texto': 'Guia de remision', 'tipo': 'conformidad'},
                {'texto': 'Certificado de calidad', 'tipo': 'conformidad',
                 'exige_si_no_conforme': ['observacion']},
                {'texto': 'Observaciones del almacenero', 'tipo': 'texto'}]}],
    }
    for nombre, secciones in catalogo.items():
        norm, malos = rp._normalizar_secciones(secciones)
        assert not malos, '%s uso un tipo no soportado: %s' % (nombre, malos)
        assert sum(len(s['items']) for s in norm) == \
               sum(len(s['items']) for s in secciones), nombre


def test_los_cinco_tipos_de_respuesta_cubren_los_cuatro_protocolos():
    """Y son una lista CERRADA: cada tipo nuevo hay que saber pintarlo,
    validarlo, exportarlo y compararlo dentro de dos anos."""
    import flujo_de_protocolo as pro
    assert set(pro.CODIGOS_TIPO) == {'conformidad', 'texto', 'numero', 'fecha', 'opcion'}


def test_el_acta_es_INSTANTANEA_y_no_referencia_viva():
    """TEMPLATE define el tipo; ACTA lo congela. Si el acta leyera la plantilla
    al vuelo, editarla cambiaria el pasado de todas las actas ya firmadas."""
    fuente = _rutas()
    cuerpo = fuente.split('def levantar_acta')[1].split('\ndef ')[0]
    assert 'items.append({**i' in cuerpo, 'los puntos se COPIAN al acta'
    assert 'protocolo_nombre' in cuerpo and 'protocolo_version' in cuerpo
    # Y ninguna LECTURA de acta vuelve a mirar la plantilla.
    lectura = fuente.split('def _fila')[1].split('\ndef ')[0]
    assert 'doc_protocolos' not in lectura
    assert 'protocolo_id' not in fuente.split('def guardar_items')[1].split('\ndef ')[0]


def test_el_veredicto_solo_mira_ITEMS_no_el_tipo_de_protocolo():
    """La regla de liberacion es la misma para un encofrado y para una prueba
    hidraulica: deciden los resultados, no de que va el protocolo."""
    import flujo_de_protocolo as pro
    cuerpo = inspect.getsource(pro.veredicto_que_corresponde)
    cuerpo = cuerpo.split('"""')[2] if '"""' in cuerpo else cuerpo
    for atado in ('protocolo', 'disciplina', 'nombre'):
        assert atado not in cuerpo, (
            'el veredicto mira «%s»: estaria atado al tipo de protocolo' % atado)


# ══ COMPROBACION 2 · NO CONFORMIDAD SIN RED LINE ═══════════════════════════

def test_cada_item_se_escala_en_SU_PROPIO_savepoint():
    """LA PRIMERA VERSION envolvia TODOS los items en un solo `try`: si el
    item 2 fallaba, los items 3 en adelante NI SE INTENTABAN."""
    cuerpo = _solo_codigo(_escalar_fuente())
    assert 'SAVEPOINT escalado_item' in cuerpo
    assert cuerpo.index('for n, item') < cuerpo.index('try:'), (
        'el try tiene que estar DENTRO del bucle, no envolviendolo')


def test_un_fallo_NO_descarta_los_red_lines_ya_creados():
    """LA PRIMERA VERSION hacia `conn.rollback()` al fallar y se llevaba por
    delante los Red Lines que SI se habian creado."""
    cuerpo = _solo_codigo(_escalar_fuente())
    assert 'ROLLBACK TO SAVEPOINT escalado_item' in cuerpo
    hasta_guardar = cuerpo[:cuerpo.index('if hubo_cambio')]
    assert 'conn.rollback()' not in hasta_guardar, (
        'un rollback global antes de guardar perderia lo ya conseguido')


def test_el_fallo_queda_ESCRITO_EN_EL_ACTA_no_solo_en_el_log():
    """Un fallo que solo va al log es un fallo que nadie vera: el log lo lee
    quien ya sospecha algo."""
    cuerpo = _escalar_fuente()
    assert "'escalado': 'ERROR'" in cuerpo
    assert "'escalado_error': ultimo_error" in cuerpo
    assert "'escalado_intentos'" in cuerpo


def test_el_fallo_queda_AUDITADO():
    """Que el escalado falle ES un hecho del expediente: alguien tiene que
    poder ver que la obra quedo con una no conformidad sin reclamar."""
    cuerpo = _escalar_fuente()
    assert "'ESCALATION_FAILED'" in cuerpo and 'log_activity' in cuerpo


def test_el_reintento_es_IDEMPOTENTE():
    """Llamar a /escalar diez veces no puede crear diez Red Lines."""
    import flujo_de_protocolo as pro
    items = [{'resultado': 'No conforme', 'redline_id': 'abc'},
             {'resultado': 'No conforme', 'escalado': 'ERROR'},
             {'resultado': 'Conforme'}]
    assert [n for n, _ in pro.items_a_escalar(items)] == [1]


def test_solo_se_considera_CONCILIADO_con_red_line_id():
    """El estado 'ERROR' explica por que fallo; su ausencia no absuelve a nadie."""
    cuerpo = _rutas().split('def deuda_de_escalado')[1].split('\ndef ')[0]
    assert "not (i or {}).get('redline_id')" in cuerpo
    assert "'conciliado': not deuda" in cuerpo


def test_la_deuda_es_VISIBLE_como_lista_operativa():
    fuente = _rutas()
    assert '/deuda-escalado' in fuente
    cuerpo = fuente.split('def deuda_de_escalado')[1].split('\ndef ')[0]
    assert "estado = 'No liberado'" in cuerpo
    assert 'total_puntos' in cuerpo


def test_cada_acta_dice_cuanta_deuda_arrastra():
    cuerpo = _rutas().split('def _fila')[1].split('\ndef ')[0]
    assert 'escalado_pendiente' in cuerpo and 'escalado_con_error' in cuerpo


def test_la_firma_se_CONFIRMA_antes_de_intentar_escalar():
    """Asi un fallo de escalado no puede arrastrarla. Y el fallo se DEVUELVE
    en la respuesta, no se calla."""
    cuerpo = _rutas().split('def firmar')[1].split('\ndef ')[0]
    assert cuerpo.index('conn.commit()') < cuerpo.index('_escalar(')
    assert 'escalado_fallido' in cuerpo


def test_el_red_line_hereda_responsable_y_plazo_del_acta():
    """Un Red Line sin responsable ni plazo es una observacion que nadie debe."""
    cuerpo = _escalar_fuente()
    assert "a['responsable_id']" in cuerpo
    assert "a['vence_en']" in cuerpo


# ── LA QUE SE ESCAPO, Y QUE LA CONCILIACION ENCONTRO ──────────────────────

def test_solo_un_ADMINISTRADOR_DE_OBRA_define_un_protocolo():
    """La plantilla es LO QUE LA SUPERVISION EXIGE COMPROBAR.

    Si cualquier miembro pudiera crearla, el contratista estaria definiendo los
    criterios con los que se le inspecciona a el mismo — y el acta dejaria de
    probar nada aunque todos sus puntos salieran conformes.

    El fabricante enuncia la misma regla («you must be a project administrator
    to create form templates»); aqui tiene una razon mas fuerte, porque el
    protocolo AUTORIZA O IMPIDE una actividad.
    """
    cuerpo = _rutas().split('def crear_plantilla')[1].split('\ndef ')[0]
    assert 'guardia_administrativa' in cuerpo, (
        'cualquier miembro podria definir el protocolo con el que se le inspecciona')


def test_levantar_un_acta_NO_exige_ser_administrador():
    """Quien va a campo a comprobar es el inspector, no el administrador.
    Confundir las dos cosas dejaria las liberaciones paradas."""
    cuerpo = _rutas().split('def levantar_acta')[1].split('\ndef ')[0]
    assert 'guardia_administrativa' not in cuerpo
    assert 'guardia_de_obra' in cuerpo


def test_el_escalado_ABRE_LA_PELOTA_del_issue():
    """LO QUE LA EXP ENCONTRO: el objeto escalado nacia con responsable y SIN
    encargo. Desde el 25-ago-2026 el escalado crea un ISSUE, no un Red Line.

    Un Red Line con responsable pero sin encargo existe y NADIE LO DEBE: no
    aparece en «lo que me toca», asi que nadie lo mira hasta que alguien lo
    busca. La conciliacion lo repararia mas tarde, pero «mas tarde» no es
    «genera BIC» -- entre medias hay una no conformidad de obra sin nadie
    encima.
    """
    cuerpo = _escalar_fuente()
    assert "_enc.abrir(cur, 'ISSUE', iid" in cuerpo
    assert "destino_usuario=a['responsable_id']" in cuerpo
    assert "vence_en=a['vence_en']" in cuerpo, 'el plazo del acta viaja al encargo'


def test_un_fallo_de_encargo_no_pierde_el_issue():
    """El error contrario: perder el issue por no poder abrir su encargo.
    El issue ya existe y la conciliacion recogera el encargo."""
    cuerpo = _escalar_fuente()
    trozo = cuerpo.split("_enc.abrir(cur, 'ISSUE'")[0][-400:]
    assert 'try:' in trozo, 'el encargo tiene que ir en su propio try'
