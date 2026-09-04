import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Kie.ai image provider.
 *
 * Contract confirmed against the official docs on 2026-09-01:
 *   create — POST {base}/api/v1/jobs/createTask
 *            body { model, callBackUrl, input: { prompt, image_input, aspect_ratio,
 *            resolution, output_format } }, reply { code, msg, data: { taskId } }
 *   status — GET  {base}/api/v1/jobs/recordInfo?taskId=…
 *            reply { code, msg, data: { taskId, model, state, param, resultJson,
 *            failCode, failMsg, costTime, completeTime, createTime, progress,
 *            creditsConsumed } }
 *   auth   — Authorization: Bearer <key>
 *   states — waiting | queuing | generating | success | fail
 *   resultJson is a JSON *string*: {"resultUrls":["https://…"]}
 *
 * Every model-specific field lives in `buildInput` below. Nothing outside this
 * file knows that `image_input` is what carries reference images, or that this
 * model has no negative-prompt support.
 */

export class KieError extends Error {
  constructor(message, { status, code, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'KieError';
    this.status = status ?? 0;
    this.code = code ?? 'KIE_ERROR';
    this.retryable = retryable;
    this.isProviderError = true;
    this.provider = 'kie';
  }
}

/** Provider states → our own job vocabulary. */
const STATE_MAP = {
  waiting: 'queued',
  queuing: 'queued',
  generating: 'processing',
  success: 'succeeded',
  fail: 'failed',
};

const TERMINAL = new Set(['succeeded', 'failed']);

function classify(status, body) {
  if (status === 401 || status === 403) {
    return new KieError('Image provider rejected our credentials', {
      status,
      code: 'KIE_UNAUTHORIZED',
    });
  }
  if (status === 402) {
    return new KieError('The image provider account is out of credit', {
      status,
      code: 'KIE_PROVIDER_CREDIT',
    });
  }
  if (status === 429) {
    return new KieError('Image provider is rate limiting us', {
      status,
      code: 'KIE_RATE_LIMITED',
      retryable: true,
    });
  }
  if (status >= 500) {
    return new KieError('Image provider is unavailable', {
      status,
      code: 'KIE_UNAVAILABLE',
      retryable: true,
    });
  }
  return new KieError(body?.msg ?? 'Image provider rejected the request', {
    status,
    code: 'KIE_BAD_REQUEST',
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether it is safe to send this request again.
 *
 * Only failures where the provider plainly did not take the work: it rejected
 * us (429), fell over (5xx), or never answered (timeout). A 4xx that is not 429
 * means the request itself was wrong, and repeating it would only repeat the
 * mistake. Restricting it this way is also what makes retrying `createTask`
 * safe — none of these states can have left a task running.
 */
const isTransient = (err) =>
  Boolean(err?.retryable) && ['KIE_UNAVAILABLE', 'KIE_RATE_LIMITED', 'KIE_TIMEOUT'].includes(err.code);

/**
 * One attempt. `call` below wraps this with the retry budget.
 */
async function attempt(path, { method = 'GET', body, query, signal } = {}) {
  if (!env.KIE_API_KEY) {
    throw new KieError('Image generation is not configured', {
      status: 503,
      code: 'KIE_NOT_CONFIGURED',
    });
  }

  const url = new URL(`${env.KIE_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), env.KIE_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const startedAt = Date.now();

  try {
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${env.KIE_API_KEY}`,
    };
    if (env.KIE_API_VERSION) headers['x-api-version'] = env.KIE_API_VERSION;

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = classify(response.status, payload);
      logger.warn(
        { status: response.status, code: error.code, latencyMs: Date.now() - startedAt },
        'Kie request failed',
      );
      throw error;
    }

    // The API answers HTTP 200 with a non-200 `code` for application-level
    // failures, and puts the real reason in `msg`.
    //
    // That `code` is the provider's own taxonomy, not an HTTP status, and
    // running it through `classify` was actively harmful: a rejected prompt
    // arrives as `code: 500`, which became "Image provider is unavailable",
    // marked retryable — so the true reason ("The text length cannot exceed the
    // maximum limit") was hidden and the same doomed request was sent three
    // times. Say what the provider said, and do not retry a refusal.
    if (payload && typeof payload.code === 'number' && payload.code !== 200) {
      const reason = payload.msg || 'The image provider rejected the request';

      logger.warn(
        { providerCode: payload.code, latencyMs: Date.now() - startedAt },
        `Kie rejected the request: ${reason}`,
      );

      throw new KieError(reason, {
        status: 422,
        code: 'KIE_REJECTED',
        // A refusal is about the request, not the provider's health. Repeating
        // it changes nothing.
        retryable: false,
      });
    }

    return payload?.data ?? null;
  } catch (err) {
    if (err instanceof KieError) throw err;

    if (err?.name === 'AbortError') {
      if (signal?.aborted) throw new KieError('Cancelled', { code: 'CANCELLED' });
      throw new KieError('Image provider timed out', {
        status: 504,
        code: 'KIE_TIMEOUT',
        retryable: true,
      });
    }

    throw new KieError('Could not reach the image provider', {
      status: 502,
      code: 'KIE_UNREACHABLE',
      retryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * A request, retried while the failure is one the provider clearly did not act
 * on. A single transient 5xx used to fail a page permanently: the error was
 * recorded as `retryable: true` and then nobody ever retried it, so one wobble
 * from the provider left five of six pages unillustrated and needing a manual
 * retry each.
 */
async function call(path, options = {}) {
  let lastError;

  for (let attemptNo = 0; attemptNo <= env.KIE_MAX_RETRIES; attemptNo += 1) {
    try {
      return await attempt(path, options);
    } catch (err) {
      lastError = err;

      const canRetry = isTransient(err) && attemptNo < env.KIE_MAX_RETRIES;
      if (!canRetry) throw err;

      // Exponential backoff with jitter, so a burst of pages failing at once
      // does not come back in lockstep and knock the provider over again.
      const backoff = env.KIE_RETRY_BASE_MS * 2 ** attemptNo;
      const wait = backoff + Math.floor(Math.random() * env.KIE_RETRY_BASE_MS);

      logger.warn(
        { code: err.code, attempt: attemptNo + 1, of: env.KIE_MAX_RETRIES, waitMs: wait },
        'Kie request failed transiently — retrying',
      );

      await sleep(wait);
    }
  }

  throw lastError;
}


export class KieImageProvider {
  /**
   * Maps our internal request onto this model's `input` object.
   *
   * Unsupported fields are dropped here rather than passed through: this model
   * accepts no negative prompt and no seed, and sending them would either be
   * ignored silently or rejected. `image_input` is how a locked character's
   * reference sheet reaches the model, which is what keeps them consistent.
   */
  buildInput({ prompt, aspectRatio, resolution, outputFormat, referenceUrls = [] }) {
    const input = { prompt };

    if (referenceUrls.length > 0) input.image_input = referenceUrls.slice(0, 8);
    if (aspectRatio) input.aspect_ratio = aspectRatio;
    if (resolution) input.resolution = resolution;
    if (outputFormat) input.output_format = outputFormat;

    return input;
  }

  /**
   * Kie.ai does not sign its callbacks, so there is nothing to verify in the
   * body. Instead the callback URL carries an unguessable token derived from the
   * job id, and the payload is treated as a hint that something changed — the
   * authoritative state is always re-read from `recordInfo`.
   */
  callbackToken(jobId) {
    return crypto
      .createHmac('sha256', env.KIE_CALLBACK_SECRET || 'storybook-dev')
      .update(String(jobId))
      .digest('base64url');
  }

  callbackUrl(jobId) {
    const base = env.KIE_CALLBACK_URL || env.SERVER_PUBLIC_URL;
    return `${base}/api/v1/generation/kie/callback/${this.callbackToken(jobId)}`;
  }

  /** Timing-safe. Returns only whether the caller reached the right door. */
  verifyCallback(headers, body, { jobId, token } = {}) {
    if (!jobId || typeof token !== 'string') return { verified: false, reason: 'missing_token' };

    const expected = Buffer.from(this.callbackToken(jobId));
    const provided = Buffer.from(token);

    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      return { verified: false, reason: 'bad_token' };
    }

    // Deliberately does not trust `body`. It is unauthenticated input; the
    // caller re-reads the task from the provider before acting on it.
    return { verified: true, hintedState: body?.data?.state ?? null };
  }

  async createTask({ prompt, aspectRatio, resolution, outputFormat, referenceUrls, jobId, signal }) {
    const data = await call(env.KIE_CREATE_PATH, {
      method: 'POST',
      body: {
        model: env.KIE_IMAGE_MODEL,
        callBackUrl: jobId ? this.callbackUrl(jobId) : undefined,
        input: this.buildInput({ prompt, aspectRatio, resolution, outputFormat, referenceUrls }),
      },
      signal,
    });

    const taskId = data?.taskId;
    if (!taskId) {
      throw new KieError('Image provider did not return a task id', { code: 'KIE_NO_TASK_ID' });
    }

    return { externalTaskId: taskId };
  }

  async getTaskStatus(externalTaskId, { signal } = {}) {
    const data = await call(env.KIE_STATUS_PATH, { query: { taskId: externalTaskId }, signal });
    return this.normalizeResult(data);
  }

  /**
   * Kie.ai documents no cancellation endpoint for the jobs API. Cancelling is
   * therefore local: we stop polling and discard whatever arrives. The upstream
   * task may still run to completion and still be billed by the provider —
   * saying otherwise would be a lie to the user.
   */
  async cancelTask(externalTaskId) {
    logger.info(
      { externalTaskId },
      'Kie.ai has no cancel endpoint — abandoning the task locally',
    );
    return { cancelled: true, upstreamCancelled: false };
  }

  /** Provider payload → our shape. Copes with resultJson being a JSON string. */
  normalizeResult(data) {
    if (!data) return { status: 'failed', imageUrls: [], error: 'Empty response' };

    let result = null;
    if (typeof data.resultJson === 'string' && data.resultJson.trim()) {
      try {
        result = JSON.parse(data.resultJson);
      } catch {
        // A malformed resultJson on an otherwise successful task is a provider
        // fault; report it rather than silently producing zero images.
        return {
          status: 'failed',
          imageUrls: [],
          error: 'Provider returned an unreadable result',
          externalTaskId: data.taskId ?? null,
        };
      }
    } else if (data.resultJson && typeof data.resultJson === 'object') {
      result = data.resultJson;
    }

    const status = STATE_MAP[data.state] ?? 'processing';
    const imageUrls = Array.isArray(result?.resultUrls) ? result.resultUrls.filter(Boolean) : [];

    return {
      status,
      isTerminal: TERMINAL.has(status),
      externalTaskId: data.taskId ?? null,
      model: data.model ?? null,
      imageUrls,
      progress: typeof data.progress === 'number' ? data.progress : status === 'succeeded' ? 100 : 0,
      error: status === 'failed' ? (data.failMsg ?? 'Generation failed') : null,
      errorCode: status === 'failed' ? (data.failCode ?? null) : null,
      costTimeMs: data.costTime ?? null,
      providerCredits: data.creditsConsumed ?? 0,
    };
  }
}

export const kieImageProvider = new KieImageProvider();
export default kieImageProvider;
