import { useLayoutEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn.js';
import { PageRender } from '../book-editor/PageRender.jsx';

/**
 * One page of the book, drawn as paper.
 *
 * The page is always laid out at `PAPER` — one fixed size, whatever box it is
 * shown in — and then scaled to fit. That is the whole point: type, margins and
 * the image split keep their proportions, so a thumbnail is the same page as a
 * full-size spread rather than the same page with enormous text crammed into it.
 *
 * It is also what removes the scrollbars. The old sheet laid the page out at
 * whatever width it happened to get — around 255px in the preview — while the
 * text stayed at reading size, so every page overflowed and scrolled inside
 * itself. Nothing overflows now, because the layout never changes size; only the
 * scale does.
 */
/**
 * One leaf, at the proportions of the reference book: its 1400 x 1082 spread is
 * two leaves of 700 x 1082, so a leaf is 0.647 wide for its height. The old 4:5
 * was squarer than any book, which is part of why a page of text sat in a pool
 * of empty paper.
 */
export const PAPER = { width: 648, height: 1000 };
export const LEAF_ASPECT = 'aspect-[648/1000]';
export const SPREAD_ASPECT = 'aspect-[1296/1000]';

export function PageSheet({ page, part = 'both', author, folio, className }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;

    const measure = () => {
      const width = el.clientWidth;
      // jsdom lays nothing out, so a measured zero means "no layout happened",
      // not "no room" — draw at paper size rather than collapsing to nothing.
      setScale(width > 0 ? width / PAPER.width : 1);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className={cn(
        LEAF_ASPECT,
        'overflow-hidden rounded-sm border border-hairline bg-surface shadow-sm',
        className,
      )}
    >
      {page ? (
        <div
          style={{
            width: PAPER.width,
            height: PAPER.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <PageRender page={page} part={part} leaf={PAPER.width} author={author} folio={folio} />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center bg-page">
          <span className="text-xs text-ink-muted">Blank</span>
        </div>
      )}
    </div>
  );
}

export default PageSheet;
