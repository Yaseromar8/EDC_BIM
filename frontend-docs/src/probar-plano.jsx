// Banco de la OBSERVACIÓN DEL PLANO y de los estados de ACC (docs/archivos/18): el lector REAL con un plano de muestra y
// las rutas REALES del servidor (routes/pdf_tools.py, routes/issues.py) contra un PostgreSQL desechable. La identidad la
// pone el servidor del banco con la cabecera X-Quien: ?quien=1 Ana (levanta y verifica), 2 Luis (corrige), 3 Eva
// (administra la obra), 4 Mario (de la contratista, como Luis). Sin contraseñas ni sesión real. ?vista=incidencias abre «Issues y punch».
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import PDFViewer from './components/PDFViewer';
import PunchModule from './components/PunchModule';
import { instalarTooltips } from '../../design/ui/tooltips.js';
import './index.css';

const OBRA = 'zz_obra_issues';
const PLANO = '11111111-1111-4111-8111-111111111111';
const V1 = '22222222-2222-4222-8222-222222222222';
const PERSONAS = {
  1: { nombre: 'Ana', papel: 'levanta y verifica' },
  2: { nombre: 'Luis', papel: 'corrige' },
  3: { nombre: 'Eva', papel: 'administra la obra' },
  4: { nombre: 'Mario', papel: 'de la contratista, como Luis' },
};

const q = new URLSearchParams(location.search);
const quien = PERSONAS[q.get('quien')] ? q.get('quien') : '1';
const vista = q.get('vista') === 'incidencias' ? 'incidencias' : 'lector';
const yo = { id: Number(quien), name: PERSONAS[quien].nombre, email: `${PERSONAS[quien].nombre.toLowerCase()}@e.test` };
try { localStorage.setItem('visor_user', JSON.stringify(yo)); } catch { /* sin almacenamiento */ }
const original = window.fetch;
window.fetch = (url, opciones = {}) => original(url, { ...opciones, headers: { ...(opciones.headers || {}), 'X-Quien': quien } });
instalarTooltips();

const enlace = (cambios) => {
  const p = new URLSearchParams({ quien, vista, ...cambios });
  return `?${p}`;
};
const pastilla = (activa) => ({
  padding: '4px 10px', borderRadius: 6, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap',
  color: activa ? '#fff' : '#141413', background: activa ? '#141413' : '#fff', border: '1px solid #cccac0',
});

function Banco() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--a-font-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f1f0e8',
                    borderBottom: '1px solid #e8e6dc', flexWrap: 'wrap', fontSize: 13 }}>
        <b>Banco local</b>
        <span style={{ color: '#72706b' }}>· eres</span>
        {Object.entries(PERSONAS).map(([id, p]) => (
          <a key={id} href={enlace({ quien: id })} style={pastilla(id === quien)}>{p.nombre} <small>({p.papel})</small></a>
        ))}
        <span style={{ flex: 1 }} />
        <a href={enlace({ vista: 'lector' })} style={pastilla(vista === 'lector')}>Lector · DR-803.pdf</a>
        <a href={enlace({ vista: 'incidencias' })} style={pastilla(vista === 'incidencias')}>Issues y punch</a>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {vista === 'lector' ? (
          <PDFViewer url="/_probar/plano-I.pdf" fileName="DR-803.pdf" nodeId={PLANO} projectPrefix={OBRA}
            obraDelDocumento={OBRA} versionDeLasMarcas={{ id: V1, version_number: 1 }}
            versionVigente={{ id: V1, version_number: 1 }} cajetin={() => null} />
        ) : (
          <PunchModule project={{ id: OBRA, model_urn: OBRA }} API="" user={yo} isAdmin={quien === '3'} />
        )}
      </div>
      <Toaster position="bottom-center" />
    </div>
  );
}
createRoot(document.getElementById('raiz')).render(<Banco />);
