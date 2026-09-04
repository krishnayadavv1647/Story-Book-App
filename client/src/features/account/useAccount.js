import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiClientError } from '../../api/client.js';
import * as accountApi from '../../api/account.js';
import { useAuthStore } from '../../store/authStore.js';

export const accountKeys = {
  notifications: (unreadOnly) => ['account', 'notifications', unreadOnly],
  profile: () => ['account', 'profile'],
};

const describe = (err) =>
  err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.';

export function useNotifications({ unreadOnly = false } = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: accountKeys.notifications(unreadOnly),
    queryFn: () => accountApi.fetchNotifications({ unreadOnly, limit: 50 }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['account', 'notifications'] });

  const markRead = useMutation({
    mutationFn: accountApi.markNotificationRead,
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: accountApi.markAllNotificationsRead,
    onSuccess: invalidate,
  });

  const items = query.data?.items ?? [];

  return {
    items,
    // `api.list` keeps only the pagination block, so the unread count is taken
    // from the rows on screen rather than a meta field that never arrives.
    unread: items.filter((item) => !item.readAt).length,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    markRead,
    markAllRead,
  };
}

export function useProfile() {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  const profile = useQuery({ queryKey: accountKeys.profile(), queryFn: accountApi.fetchProfile });

  const save = useMutation({
    mutationFn: accountApi.updateProfile,
    onMutate: () => {
      setError(null);
      setSaved(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accountKeys.profile() });
      // The sidebar shows the name, so it has to hear about a rename.
      await useAuthStore.getState().refreshSession();
      setSaved('Account updated.');
    },
    onError: (err) => setError(describe(err)),
  });

  const password = useMutation({
    mutationFn: accountApi.changePassword,
    onMutate: () => {
      setError(null);
      setSaved(null);
    },
    onSuccess: (data) =>
      setSaved(
        `Password changed. ${data.sessionsRevoked} other ${
          data.sessionsRevoked === 1 ? 'session was' : 'sessions were'
        } signed out.`,
      ),
    onError: (err) => setError(describe(err)),
  });

  return {
    profile: profile.data ?? null,
    isPending: profile.isPending,
    isError: profile.isError,
    refetch: profile.refetch,
    save,
    password,
    error,
    saved,
    dismiss: () => {
      setError(null);
      setSaved(null);
    },
  };
}

export default { useNotifications, useProfile };
