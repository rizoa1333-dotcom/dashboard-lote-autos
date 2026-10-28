function rejectOversizedMcpToolInput(req, resp) {
    const maxBytes = 16 * 1024 * 1024;
    const maxElements = 10000;
    const maxDepth = 64;
    const maxBatchSize = 100;
    let message;
    function reject(status, code, text, offendingMessage) {
        const inputId = offendingMessage?.id;
        const id = typeof inputId === 'string' && inputId.length <= 256 && Buffer.byteLength(JSON.stringify(inputId), 'utf8') <= 258
            ? inputId
            : typeof inputId === 'number' && Number.isFinite(inputId) ? inputId : null;
        resp.status(status).json({ jsonrpc: '2.0', id, error: { code, message: text } });
        return true;
    }
    const raw = req.rawBody;
    if (typeof raw === 'string' || Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
        const bytes = typeof raw === 'string' ? Buffer.byteLength(raw, 'utf8') : raw.byteLength;
        if (bytes > maxBytes) return reject(413, -32000, 'MCP request exceeds maximum body size (16777216 bytes)');
        try {
            message = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('utf8'));
        } catch {
            message = req.body;
        }
    } else {
        message = req.body;
    }
    // Bound the envelope too: the HTTP adapter serializes metadata before SDK validation.
    const envelope = [[message, 0]];
    let envelopeElements = 0;
    let envelopeBytes = 0;
    while (envelope.length > 0) {
        const [value, depth] = envelope.pop();
        if (depth > 68) return reject(400, -32600, 'MCP request exceeds maximum envelope depth (68)');
        if (value === null || typeof value !== 'object') continue;
        const array = Array.isArray(value);
        if (array && value.length > 20000 - envelopeElements) return reject(400, -32600, 'MCP request exceeds maximum envelope elements (20000)');
        const keys = array ? null : Object.keys(value);
        const length = array ? value.length : keys.length;
        for (let index = 0; index < length; index++) {
            const key = array ? String(index) : keys[index];
            if (++envelopeElements > 20000) return reject(400, -32600, 'MCP request exceeds maximum envelope elements (20000)');
            const child = value[key];
            envelopeBytes += Buffer.byteLength(key, 'utf8');
            if (typeof child === 'string') envelopeBytes += Buffer.byteLength(child, 'utf8');
            if (envelopeBytes > maxBytes) return reject(413, -32000, 'MCP request exceeds maximum decoded size (16777216 bytes)');
            if (child !== null && typeof child === 'object') envelope.push([child, depth + 1]);
        }
    }
    const batch = Array.isArray(message) ? message : [message];
    if (batch.length > maxBatchSize) return reject(400, -32600, 'MCP batch exceeds maximum size (100 messages)');
    let count = 0;
    let stringBytes = 0;
    for (const item of batch) {
        if (!item || typeof item !== 'object' || item.method !== 'tools/call') continue;
        const args = item.params?.arguments;
        if (args === null || typeof args !== 'object') continue;
        const stack = [[args, 0]];
        while (stack.length > 0) {
            const [value, depth] = stack.pop();
            if (depth > maxDepth) return reject(400, -32602, 'Tool arguments exceed maximum depth (64)', item);
            const array = Array.isArray(value);
            if (array && value.length > maxElements - count) return reject(400, -32602, 'Tool arguments exceed maximum element count (10000)', item);
            const keys = array ? null : Object.keys(value);
            const length = array ? value.length : keys.length;
            for (let index = 0; index < length; index++) {
                const key = array ? String(index) : keys[index];
                if (++count > maxElements) return reject(400, -32602, 'Tool arguments exceed maximum element count (10000)', item);
                const child = value[key];
                stringBytes += Buffer.byteLength(key, 'utf8');
                if (typeof child === 'string') stringBytes += Buffer.byteLength(child, 'utf8');
                if (stringBytes > maxBytes) return reject(413, -32000, 'Tool argument strings exceed maximum size (16777216 bytes)', item);
                if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
            }
        }
    }
    return false;
}
module.exports = { rejectOversizedMcpToolInput };
