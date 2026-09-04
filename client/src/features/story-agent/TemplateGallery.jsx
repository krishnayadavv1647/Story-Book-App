import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { BookCover } from '../../components/books/index.js';
import { TEMPLATES } from './storySettings.js';

/**
 * The "start from a template" shelf under the composer on the agent screen.
 *
 * A starter is one line of intent; a template is a whole kind of book — a style,
 * an age, a length and a moral, decided together. The shelf is revealed once the
 * author starts typing (the page owns that, and swaps it in where the starters
 * and engine meters were), so a template reads as a style for the idea they are
 * writing: choosing one applies its recipe to Book Settings and turns the draft
 * into the same one-question run everything else goes through.
 *
 * Drawn as a row of small books — the same `BookCover` the library uses, shrunk
 * — that scroll sideways under a pair of arrows, so six covers (or sixty) sit in
 * one band rather than pushing the composer up the page. The cover carries its
 * own title; the label beneath repeats it as crisp type, since the lettering is
 * tiny at this size, and the settings ride along in the button's tooltip.
 *
 * The book is not a `<Link>` (no `to`): choosing a template is an action, so the
 * whole card is a `<button>` that starts the run.
 */
export function TemplateGallery({ onSelect, disabled = false, className }) {
  const scrollerRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // Which arrows are live depends on where the strip is scrolled to, so it is
  // measured from the element rather than tracked by hand.
  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return undefined;

    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const scroll = (direction) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  // Everything fitting is the one case with nothing to scroll, so the arrows go.
  const scrollable = !(atStart && atEnd);

  return (
    <section aria-labelledby="templates-heading" className={cn(className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="templates-heading" className="text-base font-semibold text-ink">
            Or start from a template
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Pick a style and we’ll shape your idea into that kind of book.
          </p>
        </div>

        {scrollable && (
          <div className="flex shrink-0 items-center gap-2">
            <ArrowButton
              icon={ChevronLeft}
              label="Scroll templates left"
              onClick={() => scroll(-1)}
              disabled={atStart}
            />
            <ArrowButton
              icon={ChevronRight}
              label="Scroll templates right"
              onClick={() => scroll(1)}
              disabled={atEnd}
            />
          </div>
        )}
      </div>

      <ul
        ref={scrollerRef}
        className={cn(
          'mt-4 flex snap-x gap-4 overflow-x-auto scroll-smooth pb-2',
          // A light scrollbar on a dark band reads as breakage; the arrows are
          // the control, so hide the bar across engines.
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {TEMPLATES.map((template) => {
          const { id, cover, title, settings } = template;
          const meta = `${settings.pageCount} pages · ${settings.ageGroup} yrs · ${settings.artStyle}`;

          return (
            <li key={id} className="shrink-0 snap-start">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(template)}
                aria-label={`Start a ${title} book`}
                title={meta}
                className={cn(
                  'group block w-[120px] rounded-lg text-left',
                  'transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <BookCover imageUrl={cover} lettered title={title} className="group-hover:-translate-y-1" />
                <p className="mt-2 truncate text-2xs font-medium text-ink">{title}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A round scroll arrow — the circular control the reference row uses. */
function ArrowButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-pill border border-hairline bg-surface text-ink',
        'transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export default TemplateGallery;
