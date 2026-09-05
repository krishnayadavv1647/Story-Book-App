import { useState } from 'react';
import { Button, Field, Input, Modal, Select } from '../../components/common/index.js';
import { AGE_GROUPS, ART_STYLES, GENRES, LANGUAGES, PAGE_COUNTS } from './storySettings.js';

/**
 * The "Book Settings" sheet behind the composer's second pill.
 *
 * Edits are held locally and only applied on save, so closing the sheet leaves
 * the pending story untouched.
 */
export function BookSettingsModal({ open, onOpenChange, settings, onSave }) {
  const [draft, setDraft] = useState(settings);

  const update = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(settings);
        onOpenChange(next);
      }}
      title="Book settings"
      description="These are passed to the planner and can still be changed on the review screen."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave({ ...draft, pageCount: Number(draft.pageCount) });
              onOpenChange(false);
            }}
          >
            Save settings
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Age group">
          <Select value={draft.ageGroup} onChange={update('ageGroup')}>
            {AGE_GROUPS.map((group) => (
              <option key={group.value} value={group.value}>
                {group.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Language">
          <Select value={draft.language} onChange={update('language')}>
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Genre">
          <Select value={draft.genre} onChange={update('genre')}>
            {GENRES.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Art style">
          <Select value={draft.artStyle} onChange={update('artStyle')}>
            {ART_STYLES.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Pages">
          <Select value={String(draft.pageCount)} onChange={update('pageCount')}>
            {PAGE_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count} pages
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Moral" hint="Optional.">
          <Input
            value={draft.moral}
            onChange={update('moral')}
            placeholder="Kindness and courage"
          />
        </Field>
      </div>
    </Modal>
  );
}

export default BookSettingsModal;
