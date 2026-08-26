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
