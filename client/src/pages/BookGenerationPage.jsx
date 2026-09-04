import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, ImageOff, Loader2, RotateCcw, Sparkles, User } from 'lucide-react';

import { AppShell, PageHeader, StickyActionBar } from '../components/layout/index.js';
import { Button, Callout, Card, SectionHeading, StatusBadge } from '../components/common/index.js';
import { useBookGeneration } from '../features/generation/useBookGeneration.js';
import { BookCoverPanel } from '../features/generation/BookCoverPanel.jsx';
import { RunStages } from '../features/generation/RunStages.jsx';

/**
 * SYSTEM-DERIVED. No approved frame covers generation progress
 * (see references/design-source-map.md §2d), so this is built from the measured
 * tokens and the Phase 2 primitives.
 *
 * The design goal is that a partial failure reads as a partial failure: every
 * page reports its own state, a failed page is retryable on its own, and the
 * pages that succeeded are visible rather than hidden behind a single error.
 *
 * It is also where a run is watched. On autopilot nobody presses anything here:
 * the cast is drawn, then the pages, then the cover. Every manual control stays
 * on the screen anyway — a run that stalls, or one stage that fails, has to be
 * recoverable without starting the book again.
 */
const PAGE_TONE = {
  ready: { tone: 'success', label: 'Ready' },
  generating: { tone: 'warning', label: 'Illustrating' },
  queued: { tone: 'warning', label: 'Queued' },
  pending: { tone: 'neutral', label: 'Waiting' },
  failed: { tone: 'danger', label: 'Failed' },
};

export function BookGenerationPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const generation = useBookGeneration(bookId);

  // Set when the agent could start the plan but not the run — most often an
  // empty wallet. The book exists and every control below still works.
  const handoffError = location.state?.autopilotError ?? null;

  if (generation.isPending) {
    return (
      <AppShell>
        <p role="status" className="p-10 text-sm text-ink-muted">
          Loading this book…
        </p>
      </AppShell>
    );
  }

  if (generation.isError) {
    return (
      <AppShell>
        <Callout tone="danger" className="mt-6">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load this book’s pages.</span>
            <Button size="sm" onClick={generation.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </AppShell>
    );
  }

  const notStarted =
    generation.ready === 0 && generation.inFlight === 0 && generation.failed === 0;

  const onAutopilot = generation.autopilot.enabled;
  const runFinished = onAutopilot && generation.autopilot.stage === 'done';
  const castDrawing = generation.autopilot.stage === 'characters';

  return (
    <AppShell>
      <PageHeader
        backTo={`/books/${bookId}/characters`}
        backLabel="Back to Characters"
        title={onAutopilot ? 'Making Your Book' : 'Illustrate Your Book'}
        subtitle={
          onAutopilot
            ? 'Characters first, then every page, then the cover. Nothing to press — you can close this and come back.'
            : 'Each page is generated on its own, so one failure never costs you the rest.'
        }
        actions={
          <Button
            size="xl"
            variant="primary"
            leadingIcon={Sparkles}
            loading={generation.startAll.isPending}
            disabled={generation.isRunning || generation.isComplete}
            onClick={() => generation.startAll.mutate()}
          >
            {generation.failed > 0 ? 'Retry failed pages' : 'Illustrate all pages'}
          </Button>
        }
      />

      {onAutopilot && (
        <RunStages
          className="mt-5"
          stage={generation.autopilot.stage}
          characters={generation.characters}
          pagesReady={generation.ready}
          pagesTotal={generation.total}
        />
      )}

      {handoffError && (
        <Callout tone="warning" className="mt-5">
          {handoffError} You can still start it yourself from this screen.
        </Callout>
      )}

      {generation.autopilot.error && (
        <Callout tone="warning" className="mt-5">
          {generation.autopilot.error}
        </Callout>
      )}

      {generation.error && (
        <Callout tone="danger" className="mt-5">
          {generation.error}
        </Callout>
      )}

      {/* Only while it matters. Once the pages are under way the cast is done,
          and a row of finished portraits is just something else to scroll past. */}
      {castDrawing && generation.characters.length > 0 && (
        <div className="mt-6">
          <SectionHeading size="lg" count={generation.characters.length}>
            Characters
          </SectionHeading>

          <ul className="mt-4 flex flex-wrap gap-3">
            {generation.characters.map((character) => (
              <li key={character.characterId} className="w-[128px]">
                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-hairline bg-page">
                  {character.imageUrl ? (
                    <img
                      src={character.imageUrl}
                      alt={character.name}
                      className="h-full w-full object-cover"
                    />
                  ) : character.status === 'failed' ? (
                    <ImageOff className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-ink-muted" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-ink">
                  <User className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden="true" />
                  {character.name}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Above the pages, because it is the one illustration that is about the
          book rather than about a page — and because the library card shows it. */}
      <BookCoverPanel bookId={bookId} />

      <div className="mt-6">
        <SectionHeading size="lg" count={generation.total}>
          Pages
        </SectionHeading>

        {/* Progress is read from the pages themselves — a page can be settled by
            a provider callback this browser never saw. */}
        <div className="mt-4 flex items-center gap-4">
          <div
            role="progressbar"
            aria-valuenow={generation.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Illustration progress"
            className="h-2 flex-1 overflow-hidden rounded-pill bg-pill"
          >
            <div
              className="h-full rounded-pill surface-gold-bar transition-[width] duration-500"
              style={{ width: `${generation.percent}%` }}
            />
          </div>
          <p className="shrink-0 text-sm text-ink-muted">
            {generation.ready} of {generation.total} ready
            {generation.failed > 0 ? ` · ${generation.failed} failed` : ''}
          </p>
        </div>

        {notStarted && !generation.autopilot.isRunning && (
          <Callout className="mt-5">
            Nothing has been illustrated yet. Every page is generated separately, and you are
            charged per page.
          </Callout>
        )}

        <ul className="mt-6 grid grid-cols-2 gap-4 pb-6 lg:grid-cols-3 2xl:grid-cols-4">
          {generation.pages.map((page) => {
            const tone = PAGE_TONE[page.status] ?? PAGE_TONE.pending;

            return (
              <li key={page.pageId}>
                <Card className="flex h-full flex-col p-0">
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-lg bg-page">
                    {page.imageUrl ? (
                      <img
                        src={page.imageUrl}
                        alt={`Page ${page.order}${page.title ? `: ${page.title}` : ''}`}
                        className="h-full w-full object-cover"
                      />
                    ) : page.status === 'generating' || page.status === 'queued' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-ink-muted" aria-hidden="true" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="truncate text-sm font-semibold text-ink">
                      Page {page.order}
                      {page.title ? ` — ${page.title}` : ''}
                    </p>

                    <StatusBadge tone={tone.tone} dot className="self-start">
                      {tone.label}
                    </StatusBadge>

                    {page.error && <p className="text-xs text-danger">{page.error}</p>}

                    {page.status === 'failed' && (
                      <Button
                        size="sm"
                        leadingIcon={RotateCcw}
                        className="mt-auto self-start"
                        loading={generation.retryPage.isPending}
                        onClick={() => generation.retryPage.mutate(page.pageId)}
                      >
                        Retry this page
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <StickyActionBar
        status={
          runFinished || generation.isComplete
            ? 'Your book is ready'
            : castDrawing
              ? 'Drawing your characters'
              : generation.autopilot.stage === 'cover'
                ? 'Drawing the cover'
                : generation.isRunning
                  ? `Illustrating — ${generation.ready} of ${generation.total} done`
                  : generation.failed > 0
                    ? `${generation.failed} ${generation.failed === 1 ? 'page needs' : 'pages need'} another go`
                    : 'Ready to illustrate'
        }
        statusTone={runFinished || generation.isComplete ? 'saved' : 'pending'}
        actions={
          <>
            <Button size="lg" onClick={() => navigate(`/books/${bookId}/editor`)}>
              Edit pages
            </Button>
            <Button
              size="lg"
              variant="primary"
              trailingIcon={ArrowRight}
              leadingIcon={runFinished || generation.isComplete ? Check : undefined}
              onClick={() => navigate(`/books/${bookId}/preview`)}
            >
              Read your book
            </Button>
          </>
        }
      />
    </AppShell>
  );
}

export default BookGenerationPage;
