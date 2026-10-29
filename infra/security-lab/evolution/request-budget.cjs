'use strict';
/** @param {{maxActive?: number, timeoutMs?: number}} options */
function createRequestBudget({ maxActive = 4, timeoutMs = 15000 } = {}) {
  if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 32 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('INVALID_REQUEST_BUDGET');
  let active = 0;
  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {() => void} next */
  return function requestBudget(req, res, next) {
    const type = String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    const maxBytes = type === 'application/json' ? 1024 * 1024 : type === 'application/x-www-form-urlencoded' ? 64 * 1024 : 0;
    if (!maxBytes) return next();
    function reject(status, error) {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Connection', 'close');
      if (status === 503) res.setHeader('Retry-After', '2');
      req.resume();
      res.end(JSON.stringify({ error }));
    }
    const length = req.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBytes)) return reject(413, 'REQUEST_TOO_LARGE');
    if (active >= maxActive) return reject(503, 'REQUEST_CAPACITY');
    active++;
    let released = false;
    const clearDeadline = () => clearTimeout(timer);
    const release = () => {
      if (released) return;
      released = true; active--; clearDeadline();
      req.off('end', clearDeadline); req.off('aborted', release);
      res.off('finish', release); res.off('close', release);
    };
    const timer = setTimeout(() => { reject(408, 'REQUEST_BODY_TIMEOUT'); release(); }, timeoutMs);
    timer.unref();
    req.once('end', clearDeadline); req.once('aborted', release);
    res.once('finish', release); res.once('close', release);
    if (req.complete) clearDeadline();
    next();
  };
}
function parserErrorHandler(error, _req, res, next) {
  const status = new Map([
    ['entity.too.large', 413], ['parameters.too.many', 413],
    ['entity.parse.failed', 400], ['querystring.parse.rangeError', 400],
    ['encoding.unsupported', 415], ['charset.unsupported', 415],
  ]).get(error?.type);
  if (!status || res.headersSent || res.destroyed || res.writableEnded) return next(error);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST_BODY' }));
}
module.exports = { createRequestBudget, middleware: createRequestBudget(), parserErrorHandler };
