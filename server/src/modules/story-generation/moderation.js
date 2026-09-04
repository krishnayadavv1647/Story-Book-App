import { ModerationEvent } from '../../models/index.js';
import { logger } from '../../config/logger.js';

/**
 * A first-pass safety net, not a content classifier.
 *
 * It exists because this is a children's product and the cheapest safety measure
 * is refusing obviously unsuitable input before the model ever sees it. It runs
 * on the way in (the user's idea) and on the way out (what the model produced),
 * because a safe prompt can still yield an unsafe page.
 *
 * Deliberately conservative and deliberately shallow: a keyword list has no
 * understanding of context, so it only catches the unambiguous cases. A real
 * classifier belongs here later — this is the floor, not the ceiling.
 */
/**
 * Terms are matched as whole words, never as substrings.
 *
 * Substring matching quietly refused ordinary story ideas: "something" contains
 * "meth", so any idea using the word was rejected as a drug reference; "firefly"
 * contains "fire" and "audience" contains "die". A safety net that catches the
 * innocent teaches people to distrust it.
 *
 * `stem: true` matches longer words that begin with the term (mutilate,
 * mutilated, mutilation). Without it the word must stand alone — which is what
 * keeps "heroin" from matching "heroine", a word a children's story may well
 * want.
 */
const BLOCKED = [
  { term: 'pornograph', stem: true },
  { term: 'explicit sex', stem: true },
  { term: 'sexual', stem: true },
  { term: 'nude' },
  { term: 'nudity' },
  { term: 'naked child', stem: true },
  { term: 'gore' },
  { term: 'graphic violence' },
  { term: 'behead', stem: true },
  { term: 'mutilat', stem: true },
  { term: 'torture', stem: true },
  { term: 'suicide' },
  { term: 'suicidal' },
  { term: 'self-harm' },
  { term: 'kill yourself' },
  { term: 'heroin' },
  { term: 'cocaine' },
  { term: 'meth' },
  { term: 'methamphetamine' },
  { term: 'nazi', stem: true },
  { term: 'terrorist attack' },
];

const REVIEW = [
  { term: 'blood', stem: true },
  { term: 'weapon', stem: true },
  { term: 'gun' },
  { term: 'guns' },
  { term: 'knife' },
  { term: 'death' },
  { term: 'die' },
  { term: 'dies' },
  { term: 'kidnap', stem: true },
  { term: 'drown', stem: true },
  { term: 'fire' },
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `\\b` at both ends, so a term never matches inside a longer word. */
function toPattern({ term, stem }) {
  const body = escape(term).replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${body}${stem ? '\\w*' : ''}\\b`, 'i');
}

const BLOCKED_PATTERNS = BLOCKED.map((entry) => [entry.term, toPattern(entry)]);
const REVIEW_PATTERNS = REVIEW.map((entry) => [entry.term, toPattern(entry)]);

function scan(text) {
  const haystack = String(text ?? '');

  return {
    blocked: BLOCKED_PATTERNS.filter(([, re]) => re.test(haystack)).map(([term]) => term),
    flagged: REVIEW_PATTERNS.filter(([, re]) => re.test(haystack)).map(([term]) => term),
  };
}

async function record({ ownerId, subject, subjectId, status, action, labels, excerpt, requestId }) {
  try {
    await ModerationEvent.create({
      ownerId,
      subject,
      subjectId: subjectId ?? null,
      status,
      source: 'heuristic',
      action,
      labels,
      // A short excerpt for a human reviewer, never the whole text.
      excerpt: String(excerpt ?? '').slice(0, 300),
      requestId: requestId ?? null,
    });
  } catch (err) {
    // A safety decision has already been made; failing to write the audit row
    // must not turn an allowed request into an error.
    logger.error({ err }, 'Could not record moderation event');
  }
}

/** Returns `{ allowed }`. Recording happens either way. */
export async function screenPrompt({ ownerId, prompt, requestId }) {
  const { blocked, flagged } = scan(prompt);

  if (blocked.length > 0) {
    await record({
      ownerId,
      subject: 'prompt',
      status: 'rejected',
      action: 'blocked',
      labels: blocked,
      excerpt: prompt,
      requestId,
    });
    return { allowed: false, labels: blocked };
  }

  await record({
    ownerId,
    subject: 'prompt',
    status: flagged.length ? 'flagged' : 'approved',
    action: flagged.length ? 'flagged_for_review' : 'allowed',
    labels: flagged,
    excerpt: prompt,
    requestId,
  });

  return { allowed: true, labels: flagged };
}

/**
 * Screens the generated plan. A blocked result means the plan is discarded and
 * discarded — shipping it would be worse than failing.
 */
export async function screenPlan({ ownerId, plan, requestId }) {
  const text = [
    plan.book.title,
    plan.book.description,
    ...plan.pages.flatMap((page) => [page.narration, page.sceneDescription, page.illustrationPrompt]),
  ].join('\n');

  const { blocked, flagged } = scan(text);

  await record({
    ownerId,
    subject: 'story_plan',
    status: blocked.length ? 'rejected' : flagged.length ? 'flagged' : 'approved',
    action: blocked.length ? 'blocked' : flagged.length ? 'flagged_for_review' : 'allowed',
    labels: [...blocked, ...flagged],
    excerpt: plan.book.title,
    requestId,
  });

  return { allowed: blocked.length === 0, labels: blocked };
}

export default { screenPrompt, screenPlan };
