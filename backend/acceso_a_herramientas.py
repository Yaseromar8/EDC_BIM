# -*- coding: utf-8 -*-
"""CAPA 08 · MEMBER TOOL ACCESS — quién entra a una herramienta habilitada.

LA PREGUNTA, Y SOLO ESA
------------------------
    Dentro de una herramienta HABILITADA en la obra,
    ¿ESTE MIEMBRO puede entrar a ella?

El caso real que esta capa hace posible:

    miembro A     Docs ✅ · Reviews ✅ · RFI ✅ · Red Lines ❌ · Transmittals ✅

EL ORDEN, DE FUERA HACIA DENTRO — y no se puede saltar ningún escalón:

    PROJECT MEMBERSHIP     ¿pertenece a la obra?              (capa 03)
            ↓
    TOOL ACTIVATION        ¿existe la herramienta aquí?       (capa 16)
            ↓
    MEMBER TOOL ACCESS     ¿entra ESTE miembro?               ← esto
            ↓
    RESOURCE PERMISSION    ¿qué recurso toca dentro?          (capa 09)
            ↓
    WORKFLOW AUTHORIZATION ¿qué acto contractual ejecuta?     (capa 10)

Las dos direcciones del invariante, que se prueban en la batería:

  · una carpeta con permiso `edit` NO da acceso a una herramienta que el
    miembro no tiene — el permiso de recurso vive DENTRO, y no se alcanza
    sin haber entrado;
  · tener acceso a una herramienta NO concede ni un solo recurso — sigue
    decidiendo `permiso_documental` con sus tres sujetos.

EL DEFECTO: LA MEMBRESÍA YA ES LA PUERTA
-----------------------------------------
La ausencia de fila significa PERMITIDO. No es laxitud: la puerta
fail-closed es la MEMBRESÍA (capa 03), que ya se comprobó antes de llegar
aquí — sin ella no se entra a nada. Esta capa RESTRINGE dentro de una
pertenencia ya concedida, así que su acto explícito es QUITAR, y la fila
registra la excepción. Si el defecto fuera denegar, desplegar esta capa
dejaría a todos los miembros de todas las obras sin ninguna herramienta
hasta que alguien los volviera a habilitar uno por uno — un apagón, no una
capa. La restricción es siempre visible en la base: se lee, no se supone.

QUIEN ADMINISTRA LA HERRAMIENTA ENTRA EN ELLA
----------------------------------------------
El Entity Admin y el administrador DE ESTA OBRA no están sujetos a esta
capa. No es un privilegio difuso: es que son quienes configuran la
herramienta —quién entra y quién no— y un administrador que no puede abrir
lo que administra no puede administrarlo. Política explícita, igual que la
travesía documental del administrador de obra en la capa 09.

Y NO se salta la capa 16: si la herramienta está APAGADA, tampoco entra el
administrador. Apagada no existe para nadie; restringida existe y él la
gobierna. Son cosas distintas y aquí no se confunden.
"""

from app_logging import get_logger

logger = get_logger('acceso_herramientas')


def estado_de_miembro(cur, obra, user_id):
    """{codigo: bool} para TODAS las herramientas del catálogo, para ESTA
    persona en ESTA obra. Ausencia de fila = permitido (ver arriba)."""
    import herramientas_de_obra as hdo
    estado = {c: True for c in hdo.CODIGOS}
    try:
        cur.execute("SELECT herramienta, permitido FROM member_tool_access "
                    " WHERE project_id = %s AND user_id = %s",
                    (str(obra), int(user_id)))
        for codigo, permitido in cur.fetchall():
            if codigo in estado:
                estado[codigo] = bool(permitido)
    except Exception as e:
        # Mismo criterio acotado que la capa 16: un fallo de infraestructura
        # no puede dejar a un miembro legítimo fuera de su obra. Lo que
        # protege de verdad —membresía y permiso de recurso— sigue siendo
        # fail-closed en su propio sitio.
        logger.warning('[acceso-herramientas] no se pudo leer: %s', str(e)[:120])
    return estado


def puede_entrar(cur, usuario, obra, codigo):
    """¿Entra esta persona a esta herramienta EN ESTA OBRA?

    Presupone que la membresía y la activación ya dijeron que sí: esta capa
    es el escalón siguiente, no un sustituto de los anteriores.
    """
    usuario = usuario or {}
    # Quien administra la herramienta entra en ella (ver el módulo).
    try:
        import administracion_de_obra as _adm
        if _adm.es_admin_de_obra(cur, usuario, obra):
            return True
    except Exception:
        pass
    uid = usuario.get('id')
    try:
        uid = int(uid)
    except (TypeError, ValueError):
        return False                      # sin identidad numérica, no entra
    return estado_de_miembro(cur, obra, uid).get(codigo, True)


def fijar(cur, obra, user_id, codigo, permitido, quien):
    """Escribe la excepción. Devuelve el valor que queda."""
    cur.execute("""INSERT INTO member_tool_access
                        (project_id, user_id, herramienta, permitido, cambiado_por)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (project_id, user_id, herramienta)
                   DO UPDATE SET permitido = EXCLUDED.permitido,
                                 cambiado_por = EXCLUDED.cambiado_por,
                                 cambiado_en = CURRENT_TIMESTAMP
                   RETURNING permitido""",
                (str(obra), int(user_id), codigo, bool(permitido), quien))
    fila = cur.fetchone()
    return bool(fila[0]) if fila else bool(permitido)
