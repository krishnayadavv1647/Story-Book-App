import { describe, it, expect } from 'vitest';

import { fittedSize, PAGE_METRICS } from '../PageRender.jsx';

/**
 * A page with four lines on it should not be four lines adrift in white space.
 * These are the properties that make that true, rather than a snapshot of the
 * numbers the arithmetic happens to produce today.
 */
const LEAF = 648;
const BASE = LEAF * PAGE_METRICS.bodySize;
// The text leaf of a spread: 60% measure, most of the leaf's height.
const BOX = { width: LEAF * 0.6, height: (LEAF / 0.648) * 0.78, base: BASE };

const size = (text) => fittedSize({ text, ...BOX });

describe('sizing the type to the page', () => {
  it('sets a short page larger, so it fills the paper it is printed on', () => {
    expect(size('Mira caught the drop gently.')).toBeGreaterThan(size('x'.repeat(300)));
  });

  it('never goes below the book’s own size', () => {
    // However much a page has to say, it is still set in the book's face at the
    // book's size — shrinking it to fit would make one page unreadable.
    expect(size('x'.repeat(5000))).toBe(Math.round(BASE));
  });

  it('never becomes a poster', () => {
    const shout = size('Oh!');
    expect(shout).toBeLessThanOrEqual(Math.round(BASE * 2.3));
  });

  it('leaves a page of ordinary length at about the book’s own size', () => {
    // ~300 characters is a typical picture-book page, and the reference book
    // sets that at roughly the base size. The rule has to agree with it.
    const ordinary = size('One hot summer afternoon, Mira walked through her garden. '.repeat(5));
    expect(ordinary).toBeGreaterThanOrEqual(Math.round(BASE));
    expect(ordinary).toBeLessThan(Math.round(BASE * 1.4));
  });

  it('shrinks steadily as a page says more', () => {
    const sizes = [50, 150, 300, 600].map((n) => size('x'.repeat(n)));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
  });

  it('treats an empty page as one word rather than dividing by nothing', () => {
    expect(Number.isFinite(size(''))).toBe(true);
    expect(size('')).toBe(Math.round(BASE * 2.3));
  });
});
