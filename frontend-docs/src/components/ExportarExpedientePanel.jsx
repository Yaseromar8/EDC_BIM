// ExportarExpedientePanel — el expediente se puede llevar. Entero.
//
// POR QUÉ ESTE COMPONENTE
// La pregunta la hace toda supervisión y toda área legal: «¿cómo saco mi
// expediente si me voy de tu plataforma?». El backend tenía la mitad de la
// respuesta escrita desde hace tiempo — /api/docs/indice-expediente, cuyo
// propio docstring dice ser justamente eso — y NINGUNA pantalla lo llamaba.
// La otra mitad, bajar los documentos, ya existía como descarga de carpeta.
// Este panel junta las dos mitades donde se esperan: en Configuración.
//
// QUÉ ENTREGA
// 1. EL ÍNDICE (hoja de cálculo): la relación de todo lo entregado, con estado,
//    idoneidad, revisión y huella. Sin fórmulas ni macros: se abre en cualquier
//    sitio y sin esta plataforma.
// 2. LOS DOCUMENTOS (zip): los bytes de la obra, con la estructura de carpetas.
//    Reutiliza el túnel de descarga que ya usa la tabla de archivos — URLs
//    firmadas y el zip se arma en el navegador, sin cargar al servidor.
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { downloadFolderAsZip } from '../utils/downloadUtils';

export function ExportarExpedientePanel({ project, projectPrefix }) {
  const [bajandoIndice, setBajandoIndice] = useState(false);
  const [bajandoDocs, setBajandoDocs] = useState(false);

  const _raizDeLaObra = async () => {
    // /api/docs/list con ruta vacia contesta con current_node_id = la RAIZ.
    // Se pide aqui en vez de recibirla como prop porque el explorador navega
    // por rutas y no guarda ese id -- y pedirla es una llamada que ya existe.
    const r = await apiFetch(
      `${API}/api/docs/list?path=&model_urn=${encodeURIComponent(projectPrefix)}`);
    const d = await r.json();
    return d?.data?.current_node_id || null;
  };

  const bajarIndice = async () => {
    setBajandoIndice(true);
    try {
      const r = await apiFetch(
        `${API}/api/docs/indice-expediente?model_urn=${encodeURIComponent(projectPrefix)}&formato=xlsx`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'No se pudo generar el índice.');
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `indice-expediente-${(project?.name || 'obra').replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo generar el índice.');
    } finally {
      setBajandoIndice(false);
    }
  };

  const bajarDocumentos = async () => {
    setBajandoDocs(true);
    try {
      const raiz = await _raizDeLaObra();
      if (!raiz) {
        toast.error('No se encontró la carpeta raíz de la obra.');
        return;
      }
      // El mismo mecanismo que "descargar carpeta" de la tabla, sobre la raíz:
      // URLs firmadas y zip en el navegador. En una obra grande tarda — se
      // avisa en pantalla en vez de dejar el botón mudo.
      await downloadFolderAsZip(raiz, projectPrefix, API,
        `Expediente_${(project?.name || 'obra').replace(/\s+/g, '_')}`);
    } catch {
      toast.error('No se pudo descargar el expediente.');
    } finally {
      setBajandoDocs(false);
    }
  };

  const boton = (activo, texto, textoActivo, onClick, primario) => (
    <button onClick={onClick} disabled={activo}
            style={{
              background: primario ? 'var(--accent, #1a73e8)' : '#fff',
              color: primario ? '#fff' : 'var(--accent, #1a73e8)',
              border: primario ? 'none' : '1px solid var(--accent, #1a73e8)',
              borderRadius: 7, padding: '9px 18px', fontSize: 12.5, fontWeight: 600,
              cursor: activo ? 'default' : 'pointer', opacity: activo ? 0.6 : 1,
            }}>
      {activo ? textoActivo : texto}
    </button>
  );

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
                  padding: 24, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 6 }}>
        Exportar el expediente
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#666', lineHeight: 1.6, maxWidth: 640 }}>
        El expediente es de la obra, no de esta plataforma. Desde aquí se lo
        lleva entero: el <strong>índice</strong> (la relación de lo entregado, con
        estado, idoneidad, revisión y huella de cada documento — se abre en
        cualquier hoja de cálculo, sin fórmulas ni macros) y los{' '}
        <strong>documentos</strong> (un zip con la estructura de carpetas tal cual).
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {boton(bajandoIndice, 'Descargar el índice (xlsx)', 'Generando índice…', bajarIndice, false)}
        {boton(bajandoDocs, 'Descargar los documentos (zip)', 'Preparando el zip… puede tardar', bajarDocumentos, true)}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#999', maxWidth: 640, lineHeight: 1.6 }}>
        En una obra con miles de documentos el zip tarda varios minutos: se arma
        en tu navegador a partir de descargas firmadas, sin pasar por el servidor.
        No cierres la pestaña mientras se prepara.
      </p>
    </div>
  );
}
