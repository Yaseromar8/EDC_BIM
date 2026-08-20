# Evidencia — ensayo de restauración con la copia REAL de producción · 20-ago-2026

Cierra el **criterio de continuidad 6**, el último que quedaba abierto.

---

## Qué se ensayó, y dónde

**La copia:** `ecd_20260820_185913.copia.gz` (15,4 MB), tomada de la base de
producción `34.86.206.187 / postgres` esa misma tarde. 87 tablas, 83.410 filas,
comprobación interna correcta.

**El destino:** un clúster PostgreSQL 18 **desechable**, creado para esto en la
máquina del propietario y destruido al terminar.

### Por qué no se ensayó contra Cloud SQL

La propia herramienta lo impide, y con razón escrita en su código:

> *«El ensayo crea y borra bases. Contra producción eso no es un ensayo: es una
> ruleta. Si algún día hay que ensayar en la nube, se hace con una instancia
> clonada, no con esta herramienta.»*

Una herramienta que hace `CREATE DATABASE` y `DROP DATABASE` no debe apuntar a la
instancia donde vive el expediente.

### Sobre el dato de producción en una máquina local

Se hizo sabiendo lo que implica. El argumento: **la copia ya estaba en ese disco**
—es lo que produce `copia_de_seguridad.py`, y es inherente a tener copias—. Y es
exactamente la situación del día que haga falta de verdad: un `.copia.gz` en la
mano y una base vacía delante. El clúster se destruyó al terminar.

**Lo que este ensayo prueba:** que los datos vuelven, completos.
**Lo que NO prueba:** cosas propias de Cloud SQL (extensiones, roles, banderas de
instancia). Para eso haría falta una instancia clonada.

---

## Primera pasada: CON DESCUADRES

```
tablas cotejadas : 87
filas restauradas: 83.409  de 83.410
DESCUADRES (1): alembic_version — relation "alembic_version" does not exist
VEREDICTO : CON DESCUADRES
```

**Volvió todo el expediente**: 3.051 documentos, 2.853 versiones, 1.071 asientos
de actividad, 5 usuarios, los permisos, los 8 códigos de recuperación del 2FA.

**No volvió una fila:** la de `alembic_version`, la libreta de Alembic — una sola
fila con la revisión en la que va la base (`0004_lob_linear_standard`). El
constructor levanta el esquema desde las rutinas `ensure_*`, que no incluyen la
contabilidad de Alembic, así que la tabla no existía y la fila no tenía dónde
entrar.

No afectaba al expediente. Importaría el día que alguien ejecutase Alembic sobre
una base restaurada: sin esa fila creería que está a cero y volvería a aplicar
las migraciones desde el principio.

## El arreglo

`bootstrap_esquema.py` crea ahora la tabla **vacía**. El valor lo pone la
restauración, que es quien lo sabe: inventarlo en el constructor sería afirmar
una revisión que quizá no es la de esa base.

## Segunda pasada: RESTAURABLE

```
tablas cotejadas : 87
filas restauradas: 83.410  de 83.410
todas las tablas cuadran fila a fila con la copia
VEREDICTO : RESTAURABLE
```

**Todas las filas. Todas las tablas.**

---

## Lo que sigue sin estar en la copia, y hay que saberlo

La propia herramienta lo dice al terminar, y no es un detalle menor:

> *«Falta todavía: los secretos (APP_SECRET, SESSION_PEPPER, credenciales de
> Google) y los ficheros del bucket. Sin eso, esta base arranca pero no sirve.»*

- **Los secretos** viven en el panel de Render, no en la base. Es a propósito: por
  eso una copia robada ya no sirve para generar códigos 2FA. Pero significa que
  una restauración necesita **también** recuperar el entorno.
- **Los bytes de los documentos** viven en el bucket. Esa mitad la cubren el soft
  delete de 90 días y la copia diaria al segundo bucket (evidencias del mismo
  día).

Una restauración completa del ECD son **tres cosas**: esta base, los secretos del
entorno, y el bucket. Hoy las tres están cubiertas, y las tres se han ejercido.
