import { cn } from '../../lib/cn.js';

/**
 * Placeholder books at the real card's geometry, so the grid does not reflow
 * when the data lands.
 *
 * Matches `BookCover`: the same 222 x 277 shape, hanging straight as the books
 * do. Anything squarer would jump the moment they arrived.
 */
export function CardGridSkeleton({ count = 6, className }) {
  return (
    <ul
      // The list is a live region only in the sense that it will be replaced;
      // the surrounding section announces loading, so these are hidden.
      aria-hidden="true"
      className={cn('grid gap-[22px]', className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <div className="aspect-[222/277] w-full animate-pulse rounded-[7px] bg-skeleton" />
        </li>
      ))}
    </ul>
  );
}

export default CardGridSkeleton;
