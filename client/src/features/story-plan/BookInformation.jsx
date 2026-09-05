import { useEffect, useState } from 'react';
import { Card, CardHeader, Field, Input, Select } from '../../components/common/index.js';
import {
  AGE_GROUPS,
  ART_STYLES,
  GENRES,
  LANGUAGES,
  PAGE_COUNTS,
} from '../story-agent/storySettings.js';

/**
 * Keeps its own value so typing stays responsive, and re-syncs when the server
 * copy changes underneath it — but never while the field has focus, which would
 * yank the cursor mid-word.
 */
function useLiveValue(value) {
  const [local, setLocal] = useState(value ?? '');

  useEffect(() => {
    setLocal(value ?? '');
  }, [value]);

  return [local, setLocal];
}

function TextField({ label, value, onSave, ...props }) {
  const [local, setLocal] = useLiveValue(value);

  return (
    <Field label={label}>
      <Input
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

function ChoiceField({ label, value, onSave, options }) {
  const [local, setLocal] = useLiveValue(value);

  /**
   * A plan can legitimately carry a value outside the preset list — the planner
   * chooses its own page count, and a genre can be anything. Without this the
   * select silently snaps to its first option and displays something the book
   * does not actually say.
   */
  const choices = options.some((option) => String(option.value) === String(local))
    ? options
    : [{ value: local, label: String(local) }, ...options];

  return (
    <Field label={label}>
      <Select
        value={String(local)}
        onChange={(event) => {
          setLocal(event.target.value);
          onSave(event.target.value);
        }}
      >
        {choices.map(({ value: optionValue, label: optionLabel }) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </Select>
    </Field>
  );
}

const asOptions = (values) => values.map((value) => ({ value, label: value }));

/**
 * Measured from Figma `H98QB4Tdo6iH2EaXCerUlv` frame 1:2 (node 1:68): a 1038 ×
 * 316 card holding four rows of two fields, left column 460 wide and right 526.
 *
 * DEVIATION: a ninth field, Subtitle. The generated cover letters the title and
 * subtitle into the artwork itself and the library card prints neither beside
 * it, so the subtitle stopped being decoration the moment covers started
 * carrying it — it has to be editable somewhere, and this is the card that owns
 * book metadata. Recorded in the design source map.
 */
export function BookInformation({ book, onSaveField }) {
  return (
    <Card>
      <CardHeader title="Book Information" />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[460fr_526fr] sm:gap-x-5 sm:gap-y-4">
        <TextField label="Title" value={book.title} onSave={(v) => onSaveField('title', v)} />
        <TextField
          label="Subtitle"
          value={book.subtitle}
          maxLength={160}
          placeholder="Printed under the title on the cover"
          onSave={(v) => onSaveField('subtitle', v)}
        />

        <TextField
          label="Author"
          value={book.author}
          maxLength={120}
          placeholder="Printed in the margin of every page"
          onSave={(v) => onSaveField('author', v)}
        />

        <TextField
          label="Description"
          value={book.description}
          onSave={(v) => onSaveField('description', v)}
        />

        <ChoiceField
          label="Age Group"
          value={book.ageGroup}
          options={AGE_GROUPS}
          onSave={(v) => onSaveField('ageGroup', v)}
        />
        <ChoiceField
          label="Language"
          value={book.language}
          options={asOptions(LANGUAGES)}
          onSave={(v) => onSaveField('language', v)}
        />

        <ChoiceField
          label="Genre"
          value={book.genre}
          options={asOptions(GENRES)}
          onSave={(v) => onSaveField('genre', v)}
        />
        <ChoiceField
          label="Art Style"
          value={book.artStyle}
          options={asOptions(ART_STYLES)}
          onSave={(v) => onSaveField('artStyle', v)}
        />

        <ChoiceField
          label="Pages"
          value={book.pageCount}
          options={PAGE_COUNTS.map((count) => ({ value: count, label: `${count} pages` }))}
          onSave={(v) => onSaveField('pageCount', Number(v))}
        />
        <TextField label="Moral" value={book.moral} onSave={(v) => onSaveField('moral', v)} />
      </div>
    </Card>
  );
}

export default BookInformation;
