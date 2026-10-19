/**
 * UploadModal.jsx — Subir archivos (motor: useChunkedUpload, subida por trozos).
 *
 * ASPECTO PROPIO (16-oct-2026). El funcionamiento venía de medir ACC; el aspecto ya no lo imita:
 * diálogo «Subir archivos» con el DESTINO a la vista, zona de arrastre con la ilustración plana de la
 * obra (D-25), resumen de la tanda (cuántos subidos, en curso, con error) y una bandeja minimizada
 * que dice en su cabecera cómo va todo. Paleta D-24 y letra del sistema (D-26).
 *
 * ACTIVIDAD Y PROGRESO, SEPARADOS (se conserva, medido).
 * El porcentaje real NO avanza de forma regular -- llega a saltos, y entre trozo y trozo hay viajes en los
 * que no se mueve nada -- así que una barra pega tirones y se queda congelada. Medido en ACC sobre 9,1 MB:
 * salta 4-7 puntos cada ~330 ms y un salto de 55 a 77 tras 1,9 s parado. Por eso NO hay barra: un girador
 * continuo dice «esto sigue vivo» y el número real dice «cuánto llevas». Nada se simula ni se interpola:
 * todo sale de los estados que expone `useChunkedUpload`.
 */
import React from 'react';
import { renderFileIconSop } from '../../utils/fileIcons';
import { formatSizeDetailed } from '../../utils/helpers';
import { confirmAction } from '../../utils/confirm';
import { IlustracionPlana } from '../IlustracionesPlanas';
import './Subida.css';

const EN_CURSO = ['queued', 'init', 'uploading', 'paused'];

/** ¿Sigue pasando algo? Sólo donde el motor está realmente trabajando o esperando él. */
function hayActividad(item) {
  if (['queued', 'init', 'uploading', 'confirming'].includes(item.status)) return true;
  // `paused` son DOS cosas distintas: la cuenta atrás de un reintento (el motor espera solo) y «hace falta
  // el fichero» (espera a una persona). Girar en el segundo caso sería mentir.
  return item.status === 'paused' && !item.needsFile;
}

function uploadStatusLabel(item, formatSize) {
  switch (item.status) {
    case 'queued': return 'En cola';
    case 'init': return 'Preparando la subida segura…';
    // El porcentaje REAL y los bytes reales.
    case 'uploading': return `${item.progress}% · ${formatSize(item.bytesUploaded || 0)} de ${formatSize(item.sizeBytes || 0)}`;
    // Transferencia terminada, la carpeta aún lo está registrando.
    case 'confirming': return 'Registrando en la carpeta…';
    // El texto del motor, tal cual: «Reintentando en 2s... (1/3)» o «Archivo necesario para reanudar».
    case 'paused': return item.statusText || 'Conexión interrumpida';
    case 'completed': return item.statusText || 'Subido';
    case 'cancelled': return 'Cancelado';
    case 'error': return item.statusText || 'No se pudo subir';
    default: return item.statusText || 'Esperando…';
  }
}

function tonoDe(item) {
  if (item.status === 'completed') return 'ok';
  if (item.status === 'error') return 'error';
  if (item.status === 'paused') return 'aviso';
  if (item.status === 'cancelled') return 'tenue';
  return 'curso';
}

/** Girador pequeño y continuo. Su velocidad no depende del progreso. */
function Girador({ tam = 10 }) {
  return <span className="sub-girador" aria-hidden="true" style={{ width: tam, height: tam }} />;
}

const Ico = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoCerrar = () => <Ico><path d="M6 6l12 12M18 6 6 18" /></Ico>;
const IcoMinimizar = () => <Ico><path d="M6 15h12" /></Ico>;
const IcoAmpliar = () => <Ico><path d="M6 14l6-6 6 6" /></Ico>;
const IcoCarpeta = () => <Ico size={14}><path d="M3 6.5h6l2 2h10V19H3z" /></Ico>;
const IcoHecho = ({ size = 16 }) => <Ico size={size}><path d="m5 12.5 4.5 4.5L19 7.5" /></Ico>;
const IcoMas = () => <Ico size={15}><path d="M12 5v14M5 12h14" /></Ico>;
const IcoAviso = () => <Ico size={14}><path d="M12 7v6" /><path d="M12 17h.01" /></Ico>;

function resumenDe(uploads) {
  const r = { total: uploads.length, listos: 0, curso: 0, errores: 0, bytes: 0 };
  for (const u of uploads) {
    r.bytes += u.sizeBytes || 0;
    if (u.status === 'completed') r.listos += 1;
    else if (u.status === 'error') r.errores += 1;
    else if (u.status !== 'cancelled') r.curso += 1;
  }
  return r;
}

const archivos = (n) => (n === 1 ? '1 archivo' : `${n} archivos`);

function FilaDeSubida({ item, formatSize, compacta, onCancelar, onAbrir }) {
  const tono = tonoDe(item);
  const activa = hayActividad(item);
  return (
    <li className={`sub-fila${compacta ? ' es-compacta' : ''}`}>
      <span className="sub-fila__ico">{renderFileIconSop(item.filename, compacta ? 24 : 28)}</span>
      <span className="sub-fila__info">
        <span className="sub-fila__nombre" title={item.filename}>{item.filename}</span>
        {/* SIN BARRA: el papel de «progressbar» se conserva en la línea de texto, así un lector de pantalla
            sigue recibiendo el porcentaje aunque no haya nada que llenar. */}
        <span className={`sub-fila__estado es-${tono}`}
          {...(EN_CURSO.includes(item.status) || item.status === 'confirming' ? {
            role: 'progressbar', 'aria-label': `Progreso de ${item.filename}`, 'aria-valuemin': 0, 'aria-valuemax': 100,
            'aria-valuenow': item.status === 'confirming' ? 100 : item.status === 'uploading' ? item.progress : undefined,
            'aria-valuetext': uploadStatusLabel(item, formatSize), 'aria-busy': activa,
          } : {})}>
          {activa && <Girador tam={compacta ? 9 : 10} />}
          {tono === 'ok' && <IcoHecho size={13} />}
          {/* En la bandeja, «Subido» a secas: la fecha completa partía la línea. */}
          <span>{compacta && item.status === 'completed' ? 'Subido' : uploadStatusLabel(item, formatSize)}</span>
        </span>
      </span>
      <span className="sub-fila__peso">{formatSize(item.sizeBytes || 0)}</span>
      <span className="sub-fila__accion">
        {item.status === 'completed' && item.nodeId && onAbrir && !compacta && (
          <button type="button" className="sub-btn sub-btn--peq" onClick={() => onAbrir(item)}>Abrir</button>
        )}
        {EN_CURSO.includes(item.status) && onCancelar && (
          <button type="button" className="sub-icono" onClick={() => onCancelar(item.id)}
            aria-label={`Cancelar ${item.filename}`} title="Cancelar este archivo"><IcoCerrar /></button>
        )}
      </span>
    </li>
  );
}

export default function UploadModal({
  isOpen,
  sopMinimized, setSopMinimized,
  currentPath,
  chunkedUpload,
  fileRef,
  dragOver,
  onDragOver, onDragLeave, onDrop,
  onUpload,
  onListo,
  onOpenUploaded,
  onClose,
}) {
  if (!isOpen) return null;

  const formatSize = formatSizeDetailed;
  const uploads = chunkedUpload.uploads;
  const r = resumenDe(uploads);
  const partes = String(currentPath || '').split('/').filter(Boolean);
  const destino = partes.length > 1 ? partes.slice(1).join(' / ') : 'Archivos de proyecto';
  const carpeta = partes.length > 1 ? partes[partes.length - 1] : 'Archivos de proyecto';
  const cancelar = (id) => chunkedUpload.cancelUpload(id);
  const elegir = () => fileRef.current && fileRef.current.click();

  const cerrar = async () => {
    if (!chunkedUpload.hasActiveUploads) { onClose(); return; }
    const canCancel = uploads.some(item => EN_CURSO.includes(item.status));
    if (!canCancel) { setSopMinimized(true); return; }
    const ok = await confirmAction({
      title: 'Cancelar las subidas en curso',
      message: 'Hay archivos subiendo. Si cierras ahora, esas subidas se cancelan. Para seguir trabajando sin cancelarlas, minimiza.',
      confirmText: 'Cancelar subidas',
      cancelText: 'Seguir subiendo',
      danger: true,
    });
    if (ok) { chunkedUpload.cancelAll(); onClose(); }
  };

  // ── Bandeja minimizada: la subida sigue mientras se trabaja ──
  if (sopMinimized) {
    const titulo = r.curso
      ? `Subiendo · ${r.listos} de ${r.total} listos`
      : r.errores ? `${r.listos} subidos · ${r.errores} con error` : `${archivos(r.total)} subidos`;
    return (
      <section className="sub-bandeja" aria-label="Subida de archivos">
        <header className="sub-bandeja__cab">
          <span className={`sub-bandeja__senal es-${r.curso ? 'curso' : r.errores ? 'error' : 'ok'}`}>
            {r.curso ? <Girador tam={12} /> : r.errores ? <IcoAviso /> : <IcoHecho size={14} />}
          </span>
          <span className="sub-bandeja__tit">
            <b>{titulo}</b>
            <small><IcoCarpeta /> {carpeta}</small>
          </span>
          <button type="button" className="sub-icono" onClick={() => setSopMinimized(false)}
            aria-label="Ampliar" title="Ampliar"><IcoAmpliar /></button>
          <button type="button" className="sub-icono" onClick={onClose} aria-label="Cerrar" title="Cerrar"><IcoCerrar /></button>
        </header>
        <ul className="sub-lista sub-lista--bandeja">
          {uploads.map(item => (
            <FilaDeSubida key={item.id} item={item} formatSize={formatSize} compacta onCancelar={cancelar} />
          ))}
        </ul>
        {r.curso > 0 && (
          <footer className="sub-bandeja__pie">
            <button type="button" className="sub-enlace sub-enlace--peligro"
              onClick={() => { chunkedUpload.cancelAll(); onClose(); }}>Cancelar las pendientes</button>
          </footer>
        )}
      </section>
    );
  }

  // ── Diálogo ──
  const hay = uploads.length > 0;
  return (
    <div className="modal-overlay" onClick={() => { if (!chunkedUpload.hasActiveUploads) onClose(); }}>
      <div className="sub-dialogo" role="dialog" aria-label="Subir archivos" onClick={e => e.stopPropagation()}>
        <header className="sub-cab">
          <div className="sub-cab__tit">
            <h2>Subir archivos</h2>
            <span className="sub-destino" title={currentPath}><IcoCarpeta /> {destino}</span>
          </div>
          <button type="button" className="sub-icono" onClick={() => setSopMinimized(true)}
            aria-label="Minimizar" title="Minimizar: la subida sigue"><IcoMinimizar /></button>
          <button type="button" className="sub-icono" onClick={cerrar} aria-label="Cerrar" title="Cerrar"><IcoCerrar /></button>
        </header>

        <div className="sub-cuerpo">
          <div className={`sub-zona${dragOver ? ' es-encima' : ''}${hay ? ' es-compacta' : ''}`}
            role="button" tabIndex={0} aria-label="Elegir archivos o arrastrarlos aquí"
            onClick={elegir} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } }}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
            {hay ? (
              <>
                <IcoMas />
                <span>Añadir más: arrástralos aquí o <u>elígelos</u></span>
              </>
            ) : (
              <>
                <IlustracionPlana nombre="carpeta" tamano={64} />
                <b className="sub-zona__tit">Arrastra aquí planos y documentos</b>
                <span className="sub-zona__sub">Se guardan en «{carpeta}», cada uno con su versión.</span>
                <button type="button" className="sub-btn sub-btn--prim" onClick={e => { e.stopPropagation(); elegir(); }}>
                  Elegir archivos</button>
              </>
            )}
          </div>
          <input type="file" ref={fileRef} multiple style={{ display: 'none' }}
            onChange={event => { onUpload(event.target.files); event.target.value = ''; }} />

          {hay && (
            <>
              <div className="sub-resumen" role="status">
                <span>
                  <b>{archivos(r.total)}</b>
                  <span className="sub-resumen__peso">{formatSize(r.bytes)}</span>
                </span>
                <span className="sub-resumen__cuenta">
                  <span className="es-ok">{r.listos} subidos</span>
                  {r.curso > 0 && <span className="es-curso">{r.curso} en curso</span>}
                  {r.errores > 0 && <span className="es-error">{r.errores} con error</span>}
                </span>
              </div>
              <ul className="sub-lista">
                {uploads.map(item => (
                  <FilaDeSubida key={item.id} item={item} formatSize={formatSize} onCancelar={cancelar} onAbrir={onOpenUploaded} />
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="sub-pie">
          <span className="sub-pie__nota">
            {r.curso > 0 ? 'Puedes minimizar y seguir trabajando: la subida continúa.' : ''}
          </span>
          {r.curso > 0 && (
            <button type="button" className="sub-btn" onClick={() => setSopMinimized(true)}>Minimizar</button>
          )}
          <button type="button" className="sub-btn sub-btn--prim" disabled={chunkedUpload.hasActiveUploads} onClick={onListo}>
            Listo</button>
        </footer>
      </div>
    </div>
  );
}
