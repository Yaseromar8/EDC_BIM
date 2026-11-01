/**
 * El registro de la gráfica de View para el Lienzo (design/lienzo/Lienzo.jsx, `tipos`; docs/visor/68). Es una foto con
 * fecha: la tarjeta se mueve y se escala, pero sus datos solo los cambia View al volver a enviarla. Doble clic abre el
 * Tablero del frente en View.
 */
import TarjetaGrafica from './TarjetaGrafica';
import { enlaceAView, limpiarGrafica } from './graficas';
import { VISOR_URL } from '../../utils/helpers';

export function tipoGrafica() {
  return {
    Pieza: TarjetaGrafica,
    redimensionable: true,
    minimo: [260, 180],
    etiqueta: 'Gráfica',
    texto: (el) => [el.nombre, el.subtitulo, el.campo, ...(el.grupos || []).map(g => g.k)].filter(Boolean).join(' '),
    alDobleClic: (el) => { const u = enlaceAView(VISOR_URL, el.origen); if (u) window.open(u, '_blank', 'noopener'); },
    limpiar: limpiarGrafica,
  };
}
