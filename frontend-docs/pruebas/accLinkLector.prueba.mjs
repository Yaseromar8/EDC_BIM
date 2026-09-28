import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const lector = readFileSync(join(aqui, '..', 'src/components/DocumentViewer.jsx'), 'utf8');
const visor = readFileSync(join(aqui, '..', 'src/components/CadViewer.jsx'), 'utf8');

// El lector recibe el vínculo desde Docs, sin invocar el explorador de ACC.
assert.match(lector, /apiJson\(`\$\{API\}\/api\/docs\/cad\/acc-link\?/);
assert.match(lector, /setAccLink\(data\.link \|\| null\)/);
assert.match(lector, /<CadViewer[^>]*urnDirecto=\{accLink\?\.viewer_urn \|\| null\}/s);

// Configurar el vínculo es exclusivamente una acción del administrador.
assert.match(lector, /\{esCad && !isShared && esEntityAdmin && !esVistaPuente && \(\s*<button/s);
assert.match(lector, /\{showAccPicker && esCad && !isShared && esEntityAdmin && \(\s*<AccLinkPicker/s);

// Un URN ya preparado se monta directamente; no se pide POST /translate.
assert.match(visor, /if \(urnDirecto\) mount\(urnDirecto\);\s*else arrancar\(\);/);

console.log('accLinkLector: lectura directa sin selector ni traducción, configuración sólo admin');
