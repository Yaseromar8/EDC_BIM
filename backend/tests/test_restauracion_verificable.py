# -*- coding: utf-8 -*-
"""¿El verificador de esquema acepta una copia restaurada, y sigue rechazando lo que debe?

LO QUE SE MIDIO EL 8-sep-2026, EN EL ACTO P1
--------------------------------------------
Se copio produccion entera con `pg_dump`, se restauro en un cluster nuevo y
vacio, y se cotejo: 123 tablas, 86.756 filas, 123 huellas de contenido, 927
restricciones, 297 indices, 100 claves ajenas sin una fila huerfana. La copia era
FIEL.

Y aun asi el verificador la rechazaba: `506 de 510` restricciones. Como `start`
es `bootstrap_esquema.py --verificar && gunicorn`, eso significa que **el
servicio no levantaba sobre su propia copia**. El respaldo servia; la vuelta no.

La causa no era una perdida. `pg_dump` escribe el texto deparseado, `pg_restore`
lo vuelve a parsear, y PostgreSQL lo deparsea distinto:

    original     CHECK (node_type IN ('FOLDER','FILE'))
    en la base   ... = ANY ((ARRAY['FOLDER'::character varying, ...])::text[])
    tras volver  ... = ANY (ARRAY[('FOLDER'::character varying)::text, ...])

Mismo significado, otro texto. El verificador comparaba texto.

QUE FIJAN ESTAS PRUEBAS
-----------------------
Que la comparacion pasa a ser por FORMA, y que eso no la vuelve complaciente:
un valor cambiado, un operador cambiado, una precedencia distinta o una
restriccion que falta siguen siendo FALLO. Un arreglo que aceptara de mas seria
peor que el problema que arregla: un falso negativo se ve el dia del despliegue;
un falso positivo no se ve nunca.

Son estaticas a proposito. No necesitan PostgreSQL: las dos formas de cada CHECK
estan tomadas literalmente de la evidencia de P1.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from canonico_sql import canonico, equivalentes  # noqa: E402
import bootstrap_esquema  # noqa: E402


# Las dos formas de las cinco restricciones que el viaje de ida y vuelta
# reescribio. Copiadas de la evidencia de P1, no inventadas.
PAREJAS_MEDIDAS = [
    ("file_nodes CHECK (((node_type)::text = ANY ((ARRAY['FOLDER'::character varying, "
     "'FILE'::character varying])::text[])))",
     "file_nodes CHECK (((node_type)::text = ANY (ARRAY[('FOLDER'::character varying)::text, "
     "('FILE'::character varying)::text])))"),
    ("file_nodes CHECK (((status)::text = ANY ((ARRAY['WIP'::character varying, "
     "'SHARED'::character varying, 'PUBLISHED'::character varying, "
     "'ARCHIVED'::character varying])::text[])))",
     "file_nodes CHECK (((status)::text = ANY (ARRAY[('WIP'::character varying)::text, "
     "('SHARED'::character varying)::text, ('PUBLISHED'::character varying)::text, "
     "('ARCHIVED'::character varying)::text])))"),
    ("upload_sessions CHECK (((status)::text = ANY ((ARRAY['active'::character varying, "
     "'completed'::character varying, 'expired'::character varying, "
     "'cancelled'::character varying])::text[])))",
     "upload_sessions CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, "
     "('completed'::character varying)::text, ('expired'::character varying)::text, "
     "('cancelled'::character varying)::text])))"),
    ("doc_rfis CHECK (((estado IS NULL) OR ((estado)::text = ANY ((ARRAY['Emitido'::character varying, "
     "'En revision'::character varying, 'Respondido'::character varying, "
     "'Cerrado'::character varying])::text[]))))",
     "doc_rfis CHECK (((estado IS NULL) OR ((estado)::text = ANY (ARRAY[('Emitido'::character varying)::text, "
     "('En revision'::character varying)::text, ('Respondido'::character varying)::text, "
     "('Cerrado'::character varying)::text]))))"),
    ("doc_redlines CHECK (((estado IS NULL) OR ((estado)::text = ANY ((ARRAY['Emitido'::character varying, "
     "'En revision'::character varying, 'Respondido'::character varying, "
     "'Cerrado'::character varying])::text[]))))",
     "doc_redlines CHECK (((estado IS NULL) OR ((estado)::text = ANY (ARRAY[('Emitido'::character varying)::text, "
     "('En revision'::character varying)::text, ('Respondido'::character varying)::text, "
     "('Cerrado'::character varying)::text]))))"),
]


@pytest.mark.parametrize('en_produccion,tras_restaurar', PAREJAS_MEDIDAS)
def test_las_dos_formas_del_mismo_check_son_la_misma(en_produccion, tras_restaurar):
    """FITNESS 1. Es el caso que tumbaba la recuperacion."""
    assert en_produccion != tras_restaurar, 'la pareja ya no mide nada'
    assert equivalentes(en_produccion.lower(), tras_restaurar.lower())


@pytest.mark.parametrize('en_produccion,tras_restaurar', PAREJAS_MEDIDAS)
def test_cambiar_un_valor_permitido_sigue_siendo_fallo(en_produccion, tras_restaurar):
    """FITNESS 2. Aceptar de mas seria peor que el problema que se arregla."""
    mutado = tras_restaurar.replace("'FILE'", "'FICHERO'") \
                           .replace("'ARCHIVED'", "'ARCHIVADO'") \
                           .replace("'cancelled'", "'anulado'") \
                           .replace("'Cerrado'", "'Terminado'")
    assert mutado != tras_restaurar, 'la mutacion no cambio nada'
    assert not equivalentes(en_produccion.lower(), mutado.lower())


def test_anyadir_un_valor_permitido_es_fallo():
    """FITNESS 2. Ampliar lo que se admite tambien es cambiar la regla."""
    original, restaurado = PAREJAS_MEDIDAS[0]
    con_uno_mas = restaurado.replace(
        "('FILE'::character varying)::text",
        "('FILE'::character varying)::text, ('ENLACE'::character varying)::text")
    assert not equivalentes(original.lower(), con_uno_mas.lower())


def test_cambiar_el_operador_es_fallo():
    original, restaurado = PAREJAS_MEDIDAS[0]
    assert not equivalentes(original.lower(),
                            restaurado.replace('= ANY', '<> ALL').lower())


def test_cambiar_la_columna_es_fallo():
    original, restaurado = PAREJAS_MEDIDAS[0]
    assert not equivalentes(original.lower(),
                            restaurado.replace('node_type', 'status').lower())


def test_la_precedencia_no_se_colapsa():
    """Quitar TODOS los parentesis convertiria dos reglas distintas en una."""
    assert not equivalentes('check ((a or b) and c)', 'check (a or (b and c))')


def test_solo_se_normaliza_lo_que_el_viaje_mueve():
    """Casts y parentesis sobrantes; nada mas."""
    assert canonico("(x)::text") == 'x'
    assert canonico("('A'::character varying)::text") == "'A'"
    assert canonico("((y))") == 'y'
    assert canonico("(a + b)") == '( a + b )'          # agrupacion: se conserva
    assert canonico("x::numeric(10,2)") == 'x'
    assert canonico("x::text[]") == 'x'
    assert canonico("x::text and y") == 'x and y'      # `and` no es parte del tipo


def test_una_restriccion_que_falta_sigue_faltando():
    """FITNESS 3. La forma canonica no puede inventar lo que no esta."""
    esperadas = {p[0].lower() for p in PAREJAS_MEDIDAS}
    presentes = {p[1].lower() for p in PAREJAS_MEDIDAS[1:]}     # falta la primera
    formas = {bootstrap_esquema._clave('restriccion', n) for n in presentes}
    faltan = [n for n in esperadas
              if bootstrap_esquema._clave('restriccion', n) not in formas]
    assert len(faltan) == 1
    assert 'node_type' in faltan[0]


def test_las_familias_que_no_son_restricciones_se_comparan_igual_que_antes():
    """No se toca tablas, columnas, indices, funciones ni extensiones."""
    for tipo in ('tabla', 'columna', 'indice', 'funcion', 'extension'):
        assert bootstrap_esquema._clave(tipo, 'x::text (y)') == 'x::text (y)'
    assert bootstrap_esquema._clave('restriccion', 'x::text (y)') != 'x::text (y)'


def test_el_candado_de_estados_conserva_su_interruptor(monkeypatch):
    """FITNESS 4. `_exigible` mira el TEXTO original, no la forma canonica.

    Si se le pasara la forma canonica, el fragmento `file_nodes CHECK (((status)`
    no casaria y el objeto condicional volveria a exigirse siempre -- que es el
    fallo que tumbo produccion el 20-ago-2026.
    """
    condicional = ("file_nodes CHECK (((status)::text = ANY ((ARRAY['WIP'::character varying, "
                   "'SHARED'::character varying])::text[])))").lower()
    monkeypatch.delenv('ECD_CANDADO_ESTADOS', raising=False)
    assert not bootstrap_esquema._exigible('restriccion', condicional)
    monkeypatch.setenv('ECD_CANDADO_ESTADOS', 'true')
    assert bootstrap_esquema._exigible('restriccion', condicional)
    monkeypatch.setenv('ECD_CANDADO_ESTADOS', 'false')
    assert not bootstrap_esquema._exigible('restriccion', condicional)


def test_el_candado_no_tapa_a_las_demas(monkeypatch):
    monkeypatch.delenv('ECD_CANDADO_ESTADOS', raising=False)
    for original, _ in PAREJAS_MEDIDAS:
        if 'file_nodes check (((status)' in original.lower():
            continue
        assert bootstrap_esquema._exigible('restriccion', original.lower())


def test_la_herramienta_de_recuperacion_reescribe_a_la_forma_de_produccion():
    """La unidad del rollback: `= ANY (ARRAY[...])` vuelve a `IN (...)`.

    Medido sobre PostgreSQL 18: `IN` con literales desnudos reproduce la forma
    original; reinyectar el texto deparseado NO. Sin esto, una recuperacion al
    baseline `3e413cd` --que lleva el verificador antiguo, el que compara texto
    exacto-- volveria a quedarse sin arrancar.
    """
    import importlib.util
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'herramientas', 'verificar_restauracion.py')
    especificacion = importlib.util.spec_from_file_location('verificar_restauracion', ruta)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)

    _, restaurado = PAREJAS_MEDIDAS[0]
    cuerpo, sufijo = modulo._cuerpo(restaurado[len('file_nodes '):])
    assert sufijo == ''
    reescrito = modulo._a_in(cuerpo)
    assert reescrito is not None, 'no reconocio la forma = ANY (ARRAY[...])'
    assert ' in ( ' in reescrito
    assert 'any' not in reescrito and 'array' not in reescrito
    assert "'FOLDER'" in reescrito and "'FILE'" in reescrito     # literales intactos

    # y sobre lo que no es un IN disfrazado, no toca nada
    assert modulo._a_in('x > 0') is None
