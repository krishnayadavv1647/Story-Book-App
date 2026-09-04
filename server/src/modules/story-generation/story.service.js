import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { requestHash as buildRequestHash } from '../../utils/requestHash.js';
import { Book, BookPage, Character, GenerationJob, PromptVersion } from '../../models/index.js';
import { geminiStoryProvider } from '../../providers/gemini/GeminiStoryProvider.js';
import { STORY_PLAN_PROMPT } from '../../providers/gemini/prompts.js';
import { STORY_PLAN_JSON_SCHEMA } from '../../providers/gemini/storyPlan.schema.js';
import { screenPlan, screenPrompt } from './moderation.js';

/**
 * Records the prompt template that produced a job, so a regression can be traced
 * to the template version and an old book regenerated with what built it.
 */
async function ensurePromptVersion() {
  const { key, version, systemInstruction } = STORY_PLAN_PROMPT;

  const existing = await PromptVersion.findOne({ key, version });
  if (existing) return existing;

  // A new version becomes the active one, so whatever was active for this key
  // has to step down first. The partial unique index allows only one active row
  // per key, so inserting a second active row without this throws E11000 — which
  // is exactly what a prompt version bump hit the first time one ever happened.
  await PromptVersion.updateMany({ key, isActive: true }, { $set: { isActive: false } });

  return PromptVersion.findOneAndUpdate(
    { key, version },
    {
      $setOnInsert: {
        key,
        version,
        provider: 'gemini',
        model: env.GEMINI_MODEL,
        systemInstruction,
        template: 'STORY_PLAN_PROMPT.buildInput',
        responseSchema: STORY_PLAN_JSON_SCHEMA,
        settings: {
          temperature: env.GEMINI_TEMPERATURE,
          maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
        },
        isActive: true,
        activatedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
}

/** Turns a validated plan into a Book, its pages and its draft characters. */
async function persistPlan({ ownerId, plan, sourcePrompt, promptVersionId, job, author = '' }) {
  return withTransaction(async (session) => {
    const [book] = await Book.create(
      [
        {
          ownerId,
          title: plan.book.title,
          // The byline. A book is by whoever asked for it, and it is printed in
          // the margin of every page that carries words.
          author,
          description: plan.book.description,
          ageGroup: plan.book.ageGroup,
          language: plan.book.language,
          genre: plan.book.genre,
          artStyle: plan.book.artStyle,
          moral: plan.book.moral,
          pageCount: plan.book.pageCount,
          status: 'plan_ready',
          plan: {
            summary: plan.book.description,
            promptVersionId,
            sourcePrompt,
            generatedAt: new Date(),
          },
          generation: { pagesTotal: plan.pages.length },
        },
      ],
      { session },
    );

    const characters = await Character.create(
      plan.characters.map((character) => ({
        ownerId,
        name: character.name,
        role: character.role,
        age: character.age,
        appearance: character.appearance,
        outfit: character.outfit,
        personality: character.personality,
        artStyle: plan.book.artStyle,
        // Kept so a page's characterIds can be resolved to real documents, and
        // so the review screen can show which cast member a page refers to.
        tempId: character.tempId,
        status: 'draft',
        identity: { consistencyPrompt: character.consistencyPrompt },
      })),
      // `ordered: true` is required by Mongoose to create several documents
      // in one session. Without it the whole plan fails to save — and it only
      // shows up on a replica set, because a standalone server has no
      // transaction and so passes no session at all.
      { session, ordered: true },
    );

    const byTempId = new Map(characters.map((character) => [character.tempId, character._id]));

    const storyPages = plan.pages.slice().sort((a, b) => a.pageNumber - b.pageNumber);

    /**
     * A finished book is: [front cover] · title · story×N · ending · [back
     * cover]. The covers stay the book's own cover artwork rather than page
     * rows, so the front-cover flow is untouched; the title and ending are real
     * interior pages, so they edit, preview and export like any other page.
     *
     * Neither is illustrated by the run — they carry no illustration prompt and
     * start `ready` — so they add no image work and no credit cost, and the
     * progress recount stays correct because it raises `ready` and `total`
     * together. Their title/author/closing text are editable text, never baked
     * into any artwork.
     */
    const authorLine = author ? `Written by ${author}` : '';

    const titlePage = {
      bookId: book._id,
      ownerId,
      order: 1,
      type: 'title',
      title: plan.book.title,
      narration: authorLine,
      layout: { preset: 'text-only', backgroundColor: '#FBF7EF' },
      status: 'ready',
    };

    const endingPage = {
      bookId: book._id,
      ownerId,
      order: storyPages.length + 2,
      type: 'ending',
      title: 'The End',
      narration: plan.book.moral ? plan.book.moral : 'The End.',
      layout: { preset: 'text-only', backgroundColor: '#FBF7EF' },
      status: 'ready',
    };

    await BookPage.create(
      [
        titlePage,
        ...storyPages.map((page) => ({
          bookId: book._id,
          ownerId,
          // Shifted by one to make room for the title page at order 1.
          order: page.pageNumber + 1,
          type: 'story',
          title: page.title,
          narration: page.narration,
          dialogue: page.dialogue,
          sceneDescription: page.sceneDescription,
          illustrationPrompt: page.illustrationPrompt,
          location: page.location,
          mood: page.mood,
          characterIds: page.characterIds.map((id) => byTempId.get(id)).filter(Boolean),
          status: 'pending',
        })),
        endingPage,
      ],
      // `ordered: true` is required by Mongoose to create several documents
      // in one session. Without it the whole plan fails to save — and it only
      // shows up on a replica set, because a standalone server has no
      // transaction and so passes no session at all.
      { session, ordered: true },
    );

    await Book.updateOne(
      { _id: book._id },
      { $set: { characterIds: characters.map((c) => c._id), 'generation.currentJobId': job._id } },
      { session },
    );

    return book;
  });
}

/**
 * Generates and stores a story plan.
 *
 * Ordering matters: screen before spending, spend before calling the provider,
 * A plan that is rejected by the safety review is discarded rather than stored,
 * so a book never exists that nobody approved.
 */
export async function generateStoryPlan({ user, prompt, settings = {}, requestId, signal }) {
  const ownerId = user._id;

  const screening = await screenPrompt({ ownerId, prompt, requestId });
  if (!screening.allowed) {
    throw ApiError.badRequest(
      'That idea can’t be turned into a book we’re able to make safely. Try describing it differently.',
      { code: 'CONTENT_BLOCKED' },
    );
  }

  const promptVersion = await ensurePromptVersion();
  const hash = buildRequestHash({
    kind: 'story_plan',
    prompt,
    settings,
    model: env.GEMINI_MODEL,
    promptKey: STORY_PLAN_PROMPT.key,
    promptVersion: STORY_PLAN_PROMPT.version,
  });

  // A resubmit of the same idea returns the work already paid for.
  const existing = await GenerationJob.findOne({ ownerId, requestHash: hash });
  if (existing?.status === 'succeeded' && existing.refs.bookId) {
    return { bookId: existing.refs.bookId, jobId: existing._id, reused: true };
  }
  if (existing && ['queued', 'processing'].includes(existing.status)) {
    throw ApiError.conflict('That story is already being planned.', {
      code: 'JOB_IN_PROGRESS',
      details: { jobId: String(existing._id) },
    });
  }

  const job =
    existing ??
    (await GenerationJob.create({
      ownerId,
      type: 'story_plan',
      provider: 'gemini',
      model: env.GEMINI_MODEL,
      promptVersionId: promptVersion._id,
      requestHash: hash,
      request: { prompt, settings },
      status: 'queued',
    }));


  await GenerationJob.updateOne(
    { _id: job._id },
    { $set: { status: 'processing', startedAt: new Date() }, $inc: { attempts: 1 } },
  );

  try {
    const { plan, meta } = await geminiStoryProvider.generateStoryPlan({ prompt, settings, signal });

    const planScreening = await screenPlan({ ownerId, plan, requestId });
    if (!planScreening.allowed) {
      await GenerationJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            error: { code: 'CONTENT_BLOCKED', message: 'Plan failed safety review', at: new Date() },
          },
        },
      );
      throw ApiError.badRequest(
        'The generated story didn’t pass our safety review, so it was discarded.',
        { code: 'CONTENT_BLOCKED' },
      );
    }

    const book = await persistPlan({
      ownerId,
      plan,
      sourcePrompt: prompt,
      promptVersionId: promptVersion._id,
      job,
      author: user.name ?? '',
    });

    await GenerationJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'succeeded',
          progress: 100,
          completedAt: new Date(),
          latencyMs: meta.latencyMs,
          resultJson: plan,
          'refs.bookId': book._id,
          'cost.inputTokens': meta.usage.inputTokens,
          'cost.outputTokens': meta.usage.outputTokens,
        },
      },
    );

    logger.info(
      { bookId: String(book._id), attempts: meta.attempts, pages: plan.pages.length },
      'Story plan generated',
    );

    return { bookId: book._id, jobId: job._id, plan, meta, reused: false };
  } catch (err) {
    if (err?.code !== 'CONTENT_BLOCKED') {
      await GenerationJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: err?.code === 'CANCELLED' ? 'cancelled' : 'failed',
            completedAt: new Date(),
            error: {
              code: err?.code ?? 'INTERNAL_ERROR',
              message: err?.message ?? 'Story plan generation failed',
              retryable: Boolean(err?.retryable),
              at: new Date(),
            },
          },
        },
      );
    }
    throw err;
  }
}

/**
 * Re-plans an existing book in place.
 *
 * The book keeps its identity — its id, its place in the library, anything
 * already linked to it — while its pages and cast are replaced. A brand-new book
 * would orphan whatever the user had already shared or opened.
 *
 * `regenerationCount` is part of the request hash, so a double-click collides
 * with the job already running rather than buying a second plan.
 */
export async function regeneratePlan({ user, book, requestId, signal }) {
  const prompt = book.plan?.sourcePrompt;
  if (!prompt) {
    throw ApiError.badRequest('This book has no original idea to regenerate from.', {
      code: 'NO_SOURCE_PROMPT',
    });
  }

  const settings = {
    ageGroup: book.ageGroup,
    language: book.language,
    genre: book.genre,
    artStyle: book.artStyle,
    pageCount: book.pageCount,
    moral: book.moral,
  };

  const generation = book.plan.regenerationCount ?? 0;
  const hash = buildRequestHash({
    kind: 'story_plan_regenerate',
    bookId: String(book._id),
    generation,
    prompt,
    settings,
    model: env.GEMINI_MODEL,
    promptKey: STORY_PLAN_PROMPT.key,
    promptVersion: STORY_PLAN_PROMPT.version,
  });

  const existing = await GenerationJob.findOne({ ownerId: user._id, requestHash: hash });
  if (existing && ['queued', 'processing'].includes(existing.status)) {
    throw ApiError.conflict('This plan is already being regenerated.', { code: 'JOB_IN_PROGRESS' });
  }

  const promptVersion = await ensurePromptVersion();
  const job =
    existing ??
    (await GenerationJob.create({
      ownerId: user._id,
      type: 'story_plan',
      provider: 'gemini',
      model: env.GEMINI_MODEL,
      promptVersionId: promptVersion._id,
      requestHash: hash,
      request: { prompt, settings },
      status: 'processing',
      startedAt: new Date(),
      refs: { bookId: book._id },
    }));

  try {
    const { plan } = await geminiStoryProvider.generateStoryPlan({ prompt, settings, signal });

    const screening = await screenPlan({ ownerId: user._id, plan, requestId });
    if (!screening.allowed) {
      throw ApiError.badRequest(
        'The regenerated story was not suitable for children, so it was discarded.',
        { code: 'CONTENT_BLOCKED' },
      );
    }

    await replacePlan({ book, plan, promptVersionId: promptVersion._id });

    await GenerationJob.updateOne(
      { _id: job._id },
      { $set: { status: 'succeeded', progress: 100, completedAt: new Date(), resultJson: plan } },
    );

    return { bookId: book._id, jobId: job._id };
  } catch (err) {
    await GenerationJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'failed',
          completedAt: new Date(),
          error: { code: err?.code ?? 'INTERNAL_ERROR', message: err?.message, at: new Date() },
        },
      },
    );
    throw err;
  }
}

/** Swaps a book's pages and cast for a new plan, keeping the book itself. */
async function replacePlan({ book, plan, promptVersionId }) {
  return withTransaction(async (session) => {
    await BookPage.deleteMany({ bookId: book._id }, { session });
    await Character.deleteMany({ _id: { $in: book.characterIds ?? [] }, status: 'draft' }, { session });

    const characters = await Character.create(
      plan.characters.map((character) => ({
        ownerId: book.ownerId,
        name: character.name,
        role: character.role,
        age: character.age,
        appearance: character.appearance,
        outfit: character.outfit,
        personality: character.personality,
        artStyle: plan.book.artStyle,
        tempId: character.tempId,
        status: 'draft',
        identity: { consistencyPrompt: character.consistencyPrompt },
      })),
      // `ordered: true` is required by Mongoose to create several documents
      // in one session. Without it the whole plan fails to save — and it only
      // shows up on a replica set, because a standalone server has no
      // transaction and so passes no session at all.
      { session, ordered: true },
    );

    const byTempId = new Map(characters.map((character) => [character.tempId, character._id]));

    await BookPage.create(
      plan.pages
        .slice()
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((page) => ({
          bookId: book._id,
          ownerId: book.ownerId,
          order: page.pageNumber,
          title: page.title,
          narration: page.narration,
          dialogue: page.dialogue,
          sceneDescription: page.sceneDescription,
          illustrationPrompt: page.illustrationPrompt,
          location: page.location,
          mood: page.mood,
          characterIds: page.characterIds.map((id) => byTempId.get(id)).filter(Boolean),
          status: 'pending',
        })),
      // `ordered: true` is required by Mongoose to create several documents
      // in one session. Without it the whole plan fails to save — and it only
      // shows up on a replica set, because a standalone server has no
      // transaction and so passes no session at all.
      { session, ordered: true },
    );

    await Book.updateOne(
      { _id: book._id },
      {
        $set: {
          title: plan.book.title,
          // Deliberately not the author: regenerating rewrites the story, not
          // who wrote it.
          description: plan.book.description,
          pageCount: plan.pages.length,
          characterIds: characters.map((c) => c._id),
          status: 'plan_ready',
          'plan.summary': plan.book.description,
          'plan.promptVersionId': promptVersionId,
          'plan.generatedAt': new Date(),
          'generation.pagesTotal': plan.pages.length,
        },
        $inc: { 'plan.regenerationCount': 1 },
      },
      { session },
    );
  });
}

/** A conversational turn, protected by the chat rate limit. */
export async function chat({ user, messages, requestId, signal }) {
  const last = [...messages].reverse().find((message) => message.role === 'user');

  const screening = await screenPrompt({ ownerId: user._id, prompt: last?.content ?? '', requestId });
  if (!screening.allowed) {
    throw ApiError.badRequest('That is not something this assistant can help with.', {
      code: 'CONTENT_BLOCKED',
    });
  }

  const { text, meta } = await geminiStoryProvider.chat({ messages, signal });
  return { message: { role: 'assistant', content: text }, meta };
}

/**
 * Rewrites one page's text with the model.
 *
 * The previous text is kept as a revision before the new one is written, so a
 * rewrite the user dislikes is recoverable rather than destructive — an editor
 * that can lose your words is not an editor.
 */
export async function rewritePage({ user, book, pageId, instruction, signal }) {
  const page = await BookPage.findOne({ _id: pageId, bookId: book._id });
  if (!page) throw ApiError.notFound('Page not found');

  if (!page.narration?.trim() && !page.title?.trim()) {
    throw ApiError.badRequest('There is nothing on this page to rewrite yet.', {
      code: 'NOTHING_TO_REWRITE',
    });
  }

  const result = await geminiStoryProvider.rewritePage({ book, page, instruction, signal });

  const screening = await screenPrompt({
    ownerId: user._id,
    prompt: result.rewrite.narration,
  });

  if (!screening.allowed) {
    throw ApiError.badRequest('That rewrite could not be used. Try a different instruction.', {
      code: 'CONTENT_BLOCKED',
    });
  }

  // Append what is being replaced, then apply — in that order, so a crash
  // between the two loses the rewrite rather than the original.
  page.revisions.push({
    source: 'user',
    label: 'Before rewrite',
    narration: page.narration,
    sceneDescription: page.sceneDescription,
    illustrationPrompt: page.illustrationPrompt,
    mediaAssetId: page.mediaAssetId,
    createdBy: user._id,
  });

  page.title = result.rewrite.title || page.title;
  page.narration = result.rewrite.narration;
  await page.save();

  return { page, meta: result.meta };
}

export async function cancelJob({ user, jobId }) {
  const job = await GenerationJob.findOne({ _id: jobId, ownerId: user._id });
  if (!job) throw ApiError.notFound('Job not found');

  if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
    return { status: job.status, alreadyFinished: true };
  }

  await GenerationJob.updateOne(
    { _id: job._id },
    { $set: { status: 'cancelled', cancelledAt: new Date(), completedAt: new Date() } },
  );

  return { status: 'cancelled', alreadyFinished: false };
}

export default { generateStoryPlan, regeneratePlan, chat, cancelJob, rewritePage };
