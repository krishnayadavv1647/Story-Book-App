import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { cn } from '../lib/cn.js';
import * as planApi from '../api/plan.js';
import { Button, Callout, IconButton } from '../components/common/index.js';
import { BookCover } from '../components/books/index.js';
import { BookStage, buildLeaves } from '../features/preview-export/BookStage.jsx';
import { previewKeys } from '../features/preview-export/usePreviewExport.js';
import { useBookCover } from '../features/generation/useBookCover.js';

/**
 * The book, read as a book.
 *
 * SYSTEM-DERIVED. The Preview & Export screen draws a preview *pane* — a small
 * sheet beside an export panel, sized for checking pages while you work. This is
 * the other thing "preview" means: the finished book filling the browser, opening
 * on its cover, two leaves at a time on a desktop and one on a phone, with the
 * pages actually turning under the pointer.
 *
 * Deliberately outside `AppShell`. The sidebar is the app; a book being read is
 * not the app, and 274px of navigation beside it would only make the book
 * smaller.
 *
 * Pages go through `PageSheet`, which draws them at paper size and scales them —
 * the same sheet the Preview pane uses and the same renderer underneath as the
 * editor and both exporters. What is read here is what gets printed.
 */
export function BookReaderPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  // 'landscape' means two leaves are showing, so the reader is on an opening
  // rather than on a single leaf. The flipbook decides it from the room it has.
  const [orientation, setOrientation] = useState('portrait');

  // The same query key the Preview screen uses, so arriving from it is instant
  // rather than a second fetch of a book already in hand.
  const book = useQuery({
    queryKey: previewKeys.book(bookId),
    queryFn: () => planApi.fetchBookDetail(bookId),
    enabled: Boolean(bookId),
  });

  // The cover is not part of the book detail — it is an asset, and its URL is
  // signed — so it comes from the endpoint that owns it.
  const cover = useBookCover(bookId);

  const pages = useMemo(() => book.data?.pages ?? [], [book.data]);
  const title = book.data?.book?.title ?? '';
  const description = book.data?.book?.description ?? '';
  // Printed small in the outer margin of every text leaf, as the reference does.
  const author = book.data?.book?.author ?? '';
  const hasCover = Boolean(cover.coverUrl);

  const leaves = useMemo(() => {
    /**
     * The closed book, drawn as the object the library cards draw — same spine,
     * same page block, same cover artwork with the title lettered into it.
     * Opening a book on the shelf and opening it here are the same book.
     */
    const front = hasCover ? (
      <BookCover
        imageUrl={cover.coverUrl}
        lettered={cover.isGenerated}
        title={cover.title || title}
        subtitle={cover.subtitle}
        className="h-full w-full"
      />
    ) : null;

    /**
     * The back board. A real one carries the blurb, so this one does: the story's
     * own description, set in the book's face on the book's paper. Nothing is
     * invented for it — a book with no description simply gets its title.
     */
    const back = (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-4 px-[16%] text-center"
        style={{ background: 'var(--paper-page)', fontFamily: 'var(--font-book)' }}
      >
        <p style={{ color: 'var(--page-ink)', fontSize: '1.5em', lineHeight: 1.25 }}>{title}</p>
        {description && (
          <p style={{ color: 'var(--page-head)', fontSize: '0.95em', lineHeight: 1.6 }}>
            {description}
          </p>
        )}
        {author && (
          <p
            style={{
              color: 'var(--page-head)',
              fontSize: '0.8em',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {author}
          </p>
        )}
      </div>
    );

    return buildLeaves({ pages, cover: front, backCover: back, author });
  }, [
    author,
    description,
    pages,
    hasCover,
    cover.coverUrl,
    cover.isGenerated,
    cover.title,
    cover.subtitle,
    title,
  ]);

  /**
   * Where the dots go: one stop per page rather than per leaf — a ten-page book
   * has twenty-two leaves, and twenty-two dots is a scrollbar, not a control.
   *
   * Read off the leaves rather than counted, because how many leaves a page
   * takes is its layout's decision: two for an opening, one for the presets that
   * put the picture and the words on the same leaf.
   */
  const stops = useMemo(() => {
    const list = [];
    const seen = new Set();

    leaves.forEach((leaf, at) => {
      if (leaf.isCover) {
        if (at === 0) list.push({ at, label: 'the cover' });
        return;
      }

      const id = leaf.page?._id ?? leaf.page?.order;
      if (id == null || seen.has(id)) return;

      seen.add(id);
      list.push({ at, label: `page ${leaf.page.order}` });
    });

    return list;
  }, [leaves]);

  // A book that reflows — the cover arriving after the pages, say — must not
  // leave the reader parked past the end of it.
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, leaves.length - 1)));
  }, [leaves.length]);

  const last = Math.max(0, leaves.length - 1);

  // A book is read with the arrow keys. Escape closes it, the way anything
  // filling the screen should.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') setIndex((at) => Math.min(at + 1, last));
      else if (event.key === 'ArrowLeft') setIndex((at) => Math.max(at - 1, 0));
      else if (event.key === 'Escape') navigate(`/books/${bookId}/preview`);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, navigate, bookId]);

  if (book.isPending) {
    return (
      <div className="flex h-full items-center justify-center bg-page">
        <p role="status" className="text-sm text-ink-muted">
          Opening this book…
        </p>
      </div>
    );
  }

  if (book.isError) {
    return (
      <div className="flex h-full items-center justify-center bg-page p-10">
        <Callout tone="danger">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load this book.</span>
            <Button size="sm" onClick={book.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </div>
    );
  }

  const leaf = leaves[index];
  // With two leaves showing, the picture and its words are both on screen, so
  // the reader is on the page — not on half of it.
  const spread = orientation === 'landscape';
  const where = leaf?.isCover
    ? index === 0 && hasCover
      ? 'Cover'
      : 'Back cover'
    : leaf?.page
      ? `Page ${leaf.page.order} of ${pages.length}${
          !spread && leaf.part === 'art' ? ' · illustration' : ''
        }`
      : '';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-page-deep">
      {/* Thin on purpose: the book is the screen, and this is only what you need
          to leave it and to know where you are. */}
      <header className="flex shrink-0 items-center gap-4 px-4 py-3">
        <IconButton
          icon={X}
          label="Close the book"
          onClick={() => navigate(`/books/${bookId}/preview`)}
        />
        <h1 className="min-w-0 truncate text-base font-semibold text-ink">{title}</h1>
        <p className="ml-auto shrink-0 text-xs text-ink-muted">{pages.length > 0 ? where : ''}</p>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-4 sm:gap-4 sm:px-4">
        <IconButton
          icon={ChevronLeft}
          label="Previous page"
          disabled={index === 0}
          onClick={() => setIndex(Math.max(index - 1, 0))}
        />

        {pages.length === 0 ? (
          <p className="text-sm text-ink-muted">This book has no pages yet.</p>
        ) : (
          <BookStage
            leaves={leaves}
            index={index}
            onIndexChange={setIndex}
            onOrientationChange={setOrientation}
            className="min-w-0"
          />
        )}

        <IconButton
          icon={ChevronRight}
          label="Next page"
          disabled={index >= last}
          onClick={() => setIndex(Math.min(index + 1, last))}
        />
      </div>

      {stops.length > 1 && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 px-4 pb-5">
          {stops.map((stop) => (
            <button
              key={stop.at}
              type="button"
              aria-label={`Go to ${stop.label}`}
              aria-current={stop.at === index ? 'true' : undefined}
              onClick={() => setIndex(stop.at)}
              className={cn(
                'h-1.5 rounded-pill transition-all',
                stop.at === index ? 'w-5 bg-gold' : 'w-1.5 bg-surface-elevated hover:bg-surface-hover',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default BookReaderPage;
