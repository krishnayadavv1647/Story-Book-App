import { BookCover } from './BookCover.jsx';
import { UNBADGED_STATUSES } from './bookStatus.js';
import { StatusBadge } from '../common/StatusBadge.jsx';

/**
 * A book in the library.
 *
 * Now drawn as the book itself — Figma `hY9EcRsQJIcA35YpTPfxeE` frame 1:3 — with
 * no card, no border and no printed caption band. The title and subtitle used to
 * sit in a white label underneath; they are now inside the cover artwork, put
 * there by the server's cover prompt, so printing them again beneath the picture
 * would say everything twice. Recorded in the design source map.
 *
 * Nothing was removed from the page, only from the paint: `CoverArt` carries the
 * title as the image's `alt`, and the page count and genre are still announced.
 *
 * A link, not a button — opening a book is navigation.
 */
const STATUS_TONE = {
  ready: { tone: 'success', label: 'Ready' },
  generating: { tone: 'warning', label: 'Generating' },
  queued: { tone: 'warning', label: 'Queued' },
  failed: { tone: 'danger', label: 'Failed' },
  draft: { tone: 'neutral', label: 'Draft' },
  planning: { tone: 'neutral', label: 'Planning' },
  plan_ready: { tone: 'neutral', label: 'Plan ready' },
  characters_ready: { tone: 'neutral', label: 'Characters ready' },
  published: { tone: 'success', label: 'Published' },
  archived: { tone: 'neutral', label: 'Archived' },
};

export function BookCard({ book, className }) {
  const status = STATUS_TONE[book.status] ?? STATUS_TONE.draft;
  const pages = book.pageCount ?? 0;

  return (
    <BookCover
      to={`/books/${book.id ?? book._id}`}
      imageUrl={book.coverUrl}
      // Only a cover the server drew as a cover has the title inside it. A page
      // illustration standing in says nothing, so the card sets the title over
      // it instead of leaving the book nameless.
      lettered={book.coverSource === 'generated'}
      title={book.title}
      subtitle={book.subtitle || book.genre}
      color={book.coverColor}
      className={className}
      badge={
        // Anything still in progress is called out on the cover, where it is
        // seen before the reader commits to opening the book. A finished book
        // says nothing, and neither do the two states in `UNBADGED_STATUSES`.
        book.status !== 'ready' &&
        !UNBADGED_STATUSES.has(book.status) && (
          <StatusBadge tone={status.tone} dot>
            {status.label}
          </StatusBadge>
        )
      }
    >
      <span className="sr-only">
        {pages} {pages === 1 ? 'page' : 'pages'}
        {book.genre ? ` • ${book.genre}` : ''}
      </span>
    </BookCover>
  );
}

export default BookCard;
