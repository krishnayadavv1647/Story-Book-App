import { describe, it, expect } from 'vitest';

import { checkPrintReadiness } from '../printChecker.js';

/** A well-formed 8-page book: title, six illustrated stories, ending. */
function completeBook({ binding = 'stapled', assetWidth = 2500, assetHeight = 2500 } = {}) {
  const pages = [{ _id: 't', order: 1, type: 'title', title: 'A Book', narration: 'Written by X' }];
  const assetsById = new Map();
  for (let i = 0; i < 6; i += 1) {
    const assetId = `a${i}`;
    pages.push({ _id: `s${i}`, order: i + 2, type: 'story', mediaAssetId: assetId, narration: 'text' });
    assetsById.set(assetId, { exists: true, width: assetWidth, height: assetHeight });
  }
  pages.push({ _id: 'e', order: 8, type: 'ending', title: 'The End', narration: 'A moral.' });

  return { book: { print: { size: '8x8', binding } }, pages, assetsById };
}

const codes = (report) => report.issues.map((i) => i.code);

describe('checkPrintReadiness', () => {
  it('passes a complete, well-illustrated book with no blocking errors', () => {
    const report = checkPrintReadiness(completeBook());

    expect(report.ok).toBe(true);
    expect(report.blocking).toBe(false);
    expect(report.counts.errors).toBe(0);
    // Stapled at 8 pages is valid, and 2500px art clears 300 DPI on an 8in page.
    expect(codes(report)).not.toContain('PAGE_COUNT');
    expect(codes(report)).not.toContain('LOW_RESOLUTION');
    // It still reports the exact print dimensions.
    expect(report.geometry.page.trim.widthPx).toBe(2400);
  });

  it('warns (not blocks) when the title or ending page is missing', () => {
    const { book, assetsById } = completeBook();
    const pages = [
      { _id: 's0', order: 1, type: 'story', mediaAssetId: 'a0', narration: 'text' },
    ];
    const report = checkPrintReadiness({ book, pages, assetsById });

    expect(codes(report)).toContain('MISSING_TITLE_PAGE');
    expect(codes(report)).toContain('MISSING_ENDING_PAGE');
    // Missing structural pages are acknowledgeable warnings, not export blockers.
    expect(report.blocking).toBe(false);
  });

  it('warns about a low-resolution illustration but still allows export', () => {
    const report = checkPrintReadiness(completeBook({ assetWidth: 1200, assetHeight: 1200 }));

    const lowRes = report.issues.find((i) => i.code === 'LOW_RESOLUTION');
    expect(lowRes).toBeDefined();
    expect(lowRes.severity).toBe('warning');
    // 1200px on an 8in page is ~150 DPI.
    expect(lowRes.effectiveDpi).toBe(150);
    expect(report.ok).toBe(true);
  });

  it('blocks export when a page references a missing media file', () => {
    const { book, pages, assetsById } = completeBook();
    assetsById.set('a2', { exists: false, width: null, height: null });

    const report = checkPrintReadiness({ book, pages, assetsById });
    expect(report.ok).toBe(false);
    expect(report.blocking).toBe(true);
    expect(codes(report)).toContain('MISSING_MEDIA');
  });

  it('blocks export when the page order has a gap', () => {
    const { book, assetsById } = completeBook();
    const pages = [
      { _id: 't', order: 1, type: 'title' },
      { _id: 's', order: 3, type: 'story', mediaAssetId: 'a0' }, // gap at 2
    ];
    const report = checkPrintReadiness({ book, pages, assetsById });

    expect(codes(report)).toContain('PAGE_ORDER_BROKEN');
    expect(report.blocking).toBe(true);
  });

  it('flags very saturated colours and labels the output RGB', () => {
    const { book, assetsById } = completeBook();
    const pages = [
      { _id: 't', order: 1, type: 'title', layout: { backgroundColor: '#00ff44' } }, // neon green
      { _id: 's0', order: 2, type: 'story', mediaAssetId: 'a0' },
      { _id: 'e', order: 3, type: 'ending' },
    ];

    const report = checkPrintReadiness({ book, pages, assetsById });
    expect(codes(report)).toContain('HIGH_SATURATION');
    expect(codes(report)).toContain('COLOUR_MODE');
    // Never labelled CMYK when there is no conversion pipeline.
    expect(report.colorMode).toBe('rgb');
  });

  it('warns with a printer-specific page count for the wrong binding', () => {
    const report = checkPrintReadiness(completeBook({ binding: 'paperback' }));

    const pc = report.issues.find((i) => i.code === 'PAGE_COUNT');
    expect(pc).toBeDefined();
    expect(pc.nextValid).toBe(24); // paperback minimum
    // A page-count mismatch is a warning, not a hard block.
    expect(report.ok).toBe(true);
  });
});
