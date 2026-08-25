# -*- coding: utf-8 -*-
"""GAP 02 · EL PLANO COMO OBJETO.

LO QUE ESTE FICHERO PROTEGE, EN UNA FRASE: que en obra nadie construya contra
un plano superado sin saberlo.

De ahi salen las dos invariantes duras:
  1. UNA SOLA revision vigente por plano, garantizada por la BASE.
  2. Superar NO borra: la superada se conserva entera y sigue siendo consultable.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _sql():
    return io.open(os.path.join(RAIZ, 'sql', '14_gap02_planos.sql'),
                   encoding='utf-8').read()


def _rutas():
    return io.open(os.path.join(RAIZ, 'routes', 'planos.py'), encoding='utf-8').read()


# ── LA IDENTIDAD ───────────────────────────────────────────────────────────

def test_el_numero_de_plano_es_una_identidad_normalizada():
    """'pl-est-104', 'PL-EST-104 ' y 'PL EST 104' no pueden ser tres planos."""
    import planos_de_obra as pl
    for entrada in (' pl est 104 ', 'PL-EST-104', 'pl_est_104', 'PL  EST  104'):
        assert pl.normalizar_numero(entrada) == 'PL-EST-104', entrada
    assert pl.normalizar_numero('') == ''
    assert pl.normalizar_numero(None) == ''


def test_el_numero_es_unico_por_obra():
    assert 'idx_planos_numero_obra' in _sql()
    assert 'ON doc_planos(project_id, numero)' in _sql()


def test_la_disciplina_es_una_lista_cerrada():
    """Texto libre convertiria el filtro por disciplina en un adorno: 'EST',
    'Estructuras' y 'ESTRUCT.' serian tres disciplinas distintas."""
    import planos_de_obra as pl
    assert len(pl.DISCIPLINAS) == 9
    assert 'EST' in pl.CODIGOS_DISCIPLINA
    assert pl.etiqueta_disciplina('EST') == 'Estructuras'
    # Y la base la vigila tambien, no solo Python.
    assert 'ck_planos_disciplina' in _sql()


# ── LA INVARIANTE DURA ─────────────────────────────────────────────────────

def test_una_sola_revision_vigente_por_plano_LO_GARANTIZA_LA_BASE():
    """LA INVARIANTE DE ESTE GAP.

    Dos vigentes significa gente construyendo contra soportes distintos sin que
    nadie lo sepa. No se confia en que el codigo lo respete: hay un indice unico
    PARCIAL, que es la unica forma de expresar «una sola de las que cumplen esta
    condicion» en PostgreSQL.
    """
    sql = _sql()
    assert 'idx_plano_una_sola_vigente' in sql
    assert "ON doc_plano_revisiones(plano_id) WHERE estado = 'Vigente'" in sql


def test_superar_exige_decir_cuando():
    """Sin fecha, «superada» es una etiqueta que no permite reconstruir que se
    miraba en una fecha dada -- que es justo para lo que sirve."""
    sql = _sql()
    assert 'ck_plano_rev_superada_con_fecha' in sql
    assert "estado <> 'Superada' OR superada_en IS NOT NULL" in sql


def test_superar_y_emitir_ocurren_en_la_misma_transaccion():
    """Si se escribiera la nueva vigente antes de superar la anterior habria un
    instante con DOS vigentes; y si el proceso muriera ahi, seria permanente."""
    fuente = _rutas()
    cuerpo = fuente.split('def emitir_revision')[1].split('\ndef ')[0]
    i_superar = cuerpo.index("SET estado='Superada'")
    i_insertar = cuerpo.index('INSERT INTO doc_plano_revisiones')
    assert i_superar < i_insertar, 'hay que superar la anterior ANTES de insertar'
    assert cuerpo.count('conn.commit()') == 1, 'un solo commit: las dos cosas o ninguna'


def test_la_superada_conserva_a_quien_la_sustituyo():
    assert 'superada_por_id' in _sql()
    assert 'superada_por_id' in _rutas()


# ── NO SE CREA UN SEGUNDO ALMACEN ──────────────────────────────────────────

def test_la_revision_apunta_al_fichero_y_no_lo_copia():
    """LO MAS IMPORTANTE DEL DISENO. Si el plano copiara el PDF habria dos
    fuentes de verdad y dos reglas de permiso que mantener sincronizadas.
    Apuntando, el permiso de recurso SE HEREDA y capa 09 sigue siendo la unica
    autoridad sobre quien alcanza que documento."""
    sql = _sql()
    assert 'file_node_id     UUID        NOT NULL' in sql
    assert 'fk_plano_rev_nodo' in sql
    # Y no hay ninguna columna donde meter bytes.
    for prohibido in ('contenido', 'blob', 'bytea', 'gcs_urn'):
        assert prohibido not in sql.lower().split('plano_anclajes')[0], (
            'doc_plano_revisiones no puede almacenar el fichero: %s' % prohibido)


def test_el_nodo_no_se_puede_borrar_dejando_una_revision_sin_soporte():
    """RESTRICT y no CASCADE: borrar el fichero al que apunta una revision
    emitida dejaria el expediente diciendo que existe un soporte que no existe."""
    sql = _sql()
    bloque = sql.split('fk_plano_rev_nodo')[1].split('EXCEPTION')[0]
    assert 'ON DELETE RESTRICT' in bloque


# ── EL CAJETIN SUGIERE, NO MANDA ───────────────────────────────────────────

def test_el_cajetin_devuelve_sugerencias_y_dice_si_no_habia_texto():
    """Un plano ESCANEADO no tiene capa de texto. Se dice, en vez de fingir que
    la lectura funciona siempre."""
    import planos_de_obra as pl
    r = pl.leer_cajetin(b'no soy un pdf')
    assert set(r) >= {'numero', 'revision', 'titulo', 'tiene_texto'}
    assert r['tiene_texto'] is False
    assert r['numero'] is None


def test_lo_que_el_manejador_importa_EXISTE_de_verdad():
    """EL DEFECTO QUE ESTA PRUEBA NACE PARA IMPEDIR, encontrado por la EXP en
    producción el 25-ago-2026:

        POST /api/planos/leer-cajetin  ->  501 SIN_LECTOR

    El manejador importaba `descargar_bytes` de `gcs_manager` — un nombre que
    me inventé sin comprobarlo. El import fallaba, el `except ImportError` lo
    convertía en un 501 educado, y la lectura de cajetín quedaba MUERTA sin
    que nada lo delatara: ni la suite, porque no carga ese módulo, ni el
    usuario, porque el mensaje parecía una limitación del despliegue.

    UN `except ImportError` QUE DEVUELVE UNA RESPUESTA AMABLE ES UN SITIO
    PERFECTO PARA QUE UN ERROR DE ESCRITURA VIVA PARA SIEMPRE. Por eso se
    comprueba el símbolo contra el módulo real, sin importarlo.
    """
    import ast
    import re
    fuente = _rutas()
    modulos = {}
    for m in re.finditer(r'from\s+(\w+)\s+import\s+([\w, ]+)', fuente):
        modulos.setdefault(m.group(1), set()).update(
            s.strip() for s in m.group(2).split(','))
    faltan = []
    for modulo, simbolos in modulos.items():
        camino = os.path.join(RAIZ, modulo + '.py')
        if not os.path.exists(camino):
            continue                      # de terceros o de un paquete
        arbol = ast.parse(io.open(camino, encoding='utf-8').read())
        definidos = {n.name for n in ast.walk(arbol)
                     if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}
        definidos |= {t.id for n in ast.walk(arbol) if isinstance(n, ast.Assign)
                      for t in n.targets if isinstance(t, ast.Name)}
        for s in simbolos:
            if s and s not in definidos:
                faltan.append('%s.%s' % (modulo, s))
    assert not faltan, (
        'el manejador importa símbolos que NO existen: %s\n'
        'Un `except ImportError` los convertiría en un error educado y la '
        'funcionalidad quedaría muerta sin que nadie lo notara.' % faltan)


def test_la_lectura_del_cajetin_nunca_escribe_nada():
    """Es una sugerencia para una persona, no una fuente de datos."""
    fuente = _rutas()
    cuerpo = fuente.split('def leer_cajetin')[1].split('\ndef ')[0]
    for escritura in ('INSERT INTO', 'UPDATE ', 'DELETE FROM'):
        assert escritura not in cuerpo


def test_un_pdf_ilegible_no_rompe_la_pantalla():
    """Devuelve sugerencia vacia con aviso, para que se pueda teclear."""
    fuente = _rutas()
    cuerpo = fuente.split('def leer_cajetin')[1].split('\ndef ')[0]
    assert 'aviso' in cuerpo
    assert cuerpo.count('except Exception') >= 1


# ── LA NUMERACION SIGUE LA CONVENCION DEL PLANO ───────────────────────────

def test_la_serie_de_revisiones_continua_la_que_el_plano_ya_usa():
    """Dos convenciones conviven en obra publica: letras y numeros. No se
    impone una -- la fija el contrato, no la plataforma."""
    import planos_de_obra as pl
    assert pl.siguiente_revision([]) == 'A'
    assert pl.siguiente_revision(['A']) == 'B'
    assert pl.siguiente_revision(['A', 'B', 'C']) == 'D'
    assert pl.siguiente_revision(['00']) == '01'
    assert pl.siguiente_revision(['00', '01', '02']) == '03'
    assert pl.siguiente_revision(['09']) == '10'


def test_una_serie_que_no_se_entiende_no_se_adivina():
    """Devolver algo inventado pondria un numero de revision falso en un
    documento contractual."""
    import planos_de_obra as pl
    assert pl.siguiente_revision(['REV-EXTRAÑA', 'OTRA']) is None
    assert pl.siguiente_revision(['Z']) is None, 'despues de Z no se sigue solo'


# ── ANCLAJES ───────────────────────────────────────────────────────────────

def test_el_ancla_apunta_a_LA_REVISION_y_no_al_plano():
    """Una observacion se levanto sobre un soporte concreto. Si el ancla
    apuntara al plano, superar una revision moveria silenciosamente todas las
    observaciones al soporte nuevo -- y ya no se sabria sobre cual se levantaron."""
    sql = _sql()
    assert 'revision_id   BIGINT      NOT NULL' in sql
    assert 'fk_anclaje_revision' in sql
    assert 'REFERENCES doc_plano_revisiones(id)' in sql


def test_las_coordenadas_son_relativas_a_la_lamina():
    """En coordenadas absolutas el ancla se descoloca en cuanto el plano se
    reexporta con otro tamano de lamina."""
    sql = _sql()
    assert 'ck_anclaje_dentro_de_la_lamina' in sql
    assert 'x >= 0 AND x <= 1 AND y >= 0 AND y <= 1' in sql


def test_una_sola_tabla_de_anclajes_para_todos_los_tipos():
    """La alternativa era anadir tres columnas a doc_rfis, doc_redlines y
    doc_submittals -- y una cuarta con el punch (GAP 04), y una quinta con los
    formularios (GAP 03). Mismo patron (objeto_tipo, objeto_id) que `encargos`."""
    sql = _sql()
    assert 'ck_anclaje_tipo' in sql
    assert "objeto_tipo IN ('RFI','REDLINE','SUBMITTAL','REVIEW')" in sql


def test_no_se_puede_anclar_el_mismo_objeto_dos_veces_en_la_misma_revision():
    assert 'idx_anclaje_unico' in _sql()


# ── MARKUP: PERSONAL vs PUBLICADO ──────────────────────────────────────────

def test_el_markup_nace_personal():
    """Sin la distincion, cualquier trazo tentativo aparece para toda la obra en
    el acto -- asi que la gente deja de marcar sobre el plano y usa capturas."""
    sql = _sql()
    assert 'ADD COLUMN IF NOT EXISTS publicado BOOLEAN NOT NULL DEFAULT FALSE' in sql


def test_los_markups_QUE_YA_EXISTEN_se_marcan_publicados():
    """Se crearon bajo la regla anterior --toda marca era de todos--. Dejarlos
    en el nuevo defecto los ocultaria de golpe a todo el mundo, que es cambiar
    retroactivamente lo que sus autores hicieron."""
    sql = _sql()
    assert 'UPDATE pdf_markups SET publicado = TRUE' in sql
    bloque = sql.split('UPDATE pdf_markups')[1].split(';')[0]
    assert 'publicado = FALSE' in bloque and 'publicado_en IS NULL' in bloque, (
        'la actualizacion tiene que ser acotada, no un UPDATE sin WHERE')


# ── LAS GUARDIAS ───────────────────────────────────────────────────────────

def test_conocer_un_id_de_revision_no_abre_la_obra_de_otro():
    """EL DEFECTO QUE ESTA PRUEBA NACE PARA IMPEDIR, y que encontro
    `test_la_defensa_en_profundidad_no_retrocede` antes de desplegar: anclar y
    listar anclajes recibian solo el id de la revision y NO resolvian la obra.
    Es la misma familia de agujero que se midio el 13-ago-2026, cuando un
    usuario de la obra A modifico un RFI de la obra B."""
    fuente = _rutas()
    for manejador in ('def anclar', 'def listar_anclajes'):
        cuerpo = fuente.split(manejador)[1].split('\ndef ')[0]
        assert '_obra_de_la_revision' in cuerpo, '%s no resuelve la obra' % manejador
        assert 'guardia_de_obra' in cuerpo, '%s no guarda' % manejador


def test_la_obra_de_una_revision_sale_del_plano_y_no_de_una_columna_fantasma():
    """`doc_plano_revisiones` NO esta en RECURSOS a proposito: su obra vive en
    la fila del plano. Declarar una columna `model_urn` inexistente habria
    dejado la guardia DORMIDA -- el fallo exacto que ya tuvo `saved_views`."""
    import perimetro_de_obra as per
    assert 'doc_plano_revisiones' not in per.RECURSOS
    assert per.RECURSOS['doc_planos'] == ('id', 'model_urn')


def test_una_revision_no_puede_colgar_de_un_documento_de_otra_obra():
    fuente = _rutas()
    cuerpo = fuente.split('def emitir_revision')[1].split('\ndef ')[0]
    assert 'OTRA_OBRA' in cuerpo
    assert 'resolve_project_id(fn[0]) != obra' in cuerpo


# ── LA HERRAMIENTA (capa 16) ───────────────────────────────────────────────

def test_la_herramienta_existe_y_gobierna_su_ruta():
    import herramientas_de_obra as hdo
    assert 'planos' in hdo.CODIGOS
    assert hdo.herramienta_de_ruta('/api/planos') == 'planos'
    assert hdo.herramienta_de_ruta('/api/planos/7/revisiones') == 'planos'
