/**
 * ObservacionDeMarca — lo que hay que corregir de una marca, con dueño, plazo e historial (20-oct-2026).
 *
 * La marca DIBUJA; la OBSERVACIÓN se gestiona. Es una incidencia de tipo «Observación de documento»
 * (doc_issues, migración 37) y sus estados son ACTOS, cada uno de quien le toca:
 *   · la levanta quien dibujó la marca, que es también quien la verifica;
 *   · la declara corregida el RESPONSABLE (un miembro de la obra), enseñando el documento corregido;
 *   · la verifica o la reabre quien la levantó; la anula quien la levantó, con motivo.
 * El responsable la ve en «Mi trabajo» y recibe aviso (encargos). Los comentarios solo se añaden.
 * Estudio y decisión: docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md (opción A).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { abrirDocumento } from '../utils/enlaceDeMarcas';
import SelectorDeDocumento from './SelectorDeDocumento';
import {
  estadoDeObservacion, observacionViva, accionesDeObservacion, aQuienLeToca,
  fechaLimitePorDefecto, fechaDeDia, textoDelEvento, etiquetaDeCita, fechaCorta,
} from '../utils/marcasConEnlace';

function idDeLaSesion() {
  try {
    const u = JSON.parse(localStorage.getItem('visor_user') || sessionStorage.getItem('visor_user') || '{}');
    return u?.id ?? null;
  } catch { return null; }
}

// El historial guarda el correo (o el nombre) de quien actuó; en pantalla, su nombre si es de la obra.
function nombreDe(quien, miembros) {
  const q = String(quien || '').toLowerCase();
  const m = miembros.find(x => String(x.email || '').toLowerCase() === q || String(x.name || '').toLowerCase() === q);
  return m?.name || quien || '';
}

async function enviar(url, cuerpo) {
  const r = await apiFetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.error || 'No se pudo guardar.');
  return d;
}

export function EtiquetaDeObservacion({ obs }) {
  if (!obs) return null;
  const e = estadoDeObservacion(obs.estado);
  return (
    <span className="mce-obs-etq" title={obs.vencida ? 'Fuera de plazo' : e.etiqueta}>
      <i style={{ background: e.color }} />
      <span>{obs.codigo}</span>
      <b>{obs.vencida ? 'Vencida' : e.etiqueta}</b>
    </span>
  );
}

/** El formulario para levantarla. Solo lo ve quien dibujó la marca. */
function NuevaObservacion({ API, marca, miembros, yo, onCreada, onCancelar }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [responsable, setResponsable] = useState('');
  const [vence, setVence] = useState(fechaLimitePorDefecto());
  const [enviando, setEnviando] = useState(false);
  // Quien la levanta la verifica: no puede ser también quien la corrige.
  const elegibles = miembros.filter(m => m.id != null && String(m.id) !== String(yo));
  const elegido = elegibles.find(m => String(m.id) === String(responsable));
  const listo = titulo.trim() && responsable && vence && !enviando;

  const crear = async () => {
    if (!listo) return;
    setEnviando(true);
    try {
      const d = await enviar(`${API}/api/pdf/markups/${marca.id}/observacion`, {
        titulo: titulo.trim(), descripcion: descripcion.trim(), responsable_id: Number(responsable), vence_en: vence,
      });
      toast.success(`${d.observacion?.codigo || 'Observación'} levantada: ${elegido?.name || 'el responsable'} la verá en Mi trabajo`);
      onCreada(d.observacion);
    } catch (e) { toast.error(e.message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="mce-obs-form">
      <label className="mce-campo">
        <span>Qué hay que corregir</span>
        <input value={titulo} maxLength={180} autoFocus onChange={e => setTitulo(e.target.value)}
          placeholder="Ej. La cota de fondo no coincide con el perfil" />
      </label>
      <label className="mce-campo">
        <span>Detalle <small>(opcional)</small></span>
        <textarea value={descripcion} maxLength={2000} rows={3} onChange={e => setDescripcion(e.target.value)} />
      </label>
      <label className="mce-campo">
        <span>Responsable de corregir</span>
        <select value={responsable} onChange={e => setResponsable(e.target.value)}>
          <option value="">Elige un miembro de la obra…</option>
          {elegibles.map(m => (
            <option key={m.id} value={m.id}>{m.name || m.email}{m.empresa ? ` · ${m.empresa}` : ''}</option>
          ))}
        </select>
      </label>
      <label className="mce-campo">
        <span>Fecha límite</span>
        <input type="date" value={vence} min={fechaLimitePorDefecto(new Date(), 0)} onChange={e => setVence(e.target.value)} />
      </label>
      <p className="mce-nota">
        La verificas tú. {marca.publicado ? '' : 'Al crearla, la marca se publica para que el responsable la vea. '}
        Queda en el historial de la obra y no se borra: si no procede, se anula con motivo.
      </p>
      <div className="mce-acciones">
        <button type="button" className="mce-btn mce-btn--prim" disabled={!listo} onClick={crear}>
          {enviando ? 'Creando…' : 'Crear observación'}</button>
        <button type="button" className="mce-btn mce-btn--sec" onClick={onCancelar} disabled={enviando}>Cancelar</button>
      </div>
    </div>
  );
}

/** Un acto con texto: corregir (comentario opcional), reabrir y anular (motivo obligatorio). */
function Acto({ titulo, ayuda, obligatorio, boton, peligro, documento, onElegirDocumento, onConfirmar, onCancelar }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const listo = (!obligatorio || texto.trim()) && (documento === undefined || documento) && !enviando;
  return (
    <div className="mce-obs-acto">
      <b>{titulo}</b>
      {ayuda && <p className="mce-nota">{ayuda}</p>}
      {documento !== undefined && (
        documento
          ? <button type="button" className="mce-cita" onClick={onElegirDocumento} title="Cambiar el documento">{documento.nombre}</button>
          : <button type="button" className="mce-btn mce-btn--sec" onClick={onElegirDocumento}>Elegir el documento corregido</button>
      )}
      <textarea value={texto} rows={2} maxLength={2000} onChange={e => setTexto(e.target.value)}
        placeholder={obligatorio ? 'Motivo (obligatorio)' : 'Comentario (opcional)'} />
      <div className="mce-acciones">
        <button type="button" className={`mce-btn ${peligro ? 'mce-btn--peligro' : 'mce-btn--prim'}`} disabled={!listo}
          onClick={async () => { setEnviando(true); try { await onConfirmar(texto.trim()); } finally { setEnviando(false); } }}>
          {boton}</button>
        <button type="button" className="mce-btn mce-btn--sec" onClick={onCancelar} disabled={enviando}>Cancelar</button>
      </div>
    </div>
  );
}

export default function ObservacionDeMarca({ API, obra, marca, esAutor, miembros = [], onCambio }) {
  const yo = idDeLaSesion();
  const resumen = marca.observacion || null;
  const [obs, setObs] = useState(resumen);
  const [creando, setCreando] = useState(false);
  const [acto, setActo] = useState(null);              // 'corregir' | 'reabrir' | 'anular'
  const [corregido, setCorregido] = useState(null);    // { id, nombre }
  const [eligiendo, setEligiendo] = useState(false);
  const [comentario, setComentario] = useState('');
  const [comentando, setComentando] = useState(false);

  // El detalle (historial y evidencia) se pide al abrir; la hoja solo trae el resumen.
  const recargar = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/observacion`);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) {
        setObs(d.observacion);
        onCambio?.({ ...marca, observacion: d.observacion });
      }
    } catch { /* se queda el resumen */ }
  }, [API, marca, onCambio]);
  const hayResumen = !!resumen;
  useEffect(() => { if (hayResumen) recargar(); }, [hayResumen]); // eslint-disable-line react-hooks/exhaustive-deps

  const hacer = async (url, cuerpo, ok) => {
    try {
      await enviar(`${API}/api/issues/${obs.id}/${url}`, cuerpo);
      if (ok) toast.success(ok);
      setActo(null); setCorregido(null);
      await recargar();
      return true;
    } catch (e) { toast.error(e.message); return false; }
  };

  const comentar = async () => {
    const t = comentario.trim();
    if (!t || comentando) return;
    setComentando(true);
    try { if (await hacer('comentar', { texto: t })) setComentario(''); }
    finally { setComentando(false); }
  };

  // ── Sin observación (o la última ya cerrada) ──
  if (!obs || creando) {
    return (
      <section className="mce-sec">
        <h3>Observación</h3>
        {creando ? (
          <NuevaObservacion API={API} marca={marca} miembros={miembros} yo={yo}
            onCancelar={() => setCreando(false)}
            onCreada={(o) => { setCreando(false); setObs(o); onCambio?.({ ...marca, observacion: o, publicado: true }); recargar(); }} />
        ) : esAutor ? (
          <>
            <p className="mce-vacio">Si lo marcado hay que corregirlo, levanta una observación: tendrá responsable, fecha
              límite e historial, y la verás cerrada cuando la verifiques.</p>
            <button type="button" className="mce-btn mce-btn--sec" onClick={() => setCreando(true)}>Crear observación</button>
          </>
        ) : <p className="mce-vacio">Sin observación. La levanta quien dibujó la marca.</p>}
      </section>
    );
  }

  const e = estadoDeObservacion(obs.estado);
  const puede = accionesDeObservacion(obs, yo);
  const comentarios = (obs.historial || []).filter(h => h.event === 'commented');
  const actos = (obs.historial || []).filter(h => h.event !== 'commented');
  const evidencia = obs.evidencia_correccion || [];

  return (
    <section className="mce-sec mce-obs">
      <h3>Observación <span>{obs.codigo}</span></h3>
      <div className="mce-obs-cab">
        <span className="mce-obs-estado" style={{ '--estado': e.color }}><i />{e.etiqueta}</span>
        {obs.vencida && <span className="mce-obs-vencida">Vencida</span>}
        <small>{aQuienLeToca(obs)}</small>
      </div>
      <p className="mce-obs-titulo">{obs.titulo}</p>
      {obs.descripcion && <p className="mce-comentario">{obs.descripcion}</p>}
      <dl className="mce-obs-datos">
        <dt>Responsable</dt><dd>{obs.responsable || '—'}</dd>
        <dt>Verifica</dt><dd>{obs.verificador || '—'}</dd>
        <dt>Fecha límite</dt><dd className={obs.vencida ? 'es-vencida' : ''}>{fechaDeDia(obs.vence_en) || '—'}</dd>
      </dl>

      {evidencia.length > 0 && (
        <div className="mce-obs-evidencia">
          <b>Documento corregido</b>
          {evidencia.map((ev, i) => (
            <div key={`${ev.id || 'ev'}-${i}`}>
              {ev.nombre
                ? <button type="button" className="mce-cita" onClick={() => abrirDocumento(ev.id)}>{ev.nombre}</button>
                : <span className="mce-cita mce-cita--tenue">{ev.id ? etiquetaDeCita(ev) : 'Sin documento'}</span>}
              {ev.comentario && <p className="mce-com__txt">{ev.comentario}</p>}
            </div>
          ))}
        </div>
      )}

      {acto === 'corregir' && (
        <Acto titulo="Declarar corregida" boton="Declarar corregida"
          ayuda={`${obs.verificador || 'Quien la levantó'} verificará la corrección con el documento que enseñes.`}
          documento={corregido} onElegirDocumento={() => setEligiendo(true)}
          onCancelar={() => { setActo(null); setCorregido(null); }}
          onConfirmar={(t) => hacer('corregir', {
            evidencia: [{ tipo: 'documento', documento: corregido.id, nombre: corregido.nombre }], comentario: t,
          }, 'Declarada corregida: pasa a verificación')} />
      )}
      {acto === 'reabrir' && (
        <Acto titulo="Rechazar la corrección" obligatorio boton="Reabrir" peligro
          ayuda="Vuelve al responsable con el motivo, para que sepa qué rehacer."
          onCancelar={() => setActo(null)}
          onConfirmar={(t) => hacer('verificar', { acepta: false, motivo: t }, 'Reabierta: vuelve al responsable')} />
      )}
      {acto === 'anular' && (
        <Acto titulo="Anular la observación" obligatorio boton="Anular" peligro
          ayuda="Para lo que se levantó por error. Queda en el historial con el motivo."
          onCancelar={() => setActo(null)}
          onConfirmar={(t) => hacer('anular', { motivo: t }, 'Observación anulada')} />
      )}

      {!acto && (puede.corregir || puede.verificar || puede.anular) && (
        <div className="mce-acciones">
          {puede.corregir && <button type="button" className="mce-btn mce-btn--prim" onClick={() => setActo('corregir')}>Declarar corregida</button>}
          {puede.verificar && <button type="button" className="mce-btn mce-btn--prim"
            onClick={() => hacer('verificar', { acepta: true }, 'Verificada y cerrada')}>Verificar y cerrar</button>}
          {puede.verificar && <button type="button" className="mce-btn mce-btn--sec" onClick={() => setActo('reabrir')}>Reabrir</button>}
          {puede.anular && <button type="button" className="mce-btn mce-btn--peligro" onClick={() => setActo('anular')}>Anular</button>}
        </div>
      )}
      {!observacionViva(obs) && esAutor && !acto && (
        <div className="mce-acciones">
          <button type="button" className="mce-btn mce-btn--sec" onClick={() => setCreando(true)}>Crear otra observación</button>
        </div>
      )}

      <div className="mce-obs-hilo">
        <b>Comentarios {comentarios.length ? <span>{comentarios.length}</span> : null}</b>
        {comentarios.length ? (
          <ul className="mce-coms">
            {comentarios.map((c, i) => (
              <li key={`${c.at}-${i}`} className="mce-com">
                <div className="mce-com__cab"><b>{nombreDe(c.by, miembros)}</b><small>{fechaCorta(c.at)}</small></div>
                <p className="mce-com__txt">{c.texto}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mce-vacio">Sin comentarios.</p>}
        <div className="mce-com-form">
          <textarea value={comentario} onChange={ev => setComentario(ev.target.value)} rows={2} maxLength={2000}
            placeholder="Escribe un comentario…"
            onKeyDown={ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); comentar(); } }} />
          <div className="mce-com-form__pie">
            <button type="button" className="mce-btn mce-btn--prim" disabled={!comentario.trim() || comentando} onClick={comentar}>
              Comentar</button>
          </div>
        </div>
        <p className="mce-nota">Los comentarios quedan en el expediente: no se editan ni se borran.</p>
      </div>

      {actos.length > 0 && (
        <details className="mce-obs-historial">
          <summary>Historial <span>{actos.length}</span></summary>
          <ol>
            {actos.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <span>{textoDelEvento(h)}</span>
                <small>{[nombreDe(h.by, miembros), fechaCorta(h.at)].filter(Boolean).join(' · ')}</small>
                {h.motivo && <p className="mce-com__txt">{h.motivo}</p>}
                {h.comentario && <p className="mce-com__txt">{h.comentario}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {eligiendo && createPortal(
        <SelectorDeDocumento API={API} project={{ id: obra, model_urn: obra }}
          titulo="El documento corregido"
          ayuda="Elige el plano o documento donde se levantó la observación. Quien verifica lo abrirá desde aquí."
          onElegir={(doc) => { setEligiendo(false); setCorregido({ id: doc.file_node_id, nombre: doc.nombre }); }}
          onCerrar={() => setEligiendo(false)} />,
        document.fullscreenElement || document.body,
      )}
    </section>
  );
}
