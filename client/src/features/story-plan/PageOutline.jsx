import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import {
  Button,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Select,
  Separator,
  Tag,
  Textarea,
} from '../../components/common/index.js';

/**
 * The page outline from frame 1:2 (node 1:103): one expanded row showing
 * narration, scene description and tags, with the rest collapsed to a title,
 * their tags and three actions.
 *
 * Reordering and tag editing are **system-derived** — the frame draws neither a
 * drag affordance nor an editable chip, but both are in the written scope and
 * were authorised. Reorder is offered by pointer *and* keyboard: a drag-only
 * control is unusable without a mouse, and this list can be sixty items long.
 */
function useLive(value) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => setLocal(value ?? ''), [value]);
  return [local, setLocal];
}

function AutoTextarea({ label, value, onSave, ...props }) {
  const [local, setLocal] = useLive(value);

  return (
    <Field label={label}>
      <Textarea
        // Two rows, matching the 68px fields drawn in the frame; the default
        // three would render 85px tall.
        rows={2}
        value={local}
        onChange={(event) => {
          setLocal(event.target.value);
          onSave(event.target.value);
        }}
        {...props}
      />
    </Field>
  );
}

function PageRow({
  page,
  index,
  total,
  characters,
  expanded,
  onToggle,
  onSaveField,
  onDuplicate,
  onDelete,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}) {
  const [location, setLocation] = useLive(page.location);

  const cast = characters.filter((character) => page.characterIds?.some((id) => String(id) === String(character._id)));
  const available = characters.filter(
    (character) => !page.characterIds?.some((id) => String(id) === String(character._id)),
  );

  const setCast = (ids) => onSaveField(page._id, 'characterIds', ids.map(String));

  return (
    <li
      draggable
      onDragStart={(event) => onDragStart(event, index)}
      onDragOver={(event) => onDragOver(event, index)}
      onDrop={(event) => onDrop(event, index)}
      className={cn('py-3', isDragging && 'opacity-50')}
    >
      <div className="flex items-center gap-2">
        <IconButton
          icon={GripVertical}
          label={`Reorder page ${page.order}. Use the arrow keys to move it.`}
          size="sm"
          className="cursor-grab border-transparent"
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' && index > 0) {
              event.preventDefault();
              onMove(index, index - 1);
            }
            if (event.key === 'ArrowDown' && index < total - 1) {
              event.preventDefault();
              onMove(index, index + 1);
            }
          }}
        />

        <button
          type="button"
          onClick={() => onToggle(page._id)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className={cn('truncate', expanded ? 'text-base font-semibold text-ink' : 'text-sm text-ink')}>
            Page {page.order}
            {page.title ? ` — ${page.title}` : ''}
          </span>
        </button>

        {!expanded && (
          <div className="flex shrink-0 items-center gap-2">
            {cast.slice(0, 1).map((character) => (
              <Tag key={character._id}>{character.name}</Tag>
            ))}
            {page.location && <Tag>{page.location}</Tag>}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            icon={Copy}
            label={`Duplicate page ${page.order}`}
            size={expanded ? 'md' : 'sm'}
            onClick={() => onDuplicate(page._id)}
          />
          <IconButton
            icon={Trash2}
            label={`Delete page ${page.order}`}
            size={expanded ? 'md' : 'sm'}
            tone="danger"
            onClick={() => onDelete(page)}
          />
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pl-9">
          <div className="grid grid-cols-[486fr_492fr] gap-5">
            <AutoTextarea
              label="Narration"
              value={page.narration}
              onSave={(value) => onSaveField(page._id, 'narration', value)}
            />
            <AutoTextarea
              label="Scene Description"
              value={page.sceneDescription}
              onSave={(value) => onSaveField(page._id, 'sceneDescription', value)}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {cast.map((character) => (
              <Tag
                key={character._id}
                onRemove={() =>
                  setCast(page.characterIds.filter((id) => String(id) !== String(character._id)))
                }
                removeLabel={`Remove ${character.name} from page ${page.order}`}
              >
                {character.name}
              </Tag>
            ))}

            {available.length > 0 && (
              <label className="inline-flex items-center">
                <span className="sr-only">Add a character to page {page.order}</span>
                <Select
                  value=""
                  onChange={(event) =>
                    event.target.value && setCast([...(page.characterIds ?? []), event.target.value])
                  }
                  className="h-control-xs w-[150px] text-2xs"
                >
                  <option value="">+ Add character</option>
                  {available.map((character) => (
                    <option key={character._id} value={character._id}>
                      {character.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            <label className="inline-flex items-center">
              <span className="sr-only">Location for page {page.order}</span>
              <Input
                value={location}
                placeholder="Location"
                onChange={(event) => {
                  setLocation(event.target.value);
                  onSaveField(page._id, 'location', event.target.value);
                }}
                className="h-control-xs w-[180px] text-2xs"
              />
            </label>
          </div>
        </div>
      )}
    </li>
  );
}

export function PageOutline({
  pages,
  characters,
  onSaveField,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
  busy,
}) {
  const [expandedId, setExpandedId] = useState(pages[0]?._id ?? null);
  const [dragIndex, setDragIndex] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Keep the first page open when the outline arrives or its head changes.
  useEffect(() => {
    setExpandedId((current) =>
      current && pages.some((page) => page._id === current) ? current : (pages[0]?._id ?? null),
    );
  }, [pages]);

  const move = (from, to) => {
    if (from === to) return;
    const order = pages.map((page) => page._id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    onReorder(order);
  };

  return (
    <>
      <ul className="divide-y divide-hairline">
        {pages.map((page, index) => (
          <PageRow
            key={page._id}
            page={page}
            index={index}
            total={pages.length}
            characters={characters}
            expanded={expandedId === page._id}
            onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
            onSaveField={onSaveField}
            onDuplicate={onDuplicate}
            onDelete={setPendingDelete}
            onMove={move}
            isDragging={dragIndex === index}
            onDragStart={(event, from) => {
              setDragIndex(from);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event, to) => {
              event.preventDefault();
              if (dragIndex !== null) move(dragIndex, to);
              setDragIndex(null);
            }}
          />
        ))}
      </ul>

      <Separator className="mt-1" />

      <Button className="mt-4" leadingIcon={Plus} onClick={onAdd} loading={busy}>
        Add Page
      </Button>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete page ${pendingDelete?.order}?`}
        description="The page and everything written on it will be removed. This cannot be undone."
        confirmLabel="Delete page"
        destructive
        onConfirm={() => {
          onDelete(pendingDelete._id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

export default PageOutline;
