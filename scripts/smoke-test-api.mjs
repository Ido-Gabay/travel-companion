#!/usr/bin/env node
// End-to-end check of the running API with a real Supabase user.
// Signs in through Supabase Auth, then calls the API with the access token.
// Run from the repo root while `pnpm dev:api` is running: pnpm smoke:api
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ENV_PATH = 'apps/api/.env';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const writeToOutput = rl._writeToOutput.bind(rl);
rl._writeToOutput = (text) => {
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

function fail(message) {
  console.error(`\n${message}`);
  rl.close();
  process.exit(1);
}

const env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
const supabaseUrl = env.match(/^SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/\/+$/, '');
if (!supabaseUrl || supabaseUrl.includes('YOUR-PROJECT-REF')) {
  fail(`SUPABASE_URL is not set in ${ENV_PATH}.`);
}

console.log('\nYou need the publishable key: Supabase dashboard -> Project Settings -> API Keys');
console.log('(starts with sb_publishable_). It is a public key, safe to paste.\n');
const publishableKey = await ask('Publishable key: ');
const email = await ask('Test user email: ');
const password = await ask('Test user password (not shown): ', { hidden: true });
rl.close();

// 1. Sign in with Supabase Auth.
const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const auth = await authRes.json().catch(() => ({}));
if (!authRes.ok || !auth.access_token) {
  const reason = auth.msg ?? auth.error_description ?? auth.message ?? `HTTP ${authRes.status}`;
  fail(
    `Sign-in failed: ${reason}\n` +
      'Create the user in the dashboard: Authentication -> Users -> Add user -> Create new user,\n' +
      'tick "Auto Confirm User", then run this again.',
  );
}
console.log(`\nSigned in as ${email}. Calling ${API_URL} ...\n`);

const token = auth.access_token;
let failures = 0;

async function step(name, method, path, body, check) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((error) => fail(`Could not reach the API at ${API_URL}: ${error.message}. Is pnpm dev:api running?`));
  const json = await res.json().catch(() => null);
  let ok = false;
  try {
    ok = check(res.status, json);
  } catch {
    ok = false;
  }
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${method} ${path}  -> ${res.status}  ${name}`);
  if (!ok) console.log(`      response: ${JSON.stringify(json)}`);
  return json;
}

await step('profile loads', 'GET', '/v1/me', null, (s, j) => s === 200 && j.email === email);
await step('switch language to Hebrew', 'PATCH', '/v1/me/preferences', { locale: 'he' }, (s, j) => s === 200 && j.locale === 'he');
await step('preference was saved', 'GET', '/v1/me/preferences', null, (s, j) => s === 200 && j.locale === 'he');
await step('switch back to English', 'PATCH', '/v1/me/preferences', { locale: 'en' }, (s, j) => s === 200 && j.locale === 'en');
await step('invalid language is rejected', 'PATCH', '/v1/me/preferences', { locale: 'xx' }, (s, j) => s === 400 && j.error.code === 'VALIDATION_FAILED');
await step('trips list loads', 'GET', '/v1/trips', null, (s, j) => s === 200 && Array.isArray(j.items));
await step('usage report (cost monitoring)', 'GET', '/v1/usage', null, (s, j) => s === 200 && j.items.length === 6 && j.items.every((i) => i.monthlyCap >= 0 && (i.freePerMonth === null || i.monthlyCap <= i.freePerMonth)));
await step('a bad hotel pin is rejected', 'POST', '/v1/trips', { title: 'x', basePlaceId: 'bad id!' }, (s, j) => s === 400 && j.error.code === 'VALIDATION_FAILED');
await step('trip without a title is rejected', 'POST', '/v1/trips', { title: '  ' }, (s, j) => s === 400 && j.error.code === 'VALIDATION_FAILED');

// Trips + places round trip. Everything created here is deleted at the end.
const trip = await step('create a trip', 'POST', '/v1/trips', { title: 'Smoke test trip', startDate: '2026-11-23', endDate: '2026-11-29' }, (s, j) => s === 201 && j.placeCount === 0);
const place = await step('save a place with notes', 'POST', '/v1/places', { name: 'Smoke test place', notes: 'Line one\nLine two' }, (s, j) => s === 201 && j.notes === 'Line one\nLine two');
if (trip?.id && place?.id) {
  await step('edit the place', 'PATCH', `/v1/places/${place.id}`, { address: 'Somewhere 1' }, (s, j) => s === 200 && j.address === 'Somewhere 1' && j.notes !== null);
  await step('edit the trip (staying at + dates)', 'PATCH', `/v1/trips/${trip.id}`, { baseLocation: 'Midtown Manhattan', endDate: '2026-11-30' }, (s, j) => s === 200 && j.baseLocation === 'Midtown Manhattan' && j.endDate === '2026-11-30' && j.startDate === '2026-11-23');
  await step('reversed dates are rejected', 'PATCH', `/v1/trips/${trip.id}`, { endDate: '2026-11-01' }, (s, j) => s === 400 && j.error.code === 'VALIDATION_FAILED');
  await step('add the place to the trip', 'POST', `/v1/trips/${trip.id}/places`, { placeId: place.id }, (s, j) => s === 200 && j.places.length === 1 && j.placeCount === 1);
  await step('adding it again changes nothing', 'POST', `/v1/trips/${trip.id}/places`, { placeId: place.id }, (s, j) => s === 200 && j.places.length === 1);
  await step('trip detail lists the place', 'GET', `/v1/trips/${trip.id}`, null, (s, j) => s === 200 && j.places[0]?.id === place.id);
  await step('place knows it is in 1 trip', 'GET', `/v1/places/${place.id}`, null, (s, j) => s === 200 && j.tripCount === 1);
  await step('new trip place is on the wishlist', 'GET', `/v1/trips/${trip.id}`, null, (s, j) => s === 200 && j.places[0]?.day === null && j.places[0]?.startTime === null);
  await step('plan it for Nov 24 at 09:30', 'PATCH', `/v1/trips/${trip.id}/places/${place.id}`, { day: '2026-11-24', startTime: '09:30' }, (s, j) => s === 200 && j.places[0]?.day === '2026-11-24' && j.places[0]?.startTime === '09:30' && j.places[0]?.position === 0);
  await step('plan a 45-minute visit', 'PATCH', `/v1/trips/${trip.id}/places/${place.id}`, { durationMinutes: 45 }, (s, j) => s === 200 && j.places[0]?.durationMinutes === 45 && j.places[0]?.day === '2026-11-24');
  await step('a day outside the trip is rejected', 'PATCH', `/v1/trips/${trip.id}/places/${place.id}`, { day: '2026-12-15' }, (s, j) => s === 400 && j.error.code === 'VALIDATION_FAILED');
  await step('reorder the day', 'PUT', `/v1/trips/${trip.id}/days/2026-11-24/order`, { placeIds: [place.id] }, (s, j) => s === 200 && j.places[0]?.position === 0);
  await step('a stale reorder is a conflict', 'PUT', `/v1/trips/${trip.id}/days/2026-11-25/order`, { placeIds: [place.id] }, (s, j) => s === 409 && j.error.code === 'CONFLICT');
  // D1 Q5: dates that would leave a planned place outside are refused, never applied silently.
  await step('shorter dates with a planned place are refused', 'PATCH', `/v1/trips/${trip.id}`, { endDate: '2026-11-23' }, (s, j) => s === 400 && j.error.code === 'VALIDATION_FAILED');
  await step('move it back to the wishlist', 'PATCH', `/v1/trips/${trip.id}/places/${place.id}`, { day: null }, (s, j) => s === 200 && j.places[0]?.day === null);
  await step('now the shorter dates apply', 'PATCH', `/v1/trips/${trip.id}`, { endDate: '2026-11-23' }, (s, j) => s === 200 && j.endDate === '2026-11-23');
  await step('it is on the wishlist, time cleared', 'GET', `/v1/trips/${trip.id}`, null, (s, j) => s === 200 && j.places[0]?.day === null && j.places[0]?.startTime === null);
  await step('remove the place from the trip', 'DELETE', `/v1/trips/${trip.id}/places/${place.id}`, null, (s, j) => s === 200 && j.places.length === 0);
  await step('unknown trip id is 404', 'GET', '/v1/trips/00000000-0000-4000-8000-000000000000', null, (s, j) => s === 404 && j.error.code === 'NOT_FOUND');
  await step('malformed id is rejected', 'GET', '/v1/trips/not-a-uuid', null, (s, j) => s === 400 && j.error.code === 'VALIDATION_FAILED');
  await step('delete the place (cleanup)', 'DELETE', `/v1/places/${place.id}`, null, (s) => s === 204);
  await step('delete the trip (cleanup)', 'DELETE', `/v1/trips/${trip.id}`, null, (s) => s === 204);
  await step('deleted trip is gone', 'GET', `/v1/trips/${trip.id}`, null, (s) => s === 404);
}

// D1 · API v2: visits, lifecycle, stays, time zone suggestions. Everything is deleted at the end.
const v2trip = await step('v2: create a trip (v1) with "Staying at"', 'POST', '/v1/trips', { title: 'Smoke v2 trip', baseLocation: 'Pod Times Square', startDate: '2026-11-23', endDate: '2026-11-29' }, (s) => s === 201);
const v2place = await step('v2: a custom place with my own pin', 'POST', '/v1/places', { name: 'Smoke pin', latitude: 40.758, longitude: -73.9855 }, (s, j) => s === 201 && j.latitude === 40.758 && j.source === 'custom');
if (v2trip?.id && v2place?.id) {
  const t = `/v2/trips/${v2trip.id}`;
  await step('v2: the "Staying at" text became a whole-trip stay', 'GET', t, null, (s, j) => s === 200 && j.stays.length === 1 && j.stays[0].label === 'Pod Times Square' && j.stays[0].checkIn === null && !('baseLocation' in j.trip));
  const saved = await step('v2: save the place to the trip', 'POST', `${t}/places`, { placeId: v2place.id }, (s, j) => s === 200 && j.places.length === 1 && j.stops.length === 0);
  const tripPlaceId = saved?.places?.[0]?.tripPlaceId;
  const first = await step('v2: a visit on Nov 24 (zone from my pin)', 'POST', `${t}/stops`, { tripPlaceId, day: '2026-11-24', startTime: '10:00' }, (s, j) => s === 201 && j.stop.status === 'planned' && j.stop.timeZone === 'America/New_York');
  await step('v2: a second visit to the same place', 'POST', `${t}/stops`, { tripPlaceId, day: '2026-11-27' }, (s, j) => s === 201 && j.stop.id !== first?.stop?.id);
  await step('v1 still reads one visit (the earliest)', 'GET', `/v1/trips/${v2trip.id}`, null, (s, j) => s === 200 && j.places[0]?.day === '2026-11-24' && j.places[0]?.startTime === '10:00');
  await step('v1 can\'t move a place with two visits (needs the newer app)', 'PATCH', `/v1/trips/${v2trip.id}/places/${v2place.id}`, { day: '2026-11-25' }, (s, j) => s === 409 && j.error.code === 'CONFLICT');
  if (first?.stop?.id) {
    const stop = `${t}/stops/${first.stop.id}`;
    await step('v2: arrive', 'POST', `${stop}/arrive`, null, (s, j) => s === 200 && j.stop.status === 'in_progress' && j.stop.arrivedAt !== null);
    await step('v2: done', 'POST', `${stop}/complete`, null, (s, j) => s === 200 && j.stop.status === 'completed' && j.stop.completionSource === 'user');
    await step('v2: done again is a no-op', 'POST', `${stop}/complete`, null, (s, j) => s === 200 && j.stop.status === 'completed');
    await step('v2: a done visit cannot be skipped', 'POST', `${stop}/skip`, null, (s, j) => s === 409 && j.error.code === 'INVALID_TRANSITION');
    await step('v2: the place history has the visit', 'GET', `/v1/places/${v2place.id}/visits`, null, (s, j) => s === 200 && j.items.some((v) => v.stopId === first.stop.id));
    await step('v2: shorter dates are refused with the visits outside', 'PATCH', t, { endDate: '2026-11-25' }, (s, j) => s === 409 && j.error.code === 'STOPS_OUTSIDE_DATES' && j.error.details.length === 1);
  }
  await step('v2: a stay for some nights', 'POST', `${t}/stays`, { label: 'Brooklyn loft', checkIn: '2026-11-25', checkOut: '2026-11-27' }, (s, j) => s === 201 && j.stay.label === 'Brooklyn loft');
  await step('v2: overlapping nights are refused', 'POST', `${t}/stays`, { label: 'Other', checkIn: '2026-11-26', checkOut: '2026-11-28' }, (s, j) => s === 409 && j.error.code === 'STAY_OVERLAP');
  await step('time zone suggestion (nothing stored)', 'POST', '/v1/timezones/lookup', { latitude: 40.758, longitude: -73.9855 }, (s, j) => s === 200 && j.timeZone === 'America/New_York' && j.certain === true);
  await step('v2: set the trip zone (confirmed by me)', 'PATCH', t, { timeZone: 'America/New_York' }, (s, j) => s === 200 && j.timeZone === 'America/New_York' && j.timeZoneSource === 'user');
  await step('v2: delete the trip and its history (cleanup)', 'DELETE', `${t}?deleteHistory=1`, null, (s) => s === 204);
  await step('delete the pin place (cleanup)', 'DELETE', `/v1/places/${v2place.id}`, null, (s) => s === 204);
}

// Discovery (AI + Google Places). Skipped when the server has no Google key.
const discoverTrip = await step('create a trip for discovery', 'POST', '/v1/trips', { title: 'Smoke discovery trip', destination: 'New York' }, (s) => s === 201);
const interp = await step('AI interprets a request', 'POST', '/v1/discover/interpret', { query: 'coffee shops in SoHo', tripId: discoverTrip?.id }, (s, j) => s === 200 && (j.action === 'search' || j.action === 'clarify'));
if (interp?.action === 'search') console.log(`      interpreted by ${interp.interpretedBy}: "${interp.summary}" -> ${JSON.stringify(interp.plan)}`);
if (interp?.action === 'search' && discoverTrip?.id) {
  const res = await fetch(`${API_URL}/v1/discover/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: interp.plan, tripId: discoverTrip.id }),
  });
  const found = await res.json().catch(() => null);
  if (res.status === 503 && found?.error?.code === 'NOT_CONFIGURED') {
    console.log('SKIP  POST /v1/discover/search  -> 503  Google Places key not set on the server');
  } else {
    const ok = res.status === 200 && Array.isArray(found?.results) && found.results.length > 0;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  POST /v1/discover/search  -> ${res.status}  Google returns real places (${found?.results?.length ?? 0})`);
    if (!ok) console.log(`      response: ${JSON.stringify(found)}`);
    const first = found?.results?.[0];
    if (ok && first) {
      console.log(`      first result: ${first.name} (${first.address ?? 'no address'})`);
      const saved = await step('save it to collection + trip', 'POST', '/v1/places/google', { items: [{ googlePlaceId: first.placeId, category: interp.plan.category }], tripId: discoverTrip.id }, (s, j) => s === 201 && j.places[0]?.source === 'google' && j.places[0]?.name === null);
      await step('saving again does not duplicate', 'POST', '/v1/places/google', { items: [{ googlePlaceId: first.placeId, category: 'food' }] }, (s, j) => s === 201 && j.places[0]?.id === saved?.places?.[0]?.id);
      await step('fresh Google details for the saved place', 'GET', `/v1/google/places/${first.placeId}`, null, (s, j) => s === 200 && j.name === first.name);
      await step('place preview (rating, hours, photo list)', 'GET', `/v1/google/places/${first.placeId}/preview`, null, (s, j) => s === 200 && j.placeId === first.placeId && (j.detail === 'full' || j.detail === 'basic') && Array.isArray(j.photos));
      await step('trip wishlist has it', 'GET', `/v1/trips/${discoverTrip.id}`, null, (s, j) => s === 200 && j.places.some((p) => p.googlePlaceId === first.placeId));
      if (saved?.places?.[0]?.id) await step('remove the saved place (cleanup)', 'DELETE', `/v1/places/${saved.places[0].id}`, null, (s) => s === 204);
    }
  }
}
if (interp?.action === 'search') {
  await step(
    'standard search near a point (no AI)',
    'POST',
    '/v1/discover/search',
    {
      plan: { textQuery: 'coffee', includedType: 'coffee_shop', openNow: false, category: 'coffee' },
      area: { kind: 'circle', center: { latitude: 40.758, longitude: -73.9855 }, radiusMeters: 1000 },
    },
    (s, j) => (s === 200 && j.results.length > 0 && j.results.every((r) => typeof r.category === 'string')) || (s === 503 && j.error.code === 'NOT_CONFIGURED'),
  );
}
if (discoverTrip?.id) await step('delete the discovery trip (cleanup)', 'DELETE', `/v1/trips/${discoverTrip.id}`, null, (s) => s === 204);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
