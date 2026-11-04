# -*- coding: utf-8 -*-
"""Enlaces de documentos (5-nov-2026, docs/archivos/27): las reglas de `enlaces_de_documentos.crear` sin base de datos.

Un cursor de mentira que guarda `file_nodes` y `doc_enlaces` en memoria y entiende las consultas del módulo. La ruta
entera (permisos de carpeta de verdad, el listado, la papelera, la descarga) se ensaya contra PostgreSQL.
"""
import itertools

import pytest

import enlaces_de_documentos as enl

OBRA = 'obra'


class Base:
    """{id: (tipo, nombre, padre, obra, borrado)} y la tabla de enlaces."""

    def __init__(self, nodos, tabla=True):
        self.nodos = dict(nodos)
        self.enlaces = []          # (documento, carpeta)
        self.tabla = tabla
        self._filas = []
        self._ids = itertools.count(1)

    def execute(self, sql, params=()):
        s = ' '.join(sql.split())
        if 'to_regclass' in s:
            self._filas = [('doc_enlaces',) if self.tabla else (None,)]
        elif s.startswith('SELECT id::text, node_type, name, parent_id::text FROM file_nodes'):
            ids, obra = params
            self._filas = [(i, t, n, p) for i, (t, n, p, o, b) in self.nodos.items() if i in ids and o == obra and not b]
        elif s.startswith('SELECT parent_id::text, lower(name), id::text FROM file_nodes'):
            carpetas, obra = params
            self._filas = [(p, n.lower(), i) for i, (t, n, p, o, b) in self.nodos.items()
                           if p in carpetas and o == obra and t == 'FILE' and not b]
        elif s.startswith('SELECT e.carpeta_id::text, lower(f.name), f.id::text FROM doc_enlaces'):
            carpetas, = params
            self._filas = [(c, self.nodos[d][1].lower(), d) for d, c in self.enlaces
                           if c in carpetas and not self.nodos[d][4]]
        elif s.startswith('INSERT INTO doc_enlaces'):
            _obra, d, c, _por = params
            assert (d, c) not in self.enlaces, 'la UNIQUE habría saltado'
            self.enlaces.append((d, c))
        else:
            raise AssertionError('consulta inesperada: ' + s[:80])

    def fetchone(self):
        return self._filas[0] if self._filas else None

    def fetchall(self):
        return self._filas


def obra():
    """Componente/{0. Generales/{plano.pdf, memoria.pdf}, San Agustín/{propio.pdf}, San Pablo, San Felipe}."""
    return Base({
        'G': ('FOLDER', '0. Generales', 'C', OBRA, False),
        'A': ('FOLDER', 'San Agustín', 'C', OBRA, False),
        'P': ('FOLDER', 'San Pablo', 'C', OBRA, False),
        'F': ('FOLDER', 'San Felipe', 'C', OBRA, False),
        'plano': ('FILE', 'plano.pdf', 'G', OBRA, False),
        'memoria': ('FILE', 'memoria.pdf', 'G', OBRA, False),
        'propio': ('FILE', 'PLANO.PDF', 'A', OBRA, False),        # mismo nombre que «plano.pdf», sin distinguir mayúsculas
        'otro': ('FILE', 'otro.pdf', 'X', 'otra_obra', False),
        'X': ('FOLDER', 'De otra obra', None, 'otra_obra', False),
    })


def todo_vale(**cambios):
    base = dict(puede_ver=lambda n: True, puede_editar_en=lambda n: True)
    base.update(cambios)
    return base


def test_enlaza_cada_documento_en_cada_carpeta_y_no_copia_nada():
    b = obra()
    r = enl.crear(b, OBRA, ['memoria'], ['P', 'F'], 7, **todo_vale())
    assert r == {'creados': 2, 'ya_estaban': 0}
    assert sorted(b.enlaces) == [('memoria', 'F'), ('memoria', 'P')]
    assert sum(1 for v in b.nodos.values() if v[0] == 'FILE') == 4         # ningún documento nuevo


def test_enlazar_otra_vez_no_duplica():
    b = obra()
    enl.crear(b, OBRA, ['memoria'], ['P'], 7, **todo_vale())
    assert enl.crear(b, OBRA, ['memoria'], ['P', 'F'], 7, **todo_vale()) == {'creados': 1, 'ya_estaban': 1}


def test_no_en_su_propia_carpeta():
    with pytest.raises(enl.Negativa) as e:
        enl.crear(obra(), OBRA, ['plano'], ['P', 'G'], 7, **todo_vale())
    assert e.value.codigo == 'EN_SU_CARPETA' and '0. Generales' in e.value.texto


def test_una_carpeta_no_tiene_dos_filas_con_el_mismo_nombre():
    b = obra()
    with pytest.raises(enl.Negativa) as e:                                 # choca con un documento suyo
        enl.crear(b, OBRA, ['plano'], ['A'], 7, **todo_vale())
    assert e.value.codigo == 'NOMBRE_OCUPADO' and e.value.http == 409 and 'San Agustín' in e.value.texto
    b.nodos['otro_plano'] = ('FILE', 'Plano.pdf', 'F', OBRA, False)
    b.nodos['F2'] = ('FOLDER', 'Calle 2', 'C', OBRA, False)
    enl.crear(b, OBRA, ['otro_plano'], ['P'], 7, **todo_vale())
    with pytest.raises(enl.Negativa) as e:                                 # choca con otro enlace
        enl.crear(b, OBRA, ['plano'], ['P'], 7, **todo_vale())
    assert e.value.codigo == 'NOMBRE_OCUPADO'


def test_permisos_ver_el_documento_y_editar_cada_carpeta():
    with pytest.raises(enl.Negativa) as e:
        enl.crear(obra(), OBRA, ['memoria'], ['P'], 7, **todo_vale(puede_ver=lambda n: False))
    assert e.value.http == 403 and 'memoria.pdf' in e.value.texto
    b = obra()
    with pytest.raises(enl.Negativa) as e:
        enl.crear(b, OBRA, ['memoria'], ['P', 'F'], 7, **todo_vale(puede_editar_en=lambda n: n != 'F'))
    assert e.value.http == 403 and 'San Felipe' in e.value.texto
    assert b.enlaces == []                                                 # se niega antes de escribir nada


def test_solo_documentos_y_carpetas_de_esta_obra_y_vivos():
    for docs, carpetas, codigo in ((['otro'], ['P'], 'NO_ES_DOCUMENTO'), (['memoria'], ['X'], 'NO_ES_CARPETA'),
                                   (['G'], ['P'], 'NO_ES_DOCUMENTO'), (['memoria'], ['plano'], 'NO_ES_CARPETA')):
        with pytest.raises(enl.Negativa) as e:
            enl.crear(obra(), OBRA, docs, carpetas, 7, **todo_vale())
        assert e.value.codigo == codigo and e.value.http == 404
    b = obra()
    b.nodos['memoria'] = b.nodos['memoria'][:4] + (True,)                  # en la papelera
    with pytest.raises(enl.Negativa) as e:
        enl.crear(b, OBRA, ['memoria'], ['P'], 7, **todo_vale())
    assert e.value.codigo == 'NO_ES_DOCUMENTO'


def test_sin_la_migracion_se_dice_y_no_se_escribe():
    b = obra()
    b.tabla = False
    with pytest.raises(enl.Negativa) as e:
        enl.crear(b, OBRA, ['memoria'], ['P'], 7, **todo_vale())
    assert e.value.codigo == 'SIN_MIGRACION' and e.value.http == 503
    assert enl.filas_del_listado(b, OBRA, 'P') == [] and enl.cuantos_por_documento(b, ['memoria']) == {}


def test_topes_y_vacios():
    with pytest.raises(enl.Negativa) as e:
        enl.crear(obra(), OBRA, [], ['P'], 7, **todo_vale())
    assert e.value.codigo == 'FALTAN'
    with pytest.raises(enl.Negativa) as e:
        enl.crear(obra(), OBRA, ['memoria'], ['c%d' % k for k in range(enl.TOPE_CARPETAS + 1)], 7, **todo_vale())
    assert e.value.codigo == 'DEMASIADOS'
