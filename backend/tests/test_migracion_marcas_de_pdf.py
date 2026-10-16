# -*- coding: utf-8 -*-
"""La migracion 32 (marcas de PDF por UUID) puede ejecutarse (16-sep-2026).

QUE PASA HOY EN PRODUCCION
--------------------------
Cada apertura de un plano deja en el log:

    ERROR [db] invalid input syntax for type integer:
      "008db2c7-779a-4e6b-9872-7f5bf4148aca"
      File "backend/routes/pdf_tools.py", line 134, in list_markups

`pdf_markups.file_node_id` y `pdf_calibrations.file_node_id` son INTEGER y
`file_nodes.id` es UUID: las marcas y las calibraciones de un plano no se leen
ni se guardan nunca. El codigo trae la conversion (`_migrar_a_uuid`), pero
cuelga de una funcion con `@solo_con_ddl` y con el esquema congelado --que es
como corre produccion-- no se ejecuta jamas. De ahi la migracion a mano.

POR QUE ESTA PRUEBA ES ESTATICA
-------------------------------
Igual que `test_guiones_de_identidades.py`: no hay produccion desde local y
este guion se ejecuta UNA vez, a mano y sin red. Que falle aqui es mas barato
que descubrirlo a medias.

ADEMAS SE EJECUTO DE VERDAD, el 16-sep-2026, contra un PostgreSQL 18 de usar y
tirar levantado con `initdb` en el directorio temporal, reproduciendo el
esquema de hoy (INTEGER, con `idx_pdf_markups_node_page`, `idx_markups_publicado`
y la clave primaria de `pdf_calibrations`). Nueve comprobaciones, todas en
verde: la guardia de rol aborta como `postgres`; una fila rebelde (123) aborta
sin tocar el tipo; la conversion deja las dos columnas en `uuid`; los cuatro
indices sobreviven; la consulta REAL de `list_markups` devuelve la fila con un
UUID; volver a correrla no rompe; el rollback con datos aborta; y vacia, vuelve
a INTEGER.
"""
import os
import re

SQL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sql')
IDA = '32_marcas_de_pdf_por_uuid.sql'
VUELTA = '32_marcas_de_pdf_por_uuid_rollback.sql'


def _leer(nombre):
    with open(os.path.join(SQL, nombre), encoding='utf-8') as f:
        return f.read()


def _sentencias(texto):
    """Lineas ejecutables: sin comentarios ni lineas en blanco.

    Las cabeceras citan a proposito el error y el SQL de comprobacion, asi que
    mirar el fichero entero daria falsos positivos.
    """
    return [l.strip() for l in texto.split('\n')
            if l.strip() and not l.strip().startswith('--')]


def test_las_dos_mitades_existen():
    """AGENTS.md 4.3: cada migracion lleva su rollback."""
    for nombre in (IDA, VUELTA):
        assert os.path.exists(os.path.join(SQL, nombre)), nombre


def test_el_numero_32_no_estaba_cogido():
    otros = [f for f in os.listdir(SQL)
             if f.startswith('32_') and f not in (IDA, VUELTA)]
    assert not otros, 'el 32 ya estaba usado por %s' % otros


def test_las_dos_exigen_ecd_migrator():
    """«No uses postgres por comodidad. DDL solo como ecd_migrator.»"""
    for nombre in (IDA, VUELTA):
        cuerpo = '\n'.join(_sentencias(_leer(nombre)))
        assert "current_user <> 'ecd_migrator'" in cuerpo, nombre
        assert 'RAISE EXCEPTION' in cuerpo, nombre


def test_van_dentro_de_una_transaccion_con_topes():
    """Sin topes, un ALTER espera a un lock indefinidamente y cuelga la base."""
    for nombre in (IDA, VUELTA):
        ejecutables = _sentencias(_leer(nombre))
        assert ejecutables[0].upper().startswith('BEGIN'), nombre
        assert any(s.upper().startswith('COMMIT') for s in ejecutables), nombre
        cuerpo = '\n'.join(ejecutables)
        assert 'lock_timeout' in cuerpo and 'statement_timeout' in cuerpo, nombre


def test_la_ida_no_borra_ni_reescribe_ninguna_fila():
    """Convierte el tipo y nada mas. Nunca «arregla» datos que no entiende."""
    cuerpo = '\n'.join(_sentencias(_leer(IDA))).upper()
    for prohibido in ('DELETE FROM', 'TRUNCATE', 'DROP TABLE', 'UPDATE '):
        assert prohibido not in cuerpo, '%s aparece en la ida' % prohibido


def test_la_ida_aborta_si_alguna_fila_no_convierte():
    """Una huerfana con file_node_id = 123 no puede volverse UUID por decreto."""
    cuerpo = '\n'.join(_sentencias(_leer(IDA)))
    assert 'PDF_UUID_DATOS' in cuerpo
    assert re.search(r'RAISE EXCEPTION\s+\'PDF_UUID_DATOS', cuerpo)


def test_la_ida_convierte_las_dos_tablas():
    cuerpo = '\n'.join(_sentencias(_leer(IDA)))
    assert "ARRAY['pdf_markups', 'pdf_calibrations']" in cuerpo
    assert 'TYPE UUID USING file_node_id::text::uuid' in cuerpo


def test_la_ida_no_hace_nada_si_ya_esta_migrado():
    """Se ejecuta a mano: repetirla por error no puede romper nada."""
    cuerpo = '\n'.join(_sentencias(_leer(IDA)))
    assert "IF tipo = 'uuid' THEN" in cuerpo and 'CONTINUE' in cuerpo


def test_el_rollback_se_niega_a_perder_marcas():
    """Un UUID no cabe en un INTEGER: volver atras con filas es perderlas."""
    cuerpo = '\n'.join(_sentencias(_leer(VUELTA)))
    assert 'PDF_UUID_ROLLBACK' in cuerpo
    assert 'filas > 0' in cuerpo
    assert 'DELETE FROM' not in cuerpo.upper()
