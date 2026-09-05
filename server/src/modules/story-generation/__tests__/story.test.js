import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import {
  Book,
  BookPage,
  Character,
  GenerationJob,
  ModerationEvent,
  PromptVersion,
  User,
} from '../../../models/index.js';
import { STORY_PLAN_PROMPT } from '../../../providers/gemini/prompts.js';
import { encryptSecret } from '../../../utils/secretBox.js';

let mongod;
let app;

const story = (path) => `${API_PREFIX}/story${path}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_story_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

async function signUp(email = 'krishna@example.com') {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });
  const userId = res.body.data.user.id;
  // BYOK: generation now uses the user's own keys, so seed them for the suite.
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'apiKeys.gemini': encryptSecret('user-gemini-key'),
        'apiKeys.kie': encryptSecret('user-kie-key'),
      },
    },
  );
  return { token: res.body.data.accessToken, userId };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

/** A plan that satisfies the contract. */
function validPlan({ pageCount = 2 } = {}) {
  return {
    book: {
      title: 'Aarav and the Whispering Forest',
      description: 'A curious explorer finds a forest that remembers stories.',
      ageGroup: '6-9',
      language: 'English',
      genre: 'Magical Adventure',
      artStyle: '3D Storybook',
      moral: 'Kindness and courage',
      pageCount,
    },
    characters: [
      {
        tempId: 'character_1',
        name: 'Aarav',
        role: 'main',
        age: '8 years',
        appearance: 'A curious boy with warm brown skin and large expressive eyes.',
        outfit: 'Forest-green hoodie and beige cargo shorts.',
        personality: 'Brave, kind and imaginative.',
        consistencyPrompt: 'Aarav: 8-year-old Indian boy, warm brown skin, dark tousled hair.',
      },
    ],
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      title: `Page ${index + 1}`,
      narration: `Aarav walked a little further into the trees. Page ${index + 1}.`,
      dialogue: [],
      sceneDescription: 'A sunlit forest path with tall whispering trees.',
      characterIds: ['character_1'],
      location: 'Whispering Forest',
      mood: 'curious',
      illustrationPrompt: '3D storybook illustration of Aarav on a sunlit forest path.',
    })),
  };
}

/** Emulates the Gemini Interactions API, one queued reply per call. */
function stubGemini(replies) {
  const calls = [];
  const queue = [...replies];
  let last = replies.at(-1);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      // Repeat the final reply once the queue is empty — a correction turn asks
      // again, and handing back `undefined` only hid that behind a thrown error.
      last = queue.shift() ?? last;
      const next = last;

      if (next?.httpStatus && next.httpStatus >= 400) {
        return {
          ok: false,
          status: next.httpStatus,
          json: async () => ({ error: { message: 'upstream failure' } }),
        };
      }

      const text = typeof next.text === 'string' ? next.text : JSON.stringify(next.plan);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'interaction-1',
          status: 'completed',
          // The live API carries the reply in `steps`, not in an `output_text`
          // field, so the stub does too — a stub in the wrong shape is how the
          // real bug went unnoticed.
          steps: [
            { type: 'thought', signature: 'sig' },
            { type: 'model_output', content: [{ type: 'text', text }] },
          ],
          usage: { total_input_tokens: 100, total_output_tokens: 900, total_thought_tokens: 10 },
        }),
      };
    }),
  );

  return calls;
}

const generate = (token, body = {}) =>
  asUser(request(app).post(story('/plan')), token).send({
    prompt: 'A curious boy finds a forest where every tree remembers a story.',
    ...body,
  });

describe('POST /story/plan', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(story('/plan')).send({ prompt: 'x'.repeat(20) });
    expect(res.status).toBe(401);
  });

  it('refuses to generate when the user has not set their Gemini key', async () => {
    // Register directly, bypassing the key-seeding `signUp` helper.
    const account = await request(app)
      .post(`${API_PREFIX}/auth/register`)
      .send({ name: 'No Keys', email: 'nokeys@example.com', password: 'a-long-enough-passphrase' });
    const token = account.body.data.accessToken;

    const res = await generate(token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('GEMINI_KEY_MISSING');
    // It fails before any book, job, or model call.
    expect(await Book.countDocuments()).toBe(0);
  });

  it('generates a plan and persists the book, its pages and its cast', async () => {
    const { token, userId } = await signUp();
    stubGemini([{ plan: validPlan({ pageCount: 3 }) }]);

    const res = await generate(token);

    expect(res.status).toBe(200);
    expect(res.body.data.pageCount).toBe(3);
    expect(res.body.data.attempts).toBe(1);

    const book = await Book.findById(res.body.data.bookId);
    expect(book.title).toBe('Aarav and the Whispering Forest');
    expect(book.status).toBe('plan_ready');
    expect(book.ownerId.toString()).toBe(userId);
    // The byline is snapshotted from the author's profile at creation.
    expect(book.author).toBe('Krishna Yadav');

    // The finished structure: a title page, the three story pages, an ending.
    const pages = await BookPage.find({ bookId: book._id }).sort({ order: 1 });
    expect(pages.map((p) => p.type)).toEqual(['title', 'story', 'story', 'story', 'ending']);

    const [titlePage, ...rest] = pages;
    const storyPages = rest.slice(0, 3);
    const endingPage = rest[3];

    // Title page carries the editable title and "Written by" line — no artwork.
    expect(titlePage.title).toBe('Aarav and the Whispering Forest');
    expect(titlePage.narration).toBe('Written by Krishna Yadav');
    expect(titlePage.mediaAssetId).toBeNull();

    expect(storyPages[0].narration).toContain('Aarav walked');
    expect(endingPage.title).toBe('The End');

    const characters = await Character.find({ ownerId: userId });
    expect(characters).toHaveLength(1);
    expect(characters[0].identity.consistencyPrompt).toContain('8-year-old');
    // Story pages point at real character documents, not the model's temp ids.
    expect(storyPages[0].characterIds[0].toString()).toBe(characters[0]._id.toString());
  });

  it('keeps a book’s author even after the profile name changes', async () => {
    const { token, userId } = await signUp();
    stubGemini([{ plan: validPlan({ pageCount: 2 }) }]);

    const res = await generate(token);
    const bookId = res.body.data.bookId;
    expect((await Book.findById(bookId)).author).toBe('Krishna Yadav');

    // Renaming the profile must not rewrite the byline of a book already made.
    await User.updateOne({ _id: userId }, { $set: { name: 'Someone Else' } });

    expect((await Book.findById(bookId)).author).toBe('Krishna Yadav');
    // And the title page's snapshot line is untouched too.
    const title = await BookPage.findOne({ bookId, type: 'title' });
    expect(title.narration).toBe('Written by Krishna Yadav');
  });

  it('takes over from an older active prompt version rather than colliding with it', async () => {
    // Regression for the E11000 a prompt version bump hit against a live DB: an
    // older version was already active, and the partial unique index on
    // { key, isActive } forbids a second active row for the same key. The new
    // version must retire the old one instead of throwing DUPLICATE_KEY. A fresh
    // test DB never has that older row, which is why this has to seed it.
    const { token } = await signUp();

    const older = await PromptVersion.create({
      key: STORY_PLAN_PROMPT.key,
      version: STORY_PLAN_PROMPT.version - 1,
      provider: 'gemini',
      model: 'gemini-old',
      systemInstruction: 'older wording',
      template: 'STORY_PLAN_PROMPT.buildInput',
      isActive: true,
      activatedAt: new Date(),
    });

    stubGemini([{ plan: validPlan({ pageCount: 2 }) }]);
    const res = await generate(token);

    expect(res.status).toBe(200);

    // The older version stepped down, and exactly one row — the current version
    // — is active for the key.
    expect((await PromptVersion.findById(older._id)).isActive).toBe(false);
    const active = await PromptVersion.find({ key: STORY_PLAN_PROMPT.key, isActive: true });
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(STORY_PLAN_PROMPT.version);
  });

  it('sends the schema and the system instruction upstream', async () => {
    const { token } = await signUp();
    const calls = stubGemini([{ plan: validPlan() }]);

    await generate(token);

    expect(calls[0].url).toContain('/v1beta/interactions');
    expect(calls[0].body.model).toBe('gemini-2.5-flash');
    expect(calls[0].body.system_instruction).toContain('StoryBook Studio');
    // `response_format` is the schema itself — see gemini.client.js.
    expect(calls[0].body.response_format.required).toEqual(['book', 'characters', 'pages']);
    // User content must not be left sitting on the provider.
    expect(calls[0].body.store).toBe(false);
  });

});

describe('POST /story/books/:bookId/regenerate', () => {
  it('rebuilds the book but keeps the title and ending pages', async () => {
    const { token } = await signUp();
    stubGemini([{ plan: validPlan({ pageCount: 3 }) }]);
    const created = await generate(token);
    const { bookId } = created.body.data;

    // Regenerating produces a different plan (two story pages this time).
    stubGemini([{ plan: validPlan({ pageCount: 2 }) }]);
    const res = await asUser(
      request(app).post(story(`/books/${bookId}/regenerate`)),
      token,
    ).send();

    expect(res.status).toBe(200);

    // Regression: an older build's regenerate dropped the title/ending pages and
    // shifted nothing, so a regenerated book opened straight onto the story with
    // no title page and no "The End". The finished structure must survive.
    const pages = await BookPage.find({ bookId }).sort({ order: 1 });
    expect(pages.map((p) => p.type)).toEqual(['title', 'story', 'story', 'ending']);
    expect(pages.map((p) => p.order)).toEqual([1, 2, 3, 4]);
    expect(pages[0].title).toBe('Aarav and the Whispering Forest');
    expect(pages[0].narration).toBe('Written by Krishna Yadav');
    expect(pages.at(-1).title).toBe('The End');
  });
});

describe('invalid model output', () => {
  it('corrects malformed JSON and succeeds on the retry', async () => {
    const { token } = await signUp();
    const calls = stubGemini([{ text: 'Here you go! {not json' }, { plan: validPlan() }]);

    const res = await generate(token);

    expect(res.status).toBe(200);
    expect(res.body.data.attempts).toBe(2);
    // The correction turn replays the bad output and names the fault.
    expect(calls[1].body.input).toHaveLength(3);
    expect(JSON.stringify(calls[1].body.input)).toContain('not valid JSON');
  });

  it('accepts a plan wrapped in a markdown fence', async () => {
    const { token } = await signUp();
    stubGemini([{ text: `\`\`\`json\n${JSON.stringify(validPlan())}\n\`\`\`` }]);

    const res = await generate(token);
    expect(res.status).toBe(200);
    expect(res.body.data.attempts).toBe(1);
  });

  it('rejects a plan whose page count contradicts its pages, then corrects it', async () => {
    const { token } = await signUp();
    const broken = validPlan({ pageCount: 3 });
    broken.pages = broken.pages.slice(0, 2); // says 3, delivers 2

    const calls = stubGemini([{ plan: broken }, { plan: validPlan({ pageCount: 3 }) }]);
    const res = await generate(token);

    expect(res.status).toBe(200);
    expect(JSON.stringify(calls[1].body.input)).toContain('book.pageCount is 3');
  });

  it('rejects a page that references a character that was never defined', async () => {
    const { token } = await signUp();
    const broken = validPlan();
    broken.pages[0].characterIds = ['character_9'];

    const calls = stubGemini([{ plan: broken }, { plan: validPlan() }]);
    await generate(token);

    expect(JSON.stringify(calls[1].body.input)).toContain('unknown character');
  });

  it('gives up after the bounded retries and stores no book', async () => {
    const { token } = await signUp();
    stubGemini([{ text: 'still not json' }]);

    const res = await generate(token);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('STORY_PLAN_INVALID');

    // The user must not pay for a plan they never received.

    expect(await Book.countDocuments()).toBe(0);
    expect((await GenerationJob.findOne()).status).toBe('failed');
  });
});

describe('upstream failure', () => {
  it('records the failure when the provider errors', async () => {
    const { token } = await signUp();
    stubGemini([{ httpStatus: 503 }]);

    const res = await generate(token);

    // Mapped to a real status and code, not collapsed into a generic 500 — the
    // UI has different answers for "unavailable", "busy" and "timed out".
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GEMINI_UNAVAILABLE');
    expect(res.body.error.details.retryable).toBe(true);
    expect(res.body.message).not.toMatch(/something went wrong/i);

    const job = await GenerationJob.findOne();
    expect(job.status).toBe('failed');
    expect(job.error.code).toBe('GEMINI_UNAVAILABLE');
  });

  it('surfaces upstream throttling as a 429 the client can act on', async () => {
    const { token } = await signUp();
    stubGemini([{ httpStatus: 429 }]);

    const res = await generate(token);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('GEMINI_RATE_LIMITED');
  });

  it('never leaks the API key or the upstream URL in an error', async () => {
    const { token } = await signUp();
    stubGemini([{ httpStatus: 500 }]);

    const res = await generate(token);
    const serialised = JSON.stringify(res.body);

    expect(serialised).not.toContain('test-gemini-key');
    expect(serialised).not.toContain('generativelanguage');
    expect(serialised).not.toContain('x-goog-api-key');
  });

});

describe('idempotency', () => {
  it('reuses the existing book when the same idea is submitted twice', async () => {
    const { token } = await signUp();
    stubGemini([{ plan: validPlan() }]);

    const first = await generate(token);
    const second = await generate(token);

    expect(second.status).toBe(200);
    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.bookId).toBe(first.body.data.bookId);

    // One book — a double submit is not a second book.
    expect(await Book.countDocuments()).toBe(1);
  });
});

describe('safety', () => {
  it('blocks an unsuitable idea before calling the model', async () => {
    const { token } = await signUp();
    const calls = stubGemini([{ plan: validPlan() }]);

    const res = await generate(token, { prompt: 'A story with graphic violence and torture' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONTENT_BLOCKED');
    expect(calls).toHaveLength(0);

    const event = await ModerationEvent.findOne({ subject: 'prompt' });
    expect(event.action).toBe('blocked');
  });

  it('discards an unsuitable generated plan', async () => {
    const { token } = await signUp();
    const unsafe = validPlan();
    unsafe.pages[0].narration = 'The scene was full of gore and mutilated bodies.';
    stubGemini([{ plan: unsafe }]);

    const res = await generate(token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONTENT_BLOCKED');
    expect(await Book.countDocuments()).toBe(0);
  });

  it('records an approved prompt too, so the trail is complete', async () => {
    const { token } = await signUp();
    stubGemini([{ plan: validPlan() }]);

    await generate(token);

    const events = await ModerationEvent.find().sort({ createdAt: 1 });
    expect(events.map((e) => e.subject)).toEqual(['prompt', 'story_plan']);
    expect(events.every((e) => e.action === 'allowed')).toBe(true);
  });
});

describe('POST /story/chat', () => {
  it('returns an assistant reply and replays prior turns upstream', async () => {
    const { token } = await signUp();
    const calls = stubGemini([{ text: 'A forest that remembers stories — who is exploring it?' }]);

    const res = await asUser(request(app).post(story('/chat')), token).send({
      messages: [
        { role: 'user', content: 'I want a story about a forest' },
        { role: 'assistant', content: 'Lovely. Who is the story about?' },
        { role: 'user', content: 'A curious boy called Aarav' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toEqual({
      role: 'assistant',
      content: 'A forest that remembers stories — who is exploring it?',
    });

    expect(calls[0].body.input).toHaveLength(3);
    expect(calls[0].body.input[1].type).toBe('model_output');
    // Chat must never be told to emit JSON.
    expect(calls[0].body.response_format).toBeUndefined();
  });

  it('rejects an empty transcript', async () => {
    const { token } = await signUp();
    const res = await asUser(request(app).post(story('/chat')), token).send({ messages: [] });

    expect(res.status).toBe(422);
  });
});

describe('POST /story/jobs/:jobId/cancel', () => {
  it('cancels a running job and refuses somebody else’s', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');

    const job = await GenerationJob.create({
      ownerId: mine.userId,
      type: 'story_plan',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      requestHash: 'hash-cancel',
      status: 'processing',
    });

    const foreign = await asUser(
      request(app).post(story(`/jobs/${job._id}/cancel`)),
      theirs.token,
    );
    expect(foreign.status).toBe(404);

    const own = await asUser(request(app).post(story(`/jobs/${job._id}/cancel`)), mine.token);
    expect(own.status).toBe(200);
    expect((await GenerationJob.findById(job._id)).status).toBe('cancelled');
  });

  it('rejects a malformed job id', async () => {
    const { token } = await signUp();
    const res = await asUser(request(app).post(story('/jobs/not-an-id/cancel')), token);

    expect(res.status).toBe(422);
  });
});
