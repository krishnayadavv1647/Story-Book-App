import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Contract checks over the whole API surface, not one module at a time.
 *
 * These are the guarantees that are easy to keep while writing a route and easy
 * to forget while writing the next one, so they are asserted across every file
 * rather than trusted per review.
 */
const MODULES = path.resolve('server/src/modules');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : walk(full);
    }
    return full.endsWith('.js') ? [full] : [];
  });
}

const files = walk(MODULES);
const routeFiles = files.filter((file) => file.endsWith('.routes.js'));
const sourceFiles = files.filter((file) => !file.endsWith('.test.js'));

const read = (file) => readFileSync(file, 'utf8');
const relative = (file) => path.relative(process.cwd(), file).replace(/\\/g, '/');

/**
 * A child router inherits its parent's guard. `pages.routes.js` never names
 * `requireAuth` because it is mounted inside the books router, which does — so
 * the rule is "reachable only behind requireAuth", not "mentions requireAuth".
 */
const guardedByParent = new Set();
for (const file of routeFiles) {
  const source = read(file);
  if (!/requireAuth/.test(source)) continue;

  for (const [, child] of source.matchAll(/router\.use\(\s*'[^']*',\s*(\w+)\)/g)) {
    // `pageRoutes` -> pages.routes.js
    const stem = child.replace(/Routes$/, '').toLowerCase();
    for (const candidate of routeFiles) {
      if (path.basename(candidate).toLowerCase().startsWith(stem)) guardedByParent.add(candidate);
    }
  }
}

describe('every router requires a session', () => {
  it.each(routeFiles.map(relative))('%s', (file) => {
    const full = path.resolve(file);
    const source = read(full);

    // Health is public; the provider callback authenticates with an unguessable
    // token in its own path instead, and is documented as such.
    if (file.includes('health') || source.includes('kie/callback/:token')) return;

    const guarded = /requireAuth/.test(source) || guardedByParent.has(full);
    expect(guarded, `${file} is reachable without a session`).toBe(true);
  });
});

describe('router mounting is understood by these checks', () => {
  it('recognises the pages router as guarded by the books router', () => {
    // Guards against this whole file passing because the mount detection broke.
    expect([...guardedByParent].map(relative)).toContain(
      'server/src/modules/pages/pages.routes.js',
    );
  });
});

describe('ownership is proved, not assumed', () => {
  it('every book-scoped route loads the book through loadBook', () => {
    const source = read(path.resolve('server/src/modules/books/books.routes.js'));

    // Each `/:bookId/...` route must name loadBook, which is what proves the
    // caller owns it. A route that forgets would read someone else's book.
    const bookScoped = source
      .split(/router\.(get|post|patch|delete|use)\(/)
      .filter((chunk) => chunk.includes("'/:bookId"));

    expect(bookScoped.length).toBeGreaterThan(0);
    for (const chunk of bookScoped) {
      // `router.use` delegates to a child router that does the check itself.
      const delegated = chunk.includes('Routes)');
      expect(delegated || chunk.includes('loadBook')).toBe(true);
    }
  });
});

describe('secrets never reach a log or a response', () => {
  it('no source interpolates an API key into a string', () => {
    for (const file of sourceFiles) {
      const source = read(file);
      // Reading env.X_API_KEY is expected; putting it in a template or a log is
      // not.
      const leaks = source.match(/`[^`]*\$\{[^}]*(API_KEY|SECRET)[^}]*\}[^`]*`/g) ?? [];
      expect(leaks, `${relative(file)} interpolates a secret`).toEqual([]);
    }
  });

  it('no source logs a whole env or config object', () => {
    for (const file of sourceFiles) {
      const source = read(file);
      expect(source, relative(file)).not.toMatch(/logger\.\w+\(\s*\{\s*env\s*[,}]/);
      expect(source, relative(file)).not.toMatch(/console\.log\(\s*env\s*\)/);
    }
  });
});

describe('request bodies are validated', () => {
  it.each(routeFiles.map(relative))('%s validates every write', (file) => {
    const source = read(path.resolve(file));
    if (file.includes('health')) return;

    // The provider callback takes a body it deliberately does not trust: it is
    // treated as a hint and the task is re-read from the provider, so there is
    // nothing to validate it against.
    const withoutCallback = source.replace(
      /router\.post\(\s*'\/kie\/callback[\s\S]*?\n\);/,
      '',
    );

    // Split on each route declaration and check the writes.
    const writes = withoutCallback
      .split(/router\.(?=(?:post|patch|put)\()/)
      .slice(1)
      .filter((chunk) => !chunk.startsWith('use'));

    for (const chunk of writes) {
      const declaration = chunk.slice(0, chunk.indexOf(');') + 1);
      // A body-less action (mark all read, cancel, logout) needs no schema; one
      // that takes a body must name a validator.
      const takesBody = /body:/.test(declaration);
      const validated = /validate\(/.test(declaration);
      if (takesBody) expect(validated, `${file}: ${declaration.slice(0, 60)}`).toBe(true);
    }
  });
});

describe('expensive routes are rate limited', () => {
  const EXPENSIVE = [
    ['server/src/modules/books/books.routes.js', "'/:bookId/export'", 'exportLimiter'],
    ['server/src/modules/pages/pages.routes.js', "'/:pageId/rewrite'", 'generationLimiter'],
    ['server/src/modules/media/media.routes.js', "'/upload'", 'uploadLimiter'],
  ];

  it.each(EXPENSIVE)('%s guards %s', (file, route, limiter) => {
    const source = read(path.resolve(file));
    const at = source.indexOf(route);

    expect(at, `${route} not found in ${file}`).toBeGreaterThan(-1);
    // The limiter has to sit in the same route declaration.
    const declaration = source.slice(at, source.indexOf(');', at));
    expect(declaration).toContain(limiter);
  });
});

describe('deployment', () => {
  it('server/.env.example documents every variable the server reads', () => {
    const envSource = readFileSync(path.resolve('server/src/config/env.js'), 'utf8');
    const example = readFileSync(path.resolve('server/.env.example'), 'utf8');

    // Someone deploying this works from the template; a variable missing from it
    // is a variable they will only discover from a crash.
    const declared = [...envSource.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);

    expect(declared.length).toBeGreaterThan(20);
    const missing = declared.filter((key) => !example.includes(key));
    expect(missing, `missing from .env.example: ${missing.join(', ')}`).toEqual([]);
  });

  it('neither .env.example carries a real secret', () => {
    const example = readFileSync(path.resolve('server/.env.example'), 'utf8');

    for (const line of example.split('\n')) {
      const [key, ...rest] = line.split('=');
      if (!key || key.trim().startsWith('#')) continue;

      const value = rest.join('=').trim();
      if (!value) continue;

      // A committed template must never hold a usable credential.
      const looksLikeSecret = /(SECRET|API_KEY|TOKEN|PASSWORD)/.test(key);
      if (looksLikeSecret) {
        expect(
          /^(change-me|replace|your-|<|xxx|)/i.test(value),
          `${key.trim()} looks like a real value in a committed .env.example`,
        ).toBe(true);
      }
    }
  });
});

describe('environment loading', () => {
  it('looks for .env beside the server as well as at the repository root', async () => {
    const { ENV_FILES_LOADED } = await import('../../server/src/config/env.js');

    // The loader used to resolve the repository root only. With no root file
    // present every setting silently fell back to its default, so a filled-in
    // server/.env did nothing at all.
    const source = readFileSync(path.resolve('server/src/config/env.js'), 'utf8');

    expect(source).toMatch(/\.\.\/\.\.\/\.env/);
    expect(source).toMatch(/\.\.\/\.\.\/\.\.\/\.env/);
    // Whatever exists on this machine, the list only ever holds real files.
    for (const file of ENV_FILES_LOADED) expect(existsSync(file)).toBe(true);

    // And a developer's own .env must never decide whether the tests pass.
    expect(source).toMatch(/NODE_ENV === 'test'/);
  });
});

describe('the client template is public by construction', () => {
  it('holds only VITE_ variables, and no server secret', () => {
    const client = readFileSync(path.resolve('client/.env.example'), 'utf8');

    const keys = client
      .split('\n')
      .map((line) => line.replace(/^#\s*/, '').trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => line.split('=')[0]);

    expect(keys.length).toBeGreaterThan(0);
    // Vite inlines every VITE_* value into the bundle, so anything here is
    // published to every visitor.
    for (const key of keys) expect(key).toMatch(/^VITE_/);

    // Nothing in the client template may be active out of the box. A live
    // VITE_API_BASE_URL sends the browser straight at the API instead of
    // through Vite's proxy, which makes every request cross-origin — and the
    // refresh cookie is then never sent, so the session silently never sticks.
    const active = client
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line));

    expect(active, 'every line in client/.env.example must be commented out').toEqual([]);

    for (const forbidden of ['GEMINI', 'KIE', 'JWT', 'MONGODB', 'STORAGE', 'COOKIE']) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });
});

describe('a blank setting means "use the default"', () => {
  it('does not let an empty line replace a default with an empty string', async () => {
    const source = readFileSync(path.resolve('server/src/config/env.js'), 'utf8');

    // `KIE_BASE_URL=` in a .env file arrives as '', and z.string().default(x)
    // only fills in for undefined — so a blank line used to silently break the
    // setting, which is why every field had to be filled in by hand.
    // Look at schema entries (`KEY: z.string()…`), not the prose above them.
    const schemaLines = source
      .split('\n')
      .filter((line) => /^ {2}[A-Z][A-Z0-9_]*:/.test(line));

    expect(schemaLines.length).toBeGreaterThan(20);
    for (const line of schemaLines) {
      expect(line, `${line.trim()} still uses a default that a blank line defeats`).not.toMatch(
        /z\.string\(\)(\.optional\(\))?\.default\(/,
      );
    }
    expect(source).toMatch(/const str = \(fallback\)/);
  });

  it('every optional line in server/.env.example is commented, and every required one is not', () => {
    const example = readFileSync(path.resolve('server/.env.example'), 'utf8');

    // The point of the file is that someone can fill in a handful of lines and
    // stop. Anything with a working default should be commented out.
    const uncommented = example
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => line.split('=')[0]);

    // These genuinely have no sensible default — they are the ones to fill in.
    const expected = [
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'COOKIE_SECRET',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'KIE_API_KEY',
      'KIE_IMAGE_MODEL',
      'STORAGE_BUCKET',
    ];

    for (const key of expected) {
      expect(uncommented, `${key} should be a line someone fills in`).toContain(key);
    }

    // And the noisy ones are gone from view.
    for (const key of [
      'KIE_CREATE_PATH',
      'KIE_STATUS_PATH',
      'KIE_BASE_URL',
      'GEMINI_INTERACTIONS_PATH',
      'GEMINI_BASE_URL',
      'RATE_LIMIT_AUTH_MAX',
      'JWT_ACCESS_TTL',
    ]) {
      expect(uncommented, `${key} has a default and should be commented out`).not.toContain(key);
    }

    // Small enough to read in one go.
    expect(uncommented.length).toBeLessThan(30);
  });
});
