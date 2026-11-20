'use strict';

/**
 * Pure Node.js ASAR archive reader and surgical patcher (zero dependencies).
 *
 * Implements the Electron ASAR binary format (Chromium Pickle header + payload)
 * with full SHA-256 block integrity recalculation, preserving all untouched
 * entries, unpacked markers, symlinks, and executable flags byte-for-byte.
 */

const fs = require('fs');
const crypto = require('crypto');

const INTEGRITY_BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB, matches @electron/asar

/**
 * Compute Electron ASAR integrity metadata for a file buffer.
 * @param {Buffer} buffer
 */
function computeIntegrity(buffer) {
  const fullHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const blocks = [];
  if (buffer.length === 0) {
    blocks.push(fullHash);
  } else {
    for (let offset = 0; offset < buffer.length; offset += INTEGRITY_BLOCK_SIZE) {
      const slice = buffer.subarray(offset, Math.min(offset + INTEGRITY_BLOCK_SIZE, buffer.length));
      blocks.push(crypto.createHash('sha256').update(slice).digest('hex'));
    }
  }
  return {
    algorithm: 'SHA256',
    hash: fullHash,
    blockSize: INTEGRITY_BLOCK_SIZE,
    blocks,
  };
}

/**
 * Parse an ASAR archive buffer into its header tree and raw payload region.
 * @param {Buffer} rawBuffer
 */
function parseAsar(rawBuffer) {
  if (!Buffer.isBuffer(rawBuffer) || rawBuffer.length < 16) {
    throw new Error('Invalid ASAR archive: file is too small.');
  }
  const sizePicklePayload = rawBuffer.readUInt32LE(0);
  const headerSize = rawBuffer.readUInt32LE(4);
  const headerPicklePayload = rawBuffer.readUInt32LE(8);
  const jsonByteLen = rawBuffer.readUInt32LE(12);

  if (sizePicklePayload !== 4) {
    throw new Error(`Invalid ASAR header: unexpected pickle payload size (${sizePicklePayload}).`);
  }
  if (headerPicklePayload !== headerSize - 4) {
    throw new Error(
      `Invalid ASAR header: mismatched pickle sizes (${headerPicklePayload} vs ${headerSize - 4}).`
    );
  }
  const payloadStart = 8 + headerSize;
  if (16 + jsonByteLen > payloadStart || payloadStart > rawBuffer.length) {
    throw new Error('Invalid ASAR header: header length exceeds file bounds.');
  }

  const headerJsonStr = rawBuffer.subarray(16, 16 + jsonByteLen).toString('utf8');
  const header = JSON.parse(headerJsonStr);
  const payload = rawBuffer.subarray(payloadStart);

  return { header, payload, headerSize, payloadStart };
}

/**
 * Resolve a slash-separated path inside an ASAR header tree.
 * @param {object} header
 * @param {string} relPath
 * @returns {object | null}
 */
function findEntry(header, relPath) {
  const parts = relPath.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    if (!node || typeof node !== 'object' || !node.files || !(part in node.files)) {
      return null;
    }
    node = node.files[part];
  }
  return node;
}

/**
 * Read a single file's bytes from a parsed ASAR archive.
 * @param {{ header: object, payload: Buffer }} parsed
 * @param {string} relPath
 * @returns {Buffer | null}
 */
function readFileFromAsar(parsed, relPath) {
  const entry = findEntry(parsed.header, relPath);
  if (!entry || entry.files || entry.unpacked || entry.link !== undefined) {
    return null;
  }
  const offset = Number(entry.offset);
  const size = Number(entry.size);
  if (!Number.isFinite(offset) || !Number.isFinite(size)) {
    throw new Error(`Invalid ASAR entry metadata for "${relPath}".`);
  }
  return Buffer.from(parsed.payload.subarray(offset, offset + size));
}

/**
 * Ensure parent directories exist in header tree and insert/update a file node.
 * @param {object} header
 * @param {string} relPath
 * @param {object} entryObj
 */
function setEntry(header, relPath, entryObj) {
  const parts = relPath.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Cannot set empty ASAR path.');
  }
  let node = header;
  for (let i = 0; i < parts.length - 1; i++) {
    const dir = parts[i];
    if (!node.files) node.files = {};
    if (!node.files[dir]) {
      node.files[dir] = { files: {} };
    }
    node = node.files[dir];
  }
  if (!node.files) node.files = {};
  node.files[parts[parts.length - 1]] = entryObj;
}

/**
 * Surgically patch an ASAR archive in memory.
 *
 * Only entries present in `overrides` (Map<relPath, Buffer>) are replaced or added.
 * All other files retain their original raw bytes and metadata untouched.
 *
 * @param {Buffer} rawBuffer - Original ASAR archive bytes
 * @param {Map<string, Buffer> | Record<string, Buffer>} overrides - Files to replace/insert
 * @returns {Buffer} - Newly packed ASAR archive bytes
 */
function patchAsarBuffer(rawBuffer, overrides) {
  const overrideMap =
    overrides instanceof Map
      ? new Map([...overrides.entries()].map(([k, v]) => [k.replace(/\\/g, '/').replace(/^\/+/, ''), v]))
      : new Map(
          Object.entries(overrides).map(([k, v]) => [k.replace(/\\/g, '/').replace(/^\/+/, ''), v])
        );

  const parsed = parseAsar(rawBuffer);
  // Deep-clone header so caller's structure isn't mutated
  const newHeader = JSON.parse(JSON.stringify(parsed.header));

  // Ensure any new files in overrideMap exist in the header tree
  for (const [relPath, buf] of overrideMap.entries()) {
    const existing = findEntry(newHeader, relPath);
    if (!existing) {
      setEntry(newHeader, relPath, {
        size: buf.length,
        offset: '0',
      });
    }
  }

  // Rebuild payload sequentially by traversing the header tree
  const chunks = [];
  let currentOffset = 0;

  function rebuildTree(node, prefix) {
    if (!node.files) return;
    for (const name of Object.keys(node.files)) {
      const entry = node.files[name];
      const relPath = prefix ? `${prefix}/${name}` : name;

      if (entry.files) {
        rebuildTree(entry, relPath);
        continue;
      }
      if (entry.unpacked || entry.link !== undefined) {
        continue;
      }

      let fileBuf;
      if (overrideMap.has(relPath)) {
        fileBuf = overrideMap.get(relPath);
        entry.size = fileBuf.length;
        entry.offset = String(currentOffset);
        entry.integrity = computeIntegrity(fileBuf);
      } else {
        const origOffset = Number(entry.offset);
        const origSize = Number(entry.size);
        fileBuf = parsed.payload.subarray(origOffset, origOffset + origSize);
        entry.offset = String(currentOffset);
      }

      chunks.push(fileBuf);
      currentOffset += fileBuf.length;
    }
  }

  rebuildTree(newHeader, '');

  const jsonBuf = Buffer.from(JSON.stringify(newHeader), 'utf8');
  const alignedJsonLen = (jsonBuf.length + 3) & ~3;
  const paddingLen = alignedJsonLen - jsonBuf.length;
  const headerSize = 8 + alignedJsonLen;

  const prefixBuf = Buffer.alloc(16);
  prefixBuf.writeUInt32LE(4, 0);
  prefixBuf.writeUInt32LE(headerSize, 4);
  prefixBuf.writeUInt32LE(headerSize - 4, 8);
  prefixBuf.writeUInt32LE(jsonBuf.length, 12);

  const paddingBuf = paddingLen > 0 ? Buffer.alloc(paddingLen, 0) : Buffer.alloc(0);

  return Buffer.concat([prefixBuf, jsonBuf, paddingBuf, ...chunks]);
}

/**
 * Verify every packed file in an ASAR buffer against its bounds and SHA-256 integrity.
 * @param {Buffer} rawBuffer
 * @returns {{ ok: boolean, fileCount: number, checkedIntegrity: number }}
 */
function verifyAsarBuffer(rawBuffer) {
  const parsed = parseAsar(rawBuffer);
  let fileCount = 0;
  let checkedIntegrity = 0;

  function walk(node, prefix) {
    if (!node.files) return;
    for (const name of Object.keys(node.files)) {
      const entry = node.files[name];
      const relPath = prefix ? `${prefix}/${name}` : name;
      if (entry.files) {
        walk(entry, relPath);
        continue;
      }
      if (entry.unpacked || entry.link !== undefined) {
        continue;
      }
      fileCount++;
      const offset = Number(entry.offset);
      const size = Number(entry.size);
      if (offset < 0 || size < 0 || offset + size > parsed.payload.length) {
        throw new Error(`Corrupt ASAR: "${relPath}" out of payload bounds.`);
      }
      if (entry.integrity && entry.integrity.algorithm === 'SHA256') {
        const slice = parsed.payload.subarray(offset, offset + size);
        const hash = crypto.createHash('sha256').update(slice).digest('hex');
        if (hash !== entry.integrity.hash) {
          throw new Error(`Corrupt ASAR: SHA-256 mismatch on "${relPath}".`);
        }
        checkedIntegrity++;
      }
    }
  }

  walk(parsed.header, '');
  return { ok: true, fileCount, checkedIntegrity };
}

/**
 * Read a single UTF-8 file from an ASAR file on disk.
 * @param {string} asarPath
 * @param {string} relPath
 * @returns {string | null}
 */
function readTextFromAsarFile(asarPath, relPath) {
  const raw = fs.readFileSync(asarPath);
  const parsed = parseAsar(raw);
  const buf = readFileFromAsar(parsed, relPath);
  return buf ? buf.toString('utf8') : null;
}

module.exports = {
  INTEGRITY_BLOCK_SIZE,
  computeIntegrity,
  parseAsar,
  findEntry,
  readFileFromAsar,
  patchAsarBuffer,
  verifyAsarBuffer,
  readTextFromAsarFile,
};
