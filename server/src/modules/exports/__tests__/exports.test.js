import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import zlib from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Book, BookPage, ExportJob, MediaAsset } from '../../../models/index.js';
import { ingestBuffer, storage } from '../../../providers/storage/index.js';
import { pageBox, frameFor } from '../render/layout.js';
import { loadPages, suggestFilename } from '../exports.service.js';
import { renderBookPdf } from '../render/pdf.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_exports_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

// A real 2×2 PNG, so the renderers decode actual image bytes rather than a stub.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mM8w8DwnwEJMOEUGdECAKAaAv3rzZgUAAAAAElFTkSuQmCC',
  'base64',
);

async function signUp(email = 'krishna@example.com') {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function seedBook(userId, { pages: count = 3, illustrated = true } = {}) {
  const book = await Book.create({
    ownerId: userId,
    title: 'Aarav and the Whispering Forest',
    description: 'A boy and a firefly.',
    moral: 'Kindness and courage',
    // The model requires at least one; `count: 0` means "no page rows exist".
    pageCount: Math.max(count, 1),
    status: 'ready',
  });

  for (let index = 0; index < count; index += 1) {
    let assetId = null;
    if (illustrated) {
      const asset = await ingestBuffer({
        body: PNG,
        contentType: 'image/png',
        ownerId: userId,
        kind: 'page_image',
      });
      assetId = asset._id;
    }

    await BookPage.create({
      bookId: book._id,
      ownerId: userId,
      order: index + 1,
      title: `Page ${index + 1}`,
      narration: `Narration for page ${index + 1}, long enough to wrap across a line or two.`,
      mediaAssetId: assetId,
      status: illustrated ? 'ready' : 'pending',
      layout: { preset: index === 0 ? 'full-bleed' : 'image-top', backgroundColor: '#FFFFFF' },
    });
  }

  return book;
}

describe('export layout', () => {
  it('adds bleed to every edge and keeps the trim box the finished size', () => {
    const plain = pageBox({ pageSize: '8x10in', orientation: 'portrait' });
    const bled = pageBox({ pageSize: '8x10in', orientation: 'portrait', bleedMm: 3 });

    expect(plain.width).toBe(576);
    expect(plain.height).toBe(720);
    // The sheet grows; the finished page does not.
    expect(bled.width).toBeGreaterThan(plain.width);
    expect(bled.trim.width).toBe(576);
    expect(bled.trim.x).toBeCloseTo(bled.bleed, 5);
  });

  it('turns a landscape request into a wider page than tall', () => {
    const box = pageBox({ pageSize: 'a4', orientation: 'landscape' });
    expect(box.width).toBeGreaterThan(box.height);
  });

  it('gives text-only pages no image rect, and full-bleed an overlay', () => {
    const box = pageBox({ pageSize: 'a4' }).trim;

    expect(frameFor('text-only', box).image).toBeNull();
    expect(frameFor('full-bleed', box).overlay).toBe(true);
    expect(frameFor('image-top', box).overlay).toBe(false);

    // A picture book is mostly picture: the art takes the larger share, and the
    // text sits beside or beneath it. An even split left the words stranded at
    // the top of a half-empty page.
    const left = frameFor('image-left', box);
    expect(left.image.width).toBeGreaterThan(left.text.width);
    expect(left.image.x).toBeLessThan(left.text.x);

    const right = frameFor('image-right', box);
    expect(right.image.width).toBeGreaterThan(right.text.width);
    expect(right.text.x).toBeLessThan(right.image.x);

    const top = frameFor('image-top', box);
    expect(top.image.y).toBeLessThan(top.text.y);
    expect(top.image.height).toBeGreaterThan(top.text.height);
    // The two never overlap.
    expect(top.image.y + top.image.height).toBeLessThanOrEqual(top.text.y);

    const bottom = frameFor('image-bottom', box);
    expect(bottom.text.y).toBeLessThan(bottom.image.y);
  });
});

describe('filenames', () => {
  it('makes a safe filename from the title', () => {
    expect(suggestFilename({ title: 'Aarav & the Whispering Forest!' }, 'pdf')).toBe(
      'Aarav-the-Whispering-Forest.pdf',
    );
    expect(suggestFilename({ title: '   ' }, 'png')).toBe('storybook.png');
    expect(suggestFilename({ title: '***' }, 'pdf')).toBe('storybook.pdf');
  });
});

describe('GET /books/:bookId/export/options', () => {
  it('reports what is missing before you export', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2, illustrated: false });

    const res = await asUser(
      request(app).get(`${API_PREFIX}/books/${book._id}/export/options`),
      token,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.readiness.ready).toBe(false);
    expect(res.body.data.readiness.missingArt).toEqual([1, 2]);
    expect(res.body.data.filename.pdf).toBe('Aarav-and-the-Whispering-Forest.pdf');
    expect(res.body.data.pageSizes.map((s) => s.value)).toContain('a4');
  });

  it('says a fully illustrated book is ready', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(
      request(app).get(`${API_PREFIX}/books/${book._id}/export/options`),
      token,
    );

    expect(res.body.data.readiness.ready).toBe(true);
    expect(res.body.data.readiness.missingArt).toEqual([]);
  });
});

describe('GET /books/:bookId/print-check', () => {
  it('returns a print report with dimensions and does not change the book', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(
      request(app).get(`${API_PREFIX}/books/${book._id}/print-check`),
      token,
    );

    expect(res.status).toBe(200);
    const report = res.body.data;
    expect(typeof report.ok).toBe('boolean');
    expect(Array.isArray(report.issues)).toBe(true);
    // It states the exact printed dimensions for the book's size (8×8 default).
    expect(report.geometry.page.trim.widthPx).toBe(2400);
    // The seeded book has no title/ending pages, so it flags them as warnings.
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain('MISSING_TITLE_PAGE');

    // The check is read-only: the pages are untouched.
    const stillTwo = await BookPage.countDocuments({ bookId: book._id });
    expect(stillTwo).toBe(2);
  });
});

describe('POST /books/:bookId/export', () => {
  it('produces a real PDF and stores it', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 3 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'pdf', quality: 'high', options: { pageSize: '8x10in' } },
    );

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('succeeded');
    expect(res.body.data.downloadUrl).toBeTruthy();
    // Cover + 3 pages + back cover.
    expect(res.body.data.pageCount).toBe(5);

    const asset = await MediaAsset.findById(res.body.data.outputAssetId);
    expect(asset.storage.contentType).toBe('application/pdf');

    const stored = await storage.get(asset.storage.key);
    // A real PDF, not an empty file with the right name.
    expect(stored.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(stored.body.length).toBeGreaterThan(1000);
  });

  it('produces a real PNG containing every page', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'png', quality: 'standard' },
    );

    expect(res.status).toBe(201);
    expect(res.body.data.pageCount).toBe(2);

    const asset = await MediaAsset.findById(res.body.data.outputAssetId);
    const stored = await storage.get(asset.storage.key);

    expect(stored.body.subarray(1, 4).toString()).toBe('PNG');
    expect(stored.body.length).toBeGreaterThan(1000);
  });

  it('produces a self-contained interactive flipbook', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'html', quality: 'standard' },
    );

    expect(res.status).toBe(201);
    expect(res.body.data.downloadUrl).toBeTruthy();
    // Cover + 2 pages + back cover.
    expect(res.body.data.pageCount).toBe(4);

    const asset = await MediaAsset.findById(res.body.data.outputAssetId);
    expect(asset.storage.contentType).toBe('text/html; charset=utf-8');

    const stored = await storage.get(asset.storage.key);
    const html = stored.body.toString('utf8');

    expect(html).toContain('<!doctype html>');
    // The flip engine travels inside the file, so it works straight from disk...
    expect(html).toContain('turnForward');
    // ...and pulls in nothing from the network — no external src/href anywhere.
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
  });

  it('produces a print-ready PDF at the true physical size with bleed', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'print_pdf' },
    );

    expect(res.status).toBe(201);
    const asset = await MediaAsset.findById(res.body.data.outputAssetId);
    expect(asset.storage.contentType).toBe('application/pdf');

    const stored = await storage.get(asset.storage.key);
    const pdf = stored.body.toString('latin1');
    expect(stored.body.subarray(0, 5).toString()).toBe('%PDF-');
    // 8×8 in at 0.125 in bleed → (8 + 0.25) × 72 = 594 pt each side.
    expect(pdf).toMatch(/\/MediaBox \[0 0 594(\.0+)? 594/);
  });

  it('produces a full cover spread wider than two covers', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'cover_spread' },
    );

    expect(res.status).toBe(201);
    const asset = await MediaAsset.findById(res.body.data.outputAssetId);
    expect(asset.storage.contentType).toBe('image/png');

    const stored = await storage.get(asset.storage.key);
    expect(stored.body.subarray(1, 4).toString()).toBe('PNG');

    // A PNG's width lives in the IHDR, bytes 16–19 (big-endian). Back + front are
    // 2400px each on an 8×8 book, so the spread clears 4800.
    const width = stored.body.readUInt32BE(16);
    expect(width).toBeGreaterThan(4800);
  });

  it('bundles individual 300-DPI PNG pages into a zip', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'png_pages' },
    );

    expect(res.status).toBe(201);
    const asset = await MediaAsset.findById(res.body.data.outputAssetId);
    expect(asset.storage.contentType).toBe('application/zip');

    const stored = await storage.get(asset.storage.key);
    // A zip starts with the local-file-header signature "PK\x03\x04".
    expect(stored.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // Its central directory names the page PNGs.
    expect(stored.body.toString('latin1')).toMatch(/page-01-.*\.png/);
  });

  it('exports a single front cover PNG', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'cover_front' },
    );

    expect(res.status).toBe(201);
    const asset = await MediaAsset.findById(res.body.data.outputAssetId);
    expect(asset.storage.contentType).toBe('image/png');

    const stored = await storage.get(asset.storage.key);
    expect(stored.body.subarray(1, 4).toString()).toBe('PNG');
    // One 8×8 cover with bleed is ~2476px wide, not a spread.
    expect(stored.body.readUInt32BE(16)).toBeLessThan(2600);
  });

  it('returns the file it already made rather than rendering it twice', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const body = { format: 'pdf', quality: 'standard', options: {} };
    const first = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/export`),
      token,
    ).send(body);

    const second = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/export`),
      token,
    ).send(body);

    expect(second.status).toBe(200);
    expect(second.body.data.reused).toBe(true);
    expect(second.body.data._id).toBe(first.body.data._id);
    expect(await ExportJob.countDocuments({ bookId: book._id })).toBe(1);
  });

  it('renders again once the book has actually changed', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });
    const body = { format: 'pdf', quality: 'standard', options: {} };

    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(body);

    await Book.updateOne({ _id: book._id }, { $set: { title: 'A different title' } });

    const second = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/export`),
      token,
    ).send(body);

    expect(second.status).toBe(201);
    expect(second.body.data.reused).toBe(false);
  });

  it('refuses a book with no pages', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 0 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'pdf' },
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOTHING_TO_EXPORT');
  });

  it('rejects a page size that is not offered', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 1 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'pdf', options: { pageSize: 'billboard' } },
    );

    expect(res.status).toBe(422);
  });

  it('will not export someone else’s book', async () => {
    const owner = await signUp();
    const book = await seedBook(owner.userId, { pages: 1 });
    const stranger = await signUp('stranger@example.com');

    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/export`),
      stranger.token,
    ).send({ format: 'pdf' });

    expect(res.status).toBe(404);
    expect(await ExportJob.countDocuments({})).toBe(0);
  });

  it('exports a book whose pages have no illustrations yet', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2, illustrated: false });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'pdf' },
    );

    // Not ready is a warning on the screen, not a refusal — a text-only draft
    // is a legitimate thing to want on paper.
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('succeeded');
  });
});

describe('loading a book for rendering', () => {
  it('loads each illustration’s bytes, and null where there is none', async () => {
    const { userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });
    await BookPage.updateOne({ bookId: book._id, order: 2 }, { $set: { mediaAssetId: null } });

    const pages = await loadPages(book._id);

    expect(pages).toHaveLength(2);
    // Page 1 has art: real bytes, not a null the renderer would quietly skip.
    expect(Buffer.isBuffer(pages[0].image)).toBe(true);
    expect(pages[0].image.subarray(1, 4).toString()).toBe('PNG');
    expect(pages[1].image).toBeNull();
  });
});

describe('publishing', () => {
  it('publishes and unpublishes a book', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 1 });

    const published = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/publish`),
      token,
    ).send({ published: true });

    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('published');
    expect(published.body.data.publishedAt).toBeTruthy();

    const reverted = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/publish`),
      token,
    ).send({ published: false });

    expect(reverted.body.data.status).toBe('ready');
    expect(reverted.body.data.publishedAt).toBeNull();
  });
});

describe('GET /exports', () => {
  it('lists this account’s exports, newest first, and nobody else’s', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 1 });
    const stranger = await signUp('stranger@example.com');
    const theirBook = await seedBook(stranger.userId, { pages: 1 });

    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send({
      format: 'pdf',
    });
    await asUser(
      request(app).post(`${API_PREFIX}/books/${theirBook._id}/export`),
      stranger.token,
    ).send({ format: 'pdf' });

    const res = await asUser(request(app).get(`${API_PREFIX}/exports`), token);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(String(res.body.data[0].bookId)).toBe(String(book._id));
    expect(res.body.data[0].downloadUrl).toBeTruthy();
  });
});

describe('downloading the finished file', () => {
  it('is offered from our own origin, not the storage bucket', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/export`), token).send(
      { format: 'pdf' },
    );

    // A browser ignores `download` on a cross-origin link, so a presigned
    // bucket URL navigated the page to the PDF instead of saving it. The link
    // must point at our own signed media path.
    expect(res.body.data.downloadUrl).toMatch(/^\/api\/v1\/media\//);
    expect(res.body.data.downloadUrl).toMatch(/exp=\d+/);
    expect(res.body.data.downloadUrl).toMatch(/sig=/);
    expect(res.body.data.downloadUrl).not.toMatch(/^https?:\/\//);
  });

  it('arrives as an attachment under the book’s name', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 2 });

    const created = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/export`),
      token,
    ).send({ format: 'pdf' });

    const file = await request(app).get(created.body.data.downloadUrl);

    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    // Named for the book, not a UUID, and sent as a download.
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);
    expect(file.headers['content-disposition']).toContain('Aarav-and-the-Whispering-Forest.pdf');
    expect(file.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('refuses a download link that has been tampered with', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId, { pages: 1 });

    const created = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/export`),
      token,
    ).send({ format: 'pdf' });

    const tampered = created.body.data.downloadUrl.replace(/sig=[^&]+/, 'sig=forged');
    expect((await request(app).get(tampered)).status).toBe(403);
  });
});

/**
 * Reads the drawing operators back out of a rendered PDF.
 *
 * Page content is Flate-compressed, so the only honest way to assert where
 * something landed is to inflate the stream and read the operators pdfkit
 * actually wrote.
 */
function pageOperators(pdf) {
  const streams = [];
  let at = 0;

  while (true) {
    const start = pdf.indexOf('stream', at);
    if (start < 0) break;

    let from = start + 6;
    if (pdf[from] === 0x0d) from += 1;
    if (pdf[from] === 0x0a) from += 1;

    const end = pdf.indexOf('endstream', from);
    if (end < 0) break;

    try {
      const text = zlib.inflateSync(pdf.subarray(from, end)).toString('latin1');
      if (text.includes(' cm')) streams.push(text);
    } catch {
      // Not a Flate stream (fonts, images) — not what we are reading.
    }
    at = end + 9;
  }

  return streams;
}

/** The `w 0 0 h x y cm` placement of each image, in top-down page coordinates. */
function imagePlacements(content) {
  const lines = content.split('\n').map((line) => line.trim());

  return lines.flatMap((line, index) => {
    if (!/\/I\d+ Do$/.test(line)) return [];

    const cm = lines
      .slice(0, index)
      .reverse()
      .find((earlier) => earlier.endsWith(' cm') && !earlier.startsWith('1 0 0 -1'));
    if (!cm) return [];

    const [width, , , height, x, y] = cm.replace(' cm', '').split(' ').map(Number);
    return [{ x, width, y, height: Math.abs(height), clipped: lines.slice(0, index).includes('W n') }];
  });
}

describe('the PDF renderer', () => {
  // A wide picture in a squarer box: covering it scales by height, so the
  // surplus goes sideways. That surplus used to be drawn, not cropped, putting
  // the illustration 35pt into each margin and the cover off the paper edge.
  const WIDE = (() => {
    const canvas = createCanvas(400, 200);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4488CC';
    ctx.fillRect(0, 0, 400, 200);
    return canvas.toBuffer('image/png');
  })();

  const page = {
    order: 1,
    title: 'The Dry Garden',
    narration: 'Mira walked through her garden.',
    layout: { preset: 'image-top', backgroundColor: '#FFFFFF' },
    typography: { fontSize: 18, lineHeight: 1.5, textAlign: 'left', color: '#111111' },
    image: WIDE,
  };

  it('keeps every illustration inside the box the layout gave it', async () => {
    const { buffer } = await renderBookPdf({
      book: { title: 'Mira' },
      pages: [page],
      options: { includeCover: false, includeBackCover: false },
    });

    const box = pageBox({ pageSize: 'a4' });
    const frame = frameFor('image-top', box.trim);
    const placements = pageOperators(buffer).flatMap(imagePlacements);

    expect(placements).toHaveLength(1);
    const [art] = placements;

    // Covering a 2:1 source into this box genuinely scales it wider than the
    // box — the point is that the excess is clipped away rather than drawn.
    expect(art.width).toBeGreaterThan(frame.image.width);
    expect(art.clipped).toBe(true);

    // And so nothing reaches the paper's edge.
    expect(art.x).toBeLessThan(box.trim.x);
    expect(frame.image.x).toBeGreaterThan(0);
  });

  it('does not let the cover art bleed off the sheet', async () => {
    const { buffer } = await renderBookPdf({
      book: { title: 'Mira' },
      pages: [page],
      options: { includeBackCover: false },
    });

    const [cover] = pageOperators(buffer).flatMap(imagePlacements);
    expect(cover.clipped).toBe(true);
  });

  it('still renders the text when the image cannot be decoded', async () => {
    const { buffer, pageCount } = await renderBookPdf({
      book: { title: 'Mira' },
      pages: [{ ...page, image: Buffer.from('not an image') }],
      options: { includeCover: false, includeBackCover: false },
    });

    // The clip must not survive a failed image and swallow the words after it.
    expect(pageCount).toBe(1);
    expect(buffer.length).toBeGreaterThan(0);
    const opened = pageOperators(buffer).join('\n').match(/q/g)?.length ?? 0;
    const closed = pageOperators(buffer).join('\n').match(/Q/g)?.length ?? 0;
    expect(opened).toBe(closed);
  });

  it('resamples a huge illustration so the file does not balloon', async () => {
    // Noise defeats PNG compression, so a big source is genuinely heavy — the
    // kind of image that turned a ten-page book into hundreds of megabytes.
    const heavy = (() => {
      const c = createCanvas(1600, 1600);
      const ctx = c.getContext('2d');
      const data = ctx.createImageData(1600, 1600);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] = Math.random() * 255;
        data.data[i + 1] = Math.random() * 255;
        data.data[i + 2] = Math.random() * 255;
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      return c.toBuffer('image/png');
    })();

    const { buffer } = await renderBookPdf({
      book: { title: 'Mira' },
      pages: [{ ...page, image: heavy }],
      options: { includeCover: false, includeBackCover: false, quality: 'high' },
    });

    // Resampling the picture to the page's own DPI leaves the whole document a
    // fraction of the one full-size image it was handed.
    expect(heavy.length).toBeGreaterThan(2_000_000);
    expect(buffer.length).toBeLessThan(heavy.length / 2);
  });

  it('fits a very long page inside its band instead of overflowing it', async () => {
    const longNarration = Array.from({ length: 400 }, () => 'lantern').join(' ');

    const { buffer, pageCount } = await renderBookPdf({
      book: { title: 'Mira' },
      pages: [{ ...page, narration: longNarration, image: null }],
      options: { includeCover: false, includeBackCover: false },
    });

    // One page in, one page out: the long text was shrunk and clipped to fit
    // rather than flowed onto pages of its own, and every clip is closed.
    expect(pageCount).toBe(1);
    const ops = pageOperators(buffer).join('\n');
    expect((ops.match(/q/g) ?? []).length).toBe((ops.match(/Q/g) ?? []).length);
  });

  it('draws a spread page as an opening — a picture leaf then a text leaf', async () => {
    const { buffer, pageCount } = await renderBookPdf({
      book: { title: 'Mira' },
      pages: [{ ...page, layout: { preset: 'spread', backgroundColor: '#FFFFFF' } }],
      options: { includeCover: false, includeBackCover: false },
    });

    // One story page becomes two sheets, the way the preview and reader open it:
    // the illustration on its own leaf, the words with a whole leaf to themselves.
    expect(pageCount).toBe(2);

    // The picture is on exactly one of the two leaves; the text leaf has none.
    const placements = pageOperators(buffer).flatMap(imagePlacements);
    expect(placements).toHaveLength(1);
  });
});
