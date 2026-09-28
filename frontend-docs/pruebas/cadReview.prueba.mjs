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
  assert.match(body, /\$\{x \+ w \+ 9\}/);
  assert.match(body, /\$\{x - 9\}/);
  assert.match(body, /\$\{y - 9\}/);
  assert.match(body, /\$\{y \+ h \+ 9\}/);
});
