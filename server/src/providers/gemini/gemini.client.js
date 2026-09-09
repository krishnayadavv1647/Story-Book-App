import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Transport for the Gemini Interactions API.
 *
 * Shape confirmed against https://ai.google.dev/api/interactions.md.txt on
 * 2026-09-01: POST {base}/v1beta/interactions, key in the `x-goog-api-key`
 * header, body carrying `model`, `system_instruction`, `input` steps,
 * `generation_config` and `response_format`; the reply carries `id`, `status`,
 * `steps`, `output_text` and `usage`.
 *
 * Path and model are env-configurable so a provider change does not need a code
 * change. Nothing above this file knows the wire format.
 */

export class GeminiError extends Error {
  constructor(message, { status, code, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'GeminiError';
    this.status = status ?? 0;
    this.code = code ?? 'GEMINI_ERROR';
    this.retryable = retryable;
    // Lets the central error handler map this to an HTTP status and preserve
    // the code, without the middleware needing to know about providers.
    this.isProviderError = true;
    this.provider = 'gemini';
  }
}

/** Only transient conditions are worth a second attempt. */
function classify(status, body) {
  if (status === 401 || status === 403) {
    return new GeminiError('Story provider rejected our credentials', {
      status,
      code: 'GEMINI_UNAUTHORIZED',
    });
  }
  if (status === 429) {
    return new GeminiError('Story provider is rate limiting us', {
      status,
      code: 'GEMINI_RATE_LIMITED',
      retryable: true,
    });
  }
  if (status >= 500) {
    return new GeminiError('Story provider is unavailable', {
      status,
      code: 'GEMINI_UNAVAILABLE',
      retryable: true,
    });
  }
  return new GeminiError(body?.error?.message ?? 'Story provider rejected the request', {
    status,
    code: 'GEMINI_BAD_REQUEST',
  });
}

/**
 * The model's text from an Interactions response.
 *
 * The response carries no `output_text`: the reply is assembled from `steps`,
 * where a `thought` step holds the model's reasoning and a `model_output` step
 * holds what it actually said. Reading a top-level `output_text` gave an empty
 * string every time, so every plan failed validation as "the response was
 * empty" — while the real answer sat one level down. `output_text` is still
 * preferred when present, in case a future response includes it.
 */
export function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  return (Array.isArray(payload?.steps) ? payload.steps : [])
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

/** A user turn in the Interactions `input` array. */
export function userStep(text) {
  return { type: 'user_input', content: [{ type: 'text', text }] };
}

/** A prior model turn, replayed so a stateless request keeps its context. */
export function modelStep(text) {
  return { type: 'model_output', content: [{ type: 'text', text }] };
}

export async function callInteractions({
  input,
  systemInstruction,
  responseSchema,
  temperature = env.GEMINI_TEMPERATURE,
  maxOutputTokens = env.GEMINI_MAX_OUTPUT_TOKENS,
  signal,
} = {}) {
  // The server's own key drives every generation — users pay in credits, not in
  // keys of their own — so an absent key is a deployment fault, not a caller
  // error, and it is reported as one.
  if (!env.GEMINI_API_KEY) {
    throw new GeminiError('Story generation is not configured on this server', {
      status: 503,
      code: 'GEMINI_NOT_CONFIGURED',
    });
  }

  const body = {
    model: env.GEMINI_MODEL,
    input: Array.isArray(input) ? input : [userStep(String(input))],
    generation_config: {
      temperature,
      max_output_tokens: maxOutputTokens,
      thinking_level: env.GEMINI_THINKING_LEVEL,
    },
    // Nothing is stored on the provider: the plan and the transcript live in our
    // own database, and leaving copies elsewhere is user content we do not need
    // to spread.
    store: false,
  };

  if (systemInstruction) body.system_instruction = systemInstruction;
  if (responseSchema) {
    // `response_format` IS the schema — its `type` is the JSON-schema type, and
    // the API rejects anything else: "The value 'json_schema' is not supported
    // for 'type' at 'response_format'. Supported values: image, array, audio,
    // text, string, number, video, object, integer, boolean."
    //
    // Two wrong shapes were tried first and both fail quietly rather than
    // loudly: `{ type: 'text', mime_type, schema }` is accepted and ignored, so
    // the model answers in whatever shape it likes; `{ type: 'object', schema }`
    // is honoured as an object with no properties, so it returns `{}`. Verified
    // against the live API, which contradicts the published example.
    body.response_format = responseSchema;
  }

  // A hung upstream call must not hold a request open indefinitely.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), env.GEMINI_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const startedAt = Date.now();

  try {
    const response = await fetch(`${env.GEMINI_BASE_URL}${env.GEMINI_INTERACTIONS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Header auth, never a query parameter — a key in a URL ends up in logs.
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = classify(response.status, payload);
      // Status and latency only — never the key, never the user's text.
      logger.warn(
        { status: response.status, code: error.code, latencyMs, model: env.GEMINI_MODEL },
        'Gemini request failed',
      );
      throw error;
    }

    if (payload?.status === 'failed') {
      throw new GeminiError('Story provider could not complete the request', {
        status: 502,
        code: 'GEMINI_FAILED',
        retryable: true,
      });
    }

    const text = extractOutputText(payload);

    // `incomplete` means the reply was cut off — usually by max_output_tokens.
    // Saying so beats letting a half-written JSON object fail validation as if
    // the model had written nonsense.
    if (payload?.status === 'incomplete' && !text.trim()) {
      throw new GeminiError('The story provider ran out of room before answering', {
        status: 502,
        code: 'GEMINI_INCOMPLETE',
        retryable: true,
      });
    }

    return {
      id: payload?.id ?? null,
      text,
      usage: {
        inputTokens: payload?.usage?.total_input_tokens ?? 0,
        outputTokens: payload?.usage?.total_output_tokens ?? 0,
        thoughtTokens: payload?.usage?.total_thought_tokens ?? 0,
      },
      latencyMs,
    };
  } catch (err) {
    if (err instanceof GeminiError) throw err;

    if (err?.name === 'AbortError') {
      // A caller-initiated cancel is not a provider fault.
      if (signal?.aborted) throw ApiError.badRequest('Request cancelled', { code: 'CANCELLED' });
      throw new GeminiError('Story provider timed out', {
        status: 504,
        code: 'GEMINI_TIMEOUT',
        retryable: true,
      });
    }

    throw new GeminiError('Could not reach the story provider', {
      status: 502,
      code: 'GEMINI_UNREACHABLE',
      retryable: true,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export default { callInteractions, userStep, modelStep, GeminiError };
