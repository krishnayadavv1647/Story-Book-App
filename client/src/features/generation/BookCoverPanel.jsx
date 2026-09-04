import { Loader2, Sparkles } from 'lucide-react';

import { Button, Callout, Card, CardHeader } from '../../components/common/index.js';
import { BookCover } from '../../components/books/index.js';
import { useBookCover } from './useBookCover.js';

/**
 * The book's front cover.
 *
 * A cover is not another page illustration. The server draws it from
 * `COVER_BASE_PROMPT`, which letters the title and subtitle into the artwork —
 * and that is why the library card underneath prints neither: the words are in
 * the picture. Until a real one exists the card falls back to setting the same
 * two lines in type, which is what the preview here shows.
 *
 * Generating is a button rather than something that happens on its own when the
 * last page lands: it calls the image model, and a book that already has a cover
 * should not quietly get another.
 */
export function BookCoverPanel({ bookId }) {
  const cover = useBookCover(bookId);

  if (cover.isPending || cover.isError) return null;

  const status = cover.inFlight
    ? 'Drawing the cover — the title and subtitle are lettered into the artwork itself.'
    : cover.isGenerated
      ? 'This cover was drawn for this book, title and all.'
      : cover.source === 'page'
        ? 'A page illustration is standing in. Generate a cover to get one with the title on it.'
        : 'No cover yet. It is drawn from your story, with the title and subtitle set into the artwork.';

  return (
    <Card className="mt-6">
      <CardHeader title="Book Cover" />

      <div className="mt-4 flex flex-col gap-5 sm:flex-row">
        <div className="w-[170px] shrink-0">
          <BookCover
            imageUrl={cover.coverUrl}
            lettered={cover.isGenerated}
            title={cover.title}
            subtitle={cover.subtitle}
          />
        </div>

        <div className="flex flex-1 flex-col items-start gap-3">
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            {cover.inFlight && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            )}
            {status}
          </p>

          {cover.jobError && !cover.inFlight && (
            <Callout tone="danger">{cover.jobError}</Callout>
          )}
          {cover.error && <Callout tone="danger">{cover.error}</Callout>}

          <Button
            variant="primary"
            size="lg"
            leadingIcon={Sparkles}
            loading={cover.generate.isPending}
            disabled={cover.inFlight}
            onClick={() => cover.generate.mutate()}
          >
            {cover.isGenerated ? 'Regenerate cover' : 'Generate cover'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default BookCoverPanel;
