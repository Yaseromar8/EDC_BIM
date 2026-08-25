# -*- coding: utf-8 -*-
"""GAP 01 · SUBMITTALS — someter un producto a aprobacion contra la especificacion.

LO QUE ESTE FICHERO PROTEGE, EN UNA FRASE: que el veredicto de un submittal
signifique algo. Todo lo demas de aqui deriva de eso.

Las pruebas NEGATIVAS son la mitad del fichero a proposito. Un flujo de
aprobacion se juzga por lo que NO deja hacer: si el autor puede aprobar su
propio producto, o un administrador puede firmar por el revisor, el registro
deja de probar nada aunque todas las pruebas positivas pasen.
"""
import io
import os

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── LA SEMANTICA ───────────────────────────────────────────────────────────

def test_los_estados_son_una_lista_cerrada():
    import flujo_de_submittal as s
    assert s.ESTADOS == ('Borrador', 'Enviado', 'En revision', 'Respondido',
                         'Cerrado', 'Anulado')


def test_los_veredictos_son_una_lista_cerrada():
    """Los dos fabricantes permiten respuestas personalizadas por obra. Aqui NO,
    y es deliberado: un veredicto que cada obra reescribe hace que «aprobado»
    signifique cosas distintas en dos obras de la misma entidad."""
    import flujo_de_submittal as s
    assert set(s.VEREDICTOS) == {
        'Aprobado', 'Aprobado con observaciones', 'Revisar y reenviar',
        'Rechazado', 'Solo para informacion'}


def test_solo_dos_veredictos_habilitan_instalar():
    import flujo_de_submittal as s
    assert s.habilita_instalacion('Aprobado')
    assert s.habilita_instalacion('Aprobado con observaciones')
    # «Solo para informacion» NO habilita: es exactamente lo que significa.
    assert not s.habilita_instalacion('Solo para informacion')
    assert not s.habilita_instalacion('Rechazado')
    assert not s.habilita_instalacion('Revisar y reenviar')


def test_un_veredicto_desconocido_no_autoriza_instalar_nada():
    """Fail-closed. Ante algo que no se sabe leer, no se autoriza instalar."""
    import flujo_de_submittal as s
    assert not s.habilita_instalacion('')
    assert not s.habilita_instalacion(None)
    assert not s.habilita_instalacion('Aprobadisimo')


def test_la_semantica_declara_todos_los_campos_del_contrato():
    import flujo_de_submittal as s
    import flujo_de_registro as reg
    assert set(s.SEMANTICA._fields) == set(reg.Semantica._fields)
    assert s.SEMANTICA.tabla in reg._TABLAS, (
        'la tabla tiene que estar en la lista blanca o `siguiente_codigo` revienta')


# ── NADIE DICTA EL VEREDICTO DESDE FUERA DEL FLUJO ─────────────────────────

def test_ninguna_posicion_del_registro_dicta_el_veredicto():
    """LA REGLA QUE MAS IMPORTA DE TODO EL GAP.

    En el RFI y el Red Line el veredicto lo dicta el RESPONSABLE. Aqui NO lo
    dicta nadie del registro: lo dictan los revisores paso a paso. Si el ADMIN
    estuviera en esta tupla, un administrador podria aprobar la instalacion de
    un material sin que ningun tecnico lo hubiera mirado -- y la revision
    tecnica se convertiria en un tramite.
    """
    import flujo_de_submittal as s
    assert s.SEMANTICA.quien_dicta_veredicto == ()


def test_el_admin_puede_rescatar_pero_no_aprobar():
    import flujo_de_submittal as s
    import flujo_de_registro as reg
    assert reg.ADMIN in s.SEMANTICA.quien_cierra
    assert reg.ADMIN in s.SEMANTICA.quien_pasa_la_pelota
    assert reg.ADMIN not in s.SEMANTICA.quien_dicta_veredicto


def test_solo_el_autor_envia_su_propio_submittal():
    """Si otro pudiera enviarlo, el sometimiento dejaria de tener autor."""
    import flujo_de_submittal as s
    import flujo_de_registro as reg
    assert s.SEMANTICA.quien_adopta == (reg.AUTOR,)


# ── EL CAMINO: TRANSICIONES ────────────────────────────────────────────────

def test_no_se_salta_ningun_tramo_del_camino():
    import flujo_de_submittal as s
    import flujo_de_registro as reg
    S = s.SEMANTICA
    # Lo que SI se puede
    for desde, hasta in (('Borrador', 'Enviado'), ('Enviado', 'En revision'),
                         ('En revision', 'Respondido'), ('Respondido', 'Cerrado')):
        ok, _ = reg.transicion_valida(S, desde, hasta)
        assert ok, '%s -> %s deberia poder' % (desde, hasta)
    # Lo que NO
    for desde, hasta in (('Borrador', 'Cerrado'), ('Borrador', 'En revision'),
                         ('Enviado', 'Respondido'), ('Enviado', 'Cerrado'),
                         ('En revision', 'Cerrado')):
        ok, motivo = reg.transicion_valida(S, desde, hasta)
        assert not ok, '%s -> %s NO deberia poder' % (desde, hasta)
        assert 'no puede pasar' in motivo


def test_un_submittal_cerrado_o_anulado_no_va_a_ninguna_parte():
    """Un rechazo no se reabre: se crea una REVISION, que es otra fila. Reabrir
    la misma borraria que hubo un rechazo -- y es justo lo que hay que probar."""
    import flujo_de_submittal as s
    assert s.TRANSICIONES['Cerrado'] == ()
    assert s.TRANSICIONES['Anulado'] == ()


def test_solo_dos_veredictos_obligan_a_reenviar():
    import flujo_de_submittal as s
    assert set(s.EXIGEN_REVISION) == {'Revisar y reenviar', 'Rechazado'}


# ── LA PELOTA: una sola funcion para las dos mitades ───────────────────────

class _Cur:
    """Doble minimo. Solo tiene que responder a lo que `deudor_de_submittal` usa."""
    def __init__(self, usuario_activo=True):
        self.usuario_activo = usuario_activo
        self._ultimo = ''
    def execute(self, sql, params=None):
        self._ultimo = ' '.join(sql.split()).upper()
        self._params = params
    def fetchone(self):
        if 'FROM USERS' in self._ultimo:
            return (self._params[0],) if self.usuario_activo else None
        return None
    def fetchall(self):
        return []


def _fila(estado, responsable_id=7, steps=None, paso=0):
    # (id, codigo, titulo, estado, responsable_id, steps, current_step,
    #  paso_vence_en, vence_en)
    return (1, 'SUB-001', 'Baranda tipo A', estado, responsable_id,
            steps if steps is not None else [], paso, None, None)


def test_un_borrador_no_es_deuda_de_nadie():
    """Llenar la bandeja de alguien con SUS PROPIOS borradores convierte «lo que
    me toca» en ruido -- y una bandeja con ruido deja de mirarse."""
    import encargos as enc
    uid, asunto, _ = enc.deudor_de_submittal(_Cur(), _fila('Borrador'))
    assert uid is None and asunto == ''


def test_enviado_es_deuda_del_manager():
    import encargos as enc
    uid, asunto, _ = enc.deudor_de_submittal(_Cur(), _fila('Enviado'))
    assert uid == 7
    assert 'Distribuir' in asunto


def test_en_revision_es_deuda_del_revisor_del_paso_ACTUAL():
    """Y se resuelve por `flujo_de_revision`, el MISMO modulo que usa el
    manejador. Si lo resolviera por su cuenta, el submittal y su proyeccion
    podrian discrepar sobre a quien le toca."""
    import encargos as enc
    pasos = [{'user_id': 11}, {'user_id': 22}]
    uid, asunto, _ = enc.deudor_de_submittal(_Cur(), _fila('En revision', steps=pasos, paso=1))
    assert uid == 22, 'debe ser el del paso ACTUAL, no el primero'
    assert 'paso 2' in asunto


def test_respondido_vuelve_a_ser_deuda_del_manager():
    import encargos as enc
    uid, asunto, _ = enc.deudor_de_submittal(_Cur(), _fila('Respondido'))
    assert uid == 7
    assert 'Cerrar y distribuir' in asunto


def test_cerrado_y_anulado_no_deben_nada():
    import encargos as enc
    for estado in ('Cerrado', 'Anulado'):
        uid, _, _ = enc.deudor_de_submittal(_Cur(), _fila(estado))
        assert uid is None, '%s no debe nada' % estado


def test_sin_manager_no_se_inventa_un_deudor():
    import encargos as enc
    uid, _, _ = enc.deudor_de_submittal(_Cur(), _fila('Enviado', responsable_id=None))
    assert uid is None


def test_un_paso_que_no_existe_no_revienta_la_conciliacion():
    """`current_step` fuera de rango es un dato roto; la conciliacion tiene que
    poder seguir con los demas submittals en vez de caerse entera."""
    import encargos as enc
    uid, _, _ = enc.deudor_de_submittal(_Cur(), _fila('En revision', steps=[], paso=3))
    assert uid is None


def test_un_revisor_dado_de_baja_no_deja_deuda_fantasma():
    import encargos as enc
    cur = _Cur(usuario_activo=False)
    uid, _, _ = enc.deudor_de_submittal(cur, _fila('En revision',
                                                   steps=[{'user_id': 11}]))
    assert uid is None


# ── LAS DOS MITADES USAN EL MISMO CRITERIO ─────────────────────────────────

def test_las_dos_mitades_de_la_conciliacion_llaman_a_la_MISMA_funcion():
    """La conciliacion del RFI OSCILO en su dia porque `_faltantes` y
    `_sigue_debiendose` usaban criterios PARECIDOS pero distintos: una reabria
    lo que la otra declaraba sobrante. Aqui las dos llaman a
    `deudor_de_submittal`, y esta prueba lo fija en el codigo fuente."""
    fuente = io.open(os.path.join(RAIZ, 'encargos.py'), encoding='utf-8').read()
    bloque_sigue = fuente.split("if tipo == 'SUBMITTAL':")[1].split('if tipo ==')[0]
    bloque_faltan = fuente.split('# Submittals vivos')[1].split('# Emisiones')[0]
    assert 'deudor_de_submittal' in bloque_sigue
    assert 'deudor_de_submittal' in bloque_faltan


def test_el_tipo_esta_registrado_en_las_tres_listas():
    """Registrar el tipo en TIPOS pero no en _ORIGEN dejaria `abrir()` aceptando
    un encargo cuya obra no se puede determinar."""
    import encargos as enc
    assert 'SUBMITTAL' in enc.TIPOS
    assert enc._ORIGEN['SUBMITTAL'] == ('doc_submittals', 'model_urn')
    check = dict(enc._CHECKS)['ck_encargos_tipo']
    assert 'SUBMITTAL' in check


# ── EL ESQUEMA ─────────────────────────────────────────────────────────────

def _sql():
    return io.open(os.path.join(RAIZ, 'sql', '13_gap01_submittals.sql'),
                   encoding='utf-8').read()


def test_el_esquema_prohibe_cerrar_sin_veredicto():
    """La invariante contractual del objeto, y NO solo en Python: una regla que
    vive unicamente en el codigo la salta cualquier script."""
    sql = _sql()
    assert 'ck_submittals_cierre_con_veredicto' in sql
    assert "estado <> 'Cerrado' OR veredicto IS NOT NULL" in sql


def test_el_esquema_cierra_los_catalogos():
    sql = _sql()
    assert 'ck_submittals_estado' in sql
    assert 'ck_submittals_veredicto' in sql


def test_el_autor_no_se_puede_borrar_dejando_el_acto_sin_autor():
    """RESTRICT y no CASCADE, a diferencia de la obra. Borrar la cuenta de quien
    sometio un producto dejaria un acto contractual sin autor."""
    sql = _sql()
    autor = sql.split('fk_submittals_autor')[1].split('EXCEPTION')[0]
    assert 'ON DELETE RESTRICT' in autor


def test_la_migracion_reemplaza_el_check_de_encargos_no_anade_otro():
    """Dos CHECK sobre la misma columna se cumplen A LA VEZ: si el viejo se
    quedara, seguiria prohibiendo 'SUBMITTAL' y el encargo no se podria abrir
    aunque el nuevo lo permitiera."""
    sql = _sql()
    assert 'DROP CONSTRAINT IF EXISTS ck_encargos_tipo' in sql
    assert sql.index('DROP CONSTRAINT IF EXISTS ck_encargos_tipo') < \
           sql.index("ADD CONSTRAINT ck_encargos_tipo")


def test_el_codigo_es_unico_por_obra_Y_POR_REVISION():
    """SUB-007 rev.0 y SUB-007 rev.1 son el mismo submittal en dos momentos, y
    los dos tienen que poder existir."""
    sql = _sql()
    assert 'idx_submittals_codigo_obra' in sql
    assert 'ON doc_submittals(project_id, codigo, revision)' in sql


def test_la_migracion_siembra_la_herramienta_sin_pisar_lo_existente():
    sql = _sql()
    assert "INSERT INTO project_tools" in sql
    assert 'NOT EXISTS' in sql, 'sembrar sin comprobar pisaria una obra que ya la apago'


# ── LA HERRAMIENTA (capa 16) ───────────────────────────────────────────────

def test_la_herramienta_existe_y_gobierna_su_ruta():
    import herramientas_de_obra as hdo
    assert 'submittals' in hdo.CODIGOS
    assert hdo.herramienta_de_ruta('/api/submittals') == 'submittals'
    assert hdo.herramienta_de_ruta('/api/submittals/12/responder') == 'submittals'


# ── NO SE CLONO EL MOTOR DE REVISIONES ─────────────────────────────────────

def test_el_manejador_reutiliza_flujo_de_revision_y_no_lo_copia():
    """Si resolviera los pasos por su cuenta, el submittal y su proyeccion
    acabarian discrepando sobre a quien le toca -- que es el defecto que
    `flujo_de_revision` existe para impedir."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'), encoding='utf-8').read()
    assert 'import flujo_de_revision as rev' in fuente
    assert 'rev.revisor_del_paso' in fuente
    assert 'rev.puede_actuar' in fuente
    assert 'rev.vencimiento' in fuente
    # Y no reimplementa lo que ya existe.
    assert 'def revisor_del_paso' not in fuente
    assert 'def vencimiento' not in fuente


def test_el_manejador_no_decide_permisos_por_su_cuenta():
    """Las capas 16 y 08 se aplican en el middleware, en una sola compuerta. Una
    comprobacion repetida por ruta es como se olvidan la mitad."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'), encoding='utf-8').read()
    assert 'herramientas_de_obra' not in fuente
    assert 'acceso_a_herramientas' not in fuente
    assert 'guardia_de_recurso' in fuente


def test_cada_acto_que_escribe_pasa_por_la_guardia_de_recurso():
    """Menos crear y listar, que resuelven la obra por `model_urn` y no tienen
    todavia un recurso al que guardar."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'), encoding='utf-8').read()
    import re
    manejadores = re.findall(
        r"@submittals_bp\.route\('([^']*)'[^)]*\)\s*\ndef (\w+)\(([^)]*)\):(.*?)(?=\n@|\Z)",
        fuente, re.S)
    sin_guardia = [n for ruta, n, args, cuerpo in manejadores
                   if 'sid' in args and 'guardia_de_recurso' not in cuerpo]
    assert not sin_guardia, 'rutas sobre un recurso sin guardia: %s' % sin_guardia


def test_el_manifiesto_congelado_conoce_el_tipo_SUBMITTAL():
    """EL DEFECTO QUE ESTA PRUEBA NACE PARA IMPEDIR, y que tumbó el arranque en
    producción el 25-ago-2026:

        restricciones : 509 de 510  *** FALTAN 1 ***
        · restriccion encargos check ((objeto_tipo = any (array['review',
          'rfi','redline','transmittal'])))
        ==> Exited with status 1

    `bootstrap_esquema.py --verificar` compara la base viva contra
    `esquema_objetos.txt`. La migración 13 REEMPLAZÓ `ck_encargos_tipo`, así que
    el objeto que el manifiesto esperaba dejó de existir y el servicio se negó a
    arrancar — correctamente: un esquema que no es el que el código espera no se
    sirve.

    LA REGLA QUE ESTO FIJA, y que no era obvia:
        AÑADIR una tabla por migración  ->  el manifiesto NO se toca
                                            (ninguna de las cinco tablas de las
                                             capas 16/08/13/15/14 está en él)
        MODIFICAR un objeto que el manifiesto YA declara  ->  hay que
                                            actualizarlo, o el arranque cae.

    Se comprueba contra `encargos._CHECKS`, que es la fuente de verdad del
    código, y no contra una copia literal: así las dos no pueden divergir.
    """
    import re
    import encargos as enc
    manifiesto = io.open(os.path.join(RAIZ, 'esquema_objetos.txt'),
                         encoding='utf-8').read()
    linea = next((l for l in manifiesto.splitlines()
                  if l.startswith('restriccion\tencargos check ((objeto_tipo')), None)
    assert linea, 'el manifiesto ya no declara el CHECK de objeto_tipo'

    en_manifiesto = set(re.findall(r"'([a-z]+)'::text", linea))
    en_codigo = {t.lower() for t in enc.TIPOS}
    assert en_manifiesto == en_codigo, (
        'el manifiesto congelado y `encargos.TIPOS` no dicen lo mismo.\n'
        '  manifiesto: %s\n  codigo:     %s\n'
        'El arranque verifica el esquema contra el manifiesto: si divergen, el '
        'servicio NO arranca.' % (sorted(en_manifiesto), sorted(en_codigo)))


def test_toda_tabla_guardada_esta_declarada_en_RECURSOS():
    """EL DEFECTO QUE ESTA PRUEBA NACE PARA IMPEDIR, y que encontro la revision
    de este mismo gap ANTES de desplegar:

    `obra_del_recurso` LANZA ValueError si la tabla no esta en `RECURSOS` -- no
    devuelve None. Una tabla sin declarar no cierra la ruta: la revienta con un
    500, que es peor que un 403 porque no dice nada y parece una caida.

    Es GENERICA a proposito: barre TODOS los manejadores, no solo el submittal.
    Una prueba que solo mirara `doc_submittals` dejaria el siguiente gap
    expuesto al mismo fallo.
    """
    import re
    import perimetro_de_obra as per
    rutas = os.path.join(RAIZ, 'routes')
    sin_declarar = []
    for nombre in os.listdir(rutas):
        if not nombre.endswith('.py'):
            continue
        fuente = io.open(os.path.join(rutas, nombre), encoding='utf-8').read()
        for tabla in re.findall(r"guardia_de_recurso\(\s*'([a-z_]+)'", fuente):
            if tabla not in per.RECURSOS:
                sin_declarar.append('%s -> %s' % (nombre, tabla))
    assert not sin_declarar, (
        'tablas guardadas pero NO declaradas en RECURSOS (darian 500): %s'
        % sin_declarar)


def test_ningun_fallo_de_encargo_puede_tumbar_un_acto_contractual():
    """La proyeccion se reconstruye sola (`conciliar`); un veredicto perdido, no."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'), encoding='utf-8').read()
    for helper in ('def _abrir_encargo', 'def _cerrar_encargos'):
        cuerpo = fuente.split(helper)[1].split('\ndef ')[0]
        assert 'try:' in cuerpo and 'except' in cuerpo, (
            '%s tiene que tragarse su propio fallo' % helper)


# ── LA CONCILIACION DE CIERRE ENCONTRO ESTO ────────────────────────────────

def test_spec_y_paquete_se_pueden_FILTRAR_no_solo_guardar():
    """Guardar `spec_seccion` y `paquete` sin poder agrupar por ellos era tener
    el DATO y no la CAPACIDAD. En una obra con doscientos submittals la pregunta
    que se hace es «ensename los de la seccion 05 52 13», no «todos»."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def listar')[1].split('\ndef ')[0]
    for campo in ('spec_seccion', 'paquete', 'estado'):
        assert "request.args.get('%s')" % campo in cuerpo, 'no se puede filtrar por %s' % campo
    # Y se devuelven las agrupaciones QUE EXISTEN, no una lista inventada.
    assert 'spec_secciones' in cuerpo and 'paquetes' in cuerpo


def test_el_revisor_puede_DEVOLVER_documentos():
    """Su respuesta no puede ser solo texto: devuelve el documento marcado, el
    sello, la observacion escrita."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def responder')[1].split('\ndef ')[0]
    assert "data.get('adjuntos')" in cuerpo
    assert 'de_revision' in cuerpo, 'hay que distinguir lo sometido de lo devuelto'


def test_lo_sometido_NO_se_sustituye_por_lo_devuelto():
    """Si el adjunto del revisor pisara el del contratista, el veredicto dejaria
    de recaer sobre lo que se leyo -- que es la razon de congelar al enviar."""
    fuente = io.open(os.path.join(RAIZ, 'routes', 'submittals.py'), encoding='utf-8').read()
    cuerpo = fuente.split('def responder')[1].split('\ndef ')[0]
    assert 'adjuntos.append' in cuerpo, 'tiene que ANADIR, no reemplazar'
    assert "adjuntos = list(s['adjuntos'] or [])" in cuerpo
