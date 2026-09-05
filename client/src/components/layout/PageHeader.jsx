import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * Back link → 25px bold title → 14px muted subtitle, with the page's primary
 * actions right-aligned against the title. Drawn identically on Review Story
 * Plan and Create Your Characters.
 */
export function PageHeader({ backTo, backLabel, title, subtitle, actions, className }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0">
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex items-center gap-2.5 text-base font-semibold text-ink hover:underline"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            {backLabel ?? 'Back'}
          </Link>
        )}

        <h1 className={cn('text-2xl font-bold text-ink sm:text-3xl', backTo && 'mt-[18px]')}>
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-base text-ink-muted">{subtitle}</p>}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4 sm:pt-8">{actions}</div>
      )}
    </div>
  );
}

export default PageHeader;
