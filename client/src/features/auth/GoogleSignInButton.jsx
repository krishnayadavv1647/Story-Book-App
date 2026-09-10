import { useConfigStore } from '../../store/configStore.js';

/**
 * "Continue with Google" — the entry point to the server-side OAuth flow.
 *
 * Because the whole flow is server-side (Authorization Code), this is simply a
 * full-page link to the API's `/auth/google`, which redirects the browser to
 * Google and, after the callback, back into the app with a session already set.
 * No Google script, no token handling, and nothing configured in the client:
 * whether it shows at all comes from the server's public config
 * (`googleAuthEnabled`), so an install that has not set Google up shows nothing
 * and email/password works exactly as before.
 */
const GOOGLE_START = `${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/auth/google`;

export function GoogleSignInButton({ text = 'Continue with Google', label = 'or', bonusCode = null }) {
  const enabled = useConfigStore((s) => s.googleAuthEnabled);

  if (!enabled) return null;

  // A bonus link has to survive the trip out to Google and back; the server
  // parks it in a cookie for the callback to read.
  const href = bonusCode ? `${GOOGLE_START}?bonus=${encodeURIComponent(bonusCode)}` : GOOGLE_START;

  return (
    <div>
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      {/* A plain anchor, not a router link: this must be a real navigation so the
          browser follows the server's redirect out to Google. */}
      <a
        href={href}
        className="flex w-full items-center justify-center gap-3 rounded-pill border border-hairline bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-hover"
      >
        <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
          <path
            fill="currentColor"
            d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 3l6.4-6.4C34.6 4.1 29.6 2 24 2 12.4 2 3 11.4 3 23s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-3z"
          />
        </svg>
        {text}
      </a>
    </div>
  );
}

export default GoogleSignInButton;
