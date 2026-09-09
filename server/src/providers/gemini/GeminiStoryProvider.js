import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { callInteractions, modelStep, userStep } from './gemini.client.js';
import { PAGE_REWRITE_PROMPT, STORY_CHAT_PROMPT, STORY_PLAN_PROMPT } from './prompts.js';
import { STORY_PLAN_JSON_SCHEMA, describeIssues, storyPlanSchema } from './storyPlan.schema.js';
import { PAGE_REWRITE_JSON_SCHEMA, pageRewriteSchema } from './pageRewrite.schema.js';

/**
 * The story provider.
 *
 * The interesting part is not the HTTP call — it is that a model's output is
 * never trusted. Every response is parsed and validated against the Zod contract,
 * and a failure is fed back as a specific correction rather than discarded. Only
 * a plan that satisfies the contract is ever returned to a caller, so nothing
 * downstream has to defend against a malformed one.
 */

/** Models sometimes wrap JSON in a fence despite being told not to. */
function extractJson(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parsePlan(text) {
  const candidate = extractJson(text);

  if (!candidate) {
    return { ok: false, issues: '- (root): the response was empty. Return the JSON object.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    return {
      ok: false,
      issues: `- (root): the response was not valid JSON (${err.message}). Return a single JSON object and nothing else.`,
    };
  }

  const result = storyPlanSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, issues: describeIssues(result.error.issues) };
  }

  return { ok: true, plan: result.data };
}

export class GeminiStoryProvider {
  constructor({ maxAttempts = env.GEMINI_MAX_RETRIES + 1 } = {}) {
    // One initial attempt plus a bounded number of corrections. Unbounded
    // retries against a model that cannot satisfy the contract would burn the
    // request open for no reason.
    this.maxAttempts = Math.max(1, maxAttempts);
  }

  get promptVersions() {
    return {
      plan: { key: STORY_PLAN_PROMPT.key, version: STORY_PLAN_PROMPT.version },
      chat: { key: STORY_CHAT_PROMPT.key, version: STORY_CHAT_PROMPT.version },
      rewrite: { key: PAGE_REWRITE_PROMPT.key, version: PAGE_REWRITE_PROMPT.version },
    };
  }

  /**
   * Returns a validated plan, or throws. Never returns a partial or unchecked one.
   */
  async generateStoryPlan({ prompt, settings = {}, signal } = {}) {
    const input = [userStep(STORY_PLAN_PROMPT.buildInput({ prompt, settings }))];

    const usage = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 };
    let latencyMs = 0;
    let lastIssues = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const response = await callInteractions({
        input,
        systemInstruction: STORY_PLAN_PROMPT.systemInstruction,
        responseSchema: STORY_PLAN_JSON_SCHEMA,
        signal,
        });

      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
      usage.thoughtTokens += response.usage.thoughtTokens;
      latencyMs += response.latencyMs;

      const result = parsePlan(response.text);

      if (result.ok) {
        return {
          plan: result.plan,
          meta: {
            promptKey: STORY_PLAN_PROMPT.key,
            promptVersion: STORY_PLAN_PROMPT.version,
            model: env.GEMINI_MODEL,
            attempts: attempt,
            usage,
            latencyMs,
          },
        };
      }

      lastIssues = result.issues;

      // Log that it failed and how many problems there were — not the content.
      logger.warn(
        { attempt, maxAttempts: this.maxAttempts, model: env.GEMINI_MODEL },
        'Story plan failed validation; requesting a correction',
      );

      if (attempt < this.maxAttempts) {
        input.push(
          modelStep(response.text),
          userStep(STORY_PLAN_PROMPT.buildCorrection({ issues: result.issues })),
        );
      }
    }

    // The user is told it failed; the detail is for
    // whoever reads the logs, and is safe to expose because it describes our own
    // contract, not the user's content.
    throw ApiError.providerFailure(
      'The story planner could not produce a usable plan. Please try again, or reword the idea.',
      { code: 'STORY_PLAN_INVALID', details: { attempts: this.maxAttempts, issues: lastIssues } },
    );
  }

  /**
   * Rewrites one page. Returns validated text or throws — a rewrite that came
   * back empty or malformed must never overwrite what the user already had.
   */
  async rewritePage({ book, page, instruction, signal } = {}) {
    const response = await callInteractions({
      input: [userStep(PAGE_REWRITE_PROMPT.buildInput({ book, page, instruction }))],
      systemInstruction: PAGE_REWRITE_PROMPT.systemInstruction,
      responseSchema: PAGE_REWRITE_JSON_SCHEMA,
      signal,
    });

    let parsed;
    try {
      parsed = pageRewriteSchema.parse(JSON.parse(extractJson(response.text)));
    } catch {
      throw ApiError.providerFailure('The rewrite came back unusable. Please try again.', {
        code: 'PAGE_REWRITE_INVALID',
      });
    }

    return {
      rewrite: parsed,
      meta: {
        promptKey: PAGE_REWRITE_PROMPT.key,
        promptVersion: PAGE_REWRITE_PROMPT.version,
        model: env.GEMINI_MODEL,
        usage: response.usage,
        latencyMs: response.latencyMs,
      },
    };
  }

  /**
   * A conversational turn. Prior turns are replayed because requests are
   * stateless by choice — the transcript lives in our database, not the
   * provider's.
   */
  async chat({ messages = [], signal } = {}) {
    const input = messages.map((message) =>
      message.role === 'assistant' ? modelStep(message.content) : userStep(message.content),
    );

    const response = await callInteractions({
      input,
      systemInstruction: STORY_CHAT_PROMPT.systemInstruction,
      signal,
    });

    return {
      text: response.text.trim(),
      meta: {
        promptKey: STORY_CHAT_PROMPT.key,
        promptVersion: STORY_CHAT_PROMPT.version,
        model: env.GEMINI_MODEL,
        usage: response.usage,
        latencyMs: response.latencyMs,
      },
    };
  }
}

export const geminiStoryProvider = new GeminiStoryProvider();
export default geminiStoryProvider;
