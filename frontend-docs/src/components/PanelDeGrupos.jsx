import React, { useState } from 'react';
import './Grupos.css';

/**
 * GRUPOS en la barra de Archivos (maqueta docs/ux/maquetas/grupos_de_documentos_v1.html).
 *
 * Los documentos viven en sus carpetas; cada persona arma sus grupos, que solo apuntan a ellos. Los grupos
 * DE LA OBRA (los crea un administrador, p. ej. «Contractuales») van primero y los ve todo el mundo. El punto
 * naranja dice que algún documento del grupo tiene versión nueva (de los últimos 7 días).
 */
const IconoGrupo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 20.5 8 12 12.5 3.5 8z" /><path d="m3.5 12 8.5 4.5 8.5-4.5" /></svg>
);

export default function PanelDeGrupos({ grupos = [], activo = null, onElegir, onCrear, puedeCrearDeLaObra = false }) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="grupos-panel">
      <div className="grupos-panel__titulo">Grupos</div>
      {grupos.map(g => (
        <button key={g.id} type="button" className={`grupos-item${activo === g.id ? ' es-activo' : ''}`}
          onClick={() => onElegir(g)} title={g.de_la_obra ? 'Grupo de la obra: lo ven todos' : 'Tu grupo: solo lo ves tú'}>
          <IconoGrupo />
          <span className="grupos-item__nombre">{g.nombre}</span>
          {g.de_la_obra && <span className="grupos-obra">OBRA</span>}
          {g.con_version_nueva > 0 && <span className="grupos-punto" title={`${g.con_version_nueva} con versión nueva`} />}
          <span className="grupos-item__n">{g.documentos}</span>
        </button>
      ))}
      <button type="button" className="grupos-nuevo" onClick={() => setCreando(true)}>+ Nuevo grupo</button>
      {!grupos.length && (
        <p className="grupos-ayuda">Junta los documentos que más usas. Siguen en sus carpetas: el grupo solo los enlaza.</p>
      )}
      {creando && (
        <NuevoGrupo puedeCrearDeLaObra={puedeCrearDeLaObra} onCerrar={() => setCreando(false)}
          onCrear={async (nombre, deLaObra) => {
            const r = await onCrear(nombre, deLaObra);
            if (r.ok) setCreando(false);
            return r;
          }} />
      )}
    </div>
  );
}

export function NuevoGrupo({ puedeCrearDeLaObra, onCrear, onCerrar, titulo = 'Nuevo grupo' }) {
  const [nombre, setNombre] = useState('');
  const [deLaObra, setDeLaObra] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    setGuardando(true); setError('');
    const r = await onCrear(nombre.trim(), deLaObra);
    setGuardando(false);
    if (!r.ok) setError(r.error);
  };

  return (
    <div className="grupos-velo" role="presentation" onMouseDown={onCerrar}>
      <div className="grupos-modal" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={e => e.stopPropagation()}>
        <h4>{titulo}</h4>
        <label htmlFor="grupo-nombre">Nombre</label>
        <input id="grupo-nombre" value={nombre} autoFocus maxLength={80} placeholder="p. ej. Valorización octubre"
          onChange={e => setNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && nombre.trim()) crear(); }} />
        {puedeCrearDeLaObra && (
          <>
            <span className="grupos-modal__rot">¿Quién lo ve?</span>
            <div className="grupos-opciones" role="radiogroup">
              <button type="button" role="radio" aria-checked={!deLaObra} className={!deLaObra ? 'es-on' : ''} onClick={() => setDeLaObra(false)}>
                <b>Solo yo</b><small>Mi forma de tener a mano lo que uso</small></button>
              <button type="button" role="radio" aria-checked={deLaObra} className={deLaObra ? 'es-on' : ''} onClick={() => setDeLaObra(true)}>
                <b>Toda la obra</b><small>Para guiar a todos (p. ej. Contractuales)</small></button>
            </div>
          </>
        )}
        {error && <div className="grupos-error" role="alert">{error}</div>}
        <div className="grupos-modal__pie">
          <button type="button" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="es-principal" disabled={!nombre.trim() || guardando} onClick={crear}>
            {guardando ? 'Creando…' : 'Crear grupo'}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * «Añadir a grupo» (desde el clic derecho): elegir un grupo, o crear uno y añadir ahí. Solo se ofrecen los
 * grupos que el usuario puede cambiar: los suyos y, si administra la obra, los de la obra.
 */
export function ElegirGrupo({ documentos, grupos, puedeCrearDeLaObra, onAnadir, onCrear, onCerrar }) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const posibles = grupos.filter(g => !g.de_la_obra || puedeCrearDeLaObra);
  const que = documentos.length === 1 ? `«${documentos[0].name}»` : `${documentos.length} documentos`;

  const anadirA = async (g) => {
    setOcupado(true); setError('');
    const r = await onAnadir(g);
    setOcupado(false);
    if (!r.ok) setError(r.error); else onCerrar();
  };

  if (creando) {
    return (
      <NuevoGrupo puedeCrearDeLaObra={puedeCrearDeLaObra} titulo={`Nuevo grupo con ${que}`} onCerrar={onCerrar}
        onCrear={async (nombre, deLaObra) => {
          const r = await onCrear(nombre, deLaObra);
          if (!r.ok) return r;
          const a = await onAnadir({ id: r.id, nombre: r.nombre });
          if (a.ok) onCerrar();
          return a;
        }} />
    );
  }

  return (
    <div className="grupos-velo" role="presentation" onMouseDown={onCerrar}>
      <div className="grupos-modal" role="dialog" aria-modal="true" aria-label="Añadir a grupo" onMouseDown={e => e.stopPropagation()}>
        <h4>Añadir {que} a un grupo</h4>
        <p className="grupos-modal__nota">Sigue en su carpeta: el grupo solo lo enlaza.</p>
        <div className="grupos-lista">
          {posibles.map(g => (
            <button key={g.id} type="button" disabled={ocupado} onClick={() => anadirA(g)}>
              <IconoGrupo />
              <span className="grupos-item__nombre">{g.nombre}</span>
              {g.de_la_obra && <span className="grupos-obra">OBRA</span>}
              <span className="grupos-item__n">{g.documentos}</span>
            </button>
          ))}
          {!posibles.length && <p className="grupos-modal__nota">Aún no tienes grupos.</p>}
        </div>
        <button type="button" className="grupos-nuevo grupos-nuevo--modal" onClick={() => setCreando(true)}>+ Nuevo grupo…</button>
        {error && <div className="grupos-error" role="alert">{error}</div>}
        <div className="grupos-modal__pie">
          <button type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
