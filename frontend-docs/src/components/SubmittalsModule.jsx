// SubmittalsModule — GAP 01 · someter un producto a aprobación contra la especificación.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE:
//     ¿ESTE MATERIAL / EQUIPO / PLANO DE TALLER PUEDE INSTALARSE EN LA OBRA?
//
// No es una revisión de documento. Una revisión recae sobre un fichero del
// expediente y le cambia el estado ISO. Un submittal recae sobre ALGO QUE SE VA
// A INSTALAR, y sus adjuntos son la prueba —ficha técnica, certificado, plano de
// taller—, no el objeto. Por eso lo que se ve en grande no es el estado del
// documento: es si el producto queda APTO para entrar en obra.
//
// LO QUE LA PANTALLA NO DECIDE
// Ni un solo permiso. Quién puede hacer qué lo dice el servidor, y aquí solo se
// oculta lo que esa persona no puede ejecutar —para no ofrecer un botón que
// devolverá 403—. Ocultar no es autorizar: la regla vive en el backend.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';

const COLOR_ESTADO = {
  'Borrador':    { fondo: '#f1f3f5', texto: '#5f6b76' },
  'Enviado':     { fondo: '#e7f0f9', texto: '#2c5d8a' },
  'En revision': { fondo: '#fff4e0', texto: '#8a5a12' },
  'Respondido':  { fondo: '#e9f2ff', texto: '#1f4e8c' },
  'Cerrado':     { fondo: '#e8f5ec', texto: '#1e6b3a' },
  'Anulado':     { fondo: '#f3f4f6', texto: '#8a9199' },
};

function Chip({ children, fondo, texto, titulo }) {
  return (
    <span title={titulo} style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 11,
      fontSize: 11, fontWeight: 600, background: fondo, color: texto,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export default function SubmittalsModule({ project, API, user, isAdmin }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [catalogo, setCatalogo] = useState({ veredictos: [] });
  const [abierto, setAbierto] = useState(null);
  const [creando, setCreando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // FILTRAR POR SPEC Y POR PAQUETE. En una obra con doscientos submittals la
  // pregunta que se hace es «enséñame los de la sección 05 52 13», no «todos».
  const [agrup, setAgrup] = useState({ spec_secciones: [], paquetes: [] });
  const [filtro, setFiltro] = useState({ spec_seccion: '', paquete: '' });

  const urn = project?.model_urn || project?.urn;

  const cargar = useCallback(async () => {
    if (!urn) return;
    setError('');
    try {
      const q = new URLSearchParams({ model_urn: urn });
      if (filtro.spec_seccion) q.set('spec_seccion', filtro.spec_seccion);
      if (filtro.paquete) q.set('paquete', filtro.paquete);
      const r = await apiFetch(`${API}/api/submittals?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setLista(d.submittals || []);
      // Solo las agrupaciones QUE EXISTEN: ofrecer una lista inventada haría
      // que el usuario filtrara por algo que nunca devuelve nada.
      setAgrup({ spec_secciones: d.spec_secciones || [], paquetes: d.paquetes || [] });
    } catch (e) {
      // Vacío y roto no son lo mismo: si esto falla, no se puede leer
      // «no hay submittals» — se dice que no se pudo cargar.
      setLista([]);
      setError(e.message || 'No se pudo cargar la lista.');
    }
  }, [API, urn, filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    // El catálogo de veredictos lo manda el servidor. Si la pantalla lo llevara
    // escrito, añadir uno obligaría a desplegar las dos mitades a la vez — y
    // durante un rato una ofrecería algo que la otra rechaza.
    apiFetch(`${API}/api/submittals/catalogo`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCatalogo(d); })
      .catch(() => {});
  }, [API]);

  const actuar = async (sid, accion, cuerpo, exito) => {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/api/submittals/${sid}/${accion}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo || {}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo completar.');
      toast.success(exito);
      await cargar();
      setAbierto(d);
      return d;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const soyElAutor = (s) => user?.id && s.autor_id === user.id;
  const soyElManager = (s) => (user?.id && s.responsable_id === user.id) || isAdmin;
  const meTocaEsteP0 = (s) => {
    const p = (s.steps || [])[s.current_step || 0];
    return p && user?.id && Number(p.user_id) === Number(user.id);
  };

  if (lista === null) {
    return <div style={{ padding: 24, fontSize: 13, color: '#888' }}>Cargando submittals…</div>;
  }

  return (
    <div style={{ padding: '18px 22px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650, color: '#1f2933' }}>
          Submittals
        </h2>
        {agrup.spec_secciones.length > 0 && (
          <select value={filtro.spec_seccion}
                  onChange={e => setFiltro(f => ({ ...f, spec_seccion: e.target.value }))}
                  style={{ padding: '5px 8px', border: '1px solid #dfe3e8',
                           borderRadius: 5, fontSize: 12.5, color: '#5f6b76' }}>
            <option value="">Toda especificación</option>
            {agrup.spec_secciones.map(x => (
              <option key={x.codigo} value={x.codigo}>{x.codigo} ({x.cuantos})</option>
            ))}
          </select>
        )}
        {agrup.paquetes.length > 0 && (
          <select value={filtro.paquete}
                  onChange={e => setFiltro(f => ({ ...f, paquete: e.target.value }))}
                  style={{ padding: '5px 8px', border: '1px solid #dfe3e8',
                           borderRadius: 5, fontSize: 12.5, color: '#5f6b76' }}>
            <option value="">Todo paquete</option>
            {agrup.paquetes.map(x => (
              <option key={x.nombre} value={x.nombre}>{x.nombre} ({x.cuantos})</option>
            ))}
          </select>
        )}
        <button type="button" disabled={ocupado}
                onClick={() => setCreando(true)}
                style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 6,
                         border: 'none', background: 'var(--accent, #3E6F91)',
                         color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Nuevo submittal
        </button>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f',
                  maxWidth: 700, lineHeight: 1.55 }}>
        Aprobación de <b>materiales, equipos y planos de taller</b> contra la
        especificación, antes de incorporarlos a la obra. El veredicto lo dictan
        los revisores paso a paso — <b>nadie lo dicta desde fuera del flujo</b>.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 6,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.5 }}>
          {error} <b>La lista está incompleta</b>, no vacía.
        </div>
      )}

      {lista.length === 0 && !error && (
        <div style={{ padding: '28px 20px', textAlign: 'center', color: '#98a1ab',
                      fontSize: 13, border: '1px dashed #dfe3e8', borderRadius: 8 }}>
          Todavía no hay submittals en esta obra.
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {lista.map(s => {
          const c = COLOR_ESTADO[s.estado] || COLOR_ESTADO['Borrador'];
          return (
            <div key={s.id}
                 onClick={() => setAbierto(abierto?.id === s.id ? null : s)}
                 style={{ border: '1px solid #e5e8eb', borderRadius: 8, padding: '12px 14px',
                          background: '#fff', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5,
                               fontWeight: 700, color: '#3E6F91' }}>
                  {s.codigo}{s.revision > 0 && <span style={{ color: '#8a9199' }}> rev.{s.revision}</span>}
                </span>
                <span style={{ fontSize: 13.5, color: '#1f2933', fontWeight: 500 }}>{s.titulo}</span>
                <Chip fondo={c.fondo} texto={c.texto}>{s.estado}</Chip>
                {s.veredicto && (
                  <Chip fondo={s.habilita_instalacion ? '#e8f5ec' : '#fdecec'}
                        texto={s.habilita_instalacion ? '#1e6b3a' : '#a12f2f'}
                        titulo={s.habilita_instalacion
                          ? 'Este veredicto habilita instalar el producto en obra'
                          : 'Este veredicto NO habilita instalar el producto'}>
                    {s.veredicto}
                  </Chip>
                )}
                {s.spec_seccion && (
                  <span style={{ fontSize: 11.5, color: '#8a9199' }}>
                    Espec. {s.spec_seccion}
                  </span>
                )}
              </div>

              {abierto?.id === s.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f2f4' }}
                     onClick={e => e.stopPropagation()}>
                  {s.descripcion && (
                    <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#5f6b76',
                                lineHeight: 1.5 }}>{s.descripcion}</p>
                  )}

                  {/* LA CADENA DE REVISIÓN, con el turno actual señalado. */}
                  {(s.steps || []).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9199',
                                    letterSpacing: '.04em', marginBottom: 5 }}>
                        CADENA DE REVISIÓN
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {s.steps.map((p, i) => {
                          const actual = i === s.current_step && s.estado === 'En revision';
                          const hecho = i < (s.current_step || 0);
                          return (
                            <span key={i} style={{
                              padding: '3px 9px', borderRadius: 5, fontSize: 11.5,
                              border: `1px solid ${actual ? '#3E6F91' : '#e5e8eb'}`,
                              background: actual ? '#eef4f9' : hecho ? '#f6f8f9' : '#fff',
                              color: actual ? '#2c5d8a' : hecho ? '#8a9199' : '#5f6b76',
                              fontWeight: actual ? 600 : 400,
                            }}>
                              {i + 1}. {p.name || p.email || `usuario ${p.user_id}`}
                              {hecho && ' ✓'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* LOS ACTOS. Se muestran solo a quien puede ejecutarlos —
                      pero quien decide es el servidor, no esta condición. */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {s.estado === 'Borrador' && soyElAutor(s) && (
                      <BotonActo disabled={ocupado} onClick={async () => {
                        if (!await confirmAction({
                          titulo: `Enviar ${s.codigo}`,
                          mensaje: 'Una vez enviado ya no se puede editar: el veredicto '
                                 + 'tiene que recaer sobre exactamente lo que se leyó.',
                          confirmar: 'Enviar',
                        })) return;
                        actuar(s.id, 'enviar', {}, 'Enviado al gestor de submittals');
                      }}>Enviar</BotonActo>
                    )}

                    {s.estado === 'En revision' && meTocaEsteP0(s) && (
                      <PanelVeredicto veredictos={catalogo.veredictos} disabled={ocupado}
                        onResponder={(veredicto, comentario) =>
                          actuar(s.id, 'responder', { veredicto, comentario },
                                 `Registrado: ${veredicto}`)} />
                    )}

                    {s.estado === 'Respondido' && soyElManager(s) && (
                      <BotonActo disabled={ocupado} onClick={() =>
                        actuar(s.id, 'cerrar', {}, 'Cerrado y distribuido')}>
                        Cerrar y distribuir
                      </BotonActo>
                    )}

                    {s.estado === 'Cerrado' && soyElAutor(s)
                      && ['Revisar y reenviar', 'Rechazado'].includes(s.veredicto) && (
                      <BotonActo disabled={ocupado} onClick={() =>
                        actuar(s.id, 'revision', {},
                               'Revisión creada — es un registro nuevo')}>
                        Crear revisión
                      </BotonActo>
                    )}
                  </div>

                  {s.estado === 'Cerrado' && (
                    <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.5,
                                color: s.habilita_instalacion ? '#1e6b3a' : '#a12f2f' }}>
                      {s.habilita_instalacion
                        ? '✓ El producto queda apto para incorporarse a la obra.'
                        : '✕ El producto NO queda habilitado para instalarse.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {creando && (
        <ModalNuevo API={API} urn={urn} onCerrar={() => setCreando(false)}
                    onCreado={() => { setCreando(false); cargar(); }} />
      )}
    </div>
  );
}

function BotonActo({ children, ...props }) {
  return (
    <button type="button" {...props}
            style={{ padding: '6px 13px', borderRadius: 6, border: '1px solid #cfd6dd',
                     background: '#fff', fontSize: 12.5, fontWeight: 600,
                     color: '#2c5d8a', cursor: props.disabled ? 'wait' : 'pointer' }}>
      {children}
    </button>
  );
}

function PanelVeredicto({ veredictos, onResponder, disabled }) {
  const [v, setV] = useState('');
  const [com, setCom] = useState('');
  const elegido = veredictos.find(x => x.codigo === v);
  return (
    <div style={{ width: '100%', border: '1px solid #e5e8eb', borderRadius: 7,
                  padding: 12, background: '#fbfcfd' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8a9199',
                    letterSpacing: '.04em', marginBottom: 7 }}>
        TU VEREDICTO — te toca a ti
      </div>
      <select value={v} onChange={e => setV(e.target.value)} disabled={disabled}
              style={{ width: '100%', maxWidth: 360, padding: '6px 8px', fontSize: 13,
                       border: '1px solid #ddd', borderRadius: 5, marginBottom: 8 }}>
        <option value="">Elegir veredicto…</option>
        {veredictos.map(x => <option key={x.codigo} value={x.codigo}>{x.codigo}</option>)}
      </select>
      {elegido && (
        <p style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.5,
                    color: elegido.habilita_instalacion ? '#1e6b3a' : '#a12f2f' }}>
          {elegido.habilita_instalacion
            ? 'Habilita instalar el producto en la obra.'
            : elegido.exige_revision
              ? 'Corta la cadena: el contratista tendrá que reenviar una revisión.'
              : 'No habilita instalar el producto.'}
        </p>
      )}
      <textarea value={com} onChange={e => setCom(e.target.value)} rows={2}
                placeholder="Comentario (queda en el historial)"
                style={{ width: '100%', padding: '6px 8px', fontSize: 12.5,
                         border: '1px solid #ddd', borderRadius: 5, resize: 'vertical',
                         fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <button type="button" disabled={!v || disabled}
              onClick={() => onResponder(v, com)}
              style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, border: 'none',
                       background: v ? 'var(--accent, #3E6F91)' : '#cfd6dd', color: '#fff',
                       fontSize: 12.5, fontWeight: 600,
                       cursor: v && !disabled ? 'pointer' : 'not-allowed' }}>
        Registrar veredicto
      </button>
    </div>
  );
}

function ModalNuevo({ API, urn, onCerrar, onCreado }) {
  const [f, setF] = useState({ titulo: '', descripcion: '', spec_seccion: '', paquete: '' });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const crear = async () => {
    if (!f.titulo.trim()) { toast.error('El título es obligatorio.'); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/submittals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, model_urn: urn }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo crear.');
      toast.success(`${d.codigo} creado en borrador`);
      onCreado();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,26,.45)',
                                     display: 'flex', alignItems: 'center',
                                     justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480,
                    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Nuevo submittal</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#78838f', lineHeight: 1.5 }}>
          Nace en <b>borrador</b>: puedes editarlo hasta que lo envíes. Al enviarlo
          queda fijo, porque el veredicto tiene que recaer sobre exactamente lo
          que se leyó.
        </p>
        {[['titulo', 'Título *', 'Baranda metálica tipo A'],
          ['spec_seccion', 'Sección de especificación', '05 52 13'],
          ['paquete', 'Paquete', 'Estructuras metálicas — Frente 2']].map(([k, lbl, ph]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500,
                            color: '#5f6b76', marginBottom: 5 }}>{lbl}</label>
            <input value={f[k]} onChange={e => set(k, e.target.value)} placeholder={ph}
                   style={{ width: '100%', height: 38, padding: '0 10px', fontSize: 13,
                            border: '1px solid #dfe3e8', borderRadius: 6,
                            boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500,
                          color: '#5f6b76', marginBottom: 5 }}>Descripción</label>
          <textarea value={f.descripcion} onChange={e => set('descripcion', e.target.value)}
                    rows={3} style={{ width: '100%', padding: '8px 10px', fontSize: 13,
                                      border: '1px solid #dfe3e8', borderRadius: 6,
                                      resize: 'vertical', fontFamily: 'inherit',
                                      boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
                  style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #dfe3e8',
                           background: '#fff', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button type="button" onClick={crear} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                           background: 'var(--accent, #3E6F91)', color: '#fff',
                           fontSize: 13, fontWeight: 600,
                           cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Creando…' : 'Crear en borrador'}
          </button>
        </div>
      </div>
    </div>
  );
}
