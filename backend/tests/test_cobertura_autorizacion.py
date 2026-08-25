# -*- coding: utf-8 -*-
"""Ninguna ruta nueva puede manejar datos de una obra sin quedar cubierta.

POR QUE ESTE TEST
-----------------
BASELINE 0 · C8. El problema de fondo no eran las rutas concretas -- esas se
arreglan una a una -- sino que NADA impedia que la siguiente naciera igual de
desprotegida. Una revision manual caduca el dia que alguien anade un endpoint.

POR QUE ESTA REESCRITO (13-ago-2026)
------------------------------------
La version anterior daba 144 rutas de obra y 15 sin cubrir, y las dos cifras eran
falsas por dos motivos:

  1. SOLO MIRABA routes/*.py. Las 24 rutas declaradas con @app.route en
     server.py no las veia NUNCA -- entre ellas /api/inventory, que se comprobo
     que filtraba datos de otra obra.
  2. PARA DECIDIR SI UNA RUTA TOCA DATOS DE OBRA exigia que el cuerpo mencionara
     literalmente model_urn, project_id, scope_urn u 'obra'. Una ruta que
     consulta doc_rfis y no escribe ninguna de esas palabras quedaba fuera del
     barrido. Asi se escapaban 49 rutas, varias de ellas explotables.

Con el detector arreglado, la medida real del 13-ago-2026 es: **177** rutas que
tocan datos de obra, no 144. Que la cifra empeorase al arreglar el detector es
justo lo que tenia que pasar: antes no se estaba midiendo, se estaba mirando a
otro lado.

LAS DOS VIAS DE COBERTURA
-------------------------
1. GUARDIA PROPIA dentro de la vista (verify_project_access, guardia_de_recurso,
   check_folder_permission...). Protege siempre.
2. EL CONTROL CENTRAL del middleware: si la peticion trae la obra bajo alguno de
   los nombres de _CLAVES_OBRA y el resolutor sabe traducirlo. Con
   ENFORCE_PROJECT_AUTHZ apagado esta via NO protege: solo registra.
"""
import os
import re

RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'routes')
BACKEND = os.path.dirname(RAIZ)

GUARDIAS = ('verify_project_access', 'check_folder_permission', '_hay_acceso', '_solo_admin',
            '_require_admin', '_check_project_access', '_guardia_del_conjunto',
            '_guardia_del_nodo', '_acceso_al_recurso', 'acceso_por_obra_id',
            'get_effective_permission', 'requiere_rol', '_obra_del_conjunto', 'obra_del_blob',
            'guardia_de_recurso', 'guardia_de_obra', '_filtro_de_obra', '_is_admin',
            '_assert_project_access',
            # La guardia del DOCUMENTO, para los manejadores que reciben un
            # fichero (id de nodo o ruta del objeto) en vez de una obra.
            'guardia_del_documento',
            # La del comparador de versiones (17-ago): sus scopes viajan
            # ANIDADOS en el cuerpo, invisibles para el resolutor central, y
            # resuelve la obra del DATO -- un scope 'source' es un urn de
            # version, no una obra.
            '_guardia_scopes')

# Tablas cuyo contenido pertenece a UNA obra. Medidas contra el esquema real:
# son las que tienen model_urn, project_id, scope_urn o app_project_id.
# Si el esquema crece, esta lista se refresca con esa misma consulta.
TABLAS_DE_OBRA = {
    'activity_log', 'asset_user_data', 'civil_alignments', 'civil_sections', 'civil_surfaces',
    'control_pins', 'custom_attr_defs', 'custom_attr_values', 'daily_reports', 'doc_partidas',
    'doc_redlines', 'doc_reviews', 'doc_rfis', 'doc_sets', 'document_shares', 'element_docs',
    'file_nodes', 'file_versions', 'gemelo_assets', 'gemelo_ingestion_status',
    'gemelo_properties', 'geo_control_points', 'geo_model_georef', 'inventory_assets',
    'lob_activities', 'lob_avance', 'lob_config', 'lob_dataset_audit', 'lob_datasets',
    'lob_frentes', 'lob_linear_methodologies', 'lob_linear_profiles',
    'lob_linear_progress_events', 'lob_linear_resources', 'lob_linear_scenarios',
    'lob_linear_zones', 'lob_partidas', 'lob_schedule_tasks', 'model_config',
    'nomenclatura_config', 'pdf_markups', 'photo_evidences', 'presupuesto_maestro',
    'project_settings', 'project_users', 'saved_views', 'tracking_details', 'tracking_pins',
    'tracking_progress', 'transmittals', 'triaje_seguridad', 'upload_sessions',
}

PARAM = re.compile(r'<(?:\w+:)?(\w+)>')

# Rutas que hoy no quedan cubiertas por ninguna de las dos vias. CADA UNA lleva
# su motivo. Esta lista solo puede ENCOGER: si crece, es que se ha anadido un
# endpoint sin decidir como se protege.
SIN_CUBRIR = {
    # Las cuatro rutas de 4D LOB lineal que figuraban aqui como PENDIENTE
    # llevaban guardia desde el principio: _assert_project_access, que comprueba
    # project_users y responde 403. No estaba en la lista GUARDIAS, asi que el
    # detector las contaba como deuda. La deuda era del detector.

    # No manejan datos de obra: el detector las marca por consultar users/projects.
    ('routes/auth.py', '/api/auth/google'): 'ruta de autenticacion, no toca datos de obra',
    ('routes/auth.py', '/api/auth/forgot-password'): 'ruta de autenticacion, no toca datos de obra',
    ('routes/auth.py', '/api/auth/sesiones/cerrar-otras'): 'G4a: actua SOLO sobre las sesiones de quien llama (exige sesion y no recibe user_id); no toca datos de obra',
    # CAPA 14: borrar una PLANTILLA no toca ninguna obra -- una plantilla es un
    # molde congelado en la entidad, y las obras creadas con ella no cambian al
    # borrarla. Su guardia es de ENTIDAD (`roles_de_entidad.guardia` con
    # `gestionar_obras`, fail-closed). El detector la marca por vecindad con
    # rutas de obra. CAPTURAR, que SI lee la estructura de una obra concreta,
    # lleva `guardia_de_obra` ademas de la facultad -- y por eso no esta aqui.
    ('routes/auth.py', '/api/plantillas-de-obra/<int:plantilla_id>'): 'CAPA 14: borra un molde de la ENTIDAD; no lee ni escribe ninguna obra. Guardia de entidad fail-closed (gestionar_obras)',
    # Por diseno no pueden acotarse a UNA obra: son las que listan o dan acceso.
    ('routes/projects.py', '/api/projects'): 'LISTA obras; filtra por project_users y devuelve vacio al anonimo',
    ('routes/projects.py', '/api/hubs/<hub_id>/projects'): 'lista obras de un hub; mismo filtro por pertenencia',
    ('routes/projects.py', '/api/projects/join'): 'canjea un codigo de invitacion; aun no hay obra. Protegida con limite de intentos y codigo de `secrets` de 8 caracteres',
    ('server.py', '/api/inventory/schema'): 'catalogo de campos, igual para todas las obras',
    # GAP 05. Devuelve el catalogo MasterFormat sugerido, que es una constante
    # del codigo: ni lee ni escribe nada. El detector la marca porque su
    # docstring explica que la estructura la fija el contrato de cada obra --y
    # esa frase tiene que quedarse, porque es la decision de diseno del gap--.
    # Se declara aqui en vez de reescribir la prosa para esquivar al detector.
    ('routes/specs.py', '/catalogo'): 'catalogo de divisiones SUGERIDAS, constante del codigo, igual para todas las obras; no consulta la base',
    ('routes/documents.py', '/api/docs/shared/<share_id>'): 'enlace compartido: el permiso lo da el propio share, no la pertenencia',
    ('routes/pins.py', '/uploads/pins/<path:filename>'): 'exige sesion o permiso firmado del fichero, pero no acota por obra',
    # PENDIENTE: reciben un identificador cuya obra hay que deducir consultando
    # la base. Deuda declarada, no excusa.
    ('routes/civil_solids.py', '/api/civil/extract-surfaces'): 'PENDIENTE: deducir la obra del modelo',
    ('routes/compare.py', '/api/compare/cleanup'): 'borra solo el ambito temporal fijo __cmp__, que no es de ninguna obra. Residual: es compartido, y un usuario puede tirar la comparacion en curso de otro',
    ('routes/digital_twin.py', '/api/modelos/firmar-subida'): 'exige rol admin dentro de la vista; traducir cuesta creditos de Autodesk',
    ('server.py', '/api/inventory'): 'va por external_id, no por obra: el limite esta en el propio SQL contra project_users',
    ('server.py', '/api/inventory/bulk'): 'va por external_id, no por obra: el limite esta en el propio SQL contra project_users',
    # Anadida el 17-ago. NO es deuda por descuido: no hay de donde sacar la
    # obra. El unico dato es el id del WorkItem de Autodesk y no existe
    # tabla que lo ate a una obra -- el vinculo vive en memoria del proceso.
    # Lo que SI se cerro: el nombre del objeto del bucket se aceptaba crudo
    # de la query, o sea que cualquier sesion leia cualquier JSON del bucket.
    ('routes/civil_design_automation.py', '/api/civil/alignment-result'):
        'sin obra deducible (solo el id del WorkItem); el nombre del objeto ya no lo elige quien llama. Residual declarado: sin control por obra',
    ('server.py', '/maps/uploads/<path:filename>'): 'PENDIENTE: sirve ficheros de mapa por nombre',
}


def _claves_de_obra():
    with open(os.path.join(BACKEND, 'auth_middleware.py'), encoding='utf-8') as f:
        src = f.read()
    bloque = re.search(r'_CLAVES_OBRA\s*=\s*\((.*?)\)\n', src, re.S).group(1)
    return set(re.findall(r"'([^']+)'", bloque))


def _ficheros():
    """routes/*.py Y server.py. Olvidar server.py dejaba 24 rutas sin mirar."""
    for nombre in sorted(os.listdir(RAIZ)):
        if nombre.endswith('.py'):
            yield 'routes/' + nombre, os.path.join(RAIZ, nombre)
    yield 'server.py', os.path.join(BACKEND, 'server.py')


def _por_recurso():
    """Endpoints cuya obra resuelve el middleware consultando el propio recurso.

    Son dos diccionarios de `perimetro_de_obra`: RUTAS_POR_RECURSO (el id viaja
    en la RUTA) y RUTAS_POR_QUERY (viaja en la QUERY). Se leen del modulo, no se
    copian aqui: una copia envejece y el detector volveria a contar como deuda
    rutas que el control ya cubre -- que es exactamente lo que pasaba.
    """
    try:
        import perimetro_de_obra as pm
    except Exception:
        return set()
    return set(getattr(pm, 'RUTAS_POR_RECURSO', {})) | set(getattr(pm, 'RUTAS_POR_QUERY', {}))


def _rutas():
    """(fichero, url, tiene_guardia, resuelve_obra) para cada ruta que toca una obra."""
    claves = _claves_de_obra()
    salida = []
    for relativo, ruta in _ficheros():
        with open(ruta, encoding='utf-8', errors='ignore') as f:
            lineas = f.read().split('\n')
        i = 0
        while i < len(lineas):
            m = re.match(r"@\w+\.route\(\s*['\"]([^'\"]+)['\"]", lineas[i].strip())
            if not m:
                i += 1
                continue
            url = m.group(1)
            j = i + 1
            while j < len(lineas) and not re.match(r'^def ', lineas[j]):
                j += 1
            deco = '\n'.join(lineas[i:j])
            mv = re.match(r'^def\s+(\w+)', lineas[j]) if j < len(lineas) else None
            nombre_vista = mv.group(1) if mv else ''
            k, cuerpo = j + 1, ''
            while k < len(lineas) and not re.match(r'^(@|def )', lineas[k]):
                cuerpo += lineas[k] + '\n'
                k += 1
            # Dos senales, no una: que hable de obra, O que consulte una tabla
            # cuyo contenido pertenece a una obra. Con solo la primera se
            # escapaban 49 rutas.
            menciona = re.search(r'model_urn|project_id|scope_urn|\bobra\b', cuerpo)
            toca_tabla = any(re.search(r'\b' + t + r'\b', cuerpo) for t in TABLAS_DE_OBRA)
            if menciona or toca_tabla:
                guardia = any(g in cuerpo or g in deco for g in GUARDIAS)
                usadas = set(re.findall(
                    r"(?:args|form|view_args|data|payload|d)\.get\(\s*['\"](\w+)['\"]", cuerpo))
                usadas |= set(PARAM.findall(url))
                # El middleware resuelve por tres vias, no una: la clave de obra
                # (_CLAVES_OBRA), el id del recurso en la RUTA
                # (RUTAS_POR_RECURSO) y el id del recurso en la QUERY
                # (RUTAS_POR_QUERY, anadida el 17-ago). Mirar solo la primera
                # contaba como deuda rutas que el control ya cubre.
                resuelve = bool(usadas & claves) or nombre_vista in _por_recurso()
                salida.append((relativo, url, guardia, resuelve))
            i = k
    return salida


def test_no_aparecen_rutas_sin_cubrir_que_no_esten_declaradas():
    """Si esto falla, se ha anadido una ruta que toca datos de obra sin protegerla.

    No basta con anadirla a SIN_CUBRIR para que pase: hay que escribir POR QUE, y
    si el motivo es 'PENDIENTE' es deuda declarada, no una excusa.
    """
    nuevas = {(f, u) for f, u, g, r in _rutas() if not g and not r} - set(SIN_CUBRIR)
    assert not nuevas, (
        'rutas que manejan datos de obra sin guardia propia y sin que el middleware '
        'pueda resolver la obra:\n' + '\n'.join(f'  {f}  {u}' for f, u in sorted(nuevas)))


def test_la_lista_de_excepciones_no_tiene_sobrantes():
    """Una excepcion que ya no hace falta se retira: si no, la lista deja de significar nada."""
    reales = {(f, u) for f, u, g, r in _rutas() if not g and not r}
    sobran = set(SIN_CUBRIR) - reales
    assert not sobran, ('estas ya no son excepciones y hay que quitarlas de la lista:\n'
                        + '\n'.join(f'  {f}  {u}' for f, u in sorted(sobran)))


def test_cada_excepcion_esta_justificada():
    for clave, motivo in SIN_CUBRIR.items():
        assert motivo and len(motivo) > 15, f'{clave} no tiene motivo escrito'


def test_el_detector_mira_tambien_server_py():
    """Regresion sobre el punto ciego que tenia: 24 rutas de server.py fuera del
    barrido, una de ellas filtrando datos de otra obra."""
    ficheros = {f for f, _u, _g, _r in _rutas()}
    assert 'server.py' in ficheros, 'el detector volvio a mirar solo routes/'


def test_la_cobertura_no_empeora():
    """Cifras de referencia del 13-ago-2026, con el detector ya arreglado.
    Pueden mejorar; no deben empeorar."""
    rutas = _rutas()
    con_guardia = sum(1 for _f, _u, g, _r in rutas if g)
    assert len(rutas) >= 175, f'el detector dejo de ver rutas: {len(rutas)} < 175'
    assert con_guardia >= 70, f'bajaron las rutas con guardia propia: {con_guardia} < 70'


# -- Las exenciones no pueden ser fantasmas ni cheques en blanco -----------

import pytest

def test_las_exenciones_por_endpoint_existen_de_verdad():
    """Una exencion con un nombre de vista que no existe no exenta nada.

    Paso de verdad: escribi 'update_inventory_bulk' y la vista se llama
    'bulk_update_inventory'. La exencion quedaba muda y esa ruta habria seguido
    devolviendo 403 bajo ENFORCE -- con el agravante de que el diccionario decia
    lo contrario, asi que al depurarlo nadie habria mirado ahi.
    """
    import os
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    server = pytest.importorskip('server')
    import auth_middleware as am

    reales = {n.rsplit('.', 1)[-1] for n in server.app.view_functions}
    fantasmas = sorted(set(am._ENDPOINTS_JUSTIFICADOS) - reales)
    assert not fantasmas, (
        'estas exenciones nombran vistas que no existen, asi que no exentan '
        'nada y ademas mienten: ' + ', '.join(fantasmas))


def test_las_rutas_por_recurso_apuntan_a_vistas_y_tablas_declaradas():
    """Lo mismo para la maquinaria de resolucion: un endpoint mal escrito ahi
    no resuelve la obra, y bajo ENFORCE eso es un 403 al usuario legitimo."""
    import os
    os.environ.setdefault('APP_SECRET', 'x' * 32)
    server = pytest.importorskip('server')
    import perimetro_de_obra as po

    reales = {n.rsplit('.', 1)[-1] for n in server.app.view_functions}
    for nombre, mapa in (('RUTAS_POR_RECURSO', po.RUTAS_POR_RECURSO),
                         ('RUTAS_POR_QUERY', po.RUTAS_POR_QUERY)):
        fantasmas = sorted(set(mapa) - reales)
        assert not fantasmas, (
            f'{nombre} nombra vistas inexistentes: ' + ', '.join(fantasmas))
        sin_tabla = sorted({t for t, _p in mapa.values()} - set(po.RECURSOS))
        assert not sin_tabla, (
            f'{nombre} usa tablas no declaradas en RECURSOS: ' + ', '.join(sin_tabla))
