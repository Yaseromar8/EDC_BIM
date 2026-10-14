/**
 * PanelConsulta — el vistazo a UN documento, a la derecha de la tabla de Archivos.
 *
 * Paso 1 de docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md (maqueta v8,
 * docs/ux/maquetas/consulta_documento_v8.html). Se abre con un clic en la fila
 * de un documento, fuera del nombre y de la casilla: el nombre sigue abriendo
 * el documento y la casilla sigue seleccionando. Es SOLO LECTURA.
 *
 * Todo sale de `/api/docs/trazabilidad`, que va por el ID del documento (el
 * historial sobrevive a un cambio de nombre). Lo que el servidor no devuelva
 * no se pinta: con un backend anterior al 14-oct-2026 faltan la huella y la
 * cadena, y entonces esas secciones no aparecen en vez de inventarse.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { Ficha } from '../utils/estadosECD';
import IconoModulo from './IconoModulo';
import { piezasDelCodigo, PIEZAS, ETIQUETAS_DE_PIEZA } from '../utils/codigoDelNombre';
import { RECORRIDO, CON_HORA, CORTA, fecha, queOcurrio, fechasDelRecorrido } from '../utils/fichaDocumento';
import './PanelConsulta.css';

export default function PanelConsulta({ item, onCerrar, onAbrir, onVersiones, onFicha }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDatos(null); setError(null);
    apiFetch(`${API}/api/docs/trazabilidad?id=${encodeURIComponent(item.id)}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok || !j.success) setError(j.error || 'No se pudo leer la trazabilidad.');
        else setDatos(j);
      })
      .catch(() => vivo && setError('Sin conexión con el servidor.'));
    return () => { vivo = false; };
  }, [item.id]);

  const estado = String(item.status || 'WIP').toUpperCase();
  const paso = Math.max(0, RECORRIDO.findIndex(([k]) => k === estado));
  const fechas = datos ? fechasDelRecorrido(datos) : {};
  const piezas = piezasDelCodigo(item.name);
  const vigente = datos && datos.versiones && datos.versiones[0];
  const cadena = datos && datos.cadena;

  const copiar = (texto) => {
    try { navigator.clipboard.writeText(texto); toast.success('Huella copiada'); }
    catch { toast.error('No se pudo copiar'); }
  };

  return (
    <aside className="consulta" aria-label={`Consulta de ${item.name}`}>
      <div className="consulta__cab">
        <div className="consulta__titulo">
          <b title={item.name}>{item.name}</b>
          <span>V{item.version || 1}{item.codigo_revision ? ` · ${item.codigo_revision}` : ''}</span>
        </div>
        <button type="button" className="consulta__cerrar" onClick={onCerrar} aria-label="Cerrar el panel" title="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="consulta__acciones">
        <button type="button" className="barra-btn barra-btn--primario" onClick={() => onAbrir(item)}>Abrir</button>
        <button type="button" className="barra-btn barra-btn--contorno" onClick={(e) => onVersiones(item, e)}>
          <IconoModulo nombre="version" tamano={16} />Versiones
        </button>
        {onFicha && (
          <button type="button" className="barra-btn barra-btn--contorno" onClick={() => onFicha(item)}>Ficha completa</button>
        )}
        <span className="consulta__estado"><Ficha estado={estado} tamano="pequena" /></span>
      </div>

      <section className="consulta__sec">
        <h3>Recorrido ISO 19650</h3>
        <div className="recorrido" style={{ '--avance': `${paso * 25}%` }}>
          {RECORRIDO.map(([k, n], i) => (
            <div key={k} className={i < paso ? 'hecho' : i === paso ? 'aqui' : ''}>
              <i /><b>{n}</b><small>{i <= paso && fechas[k] ? fecha(fechas[k], CORTA) : '—'}</small>
            </div>
          ))}
        </div>
        {item.codigo_idoneidad && <p className="consulta__nota">Idoneidad: <b>{item.codigo_idoneidad}</b></p>}
      </section>

      {error && <p className="consulta__error">{error}</p>}
      {!datos && !error && <p className="consulta__nota">Leyendo la trazabilidad…</p>}

      {vigente && 'huella' in vigente && (
        <section className="consulta__sec">
          <h3>Integridad</h3>
          {vigente.huella ? (
            <div className="integridad integridad--ok">
              <IconoModulo nombre="triaje" tamano={18} />
              <div>
                <b>Huella de la V{vigente.version}</b>
                <span>SHA-256 <code>{vigente.huella.slice(0, 12)}…</code>{' '}
                  <button type="button" className="consulta__enlace" onClick={() => copiar(vigente.huella)}>copiar</button></span>
              </div>
            </div>
          ) : (
            <div className="integridad">
              <IconoModulo nombre="triaje" tamano={18} />
              <div>
                <b>La V{vigente.version} aún no tiene huella</b>
                <span>{datos.huellas_en_curso ? 'Se está calculando ahora.' : 'Es anterior al control de huellas o no tiene archivo en el almacén.'}</span>
              </div>
            </div>
          )}
          {cadena && cadena.eventos > 0 && (
            <p className="consulta__nota">
              {cadena.sellados} de {cadena.eventos} eventos sellados en el registro
              {cadena.roturas && cadena.roturas.length > 0
                ? ` · ${cadena.roturas.length} sin sello o alterados`
                : cadena.sellados === cadena.eventos && cadena.tramo_integro ? ' · sin alteraciones' : ''}.
              {' '}<span title="Cada evento lleva la huella del anterior: si alguien altera o borra uno, se nota. Detecta cambios; no impide que se hagan.">ⓘ</span>
            </p>
          )}
        </section>
      )}

      {piezas && (
        <section className="consulta__sec">
          <h3>Código del documento</h3>
          <div className="codigo-leido">
            {PIEZAS.map(k => <div key={k}><b>{piezas[k]}</b><small>{ETIQUETAS_DE_PIEZA[k]}</small></div>)}
          </div>
        </section>
      )}

      {datos && (datos.eventos || []).length > 0 && (
        <section className="consulta__sec">
          <h3>Últimos movimientos</h3>
          <ol className="movimientos">
            {datos.eventos.slice(0, 6).map((ev, i) => (
              <li key={i}>
                <span className="movimientos__que">{queOcurrio(ev)}</span>
                <span className="movimientos__quien">{ev.por}{ev.cuando ? ` · ${fecha(ev.cuando, CON_HORA)}` : ''}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}
