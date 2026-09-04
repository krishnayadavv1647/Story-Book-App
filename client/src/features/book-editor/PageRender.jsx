import { useEffect } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { loadFont } from '../../lib/loadFont.js';

/**
 * Draws one page the way it will be printed.
 *
 * This is the single renderer for a page: the editor canvas, the preview pane,
 * the reader and both exporters all go through it, so what someone edits is what
 * they see and what they get.
 *
 * ## The opening
 *
 * A page of this product is an **opening**, not a rectangle: a full-bleed
 * illustration on one leaf and the words on the facing leaf. That is the layout
 * of the reference book the owner supplied, and it is what fixes the four things
 * they reported about the old one — no consistency, broken layout, poor type,
 * and far too much empty space. The old page put a picture in the top half and
 * floated a paragraph in the middle of the bottom half, so a short page left a
 * third of the paper blank and a long one overflowed. Here the picture has a
 * whole leaf and the words have a whole leaf, and neither has to make room.
 *
 * `part` says which leaf to draw. `both` draws the opening, which is what the
 * editor canvas wants; the reader and the exporters draw one leaf at a time,
 * because that is how the pages actually fall.
 *
 * The legacy presets are still here and still work — the editor offers them —
 * but `spread` is the default and the one the book is designed around.
 */

/** Every measurement below is a fraction of one leaf's width. */
export const PAGE_METRICS = {
  // Measured from the reference: a 700px leaf set at ~30px on 47px of leading.
  bodySize: 0.043,
  leading: 1.55,
  // 20% each side leaves a ~60% measure, which is the reference's line length.
  sideMargin: 0.2,
  // The running head and the folio sit out in the outer margin.
  furnitureSize: 0.019,
  furnitureMargin: 0.06,
};

/**
 * The size that makes this much text fill this much paper.
 *
 * A page with four lines on it should not be four lines adrift in white space —
 * it should be four lines set large enough to be the page. That is how a picture
 * book handles a short page, and it is the thing that was missing: the type was
 * one fixed size whatever the page had to say, so a short page looked unfinished
 * and no amount of moving the picture around fixed it.
 *
 * The arithmetic: a character at size `S` takes about `0.5·S` across and
 * `leading·S` down, so `chars · 0.5 · leading · S² ≈ area`, and `S` falls out of
 * that. `FILL` leaves the page a margin of air rather than packing it to the
 * edges — a page with no breathing room reads as cramped, which is the opposite
 * mistake.
 *
 * Deliberately arithmetic rather than measured: this same renderer draws the
 * editor, the preview, the reader and the exports, and a size that came from
 * measuring a browser would not survive the trip to a PDF.
 */
const FILL = 0.78;

export function fittedSize({ text, width, height, base }) {
  const chars = Math.max(String(text ?? '').trim().length, 1);
  const perChar = 0.5 * PAGE_METRICS.leading;

  const ideal = Math.sqrt((width * height * FILL) / (perChar * chars));
  // Never smaller than the book's own size, and never so large it stops being
  // a paragraph and becomes a poster.
  return Math.round(Math.min(Math.max(ideal, base), base * 2.3));
}

const FRAMES = {
  'image-top': 'flex-col',
  'image-bottom': 'flex-col-reverse',
  'image-left': 'flex-row',
  'image-right': 'flex-row-reverse',
};

function Art({ page, className }) {
  if (page?.imageUrl) {
    return (
      <img
        src={page.imageUrl}
        alt={`Page ${page.order}${page.title ? `: ${page.title}` : ''}`}
        className={cn('h-full w-full object-cover', className)}
      />
    );
  }

  // Printed content, not app chrome: this well sits inside the authored page and
  // is what an export renders, so it stays the light grey the PDF and PNG
  // renderers draw for a missing image (`#EEEEEE`). A dark theme token here
  // would punch a black rectangle into white paper.
  return (
    <div
      className={cn('flex h-full w-full items-center justify-center', className)}
      style={{ backgroundColor: '#EEEEEE', color: '#8A8A8A' }}
    >
      <ImageOff className="h-[6%] w-[6%]" aria-hidden="true" />
    </div>
  );
}

/**
 * The words, on their own leaf.
 *
 * `leaf` is the leaf's width in px, and every size here is a fraction of it —
 * the page is laid out once at paper size and scaled, so a proportion is the
 * only thing that survives being drawn as a thumbnail and as a spread.
 */
function Words({ page, leaf, author, folio, typography }) {
  const type = typography ?? page?.typography ?? {};
  const m = PAGE_METRICS;

  const family = type.fontFamily && type.fontFamily !== 'inherit' ? type.fontFamily : undefined;

  // An explicit size is the author's decision and is left alone; otherwise the
  // type is sized to fill the leaf it is printed on.
  const base = leaf * m.bodySize;
  const size = type.fontSize
    ? Number(type.fontSize)
    : fittedSize({
        text: `${page?.title ?? ''} ${page?.narration ?? ''}`,
        width: leaf * (1 - m.sideMargin * 2),
        // The leaf's height, less the bands the running head and folio sit in.
        height: (leaf / 0.648) * 0.78,
        base,
      });

  return (
    <div
      className="relative flex h-full w-full flex-col justify-center"
      style={{
        backgroundColor: page?.layout?.backgroundColor || 'var(--paper-page)',
        paddingLeft: leaf * m.sideMargin,
        paddingRight: leaf * m.sideMargin,
      }}
    >
      {author && (
        <span
          style={{
            position: 'absolute',
            top: leaf * m.furnitureMargin * 0.72,
            right: leaf * m.furnitureMargin,
            fontFamily: 'var(--font-book)',
            fontSize: leaf * m.furnitureSize,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--page-head)',
          }}
        >
          {author}
        </span>
      )}

      <div
        style={{
          fontFamily: family ?? 'var(--font-book)',
          fontSize: size,
          lineHeight: type.lineHeight || m.leading,
          textAlign: type.textAlign || 'left',
          color: type.color || 'var(--page-ink)',
        }}
      >
        {page?.title && (
          <h3
            style={{
              fontSize: size * 1.25,
              fontWeight: 600,
              lineHeight: 1.25,
              marginBottom: size * 0.85,
            }}
          >
            {page.title}
          </h3>
        )}
        <p className="whitespace-pre-wrap">{page?.narration || 'This page has no text yet.'}</p>
      </div>

      {folio != null && (
        <span
          style={{
            position: 'absolute',
            bottom: leaf * m.furnitureMargin * 0.72,
            right: leaf * m.furnitureMargin,
            fontFamily: 'var(--font-book)',
            fontSize: leaf * m.furnitureSize * 1.15,
            color: 'var(--page-folio)',
          }}
        >
          {folio}
        </span>
      )}
    </div>
  );
}

export function PageRender({
  page,
  part = 'both',
  leaf = 648,
  author,
  folio,
  className,
  interactive = false,
}) {
  const preset = page?.layout?.preset ?? 'spread';
  const background = page?.layout?.backgroundColor || '#FFFFFF';
  const type = page?.typography ?? {};

  // Every surface that draws a page goes through here — the editor canvas, the
  // preview pane, the reader, the thumbnails — so this is the one place that has
  // to make sure the page's chosen face is actually fetched. It only loads a
  // real Google family once; the default (`inherit`) is a no-op.
  useEffect(() => {
    loadFont(type.fontFamily);
  }, [type.fontFamily]);

  // --- the opening -------------------------------------------------------
  if (preset === 'spread') {
    if (part === 'art') return <Art page={page} className={className} />;
    if (part === 'text') {
      return (
        <div className={cn('h-full w-full overflow-hidden', className)}>
          <Words page={page} leaf={leaf} author={author} folio={folio} />
        </div>
      );
    }

    return (
      <div className={cn('flex h-full w-full overflow-hidden', className)} data-preset={preset}>
        <div className="h-full w-1/2 overflow-hidden">
          <Art page={page} />
        </div>
        <div className="h-full w-1/2 overflow-hidden">
          {/* Both leaves of the opening share one sheet here (the editor canvas
              and the preview pane want the whole opening in view), so the words
              have half the width — and their margins and type must be sized to
              that half, not to a full leaf, or the measure collapses to one word
              a line. */}
          <Words page={page} leaf={leaf / 2} author={author} folio={folio} />
        </div>
      </div>
    );
  }

  // --- the single-page presets ------------------------------------------
  // Kept because the editor offers them. They render the same words and the
  // same picture, arranged on one leaf instead of two.
  // The words get a stable share of the page and the type fills it, so every
  // page of the book has the same rhythm however much it has to say.
  // Image-left / image-right give the words half the leaf; text-only and
  // full-bleed give them the whole leaf. Size the type to the width it gets, so
  // a horizontal split does not crush the measure to one word a line.
  const horizontal = preset === 'image-left' || preset === 'image-right';
  const textLeaf = horizontal ? leaf / 2 : leaf;
  const bodyBase = textLeaf * PAGE_METRICS.bodySize;
  const bodySize = type.fontSize
    ? Number(type.fontSize)
    : fittedSize({
        text: `${page?.title ?? ''} ${page?.narration ?? ''}`,
        width: textLeaf * 0.82,
        height: (leaf / 0.648) * (horizontal ? 0.82 : 0.46),
        base: bodyBase,
      });

  const textStyle = {
    fontFamily: type.fontFamily && type.fontFamily !== 'inherit' ? type.fontFamily : 'var(--font-book)',
    fontSize: bodySize,
    lineHeight: type.lineHeight || PAGE_METRICS.leading,
    textAlign: type.textAlign || 'left',
    color: type.color || 'var(--page-ink)',
  };

  const body = (
    // `h-full` is what makes `justify-center` mean anything: without it this box
    // is only as tall as its own text, so "centred" centres it against nothing
    // and the words sit jammed under the picture.
    <div
      className="flex h-full flex-col justify-center"
      style={{ ...textStyle, padding: textLeaf * 0.09 }}
    >
      {page?.title && (
        <h3
          style={{
            fontSize: bodySize * 1.25,
            fontWeight: 600,
            lineHeight: 1.25,
            marginBottom: '0.6em',
          }}
        >
          {page.title}
        </h3>
      )}
      <p className="whitespace-pre-wrap">{page?.narration || 'This page has no text yet.'}</p>
    </div>
  );

  if (preset === 'text-only') {
    return (
      <div
        className={cn('flex h-full w-full items-center overflow-hidden', className)}
        style={{ background }}
        data-preset={preset}
      >
        {body}
      </div>
    );
  }

  if (preset === 'full-bleed') {
    // Text sits over the art, so it needs its own ground to stay readable.
    return (
      <div
        className={cn('relative h-full w-full overflow-hidden', className)}
        style={{ background }}
        data-preset={preset}
      >
        <div className="absolute inset-0">
          <Art page={page} />
        </div>
        <div
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white"
          style={{ padding: leaf * 0.09 }}
        >
          {page?.title && (
            <h3 style={{ fontFamily: textStyle.fontFamily, fontSize: textStyle.fontSize, fontWeight: 600 }}>
              {page.title}
            </h3>
          )}
          <p className="whitespace-pre-wrap" style={{ ...textStyle, color: undefined }}>
            {page?.narration}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex h-full w-full overflow-hidden', FRAMES[preset] ?? FRAMES['image-top'], className)}
      style={{ background }}
      data-preset={preset}
      data-interactive={interactive || undefined}
    >
      {/*
        The picture takes whatever the words do not need.

        It used to be the other way round — the picture was pinned to half the
        page and the words got the other half whether they filled it or not — so
        a short page left a third of the paper blank under the text. A picture
        book does not work that way: the words take the room they need and the
        illustration has the rest. The floor stops a very long page from
        squeezing the picture down to a strip.
      */}
      <div
        className={cn(
          'min-h-0 overflow-hidden',
          horizontal ? 'h-full w-1/2' : 'w-full flex-1 basis-[42%]',
        )}
      >
        <Art page={page} />
      </div>
      {/* Clipped, not scrolled. This is a printed page: the exporters crop text
          that does not fit, so a preview that scrolled instead would promise
          room the paper does not have. */}
      <div
        className={cn(
          'overflow-hidden',
          horizontal ? 'h-full w-1/2' : 'w-full shrink-0 min-h-[46%] max-h-[58%]',
        )}
      >
        {body}
      </div>
    </div>
  );
}

export default PageRender;
