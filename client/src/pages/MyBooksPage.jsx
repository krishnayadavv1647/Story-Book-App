import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Eye, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';

import { AppShell, PageHeader } from '../components/layout/index.js';
import {
  Button,
  Callout,
  ConfirmDialog,
  IconButton,
  SectionHeading,
  SegmentedTabs,
  StatusBadge,
} from '../components/common/index.js';
import { BookCover, UNBADGED_STATUSES } from '../components/books/index.js';
import { useBooks } from '../features/books/useBooks.js';

/**
 * SYSTEM-DERIVED. The approved frames draw a "My Books" nav row but no such
 * screen, so this is built from the measured tokens and the Phase 2 primitives,
 * reusing the Dashboard's book card shape so the two read as one product.
 *
 * The point of the screen is to answer "where did I leave off" — every card
 * says what state the book is in and takes you to the step that state implies.
 * The two actions stay: the caption band they used to sit in is gone, so they
 * sit under the book on the page's own ground.
 */
const STATUS_TONE = {
  draft: { tone: 'neutral', label: 'Draft' },
  planning: { tone: 'warning', label: 'Planning' },
  plan_ready: { tone: 'warning', label: 'Plan ready' },
  characters_ready: { tone: 'warning', label: 'Cast ready' },
  generating: { tone: 'warning', label: 'Illustrating' },
  ready: { tone: 'success', label: 'Ready' },
  published: { tone: 'success', label: 'Published' },
  failed: { tone: 'danger', label: 'Failed' },
  archived: { tone: 'neutral', label: 'Archived' },
};

/** Where a book of this status wants you to go next. */
function nextStep(book) {
  switch (book.status) {
    case 'draft':
    case 'planning':
    case 'plan_ready':
      return { to: `/books/${book._id}/plan`, label: 'Review plan' };
    case 'characters_ready':
      return { to: `/books/${book._id}/characters`, label: 'Characters' };
    case 'generating':
      return { to: `/books/${book._id}/generate`, label: 'Illustrations' };
    default:
      return { to: `/books/${book._id}/editor`, label: 'Open editor' };
  }
}

export function MyBooksPage({ onlyPublished = false }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState(onlyPublished ? 'published' : 'all');
  const books = useBooks({ status: filter === 'all' ? undefined : filter });

  // Held as the whole book, not an id: the dialog names the title, and by the
  // time it is confirmed the book is being removed from the list underneath it.
  const [pendingDelete, setPendingDelete] = useState(null);

  const title = onlyPublished ? 'Published Books' : 'My Books';

  return (
    <AppShell status={onlyPublished ? 'published' : 'my_books'}>
      <PageHeader
        title={title}
        subtitle={
          onlyPublished
            ? 'Everything you have finished and published.'
            : 'Every storybook on this account, and where you left off.'
        }
        actions={
          <Button
            size="xl"
            variant="primary"
            leadingIcon={Plus}
            onClick={() => navigate('/agent')}
          >
            New Storybook
          </Button>
        }
      />

      {!onlyPublished && (
        <div className="mt-5 max-w-[520px]">
          <SegmentedTabs
            value={filter}
            onValueChange={setFilter}
            items={[
              { value: 'all', label: 'All', icon: BookOpen },
              { value: 'ready', label: 'Finished', icon: Sparkles },
              { value: 'published', label: 'Published', icon: Eye },
            ]}
          />
        </div>
      )}

      {books.isError && (
        <Callout tone="danger" className="mt-5">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load your books.</span>
            <Button size="sm" onClick={books.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      )}

      {books.error && (
        <Callout tone="danger" className="mt-5">
          {books.error}
        </Callout>
      )}

      <div className="mt-6">
        <SectionHeading size="lg" count={books.items.length}>
          {title}
        </SectionHeading>

        {books.isPending ? (
          <p role="status" className="mt-4 text-sm text-ink-muted">
            Loading…
          </p>
        ) : books.items.length === 0 ? (
          <Callout className="mt-4">
            {onlyPublished
              ? 'Nothing published yet. Finish a book, then publish it from the preview screen.'
              : 'No storybooks yet. Start one with the Story Book Agent.'}
          </Callout>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-[22px] pb-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {books.items.map((book) => {
              const status = STATUS_TONE[book.status] ?? STATUS_TONE.draft;
              const step = nextStep(book);

              return (
                <li key={book._id} className="flex flex-col gap-3">
                  {/* The cover is the link, and it goes where the book's state
                      says it should. The title is inside the cover — the
                      generated artwork letters it, and the fallback sets it in
                      type — so nothing repeats it underneath. */}
                  <BookCover
                    to={step.to}
                    imageUrl={book.coverUrl}
                    lettered={book.coverSource === 'generated'}
                    title={book.title}
                    subtitle={book.subtitle || book.genre}
                    // `ready` is shown here, unlike on the Dashboard: this
                    // screen exists to answer "where did I leave off".
                    badge={
                      !UNBADGED_STATUSES.has(book.status) && (
                        <StatusBadge tone={status.tone} dot>
                          {status.label}
                        </StatusBadge>
                      )
                    }
                  />

                  {/* Off the paint, still in the accessibility tree — a reader
                      who cannot see the cover still learns how long the book is. */}
                  <p className="sr-only">
                    {book.pageCount} {book.pageCount === 1 ? 'page' : 'pages'}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      leadingIcon={Pencil}
                      onClick={() => navigate(step.to)}
                    >
                      {step.label}
                    </Button>
                    <Button
                      size="sm"
                      leadingIcon={Eye}
                      onClick={() => navigate(`/books/${book._id}/preview`)}
                    >
                      Preview
                    </Button>

                    {/* Icon-only and last: deleting a book is not one of the two
                        things you came to this screen to do, and it should not
                        sit at the same weight as opening it. */}
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      tone="danger"
                      label={`Delete ${book.title || 'this book'}`}
                      className="ml-auto"
                      onClick={() => setPendingDelete(book)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title || 'Untitled'}”?`}
        description={
          `Its ${pendingDelete?.pageCount ?? 0} ${
            pendingDelete?.pageCount === 1 ? 'page' : 'pages'
          } and illustrations go with it, and this cannot be undone. ` +
          'Characters stay in your library — they belong to your account, not to one book.'
        }
        confirmLabel="Delete this book"
        destructive
        loading={books.remove.isPending}
        onConfirm={() =>
          books.remove.mutate(pendingDelete._id, { onSettled: () => setPendingDelete(null) })
        }
      />
    </AppShell>
  );
}

export default MyBooksPage;
