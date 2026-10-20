/**
 * MarcaConEnlace — FOTO en el plano, REFERENCIAS desde una marca, «CITADO EN» y SELLO (16-oct-2026).
 *
 * Lo estudiado en ACC y lo que hacemos distinto: docs/ux/ACC_LECTOR_MARCAS_FOTO_REFERENCIA.md.
 *   · La foto es un DOCUMENTO de la obra (se sube a MULTIMEDIA/) y la marca la cita: versión, permisos y
 *     auditoría como todo lo demás, y la misma foto puede estar en varios planos.
 *   · Una marca cita documentos; el documento citado dice «Citado en» (ACC no tiene ese sentido).
 *   · El sello es una NOTA sobre la hoja: no cambia el estado del documento. La aprobación va por Revisiones.
 *   · Una cita no concede acceso: lo que no puedes abrir sale «sin acceso», sin nombre (lo filtra el servidor).
 *   · La marca DIBUJA; lo que hay que corregir es una OBSERVACIÓN con responsable, plazo e historial
 *     (ObservacionDeMarca, 20-oct-2026). La marca ya no lleva estado libre, asignados ni comentarios.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiFetch';
import { abrirDocumento, subirFoto } from '../utils/enlaceDeMarcas';
import { confirmAction } from '../utils/confirm';
import SelectorDeDocumento from './SelectorDeDocumento';
import {
  ESTADOS_DE_SELLO, estadoDeSello,
  CARPETA_DE_FOTOS, TOPE_FOTOS, TOPE_CITAS, esFoto,
  textoDeCitas, citasPorPlano, etiquetaDeCita, siguienteAngulo, fechaCorta, observacionViva,
} from '../utils/marcasConEnlace';
import ObservacionDeMarca, { EtiquetaDeObservacion } from './ObservacionDeMarca';
import './MarcaConEnlace.css';

const NOMBRE_DE_TIPO = {
  foto: 'Foto', sello: 'Sello', cloud: 'Nube', arrow: 'Flecha', text: 'Texto', measure: 'Medición',
  area: 'Área', count: 'Conteo', rect: 'Rectángulo', pen: 'Trazo',
};

// ── Iconos (trazo 1.6, como el estuche) ──────────────────────────────────────
const Ico = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IconoFoto = (p) => <Ico {...p}><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></Ico>;
const IconoSello = (p) => <Ico {...p}><path d="M9.5 4h5l-1 6h-3z" /><path d="M5 13h14v3.5H5z" /><path d="M6 20h12" /></Ico>;
const IconoEnlace = (p) => <Ico {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Ico>;
const IcoDoc = (p) => <Ico {...p}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></Ico>;
const IcoAbrir = (p) => <Ico {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v6H4V6h6" /></Ico>;
const IcoQuitar = (p) => <Ico {...p}><path d="M6 6l12 12M18 6 6 18" /></Ico>;
const IcoGiro = ({ izq, ...p }) => <Ico {...p}>{izq
  ? <><path d="M4 9a8 8 0 1 1 1.5 7" /><path d="M4 4v5h5" /></>
  : <><path d="M20 9a8 8 0 1 0-1.5 7" /><path d="M20 4v5h-5" /></>}</Ico>;

// Las imágenes se piden con la sesión (apiFetch) y se muestran como blob: una <img> no manda la cabecera, y
// poner el token en la dirección es el defecto que ya se corrigió en otros sitios.
function useImagen(API, id, variante = 'thumb') {
  const [url, setUrl] = useState(null);
  const [fallo, setFallo] = useState(false);
  // SIN DIBUJAR EN LA PETICIÓN (regla del 14-oct-2026: 3 caídas por memoria con 6 usuarios). Nunca `gen=1`:
  //  · la miniatura de 420 px la prepara la cola de UN hilo al subir; recién subida puede no existir aún,
  //    así que se reintenta unas veces con pausa en vez de pedir que el servidor la dibuje;
  //  · la de 1.600 px no se prepara al subir: si no existe, el visor enseña la de 420 px.
  useEffect(() => {
    if (!id) return undefined;
    let vivo = true;
    let creada = null;
    let espera = null;
    const pedir = (q) => apiFetch(`${API}/api/docs/proxy?id=${encodeURIComponent(id)}${q}`)
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
    const poner = (b) => { if (!vivo) return; creada = URL.createObjectURL(b); setUrl(creada); };
    const miniatura = (intento) => pedir('&thumb=1').then(poner).catch(() => {
      if (!vivo) return;
      if (intento < 3) espera = setTimeout(() => miniatura(intento + 1), 4000 * (intento + 1));
      else setFallo(true);
    });
    if (variante === 'thumb') miniatura(0);
    else pedir('&size=display').then(poner).catch(() => { if (vivo) miniatura(0); });
    return () => { vivo = false; clearTimeout(espera); if (creada) URL.revokeObjectURL(creada); };
  }, [API, id, variante]);
  return { url, fallo };
}

function MiniaturaDeFoto({ API, foto, onAbrir, onQuitar }) {
  const accesible = foto && !foto.restringido && !foto.eliminado;
  const { url, fallo } = useImagen(API, accesible ? foto.id : null, 'thumb');
  return (
    <div className="mce-mini">
      <button type="button" className="mce-mini__img" onClick={accesible ? onAbrir : undefined}
        disabled={!accesible} title={etiquetaDeCita(foto)}>
        {url ? <img src={url} alt={foto.nombre || 'Foto'} />
          : <span className="mce-mini__vacio">{accesible ? (fallo ? 'Sin vista previa' : '') : etiquetaDeCita(foto)}</span>}
      </button>
      {onQuitar && (
        <button type="button" className="mce-mini__quitar" onClick={onQuitar} aria-label="Quitar esta foto de la marca"
          title="Quitar de la marca (la foto sigue en la obra)"><IcoQuitar size={12} /></button>
      )}
    </div>
  );
}

function VisorDeFoto({ API, fotos, indice, onCerrar }) {
  const [i, setI] = useState(indice);
  const foto = fotos[i];
  const { url, fallo } = useImagen(API, foto?.id, 'display');
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight') setI(x => Math.min(fotos.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fotos.length, onCerrar]);
  if (!foto) return null;
  return createPortal(
    <div className="mce-visor" role="dialog" aria-label="Foto" onClick={onCerrar}>
      <div className="mce-visor__marco" onClick={e => e.stopPropagation()}>
        <header className="mce-visor__cab">
          <span className="mce-visor__nombre">{foto.nombre}</span>
          <span className="mce-visor__n">{i + 1} de {fotos.length}</span>
          <button type="button" className="mce-btn mce-btn--sec" onClick={() => abrirDocumento(foto.id)}>
            <IcoAbrir size={14} /> Abrir el documento</button>
          <button type="button" className="mce-icono" onClick={onCerrar} aria-label="Cerrar"><IcoQuitar /></button>
        </header>
        <div className="mce-visor__img">
          {url ? <img src={url} alt={foto.nombre} /> : <span>{fallo ? 'No se pudo cargar la foto.' : 'Cargando…'}</span>}
          {i > 0 && <button type="button" className="mce-visor__nav mce-visor__nav--izq" onClick={() => setI(i - 1)} aria-label="Foto anterior">‹</button>}
          {i < fotos.length - 1 && <button type="button" className="mce-visor__nav mce-visor__nav--der" onClick={() => setI(i + 1)} aria-label="Foto siguiente">›</button>}
        </div>
      </div>
    </div>,
    document.fullscreenElement || document.body,
  );
}

// ── El sello, tal como se ve en la hoja y en la vista previa ─────────────────
export function SelloDibujado({ sello, autor, fecha }) {
  const e = estadoDeSello(sello?.estado);
  return (
    <div className="mce-sello" style={{ '--sello': e.color }}>
      <div className="mce-sello__cab">Sello de revisión</div>
      <div className="mce-sello__estado">{e.etiqueta}</div>
      {sello?.titulo && <div className="mce-sello__titulo">{sello.titulo}</div>}
      <div className="mce-sello__pie">{[autor, fecha].filter(Boolean).join(' · ')}</div>
    </div>
  );
}


const CLAVE_ULTIMO_SELLO = 'alephia.docs.ultimoSello';
function ultimoSello() {
  try { return JSON.parse(localStorage.getItem(CLAVE_ULTIMO_SELLO) || 'null') || null; } catch { return null; }
}

/** Colocar (o editar) un sello: estado, título y comentario, con la vista previa al lado. */
export function DialogoDeSello({ inicial, autor, editar = false, onAceptar, onCerrar }) {
  const base = inicial || ultimoSello() || {};
  const [estado, setEstado] = useState(base.estado || 'revisado');
  const [titulo, setTitulo] = useState(base.titulo || '');
  const [comentario, setComentario] = useState(base.comentario || '');
  const sello = { estado, titulo: titulo.trim(), comentario: comentario.trim() };
  const aceptar = () => {
    try { localStorage.setItem(CLAVE_ULTIMO_SELLO, JSON.stringify({ estado, titulo: sello.titulo })); } catch { /* sin almacén */ }
    onAceptar(sello);
  };
  return createPortal(
    <div className="mce-velo" onClick={onCerrar}>
      <div className="mce-dialogo" role="dialog" aria-label={editar ? 'Editar sello' : 'Colocar un sello'} onClick={e => e.stopPropagation()}>
        <header className="mce-dialogo__cab">
          <h2>{editar ? 'Editar sello' : 'Sello de revisión'}</h2>
          <p>Una nota de revisión sobre la hoja. <b>No cambia el estado del documento</b>: para aprobarlo, usa Revisiones.</p>
        </header>
        <div className="mce-dialogo__cuerpo">
          <div className="mce-dialogo__campos">
            <fieldset className="mce-campo">
              <legend>Estado</legend>
              {ESTADOS_DE_SELLO.map(e => (
                <label key={e.codigo} className={`mce-opcion${estado === e.codigo ? ' es-elegida' : ''}`}>
                  <input type="radio" name="estado-sello" value={e.codigo} checked={estado === e.codigo}
                    onChange={() => setEstado(e.codigo)} />
                  <i style={{ background: e.color }} />{e.etiqueta}
                </label>
              ))}
            </fieldset>
            <label className="mce-campo">
              <span>Título <small>(opcional)</small></span>
              <input value={titulo} maxLength={80} onChange={e => setTitulo(e.target.value)} placeholder="Ej.: Revisión de campo" />
            </label>
            <label className="mce-campo">
              <span>Comentario <small>(opcional)</small></span>
              <textarea value={comentario} maxLength={300} rows={3} onChange={e => setComentario(e.target.value)}
                placeholder="Se lee al abrir el sello" />
            </label>
          </div>
          <div className="mce-dialogo__previa">
            <span className="mce-rotulo">Vista previa</span>
            <SelloDibujado sello={sello} autor={autor} fecha={fechaCorta(new Date().toISOString())} />
          </div>
        </div>
        <footer className="mce-dialogo__pie">
          <button type="button" className="mce-btn mce-btn--sec" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="mce-btn mce-btn--prim" onClick={aceptar}>
            {editar ? 'Guardar' : 'Colocar en el plano'}</button>
        </footer>
      </div>
    </div>,
    document.fullscreenElement || document.body,
  );
}

// ── El panel de una marca elegida ────────────────────────────────────────────
export function PanelDeMarca({ API, obra, marca, esAutor, versionVigente = null, onLlevar = null,
                              onCambio, onPublicar, onBorrar, onCerrar }) {
  const [subiendo, setSubiendo] = useState(0);
  const [eligiendo, setEligiendo] = useState(null);      // 'cita' | 'foto'
  const [viendo, setViendo] = useState(null);            // índice de la foto abierta
  const [editandoSello, setEditandoSello] = useState(false);
  const [miembros, setMiembros] = useState([]);
  const entrada = useRef(null);
  const fotos = marca.fotos || [];
  const citas = marca.citas || [];
  const idsDe = (lista) => (lista || []).map(x => x.id);

  useEffect(() => {
    if (!obra) return undefined;
    let vivo = true;
    apiFetch(`${API}/api/projects/${encodeURIComponent(obra)}/miembros`)
      .then(r => (r.ok ? r.json() : { miembros: [] }))
      .then(d => { if (vivo) setMiembros(Array.isArray(d.miembros) ? d.miembros : []); })
      .catch(() => { if (vivo) setMiembros([]); });
    return () => { vivo = false; };
  }, [API, obra]);

  const cambiar = useCallback(async (cuerpo, okMsg) => {
    try {
      const r = await apiFetch(`${API}/api/pdf/markups/${marca.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo guardar.');
      onCambio({ ...marca, ...d.markup });
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (e) { toast.error(e.message); return false; }
  }, [API, marca, onCambio]);

  const alElegirArchivos = async (lista) => {
    const archivos = [...(lista || [])].filter(f => esFoto(f.name));
    if (!archivos.length) { toast.error('Elige fotos (JPG, PNG, WEBP o HEIC).'); return; }
    const libres = TOPE_FOTOS - fotos.length;
    if (archivos.length > libres) toast(`Como mucho ${TOPE_FOTOS} fotos por marca: se suben ${Math.max(0, libres)}.`);
    const ids = idsDe(fotos);
    for (const f of archivos.slice(0, Math.max(0, libres))) {
      setSubiendo(n => n + 1);
      try { const s = await subirFoto(API, obra, f); ids.push(s.id); }
      catch (e) { toast.error(`${f.name}: ${e.message}`); }
      finally { setSubiendo(n => n - 1); }
    }
    if (ids.length !== fotos.length) await cambiar({ fotos: ids }, ids.length - fotos.length === 1 ? 'Foto añadida' : 'Fotos añadidas');
  };

  const alElegirDocumento = async (doc) => {
    const modo = eligiendo;
    setEligiendo(null);
    if (modo === 'foto') {
      if (!esFoto(doc.nombre)) { toast.error(`«${doc.nombre}» no es una foto.`); return; }
      if (idsDe(fotos).includes(doc.file_node_id)) return;
      await cambiar({ fotos: [...idsDe(fotos), doc.file_node_id] }, 'Foto añadida');
    } else {
      if (idsDe(citas).includes(doc.file_node_id)) { toast('Ese documento ya está citado.'); return; }
      await cambiar({ citas: [...idsDe(citas), doc.file_node_id] }, 'Referencia añadida');
    }
  };

  const tipo = NOMBRE_DE_TIPO[marca.kind] || 'Marca';
  const sello = marca.style?.sello;

  return createPortal(
    <aside className="mce-panel" aria-label={`${tipo} seleccionada`}>
      <header className="mce-panel__cab">
        <span className="mce-panel__ico">{marca.kind === 'foto' ? <IconoFoto /> : marca.kind === 'sello' ? <IconoSello /> : <IconoEnlace />}</span>
        <div className="mce-panel__tit">
          <b>{tipo}</b>
          <small>{[marca.version_number ? `V${marca.version_number}` : '', marca.created_by, fechaCorta(marca.created_at)]
            .filter(Boolean).join(' · ')}</small>
        </div>
        <EtiquetaDeObservacion obs={marca.observacion} />
        <button type="button" className="mce-icono" onClick={onCerrar} aria-label="Cerrar"><IcoQuitar /></button>
      </header>

      <div className="mce-panel__cuerpo">
        {/* MARCAS POR VERSIÓN (36): de dónde viene una copia, y llevar a la vigente lo que sigue pendiente. */}
        {marca.llevada_de && (
          <p className="mce-nota mce-nota--version">Copia de una marca de una versión anterior: la original sigue allí.</p>
        )}
        {onLlevar && (
          <section className="mce-sec mce-sec--version">
            <p className="mce-version">Esta marca es de la <b>V{marca.version_number}</b>. Si la observación sigue
              pendiente en la vigente, llévala: se copia como borrador tuyo y esta no cambia.</p>
            <button type="button" className="mce-btn mce-btn--sec" onClick={onLlevar}>
              Llevar a la vigente{versionVigente ? ` (V${versionVigente})` : ''}</button>
          </section>
        )}

        {/* Lo que hay que corregir: una OBSERVACIÓN con responsable, plazo e historial. */}
        <ObservacionDeMarca key={marca.id} API={API} obra={obra} marca={marca} esAutor={esAutor}
          miembros={miembros} onCambio={onCambio} />

        {marca.kind === 'foto' && (
          <section className="mce-sec">
            <h3>Fotos <span>{fotos.length}</span></h3>
            {fotos.length ? (
              <div className="mce-fotos">
                {fotos.map(f => (
                  <MiniaturaDeFoto key={f.id} API={API} foto={f} onAbrir={() => setViendo(f.id)}
                    onQuitar={esAutor ? () => cambiar({ fotos: idsDe(fotos).filter(x => x !== f.id) }) : null} />
                ))}
              </div>
            ) : <p className="mce-vacio">Sin fotos todavía.</p>}
            {subiendo > 0 && <p className="mce-nota">Subiendo {subiendo === 1 ? 'una foto' : `${subiendo} fotos`} a {CARPETA_DE_FOTOS.replace('/', '')}…</p>}
            {esAutor && (
              <div className="mce-acciones">
                <button type="button" className="mce-btn mce-btn--sec" onClick={() => entrada.current?.click()}
                  disabled={fotos.length >= TOPE_FOTOS || subiendo > 0}>Subir fotos</button>
                <button type="button" className="mce-btn mce-btn--sec" onClick={() => setEligiendo('foto')}
                  disabled={fotos.length >= TOPE_FOTOS}>Elegir de la obra</button>
                <input ref={entrada} type="file" accept="image/*" multiple hidden
                  onChange={e => { alElegirArchivos(e.target.files); e.target.value = ''; }} />
              </div>
            )}
            {esAutor && (
              <div className="mce-orientacion">
                <span>Orientación</span>
                <button type="button" className="mce-icono" aria-label="Girar a la izquierda"
                  onClick={() => cambiar({ angulo: siguienteAngulo(marca.geometry?.ang, -45) })}><IcoGiro izq /></button>
                <span className="mce-orientacion__grados">{Math.round(marca.geometry?.ang || 0)}°</span>
                <button type="button" className="mce-icono" aria-label="Girar a la derecha"
                  onClick={() => cambiar({ angulo: siguienteAngulo(marca.geometry?.ang, 45) })}><IcoGiro /></button>
              </div>
            )}
            <p className="mce-nota">Las fotos se guardan como documentos en {CARPETA_DE_FOTOS.replace('/', '')}, con su versión y sus permisos.</p>
          </section>
        )}

        {marca.kind === 'sello' && sello && (
          <section className="mce-sec">
            <h3>Sello</h3>
            <SelloDibujado sello={sello} autor={marca.created_by} fecha={fechaCorta(marca.created_at)} />
            {sello.comentario && <p className="mce-comentario">{sello.comentario}</p>}
            <p className="mce-nota">Nota de revisión: no cambia el estado del documento.</p>
            {esAutor && <button type="button" className="mce-btn mce-btn--sec" onClick={() => setEditandoSello(true)}>Editar sello</button>}
          </section>
        )}

        <section className="mce-sec">
          <h3>Referencias <span>{citas.length}</span></h3>
          {citas.length ? (
            <ul className="mce-citas">
              {citas.map(c => (
                <li key={c.id} className={c.nombre ? '' : 'es-tenue'}>
                  <IcoDoc size={15} />
                  <div className="mce-cita-bloque">
                    {c.nombre
                      ? <button type="button" className="mce-cita" onClick={() => abrirDocumento(c.id)} title="Abrir en otra pestaña">
                          {c.nombre}<IcoAbrir size={13} /></button>
                      : <span className="mce-cita mce-cita--tenue">{etiquetaDeCita(c)}</span>}
                  </div>
                  {esAutor && (
                    <button type="button" className="mce-icono mce-icono--peq" aria-label="Quitar la referencia"
                      title="Quitar la referencia"
                      onClick={() => cambiar({ citas: idsDe(citas).filter(x => x !== c.id) })}>
                      <IcoQuitar size={13} /></button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="mce-vacio">{textoDeCitas(0)}. Enlaza un informe, una especificación o un plano relacionado.</p>}
          {esAutor && citas.length < TOPE_CITAS && (
            <div className="mce-acciones">
              <button type="button" className="mce-btn mce-btn--sec" onClick={() => setEligiendo('cita')}>+ Añadir referencia</button>
            </div>
          )}
        </section>

      </div>

      {esAutor && (
        <footer className="mce-panel__pie">
          <button type="button" className="mce-btn mce-btn--sec" onClick={onPublicar}
            disabled={marca.publicado && observacionViva(marca.observacion)}
            title={marca.publicado && observacionViva(marca.observacion) ? 'Tiene una observación abierta: el responsable la necesita a la vista' : undefined}>
            {marca.publicado ? 'Retirar de la obra' : 'Publicar'}</button>
          <button type="button" className="mce-btn mce-btn--peligro"
            disabled={observacionViva(marca.observacion)}
            title={observacionViva(marca.observacion) ? 'Tiene una observación abierta: anúlala o ciérrala antes' : undefined}
            onClick={async () => {
            const ok = await confirmAction({
              title: `¿Borrar esta ${tipo.toLowerCase()}?`,
              message: marca.kind === 'foto'
                ? 'Se borra el marcador del plano. Las fotos siguen en la obra, en su carpeta.'
                : 'Se borra la marca del plano. Los documentos que cita no cambian.',
              confirmText: 'Borrar', danger: true,
            });
            if (ok) onBorrar();
          }}>Borrar</button>
        </footer>
      )}

      {eligiendo && createPortal(
        <SelectorDeDocumento API={API} project={{ id: obra, model_urn: obra }}
          titulo={eligiendo === 'foto' ? 'Elegir una foto de la obra' : 'Añadir una referencia'}
          ayuda={eligiendo === 'foto'
            ? 'Elige una foto que ya esté en la obra. No se copia: la marca la cita.'
            : 'Elige el documento que esta marca cita. No se copia ni se mueve, y quien no pueda abrirlo no verá su nombre.'}
          onElegir={alElegirDocumento} onCerrar={() => setEligiendo(null)} />,
        document.fullscreenElement || document.body,
      )}
      {viendo != null && (() => {
        // Solo se recorren las fotos que se pueden abrir; `viendo` es el id de la pulsada.
        const visibles = fotos.filter(f => f.nombre);
        const i = Math.max(0, visibles.findIndex(f => f.id === viendo));
        return <VisorDeFoto API={API} fotos={visibles} indice={i} onCerrar={() => setViendo(null)} />;
      })()}
      {editandoSello && (
        <DialogoDeSello inicial={sello} autor={marca.created_by} editar
          onAceptar={async (s) => { if (await cambiar({ sello: s }, 'Sello actualizado')) setEditandoSello(false); }}
          onCerrar={() => setEditandoSello(false)} />
      )}
    </aside>,
    document.querySelector('.pdf-viewer .pdf-body') || document.querySelector('.file-viewer-content') || document.body,
  );
}

// ── «Citado en»: el viceversa, en el cajetín de cualquier documento ──────────
// Solo aparece si alguien lo cita: un botón vacío durante meses no ayuda a nadie.
export function CitadoEn({ API, file }) {
  const [citas, setCitas] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const id = file?.id;
  useEffect(() => {
    if (!id || !API) return undefined;
    let vivo = true;
    const cargar = () => apiFetch(`${API}/api/pdf/citado-en?node_id=${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d?.success) setCitas(d.citas || []); })
      .catch(() => { /* sin «Citado en» */ });
    cargar();
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; document.removeEventListener('visibilitychange', alVolver); };
  }, [API, id]);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);
  if (!citas.length) return null;
  const grupos = citasPorPlano(citas);
  return (
    <div className="mce-citado" ref={caja}>
      <button type="button" className="cajetin__cas mce-citado__boton" onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto} title="Qué marcas de qué planos citan este documento">
        <span className="cajetin__rot">Citado en</span>
        <b className="cajetin__val">{grupos.length === 1 ? '1 plano' : `${grupos.length} planos`} <span aria-hidden="true" className="cajetin__flecha">▾</span></b>
        <small className="cajetin__det">{citas.length === 1 ? '1 marca' : `${citas.length} marcas`}</small>
      </button>
      {abierto && (
        <div className="mce-citado__lista" role="menu">
          {grupos.map(g => (
            <div key={g.plano.id} className="mce-citado__grupo">
              <div className="mce-citado__plano"><IcoDoc size={14} />{g.plano.nombre}</div>
              {g.marcas.map(m => (
                <button key={m.marca} type="button" role="menuitem" className="mce-citado__marca"
                  onClick={() => { setAbierto(false); abrirDocumento(g.plano.id, { pagina: m.pagina, marca: m.marca,
                    version: m.version && !m.version.vigente ? m.version.id : null }); }}>
                  <span>{m.como === 'foto'
                    ? 'Foto marcada en el plano'
                    : `Referencia desde ${(NOMBRE_DE_TIPO[m.tipo] || 'una marca').toLowerCase()}`} · pág. {m.pagina}</span>
                  <small>{[m.version?.numero ? `V${m.version.numero}${m.version.vigente ? ' vigente' : ''}` : '',
                    m.autor, fechaCorta(m.fecha), m.publicado ? '' : 'borrador'].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
