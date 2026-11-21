import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';

/**
 * Database test harness (D1). A fresh Postgres per test — in-memory PGlite by
 * default, or a database on the server in TEST_DATABASE_URL (CI: PostgreSQL 17)
 * — with a minimal Supabase shim (roles, auth.users, auth.uid(), migration
 * history), then the repository's real migrations from supabase/migrations.
 * Excluded from the production build (tsconfig.build.json: src/testing).
 */

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '../../../..');
export const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase/migrations');
export const D1_VERSION = '20261118150000';
export const D1_DOWN_SCRIPT = resolve(REPO_ROOT, 'docs/d1/20261118150000_d1_visits_and_stays.down.sql');

// Cluster-wide roles: created once per server (idempotent; PGlite and PostgreSQL 17).
const SUPABASE_ROLES = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
`;

// Per-database parts of the Supabase environment the migrations rely on.
const SUPABASE_SHIM = `
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key);
`;

export function migrationFiles(): { version: string; file: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ version: name.slice(0, 14), file: resolve(MIGRATIONS_DIR, name) }));
}

export interface QueryResult<T> {
  rows: T[];
  affectedRows?: number;
}

/**
 * One test database. Two engines behind the same interface:
 * - default: PGlite, in memory (fast, no server; Postgres 18);
 * - TEST_DATABASE_URL set: a fresh database on that PostgreSQL server (CI runs
 *   PostgreSQL 17, the production version), dropped again by closeAll().
 */
export interface TestDb {
  readonly engine: 'pglite' | 'postgres';
  /** One statement, with $1.. parameters. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Any number of statements, no parameters. */
  exec(sql: string): Promise<void>;
  /** A connection string for this database, for API service tests (postgres.js, pool size 1). */
  url(): Promise<string>;
  close(): Promise<void>;
}

const open = new Set<TestDb>();
const cleanups: (() => Promise<void>)[] = [];

/** Work to run before the databases close (e.g. ending API connection pools). */
export function onCloseAll(cleanup: () => Promise<void>): void {
  cleanups.push(cleanup);
}

/** Closes (and, on a server, drops) every database created by createDatabase. Call in afterEach/afterAll. */
export async function closeAll(): Promise<void> {
  for (const cleanup of cleanups.splice(0)) await cleanup().catch(() => undefined);
  const dbs = [...open];
  open.clear();
  await Promise.all(dbs.map((db) => db.close().catch(() => undefined)));
}

/**
 * A fresh database with migrations applied up to and including `until`
 * (default: all). Each migration runs in its own transaction, as on Supabase.
 */
export async function createDatabase(options: { until?: string } = {}): Promise<TestDb> {
  const db = process.env.TEST_DATABASE_URL ? await openServerDatabase(process.env.TEST_DATABASE_URL) : openPglite();
  open.add(db);
  if (db.engine === 'pglite') await db.exec(SUPABASE_ROLES);
  await db.exec(SUPABASE_SHIM);
  for (const migration of migrationFiles()) {
    if (options.until && migration.version > options.until) break;
    await applyMigration(db, migration.version, readFileSync(migration.file, 'utf8'));
  }
  return db;
}

function openPglite(): TestDb {
  const pg = new PGlite();
  let server: Server | null = null;
  return {
    engine: 'pglite',
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pg.query<T>(sql, params);
      return { rows: result.rows, affectedRows: result.affectedRows };
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    async url() {
      server ??= await serveWireProtocol(pg);
      const address = server.address() as AddressInfo;
      return `postgres://postgres@127.0.0.1:${address.port}/postgres`;
    },
    async close() {
      if (server) await new Promise<void>((done) => server!.close(() => done()));
      await pg.close();
    },
  };
}

/**
 * Lets a real postgres.js client (the API's driver) talk to an in-memory
 * PGlite: a minimal Postgres wire-protocol bridge on 127.0.0.1. PGlite is a
 * single session, so clients must use one connection (pool max 1).
 */
async function serveWireProtocol(pg: PGlite): Promise<Server> {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let started = false;
    let queue = Promise.resolve();
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const messages: Buffer[] = [];
      for (;;) {
        if (!started) {
          if (buffer.length < 8) break;
          const length = buffer.readInt32BE(0);
          if (buffer.length < length) break;
          const code = buffer.readInt32BE(4);
          const message = buffer.subarray(0, length);
          buffer = buffer.subarray(length);
          if (code === 80877103) {
            socket.write('N'); // SSLRequest: no TLS on the loopback bridge.
            continue;
          }
          started = true;
          messages.push(message);
          continue;
        }
        if (buffer.length < 5) break;
        const length = buffer.readInt32BE(1);
        if (buffer.length < length + 1) break;
        const message = buffer.subarray(0, length + 1);
        buffer = buffer.subarray(length + 1);
        // Terminate ('X'): close this client only; the PGlite session serves the next one.
        if (message[0] === 0x58) {
          socket.end();
          continue;
        }
        messages.push(message);
      }
      if (messages.length === 0) return;
      const payload = new Uint8Array(Buffer.concat(messages));
      queue = queue
        .then(async () => {
          const reply = await pg.execProtocolRaw(payload);
          if (reply.length > 0 && !socket.destroyed) socket.write(Buffer.from(reply));
        })
        .catch(() => {
          socket.destroy();
        });
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  return server;
}

const PG_OPTIONS = {
  max: 1,
  onnotice: () => undefined,
  // Match PGlite: bigint (count(*), etc.) as a number.
  types: {
    bigint: { to: 20, from: [20], parse: (value: string) => Number(value), serialize: (value: number) => String(value) },
    // postgres.js turns timestamp strings into a JS Date (milliseconds); keep fixture microseconds exact.
    date: {
      to: 1184,
      from: [1082, 1114, 1184],
      parse: (value: string) => new Date(value),
      serialize: (value: Date | string) => (value instanceof Date ? value.toISOString() : String(value)),
    },
  },
};

let databaseCounter = 0;

async function openServerDatabase(serverUrl: string): Promise<TestDb> {
  const name = `tc_test_${process.pid}_${++databaseCounter}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => undefined });
  try {
    // Roles are cluster-wide; serialize their creation across parallel workers.
    await admin.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(424242)`;
      await tx.unsafe(SUPABASE_ROLES);
    });
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();
  const client = postgres(databaseUrl, PG_OPTIONS);
  return {
    engine: 'postgres',
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await client.unsafe(sql, params as never[]);
      return { rows: [...result] as T[], affectedRows: result.count };
    },
    async exec(sql) {
      await client.unsafe(sql);
    },
    async url() {
      return databaseUrl;
    },
    async close() {
      await client.end({ timeout: 5 });
      const cleanup = postgres(serverUrl, { max: 1, onnotice: () => undefined });
      try {
        await cleanup.unsafe(`drop database if exists "${name}" with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

export async function applyMigration(db: TestDb, version: string, sql: string): Promise<void> {
  await db.exec('begin');
  try {
    await db.exec(sql);
    await db.query('insert into supabase_migrations.schema_migrations (version) values ($1)', [version]);
    await db.exec('commit');
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

/** Applies the D1 migration to a database that has everything before it. */
export async function applyD1(db: TestDb): Promise<void> {
  const d1 = migrationFiles().find((m) => m.version === D1_VERSION);
  if (!d1) throw new Error('D1 migration file not found');
  await applyMigration(db, d1.version, readFileSync(d1.file, 'utf8'));
}

/** Runs the reviewed D1 rollback script in one transaction. */
export async function runD1Down(db: TestDb, force = false): Promise<void> {
  await db.exec('begin');
  try {
    if (force) await db.exec(`set local app.d1_down_force = 'on'`);
    await db.exec(readFileSync(D1_DOWN_SCRIPT, 'utf8'));
    await db.exec('commit');
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

/**
 * Runs `work` as a signed-in user, the way the API does (DatabaseService.asUser):
 * JWT claims in settings, role `authenticated`, so row-level security applies.
 * Always rolled back unless `commit` is set.
 */
export async function asUser<T>(
  db: TestDb,
  userId: string,
  work: (tx: TestDb) => Promise<T>,
  options: { commit?: boolean } = {},
): Promise<T> {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
      userId,
    ]);
    await db.exec('set local role authenticated');
    const result = await work(db);
    await db.exec(options.commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

export async function rows<T = Record<string, unknown>>(db: TestDb, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function scalar<T = unknown>(db: TestDb, sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const first = result.rows[0];
  if (!first) throw new Error(`no row: ${sql}`);
  return Object.values(first)[0] as T;
}

/**
 * A stable fingerprint of every legacy table's original columns (D1 adds
 * columns but must not change a single existing value, version or timestamp).
 */
export async function legacyFingerprint(db: TestDb): Promise<Record<string, string>> {
  // Places the D1 backfill created (hotels) are additions, checked separately; excluded here once D1 exists.
  const createdByD1 = (await scalar<string | null>(db, `select to_regclass('app.d1_backfill_created_places')::text`)) !== null;
  const queries: Record<string, string> = {
    profiles: `select md5(coalesce(string_agg(row(id, display_name, created_at, updated_at, version, deleted_at)::text, '|' order by id), '')) from app.profiles`,
    user_preferences: `select md5(coalesce(string_agg(row(user_id, locale, distance_unit, created_at, updated_at, version)::text, '|' order by user_id), '')) from app.user_preferences`,
    trips: `select md5(coalesce(string_agg(row(id, owner_id, title, destination, start_date, end_date, base_location, base_google_place_id, created_at, updated_at, version, deleted_at)::text, '|' order by id), '')) from app.trips`,
    places: `select md5(coalesce(string_agg(row(id, owner_id, google_place_id, name, address, notes, category, tags, visited_at, my_label, created_at, updated_at, version, deleted_at)::text, '|' order by id), '')) from app.places
             ${createdByD1 ? 'where id not in (select place_id from app.d1_backfill_created_places)' : ''}`,
    trip_places: `select md5(coalesce(string_agg(row(id, owner_id, trip_id, place_id, day, start_time, position, duration_minutes, highlight, created_at, updated_at, version, deleted_at)::text, '|' order by id), '')) from app.trip_places`,
    trip_journal_days: `select md5(coalesce(string_agg(row(id, owner_id, trip_id, day, note, rating, created_at, updated_at, version)::text, '|' order by id), '')) from app.trip_journal_days`,
    provider_usage: `select md5(coalesce(string_agg(row(day, metric, count)::text, '|' order by day, metric), '')) from app.provider_usage`,
  };
  const out: Record<string, string> = {};
  for (const [table, sql] of Object.entries(queries)) out[table] = await scalar<string>(db, sql);
  return out;
}

/** Schema shape of the app schema (columns, constraints, indexes, policies, triggers, views). */
export async function schemaFingerprint(db: TestDb): Promise<string[]> {
  const result = await rows<{ item: string }>(
    db,
    `select item from (
       select 'column ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') as item
       from information_schema.columns where table_schema = 'app'
       union all select 'constraint ' || conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
       from pg_constraint where connamespace = 'app'::regnamespace and contype <> 'n'
       union all select 'index ' || indexname || ' ' || indexdef from pg_indexes where schemaname = 'app'
       union all select 'policy ' || tablename || '.' || policyname from pg_policies where schemaname = 'app'
       union all select 'trigger ' || tgrelid::regclass::text || ' ' || tgname from pg_trigger
       where not tgisinternal and tgrelid::regclass::text like 'app.%'
       union all select 'view ' || table_name from information_schema.views where table_schema = 'app'
       union all select 'function ' || proname from pg_proc where pronamespace = 'app'::regnamespace
       union all select 'comment ' || c.relname || ' ' || coalesce(obj_description(c.oid, 'pg_class'), '')
       from pg_class c where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'v')
       union all select 'colcomment ' || c.relname || '.' || a.attname || ' ' || coalesce(col_description(c.oid, a.attnum), '')
       from pg_class c join pg_attribute a on a.attrelid = c.oid
       where c.relnamespace = 'app'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     ) s order by item`,
  );
  return result.map((row) => row.item);
}
