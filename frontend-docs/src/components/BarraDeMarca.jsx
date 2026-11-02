/**
 * BarraDeMarca — el menú de una marca elegida en el lector (2-nov-2026), como en ACC: junto a la marca, sin panel.
 *
 * Al elegir una nube, un rectángulo, una flecha, un texto, un trazo, una medición o un sello aparece encima de ella
 * (debajo si no cabe) un menú pequeño:
 *   Estilo       color de trazo, relleno, grosor y, en la nube, el tamaño de los festones (el «Estilo» de ACC)
 *   Texto        en las marcas de texto
 *   Sello        editar el sello (su diálogo)
 *   Referencia   los documentos que cita, con su número; añadir (como el menú «Referencia» de ACC)
 *   Observación  la suya, si la tiene (abre el panel de la incidencia) o crearla
 *   Llevar a la vigente · Duplicar · Publicar o retirar · Suprimir
 * Solo la FOTO tiene panel propio (como «Referencias a fotos» de ACC), y la INCIDENCIA el suyo.
 *
 * Lo que la marca puede cambiar lo decide el servidor (routes/pdf_tools.py `editar_markup`): la figura —estilo y
 * texto— solo en un borrador tuyo sin observación abierta; referencias y publicar, su autor.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { abrirDocumento } from '../utils/enlaceDeMarcas';
import { confirmAction } from '../utils/confirm';
import { estadoDeObservacion, etiquetaDeCita, fechaCorta, observacionViva, textoDeCitas, TOPE_CITAS } from '../utils/marcasConEnlace';
import SelectorDeDocumento from './SelectorDeDocumento';
import IncidenciaLateral from './IncidenciaLateral';
import { destinoDelLector } from './ObservacionesDelPlano';
import { DialogoDeSello } from './MarcaConEnlace';
import { AISLADO } from '../../../design/incidencias/PanelDeIncidencia.jsx';
import './BarraDeMarca.css';

const NOMBRE = {
  sello: 'Sello', cloud: 'Nube', arrow: 'Flecha', text: 'Texto', measure: 'Medición', area: 'Área', count: 'Conteo',
  rect: 'Rectángulo', pen: 'Trazo',
};
const GROSORES = [['fino', 'Fino'], ['medio', 'Medio'], ['grueso', 'Grueso']];
const FESTONES = [['pequenos', 'Pequeños'], ['medianos', 'Medianos'], ['grandes', 'Grandes']];
const CON_RELLENO = ['cloud', 'rect'];
const CON_GROSOR = ['cloud', 'rect', 'arrow', 'pen'];

const Ico = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoTexto = () => <Ico><path d="M5 6h14M12 6v13" /></Ico>;
const IcoRef = () => <Ico><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Ico>;
const IcoIssue = () => <Ico><path d="M5 4h14v12H9l-4 4z" /><path d="M12 8v3" /><path d="M12 13.5v.01" /></Ico>;
const IcoDuplicar = () => <Ico><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></Ico>;
const IcoPublicar = () => <Ico><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></Ico>;
const IcoRetirar = () => <Ico><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></Ico>;
const IcoVigente = () => <Ico><path d="M4 12h12" /><path d="M12 6l6 6-6 6" /><path d="M20 4v16" /></Ico>;
const IcoBorrar = () => <Ico><path d="M5 7h14" /><path d="M10 7V5h4v2" /><path d="M7 7l1 12h8l1-12" /></Ico>;
const IcoSello = () => <Ico><path d="M9.5 4h5l-1 6h-3z" /><path d="M5 13h14v3.5H5z" /><path d="M6 20h12" /></Ico>;

function Boton({ etiqueta, activo, onClick, disabled, peligro, children, conTexto }) {
  return (
    <button type="button" className={`bdm-btn${peligro ? ' bdm-btn--peligro' : ''}${conTexto ? ' bdm-btn--texto' : ''}`}
      aria-label={etiqueta} data-tip={etiqueta} aria-pressed={activo || undefined} aria-expanded={activo ?? undefined}
      onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function BarraDeMarca({ API, obra, marca, esAutor, editable, colores = [], posicion, versionVigente = null,
                                       revisionSugerida = '',
                                       onLlevar = null, onDuplicar, onCambio, onPublicar, onBorrar, onCerrar }) {
  const [abierto, setAbierto] = useState(null);         // 'estilo' | 'texto' | 'referencias'
  const [texto, setTexto] = useState(marca.text || '');
  const [eligiendo, setEligiendo] = useState(false);
  const [sello, setSello] = useState(false);
  const [lateral, setLateral] = useState(null);         // 'nueva' | id de la observación
  const [triangulo, setTriangulo] = useState(marca.style?.triangulo || revisionSugerida || '');
  const raiz = useRef(null);
  const citas = marca.citas || [];
  const obs = marca.observacion || null;
  const viva = observacionViva(obs);
  const estilo = marca.style || {};

  // Esc cierra el menú desplegado (y, sin nada desplegado, deja la marca).
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key !== 'Escape' || lateral || eligiendo || sello) return;
      if (abierto) setAbierto(null); else onCerrar?.();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto, lateral, eligiendo, sello, onCerrar]);

  const cambiar = useCallback(async (cuerpo, ok) => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo guardar.');
      onCambio({ ...marca, ...d.markup });
      if (ok) toast.success(ok);
      return true;
    } catch (e) { toast.error(e.message); return false; }
  }, [API, marca, onCambio]);

  const releerObservacion = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/observacion`);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) onCambio({ ...marca, observacion: d.observacion });
    } catch { /* se queda la que había */ }
  }, [API, marca, onCambio]);

  const crearDesdeLaMarca = async (cuerpo) => {
    const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}/observacion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo crear.');
    if (d.publicado) onCambio({ ...marca, publicado: true });
    return d.observacion;
  };

  const suprimir = async () => {
    const ok = await confirmAction({
      title: `¿Suprimir esta ${(NOMBRE[marca.kind] || 'marca').toLowerCase()}?`,
      message: 'Se borra la marca del plano. Los documentos que cita no cambian.', confirmText: 'Suprimir', danger: true,
    });
    if (ok) onBorrar();
  };

  const alternar = (que) => setAbierto(a => (a === que ? null : que));
  const est = obs ? estadoDeObservacion(obs.estado) : null;
  const motivoFijo = viva ? 'Tiene una observación abierta: queda fija mientras el responsable la corrige.'
    : marca.publicado ? 'Publicada: retírala de la obra para cambiarla.' : null;

  return (
    <div ref={raiz} className="bdm" style={posicion} role="toolbar" aria-label={`${NOMBRE[marca.kind] || 'Marca'} elegida`}
      {...AISLADO}>
      <div className="bdm-barra">
        <span className="bdm-info" data-tip={[marca.version_number ? `V${marca.version_number}` : '', marca.created_by,
          fechaCorta(marca.created_at), marca.publicado ? 'Publicada' : 'Borrador'].filter(Boolean).join(' · ')}>
          {NOMBRE[marca.kind] || 'Marca'}
        </span>

        {esAutor && marca.kind !== 'sello' && (
          <Boton etiqueta={editable ? 'Estilo' : motivoFijo || 'Estilo'} activo={abierto === 'estilo'} disabled={!editable}
            onClick={() => alternar('estilo')}>
            <i className="bdm-muestra" style={{ background: estilo.color || '#d97757' }} />
          </Boton>
        )}
        {esAutor && marca.kind === 'text' && (
          <Boton etiqueta={editable ? 'Editar texto' : motivoFijo || 'Editar texto'} activo={abierto === 'texto'} disabled={!editable}
            onClick={() => { setTexto(marca.text || ''); alternar('texto'); }}><IcoTexto /></Boton>
        )}
        {esAutor && marca.kind === 'sello' && (
          <Boton etiqueta="Editar el sello" onClick={() => setSello(true)}><IcoSello /></Boton>
        )}

        <Boton etiqueta={citas.length ? `Referencias (${citas.length})` : 'Referencia'} activo={abierto === 'referencias'}
          onClick={() => alternar('referencias')} conTexto={citas.length > 0}>
          <IcoRef />{citas.length > 0 && <b>{citas.length}</b>}
        </Boton>

        {obs ? (
          <button type="button" className="bdm-obs" style={{ '--estado': est.color }} data-tip={obs.titulo}
            onClick={() => setLateral(String(obs.id))}>
            <i />{obs.codigo} · {obs.vencida ? 'Vencida' : est.etiqueta}
          </button>
        ) : esAutor && (
          <Boton etiqueta="Crear observación" onClick={() => setLateral('nueva')}><IcoIssue /></Boton>
        )}

        <span className="bdm-sep" />
        {onLlevar && <Boton etiqueta={`Llevar a la vigente${versionVigente ? ` (V${versionVigente})` : ''}`} onClick={onLlevar}><IcoVigente /></Boton>}
        {marca.kind !== 'sello' && <Boton etiqueta="Duplicar" onClick={onDuplicar}><IcoDuplicar /></Boton>}
        {esAutor && (
          <Boton etiqueta={marca.publicado ? 'Retirar de la obra' : 'Publicar'} onClick={onPublicar}
            disabled={marca.publicado && viva}>
            {marca.publicado ? <IcoRetirar /> : <IcoPublicar />}
          </Boton>
        )}
        {esAutor && (
          <Boton etiqueta={viva ? 'Tiene una observación abierta: anúlala o ciérrala antes' : 'Suprimir'} peligro
            disabled={viva} onClick={suprimir}><IcoBorrar /></Boton>
        )}
      </div>

      {abierto === 'estilo' && (
        <div className="bdm-menu" role="dialog" aria-label="Estilo">
          <span className="bdm-rotulo">Trazo</span>
          <div className="bdm-colores" role="radiogroup" aria-label="Color de trazo">
            {colores.map(c => (
              <button key={c} type="button" role="radio" aria-checked={(estilo.color || '').toLowerCase() === c}
                aria-label={`Trazo ${c}`} style={{ background: c }} onClick={() => cambiar({ color: c })} />
            ))}
          </div>
          {CON_RELLENO.includes(marca.kind) && (
            <>
              <span className="bdm-rotulo">Relleno</span>
              <div className="bdm-colores" role="radiogroup" aria-label="Color de relleno">
                <button type="button" role="radio" aria-checked={!estilo.relleno} aria-label="Sin relleno"
                  className="bdm-sin" onClick={() => cambiar({ estilo: { relleno: null } })} />
                {colores.map(c => (
                  <button key={c} type="button" role="radio" aria-checked={(estilo.relleno || '').toLowerCase() === c}
                    aria-label={`Relleno ${c}`} style={{ background: c, opacity: 0.45 }} onClick={() => cambiar({ estilo: { relleno: c } })} />
                ))}
              </div>
            </>
          )}
          {CON_GROSOR.includes(marca.kind) && (
            <>
              <span className="bdm-rotulo">Grosor</span>
              <div className="bdm-opciones" role="radiogroup" aria-label="Grosor">
                {GROSORES.map(([v, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={(estilo.grosor || 'medio') === v}
                    onClick={() => cambiar({ estilo: { grosor: v } })}>{t}</button>
                ))}
              </div>
            </>
          )}
          {marca.kind === 'cloud' && (
            <>
              <span className="bdm-rotulo">Festones</span>
              <div className="bdm-opciones" role="radiogroup" aria-label="Festones">
                {FESTONES.map(([v, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={(estilo.festones || 'medianos') === v}
                    onClick={() => cambiar({ estilo: { festones: v } })}>{t}</button>
                ))}
              </div>
            </>
          )}
          {marca.kind === 'cloud' && (
            <>
              <span className="bdm-rotulo">Triángulo de revisión</span>
              <div className="bdm-triangulo">
                <input value={triangulo} maxLength={8} placeholder="C02" aria-label="Código de la revisión"
                  onChange={e => setTriangulo(e.target.value.toUpperCase())} />
                <button type="button" className="bdm-accion bdm-accion--prim" disabled={!triangulo.trim()}
                  onClick={() => cambiar({ estilo: { triangulo: triangulo.trim() } })}>
                  {estilo.triangulo ? 'Cambiar' : 'Poner'}</button>
                {estilo.triangulo && (
                  <button type="button" className="bdm-accion" onClick={() => cambiar({ estilo: { triangulo: null } })}>Quitar</button>
                )}
              </div>
            </>
          )}
          <span className="bdm-nota">Arrástrala para moverla{['cloud', 'rect', 'arrow', 'measure', 'area'].includes(marca.kind) ? '; los cuadrados cambian su forma' : ''}.</span>
        </div>
      )}

      {abierto === 'texto' && (
        <div className="bdm-menu" role="dialog" aria-label="Editar texto">
          <textarea value={texto} maxLength={500} rows={3} autoFocus onChange={e => setTexto(e.target.value)} />
          <div className="bdm-acciones">
            <button type="button" className="bdm-accion bdm-accion--prim" disabled={!texto.trim()}
              onClick={async () => { if (await cambiar({ texto }, 'Texto cambiado')) setAbierto(null); }}>Guardar</button>
            <button type="button" className="bdm-accion" onClick={() => setAbierto(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {abierto === 'referencias' && (
        <div className="bdm-menu bdm-menu--ancho" role="dialog" aria-label="Referencias">
          {citas.length ? (
            <ul className="bdm-citas">
              {citas.map(c => (
                <li key={c.id}>
                  {c.nombre
                    ? <button type="button" className="bdm-cita" onClick={() => abrirDocumento(c.id)} title="Abrir en otra pestaña">{c.nombre}</button>
                    : <span className="bdm-cita bdm-cita--tenue">{etiquetaDeCita(c)}</span>}
                  {esAutor && (
                    <button type="button" className="bdm-quitar" aria-label="Quitar la referencia"
                      onClick={() => cambiar({ citas: citas.map(x => x.id).filter(x => x !== c.id) })}>×</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <span className="bdm-nota">{textoDeCitas(0)}. Enlaza un informe, una especificación o un plano relacionado.</span>}
          {esAutor && citas.length < TOPE_CITAS && (
            <div className="bdm-acciones">
              <button type="button" className="bdm-accion bdm-accion--prim" onClick={() => setEligiendo(true)}>+ Añadir referencia</button>
            </div>
          )}
        </div>
      )}

      {eligiendo && createPortal(
        <SelectorDeDocumento API={API} project={{ id: obra, model_urn: obra }} titulo="Añadir una referencia"
          ayuda="Elige el documento que esta marca cita. No se copia ni se mueve, y quien no pueda abrirlo no verá su nombre."
          onElegir={async (doc) => {
            setEligiendo(false);
            if (citas.some(c => c.id === doc.file_node_id)) { toast('Ese documento ya está citado.'); return; }
            await cambiar({ citas: [...citas.map(c => c.id), doc.file_node_id] }, 'Referencia añadida');
          }}
          onCerrar={() => setEligiendo(false)} />,
        document.fullscreenElement || document.body,
      )}
      {sello && (
        <DialogoDeSello inicial={estilo.sello} autor={marca.created_by} editar
          onAceptar={async (s) => { if (await cambiar({ sello: s }, 'Sello actualizado')) setSello(false); }}
          onCerrar={() => setSello(false)} />
      )}
      {lateral && (
        <IncidenciaLateral API={API} obra={obra} contenedor={destinoDelLector()} onVolver={() => setLateral(null)}
          issueId={lateral === 'nueva' ? null : lateral}
          nueva={lateral === 'nueva' ? { tipo: 'OBSERVACION', lugar: `Desde una marca · pág. ${marca.page}` } : null}
          titulo="Nueva observación de la marca" crear={crearDesdeLaMarca}
          onCreada={releerObservacion} onCambio={releerObservacion} onCerrar={() => setLateral(null)} />
      )}
    </div>
  );
}
