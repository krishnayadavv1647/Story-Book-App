import {
  Grid3x3,
  Maximize,
  Minus,
  Pencil,
  Plus,
  Redo2,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { Button, IconButton } from '../../components/common/index.js';
import { PageRender } from './PageRender.jsx';

const ZOOMS = [50, 75, 100, 125, 150];

// The page's real proportions, so the canvas is the shape of the paper rather
// than a fixed landscape box. A single leaf is portrait (648 x 1000); a spread
// is two of them side by side.
const SINGLE_RATIO = 648 / 1000;
const SPREAD_RATIO = 1296 / 1000;
const BASE_HEIGHT = 540;

/**
 * The centre column from Canva `DAHT3a8GF_Q`: a zoom/history toolbar, the page
 * as it will print, and the three page actions beneath it.
 */
export function PageCanvas({
  page,
  zoom,
  onZoom,
  grid,
  onToggleGrid,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRewrite,
  onRegenerate,
  onMagicLayout,
  rewriting,
  regenerating,
  arranging,
}) {
  const step = (direction) => {
    const index = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.min(Math.max(index + direction, 0), ZOOMS.length - 1)];
    onZoom(next);
  };

  const ratio = (page?.layout?.preset ?? 'spread') === 'spread' ? SPREAD_RATIO : SINGLE_RATIO;
  const height = BASE_HEIGHT * (zoom / 100);
  const width = height * ratio;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-hairline bg-page p-4">
      <div className="flex shrink-0 justify-center">
        <div className="flex items-center gap-1 rounded-pill border border-hairline bg-surface px-2 py-1">
          <IconButton icon={Undo2} label="Undo" disabled={!canUndo} onClick={onUndo} />
          <IconButton icon={Redo2} label="Redo" disabled={!canRedo} onClick={onRedo} />
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden="true" />
          <IconButton
            icon={Minus}
            label="Zoom out"
            disabled={zoom === ZOOMS[0]}
            onClick={() => step(-1)}
          />
          <span className="w-12 text-center text-sm tabular-nums text-ink">{zoom}%</span>
          <IconButton
            icon={Plus}
            label="Zoom in"
            disabled={zoom === ZOOMS.at(-1)}
            onClick={() => step(1)}
          />
          <IconButton icon={Maximize} label="Fit to view" onClick={() => onZoom(100)} />
          <IconButton
            icon={Grid3x3}
            label="Toggle grid"
            onClick={onToggleGrid}
            className={cn(grid && 'border-hairline-strong bg-teal-soft')}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto py-4">
        {page ? (
          <div
            className={cn(
              'relative shrink-0 overflow-hidden rounded-lg border border-hairline bg-surface shadow-card',
              grid && 'outline outline-1 outline-hairline-strong',
            )}
            style={{ width, height }}
          >
            <PageRender page={page} leaf={ratio >= 1 ? width / 2 : width} interactive />
            {grid && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px),' +
                    'linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Select a page to edit it.</p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3">
        <Button leadingIcon={Pencil} onClick={onRewrite} loading={rewriting} disabled={!page}>
          Rewrite with AI
        </Button>
        <Button
          leadingIcon={Sparkles}
          onClick={onRegenerate}
          loading={regenerating}
          disabled={!page}
        >
          Regenerate Image
        </Button>
        <Button leadingIcon={Wand2} onClick={onMagicLayout} loading={arranging} disabled={!page}>
          Magic Layout
        </Button>
      </div>
    </div>
  );
}

export default PageCanvas;
