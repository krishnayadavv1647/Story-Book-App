/**
 * Renders a book to a single, self-contained interactive flipbook (one .html
 * file).
 *
 * This is the one export that keeps the *reading* experience rather than a
 * printout of it. A PDF cannot animate — it is a page-based document format —
 * so a "book that flips its pages" has to be a small web page instead. It is
 * deliberately self-contained: every illustration is inlined as a `data:` URI
 * and the flip engine is a few dozen lines of vanilla JS at the bottom, so the
 * file opens straight from disk, works offline, and can be emailed as one
 * attachment with nothing to host.
 *
 * The flip itself is CSS 3D: each leaf is bound on its left edge and rotates
 * from 0 to -180°, front face then a paper back, exactly the way a page turns.
 */

const WATERMARK = 'Made with StoryBook Studio';

/** HTML-escape text that came from the plan, so it can never break the markup. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sniffs the image type from its first bytes so the data URI carries the right mime. */
function dataUri(buffer) {
  if (!buffer || buffer.length < 12) return null;

  let mime = 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) mime = 'image/jpeg';
  else if (buffer[0] === 0x89 && buffer[1] === 0x50) mime = 'image/png';
  else if (buffer.toString('ascii', 0, 4) === 'GIF8') mime = 'image/gif';
  else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    mime = 'image/webp';

  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** The illustration half of a leaf — the picture, or a soft placeholder. */
function artFace(uri) {
  return uri
    ? `<div class="art" style="background-image:url('${uri}')"></div>`
    : `<div class="art art--empty"></div>`;
}

function coverLeaf({ book, uri }) {
  return `
    <div class="leaf" data-leaf>
      <div class="face front cover">
        ${artFace(uri)}
        <div class="cover-text">
          <h1>${esc(book.title || 'Untitled')}</h1>
          ${book.description ? `<p>${esc(book.description)}</p>` : ''}
        </div>
      </div>
      <div class="face back"></div>
    </div>`;
}

function pageLeaf({ page, uri, number, showNumber, showWatermark }) {
  return `
    <div class="leaf" data-leaf>
      <div class="face front page">
        ${artFace(uri)}
        <div class="caption">
          ${page.title ? `<h2>${esc(page.title)}</h2>` : ''}
          ${page.narration ? `<p>${esc(page.narration)}</p>` : ''}
        </div>
        <div class="foot">
          ${showNumber ? `<span class="folio">${number}</span>` : '<span></span>'}
          ${showWatermark ? `<span class="mark">${WATERMARK}</span>` : '<span></span>'}
        </div>
      </div>
      <div class="face back"></div>
    </div>`;
}

function backCoverLeaf({ book }) {
  return `
    <div class="leaf" data-leaf>
      <div class="face front endcover">
        <p>${book.moral ? `&ldquo;${esc(book.moral)}&rdquo;` : 'The End'}</p>
      </div>
      <div class="face back"></div>
    </div>`;
}

/**
 * @param {object} input
 * @param {object} input.book
 * @param {Array}  input.pages    ordered pages, each optionally carrying `image` (a Buffer)
 * @param {object} input.options  includeCover, includeBackCover, includePageNumbers, includeWatermark
 * @returns {Promise<{ buffer: Buffer, pageCount: number }>}
 */
export async function renderBookHtml({ book, pages, options = {} }) {
  const showNumber = options.includePageNumbers !== false;
  const showWatermark = options.includeWatermark !== false;

  const pageUris = pages.map((page) => dataUri(page.image));
  const coverUri = pageUris.find(Boolean) ?? null;

  const leaves = [];
  if (options.includeCover !== false) leaves.push(coverLeaf({ book, uri: coverUri }));
  pages.forEach((page, index) => {
    leaves.push(
      pageLeaf({ page, uri: pageUris[index], number: index + 1, showNumber, showWatermark }),
    );
  });
  if (options.includeBackCover !== false) leaves.push(backCoverLeaf({ book }));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(book.title || 'Storybook')}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px;
    background: radial-gradient(120% 120% at 50% 0%, #0d1b26 0%, #060d13 60%, #03080c 100%);
    color: #f4f6f7; font-family: Georgia, 'Times New Roman', serif;
    -webkit-font-smoothing: antialiased; padding: 24px;
  }
  .title-bar { font-size: 15px; letter-spacing: .04em; color: #9fb0b3; text-align: center; }
  .stage { perspective: 2400px; }
  .book {
    position: relative; width: min(86vw, 460px); aspect-ratio: 3 / 4;
    transform-style: preserve-3d;
    filter: drop-shadow(0 26px 42px rgba(0,0,0,.55));
  }
  /* The binding, a dark seam down the left edge the pages turn against. */
  .book::before {
    content: ""; position: absolute; top: 0; bottom: 0; left: -3px; width: 6px;
    border-radius: 3px; background: linear-gradient(90deg, #000, #26160a);
    z-index: 9999;
  }
  .leaf {
    position: absolute; inset: 0; transform-origin: left center;
    transform-style: preserve-3d; transition: transform .8s cubic-bezier(.2,.7,.2,1);
    will-change: transform;
  }
  .leaf.flipped { transform: rotateY(-180deg); }
  .face {
    position: absolute; inset: 0; backface-visibility: hidden; overflow: hidden;
    border-radius: 6px 10px 10px 6px;
    background: #fbf7ef; color: #17110a;
    display: flex; flex-direction: column;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
  }
  /* The reverse of every leaf: blank cream paper, so a turn shows a page back. */
  .face.back { transform: rotateY(180deg);
    background: linear-gradient(90deg, #efe8da 0%, #fbf7ef 14%); }
  .art { flex: 1 1 auto; background-size: cover; background-position: center; background-color: #142e2e; }
  .art--empty { background: repeating-linear-gradient(45deg,#e9e2d4,#e9e2d4 12px,#e2dacb 12px,#e2dacb 24px); }
  .caption { padding: 14px 18px 6px; }
  .caption h2 { margin: 0 0 6px; font-size: 19px; line-height: 1.25; }
  .caption p { margin: 0; font-size: 14px; line-height: 1.5; color: #2c2418; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center;
    padding: 8px 14px 12px; font-family: system-ui, sans-serif; }
  .folio { font-size: 12px; color: #8a7f6c; }
  .mark { font-size: 9px; color: #b6ac97; }
  /* Cover + back cover. */
  .cover { text-align: center; }
  .cover .art { flex: 0 0 62%; }
  .cover-text { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; padding: 14px 22px; }
  .cover-text h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.15; }
  .cover-text p { margin: 0; font-size: 13px; line-height: 1.5; color: #4a4234; }
  .endcover { align-items: center; justify-content: center; background: #14100a; color: #f4ead4; }
  .endcover p { font-size: 18px; padding: 0 32px; text-align: center; }
  /* Controls. */
  .controls { display: flex; align-items: center; gap: 14px; font-family: system-ui, sans-serif; }
  .controls button {
    width: 40px; height: 40px; border-radius: 999px; border: 1px solid #24343b;
    background: #0c1a22; color: #eaf1f2; font-size: 18px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; transition: background .15s;
  }
  .controls button:hover:not(:disabled) { background: #13252e; }
  .controls button:disabled { opacity: .35; cursor: not-allowed; }
  .counter { min-width: 92px; text-align: center; font-size: 13px; color: #9fb0b3; }
  .hint { font-family: system-ui, sans-serif; font-size: 11px; color: #62747a; }
</style>
</head>
<body>
  <div class="title-bar">${esc(book.title || 'Storybook')}</div>

  <div class="stage">
    <div class="book" id="book" role="group" aria-roledescription="flipbook" aria-label="${esc(book.title || 'Storybook')}">
      ${leaves.join('\n')}
    </div>
  </div>

  <div class="controls">
    <button id="prev" aria-label="Previous page">&lsaquo;</button>
    <span class="counter" id="counter"></span>
    <button id="next" aria-label="Next page">&rsaquo;</button>
  </div>
  <div class="hint">Click a page, use the arrows, or press ← / → to turn.</div>

<script>
(function () {
  var book = document.getElementById('book');
  var leaves = Array.prototype.slice.call(book.querySelectorAll('[data-leaf]'));
  var total = leaves.length;
  var current = 0; // how many leaves have been turned
  var counter = document.getElementById('counter');
  var prev = document.getElementById('prev');
  var next = document.getElementById('next');

  function render() {
    for (var i = 0; i < total; i++) {
      var flipped = i < current;
      leaves[i].classList.toggle('flipped', flipped);
      // Unflipped leaves stack with the current one on top; turned leaves stack
      // to the left in the order they were turned.
      leaves[i].style.zIndex = flipped ? i : (total - i);
    }
    counter.textContent = 'Page ' + (current + 1) + ' of ' + total;
    prev.disabled = current === 0;
    // The last leaf stays face-up, so the deepest turn still shows it.
    next.disabled = current >= total - 1;
  }

  function turnForward() { if (current < total - 1) { current += 1; render(); } }
  function turnBack() { if (current > 0) { current -= 1; render(); } }

  next.addEventListener('click', turnForward);
  prev.addEventListener('click', turnBack);
  book.addEventListener('click', function (e) {
    var rect = book.getBoundingClientRect();
    if ((e.clientX - rect.left) < rect.width / 2) turnBack(); else turnForward();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') turnForward();
    else if (e.key === 'ArrowLeft') turnBack();
  });

  render();
})();
</script>
</body>
</html>`;

  return { buffer: Buffer.from(html, 'utf8'), pageCount: leaves.length };
}

export default { renderBookHtml };
