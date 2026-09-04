import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-page p-8 text-center">
      <p className="text-2xs font-semibold uppercase tracking-widest text-ink-muted">404</p>
      <h1 className="text-2xl font-semibold text-ink">That page does not exist</h1>
      <Link
        to="/"
        className="surface-gold mt-2 inline-flex h-control-xl items-center rounded border px-5 text-sm font-semibold text-ink-on-gold"
      >
        Back to StoryBook Studio
      </Link>
    </main>
  );
}

export default NotFoundPage;
