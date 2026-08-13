# -*- coding: utf-8 -*-
"""Ninguna ruta nueva puede manejar datos de una obra sin quedar cubierta.

POR QUE ESTE TEST
-----------------
BASELINE 0 · C8: "El aislamiento entre obras depende de guardias escritas a mano, y
la mayoria de rutas no las tienen". El problema de fondo no eran las rutas concretas
-- esas se arreglan una a una -- sino que NADA impedia que la siguiente naciera
igual de desprotegida. Una revision manual caduca el dia que alguien anade un
endpoint.

Esto convierte el barrido en un control permanente: si aparece una ruta que toca
datos de obra y no queda cubierta por ninguna de las dos vias, el test falla y hay
que decidir explicitamente que hacer con ella.

LAS DOS VIAS DE COBERTURA
-------------------------
1. GUARDIA PROPIA dentro de la vista (verify_project_access, _acceso_al_recurso,
   check_folder_permission...). Protege siempre.
2. EL CONTROL CENTRAL del middleware: si la peticion trae la obra bajo alguno de
   los nombres de _CLAVES_OBRA, con ENFORCE_PROJECT_AUTHZ=true queda cubierta.
   Mientras ENFORCE siga apagado esta via NO protege: solo registra. Por eso el
   test cuenta las dos por separado.

Medido el 13-ago-2026: 222 rutas · 144 tocan datos de obra · 62 con guardia propia
· 66 cubiertas por el control central · 16 en la lista de abajo.
"""
import os
import re

RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'routes')
BACKEND = os.path.dirname(RAIZ)

GUARDIAS = ('verify_project_access', 'check_folder_permission', '_hay_acceso', '_solo_admin',
            '_require_admin', '_check_project_access', '_guardia_del_conjunto',
            '_guardia_del_nodo', '_acceso_al_recurso', 'acceso_por_obra_id',
            'get_effective_permission', 'requiere_rol', '_obra_del_conjunto', 'obra_del_blob')

PARAM = re.compile(r'<(?:\w+:)?(\w+)>')

# Rutas que hoy no quedan cubiertas por ninguna de las dos vias. CADA UNA lleva su
# motivo. Esta lista solo puede ENCOGER: si crece, es que se ha anadido un endpoint
# sin decidir como se protege.
SIN_CUBRIR = {
    # No manejan datos de obra: el detector las marca por mencionar 'project'.
    ('auth.py', '/api/auth/google'): 'ruta de autenticacion, no toca datos de obra',
    ('auth.py', '/api/auth/forgot-password'): 'ruta de autenticacion, no toca datos de obra',
    # Por diseno no pueden acotarse a UNA obra: son las que listan o dan acceso.
    ('projects.py', '/api/projects'): 'LISTA obras; filtra por project_users y devuelve vacio al anonimo',
    ('projects.py', '/api/hubs/<hub_id>/projects'): 'lista obras de un hub; mismo filtro por pertenencia',
    ('projects.py', '/api/projects/join'): 'canjea un codigo de invitacion; aun no hay obra',
    # Reciben un identificador cuya obra solo se puede deducir consultando la base.
    # El middleware no puede resolverla desde la peticion: necesitan guardia propia.
    ('civil_solids.py', '/api/civil/extract-surfaces'): 'PENDIENTE: deducir la obra del modelo',
    ('compare.py', '/api/compare/cleanup'): 'PENDIENTE: limpieza de comparacion',
    ('digital_twin.py', '/api/modelos/firmar-subida'): 'exige rol admin dentro de la vista; traducir cuesta creditos de Autodesk',
    ('lob4d_linear.py', '/api/lob/linear/state'): 'PENDIENTE: 4D LOB lineal',
    ('lob4d_linear.py', '/api/lob/linear/bootstrap'): 'PENDIENTE: 4D LOB lineal',
    ('lob4d_linear.py', '/api/lob/linear/scenarios'): 'PENDIENTE: 4D LOB lineal',
    ('lob4d_linear.py', '/api/lob/linear/progress'): 'PENDIENTE: 4D LOB lineal',
    ('partidas.py', '/<partida_id>'): 'PENDIENTE: deducir la obra de la partida',
    ('pdf_tools.py', '/api/pdf/markups'): 'PENDIENTE: marcas sobre PDF',
    ('pins.py', '/uploads/pins/<path:filename>'): 'exige sesion o permiso firmado del fichero, pero no acota por obra',
}


def _claves_de_obra():
    with open(os.path.join(BACKEND, 'auth_middleware.py'), encoding='utf-8') as f:
        src = f.read()
    bloque = re.search(r'_CLAVES_OBRA\s*=\s*\((.*?)\)\n', src, re.S).group(1)
    return set(re.findall(r"'([^']+)'", bloque))


def _rutas():
    """(fichero, url, tiene_guardia, resuelve_obra) para cada ruta que toca una obra."""
    claves = _claves_de_obra()
    salida = []
    for nombre in sorted(os.listdir(RAIZ)):
        if not nombre.endswith('.py'):
            continue
        with open(os.path.join(RAIZ, nombre), encoding='utf-8', errors='ignore') as f:
            lineas = f.read().split('\n')
        i = 0
        while i < len(lineas):
            m = re.match(r"@\w+\.route\(\s*['\"]([^'\"]+)['\"]", lineas[i])
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
            if re.search(r'model_urn|project_id|scope_urn|\bobra\b', cuerpo):
                guardia = any(g in cuerpo or g in deco for g in GUARDIAS)
                usadas = set(re.findall(
                    r"(?:args|form|view_args|data|payload|d)\.get\(\s*['\"](\w+)['\"]", cuerpo))
                usadas |= set(PARAM.findall(url))
                salida.append((nombre, url, guardia, bool(usadas & claves)))
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


def test_la_cobertura_no_empeora():
    """Cifra de referencia del 13-ago-2026. Puede mejorar; no debe empeorar."""
    rutas = _rutas()
    con_guardia = sum(1 for _f, _u, g, _r in rutas if g)
    assert len(rutas) >= 140, 'el detector dejo de ver rutas: revisar el patron'
    assert con_guardia >= 62, f'bajaron las rutas con guardia propia: {con_guardia} < 62'
