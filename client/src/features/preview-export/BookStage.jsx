import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';

import { cn } from '../../lib/cn.js';
import { LEAF_ASPECT, PAPER, PageSheet } from './PageSheet.jsx';

/**
 * The book, open, with pages that really turn.
 *
 * The turn is `react-pageflip`, at the owner's request and with their settings.
 * It is a genuine sheet simulation — the leaf bends, catches a shadow along the
 * fold and follows the pointer if you drag it — which the CSS `rotateY` it
 * replaces could not do: that folds a flat plane, and paper does not fold flat.
 *
 * Two things it gives us for nothing that were hand-built before:
 *
 *   `usePortrait`  — one leaf on a narrow screen, two on a wide one, decided by
 *                    the room the book actually has rather than by a media query
 *                    guessing at it.
 *   `showCover`    — the cover stands alone as a hard board, so the first
 *                    opening is page one facing its own words, which is how the
 *                    reference book falls.
 *
 * ## What a leaf is
 *
 * One page of this product is an **opening**: a full-bleed illustration and the
 * words that go with it, on facing leaves. So the flat list handed to the
 * flipbook is `cover, art₁, words₁, art₂, words₂, …, back cover` — and because
 * the cover is shown alone, every pair after it is exactly one page's picture
 * facing its own text.
 */

/** The leaf's proportions are the reference book's; see `PAPER`. */
const LEAF_WIDTH = 440;
const LEAF_RATIO = PAPER.width / PAPER.height; // 0.648 wide for its height
const leafHeight = (width) => Math.round((width * PAPER.height) / PAPER.width);

/**
 * How wide to make the book so that it fits the height it has been given.
 *
 * `size="stretch"` fits the flipbook to its container's *width* and takes the
 * height from the ratio — so handed a wide container it makes a book taller than
 * the screen, which is what it did here: the cover ran off the bottom. Working
 * back from the height instead is the fix, and it also decides the shape: if two
 * leaves fit side by side at full height, the book is opened; if they do not, it
 * is held at one leaf, which is the same call `usePortrait` makes.
 */
function fitWidth({ width, height }) {
  // A measured zero means no layout has happened — the frame before the first
  // measurement, a browser without `ResizeObserver`, a test environment that
  // lays nothing out — not that there is no room. Fall back to one natural leaf:
  // a book briefly the wrong size is better than a book collapsed to nothing.
  if (!width || !height) return { width: LEAF_WIDTH, open: false };

  const open = height * LEAF_RATIO * 2;
  if (open <= width) return { width: Math.floor(open), open: true };

  return { width: Math.floor(Math.min(width, height * LEAF_RATIO)), open: false };
}

/** The box the book is drawn into, remeasured when the window changes. */
function useRoom() {
  const ref = useRef(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => setRoom({ width: el.clientWidth, height: el.clientHeight });

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, room];
}

/**
 * `react-pageflip` measures and transforms the elements it is given, so every
 * child has to hand it a real DOM node. `data-density` is how it is told which
 * leaves are boards: a cover is stiff and turns as one piece, paper is not.
 */
const Leaf = forwardRef(function Leaf({ leaf, className }, ref) {
  return (
    <div
      ref={ref}
      data-density={leaf?.hard ? 'hard' : 'soft'}
      className={cn('overflow-hidden bg-surface', className)}
    >
      {leaf?.render ? (
        leaf.render
      ) : (
        <PageSheet
          page={leaf?.page}
          part={leaf?.part}
          author={leaf?.author}
          folio={leaf?.folio}
          className={cn(LEAF_ASPECT, 'h-full w-full rounded-none border-0 shadow-none')}
        />
      )}
    </div>
  );
});

export function BookStage({ leaves, index, onIndexChange, onOrientationChange, className }) {
  const bookRef = useRef(null);
  const [roomRef, room] = useRoom();

  /**
   * The arrows, the dots and the keyboard all move `index`; dragging the book
   * itself moves it through `onFlip`. Driving the flip from the index keeps
   * those one thing rather than two — and the guard is what stops the flip the
   * book has just reported from being flipped straight back.
   */
  useEffect(() => {
    const api = bookRef.current?.pageFlip?.();
    if (!api || typeof api.getCurrentPageIndex !== 'function') return;
    if (api.getCurrentPageIndex() === index) return;

    api.flip(index);
  }, [index]);

  const fit = fitWidth(room);

  /**
   * How many leaves are on screen. The caller needs it, because "page 3" and
   * "page 3, the illustration" are different things depending on whether the
   * facing leaf is showing.
   *
   * Taken from the same measurement that sizes the book rather than asked of the
   * library: `fitWidth` has already decided whether two leaves fit, and the
   * width it returns is what makes that true. Asking twice invites two answers —
   * which is what happened when this read `getOrientation()` on mount and got
   * `portrait` from a book that had not been measured yet, then never corrected
   * it because nothing had *changed*.
   */
  useEffect(() => {
    onOrientationChange?.(fit.open ? 'landscape' : 'portrait');
  }, [fit.open, onOrientationChange]);

  if (leaves.length === 0) return null;

  const width = fit.width;

  return (
    <div
      ref={roomRef}
      className={cn('flex h-full min-h-0 w-full min-w-0 items-center justify-center', className)}
    >
      <div style={{ width }}>
        <HTMLFlipBook
          ref={bookRef}
          width={LEAF_WIDTH}
          height={leafHeight(LEAF_WIDTH)}
          size="stretch"
          // The book takes the room it is given, between a phone and a desk.
          minWidth={260}
          maxWidth={680}
          minHeight={leafHeight(260)}
          maxHeight={leafHeight(680)}
          showCover
          usePortrait
          mobileScrollSupport
          drawShadow
          maxShadowOpacity={0.45}
          flippingTime={900}
          clickEventForward
          useMouseEvents
          swipeDistance={20}
          startPage={index}
          onFlip={(event) => onIndexChange(event.data)}
          className="storybook"
        >
          {leaves.map((leaf, at) => (
            <Leaf key={leaf.key ?? at} leaf={leaf} />
          ))}
        </HTMLFlipBook>
      </div>
    </div>
  );
}

/**
 * Turns a book into the flat list of leaves the flipbook pairs up.
 *
 * **How many leaves a page needs is its layout's decision.** On `spread` — the
 * default, and the reference book's layout — a page is an *opening*: its
 * illustration on one leaf and its words on the facing one. Every other preset
 * arranges the picture and the words on a single leaf, so that page is one leaf.
 *
 * Getting that wrong is what put the same page on both sides of the book: every
 * page was given two leaves, and a single-leaf preset ignores which half it was
 * asked for, so it drew itself twice.
 *
 * The folio is the page's own number, printed on the leaf that carries the
 * words, exactly as the reference does it.
 */
export function buildLeaves({ pages, cover, backCover, author }) {
  const leaves = [];

  if (cover) leaves.push({ key: 'cover', hard: true, render: cover, isCover: true });

  for (const page of pages) {
    const id = page._id ?? page.order;

    if ((page.layout?.preset ?? 'spread') === 'spread') {
      leaves.push({ key: `art-${id}`, page, part: 'art' });
      leaves.push({ key: `words-${id}`, page, part: 'text', author, folio: page.order });
    } else {
      leaves.push({ key: `page-${id}`, page, part: 'both', author, folio: page.order });
    }
  }

  if (backCover) leaves.push({ key: 'back', hard: true, render: backCover, isCover: true });

  return leaves;
}

export default BookStage;
