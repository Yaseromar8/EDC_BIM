// TriajeSeguridadModule — la primera pregunta de ISO 19650-5.
//
// POR QUE ESTA PANTALLA EXISTE, Y POR QUE LA ESCRIBO CON PRISA
// La parte 5 de la norma no empieza por controles: empieza por una pregunta.
// ¿Esta obra necesita un enfoque de seguridad, o no? El resultado manda sobre
// todo lo demás — una obra sin nada delicado no tiene que cargar con medidas
// que estorban, y una con información sensible no puede tratarla como el resto.
//
// El backend ya lo tenía: tabla, API y la consulta `puede_salir_del_ecd`, que
// deniega emitir enlaces públicos mientras la obra no esté evaluada. Y eso es
// correcto: la parte 5 existe justamente para que no salga lo que nadie ha
// mirado.
//
// Lo que no existía era la forma de contestar la pregunta. Puse la guardia en
// los enlaces públicos dando por bueno el comentario del módulo — «desbloquearlo
// son diez minutos» — sin comprobar que hubiera pantalla. No la había. Resultado:
// ninguna obra podía emitir un enlace, y no había salida.
//
// Un control correcto sin salida no es un control: es un muro. La pantalla es la
// salida.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';

function hoyMasMeses(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function TriajeSeguridadView({ projectPrefix, isAdmin }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [requiere, setRequiere] = useState(null);   // null = sin elegir
  const [justificacion, setJustificacion] = useState('');
  const [revisarEn, setRevisarEn] = useState(hoyMasMeses(12));
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    apiFetch(`${API}/api/docs/sensibilidad?model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'No se pudo leer el triaje');
        setDatos(d);
        if (d.triaje) {
          setRequiere(!!d.triaje.requiere_enfoque);
          setJustificacion(d.triaje.justificacion || '');
          if (d.triaje.revisar_en) setRevisarEn(String(d.triaje.revisar_en).slice(0, 10));
        }
        setError(null);
      })
      .catch(e => setError(e.message));
  }, [projectPrefix]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    if (requiere === null) { toast.error('Elige una de las dos respuestas.'); return; }
    if (!justificacion.trim()) {
      toast.error('Escribe por qué. Un triaje sin motivo no se puede auditar.');
      return;
    }
    setGuardando(true);
    try {
      const r = await apiFetch(`${API}/api/docs/sensibilidad/triaje`, {
        method: 'POST',
        body: JSON.stringify({
          model_urn: projectPrefix, requiere_enfoque: requiere,
          justificacion: justificacion.trim(), revisar_en: revisarEn || null,
        }),
      });
      const d = await r.json();
      if (!d.success) { toast.error(d.error || 'No se pudo guardar.'); return; }
      toast.success('Triaje registrado.');
      cargar();
    } catch {
      toast.error('No se pudo guardar el triaje.');
    } finally {
      setGuardando(false);
    }
  };

  const t = datos?.triaje;
  const caducado = t?.caducado;

  const Opcion = ({ valor, titulo, texto }) => (
    <button onClick={() => isAdmin && setRequiere(valor)} disabled={!isAdmin}
            style={{
              flex: '1 1 280px', textAlign: 'left', cursor: isAdmin ? 'pointer' : 'default',
              background: requiere === valor ? 'var(--bg-accent)' : 'var(--bg-primary)',
              border: `1px solid ${requiere === valor ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 10, padding: '13px 15px',
            }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{titulo}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.55 }}>
        {texto}
      </div>
    </button>
  );

  return (
    <div style={{ padding: '18px 22px', color: 'var(--text-primary)', overflow: 'auto', height: '100%' }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Triaje de seguridad de la obra</h2>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 680 }}>
        La primera pregunta de ISO 19650-5, y la que manda sobre todo lo demás: ¿esta
        obra maneja información que necesite un tratamiento especial? Una obra sin nada
        delicado no tiene que cargar con medidas que estorban; una con información
        sensible no puede tratarla como el resto.
      </p>

      {error && (
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10,
                      background: 'var(--bg-danger)', border: '1px solid var(--border-danger)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--danger)', fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {/* La consecuencia, arriba y sin rodeos. Sin esto la pantalla parece un
          formulario opcional, y es lo que hoy tiene bloqueados los enlaces. */}
      {datos && (datos.sin_evaluar || caducado) && (
        <div style={{ marginTop: 16, padding: '11px 14px', borderRadius: 9,
                      background: 'var(--bg-warning)', border: '1px solid var(--border-warning)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--warning)', fontWeight: 600 }}>
            {caducado
              ? 'El triaje de esta obra está caducado.'
              : 'Esta obra todavía no tiene triaje de seguridad.'}
          </p>
          <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Mientras siga así <strong>no se pueden emitir enlaces públicos</strong> de sus
            documentos. No es un castigo: la norma existe para que no salga del ECD lo que
            nadie ha mirado. Contestar las dos preguntas de abajo desbloquea los
            transmittals; los enlaces públicos, además, necesitan que el documento (o su
            carpeta) tenga nivel de sensibilidad asignado.
          </p>
        </div>
      )}

      {t && !caducado && (
        <div style={{ marginTop: 16, padding: '11px 14px', borderRadius: 9,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Evaluada por <strong style={{ color: 'var(--text-primary)' }}>{t.evaluado_por || '—'}</strong>
            {t.evaluado_en ? ` el ${String(t.evaluado_en).slice(0, 10)}` : ''}
            {t.revisar_en ? ` · toca revisarlo el ${String(t.revisar_en).slice(0, 10)}` : ''}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <Opcion valor={false} titulo="No necesita enfoque de seguridad"
                texto="Obra pública ordinaria: los planos y modelos no exponen nada que
                       deba restringirse más allá de los permisos normales del equipo." />
        <Opcion valor={true} titulo="Sí necesita enfoque de seguridad"
                texto="Hay información que no puede salir del ECD sin más: infraestructura
                       sensible, datos de terceros, o lo que diga el plan de ejecución BIM." />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: 0.3, marginBottom: 4 }}>
          POR QUÉ — queda en el expediente
        </div>
        <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)}
                  disabled={!isAdmin} rows={3}
                  placeholder="En qué te basas. Un triaje sin motivo no se puede auditar: dentro de un año nadie sabrá si se pensó o se pulsó."
                  style={{
                    width: '100%', maxWidth: 680, fontSize: 12.5, lineHeight: 1.5,
                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)', borderRadius: 7, padding: '8px 11px',
                    resize: 'vertical', fontFamily: 'inherit',
                  }} />
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: 0.3, marginBottom: 4 }}>
            REVISARLO EL
          </div>
          <input type="date" value={revisarEn} onChange={e => setRevisarEn(e.target.value)}
                 disabled={!isAdmin}
                 style={{
                   fontSize: 12.5, background: 'var(--bg-primary)', color: 'var(--text-primary)',
                   border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px',
                 }} />
        </div>
        {isAdmin && (
          <button onClick={guardar} disabled={guardando}
                  style={{
                    background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none',
                    borderRadius: 7, padding: '9px 18px', fontSize: 12.5, fontWeight: 600,
                    cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1,
                  }}>
            {guardando ? 'Guardando…' : t ? 'Actualizar triaje' : 'Registrar triaje'}
          </button>
        )}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 680, lineHeight: 1.6 }}>
        La fecha de revisión no es burocracia: sin ella el triaje envejece y deja de
        valer. Una obra cambia — entran subcontratas, cambia el alcance — y lo que se
        decidió hace dos años puede no seguir siendo cierto.
      </p>
    </div>
  );
}
