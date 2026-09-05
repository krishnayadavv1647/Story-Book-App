import { describe, it, expect, vi, afterEach } from 'vitest';

import { kieImageProvider } from '../KieImageProvider.js';

afterEach(() => vi.unstubAllGlobals());

const json = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const created = { code: 200, msg: 'success', data: { taskId: 'task-1' } };

describe('a transient provider failure', () => {
  it('is retried rather than failing the page outright', async () => {
    // One 500 used to fail a page permanently: the error was recorded as
    // `retryable: true` and then nobody ever retried it, so a single wobble
    // from the provider left five of six pages unillustrated.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(503, { msg: 'upstream busy' }))
      .mockResolvedValueOnce(json(200, created));
    vi.stubGlobal('fetch', fetchMock);

    const result = await kieImageProvider.createTask({ prompt: 'a forest', apiKey: 'test-kie-key' });

    expect(result.externalTaskId).toBe('task-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a rate limit too', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, { msg: 'slow down' }))
      .mockResolvedValueOnce(json(200, created));
    vi.stubGlobal('fetch', fetchMock);

    await expect(kieImageProvider.createTask({ prompt: 'a forest', apiKey: 'test-kie-key' })).resolves.toMatchObject({
      externalTaskId: 'task-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up once the budget is spent, and says why', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(500, { msg: 'still broken' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(kieImageProvider.createTask({ prompt: 'a forest', apiKey: 'test-kie-key' })).rejects.toMatchObject({
      code: 'KIE_UNAVAILABLE',
    });

    // The first attempt plus the retry budget, and no more.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('a failure the provider did act on', () => {
  it('is never retried, so no duplicate task can be created', async () => {
    // A 400 means the request itself was wrong; sending it again would only
    // repeat the mistake, and retrying something the provider accepted could
    // bill twice.
    const fetchMock = vi.fn().mockResolvedValue(json(400, { msg: 'bad prompt' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(kieImageProvider.createTask({ prompt: 'x', apiKey: 'test-kie-key' })).rejects.toMatchObject({
      code: 'KIE_BAD_REQUEST',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry an out-of-credit answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(402, { msg: 'no credit' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(kieImageProvider.createTask({ prompt: 'x', apiKey: 'test-kie-key' })).rejects.toMatchObject({
      code: 'KIE_PROVIDER_CREDIT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('a request the provider refuses', () => {
  it('reports the provider’s own reason instead of "unavailable"', async () => {
    // Kie answers HTTP 200 with its own `code` and the real reason in `msg`.
    // Running that code through HTTP-status logic turned a rejected prompt into
    // "Image provider is unavailable", which hid the actual problem.
    const fetchMock = vi.fn().mockResolvedValue(
      json(200, { code: 500, msg: 'The text length cannot exceed the maximum limit', data: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(kieImageProvider.createTask({ prompt: 'x'.repeat(2000), apiKey: 'test-kie-key' })).rejects.toMatchObject({
      code: 'KIE_REJECTED',
      message: 'The text length cannot exceed the maximum limit',
      retryable: false,
    });

    // And it is sent once: repeating a refusal changes nothing.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
