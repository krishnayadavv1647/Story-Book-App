import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';

import { AppShell, StickyActionBar } from '../components/layout/index.js';
import { Button, Callout, StatusBadge } from '../components/common/index.js';
import { BookPreview } from '../features/preview-export/BookPreview.jsx';
import { ExportPanel } from '../features/preview-export/ExportPanel.jsx';
import { usePreviewExport } from '../features/preview-export/usePreviewExport.js';

/**
 * Built from Canva `DAHT3Yy2mJA` (1792 × 896) inside the canonical Shell B.
 *
 *   header y73–125 · two columns y143–800 (preview 1008 · export 442) · bar y820
 *
 * DEVIATION, at the owner's request: the drawn "Share Preview" button was a
 * disabled placeholder for a sharing phase that has not happened. It now opens
 * the book in the browser — `/books/:id/read`, the whole book with none of the
 * app around it — and is named for what it does. Sharing a link with someone
 * else is still unbuilt, and the publishing tab still says so.
 */
export function BookPreviewPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const preview = usePreviewExport(bookId);

  const [view, setView] = useState('book');
  const [index, setIndex] = useState(0);
  // 100% is the book filling the pane — see `FIT` in BookPreview.
  const [zoom, setZoom] = useState(100);
  const [bleed, setBleed] = useState(false);

  if (preview.isPending) {
    return (
      <AppShell>
        <p role="status" className="p-10 text-sm text-ink-muted">
          Loading this book…
        </p>
      </AppShell>
    );
  }

  if (preview.isError) {
    return (
      <AppShell>
        <Callout tone="danger" className="mt-6">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load this book.</span>
            <Button size="sm" onClick={preview.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </AppShell>
    );
  }

  const readiness = preview.readiness;
  const published = preview.book?.status === 'published';

  // The safe-area inset as a fraction of the page width, from the book's print
  // settings — drives the safe-area guide the preview draws.
  const SIZE_WIDTH_IN = { '8x8': 8, '8.5x11': 8.5, a4: 8.27 };
  const printCfg = preview.book?.print ?? {};
  const widthIn =
    printCfg.size === 'custom'
      ? printCfg.customWidthIn || 8
      : (SIZE_WIDTH_IN[printCfg.size] ?? 8);
  const safeFraction = Math.min(0.2, Math.max(0.01, (printCfg.safeMarginIn ?? 0.25) / widthIn));

  return (
    <AppShell contentClassName="flex min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(`/books/${bookId}/editor`)}
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Back to Book Editor
        </button>
      </div>

      <div className="mt-2 flex shrink-0 items-start gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold text-ink">Preview &amp; Export Your Book</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Review every page and choose how you want to publish.
          </p>
        </div>

        <StatusBadge tone={readiness?.ready ? 'success' : 'warning'} dot className="mt-1">
          {readiness?.ready ? 'Ready to export' : 'Not finished'} · {preview.pages.length} pages
        </StatusBadge>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <Button
            size="xl"
            leadingIcon={ExternalLink}
            title="Open the whole book in a new tab"
            // A new tab rather than a navigation: reading the book is something
            // you do beside the export settings, not instead of them.
            onClick={() => window.open(`/books/${bookId}/read`, '_blank', 'noopener')}
          >
            Open Preview
          </Button>
          <Button
            size="xl"
            variant="primary"
            trailingIcon={ArrowRight}
            loading={preview.runExport.isPending}
            onClick={() => preview.runExport.mutate()}
          >
            Export Book
          </Button>
        </div>
      </div>

      {preview.error && (
        <Callout tone="danger" className="mt-4 shrink-0">
          {preview.error}
        </Callout>
      )}

      {!preview.error && readiness && !readiness.ready && (
        <Callout tone="warning" className="mt-4 shrink-0">
          {readiness.missingArt.length > 0 && (
            <span>
              No illustration on {readiness.missingArt.length === 1 ? 'page' : 'pages'}{' '}
              {readiness.missingArt.join(', ')}.{' '}
            </span>
          )}
          {readiness.missingText.length > 0 && (
            <span>
              No text on {readiness.missingText.length === 1 ? 'page' : 'pages'}{' '}
              {readiness.missingText.join(', ')}.{' '}
            </span>
          )}
          You can still export — those pages will simply be blank.
        </Callout>
      )}

      {!preview.error && readiness?.ready && !preview.result && (
        <Callout className="mt-4 shrink-0">All pages look good.</Callout>
      )}

      {preview.result && (
        <Callout tone="success" className="mt-4 shrink-0">
          Export ready — {preview.result.pageCount} pages.
        </Callout>
      )}

      <div className="mt-5 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1008fr)_minmax(0,442fr)] gap-5">
        <BookPreview
          pages={preview.pages}
          view={view}
          onViewChange={setView}
          index={index}
          onIndexChange={setIndex}
          zoom={zoom}
          onZoom={setZoom}
          bleed={bleed}
          onBleedChange={setBleed}
          safeFraction={safeFraction}
        />

        <ExportPanel
          settings={preview.settings}
          onChange={preview.update}
          pageSizes={preview.pageSizes}
          filename={preview.filename}
          estimatedSizeBytes={preview.estimatedSizeBytes}
          pageCount={preview.pages.length}
          onExport={() => preview.runExport.mutate()}
          exporting={preview.runExport.isPending}
          onPublish={(next) => preview.publish.mutate(next)}
          publishing={preview.publish.isPending}
          published={published}
          result={preview.result}
          print={preview.book?.print ?? {}}
          onSavePrint={(patch) => preview.savePrint.mutate(patch)}
          printCheck={preview.printCheck}
          printCheckPending={preview.printCheckPending}
          onPreparePrint={() => preview.preparePrint.mutate()}
          preparingPrint={preview.preparePrint.isPending}
        />
      </div>

      <StickyActionBar
        sticky={false}
        className="shrink-0"
        status={published ? 'Published' : 'Book saved'}
        statusTone="saved"
        step="Final Step · Ready to publish"
        actions={
          <>
            <Button size="lg" onClick={() => navigate(`/books/${bookId}/editor`)}>
              Back to Editor
            </Button>
            <Button
              size="lg"
              variant="primary"
              leadingIcon={published ? Check : undefined}
              trailingIcon={published ? undefined : ArrowRight}
              loading={preview.publish.isPending}
              onClick={() => preview.publish.mutate(!published)}
            >
              {published ? 'Published' : 'Publish Book'}
            </Button>
          </>
        }
      />
    </AppShell>
  );
}

export default BookPreviewPage;
