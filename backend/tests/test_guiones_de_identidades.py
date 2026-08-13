# -*- coding: utf-8 -*-
"""Los guiones de separacion de identidades tienen que poder ejecutarse.

BASELINE 0 · C1. Los guiones de backend/sql/ estaban escritos y documentados, y
la matriz daba por corregidos tres de sus defectos. Al leerlos de verdad el
13-ago-2026 resulto que no se habian tocado:

  1. empezaban con 34 "ALTER SEQUENCE ... OWNER TO", y las 32 secuencias de esta
     base son DEPENDIENTES de la columna serial de su tabla. PostgreSQL rechaza
     cambiarles el dueno por separado, y como todo va dentro de BEGIN...COMMIT,
     el guion abortaba en su PRIMERA sentencia y no hacia nada;
  2. ningun guion creaba los roles ecd_app ni ecd_migrator;
  3. faltaba el GRANT de pertenencia al rol destino, obligatorio desde
     PostgreSQL 16 y sin el cual, en Cloud SQL, "must be member of role";
  4. el ALTER SCHEMA estaba al final, cuando tiene que ir al principio.

Estas pruebas son estaticas a proposito: no hay produccion desde local, y estos
guiones se ejecutan UNA vez, con prisa y sin red de seguridad. Que fallen aqui
es infinitamente mas barato que descubrirlo a mitad de la migracion.
"""
import os
import re

SQL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sql')


def _leer(nombre):
    with open(os.path.join(SQL, nombre), encoding='utf-8') as f:
        return f.read()


def _sentencias(texto):
    """Lineas ejecutables, sin comentarios ni lineas en blanco."""
    return [l.strip() for l in texto.split('\n')
            if l.strip() and not l.strip().startswith('--')]


def test_no_se_intenta_cambiar_el_dueno_de_una_secuencia():
    """Era la primera sentencia del guion y lo abortaba entero. La propiedad de
    una secuencia dependiente viaja sola con la de su tabla."""
    for nombre in ('01_ownership_ida.sql', '02_ownership_vuelta.sql'):
        # Solo sentencias: la cabecera cita el fallo a proposito para explicarlo.
        ejecutables = [s for s in _sentencias(_leer(nombre)) if 'ALTER SEQUENCE' in s]
        assert not ejecutables, (
            f'{nombre} vuelve a tener ALTER SEQUENCE: abortara en la primera linea')


def test_el_esquema_se_cede_antes_que_lo_que_hay_dentro():
    for nombre in ('01_ownership_ida.sql', '02_ownership_vuelta.sql'):
        sent = _sentencias(_leer(nombre))
        esquemas = [i for i, s in enumerate(sent) if s.startswith('ALTER SCHEMA')]
        tablas = [i for i, s in enumerate(sent) if s.startswith('ALTER TABLE')]
        assert esquemas and tablas, f'{nombre}: faltan sentencias'
        assert max(esquemas) < min(tablas), (
            f'{nombre}: el ALTER SCHEMA tiene que ir ANTES que las tablas')


def test_se_gana_la_pertenencia_al_rol_destino():
    """Desde PostgreSQL 16 hay que ser miembro del rol al que se cede, y en
    Cloud SQL 'postgres' no es superusuario para saltarselo."""
    for nombre in ('01_ownership_ida.sql', '02_ownership_vuelta.sql'):
        texto = _leer(nombre)
        assert re.search(r'GRANT\s+\w+\s+TO\s+CURRENT_USER\s+WITH\s+SET\s+TRUE', texto), \
            f'{nombre}: falta el GRANT de pertenencia'


def test_existe_el_guion_que_crea_los_roles():
    """Sin el, el procedimiento no se puede ejecutar de principio a fin: los
    demas guiones daban por hecho unos roles que no creaba nadie."""
    texto = _leer('00_roles.sql')
    assert 'CREATE ROLE ecd_app' in texto
    assert 'CREATE ROLE ecd_migrator' in texto


def test_los_guiones_no_llevan_ninguna_contrasena_escrita():
    """Este repositorio es publico. Una contrasena escrita aqui nace
    comprometida: es literalmente el hallazgo 0.1 de la auditoria."""
    sospechoso = re.compile(r"PASSWORD\s+'", re.I)
    for nombre in sorted(os.listdir(SQL)):
        if not nombre.endswith('.sql'):
            continue
        texto = _leer(nombre)
        assert not sospechoso.search(texto), (
            f'{nombre} tiene una contrasena escrita en el fichero')


def test_los_guiones_paran_al_primer_error():
    """Sin ON_ERROR_STOP, psql sigue ejecutando despues de un fallo y deja la
    base a medio migrar. Ya paso una vez con los grants."""
    for nombre in ('00_roles.sql', '01_ownership_ida.sql', '02_ownership_vuelta.sql'):
        assert 'ON_ERROR_STOP' in _leer(nombre), f'{nombre}: falta ON_ERROR_STOP'


def test_la_vuelta_deshace_exactamente_lo_que_hace_la_ida():
    """Un rollback que no cubre lo mismo que la ida no es un rollback."""
    def objetos(nombre):
        salida = set()
        for s in _sentencias(_leer(nombre)):
            m = re.match(r'ALTER (TABLE|SCHEMA|FUNCTION|VIEW)\s+(.+?)\s+OWNER TO', s)
            if m:
                salida.add((m.group(1), m.group(2)))
        return salida
    ida, vuelta = objetos('01_ownership_ida.sql'), objetos('02_ownership_vuelta.sql')
    assert ida, 'la ida no tiene objetos'
    assert ida == vuelta, (
        'la ida y la vuelta no cubren los mismos objetos:\n'
        f'  solo en la ida:    {sorted(ida - vuelta)[:5]}\n'
        f'  solo en la vuelta: {sorted(vuelta - ida)[:5]}')


def test_hay_lock_timeout():
    """Una tabla bloqueada no puede dejar la migracion esperando para siempre
    con la obra parada."""
    for nombre in ('01_ownership_ida.sql', '02_ownership_vuelta.sql'):
        assert 'lock_timeout' in _leer(nombre), f'{nombre}: sin lock_timeout'
