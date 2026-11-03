// PunchModule — GAP 04 · ISSUES Y PUNCH.
//
// LA PREGUNTA QUE ESTA PANTALLA RESPONDE:
//     ¿QUÉ DEFECTOS SIGUEN ABIERTOS, Y DE QUIÉN ES LA PELOTA AHORA?
//
// POR QUÉ NO SE LLAMA `IssueModule`
// ---------------------------------
// Ese nombre ya está ocupado por el componente genérico de RFI y Red Line
// (`IssueModule.jsx`), que a pesar del nombre NO es este objeto. El 25-ago-2026
// se congeló `RED LINE ≠ ISSUE`; reutilizar el nombre habría vuelto a mezclar
// justo lo que se acababa de separar, esta vez en el árbol de ficheros.
//
// LA DECISIÓN DE INTERFAZ QUE MÁS IMPORTA
// ---------------------------------------
// Las TRES identidades se ven SIEMPRE, en la lista y en el detalle:
//
//     DETECTÓ   ≠   CORRIGE   ≠   VERIFICA
//
// No es decoración. El objeto entero se sostiene sobre que sean personas
// distintas, y una pantalla que enseñara solo «responsable» dejaría creer que
// hay dos papeles donde hay tres — que es exactamente el error que tenía el
// backend hasta esta misma semana.
//
// A quién le toca NO se deduce aquí: lo dice el servidor en `a_quien_le_toca`,
// calculado por la misma función que reparte los encargos. Si esta pantalla lo
// dedujera por su cuenta habría dos versiones de la regla —la que manda los
// avisos y la que dibuja la lista— y divergirían en el primer estado nuevo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import * as campo from '../offline/captura';
import { ESTADOS_DE_ISSUE, OPCIONALES, estadoDeIssue, usaEstado } from '../utils/estadosDeIssue';
import { exportarExcel, exportarPdf, filasDelInforme } from '../utils/informeDeIncidencias';
import { useObraDeIncidencias } from '../../../design/incidencias/piezas.jsx';
import IncidenciaLateral, { useEntornoDocs } from './IncidenciaLateral';
import { incidenciaDeLaDireccion, sinIncidencia } from '../utils/enlacesDeArchivos';

const COLOR_TIPO = {
  PUNCH:          { fondo: '#f1f0e8', texto: '#507294' },
  NO_CONFORMIDAD: { fondo: '#fbebeb', texto: '#b93535' },
  CALIDAD:        { fondo: '#ecf0f1', texto: '#507294' },
  SEGURIDAD:      { fondo: '#f7ece5', texto: '#9e5943' },
  OBSERVACION:    { fondo: '#f1f0e8', texto: '#52524d' },
};

const CAJA = { border: '1px solid #e8e6dc', borderRadius: 6, boxSizing: 'border-box' };

function Chip({ mapa, valor, texto }) {
  const c = mapa[valor] || { fondo: '#f1f0e8', texto: '#72706b' };
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                   background: c.fondo, color: c.texto, whiteSpace: 'nowrap' }}>
      {texto || valor}
    </span>
  );
}

// Los mismos chips, el detalle y el alta, para el tablero de Docs (docs/visor/61): una incidencia se ve y se trabaja
// con las mismas piezas y las mismas reglas que aquí, no con una segunda versión.
// El estado se lee con la etiqueta de ACC (migración 45): «Corregido» se ve «En revisión».
export function ChipDeEstado({ estado }) {
  const e = estadoDeIssue(estado);
  return <Chip mapa={{ [estado]: { fondo: `${e.color}1f`, texto: e.color } }} valor={estado} texto={e.etiqueta} />;
}
export function ChipDeTipo({ tipo, etiqueta }) { return <Chip mapa={COLOR_TIPO} valor={tipo} texto={etiqueta} />; }

// ── LAS TRES IDENTIDADES ───────────────────────────────────────────────────
// Un papel vacío se dice, no se esconde. «Sin designar» es información: es un
// issue que va a quedarse sin nadie a quien pasarle la pelota al corregirse.
function Papel({ rotulo, uid, nombres, esElTurno, ausenteGrave, texto = null }) {
  const nombre = texto || (uid ? (nombres[uid] || `usuario ${uid}`) : null);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em',
                    color: esElTurno ? '#b93535' : '#b0aea5' }}>
        {rotulo}{esElTurno ? ' · LE TOCA' : ''}
      </div>
      <div style={{ fontSize: 13, color: nombre ? '#141413' : (ausenteGrave ? '#b93535' : '#b0aea5'),
                    fontWeight: esElTurno ? 650 : 400, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {nombre || 'sin designar'}
      </div>
    </div>
  );
}

function Identidades({ d, nombres, nombresDeEmpresa = {} }) {
  // Asignada a una EMPRESA (45): corrige cualquiera de ella.
  const empresa = !d.responsable_id && d.responsable_empresa
    ? `${nombresDeEmpresa[d.responsable_empresa] || 'Empresa'} (empresa)` : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 14, alignItems: 'start' }}>
      <Papel rotulo="DETECTÓ" uid={d.autor_id} nombres={nombres} />
      <Papel rotulo="CORRIGE" uid={d.responsable_id} nombres={nombres} texto={empresa}
             esElTurno={(d.a_quien_le_toca === d.responsable_id && !!d.responsable_id) || !!d.a_quien_le_toca_empresa} />
      <Papel rotulo="VERIFICA" uid={d.verificador_id} nombres={nombres}
             esElTurno={d.a_quien_le_toca === d.verificador_id && !!d.verificador_id}
             // Corregido y sin verificador designado: la pelota se ha caído.
             // Eso hay que verlo en rojo, no en gris.
             ausenteGrave={d.estado === 'Corregido'} />
    </div>
  );
}

export default function PunchModule({ project, API, user, isAdmin }) {
  const [issues, setIssues] = useState(null);
  const [resumen, setResumen] = useState({});
  const [catalogo, setCatalogo] = useState({ tipos: [], estados: [] });
  const [miembros, setMiembros] = useState([]);
  const [filtro, setFiltro] = useState({ tipo: '', estado: '', mios: false });
  // Desde «Mi trabajo» (3-nov-2026) la dirección trae la incidencia a abrir: se toma una vez y se quita.
  const [abierto, setAbierto] = useState(() => {
    const id = incidenciaDeLaDireccion(window.location.search);
    return id ? { id } : null;
  });
  useEffect(() => {
    if (incidenciaDeLaDireccion(window.location.search) === null) return;
    window.history.replaceState(window.history.state, '',
      window.location.pathname + sinIncidencia(window.location.search) + window.location.hash);
  }, []);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [configurando, setConfigurando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const urn = project?.model_urn || project?.urn;
  const obra = project?.id;
  // Lo que la obra decide de sus incidencias (45) y sus empresas: estados opcionales, subtipos, causas raíz, campos.
  const entorno = useEntornoDocs({ API, user, project });
  const ob = useObraDeIncidencias(entorno, urn);
  const opcionales = ob.config ? ob.config.opcionales : null;

  const guardarConfiguracion = async (cambios) => {
    try {
      const r = await apiFetch(`${API}/api/issues/configuracion`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_urn: urn, ...cambios }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar.');
      ob.recargar();
      toast.success('Configuración de las incidencias guardada');
      return true;
    } catch (e) { toast.error(e.message); return false; }
  };

  const exportar = async (formato) => {
    setExportando(false);
    const informe = filasDelInforme(visibles, { nombres, empresas: ob.nombresDeEmpresa, campos: ob.config?.campos || [] });
    if (!informe.filas.length) { toast.error('No hay incidencias en la lista para exportar.'); return; }
    const titulo = `Incidencias ${project?.name || ''}`.trim();
    try {
      if (formato === 'xlsx') await exportarExcel(titulo, informe);
      else await exportarPdf(titulo, filtro.estado ? estadoDeIssue(filtro.estado).etiqueta : 'Todas las de la lista', informe);
    } catch (e) { toast.error(`No se pudo exportar: ${e.message}`); }
  };

  const nombres = useMemo(() => {
    const m = {};
    miembros.forEach(p => { m[p.id] = p.name || p.email; });
    return m;
  }, [miembros]);

  const cargar = useCallback(async () => {
    if (!urn) return;
    setError('');
    try {
      const q = new URLSearchParams({ model_urn: urn });
      if (filtro.tipo) q.set('tipo', filtro.tipo);
      if (filtro.estado) q.set('estado', filtro.estado);
      const r = await apiFetch(`${API}/api/issues?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setIssues(d.issues || []);
      setResumen(d.resumen || {});
      // Si hay un detalle abierto, se refresca con la versión recién traída.
      setAbierto(a => (a ? (d.issues || []).find(x => x.id === a.id) || null : null));
    } catch (e) {
      setIssues([]);
      setError(e.message || 'No se pudieron cargar los issues.');
    }
  }, [API, urn, filtro.tipo, filtro.estado]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    apiFetch(`${API}/api/issues/catalogo`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCatalogo(d); })
      // SIN RED, EL CATALOGO SALE DE LA PRECARGA. Pedirlo solo a la red dejaba
      // el modal de levantar sin tipos justo cuando mas falta hace -- lo
      // destapo la EXP de campo. La precarga es una foto y se enseña como tal.
      .catch(() => {
        const ctx = campo.contextoDe(user, project);
        if (!ctx) return;
        import('../offline/precarga')
          .then(pre => pre.leer(ctx, pre.CATALOGOS))
          .then(({ datos }) => { if (datos) setCatalogo(datos); })
          .catch(() => {});
      });
  }, [API]);

  useEffect(() => {
    if (!obra) return;
    apiFetch(`${API}/api/projects/${encodeURIComponent(obra)}/miembros`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setMiembros(d.miembros || []); })
      .catch(() => {});
  }, [API, obra]);

  const visibles = useMemo(() => {
    const lista = issues || [];
    if (!filtro.mios) return lista;
    return lista.filter(i => i.a_quien_le_toca === user?.id);
  }, [issues, filtro.mios, user]);

  const meToca = (issues || []).filter(i => i.a_quien_le_toca === user?.id).length;
  // Corregidos que se quedaron sin nadie a quien pasarles la pelota. Deuda
  // visible: preferimos enseñarla a que un administrador la descubra tarde.
  const sinVerificador = (issues || []).filter(
    i => i.estado === 'Corregido' && !i.verificador_id).length;

  const totalPor = (estado) => Object.values(resumen)
    .reduce((n, porEstado) => n + (porEstado[estado] || 0), 0);

  return (
    <div style={{ padding: '18px 22px', paddingRight: abierto || creando ? 422 : 22, height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650, color: '#141413' }}>
          Issues y punch
        </h2>
        <span style={{ fontSize: 13, color: '#72706b' }}>
          Un defecto se cierra cuando <b>otro</b> verifica que se corrigió.
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setExportando(v => !v)} aria-haspopup="menu" aria-expanded={exportando}
                  style={{ ...CAJA, padding: '7px 13px', background: '#fff', fontSize: 14,
                           cursor: 'pointer', color: '#141413' }}>
            Exportar
          </button>
          {exportando && (
            <div role="menu" style={{ ...CAJA, position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20,
                                      background: '#fff', padding: 4, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>
              {[['xlsx', 'Excel (.xlsx)'], ['pdf', 'Informe PDF']].map(([f, t]) => (
                <button key={f} type="button" role="menuitem" onClick={() => exportar(f)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none',
                                 background: 'none', fontSize: 13, cursor: 'pointer', borderRadius: 4 }}>
                  {t}
                </button>
              ))}
              <div style={{ padding: '4px 10px 6px', fontSize: 12, color: '#72706b' }}>
                {visibles.length} de la lista, con sus filtros
              </div>
            </div>
          )}
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setConfigurando(true)}
                  style={{ ...CAJA, padding: '7px 13px', background: '#fff', fontSize: 14,
                           cursor: 'pointer', color: '#141413' }}>
            Configuración
          </button>
        )}
        <button type="button" onClick={() => { setAbierto(null); setCreando(true); }}
                style={{ padding: '8px 15px', borderRadius: 6, border: 'none',
                         background: 'var(--accent, #507294)', color: '#fff',
                         fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Levantar issue
        </button>
      </div>

      {/* EL ESTADO DE LA OBRA EN UNA LÍNEA */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 12px' }}>
        {/* Los de ACC en el orden del flujo. Un opcional apagado se ve solo si aún tiene alguna. */}
        {ESTADOS_DE_ISSUE
          .filter(e => e.codigo !== 'Anulado'
                       && (usaEstado(e.codigo, opcionales) || totalPor(e.codigo) > 0)
                       && (e.codigo !== 'Borrador' || totalPor(e.codigo) > 0))
          .map(({ codigo: e, etiqueta, color }) => (
          <button key={e} type="button"
                  onClick={() => setFiltro(f => ({ ...f, estado: f.estado === e ? '' : e }))}
                  style={{ ...CAJA, padding: '6px 12px', cursor: 'pointer',
                           background: filtro.estado === e ? '#f1f0e8' : '#fff',
                           borderColor: filtro.estado === e ? '#507294' : '#e8e6dc' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color }}>
              {totalPor(e)}
            </span>
            <span style={{ fontSize: 12, color: '#72706b', marginLeft: 6 }}>{etiqueta}</span>
          </button>
        ))}
        <button type="button" onClick={() => setFiltro(f => ({ ...f, mios: !f.mios }))}
                style={{ ...CAJA, padding: '6px 12px', cursor: 'pointer',
                         background: filtro.mios ? '#f9eeda' : '#fff',
                         borderColor: filtro.mios ? '#734500' : '#e8e6dc' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#734500' }}>{meToca}</span>
          <span style={{ fontSize: 12, color: '#72706b', marginLeft: 6 }}>me toca a mí</span>
        </button>
        <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}
                style={{ ...CAJA, height: 34, padding: '0 8px', fontSize: 13, background: '#fff' }}>
          <option value="">Todos los tipos</option>
          {(catalogo.tipos || []).map(t => (
            <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
          ))}
        </select>
      </div>

      {sinVerificador > 0 && (
        <div style={{ ...CAJA, borderColor: '#f7ece5', background: '#f7ece5',
                      padding: '9px 13px', marginBottom: 12, fontSize: 13,
                      color: '#734500' }}>
          <b>{sinVerificador}</b> issue(s) corregidos sin verificador designado: nadie
          tiene la pelota. Hasta que se les asigne uno, solo un administrador de la
          obra puede cerrarlos.
        </div>
      )}

      {error && (
        <div style={{ ...CAJA, borderColor: '#fbebeb', background: '#fbebeb',
                      padding: '9px 13px', marginBottom: 12, fontSize: 13,
                      color: '#b93535' }}>{error}</div>
      )}

      {issues === null && (
        <div style={{ padding: 30, textAlign: 'center', color: '#72706b', fontSize: 14 }}>
          Cargando…
        </div>
      )}

      {issues !== null && visibles.length === 0 && (
        <div style={{ padding: '26px 20px', textAlign: 'center', color: '#72706b',
                      fontSize: 14, border: '1px dashed #e8e6dc', borderRadius: 8 }}>
          {filtro.mios ? 'No tienes ningún issue esperándote.' : 'Sin issues con este filtro.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {visibles.map(i => (
          <FilaIssue key={i.id} d={i} nombres={nombres} yo={user?.id} nombresDeEmpresa={ob.nombresDeEmpresa}
                     onAbrir={() => { setCreando(false); setAbierto(i); }} abierta={abierto?.id === i.id} />
        ))}
      </div>

      {/* EL PANEL LATERAL: la lista sigue a la vista a la izquierda, como en ACC. */}
      {(abierto || creando) && (
        <IncidenciaLateral key={abierto ? abierto.id : 'nueva'} API={API} user={user} project={project} obra={urn}
          issueId={abierto ? abierto.id : null} nueva={abierto ? null : {}}
          onCreada={(hecha) => { cargar(); if (hecha?.id) { setCreando(false); setAbierto({ id: String(hecha.id) }); } }}
          onCambio={cargar} onCerrar={() => { setAbierto(null); setCreando(false); }} />
      )}

      {configurando && (
        <ConfiguracionDeIncidencias config={ob.config} tipos={catalogo.tipos || []}
                                    onGuardar={guardarConfiguracion} onCerrar={() => setConfigurando(false)} />
      )}
    </div>
  );
}

// Los estados opcionales de la obra, como en la administración de incidencias de ACC. Apagar uno no mueve las que ya
// están en él: siguen su ciclo; solo deja de ofrecerse entrar.
const AYUDA_OPCIONAL = {
  'Borrador': 'Guardar una incidencia sin enviarla: nadie más la ve hasta que se envía.',
  'En curso': 'El responsable avisa de que ya la está corrigiendo.',
  'En disputa': 'El responsable dice que no procede, con motivo; quien la levantó la reafirma o la anula.',
};

const CLASES_DE_CAMPO = [['texto', 'Texto'], ['numero', 'Número'], ['fecha', 'Fecha'], ['lista', 'Lista']];
const lineas = (t) => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);

function ConfiguracionDeIncidencias({ config, tipos, onGuardar, onCerrar }) {
  const [marcados, setMarcados] = useState(config?.opcionales ?? OPCIONALES);
  const [subtipos, setSubtipos] = useState(() => Object.fromEntries(
    tipos.map(t => [t.codigo, ((config?.subtipos || {})[t.codigo] || []).join('\n')])));
  const [causas, setCausas] = useState((config?.causas || []).join('\n'));
  const [campos, setCampos] = useState(() => (config?.campos || []).map(c => ({
    ...c, opciones: (c.opciones || []).join(', '), tipoDeIncidencia: (c.tipos || [])[0] || '' })));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (c) => setMarcados(m => (m.includes(c) ? m.filter(x => x !== c) : [...m, c]));
  const campo = (n, k, v) => setCampos(cs => cs.map((c, m) => (m === n ? { ...c, [k]: v } : c)));
  const rotulo = { fontSize: 12, fontWeight: 700, color: '#72706b', letterSpacing: '.05em', margin: '16px 0 6px' };
  const entrada = { ...CAJA, padding: '6px 9px', fontSize: 13, fontFamily: 'inherit', background: '#fff' };

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar({
      opcionales: marcados,
      subtipos: Object.fromEntries(Object.entries(subtipos).map(([t, v]) => [t, lineas(v)]).filter(([, v]) => v.length)),
      causas: lineas(causas),
      campos: campos.filter(c => c.etiqueta?.trim()).map(c => ({
        ...(c.clave ? { clave: c.clave } : {}), etiqueta: c.etiqueta.trim(), tipo: c.tipo, obligatorio: !!c.obligatorio,
        ...(c.tipo === 'lista' ? { opciones: String(c.opciones || '').split(',').map(x => x.trim()).filter(Boolean) } : {}),
        tipos: c.tipoDeIncidencia ? [c.tipoDeIncidencia] : [],
      })),
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <div onClick={onCerrar}
         style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,19,.45)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Configuración de las incidencias"
           style={{ background: '#fff', borderRadius: 10, padding: 24, width: 640, maxWidth: '94vw',
                    maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.22)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650 }}>Configuración de las incidencias</h3>
        <p style={{ margin: 0, fontSize: 13, color: '#72706b', lineHeight: 1.5 }}>
          Lo que esta obra usa, como el administrador de incidencias de ACC. Lo que cambies vale para las nuevas; las que
          ya existen siguen su ciclo.
        </p>

        <div style={rotulo}>ESTADOS OPCIONALES</div>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#72706b' }}>
          Abierta, En revisión, No aprobada, Cerrada y Anulada están siempre.
        </p>
        {OPCIONALES.map(c => {
          const e = estadoDeIssue(c);
          return (
            <label key={c} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={marcados.includes(c)} onChange={() => cambiar(c)} style={{ marginTop: 3 }} />
              <span>
                <b style={{ fontSize: 13, color: e.color }}>{e.etiqueta}</b>
                <span style={{ display: 'block', fontSize: 12, color: '#72706b', lineHeight: 1.45 }}>{AYUDA_OPCIONAL[c]}</span>
              </span>
            </label>
          );
        })}

        <div style={rotulo}>SUBTIPOS <span style={{ fontWeight: 400, letterSpacing: 0 }}>· uno por línea; vacío = sin subtipos</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {tipos.map(t => (
            <label key={t.codigo} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#52524d' }}>
              {t.etiqueta}
              <textarea rows={3} value={subtipos[t.codigo] || ''} style={entrada}
                        onChange={e => setSubtipos(v => ({ ...v, [t.codigo]: e.target.value }))} />
            </label>
          ))}
        </div>

        <div style={rotulo}>CAUSAS RAÍZ <span style={{ fontWeight: 400, letterSpacing: 0 }}>· una por línea</span></div>
        <textarea rows={4} value={causas} onChange={e => setCausas(e.target.value)} style={{ ...entrada, width: '100%' }}
                  placeholder={'Diseño\nEjecución\nMaterial\nCoordinación'} />

        <div style={rotulo}>CAMPOS PROPIOS</div>
        {campos.length === 0 && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#72706b' }}>Ninguno.</p>}
        {campos.map((c, n) => (
          <div key={n} style={{ display: 'grid', gridTemplateColumns: '1.3fr 96px 1.2fr 120px auto auto', gap: 8,
                                alignItems: 'center', marginBottom: 6 }}>
            <input value={c.etiqueta || ''} onChange={e => campo(n, 'etiqueta', e.target.value)} placeholder="Nombre del campo" style={entrada} />
            <select value={c.tipo || 'texto'} onChange={e => campo(n, 'tipo', e.target.value)} style={entrada}>
              {CLASES_DE_CAMPO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <input value={c.opciones || ''} onChange={e => campo(n, 'opciones', e.target.value)} disabled={c.tipo !== 'lista'}
                   placeholder={c.tipo === 'lista' ? 'Opciones, separadas por comas' : ''} style={entrada} />
            <select value={c.tipoDeIncidencia || ''} onChange={e => campo(n, 'tipoDeIncidencia', e.target.value)} style={entrada}
                    aria-label="A qué tipo de incidencia se aplica">
              <option value="">Todos los tipos</option>
              {tipos.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
            </select>
            <label style={{ fontSize: 12, color: '#52524d', display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={!!c.obligatorio} onChange={e => campo(n, 'obligatorio', e.target.checked)} />
              Obligatorio
            </label>
            <button type="button" aria-label="Quitar el campo" onClick={() => setCampos(cs => cs.filter((_, m) => m !== n))}
                    style={{ border: 'none', background: 'none', fontSize: 18, color: '#72706b', cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => setCampos(cs => [...cs, { etiqueta: '', tipo: 'texto', opciones: '', obligatorio: false }])}
                style={{ ...CAJA, padding: '5px 11px', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
          Añadir campo
        </button>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onCerrar}
                  style={{ ...CAJA, padding: '8px 14px', background: '#fff', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--accent, #507294)',
                           color: '#fff', fontSize: 14, fontWeight: 600, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilaIssue({ d, nombres, yo, onAbrir, abierta, nombresDeEmpresa = {} }) {
  const esMio = d.a_quien_le_toca === yo && !!yo;
  return (
    <div onClick={onAbrir}
         style={{ ...CAJA, background: '#fff', padding: '11px 14px', cursor: 'pointer',
                  borderColor: abierta ? '#507294' : (esMio ? '#f9eeda' : '#e8e6dc'),
                  borderLeft: esMio ? '3px solid #734500' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13,
                       fontWeight: 700, color: '#507294' }}>{d.codigo}</span>
        <Chip mapa={COLOR_TIPO} valor={d.tipo} texto={d.tipo_etiqueta} />
        <span style={{ fontSize: 14, color: '#141413', flex: 1, minWidth: 160 }}>
          {d.titulo}
        </span>
        {d.autoverificacion && (
          <span title={d.autoverificacion_motivo || ''}
                style={{ fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                         background: '#ecf0f1', color: '#507294' }}>
            AUTOVERIFICACIÓN AUTORIZADA
          </span>
        )}
        <ChipDeEstado estado={d.estado} />
      </div>
      <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid #f1f0e8' }}>
        <Identidades d={d} nombres={nombres} nombresDeEmpresa={nombresDeEmpresa} />
      </div>
      {(d.ubicacion || d.progresiva || d.origen_tipo) && (
        <div style={{ marginTop: 7, fontSize: 12, color: '#72706b' }}>
          {[d.ubicacion, d.progresiva].filter(Boolean).join(' · ')}
          {d.origen_tipo && (
            <span style={{ marginLeft: 8 }}>
              ← nació de un {d.origen_tipo.toLowerCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── EL DETALLE Y EL ALTA: EL PANEL LATERAL ÚNICO ───────────────────────────
//
// Desde el 2-nov-2026 una incidencia se crea y se trabaja en el MISMO panel lateral, como en ACC, y es el mismo en
// todas las herramientas (design/incidencias/PanelDeIncidencia.jsx, docs/archivos/19). Cada acto sigue siendo una
// llamada distinta con su propia autoridad: no hay un «cambiar estado», porque no existe en el servidor.
//
// `PanelIssue` y `ModalLevantar` se quedan con su nombre para quien ya los usa (los tableros).
export function PanelIssue({ d, API, user, onCerrar, onCambio }) {
  return <IncidenciaLateral API={API} user={user} obra={d.project_id || d.model_urn} issueId={d.id}
    onCambio={onCambio} onCerrar={onCerrar} />;
}

export function ModalLevantar({ API, urn, user, project, onCerrar, onCreado }) {
  return <IncidenciaLateral API={API} user={user} project={project} obra={urn} nueva={{}}
    onCreada={(hecha) => onCreado?.(hecha)} onCerrar={onCerrar} />;
}
