'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { locateAntigravityAsar } = require('../src/locator');
const { installPatch, restoreBackup, getStatus, PATCH_MARKER_START } = require('../src/patcher');
const { parseAsar, readFileFromAsar, verifyAsarBuffer } = require('../src/asar');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

let realAsarPath = null;
try {
  realAsarPath = locateAntigravityAsar();
} catch {
  realAsarPath = null;
}

test(
  'end-to-end install, idempotent re-install, and lossless restore on real app.asar copy',
  { skip: !realAsarPath ? 'Antigravity not installed on this runner' : false },
  () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-zh-cn-test-'));
    const copyAsar = path.join(tmpDir, 'app.asar');

    try {
      fs.copyFileSync(realAsarPath, copyAsar);
      const origHash = sha256(fs.readFileSync(copyAsar));

      // 1. Initial status
      const statusBefore = getStatus(copyAsar);
      assert.equal(statusBefore.patched, false);
      assert.equal(statusBefore.hasBackup, false);

      // 2. First install
      const res1 = installPatch(copyAsar);
      assert.equal(res1.backupAction, 'created-or-refreshed');
      assert.equal(res1.verification.ok, true);

      const patchedBuf = fs.readFileSync(copyAsar);
      const parsed = parseAsar(patchedBuf);
      const mainJs = readFileFromAsar(parsed, 'dist/main.js').toString('utf8');
      const preloadJs = readFileFromAsar(parsed, 'dist/preload.js').toString('utf8');
      assert.ok(mainJs.includes(PATCH_MARKER_START));
      assert.ok(preloadJs.includes(PATCH_MARKER_START));
      assert.ok(readFileFromAsar(parsed, 'dist/zh-cn-main.js'));
      assert.ok(readFileFromAsar(parsed, 'dist/zh-cn-menu.json'));

      // Verify patched dist/main.js and dist/preload.js are syntactically valid JS
      assert.doesNotThrow(() => new Function(mainJs));
      assert.doesNotThrow(() => new Function(preloadJs));

      // 3. Status after install
      const statusAfter = getStatus(copyAsar);
      assert.equal(statusAfter.patched, true);
      assert.equal(statusAfter.hasBackup, true);

      // 4. Idempotent second install (should reuse clean backup, never double-inject)
      const res2 = installPatch(copyAsar);
      assert.equal(res2.backupAction, 'reused-existing');
      const parsed2 = parseAsar(fs.readFileSync(copyAsar));
      const mainJs2 = readFileFromAsar(parsed2, 'dist/main.js').toString('utf8');
      assert.equal(mainJs2.split(PATCH_MARKER_START).length - 1, 1);

      // 5. Lossless restore (byte-for-byte identical to original app.asar!)
      const restoreRes = restoreBackup(copyAsar);
      assert.equal(restoreRes.verification.ok, true);
      const restoredHash = sha256(fs.readFileSync(copyAsar));
      assert.equal(restoredHash, origHash);
      assert.equal(getStatus(copyAsar).patched, false);
      assert.equal(getStatus(copyAsar).hasBackup, false);
      assert.equal(verifyAsarBuffer(fs.readFileSync(copyAsar)).ok, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
);
