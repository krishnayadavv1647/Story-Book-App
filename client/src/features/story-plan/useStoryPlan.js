import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as planApi from '../../api/plan.js';
import { ApiClientError } from '../../api/client.js';

const AUTOSAVE_DELAY_MS = 700;

export const planKeys = { detail: (bookId) => ['book', bookId, 'plan'] };

/**
 * The review screen's data and edits.
 *
 * Field edits autosave on a debounce rather than behind a Save button, because
 * the design's footer reports "All changes saved" — that promise only holds if
 * edits actually persist without being asked to.
 *
 * Structural changes (add, duplicate, delete, reorder) save immediately: they
 * are explicit actions, and debouncing them would let two clicks race.
 */
export function useStoryPlan(bookId) {
  const queryClient = useQueryClient();
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState(null);

  const query = useQuery({
    queryKey: planKeys.detail(bookId),
    queryFn: () => planApi.fetchBookDetail(bookId),
    enabled: Boolean(bookId),
  });

  const timers = useRef(new Map());
  const inFlight = useRef(0);

  // A pending debounce must not fire after the screen is gone.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: planKeys.detail(bookId) }),
    [queryClient, bookId],
  );

  const runSave = useCallback(
    async (fn) => {
      inFlight.current += 1;
      setSaveState('saving');
      try {
        await fn();
        setError(null);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Could not save your changes.');
        setSaveState('error');
        throw err;
      } finally {
        inFlight.current -= 1;
        // Only the last write in flight may declare the screen saved.
        if (inFlight.current === 0) setSaveState((s) => (s === 'error' ? s : 'saved'));
      }
    },
    [],
  );

  /** Debounced per key, so typing in two fields does not cancel one of them. */
  const autosave = useCallback(
    (key, fn) => {
      setSaveState('saving');
      clearTimeout(timers.current.get(key));

      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          runSave(fn).then(refresh).catch(() => {});
        }, AUTOSAVE_DELAY_MS),
      );
    },
    [runSave, refresh],
  );

  const saveBookField = useCallback(
    (field, value) => autosave(`book:${field}`, () => planApi.updateBook(bookId, { [field]: value })),
    [autosave, bookId],
  );

  const savePageField = useCallback(
    (pageId, field, value) =>
      autosave(`page:${pageId}:${field}`, () =>
        planApi.updatePage(bookId, pageId, { [field]: value }),
      ),
    [autosave, bookId],
  );

  const structural = (fn) => ({
    mutationFn: fn,
    onMutate: () => setSaveState('saving'),
    onSuccess: async () => {
      await refresh();
      setSaveState('saved');
      setError(null);
    },
    onError: (err) =>
      setError(err instanceof ApiClientError ? err.message : 'Could not update the outline.'),
  });

  const addPage = useMutation(structural(() => planApi.addPage(bookId)));
  const duplicatePage = useMutation(structural((pageId) => planApi.duplicatePage(bookId, pageId)));
  const deletePage = useMutation(structural((pageId) => planApi.deletePage(bookId, pageId)));
  const reorder = useMutation(structural((order) => planApi.reorderPages(bookId, order)));

  return {
    book: query.data?.book ?? null,
    pages: query.data?.pages ?? [],
    characters: query.data?.characters ?? [],
    estimate: query.data?.estimate ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    saveState,
    error,
    dismissError: () => setError(null),
    saveBookField,
    savePageField,
    addPage,
    duplicatePage,
    deletePage,
    reorder,
  };
}

export default useStoryPlan;
