"""Política de acceso declarada por endpoint.

QUÉ PROBLEMA RESUELVE
El middleware decidía por PREFIJO DE PATH. Eso falla de una forma silenciosa y
grave: '/api/projects' (sin barra final) en la lista pública tapaba también
POST /api/projects/<id>/users, POST /api/projects/join y PUT/DELETE
/api/projects/<id>. Nadie lo escribió queriendo; salió de que un prefijo es una
afirmación sobre TODAS las rutas presentes y futuras que empiecen igual.

Aquí se razona por ENDPOINT (blueprint.funcion), que Flask resuelve DESPUÉS de
emparejar la URL. '/api/projects/<id>/users' deja de ser "un prefijo" y pasa a
ser `auth.update_project_users`, que se marca solo.

CÓMO SE USA
    @publico(motivo='latido de servicio; debe responder sin sesión')
    @publico_en_lectura(motivo='vistas compartidas por enlace, sin sesión')
    @requiere_sesion
    @requiere_rol('admin')

Y una sola llamada, tras registrar los blueprints, pone el valor por defecto de
cada blueprint a lo que no traiga política explícita. Así documents.py (37
rutas) se cubre con una línea y solo las EXCEPCIONES llevan decorador.

POR QUÉ 'motivo' ES OBLIGATORIO EN LO PÚBLICO
Porque abrir una ruta debe costar una frase. El test de inventario falla si
alguien marca algo público sin escribir por qué.
"""

import os

from flask import g, jsonify, request

from app_logging import get_logger

logger = get_logger('politica')

PUBLICO = 'publico'
PUBLICO_LECTURA = 'publico_en_lectura'
SESION = 'sesion'
ROL = 'rol'

METODOS_LECTURA = ('GET', 'HEAD', 'OPTIONS')

# sombra  -> evalúa la política y REGISTRA lo que bloquearía, pero deja pasar
#            lo que decida la lógica antigua. Es el valor por defecto.
# estricto-> la política manda.
MODO = os.getenv('AUTH_POLICY_MODE', 'sombra').strip().lower()


class Politica:
    __slots__ = ('tipo', 'motivo', 'rol')

    def __init__(self, tipo, motivo=None, rol=None):
        self.tipo = tipo
        self.motivo = motivo
        self.rol = rol

    def __repr__(self):
        extra = f" rol={self.rol}" if self.rol else ''
        return f"<Politica {self.tipo}{extra}>"

    def evaluar(self, metodo, usuario):
        """Devuelve None si se permite, o (mensaje, codigo, http) si se niega."""
        if self.tipo == PUBLICO:
            return None
        if self.tipo == PUBLICO_LECTURA and metodo in METODOS_LECTURA:
            return None
        if not usuario:
            return ('Autenticación requerida', 'NO_TOKEN', 401)
        if self.tipo == ROL and usuario.get('role') != self.rol:
            return (f'Necesitas rol {self.rol} para esta operación', 'ROL_INSUFICIENTE', 403)
        return None


def _marcar(politica):
    def decorador(fn):
        fn._politica = politica
        return fn
    return decorador


def publico(motivo):
    """Abierto a cualquiera, en cualquier método. Exige justificación escrita."""
    if not motivo or not motivo.strip():
        raise ValueError('publico() exige un motivo escrito')
    return _marcar(Politica(PUBLICO, motivo))


def publico_en_lectura(motivo):
    """GET/HEAD abiertos; POST/PUT/PATCH/DELETE exigen sesión."""
    if not motivo or not motivo.strip():
        raise ValueError('publico_en_lectura() exige un motivo escrito')
    return _marcar(Politica(PUBLICO_LECTURA, motivo))


def requiere_sesion(fn):
    fn._politica = Politica(SESION)
    return fn


def requiere_rol(rol):
    return _marcar(Politica(ROL, rol=rol))


def politica_de(app, endpoint):
    vista = app.view_functions.get(endpoint)
    return getattr(vista, '_politica', None) if vista else None


def aplicar_politicas_por_defecto(app, por_blueprint, defecto=None):
    """Estampa la política por defecto de cada blueprint donde no haya una explícita.

    `por_blueprint`: {'documents': SESION, 'projects': SESION, ...}. La clave
    '(server.py)' cubre las rutas declaradas con @app.route directamente.
    Devuelve (cubiertas, sin_clasificar) para que el test lo verifique.
    """
    defecto = defecto or Politica(SESION)
    cubiertas, sin_clasificar = 0, []
    vistos = set()

    for regla in app.url_map.iter_rules():
        endpoint = regla.endpoint
        if endpoint in vistos:
            continue
        vistos.add(endpoint)
        # Solo /api/: el middleware no vigila lo demas (ficheros estaticos,
        # /maps/uploads/, el endpoint 'static' que crea Flask solo).
        if not str(regla).startswith('/api/'):
            continue
        vista = app.view_functions.get(endpoint)
        if vista is None:
            continue
        if getattr(vista, '_politica', None) is not None:
            cubiertas += 1
            continue
        nombre_bp = endpoint.split('.')[0] if '.' in endpoint else '(server.py)'
        politica = por_blueprint.get(nombre_bp)
        if politica is None:
            sin_clasificar.append(endpoint)
            politica = defecto      # fail-closed: lo no clasificado exige sesión
        vista._politica = politica
        cubiertas += 1

    if sin_clasificar:
        logger.warning(
            f"{len(sin_clasificar)} endpoints sin política de blueprint declarada "
            f"(caen a exigir sesión): {', '.join(sorted(sin_clasificar)[:8])}"
            + ('…' if len(sin_clasificar) > 8 else '')
        )
    logger.info(f"Política de acceso aplicada a {cubiertas} endpoints. Modo: {MODO}.")
    return cubiertas, sin_clasificar


def instalar_tripwire(app):
    """Avisa si una ruta /api/ respondió sin que nadie comprobara su política.

    Es lo que convierte "creo que las revisé todas" en "el sistema me avisa de
    la que se me pasó". Sin esto, una ruta que se cuele es invisible.
    """
    @app.after_request
    def _tripwire(respuesta):
        try:
            if not request.path.startswith('/api/'):
                return respuesta
            if getattr(g, '_auth_verificada', False):
                return respuesta
            if request.method == 'OPTIONS':
                return respuesta
            politica = politica_de(app, request.endpoint) if request.endpoint else None
            if politica and politica.tipo == PUBLICO:
                return respuesta   # público a propósito, no hay nada que verificar
            logger.critical(
                f"[SIN VERIFICAR] {request.method} {request.path} "
                f"endpoint={request.endpoint} politica={politica} -> respondio {respuesta.status_code}"
            )
        except Exception as e:  # nunca romper una respuesta por el tripwire
            logger.error(f"tripwire: {e}")
        return respuesta

    return _tripwire


# ── Defecto por blueprint ────────────────────────────────────────────────────
# Todo lo que toca datos de obra exige sesion. Las excepciones van con decorador
# en su propio archivo, donde se leen junto a la funcion que abren.
#
# Se clasificaron los 36 origenes leyendo el codigo y sus llamadores en los dos
# frontends. Añadir un blueprint y no declararlo aqui NO lo abre: cae a SESION y
# el arranque lo avisa por log.
_SESION = Politica(SESION)
_ADMIN = Politica(ROL, rol='admin')

POLITICAS_POR_BLUEPRINT = {
    '(server.py)': _SESION,
    # Datos de obra
    'documents': _SESION, 'element_docs': _SESION, 'docs_cad': _SESION,
    'uploads': _SESION, 'digital_twin': _SESION, 'inventory': _SESION,
    'compare': _SESION, 'schedule': _SESION, 'link': _SESION,
    'lob4d': _SESION, 'lob4d_linear': _SESION,
    'civil_da_bp': _SESION, 'civil_solids_bp': _SESION, 'civil_ghost_bp': _SESION,
    'partidas_bp': _SESION, 'presupuesto_bp': _SESION,
    'pins': _SESION, 'tracking': _SESION, 'views': _SESION, 'maps': _SESION,
    'ai': _SESION, 'dashboards': _SESION, 'sets': _SESION, 'attributes': _SESION,
    'reviews': _SESION, 'transmittals': _SESION, 'rfis_bp': _SESION,
    'redlines_bp': _SESION, 'geo_control': _SESION, 'pdf_tools': _SESION,
    'auth': _SESION, 'projects': _SESION,
    # Herramientas de mantenimiento: solo administracion
    'audit': _ADMIN, 'diagnostics': _ADMIN, 'photo_diag': _ADMIN,
}


def resumen_de_politicas(app):
    """Inventario legible: para el test y para auditar de un vistazo."""
    filas = []
    vistos = set()
    for regla in sorted(app.url_map.iter_rules(), key=lambda r: str(r)):
        if regla.endpoint in vistos:
            continue
        vistos.add(regla.endpoint)
        if not str(regla).startswith('/api/'):
            continue
        politica = politica_de(app, regla.endpoint)
        metodos = sorted((regla.methods or set()) - {'HEAD', 'OPTIONS'})
        filas.append({
            'ruta': str(regla),
            'endpoint': regla.endpoint,
            'metodos': metodos,
            'politica': politica.tipo if politica else None,
            'rol': politica.rol if politica else None,
            'motivo': politica.motivo if politica else None,
        })
    return filas
