"""Politica de contraseñas, en el SERVIDOR.

Hasta ahora el registro solo comprobaba que viniera algo en el campo: el minimo
de 8 caracteres vivia unicamente en la pantalla, asi que bastaba llamar la API
directamente para crear una cuenta con "a". Y cambiar la contraseña pedia 6.
Tres reglas distintas para lo mismo, y ninguna aplicada de verdad.

Criterio (NIST SP 800-63B): la longitud es lo que importa, y las listas de
contraseñas prohibidas valen mas que exigir simbolos raros. No se obliga a
mayusculas ni caracteres especiales: eso produce "Obra2024!" en toda la obra.
"""

import re
import unicodedata

LARGO_MINIMO = 10
LARGO_MAXIMO = 128   # cota superior: scrypt con una entrada enorme es un DoS barato

# Las que de verdad se teclean en una obra peruana, mas los clasicos.
_PROHIBIDAS = {
    'password', 'contrasena', 'contraseña', 'passw0rd', '1234567890', '0123456789',
    'qwertyuiop', 'administrador', 'adminadmin', 'bienvenido', 'proyecto1',
    'ingeniero1', 'construccion', 'talara2025', 'talara2026', 'drenaje123',
    'peru123456', 'sanchez123', '12345678910',
}


def _normalizar(texto):
    sin_tildes = unicodedata.normalize('NFKD', texto or '')
    sin_tildes = ''.join(c for c in sin_tildes if not unicodedata.combining(c))
    return sin_tildes.lower().strip()


def validar(password, correo=None, nombre=None):
    """Devuelve None si es aceptable, o un mensaje explicando que corregir.

    El mensaje se le enseña al usuario, asi que dice QUE hacer, no solo que esta mal.
    """
    if not password:
        return 'Escribe una contraseña.'
    if len(password) < LARGO_MINIMO:
        return f'La contraseña debe tener al menos {LARGO_MINIMO} caracteres. Una frase corta es fácil de recordar y difícil de adivinar.'
    if len(password) > LARGO_MAXIMO:
        return f'La contraseña no puede pasar de {LARGO_MAXIMO} caracteres.'

    plana = _normalizar(password)

    if plana in _PROHIBIDAS:
        return 'Esa contraseña es demasiado común. Elige otra.'

    # Un solo caracter repetido, o una escalera del teclado / de digitos.
    if len(set(plana)) <= 2:
        return 'La contraseña no puede ser un mismo carácter repetido.'
    if _es_secuencia(plana):
        return 'Evita secuencias como "12345678" o "abcdefgh".'

    # Que no sea el propio correo o el nombre: es lo primero que prueba un atacante.
    if correo:
        usuario = _normalizar(correo).split('@')[0]
        if usuario and len(usuario) >= 4 and usuario in plana:
            return 'La contraseña no puede contener tu correo.'
    if nombre:
        for parte in _normalizar(nombre).split():
            if len(parte) >= 4 and parte in plana:
                return 'La contraseña no puede contener tu nombre.'

    return None


TRAMO_ESCALERA = 7   # longitud de escalera que ya delata a toda la contraseña


def _es_secuencia(texto):
    """True si la contraseña es, en lo esencial, una escalera del teclado.

    No basta mirar la cadena entera: '1234567890123' no es una escalera de
    principio a fin (salta del 0 al 1) y se colaba. Se busca el tramo monotono
    mas largo y se juzga por el.
    """
    if len(texto) < 6 or not re.fullmatch(r'[a-z0-9]+', texto):
        return False
    mejor, actual, paso_previo = 1, 1, None
    for a, b in zip(texto, texto[1:]):
        paso = ord(b) - ord(a)
        if paso in (1, -1) and (paso_previo is None or paso == paso_previo):
            actual += 1
        else:
            actual = 2 if paso in (1, -1) else 1
        paso_previo = paso if paso in (1, -1) else None
        mejor = max(mejor, actual)
    return mejor >= TRAMO_ESCALERA or mejor >= len(texto) * 0.7
