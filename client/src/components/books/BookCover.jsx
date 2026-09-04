import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { CoverArt } from './CoverArt.jsx';

/**
 * A book, drawn as an object rather than a rectangle.
 *
 * Built from Figma `hY9EcRsQJIcA35YpTPfxeE` frame 1:3 ("Realistic Book Cards"),
 * which stacks four layers to make a closed book seen slightly from the front:
 * the back cover peeking out along the fore edge, the block of pages, the cover
 * artwork, and a rounded spine down the left.
 *
 * Every layer below is the measured Figma rectangle expressed as a percentage of
 * the 222 x 277 card, so the book keeps its proportions at any column width. The
 * node id each one came from is on the line.
 */
const LAYERS = {
  // 1:5 — the back cover, 2px lower and wider than the front, so a sliver of
  // board shows above and below the pages. This is what stops the card reading
  // as a flat picture.
  backEdge: { left: '6.3063%', top: '0.722%', width: '90.991%', height: '96.3899%' },
  // 1:6 — the fore edge of the paper block, standing proud of the cover.
  pages: { left: '91.4414%', top: '2.1661%', width: '7.2072%', height: '92.0578%' },
  // 1:7 — the printed cover itself. The generated artwork lives here.
  cover: { left: '1.8018%', top: '0%', width: '90.991%', height: '96.3899%' },
  // 1:8 — the spine, its gradient reading as a rounded edge turning away.
  spine: { left: '0%', top: '0%', width: '5.8559%', height: '96.3899%' },
};

/**
 * `to` makes the cover itself the link, and the badge is deliberately left
 * outside it: a link is named by what it contains, and folding a status chip in
 * would rename the link every time the book changed state — "Little Moon Keeper"
 * one minute, "Little Moon Keeper Generating" the next. `children` go inside the
 * link, for anything that genuinely belongs to its name.
 *
 * DEVIATION: the frame tilts its two cards by +0.8° and -0.7°, so a shelf of
 * them looks stacked by hand. Dropped at the owner's request — at card size the
 * negative tilt read as a crooked book rather than a deliberate one, and a grid
 * of books that do not share a baseline looks misaligned rather than casual.
 * Every book now hangs straight. Recorded in the design source map.
 */
export function BookCover({
  to,
  imageUrl,
  lettered = false,
  title,
  subtitle,
  color,
  badge,
  className,
  children,
}) {
  const art = (
    <>
      <CoverArt
        imageUrl={imageUrl}
        lettered={lettered}
        title={title}
        subtitle={subtitle}
        color={color}
      />
      {children}
    </>
  );

  return (
    // One element now that there is no tilt to hold: the lift on hover is the
    // only transform, so it can live on the book itself.
    <div
      className={cn(
        'relative aspect-[222/277] w-full transition-transform duration-200 hover:-translate-y-1',
        className,
      )}
      style={{ filter: 'drop-shadow(var(--book-shadow))' }}
    >
      <div
        className="surface-book-back-edge absolute rounded-[7px]"
        style={LAYERS.backEdge}
        aria-hidden="true"
      />
      <div
        className="surface-book-pages absolute rounded-[4px]"
        style={LAYERS.pages}
        aria-hidden="true"
      />

      <div
        className="surface-book-cover absolute overflow-hidden rounded-[7px]"
        style={LAYERS.cover}
      >
        {to ? (
          <Link to={to} className="block h-full w-full focus-visible:outline-none">
            {art}
          </Link>
        ) : (
          art
        )}

        {/* Inside the cover, not the card, so it never strays over the block of
            pages on the right. */}
        {badge && <div className="absolute right-2 top-2">{badge}</div>}
      </div>

      <div
        className="surface-book-spine absolute rounded-[6px]"
        style={LAYERS.spine}
        aria-hidden="true"
      />
    </div>
  );
}

export default BookCover;
