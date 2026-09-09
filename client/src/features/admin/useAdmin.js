import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '../../api/admin.js';

export const adminKeys = {
  overview: () => ['admin', 'overview'],
  users: (search) => ['admin', 'users', search],
  audit: () => ['admin', 'audit'],
};

/** The admin screen's data. Every request here is refused for a non-admin. */
export function useAdmin() {
  const [search, setSearch] = useState('');

  const overview = useQuery({ queryKey: adminKeys.overview(), queryFn: adminApi.fetchOverview });
  const users = useQuery({
    queryKey: adminKeys.users(search),
    queryFn: () => adminApi.listUsers({ search }),
  });
  const audit = useQuery({ queryKey: adminKeys.audit(), queryFn: adminApi.fetchAudit });

  const queryClient = useQueryClient();
  const adjustCredits = useMutation({
    mutationFn: ({ userId, amount, reason }) =>
      adminApi.adjustUserCredits(userId, { amount, reason }),
    // The list shows the balance, so it has to hear about the change.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  return {
    adjustCredits,
    overview: overview.data ?? null,
    users: users.data?.items ?? [],
    audit: audit.data ?? [],
    search,
    setSearch,
    isPending: overview.isPending || users.isPending,
    isError: overview.isError,
    refetch: () => {
      overview.refetch();
      users.refetch();
      audit.refetch();
    },
  };
}

export default useAdmin;
