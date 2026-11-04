/**
 * vistasDeArchivos — las VISTAS de Archivos (A2-2, 14-oct-2026).
 *
 * Una vista es una pregunta a TODA la obra, no a una carpeta: «Me toca revisar», «Plazo del plan vencido»… Las
 * calcula el servidor (`GET /api/docs/search?vista=…`, backend/vistas_de_obra.py); aquí solo sus nombres. Se abren
 * desde la portada de la obra, que enseña sus cifras.
 *
 * 5-nov-2026: el panel «Vistas» de Archivos y las vistas propias («Guardar como vista», en el navegador) se
 * quitaron. El dueño: «no nos comunica nada»; lo útil ya lo dicen la portada, «Mi trabajo» y el plan de entregas.
 *
 * Aquí no hay React ni DOM: solo decisiones, para poder probarlas (`pruebas/vistasDeArchivos.prueba.mjs`).
 */
import { piezasDelCodigo } from './codigoDelNombre.js';

// El orden es el del panel. Las claves son el contrato con el servidor
// (backend/vistas_de_obra.py: CLAVES). Van por COLECCIONES, como en Procore (visto
// en sus vídeos, docs/ux/PROCORE_REVISION_PROPIA_14-oct-2026.md §7), y cada vista
// dice sus CRITERIOS: se enseñan como fichas al abrirla, para que se sepa qué se
// está mirando.
export const COLECCIONES = [
  { clave: 'revision', etiqueta: 'En revisión' },
  { clave: 'publicados', etiqueta: 'Publicados' },
  { clave: 'plan', etiqueta: 'Plan de entregas' },
];

export const VISTAS_DE_SERIE = [
  { clave: 'en_revision', coleccion: 'revision', etiqueta: 'Todos en revisión',
    ayuda: 'En estado ISO 19650 Compartido.',
    criterios: [['Estado ISO', 'Compartido']] },
  { clave: 'me_toca_revisar', coleccion: 'revision', etiqueta: 'Me toca revisar',
    ayuda: 'Documentos de las revisiones cuyo paso actual te espera. Los mismos encargos que «Mi trabajo».',
    criterios: [['Revisión', 'el paso actual te espera']] },
  { clave: 'asignados_mi_empresa', coleccion: 'revision', etiqueta: 'Asignados a mi empresa',
    ayuda: 'Documentos de las revisiones cuyo paso actual espera a tu empresa: a ella, a alguien de ella o a su función en la obra.',
    criterios: [['Revisión', 'el paso actual espera a tu empresa']] },
  { clave: 'publicados', coleccion: 'publicados', etiqueta: 'Todos los publicados',
    ayuda: 'En estado ISO 19650 Publicado.',
    criterios: [['Estado ISO', 'Publicado']] },
  { clave: 'publicados_sin_entrega', coleccion: 'publicados', etiqueta: 'Publicados sin entrega',
    ayuda: 'Publicados que no están atados a ningún compromiso del plan de entregas.', soloConPlan: true,
    criterios: [['Estado ISO', 'Publicado'], ['Entrega', 'fuera del plan']] },
  { clave: 'plazo_vencido', coleccion: 'plan', etiqueta: 'Plazo vencido',
    ayuda: 'Vinculados a un compromiso del plan de entregas cuya fecha ya pasó, y todavía sin publicar.',
    criterios: [['Entrega', 'vinculado'], ['Plazo', 'vencido'], ['Estado ISO', 'sin publicar']] },
  { clave: 'vence_pronto', coleccion: 'plan', etiqueta: 'Vence en 7 días',
    ayuda: 'Vinculados a un compromiso que vence entre hoy y dentro de 7 días, y todavía sin publicar.',
    criterios: [['Entrega', 'vinculado'], ['Plazo', 'próximos 7 días'], ['Estado ISO', 'sin publicar']] },
];

export const FILTROS_VACIOS = { tipo: null, disciplina: null, entrega: null };

/**
 * Los filtros de Archivos aplicados a unas filas, con las MISMAS reglas que la
 * carpeta (hooks/useFileExplorer.js): el texto por el nombre, el estado y las
 * fichas de tipo, disciplina (del código) y entrega (del plan).
 */
export function aplicarFiltros(filas, { texto = '', estado = 'ALL', meta = FILTROS_VACIOS } = {}) {
  const q = String(texto || '').trim().toLowerCase();
  const m = meta || FILTROS_VACIOS;
  return (filas || []).filter((f) => {
    if (q && !String(f.name || '').toLowerCase().includes(q)) return false;
    if (estado && estado !== 'ALL' && (f.status || 'WIP') !== estado) return false;
    if (m.tipo || m.disciplina) {
      const c = piezasDelCodigo(f.name);
      if (m.tipo && c?.tipo !== m.tipo) return false;
      if (m.disciplina && c?.disciplina !== m.disciplina) return false;
    }
    if (m.entrega && (f.entrega?.estado || 'fuera') !== m.entrega) return false;
    return true;
  });
}

// El orden de la tabla con el que se abre Archivos.
export const ORDEN_POR_DEFECTO = { col: 'name', dir: 1 };
