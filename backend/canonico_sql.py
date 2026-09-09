# -*- coding: utf-8 -*-
"""Forma canonica de una definicion SQL deparseada, para poder COMPARARLA.

POR QUE EXISTE
--------------
`bootstrap_esquema.py` comprueba que las restricciones que el codigo espera
estan de verdad en la base. Para eso comparaba el texto que devuelve
`pg_get_constraintdef` contra un manifiesto congelado. Comparar texto tiene un
agujero medido el 8-sep-2026 en el acto P1: una copia de produccion restaurada
con `pg_dump | pg_restore` es identica en datos y en semantica, y AUN ASI el
verificador la rechazaba, porque el viaje de ida y vuelta reescribe la forma
deparseada de algunos CHECK.

Lo que pasa, medido y no supuesto, sobre PostgreSQL 18:

    DDL original         CHECK (node_type IN ('FOLDER','FILE'))
    deparse              ... = ANY ((ARRAY['FOLDER'::character varying,
                                           'FILE'::character varying])::text[])
    pg_dump escribe ESE texto, pg_restore lo vuelve a parsear, y sale:
    deparse tras volver  ... = ANY (ARRAY[('FOLDER'::character varying)::text,
                                          ('FILE'::character varying)::text])

Las dos formas significan exactamente lo mismo --se comprobo evaluandolas sobre
las mismas sondas, con identico veredicto en todas-- pero no son el mismo texto.
La segunda ademas es punto fijo: volver a parsearla no la cambia.

La consecuencia era grave y no teorica: una restauracion de produccion no
arrancaba el servicio, porque `start` es `bootstrap_esquema.py --verificar &&
gunicorn`. El respaldo servia; la vuelta no.

QUE HACE ESTA CANONIZACION, Y QUE NO
------------------------------------
Normaliza SOLO dos cosas, las dos que el viaje de ida y vuelta mueve:

  1. Los CASTS explicitos (`::text`, `::character varying`, `::text[]`).
  2. Los parentesis REDUNDANTES: los que envuelven una sola ficha --`(estado)`,
     `('FOLDER')`-- y los duplicados exactos `((X))`.

NO toca los parentesis que agrupan. `(a or b) and c` y `a or (b and c)` siguen
siendo distintos, que es justo lo que hay que preservar: si se quitaran todos
los parentesis, dos reglas con precedencias distintas pareceria que son la
misma, y eso seria cambiar un falso negativo por un falso positivo. De los dos
errores, este ultimo es el que no se detecta nunca.

Lo que esto SI relaja, dicho para que nadie lo descubra tarde: dos definiciones
que difieran UNICAMENTE en un cast --`x::int > 0` frente a `x::numeric > 0`--
canonizan igual. No es un agujero libre: el tipo real de cada columna se
comprueba aparte, en la familia `columna`, que esta canonizacion no toca. Y
sigue habiendo FALLO ante cualquier cambio de identificador, de literal, de
operador o de estructura.

Se compara en minusculas porque asi se guardan y se comparan los manifiestos
desde que existen; esta pieza no cambia ese criterio, que implica que un cambio
que solo altere mayusculas dentro de un literal no se distingue. Es anterior a
este arreglo y se deja como estaba a proposito: cambiarlo obligaria a
regenerar el manifiesto congelado, que es otro acto.
"""
import re

# El primer nombre despues de `::` SIEMPRE es un tipo. Los siguientes solo se
# tragan si pertenecen a esta lista, porque hay tipos de varias palabras
# (`character varying`, `double precision`, `timestamp with time zone`). Sin la
# lista, `x::text and y` se comeria el `and` y destrozaria la expresion.
_PALABRAS_DE_TIPO = frozenset((
    'varying', 'precision', 'with', 'without', 'time', 'zone', 'character',
    'double', 'bit', 'varbit', 'year', 'month', 'day', 'hour', 'minute',
    'second', 'to',
))

_FICHA = re.compile(r"""
      (?P<cadena>'(?:[^']|'')*')                 # 'literal' con '' escapado
    | (?P<entrecomillado>"(?:[^"]|"")*")         # "identificador"
    | (?P<numero>\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)
    | (?P<nombre>[A-Za-z_À-ɏ][A-Za-z_0-9$À-ɏ]*)
    | (?P<cast>::)
    | (?P<simbolo>\S)
""", re.X)


def fichas(texto):
    """Parte una definicion SQL en fichas. `::` es una sola ficha, no dos."""
    return [m.group(0) for m in _FICHA.finditer(texto or '')]


def _sin_casts(entrada):
    salida, i, n = [], 0, len(entrada)
    while i < n:
        if entrada[i] != '::':
            salida.append(entrada[i])
            i += 1
            continue
        i += 1
        if i < n:
            i += 1                                    # el nombre del tipo
        while i < n and entrada[i].lower() in _PALABRAS_DE_TIPO:
            i += 1
        if i < n and entrada[i] == '(':               # precision: numeric(10,2)
            profundidad = 0
            while i < n:
                if entrada[i] == '(':
                    profundidad += 1
                elif entrada[i] == ')':
                    profundidad -= 1
                    if profundidad == 0:
                        i += 1
                        break
                i += 1
        while i + 1 < n and entrada[i] == '[' and entrada[i + 1] == ']':
            i += 2                                    # tipo array: text[]
    return salida


def _parejas(entrada):
    pila, salida = [], []
    for i, f in enumerate(entrada):
        if f == '(':
            pila.append(i)
        elif f == ')' and pila:
            salida.append((pila.pop(), i))
    return sorted(salida)


def _envuelve_un_grupo(dentro):
    """¿`dentro` es exactamente un grupo entre parentesis, `( ... )`?"""
    if len(dentro) < 2 or dentro[0] != '(' or dentro[-1] != ')':
        return False
    parejas = _parejas(dentro)
    return bool(parejas) and (0, len(dentro) - 1) in parejas


def _sin_parentesis_redundantes(entrada):
    while True:
        for abre, cierra in _parejas(entrada):
            dentro = entrada[abre + 1:cierra]
            # `(estado)` o `('FOLDER')`: una sola ficha que no es puntuacion.
            solo_una = len(dentro) == 1 and dentro[0] not in ('(', ')', '[', ']', ',')
            if solo_una or _envuelve_un_grupo(dentro):
                entrada = entrada[:abre] + dentro + entrada[cierra + 1:]
                break
        else:
            return entrada


def canonico(texto):
    """Forma comparable de una definicion. Determinista y sin estado."""
    return ' '.join(_sin_parentesis_redundantes(_sin_casts(fichas(texto))))


def equivalentes(uno, otro):
    """¿Las dos definiciones dicen lo mismo, aunque no se escriban igual?"""
    return canonico(uno) == canonico(otro)
