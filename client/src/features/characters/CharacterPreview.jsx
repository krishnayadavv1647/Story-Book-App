import { Download, ImageOff, PencilLine, RotateCcw } from 'lucide-react';
import { Button, Card, CardHeader } from '../../components/common/index.js';

const POSES = ['Front', 'Side', '3/4 View', 'Full Body'];

/**
 * Right column of Canva `DAHT3Z1D79U`: a four-pose character sheet with
 * Regenerate, Edit Details and Download Sheet beneath it.
 *
 * The front pose is generated (Phase 8); the other three are placeholders until
 * a full sheet is produced. A slot only shows an image when one exists.
 */
export function CharacterPreview({ character, generating, progress, previewUrl, onRegenerate }) {
  const previews = character?.previews ?? [];

  return (
    <Card>
      <CardHeader title="Character Preview" />
      <p className="mt-1 text-sm text-ink-muted">{POSES.join('  •  ')}</p>

      {generating && (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-muted">
          Illustrating this character… {progress ? `${progress}%` : ''}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {POSES.map((pose, index) => {
          // Poses are matched by name, not by array position — a character may
          // have a side view but no front one. The freshly finished image shows
          // immediately, before the character record has been refetched.
          const key = ['front', 'side', 'three_quarter', 'full_body'][index];
          const stored = previews.find((p) => p.pose === key);
          const preview = key === 'front' && previewUrl ? { url: previewUrl } : stored;

          return (
            <div
              key={pose}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-sm border border-hairline bg-page"
            >
              {preview?.url ? (
                <img
                  src={preview.url}
                  alt={`${character.name}, ${pose.toLowerCase()}`}
                  className="h-full w-full rounded-sm object-cover"
                />
              ) : (
                <>
                  <ImageOff className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                  <span className="text-2xs text-ink-muted">{pose}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <Button leadingIcon={RotateCcw} disabled={!character || generating} onClick={onRegenerate}>
          Regenerate
        </Button>
        <Button
          leadingIcon={PencilLine}
          disabled
          title="Editing a generated image arrives with the book editor"
        >
          Edit Details
        </Button>
        <Button
          leadingIcon={Download}
          disabled={!previewUrl && previews.length === 0}
          onClick={() => window.open(previewUrl ?? previews[0]?.url, '_blank', 'noopener')}
        >
          Download Sheet
        </Button>
      </div>
    </Card>
  );
}

export default CharacterPreview;
