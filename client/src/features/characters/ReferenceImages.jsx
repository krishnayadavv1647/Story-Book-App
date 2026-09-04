import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { Field, IconButton } from '../../components/common/index.js';

const ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * Reference images for a character.
 *
 * These are not decoration: every id here is replayed into every future
 * illustration of this character, so a reference added on this screen steers
 * each page they appear on. Locking the character freezes the set, because
 * changing it would change how they are drawn.
 */
export function ReferenceImages({ references = [], locked, uploading, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const accept = (files) => {
    const file = files?.[0];
    if (file && !locked) onUpload(file);
  };

  return (
    <Field
      label="Reference Images"
      hint={
        locked
          ? 'Locked — unlock this character to change what steers their illustrations.'
          : 'Up to 8. Replayed into every illustration of this character.'
      }
    >
      <div className="space-y-2">
        {references.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {references.map((reference) => (
              <li key={reference.assetId} className="relative">
                <img
                  src={reference.url}
                  alt=""
                  className="h-16 w-16 rounded-sm border border-hairline object-cover"
                />
                {!locked && (
                  <IconButton
                    icon={X}
                    size="sm"
                    label="Remove this reference image"
                    className="absolute -right-2 -top-2 h-6 w-6"
                    onClick={() => onRemove(reference.assetId)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={locked || uploading || references.length >= 8}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!locked) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            accept(event.dataTransfer.files);
          }}
          className={cn(
            'flex h-[86px] w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed text-center transition-colors',
            dragging ? 'border-hairline-strong bg-teal-soft' : 'border-hairline bg-page',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <Upload className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <span className="text-xs text-ink-muted">
            {uploading
              ? 'Uploading…'
              : references.length >= 8
                ? 'Reference limit reached'
                : 'Drag an image here, or click to choose'}
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Upload a reference image"
          onChange={(event) => {
            accept(event.target.files);
            // Reset so choosing the same file twice still fires a change.
            event.target.value = '';
          }}
        />
      </div>
    </Field>
  );
}

export default ReferenceImages;
