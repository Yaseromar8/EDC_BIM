// chartjsTheme.js — Tema ÚNICO de Chart.js para el Tablero.
// =============================================================
// Un solo lugar define fuente, colores, tooltips y rejillas: TODOS los
// gráficos del tablero salen de la misma familia visual (eso es lo que
// separa un producto de una colección de gráficos sueltos).
//
// Nota de peso: se importa solo desde el chunk del Tablero (React.lazy),
// así que chart.js NO engorda el bundle principal del visor.
import Chart from 'chart.js/auto';

Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#5f6b7a';                       // texto de ejes/leyendas (tema claro Miro)
Chart.defaults.borderColor = 'rgba(23, 28, 38, 0.09)';  // rejillas

Chart.defaults.animation.duration = 450;

Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;
Chart.defaults.plugins.legend.labels.boxHeight = 8;

const tt = Chart.defaults.plugins.tooltip;
tt.backgroundColor = 'rgba(22, 27, 35, 0.97)';
tt.borderColor = '#2b323d';
tt.borderWidth = 1;
tt.titleColor = '#eef1f5';
tt.bodyColor = '#aeb7c4';
tt.padding = 9;
tt.cornerRadius = 7;
tt.displayColors = true;
tt.boxWidth = 8;
tt.boxHeight = 8;
tt.usePointStyle = true;
tt.titleFont = { family: "'Poppins', 'Inter', sans-serif", size: 12, weight: '600' };

export default Chart;
