import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../src/components/CadReviewOverlay.jsx'), 'utf8');

await test('el selector lee el sobre data de la API documental', () => {
  assert.match(source, /const data = response\?\.data \|\| \{\};/);
  assert.match(source, /data\.folders/);
  assert.match(source, /data\.files/);
});

await test('la nube recorre los cuatro lados del rectángulo', () => {
  const body = source.match(/function cloudPath\(x, y, w, h\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body, 'existe el trazado de la nube');
  assert.match(body, /for \(let i = 0; i < nx; i\+\+\)/);
  assert.match(body, /for \(let i = 0; i < ny; i\+\+\)/);
  assert.match(body, /\$\{x \+ w \+ 14\}/);
  assert.match(body, /\$\{x - 14\}/);
  assert.match(body, /\$\{y - 14\}/);
  assert.match(body, /\$\{y \+ h \+ 14\}/);
});

await test('las referencias y fotos se abren en un visor flotante sin ventana externa', () => {
  assert.match(source, /function FloatingPreview\(/);
  assert.match(source, /createPortal\(/);
  assert.match(source, /<PhotoPreview markId=/);
  assert.match(source, /api\/docs\/signed-url/);
  assert.match(source, /api\/docs\/proxy/);
  assert.match(source, /reviewEnabled=\{false\}/);
  assert.doesNotMatch(source, /window\.open\(/);
  assert.doesNotMatch(source, /📷/);
});
