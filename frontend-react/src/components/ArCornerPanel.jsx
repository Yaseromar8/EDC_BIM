import React, { useCallback, useEffect, useRef, useState } from 'react';
import { calibrarPorEsquina, clasificar, planoDesdePose } from '../native/arCornerCalib';
import { camaraDelVisor, planoDelToque } from '../native/modelFacePick';
import { simActivo, simMirarA } from '../native/arSim';

// Asistente de CALIBRACIÓN POR ESQUINA — el método de Revizto.
//
// Dos pasos, y el orden importa:
//   1. Señalar en el MODELO las tres caras del rincón (dos muros y el piso).
//   2. Apuntar a esas mismas tres caras EN LA OBRA.
//
// Se hace primero el modelo porque ahí el operario puede orbitar, acercarse y
// tocar con calma; luego, ya en la obra, solo tiene que apuntar. Al revés
// obligaría a sostener la tablet en alto mientras se busca una cara diminuta.
//
// Durante el paso del modelo el puente se PAUSA: la cámara vuelve a ser la del
// visor de siempre y el rincón se señala orbitando. La sesión de ARCore sigue
// viva por debajo — volver a arrancarla costaría varios segundos de
// reconocimiento, y en obra esa espera es lo que hace que una herramienta se
// use o se abandone.

const NOMBRES = ['primera cara', 'segunda cara', 'tercera cara'];

const boton = {
  padding: '10px 16px', borderRadius: 999, border: '1px solid #3a3f45',
  background: '#1b1f24', color: '#e6e8ea', fontSize: 14, cursor: 'pointer',
};
const botonFuerte = { ...boton, background: '#2b6cb0', borderColor: '#2b6cb0', color: '#fff' };

/** Etiqueta legible de lo capturado, para que se vea que el trío es un rincón. */
function resumen(planos, arriba) {
  if (!planos.length) return '';
  try {
    const c = clasificar(planos.map((q) => ({ n: arriba(q.n), p: arriba(q.p) })));
    return `piso ${c.pisoVert > 0.85 ? '✓' : '✗'} · muros ${c.muroVertMax < 0.5 ? '✓' : '✗'}`;
  } catch {
    return '';
  }
}

export default function ArCornerPanel({
  viewer, puente, upm, reticuloRef, mostrarModelo, onAplicar, onCancelar,
}) {
  const [paso, setPaso] = useState('intro');
  const [carasModelo, setCarasModelo] = useState([]);
  const [carasObra, setCarasObra] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [aviso, setAviso] = useState('');

  const obsModeloRef = useRef(null);
  const obsMundoRef = useRef([]);

  // ── Paso 1: señalar caras en el modelo ────────────────────────────────────
  // El puente suelta la cámara para que el visor se pueda orbitar.
  useEffect(() => {
    if (!puente) return undefined;
    const enModelo = paso === 'modelo';
    try { puente.setPausado?.(enModelo); } catch { /* noop */ }
    mostrarModelo?.(enModelo);
    return () => {};
  }, [paso, puente, mostrarModelo]);

  const tocar = useCallback((ev) => {
    const plano = planoDelToque(viewer, ev.clientX, ev.clientY);
    if (!plano) { setAviso('Ahí no hay geometría: toca sobre una cara del modelo.'); return; }
    setAviso('');
    obsModeloRef.current = camaraDelVisor(viewer);
    setCarasModelo((prev) => (prev.length >= 3 ? prev : [...prev, plano]));
  }, [viewer]);

  useEffect(() => {
    if (paso !== 'modelo' || !viewer) return undefined;
    const lienzo = viewer.impl?.canvas || viewer.canvas;
    if (!lienzo) return undefined;

    // Distinguir un TOQUE de un ARRASTRE: orbitar el modelo no puede contar
    // como señalar una cara, o cada giro de cámara añadiría una cara falsa.
    let x0 = 0; let y0 = 0;
    const abajo = (e) => { x0 = e.clientX; y0 = e.clientY; };
    const arriba = (e) => {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) tocar(e);
    };
    lienzo.addEventListener('pointerdown', abajo);
    lienzo.addEventListener('pointerup', arriba);
    return () => {
      lienzo.removeEventListener('pointerdown', abajo);
      lienzo.removeEventListener('pointerup', arriba);
    };
  }, [paso, viewer, tocar]);

  // ── Paso 2: apuntar a las caras reales ────────────────────────────────────
  const capturarObra = () => {
    const r = reticuloRef?.current;
    if (!r || !r.found || !r.matrix) {
      setAviso('Todavía no hay superficie bajo el punto de mira. Muévete despacio y vuelve a intentarlo.');
      return;
    }
    const plano = planoDesdePose(r.matrix);
    if (!plano) { setAviso('La superficie llegó incompleta; repite la captura.'); return; }
    setAviso('');
    const cam = puente?.getArCamPos?.();
    if (cam) obsMundoRef.current = [...obsMundoRef.current, cam];
    setCarasObra((prev) => (prev.length >= 3 ? prev : [...prev, plano]));
  };

  const resolver = () => {
    // El observador del mundo es donde estaba el operario: se promedian las
    // tres capturas porque se mueve un poco entre una cara y otra.
    const obs = obsMundoRef.current;
    const obsMundo = obs.length
      ? [0, 1, 2].map((i) => obs.reduce((a, c) => a + c[i], 0) / obs.length)
      : null;
    const r = calibrarPorEsquina(carasModelo, carasObra, {
      upm, obsMundo, obsModelo: obsModeloRef.current,
    });
    setResultado(r);
    setPaso('resultado');
  };

  const reiniciar = () => {
    setCarasModelo([]); setCarasObra([]); setResultado(null);
    obsMundoRef.current = []; obsModeloRef.current = null;
    setAviso(''); setPaso('modelo');
  };

  const aplicar = () => {
    if (!resultado?.ok) return;
    try {
      puente.setYawDegrees(resultado.yaw);
      puente.setModelOrigin(resultado.modelOrigin);
    } catch { /* lo dirá el panel técnico */ }
    mostrarModelo?.(true);
    onAplicar?.(resultado);
  };

  const caja = {
    position: 'absolute', left: '50%', bottom: 92, transform: 'translateX(-50%)',
    width: 'min(92vw, 460px)', background: 'rgba(12,14,17,0.94)', color: '#e6e8ea',
    border: '1px solid #2a2f35', borderRadius: 14, padding: 16,
    font: '14px/1.45 system-ui, sans-serif', zIndex: 40,
  };

  return (
    <div style={caja}>
      {paso === 'intro' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Calibrar por esquina</div>
          <p style={{ margin: '0 0 12px', color: '#a9b0b8' }}>
            Busca un rincón que exista igual en el modelo y en la obra: dos muros
            y el piso. Primero lo señalas en el modelo y después apuntas a las
            mismas tres caras aquí.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={botonFuerte} onClick={() => setPaso('modelo')}>Empezar</button>
            <button type="button" style={boton} onClick={onCancelar}>Cancelar</button>
          </div>
        </>
      )}

      {paso === 'modelo' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            1 de 2 · Toca en el modelo la {NOMBRES[carasModelo.length] || 'última cara'}
          </div>
          <p style={{ margin: '0 0 10px', color: '#a9b0b8' }}>
            Gira y acerca el modelo con normalidad. Toca el piso y los dos muros
            del rincón — el orden da igual.
          </p>
          <div style={{ marginBottom: 10 }}>
            caras: {carasModelo.length} de 3 {carasModelo.length === 3 && `· ${resumen(carasModelo, (v) => v)}`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={carasModelo.length === 3 ? botonFuerte : { ...boton, opacity: 0.5 }}
              disabled={carasModelo.length !== 3}
              onClick={() => setPaso('obra')}
            >
              Siguiente
            </button>
            <button type="button" style={boton} onClick={() => setCarasModelo((p) => p.slice(0, -1))}>
              Deshacer
            </button>
            <button type="button" style={boton} onClick={onCancelar}>Cancelar</button>
          </div>
        </>
      )}

      {paso === 'obra' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            2 de 2 · Apunta a la {NOMBRES[carasObra.length] || 'última cara'} del rincón real
          </div>
          <p style={{ margin: '0 0 10px', color: '#a9b0b8' }}>
            Céntrala en el punto de mira y captura. Quédate en el mismo sitio
            para las tres.
          </p>
          <div style={{ marginBottom: 10 }}>caras: {carasObra.length} de 3</div>
          {simActivo() && (
            <div style={{ marginBottom: 10, color: '#8ab4f8', fontSize: 13 }}>
              Simulador: teclas 1, 2 y 3 para mirar al piso y a cada muro.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={carasObra.length < 3 ? botonFuerte : { ...boton, opacity: 0.5 }}
              disabled={carasObra.length >= 3}
              onClick={capturarObra}
            >
              Capturar cara
            </button>
            <button
              type="button"
              style={carasObra.length === 3 ? botonFuerte : { ...boton, opacity: 0.5 }}
              disabled={carasObra.length !== 3}
              onClick={resolver}
            >
              Calcular
            </button>
            <button type="button" style={boton} onClick={() => setCarasObra((p) => p.slice(0, -1))}>
              Deshacer
            </button>
          </div>
        </>
      )}

      {paso === 'resultado' && resultado && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {resultado.ok ? 'Rincón resuelto' : 'No se pudo calibrar'}
          </div>
          {resultado.ok ? (
            <div style={{ marginBottom: 10 }}>
              <div>giro: {resultado.yaw.toFixed(1)}°</div>
              {/* El ángulo por sí solo no dice nada en obra; lo que se entiende
                  es cuánto se desviaría el replanteo a diez metros. */}
              <div>
                ajuste de las caras: {resultado.discrepanciaMuros.toFixed(1)}°
                {' '}(≈ {(resultado.errorA10m * 100).toFixed(0)} cm de desvío a 10 m)
              </div>
              {resultado.avisos.map((a) => (
                <div key={a} style={{ color: '#e2b93b', marginTop: 4 }}>⚠ {a}</div>
              ))}
            </div>
          ) : (
            <p style={{ margin: '0 0 10px', color: '#e2b93b' }}>{resultado.motivo}</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {resultado.ok && (
              <button type="button" style={botonFuerte} onClick={aplicar}>Aplicar</button>
            )}
            <button type="button" style={boton} onClick={reiniciar}>Repetir</button>
            <button type="button" style={boton} onClick={onCancelar}>Cancelar</button>
          </div>
        </>
      )}

      {aviso && <div style={{ marginTop: 10, color: '#e2b93b' }}>{aviso}</div>}
    </div>
  );
}

/** Teclas 1/2/3 del simulador: mirar al piso y a cada muro. Solo con ?arsim=1. */
export function useTeclasSimulador(activo) {
  useEffect(() => {
    if (!activo || !simActivo()) return undefined;
    const alPulsar = (e) => {
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0) simMirarA(i);
      if (e.key === '0') simMirarA(null);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [activo]);
}
