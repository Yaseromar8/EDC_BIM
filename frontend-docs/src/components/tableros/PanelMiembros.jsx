// PanelMiembros — «Miembros del tablero» (docs/visor/66), como «Miembros del panel» de ACC: la gente con su rol, invitar
// (+), «¿Quién puede entrar?» y «Salir del tablero». Quien no gestiona (no es responsable ni administrador de la obra) lo
// ve sin poder cambiarlo. `Invitar` también va en «Compartir».
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ROLES, NOMBRE_ROL, AYUDA_ROL, ACCESOS, leerMiembros, invitar, quitarMiembro, cambiarAcceso, invitables } from './miembros';
import { colorDe, iniciales, mismoAutor } from './comentarios';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#E5E3DA', SUAVE = '#f1f0e8';
const caja = { height: 32, padding: '0 8px', border: `1px solid ${BORDE}`, borderRadius: 6, fontSize: 13, fontFamily: 'inherit', color: TINTA, background: '#fff' };

function Avatar({ id, nombre }) {
  return (
    <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: colorDe(id), color: '#fff', fontSize: 11, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{iniciales(nombre)}</span>
  );
}

// Elegir a alguien de la obra y su rol, e invitarlo. `alInvitar(miembros)` recibe la lista nueva.
export function Invitar({ tablero, gente, miembros, alInvitar }) {
  const [filtro, setFiltro] = useState('');
  const [elegido, setElegido] = useState('');
  const [rol, setRol] = useState('editor');
  const [enviando, setEnviando] = useState(false);
  const opciones = invitables(gente, miembros, filtro).slice(0, 50);
  const enviar = async () => {
    if (!elegido) return;
    setEnviando(true);
    const d = await invitar(tablero, Number(elegido), rol);
    setEnviando(false);
    if (!d.ok) { toast.error(d.error || 'No se pudo invitar.'); return; }
    const p = (gente || []).find(x => String(x.id) === String(elegido));
    toast.success(`${p?.name || p?.email || 'La persona'} ya es ${NOMBRE_ROL[rol].toLowerCase()} del tablero`);
    setElegido(''); setFiltro('');
    alInvitar(d.miembros || []);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input value={filtro} onChange={e => { setFiltro(e.target.value); setElegido(''); }} placeholder="Buscar a alguien de la obra…" aria-label="Buscar a quién invitar"
        style={{ ...caja, width: '100%', boxSizing: 'border-box' }} />
      <div role="listbox" aria-label="Gente de la obra" style={{ maxHeight: 150, overflowY: 'auto', border: `1px solid ${BORDE}`, borderRadius: 6 }}>
        {!opciones.length && <div style={{ padding: '8px 10px', fontSize: 13, color: GRIS }}>{gente?.length ? 'No hay nadie más a quien invitar.' : 'Cargando la gente de la obra…'}</div>}
        {opciones.map(p => (
          <button key={p.id} type="button" role="option" aria-selected={String(elegido) === String(p.id)} data-invitable={p.id} onClick={() => setElegido(String(p.id))}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              background: String(elegido) === String(p.id) ? 'rgba(13,102,180,0.10)' : 'transparent', color: TINTA }}>
            <Avatar id={p.id} nombre={p.name || p.email} />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.email}</span>
              {p.name && p.email && <span style={{ fontSize: 12, color: GRIS, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</span>}
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={rol} onChange={e => setRol(e.target.value)} aria-label="Rol de quien se invita" title={AYUDA_ROL[rol]} style={{ ...caja, flex: 1 }}>
          {ROLES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <button type="button" className="barra-btn barra-btn--primario" disabled={!elegido || enviando} onClick={enviar} style={{ height: 32 }}>Invitar</button>
      </div>
      <div style={{ fontSize: 12, color: GRIS }}>{AYUDA_ROL[rol]}.</div>
    </div>
  );
}

export default function PanelMiembros({ tablero, yo, gente, nombres, onCerrar, onSalir, onCambio }) {
  const [d, setD] = useState(null);
  const [invitando, setInvitando] = useState(false);
  useEffect(() => {
    let vivo = true;
    leerMiembros(tablero).then(r => { if (vivo) setD(r.ok ? r : { error: r.error || 'No se pudo leer quién es miembro.' }); });
    return () => { vivo = false; };
  }, [tablero]);
  const poner = (miembros) => { setD(x => ({ ...x, miembros })); onCambio?.(); };
  const nombre = (m) => nombres?.[m.id] || m.nombre || `Usuario ${m.id}`;
  const cambiarRol = async (m, rol) => {
    if (rol === 'quitar') {
      if (!window.confirm(`¿Quitar a ${nombre(m)} del tablero?`)) return;
      const r = await quitarMiembro(tablero, m.id);
      if (!r.ok) { toast.error(r.error || 'No se pudo quitar.'); return; }
      poner(r.miembros || []);
      return;
    }
    const r = await invitar(tablero, m.id, rol);
    if (!r.ok) { toast.error(r.error || 'No se pudo cambiar el rol.'); return; }
    poner(r.miembros || []);
  };
  const acceso = async (valor) => {
    const r = await cambiarAcceso(tablero, valor);
    if (!r.ok) { toast.error(r.error || 'No se pudo cambiar.'); return; }
    setD(x => ({ ...x, acceso: valor }));
    onCambio?.();
  };
  const salir = async () => {
    if (!window.confirm('¿Salir de este tablero? Dejarás de ser su miembro.')) return;
    const r = await quitarMiembro(tablero, yo.id);
    if (!r.ok) { toast.error(r.error || 'No se pudo salir.'); return; }
    toast.success('Has salido del tablero');
    onSalir(d?.acceso);
  };
  const gestiona = !!d?.gestiona;
  return (
    <>
      <div onPointerDown={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
      <div role="dialog" aria-label="Miembros del tablero" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } }}
        style={{ position: 'absolute', right: 0, top: 40, zIndex: 2, width: 400, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', boxSizing: 'border-box',
          background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: 'var(--a-font-sans)', color: TINTA }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 10px 8px 16px' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Miembros del tablero</span>
          {gestiona && (
            <button type="button" aria-label="Invitar a alguien" title="Invitar a alguien" aria-pressed={invitando} onClick={() => setInvitando(v => !v)}
              style={{ width: 30, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer', background: invitando ? SUAVE : 'transparent', color: TINTA, fontSize: 20, lineHeight: 1 }}>+</button>
          )}
        </div>
        {d?.error && <div style={{ padding: '4px 16px 12px', fontSize: 13, color: '#b93535' }}>{d.error}</div>}
        {!d && <div style={{ padding: '4px 16px 12px', fontSize: 13, color: GRIS }}>Cargando…</div>}
        {invitando && gestiona && (
          <div style={{ padding: '0 16px 12px' }}>
            <Invitar tablero={tablero} gente={gente} miembros={d?.miembros} alInvitar={(l) => { poner(l); setInvitando(false); }} />
          </div>
        )}
        {d?.miembros && (
          <div style={{ padding: '0 8px 8px' }}>
            {!d.miembros.length && <div style={{ padding: '4px 8px 8px', fontSize: 13, color: GRIS }}>Aún no hay miembros.</div>}
            {d.miembros.map(m => (
              <div key={m.id} data-miembro={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6 }}>
                <Avatar id={m.id} nombre={nombre(m)} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nombre(m)}{mismoAutor(m.id, yo.id) ? <span style={{ color: GRIS }}> (tú)</span> : null}
                </span>
                {gestiona ? (
                  <select value={m.rol} onChange={e => cambiarRol(m, e.target.value)} aria-label={`Rol de ${nombre(m)}`} title={AYUDA_ROL[m.rol]}
                    style={{ ...caja, height: 30, border: 'none', background: 'transparent', fontWeight: 500, cursor: 'pointer' }}>
                    {ROLES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    <option value="quitar">Quitar del tablero</option>
                  </select>
                ) : <span style={{ fontSize: 13, color: GRIS, paddingRight: 8 }} title={AYUDA_ROL[m.rol]}>{NOMBRE_ROL[m.rol]}</span>}
              </div>
            ))}
          </div>
        )}
        {d && !d.error && (
          <div style={{ borderTop: `1px solid ${BORDE}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: GRIS }}>
              ¿Quién puede entrar?
              {gestiona ? (
                <select value={d.acceso} onChange={e => acceso(e.target.value)} aria-label="Quién puede entrar" style={{ ...caja, flex: 1, background: SUAVE, border: 'none' }}>
                  {ACCESOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              ) : <span style={{ color: TINTA }}>{Object.fromEntries(ACCESOS)[d.acceso]}</span>}
            </label>
            <div style={{ fontSize: 12, color: GRIS, lineHeight: 1.45 }}>
              {d.acceso === 'obra'
                ? 'Toda la gente de la obra puede abrirlo y editarlo; sus miembros tienen el rol que se les dé aquí.'
                : 'Solo lo ven sus miembros.'} Los administradores de la obra pueden entrar en todos los tableros.
            </div>
            {d.soy_miembro && (
              <button type="button" className="barra-btn" onClick={salir} style={{ width: '100%', justifyContent: 'center', height: 34 }}>Salir del tablero</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
