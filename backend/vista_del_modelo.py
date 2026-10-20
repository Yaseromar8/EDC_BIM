# -*- coding: utf-8 -*-
"""LA VISTA DEL MODELO: una sola decisión, guardada por NOMBRE, resuelta en cada versión.

Decisión del propietario, 20-oct-2026 (F1 de docs/visor/10_VISTA_DEL_MODELO.md).

POR QUÉ POR NOMBRE Y NO POR GUID
--------------------------------
Medido en Autodesk sobre el mismo archivo (500125-CSSP001-000, 1_CANAL):

    vista        v4        v6        v7
    NAVISWORKS   de7d400e  de7d400e  de7d400e
    NUEVA        12c5d8cb  da2c99ea  93f908ea
    APS_SCL      --        --        cb5e76ee

El GUID de una vista puede cambiar en cada versión, y las vistas aparecen y
desaparecen. Guardar solo el GUID hacía que, tras Actualizar, el extractor cayera
EN SILENCIO a «la vista de más elementos» y el visor a la vista por defecto: cada
uno podía mostrar una vista distinta. El inventario quedaba con elementos sin pieza
en lo dibujado y los Filtros esperaban para siempre.

LA REGLA, LA MISMA PARA TODOS
-----------------------------
  1. Con NOMBRE elegido: la vista de ese nombre en esta versión. Si no existe, se
     dice («no_existe»). Nunca se elige otra.
  2. Sin nombre pero con GUID (modelos anteriores a esta regla): ese GUID si existe
     en esta versión; si no, «guid_desconocido» y quien llama decide, como antes.
  3. Sin nada elegido: «sin_eleccion» (la ventana de importar ya no lo produce).

El servidor guarda siempre, junto al nombre, el GUID de la versión ACTUAL. Así el
visor, que carga por GUID, ve exactamente la vista de la que salió el inventario.
"""
import requests

APS_MD = 'https://developer.api.autodesk.com/modelderivative/v2/designdata'


def _clave(nombre):
    return ' '.join(str(nombre or '').split()).casefold()


def resolver_vista(vistas, nombre=None, guid=None):
    """(vista | None, como). `vistas`: [{'name', 'guid', ...}] de UNA versión."""
    vistas = [v for v in (vistas or []) if isinstance(v, dict) and v.get('guid')]
    if _clave(nombre):
        candidatas = [v for v in vistas if _clave(v.get('name')) == _clave(nombre)]
        if not candidatas:
            return None, 'no_existe'
        # Dos vistas con el mismo nombre: manda el GUID guardado si coincide.
        exacta = next((v for v in candidatas if guid and v['guid'] == guid), None)
        return (exacta or candidatas[0]), 'nombre'
    if guid:
        vista = next((v for v in vistas if v['guid'] == guid), None)
        return (vista, 'guid') if vista else (None, 'guid_desconocido')
    return None, 'sin_eleccion'


def vistas_de_la_version(urn, token, timeout=(10, 60)):
    """(vistas, estado). estado: 'ok' | 'procesando' (202/404: Autodesk aún no la tiene) | 'error'."""
    try:
        r = requests.get(f'{APS_MD}/{urn}/metadata', headers={'Authorization': f'Bearer {token}'},
                         timeout=timeout)
    except requests.RequestException:
        return [], 'error'
    if r.status_code in (202, 404):
        return [], 'procesando'
    if r.status_code != 200:
        return [], 'error'
    datos = (r.json() or {}).get('data', {}) or {}
    return [{'name': v.get('name'), 'guid': v.get('guid'), 'role': v.get('role')}
            for v in (datos.get('metadata') or []) if v.get('guid')], 'ok'


def mensaje_de_vista_ausente(nombre):
    return (f'La vista «{nombre}» no existe en esta versión del modelo. Elige otra vista '
            f'(Relink) o vuelve a crearla en Revit y actualiza.')


def llevar_vista_a_la_version(modelo, urn_anterior, urn_nueva, token):
    """Antes de cambiar un modelo de versión: (puede_cambiar, aviso).

    Si el modelo tiene vista elegida, la busca POR NOMBRE en la versión nueva y deja en
    `modelo` el GUID que le corresponde allí. Si no está, NO se cambia de versión: un
    modelo nunca debe pasar a una versión cuya vista no puede dibujar ni extraer. Los
    modelos sin vista elegida siguen como antes.
    """
    nombre = modelo.get('defaultViewName')
    guid = modelo.get('defaultViewGuid')
    if not nombre and guid and urn_anterior:
        # Anterior a esta regla: se averigua el nombre en la versión que tenía.
        previas, estado = vistas_de_la_version(urn_anterior, token)
        if estado == 'ok':
            vista, _ = resolver_vista(previas, None, guid)
            if vista:
                nombre = vista.get('name')
    if not nombre:
        return True, None
    nuevas, estado = vistas_de_la_version(urn_nueva, token)
    if estado == 'procesando':
        return False, 'La versión nueva aún se está procesando en Autodesk. Reintenta en unos minutos.'
    if estado != 'ok':
        return False, 'No se pudo comprobar la vista en la versión nueva. Reintenta en unos minutos.'
    vista, como = resolver_vista(nuevas, nombre, None)
    if not vista:
        return False, mensaje_de_vista_ausente(nombre)
    modelo['defaultViewName'] = vista.get('name')
    modelo['defaultViewGuid'] = vista.get('guid')
    return True, None
