/**
 * BANCO DEL SUSTENTO EN CAD (no entra en producción).
 *
 * El visor de Autodesk de verdad (LMV 7) abre en local un plano PDF, como abre las presentaciones de un DWG
 * que AutoCAD dibuja en PDF ('2dviews': 'pdf'). Encima, la capa y el panel del sustento de producción
 * (CapaDeSustentoEnCad, PanelDeSustento). Los vínculos viven en memoria; `window.__banco` deja leerlos.
 *
 * ?plano=plano-A.pdf  · el PDF de public/_probar a abrir.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CapaDeSustentoEnCad, PanelDeSustento } from './components/SustentoDelPlano';
import { numeroDe } from './utils/sustento';
import { AvisosHost } from './utils/avisos';
import { ConfirmHost } from './utils/confirm';

const PLANO = new URLSearchParams(window.location.search).get('plano') || 'plano-A.pdf';
const VISTA = { guid: 'banco-presentacion-1', nombre: 'P08-0004' };

// El banco no exporta nada: es una página suelta, no un módulo con recarga en caliente.
// eslint-disable-next-line react-refresh/only-export-components
function Banco() {
  const contenedor = useRef(null);
  const [viewer, setViewer] = useState(null);
  const [estado, setEstado] = useState(() => (window.Autodesk?.Viewing ? 'Cargando el visor de Autodesk…' : 'No cargó el script del visor de Autodesk.'));
  const [, setTic] = useState(0);
  const [vinculos, setVinculos] = useState([]);
  const [abierto, setAbierto] = useState(true);
  const [dibujando, setDibujando] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [elegido, setElegido] = useState(null);

  useEffect(() => {
    const Av = window.Autodesk?.Viewing;
    if (!Av) return undefined;
    let visor = null;
    Av.Initializer({ env: 'Local' }, async () => {
      visor = new Av.GuiViewer3D(contenedor.current);
      visor.start();
      try {
        await visor.loadExtension('Autodesk.PDF');
        await visor.loadModel(`/_probar/${PLANO}`, { page: 1 });
        window.__banco = { viewer: visor };
        setViewer(visor);
        setEstado('');
        setTic(t => t + 1);
      } catch (e) {
        setEstado(`No se pudo abrir el plano en el visor: ${e?.message || e}`);
      }
    });
    return () => { try { visor?.finish(); } catch { /* ya cerrado */ } };
  }, []);

  useEffect(() => { window.__banco = { ...(window.__banco || {}), vinculos }; }, [vinculos]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#f1f0e8' }}>
      <div ref={contenedor} style={{ position: 'absolute', inset: 0 }} />
      {estado && <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 50, padding: '6px 10px', background: '#faf9f5', border: '1px solid #cfcabb' }}>{estado}</div>}
      {viewer && (
        <CapaDeSustentoEnCad viewer={viewer} vista={VISTA.guid} vinculos={vinculos} dibujando={dibujando}
          discreta={!abierto && !dibujando} borrador={borrador?.zona || null} elegido={elegido}
          onZona={(zona) => { setBorrador({ zona }); setDibujando(false); setAbierto(true); }}
          onElegir={(id) => { setElegido(id); setAbierto(true); }} />
      )}
      <button type="button" onClick={() => setAbierto(a => !a)}
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 40, height: 30, padding: '0 10px', border: '1px solid #cfcabb', background: abierto ? '#141413' : '#fff', color: abierto ? '#fff' : '#141413' }}>
        Metrados ({vinculos.length})
      </button>
      <PanelDeSustento vinculos={vinculos} abierto={abierto}
        onCerrar={() => { setAbierto(false); setDibujando(false); setBorrador(null); }}
        desdePlanilla={{ item: '04.01.01', cantidad: '1.31', unidad: 'km', planilla: 'iso261007' }}
        onVolverAPlanilla={() => {}} onAbrirPlanilla={() => {}}
        dibujando={dibujando} onDibujar={() => setDibujando(d => !d)}
        borrador={borrador} onDescartar={() => setBorrador(null)}
        elegido={elegido} onElegir={setElegido}
        onRetirar={(v) => setVinculos(vs => vs.filter(x => x.id !== v.id))}
        onGuardar={async (form) => {
          const n = { id: `cad${Date.now()}`, item: form.item.trim(), cantidad: numeroDe(form.cantidad), unidad: form.unidad.trim(),
            file_node_id: 'dwg1', plano: '500125-CSSP001-780-XX-DR-HD-011220.dwg', version_number: 1, version_vigente: 1,
            version_id: 'v1', pagina: 1, zona: borrador.zona, vista: VISTA.guid, vista_nombre: VISTA.nombre,
            nota: form.nota || null, autor: 'Banco', mio: true, planilla_node_id: 'iso261007' };
          setVinculos(vs => [...vs, n]);
          setBorrador(null);
          return { ok: true };
        }} />
      <AvisosHost />
      <ConfirmHost />
    </div>
  );
}

const nodo = document.getElementById('raiz');
if (!nodo.__raiz) nodo.__raiz = createRoot(nodo);
nodo.__raiz.render(<Banco />);
