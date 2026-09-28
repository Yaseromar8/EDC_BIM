import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const menu = read('src/components/ContextMenu.jsx');
const picker = read('src/components/AccFolderBridge.jsx');
const viewer = read('src/components/DocumentViewer.jsx');
const files = read('src/pages/FilesPage.jsx');
const table = read('src/MatrixTable.jsx');
const upload = read('src/hooks/useChunkedUpload.js');

// La configuracion no aparece a un administrador de otra obra ni a un lector.
assert.match(menu, /item\.type === 'folder' && esEntityAdmin && onOpenAccBridge && !varios/);
assert.match(files, /<AccFolderBridge API=\{API\} folder=\{accBridgeFolder\}/);
assert.doesNotMatch(files, /searchParams\.get\('acc_bridge'\)/);
assert.match(files, /const puedeVincularAcc = esEntityAdmin \|\| user\?\.role === 'admin'/);
assert.match(files, /!fe\.isTrashMode && puedeVincularAcc && fe\.currentNodeId && fe\.selected\.size === 0/);
assert.match(files, /aria-label="Configurar vínculo ACC de la carpeta actual"/);
assert.doesNotMatch(files, /accBridgeBackendReady|Vista local · sin guardar/);
assert.match(files, /esEntityAdmin=\{puedeVincularAcc\}/);
assert.match(files, /id: fe\.currentNodeId/);
assert.match(files, /acc-bridge\/folder\?\$\{params\}/);
assert.match(files, /ACC: \{accBridgeInfo\.bridge\.project_name[^\n]+ \/ \{accBridgeInfo\.bridge\.folder_name/);
assert.match(files, /onSaved=\{\(bridge, serviceEnabled\) => setAccBridgeInfo/);
assert.match(picker, /onSaved\?\.\(data\.bridge, data\.service_enabled === true\)/);

// Seleccion una sola vez; el dialogo NO sube ficheros por si mismo.
assert.match(picker, /accReadOnlyPath\(level, ids\)/);
assert.match(picker, /method: 'PUT', retries: 0/);
assert.match(picker, /enabled, \.\.\.\(enabled \? \{/);
assert.doesNotMatch(picker, /upload-confirm|signeds3upload|\/api\/docs\/cad\/translate/);

// En espera o error se ve el estado: nunca se monta CadViewer sin URN ACC.
assert.match(viewer, /setAccBridge\(data\.bridge \|\| null\)/);
assert.match(viewer, /accLink\?\.source === 'emergency_folder_bridge'/);
assert.match(viewer, /!esVistaPuente && accLinkFor === accKey && accLink/);
assert.match(viewer, /esEntityAdmin && !esVistaPuente/);
assert.match(viewer, /if \(accBridge && !accLink\) return/);
assert.match(viewer, /<CadViewer[^>]*urnDirecto=\{accLink\?\.viewer_urn \|\| null\}/s);
assert.match(viewer, /window\.addEventListener\('focus', alVolver\)/);
assert.match(viewer, /document\.addEventListener\('visibilitychange', alVolver\)/);
assert.match(viewer, /lastAccFocusCheck\.current < 2000/);
assert.doesNotMatch(viewer, /ACC está preparando la vista/);
assert.match(table, /procesando: \{ texto: 'Procesando'/);
assert.match(table, /PREPARANDO = new Set\(\['subiendo', 'inprogress', 'procesando'\]\)/);
assert.match(table, /document\.addEventListener\('visibilitychange', alVolver\)/);
assert.match(table, /window\.addEventListener\('focus', alVolver\)/);
assert.match(table, /if \(!vivo \|\| !enEspera \|\| document\.visibilityState !== 'visible'\) return/);
assert.match(table, /d\.bridge_pending \? 5000 : 15000/);
// Un documento conserva el mismo ID al subir V2; el sondeo debe reabrirse
// por cambio de versión/original, no sólo cuando aparece otra fila.
assert.match(table, /JSON\.stringify\(files\.filter/);
assert.match(table, /\.map\(f => \[f\.id, f\.version, f\.gcs_urn\]\)/);
assert.match(table, /JSON\.parse\(claveCad\)\.map\(\(\[id\]\) => id\)/);
assert.match(upload, /confirmData\.acc_bridge\s*\? 'Archivo guardado · procesando vista…'/);

console.log('accBridgeTemporal: selector sólo admin, estado visible y sin traducción del lector');
