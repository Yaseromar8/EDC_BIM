# -*- coding: utf-8 -*-
"""Busca secretos vivos en el arbol versionado. NO imprime ningun valor.

POR QUE NO IMPRIME LOS VALORES
------------------------------
Un detector de secretos que los escribe en su propia salida los reparte: acaba
en un log, en una consola compartida o en un informe. Aqui solo se dice DONDE
esta y de QUE TIPO parece, mas una huella corta para poder cotejar dos
apariciones del mismo valor sin volver a escribirlo.

QUE MIRA, Y POR QUE ESE Y NO OTRO
---------------------------------
Solo el arbol RASTREADO por git, que es lo que se publica. Un `.env` local no es
un hallazgo -- ahi es donde deben vivir -- salvo que este rastreado.

Se saltan los ficheros que son DATOS: imagenes en base64, paquetes y bloqueos de
dependencias. Un barrido anterior se ahogo con un JPEG incrustado, y un detector
que devuelve mil falsos positivos deja de leerse, que es la unica forma de que
un detector falle del todo.

EL CANARIO NO ES DECORACION
---------------------------
`tests/test_barrido_de_secretos.py` mete una credencial de mentira y exige que
esto la encuentre. Sin esa prueba, este fichero ya estuvo roto y no se noto: una
edicion metio caracteres de retroceso donde debian ir los bordes de palabra, el
patron dejo de casar con nada, y el guion respondia «0 hallazgos» tan tranquilo.

Un detector averiado no avisa de que esta averiado: dice justo lo que uno quiere
leer. Por eso los bordes y las comillas se construyen abajo con nombre propio,
en vez de escribirse a mano dentro de cada patron.
"""

import hashlib
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BORDE = chr(92) + 'b'                    # \b, a prueba de ediciones torpes
COMILLA = '[' + chr(39) + '"]'           # ' o "
NO_COMILLA = '[^' + chr(39) + '"' + chr(92) + 's]'

PATRONES = [
    ('clave privada',
     re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----')),
    ('clave de Google',
     re.compile(BORDE + 'AIza[0-9A-Za-z_-]{35}' + BORDE)),
    ('cuenta de servicio Google',
     re.compile(r'"type"\s*:\s*"service_account"')),
    ('token de OpenAI',
     re.compile(BORDE + 'sk-[A-Za-z0-9]{32,}' + BORDE)),
    ('token de GitHub',
     re.compile(BORDE + 'gh[pousr]_[A-Za-z0-9]{36,}' + BORDE)),
    ('token de Slack',
     re.compile(BORDE + 'xox[baprs]-[A-Za-z0-9-]{10,}' + BORDE)),
    ('cadena de conexion con contrasena',
     re.compile(r'(?:postgres(?:ql)?|mysql|mongodb)(?:\+\w+)?://[^\s:/@]+:[^\s@]{4,}@')),
    # SEIS caracteres, no doce. Una version anterior pedia 12 y se le escapo una
    # contrasena de 8 publicada en `check_cats.py`. El umbral alto estaba para
    # quitar ruido, pero este patron ya exige la palabra `password` delante: el
    # contexto hace ese trabajo mejor que la longitud.
    ('secreto asignado en codigo',
     re.compile('(?i)' + BORDE +
                '(secret|token|password|passwd|pwd|api_?key|client_?secret)' +
                BORDE + r'\s*[:=]\s*' + COMILLA + NO_COMILLA + '{6,}' + COMILLA)),
]

# Valores que parecen secreto y no lo son. Sin esta lista el detector grita en
# cada ejecucion y deja de leerse.
INOCENTES = re.compile(
    r'(?i)(tu_|your_|xxx|placeholder|ejemplo|example|dummy|cambiar|changeme|'
    r'sin-pimienta|fake|<[^>]+>|\.\.\.|secreto-de-prueba|os\.getenv|os\.environ)')

# Ficheros que son DATOS, no codigo.
FUERA = re.compile(
    r'(?i)(node_modules|/venv/|\.lock$|package-lock|yarn\.lock|\.min\.js$|'
    r'\.map$|\.png$|\.jpe?g$|\.gif$|\.ico$|\.pdf$|\.svg$|\.woff2?$|'
    r'tracking_data\.json$|\.ipynb$)')

MAX_BYTES = 2 * 1024 * 1024
MAX_LINEA = 2000

# Sustitucion de variable de psql: `PASSWORD :'nombre_de_variable'`. Lo de dentro
# es el NOMBRE de la variable, no la contrasena.
VARIABLE_PSQL = re.compile(r":" + COMILLA)


def parece_secreto(valor):
    """¿Este valor tiene forma de credencial, o es una palabra normal?

    Sin esto el detector marcaba `password: 'Contrasena'` de un diccionario de
    traducciones del formulario de acceso -- seis falsos positivos de seis, y un
    detector que solo da ruido se deja de mirar, que es otra forma de no
    detectar.

    Un secreto de verdad tiene entropia: mezcla digitos o simbolos, o es largo.
    Una etiqueta de interfaz es una palabra del diccionario.
    """
    if len(valor) < 6:
        return False
    if ' ' in valor:
        return False
    tiene_digito = any(c.isdigit() for c in valor)
    tiene_simbolo = any(not c.isalnum() for c in valor)
    if tiene_digito or tiene_simbolo:
        return True
    # Solo letras: hace falta que sea largo Y con mayusculas y minusculas.
    return len(valor) >= 16 and not valor.islower() and not valor.isupper()


def rastreados():
    salida = subprocess.run(['git', 'ls-files'], cwd=RAIZ, capture_output=True,
                            text=True, encoding='utf-8', errors='ignore')
    return [l for l in salida.stdout.split('\n') if l.strip()]


def huella(valor):
    """12 caracteres: bastan para cotejar dos apariciones sin revelar nada."""
    return hashlib.sha256(valor.encode('utf-8', 'ignore')).hexdigest()[:12]


def analizar_texto(texto, nombre='(memoria)'):
    """Los hallazgos de un texto. Separado para poder probarlo sin tocar disco."""
    salida = []
    for n, linea in enumerate(texto.split('\n'), 1):
        if len(linea) > MAX_LINEA:
            continue
        if INOCENTES.search(linea):
            continue
        for tipo, patron in PATRONES:
            m = patron.search(linea)
            if not m:
                continue
            if tipo == 'secreto asignado en codigo':
                if VARIABLE_PSQL.search(linea):
                    continue          # `PASSWORD :'variable'` de psql
                valor = re.sub(r'^.*?[:=]\s*' + COMILLA, '', m.group(0))[:-1]
                if not parece_secreto(valor):
                    continue          # etiqueta de interfaz, no credencial
            salida.append({'fichero': nombre, 'linea': n, 'tipo': tipo,
                           'huella': huella(m.group(0))})
    return salida


def barrer():
    hallazgos = []
    for rel in rastreados():
        if FUERA.search(rel):
            continue
        ruta = os.path.join(RAIZ, rel)
        try:
            if os.path.getsize(ruta) > MAX_BYTES:
                continue
            with open(ruta, encoding='utf-8', errors='ignore') as f:
                texto = f.read()
        except OSError:
            continue
        hallazgos.extend(analizar_texto(texto, rel))
    return hallazgos


def main():
    h = barrer()
    mirados = len([r for r in rastreados() if not FUERA.search(r)])
    print('BARRIDO DE SECRETOS - solo arbol rastreado por git')
    print('ficheros mirados : %d' % mirados)
    print('hallazgos        : %d' % len(h))
    if not h:
        print('')
        print('Ninguna credencial con forma de secreto vivo en el arbol publicado.')
        return 0
    print('')
    print('NO se imprime ningun valor: solo donde esta y su huella corta.')
    print('')
    for x in h:
        print('  [%s] %s:%d  huella %s' % (x['tipo'], x['fichero'], x['linea'], x['huella']))
    print('')
    print('Cada uno hay que tratarlo como COMPROMETIDO: invalidar, sustituir el')
    print('mecanismo, y dejar constancia de la revocacion sin guardar el valor.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
