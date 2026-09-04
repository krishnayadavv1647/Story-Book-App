import { cn } from '../../lib/cn.js';

/**
 * Circular initial avatar. Two sizes are drawn in the sources:
 *   sm — 34px, accent fill, 12px bold initial  (sidebar user card)
 *   md — 38px, neutral fill, 13px initial      (Characters Detected rows)
 *
 * The accent tone is the deeper teal rather than the bright one: white on
 * `--teal-primary` is only about 3.4:1, which a 12px bold initial cannot carry.
 */
const SIZES = {
  sm: 'h-[34px] w-[34px] text-xs',
  md: 'h-[38px] w-[38px] text-sm',
};

const TONES = {
  accent: 'bg-teal-muted text-ink',
  neutral: 'bg-avatar text-ink',
};

export function Avatar({ name = '', src, size = 'md', tone = 'neutral', className, ...props }) {
  const initial = name.trim().charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        // The name is carried by the adjacent label in every use, so the image
        // itself is decorative and an empty alt keeps it out of the reading order.
        alt=""
        className={cn('shrink-0 rounded-pill object-cover', SIZES[size], className)}
        {...props}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-pill font-semibold',
        SIZES[size],
        TONES[tone],
        className,
      )}
      {...props}
    >
      {initial}
    </span>
  );
}

export default Avatar;
