# -*- coding: utf-8 -*-
"""GAP 07 · EL CLIENTE — lo que tiene que seguir siendo cierto en el dispositivo.

Estas pruebas leen el fuente del portal, como `test_perfil_portal`. No ejecutan
el navegador: defienden decisiones que se pierden en una refactorizacion y que
no dan error --dan un producto que MIENTE--.

Lo que se defiende aqui no es que el offline funcione. Es que no engane:

    GUARDADO EN ESTE DISPOSITIVO   ≠   CONFIRMADO POR EL SERVIDOR
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORTAL = os.path.join(RAIZ, 'frontend-docs')


def _leer(*partes):
    return io.open(os.path.join(PORTAL, *partes), encoding='utf-8').read()


def almacen():
    return _leer('src', 'offline', 'almacenLocal.js')


def sincronizador():
    return _leer('src', 'offline', 'sincronizador.js')


def precarga():
    return _leer('src', 'offline', 'precarga.js')


def sw():
    return _leer('public', 'sw-campo.js')


def pantalla():
    return _leer('src', 'components', 'SincronizacionModule.jsx')


def _sin_comentarios(fuente):
    """El codigo, sin lo que se dice SOBRE el codigo.

    Existe porque una prueba que busca una cadena prohibida la encuentra en el
    comentario que explica por que esta prohibida -- y pasa en verde sin haber
    mirado nada. Ya paso una vez en esta suite.
    """
    fuera = []
    for linea in fuente.splitlines():
        limpia = linea.split('//')[0] if '//' in linea else linea
        if limpia.strip().startswith('*') or limpia.strip().startswith('/*'):
            continue
        fuera.append(limpia)
    return chr(10).join(fuera)


# ══ 1 · AISLAMIENTO POR IDENTIDAD ══════════════════════════════════════════

def test_lo_guardado_se_particiona_por_IDENTIDAD_CANONICA():
    """Un dispositivo de obra lo usan varias personas. Si la cola se
    identificara por algo editable --el correo, el nombre-- cambiaria de dueno
    en cuanto alguien tocara su perfil."""
    s = almacen()
    assert 'canonical_user_id' in s
    # Las cuatro tiendas se indexan por dueno.
    assert s.count("createIndex('dueño', ['canonical_user_id'") >= 3
    for editable in ("keyPath: 'email'", "['email'", 'usuario.email',
                     "['nombre'", "index('email')"):
        assert editable not in s, (
            'la particion usa %s, que el usuario puede cambiar' % editable)


def test_guardar_SIN_DUENO_es_imposible():
    """Un registro sin dueno lo veria el siguiente que entrara en el telefono."""
    s = almacen()
    assert 'function exigirDueño(ctx)' in s
    cuerpo = s.split('function exigirDueño(ctx)')[1].split('\n}')[0]
    assert 'throw new Error' in cuerpo
    # Y se exige en TODA escritura, no solo en la cola.
    for f in ('encolar', 'guardarBlob', 'atarIdentidad', 'guardarSnapshot'):
        trozo = s.split('export async function %s(' % f)[1].split('\n}')[0]
        assert 'exigirDueño(ctx)' in trozo, f


def test_solo_se_leen_las_operaciones_DE_UNO():
    """El usuario B no puede ver, subir ni adjuntar nada de A."""
    s = almacen()
    cuerpo = s.split('export async function operacionesDe(')[1].split('\n}')[0]
    assert "index('dueño')" in cuerpo
    assert '[ctx.canonical_user_id, ctx.project_id]' in cuerpo
    # `porEnviar` --lo que realmente se sincroniza-- sale de ahi, no de un
    # getAll global.
    envio = s.split('export async function porEnviar(')[1].split('\n}')[0]
    assert 'operacionesDe(ctx)' in envio
    assert 'getAll()' not in envio


def test_cerrar_sesion_NO_borra_el_trabajo_de_nadie():
    """La gente cierra sesion sin pensar. Borrar ahi seria la forma mas rapida
    de perder una jornada de campo."""
    s = almacen()
    cuerpo = s.split('export async function borrarTodoDe(')[1].split('\n}')[0]
    assert 'exigirDueño(ctx)' in cuerpo, (
        'borrar tiene que ser DE ALGUIEN, no del dispositivo entero')
    # Y no lo llama nadie automaticamente.
    for fichero in (_sin_comentarios(sincronizador()),
                    _sin_comentarios(pantalla())):
        assert 'borrarTodoDe(' not in fichero, (
            'algo borra el trabajo local sin que lo pida una persona')


def test_el_trabajo_ajeno_se_ANUNCIA_pero_no_se_ensena():
    """Que exista tiene que saberse --si no, alguien limpia el telefono creyendo
    que esta vacio-- pero su contenido no."""
    s = almacen()
    cuerpo = s.split('export async function pendienteDeOtros(')[1].split('\n}')[0]
    assert '.length' in cuerpo, 'devuelve un numero, no las filas'
    assert 'o.canonical_user_id !== ctx.canonical_user_id' in cuerpo
    assert 'ajeno' in pantalla()


def test_NUNCA_se_guarda_un_token_en_la_cola():
    """Una cola sobrevive semanas en un dispositivo compartido. No es sitio para
    una credencial -- y no hace falta: al sincronizar manda la sesion de
    AHORA."""
    s = _sin_comentarios(almacen())
    fila = s.split('const fila = {')[1].split('};')[0]
    for prohibido in ('token', 'password', 'authorization', 'Bearer',
                      'session_token', 'jwt'):
        assert prohibido.lower() not in fila.lower(), prohibido
    assert 'localStorage' not in s, (
        'el almacen no lee credenciales del navegador')


# ══ 2 · DURABILIDAD ════════════════════════════════════════════════════════

def test_GUARDADO_significa_que_la_transaccion_CONFIRMO():
    """`onsuccess` de una peticion no es durabilidad: si la pestana se cierra en
    ese instante, lo que se dijo «guardado» se pierde. Solo `oncomplete` de la
    transaccion significa que esta en disco."""
    s = almacen()
    cuerpo = s.split('function conTransaccion(')[1].split('\n}')[0]
    assert 'tx.oncomplete = () => resolve(' in cuerpo
    assert 'tx.onabort' in cuerpo and 'tx.onerror' in cuerpo
    # Y `encolar` espera esa confirmacion antes de devolver.
    enc = s.split('export async function encolar(')[1].split('\n}')[0]
    assert 'await conTransaccion(' in enc


def test_la_evidencia_PERSISTIDA_no_es_la_SELECCIONADA():
    """Un `File` de un `<input>` es una referencia del sistema operativo: si la
    pestana se cierra, deja de existir."""
    s = almacen()
    assert 'export async function guardarBlob(' in s
    cuerpo = s.split('export async function guardarBlob(')[1].split('\n}')[0]
    assert 'await conTransaccion([BLOBS]' in cuerpo
    assert "subido: false" in cuerpo, (
        'un blob recien guardado NO esta subido')


def test_los_blobs_van_en_su_PROPIA_tienda():
    """Si viajaran dentro del registro de la operacion, cada reintento
    --que reescribe intentos y estado-- reescribiria ocho megas de foto."""
    s = _sin_comentarios(almacen())
    assert "export const BLOBS = 'pending_blobs'" in s
    assert "export const OPERACIONES = 'queue_operations'" in s
    enc = s.split('export async function encolar(')[1].split('\n}')[0]
    assert 'blob' not in enc.lower(), 'el acto lleva el binario dentro'


def test_la_CUOTA_se_distingue_de_un_fallo_cualquiera():
    """«No cabe» no se arregla reintentando, y decir «reintentalo» seria un
    bucle que nunca termina."""
    s = almacen()
    assert 'export function esFalloDeCuota(' in s
    assert 'QuotaExceededError' in s
    assert 'esFalloDeCuota(' in precarga()
    assert 'espacioDisponible' in pantalla(), (
        'la pantalla no avisa de que queda poco sitio')


def test_la_persistencia_se_PIDE_pero_no_se_da_por_concedida():
    """Safari la niega casi siempre. El producto tiene que funcionar igual."""
    s = almacen()
    cuerpo = s.split('export async function pedirPersistencia(')[1].split('\n}')[0]
    assert 'navigator.storage.persist' in cuerpo
    assert 'return null' in cuerpo, 'no contempla que no exista'
    # Y quien la pide no bloquea nada con el resultado.
    p = pantalla()
    assert 'local.pedirPersistencia().catch(() => {})' in p


# ══ 3 · LOS DISPARADORES ═══════════════════════════════════════════════════

def test_la_sincronizacion_NO_depende_de_background_sync():
    """iOS no la implementa. Apoyarse en ella significaria que en media obra la
    cola no sube nunca, y nadie se enteraria."""
    s = sincronizador()
    cuerpo = s.split('export function engancharDisparadores(')[1]
    assert "addEventListener('online'" in cuerpo
    assert "addEventListener('visibilitychange'" in cuerpo
    assert "intentar('arranque')" in cuerpo
    # Background Sync va DESPUES y dentro de un `if`, como mejora.
    i_online = cuerpo.index("addEventListener('online'")
    i_bg = cuerpo.index('SyncManager')
    assert i_online < i_bg
    assert "'SyncManager' in window" in cuerpo
    # Y el boton.
    assert "motivo: 'boton'" in pantalla()


def test_el_service_worker_NO_sincroniza_por_su_cuenta():
    """No tiene la sesion ni la cola. Lo unico que puede hacer es despertar a la
    app."""
    s = _sin_comentarios(sw())
    cuerpo = s.split("addEventListener('sync'")[1]
    assert 'postMessage' in cuerpo
    assert '/api/sync' not in cuerpo


# ══ 4 · EL SERVICE WORKER NO PUEDE MENTIR ══════════════════════════════════

def test_NUNCA_se_cachea_la_API():
    """Un cache-first sobre `/api/*` haria que la app respondiera datos viejos
    sin decirlo. En un CDE eso no es rendimiento: es un acta que dice algo
    falso."""
    s = sw()
    fetch = s.split("addEventListener('fetch'")[1]
    assert "url.pathname.startsWith('/api/')" in fetch
    i_guardia = fetch.index("startsWith('/api/')")
    i_respond = fetch.index('e.respondWith')
    assert i_guardia < i_respond, (
        'se responde desde cache antes de descartar la API')
    assert 'return;' in fetch[i_guardia:i_guardia + 120]


def test_solo_se_cachean_GET_de_NUESTRO_origen():
    """Cachear un POST devolveria un 200 de otro momento y el movil daria por
    hecho un acto que nunca ocurrio."""
    s = sw()
    fetch = s.split("addEventListener('fetch'")[1]
    assert "req.method !== 'GET'" in fetch
    assert 'esNuestro(url)' in fetch


def test_el_armazon_es_una_LISTA_EXPLICITA():
    """Cachear «todo lo que pase» acabaria metiendo respuestas de datos."""
    s = sw()
    assert 'const ARMAZON = [' in s
    lista = s.split('const ARMAZON = [')[1].split('];')[0]
    assert '/api' not in lista


def test_una_instalacion_a_medias_no_deja_sin_service_worker():
    """`addAll` es todo-o-nada: si falta un icono, el usuario se queda sin
    offline por un favicon."""
    # SIN COMENTARIOS: si no, la prueba se cumple sola con el comentario que
    # explica por que no se usa `addAll`.
    s = _sin_comentarios(sw())
    assert 'addAll' not in s
    assert 'c.add(u).catch(' in s


# ══ 5 · LOS SIETE ESTADOS ══════════════════════════════════════════════════

ESTADOS = ['PENDIENTE', 'REINTENTABLE', 'BLOQUEADA', 'CONFLICTO', 'RECHAZADA',
           'INDETERMINADA', 'SINCRONIZADA']


def test_los_siete_estados_EXISTEN_y_son_distintos():
    """Colapsarlos en «error» perderia la unica informacion que importa: si hay
    que reintentar, decidir, o no hacer nada."""
    s = almacen()
    for e in ESTADOS:
        assert 'export const %s =' % e in s, e
    p = pantalla()
    for e in ESTADOS:
        assert 'local.%s' % e in p, 'la pantalla no distingue %s' % e


def test_cada_estado_dice_QUE_HACER():
    """Un estado que no dice que hacer es una pantalla que obliga a llamar a
    alguien."""
    p = pantalla()
    bloque = p.split('const ESTADOS = {')[1].split('\n};')[0]
    assert bloque.count('accion:') >= 7
    # Y cuales suben solos, para no ofrecer un boton que no hace falta.
    assert bloque.count('sola:') >= 7


def test_lo_que_el_servidor_DECIDIO_no_se_reintenta_solo():
    """Insistir contra un rechazo no lo cambia, y reintentar un conflicto pisa
    lo que otro hizo."""
    s = _sin_comentarios(almacen())
    assert 'export const NO_SE_REINTENTAN' in s
    lista = s.split('export const NO_SE_REINTENTAN = [')[1].split(']')[0]
    for e in ('SINCRONIZADA', 'RECHAZADA', 'CONFLICTO', 'INDETERMINADA'):
        assert e in lista, e
    # Y `porEnviar` no los mete en el lote.
    envio = s.split('export async function porEnviar(')[1].split('\n}')[0]
    for e in ('CONFLICTO', 'RECHAZADA', 'INDETERMINADA'):
        assert 'local.%s' % e not in envio and 'o.estado === %s' % e not in envio, e


def test_el_cliente_NO_reinterpreta_el_veredicto_del_servidor():
    """La autoridad esta en el servidor. Convertir un RECHAZADA en un reintento
    seria el cliente decidiendo."""
    s = _sin_comentarios(sincronizador())
    cuerpo = s.split('export async function sincronizar(')[1]
    # El unico renombre permitido es APLICADA -> SINCRONIZADA, que es la misma
    # cosa dicha en la lengua de quien mira su cola.
    assert "res.status === 'APLICADA' ? local.SINCRONIZADA : res.status" in cuerpo
    assert 'local.REINTENTABLE;' not in cuerpo


def test_un_envio_que_NO_LLEGO_vuelve_a_PENDIENTE_y_no_a_rechazada():
    """«Rechazada» le diria al usuario que el servidor decidio algo. No decidio
    nada: no le llego."""
    s = _sin_comentarios(sincronizador())
    cuerpo = s.split('if (!r.ok) {')[1].split('}')[0]
    assert 'local.PENDIENTE' in cuerpo
    assert 'RECHAZADA' not in cuerpo


# ══ 6 · LA PANTALLA NO PUEDE ENGANAR ═══════════════════════════════════════

def test_la_pantalla_SEPARA_lo_guardado_de_lo_confirmado():
    """Un inspector que ve su acta «guardada» y cree que la obra ya la tiene se
    va a casa tranquilo con un acta que nadie ha recibido."""
    p = pantalla()
    assert 'GUARDADO EN ESTE DISPOSITIVO' in p
    assert 'CONFIRMADO POR EL SERVIDOR' in p
    # Y son dos secciones de verdad, no un adjetivo en la misma lista.
    assert p.count('<section') >= 2
    assert 'const confirmadas = cola.filter' in p
    assert 'const soloAqui = cola.filter' in p
    assert 'El servidor todavía NO tiene esto' in p


def test_capturado_en_se_presenta_como_DECLARADO_por_el_dispositivo():
    """No es un reloj autoritativo ni una prueba criptografica. Ensenarlo como
    la hora del hecho seria darle valor probatorio a algo que se cambia en
    ajustes."""
    p = pantalla()
    i = p.index('capturado_en')
    trozo = p[i:i + 900]
    assert 'el móvil marcó' in trozo, (
        'se presenta como la hora del hecho, sin decir quien la declara')
    assert 'No es un reloj verificado' in trozo


def test_descartar_solo_se_ofrece_donde_reintentar_NO_TIENE_SENTIDO():
    """Ofrecerlo en una pendiente invitaria a tirar trabajo que iba a subir
    solo."""
    p = _sin_comentarios(pantalla())
    trozo = p.split('Descartar de mi dispositivo')[0][-500:]
    assert 'local.RECHAZADA' in trozo and 'local.CONFLICTO' in trozo
    assert 'local.PENDIENTE' not in trozo
    # Y avisa de que el servidor no lo tiene.
    assert 'El servidor no la tiene' in p


def test_lo_precargado_se_ensena_CON_SU_FECHA():
    """Un listado de hace tres dias es util para trabajar, pero no es el estado
    de la obra."""
    s = precarga()
    assert 'descargado_en' in s
    leer = s.split('export async function leer(')[1].split('\n}')[0]
    assert 'descargado_en' in leer
    p = pantalla()
    assert 'pre.antiguedad(' in p
    assert 'no de ahora' in p


# ══ 7 · LA VERSION VIAJA CON EL DATO ═══════════════════════════════════════

def test_la_plantilla_precargada_conserva_SU_version():
    """Lo que el inspector tuvo delante. Al sincronizar se manda esa, no la
    vigente."""
    s = precarga()
    cuerpo = s.split('export async function plantillaPrecargada(')[1].split('\n}')[0]
    assert 'version_en_campo' in cuerpo
    assert 'pl.version' in cuerpo


def test_la_precarga_pide_el_MISMO_alcance_que_usa_la_cola():
    """Si aqui se pidiera uno y alli otro, alguien podria llenar un acta contra
    los protocolos de una obra y sincronizarla en otra."""
    s = precarga()
    assert 'const alcance = encodeURIComponent(ctx.project_id)' in s
    assert s.count('${alcance}') >= 3
    # Y `project_id` sale del alcance de escritura, no del nombre de la obra.
    p = _sin_comentarios(pantalla())
    assert 'project.scope_escritura' in p
    assert 'project.name' not in p


def test_la_precarga_parcial_NO_tira_la_precarga_entera():
    """Llevarse los protocolos y no los issues es peor que todo, pero es
    muchisimo mejor que no llevarse nada porque una llamada fallo."""
    s = precarga()
    cuerpo = s.split('export async function precargar(')[1]
    assert 'try {' in cuerpo and 'catch (e)' in cuerpo
    assert 'resultado.fallidas.push' in cuerpo
    assert 'resultado.traidas.push' in cuerpo


# ══ 8 · LA PANTALLA EXISTE Y SE PUEDE ABRIR ════════════════════════════════

def test_la_pantalla_de_campo_esta_ENGANCHADA_en_el_portal():
    """Una capacidad sin pantalla no existe para el usuario."""
    p = _leer('src', 'pages', 'FilesPage.jsx')
    assert "import('../components/SincronizacionModule')" in p
    assert "fe.sidebarView === 'campo'" in p
    assert '<SincronizacionModule' in p
    assert "mode: 'campo'" in p


def test_la_cola_de_campo_depende_de_LAS_DOS_herramientas():
    """Es la cola de issues y de protocolos. Atarla a una sola dejaria capturas
    atrapadas sin pantalla desde donde subirlas."""
    p = _leer('src', 'pages', 'FilesPage.jsx')
    assert "campo: ['issues', 'protocolos']" in p
    assert 'Array.isArray(cod) ? cod : [cod]' in p
    assert 'codigos.some(' in p


def test_el_service_worker_se_registra_SIN_bloquear_el_arranque():
    """Un aviso de «no se pudo registrar el service worker» no le sirve a nadie
    en una obra, y bloquear el arranque cambiaria una degradacion por una
    caida."""
    m = _leer('src', 'main.jsx')
    assert "navigator.serviceWorker.register('/sw-campo.js')" in m
    assert '.catch(() => {})' in m
    assert "'serviceWorker' in navigator" in m


# ══ 9 · LA CAPTURA · UNA SOLA DECISION, DOS VERTICALES ═════════════════════

def captura():
    return _leer('src', 'offline', 'captura.js')


def punch():
    return _leer('src', 'components', 'PunchModule.jsx')


def protocolos():
    return _leer('src', 'components', 'ProtocolosModule.jsx')


def test_la_decision_de_encolar_vive_en_UN_SOLO_SITIO():
    """Si cada modulo decidiera por su cuenta, decidirian distinto -- y se veria
    el dia que alguien pierda una jornada."""
    c = captura()
    assert 'export async function capturar(' in c
    # Los modulos NO encolan a mano.
    for m in (punch(), protocolos()):
        assert 'local.encolar(' not in m
        assert 'campo.capturar(' in m


def test_con_red_y_sin_red_es_EL_MISMO_CAMINO():
    """Un offline que usa rutas distintas es un offline que solo se prueba
    cuando falla."""
    c = _sin_comentarios(captura())
    cuerpo = c.split('export async function capturar(')[1].split('\nexport ')[0]
    assert '/api/sync' in cuerpo
    assert cuerpo.count('/api/') == 1, (
        'la captura con red usa otra ruta distinta de la cola')


def test_el_operation_id_se_genera_ANTES_de_intentar_nada():
    """Una peticion que sale y no vuelve pudo haberse ejecutado. Encolarla con
    un id nuevo crearia un duplicado; con el mismo, el reintento es una
    consulta."""
    c = _sin_comentarios(captura())
    cuerpo = c.split('export async function capturar(')[1].split('\nexport ')[0]
    i_id = cuerpo.index('const operation_id = local.uuid()')
    i_red = cuerpo.index('apiFetch')
    assert i_id < i_red
    # Y el catch encola EL MISMO acto, no uno nuevo.
    catch = cuerpo.split('} catch (e) {')[1]
    assert 'local.uuid()' not in catch, (
        'el reintento se encola con otro operation_id: duplicaria')
    assert 'local.encolar(ctx, acto)' in catch


def test_local_object_id_y_operation_id_son_COSAS_DISTINTAS():
    """Uno dice QUE cosa es; el otro, QUE se le hizo. Confundirlos haria que
    marcar un punto y adjuntarle la foto fueran el mismo acto."""
    c = captura()
    assert 'export function nuevoObjetoLocal()' in c
    assert "'loc_' + local.uuid()" in c
    cuerpo = c.split('export async function capturar(')[1].split('\nexport ')[0]
    assert 'local_object_id' in cuerpo and 'operation_id' in cuerpo
    # `capturar` NO inventa el local_object_id: lo recibe. Un acto sobre algo
    # que ya existe tiene que apuntar a ESO.
    assert 'local_object_id = ' not in cuerpo


def test_la_pantalla_DICE_si_entro_o_solo_se_guardo():
    """Decir «levantado» en los dos casos es la mentira que este GAP existe para
    impedir."""
    c = captura()
    assert "modo: 'servidor'" in c and "modo: 'local'" in c
    for m, nombre in ((punch(), 'punch'), (protocolos(), 'protocolos')):
        assert "modo === 'servidor'" in m, nombre
        assert 'Guardado en este dispositivo' in m or 'guardada en este dispositivo' in m, nombre


def test_el_veredicto_del_servidor_NO_se_disfraza_de_fallo_de_red():
    """RECHAZADA no es «no hubo cobertura». Enseñarlo igual haria que alguien
    esperara un reintento que nunca va a ocurrir."""
    c = _sin_comentarios(captura())
    cuerpo = c.split('export async function capturar(')[1].split('\nexport ')[0]
    assert 'aplicarDesenlace(ctx, res)' in cuerpo
    for m in (punch(), protocolos()):
        assert 'veredicto' in m


def test_la_evidencia_se_PERSISTE_antes_que_el_acto():
    """Al reves habria una operacion que dice llevar una foto que no existe. Un
    blob huerfano no rompe nada; un acto sin su evidencia, si."""
    c = _sin_comentarios(captura())
    cuerpo = c.split('export async function capturarConEvidencia(')[1].split('\nexport ')[0]
    assert cuerpo.index('local.guardarBlob') < cuerpo.index('local.encolar')


def test_las_DOS_verticales_usan_el_MISMO_motor():
    """Es lo que demuestra que esto es infraestructura y no «offline para
    issues» disfrazado."""
    c = captura()
    for tipo in ('ISSUE', 'PROTOCOLO'):
        assert "export const %s = '%s'" % (tipo, tipo) in c
    assert 'campo.ISSUE' in punch()
    pr = protocolos()
    assert 'campo.PROTOCOLO' in pr
    # Y las dos acciones del protocolo: levantar el acta y marcar sus puntos.
    assert 'campo.CREATE' in pr and 'campo.SET_ITEMS' in pr


def test_el_acta_manda_LA_VERSION_QUE_TIENE_DELANTE():
    """No la vigente al sincronizar. Si la plantilla cambio mientras no habia
    cobertura, lo decide una persona."""
    pr = protocolos()
    assert 'protocolo_version:' in pr
    trozo = pr.split('protocolo_version:')[1][:120]
    assert 'pl.version' in trozo or 'pl && pl.version' in trozo


def test_marcar_puntos_lleva_el_ESTADO_sobre_el_que_se_decidio():
    """Sin eso, marcar puntos de campo machacaria la firma de otro."""
    pr = _sin_comentarios(protocolos())
    trozo = pr.split('campo.SET_ITEMS')[1][:600]
    assert 'base_version' in trozo
    assert 'abierta.estado' in trozo


def test_el_contexto_de_identidad_se_construye_EN_UN_SOLO_SITIO():
    """Para que ninguna pantalla se invente la suya con el email."""
    c = captura()
    assert 'export function contextoDe(usuario, project)' in c
    cuerpo = _sin_comentarios(c).split('export function contextoDe(')[1]
    assert 'String(usuario.id)' in cuerpo
    assert 'project.scope_escritura' in cuerpo
    assert 'usuario.email' not in cuerpo and 'project.name' not in cuerpo
    for m in (punch(), protocolos(), _leer('src', 'pages', 'FilesPage.jsx')):
        assert 'campo.contextoDe(' in m


# ══ 10 · LA COLA SUBE AUNQUE NADIE MIRE ════════════════════════════════════

def test_los_disparadores_viven_por_ENCIMA_de_la_pantalla_de_campo():
    """Quien captura en obra cierra la app y se va. Si los disparadores
    vivieran en esa pantalla, la cola solo subiria mientras estuviera
    abierta."""
    f = _leer('src', 'pages', 'FilesPage.jsx')
    assert 'engancharDisparadores(API,' in f
    # Y NO estan solo dentro del modulo de sincronizacion.
    assert 'engancharDisparadores' not in pantalla()


def test_el_contexto_se_pasa_como_FUNCION_no_como_valor():
    """Cuando se dispare --horas despues-- tiene que leer la identidad de ESE
    momento. Si se hubiera cambiado de cuenta, sube la del que esta dentro
    ahora."""
    f = _leer('src', 'pages', 'FilesPage.jsx')
    assert 'engancharDisparadores(API, () => campo.contextoDe(user, project))' in f
    s = _sin_comentarios(sincronizador())
    cuerpo = s.split('export function engancharDisparadores(')[1]
    assert 'const ctx = obtenerContexto()' in cuerpo


# ══ 11 · EL PORTAL SE DESPLIEGA ANTES QUE EL BACKEND ═══════════════════════
#
# No es un accidente de un dia: es como esta montado el despliegue. Siempre hay
# una ventana en la que el navegador tiene codigo mas nuevo que el servidor.

def capacidades():
    return _leer('src', 'offline', 'capacidades.js')


def test_se_PREGUNTA_si_el_servidor_recibe_trabajo_de_campo():
    """Un cliente que da por hecho que el servidor ya tiene sus rutas esta mal
    construido para este despliegue."""
    c = _sin_comentarios(capacidades())
    assert 'export async function tieneSincronizacionDeCampo(' in c
    assert "'/api/sync'" in c or '/api/sync`' in c
    # 404 es la unica respuesta que significa «no esta aqui».
    assert 'r.status !== 404' in c


def test_un_401_NO_es_una_respuesta_a_esta_pregunta():
    """El middleware de autenticacion corre ANTES del enrutado: sin sesion,
    `/api/sync` y una ruta inventada devuelven los dos 401 --comprobado contra
    produccion--. Tomar ese 401 por «la ruta esta ahi» seria deducir que existe
    algo que no se ha llegado a mirar."""
    c = _sin_comentarios(capacidades())
    assert 'if (r.status === 401) return null;' in c
    # Y no se recuerda: la sesion puede volver.
    trozo = c.split('r.status === 401')[1].splitlines()[0]
    assert '_respuesta' not in trozo


def test_no_poder_preguntar_NO_es_un_no():
    """El defecto que la EXP destapo antes del corte: el catch devolvia false,
    `capturar` leia false como «el servidor no tiene la ruta» y desviaba a la
    ruta antigua -- que sin red tambien falla. La captura se perdia en el unico
    momento en el que la cola existe para salvarla. «No se» es null, y ante
    null se ENCOLA: encolar nunca pierde nada."""
    c = _sin_comentarios(capacidades())
    catch = c.split('} catch (e) {')[1].split('} finally')[0]
    assert 'return null' in catch
    assert 'return false' not in catch
    assert '_respuesta' not in catch


def test_solo_un_NO_rotundo_desvia_y_sin_red_se_encola_sin_preguntar():
    """Tres respuestas, tres conductas: false (404 medido) desvia a la ruta
    antigua; null (no se pudo preguntar) sigue por la cola; y SIN RED no se
    pregunta nada -- se encola directo: la sonda existe para la ventana de
    despliegue, y esa solo se observa con red."""
    c = _sin_comentarios(captura())
    cuerpo = c.split('export async function capturar(')[1].split(chr(10) + 'export ')[0]
    i_offline = cuerpo.index('!navigator.onLine')
    i_sonda = cuerpo.index('tieneSincronizacionDeCampo')
    assert i_offline < i_sonda, 'sin red no hay nada que preguntar'
    assert 'local.encolar' in cuerpo[i_offline:i_sonda]
    assert '(await tieneSincronizacionDeCampo(API)) === false' in cuerpo
    guardia = cuerpo.split('=== false')[1].split('const operation_id')[0]
    assert 'local.encolar' not in guardia
    assert 'enLinea()' in guardia


def test_levantar_un_punch_y_un_acta_SIGUEN_FUNCIONANDO_sin_la_ruta_nueva():
    """Durante la ventana de despliegue, lo que hoy funciona tiene que seguir
    funcionando igual que ayer."""
    pu = punch()
    assert 'enLinea: async () =>' in pu
    assert '/api/issues`' in pu
    pr = protocolos()
    assert pr.count('enLinea: async () =>') == 2, (
        'falta el respaldo en levantar acta o en marcar puntos')
    assert '/api/protocolos/actas`' in pr
    assert '/items`' in pr


def test_el_respaldo_se_DISTINGUE_de_una_sincronizacion():
    """Si se contaran igual, un acto que fue por la ruta de siempre parecería
    haber pasado por la cola -- y nadie sabria cual de los dos caminos se uso."""
    c = captura()
    assert 'sinCampo: true' in c
    for m in (punch(), protocolos()):
        assert 'sinCampo' in m


def test_la_pestana_de_campo_solo_se_esconde_con_un_NO_medido():
    """false (404 medido) la esconde; null + EN LINEA tambien (aun no se
    sabe); null + SIN RED la ENSEÑA: la cola es local y esconderla dejaria
    capturas sin pantalla desde donde verlas."""
    f = _sin_comentarios(_leer('src', 'pages', 'FilesPage.jsx'))
    assert 'tieneSincronizacionDeCampo(API)' in f
    assert 'hayCampo === false' in f
    assert 'hayCampo === null && navigator.onLine' in f
    assert 'React.useState(null)' in f.split('const [hayCampo,')[1][:60]


# ══ 12 · LO QUE LA EXP DE CAMPO REAL DESTAPO (27-ago, wifi apagado) ════════

def test_la_precarga_calienta_TAMBIEN_los_modulos():
    """«Failed to fetch dynamically imported module: ProtocolosModule…»: un
    modulo nunca visitado antes de perder la red no podia abrirse, porque el
    service worker solo cachea lo que alguien pidio. La precarga los importa
    para que el SW los guarde al pasar."""
    s = precarga()
    for m in ('ProtocolosModule', 'PunchModule', 'SincronizacionModule'):
        assert "import('../components/%s')" % m in s, m


def test_sin_red_el_catalogo_y_las_plantillas_salen_de_la_PRECARGA():
    """El selector de «Levantar acta» quedaba vacio sin red: los modulos solo
    sabian pedir a la red. Capturar offline exige que lo precargado alimente
    las pantallas de captura."""
    pu = punch()
    assert "pre.leer(ctx, pre.CATALOGOS)" in pu
    pr = protocolos()
    assert "pre.leer(ctx, pre.PROTOCOLOS)" in pr
    # Y lo degradado SE DICE: la pantalla avisa de que es la foto precargada.
    assert 'Sin conexión' in pr
