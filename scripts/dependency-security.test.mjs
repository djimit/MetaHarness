import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

const scopes = ['../', '../apps/web-ui/', '../services/apicompletions/'];
const floors = {
  'adm-zip': [0, 6, 1],
  browserslist: [4, 28, 7],
  sharp: [0, 35, 5],
  'source-map-js': [1, 2, 2],
  nanoid: [3, 3, 18],
  'body-parser': [2, 4, 0],
};

for (const scope of scopes) {
  const root = new URL(scope, import.meta.url);
  const require = createRequire(new URL('package.json', root));

  test(`${scope} keeps every affected lockfile copy on a patched release`, () => {
    const { packages } = JSON.parse(readFileSync(new URL('package-lock.json', root)));
    const seen = new Set();
    for (const [path, pkg] of Object.entries(packages)) {
      const name = path.split('node_modules/').at(-1);
      const version = pkg.version?.split('.').map(Number);
      const floor = name === 'vite'
        ? version?.[0] === 7 ? [7, 3, 7] : [8, 3, 5]
        : floors[name];
      if (!floor) continue;
      seen.add(name);
      assert.equal(version[0], floor[0], `${path}: unexpected major`);
      assert.ok(version[1] > floor[1] || (version[1] === floor[1] && version[2] >= floor[2]), `${path}@${pkg.version} is vulnerable`);
    }
    for (const name of ['vite', 'source-map-js', 'nanoid']) assert.ok(seen.has(name), `${name} absent`);
    if (scope.includes('web-ui')) {
      for (const name of ['adm-zip', 'sharp', 'browserslist']) assert.ok(seen.has(name), `${name} absent`);
    }
    if (scope.includes('apicompletions')) assert.ok(seen.has('body-parser'));
  });

  test(`${scope} preserves ordinary source maps and ID generation`, () => {
    const { SourceMapConsumer, SourceMapGenerator } = require('source-map-js');
    const generator = new SourceMapGenerator({ file: 'output.js' });
    generator.addMapping({ generated: { line: 1, column: 0 }, original: { line: 2, column: 3 }, source: 'input.ts' });
    const consumer = new SourceMapConsumer(generator.toJSON());
    assert.deepEqual(consumer.originalPositionFor({ line: 1, column: 0 }), { source: 'input.ts', line: 2, column: 3, name: null });
    const indexed = new SourceMapConsumer({ version: 3, sections: [{ offset: { line: 1, column: 0 }, map: generator.toJSON() }] });
    assert.deepEqual(indexed.originalPositionFor({ line: 2, column: 1 }), { source: 'input.ts', line: 2, column: 3, name: null });
    assert.equal(require('nanoid').nanoid(12).length, 12);
  });
}

const ui = createRequire(new URL('../apps/web-ui/package.json', import.meta.url));

test('production build preserves React and ZIP vendor chunks', () => {
  const files = readdirSync(new URL('../apps/web-ui/dist/assets/', import.meta.url));
  assert.ok(files.some(name => name.startsWith('react-') && name.endsWith('.js')));
  assert.ok(files.some(name => name.startsWith('zip-') && name.endsWith('.js')));
});

test('ordinary ONNX dependency ZIP round trip', () => {
  const AdmZip = ui('adm-zip');
  const archive = new AdmZip();
  archive.addFile('model/metadata.json', Buffer.from('{"format":"onnx"}'));
  const decoded = new AdmZip(archive.toBuffer());
  assert.equal(decoded.readAsText('model/metadata.json'), '{"format":"onnx"}');
  const directory = mkdtempSync(new URL('../.dependency-zip-', import.meta.url));
  try {
    decoded.extractEntryTo('model/metadata.json', directory, false, true);
    assert.equal(readFileSync(join(directory, 'metadata.json'), 'utf8'), '{"format":"onnx"}');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('ordinary native image resize and browser target parsing', async () => {
  const sharp = ui('sharp');
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#123456' } }).png().toBuffer();
  const resized = await sharp(png).resize(1, 1).png().toBuffer();
  assert.equal((await sharp(resized).metadata()).width, 1);
  assert.deepEqual(ui('browserslist')('chrome 120'), ['chrome 120']);
});
