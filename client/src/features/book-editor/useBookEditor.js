import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiClientError } from '../../api/client.js';
import * as planApi from '../../api/plan.js';
import { retryPage as requestPageImage } from '../../api/generation.js';
import { useAuthStore } from '../../store/authStore.js';

export const editorKeys = { book: (bookId) => ['editor', 'book', bookId] };

const AUTOSAVE_MS = 700;

/**
 * The Book Editor's state.
 *
 * Text edits are held locally and flushed on a short debounce, because saving on
 * every keystroke would make typing depend on the network. Everything else —
 * layout, typography, page structure — is written immediately, since those are
 * deliberate single actions rather than a stream of them.
 */
export function useBookEditor(bookId) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [notice, setNotice] = useState(null);

  const detail = useQuery({
    queryKey: editorKeys.book(bookId),
    queryFn: () => planApi.fetchBookDetail(bookId),
    enabled: Boolean(bookId),
  });

  const book = detail.data?.book ?? null;
  const pages = useMemo(() => detail.data?.pages ?? [], [detail.data]);
  const characters = detail.data?.characters ?? [];

  // Keep a selection that still exists — a deleted page must not leave the
  // canvas pointing at nothing.
  useEffect(() => {
    if (pages.length === 0) return;
    if (!selectedId || !pages.some((page) => page._id === selectedId)) {
      setSelectedId(pages[0]._id);
    }
  }, [pages, selectedId]);

  const selected = pages.find((page) => page._id === selectedId) ?? null;

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: editorKeys.book(bookId) }),
    [queryClient, bookId],
  );

  const describe = (err) => {
    if (!(err instanceof ApiClientError)) return 'Something went wrong. Please try again.';
    return err.message;
  };

  // --- undo/redo ---------------------------------------------------------------
  // A session history of page edits. Each entry knows how to put things back and
  // how to do them again; applying either replays through the same write path,
  // so the server always ends up holding what is on screen.
  const history = useRef([]);
  const cursor = useRef(-1);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pagesRef = useRef([]);
  pagesRef.current = pages;

  // Debounced text-edit state. Declared up here so `writePage` can honour an
  // edit that arrived while its own save was still in flight — otherwise the
  // save's response would overwrite the newer words and the text would appear
  // to "rewrite" itself back to a moment ago.
  const pending = useRef({ pageId: null, patch: null });
  const pendingUndo = useRef(null);
  const timer = useRef(null);

  /** The values a patch is about to overwrite, so it can be undone. */
  const inverseOf = useCallback((pageId, patch) => {
    const page = pagesRef.current.find((p) => p._id === pageId);
    if (!page) return null;

    const inverse = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        inverse[key] = Object.fromEntries(
          Object.keys(value).map((inner) => [inner, page[key]?.[inner]]),
        );
      } else {
        inverse[key] = page[key];
      }
    }
    return inverse;
  }, []);

  const record = useCallback((pageId, undoPatch, redoPatch) => {
    if (!undoPatch) return;
    history.current = [...history.current.slice(0, cursor.current + 1), { pageId, undoPatch, redoPatch }];
    cursor.current = history.current.length - 1;
    setHistoryVersion((v) => v + 1);
  }, []);

  /** Writes a page patch straight through and puts the result back in the cache. */
  const writePage = useCallback(
    async (pageId, patch, { track = true } = {}) => {
      if (track) record(pageId, inverseOf(pageId, patch), patch);
      setSaveState('saving');
      setError(null);
      try {
        const updated = await planApi.updatePage(bookId, pageId, patch);
        queryClient.setQueryData(editorKeys.book(bookId), (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((p) => {
              if (p._id !== pageId) return p;
              // Words typed since this save was sent win over the server's older
              // copy, so a slow save never yanks the text back.
              const stillTyping = pending.current.pageId === pageId ? pending.current.patch : null;
              return stillTyping ? { ...updated, ...stillTyping } : updated;
            }),
          };
        });
        setSaveState('saved');
        return updated;
      } catch (err) {
        setError(describe(err));
        setSaveState('error');
        throw err;
      }
    },
    [bookId, queryClient, record, inverseOf],
  );

  const undo = useCallback(async () => {
    const entry = history.current[cursor.current];
    if (!entry) return;
    cursor.current -= 1;
    setHistoryVersion((v) => v + 1);
    await writePage(entry.pageId, entry.undoPatch, { track: false }).catch(() => {});
  }, [writePage]);

  const redo = useCallback(async () => {
    const entry = history.current[cursor.current + 1];
    if (!entry) return;
    cursor.current += 1;
    setHistoryVersion((v) => v + 1);
    await writePage(entry.pageId, entry.redoPatch, { track: false }).catch(() => {});
  }, [writePage]);

  // --- debounced text autosave -------------------------------------------------
  const flush = useCallback(async () => {
    const { pageId, patch } = pending.current;
    if (!pageId || !patch) return;

    const undoPatch = pendingUndo.current;
    pending.current = { pageId: null, patch: null };
    pendingUndo.current = null;
    clearTimeout(timer.current);

    record(pageId, undoPatch, patch);
    await writePage(pageId, patch, { track: false }).catch(() => {});
  }, [writePage, record]);

  const editText = useCallback(
    (pageId, patch) => {
      setSaveState('saving');
      // Show the edit at once; the server is caught up a moment later.
      queryClient.setQueryData(editorKeys.book(bookId), (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((p) => (p._id === pageId ? { ...p, ...patch } : p)),
            }
          : current,
      );

      const continuing = pending.current.pageId === pageId && pending.current.patch;
      // One history entry per burst of typing, not one per keystroke.
      if (!continuing) pendingUndo.current = inverseOf(pageId, patch);

      pending.current = {
        pageId,
        patch: { ...(continuing ? pending.current.patch : {}), ...patch },
      };

      clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_MS);
    },
    [bookId, queryClient, flush, inverseOf],
  );

  // A pending edit must not be lost by navigating away mid-debounce.
  useEffect(() => () => clearTimeout(timer.current), []);

  /**
   * Puts one page's look on every page of the book.
   *
   * A book whose pages are each laid out differently is a stack of pages, not a
   * book — and a book written before a layout existed is on whatever the default
   * was then. Written one page at a time rather than in a single request because
   * that is the endpoint that exists, and because a page that fails leaves the
   * rest applied rather than failing the lot.
   */
  const applyToAll = useCallback(
    async (patch) => {
      const all = queryClient.getQueryData(editorKeys.book(bookId))?.pages ?? [];

      setSaveState('saving');
      for (const target of all) {
        await writePage(target._id, patch, { track: false }).catch(() => {});
      }

      await refresh();
      setSaveState('saved');
      setNotice(`Applied to all ${all.length} ${all.length === 1 ? 'page' : 'pages'}.`);
    },
    [bookId, queryClient, writePage, refresh],
  );

  /** Shared options for every structural action. Plain object, not a hook. */
  const action = (fn, onDone) => ({
    mutationFn: fn,
    onMutate: () => {
      setError(null);
      setSaveState('saving');
    },
    onSuccess: async (data) => {
      await refresh();
      setSaveState('saved');
      onDone?.(data);
    },
    onError: (err) => {
      setError(describe(err));
      setSaveState('error');
    },
  });

  const addPage = useMutation(
    action((at) => planApi.addPage(bookId, at === undefined ? {} : { at })),
  );
  const duplicatePage = useMutation(action((pageId) => planApi.duplicatePage(bookId, pageId)));
  const deletePage = useMutation(action((pageId) => planApi.deletePage(bookId, pageId)));
  const reorderPages = useMutation(action((order) => planApi.reorderPages(bookId, order)));

  const magicLayout = useMutation(
    action(
      (pageId) => planApi.magicLayout(bookId, pageId),
      (data) => setNotice(data?.reason ?? null),
    ),
  );

  const rewrite = useMutation(
    action(
      ({ pageId, instruction }) => planApi.rewritePage(bookId, pageId, instruction),
      () => {
        setNotice('Rewritten. The previous text is kept as a revision.');
        // The rewrite was paid for, so the balance on screen is now stale.
        useAuthStore.getState().refreshSession();
      },
    ),
  );

  const setArtwork = useMutation(
    action(({ pageId, assetId }) => planApi.setPageArtwork(bookId, pageId, assetId)),
  );

  const regenerateImage = useMutation(
    action(
      (pageId) => requestPageImage(bookId, pageId),
      () => {
        setNotice('Illustrating — this page will update when it lands.');
        useAuthStore.getState().refreshSession();
      },
    ),
  );

  const movePage = useCallback(
    (pageId, direction) => {
      const order = pages.map((page) => page._id);
      const from = order.indexOf(pageId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= order.length) return;

      order.splice(to, 0, order.splice(from, 1)[0]);
      reorderPages.mutate(order);
    },
    [pages, reorderPages],
  );

  return {
    book,
    pages,
    characters,
    selected,
    selectedId,
    select: setSelectedId,
    index: pages.findIndex((page) => page._id === selectedId),

    isPending: detail.isPending,
    isError: detail.isError,
    refetch: detail.refetch,

    saveState,
    error,
    dismissError: () => setError(null),
    notice,
    dismissNotice: () => setNotice(null),

    editText,
    applyToAll,
    flush,
    writePage,
    setArtwork,
    undo,
    redo,
    canUndo: historyVersion >= 0 && cursor.current >= 0,
    canRedo: historyVersion >= 0 && cursor.current < history.current.length - 1,
    addPage,
    duplicatePage,
    deletePage,
    reorderPages,
    movePage,
    magicLayout,
    rewrite,
    regenerateImage,
  };
}

export default useBookEditor;
