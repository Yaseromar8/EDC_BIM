/**
 * useVistasDeArchivos — el estado de las VISTAS de Archivos (A2-2, 14-oct-2026).
 *
 * Una vista activa sustituye las filas de la carpeta por las de la vista (toda
 * la obra). Todo lo demás sigue igual: la tabla, el orden, el panel de consulta,
 * el buscador, el desplegable de estado y las fichas, que filtran DENTRO de la
 * vista. Sin vista activa, Archivos es exactamente el de antes.
 *
 * Las decisiones puras viven en utils/vistasDeArchivos.js; aquí solo el estado
 * y las peticiones (a `GET /api/docs/search?vista=…`, sin rutas nuevas).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import {
  FILTROS_VACIOS, describirFiltros, guardarVistaPropia, borrarVistaPropia,
  leerVistasPropias, parametrosDeVista,
} from '../utils/vistasDeArchivos';

export function useVistasDeArchivos({ fe, projectPrefix, user, enArchivos, conCifras = enArchivos }) {
  const usuario = user?.id ?? user?.email ?? null;
  const [activa, setActiva] = useState(null);       // { tipo: 'serie'|'propia', id, nombre, … }
  const [filas, setFilas] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [info, setInfo] = useState({ total: 0, limite: 0, vencidosSinDocumento: 0 });
  const [recuentos, setRecuentos] = useState(null);
  const [hayPlan, setHayPlan] = useState(false);
  const [propias, setPropias] = useState(() => leerVistasPropias(null, projectPrefix, usuario));
  const pedido = useRef(0);
  const activaRef = useRef(null);
  useEffect(() => { activaRef.current = activa; }, [activa]);

  useEffect(() => { setPropias(leerVistasPropias(null, projectPrefix, usuario)); }, [projectPrefix, usuario]);

  // LAS CIFRAS DEL PANEL: una sola petición, y otra cuando algo cambia en Archivos
  // (subir, cambiar de estado…), con un respiro para no repetirla en ráfaga.
  useEffect(() => {
    if (!conCifras || !projectPrefix) return undefined;
    let vivo = true;
    const reloj = setTimeout(() => {
      apiFetch(`${API}/api/docs/search?vista=recuentos&model_urn=${encodeURIComponent(projectPrefix)}`)
        .then(r => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo || !d?.success) return;
          setRecuentos(d.recuentos || null);
          setHayPlan(Boolean(d.hay_plan));
        })
        .catch(() => { /* sin cifras, el panel funciona igual */ });
    }, 400);
    return () => { vivo = false; clearTimeout(reloj); };
  }, [conCifras, projectPrefix, fe.refreshSignal]);

  const cargar = useCallback(async (v) => {
    const n = ++pedido.current;
    setCargando(true);
    const consulta = v.tipo === 'serie' ? `vista=${encodeURIComponent(v.id)}` : parametrosDeVista(v.vista.filtros);
    try {
      const r = await apiFetch(`${API}/api/docs/search?${consulta}&model_urn=${encodeURIComponent(projectPrefix)}`);
      const d = await r.json().catch(() => ({}));
      if (n !== pedido.current) return;
      if (!r.ok || !d.success) {
        toast.error(d.error || 'No se pudo abrir la vista.');
        setFilas([]);
        return;
      }
      setFilas((d.data || []).map(f => ({ ...f, type: 'file' })));
      setInfo({ total: d.total || 0, limite: d.limite || 0, vencidosSinDocumento: d.vencidos_sin_documento || 0 });
    } catch {
      if (n === pedido.current) { toast.error('No se pudo abrir la vista: error de conexión.'); setFilas([]); }
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [projectPrefix]);

  const limpiarFiltros = () => {
    fe.setSearchQuery('');
    fe.setStatusFilter('ALL');
    fe.setFiltrosMeta({ ...FILTROS_VACIOS });
    fe.setSelected(new Set());
  };

  const salir = useCallback(() => {
    pedido.current += 1;
    setActiva(null);
    setFilas(null);
    setCargando(false);
  }, []);

  const elegir = (v) => {
    limpiarFiltros();
    if (v.tipo === 'propia' && v.vista.alcance === 'carpeta') {
      // Una vista de carpeta es ir a esa carpeta con sus filtros puestos.
      salir();
      const f = v.vista.filtros;
      fe.navigate(v.vista.carpeta.ruta, v.vista.carpeta.id);
      fe.setSearchQuery(f.texto || '');      // después de navegar, que la vacía
      fe.setStatusFilter(f.estado || 'ALL');
      fe.setFiltrosMeta({ tipo: f.tipo, disciplina: f.disciplina, entrega: f.entrega });
      return;
    }
    if (fe.isTrashMode) fe.switchMode(false);
    setActiva(v);
    setFilas(null);
    cargar(v);
  };

  // Volver a pedir la vista abierta tras un cambio (p. ej. publicar desde la fila).
  const recargar = useCallback(() => { if (activaRef.current) cargar(activaRef.current); }, [cargar]);

  // Papelera u otra sección: se sale de la vista.
  useEffect(() => {
    if (activaRef.current && (fe.isTrashMode || !enArchivos)) salir();
  }, [fe.isTrashMode, enArchivos, salir]);

  const guardar = ({ nombre, alcance, carpeta, orden }) => {
    const filtros = {
      texto: fe.searchQuery,
      estado: fe.statusFilter, ...fe.filtrosMeta,
    };
    const r = guardarVistaPropia(null, projectPrefix, usuario, { nombre, alcance, carpeta, filtros, orden });
    if (!r.ok) { toast.error(r.motivo); return false; }
    setPropias(r.lista);
    toast.success(`Vista «${r.vista.nombre}» guardada: ${describirFiltros(r.vista.filtros)}`);
    return true;
  };

  const borrar = (v) => {
    setPropias(borrarVistaPropia(null, projectPrefix, usuario, v.id));
    if (activaRef.current?.tipo === 'propia' && activaRef.current.id === v.id) salir();
    toast.success(`Vista «${v.nombre}» borrada`);
  };

  return {
    activa, filas, cargando, info, recuentos, hayPlan, propias,
    elegir, salir, recargar, guardar, borrar, puedeGuardar: Boolean(usuario),
  };
}
