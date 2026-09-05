import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * SYSTEM-DERIVED DESIGN — no approved Figma or Canva frame covers authentication.
 * Authorised by the user (2026-09-01) and built entirely from measured tokens and
 * existing primitives, so it reads as the same product:
 *
 *   · one bordered card on the page background, no shadow — the system is border-led
 *   · form on white at the same 36px control scale as every other form
 *   · showcase panel on the deepest ground with gold accents, echoing the hero
 *   · Inter throughout, 25px title / 14px subtitle / 13px body, as elsewhere
 *
 * Recorded in references/design-source-map.md §2d.
 */
const HIGHLIGHTS = [
  'Plan a whole story with an AI that keeps to your outline',
  'Design characters once and keep them consistent on every page',
  'Export a print-ready PDF with bleed and page numbers',
];

export function AuthLayout({ title, subtitle, children, footer, className }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div
        className={cn(
          'surface-card grid w-full max-w-[980px] overflow-hidden rounded-lg border border-hairline',
          'lg:grid-cols-2',
          className,
        )}
      >
        {/* Form panel */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          <div className="mx-auto w-full max-w-[380px]">
            {/* The full brand lockup (mark + wordmark) as one transparent PNG. */}
            <img src="/logo.png" alt="StoryBook Studio" className="h-12 w-auto" />


            <h1 className="mt-8 text-3xl font-bold text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-base text-ink-muted">{subtitle}</p>}

            <div className="mt-7">{children}</div>

            {footer && <div className="mt-6 text-sm text-ink-muted">{footer}</div>}
          </div>
        </div>

        {/* Showcase panel — decorative, so it is simply absent on small screens
            rather than stacked, which would push the form below the fold. */}
        <div className="hidden flex-col justify-center bg-page-deep p-10 lg:flex">
          <p className="text-sm font-semibold tracking-widest text-gold">
            STORY_BOOK_STUDIO
          </p>

          <p className="mt-6 text-3xl font-bold leading-snug text-ink">
            Create beautiful illustrated books in minutes.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-gold text-ink-on-gold"
                  aria-hidden="true"
                >
                  <Check className="h-3 w-3 text-ink" />
                </span>
                <span className="text-sm text-ink-muted">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
