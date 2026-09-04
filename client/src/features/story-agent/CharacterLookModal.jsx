import { useRef, useState } from 'react';
import { Sparkles, Upload, X } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { Button, IconButton, Modal } from '../../components/common/index.js';
import { uploadReferenceImage } from '../../api/generation.js';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_REFERENCES = 4;

/**
 * The one question a run asks.
 *
 * Everything else a book needs is already decided: the idea is in the composer
 * and the shape of the book is in Book Settings. The only thing neither of those
 * can answer is what the people in it look like — and that is genuinely the
 * author's to say, because a photograph is the difference between a story about
 * a child and a story about *their* child.
 *
 * So it is asked once, with a default already chosen, and then nothing else is
 * asked at all.
 *
 * Photographs land on the lead character: the cast does not exist until the plan
 * does, so there is no cast list to assign them to yet, and the lead is who an
 * author uploading a photo means.
 */
export function CharacterLookModal({ open, onOpenChange, onConfirm }) {
  const [choice, setChoice] = useState('generate');
  const [references, setReferences] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const reset = () => {
    setChoice('generate');
    setReferences([]);
    setError(null);
  };

  const addFile = async (file) => {
    if (!file || references.length >= MAX_REFERENCES) return;

    setUploading(true);
    setError(null);
    try {
      const asset = await uploadReferenceImage(file);
      setReferences((current) => [...current, asset]);
      setChoice('upload');
    } catch (err) {
      setError(err?.message ?? 'That image could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  const confirm = () => {
    // Choosing "use my photos" and then adding none is just the default with
    // extra steps — send what is actually true rather than an empty promise.
    const usingPhotos = choice === 'upload' && references.length > 0;

    onConfirm({
      characterImages: usingPhotos ? 'upload' : 'generate',
      referenceAssetIds: usingPhotos ? references.map((reference) => reference.assetId) : [],
    });
    onOpenChange(false);
    reset();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="How should the characters look?"
      description="The last thing I need. Everything else comes from your idea and your book settings."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" leadingIcon={Sparkles} loading={uploading} onClick={confirm}>
            Create my book
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Choice
          selected={choice === 'generate'}
          onSelect={() => setChoice('generate')}
          title="Design them for me"
          body="I draw the cast from the story, then keep every one of them looking the same on every page."
        />

        <Choice
          selected={choice === 'upload'}
          onSelect={() => setChoice('upload')}
          title="Use my photos"
          body="Upload a picture or two of your main character and I will draw them from it."
        >
          <div className="mt-3 space-y-2">
            {references.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {references.map((reference) => (
                  <li key={reference.assetId} className="relative">
                    <img
                      src={reference.url}
                      alt=""
                      className="h-16 w-16 rounded-sm border border-hairline object-cover"
                    />
                    <IconButton
                      icon={X}
                      size="sm"
                      label="Remove this photo"
                      className="absolute -right-2 -top-2 h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation();
                        setReferences((current) =>
                          current.filter((item) => item.assetId !== reference.assetId),
                        );
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}

            {references.length < MAX_REFERENCES && (
              <>
                <Button
                  size="sm"
                  leadingIcon={Upload}
                  loading={uploading}
                  onClick={(event) => {
                    event.stopPropagation();
                    inputRef.current?.click();
                  }}
                >
                  {references.length > 0 ? 'Add another photo' : 'Choose a photo'}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    addFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </Choice>
      </div>
    </Modal>
  );
}

/** A radio in everything but markup — the whole block is the target. */
function Choice({ selected, onSelect, title, body, children }) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'cursor-pointer rounded-lg border p-3.5 transition-colors',
        selected
          ? 'border-hairline-strong bg-teal-soft'
          : 'border-hairline bg-surface hover:bg-surface-hover',
      )}
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{body}</p>
      {selected && children}
    </div>
  );
}

export default CharacterLookModal;
