import { describe, expect, it } from 'vitest';
import { en } from './en';
import { he } from './he';

function keysOf(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keysOf(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1] ?? '').sort();
}

describe('translations', () => {
  it('Hebrew has exactly the English keys', () => {
    expect(keysOf(he).sort()).toEqual(keysOf(en).sort());
  });

  it('no translation is empty', () => {
    for (const [key, text] of Object.entries(flatten(he))) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('placeholders match between languages', () => {
    const enFlat = flatten(en);
    const heFlat = flatten(he);
    for (const key of Object.keys(enFlat)) {
      expect(placeholders(heFlat[key] ?? ''), key).toEqual(placeholders(enFlat[key] ?? ''));
    }
  });
});

function flatten(value: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'object' && child !== null) {
      Object.assign(out, flatten(child as object, `${prefix}${key}.`));
    } else {
      out[`${prefix}${key}`] = String(child);
    }
  }
  return out;
}
