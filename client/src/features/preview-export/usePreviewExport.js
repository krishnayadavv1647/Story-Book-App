import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiClientError } from '../../api/client.js';
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
 * Saves a file without leaving the page.
 *
 * The server sends the export from our own origin as an attachment, so a plain
 * click is enough — the `download` attribute is honoured only same-origin,
 * which is exactly why a direct bucket URL navigated away instead of saving.
 */
export function startDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? '';
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();
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
      if (job?.downloadUrl) startDownload(job.downloadUrl, suggested);

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
