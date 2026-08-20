# -*- coding: utf-8 -*-
"""¿Se puede volver a levantar el ECD desde una base vacia? (hallazgo N2)

Es la pregunta que sostiene todas las demas. Un expediente del que no se puede
demostrar que se restaura no esta respaldado: esta guardado, que no es lo mismo.

LO QUE SE MIDIO EL 15-ago-2026
------------------------------
Reconstruyendo el esquema completo en un espacio vacio (pg_temp, que es lo mas
cerca de una base vacia a lo que se puede llegar sin permisos que la aplicacion
no debe tener):

    ANTES   33 de 37 rutinas · 13 tablas sin crear
    DESPUES 37 de 37 rutinas ·  4 tablas sin crear (y esas 4 por un permiso del
                                usuario de prueba, no por el codigo)

Nueve de las trece faltaban por UNA linea mal colocada: dentro de
`ensure_file_nodes_table`, la seccion «1.5» hacia `ALTER TABLE activity_log`
cien lineas ANTES de que esa misma funcion creara `activity_log`. Sobre una base
que ya tiene datos no se nota -- la tabla existe de antes -- pero sobre una
vacia el ALTER revienta, se lleva la transaccion entera, y la funcion no llega a
crear NADA: ni file_nodes, ni file_versions, ni el propio activity_log, ni
document_shares, ni upload_sessions, ni app_tokens, ni project_settings.

O sea: el arbol documental del ECD -- el ECD -- no se podia construir desde cero.

Estas pruebas no levantan una base: fijan el ORDEN, que es lo que se rompio. Son
estaticas a proposito, para que corran siempre y no solo cuando hay Postgres.
"""
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _fuente(nombre):
    return io.open(os.path.join(BACKEND, nombre), encoding='utf-8').read()


def _cuerpo_de(fuente, funcion):
    i = fuente.index('def %s(' % funcion)
    j = fuente.find('\ndef ', i + 1)
    return fuente[i:j if j > 0 else len(fuente)]


def test_la_cadena_de_auditoria_se_pone_DESPUES_de_crear_activity_log():
    """Esta es la linea que impedia reconstruir el ECD. Si alguien la vuelve a
    subir, esta prueba lo dice antes de que nadie intente una restauracion."""
    cuerpo = _cuerpo_de(_fuente('db.py'), 'ensure_file_nodes_table')
    crea = cuerpo.index('CREATE TABLE IF NOT EXISTS activity_log')
    altera = cuerpo.index('asegurar_columnas(cursor)')
    assert crea < altera, (
        'asegurar_columnas() hace ALTER TABLE activity_log y va ANTES de que '
        'esta funcion cree la tabla: sobre una base vacia aborta la transaccion '
        'y no se crea ni file_nodes ni file_versions ni activity_log')


def test_lo_que_toca_tablas_ajenas_va_al_final_del_bootstrap():
    """`ensure_project_identity_columns` añade columnas e indices a tablas que
    crean OTRAS rutinas. Estaba antes que `tracking_pins`, y su indice se perdia
    en silencio porque la rutina se traga el error."""
    boot = _fuente('bootstrap_esquema.py')
    orden = [m.group(1) for m in re.finditer(r"\(\s*'([a-z0-9_]+)'\s*,\s*\w+\)", boot)]
    assert 'project_identity' in orden and 'tracking_pins' in orden
    assert orden.index('project_identity') > orden.index('tracking_pins'), (
        'project_identity indexa tracking_pins: no puede correr antes de que '
        'exista')


def test_las_columnas_pendientes_siguen_siendo_las_ultimas():
    boot = _fuente('bootstrap_esquema.py')
    orden = [m.group(1) for m in re.finditer(r"\(\s*'([a-z0-9_]+)'\s*,\s*\w+\)", boot)]
    assert orden[-1] == 'columnas_pendientes'


def test_el_bootstrap_cubre_las_tablas_que_el_codigo_sabe_crear():
    """Una tabla que solo se crea «cuando alguien entra por su ruta» deja la
    base recien restaurada incompleta hasta que se usa -- y asi es como se
    descubre tarde, el dia que hace falta.

    Se compara contra `esquema_manifiesto.txt`, que NO esta escrito a mano: se
    genera midiendo una reconstruccion de verdad en un espacio vacio. Si alguien
    añade una familia de tablas y no la enchufa al arranque, esto lo dice aqui.
    """
    manifiesto = set()
    for linea in _fuente('esquema_manifiesto.txt').splitlines():
        linea = linea.strip()
        if linea and not linea.startswith('#'):
            manifiesto.add(linea.lower())
    assert len(manifiesto) > 80, 'el manifiesto parece vacio o truncado'

    declaradas = set()
    for raiz, _dirs, ficheros in os.walk(BACKEND):
        if any(x in raiz for x in ('venv', 'tests', '__pycache__')):
            continue
        for f in ficheros:
            if not f.endswith('.py'):
                continue
            src = io.open(os.path.join(raiz, f), encoding='utf-8', errors='ignore').read()
            for m in re.finditer(r'CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][\w.]*)', src):
                declaradas.add(m.group(1).split('.')[-1].lower())

    # Las del esquema `ai_brain`: el bootstrap SI las crea, pero hacen falta
    # permisos de CREATE SCHEMA que el usuario de aplicacion no tiene ni debe
    # tener, asi que no aparecen al medir con el. Se declaran, no se ocultan.
    del_esquema_ai = {'feedback_buffer', 'global_knowledge', 'semantic_triples'}
    # `ia_documentos_preparados` ESTUVO aqui, con el motivo de que era del
    # esquema `ai_brain`. Era falso: las otras tres se crean cualificadas
    # (`ai_brain.global_knowledge`, db.py:705) y esta no (routes/ai.py:117),
    # asi que cae en `public` y el bootstrap no la creaba. La exclusion tapaba
    # el unico hueco de tabla que esta prueba existia para encontrar. Ahora la
    # crea el bootstrap y no hace falta excluir nada.

    huerfanas = sorted(declaradas - manifiesto - del_esquema_ai)
    assert not huerfanas, (
        'estas tablas no las construye el bootstrap, asi que una base '
        'restaurada se queda sin ellas hasta que alguien entre por su ruta: '
        + ', '.join(huerfanas))


# ── El codigo de salida del guion ─────────────────────────────────────────
#
# De el depende que un despliegue siga adelante o se pare, asi que tiene que
# mirar lo correcto. Y la ayuda del guion promete «codigo 1 si algo falta»:
# devolver siempre 0 convertia `--verificar` en un adorno que ademas tranquiliza.

def test_la_comprobacion_devuelve_codigo_segun_lo_que_encuentra():
    fuente = _fuente('bootstrap_esquema.py')
    main = fuente[fuente.index("if __name__ == '__main__':"):]
    assert 'SystemExit(0 if completo else 1)' in main, (
        '--verificar tiene que devolver 1 cuando falta algo, como promete su ayuda')


def test_el_codigo_de_salida_mira_el_RESULTADO_y_no_los_fallos():
    """Con las identidades separadas, `ecd_app` no es dueña de todas las tablas
    y sus ALTER son rechazados: medido en local, 8 «fallos» con el esquema
    COMPLETO (87 de 87). Si el codigo mirara los fallos, este guion tumbaria
    cada despliegue justo cuando la separacion empiece a funcionar.

    Y al reves seria peor: dar por bueno un esquema incompleto porque ninguna
    rutina «fallo» es como se llego a N57."""
    fuente = _fuente('bootstrap_esquema.py')
    main = fuente[fuente.index("if __name__ == '__main__':"):]
    assert 'SystemExit(1 if (fallos or not completo) else 0)' not in main
    assert main.count('SystemExit(0 if completo else 1)') == 2


def test_la_comprobacion_compara_con_nombre_y_no_cuenta():
    """Contar engaña: 81 tablas suena a completo y puede faltar justo
    `file_nodes`, que es lo unico que importa. Paso de verdad: la version que
    contaba imprimia «resolve_folder_path: FALTA» y devolvia 0.

    Se comprueba el COMPORTAMIENTO, no el texto del codigo: la version anterior
    de esta prueba exigia la cadena literal 'esperadas - presentes', asi que
    renombrar una variable la ponia en rojo sin que nada se hubiera roto -- y
    peor: alguien podia dejarla verde escribiendo esa cadena en un comentario.
    """
    import bootstrap_esquema as be
    faltan = be._objetos_esperados()
    assert faltan is not None, 'falta esquema_objetos.txt'
    # Presente = lo esperado MENOS un objeto conocido. Debe salir ese y solo ese.
    presente = {t: set(v) for t, v in faltan.items()}
    presente['columna'].discard('totp_recuperacion.pimienta')
    diferencia = sorted(faltan['columna'] - presente['columna'])
    assert diferencia == ['totp_recuperacion.pimienta'], (
        'la comprobacion tiene que decir QUE falta, por nombre, no cuantos hay')


def test_la_comprobacion_mira_columnas_y_no_solo_tablas():
    """Una tabla presente con una columna ausente es un fallo DIFERIDO.

    Paso de verdad el 19-ago-2026: el bootstrap imprimio «88 de 88 · el esquema
    quedo COMPLETO» sobre una base sin `totp_recuperacion.pimienta`. La tabla
    estaba; la columna no. Activar el segundo factor devolvia HTTP 500, y no el
    dia del despliegue sino meses despues, el dia que un administrador intenta
    protegerse la cuenta. Contar cajas no es mirar dentro.
    """
    import bootstrap_esquema as be
    esperado = be._objetos_esperados()
    assert esperado is not None, 'falta esquema_objetos.txt'
    for tipo in ('tabla', 'columna', 'restriccion', 'indice', 'funcion', 'extension'):
        assert esperado[tipo], 'el manifiesto no exige ningun objeto de tipo %s' % tipo
    # Las piezas sin las cuales el segundo factor no puede activarse.
    assert 'totp_recuperacion.pimienta' in esperado['columna']
    assert 'users.totp_secreto' in esperado['columna']
    assert 'users.totp_activo' in esperado['columna']
    assert 'users.totp_ultimo_paso' in esperado['columna']
    assert 'totp_recuperacion' in esperado['tabla']


# ── El decorador solo donde construye esquema ─────────────────────────────

# Excepciones, una a una y con motivo. Una lista de excepciones sin motivo
# escrito acaba siendo el sitio donde se esconde el siguiente fallo.
EXCEPCIONES = {
    # No construye nada: comprueba con `to_regclass` si el esquema de LOB4D
    # (que gobierna Alembic, no este bootstrap) esta puesto, e imprime un aviso
    # si falta. Con el interruptor apagado se omite ESA COMPROBACION, y omitir
    # una comprobacion no rompe ninguna funcionalidad. Se queda decorada para
    # no gastar una consulta por peticion en produccion.
    'ensure_lob4d_tables',
}

DDL = ('CREATE TABLE', 'ALTER TABLE', 'CREATE INDEX', 'CREATE UNIQUE INDEX',
       'CREATE SCHEMA', 'CREATE EXTENSION', 'CREATE OR REPLACE FUNCTION',
       'CREATE TYPE', 'DROP TABLE', 'DROP INDEX', 'DROP CONSTRAINT')


def _funciones_del_backend():
    """(nombre, fuente, decorada, fichero, constantes_ddl) por funcion.

    `constantes_ddl` son los nombres de nivel de modulo cuyo valor lleva DDL --
    `esquema_base.TABLAS` es una tupla de sentencias y la funcion solo la
    recorre, asi que su propio cuerpo no contiene ni un CREATE.
    """
    import ast
    for raiz, _dirs, ficheros in os.walk(BACKEND):
        if any(x in raiz for x in ('venv', 'tests', '__pycache__')):
            continue
        for f in sorted(ficheros):
            if not f.endswith('.py'):
                continue
            ruta = os.path.join(raiz, f)
            src = io.open(ruta, encoding='utf-8', errors='ignore').read()
            try:
                arbol = ast.parse(src)
            except SyntaxError:
                continue
            constantes = set()
            for nodo in arbol.body:
                if not isinstance(nodo, (ast.Assign, ast.AnnAssign)):
                    continue
                valor = ast.get_source_segment(src, nodo) or ''
                if not any(k in valor.upper() for k in DDL):
                    continue
                destinos = nodo.targets if isinstance(nodo, ast.Assign) else [nodo.target]
                for d in destinos:
                    if isinstance(d, ast.Name):
                        constantes.add(d.id)
            for nodo in ast.walk(arbol):
                if not isinstance(nodo, ast.FunctionDef):
                    continue
                nombres = {d.id for d in nodo.decorator_list if isinstance(d, ast.Name)}
                yield (nodo.name, ast.get_source_segment(src, nodo) or '',
                       'solo_con_ddl' in nombres, os.path.relpath(ruta, BACKEND),
                       constantes)


def test_solo_con_ddl_solo_donde_hay_ddl():
    """@solo_con_ddl sobre una funcion que NO construye esquema la deja muda.

    Esto no es teorico. `ensure_project_root_node` llevaba el decorador y su
    cuerpo es SELECT/INSERT/UPDATE: crea la FILA de la carpeta raiz de cada
    obra, no una tabla. Con DDL_EN_CALIENTE=false el envoltorio devuelve None
    sin entrar, asi que el listado documental de TODAS las obras se habria
    quedado sin raiz -- y el interruptor se vende como una medida que saca el
    DDL del tiempo de ejecucion, no como una que se lleva datos por delante.

    Se acepta que la funcion delegue: si llama a otra que si tiene DDL, vale.
    """
    funciones = list(_funciones_del_backend())
    con_ddl = {n for n, src, _dec, _f, _c in funciones
               if any(k in src.upper() for k in DDL)}

    mudas = []
    for nombre, src, decorada, fichero, constantes in funciones:
        if not decorada:
            continue
        if any(k in src.upper() for k in DDL):
            continue
        if any(otra + '(' in src for otra in con_ddl if otra != nombre):
            continue          # delega en alguien que si construye esquema
        if any(c in src for c in constantes):
            continue          # recorre una constante de sentencias
        if nombre in EXCEPCIONES:
            continue
        mudas.append('%s (%s)' % (nombre, fichero))

    assert not mudas, (
        'estas funciones llevan @solo_con_ddl y no construyen esquema, asi que '
        'con DDL_EN_CALIENTE=false devolveran None sin hacer su trabajo: '
        + ', '.join(sorted(mudas)))


def test_ningun_ddl_sin_guardia_en_camino_de_peticion():
    """DDL suelto dentro de un manejador HTTP escapa al interruptor.

    Mientras exista uno, `DDL_EN_CALIENTE=false` no consigue lo que promete:
    la aplicacion sigue necesitando ser PROPIETARIA de esa tabla, y la
    separacion de identidades -- que es la unica razon de ser del interruptor --
    queda de nombre. `urn_aps` era ese: un ALTER sin condicionar dentro del
    manejador que publica un modelo al visor.

    Se admite si va condicionado a `ddl_permitido()`, como el de
    `civil_base_axis`: ahi el interruptor SI manda.
    """
    import ast
    DDL_RUTA = ('CREATE TABLE', 'ALTER TABLE', 'CREATE INDEX', 'DROP TABLE')
    sueltos = []
    for raiz, _dirs, ficheros in os.walk(BACKEND):
        if any(x in raiz for x in ('venv', 'tests', '__pycache__')):
            continue
        for f in sorted(ficheros):
            if not f.endswith('.py'):
                continue
            ruta = os.path.join(raiz, f)
            src = io.open(ruta, encoding='utf-8', errors='ignore').read()
            try:
                arbol = ast.parse(src)
            except SyntaxError:
                continue
            for n in ast.walk(arbol):
                if not isinstance(n, ast.FunctionDef):
                    continue
                if not any('.route(' in (ast.get_source_segment(src, d) or '')
                           for d in n.decorator_list):
                    continue
                cuerpo = ast.get_source_segment(src, n) or ''
                if not any(k in cuerpo.upper() for k in DDL_RUTA):
                    continue
                if 'ddl_permitido()' in cuerpo:
                    continue          # el interruptor manda: correcto
                sueltos.append('%s:%s' % (os.path.relpath(ruta, BACKEND), n.name))

    assert not sueltos, (
        'DDL sin guardia dentro de un manejador HTTP: el interruptor no lo tapa '
        'y la aplicacion sigue necesitando privilegio de esquema en produccion: '
        + ', '.join(sorted(sueltos)))


def test_las_columnas_se_miran_en_el_CATALOGO_no_en_information_schema():
    """`information_schema` FILTRA POR PRIVILEGIOS. El catalogo, no.

    Paso de verdad el 19-ago-2026: contra la base de desarrollo, `ecd_app` no
    tiene permiso sobre el esquema `ai_brain`, asi que information_schema
    devolvia CERO columnas de global_knowledge, semantic_triples y
    feedback_buffer -- 26 columnas que estaban perfectamente ahi. La
    comprobacion las cantaba como ausentes y habria tumbado el despliegue por
    la separacion de identidades funcionando, que es justo lo contrario de lo
    que persigue.
    """
    import bootstrap_esquema as be
    sql = be._CONSULTAS['columna']
    assert 'information_schema' not in sql, (
        'information_schema filtra por privilegios: no sirve para inventariar')
    assert 'pg_attribute' in sql, 'las columnas salen del catalogo'
    assert 'attisdropped' in sql, 'una columna borrada no cuenta como presente'


def test_lo_condicional_solo_se_exige_si_su_interruptor_esta_puesto():
    """El manifiesto se congela con la configuracion recomendada, asi que un
    objeto que solo existe con su interruptor puesto queda dentro como si fuera
    obligatorio siempre. El CHECK de estados lo crea ECD_CANDADO_ESTADOS=true;
    exigirlo a secas tumbaba la comprobacion en cualquier instancia que
    legitimamente corra sin el.

    Exigir de mas es tan malo como exigir de menos: la primera vez que una
    comprobacion falla por algo que no esta mal, se empieza a ignorar.
    """
    import os
    import bootstrap_esquema as be
    # El candado se identifica por su DEFINICION, no por su nombre: ver
    # test_las_restricciones_se_comparan_por_lo_que_HACEN_no_por_su_nombre.
    tipos = {t for t, _frag, _sw in be._CONDICIONALES}
    assert 'restriccion' in tipos
    candado = ("file_nodes CHECK (((status)::text = ANY ((ARRAY['WIP'::character "
               "varying, 'SHARED'::character varying, 'PUBLISHED'::character "
               "varying, 'ARCHIVED'::character varying])::text[])))")

    antes = os.environ.get('ECD_CANDADO_ESTADOS')
    try:
        os.environ['ECD_CANDADO_ESTADOS'] = 'false'
        assert be._exigible('restriccion', candado) is False
        os.environ['ECD_CANDADO_ESTADOS'] = 'true'
        assert be._exigible('restriccion', candado) is True
        # Lo que NO es condicional se exige siempre.
        assert be._exigible('columna', 'totp_recuperacion.pimienta') is True
    finally:
        if antes is None:
            os.environ.pop('ECD_CANDADO_ESTADOS', None)
        else:
            os.environ['ECD_CANDADO_ESTADOS'] = antes


def test_las_restricciones_se_comparan_por_lo_que_HACEN_no_por_su_nombre():
    """Una misma regla puede llamarse de dos maneras segun como nacio la tabla.

    Paso de verdad, y TUMBO EL DESPLIEGUE DE PRODUCCION el 20-ago-2026:

      base nueva  -> `UNIQUE (model_urn, external_id)` dentro del CREATE TABLE
                     (esquema_base.py:241). Postgres la autonombra
                     `inventory_assets_model_urn_external_id_key`.
      produccion  -> la misma regla, puesta despues por una migracion con nombre
                     explicito: `inventory_assets_modelext_key`
                     (routes/inventory.py:50), porque su tabla es anterior.

    Misma garantia, dos nombres. Comparando NOMBRES, produccion "faltaba" algo
    que tenia, el arranque devolvia 1 y el servicio no llego a servir. Comparar
    por definicion es lo unico que no depende de como nacio la tabla.

    Un indice de UNIQUE hereda el nombre de su restriccion, asi que arrastraba
    exactamente el mismo falso positivo: por eso tambien va normalizado.
    """
    import bootstrap_esquema as be
    sql_r = be._CONSULTAS['restriccion']
    assert 'pg_get_constraintdef' in sql_r, (
        'la restriccion se identifica por lo que impone, no por como se llama')
    # OJO con la comprobacion ingenua: `connamespace` CONTIENE `conname`, asi que
    # buscar 'conname' a secas da falso positivo. Lo que no puede aparecer es el
    # nombre CONCATENADO en el resultado.
    assert '|| c.conname' not in sql_r, 'el nombre no puede entrar en la comparacion'

    sql_i = be._CONSULTAS['indice']
    assert 'regexp_replace' in sql_i and 'indexdef' in sql_i, (
        'del indice importa la tabla y las columnas, no su nombre')
    assert "SELECT indexname" not in sql_i


def test_el_manifiesto_no_guarda_nombres_de_restricciones_ni_de_indices():
    """Si el manifiesto congelara nombres, el arreglo de arriba no serviria de
    nada: la comparacion seria por definicion contra una lista de nombres."""
    import bootstrap_esquema as be
    esperado = be._objetos_esperados()
    assert esperado is not None
    for n in esperado['restriccion']:
        assert ' ' in n, 'una restriccion se guarda como «tabla DEFINICION»'
    for n in esperado['indice']:
        assert n.startswith('create '), 'un indice se guarda como su sentencia'
        assert ' index on ' in n, 'la sentencia va sin el nombre del indice'
