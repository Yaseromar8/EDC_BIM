# 16 · Los DWG, como en AutoCAD (21-sep-2026)

> El propietario: «la idea es que respetemos lo que el cadista configuró, ocultó, etc. Debemos respetar el CAD original.
> Lo que se ve en CAD en mi PC, que se vea lo mismo en la web». Y: «todo junto».

## 1 · La causa

Mismo DWG (`500125-CSSP001-780-XX-DR-HD-011220011222`) en los dos visores, medido en su Chrome:

| | ACC | ALEPHIA (hasta hoy) |
|---|---|---|
| Vistas | espacio modelo, 3D y las presentaciones P08-0004/0005/0006 | las mismas |
| Cómo están hechas las vistas 2D | **PDF dibujados por el motor de AutoCAD** (`model.isPdf()`, 4 PDF en el manifiesto) | el conversor antiguo de Autodesk, que redibuja el DWG con sus reglas (F2D) |
| Capas que el cadista dejó apagadas | respetadas | respetadas en el espacio modelo; **encendidas en las presentaciones** |

Las líneas rosas gruesas que «ensuciaban» eran dos de esas capas apagadas (`POLIGONO_INTERVENCION`, `ESTRUC.
PROYECTADAS PQ5`).

- El espacio modelo trae el estado de capas «Initial» del DWG y el visor lo aplica.
- Las presentaciones no lo traen, así que salían todas las capas.

Pero las capas son solo un síntoma: el conversor antiguo no dibuja las vistas como AutoCAD, y ACC no lo usa.

## 2 · El cambio

1. **La traducción de los DWG pide sus vistas 2D dibujadas por AutoCAD.** Es la opción oficial de Model Derivative
   `"advanced": {"2dviews": "pdf"}` ([Autodesk](https://aps.autodesk.com/blog/advanced-option-rvtdwg-2d-views-svf2-post-job)).
   Cada vista (espacio modelo y cada presentación) sale como al imprimir desde AutoCAD: capas, ventanas, capas
   inutilizadas por ventana, orden de dibujo. Solo DWG; los RVT no cambian.
2. **Va en otro objeto de Autodesk, así que tiene otro URN** (`docs-<versión>-pdf2d.dwg`):
   - La traducción de siempre se sigue viendo mientras se prepara la nueva, con un aviso («Preparando este plano tal
     como se ve en AutoCAD…»). Ningún plano se queda sin abrir.
   - Si el dibujo ya estaba en Autodesk, se copia allí mismo en vez de volver a subir sus cientos de MB.
3. **Si Autodesk no puede con las vistas de AutoCAD en un dibujo, se vuelve a la traducción de siempre y se dice.**
   Solo un administrador con `force` lo reintenta.
4. **Las subidas de DWG ya piden las vistas de AutoCAD.** Los ya subidos se preparan la primera vez que alguien los
   abre con el portal nuevo.
5. **Las capas apagadas del DWG también se apagan en las presentaciones** (`utils/capasDelDwg.js`). Se lee del propio
   DWG, no de una lista escrita a mano. Queda como red para las traducciones antiguas mientras duran.
6. **El portal anterior no pide nada nuevo y sigue exactamente igual.** Por eso el servidor se puede desplegar antes que
   el portal.

**Pruebas:**
- Backend: `tests/test_vistas_de_autocad.py` (20) y las 68 del CAD de siempre; la suite entera, 2048 en verde.
- Portal: `pruebas/capasDelDwg.prueba.mjs` y los 12 bancos.
- Capas, verificado en Docs local con su lámina: en P08-0006 salen apagadas solas las 5, y el magenta de la hoja baja
  de 4.375 a 1.757 px.

## 3 · Lo que no se puede probar en local, y cómo se prueba

La traducción la hace Autodesk con las credenciales del servidor de Render: en local no existen. Así que:

1. se despliega **solo el backend**, que no cambia nada para los usuarios porque el portal actual no pide vistas nuevas;
2. en Docs local (`http://localhost:5182`, el portal nuevo contra producción) se abre su DWG y se prepara con las
   vistas de AutoCAD;
3. el propietario lo compara con su Civil 3D;
4. si está igual, se despliega el portal y lo ven todos.

**Coste:** cada DWG ya subido se traduce una vez más (con la opción nueva) la primera vez que se abre con el portal
nuevo, y lo que cuesta es lo mismo que su traducción original. Los nuevos se traducen una sola vez, como hasta hoy.
Mientras el backend nuevo convive con el portal anterior, un DWG subido en ese rato se traduciría dos veces, una con
cada opción.
