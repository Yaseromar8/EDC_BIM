# -*- coding: utf-8 -*-
"""Conciliacion base <-> almacen.

La prueba que de verdad importa aqui es la primera: demostrar que el guion
anterior habria borrado las fotografias de obra, y que este no. Todo lo demas
son las dos direcciones del cruce y la negativa a correr con fuentes sin
declarar.

DB-free y sin red: `conciliar` recibe el listado del bucket ya materializado.
"""
import datetime

import pytest

import conciliacion_almacen as ca

AHORA = datetime.datetime(2026, 8, 13, 12, 0, tzinfo=datetime.timezone.utc)
VIEJO = AHORA - datetime.timedelta(days=30)
RECIEN = AHORA - datetime.timedelta(minutes=5)


class Cursor:
    """Cursor de mentira que responde a las tres consultas que hace el modulo."""

    def __init__(self, tablas, filas, columnas_esquema=None):
        self.tablas = tablas                  # nombres que existen
        self.filas = filas                    # {(tabla, columna): [valores]}
        self.columnas = columnas_esquema or []
        self._r = []

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        if 'information_schema.columns' in s:
            self._r = list(self.columnas)
        elif 'to_regclass' in s:
            tabla = params[0].split('.')[-1]
            self._r = [(tabla if tabla in self.tablas else None,)]
        else:
            columna = s.split('SELECT ')[1].split(' FROM ')[0].strip()
            tabla = s.split(' FROM ')[1].split(' ')[0].strip()
            self._r = [(v,) for v in self.filas.get((tabla, columna), [])]

    def fetchone(self):
        return self._r[0] if self._r else None

    def fetchall(self):
        return self._r


# ── El fallo del guion anterior ────────────────────────────────────────────

def test_las_fotografias_de_obra_no_son_huerfanas():
    """El guion anterior solo miraba file_nodes y file_versions: con `--force`
    habria borrado del bucket todas las fotografias de interferencias."""
    cur = Cursor(
        tablas={'file_nodes', 'file_versions', 'photo_evidences'},
        filas={
            ('file_nodes', 'gcs_urn'): ['multi-tenant/obra/doc.pdf'],
            ('photo_evidences', 'gcs_urn'): ['fotos/pin-1.jpg'],
            ('photo_evidences', 'gcs_url'):
                ['https://storage.googleapis.com/bucket-obra/fotos/pin-2.jpg'],
        })
    refs, _ausentes = ca.referencias(cur, 'bucket-obra')

    objetos = [('multi-tenant/obra/doc.pdf', 10, VIEJO),
               ('fotos/pin-1.jpg', 20, VIEJO),
               ('fotos/pin-2.jpg', 30, VIEJO)]
    res = ca.conciliar(objetos, refs, ahora=AHORA)

    assert res['huerfanos'] == [], 'ninguna fotografia puede salir como huerfana'
    assert res['referencias_en_base'] == 3


def test_la_url_completa_y_el_nombre_del_objeto_son_la_misma_clave():
    assert (ca.clave_de('https://storage.googleapis.com/b/fotos/a.jpg', 'b')
            == ca.clave_de('fotos/a.jpg')
            == ca.clave_de('gs://b/fotos/a.jpg', 'b')
            == 'fotos/a.jpg')


def test_la_firma_de_la_url_no_cambia_la_clave():
    assert ca.clave_de('fotos/a.jpg?X-Goog-Signature=abc') == 'fotos/a.jpg'


# ── Las dos direcciones ────────────────────────────────────────────────────

def test_lo_que_sobra_se_lista_sin_borrarse():
    res = ca.conciliar([('basura/x.tmp', 1024, VIEJO)], {}, ahora=AHORA)
    assert [n for n, _ in res['huerfanos']] == ['basura/x.tmp']
    assert res['bytes_huerfanos'] == 1024


def test_lo_que_falta_se_llama_por_su_nombre():
    """Un documento registrado cuyo objeto no existe: el caso grave."""
    refs = {'multi-tenant/obra/acta.pdf': [('file_nodes', 'gcs_urn', 'documento vigente')]}
    res = ca.conciliar([], refs, ahora=AHORA)
    assert res['sin_bytes'] == [('multi-tenant/obra/acta.pdf',
                                 [('file_nodes', 'gcs_urn', 'documento vigente')])]
    assert 'SIN BYTES' in ca.informe_de_texto(res)


def test_una_subida_recien_hecha_esta_en_gracia_y_no_cuenta_como_huerfana():
    """Con URL firmada el objeto se escribe ANTES de que la fila exista."""
    res = ca.conciliar([('multi-tenant/obra/subiendo.rvt', 99, RECIEN)], {}, ahora=AHORA)
    assert res['huerfanos'] == []
    assert len(res['en_gracia']) == 1


def test_las_carpetas_simuladas_se_ignoran():
    res = ca.conciliar([('multi-tenant/obra/', 0, VIEJO)], {}, ahora=AHORA)
    assert res['objetos_en_almacen'] == 0


# ── El seguro contra quedarse viejo ────────────────────────────────────────

def test_una_columna_nueva_que_apunta_a_objetos_se_delata():
    cur = Cursor(tablas=set(), filas={},
                 columnas_esquema=[('file_nodes', 'gcs_urn'),
                                   ('adjuntos_rfi', 'gcs_urn')])
    assert ca.columnas_no_declaradas(cur) == [('adjuntos_rfi', 'gcs_urn')]


def test_las_columnas_ya_declaradas_no_se_delatan():
    cur = Cursor(tablas=set(), filas={},
                 columnas_esquema=[(t, c) for t, c, _ in ca.FUENTES]
                                  + [('project_settings', 'storage_limit_bytes')])
    assert ca.columnas_no_declaradas(cur) == []


def test_una_tabla_que_no_existe_no_rompe_pero_se_anota():
    cur = Cursor(tablas={'file_nodes'}, filas={('file_nodes', 'gcs_urn'): ['a/b.pdf']})
    refs, ausentes = ca.referencias(cur)
    assert refs == {'a/b.pdf': [('file_nodes', 'gcs_urn', 'documento vigente')]}
    assert 'photo_evidences' in ausentes


def test_el_modulo_no_tiene_ninguna_llamada_a_borrar():
    """Regresion sobre la decision de diseno: este modulo informa, no borra."""
    import io, os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'conciliacion_almacen.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    for prohibido in ('.delete(', 'delete_blob', 'DELETE FROM'):
        assert prohibido not in fuente, f'aparecio {prohibido} en el conciliador'


def test_el_informe_dice_cuantos_hay_de_cada_cosa():
    refs = {'a': [('file_nodes', 'gcs_urn', 'documento vigente')],
            'b': [('photo_evidences', 'gcs_urn', 'fotografia de obra')]}
    res = ca.conciliar([('a', 1, VIEJO), ('b', 2, VIEJO)], refs, ahora=AHORA)
    texto = ca.informe_de_texto(res)
    assert 'documento vigente' in texto and 'fotografia de obra' in texto
    assert 'NO borra nada' in texto
