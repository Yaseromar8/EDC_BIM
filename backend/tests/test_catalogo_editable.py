# -*- coding: utf-8 -*-
"""El catalogo de idoneidad se puede editar, pero no de cualquier manera.

El modulo llevaba tiempo documentado como «editable por obra» y no habia NINGUNA
via para escribirlo: solo un GET. Un control que se describe y no existe es peor
que no tenerlo, porque quien lee el codigo da por hecho que esta puesto. Es el
cuarto caso del mismo patron en esta plataforma.

PERO ESTO NO ES UN CRUD
-----------------------
El catalogo no es una lista de opciones: es el vocabulario con el que el
expediente dice PARA QUE sirve cada documento. Dos reglas, y las dos salen de
ahi:

  · un codigo YA USADO no se borra. Se desactiva -- deja de ofrecerse para
    emisiones nuevas -- pero la fila se queda, porque hay documentos sellados
    con el y sin la fila su idoneidad no significa nada: ni se puede mostrar, ni
    se puede saber si permitia construir;

  · a un codigo ya usado no se le cambia la FAMILIA. Mover un codigo de
    «publicado» a «compartido» convierte retroactivamente en no autorizado todo
    lo que se publico con el. La etiqueta si se puede corregir: aclarar como se
    lee un codigo no cambia lo que autorizo en su dia.

DB-free: cursor de mentira.
"""
import pytest

import idoneidad as idn

OBRA = 'proyectos/PQT8_TALARA'


class CursorFalso:
    """idoneidad_catalogo + los codigos ya escritos en el expediente."""

    def __init__(self, catalogo=(), en_uso=()):
        # catalogo: [(codigo, familia)] tal como esta guardado hoy
        self.catalogo = list(catalogo)
        self.en_uso = list(en_uso)
        self.escritas = []
        self.borrado = False
        self._r = []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split()).upper()
        self._r = []
        if s.startswith('CREATE TABLE'):
            return
        if 'DISTINCT' in s and 'IDONEIDAD' in s:
            self._r = [(c,) for c in self.en_uso]
        elif s.startswith('SELECT CODIGO, FAMILIA FROM IDONEIDAD_CATALOGO'):
            self._r = list(self.catalogo)
        elif s.startswith('DELETE FROM IDONEIDAD_CATALOGO'):
            self.borrado = True
        elif s.startswith('INSERT INTO IDONEIDAD_CATALOGO'):
            self.escritas.append(params)

    def fetchall(self):
        return self._r

    def fetchone(self):
        return self._r[0] if self._r else None


CAT = [('S3', 'compartido'), ('A1', 'publicado')]


def _fila(codigo, etiqueta='x', familia='compartido', activo=True):
    return {'codigo': codigo, 'etiqueta': etiqueta, 'familia': familia, 'activo': activo}


# ── Que se puede hacer ────────────────────────────────────────────────────

def test_se_puede_guardar_un_catalogo_propio():
    cur = CursorFalso(CAT, en_uso=[])
    codigos, _avisos = idn.guardar_catalogo(
        cur, OBRA, [_fila('S3', 'Para revisión'), _fila('A1', 'Apto', 'publicado')])
    assert [c['codigo'] for c in codigos] == ['S3', 'A1']
    assert cur.borrado and len(cur.escritas) == 2


def test_se_puede_corregir_la_etiqueta_de_un_codigo_en_uso():
    """Aclarar como se lee un codigo no cambia lo que autorizo."""
    cur = CursorFalso(CAT, en_uso=['S3'])
    codigos, _a = idn.guardar_catalogo(
        cur, OBRA, [_fila('S3', 'Para revisión y comentarios'),
                    _fila('A1', 'Apto', 'publicado')])
    assert codigos[0]['etiqueta'] == 'Para revisión y comentarios'


def test_un_codigo_en_uso_se_puede_DESACTIVAR():
    """Es la salida cuando una obra deja de usar un codigo: deja de ofrecerse y
    los documentos que lo llevan siguen significando lo mismo."""
    cur = CursorFalso(CAT, en_uso=['S3'])
    codigos, avisos = idn.guardar_catalogo(
        cur, OBRA, [_fila('S3', 'Para revisión', activo=False),
                    _fila('A1', 'Apto', 'publicado')])
    assert [c['codigo'] for c in codigos] == ['A1']
    assert any('S3' in a for a in avisos)


# ── Que no ────────────────────────────────────────────────────────────────

def test_no_se_puede_QUITAR_un_codigo_ya_usado():
    """Dejaria documentos sellados con una idoneidad que no significa nada."""
    cur = CursorFalso(CAT, en_uso=['S3'])
    with pytest.raises(ValueError) as e:
        idn.guardar_catalogo(cur, OBRA, [_fila('A1', 'Apto', 'publicado')])
    assert 'S3' in str(e.value)
    assert 'esact' in str(e.value), 'el error tiene que decir cual es la salida'
    assert not cur.borrado, 'no se toca la tabla si la peticion se rechaza'


def test_no_se_puede_cambiar_la_FAMILIA_de_un_codigo_ya_usado():
    """Mover A1 a «compartido» convertiria en no autorizado todo lo publicado."""
    cur = CursorFalso(CAT, en_uso=['A1'])
    with pytest.raises(ValueError) as e:
        idn.guardar_catalogo(cur, OBRA, [_fila('S3', 'x'), _fila('A1', 'x', 'compartido')])
    assert 'A1' in str(e.value)


def test_un_codigo_que_NO_esta_en_uso_si_se_puede_quitar():
    """La regla protege el expediente, no congela el catalogo."""
    cur = CursorFalso(CAT, en_uso=['A1'])
    codigos, _a = idn.guardar_catalogo(cur, OBRA, [_fila('A1', 'Apto', 'publicado')])
    assert [c['codigo'] for c in codigos] == ['A1']


# ── Higiene de los datos ──────────────────────────────────────────────────

def test_el_catalogo_no_puede_quedarse_vacio():
    with pytest.raises(ValueError):
        idn.guardar_catalogo(CursorFalso(CAT), OBRA, [])


def test_un_codigo_sin_descripcion_se_rechaza():
    """Un codigo sin explicacion obliga a cada uno a suponer que significa, que
    es justo lo que un catalogo viene a evitar."""
    with pytest.raises(ValueError) as e:
        idn.guardar_catalogo(CursorFalso(CAT), OBRA, [_fila('S3', '')])
    assert 'S3' in str(e.value)


def test_no_se_admiten_codigos_repetidos():
    with pytest.raises(ValueError):
        idn.guardar_catalogo(CursorFalso(CAT), OBRA, [_fila('S3'), _fila('s3')])


def test_la_familia_tiene_que_ser_una_de_las_dos():
    with pytest.raises(ValueError):
        idn.guardar_catalogo(CursorFalso(CAT), OBRA, [_fila('S3', 'x', 'inventada')])


def test_el_codigo_se_normaliza_a_mayusculas():
    cur = CursorFalso(CAT, en_uso=[])
    codigos, _a = idn.guardar_catalogo(cur, OBRA, [_fila('s3', 'Para revisión')])
    assert codigos[0]['codigo'] == 'S3'


# ── Los avisos, que son media herramienta ─────────────────────────────────

def test_avisa_si_queda_sin_codigos_de_publicacion():
    """Sin ninguno activo no se podra publicar nada. No se bloquea -- puede ser
    una obra que aun no publica, y es reversible editando otra vez -- pero
    callarlo dejaria el ECD roto sin que nadie supiera por que."""
    cur = CursorFalso(CAT, en_uso=[])
    _c, avisos = idn.guardar_catalogo(cur, OBRA, [_fila('S3', 'Para revisión')])
    assert any('Publicado' in a for a in avisos)


def test_avisa_si_queda_sin_codigos_para_compartir():
    cur = CursorFalso(CAT, en_uso=[])
    _c, avisos = idn.guardar_catalogo(cur, OBRA, [_fila('A1', 'Apto', 'publicado')])
    assert any('compartir' in a for a in avisos)


# ── Que la ruta este puesta y protegida ───────────────────────────────────

def test_la_ruta_de_escritura_existe_y_es_de_administrador():
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'documents.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert "@documents_bp.route('/api/docs/idoneidad', methods=['PUT'])" in fuente
    cuerpo = fuente[fuente.index('def guardar_catalogo_de_idoneidad'):]
    cuerpo = cuerpo[:cuerpo.index('\n@')] if '\n@' in cuerpo else cuerpo
    assert 'guardia_de_obra' in cuerpo
    assert "u.get('role') != 'admin'" in cuerpo


def test_los_errores_de_regla_se_devuelven_al_usuario_y_no_como_500():
    """Estan escritos en castellano y explican la salida: convertirlos en «error
    interno» obligaria a adivinar."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'documents.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def guardar_catalogo_de_idoneidad'):]
    assert 'except ValueError' in cuerpo
    assert '400' in cuerpo[:cuerpo.index('return jsonify({"success": True')]
