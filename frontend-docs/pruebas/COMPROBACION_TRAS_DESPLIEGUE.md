# Comprobación tras desplegar · portal de documentos

Estas ocho cosas **no las puedo comprobar yo**. Los bancos montan los
componentes de verdad, pero con un `fetch` de mentira: no hay sesión, ni
permisos, ni tus ficheros. Esto se cierra con datos reales o no se cierra.

Son dos minutos. Si algo no sale como dice aquí, no sigas: avísame.

## Columnas

1. **Ensancha `DESCRIPCIÓN`** arrastrando el borde derecho de su cabecera.
   → sólo esa columna cambia; la tabla crece y se desplaza en horizontal.
2. **Recarga la página (F5).**
   → sigue ancha. *(Si vuelve a 150 px, el almacén del navegador está bloqueado.)*
3. **Prueba dos columnas más**, por ejemplo `TAMAÑO` y `ESTADO DE REV.`
   → cada una responde por su cuenta.
4. **`NOMBRE` sigue congelada**: desplaza la tabla a la derecha.
   → `NOMBRE` y la casilla se quedan pegadas a la izquierda.

## Búsqueda

5. **Busca algo que no exista** (`ZZZQQQ`).
   → «0 resultados en todo el proyecto para "ZZZQQQ"».
6. **Borra la caja.**
   → vuelven tus carpetas **al instante**, sin recargar. *(Éste era el fallo.)*
7. **Busca de nuevo y, sin borrar, pulsa una carpeta del árbol** — incluida
   aquella en la que ya estás.
   → sale de la búsqueda y enseña esa carpeta.
8. **Teclea rápido y borra a media palabra**, varias veces seguidas.
   → nunca debe quedarse en «0 resultados … para ""» con la caja vacía.

## Si usas tableta

9. **Arrastra un borde de cabecera con el dedo.**
   → la columna cambia de ancho y la tabla **no** se desplaza mientras arrastras.

---

Lo que sí está cubierto sin ti, y corre con `npm test`:

    pruebas/anchosColumnas.prueba.mjs     15 comprobaciones
    pruebas/busquedaDiferida.prueba.mjs   17 comprobaciones
