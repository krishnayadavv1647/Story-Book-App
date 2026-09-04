import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Sparkles, Upload, Users } from 'lucide-react';

import { AppShell, PageHeader, StickyActionBar } from '../components/layout/index.js';
import { Button, Callout, SegmentedTabs } from '../components/common/index.js';
import { CharacterDetails } from '../features/characters/CharacterDetails.jsx';
import { CharacterPreview } from '../features/characters/CharacterPreview.jsx';
import { StoryCast } from '../features/characters/StoryCast.jsx';
import { useCharacters } from '../features/characters/useCharacters.js';
import { useCharacterImage } from '../features/characters/useCharacterImage.js';

const SAVE_LABEL = {
  idle: 'Character saved',
  saving: 'Saving…',
  saved: 'Character saved',
  error: 'Could not save',
};

/**
 * Built from Canva `DAHT3Z1D79U` (1792 × 896) inside the canonical Shell B.
 *
 * Character illustration and reference uploads are both live (Phase 8).
 *
 * The three drawn modes are ways of getting a character, but their controls sit
 * in different panels. Rather than leave two of the three tabs inert, selecting
 * one brings its control into view.
 */
export function CharactersPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const characters = useCharacters(bookId);

  const [mode, setMode] = useState('existing');
  const [selectedId, setSelectedId] = useState(null);

  // "Select Existing" lives in the cast panel on the right; the other two modes
  // are handled inside Character Details.
  const castRef = useRef(null);

  useEffect(() => {
    if (mode === 'existing') {
      castRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [mode]);

  // Refresh the cast when an illustration lands, so the card's status and the
  // stored preview catch up with what the preview pane is already showing.
  const image = useCharacterImage({ onFinished: () => characters.refetch() });

  // Select the first cast member once the book's cast arrives.
  useEffect(() => {
    setSelectedId((current) => {
      if (current && characters.cast.some((c) => c._id === current)) return current;
      return characters.cast[0]?._id ?? null;
    });
  }, [characters.cast]);

  const selected = characters.cast.find((c) => c._id === selectedId) ?? null;
  const locked = Boolean(selected?.identity?.locked);

  // Illustration comes before the editor: there is nothing to edit until the
  // pages have pictures.
  const continueToGeneration = () => navigate(`/books/${bookId}/generate`);

  if (characters.isPending) {
    return (
      <AppShell>
        <p role="status" className="p-10 text-sm text-ink-muted">
          Loading this book’s characters…
        </p>
      </AppShell>
    );
  }

  if (characters.isError) {
    return (
      <AppShell>
        <Callout tone="danger" className="mt-6">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load this book’s characters.</span>
            <Button size="sm" onClick={characters.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        backTo={`/books/${bookId}/plan`}
        backLabel="Back to Story Plan"
        title="Create Your Characters"
        subtitle="Choose an existing character, upload references, or generate one with AI."
        actions={
          <>
            <Button size="xl" onClick={continueToGeneration}>
              Skip for now
            </Button>
            <Button size="xl" variant="primary" trailingIcon={ArrowRight} onClick={continueToGeneration}>
              Illustrate the book
            </Button>
          </>
        }
      />

      {characters.error && (
        <Callout tone="danger" className="mt-5">
          {characters.error}
        </Callout>
      )}

      <SegmentedTabs
        className="mt-6"
        value={mode}
        onValueChange={setMode}
        items={[
          { value: 'existing', label: 'Select Existing', icon: Users },
          { value: 'upload', label: 'Upload Character', icon: Upload },
          { value: 'ai', label: 'Generate with AI', icon: Sparkles },
        ]}
      />

      {/* The design is not a 50/50 split: Character Details takes roughly a
          third, the preview and cast the remaining two thirds (Canva
          `DAHT3Z1D79U`, ~476 vs ~960 on a 1792 canvas). */}
      <div className="mt-6 grid grid-cols-[476fr_960fr] gap-5 pb-6">
        <CharacterDetails
          character={selected}
          locked={locked}
          busy={characters.create.isPending || characters.update.isPending}
          onCreate={(draft) =>
            characters.create.mutate(draft, {
              onSuccess: (created) => setSelectedId(created._id),
            })
          }
          onSave={(payload) => characters.update.mutate(payload)}
          onLock={(id) => characters.lock.mutate(id)}
          onUnlock={(id) => characters.unlock.mutate(id)}
          onGenerate={(id, pose) => image.start(id, pose)}
          onGenerateSheet={(id) => image.startSheet(id)}
          onUploadReference={(characterId, file) =>
            characters.uploadReference.mutate({ characterId, file })
          }
          onRemoveReference={(characterId, assetId) =>
            characters.removeReference.mutate({ characterId, assetId })
          }
          uploadingReference={characters.uploadReference.isPending}
          emphasis={mode}
          onCancelGenerate={image.cancel}
          generating={image.isRunning}
          generationError={image.error}
        />

        <div className="space-y-5">
          <CharacterPreview
            character={selected}
            generating={image.isRunning}
            progress={image.progress}
            previewUrl={image.imageUrl}
            onRegenerate={() => selected && image.start(selected._id, 'front')}
          />

          <div ref={castRef}>
            <StoryCast
              cast={characters.cast}
              library={characters.library}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={() => setSelectedId(null)}
              onAttach={(id) =>
                characters.attach.mutate(id, { onSuccess: () => setSelectedId(id) })
              }
              onDetach={(id) => characters.detach.mutate(id)}
            />
          </div>
        </div>
      </div>

      <StickyActionBar
        status={SAVE_LABEL[characters.saveState]}
        statusTone={characters.saveState === 'saving' ? 'pending' : 'saved'}
        step="Step 2 of 3"
        actions={
          <>
            <Button size="lg" onClick={() => navigate(`/books/${bookId}/plan`)}>
              Back
            </Button>
            <Button size="lg" variant="primary" trailingIcon={ArrowRight} onClick={continueToGeneration}>
              Illustrate the book
            </Button>
          </>
        }
      />
    </AppShell>
  );
}

export default CharactersPage;
