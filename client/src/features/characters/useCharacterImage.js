import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import * as generationApi from '../../api/generation.js';
import { useAuthStore } from '../../store/authStore.js';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

/**
 * Starts character illustrations — one pose or the full four-pose sheet — and
 * follows them to completion.
 *
 * The server settles each job from either a provider callback or its own poll;
 * this only watches, and stops the moment every job is terminal.
 */
export function useCharacterImage({ onFinished } = {}) {
  const [jobIds, setJobIds] = useState([]);
  const [error, setError] = useState(null);

  const start = useMutation({
    mutationFn: ({ characterId, pose }) =>
      generationApi.requestCharacterImage(characterId, { pose }),
    onMutate: () => setError(null),
    onSuccess: (data) => {
      setJobIds([data.jobId]);
      useAuthStore.getState().refreshSession();
    },
    onError: (err) => setError(describe(err)),
  });

  const startSheet = useMutation({
    mutationFn: (characterId) => generationApi.requestCharacterSheet(characterId),
    onMutate: () => setError(null),
    onSuccess: (data) => {
      setJobIds(data.jobs.map((job) => job.jobId));
      useAuthStore.getState().refreshSession();
    },
    onError: (err) => setError(describe(err)),
  });

  const jobs = useQuery({
    queryKey: ['generation', 'jobs', jobIds],
    queryFn: () => Promise.all(jobIds.map((id) => generationApi.fetchJob(id))),
    enabled: jobIds.length > 0,
    refetchInterval: (query) =>
      (query.state.data ?? []).every((job) => TERMINAL.has(job.status)) ? false : 2000,
    // People switch tabs while an illustration runs; without this the result
    // only appears once they come back and the next interval fires.
    refetchIntervalInBackground: true,
  });

  const list = jobs.data ?? [];
  const done = list.length > 0 && list.every((job) => TERMINAL.has(job.status));
  const isRunning = jobIds.length > 0 && !done;

  const cancel = useCallback(async () => {
    try {
      await Promise.all(jobIds.map((id) => generationApi.cancelJob(id).catch(() => {})));
    } finally {
      setJobIds([]);
    }
  }, [jobIds]);

  // Reacting to a settled job is a side effect, not something to do during
  // render — calling setState there would loop.
  const notified = useRef(null);

  useEffect(() => {
    if (jobIds.length === 0 || list.length === 0) return;

    const failure = list.find((job) => job.status === 'failed');
    if (failure) setError(failure.error?.message ?? 'The illustration could not be generated.');

    const key = jobIds.join(',');
    if (done && notified.current !== key) {
      notified.current = key;
      onFinished?.(list);
    }
  }, [jobIds, list, done, onFinished]);

  return {
    start: (characterId, pose = 'front') => start.mutate({ characterId, pose }),
    startSheet: (characterId) => startSheet.mutate(characterId),
    cancel,
    isRunning,
    // Progress across however many jobs are in flight.
    completed: list.filter((job) => TERMINAL.has(job.status)).length,
    total: jobIds.length,
    progress: list.length
      ? Math.round(list.reduce((sum, job) => sum + (job.progress ?? 0), 0) / list.length)
      : 0,
    imageUrl: list.find((job) => job.imageUrl)?.imageUrl ?? null,
    error,
    dismissError: () => setError(null),
  };
}

function describe(err) {
  if (!(err instanceof ApiClientError)) return 'Something went wrong. Please try again.';
  if (err.code === 'KIE_KEY_MISSING' || err.code === 'KIE_NOT_CONFIGURED') {
    return 'Add your Kie.ai API key in Settings to generate illustrations.';
  }
  if (err.code === 'KIE_UNAUTHORIZED') {
    return 'Your Kie.ai API key was rejected. Check it in Settings.';
  }
  if (['NO_APPEARANCE', 'CONTENT_BLOCKED', 'TOO_MANY_REFERENCES'].includes(err.code)) {
    return err.message;
  }

  return err.message;
}

export default useCharacterImage;
