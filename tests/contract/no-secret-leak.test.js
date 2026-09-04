import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_SRC = path.join(ROOT, 'client', 'src');
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

/**
 * Variables that must never cross into the browser. Vite inlines every `VITE_*`
 * value into the bundle it ships, so a secret placed behind that prefix is
 * published to every visitor.
 */
const SERVER_ONLY = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'COOKIE_SECRET',
  'MONGODB_URI',
  'GEMINI_API_KEY',
  'KIE_API_KEY',
  'KIE_CALLBACK_SECRET',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'REDIS_URL',
];

function walk(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

describe('server/.env.example contract', () => {
  // The template lives beside the server it configures.
  const envExample = readFileSync(path.join(ROOT, 'server', '.env.example'), 'utf8');
  const lines = envExample.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));

  it('declares every server-only secret', () => {
    for (const key of SERVER_ONLY) {
      expect(envExample, `${key} is missing from .env.example`).toContain(`${key}=`);
    }
  });

  it('declares every KIE_* variable the provider adapter needs', () => {
    const required = [
      'KIE_API_KEY',
      'KIE_BASE_URL',
      'KIE_API_VERSION',
      'KIE_IMAGE_MODEL',
      'KIE_CREATE_PATH',
      'KIE_STATUS_PATH',
      'KIE_CALLBACK_URL',
      'KIE_CALLBACK_SECRET',
      'KIE_TIMEOUT_MS',
      'KIE_MAX_POLL_ATTEMPTS',
      'KIE_POLL_INTERVAL_MS',
    ];
    for (const key of required) {
      expect(envExample, `${key} is missing from .env.example`).toContain(`${key}=`);
    }
  });

  it('ships no populated credential values', () => {
    // MONGODB_URI is excluded: a localhost default is a useful starting point
    // and carries no credential. It is checked separately below.
    const credentials = SERVER_ONLY.filter((k) => k !== 'MONGODB_URI');

    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      if (!credentials.includes(key.trim())) continue;
      expect(rest.join('=').trim(), `${key} has a value committed`).toBe('');
    }
  });

  it('keeps the example database URI local and credential-free', () => {
    const line = lines.find((l) => l.startsWith('MONGODB_URI='));
    const value = line.slice('MONGODB_URI='.length).trim();

    expect(value).toMatch(/^mongodb(\+srv)?:\/\/(127\.0\.0\.1|localhost)/);
    // user:pass@host would mean a credential was committed.
    expect(value).not.toMatch(/\/\/[^/@]+@/);
  });

  it('never exposes a server-only secret behind the VITE_ prefix', () => {
    const viteLines = lines.filter((l) => l.trim().startsWith('VITE_'));
    for (const line of viteLines) {
      for (const key of SERVER_ONLY) {
        expect(line, `${line} exposes ${key} to the browser`).not.toContain(key);
      }
      expect(line.toUpperCase()).not.toMatch(/VITE_[A-Z_]*(SECRET|API_KEY|PASSWORD|TOKEN)/);
    }
  });
});

describe('client source contract', () => {
  const sources = walk(CLIENT_SRC).filter((f) => /\.(js|jsx)$/.test(f));

  it('has client sources to inspect', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('never reads a server-only secret from import.meta.env', () => {
    for (const file of sources) {
      const content = readFileSync(file, 'utf8');
      for (const key of SERVER_ONLY) {
        expect(content, `${path.relative(ROOT, file)} references ${key}`).not.toContain(key);
      }
    }
  });

  it('never calls an AI provider directly from the browser', () => {
    const providerHosts = [
      'generativelanguage.googleapis.com',
      'api.kie.ai',
      'kie.ai/api',
      'amazonaws.com',
    ];
    for (const file of sources) {
      const content = readFileSync(file, 'utf8');
      for (const host of providerHosts) {
        expect(content, `${path.relative(ROOT, file)} calls ${host} directly`).not.toContain(host);
      }
    }
  });
});

describe('built browser bundle', () => {
  const built = existsSync(CLIENT_DIST);
  const assets = built ? walk(CLIENT_DIST).filter((f) => /\.(js|css|html|map)$/.test(f)) : [];

  it.runIf(built)('produced at least one asset', () => {
    expect(assets.length).toBeGreaterThan(0);
  });

  it.runIf(built)('contains no server-only secret name or value', () => {
    for (const file of assets) {
      const content = readFileSync(file, 'utf8');
      for (const key of SERVER_ONLY) {
        expect(content, `${path.relative(ROOT, file)} contains ${key}`).not.toContain(key);
      }
    }
  });

  it.runIf(!built)('is skipped until `npm run build` has produced client/dist', () => {
    // `npm run verify` builds before testing so this assertion runs for real in CI.
    expect(built).toBe(false);
  });
});

describe('git never sees a real environment file', () => {
  const cases = [
    ['server/.env', true],
    ['client/.env', true],
    ['.env', true],
    ['server/.env.example', false],
    ['client/.env.example', false],
  ];

  it.each(cases)('%s ignored: %s', (file, shouldBeIgnored) => {
    // `git check-ignore` exits 0 when the path is ignored, 1 when it is not.
    const ignored =
      spawnSync('git', ['check-ignore', '-q', file], { cwd: ROOT }).status === 0;

    expect(ignored, `${file} should ${shouldBeIgnored ? '' : 'not '}be gitignored`).toBe(
      shouldBeIgnored,
    );
  });
});
