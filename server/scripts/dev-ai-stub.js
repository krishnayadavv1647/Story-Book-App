import http from 'node:http';

/**
 * A local stand-in for Gemini and Kie.ai, for development without real keys.
 *
 * It answers the two endpoints the app actually calls — Gemini's Interactions
 * API and Kie.ai's unified jobs API — with fixed, obviously-fake content, and
 * serves a placeholder PNG so the image ingest path has real bytes to store.
 *
 * This is a development convenience, never a test double: the suites stub
 * `fetch` at the boundary instead. Nothing here is reachable in production —
 * the app only talks to it if GEMINI_BASE_URL and KIE_BASE_URL are pointed at
 * it deliberately, which `npm run dev:stub` does and nothing else should.
 */
const PORT = Number(process.env.AI_STUB_PORT ?? 5099);

// A 2×2 PNG. Small on purpose: it stands in for an illustration without
// pretending to be one.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mM8w8DwnwEJMOEUGdECAKAaAv3rzZgUAAAAAElFTkSuQmCC',
  'base64',
);

const PAGES = [
  ['The Map Behind the Bookshelf', 'Aarav loved stories more than anything. One rainy evening, he found an old map tucked inside a book.', 'A cozy bedroom with bookshelves and a glowing map.', ['character_1'], 'Bedroom', 'curious'],
  ['The Forest Gate', 'The map led him to a gate of mossy stone. It creaked open before he could knock.', 'A mossy stone gate at the edge of a misty forest.', ['character_1'], 'Whispering Forest', 'wonder'],
  ['The Frightened Firefly', 'A small light trembled in the dark. It was Lumi, too afraid to fly home.', 'A dark clearing with one small amber firefly.', ['character_1', 'character_2'], 'Clearing', 'tender'],
  ['A Promise in the Dark', 'Aarav promised to walk with her. Lumi glowed a little brighter.', 'A boy and a glowing firefly on a narrow forest path.', ['character_1', 'character_2'], 'Forest path', 'hopeful'],
  ['The Tree That Remembered', 'The oldest tree spoke at last, and told them the ending it had waited to give away.', 'An enormous ancient oak lit warmly from below.', ['character_1', 'character_2'], 'Heart of the forest', 'awe'],
  ['The Way Home', 'They walked home together, carrying a story that was finally finished.', 'Two friends walking home under a wide starry sky.', ['character_1', 'character_2'], 'Forest edge', 'warm'],
];

const plan = (pageCount) => ({
  book: {
    title: 'Aarav and the Whispering Forest',
    description: 'A curious young explorer discovers a hidden forest where every tree remembers an unfinished story.',
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
      appearance: 'A curious Indian boy with warm brown skin and large expressive eyes.',
      outfit: 'Forest-green hoodie, beige cargo shorts, brown adventure boots.',
      personality: 'Brave, kind, imaginative and curious.',
      consistencyPrompt: 'Aarav: 8-year-old Indian boy, warm brown skin, dark tousled hair, green hoodie.',
    },
    {
      tempId: 'character_2',
      name: 'Lumi',
      role: 'supporting',
      age: 'unknown',
      appearance: 'A small firefly with a soft amber glow and translucent wings.',
      outfit: 'None.',
      personality: 'Shy at first, then loyal and brave.',
      consistencyPrompt: 'Lumi: small firefly, soft amber glow, translucent wings.',
    },
  ],
  // The plan must have exactly `pageCount` pages, so the sample list is cycled
  // and renumbered rather than truncated — the server's validator checks this.
  pages: Array.from({ length: pageCount }, (_, index) => {
    const [title, narration, sceneDescription, characterIds, location, mood] =
      PAGES[index % PAGES.length];
    return {
      pageNumber: index + 1,
      title,
      narration,
      sceneDescription,
      characterIds,
      location,
      mood,
      illustrationPrompt: `3D storybook illustration. ${sceneDescription}`,
    };
  }),
});

const tasks = new Map();
let taskCounter = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });

  req.on('end', () => {
    const send = (payload, status = 200) => {
      const json = JSON.stringify(payload);
      res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
      res.end(json);
    };

    // --- Gemini Interactions API ---------------------------------------------
    if (url.pathname.endsWith('/interactions')) {
      const body = JSON.parse(raw || '{}');
      const asked = JSON.stringify(body.input ?? '');

      // The rewrite prompt and the plan prompt hit the same endpoint.
      const output = asked.includes('Rewrite this page')
        ? JSON.stringify({
            title: 'The Map That Knew His Name',
            narration: 'Aarav opened the book and the map inside it whispered, very quietly, hello.',
          })
        : body.response_format?.mime_type === 'application/json'
          ? JSON.stringify(plan(Number(asked.match(/Page count: (\d+)/)?.[1] ?? 6)))
          : 'That sounds like a lovely story. Tell me who it is for and I will draft the plan.';

      // Same shape as the live Interactions API: the reply lives in `steps`,
      // not in an `output_text` field.
      return send({
        id: `interaction-${++taskCounter}`,
        object: 'interaction',
        model: 'gemini-2.5-flash',
        status: 'completed',
        steps: [
          { type: 'thought', signature: 'dev-stub' },
          { type: 'model_output', content: [{ type: 'text', text: output }] },
        ],
        usage: { total_input_tokens: 120, total_output_tokens: 900, total_thought_tokens: 0 },
      });
    }

    // --- Kie.ai unified jobs API ----------------------------------------------
    if (url.pathname === '/api/v1/jobs/createTask') {
      const id = `task-${++taskCounter}`;
      tasks.set(id, { createdAt: Date.now() });
      return send({ code: 200, msg: 'ok', data: { taskId: id } });
    }

    if (url.pathname === '/api/v1/jobs/recordInfo') {
      const id = url.searchParams.get('taskId');
      const task = tasks.get(id);
      if (!task) return send({ code: 404, msg: 'not found' });

      // Four seconds of "generating" so progress states are visible.
      const done = Date.now() - task.createdAt > 4000;
      return send({
        code: 200,
        msg: 'ok',
        data: {
          taskId: id,
          model: 'nano-banana-pro',
          state: done ? 'success' : 'generating',
          resultJson: done
            ? JSON.stringify({ resultUrls: [`http://127.0.0.1:${PORT}/placeholder.png`] })
            : '',
          progress: done ? 100 : 45,
          costTime: 4200,
          creditsConsumed: 4,
        },
      });
    }

    if (url.pathname === '/placeholder.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': PNG.length });
      return res.end(PNG);
    }

    res.writeHead(404);
    return res.end();
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `AI stub: port ${PORT} is already in use — a stub is probably running ` +
        `already. Stop it, or set AI_STUB_PORT to something else.`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`AI stub (Gemini + Kie.ai) listening on http://127.0.0.1:${PORT} — development only.`);
});
