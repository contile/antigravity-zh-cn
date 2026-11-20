'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeIntegrity,
  parseAsar,
  readFileFromAsar,
  patchAsarBuffer,
  verifyAsarBuffer,
} = require('../src/asar');

/**
 * Helper to construct a valid synthetic ASAR buffer in memory.
 */
function buildSyntheticAsar(filesMap) {
  const header = { files: {} };
  const chunks = [];
  let offset = 0;

  for (const [relPath, content] of Object.entries(filesMap)) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const parts = relPath.split('/');
    let node = header;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.files[parts[i]]) node.files[parts[i]] = { files: {} };
      node = node.files[parts[i]];
    }
    node.files[parts[parts.length - 1]] = {
      size: buf.length,
      offset: String(offset),
      integrity: computeIntegrity(buf),
    };
    chunks.push(buf);
    offset += buf.length;
  }

  const jsonBuf = Buffer.from(JSON.stringify(header), 'utf8');
  const alignedLen = (jsonBuf.length + 3) & ~3;
  const headerSize = 8 + alignedLen;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(headerSize, 4);
  prefix.writeUInt32LE(headerSize - 4, 8);
  prefix.writeUInt32LE(jsonBuf.length, 12);
  const padding = Buffer.alloc(alignedLen - jsonBuf.length, 0);

  return Buffer.concat([prefix, jsonBuf, padding, ...chunks]);
}

test('parseAsar and readFileFromAsar round-trip cleanly', () => {
  const asarBuf = buildSyntheticAsar({
    'package.json': '{"name":"antigravity","version":"2.33.0"}',
    'dist/main.js': '"use strict";\nconsole.log("hello");\n',
    'dist/preload.js': '"use strict";\nconsole.log("preload");\n',
  });

  const parsed = parseAsar(asarBuf);
  assert.equal(
    readFileFromAsar(parsed, 'package.json').toString('utf8'),
    '{"name":"antigravity","version":"2.33.0"}'
  );
  assert.equal(readFileFromAsar(parsed, 'nonexistent.js'), null);
  assert.deepEqual(verifyAsarBuffer(asarBuf), {
    ok: true,
    fileCount: 3,
    checkedIntegrity: 3,
  });
});

test('patchAsarBuffer updates existing files, adds new files, and preserves untouched bytes', () => {
  const original = buildSyntheticAsar({
    'package.json': '{"name":"antigravity","version":"2.33.0"}',
    'dist/main.js': '"use strict";\nconsole.log("orig");\n',
    'assets/binary.bin': Buffer.from([0, 1, 2, 255, 128, 42]),
  });

  const patched = patchAsarBuffer(original, {
    'dist/main.js': Buffer.from('"use strict";\nrequire("./zh-cn-main.js");\n', 'utf8'),
    'dist/zh-cn-main.js': Buffer.from('module.exports = true;', 'utf8'),
  });

  const check = verifyAsarBuffer(patched);
  assert.equal(check.ok, true);
  assert.equal(check.fileCount, 4);
  assert.equal(check.checkedIntegrity, 4);

  const parsed = parseAsar(patched);
  assert.equal(
    readFileFromAsar(parsed, 'dist/main.js').toString('utf8'),
    '"use strict";\nrequire("./zh-cn-main.js");\n'
  );
  assert.equal(
    readFileFromAsar(parsed, 'dist/zh-cn-main.js').toString('utf8'),
    'module.exports = true;'
  );
  assert.deepEqual(
    readFileFromAsar(parsed, 'assets/binary.bin'),
    Buffer.from([0, 1, 2, 255, 128, 42])
  );
});

test('verifyAsarBuffer detects corrupted payload bytes', () => {
  const original = buildSyntheticAsar({
    'dist/main.js': 'console.log("integrity check");',
  });
  const corrupted = Buffer.from(original);
  corrupted[corrupted.length - 1] ^= 0xff;
  assert.throws(() => verifyAsarBuffer(corrupted), /SHA-256 mismatch/);
});
