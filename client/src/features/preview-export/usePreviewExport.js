import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiUrl, ApiClientError } from '../../api/client.js';
import * as exportsApi from '../../api/exports.js';
import * as booksApi from '../../api/books.js';
import * as planApi from '../../api/plan.js';
import { useAuthStore } from '../../store/authStore.js';

export const previewKeys = {
  book: (bookId) => ['preview', 'book', bookId],
  options: (bookId) => ['preview', 'options', bookId],
  exports: (bookId) => ['preview', 'exports', bookId],
  printCheck: (bookId) => ['preview', 'print-check', bookId],
};

export const DEFAULT_SETTINGS = {
  format: 'pdf',
  quality: 'high',
  pageSize: 'a4',
  orientation: 'portrait',
  includeCover: true,
  includeBackCover: true,
  includePageNumbers: true,
  includeWatermark: true,
  bleedMm: 0,
};

/**
 * Saves an export to disk.
 *
 * Fetched first, rather than pointing a link at the URL, because a link saves
 * whatever comes back. A signed media link expires, and an expired one answers
 * with JSON — as does a dev server whose API is restarting, which answers with
 * the app's own `index.html`. Either lands on disk named `.pdf` and fails only
 * later, when the reader opens it and is told the document is broken. Checking
 * the response here turns that into a sentence they can act on.
 */
export async function saveExport(url, filename) {
  let res;
  try {
    // The server sends this relative; when the app and the API are on different
    // hosts, that path has to be put back on the API's before it is fetched.
    res = await fetch(apiUrl(url));
  } catch {
    throw new Error('The download could not be reached. Check your connection and try again.');
  }

  const type = res.headers.get('content-type') ?? '';

  if (res.status === 403) {
    throw new Error('That download link has expired. Export it again to get a fresh one.');
  }
  if (!res.ok || type.includes('application/json') || type.includes('text/html')) {
    throw new Error('The download did not come back as a file. Please try again.');
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = objectUrl;
  // A blob URL is same-origin, so the name is honoured whatever the API's host.
  link.download = filename || 'storybook';
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Bytes as something a person reads, for the file summary. */
export function formatBytes(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1_000_000;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/**
 * The Preview & Export screen's state.
 *
 * The book is read through the same endpoint the editor uses, so the preview
 * shows exactly what the editor last saved rather than a second opinion.
 */
export function usePreviewExport(bookId) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const detail = useQuery({
    queryKey: previewKeys.book(bookId),
    queryFn: () => planApi.fetchBookDetail(bookId),
    enabled: Boolean(bookId),
  });

  const options = useQuery({
    queryKey: previewKeys.options(bookId),
    queryFn: () => exportsApi.fetchExportOptions(bookId),
    enabled: Boolean(bookId),
  });

  const history = useQuery({
    queryKey: previewKeys.exports(bookId),
    queryFn: () => exportsApi.listExports(bookId),
    enabled: Boolean(bookId),
  });

  const book = detail.data?.book ?? null;
  const pages = useMemo(() => detail.data?.pages ?? [], [detail.data]);

  const describe = (err) => {
    if (!(err instanceof ApiClientError)) return 'Something went wrong. Please try again.';
    return err.message;
  };

  const update = useCallback((patch) => setSettings((current) => ({ ...current, ...patch })), []);

  const runExport = useMutation({
    mutationFn: () => {
      const { format, quality, ...rest } = settings;
      return exportsApi.createExport(bookId, { format, quality, options: rest });
    },
    onMutate: () => {
      setError(null);
      setResult(null);
    },
    onSuccess: async (job) => {
      setResult(job);

      // Save it straight away. The file is finished and the user asked for it —
      // making them find and click a second link is a step with no decision in
      // it. The link stays on screen afterwards, for a browser that blocked
      // this or a download they want again.
      const suggested = options.data?.filename?.[settings.format];
      if (job?.downloadUrl) {
        // The link is seconds old here, so this is the one case that needs no
        // re-signing — but it can still come back as something other than the
        // file, and the reader has to hear about that rather than find out
        // later from a viewer.
        await saveExport(job.downloadUrl, suggested).catch((err) => setError(err.message));
      }

      await queryClient.invalidateQueries({ queryKey: previewKeys.exports(bookId) });
      await useAuthStore.getState().refreshSession();
    },
    onError: (err) => setError(describe(err)),
  });

  const publish = useMutation({
    mutationFn: (published) => exportsApi.setPublished(bookId, published),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: previewKeys.book(bookId) }),
    onError: (err) => setError(describe(err)),
  });

  // The automatic print-quality report. Re-run whenever the book changes (a
  // setting saved, a page edited) so the errors and warnings stay honest.
  const printCheckQuery = useQuery({
    queryKey: previewKeys.printCheck(bookId),
    queryFn: () => exportsApi.fetchPrintCheck(bookId),
    enabled: Boolean(bookId),
  });

  const savePrint = useMutation({
    // Merges over the book's current print settings on the server.
    mutationFn: (print) => booksApi.updateBook(bookId, { print }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: previewKeys.book(bookId) });
      // New size/bleed can change the geometry the checker reports on.
      await queryClient.invalidateQueries({ queryKey: previewKeys.printCheck(bookId) });
    },
    onError: (err) => setError(describe(err)),
  });

  /**
   * Downloading an export from the history list.
   *
   * The job is re-read first: a signed media link outlives its usefulness in
   * minutes, and the one sitting on screen may have been signed long before
   * anybody clicked it. Asking for the job again costs one request and hands
   * back a fresh signature, which is cheaper than explaining an expiry.
   */
  const download = useMutation({
    mutationFn: async (job) => {
      const id = job?._id ?? job?.id;
      const fresh = id ? await exportsApi.fetchExport(id) : job;

      if (!fresh?.downloadUrl) {
        throw new Error('This export is no longer available. Export it again.');
      }

      return saveExport(fresh.downloadUrl, options.data?.filename?.[fresh.format]);
    },
    onMutate: () => setError(null),
    onError: (err) => setError(err.message ?? describe(err)),
  });

  const preparePrint = useMutation({
    mutationFn: () => exportsApi.preparePrint(bookId),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: previewKeys.book(bookId) });
      await queryClient.invalidateQueries({ queryKey: previewKeys.printCheck(bookId) });
    },
    onError: (err) => setError(describe(err)),
  });

  const readiness = options.data?.readiness ?? null;
  const estimated = options.data?.estimatedSizeBytes?.[settings.format] ?? 0;

  return {
    book,
    pages,
    readiness,
    pageSizes: options.data?.pageSizes ?? [],
    filename: options.data?.filename?.[settings.format] ?? '',
    estimatedSizeBytes: estimated,
    exports: history.data ?? [],

    isPending: detail.isPending || options.isPending,
    isError: detail.isError || options.isError,
    refetch: () => {
      detail.refetch();
      options.refetch();
    },

    settings,
    update,
    runExport,
    download,
    publish,
    printCheck: printCheckQuery.data ?? null,
    printCheckPending: printCheckQuery.isPending,
    savePrint,
    preparePrint,
    result,
    error,
    dismissError: () => setError(null),
  };
}

export default usePreviewExport;
