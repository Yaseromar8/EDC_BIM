import React, { useCallback, useEffect, useRef, useState } from 'react';
import { calibrarPorEsquina, clasificar, planoDesdePose } from '../native/arCornerCalib';
import { cornerPoint } from '../native/registrationCorner.js';
import { camaraDelVisor, planoDelToque } from '../native/modelFacePick';
// esSimulado y no simActivo: desde que el navegador usa SIEMPRE el simulador
// (no hay otra fuente de poses sin plataforma nativa), simActivo() -- que solo
// mira el ?arsim=1 del URL -- quedo obsoleto como pregunta. Seguir usandolo
// dejaba las teclas 1/2/3 muertas y la pista escondida en cuanto el URL
// perdia el parametro, con el simulador corriendo perfectamente por debajo.
import { esSimulado } from '../native/arcore';
import { simMirarA, simRinconAbierto } from '../native/arSim';

// Asistente de CALIBRACIÓN POR ESQUINA — el método de Revizto, EN SU ORDEN.
//
//   1. Escanear las tres caras del rincón EN LA OBRA (dos muros y el piso).
//   2. Señalar esas mismas tres caras EN EL MODELO.
//
// Primero campo y después modelo, como lo documenta Revizto ("después de
// escanear las tres superficies, seleccione tres superficies correspondientes
// en el modelo"). Aquí se hizo primero al revés por una idea de ergonomía, y
// hubo que corregirlo: además de no ser lo que el operario ya conoce, el orden
// de Revizto tiene su lógica física — mientras escaneas, la detección de
// planos termina de reconocer el entorno; y al acabar bajas la tablet y
// eliges las caras del modelo con calma, orbitando.
//
// Durante el paso del modelo el puente se PAUSA: la cámara vuelve a ser la del
// visor de siempre. La sesión de ARCore sigue viva por debajo — volver a
// arrancarla costaría varios segundos de reconocimiento, y en obra esa espera
// es lo que hace que una herramienta se use o se abandone.

const NOMBRES = ['primera cara', 'segunda cara', 'tercera cara'];

// Clase de una cara según su normal (ejes de ARCore, Y arriba). Se deriva de
// la geometría y no del campo `kind` del plugin: así funciona igual con un
// APK viejo — y si ese APK aplana las normales, todo sale "piso", el control
// de composición lo rechaza y el error se ve EN LA PRIMERA captura, no en un
// resultado absurdo al final.
const claseDeNormal = (n) => {
  const v = n[1];
  if (v > 0.85) return 'piso';
  if (v < -0.85) return 'techo';
  if (Math.abs(v) < 0.5) return 'muro';
  return 'inclinada';
};
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const boton = {
  padding: '10px 16px', borderRadius: 999, border: '1px solid #3a3f45',
  background: '#1b1f24', color: '#e6e8ea', fontSize: 14, cursor: 'pointer',
};
const botonFuerte = { ...boton, background: '#2b6cb0', border: '1px solid #2b6cb0', color: '#fff' };

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
  viewer, puente, upm, reticuloRef, modoCamara, mostrarModelo, onAplicar, onCancelar,
}) {
  const [paso, setPaso] = useState('intro');
  const [carasModelo, setCarasModelo] = useState([]);
  const [carasObra, setCarasObra] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [aviso, setAviso] = useState('');

  const obsModeloRef = useRef(null);
  const obsMundoRef = useRef([]);

  // Qué hay bajo el punto de mira, en vivo — y CAPTURA AUTOMÁTICA, como
  // Revizto: el operario barre el rincón, las caras se reconocen solas y al
  // coincidir las tres se pinta el punto del rincón ("Corner detected!").
  // Capturar a botonazos sigue disponible como respaldo, pero el camino
  // normal es barrer y mirar.
  const [mira, setMira] = useState(null);
  const [marcador, setMarcador] = useState(null);
  // CAPTURA AFINADA: en vez de fiarse de UN hit-test —que en muros lisos
  // baila—, el botón recoge ~1.2 s de muestras (planos o PUNTOS con normal
  // estimada, los mismos que usa Revizto), promedia la normal y el punto, y
  // rechaza si la nube no es estable. Es lo que hace robusto capturar un muro
  // blanco donde el plano completo nunca llega.
  const [afinando, setAfinando] = useState(0);   // 0 = quieto; 0..1 progreso
  const afinandoRef = useRef(null);
  const carasObraRef = useRef([]);
  useEffect(() => { carasObraRef.current = carasObra; }, [carasObra]);
  const estableRef = useRef(null);     // cara vista en ticks seguidos
  // Ventana de muestras para el AUTO-AFINADO de puntos orientados: como
  // Revizto, sin botón — mantienes la mira sobre el muro y cuando la nube es
  // estable la cara entra sola. Umbrales MAS estrictos que el botón, porque
  // aquí nadie confirmó nada: 8 muestras coherentes o no hay captura.
  const ventanaRef = useRef([]);
  const vetadaRef = useRef(null);      // la última deshecha: no re-capturarla sola
  const esquinaRef = useRef(null);     // punto 3D del rincón (mundo AR)

  useEffect(() => {
    if (paso !== 'obra') return undefined;
    const t = setInterval(() => {
      // El punto del rincón sigue a la cámara aunque no haya nada bajo la mira.
      if (esquinaRef.current && puente?.proyectarMundo) {
        setMarcador(puente.proyectarMundo(esquinaRef.current));
      } else {
        setMarcador(null);
      }

      const r = reticuloRef?.current;
      const usable = r && r.found && r.matrix && (r.type === 'plane' || r.oriented);
      if (!usable) { setMira(null); return; }
      const q = planoDesdePose(r.matrix);
      if (!q) { setMira(null); return; }
      const clase = claseDeNormal(q.n);
      setMira(clase);
      // AUTO-AFINADO también para puntos orientados — el método Revizto de
      // verdad: barres, las caras se fijan solas, y el operario solo acepta
      // cuando VE el punto del rincón clavado. Para un plano de ARCore basta
      // verlo firme dos ticks (abajo); para puntos orientados se exige una
      // ventana de 8 muestras con la normal quieta (<18°) antes de dejarla
      // entrar sola.
      if (r.type !== 'plane') {
        if (clase === 'inclinada' || carasObraRef.current.length >= 3) return;
        if (vetadaRef.current && vetadaRef.current.clase === clase
            && dot3(vetadaRef.current.plano.n, q.n) > 0.966) return;
        const v = ventanaRef.current;
        // La ventana se reinicia si la clase cambia (se movió a otra cara).
        if (v.length && claseDeNormal(v[v.length - 1].n) !== clase) v.length = 0;
        v.push(q);
        if (v.length > 12) v.shift();
        if (v.length >= 8) {
          const nm = [0, 1, 2].map((i) => v.reduce((a, c) => a + c.n[i], 0) / v.length);
          const L = Math.hypot(nm[0], nm[1], nm[2]) || 1;
          const n = nm.map((x) => x / L);
          if (v.every((c) => dot3(c.n, n) > 0.95)) {
            const pM = [0, 1, 2].map((i) => v.reduce((a, c) => a + c.p[i], 0) / v.length);
            if (intentaCapturar({ n, p: pM }, claseDeNormal(n), true)) v.length = 0;
          }
        }
        return;
      }
      ventanaRef.current.length = 0;   // hay plano: la ventana de puntos sobra

      // Auto-captura: la misma cara vista en DOS ticks seguidos (≈0.5 s) se
      // considera firme y se toma. La deshecha queda vetada para el modo
      // automático — sin esto, Deshacer no serviría de nada: la cara seguiría
      // bajo la mira y volvería a entrar sola medio segundo después.
      if (clase === 'inclinada' || carasObraRef.current.length >= 3) return;
      if (vetadaRef.current && vetadaRef.current.clase === clase
          && dot3(vetadaRef.current.plano.n, q.n) > 0.966) return;
      const prev = estableRef.current;
      if (prev && prev.clase === clase && dot3(prev.n, q.n) > 0.98) {
        prev.ticks += 1;
        if (prev.ticks >= 2) { intentaCapturar(q, clase, true); prev.ticks = 0; }
      } else {
        estableRef.current = { clase, n: q.n, ticks: 1 };
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, reticuloRef, puente]);

  // ── Paso 1: señalar caras en el modelo ────────────────────────────────────
  // La cámara SOLO se enciende en el paso de la obra. Hasta entonces esto
  // sigue siendo el visor de siempre: modelo iluminado, orbitable, con su
  // fondo. Encenderla antes es lo que convertía la entrada al AR en una
  // pantalla oscura con un modelo irreconocible.
  // Solo se avisa cuando CAMBIA. La función llega nueva en cada render, así
  // que sin esta guarda el efecto se dispararía continuamente y volvería a
  // apagar el visor en cada repintado.
  const camaraPuestaRef = useRef(null);
  useEffect(() => {
    // En el RESULTADO la cámara sigue encendida: los números se leen sobre la
    // obra y, al tocar Aplicar, el modelo aparece ya calzado en su sitio.
    const quiere = paso === 'obra' || paso === 'resultado';
    if (camaraPuestaRef.current === quiere) return;
    camaraPuestaRef.current = quiere;
    modoCamara?.(quiere);
  }, [paso, modoCamara]);

  const tocar = useCallback((ev) => {
    const plano = planoDelToque(viewer, ev.clientX, ev.clientY);
    if (!plano) { setAviso('Ahí no hay geometría: toca sobre una cara del modelo.'); return; }
    setAviso('');
    obsModeloRef.current = camaraDelVisor(viewer);
    setCarasModelo((prev) => {
      if (prev.length >= 3) return prev;
      // Una cara paralela a otra ya señalada no forma rincón: avisar YA.
      if (prev.some((c) => Math.abs(dot3(c.n, plano.n)) > 0.966)) {
        setAviso('Esa cara es paralela a una que ya señalaste: toca las tres caras del rincón.');
        return prev;
      }
      return [...prev, plano];
    });
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
  // Cada captura se valida EN EL MOMENTO — y la validación es LA MISMA para
  // el modo automático y el botón de respaldo. Aceptar en silencio y quejarse
  // al final, en Calcular, es descubrir el error cuando ya no se sabe cuál de
  // las tres capturas fue.
  const intentaCapturar = (plano, clase, silencioso) => {
    if (carasObraRef.current.length >= 3) return false;
    if (clase === 'inclinada') {
      if (!silencioso) setAviso('Esa cara está inclinada: la esquina necesita un piso a nivel y muros a plomo. Un talud no sirve.');
      return false;
    }
    // ¿Ya está capturada? Misma clase y normal casi igual = la misma cara (o
    // una paralela, que para el rincón es igual de inservible).
    if (carasObraRef.current.some((c) => c.clase === clase && dot3(c.plano.n, plano.n) > 0.966)) {
      if (!silencioso) setAviso('Ese ' + clase + ' ya está capturado: gira hacia la otra cara.');
      return false;
    }
    if (!silencioso) setAviso('');
    const cam = puente?.getArCamPos?.();
    if (cam) obsMundoRef.current = [...obsMundoRef.current, cam];
    setCarasObra((prev) => (prev.length >= 3 ? prev : [...prev, { plano, clase }]));
    return true;
  };

  const capturarObra = () => {
    if (afinandoRef.current) return;
    const r0 = reticuloRef?.current;
    if (!r0 || !r0.found || !r0.matrix) {
      setAviso('Todavía no hay superficie bajo el punto de mira. Muévete despacio y vuelve a intentarlo.');
      return;
    }
    if (r0.type === 'point' && !r0.oriented) {
      setAviso('Esos puntos aún no tienen orientación: acércate un poco al muro o apunta a un borde (zócalo, esquina) y vuelve a capturar.');
      return;
    }
    setAviso('');
    // El botón salta el veto: tocar es una orden explícita del operario.
    vetadaRef.current = null;

    const muestras = [];
    const TICKS = 12;                      // ~1.2 s a 100 ms
    let tick = 0;
    afinandoRef.current = setInterval(() => {
      tick += 1;
      setAfinando(tick / TICKS);
      const r = reticuloRef?.current;
      if (r && r.found && r.matrix && (r.type === 'plane' || r.oriented)) {
        const q = planoDesdePose(r.matrix);
        if (q) muestras.push(q);
      }
      if (tick < TICKS) return;

      clearInterval(afinandoRef.current);
      afinandoRef.current = null;
      setAfinando(0);

      if (muestras.length < 6) {
        setAviso('No se pudo fijar la cara: mantén la mira quieta sobre la superficie e inténtalo otra vez.');
        return;
      }
      // Promedio de normales y puntos. Si la nube de normales se dispersa,
      // el operario se movió o la superficie no es una cara: se rechaza.
      const nm = [0, 1, 2].map((i) => muestras.reduce((a, c) => a + c.n[i], 0) / muestras.length);
      const largo = Math.hypot(nm[0], nm[1], nm[2]) || 1;
      const n = nm.map((v) => v / largo);
      const disperso = muestras.some((c) => dot3(c.n, n) < 0.94);   // >20 grados
      if (disperso) {
        setAviso('La superficie no se ve estable (la normal baila). Apunta a una zona con más detalle y mantén firme.');
        return;
      }
      const pMedio = [0, 1, 2].map((i) => muestras.reduce((a, c) => a + c.p[i], 0) / muestras.length);
      intentaCapturar({ n, p: pMedio }, claseDeNormal(n), false);
    }, 100);
  };

  // Si el panel se desmonta a media captura, el afinado no puede quedar vivo.
  useEffect(() => () => {
    if (afinandoRef.current) clearInterval(afinandoRef.current);
  }, []);

  // Composición correcta: UNA cara horizontal (piso o techo) y DOS muros.
  const horizontales = carasObra.filter((c) => c.clase === 'piso' || c.clase === 'techo').length;
  const muros = carasObra.filter((c) => c.clase === 'muro').length;
  const composicionOk = carasObra.length === 3 && horizontales === 1 && muros === 2;

  // Donde se cortan las tres caras: el punto del rincón, en el mundo de AR.
  // Es lo que se pinta en pantalla — el "Corner detected!" de Revizto.
  useEffect(() => {
    esquinaRef.current = composicionOk ? cornerPoint(carasObra.map((c) => c.plano)) : null;
    if (!esquinaRef.current) setMarcador(null);
  }, [carasObra, composicionOk]);

  // COMO REVIZTO: no hay "Calcular" ni "Aplicar". Al señalar la tercera cara
  // del modelo se resuelve y, si sale bien, el modelo SE ACOMODA SOLO a la
  // realidad. El paso de resultado solo existe para el fallo — el éxito se ve
  // donde debe verse: en el modelo clavado en su sitio.
  const resueltoRef = useRef(false);
  const resolver = () => {
    if (resueltoRef.current) return;
    resueltoRef.current = true;
    // El observador del mundo es donde estaba el operario: se promedian las
    // tres capturas porque se mueve un poco entre una cara y otra.
    const obs = obsMundoRef.current;
    const obsMundo = obs.length
      ? [0, 1, 2].map((i) => obs.reduce((a, c) => a + c[i], 0) / obs.length)
      : null;
    const r = calibrarPorEsquina(carasModelo, carasObra.map((c) => c.plano), {
      upm, obsMundo, obsModelo: obsModeloRef.current,
    });
    setResultado(r);
    if (r.ok) {
      try {
        puente.setYawDegrees(r.yaw);
        puente.setModelOrigin(r.modelOrigin);
      } catch { /* lo dirá el panel técnico */ }
      mostrarModelo?.(true);
      onAplicar?.(r);
    } else {
      resueltoRef.current = false;   // el fallo se puede reintentar
      setPaso('resultado');
    }
  };

  useEffect(() => {
    if (paso === 'modelo' && carasModelo.length === 3) resolver();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, carasModelo]);

  const reiniciar = () => {
    setCarasModelo([]); setCarasObra([]); setResultado(null);
    obsMundoRef.current = []; obsModeloRef.current = null;
    vetadaRef.current = null; estableRef.current = null;
    resueltoRef.current = false;
    setAviso(''); setPaso('obra');
  };

  const caja = {
    position: 'absolute', left: '50%', bottom: 92, transform: 'translateX(-50%)',
    width: 'min(92vw, 460px)', background: 'rgba(12,14,17,0.94)', color: '#e6e8ea',
    border: '1px solid #2a2f35', borderRadius: 14, padding: 16,
    font: '14px/1.45 system-ui, sans-serif', zIndex: 40,
    // La raíz del AR es pointer-events:none para dejar pasar los gestos al
    // visor; TODO panel interactivo debe declararse 'auto'. Sin esta línea el
    // asistente era sordo: ni Empezar ni Cancelar recibían el clic.
    pointerEvents: 'auto',
  };

  // ── Indicador de paso ──────────────────────────────────────────────────
  // "¿En qué paso estoy?" no puede ser una pregunta. Tres fichas siempre a la
  // vista: la actual en azul, la hecha en verde, la pendiente apagada.
  const PASOS = [
    { id: 'obra', num: '1', nombre: 'Escanear obra' },
    { id: 'modelo', num: '2', nombre: 'Señalar modelo' },
    { id: 'resultado', num: '3', nombre: 'Resultado' },
  ];
  const ordenPaso = { intro: -1, obra: 0, modelo: 1, resultado: 2 };
  const fichas = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {PASOS.map((q, i) => {
        const actual = ordenPaso[paso] === i;
        const hecho = ordenPaso[paso] > i;
        return (
          <div
            key={q.id}
            style={{
              flex: 1, textAlign: 'center', padding: '5px 4px', borderRadius: 8,
              fontSize: 11.5, fontWeight: actual ? 700 : 500,
              background: actual ? '#1d4ed8' : hecho ? '#14532d' : '#1b1f24',
              color: actual ? '#fff' : hecho ? '#86efac' : '#6b7280',
              border: '1px solid ' + (actual ? '#1d4ed8' : hecho ? '#14532d' : '#2a2f35'),
            }}
          >
            {hecho ? '✓ ' : q.num + ' · '}{q.nombre}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {paso === 'obra' && marcador?.visible && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: 'calc(' + (marcador.x * 100).toFixed(2) + '% - 11px)',
            top: 'calc(' + (marcador.y * 100).toFixed(2) + '% - 11px)',
            width: 22, height: 22, borderRadius: '50%',
            background: '#2563eb', border: '3px solid #fff',
            boxShadow: '0 0 0 8px rgba(37,99,235,0.35)',
            zIndex: 39, pointerEvents: 'none',
          }}
        />
      )}
    <div style={caja}>
      {fichas}
      {paso === 'intro' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Calibrar por esquina</div>
          <p style={{ margin: '0 0 12px', color: '#a9b0b8' }}>
            Busca un rincón que exista igual en la obra y en el modelo: dos muros
            y el piso. Primero escaneas las tres caras aquí, con la cámara, y
            después las señalas en el modelo.
          </p>
          <p style={{ margin: '0 0 12px', color: '#7f8894', fontSize: 12.5 }}>
            Aún no empieza nada: la cámara se enciende al pulsar Empezar.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={botonFuerte} onClick={() => setPaso('obra')}>Empezar</button>
            <button type="button" style={boton} onClick={onCancelar}>Cancelar</button>
          </div>
        </>
      )}

      {paso === 'modelo' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Toca en el modelo la {NOMBRES[carasModelo.length] || 'última cara'}
          </div>
          <p style={{ margin: '0 0 10px', color: '#a9b0b8' }}>
            La cámara queda en pausa: gira y acerca el modelo con normalidad.
            Toca las mismas tres caras que escaneaste — el orden da igual. Al
            tocar la tercera, el modelo se acomoda solo a la realidad.
          </p>
          <div style={{ marginBottom: 10 }}>
            caras: {carasModelo.length} de 3 {carasModelo.length === 3 && `· ${resumen(carasModelo, (v) => v)}`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            Apunta a la {NOMBRES[carasObra.length] || 'última cara'} del rincón real
          </div>
          <p style={{ margin: '0 0 10px', color: '#a9b0b8' }}>
            Barre despacio el piso y los dos muros, quedándote en el mismo
            sitio. Las caras se capturan solas; cuando las tres coincidan verás
            el punto del rincón.
          </p>
          {composicionOk && (
            <div style={{
              marginBottom: 8, padding: '6px 10px', borderRadius: 8,
              background: '#1d4ed8', color: '#fff', fontWeight: 700, textAlign: 'center',
            }}>
              ¡Esquina detectada!
            </div>
          )}
          <div style={{ marginBottom: 6 }}>
            mira: <b>{mira || 'nada firme'}</b>
            {mira === 'inclinada' && ' (no sirve para la esquina)'}
          </div>
          {!mira && muros < 2 && (
            <div style={{ marginBottom: 8, color: '#8ab4f8', fontSize: 12.5 }}>
              Muro liso: apunta al zócalo, a una esquina o a un borde con
              detalle, acércate a 1–2 m, y usa el botón manteniendo firme.
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            capturado: {carasObra.length
              ? carasObra.map((c, i) => <span key={i}>{i > 0 && ' · '}{c.clase} ✓</span>)
              : 'nada aún'}
            {' '}({carasObra.length} de 3)
          </div>
          {carasObra.length === 3 && !composicionOk && (
            <div style={{ marginBottom: 10, color: '#e2b93b' }}>
              ⚠ Hacen falta un piso (o techo) y dos muros. Deshaz y captura la cara que falta.
            </div>
          )}
          {esSimulado() && (
            <div style={{ marginBottom: 10, color: '#8ab4f8', fontSize: 13 }}>
              Ensayo: teclas <b>1</b>, <b>2</b> y <b>3</b> para mirar al piso y a
              cada muro (mantén un segundo). <b>4</b>/<b>5</b>: rincón abierto
              (135°) / recto. <b>0</b> vuelve a la órbita.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={carasObra.length < 3 && (mira || afinando > 0) ? botonFuerte : { ...boton, opacity: 0.5 }}
              disabled={carasObra.length >= 3 || afinando > 0}
              onClick={capturarObra}
            >
              {afinando > 0
                ? 'Fijando… ' + Math.round(afinando * 100) + '% — mantén firme'
                : mira && mira !== 'inclinada' ? 'Capturar ' + mira : 'Capturar cara'}
            </button>
            <button
              type="button"
              style={composicionOk ? botonFuerte : { ...boton, opacity: 0.5 }}
              disabled={!composicionOk}
              onClick={() => setPaso('modelo')}
            >
              Continuar
            </button>
            <button
              type="button"
              style={boton}
              onClick={() => {
                const ultima = carasObra[carasObra.length - 1];
                if (ultima) vetadaRef.current = ultima;
                setCarasObra((p) => p.slice(0, -1));
              }}
            >
              Deshacer
            </button>
            <button
              type="button"
              style={boton}
              onClick={() => {
                setCarasObra([]); obsMundoRef.current = [];
                vetadaRef.current = null; estableRef.current = null; setAviso('');
              }}
            >
              Reiniciar
            </button>
          </div>
        </>
      )}

      {paso === 'resultado' && resultado && !resultado.ok && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No se pudo calibrar</div>
          <p style={{ margin: '0 0 10px', color: '#e2b93b' }}>{resultado.motivo}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={botonFuerte} onClick={reiniciar}>Repetir</button>
            <button type="button" style={boton} onClick={onCancelar}>Cancelar</button>
          </div>
        </>
      )}

      {aviso && <div style={{ marginTop: 10, color: '#e2b93b' }}>{aviso}</div>}
    </div>
    </>
  );
}

/** Teclas 1/2/3 del simulador: mirar al piso y a cada muro. Solo con ?arsim=1. */
export function useTeclasSimulador(activo) {
  useEffect(() => {
    if (!activo || !esSimulado()) return undefined;
    const alPulsar = (e) => {
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0) simMirarA(i);
      if (e.key === '0') simMirarA(null);
      // 4/5: cambia el rincón simulado entre abierto (135°) y recto. Para
      // ensayar rincones que no son de 90, que el motor admite igual.
      if (e.key === '4') simRinconAbierto(true);
      if (e.key === '5') simRinconAbierto(false);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [activo]);
}
