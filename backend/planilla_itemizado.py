# -*- coding: utf-8 -*-
"""El itemizado de la obra que sube el usuario a la Planilla del visor (migración 40).

QUÉ ES
------
Tres columnas por ítem: código, descripción y unidad. Es el CRITERIO de la vista
Partidas del visor: ningún criterio de obra va escrito en el código (decisión del
propietario, 24-oct-2026). El navegador lee el Excel y manda la lista; este módulo
la VALIDA y la normaliza antes de guardarla, porque el servidor no se fía de lo que
llega. Nada de IA: reglas fijas, y cada rechazo dice por qué.

POR QUÉ CON VERSIONES
---------------------
Cambiar el itemizado cambia lo que ve toda la obra (partidas, cobertura, y los campos
derivados que usará Filters). Cada carga es una versión nueva; la anterior deja de
estar vigente pero no se borra. La huella (sha256 de la lista normalizada) permite
saber si una carga trae algo nuevo: la misma lista no crea otra versión.

Sin Flask ni base de datos: tests/test_planilla_itemizado.py.
"""
import hashlib
import json
import os
import re

MAX_ITEMS = 50000
MAX_ITEM = 80          # «06.05.02.04.03.08» tiene 17; el PQ-08 real, 14 como máximo
MAX_DESCRIPCION = 1000
MAX_UNIDAD = 30
MAX_ARCHIVO = 255
MAX_HOJA = 120
MAX_COLUMNA = 16384    # columnas de una hoja de Excel (XFD)

_CONTROL = re.compile(r'[\x00-\x1f\x7f]')
_ESPACIOS = re.compile(r'\s+')


class ItemizadoInvalido(ValueError):
    """Un rechazo con código estable y mensaje para la persona."""

    def __init__(self, codigo, mensaje, detalle=None):
        super().__init__(mensaje)
        self.codigo, self.mensaje, self.detalle = codigo, mensaje, detalle

    def como_dict(self):
        d = {'code': self.codigo, 'error': self.mensaje}
        if self.detalle is not None:
            d['detalle'] = self.detalle
        return d


def _texto(valor, campo, maximo, i=None, obligatorio=False):
    donde = f' en el ítem {i + 1}' if i is not None else ''
    if valor is None:
        valor = ''
    if not isinstance(valor, str):
        raise ItemizadoInvalido('ITEM_INVALIDO', f'«{campo}» debe ser texto{donde}.')
    limpio = _ESPACIOS.sub(' ', _CONTROL.sub(' ', valor)).strip()
    if obligatorio and not limpio:
        raise ItemizadoInvalido('ITEM_INVALIDO', f'Falta «{campo}»{donde}.')
    if len(limpio) > maximo:
        raise ItemizadoInvalido('ITEM_INVALIDO', f'«{campo}» pasa de {maximo} caracteres{donde}.')
    return limpio


def validar_items(items):
    """Lista normalizada [{item, descripcion, unidad}] o ItemizadoInvalido.

    - entre 1 y MAX_ITEMS ítems;
    - código obligatorio; descripción y unidad pueden ir vacías (un título no tiene unidad);
    - espacios repetidos y caracteres de control fuera;
    - un código repetido se RECHAZA: dos descripciones para el mismo ítem no se
      resuelven eligiendo una en silencio.
    """
    if not isinstance(items, list) or not items:
        raise ItemizadoInvalido('ITEMS_VACIOS', 'El itemizado no trae ítems.')
    if len(items) > MAX_ITEMS:
        raise ItemizadoInvalido('DEMASIADOS_ITEMS', f'El itemizado pasa de {MAX_ITEMS:,} ítems.'.replace(',', '.'))
    normalizados, vistos, repetidos = [], set(), []
    for i, x in enumerate(items):
        if not isinstance(x, dict):
            raise ItemizadoInvalido('ITEM_INVALIDO', f'El ítem {i + 1} no tiene la forma {{item, descripcion, unidad}}.')
        item = _texto(x.get('item'), 'item', MAX_ITEM, i, obligatorio=True)
        if item in vistos:
            if item not in repetidos:
                repetidos.append(item)
            continue
        vistos.add(item)
        normalizados.append({
            'item': item,
            'descripcion': _texto(x.get('descripcion'), 'descripcion', MAX_DESCRIPCION, i),
            'unidad': _texto(x.get('unidad'), 'unidad', MAX_UNIDAD, i),
        })
    if repetidos:
        raise ItemizadoInvalido('ITEM_DUPLICADO',
                                f'{len(repetidos)} código(s) repetido(s) en el itemizado: '
                                + ', '.join(repetidos[:10]) + ('…' if len(repetidos) > 10 else ''),
                                detalle=repetidos[:50])
    return normalizados


def validar_origen(archivo, hoja=None, columnas=None):
    """(archivo, hoja, columnas) normalizados: de dónde salió la lista, para enseñarlo."""
    nombre = _texto(archivo, 'archivo', MAX_ARCHIVO, obligatorio=True)
    # Solo el nombre: una ruta del equipo de quien sube no se guarda.
    nombre = os.path.basename(nombre.replace('\\', '/')) or nombre
    hoja = _texto(hoja, 'hoja', MAX_HOJA)
    limpias = {}
    if columnas is not None:
        if not isinstance(columnas, dict):
            raise ItemizadoInvalido('ORIGEN_INVALIDO', '«columnas» debe ser {item, descripcion, unidad}.')
        for k in ('item', 'descripcion', 'unidad'):
            v = columnas.get(k)
            if v is None:
                continue
            if isinstance(v, bool) or not isinstance(v, int) or not -1 <= v <= MAX_COLUMNA:
                raise ItemizadoInvalido('ORIGEN_INVALIDO', f'La columna «{k}» no es válida.')
            limpias[k] = v
    return nombre, hoja, limpias


def huella(items_normalizados):
    """sha256 de la lista normalizada: la misma lista da la misma huella."""
    canon = json.dumps(items_normalizados, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canon.encode('utf-8')).hexdigest()
