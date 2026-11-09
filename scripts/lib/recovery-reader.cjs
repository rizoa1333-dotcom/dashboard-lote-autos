'use strict';
const fs = require('node:fs');

/**
 * Charge the shared budget against the open file before allocating its buffer.
 * @param {string} file
 * @param {{remaining: number}} budget
 * @param {number} limit
 * @returns {Buffer}
 */
function readBounded(file, budget, limit) {
  const fd = fs.openSync(file, 'r');
  let bytes;
  try {
    const initial = fs.fstatSync(fd);
    const { size } = initial;
    if (!initial.isFile() || !Number.isSafeInteger(size) || size < 0 || size > limit) {
      throw new Error('RECOVERY_BACKUP_INVALID');
    }
    if (!Number.isSafeInteger(budget.remaining) || size > budget.remaining) {
      throw new Error('RECOVERY_TOTAL_SIZE_LIMIT');
    }
    budget.remaining -= size;
    bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = fs.readSync(fd, bytes, offset, size - offset, offset);
      if (!count) throw new Error('RECOVERY_BACKUP_CHANGED');
      offset += count;
    }
    const final = fs.fstatSync(fd);
    if (final.size !== size || final.mtimeMs !== initial.mtimeMs || final.ctimeMs !== initial.ctimeMs) {
      throw new Error('RECOVERY_BACKUP_CHANGED');
    }
    return bytes;
  } catch (error) {
    bytes?.fill(0);
    throw error;
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { readBounded };
