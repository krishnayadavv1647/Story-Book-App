import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Grid3x3, LayoutGrid, Minus, Plus, Square } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { Button, IconButton, SegmentedTabs, Switch } from '../../components/common/index.js';
import { LEAF_ASPECT, PAPER, PageSheet } from './PageSheet.jsx';
import { buildLeaves } from './BookStage.jsx';

/** How a leaf is named to a screen reader in the thumbnail grid. */
function leafLabel(leaf) {
  const order = leaf?.page?.order;
  if (order == null) return 'Open page';
  return leaf.part === 'art' ? `Open page ${order} illustration` : `Open page ${order}`;
}

/** The caption printed under a thumbnail. */
function leafCaption(leaf) {
  const order = leaf?.page?.order;
  if (order == null) return '';
  return leaf.part === 'art' ? `Page ${order} · illustration` : `Page ${order}`;
}

/**
 * The left column of Canva `DAHT3Yy2mJA`: view switcher, the book itself, and
 * the paging controls beneath it.
 *
 * Pages render through `PageSheet`, which draws them at paper size and scales
 * them — so preview, editor and export are three views of one layout rather than
 * three guesses at it.
 *
 * DEVIATION, at the owner's request: the book fills the pane. The spread used to
 * be laid out at a hard-coded 300px per page, which on a 1100px column left it
 * marooned in the middle of a mostly empty panel. It is now measured against the
 * space it actually has.
 *
 * That also changes what the zoom numbers mean, and for the better: **100% is
 * the page filling the pane**, not some fraction of a number nobody chose. Below
 * it the book is smaller, above it the pane scrolls, and "Fit" is 100%.
 */
const ZOOMS = [50, 75, 100, 150, 200];
export const FIT = 100;

const GAP = 4; // `gap-1`, in px — needed by the width arithmetic below.

/** The box a spread is drawn into, remeasured whenever the window changes. */
function useStageSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export function BookPreview({
  pages,
  view,
  onViewChange,
  index,
  onIndexChange,
  zoom,
  onZoom,
  bleed,
  onBleedChange,
  // The safe-area inset as a fraction of the page, from the book's print
  // settings — the boundary important text and faces must stay inside.
  safeFraction = 0.03,
}) {
  // A page is an *opening* — its picture on one leaf and its words on the
  // facing one — so the pane pages through leaves, not pages, exactly as the
  // reader does. That is what stops a page's whole text being crammed into half
  // a sheet: on `spread` the words get a full leaf and are sized to it.
  const leaves = useMemo(() => buildLeaves({ pages }), [pages]);

  // Book View shows two leaves side by side, as a printed book opens.
  const perView = view === 'book' ? 2 : 1;
  const last = Math.max(0, leaves.length - perView);
  const step = (delta) => onIndexChange(Math.min(Math.max(index + delta * perView, 0), last));

  const visible = Array.from({ length: perView }, (_, offset) => leaves[index + offset]).filter(
    Boolean,
  );
  const orders = [...new Set(visible.map((leaf) => leaf.page?.order).filter((v) => v != null))];
  const pagesLabel =
    orders.length === 0
      ? ''
      : orders.length === 1
        ? `Page ${orders[0]} of ${pages.length}`
        : `Pages ${orders[0]}–${orders.at(-1)} of ${pages.length}`;

  const zoomStep = (delta) => {
    const at = ZOOMS.indexOf(zoom);
    onZoom(ZOOMS[Math.min(Math.max(at + delta, 0), ZOOMS.length - 1)]);
  };

  const [stageRef, stage] = useStageSize();

  /**
   * How wide one page may be. Whichever of the two limits bites first wins —
   * the width shared between the pages of a spread, or the height of the pane —
   * so the book is as large as it can be without cropping. Two pixels of slack
   * keep a rounded-up fit from tripping the container's own scrollbar.
   */
  const room = Math.max(0, stage.width - GAP * (perView - 1)) / perView;
  const byHeight = Math.max(0, stage.height) * (PAPER.width / PAPER.height);
  const fitWidth = Math.max(0, Math.min(room, byHeight) - 2);
  const sheetWidth = fitWidth * (zoom / 100);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-hairline bg-page p-4">
      <div className="flex shrink-0 justify-center">
        <div className="w-[420px]">
          <SegmentedTabs
            value={view}
            onValueChange={onViewChange}
            items={[
              { value: 'book', label: 'Book View', icon: LayoutGrid },
              { value: 'single', label: 'Single Page', icon: Square },
              { value: 'thumbs', label: 'Thumbnails', icon: Grid3x3 },
            ]}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-4">
        {leaves.length === 0 ? (
          <p className="text-sm text-ink-muted">This book has no pages yet.</p>
        ) : view === 'thumbs' ? (
          <ul className="grid h-full w-full grid-cols-3 gap-3 self-start overflow-auto 2xl:grid-cols-4">
            {leaves.map((leaf, at) => (
              <li key={leaf.key ?? at}>
                <button
                  type="button"
                  onClick={() => {
                    onViewChange('single');
                    onIndexChange(at);
                  }}
                  className="w-full text-left"
                  aria-label={leafLabel(leaf)}
                >
                  <PageSheet page={leaf.page} part={leaf.part} folio={leaf.folio} author={leaf.author} />
                  <span className="mt-1 block truncate text-xs text-ink-muted">
                    {leafCaption(leaf)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full w-full items-center gap-3">
            <IconButton
              icon={ChevronLeft}
              label="Previous page"
              disabled={index === 0}
              onClick={() => step(-1)}
            />

            {/* `min-w-0` is what makes the measurement honest: without it this
                box is sized by the spread inside it, and the spread is sized
                from the measurement. */}
            {/* Scrolls only when zoomed past the fit. At or below it the book
                is measured to fit, so a scrollbar could only ever be a rounding
                error showing through — and it would sit across the page. */}
            <div
              ref={stageRef}
              className={cn(
                'flex h-full min-h-0 min-w-0 flex-1 items-center justify-center',
                zoom > FIT ? 'overflow-auto' : 'overflow-hidden',
              )}
            >
              <div
                className={cn(
                  'flex shrink-0 gap-1',
                  bleed && 'outline-dashed outline-1 outline-danger',
                )}
                style={{ width: sheetWidth * perView + GAP * (perView - 1) }}
              >
                {Array.from({ length: perView }, (_, offset) => {
                  const leaf = leaves[index + offset];
                  // The wrapper carries the leaf's aspect (so the sheet keeps its
                  // paper proportions) and is the positioning context for the
                  // guide; the sheet fills it absolutely.
                  return (
                    <div key={offset} className={cn('relative flex-1', LEAF_ASPECT)}>
                      <PageSheet
                        page={leaf?.page}
                        part={leaf?.part}
                        folio={leaf?.folio}
                        author={leaf?.author}
                        className="absolute inset-0 h-full w-full"
                      />
                      {/* The safe-area boundary: keep text, faces and anything
                          that must survive the trim inside this line. The trim
                          edge is the sheet itself; bleed runs past it. */}
                      {bleed && leaf?.page && (
                        <div
                          aria-hidden="true"
                          data-testid="safe-area-guide"
                          className="pointer-events-none absolute rounded-sm border border-dashed border-teal-bright/80"
                          style={{ inset: `${safeFraction * 100}%` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <IconButton
              icon={ChevronRight}
              label="Next page"
              disabled={index >= last}
              onClick={() => step(1)}
            />
          </div>
        )}
      </div>

      {view !== 'thumbs' && leaves.length > 0 && (
        <p className="shrink-0 text-center text-sm text-ink-muted">{pagesLabel}</p>
      )}

      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-3">
        <Button disabled={index === 0} onClick={() => step(-1)}>
          ← Previous Page
        </Button>

        <div className="flex items-center gap-1 rounded-pill border border-hairline bg-surface px-2 py-1">
          <IconButton
            icon={Minus}
            label="Zoom out"
            disabled={zoom === ZOOMS[0]}
            onClick={() => zoomStep(-1)}
          />
          <span className="w-12 text-center text-sm tabular-nums text-ink">{zoom}%</span>
          <IconButton
            icon={Plus}
            label="Zoom in"
            disabled={zoom === ZOOMS.at(-1)}
            onClick={() => zoomStep(1)}
          />
          <Button size="sm" disabled={zoom === FIT} onClick={() => onZoom(FIT)}>
            Fit
          </Button>
        </div>

        <Button disabled={index >= last} onClick={() => step(1)}>
          Next Page →
        </Button>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Show print guides
          <Switch
            label="Show print guides"
            checked={bleed}
            onCheckedChange={onBleedChange}
          />
        </label>
      </div>
    </div>
  );
}

export default BookPreview;
