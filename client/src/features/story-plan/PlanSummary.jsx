import { BookOpen, Coins, Image as ImageIcon } from 'lucide-react';
import { Avatar, Callout, Card, CardHeader, StatusBadge } from '../../components/common/index.js';

/**
 * The right rail: Book Summary, Characters Detected and Generation Estimate.
 * Measured from frame 1:2, nodes 1:159, 1:166 and 1:180 — a 520-wide column.
 */
export function PlanSummary({ book, pages, characters, estimate }) {
  return (
    <div className="space-y-5">
      <section aria-label="Book Summary">
        <Card>
          <CardHeader title="Book Summary" />

          <div className="mt-4 flex flex-col items-center">
            {/* Placeholder cover until one is generated — the frame draws a flat
              green panel carrying the title. */}
            <div className="flex aspect-[300/244] w-full max-w-[300px] items-start justify-start rounded-xl bg-cover-placeholder p-6">
              <p className="text-3xl font-bold leading-tight text-cover-glyph">{book.title}</p>
            </div>

            <p className="mt-4 text-center text-md font-semibold text-ink">{book.title}</p>
            <p className="mt-2 text-sm text-ink-muted">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
              {book.genre ? ` • ${book.genre}` : ''}
            </p>
          </div>
        </Card>
      </section>

      <section aria-label="Characters Detected">
        <Card>
          <CardHeader title="Characters Detected" />

          <ul className="mt-4 space-y-3">
            {characters.length === 0 && (
              <li className="text-sm text-ink-muted">No characters were detected in this plan.</li>
            )}

            {characters.map((character) => (
              <li key={character._id} className="flex items-center gap-3">
                <Avatar name={character.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{character.name}</p>
                  <p className="text-xs text-ink-muted">
                    {character.role === 'main' ? 'Main Character' : 'Supporting Character'}
                  </p>
                </div>
                <StatusBadge tone={character.status === 'ready' ? 'success' : 'neutral'}>
                  {character.status === 'ready' ? 'Ready' : 'Needs Design'}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-label="Generation Estimate">
        <Card>
          <CardHeader title="Generation Estimate" />

          <ul className="mt-4 space-y-2 text-sm text-ink">
            <li className="flex items-center gap-3">
              <BookOpen className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              {estimate.storyPages} story pages
            </li>
            <li className="flex items-center gap-3">
              <ImageIcon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              {estimate.illustrations} illustrations including covers
            </li>
            {/* What it will cost, before it is spent — a price found out
                afterwards is a bill, not an estimate. */}
            {estimate.credits && (
              <li className="flex items-center gap-3">
                <Coins className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                {estimate.credits.total} credits to finish it
              </li>
            )}
          </ul>

          <Callout className="mt-4">You can edit every page after generation.</Callout>
        </Card>
      </section>
    </div>
  );
}

export default PlanSummary;
