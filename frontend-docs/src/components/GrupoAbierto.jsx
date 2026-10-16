import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { confirmAction } from '../utils/confirm';
import './Grupos.css';

/**
 * UN GRUPO ABIERTO, sobre el panel de datos de Archivos (no toca la tabla, el árbol ni las vistas).
 *
 * Cada fila dice dónde VIVE el documento (su carpeta: al pulsarla se va allí), qué ABRE el grupo (la vigente,
 * o una versión fija) y si tiene versión nueva. Quitar un documento del grupo no lo borra: el grupo solo apunta.
 */
const ICONO = { xls: 'XLS', xlsx: 'XLS', xlsm: 'XLS', csv: 'CSV', pdf: 'PDF', doc: 'DOC', docx: 'DOC', dwg: 'DWG', rvt: 'RVT' };

function Icono({ nombre }) {
  const ext = (String(nombre).match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
  const t = ICONO[ext] || ext.slice(0, 3).toUpperCase() || '—';
  return <span className={`grupo-ico grupo-ico--${t.toLowerCase()}`} aria-hidden="true">{t}</span>;
}

export default function GrupoAbierto({ grupo, puedeEscribir, servicio, onAbrir, onIrACarpeta, onCerrar, onBorrado }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  // Las funciones del servicio son estables (useCallback); el objeto que las junta, no.
  const { documentos: leer, quitar: quitarDelGrupo, fijar: fijarEnGrupo, borrar: borrarElGrupo, recargar } = servicio;

  const cargar = useCallback(async () => {
    const r = await leer(grupo.id);
    if (!r.ok) { setError(r.error); setDocs([]); return; }
    setError('');
    setDocs(r.documentos || []);
  }, [grupo.id, leer]);

  useEffect(() => {
    let vivo = true;
    leer(grupo.id).then(r => {
      if (!vivo) return;
      if (!r.ok) { setError(r.error); setDocs([]); return; }
      setDocs(r.documentos || []);
    });
    return () => { vivo = false; };
  }, [grupo.id, leer, grupo.documentos]);

  const quitar = async (d) => {
    const r = await quitarDelGrupo(grupo.id, d.file.id);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`«${d.file.name}» quitado del grupo (sigue en su carpeta)`);
    cargar();
  };

  const alternarFijo = async (d) => {
    const r = await fijarEnGrupo(grupo.id, d.file.id, !d.fijo);
    if (!r.ok) { toast.error(r.error); return; }
    cargar();
    recargar();      // el punto de «versión nueva» de la barra depende de lo fijado
  };

  const borrarGrupo = async () => {
    const ok = await confirmAction({
      title: `¿Borrar el grupo «${grupo.nombre}»?`,
      message: 'Los documentos NO se borran: siguen en sus carpetas. Solo desaparece este grupo.',
      confirmText: 'Borrar el grupo', danger: true,
    });
    if (!ok) return;
    const r = await borrarElGrupo(grupo.id);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success('Grupo borrado');
    onBorrado?.();
  };

  return (
    <div className="grupo-abierto">
      <div className="grupo-abierto__cab">
        <button type="button" className="grupo-volver" onClick={onCerrar} title="Volver a Archivos">←</button>
        <h2>{grupo.nombre}</h2>
        {grupo.de_la_obra
          ? <span className="grupos-obra grupos-obra--largo">DE LA OBRA · lo ven todos</span>
          : <span className="grupo-mio">Solo tú lo ves</span>}
        {puedeEscribir && (
          <button type="button" className="grupo-borrar" onClick={borrarGrupo}>Borrar grupo</button>
        )}
      </div>
      <p className="grupo-abierto__desc">
        Cada documento sigue en su carpeta: el grupo solo lo enlaza. Para añadir más, clic derecho sobre un
        documento en Archivos → «Añadir a grupo».
      </p>

      {error && <div className="grupos-error" role="alert">{error}</div>}
      {docs === null && <p className="grupo-abierto__desc">Cargando…</p>}
      {docs && !docs.length && !error && (
        <p className="grupo-vacio">Este grupo está vacío. Clic derecho sobre un documento → «Añadir a grupo».</p>
      )}

      {docs && docs.length > 0 && (
        <table className="grupo-tabla">
          <thead>
            <tr><th>Documento</th><th>Vive en</th><th>Abre</th><th>Versión</th><th aria-label="Quitar" /></tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.file.id}>
                <td>
                  <button type="button" className="grupo-doc" onClick={() => onAbrir(d.file, d.fijo, docs.map(x => x.file))}
                    title={d.fijo ? `Abrir la V${d.fijo.version_number} (fija)` : 'Abrir la versión vigente'}>
                    <Icono nombre={d.file.name} />
                    <span>{d.file.name}</span>
                  </button>
                </td>
                <td>
                  <button type="button" className="grupo-vive" onClick={() => onIrACarpeta(d)}
                    title="Ir a la carpeta donde vive">{d.ruta.length ? d.ruta.join(' › ') : 'Archivos de proyecto'}</button>
                </td>
                <td>
                  {puedeEscribir ? (
                    <button type="button" className={`grupo-sigue${d.fijo ? ' es-fijo' : ''}`} onClick={() => alternarFijo(d)}
                      title={d.fijo ? 'Pulsar para seguir siempre la vigente' : 'Pulsar para fijar la versión de hoy'}>
                      {d.fijo ? `fijo · V${d.fijo.version_number}` : 'la vigente'}
                    </button>
                  ) : (
                    <span className={`grupo-sigue${d.fijo ? ' es-fijo' : ''}`}>{d.fijo ? `fijo · V${d.fijo.version_number}` : 'la vigente'}</span>
                  )}
                </td>
                <td className="grupo-version">
                  V{d.version_vigente || '—'}{d.file.codigo_revision ? ` · ${d.file.codigo_revision}` : ''}
                  {d.nueva_version && <span className="grupo-nueva" title="Subida en los últimos 7 días">nueva versión</span>}
                </td>
                <td>
                  {puedeEscribir && (
                    <button type="button" className="grupo-quitar" onClick={() => quitar(d)}
                      title="Quitar del grupo (el documento no se borra)" aria-label={`Quitar ${d.file.name} del grupo`}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
