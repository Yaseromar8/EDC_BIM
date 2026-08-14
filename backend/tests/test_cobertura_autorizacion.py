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
            '_assert_project_access')

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
    # Por diseno no pueden acotarse a UNA obra: son las que listan o dan acceso.
    ('routes/projects.py', '/api/projects'): 'LISTA obras; filtra por project_users y devuelve vacio al anonimo',
    ('routes/projects.py', '/api/hubs/<hub_id>/projects'): 'lista obras de un hub; mismo filtro por pertenencia',
    ('routes/projects.py', '/api/projects/join'): 'canjea un codigo de invitacion; aun no hay obra',
    ('server.py', '/api/inventory/schema'): 'catalogo de campos, igual para todas las obras',
    ('routes/documents.py', '/api/docs/shared/<share_id>'): 'enlace compartido: el permiso lo da el propio share, no la pertenencia',
    ('routes/ai.py', '/api/ai/warmup'): 'calienta el modelo, no lee datos',
    ('routes/pins.py', '/uploads/pins/<path:filename>'): 'exige sesion o permiso firmado del fichero, pero no acota por obra',
    # PENDIENTE: reciben un identificador cuya obra hay que deducir consultando
    # la base. Deuda declarada, no excusa.
    ('routes/ai.py', '/api/ai/analyze-title'): 'PENDIENTE: deducir la obra del documento',
    ('routes/civil_solids.py', '/api/civil/extract-surfaces'): 'PENDIENTE: deducir la obra del modelo',
    ('routes/compare.py', '/api/compare/cleanup'): 'PENDIENTE: limpieza de comparacion',
    ('routes/compare.py', '/api/compare/diff'): 'PENDIENTE: comparacion de versiones',
    ('routes/compare.py', '/api/compare/element'): 'PENDIENTE: comparacion de elemento',
    ('routes/compare.py', '/api/compare/element-metrados'): 'PENDIENTE: comparacion de metrados',
    ('routes/compare.py', '/api/compare/metrados'): 'PENDIENTE: comparacion de metrados',
    ('routes/digital_twin.py', '/api/modelos/firmar-subida'): 'exige rol admin dentro de la vista; traducir cuesta creditos de Autodesk',
    ('routes/element_docs.py', '/api/element-docs'): 'PENDIENTE: acotar por la obra del elemento',
    ('routes/pdf_tools.py', '/api/pdf/markups'): 'PENDIENTE: marcas sobre PDF',
    ('routes/uploads.py', '/api/uploads/<upload_id>'): 'PENDIENTE: acotar por la obra de la subida',
    ('routes/uploads.py', '/api/uploads/progress'): 'PENDIENTE: acotar por la obra de la subida',
    ('routes/uploads.py', '/api/uploads/status/<upload_id>'): 'PENDIENTE: entrega el destino de escritura; acotar por obra',
    ('server.py', '/api/inventory'): 'PENDIENTE: el urn resuelve, pero conviene guardia propia',
    ('server.py', '/api/inventory/bulk'): 'PENDIENTE: el urn resuelve, pero conviene guardia propia',
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
                salida.append((relativo, url, guardia, bool(usadas & claves)))
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
