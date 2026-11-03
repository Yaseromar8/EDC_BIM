/**
 * Piezas de la incidencia que comparten todas las herramientas (docs/archivos/19): el responsable (persona o empresa),
 * los observadores, la clasificación (subtipo, causa raíz, campos propios) y lo que hace falta saber de la obra.
 *
 * No saben de qué aplicación son: todo lo que necesitan de fuera llega en `entorno` (cómo pedir al servidor, cómo
 * avisar, quién soy). Así las usan Docs y View sin copiarlas.
 */
import React, { useEffect, useMemo, useState } from 'react';

export async function leerJson(entorno, url) {
  try {
    const r = await entorno.pedir(url);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function enviarJson(entorno, url, cuerpo, metodo = 'POST') {
  const r = await entorno.pedir(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) {
    const e = new Error(d.error || 'No se pudo guardar.');
    e.code = d.code || null;     // p. ej. NUBES_SIN_LEVANTAR: el panel lleva a la pestaña que lo resuelve
    throw e;
  }
  return d;
}

/** Lo de la obra que hace falta para asignar y clasificar: miembros, empresas, configuración, catálogo, y quién soy. */
export function useObraDeIncidencias(entorno, obra) {
  const [miembros, setMiembros] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [config, setConfig] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [vuelta, setVuelta] = useState(0);
  const API = entorno?.API ?? '';
  useEffect(() => {
    if (!obra || !entorno) return undefined;
    let vivo = true;
    const o = encodeURIComponent(obra);
    leerJson(entorno, `${API}/api/projects/${o}/miembros`).then(d => { if (vivo) setMiembros(d?.miembros || []); });
    leerJson(entorno, `${API}/api/projects/${o}/participantes`).then(d => { if (vivo) setEmpresas(d?.participantes || []); });
    leerJson(entorno, `${API}/api/issues/configuracion?model_urn=${o}`).then(d => { if (vivo && d) setConfig(d); });
    // SIN RED, el catálogo sale de lo que la aplicación tenga guardado (en Docs, la precarga de campo): un punch se
    // levanta en obra, donde no hay señal, y sin tipos no se podría levantar.
    leerJson(entorno, `${API}/api/issues/catalogo`)
      .then(d => d || (entorno.catalogoSinRed ? entorno.catalogoSinRed() : null))
      .then(d => { if (vivo && d) setCatalogo(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [API, obra, vuelta]); // eslint-disable-line react-hooks/exhaustive-deps
  const yo = entorno?.yo?.() ?? null;
  const mio = miembros.find(m => String(m.id) === String(yo));
  const nombres = useMemo(() => Object.fromEntries(miembros.map(m => [m.id, m.name || m.email])), [miembros]);
  const nombresDeEmpresa = useMemo(() => Object.fromEntries(empresas.map(e => [e.company_id, e.nombre])), [empresas]);
  // El historial guarda el correo (o el nombre) de quien actuó: en pantalla, su nombre si es de la obra.
  const nombreDeQuien = (quien) => {
    const q = String(quien || '').toLowerCase();
    const m = miembros.find(x => String(x.email || '').toLowerCase() === q || String(x.name || '').toLowerCase() === q);
    return m?.name || quien || '';
  };
  return {
    miembros, empresas, config, catalogo, nombres, nombresDeEmpresa, nombreDeQuien, yo,
    miEmpresa: mio?.company_id ?? null, esAdmin: !!(mio?.es_admin_de_obra || config?.admin),
    recargar: () => setVuelta(v => v + 1),
  };
}

// ── PIEZAS DEL ALTA ─────────────────────────────────────────────────────────

/** Persona o empresa. `valor` = { responsable_id } o { responsable_empresa }. */
export function ResponsableDeAlta({ miembros, empresas, valor, onChange, excluir = null, etiqueta = 'Responsable de corregir',
                                    notaEmpresa = 'La corrige cualquiera de esa empresa; nadie de ella la verifica.' }) {
  const [modo, setModo] = useState(valor?.responsable_empresa != null ? 'empresa' : 'persona');
  const personas = miembros.filter(m => m.id != null && String(m.id) !== String(excluir));
  return (
    <div className="pinc-campo">
      <span className="pinc-campo__cab">
        {etiqueta}
        {empresas.length > 0 && (
          <span className="pinc-modo" role="tablist">
            {[['persona', 'Persona'], ['empresa', 'Empresa']].map(([m, t]) => (
              <button key={m} type="button" role="tab" aria-selected={modo === m}
                onClick={() => { setModo(m); onChange({}); }}>{t}</button>
            ))}
          </span>
        )}
      </span>
      {modo === 'persona' ? (
        <select value={valor?.responsable_id ?? ''} onChange={e => onChange(e.target.value ? { responsable_id: Number(e.target.value) } : {})}>
          <option value="">Elige un miembro de la obra…</option>
          {personas.map(m => <option key={m.id} value={m.id}>{m.name || m.email}{m.empresa ? ` · ${m.empresa}` : ''}</option>)}
        </select>
      ) : (
        <select value={valor?.responsable_empresa ?? ''} onChange={e => onChange(e.target.value ? { responsable_empresa: Number(e.target.value) } : {})}>
          <option value="">Elige una empresa de la obra…</option>
          {empresas.map(e => <option key={e.company_id} value={e.company_id}>{e.nombre}{e.funcion ? ` · ${e.funcion.toLowerCase()}` : ''}</option>)}
        </select>
      )}
      {modo === 'empresa' && notaEmpresa && <small>{notaEmpresa}</small>}
    </div>
  );
}

/** Observadores: reciben aviso de cada paso. */
export function ObservadoresDeAlta({ miembros, valor = [], onChange, excluir = [] }) {
  const [abierto, setAbierto] = useState(false);
  const fuera = new Set((excluir || []).filter(x => x != null).map(String));
  const lista = miembros.filter(m => m.id != null && !fuera.has(String(m.id)));
  const elegidos = new Set((valor || []).map(String));
  return (
    <div className="pinc-campo">
      <span className="pinc-campo__cab">
        <span>Observadores <small>(opcional)</small></span>
        <button type="button" className="pinc-enlace" onClick={() => setAbierto(a => !a)}>
          {abierto ? 'Listo' : (valor.length ? `${valor.length} · cambiar` : 'Añadir')}</button>
      </span>
      {!abierto && valor.length > 0 && (
        <small>{lista.filter(m => elegidos.has(String(m.id))).map(m => m.name || m.email).join(', ')}</small>
      )}
      {abierto && (
        <ul className="pinc-lista">
          {lista.map(m => (
            <li key={m.id}>
              <label>
                <input type="checkbox" checked={elegidos.has(String(m.id))}
                  onChange={() => onChange(elegidos.has(String(m.id)) ? valor.filter(x => String(x) !== String(m.id)) : [...valor, m.id])} />
                <span>{m.name || m.email}</span>{m.empresa && <small>{m.empresa}</small>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Los campos propios que se aplican a ese tipo (sin `tipos`, a todos), como `flujo_de_issue.campos_del_tipo`.
export const camposDelTipo = (config, tipo) =>
  (config?.campos || []).filter(d => !(d.tipos || []).length || d.tipos.includes(tipo));

export const faltaObligatorio = (config, campos, tipo) =>
  camposDelTipo(config, tipo).find(d => d.obligatorio && ((campos || {})[d.clave] == null || String((campos || {})[d.clave]).trim() === ''));

function CampoPropio({ def, valor, onChange }) {
  const comun = { value: valor ?? '', onChange: e => onChange(e.target.value) };
  return (
    <label className="pinc-campo">
      <span>{def.etiqueta}{def.obligatorio ? ' *' : ''}</span>
      {def.tipo === 'lista' ? (
        <select {...comun}><option value="">—</option>{(def.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
      ) : def.tipo === 'fecha' ? <input type="date" {...comun} />
        : def.tipo === 'numero' ? <input type="number" step="any" {...comun} />
          : <input maxLength={500} {...comun} />}
    </label>
  );
}

/** Subtipo, causa raíz y campos propios, según lo que la obra configuró. `valores` = {subtipo, causa_raiz, campos}. */
export function ClasificacionDeAlta({ config, tipo, valores, onChange, conCausa = true }) {
  const subtipos = (config?.subtipos || {})[tipo] || [];
  const causas = config?.causas || [];
  const campos = camposDelTipo(config, tipo);
  if (!subtipos.length && !(conCausa && causas.length) && !campos.length) return null;
  const poner = (k, v) => onChange({ ...valores, [k]: v });
  return (
    <>
      {subtipos.length > 0 && (
        <label className="pinc-campo">
          <span>Subtipo</span>
          <select value={valores?.subtipo || ''} onChange={e => poner('subtipo', e.target.value || null)}>
            <option value="">—</option>{subtipos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      {conCausa && causas.length > 0 && (
        <label className="pinc-campo">
          <span>Causa raíz</span>
          <select value={valores?.causa_raiz || ''} onChange={e => poner('causa_raiz', e.target.value || null)}>
            <option value="">—</option>{causas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      {campos.map(def => (
        <CampoPropio key={def.clave} def={def} valor={(valores?.campos || {})[def.clave]}
          onChange={v => poner('campos', { ...(valores?.campos || {}), [def.clave]: v })} />
      ))}
    </>
  );
}
