import { useLayoutEffect, useRef } from 'react';
import { ArrowUp, ChevronDown, Loader2, MessageSquare, Settings2, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button, IconButton } from '../../components/common/index.js';

/**
 * The composer from Canva `DAHT3XT5CZg` (centre column only — the surrounding
 * Cinema Studio shell was rejected; see C-1 in the design source map).
 *
 * Layout as drawn: prompt label, a growing input, then a control row of two
 * pills and a submit arrow.
 *
 * DEVIATION, at the owner's request: the drawn attach button is gone. It was
 * built disabled — there is nothing to attach to a story idea, and the reference
 * photographs a book can use are asked for later, on their own screen, where
 * they can be shown against the character they belong to.
 *
 * DEVIATION, at the owner's request: the drawn label above the input is now
 * `sr-only`. The placeholder already says what the box is for, and a chat
 * composer that captions itself reads as a form field rather than a
 * conversation. It stays in the accessibility tree, because the box still needs
 * a name.
 */

/**
 * The box grows with the text rather than scrolling inside a fixed two rows.
 *
 * The fixed height was the bug: from the third line on, what you had just typed
 * scrolled out of sight while you were still writing it, so you could not read
 * back your own paragraph. It now grows to `MAX_HEIGHT` — about fifteen lines —
 * and only then scrolls, which is as far as it can go before the composer would
 * push the conversation off the screen.
 */
// Roughly three lines. An empty composer that is only one line tall reads as a
// search field; a story is a paragraph, and the box should look like it expects
// one before a word is typed.
const MIN_HEIGHT = 84;
const MAX_HEIGHT = 320;

/**
 * The draft lives with the caller, not here.
 *
 * Sending a story opens one question before anything is generated, and if the
 * author backs out of it their paragraph has to still be in the box. A composer
 * that cleared itself the moment it handed the text over could not offer that.
 */
export function Composer({
  value,
  onValueChange,
  onSubmit,
  onOpenSettings,
  onCancel,
  isWorking,
  settingsSummary,
  disabled,
  inConversation = false,
}) {
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Measured from scratch each time: `scrollHeight` only reports the content's
    // own height while the element is not already stretched to hold it.
    el.style.height = 'auto';
    const content = el.scrollHeight;

    el.style.height = `${Math.min(Math.max(content, MIN_HEIGHT), MAX_HEIGHT)}px`;
    el.style.overflowY = content > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  const submit = (mode) => {
    if (!value.trim() || isWorking) return;
    onSubmit(value, { mode });
  };

  const onKeyDown = (event) => {
    // Enter sends, Shift+Enter breaks the line — the convention people expect
    // from a chat composer.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit('plan');
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-hairline bg-surface px-4 pb-3.5 pt-3.5 shadow-card',
        // The whole box reacts to focus, not just the textarea inside it — the
        // textarea has no border of its own to light up.
        'transition-colors focus-within:border-hairline-strong',
      )}
    >
      <label htmlFor="story-idea" className="sr-only">
        What story would you like to create?
      </label>

      <textarea
        id="story-idea"
        ref={textareaRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={1}
        placeholder={
          inConversation
            ? 'Reply to the agent…'
            : 'A curious boy finds a forest where every tree remembers a story…'
        }
        className={cn(
          'block w-full resize-none border-0 bg-transparent px-0 py-1.5 text-md leading-relaxed text-ink',
          'placeholder:text-ink-muted focus:outline-none focus:ring-0',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />

      <div className="mt-2 flex items-center gap-2">
        {/* Only one agent exists, so this reports the active one rather than
            pretending to offer a choice. */}
        <span className="inline-flex h-control-sm items-center gap-1.5 rounded-pill border border-hairline bg-page px-3 text-2xs font-semibold text-ink">
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          Story Book Agent
        </span>

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-control-sm items-center gap-1.5 rounded-pill border border-hairline bg-surface px-3 text-2xs font-semibold text-ink hover:bg-surface-hover"
        >
          <Settings2 className="h-3 w-3" aria-hidden="true" />
          Book Settings
          <span className="text-ink-muted">{settingsSummary}</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>

        <div className="ml-auto flex items-center gap-2">
          {isWorking ? (
            <Button variant="secondary" size="sm" leadingIcon={X} onClick={onCancel} className="rounded-pill">
              Cancel
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => submit('chat')}
              disabled={!value.trim()}
              className="rounded-pill"
            >
              Ask first
            </Button>
          )}

          <IconButton
            icon={isWorking ? Loader2 : ArrowUp}
            label={isWorking ? 'Working…' : 'Create the story plan'}
            onClick={() => submit('plan')}
            disabled={isWorking || !value.trim()}
            // The one main action on this screen, so it wears the shared gold.
            tone="primary"
            className={cn('rounded-pill', isWorking && '[&_svg]:animate-spin')}
          />
        </div>
      </div>
    </div>
  );
}

export default Composer;
