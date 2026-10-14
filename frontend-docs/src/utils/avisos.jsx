/**
 * AVISOS · el único `<Toaster>` del portal (UI polish, 13-oct-2026).
 *
 * Había uno solo y vivía DENTRO de Archivos (FilesPage). Todo aviso lanzado
 * fuera de esa pantalla -- la lista de proyectos, por ejemplo, que avisa de
 * errores -- no se veía: react-hot-toast necesita su Toaster montado. Ahora se
 * monta una vez en main.jsx, como ConfirmHost e IdoneidadHost, y llega a todas
 * las rutas.
 *
 * Y con el aspecto del sistema: la librería pintaba su blanco, su gris y su
 * radio de 8 px. La librería pone esos valores en línea, así que se
 * sustituyen por `style` (con tokens), no con una clase.
 */
import React from 'react';
import { Toaster } from 'react-hot-toast';

const ESTILO = {
  background: 'var(--a-surface-raised)',
  color: 'var(--a-text-primary)',
  border: '1px solid var(--a-border-subtle)',
  borderRadius: 'var(--a-radius-md)',
  boxShadow: 'var(--a-shadow-lg)',
  padding: '10px 14px',
  fontSize: 13,
  lineHeight: 1.45,
  maxWidth: 420,
};

export function AvisosHost() {
  return (
    <Toaster
      position="bottom-right"
      gutter={8}
      toastOptions={{
        style: ESTILO,
        success: { iconTheme: { primary: 'var(--a-status-success)', secondary: 'var(--a-surface-raised)' } },
        error: { iconTheme: { primary: 'var(--a-status-danger)', secondary: 'var(--a-surface-raised)' }, duration: 6000 },
        loading: { iconTheme: { primary: 'var(--a-action-primary)', secondary: 'var(--a-border-default)' } },
      }}
    />
  );
}
