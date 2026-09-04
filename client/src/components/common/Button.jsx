import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * Geometry is measured from the approved Figma sources; colour is the dark
 * cinematic palette. Radius tracks height in the design: 42px controls use 8px,
 * 40/36px use 7px.
 *
 * `primary` is the one gold gradient in the product. It lives in
 * styles/index.css as `.surface-gold` so the selected sidebar row can wear the
 * identical thing rather than a copy that drifts. Gold means "the main action
 * here", so a screen gets one — never a row of them.
 */
const VARIANTS = {
  primary: 'surface-gold border',
  secondary:
    'bg-surface text-ink border border-hairline hover:border-hairline-strong ' +
    'hover:bg-surface-hover active:bg-surface-elevated',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-surface-hover',
  // Destructive stays red and stays readable: a red wash behind red text fails
  // contrast, so the fill is the tint and the text keeps the full colour.
  danger: 'bg-surface text-danger border border-danger hover:bg-danger-soft active:bg-danger-soft',
  // For the white caption band on a book card. A dark `secondary` button there
  // reads as a hole punched in the label.
  onPaper: 'bg-paper text-paper-ink border border-paper-line hover:bg-paper-hover',
};

const SIZES = {
  sm: 'h-control-sm rounded-sm px-3 text-sm',
  md: 'h-control-lg rounded px-4 text-sm',
  lg: 'h-control-xl rounded px-5 text-sm',
  xl: 'h-control-2xl rounded-lg px-4 text-sm',
  // The Dashboard hero CTA: 48px tall, 8px radius, 15px label (frame 1:2, 2:62).
  '2xl': 'h-12 rounded-lg px-[22px] text-md',
};

export const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    className,
    children,
    loading = false,
    disabled = false,
    leadingIcon: Leading,
    trailingIcon: Trailing,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      // Screen readers need the pending state announced, not just the spinner.
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 font-semibold',
        'transition-[background,border-color,box-shadow,transform,color] duration-100',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        Leading && <Leading className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      {children}
      {Trailing && !loading && <Trailing className="h-4 w-4 shrink-0" aria-hidden="true" />}
    </button>
  );
});

export default Button;
