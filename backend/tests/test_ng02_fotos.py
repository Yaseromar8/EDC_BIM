# -*- coding: utf-8 -*-
"""NG-02 · FOTOS DE CAMPO — lo que tiene que seguir siendo cierto.

Lo que se defiende: que la foto sea EVIDENCIA y no decoración — un solo objeto
para galería y actos, sensibilidad que restringe y álbum que no concede, marcas
que nunca tocan el binario, y el mismo motor de campo del GAP 07.
"""
import io
import os

import fotos_de_obra as fdo

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ruta():
    return io.open(os.path.join(RAIZ, 'routes', 'fotos.py'), encoding='utf-8').read()


def _cuerpo(nombre):
    return _ruta().split('def %s(' % nombre)[1].split(chr(10) + 'def ')[0]


def _sql23():
    return io.open(os.path.join(RAIZ, 'sql', '23_ng02_fotos.sql'),
                   encoding='utf-8').read()


# ══ 1 · SENSIBILIDAD, NO «PRIVADO» ═════════════════════════════════════════

def test_N0_y_N1_los_ve_cualquier_miembro():
    assert fdo.puede_ver({'id': 7}, {'sensibilidad': 'N0', 'autor_id': 1})
    assert fdo.puede_ver({'id': 7}, {'sensibilidad': 'N1', 'autor_id': 1})


def test_N2_y_N3_solo_autor_o_admin():
    foto = {'sensibilidad': 'N2', 'autor_id': 1}
    assert fdo.puede_ver({'id': 1}, foto)                      # su autor
    assert fdo.puede_ver({'id': 7}, foto, es_admin_de_obra=True)
    assert not fdo.puede_ver({'id': 7}, foto)                  # un tercero, no
    assert not fdo.puede_ver({}, foto, es_admin_de_obra=False)


def test_sin_clasificar_NO_es_publico():
    """La misma postura que los documentos: N1 por defecto."""
    assert fdo.NIVEL_POR_DEFECTO == 'N1'
    assert fdo.puede_ver({'id': 7}, {'autor_id': 1})  # N1 implícito: miembro ve


def test_el_album_JAMAS_concede_acceso():
    """Un álbum agrupa; los permisos los da la obra + la sensibilidad. En la
    ruta: el listado por álbum pasa por LA MISMA poda de visibilidad que el
    listado general."""
    cuerpo = _cuerpo('listar')
    assert cuerpo.count('_con_visibilidad(') == 1
    # y el filtro por álbum comparte esa única salida
    assert 'af.album_id = %s' in cuerpo
    # el álbum restringido tampoco se LISTA a terceros
    alb = _cuerpo('listar_albumes')
    assert 'RESTRINGIDOS' in alb and 'admin' in alb


def _sin_comentarios(fuente):
    """SIN comentarios: si no, la prueba se cumple con la frase que explica la
    regla en vez de con la regla. Tercera vez que esta clase de defecto aparece
    en el programa; de ahi el ayudante."""
    return chr(10).join(l.split('#')[0] for l in fuente.splitlines())


def test_para_quien_no_puede_verla_la_foto_NO_EXISTE():
    """Un 403 confirmaria que hay algo sensible con ese id. 404."""
    for f in ('detalle', 'miniatura'):
        cuerpo = _sin_comentarios(_cuerpo(f))
        assert "404" in cuerpo
        assert '403' not in cuerpo.split('_con_visibilidad')[1][:200]


# ══ 2 · MARCAS: NUNCA SOBRE EL BINARIO ═════════════════════════════════════

def test_la_marca_nace_PRIVADA_y_la_publica_su_autor():
    u = {'id': 5, 'email': 'a@b'}
    marca, _ = fdo.marca_nueva(u, [{'tipo': 'flecha',
                                    'puntos': [{'x': 0.1, 'y': 0.2}]}])
    assert marca['publicada'] is False
    assert fdo.puede_publicar_marca(u, marca)
    assert not fdo.puede_publicar_marca({'id': 9}, marca)


def test_las_marcas_privadas_ajenas_NO_EXISTEN_ni_para_el_admin():
    foto = {'marcas': [
        {'id': 'a', 'por_id': 1, 'publicada': False},
        {'id': 'b', 'por_id': 1, 'publicada': True},
        {'id': 'c', 'por_id': 2, 'publicada': False},
    ]}
    visibles = fdo.marcas_visibles({'id': 2}, foto)
    assert [m['id'] for m in visibles] == ['b', 'c']
    # la poda ocurre EN EL SERVIDOR, no en la pantalla
    assert 'marcas_visibles' in _ruta()


def test_las_coordenadas_de_la_marca_son_RELATIVAS():
    """En píxeles absolutos la marca se descoloca al mostrar la foto a otro
    tamaño — la misma lección de los anclajes de plano."""
    _, malas = fdo.marca_nueva({'id': 1}, [{'tipo': 'flecha',
                                            'puntos': [{'x': 5, 'y': 0.2}]}])
    assert malas
    marca, _ = fdo.marca_nueva({'id': 1}, [{'tipo': 'circulo',
                                            'puntos': [{'x': 0.5, 'y': 0.5}]}])
    assert marca


def test_el_binario_NO_se_toca_nunca():
    """Marcar y editar solo escriben marcas/metadatos. Ninguna ruta reescribe
    el objeto del almacén."""
    fuente = _ruta()
    escrituras = [l for l in fuente.splitlines() if 'upload_file_to_gcs' in l]
    assert len(escrituras) == 1, 'solo la subida original escribe en el almacén'
    for f in ('marcar', 'publicar_marca', 'editar'):
        assert 'upload_file_to_gcs' not in _cuerpo(f)
        assert 'delete_gcs_blob' not in _cuerpo(f)


# ══ 3 · UN SOLO OBJETO · ADJUNTAR ES VINCULAR ══════════════════════════════

def test_el_objeto_es_UNICO_y_el_vinculo_es_el_nombre():
    """El mismo blob no puede ser dos fotos, y los issues que lo citan se
    encuentran por el nombre del objeto — no por una tabla de copias."""
    sql = _sql23()
    assert 'uq_fotos_objeto UNIQUE (objeto)' in sql
    cuerpo = _cuerpo('listar')
    assert "e->>'objeto_externo'" in cuerpo
    assert 'citada_por' in cuerpo


def test_el_mismo_esquema_de_nombres_que_el_GAP07():
    """Dos prefijos serían dos verdades sobre dónde vive la evidencia."""
    assert fdo.nombre_de_objeto('X').startswith('evidencia/X/')
    assert fdo.objeto_es_de_la_obra('evidencia/X/abc', 'X')
    assert not fdo.objeto_es_de_la_obra('evidencia/OTRA/abc', 'X')
    assert not fdo.objeto_es_de_la_obra(None, 'X')


def test_el_GPS_se_limpia_ANTES_de_subir():
    cuerpo = _cuerpo('subir_foto')
    i_limpia = cuerpo.index('privacidad_imagen.limpiar')
    i_sube = cuerpo.index('upload_file_to_gcs')
    assert i_limpia < i_sube, 'si sube primero, las coordenadas ya viajaron'
    # y lo limpiado se guarda APARTE, en la base
    assert 'json.dumps(metadatos' in cuerpo


def test_capturado_en_es_DECLARADO_y_no_se_edita():
    """Es la declaración del dispositivo (GAP 07); editarla reescribiría el
    testimonio."""
    cuerpo = _cuerpo('editar')
    assert 'capturado_en' not in cuerpo.split('for campo in')[1].split(')')[0]
    sql = _sql23()
    assert 'DECLARADO por el dispositivo' in sql


def test_las_fotos_no_se_BORRAN():
    fuente = _ruta()
    assert "methods=['DELETE']" not in fuente
    sql = _sql23()
    assert 'GRANT SELECT, INSERT, UPDATE ON doc_fotos' in sql
    assert 'DELETE ON doc_fotos' not in sql
    # quitar de un álbum sí: deshacer una agrupación no destruye evidencia
    assert 'GRANT SELECT, INSERT, DELETE ON doc_album_fotos' in sql


def test_un_album_no_cruza_obras():
    cuerpo = _cuerpo('agrupar')
    assert 'OTRA_OBRA' in cuerpo
    assert 'project_id = %s' in cuerpo


# ══ 4 · EL MISMO MOTOR DE CAMPO ════════════════════════════════════════════

def test_FOTO_entra_por_el_motor_del_GAP07():
    import sincronizacion_de_campo as sync
    assert sync.FOTO in sync.OBJETOS
    assert sync.ACTOS_DE[sync.FOTO] == (sync.CREATE,)
    # y es CASO A: el binario ya subió por /api/sync/evidencia
    assert (sync.FOTO, sync.CREATE) not in sync.CON_EFECTO_EXTERNO


def test_el_manejador_exige_objeto_DE_LA_OBRA_y_es_idempotente_por_objeto():
    s = io.open(os.path.join(RAIZ, 'routes', 'sync.py'), encoding='utf-8').read()
    cuerpo = s.split('def _foto_create(')[1].split(chr(10) + 'def ')[0]
    assert 'objeto_es_de_la_obra' in cuerpo
    assert "'OTRA_OBRA'" in cuerpo
    assert 'ya_existia' in cuerpo, (
        'el mismo blob con otro operation_id no puede parir dos fotos')
    assert "(sync.FOTO, sync.CREATE): _foto_create" in s
    assert "sync.FOTO: 'fotos'" in s, 'la capa 16 gobierna también las fotos'


def test_la_foto_es_ANCLABLE_a_la_lamina():
    s = io.open(os.path.join(RAIZ, 'routes', 'planos.py'), encoding='utf-8').read()
    assert "'FOTO'" in s.split('_TIPOS_ANCLABLES')[1].split(')')[0]


def test_la_migracion_lleva_los_GRANTS_dentro():
    """Lección F1/F2 del doc 93: la tabla sin permisos del rol de la app es la
    misma avería que la tabla ausente."""
    sql = _sql23()
    assert 'TO ecd_app' in sql
    assert 'SEQUENCE doc_fotos_id_seq' in sql
    # y las identidades del cliente son TEXT, no UUID -- mirando solo el DDL,
    # no los comentarios del fichero (leccion repetida)
    ddl = chr(10).join(l for l in sql.splitlines() if not l.strip().startswith('--'))
    assert 'UUID' not in ddl


def test_la_evidencia_de_campo_TAMBIEN_limpia_el_GPS_antes_de_subir():
    """El agujero que esta prueba cierra: la ruta de evidencia del GAP 07
    subia el binario tal cual, y una foto capturada sin red viajaba con sus
    coordenadas. La regla de privacidad no depende de por que puerta entre la
    foto."""
    s = io.open(os.path.join(RAIZ, 'routes', 'sync.py'), encoding='utf-8').read()
    cuerpo = s.split('def subir_evidencia(')[1].split(chr(10) + 'def ')[0]
    i_limpia = cuerpo.index('privacidad_imagen.limpiar')
    i_sube = cuerpo.index('upload_file_to_gcs')
    assert i_limpia < i_sube
    # y lo limpiado SE DEVUELVE para que el acto lo conserve en doc_fotos.exif
    assert "'exif': metadatos" in cuerpo


# ══ 5 · EL CLIENTE ═════════════════════════════════════════════════════════

def _portal(*partes):
    return io.open(os.path.join(os.path.dirname(RAIZ), 'frontend-docs', *partes),
                   encoding='utf-8').read()


def test_la_galeria_esta_ENGANCHADA_y_conserva_multimedia():
    """Una capacidad sin pantalla no existe (regla del programa). Y el modulo
    legacy no se tira: queda como pestaña."""
    f = _portal('src', 'pages', 'FilesPage.jsx')
    assert "import('../components/FotosModule')" in f
    assert '<FotosModule' in f
    assert 'MultimediaLegacy={MultimediaModule}' in f


def test_sin_red_la_foto_ENCOLA_por_el_motor_del_gap07():
    m = _portal('src', 'components', 'FotosModule.jsx')
    assert 'campo.capturarConEvidencia(' in m
    assert "object_type: 'FOTO'" in m
    assert 'Trabajo de campo' in m, 'se dice DONDE queda lo guardado'


def test_el_exif_limpiado_viaja_con_el_acto():
    """El servidor limpia el GPS al subir la evidencia y DEVUELVE lo limpiado;
    el sincronizador lo funde en el payload antes de mandar el acto, y acaba en
    doc_fotos.exif en vez de perderse."""
    s = _portal('src', 'offline', 'sincronizador.js')
    assert 'd.exif' in s
    assert 'objeto_externo: d.objeto_externo' in s


def test_la_precarga_calienta_tambien_la_galeria():
    s = _portal('src', 'offline', 'precarga.js')
    assert "import('../components/FotosModule')" in s


def test_la_pantalla_declara_la_sensibilidad_y_la_privacidad_del_GPS():
    m = _portal('src', 'components', 'FotosModule.jsx')
    for nivel in ('N0', 'N1', 'N2', 'N3'):
        assert nivel in m
    assert 'GPS' in m, 'la limpieza se DICE al usuario, no se hace en silencio'
    assert 'PRIVADA' in m, 'la marca dice que es privada hasta publicarse'


def test_validate_file_LANZA_y_nadie_le_pregunta_por_valid():
    """DEFECTO REAL cazado por el smoke de NG-02 contra produccion:
    `validate_file` devuelve los DATOS en exito y LANZA FileValidationError en
    fallo -- jamas devuelve {'valid': ...}. Tres rutas comprobaban
    veredicto.get('valid'), que siempre es None: TODA subida por tracking, pins
    y fotos respondia 400 «Fichero no admitido» desde que se escribio el
    patron. Nadie lo vio porque esas subidas no tenian smoke contra produccion.
    Esta prueba casa el contrato con TODOS sus consumidores."""
    import inspect
    import file_validator
    fuente_v = inspect.getsource(file_validator.validate_file)
    assert "'valid'" not in fuente_v, 'si el contrato cambia, cambiar consumidores'
    for ruta in ('fotos.py', 'tracking.py', 'pins.py', 'documents.py'):
        s = io.open(os.path.join(RAIZ, 'routes', ruta), encoding='utf-8').read()
        if 'validate_file' not in s:
            continue
        assert ".get('valid')" not in s, (
            '%s pregunta por una clave que validate_file nunca devuelve' % ruta)
