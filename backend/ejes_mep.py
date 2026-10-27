# -*- coding: utf-8 -*-
"""Los EJES de tuberías y conductos que Autodesk exporta como elementos aparte.

QUÉ PASA
--------
Al traducir un Revit para la web, cada tubería, conexión (codo, tee, reducción…), accesorio o
conducto sale en DOS nodos: su sólido y su línea de eje. El eje no tiene «Nombre de tipo», pero
lleva COPIADOS todos los parámetros del elemento, códigos de partida y metrados a mano incluidos.
Si entra al inventario, la Planilla y Filters cuentan cada pieza dos veces.

Medido el 26-oct-2026 en Interferencias (producción): 439 ejes de «Uniones de tubería» guardados
como conexiones, 152 con partida (2.5.1.1: 52,3 m en vez de 45,38 m). El filtro existía, pero solo
reconocía las categorías en inglés y «Tuberías»: faltaban los nombres en español de las conexiones,
accesorios y flexibles.

QUÉ HACE
--------
`es_eje_mep(categoria, propiedades)` → True si el nodo es de una categoría de tuberías/conductos
(en inglés o en español, tal como la escribe Revit) y no tiene «Nombre de tipo». No cambia la
categoría que se guarda (Filters y las vistas guardadas siguen igual): solo decide si el nodo entra.

Sin Flask ni base de datos: tests/test_ejes_mep.py.
"""

# Categorías de Revit cuyos elementos Autodesk duplica con su eje. Inglés (lo que deja
# normalize_revit_category) y español (lo que llega de un Revit en español y no se traduce).
CATEGORIAS_CON_EJE = frozenset({
    # Inglés
    'Pipes', 'Pipe Fittings', 'Pipe Accessories', 'Flex Pipes',
    'Ducts', 'Duct Fittings', 'Duct Accessories', 'Flex Ducts',
    'Conduits', 'Conduit Fittings', 'Cable Trays', 'Cable Tray Fittings',
    # Español
    'Tuberías', 'Uniones de tubería', 'Uniones de tuberías', 'Accesorios de tubería', 'Accesorios de tuberías',
    'Tuberías flexibles',
    'Conductos', 'Uniones de conducto', 'Uniones de conductos', 'Accesorios de conducto', 'Accesorios de conductos',
    'Conductos flexibles',
    'Tubos', 'Uniones de tubo', 'Bandejas de cables', 'Uniones de bandeja de cables',
})


def nombre_de_tipo(propiedades):
    """El «Nombre de tipo» del elemento (Revit en español o en inglés), o ''."""
    for grupo in ('Datos de identidad', 'Identity Data'):
        g = propiedades.get(grupo) or {}
        for clave in ('Nombre de tipo', 'Type Name'):
            v = g.get(clave)
            if v is not None and str(v).strip():
                return str(v).strip()
    return ''


def es_eje_mep(categoria, propiedades):
    """¿Es el eje (línea de centro) de una tubería, conexión, accesorio o conducto? Entonces no se guarda."""
    return str(categoria or '').strip() in CATEGORIAS_CON_EJE and not nombre_de_tipo(propiedades or {})
