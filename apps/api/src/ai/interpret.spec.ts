import { describe, expect, it } from 'vitest';
import { interpretResponseSchema } from '@travel-companion/shared';
import { buildUserMessage, INTERPRET_OUTPUT_SCHEMA } from './interpret-prompt.js';
import { directInterpretation, parseInterpretOutput } from './interpret-result.js';

const search = {
  action: 'search',
  summary: 'Italian restaurants near Times Square',
  textQuery: 'best Italian restaurants near Times Square, New York',
  includedType: 'italian_restaurant',
  category: 'food',
  openNow: false,
  question: '',
  options: [],
};

describe('parseInterpretOutput', () => {
  it('turns a valid search into a plan', () => {
    const result = parseInterpretOutput(JSON.stringify(search), false);
    expect(result && interpretResponseSchema.parse(result)).toEqual({
      action: 'search',
      summary: 'Italian restaurants near Times Square',
      plan: {
        textQuery: 'best Italian restaurants near Times Square, New York',
        includedType: 'italian_restaurant',
        openNow: false,
        category: 'food',
      },
      interpretedBy: 'ai',
    });
  });

  it('maps "none" to no type', () => {
    const result = parseInterpretOutput(JSON.stringify({ ...search, includedType: 'none' }), false);
    expect(result?.action === 'search' && result.plan.includedType).toBeNull();
  });

  it('returns a clarification', () => {
    const result = parseInterpretOutput(
      JSON.stringify({ ...search, action: 'clarify', question: 'Where is your hotel?', options: ['Midtown', 'SoHo'] }),
      false,
    );
    expect(result).toEqual({ action: 'clarify', question: 'Where is your hotel?', options: ['Midtown', 'SoHo'] });
  });

  it('refuses a second clarification once the user has answered', () => {
    const result = parseInterpretOutput(JSON.stringify({ ...search, action: 'clarify', question: 'Again?' }), true);
    expect(result?.action).toBe('search');
  });

  it('rejects invalid output (bad type, broken JSON, empty query)', () => {
    expect(parseInterpretOutput(JSON.stringify({ ...search, includedType: 'casino' }), false)).toBeNull();
    expect(parseInterpretOutput('{not json', false)).toBeNull();
    expect(parseInterpretOutput(JSON.stringify({ ...search, textQuery: ' ' }), false)).toBeNull();
  });
});

describe('directInterpretation', () => {
  it('adds the trip destination when the query has no place', () => {
    const result = directInterpretation('coffee shops', 'New York', []);
    expect(result.action === 'search' && result.plan.textQuery).toBe('coffee shops in New York');
    expect(result.action === 'search' && result.interpretedBy).toBe('direct');
  });

  it("doesn't repeat a destination that's already there", () => {
    const result = directInterpretation('pizza in New York', 'New York', []);
    expect(result.action === 'search' && result.plan.textQuery).toBe('pizza in New York');
  });
});

describe('prompt', () => {
  it('includes trip context and clarification answers', () => {
    const text = buildUserMessage('near my hotel', {
      locale: 'he',
      trip: { title: 'NY', destination: 'New York', baseLocation: 'Pod Times Square', startDate: '2026-11-23', endDate: '2026-11-29' },
      clarifications: [{ question: 'Where is your hotel?', answer: 'Midtown' }],
    });
    expect(text).toContain('Hebrew');
    expect(text).toContain('destination: New York');
    expect(text).toContain('User answered: Midtown');
    expect(text).toContain('Staying at: Pod Times Square');
  });

  it('schema lists every field as required and allows no extra keys', () => {
    expect(INTERPRET_OUTPUT_SCHEMA.additionalProperties).toBe(false);
    expect([...INTERPRET_OUTPUT_SCHEMA.required].sort()).toEqual(Object.keys(INTERPRET_OUTPUT_SCHEMA.properties).sort());
  });
});
