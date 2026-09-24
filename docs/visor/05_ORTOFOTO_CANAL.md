# Ortofoto del Frente Canal · preparación y publicación

La ortofoto se prepara fuera de ALEPHIA como **dos JPG** (Norte y Sur). El ECW
original no se sube al visor. La capa publicada se muestra a los usuarios
autenticados con acceso a `1_CANAL` y permanece activa hasta que un administrador
de la obra la reemplace o la retire; no vence automáticamente cada semana.

## Preparación semanal

1. Partir de la ortofoto georreferenciada de la semana.
2. Reproyectar/cortar exactamente sobre la misma huella de ensayo en
   EPSG:32717: Este `469680.2345774082`–`470236.3495282178`, Norte
   `9495348.9581837`–`9497006.411206856`.
3. Dividir horizontalmente en mitad Norte y mitad Sur, conservando la
   orientación norte-arriba. Exportar **cada mitad a JPG de 4000×5961 píxeles**,
   hasta 35 MB por archivo. El nombre puede incluir la nueva fecha: ALEPHIA
   identifica Norte y Sur por los botones de carga, no por el nombre.
4. Conservar el ECW y los dos JPG preparados fuera del repositorio.

Un JPG no contiene coordenadas verificables para este flujo. El backend valida
formato y dimensiones, pero **no puede demostrar que el recorte corresponde a
esa huella**. La alineación visual con el terreno debe comprobarse antes de
publicar. Si cambian huella, orientación, CRS o versión de la superficie, no
se debe publicar como si fuera un simple reemplazo semanal.

## Publicar

1. Entrar en ALEPHIA View con cuenta administradora de `1_CANAL` y abrir
   **Frente Canal → Topografía → Ortofoto**.
2. Elegir el JPG Norte y el JPG Sur en sus botones separados.
3. Seleccionar una sola vez la superficie de `PASTEADO_GENERAL.shared.dwg`.
4. Pulsar **Previsualizar en este navegador**. Verificar ambos extremos, la
   costura, la orientación y la alineación con el relieve. Ajustar «Relieve
   visible» y «Sombreado de pendientes» si se desea; esos valores se guardan
   con la publicación.
5. Pulsar **Publicar para todos**. Sólo un POST completado con éxito cambia la
   revisión activa. Si una carga falla, la capa anterior sigue activa.
6. Abrir otra sesión autorizada del mismo frente y comprobar la capa. Una
   sesión ya abierta consulta nuevas revisiones aproximadamente cada minuto.

**Retirar capa publicada** oculta la ortofoto para todos sin borrar las
imágenes almacenadas. La vista previa local se puede quitar aparte y no altera
la capa publicada. Cerrar Topografía no retira la capa activa.

## Fronteras técnicas

- Sólo existe este flujo para `1_CANAL` y la huella fijada arriba.
- La publicación guarda dos objetos JPG inmutables y mueve atómicamente un
  manifiesto activo en GCS. No hay migración de PostgreSQL ni vencimiento.
- Las lecturas de los JPG pasan por la API autenticada, con control de acceso
  al frente. Un enlace compartido anónimo no recibe esta capa.
- El manifiesto fija el URN exacto de la versión del modelo y el `dbId` de la
  superficie; si se sustituye el modelo, verificar y republicar antes de dar
  por válida la alineación.
- No desplegar sólo el visor nuevo contra backend viejo: el endpoint
  `/api/orthophoto/1_CANAL` devolvería 404 y la publicación se deshabilita.
