import { env } from '../../config/env.js';

/**
 * Image prompt construction.
 *
 * The single most important job here is carrying **character identity** into
 * every page. A page prompt that only described the scene would give a different
 * child on every page — so each character present contributes their
 * `consistencyPrompt` verbatim, and their generated reference images are passed
 * alongside as visual anchors.
 */

export const POSES = [
  { pose: 'front', hint: 'front view, facing the camera, neutral expression' },
  { pose: 'side', hint: 'side profile view, facing left' },
  { pose: 'three_quarter', hint: 'three-quarter view, turned slightly away' },
  { pose: 'full_body', hint: 'full body, head to toe, standing, feet visible' },
];

export function characterPrompt(character, pose = 'front') {
  const spec = POSES.find((p) => p.pose === pose) ?? POSES[0];

  return [
    `Character reference sheet, ${spec.hint}.`,
    character.identity?.consistencyPrompt || character.appearance,
    character.outfit ? `Wearing: ${character.outfit}.` : '',
    character.artStyle ? `Art style: ${character.artStyle}.` : '',
    'Plain neutral background. Illustrated-book character art in the stated style.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Cuts to a length without leaving a half-written word behind. */
function trimWords(text, max) {
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;—-]+$/, '');
}

/**
 * `cast` is the subset of characters this page references. Their identity text
 * is included so the same character looks the same on every page — the image
 * model has no memory of any other page, so anything omitted here is invented
 * afresh.
 *
 * The whole thing is kept under `maxChars`, because the provider rejects a
 * longer prompt outright ("The text length cannot exceed the maximum limit").
 * The scene, setting, mood, art style and the no-text rule are never dropped;
 * the cast descriptions are shortened, and then dropped one at a time, because
 * they are the long part and a slightly vaguer character beats no picture.
 */
export function pagePrompt({ page, cast, book, maxChars = env.KIE_MAX_PROMPT_CHARS }) {
  // The page can opt out: a crowd scene or a landscape does not want four
  // character descriptions pushed into it.
  const people = page.characterConsistency === false ? [] : cast;

  const fixed = [
    page.illustrationPrompt || page.sceneDescription || page.narration,
    page.location ? `Setting: ${page.location}.` : '',
    page.mood ? `Mood: ${page.mood}.` : '',
    book.artStyle ? `Art style: ${book.artStyle}.` : '',
    'Illustrated-book art in the stated style. No text, letters or words in the image.',
  ].filter(Boolean);

  const assemble = (identities) =>
    [
      fixed[0],
      identities.length ? `Characters in this scene: ${identities.join('; ')}.` : '',
      ...fixed.slice(1),
    ]
      .filter(Boolean)
      .join(' ');

  const describe = (character, budget) => {
    const look = character.identity?.consistencyPrompt || character.appearance;
    if (!look) return character.name;
    return `${character.name} — ${trimWords(look, Math.max(40, budget))}`;
  };

  // Full descriptions first; only shorten if they do not fit.
  let identities = people.map((character) => describe(character, Infinity));
  if (assemble(identities).length <= maxChars) return assemble(identities);

  const room = Math.max(0, maxChars - assemble([]).length - 30);
  const perCharacter = people.length ? Math.floor(room / people.length) : 0;
  identities = people.map((character) => describe(character, perCharacter));

  // Still too long — drop the least-mentioned characters rather than send
  // something the provider will refuse.
  while (identities.length > 0 && assemble(identities).length > maxChars) {
    identities.pop();
  }

  return trimWords(assemble(identities), maxChars);
}

/* ------------------------------------------------------------------------ *
 * Book covers
 * ------------------------------------------------------------------------ */

/**
 * The base prompt every generated cover is built on.
 *
 * A page image is told "no text, letters or words". A cover is the exact
 * opposite: the title and subtitle have to be *inside* the artwork, because the
 * library card no longer prints them beside the picture. Everything that must
 * hold true of every cover, whatever the story, lives here — the per-book part
 * below only adds what this particular book is about.
 *
 * Recorded as a `PromptVersion` when a cover job runs, so a cover can be traced
 * back to the wording that produced it.
 */
export const COVER_BASE_PROMPT = [
  'Front cover artwork for an illustrated book, in the art style described below.',
  'Portrait orientation, full-bleed: one cohesive illustration filling the whole frame, edge to edge.',
  'The lettering is part of the artwork. Render the title and the subtitle exactly as written,',
  'in clean, legible display lettering that suits the art style, large and high-contrast enough to read at thumbnail size.',
  'Title across the upper area, subtitle directly beneath it and clearly smaller.',
  'Keep that band uncluttered so the words stay legible; the scene sits below and behind them.',
  'No other words anywhere: no author name, publisher, series line, tagline, barcode, price,',
  'page number, watermark or signature. Spell nothing except the title and subtitle.',
].join(' ');

/** Versioned so a cover can be traced to the wording that produced it. */
export const BOOK_COVER_PROMPT = Object.freeze({
  key: 'book_cover',
  version: 2,
  systemInstruction: COVER_BASE_PROMPT,
});

/** Quotes are the delimiter around the exact title, so they cannot be inside it. */
function literal(text) {
  return String(text ?? '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The line under the title.
 *
 * A book need not carry one, and inventing prose would put words on the cover
 * the author never wrote — so it falls back to the genre, which is real data,
 * and then to a plain description of what the thing is.
 */
export function coverSubtitle(book) {
  return literal(book.subtitle) || literal(book.genre) || 'A Storybook';
}

/**
 * One book's cover prompt.
 *
 * Same discipline as `pagePrompt`: the parts that make it a *cover* — the base
 * rules, the title and the subtitle — are never shortened or dropped, because a
 * cover missing its title is not a cover. What the story is about, and who is in
 * it, are trimmed and then dropped one at a time to fit the provider's limit.
 */
export function coverPrompt({ book, cast = [], maxChars = env.KIE_MAX_PROMPT_CHARS }) {
  const title = literal(book.title) || 'Untitled';
  const subtitle = coverSubtitle(book);

  const fixed = [
    COVER_BASE_PROMPT,
    `Title text: "${title}".`,
    `Subtitle text: "${subtitle}".`,
    book.artStyle ? `Art style: ${literal(book.artStyle)}.` : '',
    book.genre ? `Genre: ${literal(book.genre)}.` : '',
  ].filter(Boolean);

  const assemble = (scene, identities) =>
    [
      ...fixed,
      scene ? `The story: ${scene}` : '',
      identities.length ? `On the cover: ${identities.join('; ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

  // The hero and any supporting cast, so the child on the cover is the same
  // child as on page one.
  const leads = [...cast].sort((a, b) => (a.role === 'main' ? -1 : b.role === 'main' ? 1 : 0));
  const describe = (character, budget) => {
    const look = character.identity?.consistencyPrompt || character.appearance;
    if (!look) return character.name;
    return `${character.name} — ${trimWords(look, Math.max(40, budget))}`;
  };

  // A cover wants a gist, not the plot. Capping it here also leaves room for the
  // cast, which matters more on a cover than the last clause of a synopsis.
  let scene = trimWords(literal(book.plan?.summary || book.description || book.moral), 180);
  let identities = leads.map((character) => describe(character, Infinity));

  if (assemble(scene, identities).length <= maxChars) return assemble(scene, identities);

  // Give back the synopsis before the cast: the child on the cover has to be
  // the same child as on page one, and only the cast description holds that.
  const sceneRoom = Math.max(0, maxChars - assemble('', identities).length - 20);
  scene = sceneRoom > 60 ? trimWords(scene, sceneRoom) : '';

  if (assemble(scene, identities).length <= maxChars) return assemble(scene, identities);

  // Still over: shorten each description, then drop the supporting cast, who are
  // sorted last. The lead is the one that survives.
  const room = Math.max(0, maxChars - assemble(scene, []).length - 30);
  const perCharacter = leads.length ? Math.floor(room / leads.length) : 0;
  identities = leads.map((character) => describe(character, perCharacter));

  while (identities.length > 1 && assemble(scene, identities).length > maxChars) {
    identities.pop();
  }

  return trimWords(assemble(scene, identities), maxChars);
}

export default { POSES, characterPrompt, pagePrompt, coverPrompt, coverSubtitle, BOOK_COVER_PROMPT, COVER_BASE_PROMPT };
