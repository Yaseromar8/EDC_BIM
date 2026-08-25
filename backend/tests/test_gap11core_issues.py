# -*- coding: utf-8 -*-
"""GAP 11 · CORE · ISSUE  ·  y GAP 04 · PUNCH, que es `ISSUE(tipo=PUNCH)`.

LO QUE ESTE FICHERO PROTEGE, EN UNA FRASE: que «verificado» signifique que
alguien DISTINTO del que corrigió fue a comprobarlo.

De ahí sale la invariante dura, comprobada en tres sitios —semántica, manejador
y base— igual que en los gaps anteriores:

    QUIEN CORRIGE NO VERIFICA SU PROPIA CORRECCIÓN
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _sql():
    return io.open(os.path.join(RAIZ, 'sql', '16_gap11core_issues.sql'),
                   encoding='utf-8').read()


def _rutas():
    return io.open(os.path.join(RAIZ, 'routes', 'issues.py'), encoding='utf-8').read()


# ══ LA SEMANTICA CONGELADA ═════════════════════════════════════════════════

def test_RED_LINE_NO_ES_ISSUE():
    """Congelado por el propietario el 25-ago-2026 tras la auditoria del doc 86.

        RED LINE = modificacion / croquis de cambio de proyecto
        ISSUE    = condicion detectada que exige correccion + verificacion

    El Red Line NUNCA vuelve a usarse como contenedor generico de defectos.
    """
    import flujo_de_issue as iss
    import flujo_de_redline as rl
    assert iss.SEMANTICA.clave == 'ISSUE'
    assert rl.SEMANTICA.clave == 'REDLINE'
    assert iss.SEMANTICA.tabla != rl.SEMANTICA.tabla
    assert iss.SEMANTICA.prefijo != rl.SEMANTICA.prefijo
    # Y el issue NO importa nada del red line: son objetos independientes.
    fuente = io.open(os.path.join(RAIZ, 'flujo_de_issue.py'), encoding='utf-8').read()
    codigo = '\n'.join(l for l in fuente.split('\n') if not l.strip().startswith('#'))
    assert 'flujo_de_redline' not in codigo


def test_los_cuatro_tipos_son_una_lista_CERRADA():
    """Configurarlos es GAP 11 GRANDE, y ese no se declara COMPLETE hoy."""
    import flujo_de_issue as iss
    assert set(iss.CODIGOS_TIPO) == {'PUNCH', 'NO_CONFORMIDAD', 'CALIDAD', 'SEGURIDAD'}
    assert 'ck_issues_tipo' in _sql()


def test_el_ciclo_es_detectar_corregir_verificar():
    import flujo_de_issue as iss
    assert iss.ESTADOS == ('Abierto', 'Corregido', 'Verificado', 'Reabierto', 'Anulado')
    assert iss.TRANSICIONES['Abierto'] == ('Corregido', 'Anulado')
    assert iss.TRANSICIONES['Corregido'] == ('Verificado', 'Reabierto')
    assert iss.TRANSICIONES['Reabierto'] == ('Corregido', 'Anulado')
    # Verificado es terminal: un defecto nuevo es un issue nuevo.
    assert iss.TRANSICIONES['Verificado'] == ()


# ══ LA INVARIANTE DEL OBJETO ═══════════════════════════════════════════════

def test_quien_corrige_NO_verifica_su_propia_correccion():
    """LA REGLA QUE GOBIERNA EL OBJETO ENTERO.

    Sin ella «verificado» significa «el responsable dice que ya esta», que es lo
    mismo que no verificar.
    """
    import flujo_de_issue as iss
    d = {'autor_id': 1, 'responsable_id': 2, 'autoverificacion': False}
    puede, motivo = iss.puede_verificar({'id': 2}, d)
    assert not puede
    assert 'no verifica su propia' in motivo


def test_verifica_quien_detecto_o_un_admin_de_obra():
    import flujo_de_issue as iss
    d = {'autor_id': 1, 'responsable_id': 2, 'autoverificacion': False}
    assert iss.puede_verificar({'id': 1}, d)[0], 'quien detecto'
    assert iss.puede_verificar({'id': 9}, d, es_admin_de_obra=True)[0], 'admin de obra'
    assert not iss.puede_verificar({'id': 9}, d)[0], 'un tercero cualquiera NO'


def test_la_excepcion_de_autoverificacion_FUNCIONA_de_verdad():
    """DEFECTO QUE ESTA PRUEBA NACE PARA IMPEDIR: la primera version comprobaba
    «detector o admin» ANTES que la excepcion, asi que un responsable que no
    fuera ninguna de las dos cosas quedaba bloqueado igual -- y la autorizacion
    no autorizaba nada."""
    import flujo_de_issue as iss
    d = {'autor_id': 1, 'responsable_id': 2, 'autoverificacion': True}
    puede, _ = iss.puede_verificar({'id': 2}, d)
    assert puede, 'con la excepcion concedida, el corrector SI puede verificar'


def test_la_base_TAMBIEN_impide_autoverificar():
    """Una regla que solo vive en Python la salta cualquier script."""
    sql = _sql()
    assert 'ck_issues_verificador_distinto' in sql
    assert 'verificado_por <> responsable_id' in sql
    assert 'OR autoverificacion' in sql


def test_la_excepcion_exige_motivo_y_quien_la_concedio():
    """Una excepcion que se puede leer es gobierno; una que se concede en
    silencio es un agujero."""
    sql = _sql()
    assert 'ck_issues_autoverificacion_justificada' in sql
    assert "coalesce(autoverificacion_motivo,'') <> ''" in sql
    assert 'autoverificacion_por IS NOT NULL' in sql


def test_el_responsable_no_puede_autoautorizarse():
    cuerpo = _rutas().split('def permitir_autoverificacion')[1].split('\ndef ')[0]
    assert 'NO_SE_AUTOAUTORIZA' in cuerpo
    assert 'guardia_administrativa' in cuerpo


def test_corrige_el_RESPONSABLE_y_nadie_mas():
    """Ni el administrador: estaria firmando por otro que algo se arreglo."""
    import flujo_de_issue as iss
    d = {'autor_id': 1, 'responsable_id': 2}
    assert iss.puede_corregir({'id': 2}, d)
    assert not iss.puede_corregir({'id': 1}, d)
    assert not iss.puede_corregir({'id': 99}, d)


# ══ EVIDENCIA ══════════════════════════════════════════════════════════════

def test_declarar_corregido_exige_evidencia():
    """Un «ya esta arreglado» sin prueba obliga al verificador a ir a mirar, y
    cuando la obra avanzo encima puede ser imposible."""
    import flujo_de_issue as iss
    assert iss.falta_evidencia_de_correccion({'evidencia_correccion': []})
    assert not iss.falta_evidencia_de_correccion({'evidencia_correccion': [{'n': 'f.jpg'}]})
    cuerpo = _rutas().split('def corregir')[1].split('\ndef ')[0]
    assert 'SIN_EVIDENCIA' in cuerpo


def test_la_base_exige_evidencia_para_corregido_y_verificado():
    sql = _sql()
    assert 'ck_issues_corregido_con_evidencia' in sql
    assert 'jsonb_array_length(evidencia_correccion) > 0' in sql


def test_verificado_exige_verificador():
    """Un cierre sin quien lo firme no prueba nada."""
    sql = _sql()
    assert 'ck_issues_verificado_con_verificador' in sql


# ══ UBICACION HISTORICA ════════════════════════════════════════════════════

def test_la_revision_del_plano_es_la_del_NACIMIENTO_y_no_se_reapunta():
    """Un punch se levanto mirando UNA lamina concreta. Cuando esa revision
    quede superada tiene que seguir diciendo sobre cual se levanto: si se
    pudiera reapuntar, la historia del defecto cambiaria cada vez que se emite
    un plano nuevo."""
    sql = _sql()
    assert 'revision_id     BIGINT' in sql
    assert 'fk_issues_revision' in sql
    bloque = sql.split('fk_issues_revision')[1].split('EXCEPTION')[0]
    assert 'ON DELETE RESTRICT' in bloque, (
        'la lamina no puede desaparecer dejando el issue sin referencia historica')
    # Y ninguna ruta la cambia despues de crear.
    fuente = _rutas()
    for manejador in ('def corregir', 'def verificar', 'def anular'):
        cuerpo = fuente.split(manejador)[1].split('\ndef ')[0]
        assert 'revision_id' not in cuerpo, (
            '%s toca la referencia historica al plano' % manejador)


def test_la_coordenada_NO_se_duplica_en_el_issue():
    """Vive en `plano_anclajes` (GAP 02), que es donde ya se clavan los
    registros sobre una lamina. Dos columnas x/y aqui serian una segunda fuente
    de verdad para la misma pregunta."""
    sql = _sql()
    cuerpo = sql.split('CREATE TABLE IF NOT EXISTS doc_issues')[1].split(');')[0]
    for col in ('    x ', '    y ', 'pagina'):
        assert col not in cuerpo, 'la coordenada no se guarda en doc_issues'
    # El tipo ISSUE sí se admite en la tabla de anclajes, que es donde va.
    # Se mira el ADD CONSTRAINT, no el DROP que va justo antes.
    definicion = sql.split('ADD CONSTRAINT ck_anclaje_tipo')[1][:220]
    assert "'ISSUE'" in definicion


def test_un_PUNCH_exige_ubicacion_y_responsable():
    """Un punch sin decir donde no se puede ir a corregir; y sin responsable es
    un defecto que nadie va a corregir."""
    import flujo_de_issue as iss
    assert iss.PUNCH in iss.EXIGEN_UBICACION
    assert iss.PUNCH in iss.EXIGEN_RESPONSABLE
    cuerpo = _rutas().split('def crear')[1].split('\ndef ')[0]
    assert 'SIN_UBICACION' in cuerpo and 'SIN_RESPONSABLE' in cuerpo


def test_una_observacion_de_calidad_NO_exige_ubicacion():
    """Se levanta antes de saber exactamente donde, y obligar a decirlo haria
    que no se levantara."""
    import flujo_de_issue as iss
    assert iss.CALIDAD not in iss.EXIGEN_UBICACION
    assert iss.SEGURIDAD not in iss.EXIGEN_RESPONSABLE


# ══ LA PELOTA CAMBIA DE MANOS CON EL CICLO ═════════════════════════════════

def test_la_pelota_sigue_al_ciclo():
    """Que en `Corregido` la deuda pase al detector es lo que impide que un
    issue se quede parado: sin eso, el responsable declara corregido y el
    defecto desaparece de todas las bandejas sin que nadie lo compruebe."""
    import encargos as enc
    fila = lambda est: (1, 'ISS-001', 'Fisura', est, 5, 9, None)
    assert enc.deudor_de_issue(None, fila('Abierto'))[0] == 9, 'corrige el responsable'
    assert enc.deudor_de_issue(None, fila('Reabierto'))[0] == 9, 'vuelve al responsable'
    assert enc.deudor_de_issue(None, fila('Corregido'))[0] == 5, 'verifica el detector'
    for cerrado in ('Verificado', 'Anulado'):
        assert enc.deudor_de_issue(None, fila(cerrado))[0] is None, cerrado


def test_las_dos_mitades_llaman_a_la_MISMA_funcion():
    fuente = io.open(os.path.join(RAIZ, 'encargos.py'), encoding='utf-8').read()
    sigue = fuente.split("if tipo == 'ISSUE':")[1].split('if tipo ==')[0]
    faltan = fuente.split('# Issues vivos')[1].split('# Actas a medias')[0]
    assert 'deudor_de_issue' in sigue and 'deudor_de_issue' in faltan


def test_el_tipo_esta_en_las_tres_listas():
    import encargos as enc
    assert 'ISSUE' in enc.TIPOS
    assert enc._ORIGEN['ISSUE'] == ('doc_issues', 'model_urn')
    assert 'ISSUE' in dict(enc._CHECKS)['ck_encargos_tipo']


def test_el_manifiesto_congelado_conoce_el_tipo():
    """La leccion de la migracion 13: modificar un objeto que el manifiesto
    declara sin actualizarlo TUMBA EL ARRANQUE."""
    import re
    import encargos as enc
    manifiesto = io.open(os.path.join(RAIZ, 'esquema_objetos.txt'), encoding='utf-8').read()
    linea = next(l for l in manifiesto.splitlines()
                 if l.startswith('restriccion\tencargos check ((objeto_tipo'))
    assert set(re.findall(r"'([a-z_]+)'::text", linea)) == {t.lower() for t in enc.TIPOS}


# ══ EL PUNCH NO ES UNA TABLA PARALELA ══════════════════════════════════════

def test_el_punch_es_un_TIPO_y_no_un_objeto_aparte():
    """Doc 86 §4: construirlo aparte habria dejado tres tablas con el mismo
    ciclo de vida que hay que unificar despues con datos ya escritos."""
    import flujo_de_issue as iss
    assert iss.PUNCH in iss.CODIGOS_TIPO
    # No existe ninguna tabla de punch.
    for fichero in os.listdir(os.path.join(RAIZ, 'sql')):
        sql = io.open(os.path.join(RAIZ, 'sql', fichero), encoding='utf-8').read().lower()
        assert 'create table if not exists doc_punch' not in sql
        assert 'create table if not exists punch' not in sql


# ══ LAS GUARDIAS ═══════════════════════════════════════════════════════════

def test_toda_ruta_sobre_un_issue_pasa_por_la_guardia():
    import re
    fuente = _rutas()
    manejadores = re.findall(
        r"@issues_bp\.route\('([^']*)'[^)]*\)\s*\ndef (\w+)\(([^)]*)\):(.*?)(?=\n@|\Z)",
        fuente, re.S)
    sin = [n for _r, n, args, cuerpo in manejadores
           if 'iid' in args and 'guardia_de_recurso' not in cuerpo]
    assert not sin, 'rutas sobre un issue sin guardia: %s' % sin


def test_la_tabla_esta_declarada_en_RECURSOS():
    import perimetro_de_obra as per
    assert per.RECURSOS['doc_issues'] == ('id', 'model_urn')


def test_una_revision_de_otra_obra_no_se_puede_anclar():
    cuerpo = _rutas().split('def crear')[1].split('\ndef ')[0]
    assert 'OTRA_OBRA' in cuerpo


def test_el_responsable_tiene_que_ser_miembro_de_la_obra():
    cuerpo = _rutas().split('def crear')[1].split('\ndef ')[0]
    assert 'RESPONSABLE_NO_MIEMBRO' in cuerpo


def test_no_hay_ninguna_ruta_que_escriba_el_estado_a_mano():
    """Cada transicion es UN ACTO con su propia autoridad. Un `PATCH estado`
    habria dejado el ciclo en manos de quien llame."""
    fuente = _rutas()
    assert "methods=['PATCH']" not in fuente
    for prohibido in ("data.get('estado')", "data.get('nuevo_estado')"):
        assert prohibido not in fuente


def test_la_herramienta_existe_y_gobierna_su_ruta():
    import herramientas_de_obra as hdo
    assert 'issues' in hdo.CODIGOS
    assert hdo.herramienta_de_ruta('/api/issues/7/verificar') == 'issues'
