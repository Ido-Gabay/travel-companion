import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { isKnownTimeZone, type TimeZoneSuggestion } from '@travel-companion/shared';
import { initSync, WasmFinder, type InitOutput } from 'tzf-wasm';

/** A zone the server may store as "derived": only from the user's own coordinates, and only when unambiguous. */
export interface DerivedTimeZone {
  timeZone: string;
  /** Boundary data release (e.g. "2026f"), as reported by the library; null if it reports something unexpected. */
  dataset: string | null;
}

/** Same rule as the database (trip_stays.time_zone_dataset). */
const DATASET_PATTERN = /^[0-9]{4}[a-z]$/;

let finder: WasmFinder | null = null;
let wasmMemory: InitOutput['memory'] | null = null;

/**
 * The boundary lookup (tzf-wasm: timezone-boundary-builder data compiled to
 * WebAssembly, ~4 MB). Loaded on the first lookup, then kept: its memory is
 * fixed (about 50 MB) and does not grow with the number of lookups.
 */
function boundaries(): WasmFinder {
  if (!finder) {
    const wasm = readFileSync(createRequire(import.meta.url).resolve('tzf-wasm/tzf_wasm_bg.wasm'));
    wasmMemory = initSync({ module: wasm }).memory;
    finder = new WasmFinder();
  }
  return finder;
}

/** Bytes the boundary data holds in memory; 0 until the first lookup (for tests and diagnostics). */
export function timeZoneDataBytes(): number {
  return wasmMemory?.buffer.byteLength ?? 0;
}

/**
 * Time zone of a point, from open boundary data bundled with the API (no
 * network call, nothing stored or logged here). D1 Q3: a zone computed from a
 * Google coordinate is only ever a suggestion the user confirms.
 * Data: timezone-boundary-builder, © OpenStreetMap contributors, ODbL.
 */
@Injectable()
export class TimeZonesService {
  /** The boundary data release in use, e.g. "2026f" (loads the data). */
  dataset(): string {
    return boundaries().data_version();
  }

  suggest(latitude: number, longitude: number): TimeZoneSuggestion {
    const found = boundaries().get_tz_names(longitude, latitude) as string[];
    const zones = [...new Set(found)].filter(isKnownTimeZone);
    // Etc/GMT±n = open sea or no boundary: never certain.
    const named = zones.filter((zone) => !zone.startsWith('Etc/'));
    const timeZone = named[0] ?? zones[0] ?? null;
    return {
      timeZone,
      alternatives: zones.filter((zone) => zone !== timeZone),
      certain: zones.length === 1 && named.length === 1,
      dataset: this.dataset(),
    };
  }

  /** For user-owned coordinates (a custom place's pin): the zone to store, or null when uncertain. */
  derive(latitude: number, longitude: number): DerivedTimeZone | null {
    const suggestion = this.suggest(latitude, longitude);
    if (!suggestion.certain || !suggestion.timeZone) return null;
    return {
      timeZone: suggestion.timeZone,
      dataset: DATASET_PATTERN.test(suggestion.dataset) ? suggestion.dataset : null,
    };
  }
}
