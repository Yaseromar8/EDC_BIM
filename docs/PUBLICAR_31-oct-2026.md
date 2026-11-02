# Publicar lo del 30 y 31 de octubre de 2026

Estado medido el 31-oct, antes de publicar:
- **GitHub (`origin/main`)** = `ad4b47f1`.
- **Producción (backend Virginia)**: `/api/health` → `version ad4b47f10c90`, rama `main`. Va con lo último de GitHub.
- **Por publicar:** la rama local `publicar-30oct` (`fbd7f799`), **37 commits** encima de `origin/main`. El push es
  normal, sin forzar: `origin/main` es su ancestro. La rama `main` local ya está dentro.
- **Migraciones nuevas:** **42**, **43** y **44**. Ninguna está aplicada; las aplica el dueño.

## Qué entra (37 commits)

| Bloque | Commits | Necesita |
|---|---|---|
| Planilla: un itemizado y unos criterios **por frente** | `1095fcc5` | **Migración 42** |
| Tablero de **View** (vistas, auditoría, bordes, pantalla completa, lienzo como tldraw…) | `8626f652` … `74026092` (30-oct) | — |
| **Tableros en Docs**, fase 1 (lista, tablero, guardar con versión) | `88f75223`, `cac20f34`, `289b24d6`, `39db9c97` | **Migración 43** |
| Escala de letra (Docs, View, lienzo) y estilo de Archivos | `8df97083`, `adb74f90`, `2434e13b`, `7a3232eb`, `398595e6`, `8c1c7d4c` | — |
| Archivos: observaciones abiertas junto al nombre del plano | `4c681987` | — |
| Tableros: documentos, hojas de PDF, presentaciones de CAD, lector encima | `e79746ea` … `664fc481` | — |
| Tableros: incidencias, formas y nube, flecha y lápiz, publicar vista | `889b92a2`, `c01c4e16`, `52bf2cc6`, `7bfdbe13` | — |
| Tableros: presencia y comentarios; cabecera como ACC | `f41d69f4`, `4810fcff` | — |
| Tableros: **miembros**, roles y «¿Quién puede entrar?» | `a09a82cb` | **Migración 44** |
| Tableros: **gráficas** enviadas desde View | `fbd7f799` | — |

## Hecho (31-oct-2026, noche)

- **Push:** `ad4b47f1..fbd7f799` a `main`, autorizado por el dueño («publiquemos todos esos arreglos»). Sin
  `Co-Authored-By` ni ficheros protegidos.
- **Migraciones 42, 43 y 44:** las aplicó el dueño en Cloud SQL Studio (`pqt-08-talara`, base `postgres`, como
  `ecd_migrator`), una a una.
  - Antes de empezar: `ecd_migrator | postgres | planilla sí | tableros no | miembros no`.
  - Después: la 42 con 2 columnas `frente`, el índice nuevo y el viejo retirado; la comprobación final, 5 de 5 `true`
    (42, 43, 44 y los dos permisos de `ecd_app`).

- **Backend** (`visor-ecd-backend-va`), Manual Deploy del dueño:
  - `/api/health` → `fbd7f7992516` a las 20:21;
  - estable un minuto (0,2 s);
  - las rutas nuevas responden 401 (existen).
- **Portal** (`index-aKKtsj0n.js`) y **visor** (`index-BalTwRI_.js`), Manual Deploy del dueño. Comprobado por
  contenido:
  - el chunk de Tableros lleva miembros, comentarios, presentar y gráficas;
  - el del Tablero de View lleva «Enviar a un tablero de Docs».
- **Falta:** la prueba del dueño con su sesión (§6).

## El orden (cada paso, solo cuando el dueño lo diga)

1. **Migraciones, en producción, como `ecd_migrator`, en este orden:**
   - `backend/sql/42_planilla_por_frente.sql`
   - `backend/sql/43_tableros.sql`
   - `backend/sql/44_tableros_miembros.sql`

   Las tres son aditivas. La 42 cambia dos índices únicos, no borra datos. La 44 hace responsables de sus tableros a
   los autores (en producción aún no hay tableros).

   **Comprobar por la forma del catálogo** (solo lectura; deben dar `t`):
   ```sql
   SELECT count(*) = 2 FROM information_schema.columns
    WHERE table_name IN ('planilla_itemizados', 'planilla_criterios_medida') AND column_name = 'frente';            -- 42
   SELECT to_regclass('public.tableros') IS NOT NULL AND to_regclass('public.tableros_abiertos') IS NOT NULL;         -- 43
   SELECT to_regclass('public.tableros_miembros') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tableros' AND column_name = 'acceso'); -- 44
   SELECT has_table_privilege('ecd_app', 'tableros', 'INSERT') AND has_table_privilege('ecd_app', 'tableros_miembros', 'INSERT');
   ```
2. **Push** de `publicar-30oct` a `main` (37 commits). Con Auto-Deploy apagado en los tres servicios, el push no publica
   nada.
3. **Manual Deploy del backend** (Virginia, `visor-ecd-backend-va`). **Va DESPUÉS de las migraciones**: las rutas de
   tableros leen `acceso` y `tableros_miembros`. Comprobar:
   - `/api/health` → `version fbd7f799…`;
   - en el registro, «Booting worker»;
   - vigilarlo un rato («Live» no basta).
4. **Manual Deploy del portal** (`visor-ecd-portal`, Docs). Trae `html2canvas` nuevo (`npm install`).
5. **Manual Deploy del visor** (`visor-ecd-frontend`, View).
6. **Comprobar** (Cloudflare guarda `index.html` unos 5 min: no juzgar antes):
   - Docs › Tableros: crear uno, una nota, recargar. Sigue ahí.
   - Miembros: el autor sale como responsable.
   - View: en el Tablero de un frente, una gráfica → «Enviar a un tablero de Docs». Llega a Docs.
   - View: la Planilla por frente.

## Vuelta atrás

- **El código:** volver a desplegar `ad4b47f1`. El código de antes no lee nada de lo que añaden las migraciones.
- **Las migraciones** no se deshacen al revertir. Tienen su `_rollback`, que se niega si ya hay datos que perder.

## Sin publicar, a propósito

Bancos y herramientas de prueba que están en el disco y no se commitean:
- `frontend-docs/probar-tableros.html` y `src/probar-tableros.jsx`;
- `frontend-react/probar-enviar.html` y `src/probar-enviar.jsx`;
- los guiones del scratchpad.
