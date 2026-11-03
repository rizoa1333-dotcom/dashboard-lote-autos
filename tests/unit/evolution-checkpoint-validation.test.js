'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateStorageBindings,assertCheckpointMatches}=require('../../infra/security-lab/evolution/checkpoint-validation.cjs');
function environments(){return{
 evolution:{DATABASE_CONNECTION_URI:'postgresql://qa:p%40ss@pg.railway.internal:5432/evo',CACHE_REDIS_ENABLED:'true',CACHE_REDIS_URI:'redis://default:cache%40pw@redis.railway.internal:6379/0'},
 postgres:{DATABASE_URL:'postgresql://qa:p%40ss@pg.railway.internal:5432/evo',RAILWAY_PRIVATE_DOMAIN:'pg.railway.internal',POSTGRES_USER:'qa',POSTGRES_PASSWORD:'p@ss',POSTGRES_DB:'evo'},
 redis:{REDIS_URL:'redis://default:cache%40pw@redis.railway.internal:6379/0',RAILWAY_PRIVATE_DOMAIN:'redis.railway.internal',REDISPASSWORD:'cache@pw'},
};}
test('storage bindings tie effective PostgreSQL and Redis URIs to the selected services',()=>{
 const f=environments();assert.deepEqual(validateStorageBindings(f.evolution,f.postgres,f.redis),{postgresDatabase:'evo',redisDatabase:0});
 for(const mutate of [
  x=>{x.postgres.POSTGRES_DB='other'},x=>{x.postgres.POSTGRES_USER='other'},x=>{x.postgres.POSTGRES_PASSWORD='other'},
  x=>{x.postgres.RAILWAY_PRIVATE_DOMAIN='other.railway.internal'},x=>{x.evolution.DATABASE_CONNECTION_URI=x.evolution.DATABASE_CONNECTION_URI.replace('5432','5433')},
  x=>{x.evolution.CACHE_REDIS_URI=x.evolution.CACHE_REDIS_URI.replace('redis.railway.internal','other.railway.internal')},
  x=>{x.redis.REDISPASSWORD='other'},x=>{x.redis.RAILWAY_PRIVATE_DOMAIN='other.railway.internal'},
  x=>{x.evolution.CACHE_REDIS_URI=x.evolution.CACHE_REDIS_URI.replace('/0','/1')},
  x=>{x.evolution.CACHE_REDIS_URI=x.evolution.CACHE_REDIS_URI.replace('6379','6380')},
  x=>{x.evolution.CACHE_REDIS_URI='not-a-url'},x=>{x.evolution.CACHE_REDIS_ENABLED='false'},
 ]){const x=environments();mutate(x);assert.throws(()=>validateStorageBindings(x.evolution,x.postgres,x.redis),/STORAGE_BINDING_MISMATCH/);}
});
function checkpoint(){const hash='a'.repeat(64);return{
 baseline:{instances:1,sessions:1,sessionsWithCredentials:1,webhooks:1,migrations:57,migrationHash:hash},
 restored:{metadata:{instances:1,sessions:1,credsPresent:1,webhooks:1,migrations:57},migrationHash:hash,keyspace:[{db:0,keys:3,expiring:0}]},
 captured:[{db:0,keys:3,expiring:0}],
};}
test('checkpoint acceptance binds restored migration identity, tenant metadata and captured Redis keyspace',()=>{
 const f=checkpoint();assert.doesNotThrow(()=>assertCheckpointMatches(f.baseline,f.restored,f.captured));
 for(const mutate of [
  x=>{x.restored.metadata.migrations=56},x=>{x.restored.migrationHash='b'.repeat(64)},x=>{x.restored.metadata.webhooks=0},
  x=>{x.restored.metadata.sessions=0},x=>{x.restored.metadata.credsPresent=0},x=>{x.restored.metadata.instances=2},
  x=>{x.restored.keyspace[0].keys=4},x=>{x.restored.keyspace[0].db=1},x=>{x.restored.keyspace[0].expiring=1},
  x=>{x.restored.keyspace.push({...x.restored.keyspace[0]})},x=>{x.restored.metadata.migrations=NaN},
 ]){const x=checkpoint();mutate(x);assert.throws(()=>assertCheckpointMatches(x.baseline,x.restored,x.captured),/RESTORED_CHECKPOINT_MISMATCH/);}
});
