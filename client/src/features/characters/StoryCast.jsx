import { Plus, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  IconButton,
  Select,
  StatusBadge,
} from '../../components/common/index.js';

/**
 * "Story Characters" from Canva `DAHT3Z1D79U`: the book's cast as selectable
 * cards, plus a way to add another.
 *
 * The design draws an "+ Add Character" tile. Adding an *existing* character is
 * in scope ("Select Existing"), so the tile is joined by a picker of characters
 * already in the library but not yet in this book.
 */
export function StoryCast({ cast, library, selectedId, onSelect, onAdd, onAttach, onDetach }) {
  const attachable = library.filter(
    (character) => !cast.some((member) => member._id === character._id),
  );

  return (
    <Card>
      <CardHeader title="Story Characters" />

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cast.map((character) => {
          const selected = character._id === selectedId;

          return (
            <li key={character._id}>
              <div
                className={cn(
                  'flex items-center gap-3 rounded-sm border p-3 transition-colors',
                  selected ? 'border-hairline-strong bg-teal-soft' : 'border-hairline bg-surface',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(character._id)}
                  aria-pressed={selected}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar name={character.name} tone={selected ? 'accent' : 'neutral'} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {character.name}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {character.role === 'main' ? 'Main Character' : 'Supporting Character'}
                    </span>
                  </span>
                </button>

                <IconButton
                  icon={X}
                  size="sm"
                  label={`Remove ${character.name} from this book`}
                  className="border-transparent"
                  onClick={() => onDetach(character._id)}
                />
              </div>

              <div className="mt-2 pl-1">
                <StatusBadge tone={character.status === 'ready' ? 'success' : 'warning'} dot>
                  {character.status === 'ready' ? 'Ready' : 'Needs Design'}
                </StatusBadge>
              </div>
            </li>
          );
        })}

        <li className="flex flex-col gap-2">
          <Button
            leadingIcon={Plus}
            className="h-[66px] w-full"
            onClick={onAdd}
            aria-pressed={selectedId === null}
          >
            Add Character
          </Button>

          {attachable.length > 0 && (
            <label className="block">
              <span className="sr-only">Add an existing character to this book</span>
              <Select
                value=""
                onChange={(event) => event.target.value && onAttach(event.target.value)}
              >
                <option value="">Select existing…</option>
                {attachable.map((character) => (
                  <option key={character._id} value={character._id}>
                    {character.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </li>
      </ul>
    </Card>
  );
}

export default StoryCast;
