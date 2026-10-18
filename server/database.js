import {CARS} from '../src/car-catalog.js';
import {neon} from '@neondatabase/serverless';

const timestamps=['created','expires','start_at','joined','seen','track_length','created_at','expires_at','finished_at','updated_at'];
function normalize(row){
 if(!row)return null;
 for(const key of timestamps)if(typeof row[key]==='string')row[key]=Number(row[key]);
 return row;
}
function queryText(text){
 let n=0;
 return text.replace(/\?/g,()=>`$${++n}`).replace(/\b(rooms|players)\b/g,'breuer_gp.$1');
}

// Preserve the room protocol while using durable Postgres storage on Vercel.
export function postgresAdapter(sql){
 const results=values=>values.map(result=>({...result,rows:(result.rows||[]).map(normalize),meta:{changes:result.rowCount||0}}));
 const prepare=text=>({
  text:queryText(text),params:[],
  bind(...params){this.params=params;return this;},
  async first(){const result=await sql.query(this.text,this.params);return normalize(result.rows[0]);},
  async all(){const result=await sql.query(this.text,this.params);return {results:result.rows.map(normalize)};},
  async run(){
   let result;
   if(this.text.startsWith('INSERT INTO breuer_gp.players')&&this.text.includes('SELECT COUNT(*)')){
    // Lock first, then count in the next statement's fresh READ COMMITTED
    // snapshot. Concurrent joins cannot exceed the six-player room limit.
    const results=await sql.transaction([
     sql.query('SELECT code FROM breuer_gp.rooms WHERE code = $1 FOR UPDATE',[this.params[1]]),
     sql.query(this.text,this.params)
    ],{isolationLevel:'ReadCommitted',fullResults:true});
    result=results[1];
   }else result=await sql.query(this.text,this.params);
   return {meta:{changes:result.rowCount}};
  }
 });
 return {
  prepare,
  async batch(statements){return results(await sql.transaction(statements.map(s=>sql.query(s.text,s.params)),{fullResults:true}));},
  async roomTransaction(code,statements){
   const responses=await sql.transaction([
    sql.query('SELECT code FROM breuer_gp.rooms WHERE code = $1 FOR UPDATE',[code]),
    ...statements.map(s=>sql.query(s.text,s.params))
   ],{isolationLevel:'ReadCommitted',fullResults:true});
   return results(responses.slice(1));
  }
 };
}

export const SCHEMA=[
 'CREATE SCHEMA IF NOT EXISTS breuer_gp',
 'CREATE TABLE IF NOT EXISTS breuer_gp.rooms (code TEXT PRIMARY KEY, host_id TEXT NOT NULL, created BIGINT NOT NULL, expires BIGINT NOT NULL, start_at BIGINT NOT NULL DEFAULT 0)',
 `CREATE TABLE IF NOT EXISTS breuer_gp.players (id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES breuer_gp.rooms(code) ON DELETE CASCADE, name TEXT NOT NULL, car INTEGER NOT NULL CONSTRAINT breuer_car_catalog_v3 CHECK (car BETWEEN 0 AND ${CARS.length-1}), token_hash TEXT NOT NULL, joined BIGINT NOT NULL, seen BIGINT NOT NULL, state TEXT)`,
 'ALTER TABLE breuer_gp.players DROP CONSTRAINT IF EXISTS players_car_check',
 `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'breuer_gp.players'::regclass AND conname = 'breuer_car_catalog_v3') THEN ALTER TABLE breuer_gp.players ADD CONSTRAINT breuer_car_catalog_v3 CHECK (car BETWEEN 0 AND ${CARS.length-1}); END IF; END $$`,
 `ALTER TABLE breuer_gp.rooms ADD COLUMN IF NOT EXISTS config TEXT NOT NULL DEFAULT '{"trackId":"lammersdorf","laps":2,"difficulty":0.91,"opponents":5,"rules":"action","mode":"race","assist":true,"autoDrift":true}'`,
 'ALTER TABLE breuer_gp.rooms ADD COLUMN IF NOT EXISTS track_length DOUBLE PRECISION NOT NULL DEFAULT 1195.005720',
 "ALTER TABLE breuer_gp.rooms ADD COLUMN IF NOT EXISTS track_version TEXT NOT NULL DEFAULT 'legacy-v1'",
 'ALTER TABLE breuer_gp.rooms ADD COLUMN IF NOT EXISTS config_revision INTEGER NOT NULL DEFAULT 1',
 'ALTER TABLE breuer_gp.players ADD COLUMN IF NOT EXISTS ready BOOLEAN NOT NULL DEFAULT FALSE',
 'CREATE INDEX IF NOT EXISTS breuer_players_room ON breuer_gp.players (room, joined)',
 'CREATE INDEX IF NOT EXISTS breuer_rooms_expires ON breuer_gp.rooms (expires)',
 `CREATE TABLE IF NOT EXISTS breuer_gp.driver_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 20),
  name_key TEXT NOT NULL CHECK (char_length(name_key) BETWEEN 1 AND 160),
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at BIGINT NOT NULL
 )`,
 'CREATE UNIQUE INDEX IF NOT EXISTS breuer_profile_name_key ON breuer_gp.driver_profiles (name_key)',
 `CREATE TABLE IF NOT EXISTS breuer_gp.leaderboard_runs (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES breuer_gp.driver_profiles(id) ON DELETE CASCADE,
  run_token_hash TEXT,
  category_key TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL CHECK (expires_at > created_at),
  finished_at BIGINT,
  time DOUBLE PRECISION CHECK (time > 0 AND time <= 7200),
  sectors TEXT,
  result_hash TEXT,
  CONSTRAINT breuer_run_owner CHECK (profile_id IS NOT NULL OR run_token_hash IS NOT NULL),
  CONSTRAINT breuer_run_token_format CHECK (run_token_hash IS NULL OR run_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT breuer_completed_run_owner CHECK (finished_at IS NULL OR profile_id IS NOT NULL),
  CONSTRAINT breuer_run_completion CHECK (
   (finished_at IS NULL AND time IS NULL AND sectors IS NULL AND result_hash IS NULL)
   OR (finished_at IS NOT NULL AND time IS NOT NULL AND sectors IS NOT NULL AND result_hash IS NOT NULL)
  )
 )`,
 'ALTER TABLE breuer_gp.leaderboard_runs ADD COLUMN IF NOT EXISTS run_token_hash TEXT',
 'ALTER TABLE breuer_gp.leaderboard_runs ALTER COLUMN profile_id DROP NOT NULL',
 `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'breuer_gp.leaderboard_runs'::regclass AND conname = 'breuer_run_owner') THEN ALTER TABLE breuer_gp.leaderboard_runs ADD CONSTRAINT breuer_run_owner CHECK (profile_id IS NOT NULL OR run_token_hash IS NOT NULL); END IF; END $$`,
 `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'breuer_gp.leaderboard_runs'::regclass AND conname = 'breuer_run_token_format') THEN ALTER TABLE breuer_gp.leaderboard_runs ADD CONSTRAINT breuer_run_token_format CHECK (run_token_hash IS NULL OR run_token_hash ~ '^[a-f0-9]{64}$'); END IF; END $$`,
 `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'breuer_gp.leaderboard_runs'::regclass AND conname = 'breuer_completed_run_owner') THEN ALTER TABLE breuer_gp.leaderboard_runs ADD CONSTRAINT breuer_completed_run_owner CHECK (finished_at IS NULL OR profile_id IS NOT NULL); END IF; END $$`,
 `CREATE TABLE IF NOT EXISTS breuer_gp.leaderboard_records (
  category_key TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES breuer_gp.driver_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  time DOUBLE PRECISION NOT NULL CHECK (time > 0 AND time <= 7200),
  sectors TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES breuer_gp.leaderboard_runs(id),
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (category_key, profile_id)
 )`,
 'CREATE INDEX IF NOT EXISTS breuer_leaderboard_order ON breuer_gp.leaderboard_records (category_key, time, updated_at, profile_id)',
 'CREATE INDEX IF NOT EXISTS breuer_runs_profile ON breuer_gp.leaderboard_runs (profile_id, created_at DESC)',
 'CREATE INDEX IF NOT EXISTS breuer_runs_expiry ON breuer_gp.leaderboard_runs (expires_at) WHERE finished_at IS NULL'
];
// Cold Vercel processes must not take ALTER TABLE locks on an already migrated
// database. One catalog read is sufficient to check the current migrations.
export const SCHEMA_READY=`SELECT
 to_regclass('breuer_gp.rooms') IS NOT NULL
 AND to_regclass('breuer_gp.players') IS NOT NULL
 AND to_regclass('breuer_gp.breuer_players_room') IS NOT NULL
 AND to_regclass('breuer_gp.breuer_rooms_expires') IS NOT NULL
 AND to_regclass('breuer_gp.driver_profiles') IS NOT NULL
 AND to_regclass('breuer_gp.leaderboard_runs') IS NOT NULL
 AND to_regclass('breuer_gp.leaderboard_records') IS NOT NULL
 AND to_regclass('breuer_gp.breuer_profile_name_key') IS NOT NULL
 AND to_regclass('breuer_gp.breuer_leaderboard_order') IS NOT NULL
 AND to_regclass('breuer_gp.breuer_runs_profile') IS NOT NULL
 AND to_regclass('breuer_gp.breuer_runs_expiry') IS NOT NULL
 AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('breuer_gp.leaderboard_runs') AND attname = 'profile_id' AND NOT attnotnull AND attnum > 0 AND NOT attisdropped)
 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('breuer_gp.leaderboard_runs') AND conname = 'breuer_run_owner' AND contype = 'c' AND convalidated)
 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('breuer_gp.leaderboard_runs') AND conname = 'breuer_run_token_format' AND contype = 'c' AND convalidated)
 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('breuer_gp.leaderboard_runs') AND conname = 'breuer_completed_run_owner' AND contype = 'c' AND convalidated)
 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('breuer_gp.players') AND conname = 'breuer_car_catalog_v3' AND contype = 'c' AND convalidated)
 AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('breuer_gp.players') AND conname = 'players_car_check')
 AND NOT EXISTS (
  SELECT 1 FROM (VALUES ('rooms','config'),('rooms','track_length'),('rooms','track_version'),('rooms','config_revision'),('players','ready'),('driver_profiles','name_key'),('driver_profiles','token_hash'),('driver_profiles','created_at'),('leaderboard_runs','category_key'),('leaderboard_runs','finished_at'),('leaderboard_runs','result_hash'),('leaderboard_runs','run_token_hash'),('leaderboard_records','category_key'),('leaderboard_records','run_id'),('leaderboard_records','updated_at')) AS required(table_name,column_name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('breuer_gp.' || required.table_name) AND attname = required.column_name AND attnum > 0 AND NOT attisdropped)
 ) AS ready`;

export async function initializeDatabase(sql){
 if((await sql.query(SCHEMA_READY)).rows[0]?.ready)return;
 // Serialize first-time/bootstrap migrations from independently cold instances.
 await sql.transaction([
  sql.query('SELECT pg_advisory_xact_lock(178514, 1)'),
  ...SCHEMA.map(query=>sql.query(query))
 ]);
}
let database,initialization;
export async function getDatabase(){
 const connection=process.env.DATABASE_URL||process.env.POSTGRES_URL;
 if(!connection)return null;
 if(database)return database;
 if(!initialization)initialization=(async()=>{
  const sql=neon(connection,{fullResults:true});
  await initializeDatabase(sql);
  database=postgresAdapter(sql);
  return database;
 })().catch(error=>{initialization=null;throw error;});
 return initialization;
}
