'use strict';

/** @param {Record<string,string|undefined>} evolution @param {Record<string,string|undefined>} postgres @param {Record<string,string|undefined>} redis */
function validateStorageBindings(evolution, postgres, redis) {
  try {
    const url = value => {
      if (typeof value !== 'string' || value.length > 8192) throw new Error();
      return new URL(value);
    };
    const decode = value => decodeURIComponent(value);
    const database = url(evolution.DATABASE_CONNECTION_URI), pg = url(postgres.DATABASE_URL);
    const protocols = new Set(['postgres:', 'postgresql:']);
    const databaseName = decode(database.pathname.slice(1));
    if (!protocols.has(database.protocol) || !protocols.has(pg.protocol)
      || database.hostname !== postgres.RAILWAY_PRIVATE_DOMAIN || database.hostname !== pg.hostname
      || (database.port || '5432') !== '5432' || (pg.port || '5432') !== '5432'
      || databaseName !== postgres.POSTGRES_DB || databaseName !== decode(pg.pathname.slice(1))
      || decode(database.username) !== postgres.POSTGRES_USER || decode(pg.username) !== postgres.POSTGRES_USER
      || decode(database.password) !== postgres.POSTGRES_PASSWORD || decode(pg.password) !== postgres.POSTGRES_PASSWORD) throw new Error();
    const cache = url(evolution.CACHE_REDIS_URI), service = url(redis.REDIS_URL);
    const cacheDatabase = item => {
      const value = decode(item.pathname || '/0');
      if (value === '/') return 0;
      if (!/^\/(0|[1-9]\d*)$/.test(value)) throw new Error();
      const number = Number(value.slice(1));
      if (!Number.isSafeInteger(number) || number > 65535) throw new Error();
      return number;
    };
    const index = cacheDatabase(cache);
    if (evolution.CACHE_REDIS_ENABLED !== 'true' || cache.protocol !== 'redis:' || service.protocol !== 'redis:'
      || cache.hostname !== redis.RAILWAY_PRIVATE_DOMAIN || cache.hostname !== service.hostname
      || (cache.port || '6379') !== '6379' || (service.port || '6379') !== '6379'
      || (decode(cache.username) || 'default') !== 'default' || (decode(service.username) || 'default') !== 'default'
      || decode(cache.password) !== redis.REDISPASSWORD || decode(service.password) !== redis.REDISPASSWORD
      || index !== cacheDatabase(service)) throw new Error();
    return { postgresDatabase: databaseName, redisDatabase: index };
  } catch {
    throw new Error('STORAGE_BINDING_MISMATCH');
  }
}

/** @param {{instances:number,sessions:number,sessionsWithCredentials:number,webhooks:number,migrations:number,migrationHash:string}} baseline
 * @param {{metadata:Record<string,number>,migrationHash:string,keyspace:Array<{db:number,keys:number,expiring:number}>}} restored
 * @param {Array<{db:number,keys:number,expiring:number}>} capturedKeyspace */
function assertCheckpointMatches(baseline, restored, capturedKeyspace) {
  try {
    const count = value => Number.isSafeInteger(value) && value >= 0;
    for (const key of ['instances', 'sessions', 'webhooks', 'migrations']) {
      if (!count(baseline[key]) || !count(restored.metadata[key]) || restored.metadata[key] !== baseline[key]) throw new Error();
    }
    if (!count(baseline.sessionsWithCredentials) || restored.metadata.credsPresent !== baseline.sessionsWithCredentials
      || !/^[a-f0-9]{64}$/.test(baseline.migrationHash) || restored.migrationHash !== baseline.migrationHash) throw new Error();
    const normalize = rows => {
      if (!Array.isArray(rows) || rows.length > 256) throw new Error();
      const seen = new Set();
      return rows.map(row => {
        if (!count(row.db) || row.db > 65535 || seen.has(row.db) || !count(row.keys) || row.expiring !== 0) throw new Error();
        seen.add(row.db);
        return { db: row.db, keys: row.keys, expiring: row.expiring };
      }).sort((a, b) => a.db - b.db);
    };
    if (JSON.stringify(normalize(restored.keyspace)) !== JSON.stringify(normalize(capturedKeyspace))) throw new Error();
  } catch {
    throw new Error('RESTORED_CHECKPOINT_MISMATCH');
  }
}

module.exports = { validateStorageBindings, assertCheckpointMatches };
