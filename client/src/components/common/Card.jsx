import { cn } from '../../lib/cn.js';

/**
 * The single container in the system: one dark panel, one hairline border, 8px
 * radius, 16px padding. Every panel in the approved screens is this.
 *
 * The ground is `.surface-card` — a barely-there vertical gradient with a soft
 * drop shadow, defined once in styles/index.css. Deliberately not a glow: a
 * dark theme that outlines every card in light reads as a demo, not a product.
 */
export function Card({ className, children, padded = true, ...props }) {
  return (
    <div
      className={cn(
        'surface-card rounded-lg border border-hairline',
        padded && 'p-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Card title row — 14px semibold, with optional right-aligned actions. */
export function CardHeader({ title, actions, className, children }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('mt-4', className)}>{children}</div>;
}

export default Card;
