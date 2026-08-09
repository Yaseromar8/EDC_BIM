"""Con qué autorización se emite cada versión, y cómo se llama esa emisión.

EL HUECO QUE ESTOS TESTS FIJAN
------------------------------
La plataforma sabía DÓNDE estaba un documento pero nunca PARA QUÉ se podía usar.
Un documento "Publicado" no distinguía entre apto para construir y solo
informativo; construir con un plano informativo es un problema caro en obra.
Buscando 'idoneidad|suitability|revision_code' en todo el repositorio salían cero
resultados.

Y la revisión formal tampoco existía: solo había un contador de subidas, así que
corregir una errata de maquetación subía a V5 igual que emitir una revisión
contractual nueva.
"""
import pytest

import idoneidad as idn


class CursorFalso:
    """Devuelve el catálogo por defecto y recuerda las revisiones ya usadas."""

    def __init__(self, revisiones_usadas=None, catalogo=None):
        self.revisiones = revisiones_usadas or []
        self.catalogo = catalogo
        self._ultima = []
        self.ejecutadas = []

    def execute(self, sql, params=None):
        self.ejecutadas.append((' '.join(sql.split()), params))
        s = sql.upper()
        if 'FROM IDONEIDAD_CATALOGO' in s:
            self._ultima = self.catalogo if self.catalogo is not None else [
                (c, e, f) for c, e, f in idn.CATALOGO_POR_DEFECTO
            ]
        elif 'CODIGO_REVISION FROM FILE_VERSIONS' in s:
            self._ultima = [(r,) for r in self.revisiones]
        else:
            self._ultima = []

    def fetchall(self):
        return self._ultima

    def fetchone(self):
        return self._ultima[0] if self._ultima else None


# ── La regla que de verdad importa ──────────────────────────────────────────

def test_no_se_publica_sin_decir_para_que_sirve():
    """Es la primera pregunta de un auditor: ¿con qué autorización se emitió?"""
    cur = CursorFalso()
    vale, motivo = idn.validar_para(cur, 'obra/X', None, 'PUBLISHED')
    assert vale is False
    assert 'idoneidad' in motivo.lower()


def test_un_codigo_de_compartir_NO_autoriza_a_publicar():
    """S2 es 'solo para información'. Publicar con eso sería decir que se puede
    construir con un documento que no lo autoriza."""
    cur = CursorFalso()
    vale, motivo = idn.validar_para(cur, 'obra/X', 'S2', 'PUBLISHED')
    assert vale is False
    assert 'publicar' in motivo.lower()


def test_un_codigo_de_publicacion_autoriza_a_publicar():
    cur = CursorFalso()
    assert idn.validar_para(cur, 'obra/X', 'A1', 'PUBLISHED')[0] is True
    assert idn.validar_para(cur, 'obra/X', 'B1', 'PUBLISHED')[0] is True
    assert idn.validar_para(cur, 'obra/X', 'CR', 'PUBLISHED')[0] is True


def test_publicar_con_un_codigo_inventado_se_rechaza():
    cur = CursorFalso()
    vale, motivo = idn.validar_para(cur, 'obra/X', 'Z9', 'PUBLISHED')
    assert vale is False
    assert 'catálogo' in motivo


def test_compartir_sin_codigo_se_tolera():
    """Compartir es trabajo interno del equipo; exigir el código ahí solo estorba."""
    cur = CursorFalso()
    assert idn.validar_para(cur, 'obra/X', None, 'SHARED')[0] is True


def test_compartir_con_un_codigo_de_publicacion_se_rechaza():
    cur = CursorFalso()
    assert idn.validar_para(cur, 'obra/X', 'A1', 'SHARED')[0] is False


def test_volver_a_borrador_o_archivar_no_emite_nada():
    cur = CursorFalso()
    assert idn.validar_para(cur, 'obra/X', None, 'WIP')[0] is True
    assert idn.validar_para(cur, 'obra/X', None, 'ARCHIVED')[0] is True


def test_el_codigo_no_distingue_mayusculas_ni_espacios():
    cur = CursorFalso()
    assert idn.validar_para(cur, 'obra/X', ' a1 ', 'PUBLISHED')[0] is True


def test_el_catalogo_es_de_la_obra_y_se_puede_recortar():
    """Cada obra ajusta los códigos a lo que diga su plan de ejecución BIM."""
    solo_dos = [('A1', 'Autorizado', idn.PUBLICADO), ('S2', 'Información', idn.COMPARTIDO)]
    cur = CursorFalso(catalogo=solo_dos)
    assert idn.validar_para(cur, 'obra/X', 'A1', 'PUBLISHED')[0] is True
    assert idn.validar_para(cur, 'obra/X', 'B1', 'PUBLISHED')[0] is False


# ── La revisión formal, que no es el contador de subidas ────────────────────

def test_la_primera_emision_compartida_es_P01():
    cur = CursorFalso(revisiones_usadas=[])
    assert idn.siguiente_revision(cur, 'n1', 'SHARED') == 'P01'


def test_la_siguiente_compartida_avanza():
    cur = CursorFalso(revisiones_usadas=['P01'])
    assert idn.siguiente_revision(cur, 'n1', 'SHARED') == 'P02'


def test_publicar_abre_la_serie_contractual():
    cur = CursorFalso(revisiones_usadas=['P01', 'P02'])
    assert idn.siguiente_revision(cur, 'n1', 'PUBLISHED') == 'C01'


def test_las_dos_series_avanzan_por_separado():
    cur = CursorFalso(revisiones_usadas=['P01', 'P02', 'C01'])
    assert idn.siguiente_revision(cur, 'n1', 'PUBLISHED') == 'C02'
    assert idn.siguiente_revision(cur, 'n1', 'SHARED') == 'P03'


def test_un_numero_de_revision_no_se_reutiliza_nunca():
    """Volver atrás y reemitir no puede devolver un código ya entregado: un
    código de revisión que se repite deja de identificar nada."""
    cur = CursorFalso(revisiones_usadas=['P01', 'P02', 'P03', 'C01'])
    nueva = idn.siguiente_revision(cur, 'n1', 'SHARED')
    assert nueva == 'P04'
    assert nueva not in cur.revisiones


def test_archivar_o_volver_a_borrador_no_da_numero_de_revision():
    cur = CursorFalso()
    assert idn.siguiente_revision(cur, 'n1', 'ARCHIVED') is None
    assert idn.siguiente_revision(cur, 'n1', 'WIP') is None


def test_aguanta_codigos_raros_en_el_historial():
    """Datos viejos o cargados a mano no deben tumbar el contador."""
    cur = CursorFalso(revisiones_usadas=['rev-antigua', '', None, 'P07'])
    assert idn.siguiente_revision(cur, 'n1', 'SHARED') == 'P08'


def test_el_formato_lleva_dos_digitos():
    cur = CursorFalso(revisiones_usadas=[])
    assert idn.siguiente_revision(cur, 'n1', 'PUBLISHED') == 'C01'


# ── El catálogo por defecto ─────────────────────────────────────────────────

def test_cada_codigo_por_defecto_declara_su_familia():
    for codigo, etiqueta, familia in idn.CATALOGO_POR_DEFECTO:
        assert familia in (idn.COMPARTIDO, idn.PUBLICADO), codigo
        assert etiqueta and len(etiqueta) > 8, codigo


def test_hay_codigos_de_las_dos_familias():
    familias = {f for _c, _e, f in idn.CATALOGO_POR_DEFECTO}
    assert familias == {idn.COMPARTIDO, idn.PUBLICADO}


def test_las_etiquetas_estan_en_castellano_llano():
    """Se le enseñan a gente de obra, no a un comité de normalización."""
    for codigo, etiqueta, _f in idn.CATALOGO_POR_DEFECTO:
        assert etiqueta == etiqueta.strip()
        for jerga in ('suitability', 'status code', 'WIP'):
            assert jerga not in etiqueta, codigo
