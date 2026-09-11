/**
 * The video id inside a YouTube link, or null.
 *
 * Accepts the forms people actually paste — `youtu.be/ID`, `youtube.com/watch?v=ID`,
 * `/embed/ID`, `/shorts/ID`, `/live/ID`, with or without `www.` or `m.` — and
 * refuses anything else, including a non-YouTube host that happens to carry a
 * `v` parameter. An id is eleven characters from YouTube's own alphabet; anything
 * that is not one is not played.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(url) {
  if (typeof url !== 'string' || !url.trim()) return null;

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^(www|m)\./, '');
  let id = null;

  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      id = parsed.searchParams.get('v');
    } else {
      const match = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      id = match?.[1] ?? null;
    }
  }

  return id && VIDEO_ID.test(id) ? id : null;
}

/**
 * The privacy-enhanced player: nothing is set on the viewer's browser until they
 * press play, which is also why the pop-up shows a still image first.
 */
export function youtubeEmbedUrl(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
}

/** YouTube's own still for a video. `maxresdefault` is missing on some uploads. */
export function youtubeThumbnail(id, { fallback = false } = {}) {
  return `https://i.ytimg.com/vi/${id}/${fallback ? 'hqdefault' : 'maxresdefault'}.jpg`;
}

export default { youtubeId, youtubeEmbedUrl, youtubeThumbnail };
