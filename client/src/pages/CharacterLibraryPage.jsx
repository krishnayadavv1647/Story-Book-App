import { Link } from 'react-router-dom';
import { Lock, Users } from 'lucide-react';

import { AppShell, PageHeader } from '../components/layout/index.js';
import { Button, Callout, Card, SectionHeading, StatusBadge } from '../components/common/index.js';
import { useCharacterLibrary } from '../features/characters/useCharacterLibrary.js';

/**
 * SYSTEM-DERIVED. The frames draw a "Character Design" nav row but no screen of
 * its own — characters are only ever drawn in the context of one book.
 *
 * This is the account-wide view: every character you have made, reusable across
 * books. Editing still happens inside a book, because a character's look is
 * bound to the book it is being drawn for.
 */
const STATUS = {
  draft: { tone: 'neutral', label: 'Draft' },
  queued: { tone: 'warning', label: 'Queued' },
  generating: { tone: 'warning', label: 'Illustrating' },
  ready: { tone: 'success', label: 'Ready' },
  failed: { tone: 'danger', label: 'Failed' },
};

export function CharacterLibraryPage() {
  const library = useCharacterLibrary();

  return (
    <AppShell>
      <PageHeader
        title="Character Design"
        subtitle="Every character on this account. Add one to a book to edit or illustrate it."
      />

      {library.isError && (
        <Callout tone="danger" className="mt-5">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load your characters.</span>
            <Button size="sm" onClick={library.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      )}

      <div className="mt-6 pb-6">
        <SectionHeading size="lg" count={library.items.length}>
          Characters
        </SectionHeading>

        {library.isPending ? (
          <p role="status" className="mt-4 text-sm text-ink-muted">
            Loading…
          </p>
        ) : library.items.length === 0 ? (
          <Callout className="mt-4">
            No characters yet. They are created with a story plan, or by hand on a book’s Characters
            screen.
          </Callout>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
            {library.items.map((character) => {
              const status = STATUS[character.status] ?? STATUS.draft;
              const preview = character.previews?.find((p) => p.url);

              return (
                <li key={character._id}>
                  <Card className="flex h-full flex-col p-0">
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-lg bg-page">
                      {preview ? (
                        <img
                          src={preview.url}
                          alt={`${character.name}, ${preview.pose} view`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Users className="h-6 w-6 text-ink-muted" aria-hidden="true" />
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                        {character.name}
                        {character.identity?.locked && (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                            aria-label="Look locked"
                          />
                        )}
                      </p>

                      {character.appearance && (
                        <p className="line-clamp-2 text-xs text-ink-muted">{character.appearance}</p>
                      )}

                      <StatusBadge tone={status.tone} dot className="self-start">
                        {status.label}
                      </StatusBadge>

                      <p className="mt-auto text-xs text-ink-muted">
                        {character.bookCount === 1
                          ? 'In 1 book'
                          : `In ${character.bookCount ?? 0} books`}
                      </p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Callout className="mb-6">
        <span>
          To edit or illustrate a character, open a book’s{' '}
          <Link to="/books" className="font-semibold underline-offset-2 hover:underline">
            Characters
          </Link>{' '}
          screen — a character’s look is set against the book it is drawn for.
        </span>
      </Callout>
    </AppShell>
  );
}

export default CharacterLibraryPage;
