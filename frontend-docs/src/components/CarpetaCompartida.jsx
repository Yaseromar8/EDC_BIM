// CarpetaCompartida.jsx — lo que ve quien abre el enlace público de una CARPETA (17-nov-2026, docs/archivos/32).
//
// «Compartir» deja crear el enlace de una carpeta y la página pública solo sabía abrir un archivo. Visto en
// producción con las fichas del sustento de metrados de PQT8, cuyos enlaces ya se habían enviado por correo.
//
// Sin sesión y solo para leer: la carpeta, sus subcarpetas y sus documentos; un clic abre el documento en el mismo
// lector que el enlace de un archivo suelto, y «Volver» devuelve a la lista. Qué se ve y qué se abre lo decide el
// servidor; aquí no se decide nada.
import React, { useCallback, useEffect, useState } from 'react';
import DocumentViewer from './DocumentViewer';
import {
  rutaDelContenido, rutaDelArchivo, tamano, fechaCorta, tipoDeArchivo, resumenDeLaCarpeta,
} from '../utils/carpetaCompartida';

const IconoCarpeta = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" /></svg>
);
const IconoDocumento = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>
);

async function leer(url) {
  const r = await fetch(url);
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.success) throw new Error(d?.error || 'No se pudo abrir.');
  return d.data;
}

export default function CarpetaCompartida({ API, shareId, nombre }) {
  const [carpeta, setCarpeta] = useState(null);       // la subcarpeta abierta; null = la compartida
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);       // el documento en el lector
  const [abriendo, setAbriendo] = useState(null);     // id del documento que se está pidiendo
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    leer(rutaDelContenido(API, shareId, carpeta))
      .then(d => { if (vivo) setDatos(d); })
      .catch(e => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [API, shareId, carpeta]);

  const abrir = useCallback(async (a) => {
    if (!a.disponible) return;
    const url = rutaDelArchivo(API, shareId, a.id);
    if (!url) return;
    setAbriendo(a.id);
    setAviso('');
    try {
      const d = await leer(url);
      setAbierto({ ...d, id: a.id });
    } catch (e) {
      setAviso(`${a.name}: ${e.message}`);
    } finally {
      setAbriendo(null);
    }
  }, [API, shareId]);

  if (abierto) {
    return (
      <DocumentViewer file={abierto} isShared sharedRole={abierto.role} API={API}
        onClose={() => setAbierto(null)} />
    );
  }

  const titulo = datos?.compartida?.name || nombre || 'Carpeta compartida';
  return (
    <div style={S.pagina}>
      <header style={S.cabecera}>
        <div style={S.marca}>ALEPHIA Docs</div>
        <h1 style={S.titulo}>{titulo}</h1>
        <p style={S.sub}>Carpeta compartida por enlace · solo lectura</p>
      </header>

      <main style={S.cuerpo}>
        {datos?.migas?.length > 1 && (
          <nav aria-label="Ruta" style={S.migas}>
            {datos.migas.map((m, k) => (
              <React.Fragment key={m.id}>
                {k > 0 && <span aria-hidden="true" style={S.separador}>/</span>}
                {k < datos.migas.length - 1
                  ? <button type="button" style={S.miga} onClick={() => setCarpeta(k === 0 ? null : m.id)}>{m.name}</button>
                  : <span style={S.migaActual} aria-current="location">{m.name}</span>}
              </React.Fragment>
            ))}
          </nav>
        )}

        {error && <div role="alert" style={S.error}>{error}</div>}
        {aviso && <div role="status" style={S.aviso}>{aviso}</div>}
        {cargando && !datos && <p style={S.leve}>Abriendo la carpeta…</p>}

        {datos && !error && (
          <>
            <p style={S.leve}>{resumenDeLaCarpeta(datos)}</p>
            <ul style={S.lista} aria-busy={cargando}>
              {(datos.carpetas || []).map(c => (
                <li key={c.id} style={S.filaLi}>
                  <button type="button" style={S.fila} onClick={() => setCarpeta(c.id)}>
                    <span style={S.icono}><IconoCarpeta /></span>
                    <span style={S.nombre}>{c.name}</span>
                  </button>
                </li>
              ))}
              {(datos.archivos || []).map(a => (
                <li key={a.id} style={S.filaLi}>
                  <button type="button" style={{ ...S.fila, ...(a.disponible ? null : S.filaApagada) }}
                    disabled={!a.disponible || abriendo === a.id} onClick={() => abrir(a)}
                    title={a.disponible ? 'Abrir' : a.motivo || 'No disponible'}>
                    <span style={S.icono}><IconoDocumento /></span>
                    <span style={S.nombre}>{a.name}</span>
                    <span style={S.dato}>{abriendo === a.id ? 'Abriendo…'
                      : a.disponible ? [tipoDeArchivo(a.name), tamano(a.size), fechaCorta(a.updated_at)].filter(Boolean).join(' · ')
                        : 'No disponible'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

const S = {
  pagina: { minHeight: '100vh', background: '#f1f0e8', color: '#333330', fontFamily: 'var(--a-font-sans)' },
  cabecera: { background: '#302f2e', color: '#faf9f5', padding: '20px 24px 18px' },
  marca: { fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', opacity: 0.7 },
  titulo: { margin: '6px 0 2px', fontSize: 20, fontWeight: 600 },
  sub: { margin: 0, fontSize: 13, opacity: 0.75 },
  cuerpo: { maxWidth: 920, margin: '0 auto', padding: '18px 16px 40px' },
  migas: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 14, marginBottom: 6 },
  miga: { border: 0, background: 'none', padding: '2px 4px', color: '#507294', cursor: 'pointer', font: 'inherit',
    textDecoration: 'underline', textUnderlineOffset: 2 },
  migaActual: { padding: '2px 4px', fontWeight: 600 },
  separador: { color: '#72706b' },
  leve: { fontSize: 13, color: '#72706b', margin: '6px 0 10px' },
  error: { padding: '10px 12px', borderRadius: 6, background: '#fbebeb', color: '#b93535', fontSize: 14, margin: '8px 0' },
  aviso: { padding: '10px 12px', borderRadius: 6, background: '#f9eeda', color: '#734500', fontSize: 14, margin: '8px 0' },
  lista: { listStyle: 'none', margin: 0, padding: 0, background: '#fff', border: '1px solid #e8e6dc', borderRadius: 8 },
  filaLi: { borderTop: '1px solid #f1f0e8' },
  fila: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 14px', border: 0,
    background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' },
  filaApagada: { cursor: 'not-allowed', color: '#9a978f' },
  icono: { color: '#72706b', display: 'inline-flex', flex: '0 0 auto' },
  nombre: { flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dato: { fontSize: 13, color: '#72706b', whiteSpace: 'nowrap' },
};
