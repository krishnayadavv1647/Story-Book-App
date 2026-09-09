import { env } from '../../config/env.js';

/**
 * What each kind of work costs.
 *
 * One table, read by the generation services when they charge and by the book
 * estimate when it quotes — so a price can never be quoted in one place and
 * charged differently in another.
 *
 * The keys are `GenerationJob` types, plus `page_rewrite` for the one piece of
 * paid work that finishes inside a single request and never becomes a job.
 * Prices come from the environment (see CREDITS_* in env.js) so a deploy can be
 * repriced without a code change.
 */
export const CREDIT_PRICES = Object.freeze({
  story_plan: env.CREDITS_STORY_PLAN,
  story_chat: env.CREDITS_CHAT,
  page_rewrite: env.CREDITS_CHAT,
  character_image: env.CREDITS_CHARACTER,
  page_image: env.CREDITS_IMAGE,
  page_regenerate: env.CREDITS_IMAGE,
  image_edit: env.CREDITS_IMAGE,
  book_cover: env.CREDITS_IMAGE,
});

/**
 * The price of one piece of work.
 *
 * Throws on an unknown kind rather than defaulting to zero: a new job type that
 * nobody priced should fail loudly in development, not quietly become free in
 * production.
 */
export function priceOf(kind) {
  const price = CREDIT_PRICES[kind];
  if (price === undefined) throw new Error(`No credit price is defined for "${kind}"`);
  return price;
}

/**
 * What finishing a book will cost from here.
 *
 * Illustrations are every page plus a front and back cover; only characters
 * that still need designing are counted, so the quote falls as the work gets
 * done rather than restating the whole book's price every time.
 */
export function estimateBookCredits({ illustrations = 0, charactersToDesign = 0 } = {}) {
  const images = illustrations * CREDIT_PRICES.page_image;
  const characters = charactersToDesign * CREDIT_PRICES.character_image;

  return { illustrations: images, characters, total: images + characters };
}

export default { CREDIT_PRICES, priceOf, estimateBookCredits };
