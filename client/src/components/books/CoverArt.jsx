import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * The printed face of a cover, filling whatever book shape holds it.
 *
 * A generated cover carries its own lettering — the server's `COVER_BASE_PROMPT`
 * puts the title and subtitle inside the artwork — which is why the card no
 * longer prints them underneath. That only holds for a cover that was actually
 * drawn as one, so this component has three states rather than two:
 *
 *   `lettered`      the artwork says the title itself; nothing is added.
 *   a stand-in      a page illustration filling the slot until a real cover
 *                   exists. It says nothing, so the title is set over it.
 *   nothing at all  the title and subtitle are set in type on the cover ground.
 *
 * Exactly one copy of the title reaches the accessibility tree in every case:
 * the `alt` when the artwork carries it, the drawn text when it does not.
 */
export function CoverArt({ imageUrl, lettered = false, title, subtitle, color, className }) {
  const name = title?.trim() || 'Untitled';

  if (imageUrl && lettered) {
    // The title is *in* the picture, so it is the picture's content and belongs
    // in `alt` — not decoration to be hidden.
    return (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        className={cn('h-full w-full object-cover', className)}
      />
    );
  }

  if (imageUrl) {
    return (
      <div className={cn('relative h-full w-full', className)}>
        {/* Decorative here: this is a page from the book standing in, and the
            title below is what actually names the cover. */}
        <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />

        <div className="surface-cover-caption absolute inset-x-0 bottom-0 px-3 pb-3 pt-8 text-center">
          <p className="line-clamp-2 text-base font-semibold leading-tight text-ink">{name}</p>
          {subtitle && (
            <p className="mt-0.5 line-clamp-1 text-2xs leading-tight text-ink-muted">{subtitle}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        // The top inset is a percentage of the cover's own width so it scales
        // with the card, and it is deep enough to clear the status chip that
        // sits at the cover's top-right — the drawn title would otherwise run
        // straight under it.
        'flex h-full w-full flex-col items-center justify-start gap-1.5 px-3 pb-4 pt-[22%] text-center',
        // The frame's own cover fill, so an unillustrated book is the colour the
        // design draws rather than a second, darker placeholder on top of it.
        'bg-book-cover',
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      <p className="line-clamp-3 text-base font-semibold leading-tight text-cover-glyph">{name}</p>

      {subtitle && <p className="line-clamp-2 text-2xs leading-tight text-ink-muted">{subtitle}</p>}

      <Sparkles
        className="mt-auto h-5 w-5 text-cover-glyph opacity-40"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </div>
  );
}

export default CoverArt;
