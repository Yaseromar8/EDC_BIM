/**
 * DecisionEnLector — decidir la revisión sin salir del plano (C2, diseño A).
 *
 * Si quien mira el plano tiene que decidir una revisión que lo incluye, el lector
 * enseña un aviso discreto; al pulsarlo se abre un panel con las decisiones como
 * TARJETAS: un código de idoneidad con su consecuencia escrita, o «No apto». No
 * hay botón verde: aprobar es asignar un código.
 *
 * El camino es EL MISMO que la pantalla de Revisiones (`POST /api/reviews/<id>/act`,
 * con la misma confirmación y los mismos mensajes de error), y la decisión vale
 * para la REVISIÓN ENTERA: el panel lo dice. La lógica está en
 * utils/decisionEnLector.js; la autoridad, en el servidor.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { confirmAction } from '../utils/confirm';
import { exitoDe, mensajeDeError } from '../utils/revisiones';
import {
  opcionesDeDecision, resumenDeRevision, faltaParaConfirmar, cuerpoDeLaDecision,
} from '../utils/decisionEnLector';
import useDecisionEnLector from '../hooks/useDecisionEnLector';
import Button from '../../../design/ui/Button';
import './DecisionEnLector.css';

// «A1 Apto para construir»; las de conformidad o «No apto» van sin código delante.
const etiqueta = o => (o && /^[A-Z]{1,2}\d/.test(o.codigo || '') ? `${o.codigo} ${o.titulo}` : (o ? o.titulo : ''));

// «16 oct.»: la fecha del plazo, sin hora ni segundos (como la portada).
const corta = iso => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', timeZone: 'America/Lima' });
};

async function cuerpoDe(r) {
  try { return await r.json(); } catch { return null; }
}

export default function DecisionEnLector({ API, projectPrefix, nodeId, activo = true, onDecidido }) {
  const { rev, catalogo, recargar } = useDecisionEnLector({ API, projectPrefix, nodeId, activo });
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState('');
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const opciones = useMemo(() => (rev ? opcionesDeDecision(rev, catalogo) : []), [rev, catalogo]);
  const opcion = opciones.find(o => o.clave === elegida) || null;

  // Otro documento u otra revisión: se empieza de cero.
  const claveRev = rev ? `${rev.id}:${rev.current_step}` : '';
  useEffect(() => {
    queueMicrotask(() => { setElegida(''); setComentario(''); });
  }, [claveRev]);

  if (!rev || !opciones.length) return null;
  const resumen = resumenDeRevision(rev);
  const falta = faltaParaConfirmar(rev, opcion, catalogo);

  const confirmar = async () => {
    if (!opcion || enviando || falta) return;
    const nota = comentario.trim();
    const ok = await confirmAction({
      title: `${etiqueta(opcion)} · ${resumen.codigo}`,
      message: opcion.consecuencia + (nota ? ` Comentario: «${nota}».` : ''),
      confirmText: opcion.rechazo ? 'Rechazar' : 'Confirmar',
      danger: Boolean(opcion.rechazo),
    });
    if (!ok || !vivo.current) return;
    setEnviando(true);
    try {
      const r = await apiFetch(`${API}/api/reviews/${rev.id}/act`, {
        method: 'POST',
        body: JSON.stringify(cuerpoDeLaDecision(opcion, nota)),
      });
      const d = await cuerpoDe(r);
      if (!r.ok || !d?.success) {
        const m = mensajeDeError(r.status, d);
        toast.error(m.texto);
        if (m.recargar) recargar();
        return;
      }
      toast.success(exitoDe(opcion.accion, rev.acciones?.aprobar?.tipo));
      setAbierto(false);
      recargar();
      onDecidido?.(rev);
    } catch {
      toast.error(mensajeDeError(0, null).texto);
    } finally {
      if (vivo.current) setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <div className="decision-aviso" role="status">
        <span className="decision-aviso__texto">
          <b>{resumen.codigo}</b> · te toca decidir
          {resumen.vence && <> · vence {corta(resumen.vence)}</>}
        </span>
        <Button rango="primary" tamano="sm" onClick={() => setAbierto(true)}>Decidir</Button>
      </div>
    );
  }

  return (
    <aside className="decision-panel" aria-label={`Decidir ${resumen.codigo}`}>
      <header className="decision-panel__cab">
        <div>
          <div className="decision-panel__codigo">{resumen.codigo}{resumen.paso && ` · ${resumen.paso}`}</div>
          <div className="decision-panel__titulo" title={resumen.titulo}>{resumen.titulo}</div>
          {resumen.vence && <div className="decision-panel__vence">Vence {corta(resumen.vence)}</div>}
        </div>
        <button type="button" className="decision-panel__cerrar" aria-label="Cerrar" onClick={() => setAbierto(false)}>✕</button>
      </header>

      <p className="decision-panel__alcance">{resumen.alcance}</p>

      <div className="decision-panel__pregunta">¿Para qué queda apto?</div>
      <div className="decision-opciones" role="radiogroup">
        {opciones.map(o => (
          <button key={o.clave} type="button" role="radio" aria-checked={elegida === o.clave}
            className={`decision-opcion${elegida === o.clave ? ' decision-opcion--elegida' : ''}${o.rechazo ? ' decision-opcion--no' : ''}`}
            onClick={() => setElegida(o.clave)}>
            <span className="decision-opcion__codigo">{o.codigo || '·'}</span>
            <span className="decision-opcion__cuerpo">
              <span className="decision-opcion__titulo">{o.titulo}</span>
              <span className="decision-opcion__consecuencia">{o.breve}</span>
            </span>
          </button>
        ))}
      </div>

      {opcion && <p className="decision-panel__consecuencia" aria-live="polite">{opcion.consecuencia}</p>}

      <label className="decision-panel__etiqueta" htmlFor="decision-comentario">Comentario</label>
      <textarea id="decision-comentario" className="decision-panel__comentario" rows={3}
        value={comentario} onChange={e => setComentario(e.target.value)}
        placeholder="Opcional. Queda en el historial de la revisión." />

      {opcion && falta && <p className="decision-panel__falta" role="alert">{falta}</p>}

      <footer className="decision-panel__pie">
        <Button rango="ghost" tamano="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
        <Button rango="primary" tamano="sm" disabled={!opcion || Boolean(falta) || enviando}
          cargando={enviando} onClick={confirmar}>
          {opcion ? `Confirmar · ${etiqueta(opcion)}` : 'Elige una decisión'}
        </Button>
      </footer>
    </aside>
  );
}
