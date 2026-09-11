import { useEffect, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';

import { Button, Modal } from '../../components/common/index.js';
import { useAuthStore } from '../../store/authStore.js';
import { useConfigStore } from '../../store/configStore.js';
import { useWelcomeStore } from '../../store/welcomeStore.js';
import { youtubeEmbedUrl, youtubeId, youtubeThumbnail } from '../../lib/youtube.js';

/**
 * The welcome tour: a short video that opens by itself the first time someone
 * is signed in, and never again for that account unless they ask for it.
 *
 * Once, not every visit. A pop-up that greets a returning reader every single
 * time stops being a welcome and becomes a door to close — so having seen it is
 * remembered per account, and Settings can open it again.
 *
 * The player is not loaded until play is pressed. Until then this is a still
 * image and a button, which is what the reference draws, keeps the pop-up fast,
 * and means YouTube sets nothing on anyone's browser who never watches.
 */

const seenKey = (userId) => `sb.welcomeVideoSeen.${userId}`;

function hasSeen(userId) {
  try {
    return localStorage.getItem(seenKey(userId)) === '1';
  } catch {
    // Storage blocked: better to show it once more than to fail to show it.
    return false;
  }
}

function markSeen(userId) {
  try {
    localStorage.setItem(seenKey(userId), '1');
  } catch {
    // Storage blocked. It simply shows again on the next visit.
  }
}

export function WelcomeVideo() {
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  const url = useConfigStore((state) => state.welcomeVideoUrl);
  const open = useWelcomeStore((state) => state.open);
  const show = useWelcomeStore((state) => state.show);
  const hide = useWelcomeStore((state) => state.hide);
  const [playing, setPlaying] = useState(false);
  const [thumbFallback, setThumbFallback] = useState(false);

  const videoId = youtubeId(url);
  const signedIn = status === 'authenticated' && Boolean(userId);

  useEffect(() => {
    if (signedIn && videoId && !hasSeen(userId)) show();
  }, [signedIn, videoId, userId, show]);

  // Leaving the app's chrome — signing out, or opening the full-screen reader —
  // takes the pop-up with it, so it can never come back already open for
  // whoever is signed in next.
  useEffect(() => hide, [hide]);

  if (!signedIn || !videoId) return null;

  // Any way of closing it counts as having seen it: the X, the backdrop, Escape
  // and "Got it" all mean the same thing to the person doing it.
  const close = () => {
    markSeen(userId);
    setPlaying(false);
    hide();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? show() : close())}
      size="lg"
      title="Welcome to StoryBook Studio"
      description="A quick tour of how to turn an idea into an illustrated book you can share."
      footer={
        <span className="flex w-full flex-wrap items-center justify-between gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Watch on YouTube
          </a>
          <Button variant="primary" onClick={close}>
            Got it — let&apos;s go
          </Button>
        </span>
      }
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-hairline bg-page-deep">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(videoId)}
            title="StoryBook Studio welcome video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            // YouTube refuses to play an embed that arrives with no referrer at
            // all ("Error 153"), so this is spelled out rather than inherited.
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label="Play the welcome video"
          >
            <img
              src={youtubeThumbnail(videoId, { fallback: thumbFallback })}
              // Some uploads have no full-resolution still; drop to the one
              // YouTube always has, once, rather than looping on errors.
              onError={() => setThumbFallback(true)}
              // YouTube usually answers a missing still with a 120px grey
              // placeholder rather than an error, so one that small is missing too.
              onLoad={(event) => {
                if (event.currentTarget.naturalWidth <= 120) setThumbFallback(true);
              }}
              alt=""
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-surface shadow-overlay transition-transform group-hover:scale-105">
                <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
              </span>
            </span>
          </button>
        )}
      </div>
    </Modal>
  );
}

export default WelcomeVideo;
