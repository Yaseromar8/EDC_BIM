# -*- coding: utf-8 -*-
"""Un control correcto sin salida no es un control: es un muro.

LO QUE PASO, Y ES MIO
---------------------
Le puse a los enlaces públicos la guardia de sensibilidad, que deniega emitir si
la obra no tiene hecho su triaje de seguridad. La guardia es correcta —la parte 5
de ISO 19650 existe justamente para que no salga del ECD lo que nadie ha mirado—
y el módulo lo justificaba diciendo que «desbloquearlo es hacer el triaje, que
son diez minutos».

Di ese comentario por bueno sin comprobarlo. **No había pantalla para hacer el
triaje.** Ni una. Así que al desplegar, las diez obras de la plataforma —ninguna
evaluada— se quedaron sin poder emitir un solo enlace público, y sin ninguna
forma de arreglarlo desde el producto.

Eso no es endurecer: es romper. Y es la cara B del patrón que este trabajo lleva
dos días persiguiendo. Allí eran controles que parecían estar y no estaban; aquí
un control que sí está y no deja salir.

LA REGLA QUE FIJA ESTO
----------------------
Si una guardia deniega por un estado que el usuario tiene que cambiar, tiene que
existir el sitio donde cambiarlo. Se comprueba mirando que cada API de
desbloqueo tenga a alguien que la llame desde el portal.
"""
import io
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORTAL = os.path.join(RAIZ, 'frontend-docs', 'src')

# ruta que desbloquea -> por qué se deniega si no se usa
SALIDAS = {
    '/api/docs/sensibilidad/triaje':
        'sin triaje no se pueden emitir enlaces públicos (ISO 19650-5)',
    '/api/docs/idoneidad':
        'sin catálogo ajustado, la obra publica con códigos que no son los suyos',
}


def _portal_entero():
    trozos = []
    for raiz, _dirs, ficheros in os.walk(PORTAL):
        if 'node_modules' in raiz:
            continue
        for f in ficheros:
            if f.endswith(('.jsx', '.js')):
                trozos.append(io.open(os.path.join(raiz, f),
                                      encoding='utf-8', errors='ignore').read())
    return '\n'.join(trozos)


def test_toda_guardia_que_deniega_tiene_su_pantalla():
    portal = _portal_entero()
    sin_salida = [ruta for ruta in SALIDAS if ruta not in portal]
    assert not sin_salida, (
        'estas rutas desbloquean algo que el backend deniega, y NADIE las llama '
        'desde el portal: el usuario se queda encerrado sin forma de arreglarlo. '
        + ', '.join('%s (%s)' % (r, SALIDAS[r]) for r in sin_salida))


def test_la_pantalla_de_triaje_dice_QUE_desbloquea():
    """Una pantalla que no explica su consecuencia parece un formulario
    opcional, y entonces nadie la rellena y el bloqueo sigue."""
    ruta = os.path.join(PORTAL, 'components', 'TriajeSeguridadModule.jsx')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert 'enlaces públicos' in fuente
    assert 'no se pueden emitir' in fuente


def test_el_triaje_exige_un_motivo():
    """«Un triaje sin motivo no se puede auditar»: dentro de un año nadie sabrá
    si se pensó o se pulsó."""
    ruta = os.path.join(PORTAL, 'components', 'TriajeSeguridadModule.jsx')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert 'justificacion.trim()' in fuente
    assert 'no se puede auditar' in fuente


def test_el_triaje_lleva_fecha_de_revision():
    """Sin ella el triaje envejece y deja de valer: una obra cambia -- entran
    subcontratas, cambia el alcance -- y lo decidido hace dos años puede no
    seguir siendo cierto."""
    ruta = os.path.join(PORTAL, 'components', 'TriajeSeguridadModule.jsx')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert 'revisar_en' in fuente
    assert 'envejece' in fuente
