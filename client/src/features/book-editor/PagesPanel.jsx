import { ChevronDown, ChevronUp, Copy, GripVertical, ImageOff, Plus, Trash2 } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { Button, Card, IconButton } from '../../components/common/index.js';

/**
 * The Pages rail from Canva `DAHT3a8GF_Q`: a header with "Add Page", a scrolling
 * list of page thumbnails, and "Manage Pages" pinned to the bottom.
 *
 * The frame draws drag handles. Reordering here is by explicit up/down controls
 * rather than drag-and-drop — a keyboard user can reach it, and it cannot half
 * happen. Recorded as a deviation in the design source map.
 */
export function PagesPanel({
  pages,
  selectedId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  manageOpen,
  onToggleManage,
  busy,
}) {
  return (
    <Card className="flex h-full flex-col p-0">
      <div className="flex items-center justify-between border-b border-hairline p-4">
        <h2 className="text-base font-semibold text-ink">Pages</h2>
        {/* Secondary: gold marks the screen's main action, and adding a page is a
            utility beside the list. The editor's gold stays on "Export Book" in
            the header and the sticky bar's forward action. */}
        <Button size="sm" leadingIcon={Plus} onClick={() => onAdd()} loading={busy}>
          Add Page
        </Button>
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {pages.map((page, index) => {
          const active = page._id === selectedId;

          return (
            <li key={page._id}>
              <div
                className={cn(
                  'rounded-lg border transition-colors',
                  active ? 'border-hairline-strong bg-teal-soft' : 'border-hairline bg-surface',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(page._id)}
                  aria-current={active ? 'true' : undefined}
                  className="flex w-full items-center gap-3 p-2 text-left"
                >
                  <span className="flex h-[62px] w-[80px] shrink-0 items-center justify-center overflow-hidden rounded bg-surface-secondary">
                    {page.imageUrl ? (
                      <img
                        src={page.imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      Page {page.order}
                      {page.title ? ` — ${page.title}` : ''}
                    </span>
                    {page.narration && (
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {page.narration}
                      </span>
                    )}
                  </span>
                </button>

                {manageOpen && (
                  <div className="flex items-center gap-1 border-t border-hairline px-2 py-1.5">
                    <GripVertical className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                    <IconButton
                      icon={ChevronUp}
                      label={`Move page ${page.order} up`}
                      disabled={index === 0 || busy}
                      onClick={() => onMove(page._id, -1)}
                    />
                    <IconButton
                      icon={ChevronDown}
                      label={`Move page ${page.order} down`}
                      disabled={index === pages.length - 1 || busy}
                      onClick={() => onMove(page._id, 1)}
                    />
                    <IconButton
                      icon={Copy}
                      label={`Duplicate page ${page.order}`}
                      disabled={busy}
                      onClick={() => onDuplicate(page._id)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Delete page ${page.order}`}
                      disabled={pages.length <= 1 || busy}
                      onClick={() => onDelete(page)}
                      className="ml-auto text-danger"
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-hairline p-3">
        <Button
          className="w-full"
          onClick={onToggleManage}
          aria-pressed={manageOpen}
          leadingIcon={GripVertical}
        >
          {manageOpen ? 'Done managing' : 'Manage Pages'}
        </Button>
      </div>
    </Card>
  );
}

export default PagesPanel;
