#!/usr/bin/env node
// Writes DATABASE_URL into apps/api/.env without opening an editor.
// Uses the Session pooler URL saved by `supabase link` (or asks for it), asks for the database password
// (hidden while typing), escapes the password for use in a URL, and saves it.
// Run from the repo root: pnpm setup:db
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const ENV_PATH = 'apps/api/.env';
const EXAMPLE_PATH = 'apps/api/.env.example';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const writeToOutput = rl._writeToOutput.bind(rl);
rl._writeToOutput = (text) => {
  // While muted, show nothing that is typed (the password).
  if (!muted) writeToOutput(text);
};

const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value = '' } = await lines.next();
  if (muted) process.stdout.write('\n');
  muted = false;
  return value.trim();
}

if (!existsSync(ENV_PATH)) {
  copyFileSync(EXAMPLE_PATH, ENV_PATH);
}

// `supabase link` saves the project's Session pooler URL here (no password).
const POOLER_URL_PATH = 'supabase/.temp/pooler-url';
let template = existsSync(POOLER_URL_PATH) ? readFileSync(POOLER_URL_PATH, 'utf8').trim() : '';
if (template) {
  console.log(`\nUsing the connection details saved by "supabase link" (${POOLER_URL_PATH}).`);
} else {
  console.log('\nIn the Supabase dashboard: Connect -> Session pooler -> copy the connection string.');
  template = await ask('Paste the connection string here and press Enter:\n> ');
}

let url;
try {
  url = new URL(template.replace('[YOUR-PASSWORD]', 'placeholder'));
} catch {
  console.error('\nThat does not look like a connection string. It should start with postgresql://');
  process.exit(1);
}
if (!/^postgres(ql)?:$/.test(url.protocol) || !url.hostname.includes('pooler.supabase.com')) {
  console.error('\nPlease use the "Session pooler" string (host ends in pooler.supabase.com).');
  process.exit(1);
}

const password = await ask('Type your database password (it will not be shown) and press Enter: ', {
  hidden: true,
});
if (!password) {
  console.error('No password entered. Nothing was changed.');
  process.exit(1);
}

url.password = encodeURIComponent(password);
const line = `DATABASE_URL=${url.toString()}`;

const env = readFileSync(ENV_PATH, 'utf8');
const updated = /^DATABASE_URL=.*$/m.test(env)
  ? env.replace(/^DATABASE_URL=.*$/m, () => line)
  : `${env.trimEnd()}\n${line}\n`;
writeFileSync(ENV_PATH, updated, { mode: 0o600 });
rl.close();

console.log(`\nSaved DATABASE_URL to ${ENV_PATH} (host ${url.hostname}). Next: pnpm dev:api`);
