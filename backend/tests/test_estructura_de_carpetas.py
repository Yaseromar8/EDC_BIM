# -*- coding: utf-8 -*-
"""Copiar la estructura de carpetas (4-nov-2026): las carpetas elegidas, vacías y con sus subcarpetas, en otras.
(5-nov: las elegidas van ellas mismas; con `con_las_raices=False`, solo su interior, la forma del 4-nov.)

Las reglas de `estructura_de_carpetas.py` sin base: un cursor de mentira que guarda las carpetas en memoria. La ruta
entera (el SQL recursivo, los permisos de verdad) se ensaya contra PostgreSQL.
"""
import itertools

import pytest

import estructura_de_carpetas as est

OBRA = 'obra'


class Carpetas:
    """Un `file_nodes` de juguete: {id: (padre, nombre)} y el cursor que entienden las consultas del módulo."""

    def __init__(self, arbol):
        self.nodos = dict(arbol)
        self._ids = itertools.count(1000)
        self._fila = None
        self._filas = []
        self.insertadas = []

    def execute(self, sql, params=()):
        if 'WITH RECURSIVE' in sql and 'nivel' in sql:          # subcarpetas
            raiz = params[0]
            salida, cola, nivel = [], [raiz], 0
            while cola:
                nivel += 1
                sig = []
                for padre in cola:
                    for i, (p, n) in sorted(self.nodos.items(), key=lambda x: x[1][1]):
                        if p == padre:
                            salida.append((i, p, n, nivel))
                            sig.append(i)
                cola = sig
            self._filas = [(i, p, n) for i, p, n, _ in sorted(salida, key=lambda r: (r[3], r[2]))]
        elif sql.lstrip().startswith('SELECT id FROM file_nodes WHERE model_urn'):   # ¿ya existe?
            _o, padre, nombre = params
            self._fila = next(((i,) for i, (p, n) in self.nodos.items() if p == padre and n == nombre), None)
        elif sql.lstrip().startswith('INSERT INTO file_nodes'):
            _o, padre, nombre, _por = params
            nuevo = 'n%d' % next(self._ids)
            self.nodos[nuevo] = (padre, nombre)
            self.insertadas.append((padre, nombre))
            self._fila = (nuevo,)
        elif sql.startswith('SELECT name FROM file_nodes'):
            self._fila = (self.nodos.get(params[0], (None, None))[1],)
        else:
            raise AssertionError('consulta inesperada: %s' % sql[:60])

    def fetchone(self):
        return self._fila

    def fetchall(self):
        return self._filas


# La plantilla: MODELO/{01 Planos/{Arquitectura, Estructuras}, 02 Memorias}; dos destinos vacíos.
def obra():
    return Carpetas({
        'M': (None, 'MODELO'),
        'p': ('M', '01 Planos'), 'a': ('p', 'Arquitectura'), 'e': ('p', 'Estructuras'),
        'm': ('M', '02 Memorias'),
        'D1': (None, 'Frente 1'), 'D2': (None, 'Frente 2'),
    })


def todo_vale(**cambios):
    """Todo permitido, y la forma del 4-nov (solo el interior de la modelo) salvo que se pida la otra."""
    base = dict(puede_ver=lambda n: True, puede_crear_en=lambda n: True, validar=lambda nombre, padre: None,
                con_las_raices=False)
    base.update(cambios)
    return base


def bajo(c, raiz):
    """La estructura bajo `raiz` como conjunto de rutas relativas."""
    rutas = set()
    def bajar(n, pref):
        for i, (p, nombre) in c.nodos.items():
            if p == n:
                rutas.add(pref + nombre)
                bajar(i, pref + nombre + '/')
    bajar(raiz, '')
    return rutas


def test_copia_las_subcarpetas_vacias_en_cada_destino_y_no_la_modelo():
    c = obra()
    r = est.copiar(c, OBRA, ['M'], ['D1', 'D2'], 'Ana', **todo_vale())
    esperado = {'01 Planos', '01 Planos/Arquitectura', '01 Planos/Estructuras', '02 Memorias'}
    assert bajo(c, 'D1') == esperado and bajo(c, 'D2') == esperado
    assert r['creadas'] == 8 and r['ya_estaban'] == 0 and r['por_destino'] == {'D1': 4, 'D2': 4} and r['modelo'] == 4


def test_lo_que_ya_esta_se_usa_y_no_se_duplica():
    c = obra()
    c.nodos.update({'x': ('D1', '01 Planos'), 'y': ('x', 'Arquitectura')})
    r = est.copiar(c, OBRA, ['M'], ['D1'], 'Ana', **todo_vale())
    assert r['creadas'] == 2 and r['ya_estaban'] == 2
    assert sorted(n for p, n in c.insertadas) == ['02 Memorias', 'Estructuras']
    assert ('x', 'Estructuras') in c.insertadas                      # dentro de la que ya estaba
    # Copiar otra vez no crea nada.
    assert est.copiar(c, OBRA, ['M'], ['D1'], 'Ana', **todo_vale())['creadas'] == 0


def test_lo_que_no_se_ve_no_se_copia_ni_lo_de_dentro():
    c = obra()
    r = est.copiar(c, OBRA, ['M'], ['D1'], 'Ana', **todo_vale(puede_ver=lambda n: n != 'p'))
    assert bajo(c, 'D1') == {'02 Memorias'} and r['modelo'] == 1


def test_sin_editar_donde_hay_que_crear_no_se_crea_nada_y_dice_donde():
    c = obra()
    c.nodos['x'] = ('D1', '01 Planos')                               # ya está, pero ahí no se puede crear
    with pytest.raises(est.Negativa) as e:
        est.copiar(c, OBRA, ['M'], ['D1'], 'Ana', **todo_vale(puede_crear_en=lambda n: n != 'x'))
    assert e.value.http == 403 and '01 Planos' in e.value.texto
    # Dentro de una carpeta recién creada no se vuelve a preguntar: hereda el permiso de su destino.
    preguntas = []
    est.copiar(obra(), OBRA, ['M'], ['D1'], 'Ana', **todo_vale(puede_crear_en=lambda n: preguntas.append(n) or True))
    assert preguntas == ['D1', 'D1']                                 # «01 Planos» y «02 Memorias», no sus hijas


def test_las_reglas_de_la_obra_valen_igual_que_al_crear_a_mano():
    c = obra()
    with pytest.raises(est.Negativa) as e:
        est.copiar(c, OBRA, ['M'], ['D1'], 'Ana',
                   **todo_vale(validar=lambda nombre, padre: ('NOMBRE', 'Nombre no válido') if nombre == 'Estructuras' else None))
    assert e.value.codigo == 'NOMBRE' and e.value.http == 422


def test_una_modelo_sin_subcarpetas_o_demasiadas_se_dice():
    c = obra()
    with pytest.raises(est.Negativa) as e:
        est.copiar(c, OBRA, ['D1'], ['D2'], 'Ana', **todo_vale())
    assert e.value.codigo == 'SIN_SUBCARPETAS'
    with pytest.raises(est.Negativa) as e:
        est.copiar(c, OBRA, ['M'], ['D%d' % k for k in range(126)], 'Ana', **todo_vale())   # 4 × 126 > 500
    assert e.value.codigo == 'DEMASIADAS'


# 5-NOV-2026: lo que el dueño hace es MARCAR las subcarpetas que quiere repetir y copiarlas. Van ellas mismas.
def test_las_carpetas_marcadas_van_ellas_mismas_con_sus_subcarpetas():
    c = obra()
    r = est.copiar(c, OBRA, ['p', 'm'], ['D1', 'D2'], 'Ana', **todo_vale(con_las_raices=True))
    esperado = {'01 Planos', '01 Planos/Arquitectura', '01 Planos/Estructuras', '02 Memorias'}
    assert bajo(c, 'D1') == esperado and bajo(c, 'D2') == esperado
    assert r['creadas'] == 8 and r['modelo'] == 4


def test_una_sola_carpeta_marcada_va_ella_misma_aunque_este_vacia():
    c = obra()
    r = est.copiar(c, OBRA, ['M'], ['D1'], 'Ana', **todo_vale(con_las_raices=True))
    assert bajo(c, 'D1') == {'MODELO', 'MODELO/01 Planos', 'MODELO/01 Planos/Arquitectura',
                             'MODELO/01 Planos/Estructuras', 'MODELO/02 Memorias'}
    c = obra()
    est.copiar(c, OBRA, ['m'], ['D1'], 'Ana', **todo_vale(con_las_raices=True))
    assert bajo(c, 'D1') == {'02 Memorias'}                          # sin subcarpetas: se copia ella, vacía


def test_las_marcadas_que_ya_estan_en_el_destino_se_usan_y_se_completan():
    c = obra()
    c.nodos.update({'x': ('D1', '01 Planos'), 'y': ('x', 'Arquitectura')})
    r = est.copiar(c, OBRA, ['p', 'm'], ['D1'], 'Ana', **todo_vale(con_las_raices=True))
    assert r['creadas'] == 2 and r['ya_estaban'] == 2
    assert sorted(c.insertadas) == [('D1', '02 Memorias'), ('x', 'Estructuras')]
