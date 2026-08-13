# Migrar los estados del ECD (y encender el candado)

Unifica el vocabulario de `file_nodes.status` a los cuatro estados del ciclo de
vida y separa "el nombre no cumple la convención" a su propia marca.

## Qué estaba pasando

En la misma columna convivían cuatro vocabularios:

| valor | quién lo escribía |
|---|---|
| `ACTIVE` | la subida de ficheros (`file_system_db.py`) |
| `NON_CONFORMING` | la subida, cuando el nombre no cuadraba con la convención |
| `DRAFT` | el `DEFAULT` de la columna (`db.py`) |
| `WIP` / `SHARED` / `PUBLISHED` / `ARCHIVED` | lo único que entendía la máquina de estados |

La máquina era **inalcanzable**: pulsar "pasar a Compartido" respondía
`400 Transición no permitida: de ACTIVE a SHARED`, porque de `ACTIVE` no salía
ninguna flecha. Mientras tanto la pantalla pintaba "WIP" sobre esos documentos
—el frontend cae al valor por defecto cuando no reconoce el estado—, así que la
interfaz decía una cosa y la base tenía otra.

Medido en la base real antes de migrar: **2.831** en `NON_CONFORMING`, **200** en
`DRAFT`, **4** en `ACTIVE` y **1** que había conseguido llegar a `SHARED`.

## Qué hace la migración

Vive en `ensure_file_nodes_table` y es idempotente. **Ya no corre sola al arrancar**: desde
que existe `DDL_EN_CALIENTE=false`, la aplicación no altera el esquema en caliente, así que
esta migración se ejecuta con `python bootstrap_esquema.py`.

1. Añade `file_nodes.nomenclatura_ok BOOLEAN`.
2. Marca `nomenclatura_ok = FALSE` en lo que estaba en `NON_CONFORMING`, **antes**
   de tocar el estado, para no perder esa información.
3. Normaliza el estado: `REVIEW → SHARED`, `APPROVED → PUBLISHED`, y todo lo demás
   que no sea uno de los cuatro → `WIP`. **Lo que ya estaba en `SHARED`,
   `PUBLISHED` o `ARCHIVED` no se toca.**
4. Deja el `DEFAULT` de la columna en `WIP`.

Comprobado contra la base real, y dos veces seguidas: la segunda pasada toca 0 filas.

## El candado NO se pone solo. Y hay una razón

Existe un `CHECK` que impide que vuelva a entrar un valor de fuera del
vocabulario, pero **solo se aplica si defines `ECD_CANDADO_ESTADOS=true`**.

La primera versión lo ponía automáticamente al arrancar, y eso provocó un susto
real: las migraciones corren al levantar **cualquier** backend contra esta base,
incluido uno local de desarrollo. El candado entró en la base de producción
mientras el servidor desplegado seguía con el código viejo — el que escribe
`ACTIVE` en cada subida y en cada renombrado. La base habría empezado a rechazar
las subidas del servidor en producción.

> Un candado que cierra el esquema **por delante** del código que lo usa tiene que
> ser un acto deliberado, y siempre **después** de desplegar.

## Orden de despliegue

**1. Despliega el código nuevo.** A partir de aquí nadie escribe ya valores fuera
del vocabulario: la subida deja los ficheros en `WIP`, el renombrado ya no toca el
estado, y todo cambio pasa por `backend/estados_ecd.py`.

**2. Comprueba que no entran valores raros**, con el código nuevo ya sirviendo:

```bash
python -c "import sys;sys.path.insert(0,'backend');from dotenv import load_dotenv;load_dotenv('.env');from db import get_db_connection;c=get_db_connection().__enter__().cursor();c.execute(\"SELECT status,count(*) FROM file_nodes GROUP BY 1\");print(c.fetchall())"
```

Solo deben salir los cuatro. Si aparece otro, hay un camino de escritura que se
quedó sin migrar: búscalo antes de seguir.

**3. Enciende el candado.** En Render, `ECD_CANDADO_ESTADOS=true`. Redesplegar.

**Para revertir**: quita la variable y suelta el candado a mano:

```sql
ALTER TABLE file_nodes DROP CONSTRAINT IF EXISTS file_nodes_status_valido;
```

## Lo que esto NO arregla

**La convención de nombres no es la de esta obra.** El patrón exigido tiene 7
campos y correlativo de 4-6 dígitos. De 2.831 ficheros del CDE, **solo 2 lo
cumplen** (los dos modelos de Revit). El 94,5% son fotos de campo llegadas por
WhatsApp, a las que se les está aplicando una regla pensada para planos; y los
documentos con la convención real del proyecto —`500125-SCL-OT-GEN-RFI-023`, seis
campos y correlativo de tres— también se rechazan.

Consecuencia: **`STRICT_ISO_VISIBILITY` sigue siendo un interruptor cargado.**
Hoy 3.035 de 3.036 documentos están en `WIP`, así que encenderlo deja el portal
prácticamente vacío para todo el que no sea admin. Antes de encenderlo hay que
mover documentos a Compartido de verdad, y calibrar la convención por obra.
