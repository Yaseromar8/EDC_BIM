// HerramientasDeObra — CAPA 16 · qué herramientas EXISTEN en esta obra.
//
// LA PREGUNTA DE ESTA PANTALLA, Y SOLO ESA:
//     ¿ESTA HERRAMIENTA ESTÁ HABILITADA EN ESTA OBRA?
//
// No es «quién puede usarla» — eso es el acceso de cada miembro, y vive en
// Participantes. Aquí se decide si la herramienta EXISTE para la obra
// entera: apagada, no la usa nadie, tampoco un administrador. Quien la
// necesite la enciende; no la atraviesa por ser quien es.
//
// Apagar NO BORRA NADA: los RFI, las observaciones y los transmittals ya
// registrados siguen donde están. Deja de poder usarse hasta que se vuelva
// a encender. Es configuración, no destrucción — y la pantalla lo dice,
// porque un interruptor que parece destructivo no se toca nunca.
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

export default function HerramientasDeObra({ projectPrefix, isAdmin }) {
  const [catalogo, setCatalogo] = useState(null);
  const [estado, setEstado] = useState({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(null);

  // CAPA 14 · aplicar una plantilla a ESTA obra. Vive junto a las
  // herramientas porque es aqui donde su efecto se ve primero -- y porque
  // aplicarla es un acto de OBRA, aunque el molde sea de la entidad.
  const [plantillas, setPlantillas] = useState([]);
  const [aplicandoPlantilla, setAplicandoPlantilla] = useState(false);

  const cargar = async () => {
    setError('');
    try {
      const r = await apiFetch(`${API}/api/projects/${encodeURIComponent(projectPrefix)}/herramientas`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar.');
      setCatalogo(d.catalogo || []);
      setEstado(d.estado || {});
    } catch (e) {
      // Vacío y roto no son lo mismo: si esto falla, no se puede leer
      // «no hay herramientas» — se dice que no se pudo cargar.
      setCatalogo([]);
      setError(e.message || 'No se pudo cargar el estado de las herramientas.');
    }
  };

  useEffect(() => { if (projectPrefix) cargar(); }, [projectPrefix]);

  useEffect(() => {
    if (!isAdmin) return;
    // El catalogo es de la entidad: si esta persona no puede leerlo,
    // simplemente no se ofrece aplicar. El resto de la pantalla sigue.
    apiFetch(`${API}/api/plantillas-de-obra`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.plantillas) setPlantillas(d.plantillas); })
      .catch(() => {});
  }, [isAdmin]);

  const aplicarPlantilla = async (id) => {
    if (!id) return;
    setAplicandoPlantilla(true);
    try {
      const r = await apiFetch(
        `${API}/api/projects/${encodeURIComponent(projectPrefix)}/aplicar-plantilla`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plantilla_id: Number(id) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo aplicar.');
      toast.success(`Plantilla «${d.plantilla}» aplicada: `
        + `${d.creado.carpetas} carpetas · ${d.creado.empresas} empresas`);
      await cargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAplicandoPlantilla(false);
    }
  };

  const cambiar = async (codigo, quiere, etiqueta) => {
    setGuardando(codigo);
    try {
      const r = await apiFetch(
        `${API}/api/projects/${encodeURIComponent(projectPrefix)}/herramientas/${codigo}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activa: quiere }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar.');
      setEstado(prev => ({ ...prev, [codigo]: quiere }));
      toast.success(quiere
        ? `${etiqueta} queda disponible en esta obra`
        : `${etiqueta} deja de estar disponible — lo ya registrado se conserva`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGuardando(null);
    }
  };

  if (catalogo === null) {
    return <div style={{ fontSize: 13, color: '#888' }}>Cargando herramientas…</div>;
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
                  padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 6,
                    display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" style={{ fill: 'var(--accent)' }}>
          <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
        </svg>
        Herramientas de esta obra
      </div>
      <p style={{ fontSize: 12.5, color: '#777', margin: '0 0 16px', maxWidth: 680,
                  lineHeight: 1.55 }}>
        Qué herramientas <b>existen</b> en esta obra. Apagada, no la usa nadie del
        proyecto —tampoco un administrador—, sin importar sus permisos.
        <b> Apagar no borra nada</b>: lo ya registrado se conserva y vuelve a estar
        disponible al encenderla. Quién puede usar cada herramienta se decide en{' '}
        <b>Participantes</b>.
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 6,
                                   background: '#fef2f2', border: '1px solid #fecaca',
                                   color: '#991b1b', fontSize: 12.5 }}>
          {error} <b>La lista está incompleta</b>, no vacía.
        </div>
      )}

      <div style={{ display: 'grid', gap: 2 }}>
        {catalogo.map(h => {
          const activa = estado[h.codigo] !== false;
          return (
            <div key={h.codigo}
                 style={{ display: 'flex', alignItems: 'center', gap: 14,
                          padding: '11px 2px', borderBottom: '1px solid #f2f4f6' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: activa ? '#222' : '#98a1ab' }}>
                  {h.etiqueta}
                  {!activa && (
                    <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 10,
                                   fontSize: 10.5, fontWeight: 600,
                                   background: '#f3f4f6', color: '#6b7280' }}>NO DISPONIBLE</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#98a1ab', marginTop: 2 }}>{h.descripcion}</div>
              </div>
              {isAdmin ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                                fontSize: 12, color: '#555',
                                cursor: guardando === h.codigo ? 'wait' : 'pointer' }}>
                  <input type="checkbox" checked={activa}
                         disabled={guardando === h.codigo || Boolean(error)}
                         onChange={e => cambiar(h.codigo, e.target.checked, h.etiqueta)} />
                  {activa ? 'Disponible' : 'Apagada'}
                </label>
              ) : (
                <span style={{ fontSize: 12, color: activa ? '#4d6a8f' : '#98a1ab' }}>
                  {activa ? 'Disponible' : 'No disponible'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11.5, color: '#98a1ab', margin: '14px 0 0', maxWidth: 680,
                  lineHeight: 1.5 }}>
        El <b>expediente documental</b> no aparece aquí: es la base sobre la que se
        apoyan las demás y no se apaga.
      </p>

      {isAdmin && plantillas.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#888',
                        letterSpacing: '.04em', marginBottom: 6 }}>
            APLICAR UNA PLANTILLA A ESTA OBRA
          </div>
          <select defaultValue="" disabled={aplicandoPlantilla}
                  onChange={e => { aplicarPlantilla(e.target.value); e.target.value = ''; }}
                  style={{ width: '100%', maxWidth: 380, padding: '6px 8px',
                           border: '1px solid #ddd', borderRadius: 5, fontSize: 13 }}>
            <option value="">Elegir plantilla…</option>
            {plantillas.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.contiene?.carpetas} carpetas
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11.5, color: '#98a1ab', marginTop: 6, maxWidth: 680,
                        lineHeight: 1.5 }}>
            Crea la <b>configuración</b>: carpetas, herramientas, empresas y códigos de
            idoneidad. <b>No trae documentos, ni historia, ni miembros</b> — la gente se
            incorpora en Participantes. Pensado para una obra recién creada.
          </div>
        </div>
      )}
    </div>
  );
}
