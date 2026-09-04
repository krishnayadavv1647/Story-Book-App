import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as charactersApi from '../../api/characters.js';
import { uploadReferenceImage } from '../../api/generation.js';
import { ApiClientError } from '../../api/client.js';

export const characterKeys = {
  cast: (bookId) => ['characters', 'book', bookId],
  library: () => ['characters', 'library'],
};

/**
 * The character workspace: this book's cast, the wider library to pick from, and
 * the edits to whichever character is selected.
 */
export function useCharacters(bookId) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle');

  const cast = useQuery({
    queryKey: characterKeys.cast(bookId),
    queryFn: () => charactersApi.listCharacters({ bookId }),
    enabled: Boolean(bookId),
  });

  const library = useQuery({
    queryKey: characterKeys.library(),
    queryFn: () => charactersApi.listCharacters(),
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: characterKeys.cast(bookId) }),
      queryClient.invalidateQueries({ queryKey: characterKeys.library() }),
    ]);
  }, [queryClient, bookId]);

  const describe = (err) =>
    err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.';

  const action = (fn) => ({
    mutationFn: fn,
    onMutate: () => {
      setSaveState('saving');
      setError(null);
    },
    onSuccess: async () => {
      await refresh();
      setSaveState('saved');
    },
    onError: (err) => {
      setError(describe(err));
      setSaveState('error');
    },
  });

  const create = useMutation(
    action(async (draft) => {
      const character = await charactersApi.createCharacter(draft);
      // A character made here belongs to this book straight away; making the
      // user attach it as a second step would be a trap.
      await charactersApi.attachToBook(bookId, character._id);
      return character;
    }),
  );

  const update = useMutation(action(({ characterId, patch }) => charactersApi.updateCharacter(characterId, patch)));
  const attach = useMutation(action((characterId) => charactersApi.attachToBook(bookId, characterId)));
  const detach = useMutation(action((characterId) => charactersApi.detachFromBook(bookId, characterId)));
  /**
   * Upload then attach, as one action. An upload the user never gets to use
   * would just be a file sitting in storage waiting for its TTL.
   */
  const uploadReference = useMutation(
    action(async ({ characterId, file }) => {
      const asset = await uploadReferenceImage(file);
      return charactersApi.addReference(characterId, asset.assetId);
    }),
  );

  const removeReference = useMutation(
    action(({ characterId, assetId }) => charactersApi.removeReference(characterId, assetId)),
  );

  const lock = useMutation(action((characterId) => charactersApi.lockIdentity(characterId)));
  const unlock = useMutation(action((characterId) => charactersApi.unlockIdentity(characterId)));

  return {
    cast: cast.data ?? [],
    library: library.data ?? [],
    isPending: cast.isPending,
    isError: cast.isError,
    refetch: cast.refetch,
    error,
    dismissError: () => setError(null),
    saveState,
    create,
    update,
    attach,
    detach,
    lock,
    unlock,
    uploadReference,
    removeReference,
  };
}

export default useCharacters;
