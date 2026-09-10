# Bancos de navegador · GAP 07

Estos tres ficheros NO se despliegan: viven fuera de `public/`, así que Vite no
los copia al build. Se sirven solo con `npm run dev`, que es cuando hacen falta.

Existen porque hay cosas de la capa offline que **no se pueden probar leyendo el
código**: si una transacción de IndexedDB confirmó de verdad, si los bytes de una
foto sobreviven a cerrar la pestaña, si el navegador concede la persistencia. Eso
solo lo contesta un navegador.

    npm run dev
    http://localhost:5174/pruebas/_banco-offline.html    la capa local
    http://localhost:5174/pruebas/_banco-recarga.html    (después) supervivencia
    http://localhost:5174/pruebas/_banco-pantalla.html   los siete estados en pantalla

El orden importa entre los dos primeros: `_banco-offline` deja el almacén en un
estado concreto y `_banco-recarga` comprueba, desde un contexto de JS nuevo, que
sigue ahí. Ejecutar el segundo solo no prueba nada.

Las invariantes permanentes están en `backend/tests/test_gap07_cliente_offline.py`,
que sí corre en cada suite. Esto es el complemento: lo que un test de texto no
puede ver.

---

# Pruebas automáticas

Además de los bancos de navegador de arriba —que se miran— hay bancos que se
**ejecutan**, en la convención del visor: `.mjs` corrientes con `node:assert`,
sin ningún marco de pruebas que instalar.

    npm test

`pruebas/ejecutar.mjs` descubre solo cualquier `*.prueba.mjs` de esta carpeta y
corre cada uno en su propio proceso, así que añadir una prueba mañana no obliga
a tocar `package.json` ni deja que unas dependan del orden de otras.

    anchosColumnas.prueba.mjs     lo que llega del almacén no puede dejar la
                                  tabla inservible, y una preferencia guardada
                                  vuelve tal cual
    busquedaDiferida.prueba.mjs   esperar antes de salir, y que una respuesta
                                  cancelada NO escriba: es una carrera, y una
                                  carrera hay que ejecutarla

Ambos bancos están comprobados contra su propio fallo: al quitarle el pestillo
a `busquedaDiferida` caen sus dos pruebas de carrera y ninguna más, y al quitar
la validación de `anchosColumnas` cae la suya. Una prueba que no falla cuando
debe no está protegiendo nada.

Lo que ninguna de las dos puede ver —sesión, permisos, tus ficheros— está en
`COMPROBACION_TRAS_DESPLIEGUE.md`.
