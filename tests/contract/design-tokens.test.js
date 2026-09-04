import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOKENS_CSS = path.join(ROOT, 'client', 'src', 'styles', 'index.css');
const SRC = path.join(ROOT, 'client', 'src');
const COMPONENTS = path.join(SRC, 'components');

/**
 * The dark cinematic palette, supplied with the approved dashboard reference on
 * 2026-09-02 and authoritative for colour.
 *
 * This test is the tripwire for silent palette drift. If a token legitimately
 * changes, update this list and references/design-source-map.md, and say where
 * the new value came from.
 */
const PALETTE = {
  '--background': '#02090d',
  '--background-deep': '#010609',
  '--surface-primary': '#071216',
  '--surface-secondary': '#09171b',
  '--surface-elevated': '#0c1d21',
  '--surface-hover': '#10262a',
  '--surface-overlay': 'rgba(4, 13, 17, 0.94)',
  '--border-default': 'rgba(7, 48, 47, 0.63)',
  '--border-strong': 'rgba(2, 36, 34, 0.26)',
  '--border-muted': 'rgba(12, 60, 61, 0.07)',
  '--text-primary': '#f7f8f8',
  '--text-secondary': '#a9b4b5',
  '--text-muted': '#6f7e80',
  '--text-on-gold': '#221600',
  '--gold-start': '#f6c744',
  '--gold-middle': '#dba51c',
  '--gold-end': '#b87905',
  '--gold-border': '#f3c13d',
  '--gold-hover-start': '#ffd868',
  '--gold-hover-end': '#c98a09',
  '--gold-shadow': 'rgba(222, 164, 25, 0.28)',
  '--teal-primary': '#159b98',
  '--teal-bright': '#1bc1b9',
  '--teal-muted': '#0d5d5c',
  '--teal-focus': 'rgba(27, 193, 185, 0.28)',
  '--success': '#39b980',
  '--warning': '#e3ad32',
  '--danger': '#e26464',
  '--info': '#4b9fda',
  '--paper': '#ffffff',
  '--paper-ink': '#121214',
  '--paper-ink-muted': '#5c6063',
  '--paper-line': 'rgba(18, 18, 20, 0.12)',
  '--paper-hover': '#f1f3f4',
};

/** Measured geometry, unchanged by the theme — it still comes from the frames. */
const GEOMETRY = {
  '--sidebar-w': '274px',
  '--content-x': '28px',
};

/**
 * The light palette this theme replaced. Any of these reappearing means a screen
 * was reverted or a stale branch merged.
 */
const RETIRED = ['#b0ff00', '#edffba', '#a3d400', '#59bf00', '#6bd900', '#fbfbfb', '#dbdee0'];

function walk(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

const sourceFiles = () => walk(SRC).filter((f) => /\.jsx?$/.test(f) && !f.includes('__tests__'));

/**
 * Comments are stripped before scanning: components cite a measured value in a
 * comment on purpose, and a comment renders nothing. Only code can leak a
 * literal colour into the UI.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('built stylesheet', () => {
  const distDir = path.join(ROOT, 'client', 'dist', 'assets');
  const built = existsSync(distDir);
  const css = built
    ? walk(distDir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n')
    : '';

  // Proves the class actually produced a rule, rather than being dropped.
  it.runIf(built).each(['bg-scrim', 'bg-teal-soft', 'border-hairline', 'text-ink-muted'])(
    'emits a rule for %s',
    (className) => {
      expect(css).toContain(`.${className}{`);
    },
  );

  it.runIf(built).each(['surface-gold', 'surface-gold-nav', 'surface-card', 'surface-sidebar'])(
    'emits the shared %s class',
    (className) => {
      expect(css).toContain(`.${className}{`);
    },
  );

  /**
   * Catches a class that names a token which does not exist. Tailwind emits
   * nothing for `text-ink-subtle` if `ink-subtle` was never defined — the
   * element simply renders unstyled, with no error anywhere. A whole palette
   * rename is exactly when this happens, so the scan covers all of src.
   */
  it.runIf(built)('emits a rule for every token colour class used in source', () => {
    const families =
      'page|page-deep|surface|tag|pill|avatar|skeleton|ink|hairline|gold|teal|scrim|' +
      'danger|warning|success|info|cover-placeholder|cover-glyph';
    const pattern = new RegExp(
      `\\b(?:bg|text|border|fill|stroke|divide|outline|ring|accent)-(?:${families})(?:-[a-z0-9-]+)?\\b`,
      'g',
    );

    const used = new Set();
    for (const file of sourceFiles()) {
      for (const match of stripComments(readFileSync(file, 'utf8')).matchAll(pattern)) {
        used.add(match[0]);
      }
    }

    /**
     * A class does not always compile to a bare `.name{` rule:
     *   - a variant escapes the colon      → `.hover\:text-surface:hover{`
     *   - `divide-*` builds a compound     → `.divide-hairline>:not([hidden])…`
     * So match the class followed by any character that can continue a selector,
     * rather than assuming the rule opens immediately.
     */
    const emitted = (className) =>
      new RegExp(`[.\\\\:]${className.replace(/[-]/g, '\\-')}[{:>~+,\\s]`).test(css);

    const missing = [...used].filter((className) => !emitted(className));

    expect(missing, `these classes name a token that does not exist: ${missing.join(', ')}`).toEqual(
      [],
    );
  });
});

describe('design tokens match the approved dark palette', () => {
  const css = readFileSync(TOKENS_CSS, 'utf8');

  it.each(Object.entries({ ...PALETTE, ...GEOMETRY }))('%s is %s', (token, value) => {
    const match = css.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
    expect(match, `${token} is not declared`).not.toBeNull();
    expect(match[1].trim()).toBe(value);
  });

  it('declares every token the Tailwind theme references', () => {
    const config = readFileSync(path.join(ROOT, 'client', 'tailwind.config.js'), 'utf8');
    const referenced = [...config.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]);

    expect(referenced.length).toBeGreaterThan(0);
    for (const token of new Set(referenced)) {
      expect(css, `${token} is used by the theme but never declared`).toContain(`${token}:`);
    }
  });

  it('has not reverted to the retired light palette', () => {
    const offenders = [];
    for (const file of [TOKENS_CSS, ...sourceFiles()]) {
      const code = stripComments(readFileSync(file, 'utf8')).toLowerCase();
      for (const colour of RETIRED) {
        if (code.includes(colour)) offenders.push(`${path.relative(ROOT, file)}: ${colour}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Gold is the product's "this is the main action" signal. It only works if there
 * is exactly one of it, so the gradient is declared once and reused — the
 * selected sidebar row wears the same tokens as the primary button.
 */
describe('the gold action style is shared, not copied', () => {
  const css = readFileSync(TOKENS_CSS, 'utf8');

  it.each(['.surface-gold', '.surface-gold-nav'])('%s is built from the gold tokens', (selector) => {
    const block = css.slice(css.indexOf(`${selector} {`));
    const declaration = block.slice(0, block.indexOf('}'));

    expect(declaration).toContain('var(--gold-start)');
    expect(declaration).toContain('var(--gold-middle)');
    expect(declaration).toContain('var(--gold-end)');
    expect(declaration).toContain('var(--text-on-gold)');
  });

  it('is the only place a gold gradient is written', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/linear-gradient\([^)]*gold/.test(code)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('never puts gold ink on a gold fill', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
      const code = stripComments(readFileSync(file, 'utf8'));
      // `surface-gold` sets the on-gold ink itself; a `text-gold` alongside it
      // would paint the label the same colour as its own background.
      for (const line of code.split('\n')) {
        if (/surface-gold/.test(line) && /text-gold\b/.test(line)) {
          offenders.push(`${path.relative(ROOT, file)}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('components use tokens, not literal colours', () => {
  const files = walk(COMPONENTS).filter((f) => /\.jsx?$/.test(f) && !f.includes('__tests__'));

  it('has components to inspect', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  /**
   * Scoped to `components/` on purpose. Screens under `features/` legitimately
   * carry literal colours that are book *content* — a page's authored
   * background and text colour — which must not be themed away.
   */
  it('contains no hardcoded hex colour in code', () => {
    const offenders = [];

    for (const file of files) {
      const matches = stripComments(readFileSync(file, 'utf8')).match(/#[0-9a-fA-F]{3,8}\b/g);
      if (matches) offenders.push(`${path.relative(ROOT, file)}: ${matches.join(', ')}`);
    }

    expect(offenders).toEqual([]);
  });

  /**
   * Our tokens hold hex and rgba values, not bare RGB channels, so Tailwind v3
   * cannot build an opacity modifier from them — `bg-ink/30` compiles to NOTHING
   * and the element silently renders with no colour at all. jsdom never
   * evaluates the stylesheet, so no component test can catch it. This scan
   * covers all of src: the one live instance of this bug was on a page, not in a
   * component.
   */
  it('never applies an opacity modifier to a token colour', () => {
    const tokenColours = [
      'page', 'page-deep', 'surface', 'surface-secondary', 'surface-elevated', 'surface-hover',
      'surface-overlay', 'tag', 'pill', 'avatar', 'skeleton', 'ink', 'ink-muted', 'ink-subtle',
      'ink-on-gold', 'hairline', 'hairline-strong', 'hairline-muted', 'gold', 'gold-start',
      'gold-middle', 'gold-end', 'gold-border', 'teal', 'teal-bright', 'teal-muted', 'teal-soft',
      'scrim', 'danger', 'warning', 'success', 'info',
    ].join('|');
    const modifier = new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|divide|outline|accent)-(?:${tokenColours})\\/\\d`,
    );

    const offenders = [];
    for (const file of sourceFiles()) {
      const match = stripComments(readFileSync(file, 'utf8')).match(modifier);
      if (match) offenders.push(`${path.relative(ROOT, file)}: ${match[0]}`);
    }

    expect(offenders).toEqual([]);
  });

  it('contains no arbitrary Tailwind colour value', () => {
    const offenders = [];
    // e.g. bg-[#fff] or text-[rgb(0,0,0)] — both bypass the token scale.
    const arbitraryColour = /\b(?:bg|text|border|fill|stroke|ring|shadow)-\[(?:#|rgb|hsl)/;

    for (const file of files) {
      if (arbitraryColour.test(stripComments(readFileSync(file, 'utf8')))) {
        offenders.push(path.relative(ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * A raw palette class bypasses the theme entirely and will not follow it when
   * a token changes. The literal `black`/`white` scrims over artwork are the
   * documented exception: they are a photographic overlay, not a themed surface.
   */
  it('reaches for no raw Tailwind palette colour', () => {
    const palette =
      'slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|' +
      'indigo|violet|purple|fuchsia|pink|rose';
    const raw = new RegExp(
      `\\b(?:bg|text|border|from|via|to|ring|fill|stroke|accent|outline)-(?:${palette})-\\d{2,3}\\b`,
    );

    const offenders = [];
    for (const file of sourceFiles()) {
      const match = stripComments(readFileSync(file, 'utf8')).match(raw);
      if (match) offenders.push(`${path.relative(ROOT, file)}: ${match[0]}`);
    }

    expect(offenders).toEqual([]);
  });
});
