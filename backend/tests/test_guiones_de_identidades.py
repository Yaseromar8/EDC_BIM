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


def test_la_convergencia_conserva_sus_piezas_de_seguridad():
    """Lo que se puede comprobar sin base: que no se caiga ninguna guardia.

    ESTA PRUEBA FIJABA EL DEFECTO. Hasta el 21-ago-2026 exigia literalmente
    `pg_get_userbyid(c.relowner)='ecd_app'` en el guion -- o sea, exigia que
    siguiera mirando SOLO los objetos de `ecd_app`. En una instancia que nunca
    tuvo identidades separadas no hay ninguno: los tiene `postgres`. La
    convergencia recorria cero filas, y esta prueba estaba verde.

    Un control que se describe por INTENCION en vez de por COMPORTAMIENTO no
    controla nada. El comportamiento lo mide `ensayo_de_convergencia.py` contra
    PostgreSQL: cuatro rondas, reproducibilidad, idempotencia y fail-closed.
    """
    texto = _leer('05_convergencia_propiedad.sql')
    assert 'ON_ERROR_STOP' in texto
    assert 'lock_timeout' in texto
    assert 'OWNER TO ecd_migrator' in texto
    assert 'REVOKE CREATE ON SCHEMA public, ai_brain FROM PUBLIC' in texto
    assert 'REVOKE CREATE ON SCHEMA public, ai_brain FROM ecd_app' in texto
    # La postcondicion mide LO QUE SE PERSIGUE, no lo mismo que el bucle.
    assert 'Quedan objetos aplicativos fuera de ecd_migrator' in texto
    # Y la parada ante lo desconocido sigue ahi.
    assert 'CONVERGENCIA DETENIDA' in texto


def test_la_convergencia_no_toca_objetos_de_extension():
    """La pertenencia se lee del catalogo, nunca de nombres.

    De las 38 funciones de `public`, 37 son de `pgcrypto`. Apropiarselas
    romperia el modelo de extensiones: `pg_dump` no emite esos cambios de dueño
    y un `DROP/CREATE EXTENSION` los deshace.

    Cada bucle que transfiere propiedad tiene que excluirlas, y la exclusion se
    escribe siempre igual: `deptype='e'` y `d.refobjid IS NULL`.
    """
    texto = _leer('05_convergencia_propiedad.sql')
    assert texto.count("deptype='e'") >= 3, (
        'algun bucle de transferencia dejo de excluir a los miembros de '
        'extension')
    assert 'd.refobjid IS NULL' in texto
    # Y nunca por nombre. En los COMENTARIOS se cita `pgcrypto` a proposito
    # --explicar cual es el caso real vale-- pero ninguna SENTENCIA puede
    # depender del nombre de una extension concreta.
    ejecutable = ' | '.join(_sentencias(texto))
    assert 'pgcrypto' not in ejecutable, (
        'la exclusion no puede depender del nombre de una extension concreta')


def test_el_ejecutor_administrativo_es_de_una_sola_vez_y_preserva_invariantes():
    ruta = os.path.join(os.path.dirname(SQL), 'herramientas',
                        'converger_propiedad.py')
    texto = open(ruta, encoding='utf-8').read()
    assert "CONFIRMAR_CONVERGENCIA_PROPIEDAD') != 'SI_UNA_VEZ'" in texto
    assert "sesion != 'postgres' or actual != 'postgres'" in texto
    assert 'antes = tomar()' in texto and 'despues = tomar()' in texto
    assert '_invariantes_preservadas(antes, despues)' in texto
    assert 'bootstrap.exigir_identidad_migrador()' in texto
    assert 'bootstrap.aplicar_grants_aplicacion()' in texto


def test_el_set_role_de_la_migracion_no_depende_de_PGOPTIONS():
    """El otro defecto que esta prueba fijaba.

    Exigia literalmente `os.environ['PGOPTIONS'] = '-c role=ecd_migrator'`, que
    es la linea que NO funcionaba: libpq da precedencia al parametro `options`
    de la conexion sobre la variable de entorno, y `db.py` siempre pasa uno.
    Medido con el mismo PGOPTIONS en los tres casos:

        sin `options=`                 -> ('postgres', 'ecd_migrator')
        con `options=` (lo de db.py)   -> ('postgres', 'postgres')
        con `options=` incluyendo role -> ('postgres', 'ecd_migrator')

    La migracion corria como `postgres`, la guardia del bootstrap lo detectaba y
    abortaba -- DESPUES de que la transaccion de propiedad hubiera confirmado.
    """
    import db
    ruta = os.path.join(os.path.dirname(SQL), 'herramientas',
                        'converger_propiedad.py')
    texto = open(ruta, encoding='utf-8').read()
    assert "os.environ['PGOPTIONS']" not in texto, (
        'PGOPTIONS no llega: `db.py` pasa `options=` en la conexion y libpq le '
        'da precedencia')
    assert 'role=ecd_migrator' in texto and 'opciones=' in texto, (
        'el SET ROLE tiene que viajar DENTRO de las opciones de la conexion')
    # Y sin perder las que ya habia.
    assert 'OPCIONES_DE_CONEXION' in texto
    assert 'statement_timeout' in db.OPCIONES_DE_CONEXION
    assert 'lock_timeout' in db.OPCIONES_DE_CONEXION


def test_la_conexion_ordinaria_no_lleva_SET_ROLE():
    """`init_db_pool()` sin argumento se comporta como siempre.

    El parametro existe solo para la convergencia. Si alguna vez alguien le
    pusiera un valor por defecto con `role=`, TODAS las conexiones del backend
    cambiarian de identidad sin que nadie lo notara.
    """
    import inspect
    import db
    firma = inspect.signature(db.init_db_pool)
    assert firma.parameters['opciones'].default is None
    assert 'role=' not in db.OPCIONES_DE_CONEXION
