// CadViewer — ver DWG / Civil 3D / RVT / IFC dentro del CDE, con el visor de
// Autodesk que ya usamos en el Visor 3D.
//
// El visor es una librería JS gratuita: se carga desde el CDN de Autodesk y no
// cuesta nada embeberla. Lo que sí cuesta es la TRADUCCIÓN (Model Derivative),
// porque el visor no sabe leer un DWG — solo lee el SVF2 que produce esa
// traducción. Por eso se lanza al pulsar "Ver" y no al subir el archivo.
//
// El componente sólo orquesta: pide la traducción, espera mostrando progreso, y
// cuando hay URN monta el visor. Toda la lógica de APS vive en el backend.
import React, { useEffect, useRef, useState } from 'react';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import toast from 'react-hot-toast';

const VIEWER_JS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js';
const VIEWER_CSS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css';

// El script del visor pesa; se carga UNA vez y sólo cuando alguien abre un CAD.
let viewerScriptPromise = null;

// Una única petición de traducción por archivo en esta pestaña. Sin esto, un
// remontaje del visor lanzaba dos a la vez y Autodesk devolvía 409 Conflict a
// la segunda: la primera traducía bien y la segunda escribía "falló" encima.
const traduccionesEnCurso = new Map();
function pedirTraduccion(fileId, hacer) {
  if (!traduccionesEnCurso.has(fileId)) {
    traduccionesEnCurso.set(fileId, hacer().finally(() => traduccionesEnCurso.delete(fileId)));
  }
  return traduccionesEnCurso.get(fileId);
}
function loadViewerScript() {
  if (window.Autodesk?.Viewing) return Promise.resolve();
  if (viewerScriptPromise) return viewerScriptPromise;
  viewerScriptPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = VIEWER_CSS;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = VIEWER_JS;
    script.onload = () => resolve();
    script.onerror = () => { viewerScriptPromise = null; reject(new Error('No se pudo cargar el visor de Autodesk.')); };
    document.head.appendChild(script);
  });
  return viewerScriptPromise;
}

// Autodesk devuelve el avance como texto ("35% complete", "complete"). Se saca
// el numero para poder pintar una barra; si no hay numero, se devuelve null y se
// vuelve al giro.
function porcentajeDe(texto) {
  if (!texto) return null;
  if (/complete/i.test(texto) && !/\d/.test(texto)) return 100;
  const m = String(texto).match(/(\d{1,3})\s*%/);
  if (!m) return null;
  return Math.min(100, Math.max(0, parseInt(m[1], 10)));
}

function formatoReloj(segundos) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// EL ZOOM DEL CAD, al QUINTO intento: se intercepta la rueda.
//
// HISTORIA, porque explica por que este es el enfoque correcto y no otro
// parche mas: el perfil "AEC" del visor trae reverseMouseZoomDir = true, asi
// que se probo poner esa bandera en `false` (intentos 1, 3 y 4, este ultimo
// con un oyente que la devolvia cada vez que el perfil la cambiaba) y en
// `true` (intento 2). EL RESULTADO FUE EL MISMO LAS CINCO VECES. Si cambiar
// una bandera en AMBOS sentidos no altera el comportamiento, esa bandera NO
// gobierna la rueda en esta vista. Seguir tocandola era adivinar.
//
// Se deja de negociar con su configuracion: la rueda se captura ANTES de que
// el visor la vea, se invierte y se le entrega ya corregida. No depende de
// su version, ni de su perfil, ni de que herramienta este activa.
//
// SOLO en el visor CAD de la web -- el visor 3D principal no se toca, que
// alli la rueda ya se comporta como debe.
const RUEDA_INVERTIDA = true;   // si algun dia sobra, se pone en false

// ── QUÉ ES CADA VISTA, según lo que el documento DICE de verdad ─────────────
//
// Antes se clasificaba por el NOMBRE: todo lo que no fuera `role === '3d'` se
// llamaba «Lámina». Volcando los dos archivos reales se ve que el nombre no es
// la identidad:
//
//   DWG   «2D View»  role 2d  is2D() true   padre «Model»  viewableID «Model»
//         «3D View»  role 3d  is3D() true   padre «Model»  viewableID «Model-3D»
//   RVT   «{3D}»     role 3d  is3D() true   padre «Vista 3D»
//
// O sea: en un DWG, la vista del espacio modelo NO se llama «Model» -- se llama
// «2D View» y es su PADRE el que se llama «Model». Por eso la regla anterior
// («abre la vista llamada Model») no encontraba nada y caía a la 3D, y por eso
// el espacio modelo salía rotulado como «Lámina».
//
// Aquí sólo se afirma lo demostrado: 2D o 3D con los métodos del propio nodo, y
// «espacio modelo» cuando el documento lo identifica como tal. Lo demás
// conserva su nombre real: no se inventa «Layout» ni «Lámina» para subtipos que
// no se han podido comprobar.
const ID_ESPACIO_MODELO = 'Model';

function esEspacioModelo(n) {
  return String(n?.data?.viewableID || '') === ID_ESPACIO_MODELO && esVista2D(n);
}
function esVista2D(n) {
  if (typeof n?.is2D === 'function') return n.is2D();
  return n?.data?.role === '2d';            // respaldo si el nodo no trae el método
}
function esVista3D(n) {
  if (typeof n?.is3D === 'function') return n.is3D();
  return n?.data?.role === '3d';
}
function describirVista(n) {
  return {
    guid: n.data.guid,
    nombre: n.data.name || 'Sin nombre',
    es2D: esVista2D(n),
    es3D: esVista3D(n),
    // Etiqueta SÓLO cuando el dato la sostiene. `null` = sin etiqueta.
    etiqueta: esEspacioModelo(n) ? 'Espacio modelo' : null,
  };
}

function interceptarRueda(contenedor, dameVisor) {
  if (!contenedor || !RUEDA_INVERTIDA) return () => {};

  // SE LE CAMBIA EL SIGNO AL EVENTO, NO SE FABRICA OTRO.
  //
  // El intento anterior cancelaba la rueda del usuario (preventDefault +
  // stopPropagation) y despachaba una COPIA invertida. Eso tiene un fallo
  // grave: si el visor no atiende la copia -- por como registre sus oyentes,
  // por el elemento donde la reciba, o por cualquier detalle de su version --
  // el usuario se queda SIN RUEDA. Y quedarse sin zoom es peor que tenerlo al
  // reves. Fue lo que paso.
  //
  // Aqui no se cancela nada: se deja pasar el MISMO evento del usuario y solo
  // se le sombrean sus lecturas de desplazamiento con el valor opuesto. El
  // visor lo recibe por su camino de siempre y lee el signo cambiado.
  //
  // La propiedad de esto que importa: EL PEOR CASO ES QUE VUELVA A ESTAR
  // INVERTIDO, nunca que deje de funcionar. Si el navegador no dejara
  // redefinir, el evento sigue intacto y la rueda se comporta como siempre.
  //
  // Se sombrean tambien las lecturas antiguas (wheelDelta*) porque no todo el
  // codigo del visor lee `deltaY`.
  // ── PERO NO SIEMPRE. AQUÍ ESTABA EL FALLO CON REVIT ──────────────────────
  //
  // El visor NO trae la misma convención para todos los archivos: aplica un
  // PERFIL según el modelo, y ese perfil decide el sentido de la rueda.
  // Medido en producción sobre los dos archivos:
  //
  //     DWG  ->  perfil «Default»,  reverseDolly = false
  //     RVT  ->  perfil «AEC»,      reverseDolly = true
  //
  // Invirtiendo siempre, el DWG salía bien y el Revit quedaba invertido DOS
  // veces. (Esto explica también por qué los cinco intentos anteriores de
  // pelear con la bandera «no cambiaban nada»: se probaban sobre un DWG, donde
  // ya valía `false`.)
  //
  // La regla del producto es una sola, y es la del usuario, no la del
  // dispositivo: EMPUJAR LA RUEDA HACIA ADELANTE ACERCA. Así que sólo se
  // corrige cuando hace falta; si el visor ya invierte por su perfil, se le
  // deja hacer. No se toca su estado: la bandera se LEE, nunca se escribe, y
  // por eso el zoom por arrastre, la órbita, el encuadre y el ajuste siguen
  // exactamente como están.
  const yaInvierteElVisor = () => {
    try { return dameVisor?.()?.navigation?.getReverseZoomDirection?.() === true; }
    catch { return false; }   // ante la duda, el comportamiento de siempre
  };

  const alRodar = (e) => {
    if (e.__alephiaGirada) return;
    if (yaInvierteElVisor()) return;
    try {
      Object.defineProperty(e, '__alephiaGirada', { value: true });
      const opuestos = {
        deltaY: -e.deltaY, deltaX: -e.deltaX, deltaZ: -e.deltaZ,
        wheelDelta: -(e.wheelDelta || 0),
        wheelDeltaY: -(e.wheelDeltaY || 0),
        wheelDeltaX: -(e.wheelDeltaX || 0),
      };
      for (const nombre of Object.keys(opuestos)) {
        Object.defineProperty(e, nombre, {
          value: opuestos[nombre], configurable: true,
        });
      }
    } catch (_) {
      // Sin poder redefinir, mejor la rueda normal que ninguna rueda.
    }
  };

  // CAPTURA: hay que llegar antes que el visor, que escucha en su lienzo.
  // `passive: true` porque ya no se llama a preventDefault -- y asi el
  // navegador nunca tiene que esperarnos para desplazar.
  contenedor.addEventListener('wheel', alRodar, { capture: true, passive: true });
  return () => contenedor.removeEventListener('wheel', alRodar, { capture: true });
}

/**
 * PanelContenido — qué hay dentro del archivo, y cómo ir a ello.
 *
 * No decide nada: recibe las vistas ya descritas y devuelve el `guid` elegido.
 * El filtro es local sobre lo que ya está cargado -- ni una petición más.
 */
function PanelContenido({ vistas, vistaActiva, onElegir }) {
  const dosD = vistas.filter(v => v.es2D);
  const tresD = vistas.filter(v => v.es3D);
  // La pestaña abierta es la de la vista que se está viendo: abrir en la otra
  // obligaría a buscar dónde está uno.
  const laDeLaActiva = tresD.some(v => v.guid === vistaActiva) ? '3D' : '2D';
  const [pestana, setPestana] = React.useState(dosD.length ? laDeLaActiva : '3D');
  const [filtro, setFiltro] = React.useState('');

  const termino = filtro.trim().toLowerCase();
  const lista = (pestana === '3D' ? tresD : dosD)
    .filter(v => !termino || v.nombre.toLowerCase().includes(termino));

  const pestanita = (id, n) => (
    <button key={id} onClick={() => setPestana(id)} disabled={!n}
      style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, cursor: n ? 'pointer' : 'default',
               background: 'none', border: 'none', color: !n ? '#c2c8d0' : pestana === id ? 'var(--accent)' : '#6b7480',
               borderBottom: `2px solid ${pestana === id && n ? 'var(--accent)' : 'transparent'}` }}>
      {id}{n ? ` (${n})` : ''}
    </button>
  );

  return (
    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, width: 236,
                  background: '#fff', border: '1px solid #e2e6ea', borderRadius: 6,
                  boxShadow: '0 4px 16px rgba(16,24,40,0.12)', overflow: 'hidden',
                  fontSize: 13, color: '#333' }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12.5, borderBottom: '1px solid #eef1f4' }}>
        Contenido
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid #eef1f4' }}>
        {pestanita('2D', dosD.length)}
        {pestanita('3D', tresD.length)}
      </div>
      <div style={{ padding: '8px 10px 6px' }}>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por nombre…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 12.5,
                   border: '1px solid #dfe3e8', borderRadius: 4, outline: 'none' }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '0 6px 8px' }}>
        {lista.length === 0 ? (
          <div style={{ padding: '10px 6px', fontSize: 12, color: '#8b939e' }}>
            {termino ? 'Ninguna vista con ese nombre.' : 'Sin vistas en esta pestaña.'}
          </div>
        ) : lista.map(v => {
          const activa = v.guid === vistaActiva;
          return (
            <button key={v.guid} onClick={() => onElegir(v.guid)} title={v.nombre}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                       marginBottom: 2, border: 'none', borderRadius: 4, cursor: 'pointer',
                       background: activa ? '#eaf2fa' : 'transparent',
                       color: activa ? 'var(--accent)' : '#333',
                       fontWeight: activa ? 600 : 400, fontSize: 12.5 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.nombre}
              </span>
              {/* Sólo se rotula lo que el documento sostiene. */}
              {v.etiqueta && (
                <span style={{ display: 'block', fontSize: 11, color: '#8b939e', fontWeight: 400 }}>{v.etiqueta}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CadViewer({ file, projectPrefix = '', urnDirecto = null }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [phase, setPhase] = useState('preparando');   // preparando | traduciendo | listo | error
  const [progress, setProgress] = useState('');
  const [transcurrido, setTranscurrido] = useState(0);
  const [puedeReintentar, setPuedeReintentar] = useState(false);
  // Subirlo vuelve a lanzar el efecto de preparacion. Es la forma de
  // reintentar sin duplicar la logica de arranque fuera del efecto.
  const [intento, setIntento] = useState(0);
  const [detalle, setDetalle] = useState('');
  const [vistas, setVistas] = useState([]);
  const [vistaActiva, setVistaActiva] = useState(null);
  const documentoRef = useRef(null);
  const soltarRueda = useRef(null);

  // Un reloj que corre. Aunque Autodesk no de porcentaje durante el envio, ver
  // el tiempo avanzar es la diferencia entre "esta trabajando" y "se colgo".
  useEffect(() => {
    if (phase === 'listo' || phase === 'error') return undefined;
    const t = setInterval(() => setTranscurrido(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const pct = porcentajeDe(progress);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const fail = (msg) => {
      if (cancelled) return;
      setError(msg);
      setPhase('error');
    };

    // Monta el visor con el URN ya traducido.
    const mount = async (urn) => {
      try {
        await loadViewerScript();
      } catch (e) {
        return fail(e.message);
      }
      if (cancelled || !containerRef.current) return;

      const Autodesk = window.Autodesk;
      Autodesk.Viewing.Initializer({
        env: 'AutodeskProduction2',
        api: 'streamingV2',
        // El token lo sirve nuestro backend (2-legged). El navegador nunca ve
        // las credenciales de APS.
        getAccessToken: (onToken) => {
          apiFetch(`${API}/api/token`)
            .then(r => r.json())
            .then(d => onToken(d.access_token, 3000))
            .catch(() => fail('No se pudo obtener el token de Autodesk.'));
        },
      }, () => {
        if (cancelled || !containerRef.current) return;
        // TEMA DECLARADO. Este es el unico visor del portal, que es claro; el
        // SDK trae 'dark-theme' por defecto y hasta hoy la barra de Autodesk
        // salia oscura dentro de una app clara porque nadie lo decidia.
        // A diferencia de los demas, aqui SI hay delta visual: es el cambio
        // que se busca.
        const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current,
                                                        { theme: 'light-theme' });
        viewer.start();
        viewerRef.current = viewer;
        // La rueda, corregida en el borde (ver interceptarRueda).
        if (soltarRueda.current) soltarRueda.current();
        // Se le pasa una FORMA DE PREGUNTAR por el visor, no el visor: el
        // perfil se aplica al cargar el modelo, después de esta línea, y puede
        // cambiar al cambiar de vista. La decisión se toma en cada rueda.
        soltarRueda.current = interceptarRueda(containerRef.current, () => viewerRef.current);
        Autodesk.Viewing.Document.load(
          `urn:${urn}`,
          (doc) => {
            if (cancelled) return;

            // TODAS las vistas del modelo, no solo la primera. Un Revit trae
            // dentro sus laminas y sus vistas 3D, y el visor cargaba la que
            // Autodesk marca por defecto — que en un plano de obra suele ser la
            // CARATULA. Se abria el modelo y lo que se veia era el membrete.
            // ACC ofrece un selector; aqui no habia ninguno.
            const raiz = doc.getRoot();
            const todas = raiz.search({ type: 'geometry' }) || [];
            documentoRef.current = doc;
            setVistas(todas.map(v => describirVista(v)));

            // MODEL PRIMERO (peticion del dueno). En un DWG de Civil, el
            // espacio modelo es donde esta el dibujo de verdad; las demas
            // vistas son presentaciones. Autodesk suele marcar por defecto una
            // lamina —a menudo la caratula—, y se abria el membrete.
            //
            // La regla buscaba una vista LLAMADA «Model» y en el DWG real no
            // existe tal nombre, asi que nunca acertaba y se caia al 3D: por
            // eso un plano abria en tres dimensiones. Ahora se busca por lo que
            // el documento declara (`viewableID === 'Model'` y 2D), que es lo
            // medido. Detras se conserva ENTERA la cadena anterior, asi que un
            // archivo donde esto no aplique se comporta igual que hasta hoy --
            // y un Revit, que no tiene espacio modelo, sigue abriendo en 3D.
            const esModel = (v) => /^\s*model\s*$/i.test(v.data.name || '');
            const node = todas.find(esEspacioModelo)
                      || todas.find(esModel)
                      || todas.find(v => v.data.role === '3d')
                      || raiz.getDefaultGeometry();
            if (!node) return fail('La traducción no produjo ninguna vista visible.');
            setVistaActiva(node.data.guid);
            viewer.loadDocumentNode(doc, node).then(() => {
              if (cancelled) return;
              setPhase('listo');
            });
          },
          (code, msg) => fail(`No se pudo abrir el modelo (${code}): ${msg || ''}`)
        );
      });
    };

    // Consulta el estado hasta que la traducción termine.
    //
    // EL PRIMER 502 NO ES EL FINAL. La instancia gratuita de Render se
    // reinicia y se despierta a su ritmo, y justo durante una traducción
    // larga es cuando más se nota (el dueño lo vio: dos 502, un 503 y la
    // pantalla rendida — mientras el trabajo seguía vivo en Autodesk). El
    // sondeo aguanta ~2 minutos de fallos seguidos antes de rendirse.
    let fallosSeguidos = 0;
    const reintentarPoll = (motivo) => {
      if (cancelled) return;
      fallosSeguidos += 1;
      if (fallosSeguidos > 20) return fail(motivo);
      if (fallosSeguidos > 2) setProgress('reconectando con el servidor…');
      timer = setTimeout(poll, 6000);
    };
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await apiFetch(`${API}/api/docs/cad/status?node_id=${encodeURIComponent(file.id)}`);
        const d = await r.json();
        if (cancelled) return;
        if (!d.success) return reintentarPoll(d.error || 'No se pudo consultar el estado.');
        fallosSeguidos = 0;
        if (d.status === 'success') return mount(d.urn);
        if (d.status === 'retry_plain') {
          // El paquete con la imagen adjunta fracasó; el backend ya se rindió
          // con ella. Se pide de nuevo, ahora del dibujo suelto.
          setAviso(d.aviso || '');
          setPhase('preparando');
          return arrancar();
        }
        if (d.status === 'failed' || d.status === 'timeout') {
          // El mensaje anterior acusaba SIEMPRE al archivo ("puede estar dañado"),
          // y eso deja al usuario sin salida y buscando donde no es. Pasó de
          // verdad con un Revit de 159 MB: Autodesk respondió "Tr worker fail to
          // download", el fichero estaba intacto (mismo tamaño y misma firma que
          // el original) y al reintentar tradujo sin tocar nada. Era un fallo
          // suyo, transitorio.
          setDetalle(d.detalle || '');
          setPuedeReintentar(true);
          return fail(d.detalle && /download|internal|timeout/i.test(d.detalle)
            ? 'Autodesk no pudo procesarlo esta vez. Suele ser temporal: vuelve a intentarlo.'
            : 'Autodesk no pudo traducir este dibujo: puede estar dañado o guardado en un formato que su traductor no admite.');
        }
        if (d.status === 'none') {
          // APS no tiene nada de este archivo: la subida no llegó a cuajar.
          // Se pide una vez más en lugar de sondear un trabajo inexistente.
          return fail('La preparación no llegó a iniciarse. Cierra y vuelve a abrir el archivo.');
        }
        setProgress(d.progress || '');
        timer = setTimeout(poll, 4000);
      } catch {
        reintentarPoll('Se perdió la conexión mientras se preparaba el archivo.');
      }
    };

    const arrancar = async () => {
      try {
        const d = await pedirTraduccion(file.id + ':' + Date.now(), async () => {
          const r = await apiFetch(`${API}/api/docs/cad/translate`, {
            method: 'POST',
            body: JSON.stringify({ node_id: file.id }),
          });
          return r.json();
        });
        if (cancelled) return;
        if (!d.success) return fail(d.error || 'No se pudo preparar el archivo.');
        if (d.status === 'success') return mount(d.urn);
        setPhase('traduciendo');
        poll();
      } catch {
        fail('No se pudo contactar con el servidor.');
      }
    };

    // VISTA POR ENLACE: el URN llega ya traducido y se monta DIRECTO. No se
    // pide traduccion porque un invitado no puede gastar creditos -- eso lo
    // decidio el backend antes de darnos este URN.
    if (urnDirecto) mount(urnDirecto);
    else arrancar();

    return () => {
      cancelled = true;
      if (soltarRueda.current) { soltarRueda.current(); soltarRueda.current = null; }
      if (timer) clearTimeout(timer);
      try { viewerRef.current?.finish(); } catch { /* el visor ya podría estar destruido */ }
      viewerRef.current = null;
    };
  }, [file.id, intento, urnDirecto]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#2b2f36' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Aviso discreto: el plano se ve, solo faltó algo accesorio. No es un
          error y no debe ocupar la pantalla como si lo fuera. */}
      {aviso && phase === 'listo' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          maxWidth: '80%', background: 'rgba(20,22,26,0.92)', color: '#dfe3e9',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
          padding: '8px 14px', fontSize: 12.5, lineHeight: 1.45, zIndex: 5,
        }}>
          {aviso}
          <button onClick={() => setAviso('')} style={{
            marginLeft: 12, background: 'none', border: 'none', color: '#98a1ad',
            cursor: 'pointer', fontSize: 13,
          }}>✕</button>
        </div>
      )}

      {/* CONTENIDO. Solo aparece si hay mas de una vista: en un plano suelto
          estorbaria.

          Era un <select>. Un desplegable esconde lo que hay dentro: para saber
          si un modelo trae laminas hay que abrirlo, y con veinte vistas no se
          puede buscar. Esto es lo minimo que lo arregla -- separar 2D de 3D,
          poder filtrar por nombre, y ver la lista entera -- sin cambiar NADA
          de como se carga: el clic llama al mismo `loadDocumentNode` que
          llamaba el desplegable. */}
      {phase === 'listo' && vistas.length > 1 && (
        <PanelContenido
          vistas={vistas}
          vistaActiva={vistaActiva}
          onElegir={(guid) => {
            const doc = documentoRef.current;
            const viewer = viewerRef.current;
            if (!doc || !viewer) return;
            const node = (doc.getRoot().search({ type: 'geometry' }) || [])
              .find(n => n.data.guid === guid);
            if (!node) return;
            setVistaActiva(guid);
            viewer.loadDocumentNode(doc, node);
          }}
        />
      )}

      {phase !== 'listo' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          background: '#2b2f36', color: '#dfe3e9', textAlign: 'center', padding: 24,
        }}>
          {phase === 'error' ? (
            <>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e57373" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16" />
              </svg>
              <div style={{ fontSize: 14, maxWidth: 460, lineHeight: 1.5 }}>{error}</div>
              {detalle && (
                <div style={{ fontSize: 12, color: '#8b939e', maxWidth: 460, fontFamily: 'monospace' }}>
                  {detalle}
                </div>
              )}
              {puedeReintentar && (
                <button
                  onClick={() => { setPuedeReintentar(false); setDetalle(''); setError(''); setTranscurrido(0); setPhase('preparando'); setIntento(n => n + 1); }}
                  style={{ marginTop: 6, padding: '7px 18px', fontSize: 13, cursor: 'pointer',
                           background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5 }}>
                  Volver a intentarlo
                </button>
              )}
              {/* Este enlace apuntaba a una ruta de descarga que NUNCA existio
                  en el backend: llevaba roto desde que se escribio, y nadie lo
                  noto porque solo aparece cuando la traduccion CAD falla.
                  Y despues llevaba el TOKEN DE SESION en la direccion, que es
                  la llave escrita en el historial del navegador. Ahora se pide
                  una URL FIRMADA -- misma via que el lector y el menu del clic
                  derecho -- que caduca sola y no lleva identidad dentro. */}
              <button type="button"
                onClick={async () => {
                  const ventana = window.open('', '_blank', 'noopener');
                  try {
                    const r = await apiFetch(`${API}/api/docs/signed-url?urn=${encodeURIComponent(file.gcs_urn || '')}&model_urn=${encodeURIComponent(projectPrefix || '')}`);
                    const d = await r.json().catch(() => ({}));
                    if (!r.ok || !d.success || !d.url) throw new Error(d.error || 'No se pudo preparar la descarga.');
                    if (ventana) ventana.location = d.url; else window.open(d.url, '_blank', 'noopener');
                  } catch (e) {
                    if (ventana) ventana.close();
                    toast.error(e.message || 'No se pudo descargar el archivo original.');
                  }
                }}
                style={{ fontSize: 13, color: '#7fb3d5', marginTop: 4, background: 'none',
                         border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>
                Descargar el archivo original
              </button>
            </>
          ) : (
            <>
              {/* Un giro sin numeros no dice si avanza o si se colgo, y es lo que
                  desespera al que espera. Aqui hay siempre algo que se mueve:
                  durante el envio, el reloj y el tamano; durante la traduccion,
                  el porcentaje real que da Autodesk. */}
              {pct === null ? <div className="adsk-spinner" /> : (
                <div style={{ width: 260, height: 6, background: '#3a3f47', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#7fb3d5', transition: 'width .4s' }} />
                </div>
              )}
              <div style={{ fontSize: 14 }}>
                {phase === 'preparando' ? 'Enviando el archivo a Autodesk…' : 'Traduciendo el modelo…'}
                {pct !== null ? ` ${pct}%` : (progress ? ` ${progress}` : '')}
              </div>
              <div style={{ fontSize: 12, color: '#98a1ad', display: 'flex', gap: 14 }}>
                <span>{formatoReloj(transcurrido)}</span>
                {file?.size ? <span>{(file.size / 1048576).toFixed(0)} MB</span> : null}
              </div>
              <div style={{ fontSize: 12, color: '#98a1ad', maxWidth: 430, lineHeight: 1.5 }}>
                {phase === 'preparando'
                  ? 'Todavía no hay porcentaje: Autodesk no conoce el archivo hasta que termina el envío. Va por tamaño.'
                  : 'La primera vez tarda unos minutos según el tamaño. Las siguientes aperturas son inmediatas.'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
