import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

import { AppShell } from '../components/layout/index.js';
import { Callout } from '../components/common/index.js';
import { useAuthStore } from '../store/authStore.js';
import { startAutopilot } from '../api/generation.js';
import { Composer } from '../features/story-agent/Composer.jsx';
import { BookSettingsModal } from '../features/story-agent/BookSettingsModal.jsx';
import { CharacterLookModal } from '../features/story-agent/CharacterLookModal.jsx';
import { EngineMeters } from '../features/story-agent/EngineMeters.jsx';
import { TemplateGallery } from '../features/story-agent/TemplateGallery.jsx';
import { useEngines, useStoryAgent } from '../features/story-agent/useStoryAgent.js';
import { SUGGESTIONS } from '../features/story-agent/storySettings.js';

/**
 * The Story Book Agent.
 *
 * Content comes from Canva `DAHT3XT5CZg` — the greeting, composer, six starters
 * and engine meters — rendered inside the canonical Shell B chrome. The Cinema
 * Studio shell that design carried was rejected (C-1 / C-4 in the design source
 * map); only its centre column is reproduced.
 *
 * DEVIATION, at the owner's request: the screen now has two states rather than
 * one. The design draws only the empty one, with the transcript growing beneath
 * a greeting that never leaves. Once a conversation starts, the greeting, the
 * starters and the engine meters give way, the transcript takes the height and
 * scrolls, and the composer docks to the bottom — which is what every chat does,
 * and what stops the box you are typing in from sliding off the screen as the
 * conversation grows.
 *
 * DEVIATION, at the owner's request: sending an idea now builds the whole book.
 * It used to hand back a plan and leave the author to walk through plan review,
 * character design and illustration as three more screens. Those screens all
 * still exist and are still reachable — nothing was removed — but they are no
 * longer the only way through. One question is asked first, because it is the
 * one thing neither the idea nor Book Settings can answer.
 */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function StoryAgentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const engines = useEngines();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);

  // The draft lives here rather than in the composer: the author is asked one
  // question before anything is generated, and backing out of it has to leave
  // their paragraph where they left it.
  const [draft, setDraft] = useState('');
  const [pendingIdea, setPendingIdea] = useState('');

  // Read once, in `onPlanReady`, after the plan lands. A ref rather than state
  // because nothing renders from it and it must not be a render behind.
  const runChoice = useRef({ characterImages: 'generate', referenceAssetIds: [] });

  const agent = useStoryAgent({
    onPlanReady: async ({ bookId }) => {
      let autopilotError = null;

      try {
        await startAutopilot(bookId, runChoice.current);
      } catch (err) {
        // The plan exists and has been paid for, so the author still gets their
        // book — they land on the generation screen, which says what went wrong
        // and still has every manual control on it.
        autopilotError = err?.message ?? 'The book could not be started on its own.';
      }

      navigate(`/books/${bookId}/generate`, { state: { autopilotError } });
    },
  });

  // A template chosen on the Dashboard arrives as route state.
  const seeded = location.state?.template;

  const firstName = (user?.name ?? '').split(' ')[0] || 'there';
  const settingsSummary = `${agent.settings.pageCount}p · ${agent.settings.ageGroup}`;

  const inConversation = agent.messages.length > 0;
  const transcriptRef = useRef(null);

  // Follow the conversation as it grows. Without this the newest reply lands
  // below the fold and the screen looks like nothing happened.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [agent.messages.length, agent.isPlanning]);

  /** "Ask first" is a turn in a conversation; the arrow builds the book. */
  const handleSubmit = (text, { mode }) => {
    if (mode === 'chat') {
      agent.submit(text, { mode: 'chat' });
      setDraft('');
      return;
    }

    setPendingIdea(text);
    setLookOpen(true);
  };

  const startRun = (choice) => {
    runChoice.current = choice;
    agent.submit(pendingIdea, { mode: 'plan' });
    setDraft('');
    setPendingIdea('');
  };

  /**
   * A template is a book's shape — its style, age, length and moral — attached
   * to an action. It applies those settings first, merged over whatever the
   * author already chose so it only moves the dials it names, then hands the
   * idea to the same one question every run asks.
   *
   * The shelf only appears once the author has typed something (see below), so
   * their words are the story and the template supplies the *style*: the draft
   * is the idea, and the template's own prompt is a fallback for the edge case
   * where the draft is blank. By the time the question is answered and
   * `startRun` reads the settings, this update has flushed.
   */
  const startTemplate = (template) => {
    agent.setSettings((current) => ({ ...current, ...template.settings }));
    const idea = draft.trim() || template.prompt;
    setPendingIdea(seeded ? `${idea} ${seeded.title ?? ''}`.trim() : idea);
    setLookOpen(true);
  };

  const notices = (
    <>
      {agent.error && (
        <Callout tone="danger" className="mb-3">
          {agent.error}
        </Callout>
      )}

      {/* Only prompt on a definite "not configured" — an unexpected or partial
          payload must not take the whole screen down. Both engines run on the
          user's OWN keys (BYOK), so this is an actionable link to add them, not
          a dead-end warning. */}
      {(engines.data?.writer?.configured === false ||
        engines.data?.image?.configured === false) && (
        <Callout tone="warning" className="mb-3">
          <span className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>
              {engines.data?.writer?.configured === false &&
              engines.data?.image?.configured === false
                ? 'Add your Gemini and Kie.ai API keys to generate a book.'
                : engines.data?.writer?.configured === false
                  ? 'Add your Google Gemini API key to write stories.'
                  : 'Add your Kie.ai API key to generate illustrations.'}{' '}
              Books are made with your own keys.
            </span>
            <Link to="/settings" className="font-semibold text-ink underline hover:no-underline">
              Add key in Settings →
            </Link>
          </span>
        </Callout>
      )}
    </>
  );

  const composer = (
    <Composer
      value={draft}
      onValueChange={setDraft}
      onSubmit={handleSubmit}
      onOpenSettings={() => setSettingsOpen(true)}
      onCancel={agent.cancel}
      isWorking={agent.isWorking}
      settingsSummary={settingsSummary}
      inConversation={inConversation}
    />
  );

  const planning = agent.isPlanning && (
    <p role="status" aria-live="polite" className="text-sm text-ink-muted">
      Writing your story — the pictures start on their own as soon as it is done.
    </p>
  );

  return (
    <AppShell
      // The conversation state owns the viewport height: the transcript scrolls
      // inside it so the composer can stay put. The empty state is an ordinary
      // scrolling page.
      contentClassName={inConversation ? 'flex min-h-0 flex-col overflow-hidden' : undefined}
    >
      {inConversation ? (
        <>
          <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[760px] flex-col gap-6 pb-6">
              {agent.messages.map((message, index) =>
                message.role === 'user' ? (
                  // What you said is set apart; what the agent said is just
                  // prose, the way a reply reads rather than a card.
                  <div key={index} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm text-ink">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div key={index} className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {message.content}
                  </div>
                ),
              )}

              {planning}
            </div>
          </div>

          <div className="shrink-0 pt-2">
            <div className="mx-auto max-w-[760px]">
              {notices}
              {composer}
            </div>
          </div>
        </>
      ) : (
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col justify-center py-10">
          <h1 className="flex items-center justify-center gap-3 text-3xl font-bold text-ink">
            <Sparkles className="h-7 w-7 shrink-0 text-gold" aria-hidden="true" />
            {greeting()}, {firstName}
          </h1>

          <div className="mt-6">
            {notices}
            {composer}
          </div>

          {/* The one screen has two faces. Before a word is typed it offers ways
              to begin — the six starters and the engine meters. The moment the
              author starts typing, that content gives way to the template shelf:
              the idea now has a home, so the screen offers a *style* for it
              rather than more ways to start. */}
          {draft.trim() ? (
            <TemplateGallery
              onSelect={startTemplate}
              disabled={agent.isWorking}
              className="mt-8 animate-slide-in"
            />
          ) : (
            <>
              <ul className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(({ id, icon: Icon, label, prompt }) => (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={agent.isWorking}
                      onClick={() => {
                        // A starter goes through the same one question as anything
                        // typed by hand — it is the same run either way.
                        setPendingIdea(seeded ? `${prompt} ${seeded.title ?? ''}`.trim() : prompt);
                        setLookOpen(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface px-3.5 py-2 text-xs text-ink transition-colors hover:border-hairline-strong hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                      {label}
                    </button>
                  </li>
                ))}
              </ul>

              <EngineMeters engines={engines.data} className="mt-12" />
            </>
          )}

          {planning && <div className="mt-6 text-center">{planning}</div>}
        </div>
      )}

      <CharacterLookModal open={lookOpen} onOpenChange={setLookOpen} onConfirm={startRun} />

      <BookSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={agent.settings}
        onSave={agent.setSettings}
      />
    </AppShell>
  );
}

export default StoryAgentPage;
