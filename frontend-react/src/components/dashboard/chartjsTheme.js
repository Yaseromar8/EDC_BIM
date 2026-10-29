// chartjsTheme.js — Tema ÚNICO de Chart.js para el Tablero.
// =============================================================
// Un solo lugar define fuente, colores, tooltips y rejillas: TODOS los
// gráficos del tablero salen de la misma familia visual (eso es lo que
// separa un producto de una colección de gráficos sueltos). Los colores son
// los de tema.js: la paleta oficial, la misma que usa la Planilla.
//
// Nota de peso: se importa solo desde el chunk del Tablero (React.lazy),
// así que chart.js NO engorda el bundle principal del visor.
import Chart from 'chart.js/auto';
import { C, FUENTE } from './tema';

Chart.defaults.font.family = FUENTE;
Chart.defaults.font.size = 11;
Chart.defaults.color = C.gris600;                        // texto de ejes y leyendas
Chart.defaults.borderColor = 'rgba(20, 20, 19, 0.08)';   // rejillas: Dark al 8 %

Chart.defaults.animation.duration = 300;

Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;
Chart.defaults.plugins.legend.labels.boxHeight = 8;

const tt = Chart.defaults.plugins.tooltip;
tt.backgroundColor = C.dark;
tt.borderColor = C.gris850;
tt.borderWidth = 1;
tt.titleColor = C.light;
tt.bodyColor = C.lightGray;
tt.padding = 8;
tt.cornerRadius = 6;
tt.displayColors = true;
tt.boxWidth = 8;
tt.boxHeight = 8;
tt.usePointStyle = true;
tt.titleFont = { family: FUENTE, size: 12, weight: '600' };

export default Chart;
