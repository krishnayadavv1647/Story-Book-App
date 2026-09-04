import { useEffect, useRef, useState } from 'react';
import { Layers, Lock, Sparkles, Unlock, X } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '../../components/common/index.js';
import { ART_STYLES } from '../story-agent/storySettings.js';
import { ReferenceImages } from './ReferenceImages.jsx';

const ROLES = [
  { value: 'main', label: 'Main Character' },
  { value: 'supporting', label: 'Supporting' },
  { value: 'other', label: 'Other' },
];

const EMPTY = {
  name: '',
  role: 'main',
  age: '',
  gender: '',
  appearance: '',
  outfit: '',
  personality: '',
  artStyle: '3D Storybook',
  consistencyPrompt: '',
};

/** Flattens the stored shape (identity.consistencyPrompt) into the form's. */
function toDraft(character) {
  if (!character) return EMPTY;
  return {
    name: character.name ?? '',
    role: character.role ?? 'main',
    age: character.age ?? '',
    gender: character.gender ?? '',
    appearance: character.appearance ?? '',
    outfit: character.outfit ?? '',
    personality: character.personality ?? '',
    artStyle: character.artStyle || '3D Storybook',
    consistencyPrompt: character.identity?.consistencyPrompt ?? '',
  };
}

/**
 * Left column of Canva `DAHT3Z1D79U`: name, a three-way role selector, age and
 * gender side by side, then appearance, outfit, personality, art style, the
 * reference dropzone and the generate action.
 */
export function CharacterDetails({
  character,
  locked,
  onSave,
  onCreate,
  onLock,
  onUnlock,
  busy,
  onGenerate,
  onGenerateSheet,
  onCancelGenerate,
  generating,
  generationError,
  onUploadReference,
  onRemoveReference,
  uploadingReference,
  emphasis,
}) {
  const [draft, setDraft] = useState(() => toDraft(character));

  // The mode tabs above name three ways to get a character, but their controls
  // live in different panels. Bring the chosen one into view instead of leaving
  // the tab looking like it did nothing.
  const referencesRef = useRef(null);
  const generateRef = useRef(null);

  useEffect(() => {
    const target = emphasis === 'upload' ? referencesRef : emphasis === 'ai' ? generateRef : null;
    target?.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [emphasis]);

  useEffect(() => {
    setDraft(toDraft(character));
  }, [character]);

  const set = (field) => (event) => setDraft((d) => ({ ...d, [field]: event.target.value }));
  const isNew = !character;

  const submit = () => {
    if (!draft.name.trim()) return;
    if (isNew) onCreate(draft);
    else onSave({ characterId: character._id, patch: draft });
  };

  return (
    <Card>
      <CardHeader
        title="Character Details"
        actions={
          character && (
            <Button
              size="sm"
              leadingIcon={locked ? Unlock : Lock}
              onClick={() => (locked ? onUnlock(character._id) : onLock(character._id))}
            >
              {locked ? 'Unlock look' : 'Lock look'}
            </Button>
          )
        }
      />

      {locked && (
        <Callout className="mt-4">
          This character’s look is locked, so every page draws them the same way. Unlock to change
          their appearance, outfit or art style.
        </Callout>
      )}

      {generationError && (
        <Callout tone="danger" className="mt-4">
          {generationError}
        </Callout>
      )}

      <div className="mt-4 space-y-4">
        <Field label="Character Name">
          <Input value={draft.name} onChange={set('name')} placeholder="Aarav" />
        </Field>

        <Field label="Role">
          {/* Three-up segmented selector, as drawn. */}
          <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-sm border border-hairline">
            {ROLES.map((role, index) => (
              <button
                key={role.value}
                type="button"
                aria-pressed={draft.role === role.value}
                onClick={() => setDraft((d) => ({ ...d, role: role.value }))}
                className={cn(
                  'h-control-lg text-sm transition-colors',
                  index > 0 && 'border-l border-hairline',
                  draft.role === role.value
                    ? 'bg-teal-soft font-semibold text-ink'
                    : 'bg-surface text-ink hover:bg-surface-hover',
                )}
              >
                {role.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Age">
            <Input value={draft.age} onChange={set('age')} placeholder="8 years" />
          </Field>
          <Field label="Gender">
            <Input value={draft.gender} onChange={set('gender')} placeholder="Boy" />
          </Field>
        </div>

        <Field label="Appearance">
          <Textarea
            rows={2}
            value={draft.appearance}
            onChange={set('appearance')}
            disabled={locked}
            placeholder="Curious young Indian boy, warm brown skin, large expressive eyes…"
          />
        </Field>

        <Field label="Outfit">
          <Textarea
            rows={2}
            value={draft.outfit}
            onChange={set('outfit')}
            disabled={locked}
            placeholder="Forest-green hoodie, beige cargo shorts, brown adventure boots…"
          />
        </Field>

        <Field label="Personality">
          <Textarea
            rows={2}
            value={draft.personality}
            onChange={set('personality')}
            placeholder="Brave, kind, imaginative and curious."
          />
        </Field>

        <Field label="Art Style">
          <Select value={draft.artStyle} onChange={set('artStyle')} disabled={locked}>
            {ART_STYLES.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Consistency prompt"
          hint="Replayed into every illustration so this character looks the same on each page."
        >
          <Textarea
            rows={2}
            value={draft.consistencyPrompt}
            onChange={set('consistencyPrompt')}
            disabled={locked}
            placeholder="Aarav: 8-year-old Indian boy, warm brown skin, dark tousled hair…"
          />
        </Field>

        <div ref={referencesRef}>
          <ReferenceImages
            references={character?.referenceImages ?? []}
            locked={locked}
            uploading={uploadingReference}
            onUpload={(file) => onUploadReference?.(character._id, file)}
            onRemove={(assetId) => onRemoveReference?.(character._id, assetId)}
          />
        </div>

        <div ref={generateRef} className="flex items-center gap-2">
          <Button variant="primary" className="flex-1" onClick={submit} loading={busy}>
            {isNew ? 'Create character' : 'Save changes'}
          </Button>

          {generating ? (
            <Button leadingIcon={X} onClick={onCancelGenerate}>
              Cancel
            </Button>
          ) : (
            <Button
              leadingIcon={Sparkles}
              disabled={isNew}
              title={isNew ? 'Create the character first' : 'Illustrate this character'}
              onClick={() => onGenerate?.(character._id, 'front')}
            >
              Generate
            </Button>
          )}

          <Button
            leadingIcon={Layers}
            disabled={isNew || generating}
            onClick={() => onGenerateSheet?.(character._id)}
            title="Generate all four poses"
          >
            Full sheet
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default CharacterDetails;
