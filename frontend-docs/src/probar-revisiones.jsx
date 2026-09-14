/**
 * BANCO · la pantalla de Revisiones (REVIEWS · E1), con un servidor de mentira
 * QUE RECUERDA.
 *
 * Monta el `ReviewsView` REAL (lista, filtros, páginas y detalle) y le pone
 * delante un `fetch` falso: actuar hace avanzar, cerrar o rechazar la revisión y
 * la pantalla lo vuelve a leer. Las `acciones` las calcula aquí un espejo
 * sencillo de la regla del servidor; la regla de verdad se prueba en pytest y
 * contra PostgreSQL. Lo que este banco demuestra es la PANTALLA: nombres de los
 * botones, confirmación, doble envío, recarga ante un 409, enlace en la URL y
 * atrás/adelante.
 *
 * Lo que aquí SÍ se puede provocar a voluntad:
 *
 *   window.__como(id)          ver la pantalla como otra persona (1, 2 o 3)
 *   window.__retrasoAct = ms   un servidor lento al actuar (doble clic)
 *   window.__fallarAct = {status, body}   el próximo acto falla así (una vez)
 *   window.__registro          lo que ha pedido la pantalla, en orden
 *
 * Y el ALTA (E1.1), con el botón «Abrir alta de revisión»: dos plantillas, una que se
 * aplica y otra que falla (para ver que vuelven los pasos de antes), y una lista de
 * participantes distinta del padrón (`/api/users` trae a alguien de otra obra).
 *
 * E1.2: RV-042 y RV-043 llevan los MISMOS documentos que RV-041, y las dos esperan el
 * cierre de Luis. El detalle dice «También está en…», el alta «Ya está en…», y cerrada
 * una, la consecuencia de cerrar la otra dice que los documentos ya están en su destino.
 *
 * No entra en producción: `vite.config.js` no lo conoce.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { ReviewsView, ReviewModal } from './components/ReviewsModule';
import { ConfirmHost } from './utils/confirm.jsx';
import './index.css';

const OBRA = 'obra-banco';
const PREFIJO = 'banco_revisiones';
const GENTE = {
  1: { id: 1, name: 'Ana Revisora', email: 'ana@banco.test' },
  2: { id: 2, name: 'Luis Aprobador', email: 'luis@banco.test' },
  3: { id: 3, name: 'Eva Autora', email: 'eva@banco.test' },
};
const t0 = Date.now();
const dia = (n) => new Date(t0 + n * 86400000).toISOString();
const paso = (uid, decision, dias) => ({ user_id: uid, email: GENTE[uid].email, name: GENTE[uid].name,
                                         decision, ...(dias ? { dias } : {}) });
const doc = (n, version, nueva = false) => ({ node_id: `nodo-${n}`, name: `DR-00${n}.pdf`, version,
                                              version_id: `version-${n}-${version}`, __nueva: nueva });

window.__registro = [];
// La persona sobrevive a la recarga: si no, `__como(2)` recargaria y volveria a ser 1.
window.__usuario = Number(sessionStorage.getItem('banco_revisiones_usuario') || 1);
window.__como = (id) => {
  sessionStorage.setItem('banco_revisiones_usuario', String(id));
  window.location.reload();
};

const copiaDeDrenaje = (id, para, dias) => ({
  id, title: `Planos de drenaje · copia para ${para}`, contrato: 'AUTORIDAD_TERMINAL', status: 'pending',
  current_step: 1, steps: [paso(1, 'REVISA'), paso(2, 'APRUEBA')], items: [doc(1, 2), doc(2, 1)],
  created_by: GENTE[3].email, created_at: dia(-dias), final_status: 'SHARED',
  history: [{ event: 'created', by: GENTE[3].email, at: dia(-dias) },
            { event: 'approve', step: 0, by: GENTE[1].email, emitido: 'CONFORME', comment: 'Conforme', at: dia(-1) },
            { event: 'step_started', step: 1, to: GENTE[2].name, at: dia(-1) }],
});

const estado = {
  // El estado de HOY de cada documento (E1.2): lo cambia el cierre de una revisión.
  documentos: { 'nodo-1': 'WIP', 'nodo-2': 'WIP', 'nodo-3': 'SHARED', 'nodo-4': 'SHARED' },
  revisiones: [
    copiaDeDrenaje(43, 'Arquitectura', 2),
    copiaDeDrenaje(42, 'Estructuras', 2),
    { id: 41, title: 'Planos de drenaje · Rev B', contrato: 'AUTORIDAD_TERMINAL', status: 'pending',
      current_step: 0, steps: [paso(1, 'REVISA', 3), paso(2, 'APRUEBA', 2)],
      items: [doc(1, 2), doc(2, 1)], created_by: GENTE[3].email, created_at: dia(-3),
      paso_vence_en: dia(1), final_status: 'SHARED',
      history: [{ event: 'created', by: GENTE[3].email, at: dia(-3) },
                { event: 'step_started', step: 0, to: GENTE[1].name, due: dia(1), at: dia(-3) }] },
    { id: 40, title: 'Memoria de cálculo · versión nueva subida', contrato: 'AUTORIDAD_TERMINAL',
      status: 'pending', current_step: 1, steps: [paso(1, 'REVISA'), paso(2, 'APRUEBA')],
      items: [doc(3, 1, true)], created_by: GENTE[3].email, created_at: dia(-5), final_status: 'PUBLISHED',
      history: [{ event: 'created', by: GENTE[3].email, at: dia(-5) },
                { event: 'approve', step: 0, by: GENTE[1].email, emitido: 'CONFORME', comment: 'Conforme', at: dia(-4) },
                { event: 'step_started', step: 1, to: GENTE[2].name, at: dia(-4) }] },
    ...Array.from({ length: 24 }, (_, i) => ({
      id: 39 - i, title: `Revisión cerrada ${39 - i}`, contrato: 'AUTORIDAD_TERMINAL',
      status: i % 3 ? 'approved' : 'rejected', current_step: i % 3 ? 1 : 0,
      steps: [paso(1, 'REVISA'), paso(2, 'APRUEBA')], items: [doc(4, 1)], created_by: GENTE[3].email,
      created_at: dia(-10 - i), final_status: 'SHARED',
      history: [{ event: 'created', by: GENTE[3].email, at: dia(-10 - i) }],
    })),
  ],
};

const responder = (cuerpo, estadoHttp = 200, ms = 0) => new Promise(res => {
  const enviar = () => res(new Response(JSON.stringify(cuerpo), {
    status: estadoHttp, headers: { 'Content-Type': 'application/json' } }));
  if (ms) setTimeout(enviar, ms); else enviar();
});

const quien = () => GENTE[window.__usuario];

// Espejo sencillo de `_acciones_para` (backend/routes/reviews.py).
function acciones(rev) {
  const vacio = { aprobar: { disponible: false, tipo: null, motivo_no: '', siguiente_paso: null, destino: null },
                  rechazar: { disponible: false, motivo_no: '' }, sustituir: false, motivo: '' };
  if (rev.status !== 'pending') return { ...vacio, motivo: 'La revisión ya terminó.' };
  const p = rev.steps[rev.current_step];
  if (p.user_id !== window.__usuario) return { ...vacio, motivo: `Este paso le corresponde a ${p.name}.` };
  const terminal = rev.current_step === rev.steps.length - 1;
  const cierra = terminal && p.decision === 'APRUEBA';
  const tipo = cierra ? 'aprobar_y_cerrar' : p.decision === 'REVISA' ? 'conformidad' : 'aprobar';
  const nuevas = cierra ? rev.items.filter(it => it.__nueva) : [];
  const siguiente = cierra ? null : { numero: rev.current_step + 2, persona: rev.steps[rev.current_step + 1].name };
  const orden = ['WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED'];
  const ya = cierra ? rev.items.filter(it => estado.documentos[it.node_id] === rev.final_status).map(it => it.name) : [];
  const atras = cierra ? rev.items
    .filter(it => orden.indexOf(estado.documentos[it.node_id]) > orden.indexOf(rev.final_status))
    .map(it => ({ name: it.name, estado: estado.documentos[it.node_id] })) : [];
  return {
    ...vacio,
    aprobar: { disponible: !nuevas.length, tipo, siguiente_paso: siguiente,
               destino: cierra ? rev.final_status : null,
               ya_en_destino: ya, todos_en_destino: cierra && ya.length === rev.items.length, retroceden: atras,
               motivo_no: nuevas.length ? `Hay una versión nueva de ${nuevas.map(n => n.name).join(', ')}: aprobar cerraría la revisión sobre algo que nadie revisó. Hay que volver a mandarlo a revisión.` : '' },
    rechazar: { disponible: true, motivo_no: '' },
  };
}

// Espejo de `_otras_en_curso`: en el banco todas se pueden ver.
function otrasEnCurso(nodo, excluir = 0) {
  return estado.revisiones
    .filter(o => o.id !== excluir && o.status === 'pending' && o.items.some(x => x.node_id === nodo))
    .sort((a, b) => b.id - a.id)
    .map(o => ({ id: o.id, codigo: `RV-${String(o.id).padStart(3, '0')}`, title: o.title }));
}

function detalle(rev) {
  const pasos = rev.steps.map((p, i) => ({
    numero: i + 1, etiqueta: null, persona: p.name, user_id: p.user_id, decision: p.decision,
    terminal: i === rev.steps.length - 1, dias: p.dias || null,
    estado: rev.status === 'approved' ? 'hecho'
      : rev.status === 'rejected' ? (i < rev.current_step ? 'hecho' : i === rev.current_step ? 'rechazado' : 'no_alcanzado')
      : (i < rev.current_step ? 'hecho' : i === rev.current_step ? 'actual' : 'pendiente'),
    acto: (rev.history.filter(h => ['approve', 'reject'].includes(h.event) && h.step === i).pop()) || null,
    inicio: null, vence: i === rev.current_step ? rev.paso_vence_en || null : null, sustituciones: [],
  }));
  const items = rev.items.map(({ __nueva, ...it }) => ({
    ...it, version_vigente_numero: __nueva ? it.version + 1 : it.version, es_version_vigente: !__nueva,
    estado_documento: estado.documentos[it.node_id] || 'WIP',
    ...(rev.status === 'pending' ? { tambien_en: otrasEnCurso(it.node_id, rev.id) } : {}) }));
  return { ...rev, items, codigo: `RV-${String(rev.id).padStart(3, '0')}`, obra_id: OBRA, flujo: 'ACTIVA',
           flujo_motivo: '', me_toca: rev.status === 'pending' && rev.steps[rev.current_step].user_id === window.__usuario,
           pasos, acciones: acciones(rev) };
}

const original = window.fetch.bind(window);
window.fetch = async (url, opciones = {}) => {
  const u = new URL(String(typeof url === 'string' ? url : url.url), window.location.origin);
  if (!u.pathname.startsWith('/api/')) return original(url, opciones);
  const metodo = (opciones.method || 'GET').toUpperCase();
  window.__registro.push(`${metodo} ${u.pathname}${u.search}`);

  if (u.pathname === '/api/reviews' && metodo === 'GET') {
    const filtro = u.searchParams.get('filtro') || 'todas';
    const limite = Number(u.searchParams.get('limite') || 20);
    const antes = Number(u.searchParams.get('antes_de') || 0);
    let lista = estado.revisiones.map(detalle);
    if (filtro === 'me_toca') lista = lista.filter(r => r.me_toca);
    if (filtro === 'en_curso') lista = lista.filter(r => r.status === 'pending');
    if (filtro === 'terminadas') lista = lista.filter(r => r.status !== 'pending');
    if (filtro === 'bloqueadas') lista = [];
    if (filtro === 'iniciadas_por_mi') lista = lista.filter(r => r.created_by === quien().email);
    if (antes) lista = lista.filter(r => r.id < antes);
    const pagina = lista.slice(0, limite);
    return responder({ success: true, reviews: pagina, filtro, limite, obra_id: OBRA,
                       siguiente: lista.length > limite ? pagina[pagina.length - 1].id : null });
  }

  if (u.pathname === '/api/reviews/en-curso' && metodo === 'GET') {
    const documentos = {};
    for (const nodo of u.searchParams.getAll('node_id')) {
      const otras = otrasEnCurso(nodo);
      if (otras.length) documentos[nodo] = otras;
    }
    return responder({ success: true, documentos });
  }

  const enDetalle = u.pathname.match(/^\/api\/reviews\/(\d+)$/);
  if (enDetalle) {
    const rev = estado.revisiones.find(r => r.id === Number(enDetalle[1]));
    return rev ? responder({ success: true, revision: detalle(rev) })
      : responder({ success: false, code: 'REVISION_NO_ENCONTRADA', error: 'Esa revisión no existe.' }, 404);
  }

  const enActo = u.pathname.match(/^\/api\/reviews\/(\d+)\/act$/);
  if (enActo && metodo === 'POST') {
    if (window.__fallarAct) {
      const { status, body } = window.__fallarAct;
      window.__fallarAct = null;
      return responder(body, status, window.__retrasoAct || 0);
    }
    const rev = estado.revisiones.find(r => r.id === Number(enActo[1]));
    const { action, comment } = JSON.parse(opciones.body || '{}');
    const p = rev.steps[rev.current_step];
    const ahora = new Date().toISOString();
    const terminal = rev.current_step === rev.steps.length - 1;
    const emitido = action === 'reject' ? 'RECHAZA' : p.decision === 'APRUEBA' ? 'APRUEBA' : 'CONFORME';
    rev.history.push({ event: action, step: rev.current_step, by: quien().email, comment, emitido, at: ahora });
    if (action === 'reject') rev.status = 'rejected';
    else if (terminal) {
      rev.status = 'approved';
      rev.items.forEach(it => { estado.documentos[it.node_id] = rev.final_status; });
    }
    else {
      rev.current_step += 1;
      rev.history.push({ event: 'step_started', step: rev.current_step, to: rev.steps[rev.current_step].name, at: ahora });
    }
    return responder({ success: true }, 200, window.__retrasoAct || 0);
  }

  // ── Alta de revisión (E1.1) ──
  if (u.pathname === '/api/review-templates' && metodo === 'GET') {
    return responder({ plantillas: [
      { id: 7, nombre: 'PLANOS_ASBUILT', version: 1, activa: true, alcance: 'OBRA', pasos: [{}, {}] },
      { id: 9, nombre: 'PLANTILLA_ROTA', version: 2, activa: true, alcance: 'OBRA', pasos: [{}] },
    ] });
  }
  const enResolver = u.pathname.match(/^\/api\/review-templates\/(\d+)\/resolver$/);
  if (enResolver) {
    if (enResolver[1] === '9') {
      return responder({ error: 'Esa plantilla designa una función que nadie ocupa en esta obra.' }, 409);
    }
    return responder({ pasos: [
      { user_id: 3, name: GENTE[3].name, email: GENTE[3].email, decision: 'REVISA', etiqueta: 'Coordinación', dias: 2 },
      { user_id: 2, name: GENTE[2].name, email: GENTE[2].email, decision: 'APRUEBA', etiqueta: 'Jefatura' },
    ] });
  }
  if (/^\/api\/projects\/[^/]+\/miembros$/.test(u.pathname)) {
    return responder({ miembros: Object.values(GENTE).map(g => ({
      ...g, empresa: 'BANCO SAC', role: 'editor', pendiente: g.id === 3 })) });
  }
  if (u.pathname === '/api/docs/idoneidad') return responder({ codigos: [] });
  if (u.pathname === '/api/docs/signed-url') return responder({ success: true, url: '/_probar/plano-A.pdf' });
  if (u.pathname === '/api/users') {
    return responder({ users: [...Object.values(GENTE), { id: 99, name: 'Persona de otra obra', email: 'otra@banco.test' }] });
  }
  return responder({ success: false, error: 'ruta no simulada en el banco' }, 404);
};

function AltaDeBanco() {
  const [abierta, setAbierta] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} style={{ marginLeft: 12 }}>Abrir alta de revisión</button>
      <ReviewModal isOpen={abierta} onClose={() => setAbierta(false)} projectPrefix={PREFIJO}
                   items={[{ node_id: 'nodo-1', name: 'DR-001.pdf', version: 2, version_id: 'version-1-2' }]}
                   onCreated={() => {}} />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <>
    <div style={{ padding: '6px 32px', background: '#fffbe6', fontSize: 12, borderBottom: '1px solid #f0e2a0' }}>
      BANCO · viendo como <b>{quien().name}</b> — cambia con <code>__como(1|2|3)</code>
      <AltaDeBanco />
    </div>
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 30px)' }}>
      <ReviewsView projectPrefix={PREFIJO} />
    </div>
    <Toaster position="bottom-right" />
    <ConfirmHost />
  </>
);
