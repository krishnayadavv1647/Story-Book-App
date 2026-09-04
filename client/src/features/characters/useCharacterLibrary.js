import { useQuery } from '@tanstack/react-query';
import * as charactersApi from '../../api/characters.js';

/** Every character on the account, independent of any one book. */
export function useCharacterLibrary() {
  const query = useQuery({
    queryKey: ['characters', 'library', 'all'],
    queryFn: () => charactersApi.listCharacters(),
  });

  return {
    items: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export default useCharacterLibrary;
