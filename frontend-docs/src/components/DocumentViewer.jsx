// frontend-docs/src/components/DocumentViewer.jsx
import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import PDFViewer from './PDFViewer';
import SelloEscritorio from './SelloEscritorio';
import { apiFetch } from '../utils/apiFetch';
import { getRecentPdfUrl } from '../utils/recentPdfCache';
import { urlFirmadaEnMano, pedirUrlFirmada } from '../utils/urlFirmada';
import toast from 'react-hot-toast';

// El visor CAD arrastra el visor de Autodesk: diferido para que no pese en el
// arranque de quien nunca abre un DWG.
const CadViewer = lazy(() => import('./CadViewer'));

// Formatos que Model Derivative sabe traducir. Debe ir en paralelo con
// CAD_EXTENSIONS de backend/routes/docs_cad.py.
const CAD_EXTENSIONS = [
  '.dwg', '.dxf', '.dwf', '.dwfx', '.rvt', '.rfa', '.ifc', '.nwd', '.nwc',
  '.dgn', '.3dm', '.sat', '.step', '.stp', '.iges', '.igs', '.obj', '.fbx', '.stl',
];

// Utility formatters
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DocumentViewer({
  file,
  projectPrefix,
  isShared = false,
  sharedRole = null,
  
  versionHistory = [],
  viewedVersionInfo = null,
  setViewedVersionInfo = null,
  showVersions = false,
  setShowVersions = null,
  
  isAdmin = false,
  onPromote = null,
  
  API,
  onClose,
  // La tira de la carpeta (boton de cuadricula del lector, como ACC):
  // el explorador YA tiene la lista de la carpeta abierta, asi que se
  // pasa tal cual -- ni una peticion nueva por abrir un plano.
  hermanos = [],
  onAbrirHermano = null,
}) {

  const [officeUrl, setOfficeUrl] = useState('');
  const [loadingOffice, setLoadingOffice] = useState(false);
  const [securePreviewUrl, setSecurePreviewUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [conectorAviso, setConectorAviso] = useState(null);
  // CAD POR ENLACE PUBLICO (decision del dueno, 28-ago): si alguien de la
  // obra ya lo tradujo, el invitado lo VE; si no, se le ofrece descargarlo.
  // Un invitado nunca dispara una traduccion -- el coste manda.
  const [cadCompartido, setCadCompartido] = useState(null);
  useEffect(() => {
    if (!isShared || !file?.shareId) return;
    const abrible = CAD_EXTENSIONS.some(e => (file.name || '').toLowerCase().endsWith(e))
      || /\.pdfx?$/i.test(file.name || '');
    if (!abrible) return;
    fetch(`${API}/api/docs/cad/compartido/${file.shareId}`)
      .then(r => r.json())
      .then(d => setCadCompartido(d && d.success ? d : { listo: false }))
      .catch(() => setCadCompartido({ listo: false }));
  }, [isShared, file, API]);

  // El original FIRMADO se pide al ABRIR un CAD, no al pulsar el boton. En el
  // plan gratuito de Render el backend se duerme a los 15 min y despierta en
  // ~30-50 s: pedir la URL en el clic convertia «Abrir en Revit» en medio
  // minuto MUDO (lo reporto el dueno: «¿estara cargando o que?»). Pedida
  // aqui, el clic la tiene lista; si caduca de vieja, el clic la renueva
  // avisando en pantalla.
  const firmadaRef = useRef({ urn: null, url: '', ts: 0 });
  useEffect(() => {
    if (!file || isShared) return;
    const abrible = CAD_EXTENSIONS.some(e => (file.name || '').toLowerCase().endsWith(e))
      || /\.pdfx?$/i.test(file.name || '');
    if (!abrible) return;
    const urn = viewedVersionInfo?.gcs_urn || file.gcs_urn;
    if (!urn || firmadaRef.current.urn === urn) return;
    apiFetch(`${API}/api/docs/signed-url?urn=${encodeURIComponent(urn)}&model_urn=${encodeURIComponent(projectPrefix)}`)
      .then(r => r.json())
      .then(d => {
        if (d?.success && d.url) firmadaRef.current = { urn, url: d.url, ts: Date.now() };
      })
      .catch(() => { /* el clic tiene su propio camino con aviso */ });
  }, [file, viewedVersionInfo, projectPrefix, isShared, API]);

  useEffect(() => {
    if (!file) return;
    
    const lowerName = file.name.toLowerCase();
    if (['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext))) {
      // Si es enlace compartido, ya tenemos la URL firmada
      if (isShared && file.url) {
        queueMicrotask(() => setOfficeUrl(file.url));
        return;
      }
      
      // Lógica interna (plataforma)
      queueMicrotask(() => setLoadingOffice(true));
      const urn = viewedVersionInfo?.gcs_urn || file.gcs_urn;
      const url = urn 
        ? `${API}/api/docs/signed-url?urn=${encodeURIComponent(urn)}&model_urn=${encodeURIComponent(projectPrefix)}`
        : `${API}/api/docs/signed-url?path=${encodeURIComponent(file.fullName)}&model_urn=${encodeURIComponent(projectPrefix)}`;

      apiFetch(url)
        .then(r => r.json())
        .then(data => {
          if (data.success) setOfficeUrl(data.url);
          else console.error("Error fetching signed URL:", data.error);
        })
        .catch(err => console.error("Fetch Office URL error:", err))
        .finally(() => setLoadingOffice(false));
    } else {
      queueMicrotask(() => {
        setOfficeUrl('');
        setLoadingOffice(false);
      });
    }
  }, [file, viewedVersionInfo, projectPrefix, isShared, API]);

  useEffect(() => {
    if (!file) return undefined;
    const lowerName = file.name.toLowerCase();
    const isOffice = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext));
    const isPdf = lowerName.endsWith('.pdf') || lowerName.endsWith('.pdfx');
    if (isShared || isOffice) {
      queueMicrotask(() => {
        setSecurePreviewUrl(isShared ? (file.url || '') : '');
        setLoadingPreview(false);
        setPreviewError('');
      });
      return undefined;
    }

    const recentPdfUrl = isPdf && !viewedVersionInfo
      ? getRecentPdfUrl({
          nodeId: file.id,
          version: file.version || 1,
          gcsUrn: file.gcs_urn,
        })
      : null;
    if (recentPdfUrl) {
      queueMicrotask(() => {
        setSecurePreviewUrl(recentPdfUrl);
        setLoadingPreview(false);
        setPreviewError('');
      });
      return undefined;
    }

    let cancelled = false;
    const urn = viewedVersionInfo?.gcs_urn || file.gcs_urn;

    // ¿YA ESTABA AUTORIZADA? Entonces el clic no espera nada aqui.
    // El lector va preparando las de las laminas vecinas mientras miras la
    // actual (ver `prepararVecinas`), asi que al saltar por la cinta esta
    // fase --que llego a costar OCHO SEGUNDOS en produccion-- desaparece.
    const yaAutorizada = urn ? urlFirmadaEnMano(urn) : null;
    if (yaAutorizada) {
      queueMicrotask(() => {
        if (cancelled) return;
        setSecurePreviewUrl(yaAutorizada);
        setLoadingPreview(false);
        setPreviewError('');
      });
      return () => { cancelled = true; };
    }

    const url = urn
      ? `${API}/api/docs/signed-url?urn=${encodeURIComponent(urn)}&model_urn=${encodeURIComponent(projectPrefix)}`
      : `${API}/api/docs/signed-url?path=${encodeURIComponent(file.fullName)}&model_urn=${encodeURIComponent(projectPrefix)}`;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingPreview(true);
      setPreviewError('');
      // LA URL ANTERIOR NO SE BORRA. Borrarla dejaba a la vista sin nada que
      // pintar, y la rama de «Preparando vista segura...» de mas abajo
      // devolvia el spinner EN LUGAR DEL LECTOR: React lo desmontaba entero
      // -- con su cinta, su documento en memoria y todo su estado -- y lo
      // volvia a construir de cero al llegar la URL nueva.
      //
      // Ese era el motivo de que al pulsar otra lamina «desapareciera todo,
      // incluida la cinta». Manteniendo la anterior, el lector sigue montado
      // mostrando el plano previo hasta que llega el nuevo, que es como se
      // comporta ACC.
    });
    // Con urn se pasa por el almacen compartido (asi queda guardada para la
    // proxima). Sin urn --ficheros antiguos sin identificador-- se pide como
    // siempre: no hay clave con la que guardarla.
    (urn ? pedirUrlFirmada(urn, projectPrefix) : apiFetch(url)
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success || !data.url) throw new Error(data.error || 'No se pudo autorizar la vista previa');
        return data.url;
      }))
      .then(u => { if (!cancelled) setSecurePreviewUrl(u); })
      .catch(err => {
        if (!cancelled) setPreviewError(err.message || 'No se pudo abrir el archivo');
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => { cancelled = true; };
  }, [file, viewedVersionInfo, projectPrefix, isShared, API, previewRetry]);

  if (!file) return null;

  // UNA SOLA BARRA PARA LOS PLANOS (como ACC).
  //
  // El lector ya lleva nombre, versión y cierre: repetir aquí la cabecera del
  // expediente daba DOS barras apiladas y 100 px de cromo por delante del
  // plano. Para los PDF la cabecera se calla y el lector manda; el desplegable
  // de versiones sigue siendo el mismo, solo que flota sobre el documento.
  const esPdf = /\.pdfx?$/i.test(file.name || '');
  // CAD/BIM tienen aplicacion de escritorio (Revit, Civil 3D, Navisworks).
  // Un navegador NO puede lanzarlas -- eso exige un agente instalado, que es
  // exactamente lo que hace el Desktop Connector de ACC --, pero SI puede
  // entregar el ORIGINAL con su nombre real por URL firmada: al abrirlo,
  // Windows lo lleva a la aplicacion asociada.
  const esCad = CAD_EXTENSIONS.some(e => (file.name || '').toLowerCase().endsWith(e));

  // EL PDF TAMBIEN SE PUEDE ABRIR EN EL ESCRITORIO, y no hizo falta tocar el
  // Conector: no mira la extension. Descarga el original con su nombre real y
  // deja que Windows lo lleve a la aplicacion asociada -- Acrobat, Bluebeam,
  // el lector que cada uno tenga. Es el mismo camino que Revit y Civil 3D.
  const esPdfDeEscritorio = /\.pdfx?$/i.test(file.name || '');
  const abribleEnEscritorio = esCad || esPdfDeEscritorio;

  // El boton dice A DONDE va, no un generico: Revit para RVT, Civil 3D para
  // DWG, Navisworks para NWD — con su sello de letra. (Peticion del dueno:
  // «para abrir Civil o Revit debe aparecer el icono segun corresponda».)
  const appEscritorio = (() => {
    const n = (file.name || '').toLowerCase();
    if (/\.(rvt|rfa|rte)$/.test(n)) return { nombre: 'Revit', letra: 'R', color: '#1961A9' };
    if (/\.(dwg|dxf|dwf|dwfx)$/.test(n)) return { nombre: 'Civil 3D', letra: 'C', color: '#0E8577' };
    if (/\.(nwd|nwc)$/.test(n)) return { nombre: 'Navisworks', letra: 'N', color: '#175A93' };
    // Sin nombre de marca: el lector de PDF lo elige el usuario en su Windows,
    // asi que prometer «Acrobat» seria mentir la mitad de las veces.
    if (/\.pdfx?$/.test(n)) return { nombre: 'tu lector de PDF', letra: 'P', color: '#B23B3B' };
    return { nombre: 'el escritorio', letra: null, color: '#5B6875' };
  })();

  // El botón invoca el protocolo alephia:// del CONECTOR ALEPHIA (ver
  // public/conector/), que descarga el original con URL firmada y lo abre en
  // la aplicación asociada — Revit, Civil 3D, Navisworks.
  //
  // DETECCIÓN: un navegador no puede saber si el protocolo tiene manejador.
  // La v1 lo infería por pérdida de foco (la ventana del conector robaba el
  // foco al saltar)… y al hacer el conector INVISIBLE esa señal murió: el
  // dueño vio el plano abrirse Y el modal de «falta el conector» a la vez.
  // Ahora manda la MEMORIA: la primera vez el modal acompaña («¿se abrió?»),
  // y con un clic en «Sí, se abrió» —o con la pérdida de foco del diálogo de
  // permiso de Chrome, que sigue siendo buena señal— queda recordado y nunca
  // se vuelve a preguntar: clic → aviso «enviado al Conector» y nada más.
  const [conectorListo, setConectorListo] = useState(() => {
    try { return localStorage.getItem('alephia_conector') === 'si'; } catch { return false; }
  });
  const recordarConector = () => {
    try { localStorage.setItem('alephia_conector', 'si'); } catch { /* noop */ }
    setConectorListo(true);
  };

  const abrirEnEscritorio = async () => {
    const urn = viewedVersionInfo?.gcs_urn || file.gcs_urn;
    if (!urn) { toast.error('Este documento no tiene fichero asociado.'); return; }
    let firmada = '';
    const enCache = firmadaRef.current;
    if (enCache.urn === urn && enCache.url && (Date.now() - enCache.ts) < 10 * 60 * 1000) {
      // Pre-firmada al abrir el documento: el clic es INSTANTANEO.
      firmada = enCache.url;
    } else {
      // Toca pedirla ahora — puede tardar ~30 s si el backend estaba dormido
      // (plan gratuito de Render): que la espera se VEA, no un boton mudo.
      const espera = toast.loading(`Preparando ${file.name}… (si el servidor estaba dormido, tarda ~30 s)`);
      try {
        const r = await apiFetch(`${API}/api/docs/signed-url?urn=${encodeURIComponent(urn)}&model_urn=${encodeURIComponent(projectPrefix)}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success || !d.url) throw new Error(d.error || 'No se pudo preparar el archivo.');
        firmada = d.url;
        firmadaRef.current = { urn, url: firmada, ts: Date.now() };
        toast.dismiss(espera);
      } catch (e) {
        toast.dismiss(espera);
        toast.error(e.message || 'No se pudo preparar el archivo.');
        return;
      }
    }

    // `v` = identidad de la version (el objeto del almacen es unico por
    // version): el conector la usa como CACHE — abrir el mismo plano cien
    // veces descarga UNA; solo una version nueva vuelve a bajar.
    const uri = `alephia://abrir?u=${encodeURIComponent(firmada)}&n=${encodeURIComponent(file.name)}&v=${encodeURIComponent(urn)}`;
    const marcar = () => { recordarConector(); setConectorAviso(null); };
    window.addEventListener('blur', marcar);
    const marco = document.createElement('iframe');
    marco.style.display = 'none';
    marco.src = uri;
    document.body.appendChild(marco);
    setTimeout(() => { window.removeEventListener('blur', marcar); marco.remove(); }, 4000);

    if (conectorListo) {
      toast.success(`Enviado al Conector: abriendo ${file.name}…`, { duration: 4500 });
    } else {
      setConectorAviso({ firmada });
    }
  };
  const popoverVersiones = (
              <div className="version-popover" style={{ top: 32, left: 0, width: 350 }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 600, color: '#666' }}>
                  Versiones
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto', overflowX: 'hidden' }}>  {/* overflowX explícito: fijar solo overflowY hace que el navegador calcule overflowX=auto, y ahí nacía la barra horizontal */}
                  {(!versionHistory || versionHistory.length === 0) ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: 13 }}>
                       <div className="adsk-spinner" style={{ width: 20, height: 20, margin: '0 auto 8px', borderWidth: 2 }} />
                       Cargando historial...
                    </div>
                  ) : (
                    versionHistory.map((v, i) => {
                      const isLatest = v.version_number === (versionHistory[0]?.version_number || file.version);
                      return (
                       <div 
                        key={i} 
                        className="version-popover-item"
                        style={{ 
                          padding: '12px', 
                          borderBottom: '1px solid #f5f5f5',
                          background: viewedVersionInfo?.id === v.id ? '#f0faff' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div 
                          onClick={() => { if (setViewedVersionInfo) setViewedVersionInfo(v); if (setShowVersions) setShowVersions(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}
                        >
                           <div className="version-link-acc" style={{ minWidth: 32 }}>V{v.version_number || 1}</div>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                             <span title={file.name} style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{file.name}</span>
                             <span style={{ fontSize: 11, color: '#999' }}>
                               Cargado por <span style={{ textTransform: 'uppercase' }}>{v.updated_by || 'ADMIN'}</span> el {formatDate(v.updated)}
                             </span>
                           </div>
                        </div>
                        
                        {!isLatest && isAdmin && onPromote && (
                          <button 
                            className="acc-btn-promote"
                            onClick={(e) => { e.stopPropagation(); onPromote(v); }}
                            title="Hacer versión actual"
                            style={{ 
                              padding: '4px 8px', 
                              fontSize: 11, 
                              background: '#fff', 
                              border: '1px solid var(--accent)', 
                              color: 'var(--accent)', 
                              borderRadius: 2,
                              cursor: 'pointer'
                            }}
                          >
                            Hacer actual
                          </button>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
  );

  return (
    <div className="file-viewer-overlay" style={isShared ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#fff' } : undefined}>
      {!esPdf && (
      <div className="file-viewer-header" style={isShared ? { padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', flexShrink: 0 } : undefined}>
        <div className="file-viewer-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--accent)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          
          <div style={{ position: 'relative' }}>
            <div 
              className="version-link-acc" 
              onClick={() => { if (!isShared && setShowVersions) setShowVersions(!showVersions); }}
              style={{ fontSize: 13, padding: '2px 12px', cursor: isShared ? 'default' : 'pointer' }}
            >
              {viewedVersionInfo ? `V${viewedVersionInfo.version_number}` : (file.version ? `V${file.version}` : 'V1')}
              {!isShared && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 6, transform: showVersions ? 'rotate(180deg)' : 'none' }}>
                  <path d="M7 10l5 5 5-5H7z"/>
                </svg>
              )}
            </div>

            {!isShared && showVersions && !esPdf && popoverVersiones}
          </div>

          {!isShared && viewedVersionInfo && viewedVersionInfo.version_number !== (versionHistory[0]?.version_number || file.version) && (
            <div className="no-actual-badge">
              No actual
            </div>
          )}
        </div>

        <div className="file-viewer-actions">
           {abribleEnEscritorio && !isShared && (
             <button onClick={abrirEnEscritorio}
               title="Descarga el original con su nombre real; al abrirlo, Windows usa la aplicacion asociada"
               style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginRight: 14,
                        padding: '5px 12px', fontSize: 12.5, fontWeight: 600,
                        background: '#fff', border: '1px solid var(--accent)', color: 'var(--accent)',
                        borderRadius: 4, cursor: 'pointer' }}>
               <SelloEscritorio app={appEscritorio} tamano={16} />
               Abrir en {appEscritorio.nombre}
             </button>
           )}
           {isShared && sharedRole && (
             <span style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: '#666', marginRight: 16 }}>
               Acceso compartido: {sharedRole === 'viewer' ? 'Lector' : 'Comentador'}
             </span>
           )}
           <button className="file-viewer-close" onClick={onClose || (() => window.close())}>✕</button>
        </div>
      </div>
      )}

      {conectorAviso && (
        <div onClick={() => setConectorAviso(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(15,22,30,0.45)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 470, maxWidth: '92vw', background: '#fff', borderRadius: 10,
                     padding: '22px 24px', boxShadow: '0 18px 50px rgba(15,22,30,0.35)' }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: '#1a2430', marginBottom: 8 }}>
              ¿Se abrió en tu software?
            </div>
            <div style={{ fontSize: 13, color: '#4a5560', lineHeight: 1.6, marginBottom: 14 }}>
              Acabamos de avisar al Conector ALEPHIA. Si el modelo se está abriendo (verás un aviso
              junto al reloj), confirma abajo y no volveremos a preguntar. Si no pasó nada, es que
              falta el Conector: un instalador de <b>un clic, sin administrador</b> que registra el
              enlace {' '}<code style={{ background: '#f2f4f6', padding: '1px 5px', borderRadius: 3 }}>alephia://</code>{' '}
              — el navegador no puede lanzar Revit ni Civil 3D por sí solo.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => { recordarConector(); setConectorAviso(null); toast.success('Recordado: los próximos se abren sin preguntar.'); }}
                 style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'var(--accent)',
                          color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                Sí, se abrió
              </button>
              <a href="/conector/instalar-conector-alephia.bat" download
                 style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, background: '#fff',
                          border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 5, textDecoration: 'none' }}>
                No pasó nada — descargar el Conector
              </a>
              <button onClick={() => { window.open(conectorAviso.firmada, '_blank', 'noopener'); setConectorAviso(null); }}
                 style={{ padding: '8px 12px', fontSize: 13, background: 'transparent', border: 'none',
                          color: '#7b8794', cursor: 'pointer', textDecoration: 'underline' }}>
                Solo descargar el archivo
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: '#8a95a1', marginTop: 12, lineHeight: 1.6 }}>
              Tras instalarlo (doble clic al .bat), vuelve y pulsa «Abrir en el escritorio» otra vez.
              Si el navegador bloquea el .bat, abre PowerShell y pega esta línea — hace lo mismo:
              <code style={{ display: 'block', marginTop: 5, padding: '6px 8px', background: '#f2f4f6',
                             borderRadius: 4, fontSize: 11, color: '#33404c', userSelect: 'all' }}>
                irm https://visor-ecd-portal.onrender.com/conector/instalar.ps1 | iex
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Para un PDF, el desplegable de versiones flota sobre el documento:
          la barra es la del lector y no hay dónde colgarlo. Cuelga DEL CHIP,
          como en ACC: la barra lleva menú (32) + búsqueda (32) + el hueco, así
          que el chip empieza sobre los 76 px. */}
      {esPdf && !isShared && showVersions && (
        <div style={{ position: 'absolute', top: 44, left: 76, zIndex: 40 }}>
          {popoverVersiones}
        </div>
      )}
      
      <div className="file-viewer-content" style={{ flex: 1, position: 'relative', background: '#f5f5f5', display: 'flex', justifyContent: 'center' }}>
        {(() => {
          const fileUrl = isShared && file.url ? file.url : securePreviewUrl;
          const lowerName = file.name.toLowerCase();

          // El spinner SOLO cuando no hay nada que ensenar todavia (primera
          // apertura). Con un documento ya abierto se conserva el lector: ver
          // el comentario de setSecurePreviewUrl mas arriba.
          // LOS PDF NO PASAN POR AQUI. Tenian DOS pantallas de carga
          // seguidas: esta («Preparando vista segura...») y despues la del
          // propio lector. Se veia como si cargara dos veces, y sumaban sus
          // esperas. El lector se monta ya y ensena UNA sola, la suya, desde
          // el primer instante -- sabe que esta preparando porque se le dice
          // con `preparando`.
          const esPdfAqui = /\.pdfx?$/i.test(lowerName);
          if (!isShared && !esPdfAqui && !['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext)) && loadingPreview && !fileUrl) {
            return (
              <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                <div className="spinner-acc" style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin-acc 1s linear infinite' }} />
                <div style={{ fontSize: 14, color: '#666' }}>Preparando vista segura…</div>
              </div>
            );
          }

          if (!isShared && previewError) {
            return (
              <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#5f6368' }}>
                <div>No se pudo abrir la vista previa.</div>
                <div style={{ fontSize: 12, color: '#8a9099' }}>{previewError}</div>
                <button type="button" onClick={() => setPreviewRetry(value => value + 1)} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}>
                  Reintentar
                </button>
              </div>
            );
          }
          
          // 1. VIDEOS
          if (lowerName.endsWith('.mp4') || lowerName.endsWith('.webm') || lowerName.endsWith('.ogg')) {
            return (
              <video controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#000' }}>
                <source src={fileUrl} type={`video/${lowerName.split('.').pop()}`} />
                Tu navegador no soporta la reproducción de video.
              </video>
            );
          }
          
          // 2. IMAGES
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some(ext => lowerName.endsWith(ext))) {
            return (
              <div style={isShared ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 } : { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={fileUrl} alt={file.name} style={isShared ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', borderRadius: 8, background: '#fff' } : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            );
          }
          
          // 3. OFFICE (Word, Excel, PPT)
          if (['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].some(ext => lowerName.endsWith(ext))) {
            if (loadingOffice) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                  <div className="spinner-acc" style={{ width: 40, height: 40, border: '3px solid #f3f3f3', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin-acc 1s linear infinite' }}></div>
                  <div style={{ fontSize: 14, color: '#666' }}>Cargando visor de Office...</div>
                </div>
              );
            }
            if (!officeUrl) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                  <div style={{ fontSize: 14 }}>No se pudo cargar la vista previa de Office.</div>
                  <button onClick={() => window.open(fileUrl, '_blank')} style={{ marginTop: 12, padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Descargar archivo</button>
                </div>
              );
            }
            const viewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(officeUrl)}`;
            return (
              <iframe src={viewerUrl} title={file.name} style={{ width: '100%', height: '100%', border: 'none' }} />
            );
          }
          
          // 4. SIN VISTA PREVIA PARA EL RESTO, EN MODO COMPARTIDO
          //
          // EL CAD QUEDA FUERA DE ESTE CORTE, y esa es la correccion: la vista
          // compartida de CAD YA ESTABA CONSTRUIDA -- estado `cadCompartido`,
          // el endpoint /api/docs/cad/compartido/<share_id> con su decorador
          // de solo lectura, y el visor con `urnDirecto` en la rama 6 -- pero
          // esta rama devuelve ANTES para todo lo que no sea PDF, asi que la 6
          // era inalcanzable. Resultado: el invitado solo podia descargar un
          // DWG que el dueño ya estaba viendo en la web.
          //
          // Lo dijo el dueño: «comparto un CAD, le envio el link, y el otro
          // usuario solo puede descargar, a pesar de que yo ya lo abri».
          //
          // No se abre ninguna puerta nueva: la rama 6 solo enseña el modelo si
          // la obra YA lo tradujo, y un invitado nunca dispara una traduccion
          // --el coste manda--; si no esta traducido, sigue viendo la descarga.
          if (!['.pdf', '.pdfx'].some(ext => lowerName.endsWith(ext))
              && !CAD_EXTENSIONS.some(ext => lowerName.endsWith(ext))
              && isShared) {
             return (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#fff', width: '100%' }}>
                 <div style={{ background: '#f1f3f4', padding: 32, borderRadius: '50%', marginBottom: 24 }}>
                   <svg width="48" height="48" viewBox="0 0 24 24" fill="#5f6368"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                 </div>
                 <p style={{ fontFamily: 'Inter', fontSize: 16, color: '#3c4043', fontWeight: 500 }}>No hay vista previa disponible</p>
                 <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24, background: 'var(--accent)', color: '#fff', padding: '10px 24px', borderRadius: 20, textDecoration: 'none', fontFamily: 'Inter', fontWeight: 500, fontSize: 14, transition: 'background 0.2s' }}>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                   Descargar Archivo
                 </a>
               </div>
             )
          }

          // 5. PDF (Mozilla PDF.js — Motor intercambiable)
          if (lowerName.endsWith('.pdf') || lowerName.endsWith('.pdfx')) {
            // El chip de versión viaja DENTRO del lector: en pantalla completa
            // la cabecera del documento desaparece y la versión debe seguir
            // a la vista (la trazabilidad no se va con el fullscreen).
            const vv = viewedVersionInfo || versionHistory[0] || null;
            return <PDFViewer url={fileUrl} fileName={file.name}
              // El lector conserva el plano anterior mientras se pide la URL
              // firmada del nuevo (asi la cinta no se desmonta), pero entonces
              // NO SABE que viene otro. Sin este aviso, el primer tramo de la
              // espera era mudo -- justo el que mas ansiedad da, porque es el
              // que sigue al clic.
              preparando={loadingPreview}
              // EL BOTON DE ESCRITORIO, TAMBIEN EN LA BARRA DEL LECTOR. Estaba
              // solo en la cabecera del expediente, que es justo la que
              // desaparece al abrir el plano: el dueno lo busco ahi y no
              // estaba. Se le pasa la ACCION, no se duplica la logica.
              alEscritorio={esPdfDeEscritorio && !isShared ? abrirEnEscritorio : null}
              appEscritorio={appEscritorio}
              nodeId={isShared ? null : file.id} projectPrefix={projectPrefix}
              onClose={onClose || (() => window.close())}
              onVersionClick={!isShared && setShowVersions
                ? () => setShowVersions(!showVersions) : null}
              hermanos={isShared ? [] : hermanos}
              onAbrirHermano={isShared ? null : onAbrirHermano}
              esAdmin={!isShared && isAdmin}
              obraDelDocumento={projectPrefix}
              versionLabel={vv ? `V${vv.version_number || 1}` : null}
              versionInfo={vv && (vv.updated_by || vv.updated)
                ? `Cargado por ${vv.updated_by || '—'}${vv.updated ? ` · ${formatDate(vv.updated)}` : ''}`
                : null} />;
          }

          // 6. CAD / BIM: DWG de Civil 3D, RVT, IFC... El navegador no sabe
          //    dibujarlos, así que el iframe genérico acababa DESCARGANDO el
          //    archivo. Se traducen con Model Derivative y se muestran con el
          //    visor de Autodesk, el mismo que usa ACC por dentro.
          //    En vistas compartidas no: un invitado no debe poder gastar
          //    créditos de traducción.
          // 6.a CAD POR ENLACE: lo YA traducido se ve; lo demas se descarga.
          if (isShared && CAD_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
            if (!cadCompartido) {
              return <div style={{ padding: 40, textAlign: 'center' }}>
                <div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>;
            }
            if (cadCompartido.listo && cadCompartido.urn) {
              return (
                <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>}>
                  <CadViewer file={file} urnDirecto={cadCompartido.urn} />
                </Suspense>
              );
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', height: '100%', gap: 14, padding: 30,
                            textAlign: 'center', background: '#f5f6f7' }}>
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#5b6875"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a2430' }}>{file.name}</div>
                <div style={{ fontSize: 13, color: '#5b6875', maxWidth: 420, lineHeight: 1.6 }}>
                  Este plano CAD todavía no tiene vista previa preparada. Puedes
                  descargar el archivo original y abrirlo en tu AutoCAD, Civil 3D
                  o Revit.
                </div>
                <a href={fileUrl} download={file.name}
                  style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600,
                           background: 'var(--accent, #3e6f91)', color: '#fff',
                           borderRadius: 6, textDecoration: 'none' }}>
                  Descargar el archivo original
                </a>
              </div>
            );
          }

          if (!isShared && CAD_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
            return (
              <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>}>
                <CadViewer file={file} projectPrefix={projectPrefix} />
              </Suspense>
            );
          }

          // 7. DEFAULT FALLBACK (Iframe genérico)
          return (
            <iframe 
              src={fileUrl} 
              title={file.name} 
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            />
          );
        })()}
      </div>
    </div>
  );
}
