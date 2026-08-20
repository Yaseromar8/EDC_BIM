# Evidencia — borrado controlado, recuperación y cotejo de hash · 20-ago-2026

Cierra los criterios de continuidad **3, 4 y 5** que fijó el propietario, de una
sola pasada y sobre el bucket **real** de producción.

**Sobre un fichero de prueba creado para esto** (`prueba-borrado.txt`, 3 bytes).
Ningún documento del expediente se tocó.

---

## El ciclo, tal cual salió

```
$ gcloud storage objects describe gs://yaser-pqt08-talara/prueba-borrado.txt
  crc32c_hash: rHhYaQ==
  generation:  '1787246678855197'
  md5_hash:    F2EV2tMUZmS1ssr+p/tO4w==
  size:        3

$ gcloud storage rm gs://yaser-pqt08-talara/prueba-borrado.txt
  Removing gs://yaser-pqt08-talara/prueba-borrado.txt...
  Completed 1/1

$ gcloud storage ls gs://yaser-pqt08-talara/prueba-borrado.txt
  ERROR: (gcloud.storage.ls) One or more URLs matched no objects.

$ gcloud storage ls gs://yaser-pqt08-talara/prueba-borrado.txt --soft-deleted
  gs://yaser-pqt08-talara/prueba-borrado.txt#1787246678855197

$ gcloud storage restore gs://yaser-pqt08-talara/prueba-borrado.txt#1787246678855197
  Restoring gs://yaser-pqt08-talara/prueba-borrado.txt#1787246678855197...
  Completed 1

$ gcloud storage objects describe gs://yaser-pqt08-talara/prueba-borrado.txt
  crc32c_hash: rHhYaQ==
  generation:  '1787247192364837'
  md5_hash:    F2EV2tMUZmS1ssr+p/tO4w==
  size:        3
```

## El cotejo

| | antes | después |
|---|---|---|
| **md5_hash** | `F2EV2tMUZmS1ssr+p/tO4w==` | `F2EV2tMUZmS1ssr+p/tO4w==` |
| **crc32c_hash** | `rHhYaQ==` | `rHhYaQ==` |
| tamaño | 3 B | 3 B |
| generation | `1787246678855197` | `1787247192364837` |

**Las dos huellas coinciden carácter por carácter.** El `generation` cambia
porque recuperar crea una entrada nueva; el contenido es el mismo byte a byte.

## Qué queda demostrado, y qué no

**Demostrado, ejecutando sobre producción:**

- El borrado **no es definitivo**: el objeto desaparece del listado normal
  (`matched no objects`) y sigue existiendo bajo `--soft-deleted`.
- La recuperación **funciona** y no hace falta pedirle nada a Google.
- Lo recuperado es **idéntico**, no equivalente. Es la diferencia entre tener
  una copia y creer que se tiene.

**No demostrado aquí:** la recuperación desde el bucket de la **copia**
(`yaser-pqt08-talara-copia`). No hizo falta: el soft delete resolvió el caso. La
copia cubre otro riesgo — perder el bucket entero o un borrado con intención que
espere a que expire el plazo — y ese ensayo es distinto.

## Nota operativa

El fichero `prueba-borrado.txt` quedó restaurado en el bucket. Son 3 bytes; se
puede borrar cuando se quiera, o dejarlo como testigo de esta prueba.
