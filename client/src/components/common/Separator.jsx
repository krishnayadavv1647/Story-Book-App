import { cn } from '../../lib/cn.js';
import { CountPill } from './Tag.jsx';

/** The 1px hairline that divides collapsed page-outline rows. */
export function Separator({ className, orientation = 'horizontal' }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-hairline',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}

/**
 * Section heading with an optional count pill — "Page Outline (10)" in the
 * Story Plan frame, "Your Storybooks (50)" on the Dashboard. 19px semibold.
 */
// The two approved frames use different heading sizes: 19px on Review Story
// Plan, 22px on the Dashboard. Both are kept rather than averaged.
const HEADING_SIZES = { md: 'text-2xl', lg: 'text-section' };

export function SectionHeading({
  children,
  count,
  actions,
  className,
  size = 'md',
  as: Tag = 'h2',
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-3">
        <Tag className={cn('font-semibold text-ink', HEADING_SIZES[size])}>{children}</Tag>
        {count !== undefined && count !== null && <CountPill>{count}</CountPill>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export default Separator;
