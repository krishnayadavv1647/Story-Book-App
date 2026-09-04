import { describe, it, expect, vi, afterEach } from 'vitest';

import { callInteractions, extractOutputText, userStep } from '../gemini.client.js';

afterEach(() => vi.unstubAllGlobals());

/** An Interactions response in the shape the live API actually returns. */
function interaction({ text, status = 'completed', thought = true } = {}) {
  const steps = [];
  if (thought) steps.push({ type: 'thought', signature: 'abc' });
  if (text !== undefined) {
    steps.push({ type: 'model_output', content: [{ type: 'text', text }] });
  }

  return {
    object: 'interaction',
    model: 'gemini-2.5-flash',
    status,
    steps,
    usage: { total_input_tokens: 10, total_output_tokens: 20, total_thought_tokens: 5 },
  };
}

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });

describe('reading the model’s answer', () => {
  it('takes the text out of the model_output step', () => {
    // The live API returns no `output_text` at all — the reply is assembled
    // from `steps`. Reading a top-level field gave an empty string every time,
    // so every plan failed validation as "the response was empty".
    const payload = interaction({ text: '{"ok":true}' });

    expect('output_text' in payload).toBe(false);
    expect(extractOutputText(payload)).toBe('{"ok":true}');
  });

  it('ignores the thought step', () => {
    const payload = {
      steps: [
        { type: 'thought', content: [{ type: 'text', text: 'let me think' }] },
        { type: 'model_output', content: [{ type: 'text', text: 'the answer' }] },
      ],
    };

    expect(extractOutputText(payload)).toBe('the answer');
  });

  it('joins several model_output parts in order', () => {
    const payload = {
      steps: [
        { type: 'model_output', content: [{ type: 'text', text: '{"a":' }] },
        { type: 'model_output', content: [{ type: 'text', text: '1}' }] },
      ],
    };

    expect(extractOutputText(payload)).toBe('{"a":1}');
  });

  it('still prefers output_text when a response carries one', () => {
    expect(extractOutputText({ output_text: 'from the field', steps: [] })).toBe('from the field');
  });

  it('returns an empty string rather than throwing on a shape it does not know', () => {
    expect(extractOutputText(null)).toBe('');
    expect(extractOutputText({})).toBe('');
    expect(extractOutputText({ steps: 'not an array' })).toBe('');
  });
});

describe('what callInteractions hands back', () => {
  it('returns the text from steps, not a top-level field', async () => {
    // Tests the call path, not just the helper: reading `payload.output_text`
    // here is the exact bug, and it must fail loudly if it comes back.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(interaction({ text: '{"book":{"title":"Leo"}}' }))),
    );

    const result = await callInteractions({ input: [userStep('hi')] });

    expect(result.text).toBe('{"book":{"title":"Leo"}}');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20, thoughtTokens: 5 });
  });
});

describe('asking for structured output', () => {
  const schema = {
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  };

  it('sends the schema as response_format itself', async () => {
    const fetchMock = vi.fn(async () => ok(interaction({ text: '{"title":"x"}' })));
    vi.stubGlobal('fetch', fetchMock);

    await callInteractions({ input: [userStep('hi')], responseSchema: schema });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    // `response_format` IS the schema. The API rejects `type: 'json_schema'`
    // outright, and `{ type: 'text', mime_type, schema }` is accepted and then
    // ignored — which is how every plan came back in the wrong shape.
    expect(body.response_format).toEqual(schema);
    expect(body.response_format.type).toBe('object');
    expect(body.response_format).not.toHaveProperty('json_schema');
    expect(body.response_format).not.toHaveProperty('mime_type');
  });

  it('omits response_format when no schema is wanted', async () => {
    const fetchMock = vi.fn(async () => ok(interaction({ text: 'hello' })));
    vi.stubGlobal('fetch', fetchMock);

    await callInteractions({ input: [userStep('hi')] });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('response_format');
  });
});

describe('a truncated answer', () => {
  it('says the model ran out of room rather than failing as malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(interaction({ status: 'incomplete' }))));

    await expect(callInteractions({ input: [userStep('hi')] })).rejects.toMatchObject({
      code: 'GEMINI_INCOMPLETE',
    });
  });

  it('accepts an incomplete response that still carries usable text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(interaction({ status: 'incomplete', text: '{"title":"x"}' }))),
    );

    const result = await callInteractions({ input: [userStep('hi')] });
    expect(result.text).toBe('{"title":"x"}');
  });
});
