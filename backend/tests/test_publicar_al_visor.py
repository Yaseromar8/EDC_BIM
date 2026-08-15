# -*- coding: utf-8 -*-
"""Un modelo del ECD se lleva al visor sin volver a subirlo, y sin pagar dos veces.

EL HUECO
--------
Hoy un modelo se sube dos veces: al gestor documental como documento del
expediente, y al visor desde el navegador. Los mismos bytes por dos caminos, con
las dos consecuencias de siempre: se desincronizan y nadie sabe cuál manda.

Y rompe la trazabilidad justo donde importa: el documento del ECD tiene estado,
idoneidad, revisión, huella y quién lo aprobó; el modelo del visor no tiene nada
de eso porque llegó por su cuenta. Mirando el visor no se puede decir si lo que
se ve es la versión aprobada.

POR QUE ESTAS PRUEBAS SON SIN RED
---------------------------------
Traducir un modelo se COBRA: medio crédito un Revit o un IFC. Las decisiones
sobre cuándo se paga tienen que poder probarse sin pagar, así que toda la lógica
vive en `publicar_al_visor.py`, separada de la ruta.
"""
import pytest

import publicar_al_visor as pub

OBRA = 'proyectos/PQT8_TALARA'


def _fila(nombre='PUENTE.rvt', gcs='multi-tenant/x/PUENTE.rvt', obra=OBRA,
          estado='SHARED', tam=1024, sha='a' * 64, urn=None, nid='n-1'):
    return (nid, nombre, gcs, obra, estado, tam, sha, urn)


# ── Que se puede publicar ─────────────────────────────────────────────────

def test_un_modelo_compartido_se_puede_publicar():
    doc = pub.comprobar_documento(_fila(), OBRA)
    assert doc['nombre'] == 'PUENTE.rvt'


@pytest.mark.parametrize('nombre', ['a.rvt', 'a.ifc', 'a.nwd', 'a.dwg', 'a.dgn'])
def test_los_formatos_de_modelo_pasan(nombre):
    assert pub.es_publicable(nombre)


@pytest.mark.parametrize('nombre', ['nube.laz', 'escaneo.e57', 'obra.rcp'])
def test_las_nubes_de_puntos_tambien(nombre):
    assert pub.es_publicable(nombre)
    assert pub.es_nube_de_puntos(nombre)


# ── Que no ────────────────────────────────────────────────────────────────

def test_un_documento_de_otra_obra_no_existe_para_ti():
    """No se distingue de «no existe»: decirlo permitiría descubrir qué
    identificadores son válidos en otras obras."""
    with pytest.raises(pub.NoSePuedePublicar) as e:
        pub.comprobar_documento(_fila(obra='proyectos/OTRA'), OBRA)
    assert 'no existe' in str(e.value)


def test_un_pdf_de_memoria_no_se_manda_a_traducir():
    """Gasta el intento, tarda y falla."""
    with pytest.raises(pub.NoSePuedePublicar) as e:
        pub.comprobar_documento(_fila(nombre='memoria.docx'), OBRA)
    assert '.docx' in str(e.value)


def test_un_borrador_no_se_publica_al_visor():
    """Misma regla que el transmittal -- un borrador no se emite -- y además
    costaría créditos publicar algo que su autor no da por bueno todavía."""
    with pytest.raises(pub.NoSePuedePublicar) as e:
        pub.comprobar_documento(_fila(estado='WIP'), OBRA)
    assert 'borrador' in str(e.value).lower()
    assert 'crédito' in str(e.value) or 'credito' in str(e.value)


def test_un_documento_sin_fichero_no_se_publica():
    with pytest.raises(pub.NoSePuedePublicar) as e:
        pub.comprobar_documento(_fila(gcs=None), OBRA)
    assert 'almacén' in str(e.value) or 'almacen' in str(e.value)


def test_cada_negativa_dice_QUE_hacer():
    """Un «no se puede» sin salida deja a alguien pulsando el botón otra vez."""
    for fila in (_fila(estado='WIP'), _fila(nombre='x.docx'), _fila(gcs=None)):
        try:
            pub.comprobar_documento(fila, OBRA)
        except pub.NoSePuedePublicar as e:
            texto = str(e).lower()
            assert any(v in texto for v in ('rtelo', 'calo en el ecd', 'vuelve a subirlo',
                                              'publica el modelo')), texto


# ── No pagar dos veces ────────────────────────────────────────────────────

def test_un_modelo_ya_publicado_no_se_vuelve_a_traducir():
    """Traducir se cobra. Basta con que dos personas pulsen el botón, o con que
    alguien recargue la pantalla."""
    doc = pub.comprobar_documento(_fila(urn='urn:yaestaba'), OBRA)
    assert pub.ya_publicado(doc) == 'urn:yaestaba'


def test_forzar_si_vuelve_a_traducir():
    """Es la salida cuando la traducción salió mal y hay que rehacerla. Explícita
    a propósito: cada trabajo forzado se paga."""
    doc = pub.comprobar_documento(_fila(urn='urn:yaestaba'), OBRA)
    assert pub.ya_publicado(doc, forzar=True) is None


def test_un_modelo_nunca_publicado_no_finge_tener_urn():
    doc = pub.comprobar_documento(_fila(), OBRA)
    assert pub.ya_publicado(doc) is None


# ── La clave del objeto ───────────────────────────────────────────────────

def test_la_clave_lleva_la_huella_y_no_la_hora():
    """Con la hora, subir dos veces lo mismo deja copias sueltas pagadas y
    olvidadas en el almacén de Autodesk. Con la huella, cae en la misma clave."""
    a = pub.clave_de_objeto(pub.comprobar_documento(_fila(), OBRA))
    b = pub.clave_de_objeto(pub.comprobar_documento(_fila(), OBRA))
    assert a == b
    assert 'a' * 16 in a


def test_sin_huella_la_clave_sigue_siendo_estable():
    """Las versiones anteriores al sellado no tienen sha256 (residual de C6): se
    cae al identificador del nodo, que al menos es estable para ese documento."""
    doc = pub.comprobar_documento(_fila(sha=None), OBRA)
    assert pub.clave_de_objeto(doc) == pub.clave_de_objeto(doc)
    assert 'n-1' in pub.clave_de_objeto(doc)


# ── La ruta ───────────────────────────────────────────────────────────────

def test_la_ruta_es_de_administrador_y_comprueba_la_obra():
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'digital_twin.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def publicar_modelo_desde_ecd'):]
    cuerpo = cuerpo[:cuerpo.index('\n@')]
    assert 'guardia_de_obra' in cuerpo
    assert "user.get('role') != 'admin'" in cuerpo


def test_el_urn_se_guarda_en_el_documento():
    """Es lo que ata el modelo del visor con su ficha del expediente. Sin eso,
    mirando el visor no se puede decir de qué documento viene."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'digital_twin.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    cuerpo = fuente[fuente.index('def publicar_modelo_desde_ecd'):]
    cuerpo = cuerpo[:cuerpo.index('\n@')]
    assert 'UPDATE file_nodes SET urn_aps' in cuerpo


def test_no_se_duplica_la_fase_2():
    """Esperar la traducción y registrar el modelo ya existe
    (`/upload/finalize`). Dos copias del mismo flujo es como se llegó a tener
    una versión viva y otra muerta -- lo dice el propio módulo."""
    import io
    import os
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'routes', 'digital_twin.py')
    fuente = io.open(ruta, encoding='utf-8').read()
    assert fuente.count("def finalize_local_upload") == 1
    cuerpo = fuente[fuente.index('def publicar_modelo_desde_ecd'):]
    cuerpo = cuerpo[:cuerpo.index('\n@')]
    assert 'manifest' not in cuerpo, 'la fase 2 no se reimplementa aquí'
