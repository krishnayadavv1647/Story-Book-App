import { api } from './client.js';

/**
 * `signal` is threaded through so the UI can cancel a generation in flight: the
 * request is aborted, and the server aborts its upstream call when the socket
 * closes.
 */
export function sendChat({ messages, signal }) {
  return api.post('/story/chat', { messages }, { signal });
}

export function generatePlan({ prompt, settings, signal }) {
  return api.post('/story/plan', { prompt, settings }, { signal });
}

export function cancelJob(jobId) {
  return api.post(`/story/jobs/${jobId}/cancel`);
}

export function fetchEngines() {
  return api.get('/story/engines');
}

export default { sendChat, generatePlan, cancelJob, fetchEngines };
