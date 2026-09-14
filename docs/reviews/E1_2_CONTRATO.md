# E1.2 · Enlace, confirmación, fechas y documentos compartidos — contrato

13-sep-2026. Base: `8875f9e` (E1.1, en producción). Corrige los hallazgos H5, H6 y H9 y aplica H7-A, de la segunda parte de `E1_UAT_HALLAZGOS.md`. Autorizado por el propietario con «SI, HAZLO».

**Sobre H7.** La respuesta no eligió entre A y B. Aplico **A (avisar)**, que era la recomendada. Si preferías B, se cambia antes del commit.

## 1 · Qué entra

| # | Qué cambia para quien usa el portal | Dónde |
|---|---|---|
| H5 | **La dirección y la pantalla dicen siempre lo mismo.** Si Atrás o Adelante traen una revisión, se abre esa revisión: en la misma obra, en otra obra o desde la portada. «Revisiones» en el menú y «Enviar a revisión» abren siempre la lista. | `hooks/useFileExplorer.js`, `App_Refactor.jsx`, `utils/revisiones.js` |
| H6 | **Una confirmación no sobrevive a su revisión.** Si la revisión deja de verse con la confirmación abierta, se cancela igual que con «Cancelar», y no se registra nada. | `utils/confirm.jsx`: opción `signal`, que no cambia nada a quien no la use. `components/RevisionDetalle.jsx` |
| H7-A | **Avisos, sin reglas nuevas:**<br>· en el alta, junto a cada documento: «Ya está en RV-…, en curso»;<br>· en el detalle: «También está en RV-…, en curso»;<br>· al cerrar, la consecuencia dice si los documentos ya estaban en su destino, o si alguno volvería atrás (por ejemplo, de Publicado a Compartido). | `routes/reviews.py`: lectura, más una ruta nueva de solo lectura, `GET /api/reviews/en-curso`. `components/ReviewsModule.jsx` (alta), `components/RevisionDetalle.jsx`, `utils/revisiones.js` |
| H9 | **Fechas con su zona horaria:** la creación y el plazo de las revisiones, y los plazos de Mi trabajo. | `routes/reviews.py` y la consulta de Mi trabajo en `encargos.py` |

## 2 · Qué no cambia

- **Mismas reglas en el servidor** para `/act`, el alta, la sustitución y las plantillas. Un cierre que devolvería un documento de Publicado a Compartido se avisa, no se impide: impedirlo es la opción B.
- **Quién ve qué.** Los avisos solo nombran revisiones que esa persona ya puede abrir. Una revisión que no puede ver no se menciona, ni con un aviso neutro.
- **Ningún dato guardado**: sin migraciones.
- **`FilesPage.jsx` y el resto del WIP ajeno**, intactos.

## 3 · Cómo se acepta

- **pytest completo** sin fallos nuevos. Sigue el preexistente `test_capacidades_con_puerta`.
- **En frontend-docs:** `npm test` en verde, ESLint sin problemas en los ficheros tocados y build fuera del repositorio.
- **Ensayo nuevo contra PostgreSQL con ENFORCE**, `herramientas/ensayo_de_revisiones_gemelas.py`. Recorre:
  - el bloque C de la guía con dos revisiones que comparten documentos, comprobando que cada acto toca solo su revisión;
  - los avisos del detalle y del alta, incluida una revisión invisible para una de las personas, que no se nombra;
  - el cierre sobre documentos que ya están en su destino y el aviso de retroceso;
  - las fechas con zona en el detalle y en Mi trabajo.
- **Regresiones:** `ensayo_de_detalle_de_revision`, `ensayo_de_version_y_visibilidad`, `ensayo_de_revisiones` y `ensayo_de_admin_participante`.
- **En pantalla:**
  - en la app real del banco, la secuencia de H5 (Archivos y Adelante) y la de H6 (confirmación abierta y Atrás);
  - en el banco de Revisiones, los avisos del alta, del detalle y del cierre.

## 4 · Fuera

- **B:** impedir que un documento esté en dos revisiones en curso.
- Cancelar las confirmaciones de otras pantallas al navegar.
- Las fechas de otros módulos (RFI, Red Line, Transmittals…), salvo los plazos de Mi trabajo.
- E2 y siguientes.
