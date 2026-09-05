import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { AppShell } from '../components/layout/index.js';
import { Button, Callout, Card, SectionHeading } from '../components/common/index.js';
import { BookCard, CardGridSkeleton } from '../components/books/index.js';
import { DashboardHero } from '../features/dashboard/DashboardHero.jsx';
import { useLibrarySummary, useRecentBooks } from '../features/dashboard/useDashboard.js';

/**
 * Built from Figma `eQzIIC5gfOmGE392HvA7aC` frame 1:2.
 *
 * Card grid is 6 columns at the approved 1920px viewport with a 22px gutter, as
 * drawn, and steps down from there. The frame ends just below the "Your
 * Storybooks" heading, so the book grid, its empty state and its loading and
 * error states are system-derived.
 *
 * DEVIATION: the frame's "Templates / Genre" tab strip sat between the hero and
 * this grid, filled by a hard-coded catalogue of six invented books drawn as
 * flat colour blocks. Removed at the owner's request — they read as real books
 * on the account without being any, and two of them even shared titles with
 * genuine ones. The owner's own library now occupies that position. Recorded in
 * the design source map.
 */
const GRID = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

function LoadFailed({ what, onRetry }) {
  return (
    <Callout tone="danger" className="mt-4">
      <span className="flex w-full items-center justify-between gap-4">
        <span>Could not load {what}.</span>
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      </span>
    </Callout>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  const recent = useRecentBooks({ limit: 12 });
  const summary = useLibrarySummary();

  const startStory = () => navigate('/agent');

  return (
    <AppShell>
      <DashboardHero onCreate={startStory} />

      <div className="mt-8">
        <SectionHeading
          size="lg"
          count={summary.data?.total}
          actions={
            <Button variant="primary" size="xl" leadingIcon={Plus} onClick={startStory}>
              Create Storybook
            </Button>
          }
        >
          Your Storybooks
        </SectionHeading>

        <div className="mt-6">
          {recent.isPending && <CardGridSkeleton className={GRID} count={6} />}
          {recent.isError && <LoadFailed what="your storybooks" onRetry={recent.refetch} />}

          {recent.data?.items.length === 0 && (
            <Card className="flex flex-col items-center justify-center py-14 text-center">
              <p className="text-base font-semibold text-ink">No storybooks yet</p>
              <p className="mt-2 max-w-sm text-sm text-ink-muted">
                Describe the story you have in mind and the Story Agent will draft a plan for you.
              </p>
              <Button variant="primary" size="lg" className="mt-6" onClick={startStory}>
                Create your first storybook
              </Button>
            </Card>
          )}

          {recent.data?.items.length > 0 && (
            <ul className={`grid gap-[22px] ${GRID}`}>
              {recent.data.items.map((book) => (
                <li key={book._id ?? book.id}>
                  {/* Every card is now the same book-shaped aspect ratio, so the
                      grid no longer needs stretching to keep a row level. On the
                      dashboard a card leads to the My Books library rather than
                      straight into the book. */}
                  <BookCard book={book} to="/books" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default DashboardPage;
