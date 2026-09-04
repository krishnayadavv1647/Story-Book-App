import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, Eye, Pencil, Share2 } from 'lucide-react';

import { AppShell, StickyActionBar } from '../components/layout/index.js';
import {
  Button,
  Callout,
  ConfirmDialog,
  Input,
  Modal,
  StatusBadge,
  Textarea,
} from '../components/common/index.js';
import { PagesPanel } from '../features/book-editor/PagesPanel.jsx';
import { PageCanvas } from '../features/book-editor/PageCanvas.jsx';
import { InspectorPanel } from '../features/book-editor/InspectorPanel.jsx';
import { useBookEditor } from '../features/book-editor/useBookEditor.js';
import { uploadReferenceImage } from '../api/generation.js';

/**
 * Built from Canva `DAHT3a8GF_Q` (1792 × 896) inside the canonical Shell B.
 *
 *   header row y73–125 · three columns y143–800 · sticky bar y820–870
 *   pages rail 287 wide · canvas 732 · inspector 428, at 20px gaps
 *
 * Preview and Export both lead to the Preview & Export screen (Phase 10).
 * Share belongs to a later phase and stays disabled with a reason.
 */
const SAVE_LABEL = {
  idle: 'All changes saved',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Could not save',
};

export function BookEditorPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const editor = useBookEditor(bookId);

  const [manageOpen, setManageOpen] = useState(false);
  const [zoom, setZoom] = useState(75);
  const [grid, setGrid] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [titleDraft, setTitleDraft] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  if (editor.isPending) {
    return (
      <AppShell>
        <p role="status" className="p-10 text-sm text-ink-muted">
          Loading this book…
        </p>
      </AppShell>
    );
  }

  if (editor.isError) {
    return (
      <AppShell>
        <Callout tone="danger" className="mt-6">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load this book.</span>
            <Button size="sm" onClick={editor.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </AppShell>
    );
  }

  const page = editor.selected;

  const chooseFile = () => fileInput.current?.click();

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !page) return;

    setUploading(true);
    try {
      const asset = await uploadReferenceImage(file);
      await editor.setArtwork.mutateAsync({ pageId: page._id, assetId: asset.assetId });
    } catch {
      // `writePage` has already put the message on screen.
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell contentClassName="flex min-h-0 flex-col overflow-hidden">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(`/books/${bookId}/generate`)}
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Back to Illustrations
        </button>
      </div>

      <div className="mt-2 flex shrink-0 items-center gap-4">
        {titleDraft === null ? (
          <>
            <h1 className="truncate text-3xl font-bold text-ink">
              {editor.book?.title || 'Untitled book'}
            </h1>
            <button
              type="button"
              aria-label="Rename this book"
              onClick={() => setTitleDraft(editor.book?.title ?? '')}
              className="text-ink-muted hover:text-ink"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <Input
            autoFocus
            aria-label="Book title"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => setTitleDraft(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setTitleDraft(null);
              if (event.key === 'Escape') setTitleDraft(null);
            }}
            className="max-w-md"
          />
        )}

        <StatusBadge tone={editor.saveState === 'error' ? 'danger' : 'neutral'} dot>
          {editor.book?.status === 'complete' ? 'Complete' : 'Draft'} ·{' '}
          {SAVE_LABEL[editor.saveState]}
        </StatusBadge>

        <div className="ml-auto flex items-center gap-3">
          <Button
            size="xl"
            leadingIcon={Eye}
            onClick={() => navigate(`/books/${bookId}/preview`)}
          >
            Preview Book
          </Button>
          <Button size="xl" leadingIcon={Share2} disabled title="Sharing arrives with Phase 11">
            Share
          </Button>
          <Button
            size="xl"
            variant="primary"
            trailingIcon={ArrowRight}
            onClick={() => navigate(`/books/${bookId}/preview`)}
          >
            Export Book
          </Button>
        </div>
      </div>

      {editor.error && (
        <Callout tone="danger" className="mt-4 shrink-0">
          {editor.error}
        </Callout>
      )}
      {editor.notice && !editor.error && (
        <Callout className="mt-4 shrink-0">
          <span className="flex w-full items-center justify-between gap-4">
            <span>{editor.notice}</span>
            <Button size="sm" onClick={editor.dismissNotice}>
              Dismiss
            </Button>
          </span>
        </Callout>
      )}

      {/* `fr` tracks are min-content sized by default, which pushed the inspector
          off screen and let the pages rail overflow its row. minmax(0, …) on both
          axes is what lets each panel shrink and scroll inside itself. */}
      <div className="mt-5 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,287fr)_minmax(0,732fr)_minmax(0,428fr)] gap-5">
        <PagesPanel
          pages={editor.pages}
          selectedId={editor.selectedId}
          onSelect={editor.select}
          onAdd={() => editor.addPage.mutate(undefined)}
          onDuplicate={(id) => editor.duplicatePage.mutate(id)}
          onDelete={setPendingDelete}
          onMove={editor.movePage}
          manageOpen={manageOpen}
          onToggleManage={() => setManageOpen((open) => !open)}
          busy={editor.addPage.isPending || editor.reorderPages.isPending}
        />

        <PageCanvas
          page={page}
          zoom={zoom}
          onZoom={setZoom}
          grid={grid}
          onToggleGrid={() => setGrid((on) => !on)}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onRewrite={() => setRewriteOpen(true)}
          onRegenerate={() => page && editor.regenerateImage.mutate(page._id)}
          onMagicLayout={() => page && editor.magicLayout.mutate(page._id)}
          rewriting={editor.rewrite.isPending}
          regenerating={editor.regenerateImage.isPending}
          arranging={editor.magicLayout.isPending}
        />

        <InspectorPanel
          page={page}
          characters={editor.characters}
          onPatch={(patch) => page && editor.writePage(page._id, patch)}
          onApplyToAll={(patch) => editor.applyToAll(patch)}
          onEditText={(patch) => page && editor.editText(page._id, patch)}
          onUpload={chooseFile}
          onGenerate={() => page && editor.regenerateImage.mutate(page._id)}
          onDelete={() => setPendingDelete(page)}
          uploading={uploading || editor.setArtwork.isPending}
          generating={editor.regenerateImage.isPending}
        />
      </div>

      <Modal
        open={rewriteOpen}
        onOpenChange={setRewriteOpen}
        title="Rewrite this page"
        description="The model rewrites the text. Your current wording is kept as a revision."
      >
        <Textarea
          rows={3}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Optional — e.g. make it gentler, or shorter for a bedtime read."
          aria-label="Rewrite instruction"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setRewriteOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={editor.rewrite.isPending}
            onClick={() => {
              editor.rewrite.mutate(
                { pageId: page._id, instruction: instruction.trim() || undefined },
                { onSuccess: () => setRewriteOpen(false) },
              );
            }}
          >
            Rewrite
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete page ${pendingDelete?.order}?`}
        description="The page and its illustration go with it. This cannot be undone."
        confirmLabel="Delete page"
        destructive
        loading={editor.deletePage.isPending}
        onConfirm={() => {
          editor.deletePage.mutate(pendingDelete._id);
          setPendingDelete(null);
        }}
      />

      {/* The editor does not scroll as a page, so the bar is simply the last
          row rather than sticking over the panel beneath it. */}
      <StickyActionBar
        sticky={false}
        className="shrink-0"
        status={SAVE_LABEL[editor.saveState]}
        statusTone={editor.saveState === 'saving' ? 'pending' : 'saved'}
        step={page ? `Page ${page.order} of ${editor.pages.length}` : ''}
        actions={
          <>
            <Button
              size="lg"
              disabled={editor.index <= 0}
              onClick={() => editor.select(editor.pages[editor.index - 1]._id)}
            >
              Previous
            </Button>
            <Button
              size="lg"
              variant="primary"
              trailingIcon={editor.index < editor.pages.length - 1 ? ArrowRight : Check}
              disabled={editor.index >= editor.pages.length - 1}
              onClick={() => editor.select(editor.pages[editor.index + 1]._id)}
            >
              Next Page
            </Button>
          </>
        }
      />
    </AppShell>
  );
}

export default BookEditorPage;
