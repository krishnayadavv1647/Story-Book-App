import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import { fetchEngines, generatePlan, sendChat } from '../../api/story.js';
import { DEFAULT_SETTINGS } from './storySettings.js';

export function useEngines() {
  return useQuery({
    queryKey: ['story', 'engines'],
    queryFn: fetchEngines,
    staleTime: 5 * 60_000,
  });
}

/**
 * Drives the agent screen: the transcript, the settings, and the two things the
 * user can start — a conversational turn and a plan generation.
 *
 * Both are cancellable. Plan generation can take tens of
 * seconds, so leaving the user with no way out would be the wrong trade.
 */
export function useStoryAgent({ onPlanReady } = {}) {
  const [messages, setMessages] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);

  const startRequest = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  };

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const chat = useMutation({
    mutationFn: (text) => {
      const next = [...messages, { role: 'user', content: text }];
      setMessages(next);
      return sendChat({ messages: next, signal: startRequest() });
    },
    onSuccess: (data) => setMessages((current) => [...current, data.message]),
    onError: (err) => setError(describe(err)),
  });

  const plan = useMutation({
    mutationFn: (prompt) => generatePlan({ prompt, settings, signal: startRequest() }),
    onSuccess: (data) => onPlanReady?.(data),
    onError: (err) => setError(describe(err)),
  });

  const submit = useCallback(
    (text, { mode = 'plan' } = {}) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setError(null);
      if (mode === 'chat') chat.mutate(trimmed);
      else plan.mutate(trimmed);
    },
    [chat, plan],
  );

  return {
    messages,
    settings,
    setSettings,
    submit,
    cancel,
    error,
    dismissError: () => setError(null),
    isWorking: chat.isPending || plan.isPending,
    isPlanning: plan.isPending,
  };
}

/** Turns an API failure into something a person can act on. */
function describe(err) {
  if (err?.name === 'AbortError') return null;

  if (err instanceof ApiClientError) {
    if (err.code === 'CONTENT_BLOCKED') return err.message;
    if (err.code === 'STORY_PLAN_INVALID') {
      return 'The planner could not produce a usable plan. Try rewording the idea.';
    }
    // Generation runs on the server's provider keys, so these are ours to fix,
    // not the reader's — the copy says so rather than sending them somewhere
    // they can do nothing.
    if (err.code === 'GEMINI_NOT_CONFIGURED') {
      return 'Story generation is not set up on this server yet.';
    }
    if (err.code === 'KIE_NOT_CONFIGURED') {
      return 'Illustration is not set up on this server yet.';
    }
    if (err.code === 'GEMINI_UNAUTHORIZED' || err.code === 'KIE_UNAUTHORIZED') {
      return 'Generation is unavailable right now — the provider rejected our key.';
    }
    // The server's own message names both numbers: what this needs, and what is
    // left. Nothing here can say it better.
    if (err.code === 'INSUFFICIENT_CREDITS') return err.message;
    if (err.code === 'JOB_IN_PROGRESS') return 'That story is already being planned.';
    return err.message;
  }

  return 'Something went wrong. Please try again.';
}

export default useStoryAgent;
