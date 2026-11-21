import type { Sql } from 'postgres';
import postgres from 'postgres';

/**
 * A frozen copy of the v1 read queries and response mapping as they were
 * before D1 (commit 04403f1: trips.service list/getInTx, places.service list,
 * place-columns, the mappers). The golden tests compare today's v1 responses
 * against these on the same data. Do not "fix" or update this file.
 */

const placeColumns = (tx: Sql) => tx`
  p.id, p.google_place_id, p.name, p.address, p.notes, p.my_label, p.category, p.tags, p.visited_at,
  (
    select count(*)::int
    from app.trip_places tp
    join app.trips t on t.id = tp.trip_id and t.deleted_at is null
    where tp.place_id = p.id and tp.deleted_at is null
  ) as trip_count,
  p.created_at, p.updated_at, p.version
`;

const tripColumns = (tx: Sql) => tx`
  t.id, t.title, t.destination,
  t.start_date::text as start_date,
  t.end_date::text as end_date,
  t.base_location,
  t.base_google_place_id,
  (
    select count(*)::int
    from app.trip_places tp
    join app.places p on p.id = tp.place_id and p.deleted_at is null
    where tp.trip_id = t.id and tp.deleted_at is null
  ) as place_count,
  t.created_at, t.updated_at, t.version
`;

type R = Record<string, any>;

function toPlace(row: R) {
  return {
    id: row.id,
    source: row.google_place_id ? 'google' : 'custom',
    googlePlaceId: row.google_place_id,
    name: row.name,
    address: row.address,
    notes: row.notes,
    myLabel: row.my_label,
    category: row.category,
    tags: row.tags,
    visitedAt: row.visited_at ? row.visited_at.toISOString() : null,
    tripCount: row.trip_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

function toTrip(row: R) {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    baseLocation: row.base_location,
    basePlaceId: row.base_google_place_id,
    placeCount: row.place_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

async function asUser<T>(sql: Sql, userId: string, work: (tx: Sql) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated', email: null });
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx`set local role authenticated`;
    return work(tx as unknown as Sql);
  })) as T;
}

/** GET /v1/trips, GET /v1/trips/:id (each listed trip) and GET /v1/places, as the pre-D1 API answered. */
export async function legacyV1Reads(url: string, userId: string) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    return await asUser(sql, userId, async (tx) => {
      const trips = await tx`
        select ${tripColumns(tx)} from app.trips t
        where t.owner_id = ${userId} and t.deleted_at is null
        order by t.start_date asc nulls last, t.created_at desc
        limit 200
      `;
      const details: R[] = [];
      for (const trip of trips) {
        const places = await tx`
          select ${placeColumns(tx)},
            tp.created_at as added_at,
            tp.day::text as day,
            to_char(tp.start_time, 'HH24:MI') as start_time,
            tp.position,
            tp.duration_minutes,
            tp.highlight
          from app.trip_places tp
          join app.places p on p.id = tp.place_id and p.deleted_at is null
          where tp.trip_id = ${trip.id} and tp.owner_id = ${userId} and tp.deleted_at is null
          order by tp.day asc nulls last, tp.position asc, tp.created_at asc
        `;
        details.push({
          ...toTrip(trip),
          places: places.map((row) => ({
            ...toPlace(row),
            addedAt: row.added_at.toISOString(),
            day: row.day,
            startTime: row.start_time,
            position: row.position,
            durationMinutes: row.duration_minutes,
            highlight: row.highlight,
          })),
        });
      }
      const places = await tx`
        select ${placeColumns(tx)} from app.places p
        where p.owner_id = ${userId} and p.deleted_at is null
        order by p.created_at desc
        limit 500
      `;
      return { list: { items: trips.map(toTrip) }, details, places: { items: places.map(toPlace) } };
    });
  } finally {
    await sql.end();
  }
}
