# -*- coding: utf-8 -*-
"""Criterios de medida de la obra para la Planilla del visor (migración 41, docs/visor/32).

QUÉ ES
------
La Planilla da la cantidad de cada partida con la MEDIDA NATIVA del elemento según la
unidad. Muchos elementos no la traen (familias propias, genéricos, IFC de otros programas,
Revit en otro idioma, metrados volcados a un parámetro): la medida está en algún parámetro
del elemento y solo la obra sabe cuál. Un criterio lo dice:

    {"unidad": "m", "partida": "01.02",                       # partida: opcional
     "donde": {"campo": "...", "op": "es|contiene", "valor": "..."},   # opcional
     "medirCon": ["Cotas::Long. Reja", "Cotas::Largo Total"],  # en orden
     "aMano": true}   # opcional: también números sin unidad, en la unidad de la partida

El visor los aplica SOLO donde no hay medida nativa (lib/criteriosDeMedida.js). Aquí se
VALIDAN y se normalizan antes de guardarlos, con las mismas reglas que el visor: el
servidor no se fía de lo que llega. Nada de nombres de familias, parámetros ni idiomas
escritos en el código. Sin IA.

Un juego de criterios por versión: guardar el juego sin uno es quitarlo (otra versión);
la anterior queda en el historial.

Sin Flask ni base de datos: tests/test_planilla_criterios_medida.py.
"""
import hashlib
import json
import re
import unicodedata

MAX_CRITERIOS = 500
MAX_MEDIR_CON = 5
MAX_CLAVE = 300        # clave de un parámetro del modelo («Grupo::Nombre»)
MAX_VALOR = 300
MAX_PARTIDA = 80
OPERADORES = ('es', 'contiene')

_CONTROL = re.compile(r'[\x00-\x1f\x7f]')
_ESPACIOS = re.compile(r'\s+')
_UNIDADES = {
    'm': 'm', 'ml': 'm', 'm.l.': 'm', 'm.l': 'm',
    'm2': 'm²', 'm²': 'm²',
    'm3': 'm³', 'm³': 'm³',
    'kg': 'kg', 'kgs': 'kg',
}


class CriteriosInvalidos(ValueError):
    """Un rechazo con código estable y mensaje para la persona."""

    def __init__(self, codigo, mensaje, detalle=None):
        super().__init__(mensaje)
        self.codigo, self.mensaje, self.detalle = codigo, mensaje, detalle

    def como_dict(self):
        d = {'code': self.codigo, 'error': self.mensaje}
        if self.detalle is not None:
            d['detalle'] = self.detalle
        return d


def normalizar_unidad(u):
    """«M2» → m², «ml» → m; '' si no es una unidad medible (m, m², m³, kg)."""
    s = str(u or '').strip().lower().replace('^', '').rstrip('.')
    return _UNIDADES.get(s, _UNIDADES.get(s + '.', ''))


def normalizar_codigo(c):
    """«02.01.01.04» = «2.1.1.4»: sin ceros a la izquierda en cada tramo numérico (como el visor)."""
    return re.sub(r'\d+', lambda m: str(int(m.group(0))), str(c or '').strip())


def compacto(s):
    """Sin tildes, mayúsculas ni nada que no sea letra o cifra (como el visor)."""
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '', s)


def _texto(valor, campo, maximo, i, obligatorio=False):
    if valor is None:
        valor = ''
    if not isinstance(valor, str):
        raise CriteriosInvalidos('CRITERIO_INVALIDO', f'«{campo}» debe ser texto en el criterio {i + 1}.')
    limpio = _ESPACIOS.sub(' ', _CONTROL.sub(' ', valor)).strip()
    if obligatorio and not limpio:
        raise CriteriosInvalidos('CRITERIO_INVALIDO', f'Falta «{campo}» en el criterio {i + 1}.')
    if len(limpio) > maximo:
        raise CriteriosInvalidos('CRITERIO_INVALIDO', f'«{campo}» pasa de {maximo} caracteres en el criterio {i + 1}.')
    return limpio


def clave_de_criterio(c):
    d = c.get('donde')
    donde = f"{d['campo']}|{d['op']}|{compacto(d['valor'])}" if d else ''
    return f"{c['unidad']}|{normalizar_codigo(c.get('partida', ''))}|{donde}"


def validar_criterios(criterios):
    """Lista normalizada o CriteriosInvalidos. Una lista vacía es válida: la obra sin criterios.

    - unidad medible (m, m², m³, kg), escrita como sea;
    - entre 1 y MAX_MEDIR_CON parámetros, sin repetir, en su orden;
    - «donde» con campo, operador (es / contiene) y valor;
    - dos criterios con la misma unidad, partida (con o sin ceros) y condición se RECHAZAN:
      no se elige uno en silencio.
    """
    if not isinstance(criterios, list):
        raise CriteriosInvalidos('CRITERIOS_INVALIDOS', 'Los criterios deben ser una lista.')
    if len(criterios) > MAX_CRITERIOS:
        raise CriteriosInvalidos('DEMASIADOS_CRITERIOS', f'Más de {MAX_CRITERIOS} criterios de medida.')
    salida, vistos = [], {}
    for i, c in enumerate(criterios):
        if not isinstance(c, dict):
            raise CriteriosInvalidos('CRITERIO_INVALIDO', f'El criterio {i + 1} no tiene la forma {{unidad, medirCon}}.')
        unidad = normalizar_unidad(c.get('unidad'))
        if not unidad:
            raise CriteriosInvalidos('UNIDAD_NO_MEDIBLE', f'El criterio {i + 1} no tiene una unidad medible (m, m², m³ o kg).')
        partida = _texto(c.get('partida'), 'partida', MAX_PARTIDA, i)
        medir = c.get('medirCon')
        if not isinstance(medir, list) or not medir:
            raise CriteriosInvalidos('SIN_PARAMETRO', f'Falta el parámetro con que se mide en el criterio {i + 1}.')
        claves = []
        for m in medir:
            k = _texto(m, 'medirCon', MAX_CLAVE, i, obligatorio=True)
            if k not in claves:
                claves.append(k)
        if len(claves) > MAX_MEDIR_CON:
            raise CriteriosInvalidos('CRITERIO_INVALIDO', f'Como mucho {MAX_MEDIR_CON} parámetros en el criterio {i + 1}.')
        limpio = {'unidad': unidad}
        if partida:
            limpio['partida'] = partida
        d = c.get('donde')
        if d is not None:
            if not isinstance(d, dict):
                raise CriteriosInvalidos('CRITERIO_INVALIDO', f'«donde» no es válido en el criterio {i + 1}.')
            op = _texto(d.get('op'), 'op', 20, i, obligatorio=True)
            if op not in OPERADORES:
                raise CriteriosInvalidos('CRITERIO_INVALIDO', f'Operador «{op}» desconocido en el criterio {i + 1} (es / contiene).')
            limpio['donde'] = {'campo': _texto(d.get('campo'), 'campo', MAX_CLAVE, i, obligatorio=True), 'op': op,
                               'valor': _texto(d.get('valor'), 'valor', MAX_VALOR, i, obligatorio=True)}
        limpio['medirCon'] = claves
        a_mano = c.get('aMano', False)
        if not isinstance(a_mano, bool):
            raise CriteriosInvalidos('CRITERIO_INVALIDO', f'«aMano» debe ser verdadero o falso en el criterio {i + 1}.')
        if a_mano:
            # Acepta números SIN unidad, leídos en la unidad de la partida (los escribe a mano quien modela).
            limpio['aMano'] = True
        k = clave_de_criterio(limpio)
        if k in vistos:
            raise CriteriosInvalidos('CRITERIO_REPETIDO',
                                     f'Los criterios {vistos[k] + 1} y {i + 1} son para la misma unidad, partida y condición.',
                                     detalle=[vistos[k], i])
        vistos[k] = i
        salida.append(limpio)
    return salida


def huella(criterios_normalizados):
    """sha256 del juego normalizado: el mismo juego da la misma huella."""
    canon = json.dumps(criterios_normalizados, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canon.encode('utf-8')).hexdigest()
