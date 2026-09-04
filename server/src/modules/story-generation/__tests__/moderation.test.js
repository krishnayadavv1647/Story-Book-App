import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { ModerationEvent } from '../../../models/index.js';
import { screenPlan, screenPrompt } from '../moderation.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_moderation_test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  await ModerationEvent.deleteMany({});
});

const ownerId = new mongoose.Types.ObjectId();
const screen = (prompt) => screenPrompt({ ownerId, prompt });

describe('ordinary story ideas are not refused', () => {
  /**
   * Every one of these was rejected or flagged by substring matching: "something"
   * contains "meth", "firefly" contains "fire", "audience" contains "die",
   * "Bangalore" contains "gore", "begun" contains "gun". A safety net that
   * catches the innocent teaches people to distrust it.
   */
  const ideas = [
    'A curious boy finds something magical in a forest',
    'A girl who wants to learn something new every day',
    'A boy from Bangalore who befriends an elephant',
    'A story about a firefly and a lantern',
    'Two friends who study hard for a big audience',
    'A brave heroine who saves her village',
    'A rabbit who had begun a great adventure',
    'A grandmother who tells stories about the monsoon',
  ];

  it.each(ideas)('allows: %s', async (idea) => {
    const result = await screen(idea);
    expect(result.allowed).toBe(true);
  });

  it('does not even flag them for review', async () => {
    for (const idea of ideas) {
      const result = await screen(idea);
      expect(result.labels, `${idea} was flagged`).toEqual([]);
    }
  });

  it('never matches "heroin" inside "heroine"', async () => {
    // A children's story may well have a heroine.
    expect((await screen('A heroine who rescues her brother')).allowed).toBe(true);
    expect((await screen('a story about heroin')).allowed).toBe(false);
  });
});

describe('genuinely unsuitable ideas are still refused', () => {
  const ideas = [
    'a story with graphic violence',
    'someone using cocaine',
    'a character who wants to kill yourself',
    'mutilated bodies everywhere',
    'a meth lab in the woods',
    'explicit sexual content',
    'a beheading scene',
  ];

  it.each(ideas)('blocks: %s', async (idea) => {
    const result = await screen(idea);
    expect(result.allowed).toBe(false);
    expect(result.labels.length).toBeGreaterThan(0);
  });
});

describe('borderline words are flagged, not blocked', () => {
  it('lets a story about a fire through, with a note for review', async () => {
    const result = await screen('A brave firefighter and a house fire');

    // These belong in children's stories; they are recorded, not refused.
    expect(result.allowed).toBe(true);
    expect(result.labels).toContain('fire');
  });

  it('records the decision either way', async () => {
    await screen('A gentle story about a rabbit');
    await screen('a story with graphic violence');

    const events = await ModerationEvent.find({ ownerId }).sort({ createdAt: 1 }).lean();
    expect(events).toHaveLength(2);
    expect(events[0].status).toBe('approved');
    expect(events[1].status).toBe('rejected');
    // The audit row carries an excerpt, never the whole text.
    expect(events[1].excerpt.length).toBeLessThanOrEqual(300);
  });
});

describe('the generated plan is screened too', () => {
  const plan = (narration) => ({
    book: { title: 'A Story', description: 'A gentle tale.' },
    pages: [{ narration, sceneDescription: 'A forest.', illustrationPrompt: 'A forest.' }],
  });

  it('allows a plan that merely says "something"', async () => {
    const result = await screenPlan({ ownerId, plan: plan('He found something shiny.') });
    expect(result.allowed).toBe(true);
  });

  it('refuses a plan that is genuinely unsuitable', async () => {
    const result = await screenPlan({ ownerId, plan: plan('There was graphic violence.') });
    expect(result.allowed).toBe(false);
  });
});
