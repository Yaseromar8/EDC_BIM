/**
 * FilesPage.jsx — Orquestador Principal del Explorador de Archivos
 * Refactorización Fase 3: Capa de Orquestación
 * 
 * Este archivo NO contiene lógica compleja propia — solo orquesta:
 * - Hooks de datos (Fase 1)
 * - Componentes de UI (Fase 2)
 * - Layout JSX del explorador
 */
import React, { lazy, Suspense } from 'react';
import toast from 'react-hot-toast';

// ── Fase 1: Hooks ──
import { useFileExplorer } from '../hooks/useFileExplorer';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { useColumnResize, useSidebarResize, useVersionPanelResize } from '../hooks/useColumnResize';
import { API, getInitials, getAuthHeaders, formatSize, formatDate, DOCS_VISOR_SHORTCUT } from '../utils/helpers';
import { renderFileIconSop } from '../utils/fileIcons';
import { apiFetch, apiJson } from '../utils/apiFetch';
import { programarBusqueda } from '../utils/busquedaDiferida';
import { reiniciarTira } from '../utils/tiraDocumentos';
import * as campo from '../offline/captura';
import { engancharDisparadores } from '../offline/sincronizador';
import { tieneSincronizacionDeCampo } from '../offline/capacidades';
import { confirmAction } from '../utils/confirm';
import { capacidadesDeSeleccion } from '../utils/capacidadesDeSeleccion';
import { pedirIdoneidad } from '../utils/idoneidad';

// ── Ligeros (siempre presentes en el flujo de Archivos) → carga inmediata ──
import DeleteModal from '../components/modals/DeleteModal';
import HerramientasDeObra from '../components/HerramientasDeObra';
import BarraLateral from '../components/BarraLateral';
import BarraSuperior from '../components/BarraSuperior';
import IconoModulo from '../components/IconoModulo';

// CAPA 16 · el menu no puede ofrecer una herramienta apagada: seria prometer
// lo que el servidor va a negar con 403. `modo` es el `sidebarView` de cada
// entrada del menu; el codigo es el del catalogo del backend.
const HERRAMIENTA_DE_MODO = {
  rfis: 'rfi', redlines: 'redlines', reviews: 'reviews',
  transmittals: 'transmittals', submittals: 'submittals',
  planos: 'planos', protocolos: 'protocolos',
  punch: 'issues',
  // GAP 07. La cola de campo NO es una herramienta aparte: es la cola de
  // dos que ya existen. Por eso lleva las DOS -- si alguien tiene issues
  // pero no protocolos, su trabajo pendiente tiene que seguir siendo
  // visible, y al reves igual. Esconderla dejaria capturas atrapadas en
  // el dispositivo sin pantalla desde donde subirlas.
  campo: ['issues', 'protocolos'],
  specs: 'especificaciones',
  // GAP 06. Los flujos viven DENTRO de la herramienta `reviews`: configurar
  // cómo se revisa no es otra capacidad que se activa aparte.
  flujos: 'reviews',
  plan: 'plan_entregas', sets: 'conjuntos',
  multimedia: 'fotos',
  cuaderno: 'cuaderno',
};
import NewFolderModal from '../components/modals/NewFolderModal';
import ShareModal from '../components/modals/ShareModal';
import MoveModal from '../components/modals/MoveModal';
import UploadModal from '../components/modals/UploadModal';
import VersionPanel from '../components/panels/VersionPanel';
import DeletedTable from '../components/panels/DeletedTable';
import ContextMenu from '../components/ContextMenu';
import FolderNode from '../components/FolderNode';
import MatrixTable from '../MatrixTable';
import PanelConsulta from '../components/PanelConsulta';
import FichaDocumento from '../components/FichaDocumento';
import PortadaObra from '../components/PortadaObra';
import FiltrosDeArchivos, { FichasDeFiltros } from '../components/FiltrosDeArchivos';
import PanelDeVistas, { GuardarComoVista } from '../components/PanelDeVistas';
import { useVistasDeArchivos } from '../hooks/useVistasDeArchivos';
import PanelDeGrupos, { ElegirGrupo } from '../components/PanelDeGrupos';
import GrupoAbierto from '../components/GrupoAbierto';
import { useGrupos } from '../hooks/useGrupos';
import { aplicarFiltros, hayFiltros, describirFiltros, criteriosDeFiltros, ORDEN_POR_DEFECTO } from '../utils/vistasDeArchivos';
import { hermanosDelLector } from '../utils/lectorDePlanos';
import { EstadoVacio, IlustracionPlano, IlustracionCasco } from '../components/IlustracionesDeObra';
import FolderPermissionsPanel from '../components/FolderPermissionsPanel';
import AccFolderBridge from '../components/AccFolderBridge';
// ESTÁTICO A PROPÓSITO: abrir un PDF es la acción más frecuente del día. Si se
// carga diferido, al hacer clic hay que bajar PRIMERO los chunks del visor y
// recién ahí el archivo → se siente lento. Va precargado con la app.
import DocumentViewer from '../components/DocumentViewer';

// ── Pesados / de uso puntual → CARGA DIFERIDA (code-split) ────────────────────
// Cada uno se descarga solo cuando el usuario entra a ese módulo, en vez de
// inflar el bundle inicial. Antes: 1 chunk de ~1.6 MB con TODO.
const RedLineModule = lazy(() => import('../components/RedLineModule'));
const ParticipantesModule = lazy(() => import('../components/ParticipantesModule'));
const BusquedaGlobalModule = lazy(() => import('../components/BusquedaGlobalModule'));
const RfiModule = lazy(() => import('../components/RfiModule'));
const SubmittalsModule = lazy(() => import('../components/SubmittalsModule'));
const PlanosModule = lazy(() => import('../components/PlanosModule'));
const ProtocolosModule = lazy(() => import('../components/ProtocolosModule'));
// `PunchModule`, no `IssueModule`: ese nombre ya es el componente generico
// de RFI y Red Line. RED LINE != ISSUE quedo congelado el 25-ago-2026.
const PunchModule = lazy(() => import('../components/PunchModule'));
const SincronizacionModule = lazy(() => import('../components/SincronizacionModule'));
const EspecificacionesModule = lazy(() => import('../components/EspecificacionesModule'));
const FlujosDeRevisionModule = lazy(() => import('../components/FlujosDeRevisionModule'));
const MultimediaModule = lazy(() => import('../components/MultimediaModule'));
const FotosModule = lazy(() => import('../components/FotosModule'));
const CuadernoModule = lazy(() => import('../components/CuadernoModule'));
const AvanceModule = lazy(() => import('../components/AvanceModule'));
// ALCANCE DE LA CAJA DE BÚSQUEDA.
//
//   'carpeta'   filtra lo que hay en la carpeta donde estás.
//   'proyecto'  busca en todo el expediente y SUSTITUYE la tabla por una
//               lista de resultados.
//
// Estaba en 'proyecto' de hecho: bastaba teclear tres letras dentro de una
// carpeta para acabar viendo documentos de otras cinco. Y con ello se perdía
// la superficie de tabla -- sin casillas, sin «seleccionar todo» y sin las
// acciones de la barra -- porque la lista de resultados es otro dibujo.
//
// El filtro por carpeta YA existía y ya corría en cada tecla
// (`filteredFolders` / `filteredFiles` del explorador); lo único que hacía
// falta era dejar de taparlo. Poner esta constante en 'proyecto' devuelve el
// comportamiento anterior tal cual: la maquinaria sigue entera y probada
// (`utils/busquedaDiferida.js`, 17 comprobaciones).
const ALCANCE_BUSQUEDA = 'carpeta';

const MatrixGrid = lazy(() => import('../components/MatrixGrid'));
const GatewayPanel = lazy(() => import('../components/panels/GatewayPanel'));
const QuarantineTable = lazy(() => import('../components/panels/QuarantineTable'));
const SharesManager = lazy(() => import('../components/SharesManager'));
const ReviewsView = lazy(() => import('../components/ReviewsModule').then(m => ({ default: m.ReviewsView })));
const ReviewModal = lazy(() => import('../components/ReviewsModule').then(m => ({ default: m.ReviewModal })));
const TransmittalsView = lazy(() => import('../components/TransmittalsModule').then(m => ({ default: m.TransmittalsView })));
const TransmittalModal = lazy(() => import('../components/TransmittalsModule').then(m => ({ default: m.TransmittalModal })));
const SetsView = lazy(() => import('../components/SetsModule').then(m => ({ default: m.SetsView })));
const PlanEntregaView = lazy(() => import('../components/PlanEntregaModule').then(m => ({ default: m.PlanEntregaView })));
const CatalogoIdoneidadView = lazy(() => import('../components/CatalogoIdoneidadModule').then(m => ({ default: m.CatalogoIdoneidadView })));
const ArchivarObraPanel = lazy(() => import('../components/ArchivarObraPanel').then(m => ({ default: m.ArchivarObraPanel })));
const RolDeMiembro = lazy(() => import('../components/RolDeMiembro').then(m => ({ default: m.RolDeMiembro })));
const ExportarExpedientePanel = lazy(() => import('../components/ExportarExpedientePanel').then(m => ({ default: m.ExportarExpedientePanel })));
const TriajeSeguridadView = lazy(() => import('../components/TriajeSeguridadModule').then(m => ({ default: m.TriajeSeguridadView })));
const AddToSetModal = lazy(() => import('../components/SetsModule').then(m => ({ default: m.AddToSetModal })));
const AttributesAdmin = lazy(() => import('../components/AttributesModule').then(m => ({ default: m.AttributesAdmin })));
const AttributesPanel = lazy(() => import('../components/AttributesModule').then(m => ({ default: m.AttributesPanel })));

// Fallback uniforme mientras carga un chunk diferido.
const ChunkFallback = () => (
  <div style={{ padding: 40, textAlign: 'center', flex: 1 }}>
    <div className="adsk-spinner" style={{ margin: '0 auto' }} />
  </div>
);

// Menú de perfil: una sola familia de iconos (trazo de 1.6 px, 16 px, sin
// relleno, heredando el color del texto). Nada de emojis — cada plataforma los
// dibuja distinto y rompen la línea del resto de la interfaz.
const MENU_ICONS = {
  swap: <><polyline points="16 3 20 7 16 11" /><path d="M4 13v-2a4 4 0 0 1 4-4h12" /><polyline points="8 21 4 17 8 13" /><path d="M20 11v2a4 4 0 0 1-4 4H4" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V19a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9.5" /><path d="M9.5 21v-6h5v6" /></>,
  exit: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
};

function MenuItem({ icon, label, onClick, danger = false, divider = false }) {
  const color = danger ? '#b93535' : '#333330';
  const hoverBg = danger ? '#f1f0e8' : '#f1f0e8';
  return (
    <button
      onClick={onClick}
      onMouseOver={e => { e.currentTarget.style.background = hoverBg; }}
      onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
      style={{
        width: '100%', padding: '10px 16px', border: 'none', background: 'none',
        textAlign: 'left', fontSize: 13, cursor: 'pointer', color,
        display: 'flex', alignItems: 'center', gap: 10,
        borderTop: divider ? '1px solid #f1f0e8' : 'none',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.75 }}>
        {MENU_ICONS[icon]}
      </svg>
      {label}
    </button>
  );
}

// Cuarentena y Papelera NO son sitios distintos: son formas de MIRAR los mismos
// archivos. Tenerlas como secciones del menu principal las ponia al mismo nivel
// que el arbol entero, y ademas obligaba a salir de Archivos para ver lo que
// esta dentro de Archivos. Aqui son pestanas, como la papelera en ACC.
function PestanasDeArchivos({ fe, isAdmin }) {
  const activa = fe.isTrashMode ? 'papelera' : (fe.sidebarView === 'quarantine' ? 'cuarentena' : 'carpetas');
  const pestanas = [
    { id: 'carpetas', label: 'Carpetas', ir: () => { fe.setSidebarView('files'); fe.switchMode(false); } },
    ...(isAdmin ? [{ id: 'cuarentena', label: 'Nombres fuera de convención', ir: () => { fe.switchMode(false); fe.setSidebarView('quarantine'); } }] : []),
    { id: 'papelera', label: 'Papelera', ir: () => { fe.setSidebarView('files'); fe.switchMode(true); } },
  ];
  return (
    <div style={{ display: 'flex', gap: 28, borderBottom: '1px solid #e8e6dc' }}>
      {pestanas.map(t => (
        <button key={t.id} onClick={t.ir}
          style={{ paddingBottom: 8, paddingTop: 4, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activa === t.id ? '2px solid var(--a-indicador, var(--accent))' : '2px solid transparent',
            color: activa === t.id ? 'var(--accent)' : '#72706b', fontWeight: activa === t.id ? 600 : 400 }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// NAVEGACIÓN ARRIBA (13-oct-2026): selectores de obra y de herramienta en una
// barra superior, sin barra lateral de módulos — el patrón estándar de los
// gestores de obra, con la identidad de ALEPHIA (maqueta
// docs/ux/maquetas/interior_v4_estructura_procore.html). `false` vuelve a la
// barra lateral de siempre: las dos dibujan las mismas entradas (`gruposNav`).
const NAV_SUPERIOR = true;

export default function FilesPage({ project, user, onBack, onLogout, onBackToHub }) {
  // ═══════════════════════════════════════
  // HOOK ASSEMBLY (Zero logic — only wiring)
  // ═══════════════════════════════════════
  const fe = useFileExplorer(project, user);
  const [showGateway, setShowGateway] = React.useState(false);

  // GAP 07 · LA COLA SUBE AUNQUE NADIE ESTE MIRANDOLA.
  //
  // Los disparadores se enganchan AQUI y no en la pantalla de campo. Si
  // vivieran alli, la cola solo subiria mientras alguien tuviera esa pestaña
  // abierta -- y quien captura en obra cierra la app y se va. Vuelve la
  // cobertura en la caseta, el móvil no está en esa pantalla, y el trabajo se
  // quedaria dentro sin que nadie entendiera por que.
  //
  // `obtenerContexto` se pasa como FUNCION, no como valor: cuando se dispare
  // --minutos u horas despues-- tiene que leer la identidad de ESE momento, no
  // la de cuando se engancho. Si se hubiera cambiado de cuenta entretanto, la
  // cola que sube es la del que esta dentro ahora.
  React.useEffect(() => {
    if (!project || !user?.id) return undefined;
    return engancharDisparadores(API, () => campo.contextoDe(user, project));
  }, [project, user]);

  // ¿SIRVE ESTE SERVIDOR EL TRABAJO DE CAMPO?
  //
  // Mientras no se sepa, la pestaña NO se ofrece. El portal se despliega antes
  // que el backend, y enseñar «Trabajo de campo» contra un servidor que aún no
  // la tiene sería prometer que se puede capturar sin cobertura cuando lo único
  // que pasaría es que no se guarda nada.
  // true = la sirve · false = NO la sirve (404 medido) · null = no se sabe.
  // Sin red la pestaña SE ENSEÑA aunque no se sepa: la cola es local y
  // esconderla dejaría el trabajo capturado sin pantalla desde donde verlo.
  const [hayCampo, setHayCampo] = React.useState(null);
  React.useEffect(() => {
    let vivo = true;
    const preguntar = () => tieneSincronizacionDeCampo(API)
      .then(r => { if (vivo) setHayCampo(r); });
    preguntar();
    // Y SE VUELVE A PREGUNTAR AL VOLVER LA RED. Sin esto, una sonda que corrio
    // sin cobertura (null) dejaba la pestaña escondida PARA SIEMPRE al
    // reconectar -- paso en la EXP de NG-02: la cola sincronizaba pero su
    // pantalla habia desaparecido del menu.
    window.addEventListener('online', preguntar);
    return () => { vivo = false; window.removeEventListener('online', preguntar); };
  }, []);
  
  const vh = useVersionHistory(fe.projectPrefix, user, {
    onRefresh: () => fe.triggerRefresh()
  });
  
  const { columnWidths, totalTableWidth, startResizing, ajustarAncho } = useColumnResize();

  const { globalSidebarWidth, setGlobalSidebarWidth, treeSidebarWidth, startTreeResize, startGlobalResize, teclaTree, resetTree, arbolMin, arbolMax } = useSidebarResize();
  const { versionPanelWidth, startVersionResize } = useVersionPanelResize();

  // LAS DOS ADMINISTRACIONES, SEPARADAS.
  //
  //   isAdmin         administra ESTA obra: su expediente, sus permisos, sus
  //                   flujos. Es lo que gobierna casi toda esta pantalla.
  //   esEntityAdmin   custodio de la instancia: el catálogo de idoneidad de la
  //                   entidad y archivar la obra. NO son actos de proyecto, y
  //                   el servidor tampoco los trata como tales.
  const { isAdmin, esEntityAdmin, projectPrefix } = fe;
  // La ruta del puente exige role=admin global en el backend. Esa identidad
  // también viene en la sesión: permite mostrar el botón aunque la consulta
  // auxiliar de administración de una obra de ensayo no resuelva su alias.
  const puedeVincularAcc = esEntityAdmin || user?.role === 'admin';

  // QUÉ SE PUEDE HACER con lo que hay seleccionado. Una sola respuesta para
  // la barra, el menú contextual y la cuadrícula: ninguna superficie decide
  // por su cuenta, y por eso ninguna puede ofrecer algo que no actúe.
  // C-2 · SOBRE QUÉ ACTÚA EL MENÚ CONTEXTUAL. Si el elemento pulsado forma
  // parte de la selección, actúa sobre TODA la selección: es lo que espera
  // quien marcó cinco y pulsa el botón derecho sobre uno. Si no forma parte,
  // actúa sólo sobre él y la selección no se toca.
  const objetivoMenu = React.useMemo(() => {
    const it = fe.activeRowMenu?.item;
    if (!it) return [];
    return fe.selected.has(it.id) ? fe.elementosSeleccionados : [it];
  }, [fe.activeRowMenu, fe.selected, fe.elementosSeleccionados]);

  const capsMenu = React.useMemo(() => capacidadesDeSeleccion({
    elementos: objetivoMenu, isAdmin, isTrashMode: fe.isTrashMode,
  }), [objetivoMenu, isAdmin, fe.isTrashMode]);

  // «SUBIR NUEVA VERSIÓN» abre el selector de ficheros del sistema para UN
  // documento; el fichero elegido se sube con el nombre de ese documento.
  const selectorDeVersion = React.useRef(null);
  const versionPara = React.useRef(null);
  const pedirNuevaVersion = (item) => {
    versionPara.current = item;
    if (selectorDeVersion.current) selectorDeVersion.current.click();
  };

  // ABRIR ES IDEMPOTENTE. Un doble clic sobre el nombre dispara `onClick` dos
  // veces y `onDoubleClick` una: TRES invocaciones, medido en banco. Hoy el
  // efecto era uno solo porque poner el mismo objeto en el estado no cambia
  // nada, pero eso era una coincidencia afortunada, no una garantía. Aquí se
  // vuelve explícita: abrir lo que ya está abierto no hace nada.
  // CONSULTA DEL DOCUMENTO (paso 1 de docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md):
  // el documento cuyo panel está abierto a la derecha de la tabla. Pulsar la misma
  // fila otra vez lo cierra; cambiar de carpeta o ir a la Papelera, también.
  const [consultado, setConsultado] = React.useState(null);
  const consultar = React.useCallback((item) => {
    setConsultado(prev => (prev && prev.id === item.id ? null : item));
  }, []);
  React.useEffect(() => { setConsultado(null); }, [fe.currentPath, fe.isTrashMode]);

  // VISTAS (A2-2, 14-oct-2026): «Me toca revisar», «Plazo del plan vencido»… y
  // las propias, sobre toda la obra. Con una vista activa la tabla muestra sus
  // filas; sin ella, Archivos es el de siempre. Ver hooks/useVistasDeArchivos.js.
  const vistas = useVistasDeArchivos({ fe, projectPrefix: fe.projectPrefix, user,
                                       enArchivos: fe.sidebarView === 'files',
                                       conCifras: fe.sidebarView === 'files' || fe.sidebarView === 'portada' });
  const enVista = Boolean(vistas.activa);
  React.useEffect(() => { setConsultado(null); }, [vistas.activa]);
  const filasDeVista = enVista
    ? aplicarFiltros(vistas.filas || [], { texto: fe.searchQuery, estado: fe.statusFilter, meta: fe.filtrosMeta })
    : null;
  const filtrosPuestos = hayFiltros({ texto: fe.searchQuery, estado: fe.statusFilter, meta: fe.filtrosMeta });
  // EL ORDEN DE LA TABLA vive aquí (antes dentro de la tabla, con el mismo valor de
  // partida): así una vista propia lo guarda y lo devuelve al abrirse.
  const [ordenTabla, setOrdenTabla] = React.useState(ORDEN_POR_DEFECTO);
  // GRUPOS DE DOCUMENTOS (15-oct-2026): los documentos viven en sus carpetas y cada uno arma sus grupos,
  // que solo apuntan a ellos (routes/grupos.py). Un grupo abierto se pinta ENCIMA del panel de datos: la
  // tabla, el árbol y las vistas no cambian. Elegir una carpeta o una vista lo cierra.
  const grupos = useGrupos(API, projectPrefix);
  const [grupoActivoId, setGrupoActivoId] = React.useState(null);
  const grupoActivo = grupoActivoId ? (grupos.grupos.find(g => g.id === grupoActivoId) || null) : null;
  const [paraAgrupar, setParaAgrupar] = React.useState(null);
  // ‹ › del lector recorren el grupo cuando el documento se abrió desde él.
  const [juegoDelGrupo, setJuegoDelGrupo] = React.useState(null);
  React.useEffect(() => { setGrupoActivoId(null); }, [fe.currentPath, fe.isTrashMode, fe.sidebarView, projectPrefix]);
  const elegirGrupo = (g) => { vistas.salir(); setConsultado(null); setGrupoActivoId(g.id); };
  const abrirDelGrupo = (f, fijo, lista) => {
    reiniciarTira();
    fe.setShowVersions(false);
    fe.setViewedVersionInfo(fijo || null);
    fe.setActiveFile(f);
    fe.anotarDocumento(f);
    setJuegoDelGrupo({ grupo: grupoActivoId, archivos: lista || [] });
  };

  const elegirVista = (v) => {
    setGrupoActivoId(null);
    if (v.tipo === 'propia' && v.vista?.orden) setOrdenTabla(v.vista.orden);
    vistas.elegir(v);
  };
  // Salir de la vista al elegir una carpeta, aunque sea la que ya estaba abierta.
  const navegarYSalir = React.useCallback((ruta, id) => { setGrupoActivoId(null); vistas.salir(); fe.navigate(ruta, id); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fe.navigate, vistas.salir]);

  // FICHA COMPLETA (paso 3 de la consulta, maqueta v8): ocupa el sitio del árbol y
  // la tabla; «← Archivos» lo deja todo como estaba. ‹ › recorren las filas que se
  // ven (la carpeta filtrada o la vista).
  const [ficha, setFicha] = React.useState(null);
  React.useEffect(() => { setFicha(null); }, [fe.currentPath, fe.isTrashMode, fe.sidebarView, vistas.activa]);

  // Si la fila consultada cambia (nueva versión, nuevo estado), el panel la sigue.
  const consultadoVivo = consultado
    ? ((enVista ? vistas.filas : fe.files)?.find(f => f.id === consultado.id) || consultado) : null;

  const abrirDocumento = React.useCallback((f) => {
    if (!f) return;
    if (fe.activeFile && String(fe.activeFile.id) === String(f.id)) return;
    reiniciarTira();
    fe.setActiveFile(f);
    // Su paso en Atrás y su enlace (enlaces de Archivos, 14-sep-2026).
    fe.anotarDocumento(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fe.activeFile]);

  // ── RESTAURAR: UNA SOLA MANERA, DOS BOTONES ──────────────────────────────
  //
  // La papelera tiene dos superficies -- el botón de cada fila y el
  // «Restaurar (N)» de la barra -- y estaban escritas por separado, así que no
  // se comportaban igual: la de la barra NO DECÍA NADA cuando salía bien, y
  // sacaba las filas de la papelera hubiera aceptado el servidor o no. Las dos
  // llaman ahora aquí, y por eso no pueden volver a divergir.

  // EL NOMBRE DE LA RAÍZ ES UN DATO DEL SERVIDOR, no un adorno. La ruta de la
  // papelera llega como «Archivos de proyecto / 01_COSTOS / plano.pdf»: la
  // arma `list_deleted_contents` empezando en el nodo PROJECT_ROOT, cuyo
  // nombre es ese (`file_system_db.py`, ROOT_NAME). Ese primer tramo ES la
  // raíz, no una carpeta dentro de ella: sin retirarlo se navega a
  // «<proyecto>/Archivos de proyecto/01_COSTOS/», que no existe.
  const RAIZ_SERVIDOR = 'Archivos de proyecto';

  // A qué carpeta vuelve un elemento, o `null` si no se puede AFIRMAR: se
  // exige que la ruta sea la suya (su último tramo es su nombre) y que empiece
  // en la raíz conocida. Sin las dos cosas no se ofrece enlace. Un aviso sin
  // acción es mejor que llevar a alguien a una carpeta que no existe.
  const carpetaDeRegreso = (fila) => {
    const trozos = String(fila?.fullName || '').split(' / ').map(t => t.trim()).filter(Boolean);
    if (!fila || trozos.length < 2) return null;
    if (trozos[trozos.length - 1] !== fila.name) return null;
    if (trozos[0] !== RAIZ_SERVIDOR) return null;
    const carpetas = trozos.slice(1, -1);
    return projectPrefix + '/' + (carpetas.length ? carpetas.join('/') + '/' : '');
  };

  const avisarRestaurado = (ruta, cuantos) => {
    const texto = cuantos > 1 ? `${cuantos} elementos restaurados.` : 'Restaurado.';
    if (!ruta) { toast.success(texto); return; }
    toast.success(t => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {texto}
        <button
          onClick={() => { toast.dismiss(t.id); fe.switchMode(false); fe.navigate(ruta, null); }}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}>
          Ver en Archivos
        </button>
      </span>
    ), { duration: 6000 });
  };

  const restaurarElementos = async (ids) => {
    if (!ids?.length) return;
    // Sin espera artificial: la pausa de un segundo que había antes de pedir
    // nada no servía a nadie.
    fe.setRestoringIds(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = true; }); return n; });
    const filas = new Map(fe.deletedItems.map(it => [it.id, it]));
    const aceptados = [], errores = [];
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await apiFetch(`${API}/api/docs/restore`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) });
        if (res.ok) aceptados.push(id);
        else { const d = await res.json().catch(() => ({})); errores.push(d.error || 'No se pudo restaurar.'); }
      } catch { errores.push('Error de conexión al restaurar'); }
    }));
    fe.setRestoringIds(prev => { const c = { ...prev }; ids.forEach(id => { delete c[id]; }); return c; });

    if (aceptados.length) {
      // SÓLO SALE DE LA PAPELERA LO QUE EL SERVIDOR CONFIRMÓ. Lo rechazado
      // sigue a la vista, que es lo único que permite reintentarlo.
      fe.setDeletedItems(prev => prev.filter(it => !aceptados.includes(it.id)));
      fe.setSelectedDeletedIds(prev => prev.filter(x => !aceptados.includes(x)));
      fe.triggerRefresh(fe.currentPath);
      // El enlace, sólo si TODOS vuelven al mismo sitio. Con destinos distintos
      // cualquier elección sería arbitraria, así que no se ofrece ninguna.
      const rutas = aceptados.map(id => carpetaDeRegreso(filas.get(id)));
      const mismaCarpeta = rutas.every(r => r && r === rutas[0]);
      avisarRestaurado(mismaCarpeta ? rutas[0] : null, aceptados.length);
    }
    if (errores.length) {
      toast.error(ids.length > 1 ? `${errores.length} de ${ids.length} sin restaurar. ${errores[0]}` : errores[0]);
    }
  };

  // SOLTAR FICHEROS SOBRE LA SUPERFICIE. El motor de subida no se toca: esto
  // es cableado. `handleSopUpload` ya sube a `currentPath`, con sus trozos, su
  // reanudación, su progreso y su cancelación.
  //
  // Estado PROPIO y no el del modal (`fe.dragOver`): compartirlo haría que
  // arrastrar por detrás de un modal abierto encendiera su zona de soltar.
  //
  // Sólo se intercepta si el arrastre trae FICHEROS. Sin esa comprobación se
  // secuestra cualquier arrastre de la página -- texto, un enlace -- y el
  // navegador deja de hacer lo suyo.
  const [arrastreEncima, setArrastreEncima] = React.useState(false);
  const traeFicheros = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const superficieDeSoltar = {
    onDragOver: (e) => { if (!traeFicheros(e)) return; e.preventDefault(); if (!arrastreEncima) setArrastreEncima(true); },
    // `dragleave` salta también al pasar de un hijo a otro dentro de la misma
    // zona: sin esta comprobación el aviso parpadea mientras mueves el ratón.
    onDragLeave: (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setArrastreEncima(false); },
    onDrop: (e) => {
      if (!traeFicheros(e)) return;
      e.preventDefault();
      setArrastreEncima(false);
      if (e.dataTransfer.files?.length) fe.handleSopUpload(e.dataTransfer.files);
    },
  };

  // ESCAPE LIMPIA LA SELECCIÓN, pero sólo si nadie más lo está esperando.
  //
  // Escape es una tecla muy pedida: la quiere el campo de renombrar para
  // cancelar, la quiere un diálogo para cerrarse y la quiere el menú
  // contextual. Quien tiene algo abierto manda; la selección es lo último de
  // la cola. Sin este orden, cancelar un renombrado te borraría además la
  // selección que tenías hecha -- dos efectos de una tecla, y uno no lo pediste.
  //
  // Se comprueba lo que hay EN PANTALLA en vez de enumerar diez banderas de
  // estado: cada superficie que reclama Escape deja su marca en el DOM, y así
  // una superficie nueva queda cubierta sin tener que acordarse de ella aquí.
  const limpiarSeleccion = fe.setSelected;   // el actualizador de useState es estable
  React.useEffect(() => {
    const alPulsar = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;

      // ¿alguien está ESCRIBIENDO? ese campo se queda con la tecla.
      //
      // «Estar en un input» no basta: al marcar una casilla, el foco se queda
      // EN LA CASILLA, y entonces Escape no limpiaba nada -- que es justo lo
      // que se pide. Una casilla, un botón o un radio no consumen Escape; lo
      // consume lo que acepta texto.
      const foco = document.activeElement;
      const etiqueta = (foco?.tagName || '').toLowerCase();
      const SIN_TEXTO = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color']);
      const escribiendo = etiqueta === 'textarea'
        || (etiqueta === 'input' && !SIN_TEXTO.has((foco.type || 'text').toLowerCase()))
        || foco?.isContentEditable;
      if (escribiendo) return;

      // ¿hay una superficie abierta que la reclame?
      if (document.querySelector('.modal-overlay, .modal-content, .acc-modal-box, .row-context-menu, .inline-edit-box')) return;

      // Se pregunta por el estado AL VACIAR, no al suscribirse: así el
      // escuchador se pone una vez y no se rehace en cada marca y desmarca.
      limpiarSeleccion(previa => (previa.size > 0 ? new Set() : previa));
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [limpiarSeleccion]);

  const capsSeleccion = React.useMemo(() => capacidadesDeSeleccion({
    elementos: fe.elementosSeleccionados, isAdmin, isTrashMode: fe.isTrashMode,
  }), [fe.elementosSeleccionados, isAdmin, fe.isTrashMode]);

  // ── Revisiones (flujos de aprobación) ──
  const [reviewModalItems, setReviewModalItems] = React.useState(null); // null = cerrado
  // ── Transmittals ──
  const [transmittalItems, setTransmittalItems] = React.useState(null); // null = cerrado
  const [publicando, setPublicando] = React.useState(false);

  // Publicar al visor un modelo que YA esta en el ECD. No sube nada: le dice al
  // servidor que lleve a Autodesk los bytes que ya tiene. La traduccion tarda,
  // asi que se avisa y se deja seguir trabajando -- el modelo aparece en el
  // visor cuando Autodesk termina.
  const publicarAlVisor = async (doc) => {
    setPublicando(true);
    try {
      const r = await apiFetch(`${API}/api/modelos/publicar-desde-ecd`, {
        method: 'POST',
        body: JSON.stringify({ node_id: doc.id, model_urn: projectPrefix }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { toast.error(d.error || 'No se pudo publicar.'); return; }
      if (d.status === 'ya_publicado') {
        // No se vuelve a traducir: cada trabajo se cobra. Decirlo, en vez de
        // fingir que se ha hecho algo.
        toast.success(`${d.nombre} ya estaba publicado en el visor.`);
        return;
      }
      toast.success(`${d.nombre} enviado al visor. La traducción tarda unos minutos.`);
    } catch {
      toast.error('No se pudo publicar el modelo.');
    } finally {
      setPublicando(false);
    }
  };

  // ── Atributos personalizados ──
  const [attributesItem, setAttributesItem] = React.useState(null); // archivo en edición
  const [accBridgeFolder, setAccBridgeFolder] = React.useState(null);
  const [accBridgeInfo, setAccBridgeInfo] = React.useState(null);
  React.useEffect(() => {
    const folderId = fe.currentNodeId;
    if (!puedeVincularAcc || fe.isTrashMode || !folderId) return;
    let vigente = true;
    const params = new URLSearchParams({ local_folder_id: folderId, model_urn: projectPrefix });
    apiJson(`${API}/api/docs/cad/acc-bridge/folder?${params}`, { retries: 0 })
      .then(data => {
        if (vigente) setAccBridgeInfo({ folderId, bridge: data?.bridge || null, serviceEnabled: data?.service_enabled === true });
      })
      .catch(() => { if (vigente) setAccBridgeInfo({ folderId, bridge: null, serviceEnabled: false }); });
    return () => { vigente = false; };
  }, [fe.currentNodeId, fe.isTrashMode, puedeVincularAcc, projectPrefix]);
  // VISTA DE LA CARPETA: lista (por defecto) o cuadricula, como ACC. La
  // eleccion se RECUERDA: quien revisa planos vive en cuadricula y quien
  // revisa metadatos vive en lista; preguntarselo en cada carpeta seria
  // hacerle repetir una decision que ya tomo.
  const [vistaCarpeta, setVistaCarpeta] = React.useState(() => {
    try {
      return localStorage.getItem('alephia_vista_carpeta') === 'cuadricula'
        ? 'cuadricula' : 'lista';
    } catch { return 'lista'; }
  });
  const cambiarVista = (v) => {
    setVistaCarpeta(v);
    try { localStorage.setItem('alephia_vista_carpeta', v); } catch { /* noop */ }
  };
  // ── Conjuntos (Sets) ──
  const [setModalItems, setSetModalItems] = React.useState(null); // null = cerrado

  // ── Búsqueda global del proyecto (no solo carpeta actual) ──
  const [globalResults, setGlobalResults] = React.useState(null);
  // La regla —esperar, y que la ultima gane— vive en `utils/busquedaDiferida`,
  // fuera de React, porque es una carrera y una carrera hay que ejecutarla para
  // demostrarla. Aqui solo se dice QUE se busca y donde va el resultado.
  React.useEffect(() => programarBusqueda({
    consulta: fe.searchQuery,
    habilitada: ALCANCE_BUSQUEDA === 'proyecto' && !fe.isTrashMode && fe.sidebarView === 'files' && !enVista,
    buscar: async (q) => {
      const r = await apiFetch(`${API}/api/docs/search?q=${encodeURIComponent(q)}&model_urn=${encodeURIComponent(fe.projectPrefix)}`);
      const d = await r.json();
      // Sin `success` no hay respuesta util: se devuelve `undefined` y la
      // pantalla se queda como estaba.
      return d.success ? (d.data || []) : undefined;
    },
    alResultado: setGlobalResults,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [fe.searchQuery, fe.isTrashMode, fe.sidebarView, enVista]);

  // Sincronizar historial de versiones con el archivo abierto en el visor.
  // Sin esto, el dropdown de versiones mostraba el historial del último archivo
  // consultado en la tabla (o un spinner infinito) y "Hacer actual" podía
  // promover una versión en el archivo equivocado.
  React.useEffect(() => {
    if (fe.activeFile && fe.activeFile.type !== 'folder') {
      vh.setVersionTarget(fe.activeFile);
      vh.fetchVersionHistory(fe.activeFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fe.activeFile]);

  // NAVEGACIÓN · qué herramientas hay, en qué grupos y quién las ve. Antes se
  // escribía dentro de la barra lateral; ahora la usan la barra superior y la
  // lateral (según NAV_SUPERIOR), y por eso se calcula una sola vez aquí. Las
  // entradas, los filtros de permisos y los manejadores son los de siempre.
  const gruposNav = (
              /* Tres bloques, no doce elementos planos. Medido sobre la obra real:
                  Archivos tenia 2.831 registros y Revisiones, Transmittals y Conjuntos
                  tenian UNO cada uno, y todos ocupaban el mismo peso visual. Quien
                  entraba por primera vez no sabia por donde empezar y acababa usando
                  solo Archivos.
                  Cuarentena y Elementos suprimidos dejan de ser secciones: son formas
                  de MIRAR los archivos, y viven como filtros dentro de Archivos. */
              [
                // POR QUE ESTOS GRUPOS Y NO OTROS.
                //
                // «Entregas» habia crecido hasta TRECE entradas y mezclaba tres
                // cosas que no se parecen: tipos de documento, la maquinaria de
                // aprobacion, y lo que pasa en la obra. Un titulo que no
                // anticipa lo que hay debajo obliga a leerse la lista entera --
                // y con veinticuatro entradas eso es exactamente lo que pasaba.
                //
                // Se agrupa por LO QUE ESTA HACIENDO QUIEN MIRA, no por el tipo
                // de objeto: encontrar un documento, hacerlo circular y
                // aprobarlo, o registrar lo que ocurre en campo. Ningun grupo
                // pasa de siete entradas.
                //
                // Las entradas son LAS MISMAS: no se anade ni se quita ninguna,
                // y ninguna cambia de modo, de icono ni de manejador. Solo
                // cambian de grupo y de orden.
                { titulo: 'Documentos', items: [
                  // Buscar va primero: es lo que se hace cuando NO se sabe en qué
                  // carpeta está el documento. El filtro de la barra de archivos
                  // sólo mira la carpeta abierta, que es otra cosa.
                  // PORTADA (14-oct-2026): lo atrasado y lo que vence, por herramienta,
                  // y mis pendientes. Se entra igual que antes, por Archivos.
                  { label: 'Portada', mode: 'portada', icon: <IconoModulo nombre="cronograma" />, onClick: () => fe.setSidebarView('portada') },
                  { label: 'Buscar', mode: 'buscar', icon: <IconoModulo nombre="buscar" />, onClick: () => fe.setSidebarView('buscar') },
                  { label: 'Archivos', mode: 'files', icon: <IconoModulo nombre="archivos" />, onClick: () => { fe.setSidebarView('files'); fe.switchMode(false); } },
                  { label: 'Planos', mode: 'planos', icon: <IconoModulo nombre="planos" />, onClick: () => fe.setSidebarView('planos') },
                  { label: 'Especificaciones', mode: 'specs', icon: <IconoModulo nombre="especificaciones" />, onClick: () => fe.setSidebarView('specs') },
                  { label: 'Conjuntos', mode: 'sets', icon: <IconoModulo nombre="conjuntos" />, onClick: () => fe.setSidebarView('sets') },
                  // «Informes» se retira de V1: era un cascaron que decia
                  // «Proximamente disponible» y no habia nada detras. Lo que el
                  // producto SI sabe hacer --el indice del expediente, la actividad,
                  // el estado de las entregas-- ya vive en sus pantallas. Una entrada
                  // de menu que promete un modulo inexistente es peor que su ausencia.
                ]},
                { titulo: 'Revisión y entrega', items: [
                  { label: 'Revisiones', mode: 'reviews', icon: <IconoModulo nombre="revisiones" />, onClick: () => fe.setSidebarView('reviews') },
                  { label: 'Flujos de revisión', mode: 'flujos', icon: <IconoModulo nombre="flujos" />, onClick: () => fe.setSidebarView('flujos') },
                  { label: 'Submittals', mode: 'submittals', icon: <IconoModulo nombre="submittals" />, onClick: () => fe.setSidebarView('submittals') },
                  { label: 'Transmittals', mode: 'transmittals', icon: <IconoModulo nombre="transmittals" />, onClick: () => fe.setSidebarView('transmittals') },
                  { label: 'Plan de entrega', mode: 'plan', icon: <IconoModulo nombre="plan" />, onClick: () => fe.setSidebarView('plan') },
                  // RFI y Red Line viven aqui y no en «En obra»: son consultas
                  // FORMALES sobre un documento que esperan respuesta, o sea parte
                  // del intercambio, no de la ejecucion.
                  // RFI va antes que Red Line porque es el objeto contractual; la
                  // observacion es interna.
                  { label: 'RFI', mode: 'rfis', icon: <IconoModulo nombre="rfi" />, onClick: () => fe.setSidebarView('rfis') },
                  { label: 'Red Line', mode: 'redlines', icon: <IconoModulo nombre="redline" />, onClick: () => fe.setSidebarView('redlines') },
                ]},
                { titulo: 'En obra', items: [
                  { label: 'Fotos de campo', mode: 'multimedia', icon: <IconoModulo nombre="fotos" />, onClick: () => fe.setSidebarView('multimedia') },
                  { label: 'Trabajo de campo', mode: 'campo', icon: <IconoModulo nombre="campo" />, onClick: () => fe.setSidebarView('campo') },
                  { label: 'Protocolos', mode: 'protocolos', icon: <IconoModulo nombre="protocolos" />, onClick: () => fe.setSidebarView('protocolos') },
                  { label: 'Issues y punch', mode: 'punch', icon: <IconoModulo nombre="incidencias" />, onClick: () => fe.setSidebarView('punch') },
                  { label: 'Cuaderno de obra', mode: 'cuaderno', icon: <IconoModulo nombre="cuaderno" />, onClick: () => fe.setSidebarView('cuaderno') },
                  { label: 'Avance físico', mode: 'avance', icon: <IconoModulo nombre="avance" />, onClick: () => fe.setSidebarView('avance') },
                ]},
                // QUIÉN VE QUÉ EN «ADMINISTRACIÓN» — por FIGURA, no por rol global.
                // La regla es la misma que en el resto del expediente: no ofrecer
                // botones que el servidor va a negar.
                //   · todos los miembros:  Idoneidad (catálogo de referencia,
                //     solo lectura sin Entity Admin) y Participantes (ver quién
                //     participa; editar ya lo gatea el módulo).
                //   · administra ESTA obra (isAdmin):  Triaje, Actividad y
                //     Configuración de la obra.
                //   · Entity Admin:  Usuarios del sistema — es un padrón de la
                //     INSTANCIA, no de la obra, y su ruta lo recorta igual.
                { titulo: 'Administración', alPie: true, items: [
                  { label: 'Códigos de idoneidad', mode: 'idoneidad', icon: <IconoModulo nombre="idoneidad" />, onClick: () => fe.setSidebarView('idoneidad') },
                  ...(isAdmin ? [
                  { label: 'Triaje de seguridad', mode: 'triaje', icon: <IconoModulo nombre="triaje" />, onClick: () => fe.setSidebarView('triaje') },
                  ] : []),
                  // Participantes = quien participa en ESTA obra (persona, empresa,
                  // funcion contractual). «Miembros» es otra cosa: los usuarios del
                  // SISTEMA y su rol global. Estaban confundidos en un solo sitio.
                  { label: 'Participantes', mode: 'participantes', icon: <IconoModulo nombre="participantes" />, onClick: () => fe.setSidebarView('participantes') },
                  ...(esEntityAdmin ? [
                  { label: 'Usuarios del sistema', mode: 'members', icon: <IconoModulo nombre="usuarios" />, onClick: () => { fe.setSidebarView('members'); fe.setMembersLoading(true); apiFetch(`${API}/api/users`).then(r => r.json()).then(d => fe.setMembersList(d.users || d || [])).catch(() => { fe.setMembersList([]); toast.error('No se pudieron cargar los miembros.'); }).finally(() => fe.setMembersLoading(false)); } },
                  ] : []),
                  ...(isAdmin ? [
                  { label: 'Actividad', mode: 'activity', icon: <IconoModulo nombre="actividad" />, onClick: () => fe.setSidebarView('activity') },
                  { label: 'Configuración', mode: 'settings', icon: <IconoModulo nombre="configuracion" />, onClick: () => fe.setSidebarView('settings') },
                  ] : []),
                ]},
              ]
                // CAPA 16 · lo apagado NO SE OFRECE. El servidor ya lo niega
                // con 403; ensenar la pestaña seria prometer lo que el
                // producto no hace. Esto no autoriza nada -- solo deja de
                // mentir. Mientras el estado no ha llegado, no se esconde
                // nada: mejor una pestaña de mas un instante que un menu que
                // parpadea.
                .map(grupo => ({ ...grupo, items: grupo.items.filter(it => {
                  // Y la cola de campo, ademas, solo si el servidor la
                  // recibe. Una pestaña que promete offline contra un backend
                  // que no lo tiene es peor que no tenerla.
                  if (it.mode === 'campo') {
                    if (hayCampo === false) return false;
                    if (hayCampo === null && navigator.onLine) return false;
                  }
                  const cod = HERRAMIENTA_DE_MODO[it.mode];
                  if (!cod) return true;
                  // Una entrada puede depender de VARIAS herramientas: basta con
                  // que una siga encendida para que tenga sentido ofrecerla.
                  const codigos = Array.isArray(cod) ? cod : [cod];
                  return codigos.some(c => fe.herramientasDeObra?.[c] !== false);
                }) }))
                .filter(grupo => grupo.items.length > 0)
  );

  // El usuario (avatar y su menú), igual en las dos cabeceras.
  const menuUsuario = (
          <div className="header-user" style={{ position: 'relative' }}>
             <div className="header-avatar" onClick={() => fe.setProfileMenuOpen(!fe.profileMenuOpen)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{getInitials(user.name)}</div>
             {fe.profileMenuOpen && (
               <div style={{ position: 'absolute', top: 40, right: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.15)', minWidth: 220, zIndex: 9999, border: '1px solid #e8e6dc', overflow: 'hidden' }}>
                 <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f0e8' }}>
                   <div style={{ fontWeight: 600, fontSize: 13, color: '#333330' }}>{user.name}</div>
                   <div style={{ fontSize: 11, color: '#72706b', marginTop: 2 }}>{user.email}</div>
                   <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{user.role || 'user'}</div>
                 </div>
                 <MenuItem icon="swap" label="Cambiar proyecto" onClick={() => { fe.setProfileMenuOpen(false); onBack(); }} />
                 {/* Salida al Hub sin cerrar sesión: desde dentro de un proyecto
                     no había ninguna. */}
                 {onBackToHub && (
                   <MenuItem icon="home" label="Ir al inicio" onClick={() => { fe.setProfileMenuOpen(false); onBackToHub(); }} />
                 )}
                 <MenuItem icon="exit" label="Cerrar sesión" danger divider onClick={() => { fe.setProfileMenuOpen(false); if (onLogout) onLogout(); }} />
               </div>
             )}
          </div>
  );

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div className="acc-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* Los avisos se montan UNA vez para todo el portal, en main.jsx. */}
      {NAV_SUPERIOR ? (
        <BarraSuperior
          proyecto={project.name}
          grupos={gruposNav}
          activo={fe.isTrashMode ? 'files' : fe.sidebarView}
          onInicio={onBackToHub || onBack}
          onCambiarObra={onBack}
          onBuscar={() => fe.setSidebarView('buscar')}
          derecha={menuUsuario}
        />
      ) : (<>
      <div className="acc-top-strip" style={{ height: 3, background: 'var(--accent)', flexShrink: 0 }} />

      {/* ─── HEADER ─── */}
      <header className="acc-top-header" style={{ height: 48, borderBottom: '1px solid #f1f0e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* MARCA (logo oficial, sin redibujar) · PRODUCTO (Docs). El
              proyecto ya se muestra aparte, a la derecha de este bloque.
              Logo de 01_Master_Vector: 28px de alto ⇒ ~126px de ancho,
              sobre el mínimo digital de 120px que fija el manual. */}
          <div className="module-selector" onClick={onBack} title="Cambiar proyecto" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <img src="/brand/ALEPHIA_Logo_Horizontal_Navy.svg" alt="ALEPHIA" style={{ height: 28, width: 'auto', display: 'block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--alephia-steel)', letterSpacing: '0.4px', paddingLeft: 10, borderLeft: '1px solid var(--border)' }}>Docs</span>
          </div>
          {/* Atajo al Visor 3D sin pasar por el Hub: apagado por DOCS_VISOR_SHORTCUT. */}
          {DOCS_VISOR_SHORTCUT && <>
          <div className="separator-line" style={{ width: 1, height: 20, background: '#f1f0e8', margin: '0 8px' }} />
          <button 
            className="gateway-trigger-btn"
            onClick={() => setShowGateway(true)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6, 
              background: 'var(--accent)', color: '#fff', 
              border: 'none', borderRadius: '4px', 
              padding: '4px 12px', fontSize: 13, 
              fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            Frentes 3D
          </button>
          </>}
          <div className="separator-line" style={{ width: 1, height: 20, background: '#f1f0e8', margin: '0 8px' }} />
          <div className="project-selector" style={{ fontSize: 14, fontWeight: 600, color: '#333330', textTransform: 'uppercase' }}>
            <span>{project.name}</span>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
{menuUsuario}
        </div>
      </header>
      </>)}

      {/* ─── MAIN LAYOUT ─── */}
      <main className="acc-main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* GLOBAL SIDEBAR. Qué entradas hay, en qué grupos y quién las ve se
            decide aquí; cómo se dibujan, en components/BarraLateral.jsx
            (UI polish F4). */}
        {!NAV_SUPERIOR && (
        <BarraLateral
          ancho={globalSidebarWidth}
          onAlternar={() => setGlobalSidebarWidth(globalSidebarWidth > 100 ? 60 : 240)}
          activo={fe.isTrashMode ? null : fe.sidebarView}
          grupos={gruposNav}
        />
        )}

        {/* CONTENT AREA */}
        <div className="acc-docs-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Suspense fallback={<ChunkFallback />}>

        {/* QUARANTINE VIEW */}
        {fe.sidebarView === 'quarantine' && !fe.isTrashMode && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '24px 24px 0' }}>
              <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Archivos</div>
              <PestanasDeArchivos fe={fe} isAdmin={isAdmin} />
            </div>
            <QuarantineTable projectPrefix={projectPrefix} API={API} isAdmin={isAdmin} user={user} />
          </div>
        )}

        {/* ACTIVITY VIEW */}
        {fe.sidebarView === 'activity' && (
          <ActivityView projectPrefix={projectPrefix} />
        )}

        {/* REVIEWS VIEW */}
        {fe.sidebarView === 'reviews' && (
          <ReviewsView projectPrefix={projectPrefix} user={user} isAdmin={isAdmin} />
        )}

        {/* TRANSMITTALS VIEW */}
        {fe.sidebarView === 'portada' && (
          <PortadaObra projectPrefix={projectPrefix} projectId={project?.id} nombreObra={project?.name}
            recuentos={vistas.recuentos} hayPlan={vistas.hayPlan}
            onIr={(modo) => fe.setSidebarView(modo)}
            onAbrirVista={(v) => {
              fe.setSidebarView('files');
              fe.switchMode(false);
              elegirVista({ tipo: 'serie', id: v.clave, nombre: v.etiqueta, ayuda: v.ayuda,
                            coleccion: { revision: 'En revisión', publicados: 'Publicados', plan: 'Plan de entregas' }[v.coleccion],
                            criterios: v.criterios });
            }} />
        )}
        {fe.sidebarView === 'plan' && (
          <PlanEntregaView projectPrefix={projectPrefix} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'idoneidad' && (
          <CatalogoIdoneidadView projectPrefix={projectPrefix} isAdmin={esEntityAdmin} />
        )}

        {/* Guardar el triaje es un acto de la ENTIDAD (su ruta exige Entity
            Admin): el admin de obra lo ve en solo lectura, no con un editor
            que devuelve 403 al guardar. */}
        {fe.sidebarView === 'triaje' && (
          <TriajeSeguridadView projectPrefix={projectPrefix} isAdmin={esEntityAdmin} />
        )}

        {fe.sidebarView === 'transmittals' && (
          <TransmittalsView projectPrefix={projectPrefix} />
        )}

        {/* SETS VIEW */}
        {fe.sidebarView === 'sets' && (
          <SetsView projectPrefix={projectPrefix} isAdmin={isAdmin} />
        )}

        {/* RED LINES VIEW */}
        {fe.sidebarView === 'rfis' && (
          <RfiModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'redlines' && (
          <RedLineModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'submittals' && (
          <SubmittalsModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'planos' && (
          <PlanosModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'protocolos' && (
          <ProtocolosModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'punch' && (
          <PunchModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'campo' && (
          <SincronizacionModule project={project} usuario={user} />
        )}

        {fe.sidebarView === 'specs' && (
          <EspecificacionesModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {fe.sidebarView === 'flujos' && (
          <FlujosDeRevisionModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {/* MULTIMEDIA VIEW */}
        {fe.sidebarView === 'multimedia' && (
          <FotosModule project={project} API={API} user={user}
                       MultimediaLegacy={MultimediaModule} />
        )}

        {/* NG-03 · CUADERNO DE OBRA */}
        {fe.sidebarView === 'cuaderno' && (
          <CuadernoModule project={project} API={API} user={user} />
        )}

        {fe.sidebarView === 'avance' && (
          <AvanceModule project={project} API={API} user={user} isAdmin={isAdmin} />
        )}

        {/* REPORTS VIEW */}

        {/* MEMBERS VIEW */}
        {fe.sidebarView === 'buscar' && (
          <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#72706b' }}>Cargando…</div>}>
            <BusquedaGlobalModule project={project} />
          </Suspense>
        )}

        {fe.sidebarView === 'participantes' && (
          <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#72706b' }}>Cargando…</div>}>
            <ParticipantesModule project={project} isAdmin={isAdmin} />
          </Suspense>
        )}

        {fe.sidebarView === 'members' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 400 }}>Usuarios del sistema</div>
                {/* Esta pantalla NO lista la obra: lista usuarios de la instancia,
                    y por eso puede enseñar gente de otros proyectos. Quien participa
                    en ESTA obra está en «Participantes». */}
                <div style={{ fontSize: 12, color: '#72706b', marginTop: 3 }}>
                  Cuentas y perfil de acceso. Quién participa en esta obra está en <b>Participantes</b>.
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#72706b' }}>{fe.membersList.length} miembro{fe.membersList.length !== 1 ? 's' : ''}</div>
            </div>
            {fe.membersLoading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#72706b' }}>Cargando miembros...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '2px solid #f1f0e8', color: '#72706b', fontWeight: 500 }}><th style={{ padding: '10px 12px', textAlign: 'left' }}>Nombre</th><th style={{ padding: '10px 12px', textAlign: 'left' }}>Email</th><th style={{ padding: '10px 12px', textAlign: 'left' }}>Rol</th><th style={{ padding: '10px 12px', textAlign: 'left' }}>Registro</th></tr></thead>
                <tbody>
                  {fe.membersList.map((m, i) => (
                    <tr key={m.id || i} style={{ borderBottom: '1px solid #f1f0e8' }} onMouseOver={e => e.currentTarget.style.background='#faf9f5'} onMouseOut={e => e.currentTarget.style.background='none'}>
                      <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'admin' ? 'var(--accent)' : 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{getInitials(m.name || m.email || '?')}</div>
                        <span style={{ fontWeight: 500 }}>{m.name || '—'}</span>
                      </td>
                      <td style={{ padding: '12px', color: '#72706b' }}>{m.email}</td>
                      <td style={{ padding: '12px' }}>
                        {/* La puerta que faltaba: el backend cambia roles bien
                            (ultimo admin protegido, sesiones revocadas,
                            auditado) y ningun cliente lo llamaba. */}
                        <Suspense fallback={<span style={{ fontSize: 11, color: '#72706b' }}>…</span>}>
                          {/* CAMBIAR `users.role` ES UN ACTO DE LA ENTIDAD.
                              Esta pantalla lista usuarios de la INSTANCIA, no
                              de la obra, asi que administrar esta obra no
                              alcanza: hace falta ser Entity Admin. */}
                          <RolDeMiembro miembro={m} isAdmin={esEntityAdmin}
                                        onCambiado={() => { apiFetch(`${API}/api/users`).then(r => r.json()).then(d => fe.setMembersList(d.users || d || [])).catch(() => {}); }} />
                        </Suspense>
                      </td>
                      <td style={{ padding: '12px', color: '#72706b', fontSize: 12 }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* SETTINGS VIEW */}
        {fe.sidebarView === 'settings' && (
          <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 24 }}>Configuración</div>
            <div style={{ background: '#fff', border: '1px solid #e8e6dc', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333330', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" style={{ fill: 'var(--accent)' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>Información del Proyecto</div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 16px', fontSize: 13 }}>
                <span style={{ color: '#72706b', fontWeight: 500 }}>Nombre:</span><span style={{ color: '#333330' }}>{project.name}</span>
                <span style={{ color: '#72706b', fontWeight: 500 }}>Número:</span><span style={{ color: '#333330' }}>{project.number || '—'}</span>
                <span style={{ color: '#72706b', fontWeight: 500 }}>Ubicación:</span><span style={{ color: '#333330' }}>{project.location || '—'}</span>
                <span style={{ color: '#72706b', fontWeight: 500 }}>Cuenta:</span><span style={{ color: '#333330' }}>{project.account || project.hub_name || '—'}</span>
                <span style={{ color: '#72706b', fontWeight: 500 }}>Creado:</span><span style={{ color: '#333330' }}>{project.created_at ? new Date(project.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </div>
            {/* CAPA 16 · qué herramientas EXISTEN en esta obra. La leen todos
                (la interfaz no debe ofrecer pestañas que van a dar 403);
                cambiarlas es del administrador de la obra. */}
            <HerramientasDeObra projectPrefix={projectPrefix} isAdmin={isAdmin} />
            {isAdmin && <AttributesAdmin projectPrefix={projectPrefix} />}
            {isAdmin && <SharesManager projectPrefix={projectPrefix} />}
            <div style={{ background: '#fff', border: '1px solid #e8e6dc', borderRadius: 8, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333330', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><svg width="18" height="18" viewBox="0 0 24 24" style={{ fill: 'var(--accent)' }}><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>Almacenamiento</div>
              <div style={{ fontSize: 13, color: '#72706b' }}>Google Cloud Storage — activo</div>
              <div style={{ marginTop: 12, background: '#f1f0e8', borderRadius: 8, height: 8, overflow: 'hidden' }}><div style={{ width: '15%', height: '100%', background: 'linear-gradient(90deg, var(--accent), #6a9bcc)', borderRadius: 8 }} /></div>
              <div style={{ fontSize: 11, color: '#72706b', marginTop: 6 }}>Uso estimado del proyecto</div>
            </div>

            {/* El expediente es de la obra, no de la plataforma: indice xlsx
                + zip de documentos. La mitad del backend existia sin llamador. */}
            <Suspense fallback={null}>
              <ExportarExpedientePanel project={project} projectPrefix={projectPrefix} />
            </Suspense>

            {/* La puerta para archivar una obra. El backend sabia hacerlo desde
                siempre --ruta de administrador, auditada-- y NINGUN cliente la
                llamaba: la capacidad estaba, la puerta no. */}
            <Suspense fallback={null}>
              <ArchivarObraPanel project={project} isAdmin={esEntityAdmin} />
            </Suspense>
          </div>
        )}

        {/* FILES VIEW */}
        {fe.sidebarView === 'files' && (<>
          <header style={{ padding: '24px 24px 0 24px', flexShrink: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 16 }}>{fe.isTrashMode ? 'Elementos suprimidos' : 'Archivos'}</div>
            {!fe.isTrashMode && <PestanasDeArchivos fe={fe} isAdmin={isAdmin} />}
            {fe.isTrashMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e8e6dc', paddingBottom: 8 }}>
                 <button onClick={() => fe.switchMode(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: '#72706b', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
                   Volver a archivos
                 </button>
                 {isAdmin && fe.selectedDeletedIds.length > 0 && (
                   <button onClick={async () => {
                       const count = fe.selectedDeletedIds.length;
                       const ok = await confirmAction({
                         title: 'Eliminar permanentemente',
                         message: `Se eliminarán ${count} elemento(s) de forma irreversible. Esta acción no se puede deshacer.`,
                         confirmText: 'Eliminar',
                         danger: true,
                       });
                       if (!ok) return;
                       // Cada uno desaparece EN CUANTO se confirma, no al final del
                       // lote. Antes las N peticiones iban en serie y la lista no se
                       // tocaba hasta terminarlas todas: con varios elementos, lo que
                       // acababas de destruir seguía en pantalla varios segundos.
                       // Y se quitaban TODOS los ids aunque alguno hubiera fallado,
                       // así que el aviso decía "3 de 5" mientras desaparecían los 5.
                       let deleted = 0;
                       for (const id of fe.selectedDeletedIds) {
                         try {
                           const res = await apiFetch(`${API}/api/docs/permanent-delete`, { method: 'DELETE', body: JSON.stringify({ id, model_urn: projectPrefix, user: user.name }) });
                           if (res.ok) {
                             deleted++;
                             fe.setDeletedItems(prev => prev.filter(it => it.id !== id));
                             fe.setSelectedDeletedIds(prev => prev.filter(x => x !== id));
                           } else { const errBody = await res.text(); toast.error('Error eliminando: ' + errBody); }
                         } catch (e) { toast.error('Error: ' + e.message); }
                       }
                       fe.triggerRefresh(fe.currentPath);
                       if (deleted === count) toast.success(deleted + ' eliminado(s) permanentemente.');
                       else toast.error(deleted + ' de ' + count + ' eliminado(s). El resto sigue en la papelera.');
                     }}
                     style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#b93535', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', padding: '6px 14px', borderRadius: 4, fontWeight: 600 }}>
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                     Eliminar permanentemente ({fe.selectedDeletedIds.length})
                   </button>
                 )}
              </div>
            )}
          </header>

          {/* La ficha va ENCIMA del árbol y la tabla, que siguen montados y con su
              tamaño: ocultarlos con display:none dejaba la tabla virtual midiendo 0 de
              alto, y al volver no pintaba ninguna fila. */}
          <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
          {ficha && !fe.isTrashMode && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
            <FichaDocumento item={ficha} lista={[...(enVista ? filasDeVista : fe.filteredFiles)].sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), undefined, { numeric: true, sensitivity: 'base' }))}
              onCambiar={(f) => { setFicha(f); setConsultado(f); }} onCerrar={() => setFicha(null)}
              onAbrir={abrirDocumento} onVersiones={vh.onShowVersions}
              onIrA={(v) => { setFicha(null); fe.setSidebarView(v); }} />
            </div>
          )}
          <div className="acc-workspace" style={{ flex: 1, display: 'flex', overflow: 'hidden', visibility: ficha && !fe.isTrashMode ? 'hidden' : 'visible' }}>
            {/* TREE SECTION */}
            <aside style={{ width: treeSidebarWidth, flexShrink: 0, borderRight: '1px solid #e8e6dc', background: 'var(--bg-tertiary)', overflowY: 'auto', padding: '16px 0' }}>
              {!fe.isTrashMode && (
                <PanelDeVistas recuentos={vistas.recuentos} hayPlan={vistas.hayPlan} activa={vistas.activa}
                  propias={vistas.propias} onElegir={elegirVista} onBorrar={vistas.borrar} />
              )}
              {!fe.isTrashMode && grupos.disponible && (
                <PanelDeGrupos grupos={grupos.grupos} activo={grupoActivo?.id || null} onElegir={elegirGrupo}
                  onCrear={grupos.crear} puedeCrearDeLaObra={grupos.puedeCrearDeLaObra} />
              )}
              <FolderNode
                user={user} folder={{ id: fe.projectRootId, name: 'Archivos de proyecto', fullName: projectPrefix }}
                currentPath={enVista ? "" : fe.currentPath} onNavigate={navegarYSalir} onReset={() => fe.setCollapseSignal(s => s+1)}
                collapseSignal={fe.collapseSignal} projectPrefix={projectPrefix} level={0} defaultExpanded={true}
                isAdmin={isAdmin} onTreeRefresh={() => {}} onGlobalRefresh={(p) => { fe.triggerRefresh(fe.currentPath); if (p) fe.navigate(p); }}
                refreshSignal={fe.refreshSignal} nodosInvalidados={fe.nodosInvalidados} onInitiateMove={(items) => fe.setMoveState({ step: 1, items, destPath: '' })}
                onRowMenu={(item, e) => { fe.setRightClickedId(item.id); fe.setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'sidebar' }); }}
                editingNodeId={fe.editingNodeId} setEditingNodeId={fe.setEditingNodeId}
                rightClickedId={fe.rightClickedId} processingIds={fe.processingIds} setProcessingIds={fe.setProcessingIds}
                creatingChildParentId={fe.creatingChildParentId} setCreatingChildParentId={fe.setCreatingChildParentId}
                cacheMethods={fe.cacheMethods}
              />
            </aside>

            {/* RESIZER */}
            {/* Divisor: arrastrar (sigue al ratón desde donde se agarra), flechas del teclado o
                doble clic para volver al ancho de siempre. El ancho se recuerda. */}
            <div className="divisor-arbol" role="separator" aria-orientation="vertical" tabIndex={0}
                 aria-label="Ancho del panel de carpetas" aria-valuenow={treeSidebarWidth} aria-valuemin={arbolMin} aria-valuemax={arbolMax}
                 title="Arrastra para cambiar el ancho · doble clic para restablecerlo"
                 onPointerDown={startTreeResize} onKeyDown={teclaTree} onDoubleClick={resetTree}>
              <span className="divisor-arbol__asa" />
            </div>

            {/* DATA PANEL */}
            <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)', position: 'relative' }}>
              {grupoActivo && !fe.isTrashMode && (
                <GrupoAbierto key={grupoActivo.id} grupo={grupoActivo} servicio={grupos}
                  puedeEscribir={!grupoActivo.de_la_obra || grupos.puedeCrearDeLaObra}
                  onAbrir={abrirDelGrupo} onCerrar={() => setGrupoActivoId(null)} onBorrado={() => setGrupoActivoId(null)}
                  onIrACarpeta={(d) => navegarYSalir([projectPrefix, ...d.ruta].join('/') + '/', d.carpeta_id)} />
              )}
              <div className="acc-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', ...(enVista ? { justifyContent: 'flex-start' } : {}), background: 'var(--bg-primary)', borderBottom: '1px solid #f1f0e8', flexShrink: 0 }}>
                {fe.puedeEditarAqui && !fe.isTrashMode && !enVista && (
                  <button type="button" onClick={() => fe.setShowUploadModal(true)} className="barra-btn barra-btn--primario">Cargar archivos</button>
                )}
                {fe.puedeEditarAqui && !fe.isTrashMode && !enVista && (
                  <button type="button" onClick={() => { fe.setNewFolderParentPath(''); fe.setShowNewFolder(true); }} title="Crear carpeta en la ubicación actual"
                    className="barra-btn barra-btn--contorno">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                    Nueva carpeta
                  </button>
                )}
                {!enVista && !fe.isTrashMode && puedeVincularAcc && fe.currentNodeId && fe.selected.size === 0 && (
                  <>
                  <button type="button"
                    onClick={() => setAccBridgeFolder({
                      id: fe.currentNodeId,
                      name: fe.currentPath.replace(/\/+$/, '').split('/').at(-1),
                    })}
                    title="Vincular, cambiar o desactivar el destino ACC de esta carpeta"
                    aria-label="Configurar vínculo ACC de la carpeta actual"
                    className="barra-btn barra-btn--contorno">
                    <span aria-hidden="true">↔</span> Vincular ACC
                  </button>
                  {accBridgeInfo?.folderId === fe.currentNodeId && accBridgeInfo.bridge?.enabled && (
                    <span title={`${accBridgeInfo.bridge.project_name || accBridgeInfo.bridge.project_id} / ${accBridgeInfo.bridge.folder_name || accBridgeInfo.bridge.folder_id}`}
                      style={{ color: '#507294', fontSize: 12, whiteSpace: 'nowrap', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ACC: {accBridgeInfo.bridge.project_name || accBridgeInfo.bridge.project_id} / {accBridgeInfo.bridge.folder_name || accBridgeInfo.bridge.folder_id}
                      {!accBridgeInfo.serviceEnabled && ' (pausado)'}
                    </span>
                  )}
                  </>
                )}

                {!fe.isTrashMode && fe.selected.size > 0 && (() => {
                  const selFiles = fe.files.filter(f => fe.selected.has(f.id));
                  if (!selFiles.length) return null;
                  return (
                    <button type="button" onClick={() => setReviewModalItems(selFiles.map(f => ({ node_id: f.id, name: f.name, version: f.version || 1, version_id: f.version_id || null })))}
                      className="barra-btn barra-btn--texto">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Enviar a revisión
                    </button>
                  );
                })()}

                {/* PUBLICAR AL VISOR — solo administrador y solo si lo
                    seleccionado es un modelo. El documento del ECD ES el modelo:
                    esto no vuelve a subir nada, lleva a Autodesk los bytes que
                    ya estan en el almacen. Traducir cuesta creditos, por eso no
                    se ofrece a cualquiera ni sobre cualquier fichero. */}
                {!fe.isTrashMode && isAdmin && fe.selected.size > 0 && (() => {
                  const MODELOS = ['.rvt', '.ifc', '.nwd', '.nwc', '.dwg', '.dxf',
                                   '.dgn', '.3dm', '.skp', '.laz', '.e57', '.rcp'];
                  const selFiles = fe.files.filter(f => fe.selected.has(f.id))
                    .filter(f => MODELOS.some(e => (f.name || '').toLowerCase().endsWith(e)));
                  if (selFiles.length !== 1) return null;
                  const doc = selFiles[0];
                  return (
                    <button type="button" onClick={() => publicarAlVisor(doc)} disabled={publicando}
                      title="Llevar este modelo al visor sin volver a subirlo"
                      className="barra-btn barra-btn--texto">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                      {publicando ? 'Publicando…' : 'Publicar al visor'}
                    </button>
                  );
                })()}

                {!fe.isTrashMode && fe.selected.size > 0 && (() => {
                  const selFiles = fe.files.filter(f => fe.selected.has(f.id));
                  if (!selFiles.length) return null;
                  return (
                    <button type="button" onClick={() => setTransmittalItems(selFiles.map(f => ({ node_id: f.id, name: f.name, version: f.version || 1, version_id: f.version_id || null })))}
                      className="barra-btn barra-btn--texto">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Transmittal
                    </button>
                  );
                })()}

                {!fe.isTrashMode && fe.selected.size > 0 && (() => {
                  const selFiles = fe.files.filter(f => fe.selected.has(f.id));
                  if (!selFiles.length) return null;
                  return (
                    <button type="button" onClick={() => setSetModalItems(selFiles.map(f => ({ node_id: f.id, name: f.name, version: f.version || 1, version_id: f.version_id || null })))}
                      className="barra-btn barra-btn--texto">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Añadir a conjunto
                    </button>
                  );
                })()}

                {!fe.isTrashMode && fe.selected.size > 0 && (
                  <>
                    <button
                      disabled={!capsSeleccion.desplazar.disponible}
                      title={capsSeleccion.desplazar.motivo || 'Desplazar a otra carpeta'}
                      onClick={() => {
                        if (!capsSeleccion.desplazar.disponible) return;
                        // La selección ya son ids. Antes esto traducía de ruta
                        // a id y en cuadrícula no encontraba nada: el diálogo se
                        // abría con la selección vacía y moría al final, mudo.
                        const itemIds = fe.elementosSeleccionados.map(i => i.id);
                        fe.setMoveState({ step: 1, items: fe.elementosSeleccionados.map(i => i.name), itemIds, destPath: '', destId: null });
                      }} type="button" className="barra-btn barra-btn--texto">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11l3 3-3 3"></path><path d="M9 14h6"></path></svg> Desplazar
                    </button>
                    <button
                      disabled={!capsSeleccion.suprimir.disponible}
                      title={capsSeleccion.suprimir.motivo || 'Mover a la papelera'}
                      onClick={fe.handleExecuteBatchDelete}
                      type="button" className="barra-btn barra-btn--texto barra-btn--peligro">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg> Suprimir
                    </button>
                  </>
                )}

                {fe.isTrashMode && fe.selectedDeletedIds.length > 0 && (
                  <button type="button" onClick={() => restaurarElementos([...fe.selectedDeletedIds])} className="barra-btn barra-btn--neutro">
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg> Restaurar ({fe.selectedDeletedIds.length})
                  </button>
                )}

                <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#72706b" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', translate: '0 -50%' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input type="text" placeholder={enVista ? 'Buscar en esta vista' : 'Buscar y filtrar'} aria-label={enVista ? 'Buscar en esta vista' : 'Buscar y filtrar'} value={fe.searchQuery} onChange={e => fe.setSearchQuery(e.target.value)} className="barra-campo" style={{ width: '100%', paddingLeft: 30, paddingRight: 8 }} />
                </div>

                {!fe.isTrashMode && (
                  <select value={fe.statusFilter} onChange={e => fe.setStatusFilter(e.target.value)}
                    title="Filtrar por estado de revisión"
                    className="barra-campo"
                    style={{ padding: '0 8px', color: fe.statusFilter === 'ALL' ? 'var(--a-text-secondary)' : 'var(--accent)', fontWeight: fe.statusFilter === 'ALL' ? 400 : 600, cursor: 'pointer' }}>
                    <option value="ALL">Todos los estados</option>
                    <option value="WIP">WIP</option>
                    <option value="SHARED">Compartido</option>
                    <option value="PUBLISHED">Publicado</option>
                    <option value="ARCHIVED">Archivado</option>
                  </select>

                )}

                {/* A2: filtros por tipo, disciplina (del código) y entrega (del plan). */}
                {!fe.isTrashMode && (
                  <FiltrosDeArchivos files={enVista ? (vistas.filas || []) : fe.files} filtros={fe.filtrosMeta} setFiltros={fe.setFiltrosMeta} />
                )}

                {/* LISTA o CUADRICULA (peticion del dueno, con ACC al lado).
                    En una carpeta de 45 planos con nombres que difieren en un
                    digito, la lista obliga a leer codigos; la cuadricula deja
                    que el ojo reconozca el dibujo. */}
                {!fe.isTrashMode && !enVista && (
                  <div className="acc-vista-switch" style={{ marginLeft: 'auto' }}>
                    <button className={vistaCarpeta === 'cuadricula' ? 'activo' : ''}
                      onClick={() => cambiarVista('cuadricula')} title="Ver en cuadrícula">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="3" y="3" width="8" height="8" rx="1.5"/>
                        <rect x="13" y="3" width="8" height="8" rx="1.5"/>
                        <rect x="3" y="13" width="8" height="8" rx="1.5"/>
                        <rect x="13" y="13" width="8" height="8" rx="1.5"/>
                      </svg>
                    </button>
                    <button className={vistaCarpeta === 'lista' ? 'activo' : ''}
                      onClick={() => cambiarVista('lista')} title="Ver en lista">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round">
                        <path d="M4 6h16M4 12h16M4 18h16"/>
                      </svg>
                    </button>
                  </div>
                )}

              </div>

              {!fe.isTrashMode && (
                <div className="filtros-y-vista">
                  <FichasDeFiltros filtros={fe.filtrosMeta} setFiltros={fe.setFiltrosMeta} />
                  {/* GUARDAR COMO VISTA (A2-2): los filtros puestos, con un nombre. No
                      dentro de una vista: guardaría solo una parte de lo que se ve. */}
                  {!enVista && filtrosPuestos && vistas.puedeGuardar && (
                    <GuardarComoVista
                      descripcion={describirFiltros({ texto: fe.searchQuery.trim(), estado: fe.statusFilter, ...fe.filtrosMeta })}
                      carpeta={fe.currentPath && fe.currentPath.replace(/\/+$/, '') !== projectPrefix
                        ? { ruta: fe.currentPath, id: fe.currentNodeId ? String(fe.currentNodeId) : null,
                            nombre: fe.currentPath.replace(/\/+$/, '').split('/').pop() }
                        : null}
                      onGuardar={({ nombre, alcance }) => vistas.guardar({ nombre, alcance, orden: ordenTabla,
                        carpeta: alcance === 'carpeta'
                          ? { ruta: fe.currentPath, id: fe.currentNodeId ? String(fe.currentNodeId) : null,
                              nombre: fe.currentPath.replace(/\/+$/, '').split('/').pop() }
                          : null })} />
                  )}
                </div>
              )}

              {/* CABECERA DE LA VISTA: qué pregunta es, cuántos hay y cómo salir. */}
              {!fe.isTrashMode && enVista && (
                <div className="vista-cabecera" role="status">
                  {/* MIGAS «colección › vista», como en Procore. */}
                  <span className="vista-cabecera__nombre">
                    <span className="vista-cabecera__coleccion">{vistas.activa.tipo === 'propia' ? 'Mías' : (vistas.activa.coleccion || 'Vistas')} ›</span>{' '}
                    {vistas.activa.nombre}
                  </span>
                  <span className="vista-cabecera__dato">
                    {vistas.cargando ? 'Calculando…'
                      : `${vistas.info.total} documento${vistas.info.total === 1 ? '' : 's'} en toda la obra`
                        + (vistas.info.total > (vistas.filas || []).length ? ` · se muestran los ${(vistas.filas || []).length} primeros: afina con los filtros` : '')}
                  </span>
                  <button type="button" className="vista-cabecera__salir" onClick={vistas.salir}>✕ Salir de la vista</button>
                  {/* LOS CRITERIOS DE LA VISTA, A LA VISTA (Procore los enseña como fichas). Son
                      la definición de la vista: no se quitan; los filtros que se añadan encima
                      salen debajo, con su ✕, como siempre. */}
                  <span className="vista-cabecera__criterios" aria-label="Criterios de la vista">
                    {(vistas.activa.tipo === 'propia' ? criteriosDeFiltros(vistas.activa.vista.filtros) : (vistas.activa.criterios || []))
                      .map(([campo, valor]) => (
                        <span key={campo + valor} className="vista-criterio" title="Criterio de la vista">
                          {campo}: <b>{valor}</b>
                        </span>
                      ))}
                  </span>
                  {vistas.activa.ayuda && <span className="vista-cabecera__aviso">{vistas.activa.ayuda}</span>}
                  {vistas.activa.id === 'plazo_vencido' && vistas.info.vencidosSinDocumento > 0 && (
                    <span className="vista-cabecera__aviso">
                      Además, {vistas.info.vencidosSinDocumento} compromiso{vistas.info.vencidosSinDocumento === 1 ? '' : 's'} con
                      plazo vencido no tiene{vistas.info.vencidosSinDocumento === 1 ? '' : 'n'} documento cotejado: no consta
                      si se entregó.{' '}
                      <button type="button" onClick={() => { vistas.salir(); fe.setSidebarView('plan'); }}>Ver el plan de entregas</button>
                    </span>
                  )}
                </div>
              )}

              {/* BREADCRUMBS — ruta actual con navegación clickeable */}
              {!fe.isTrashMode && !enVista && (() => {
                const rel = fe.currentPath.startsWith(projectPrefix)
                  ? fe.currentPath.slice(projectPrefix.length).replace(/^\/+|\/+$/g, '')
                  : '';
                const segments = rel ? rel.split('/') : [];
                // SUBIR UN NIVEL. Es el mismo viaje que ya hacen las migas hacia
                // un ancestro -- `navigate(ruta, null)` --, sólo que sin tener que
                // apuntar a la miga correcta. En la raíz no hay padre, así que el
                // botón se apaga en vez de desaparecer: que esté y no se pueda usar
                // dice dónde estás; que no esté, no dice nada.
                //
                // NO es `onBack`: eso sigue significando salir de la obra.
                const enRaiz = segments.length === 0;
                const rutaDelPadre = segments.length > 1
                  ? projectPrefix + '/' + segments.slice(0, -1).join('/') + '/'
                  : projectPrefix + '/';
                return (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '8px 16px', fontSize: 13, background: '#faf9f5', borderBottom: '1px solid #f1f0e8', flexShrink: 0 }}>
                    <button
                      onClick={() => { if (!enRaiz) fe.navigate(rutaDelPadre, null); }}
                      disabled={enRaiz}
                      title={enRaiz ? 'Ya estás en la raíz del proyecto' : 'Subir a la carpeta anterior'}
                      aria-label="Subir a la carpeta anterior"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, marginRight: 4,
                               background: 'none', border: 'none', borderRadius: 4, padding: 0,
                               color: enRaiz ? 'var(--text-muted, #cccac0)' : 'var(--accent)',
                               cursor: enRaiz ? 'default' : 'pointer' }}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                      </svg>
                    </button>
                    <span
                      onClick={() => fe.navigate(projectPrefix + '/', null)}
                      style={{ cursor: segments.length ? 'pointer' : 'default', color: segments.length ? 'var(--accent)' : '#333330', fontWeight: segments.length ? 500 : 600 }}
                    >
                      Archivos de proyecto
                    </span>
                    {segments.map((seg, i) => {
                      const isLast = i === segments.length - 1;
                      const pathTo = projectPrefix + '/' + segments.slice(0, i + 1).join('/') + '/';
                      return (
                        <React.Fragment key={pathTo}>
                          <span style={{ color: '#cccac0' }}>/</span>
                          <span
                            onClick={() => { if (!isLast) fe.navigate(pathTo, null); }}
                            style={{ cursor: isLast ? 'default' : 'pointer', color: isLast ? '#333330' : 'var(--accent)', fontWeight: isLast ? 600 : 500 }}
                          >
                            {seg}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })()}

              <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              <div
                {...(!fe.isTrashMode ? superficieDeSoltar : {})}
                // CARGA SIN PARPADEO (UI polish, 13-oct-2026, medido contra ACC en
                // producción): al abrir una carpeta la tabla se VACIABA a los 138 ms
                // y salía un círculo hasta los 741 ms (lista → nada → lista). ACC
                // mantiene la lista anterior hasta tener la nueva. Ahora igual: la
                // anterior se queda, atenuada y sin poder pulsarse, con una barra
                // fina arriba. El círculo queda solo para cuando no hay nada que
                // mantener (la primera carga).
                className={[arrastreEncima ? 'dropzone-active' : '', fe.loading ? 'panel-cargando' : ''].join(' ').trim() || undefined}
                aria-busy={fe.loading || undefined}
                style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
                {fe.loading && <div className="barra-progreso" aria-hidden="true" />}
                {arrastreEncima && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                pointerEvents: 'none', background: 'rgba(241,240,232,0.82)', color: 'var(--accent)',
                                fontSize: 14, fontWeight: 600 }}>
                    Suelta para subir a esta carpeta
                  </div>
                )}
                {enVista && !fe.isTrashMode ? (
                    // UNA VISTA: la tabla de siempre con las filas de toda la obra.
                    // Solo lectura: sin casillas ni ⋮, porque esas acciones se
                    // deciden por carpeta y una vista mezcla carpetas. Abrir, consultar,
                    // ordenar y ver versiones funcionan igual.
                    (vistas.cargando && vistas.filas === null) ? (
                      <div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
                    ) : filasDeVista.length === 0 ? (
                      <EstadoVacio ilustracion={<IlustracionCasco />}
                        titulo={(vistas.filas || []).length === 0
                          ? 'Ningún documento que puedas ver cumple esta vista.'
                          : 'Ningún documento de la vista cumple los filtros puestos.'}
                        texto={(vistas.filas || []).length === 0 ? 'Cuando alguno la cumpla, aparecerá aquí.' : 'Quita algún filtro para ver más.'} />
                    ) : (
                      <MatrixTable folders={[]} files={filasDeVista} selected={new Set()} soloLectura orden={ordenTabla} onOrdenar={setOrdenTabla}
                        columnWidths={columnWidths} totalTableWidth={totalTableWidth} toggle={() => {}} navigate={navegarYSalir}
                        setActiveFile={abrirDocumento} onUpdateDescription={() => {}} onRename={() => {}}
                        formatSize={formatSize} formatDate={formatDate} getInitials={getInitials} user={user} isAdmin={false}
                        isTrashMode={false} onShowVersions={vh.onShowVersions} onRowMenu={() => {}}
                        editingNodeId={null} setEditingNodeId={() => {}} processingIds={{}}
                        rightClickedId={null} startResizing={startResizing} ajustarAncho={ajustarAncho} setSelected={() => {}}
                        renderFileIconSop={renderFileIconSop}
                        onConsultar={consultar} consultadoId={consultadoVivo ? consultadoVivo.id : null}
                        onStatusChange={() => {}} />
                    )
                ) : globalResults !== null && !fe.isTrashMode ? (
                  <div style={{ height: '100%', overflowY: 'auto', background: '#fff' }}>
                    <div style={{ padding: '10px 16px', fontSize: 12, color: '#72706b', borderBottom: '1px solid #f1f0e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{globalResults.length} resultado{globalResults.length !== 1 ? 's' : ''} en todo el proyecto para "{fe.searchQuery}"</span>
                      <button onClick={() => fe.setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✕ Limpiar</button>
                    </div>
                    {globalResults.length === 0 && (
                      <div style={{ padding: 48, textAlign: 'center', color: '#72706b', fontSize: 13 }}>Sin coincidencias en nombres de archivos o carpetas.</div>
                    )}
                    {globalResults.map(r => {
                      const isFolder = r.type === 'FOLDER';
                      const dir = r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : '';
                      return (
                        <div key={r.id}
                          onClick={() => {
                            fe.setSearchQuery('');
                            if (isFolder) {
                              fe.navigate(`${projectPrefix}/${r.path}/`, r.id);
                            } else {
                              if (dir) fe.navigate(`${projectPrefix}/${dir}/`, null);
                              fe.setActiveFile({ id: r.id, name: r.name, type: 'file', fullName: r.path, version: r.version });
                            }
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f1f0e8', cursor: 'pointer' }}
                          onMouseOver={e => e.currentTarget.style.background = '#f1f0e8'}
                          onMouseOut={e => e.currentTarget.style.background = 'none'}>
                          {isFolder
                            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="#f9eeda"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
                            : renderFileIconSop(r.name, 20)}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#333330', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: '#72706b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir || 'Archivos de proyecto'}</div>
                          </div>
                          {!isFolder && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>V{r.version || 1}</span>}
                          <span style={{ fontSize: 11, color: '#72706b', flexShrink: 0 }}>{r.updated_at ? formatDate(r.updated_at) : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : fe.loading && (fe.folders.length + fe.files.length) === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center' }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
                ) : fe.isTrashMode ? (
                    <DeletedTable items={fe.deletedItems} selectedIds={fe.selectedDeletedIds} onToggle={fe.setSelectedDeletedIds}
                      onRestore={(id) => restaurarElementos([id])}
                      getInitials={getInitials} restoringIds={fe.restoringIds} />
                ) : (fe.filteredFolders.length + fe.filteredFiles.length) === 0 ? (
                    // ESTADO VACÍO con su ilustración (14-oct-2026): antes la lista
                    // enseñaba la cabecera de la tabla y nada debajo. Soltar archivos
                    // aquí sigue funcionando (la superficie de soltar es el contenedor).
                    (fe.folders.length + fe.files.length) === 0
                      ? <EstadoVacio ilustracion={<IlustracionPlano />} titulo="Esta carpeta está vacía"
                          texto="Arrastra aquí los archivos o pulsa «Cargar archivos»." />
                      : <EstadoVacio ilustracion={<IlustracionCasco />} titulo="Nada de esta carpeta cumple los filtros"
                          texto="Quita algún filtro para ver más." />
                ) : vistaCarpeta === 'cuadricula' ? (
                    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#72706b', fontSize: 13 }}>Cargando…</div>}>
                      <MatrixGrid folders={fe.filteredFolders} files={fe.filteredFiles}
                        selected={fe.selected} toggle={fe.toggle} setSelected={fe.setSelected} navigate={fe.navigate}
                        setActiveFile={abrirDocumento} isAdmin={isAdmin}
                        projectPrefix={projectPrefix}
                        onRowMenu={(item, e) => { fe.setRightClickedId(item.id); fe.setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'table' }); }} />
                    </Suspense>
                ) : (
                    <MatrixTable folders={fe.filteredFolders} files={fe.filteredFiles} selected={fe.selected} orden={ordenTabla} onOrdenar={setOrdenTabla}
                      columnWidths={columnWidths} totalTableWidth={totalTableWidth} toggle={fe.toggle} navigate={fe.navigate}
                      setActiveFile={abrirDocumento}
                      onUpdateDescription={async (item, newDesc) => { if (item.type === 'folder') fe.setFolders(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f)); else fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, description: newDesc } : f)); try { const res = await apiFetch(`${API}/api/docs/description`, { method: 'POST', body: JSON.stringify({ node_id: item.id, description: newDesc, model_urn: projectPrefix }) }); if (res.ok) fe.triggerRefresh(fe.currentPath); else { toast.error('No se pudo guardar la descripción.'); fe.triggerRefresh(fe.currentPath); } } catch (e) { toast.error('Error de conexión al guardar la descripción.'); fe.triggerRefresh(fe.currentPath); } }}
                      onRename={async (item, newName) => {
                        // COHERENCIA TABLA ↔ ÁRBOL: al renombrar una carpeta desde la
                        // tabla hay que actualizar TAMBIÉN el caché del árbol (mismo
                        // camino optimista que usa FolderNode), si no el panel
                        // izquierdo seguía mostrando el nombre viejo hasta refrescar.
                        const isFolder = item.type === 'folder';
                        const oldName = item.name;
                        fe.setProcessingIds(prev => ({ ...prev, [item.id]: true }));
                        if (isFolder) fe.setFolders(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                        else fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, name: newName } : f));
                        if (isFolder && fe.cacheMethods) fe.cacheMethods.optimisticRename(fe.currentNodeId, item.id, newName);
                        try {
                          const res = await apiFetch(`${API}/api/docs/rename`, { method: 'POST', body: JSON.stringify({ node_id: item.id, new_name: newName, model_urn: projectPrefix }) });
                          if (res.ok) {
                            if (isFolder && fe.cacheMethods) fe.cacheMethods.commitRename(fe.currentNodeId, item.id);
                            fe.setRefreshSignal(s => s + 1);
                          } else {
                            if (isFolder && fe.cacheMethods) fe.cacheMethods.rollbackRename(fe.currentNodeId, item.id, oldName);
                            toast.error('No se pudo renombrar (nombre inválido o duplicado).');
                            fe.triggerRefresh(fe.currentPath);
                          }
                        } catch (e) {
                          if (isFolder && fe.cacheMethods) fe.cacheMethods.rollbackRename(fe.currentNodeId, item.id, oldName);
                          toast.error('No se pudo renombrar: error de conexión.');
                          fe.triggerRefresh(fe.currentPath);
                        } finally {
                          fe.setProcessingIds(prev => { const n = {...prev}; delete n[item.id]; return n; });
                        }
                      }}
                      formatSize={formatSize} formatDate={formatDate} getInitials={getInitials} user={user} isAdmin={isAdmin}
                      isTrashMode={fe.isTrashMode} onShowVersions={vh.onShowVersions}
                      onRowMenu={(item, e) => { fe.setRightClickedId(item.id); fe.setActiveRowMenu({ item, x: e.clientX, y: e.clientY, source: 'table' }); }}
                      editingNodeId={fe.editingNodeId} setEditingNodeId={fe.setEditingNodeId} processingIds={fe.processingIds}
                      rightClickedId={fe.rightClickedId} startResizing={startResizing} ajustarAncho={ajustarAncho} setSelected={fe.setSelected}
                      renderFileIconSop={renderFileIconSop}
                      onConsultar={consultar} consultadoId={consultadoVivo ? consultadoVivo.id : null}
                      onStatusChange={async (item, newStatus) => {
                        // Publicar exige decir PARA QUÉ queda autorizado el
                        // documento: "Publicado" a secas no distingue apto para
                        // construir de solo informativo, y con esa diferencia se
                        // construye o no se construye.
                        let codigo_idoneidad;
                        if (newStatus === 'PUBLISHED') {
                          codigo_idoneidad = await pedirIdoneidad(API, projectPrefix, newStatus);
                          if (!codigo_idoneidad) return;   // se echó atrás
                        }
                        fe.setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: newStatus } : f));
                        try {
                          const res = await apiFetch(`${API}/api/docs/batch`, { method: 'POST', body: JSON.stringify({ items: [item.id], action: 'SET_STATUS', status: newStatus, model_urn: projectPrefix, codigo_idoneidad }) });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok || !data.success) {
                            toast.error(data.error || 'Error al cambiar estado');
                          } else {
                            const sello = (data.emisiones || {})[item.id];
                            if (sello?.revision) toast.success(`Emitido como ${sello.revision}${sello.idoneidad ? ' · ' + sello.idoneidad : ''}`);
                          }
                          fe.triggerRefresh(fe.currentPath);
                        } catch (e) { fe.triggerRefresh(fe.currentPath); }
                      }}
                    />
                )}
              </div>
              {consultadoVivo && !fe.isTrashMode && globalResults === null && (enVista || vistaCarpeta !== 'cuadricula') && (
                <PanelConsulta item={consultadoVivo} onCerrar={() => setConsultado(null)}
                  onAbrir={abrirDocumento} onVersiones={vh.onShowVersions} onFicha={setFicha} />
              )}
              </div>
              <footer style={{ padding: '8px 16px', fontSize: 13, color: '#72706b', borderTop: '1px solid #f1f0e8', background: 'var(--bg-primary)', flexShrink: 0 }}>
                {enVista
                  ? `Mostrando ${filasDeVista.length}${filasDeVista.length !== (vistas.filas || []).length ? ` de ${(vistas.filas || []).length}` : ''} ${(vistas.filas || []).length === 1 ? 'documento' : 'documentos'} de la vista`
                  : fe.selected.size > 0
                  ? `${fe.selected.size} de ${fe.folders.length + fe.files.length} ${fe.selected.size === 1 ? 'seleccionado' : 'seleccionados'}`
                  : `Mostrando ${fe.filteredFolders.length + fe.filteredFiles.length}${fe.statusFilter !== 'ALL' || fe.searchQuery || fe.hayFiltroMeta ? ` de ${fe.folders.length + fe.files.length}` : ''} ${fe.folders.length + fe.files.length === 1 ? 'elemento' : 'elementos'}`}
              </footer>
            </section>
          </div>
          </div>
        </>)}
        </Suspense>
        </div>
      </main>

      {/* ═══════════════════════════════════════ */}
      {/* MODALS & OVERLAYS (Fase 2 Components)  */}
      {/* ═══════════════════════════════════════ */}
      {/* fallback null: los overlays aparecen al terminar de cargar, sin
          parpadear un spinner a pantalla completa sobre el explorador. */}
      <Suspense fallback={null}>

      <VersionPanel isOpen={vh.tableShowVersions} versionTarget={vh.versionTarget} versionHistory={vh.versionHistory}
        loadingVersions={vh.loadingVersions} versionPanelWidth={versionPanelWidth} startVersionResize={startVersionResize}
        selectedVersions={vh.selectedVersions} setSelectedVersions={vh.setSelectedVersions}
        versionRowMenu={vh.versionRowMenu} setVersionRowMenu={vh.setVersionRowMenu}
        projectPrefix={projectPrefix} isAdmin={isAdmin} onClose={() => vh.setTableShowVersions(false)} onPromote={vh.handlePromote} />

      <ContextMenu activeRowMenu={fe.activeRowMenu} menuRef={fe.menuRef} isAdmin={isAdmin} esEntityAdmin={puedeVincularAcc} projectPrefix={projectPrefix}
        capacidades={capsMenu} objetivo={objetivoMenu}
        user={user} onRefresh={() => fe.triggerRefresh(fe.currentPath)}
        onClose={() => { fe.setActiveRowMenu(null); fe.setRightClickedId(null); }}
        onCreateChild={(id) => fe.setCreatingChildParentId(id)}
        onOpenPermissions={(item) => fe.setPermissionsFolder(item)}
        onOpenAccBridge={(item) => setAccBridgeFolder(item)}
        onRename={(data) => fe.setEditingNodeId(data)}
        onShare={(item) => { fe.setShareTarget(item); fe.setShowShareModal(true); }}
        onMove={() => fe.setMoveState({ step: 1, items: objetivoMenu.map(i => i.name), itemIds: objetivoMenu.map(i => i.id), destPath: '', destId: null })}
        onDelete={(fullName, id) => {
          if (objetivoMenu.length > 1) fe.setDeleteTask({ ids: objetivoMenu.map(i => i.id), count: objetivoMenu.length });
          else fe.setDeleteTask({ ids: [], count: 1, single: { fullName, id } });
          fe.setShowDeleteModal(true);
        }}
        onAttributes={(item) => setAttributesItem(item)}
        onNuevaVersion={pedirNuevaVersion}
        onCopiarEnlace={fe.copiarEnlace}
        onAnadirAGrupo={grupos.disponible && !fe.isTrashMode ? (docs) => setParaAgrupar(docs) : undefined} />
      {paraAgrupar && paraAgrupar.length > 0 && (
        <ElegirGrupo documentos={paraAgrupar} grupos={grupos.grupos} puedeCrearDeLaObra={grupos.puedeCrearDeLaObra}
          onCrear={grupos.crear} onCerrar={() => setParaAgrupar(null)}
          onAnadir={async (g) => {
            let ya = 0;
            for (const d of paraAgrupar) {
              const r = await grupos.anadir(g.id, d.id);
              if (!r.ok) return r;
              if (r.ya_estaba) ya += 1;
            }
            toast.success(ya === paraAgrupar.length ? `Ya estaba en «${g.nombre}»` : `Añadido a «${g.nombre}» (sigue en su carpeta)`);
            return { ok: true };
          }} />
      )}
      <input ref={selectorDeVersion} type="file" hidden
        onChange={(e) => {
          const fichero = e.target.files && e.target.files[0];
          e.target.value = '';
          if (fichero && versionPara.current) fe.subirNuevaVersion(versionPara.current, fichero);
          versionPara.current = null;
        }} />

      {attributesItem && (
        <AttributesPanel item={attributesItem} projectPrefix={projectPrefix} isAdmin={isAdmin}
          onClose={() => setAttributesItem(null)} />
      )}

      <NewFolderModal isOpen={fe.showNewFolder} folderName={fe.folderName} onFolderNameChange={fe.setFolderName} onCreate={fe.createFolder} onClose={() => fe.setShowNewFolder(false)} creando={fe.creandoCarpeta} />

      {fe.permissionsFolder && (<FolderPermissionsPanel folder={fe.permissionsFolder} modelUrn={projectPrefix} apiBaseUrl={API} onClose={() => fe.setPermissionsFolder(null)} />)}

      {accBridgeFolder && puedeVincularAcc && (
        <AccFolderBridge API={API} folder={accBridgeFolder} modelUrn={projectPrefix}
          onSaved={(bridge, serviceEnabled) => setAccBridgeInfo({ folderId: accBridgeFolder.id, bridge, serviceEnabled })}
          onClose={() => setAccBridgeFolder(null)} />
      )}

      {fe.activeFile && fe.activeFile.type !== 'folder' && (
        <DocumentViewer file={fe.activeFile} projectPrefix={projectPrefix} versionHistory={vh.versionHistory}
          viewedVersionInfo={fe.viewedVersionInfo} setViewedVersionInfo={fe.verVersion}
          showVersions={fe.showVersions} setShowVersions={fe.setShowVersions} isAdmin={isAdmin} esEntityAdmin={esEntityAdmin}
          onPromote={vh.handlePromote} API={API}
          // ‹ › y la tira siguen a lo que se mira: la vista abierta o la carpeta.
          hermanos={grupoActivo && juegoDelGrupo?.grupo === grupoActivo.id
            ? hermanosDelLector({ archivos: juegoDelGrupo.archivos })
            : hermanosDelLector({ enVista, filasDeVista, archivos: fe.files })}
          // LDA: el pie dice qué juego recorren ‹ › y el cajetín copia el enlace (con versión si no es la vigente).
          nombreDelJuego={grupoActivo && juegoDelGrupo?.grupo === grupoActivo.id ? grupoActivo.nombre : enVista ? (vistas.activa?.nombre || 'Vista') : ((fe.currentPath || '').replace(/\/$/, '').split('/').pop() || 'Carpeta')}
          onCopiarEnlace={(f, versionId) => fe.copiarEnlace({ ...f, _versionEnlace: versionId })}
          onAbrirHermano={(doc) => { fe.setViewedVersionInfo(null); fe.setShowVersions(false); fe.setActiveFile(doc); fe.anotarDocumento(doc, { reemplazar: true }); }}
          onClose={fe.cerrarDocumento} />
      )}

      <DeleteModal isOpen={fe.showDeleteModal} deleteTask={fe.deleteTask} onConfirm={fe.confirmBatchDelete} onClose={() => fe.setShowDeleteModal(false)} />

      <MoveModal moveState={fe.moveState} setMoveState={fe.setMoveState} projectPrefix={projectPrefix} projectRootId={fe.projectRootId} onExecuteMove={fe.handleExecuteMove} />

      {fe.pendingBanner && fe.pendingBanner.count > 0 && (
        <div 
          onClick={() => { fe.setShowUploadModal(true); fe.setSopMinimized(false); fe.setPendingBanner(null); }}
          style={{ position: 'fixed', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 10001, background: '#f9eeda', border: '1px solid #f9eeda', borderRadius: 8, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: 500, cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseOver={e => e.currentTarget.style.transform = 'translateX(-50%) scale(1.02)'}
          onMouseOut={e => e.currentTarget.style.transform = 'translateX(-50%) scale(1)'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#f9eeda"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <span style={{ fontSize: 13, color: '#333330' }}>Tienes <strong>{fe.pendingBanner.count}</strong> {fe.pendingBanner.count === 1 ? 'subida pendiente' : 'subidas pendientes'} de una sesión anterior. <u>Haz clic para reanudar o cancelar.</u></span>
          <button onClick={(e) => { e.stopPropagation(); fe.setPendingBanner(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#72706b', padding: '0 8px', marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      <UploadModal isOpen={fe.showUploadModal} sopMinimized={fe.sopMinimized} setSopMinimized={fe.setSopMinimized}
        currentPath={fe.currentPath} chunkedUpload={fe.chunkedUpload} fileRef={fe.fileRef}
        dragOver={fe.dragOver} onDragOver={fe.onDragOver} onDragLeave={fe.onDragLeave} onDrop={fe.onDrop}
        onUpload={fe.handleSopUpload} onListo={fe.handleSopListo} onOpenUploaded={fe.openUploadedFile}
        onClose={() => fe.setShowUploadModal(false)} />

      <ShareModal isOpen={fe.showShareModal} shareTarget={fe.shareTarget} user={user} projectPrefix={projectPrefix}
        searchShareUser={fe.searchShareUser} setSearchShareUser={fe.setSearchShareUser}
        showShareResults={fe.showShareResults} setShowShareResults={fe.setShowShareResults}
        sharedUsers={fe.sharedUsers} setSharedUsers={fe.setSharedUsers} allProjectUsers={fe.allProjectUsers}
        shareGeneralAccess={fe.shareGeneralAccess} setShareGeneralAccess={fe.setShareGeneralAccess}
        shareGeneralRole={fe.shareGeneralRole} setShareGeneralRole={fe.setShareGeneralRole}
        shareLinkCopied={fe.shareLinkCopied} setShareLinkCopied={fe.setShareLinkCopied}
        onIrAlTriaje={() => fe.setSidebarView('triaje')}
        onClose={() => fe.setShowShareModal(false)} />

      {/* Render CONDICIONAL: así el chunk del modal se descarga recién al abrirlo. */}
      {reviewModalItems !== null && (
        <ReviewModal isOpen items={reviewModalItems}
          projectPrefix={projectPrefix} user={user}
          onClose={() => setReviewModalItems(null)}
          onCreated={() => { fe.setSelected(new Set()); fe.setSidebarView('reviews'); }} />
      )}

      {transmittalItems !== null && (
        <TransmittalModal isOpen items={transmittalItems}
          projectPrefix={projectPrefix} user={user}
          onClose={() => setTransmittalItems(null)}
          onCreated={() => { fe.setSelected(new Set()); fe.setSidebarView('transmittals'); }} />
      )}

      {setModalItems !== null && (
        <AddToSetModal isOpen items={setModalItems}
          projectPrefix={projectPrefix}
          onClose={() => setSetModalItems(null)}
          onAdded={() => fe.setSelected(new Set())} />
      )}

      {/* GATEWAY 3D OVERLAY (FRENTES) */}
      {showGateway && DOCS_VISOR_SHORTCUT && (
        <GatewayPanel
          project={project}
          onClose={() => setShowGateway(false)}
        />
      )}

      </Suspense>
    </div>
  );
}

// ── Vista de Actividad del proyecto (feed estilo ACC) ──
const ACTIVITY_LABELS = {
  upload: { label: 'Subió', color: '#788c5d' },
  create_folder: { label: 'Creó carpeta', color: 'var(--accent)' },
  rename: { label: 'Renombró', color: '#f9eeda' },
  move: { label: 'Movió', color: 'var(--accent)' },
  delete: { label: 'Suprimió', color: '#b93535' },
  restore: { label: 'Restauró', color: 'var(--accent)' },
  permanent_delete: { label: 'Eliminó permanentemente', color: '#b93535' },
  set_status: { label: 'Cambió estado', color: '#507294' },
  promote_version: { label: 'Promovió versión', color: 'var(--accent)' },
  share: { label: 'Compartió', color: 'var(--accent)' },
  delete_orphan_photo: { label: 'Purgó foto huérfana', color: '#72706b' },
};

function ActivityView({ projectPrefix }) {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    apiFetch(`${API}/api/activity?model_urn=${encodeURIComponent(projectPrefix)}&limit=150`)
      .then(r => r.json())
      .then(d => setItems(d.success ? d.data : []))
      .catch(() => { setItems([]); toast.error('No se pudo cargar la actividad del proyecto.'); });
  }, [projectPrefix]);

  return (
    <div style={{ padding: 32, flex: 1, overflowY: 'auto' }}>
      <div style={{ fontSize: 24, fontWeight: 400, marginBottom: 4 }}>Actividad</div>
      <div style={{ fontSize: 13, color: '#72706b', marginBottom: 20 }}>Registro de auditoría del proyecto — quién hizo qué y cuándo.</div>
      {items === null ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="adsk-spinner" style={{ margin: '0 auto' }} /></div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#72706b', fontSize: 13 }}>Aún no hay actividad registrada.</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #f1f0e8', borderRadius: 8, overflow: 'hidden' }}>
          {items.map((a, i) => {
            const cfg = ACTIVITY_LABELS[a.action] || { label: a.action, color: '#72706b' };
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f1f0e8' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#f1f0e8', color: '#52524d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {getInitials(a.performed_by)}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#333330' }}>{a.performed_by}</span>{' '}
                  <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label.toLowerCase()}</span>{' '}
                  <span style={{ color: '#52524d', overflowWrap: 'anywhere' }}>{a.entity_name || ''}</span>
                  {a.details?.dest_parent_id && <span style={{ color: '#72706b' }}> (a otra carpeta)</span>}
                </div>
                <span style={{ fontSize: 11, color: '#72706b', flexShrink: 0 }}>{formatDate(a.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
