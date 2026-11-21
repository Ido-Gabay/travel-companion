#!/usr/bin/env node
// D1 preview: a local database on this Mac with every migration (including
// D1), so the new app and API can be tried before anything is deployed.
// Your real Supabase data is never touched. Sign-in still uses your normal
// Supabase account; trips start empty here.
//
//   pnpm db:preview            start (keeps data in .preview-db/ between runs)
//   pnpm db:preview --reset    start from an empty database
//
// Then, in other terminals:
//   DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DATABASE_SSL=disable DATABASE_POOL_MAX=1 pnpm dev:api
//   EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm ios
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(ROOT, '.preview-db');
const PORT = 54329;
// PGlite is a dev dependency of the API (tests); reuse it.
const require = createRequire(resolve(ROOT, 'apps/api/package.json'));
const { PGlite } = await import(require.resolve('@electric-sql/pglite'));

if (process.argv.includes('--reset')) rmSync(DATA_DIR, { recursive: true, force: true });
const fresh = !existsSync(DATA_DIR);
const db = new PGlite(DATA_DIR);

if (fresh) {
  // The parts of Supabase the migrations rely on.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key);
  `);
}

// Apply any migration not applied yet (so new ones are picked up on restart).
const dir = resolve(ROOT, 'supabase/migrations');
const applied = new Set((await db.query('select version from supabase_migrations.schema_migrations')).rows.map((row) => row.version));
for (const name of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) {
  const version = name.slice(0, 14);
  if (applied.has(version)) continue;
  await db.exec('begin');
  try {
    await db.exec(readFileSync(resolve(dir, name), 'utf8'));
    await db.query('insert into supabase_migrations.schema_migrations (version) values ($1)', [version]);
    await db.exec('commit');
    console.log(`applied ${name}`);
  } catch (error) {
    await db.exec('rollback');
    console.error(`migration ${name} failed: ${error.message}`);
    process.exit(1);
  }
}

if (fresh) {
  // Preview only: whoever signs in gets their auth row here on first use
  // (the real one lives in Supabase Auth).
  await db.exec(`
    create function auth.preview_user() returns trigger language plpgsql security definer set search_path = '' as $$
    begin
      insert into auth.users (id) values (new.id) on conflict do nothing;
      return new;
    end $$;
    create trigger preview_user before insert on app.profiles for each row execute function auth.preview_user();
  `);
}

// Minimal Postgres wire bridge (one PGlite session: use DATABASE_POOL_MAX=1).
const server = createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let started = false;
  let queue = Promise.resolve();
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const messages = [];
    for (;;) {
      if (!started) {
        if (buffer.length < 8) break;
        const length = buffer.readInt32BE(0);
        if (buffer.length < length) break;
        const code = buffer.readInt32BE(4);
        const message = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        if (code === 80877103) {
          socket.write('N');
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
        const reply = await db.execProtocolRaw(payload);
        if (reply.length > 0 && !socket.destroyed) socket.write(Buffer.from(reply));
      })
      .catch(() => socket.destroy());
  });
  socket.on('error', () => undefined);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nPreview database ready on 127.0.0.1:${PORT} (data in .preview-db/). Ctrl+C to stop.\n`);
  console.log('API (new terminal):');
  console.log(`  DATABASE_URL=postgres://postgres@127.0.0.1:${PORT}/postgres DATABASE_SSL=disable DATABASE_POOL_MAX=1 pnpm dev:api\n`);
  console.log('App (new terminal):');
  console.log('  EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm ios\n');
});
const stop = async () => {
  server.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
