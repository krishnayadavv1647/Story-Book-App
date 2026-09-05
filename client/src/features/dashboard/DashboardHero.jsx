import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from '../../components/common/index.js';

/**
 * Measured from Dashboard frame 1:2 (node 2:58): 362px tall, 16px radius,
 * 48px wordmark, 17px subtitle, and a white 164 × 48 CTA.
 *
 * The frame drew flat blocks where an illustration was meant to go, and those
 * were reproduced as placeholders. Real artwork now exists (`public/banner.png`)
 * and takes their place as the background, which is what the frame was standing
 * in for.
 *
 * The scrim is not decoration: the artwork is a photograph-like image whose
 * light and dark areas move as the hero crops at different widths, and the
 * heading has to stay readable over every one of them. It is darkest on the
 * left, where the text sits, and clears to nothing on the right so the lantern
 * and the glowing book are still visible.
 */
export function DashboardHero({ onCreate, className }) {
  return (
    <section
      className={cn(
        // The background colour matters: it is what shows if the image is slow
        // or missing, and the text must be readable against it either way.
        'relative flex h-[240px] items-center overflow-hidden rounded-2xl bg-page-deep sm:h-[362px]',
        // A gold edge, the same colour as the Create Book button it frames, so
        // the banner reads as one lit object rather than a photo that stops.
        'border-1 border-gold-border',
        className,
      )}
    >
      <img
        src="/banner.png"
        alt=""
        aria-hidden="true"
        // Above the fold, so it is worth fetching early rather than lazily.
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent"
      />

      <div className="relative z-10 px-6 sm:pl-[42px] sm:pr-6">
        <h1 className="text-4xl font-bold text-ink sm:text-display">
          STORYBOOK
          <span className="block font-normal">STUDIO</span>
        </h1>

        <p className="mt-4 text-lg text-ink">
          Create Beautiful Illustrated Books In Minutes
        </p>

        {/* The one main action on the dashboard, so it wears the shared gold
            rather than a treatment of its own. Geometry is still the measured
            164 × 48 with an 8px radius. */}
        <Button
          size="2xl"
          variant="primary"
          onClick={onCreate}
          leadingIcon={Plus}
          className="mt-7 w-[164px]"
        >
          Create Book
        </Button>
      </div>
    </section>
  );
}

export default DashboardHero;
