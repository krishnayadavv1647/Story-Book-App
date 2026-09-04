import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, RefreshCw } from 'lucide-react';

import { api, ApiClientError } from '../api/client.js';
import { AppShell, PageHeader, StickyActionBar } from '../components/layout/index.js';
import { Button, Callout, Card, SectionHeading } from '../components/common/index.js';
import { BookInformation } from '../features/story-plan/BookInformation.jsx';
import { PageOutline } from '../features/story-plan/PageOutline.jsx';
import { PlanSummary } from '../features/story-plan/PlanSummary.jsx';
import { useStoryPlan } from '../features/story-plan/useStoryPlan.js';

const SAVE_LABEL = {
  idle: 'All changes saved',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Could not save',
};

/**
 * Built from Figma `H98QB4Tdo6iH2EaXCerUlv` frame 1:2 — a 1038-wide editing
 * column beside a 520-wide summary rail, closed by the autosave action bar.
 */
export function StoryPlanPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const plan = useStoryPlan(bookId);
  const [regenError, setRegenError] = useState(null);

  const regenerate = useMutation({
    mutationFn: () => api.post(`/story/books/${bookId}/regenerate`, {}),
    onSuccess: () => plan.refetch(),
    onError: (err) =>
      setRegenError(
        err instanceof ApiClientError ? err.message : 'Could not regenerate the plan.',
      ),
  });

  if (plan.isPending) {
    return (
      <AppShell>
        <p role="status" className="p-10 text-sm text-ink-muted">
          Loading your story plan…
        </p>
      </AppShell>
    );
  }

  if (plan.isError || !plan.book) {
    return (
      <AppShell>
        <Callout tone="danger" className="mt-6">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load this story plan.</span>
            <Button size="sm" onClick={plan.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </AppShell>
    );
  }

  const continueToCharacters = () => navigate(`/books/${bookId}/characters`);

  return (
    <AppShell>
      <PageHeader
        backTo="/agent"
        backLabel="Back to Chat"
        title="Review Your Story Plan"
        subtitle="Edit the details before generating illustrations."
        actions={
          <>
            <Button
              size="xl"
              leadingIcon={RefreshCw}
              loading={regenerate.isPending}
              onClick={() => {
                setRegenError(null);
                regenerate.mutate();
              }}
            >
              Regenerate Plan
            </Button>
            <Button size="xl" variant="primary" trailingIcon={ArrowRight} onClick={continueToCharacters}>
              Continue to Characters
            </Button>
          </>
        }
      />

      {(plan.error || regenError) && (
        <Callout tone="danger" className="mt-5">
          {regenError ?? plan.error}
        </Callout>
      )}

      <div className="mt-6 grid grid-cols-[1038fr_520fr] gap-[30px] pb-6">
        <div className="min-w-0">
          <BookInformation book={plan.book} onSaveField={plan.saveBookField} />

          <SectionHeading className="mt-8" count={plan.pages.length}>
            Page Outline
          </SectionHeading>

          <Card className="mt-4">
            <PageOutline
              pages={plan.pages}
              characters={plan.characters}
              onSaveField={plan.savePageField}
              onAdd={() => plan.addPage.mutate()}
              onDuplicate={(pageId) => plan.duplicatePage.mutate(pageId)}
              onDelete={(pageId) => plan.deletePage.mutate(pageId)}
              onReorder={(order) => plan.reorder.mutate(order)}
              busy={plan.addPage.isPending}
            />
          </Card>
        </div>

        <PlanSummary
          book={plan.book}
          pages={plan.pages}
          characters={plan.characters}
          estimate={plan.estimate}
        />
      </div>

      <StickyActionBar
        status={SAVE_LABEL[plan.saveState]}
        statusTone={plan.saveState === 'saved' || plan.saveState === 'idle' ? 'saved' : 'pending'}
        actions={
          <>
            <Button size="lg" onClick={() => navigate('/agent')}>
              Back
            </Button>
            <Button size="lg" variant="primary" trailingIcon={ArrowRight} onClick={continueToCharacters}>
              Continue to Characters
            </Button>
          </>
        }
      />
    </AppShell>
  );
}

export default StoryPlanPage;
